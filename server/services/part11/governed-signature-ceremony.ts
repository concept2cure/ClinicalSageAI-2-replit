/**
 * The signature ceremony for a domain route's signed act: one implementation,
 * run inside the domain route's own transaction.
 *
 * It began as the protocol workspace's ceremony (finalizing a protocol,
 * recording a reviewer's disposition), which used to write a `command='sign'`
 * ledger row through recordGovernedAction and nothing else, so the ledger
 * recorded a signature nobody gave: no re-authentication, no
 * separation-of-duties check, no electronic_signatures row (weekly review
 * 2026-09-22, finding P1). Report finalize (reporting review 2026-10-01) needed
 * the same ceremony, so it moved here rather than being copied. It runs what
 * the canonical `POST /api/c2c/actions/sign` runs:
 *
 *   1. the declared §11.50 meaning is one this act can carry
 *   2. authority (§11.10(g)): the signer's role on the membership row
 *      (resolveSignerOrgRole) must carry signing authority under the platform's
 *      one policy (isSigningAuthorized: admin, approver, reviewer; P-18), as the
 *      canonical route checks it (signingAuthorityRefusal), before the password.
 *      Until 2026-10-08 (QA, cf950eeb9) the route's writer gate was the only
 *      one here, so a member's password made a protocol signature. The
 *      permission gate the canonical path runs when GOVERNANCE_RBAC_ENFORCE is
 *      on runs here too
 *   3. §11.200 re-authentication (verifyReauth: the password, and the second
 *      factor whenever the signer has one enrolled), before anything is written
 *   4. BEGIN, then the meaning checked against authorship on that client,
 *      before the act writes anything (the canonical order: SoD before
 *      writeMutation): an `authorship` signature only from an author; any other
 *      meaning only from someone independent of the authors. Checked after the
 *      write, the act's own rows (finalize snapshots a version under the
 *      signer's id) made every signer an author of what they were signing.
 *   5. the domain write
 *   6. the ledger pair and the electronic_signatures row, on the same client
 *   7. COMMIT, so the change and its signature land together or not at all
 *
 * The target's authors must be modelled in
 * services/governance/separation-of-duties.ts (resolveTargetAuthors); a target
 * type it does not model is refused with 409 for every meaning.
 *
 * @module server/services/part11/governed-signature-ceremony
 */
import type { PoolClient } from 'pg';
import { pool } from '../../db';
import { recordGovernedAction, verifyReauth } from '../../routes/c2c/actions';
import {
  assertSignerIsNotAuthor,
  resolveTargetAuthors,
  SeparationOfDutiesAuthorUnresolvedError,
  SeparationOfDutiesError,
} from '../governance/separation-of-duties';
import { can } from '../governance/permissions';
import { persistGovernedSignSignature } from './signature-persistence';
import { resolveSignerOrgRole } from './resolve-signer-role';
import { isSigningAuthorized } from './signing-authority';
import { AUTHENTICATOR_REQUIRED_MESSAGE } from './reverify-signer';
import { setTenantContextTx } from '../tenant/governed-tenant-context';
import { clientIpOf, type HasClientIp } from '../../utils/client-ip';

export const CEREMONY_SIGN_MEANINGS = ['authorship', 'review', 'approval', 'responsibility'] as const;
export type CeremonySignMeaning = (typeof CEREMONY_SIGN_MEANINGS)[number];

/** A refusal the route returns as-is: nothing was written. */
export class GovernedSignatureRefusal extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'GovernedSignatureRefusal';
  }
}

export interface GovernedSignatureInput {
  orgId: number;
  userId: number;
  /** Ledger target, e.g. `protocol-document:5`, `report-run:12`. */
  target: string;
  /** The ledger's domain and surface for this act (c2c_ana_actions). */
  domain: string;
  surface: string;
  /** What is being signed, as a refusal names it: "protocol", "report". */
  subject: string;
  reason: string;
  meaning: unknown;
  /** The meanings this act can carry. */
  allowedMeanings: readonly CeremonySignMeaning[];
  reauth: unknown;
  ipAddress: string | null;
  /** The signer's org role, for the permission gate. */
  role: string;
  /**
   * The domain write. Runs inside the transaction after the authorship check;
   * throw to refuse. `act` is what was decided (a reviewer's approve or reject,
   * the version finalized): it goes into the ledger payload AND onto the
   * electronic_signatures manifest, so the signature row says what it signed.
   */
  write: (
    client: PoolClient,
    meaning: CeremonySignMeaning,
  ) => Promise<{ act?: Record<string, unknown>; body: Record<string, unknown> }>;
}

