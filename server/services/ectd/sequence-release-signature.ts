/**
 * @fileoverview The submissions spine's own §11.70 release signature for a sequence
 * @module server/services/ectd/sequence-release-signature
 *
 * ## Why this exists
 *
 * A release signature can be taken on either of two spines, and until this
 * module `resolveReleaseSignatureStatus` could see only one of them:
 *
 *   A. ORCHESTRATOR — `submission_orchestrator_runs.steps['package.sign']`,
 *      verified through `resolveSignedPackageForExport`. Keyed on the
 *      submission FK.
 *   B. SUBMISSIONS — the governed sign action on `ectd-sequence:<id>`, which
 *      persists an `electronic_signatures` row whose `bound_payload_digest` is
 *      a sha256 over the `ectd_sequences` row and its ordered
 *      `submission_leaves` manifest at signing time
 *      (`deriveGovernedTargetBinding`, basis
 *      `ectd-sequence-leaf-manifest-sha256`). Keyed on the sequence id.
 *
 * The dispatch gate requires a release signature for IND / NDA / BLA / MAA —
 * every type it applies to. So a sequence authored and signed entirely through
 * spine B was reported `unsigned`, and `dispatchSequence` / `transmitSequence`
 * were unreachable for it no matter how correctly the operator signed. That is
 * a false statement about a submission that carries a §11.70 signature bound to
 * exactly the artifact being dispatched, and it makes the product's own
 * governed path impossible to complete.
 *
 * ## What counts, and what deliberately does not
 *
 *   • INTENT `dispatch`, and only that. The sign modal records the step's
 *     meaning in the action payload, and freeze is not release: requiring a
 *     release signature to FREEZE is the inversion `composeDispatchGatesForStep`
 *     exists to prevent, so a freeze-intent signature must not clear the gate a
 *     later dispatch has to pass. `transmit` is excluded for the opposite
 *     reason — `transmitSequence` already checks a transmit-intent signature as
 *     its own Gate 1, and accepting one here would collapse two independent
 *     controls into one.
 *
 *   • CONTENT BINDING, re-derived NOW. A signature whose basis is the ledger
 *     fallback carries no content hash at all and is not a release signature.
 *     One that does carry a digest is only honoured when that digest still
 *     equals the manifest derived from the sequence's CURRENT leaves — the same
 *     check `governedSignatureRefusal` applies, through the same canonical
 *     `deriveGovernedTargetBinding`, so there is one implementation of "does
 *     this signature still bind its content" rather than a second, drifting
 *     copy. Drift reports `invalid`, which blocks unconditionally.
 *
 *   • NEWEST FIRST, no papering over. The newest qualifying signature decides.
 *     A newer signature that no longer verifies is reported `invalid` rather
 *     than falling back to an older one that still does — the same rule the
 *     orchestrator spine applies to runs, and for the same reason: the newest
 *     signature represents current intent.
 *
 *   • A REVOCATION IS NOT A SIGNATURE. Revocation rows
 *     (`signature_type = 'governed-revocation'`) are excluded from the
 *     candidates, and a signature the revocation superseded reports `revoked`.
 *
 * Read-only. Returns `undetermined` on any lookup failure — a database error is
 * not evidence that no signature exists.
 */

import { db, pool } from '../../db.js';
import { sql } from 'drizzle-orm';
import {
  BINDING_BASIS,
  GOVERNED_REVOCATION_SIGNATURE_TYPE,
  REVOKED_VERIFICATION_STATUS,
  deriveGovernedTargetBinding,
} from '../part11/signature-persistence.js';
import type { GovernedSequenceStep } from '../submission-service/submission-service.js';
import type { ReleaseSignatureVerdict } from './dispatch-gate.js';
import { createScopedLogger } from '../../utils/logger.js';

const log = createScopedLogger('sequence-release-signature');

