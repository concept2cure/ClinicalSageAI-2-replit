/**
 * The electronic signature of an e-signature-tier AnA command — the ONE writer
 * every such handler calls, on the handler's own transaction client.
 *
 * WHY THIS EXISTS (2026-09-28). POST /api/ana-ri/governed-action re-verifies
 * the signer (governed-esignature.ts) and stamps `ctx.signoff` with the reason
 * for change, the declared §11.50 meaning, when and how the signer was
 * verified. Of the commands in PART11_ESIGN_COMMANDS, only the FDA ESG transmit
 * (governed-transmit.ts) turned that into a signature record. place_in_dossier,
 * create_submission_package, revert_to_version and erase_personal_data made a
 * person re-authenticate and declare what their signature meant, and then
 * recorded no signature anywhere: no §11.50 manifestation, no §11.70 link
 * between the signature and the record it signed.
 *
 * WHAT IT WRITES. The pattern governed-transmit.ts established, composed from
 * the two shared primitives rather than restated:
 *   1. `recordGovernedAction` — the sha256-chained audit_logs + c2c_ana_actions
 *      pair for the `sign`;
 *   2. `persistGovernedActionSignature` — the electronic_signatures row, bound
 *      to that ledger row and to whatever binding the caller states.
 *
 * WHO OWNS THE TRANSACTION. The caller. This function never issues BEGIN,
 * COMMIT or ROLLBACK: the signature lands with the governed write it signs, or
 * the caller rolls both back. A throw here must reach the caller's catch.
 *
 * FAIL CLOSED. No verified sign-off, no meaning, or no verification time ⇒ it
 * throws before issuing a single query. It never supplies a meaning, a time or
 * a factor the route did not observe.
 *
 * @module server/services/ana-ri/governed-command-signature
 */
import { createHash } from 'crypto';
import {
  BINDING_BASIS,
  persistGovernedActionSignature,
  sha256CanonicalJson,
  type SignatureDbClient,
} from '../part11/signature-persistence';
import type { Part11Signoff } from './part11-governance';

/** What a governed command handler knows about the dispatch it is running. */
export interface GovernedCommandSigner {
  userId: number;
  organizationId: number;
  signoff?: Part11Signoff;
}

/** The caller-stated §11.70 binding. `digest: null` ⇒ the ledger chain hash is bound. */
export interface GovernedCommandBinding {
  digest: string | null;
  basis: string;
  note: string;
}

export interface SignGovernedCommandInput {
  /** The AnA command being signed, e.g. 'place_in_dossier'. */
  command: string;
  /** Typed target pointer, e.g. 'artifact:<artifact_id>'. */
  target: string;
  /** What the signer attests to, beyond the meaning and command. */
  payload: Record<string, unknown>;
  binding: GovernedCommandBinding;
  /** Appended to the signature manifest after `command`. */
  extraManifest?: Record<string, unknown>;
}

/** A governed command reached its signature without a verified sign-off. */
export class GovernedCommandSignoffError extends Error {
  readonly code = 'PART11_SIGNATURE_REQUIRED';
  constructor(command: string, missing: string) {
    super(
      `${command}: a verified electronic signature is required (21 CFR 11.50/11.200) and ${missing}. Nothing was written.`,
    );
    this.name = 'GovernedCommandSignoffError';
  }
}

export type VerifiedSignoff = Part11Signoff & { signaturePurpose: string; verifiedAt: Date };

/**
 * The sign-off a governed command signature needs, or a throw. Exported so a
 * handler whose governed write does work BEFORE its transaction (the revert's
 * governance evaluation) can refuse first; signGovernedCommand checks again.
 */
export function assertVerifiedSignoff(command: string, signoff: Part11Signoff | undefined): VerifiedSignoff {
  if (!signoff || signoff.signatureVerified !== true) {
    throw new GovernedCommandSignoffError(command, 'this dispatch carries no server-verified sign-off');
  }
  if (typeof signoff.signaturePurpose !== 'string' || signoff.signaturePurpose.length === 0) {
    throw new GovernedCommandSignoffError(command, 'the signer declared no signature meaning');
  }
  if (!(signoff.verifiedAt instanceof Date) || Number.isNaN(signoff.verifiedAt.getTime())) {
    throw new GovernedCommandSignoffError(command, 'the sign-off carries no verification time');
  }
  return signoff as VerifiedSignoff;
}