/** What the signer is told for each re-authentication refusal (verifyReauth's codes). */
const REAUTH_MESSAGE: Record<string, string> = {
  REAUTH_REQUIRED: 'Re-enter your password to sign. Nothing was signed.',
  REAUTH_PASSWORD_REQUIRED: 'Enter your password to sign. Nothing was signed.',
  REAUTH_PASSWORD_INVALID: 'The password was not accepted. Nothing was signed.',
  REAUTH_TOTP_REQUIRED: 'Your account has an authenticator enrolled: enter its current code to sign. Nothing was signed.',
  REAUTH_TOTP_INVALID: 'The authenticator code was not accepted. Nothing was signed.',
  REAUTH_MFA_STATE_UNKNOWN: 'Your second factor could not be checked, so the signature was refused. Try again. Nothing was signed.',
  // In production, a signer with no authenticator (ADR-0014 P1-2b): the ceremony's own words.
  REAUTH_AUTHENTICATOR_REQUIRED: AUTHENTICATOR_REQUIRED_MESSAGE,
  // The account's own refusals (VSR-001 F-27, F-28). Without them a locked
  // signer was told to re-enter a password that would not be compared.
  REAUTH_ACCOUNT_LOCKED: 'The account is locked after repeated failed attempts. Try again later. Nothing was signed.',
  REAUTH_ACCOUNT_STATE_UNKNOWN: 'Your account could not be checked, so the signature was refused. Try again. Nothing was signed.',
  REAUTH_ACCOUNT_INACTIVE: 'This account is not active. Contact your administrator. Nothing was signed.',
};

function asReauth(raw: unknown): { password?: string; totp?: string } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  return {
    ...(typeof r.password === 'string' ? { password: r.password } : {}),
    ...(typeof r.totp === 'string' && r.totp.length > 0 ? { totp: r.totp } : {}),
  };
}

const SOD_UNVERIFIED_MESSAGE =
  'Separation of duties could not be verified, so nothing was signed. Try again; if this continues, contact your administrator.';

/**
 * Step 2 (§11.10(g)): identity is not authority. The signer's organization role
 * is read from the membership row, never the token or the body, and held to the
 * platform's one signing policy before any credential is compared, so this
 * ceremony is not a password oracle for a role that may not sign. A lookup that
 * cannot run signs nothing; its cause is logged, never shown.
 */
async function assertSigningAuthority(userId: number, orgId: number): Promise<void> {
  let role: string | null;
  try {
    role = await resolveSignerOrgRole(userId, orgId);
  } catch (err) {
    console.error('[governed-signature] signer role lookup failed:', err instanceof Error ? err.message : err);
    throw new GovernedSignatureRefusal(
      503,
      'SIGNING_AUTHORITY_UNVERIFIED',
      'Your signing authority could not be checked, so nothing was signed. Try again; if this continues, contact your administrator.',
    );
  }
  if (!isSigningAuthorized(role)) {
    throw new GovernedSignatureRefusal(
      403,
      'ESIGNATURE_NO_AUTHORITY',
      'Your role does not permit applying an electronic signature (21 CFR Part 11 §11.10(g)). Nothing was signed.',
    );
  }
}