/**
 * The governed step whose signature IS the release, declared in the sign
 * action's payload. Typed against the service's own vocabulary so a rename
 * there is a compile error here rather than a gate that silently stops
 * recognizing any signature at all.
 */
const RELEASE_INTENT: GovernedSequenceStep = 'dispatch';

export interface SequenceReleaseSignature {
  verdict: ReleaseSignatureVerdict;
  /** Operator-facing detail — surfaced in the gate blocker message. */
  detail?: string;
  /** electronic_signatures.id, when a signature was found. */
  signatureId?: number;
}

interface CandidateRow {
  id: unknown;
  bound_payload_digest: unknown;
  verification_status: unknown;
  superseded_by: unknown;
  is_valid: unknown;
}

/** Drizzle returns either `{rows}` or a bare array depending on the driver. */
function rowsOf(result: unknown): Array<Record<string, unknown>> {
  const wrapped = (result as { rows?: unknown }).rows;
  const list = Array.isArray(wrapped) ? wrapped : result;
  return Array.isArray(list) ? (list as Array<Record<string, unknown>>) : [];
}

/**
 * Signatures on `target` that could be this sequence's release, newest first.
 *
 * Every clause is one of the rules in this module's header, and each is one
 * clause away from being dropped:
 *   • `organization_id` / `signed_target` — this tenant, this sequence;
 *   • `binding_basis` — a leaf-manifest binding; a ledger-basis signature
 *     carries the audit chain hash and binds no content at all;
 *   • `signature_type <>` — a revocation is not a signature;
 *   • the join to an EXECUTED `sign` action whose payload declares the release
 *     intent — freeze is not release, and a proposed action is not a signature.
 *
 * Newest first by id: `electronic_signatures` has no `created_at` column (the
 * model declares one, no migration creates it — see findActiveReleaseSignature)
 * and the serial id is monotonic.
 */
async function findReleaseSignatureRows(
  target: string,
  organizationId: number,
): Promise<Array<Record<string, unknown>>> {
  const result = await db.execute(sql`
    SELECT es.id,
           es.bound_payload_digest,
           es.verification_status,
           es.superseded_by,
           es.is_valid
      FROM electronic_signatures es
      JOIN c2c_ana_actions a
        ON a.id = (es.signature_manifest::jsonb ->> 'actionId')
       AND a.org_id = es.organization_id
     WHERE es.organization_id = ${organizationId}
       AND es.signed_target = ${target}
       AND es.binding_basis = ${BINDING_BASIS.ECTD_SEQUENCE_LEAF_MANIFEST}
       AND es.signature_type <> ${GOVERNED_REVOCATION_SIGNATURE_TYPE}
       AND a.command = 'sign'
       AND a.state = 'executed'
       AND (a.payload ->> 'intent') = ${RELEASE_INTENT}
     ORDER BY es.id DESC
     LIMIT 10
  `);
  return rowsOf(result);
}

/**
 * Whether a signature row has been taken out of force. `superseded_by` is the
 * §11.70 append-only pointer a governed revocation sets; `verification_status`
 * states WHY, and `is_valid` is the older flag. Any one of the three means the
 * signature no longer stands.
 */
function isWithdrawn(row: CandidateRow): boolean {
  return (
    String(row.verification_status ?? '') === REVOKED_VERIFICATION_STATUS ||
    row.superseded_by != null ||
    row.is_valid === false
  );
}

/** The manifest digest of the sequence's CURRENT content, or why it is unknown. */
type ManifestProbe = { ok: true; digest: string } | { ok: false; detail: string };

/**
 * Re-derive the sequence's leaf-manifest digest NOW, through the very function
 * that produced the one on the signature — one implementation of "does this
 * signature still bind its content", not a second, drifting copy.
 *
 * A derivation that cannot read the sequence falls back to the ledger basis
 * with no content digest; that is not a mismatch, it is an unknown, and an
 * unverifiable signature must never read as a verified one.
 */