/**
 * Record the electronic signature of a governed AnA command on the caller's
 * transaction client. Returns the electronic_signatures id and the ledger
 * action id. Throws — having written nothing of its own — when the dispatch
 * carries no verified sign-off; any database error propagates so the caller
 * rolls its governed write back with it.
 */
export async function signGovernedCommand(
  client: SignatureDbClient,
  ctx: GovernedCommandSigner,
  input: SignGovernedCommandInput,
): Promise<{ signatureId: number; actionId: string }> {
  const signoff = assertVerifiedSignoff(input.command, ctx.signoff);
  const reason = signoff.reasonForChange;
  const payload = { meaning: signoff.signaturePurpose, command: input.command, ...input.payload };

  // Dynamic: routes/c2c/actions carries the Express router and the pool, and
  // command-executor must stay importable without a database (its module
  // header explains why). mdx-command-handlers' transmit loads it the same way.
  const { recordGovernedAction } = await import('../../routes/c2c/actions');
  const recorded = await recordGovernedAction(client, {
    orgId: ctx.organizationId,
    userId: ctx.userId,
    command: 'sign',
    target: input.target,
    reason,
    payload,
    surface: 'ana-governed-action',
  });

  const secondFactorVerified = signoff.secondFactorVerified === true;
  const signature = await persistGovernedActionSignature(client, {
    orgId: ctx.organizationId,
    userId: ctx.userId,
    target: input.target,
    reason,
    payload,
    actionId: recorded.actionId,
    auditId: recorded.auditId,
    sha256Chain: recorded.sha256Chain,
    // The transmit ledger's spelling (mdx-command-handlers esgTransmit), so the
    // factors read the same on every row this route produces.
    authenticationMethod: secondFactorVerified ? 'password+totp' : 'password',
    secondFactorVerified,
    occurredAt: new Date(),
    binding: input.binding,
    extraManifest: { command: input.command, ...(input.extraManifest ?? {}) },
  });

  return { signatureId: signature.id, actionId: recorded.actionId };
}

/** sha256 hex of an artifact's content, exactly as stored. */
export function sha256OfContent(content: unknown): string {
  return createHash('sha256').update(String(content ?? '')).digest('hex');
}

/**
 * The §11.70 content binding of a concept2cure_artifacts row as it stands in
 * the signer's transaction: "this content, at this version, in this section".
 * sha256 over the canonical JSON of { artifactId, version, contentSha256,
 * ctdSection } — re-derivable by an inspector from the row alone.
 */
export function artifactVersionContentBinding(row: {
  artifactId: string;
  version: number;
  content: unknown;
  ctdSection: string | null;
}): GovernedCommandBinding & { contentSha256: string } {
  const contentSha256 = sha256OfContent(row.content);
  const bound = { artifactId: row.artifactId, version: row.version, contentSha256, ctdSection: row.ctdSection };
  return {
    digest: sha256CanonicalJson(bound),
    basis: BINDING_BASIS.C2C_ARTIFACT_VERSION_CONTENT,
    note:
      `sha256 over canonical JSON {artifactId, version, contentSha256, ctdSection} of concept2cure_artifacts ` +
      `${row.artifactId} at version ${row.version}, read in the signing transaction; contentSha256 is the sha256 of its content.`,
    contentSha256,
  };
}

/** The ledger basis, for a signed decision that has no content to bind. */
export function ledgerBinding(why: string): GovernedCommandBinding {
  return {
    digest: null,
    basis: BINDING_BASIS.GOVERNED_ACTION_LEDGER,
    note: `${why} bound_payload_digest carries the governed action audit sha256 chain hash (target identity + payload hash + actor + time), not a content hash.`,
  };
}