async function checkMeaningAgainstAuthorship(
  client: PoolClient,
  act: Pick<GovernedSignatureInput, 'target' | 'subject' | 'orgId' | 'userId'>,
  meaning: CeremonySignMeaning,
): Promise<void> {
  const { target, subject, orgId, userId } = act;
  try {
    if (meaning === 'authorship') {
      // SoD does not examine an authorship signature, so the claim to be an
      // author is checked here instead of being taken on the signer's word.
      const authorship = await resolveTargetAuthors(target, orgId, client);
      if (!authorship.authors.includes(userId)) {
        throw new GovernedSignatureRefusal(
          403,
          'NOT_AN_AUTHOR',
          `You are not an author of this ${subject}, so you cannot sign it as its author. Sign as approval or responsibility. Nothing was signed.`,
        );
      }
    } else {
      await assertSignerIsNotAuthor(target, orgId, userId, { command: 'sign', meaning, client });
    }
  } catch (err) {
    if (err instanceof GovernedSignatureRefusal) throw err;
    if (err instanceof SeparationOfDutiesError) throw new GovernedSignatureRefusal(403, err.code, err.message);
    if (err instanceof SeparationOfDutiesAuthorUnresolvedError) throw new GovernedSignatureRefusal(409, err.code, err.message);
    // The check did not run (SeparationOfDutiesUnverifiedError), or the
    // authorship lookup itself failed. The cause is internal, so it is logged
    // and the signer gets the canonical handler's sentence (ci:server-error-leaks).
    console.error('[governed-signature] separation of duties unverified:', err instanceof Error ? err.message : err);
    throw new GovernedSignatureRefusal(503, 'SEPARATION_OF_DUTIES_UNVERIFIED', SOD_UNVERIFIED_MESSAGE);
  }
}

export async function signGovernedAct(input: GovernedSignatureInput): Promise<Record<string, unknown>> {
  const { orgId, userId, target, reason } = input;

  if (typeof input.meaning !== 'string' || input.meaning.length === 0) {
    throw new GovernedSignatureRefusal(400, 'MEANING_REQUIRED', 'Declare what this signature means. Nothing was signed.');
  }
  const meaning = input.meaning as CeremonySignMeaning;
  if (!input.allowedMeanings.includes(meaning)) {
    throw new GovernedSignatureRefusal(
      400,
      'MEANING_NOT_ALLOWED',
      `This signature can mean ${input.allowedMeanings.join(', ')}; "${input.meaning}" is not one of them. Nothing was signed.`,
    );
  }

  await assertSigningAuthority(userId, orgId);

  // The canonical sign path's permission gate, dark-launched the same way
  // (routes/c2c/actions.ts makeHandler): off until validated on real role data.
  if (process.env.GOVERNANCE_RBAC_ENFORCE === 'true') {
    const resourceType = target.split(':')[0];
    if (!(await can(orgId, input.role, { action: 'sign', resourceType }))) {
      throw new GovernedSignatureRefusal(403, 'NOT_AUTHORIZED', `Your role does not hold sign permission for ${resourceType}. Nothing was signed.`);
    }
  }

  const reauth = asReauth(input.reauth);
  const verified = await verifyReauth(userId, reauth);
  if (!verified.ok) {
    const code = verified.error ?? 'REAUTH_REQUIRED';
    throw new GovernedSignatureRefusal(401, code, REAUTH_MESSAGE[code] ?? REAUTH_MESSAGE.REAUTH_REQUIRED);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, orgId);
    await checkMeaningAgainstAuthorship(client, input, meaning);
    const { act = {}, body } = await input.write(client, meaning);

    const signedPayload = { ...act, meaning };
    const gov = await recordGovernedAction(client, {
      orgId,
      userId,
      command: 'sign',
      target,
      reason,
      payload: signedPayload,
      domain: input.domain,
      surface: input.surface,
    });
    const signature = await persistGovernedSignSignature(client, {
      orgId,
      userId,
      target,
      reason,
      payload: signedPayload,
      actionId: gov.actionId,
      auditId: gov.auditId,
      sha256Chain: gov.sha256Chain,
      // Only the factors verifyReauth checked above.
      authenticationMethod: reauth?.totp ? 'password+totp' : 'password',
      secondFactorVerified: Boolean(reauth?.totp),
      ipAddress: input.ipAddress,
      occurredAt: new Date(),
      ...(Object.keys(act).length > 0 ? { extraManifest: { act } } : {}),
    });
    await client.query('COMMIT');
    return {
      ...body,
      ...gov,
      signatureId: signature.id,
      signedAt: signature.signedAt.toISOString(),
      meaning,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * The client IP for the signature row when resolvable; null, never invented.
 * It is the request's address as the trust-proxy hop count resolves it
 * (server/utils/client-ip.ts). It read the left-most X-Forwarded-For entry,
 * which the signer writes, so a signer could put any address in the row (D6;
 * ci:client-ip-single-source).
 */
export function signerIpAddress(req: HasClientIp): string | null {
  return clientIpOf(req);
}