async function currentLeafManifestDigest(
  target: string,
  organizationId: number,
): Promise<ManifestProbe> {
  let binding: Awaited<ReturnType<typeof deriveGovernedTargetBinding>>;
  try {
    binding = await deriveGovernedTargetBinding(
      { query: (text: string, p?: unknown[]) => pool.query(text, p) as Promise<{ rows: any[] }> },
      target,
      organizationId,
    );
  } catch (err) {
    log.warn('sequence manifest re-derivation failed; reporting undetermined', {
      err: err instanceof Error ? err.message : String(err),
      target,
      organizationId,
    });
    return {
      ok: false,
      detail: 'the sequence leaf manifest could not be re-derived to verify the release signature',
    };
  }
  if (binding.basis !== BINDING_BASIS.ECTD_SEQUENCE_LEAF_MANIFEST || !binding.digest) {
    return {
      ok: false,
      detail: `the current leaf manifest for ${target} is not derivable, so the release signature cannot be verified`,
    };
  }
  return { ok: true, digest: binding.digest };
}

/**
 * The release-signature state a sequence's OWN governed signature reports.
 *
 * `unsigned` here means "no qualifying signature on this spine" — the caller
 * composes that with the orchestrator spine's answer rather than treating it as
 * a final verdict.
 */
export async function resolveSequenceReleaseSignature(params: {
  sequenceId: number;
  organizationId: number;
}): Promise<SequenceReleaseSignature> {
  const { sequenceId, organizationId } = params;
  if (!Number.isFinite(sequenceId) || sequenceId <= 0) {
    return { verdict: 'undetermined', detail: 'invalid sequence id' };
  }
  if (!Number.isFinite(organizationId) || organizationId <= 0) {
    return { verdict: 'undetermined', detail: 'invalid organization context' };
  }

  const target = `ectd-sequence:${sequenceId}`;

  let candidates: Array<Record<string, unknown>>;
  try {
    candidates = await findReleaseSignatureRows(target, organizationId);
  } catch (err) {
    log.warn('sequence release-signature lookup failed; reporting undetermined', {
      err: err instanceof Error ? err.message : String(err),
      sequenceId,
      organizationId,
    });
    return {
      verdict: 'undetermined',
      detail: 'the sequence release-signature lookup failed',
    };
  }

  const newest = candidates[0] as unknown as CandidateRow | undefined;
  if (!newest) {
    return {
      verdict: 'unsigned',
      detail: `no dispatch-intent signature is recorded on ${target}`,
    };
  }

  const rawId = Number(newest.id);
  const signatureId = Number.isFinite(rawId) && rawId > 0 ? rawId : undefined;
  if (isWithdrawn(newest)) {
    return {
      verdict: 'revoked',
      detail: `the release signature on ${target} was superseded or revoked`,
      signatureId,
    };
  }

  const signedDigest = typeof newest.bound_payload_digest === 'string' ? newest.bound_payload_digest : '';
  if (signedDigest === '') {
    // The basis filter should make this unreachable; if a row ever claims the
    // leaf-manifest basis with no digest, it binds nothing and is not evidence.
    return {
      verdict: 'invalid',
      detail: `the release signature on ${target} claims a leaf-manifest binding but carries no digest`,
      signatureId,
    };
  }

  const current = await currentLeafManifestDigest(target, organizationId);
  if (!current.ok) {
    return { verdict: 'undetermined', detail: current.detail, signatureId };
  }

  if (current.digest !== signedDigest) {
    return {
      verdict: 'invalid',
      detail:
        `the sequence changed after it was signed for dispatch (leaf manifest digest differs); ` +
        `re-sign the current content`,
      signatureId,
    };
  }

  return {
    verdict: 'signed',
    detail: `signed for dispatch on ${target}, bound to the current leaf manifest`,
    signatureId,
  };
}

export default { resolveSequenceReleaseSignature };
