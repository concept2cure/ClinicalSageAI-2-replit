/**
 * The signature ceremony for the protocol workspace's two signed acts:
 * finalizing a protocol and recording a reviewer's disposition.
 *
 * Both routes used to write a `command='sign'` ledger row through
 * recordGovernedAction and nothing else, so the ledger recorded a signature
 * nobody gave: no re-authentication, no separation-of-duties check, no
 * electronic_signatures row (weekly review 2026-09-22, finding P1). This runs
 * the same ceremony as the canonical `POST /api/c2c/actions/sign`, in the
 * domain route's own transaction:
 *
 *   1. the declared §11.50 meaning is one this act can carry
 *   2. authority (§11.10(g)): the route admits writers only (requireEditorAccess),
 *      and the permission gate the canonical path runs when
 *      GOVERNANCE_RBAC_ENFORCE is on runs here too
 *   3. §11.200 re-authentication (verifyReauth: the password, and the second
 *      factor whenever the signer has one enrolled), before anything is written
 *   4. BEGIN, the domain write
 *   5. the meaning checked against authorship, on the same client: an
 *      `authorship` signature only from an author; any other meaning only from
 *      someone independent of the authors
 *   6. the ledger pair and the electronic_signatures row, on the same client
 *   7. COMMIT, so the change and its signature land together or not at all
 *
 * @module server/services/protocol-development/protocol-signature
 */

import type { PoolClient } from 'pg';
import { pool } from '../../db';
import { recordGovernedAction, verifyReauth } from '../../routes/c2c/actions';
import {
  assertSignerIsNotAuthor,
  resolveTargetAuthors,
  SeparationOfDutiesAuthorUnresolvedError,
  SeparationOfDutiesError,
  SeparationOfDutiesUnverifiedError,
} from '../governance/separation-of-duties';
import { can } from '../governance/permissions';
import { persistGovernedSignSignature } from '../part11/signature-persistence';
import { setTenantContextTx } from '../tenant/governed-tenant-context';
import { clientIpOf, type HasClientIp } from '../../utils/client-ip';

export const PROTOCOL_SIGN_MEANINGS = ['authorship', 'review', 'approval', 'responsibility'] as const;
export type ProtocolSignMeaning = (typeof PROTOCOL_SIGN_MEANINGS)[number];

/** A refusal the route returns as-is: nothing was written. */
export class ProtocolSignatureRefusal extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'ProtocolSignatureRefusal';
  }
}

export interface ProtocolSignatureInput {
  orgId: number;
  userId: number;
  /** Ledger target, e.g. `protocol-document:5`. */
  target: string;
  reason: string;
  meaning: unknown;
  /** The meanings this act can carry. */
  allowedMeanings: readonly ProtocolSignMeaning[];
  reauth: unknown;
  ipAddress: string | null;
  /** The signer's org role, for the permission gate. */
  role: string;
  /** The domain write. Runs first inside the transaction; throw to refuse. */
  write: (
    client: PoolClient,
    meaning: ProtocolSignMeaning,
  ) => Promise<{ payload?: Record<string, unknown>; body: Record<string, unknown> }>;
}

/** What the signer is told for each re-authentication refusal (verifyReauth's codes). */
const REAUTH_MESSAGE: Record<string, string> = {
  REAUTH_REQUIRED: 'Re-enter your password to sign. Nothing was signed.',
  REAUTH_PASSWORD_REQUIRED: 'Enter your password to sign. Nothing was signed.',
  REAUTH_PASSWORD_INVALID: 'The password was not accepted. Nothing was signed.',
  REAUTH_TOTP_REQUIRED: 'Your account has an authenticator enrolled: enter its current code to sign. Nothing was signed.',
  REAUTH_TOTP_INVALID: 'The authenticator code was not accepted. Nothing was signed.',
  REAUTH_MFA_STATE_UNKNOWN: 'Your second factor could not be checked, so the signature was refused. Try again. Nothing was signed.',
};

function asReauth(raw: unknown): { password?: string; totp?: string } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  return {
    ...(typeof r.password === 'string' ? { password: r.password } : {}),
    ...(typeof r.totp === 'string' && r.totp.length > 0 ? { totp: r.totp } : {}),
  };
}

export async function signProtocolAct(input: ProtocolSignatureInput): Promise<Record<string, unknown>> {
  const { orgId, userId, target, reason } = input;

  if (typeof input.meaning !== 'string' || input.meaning.length === 0) {
    throw new ProtocolSignatureRefusal(400, 'MEANING_REQUIRED', 'Declare what this signature means. Nothing was signed.');
  }
  const meaning = input.meaning as ProtocolSignMeaning;
  if (!input.allowedMeanings.includes(meaning)) {
    throw new ProtocolSignatureRefusal(
      400,
      'MEANING_NOT_ALLOWED',
      `This signature can mean ${input.allowedMeanings.join(', ')}; "${input.meaning}" is not one of them. Nothing was signed.`,
    );
  }

  // The canonical sign path's permission gate, dark-launched the same way
  // (routes/c2c/actions.ts makeHandler): off until validated on real role data.
  if (process.env.GOVERNANCE_RBAC_ENFORCE === 'true') {
    const resourceType = target.split(':')[0];
    if (!(await can(orgId, input.role, { action: 'sign', resourceType }))) {
      throw new ProtocolSignatureRefusal(403, 'NOT_AUTHORIZED', `Your role does not hold sign permission for ${resourceType}. Nothing was signed.`);
    }
  }

  const reauth = asReauth(input.reauth);
  const verified = await verifyReauth(userId, reauth);
  if (!verified.ok) {
    const code = verified.error ?? 'REAUTH_REQUIRED';
    throw new ProtocolSignatureRefusal(401, code, REAUTH_MESSAGE[code] ?? REAUTH_MESSAGE.REAUTH_REQUIRED);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, orgId);
    const { payload = {}, body } = await input.write(client, meaning);

    try {
      if (meaning === 'authorship') {
        // SoD does not examine an authorship signature, so the claim to be an
        // author is checked here instead of being taken on the signer's word.
        const authorship = await resolveTargetAuthors(target, orgId, client);
        if (!authorship.authors.includes(userId)) {
          throw new ProtocolSignatureRefusal(
            403,
            'NOT_AN_AUTHOR',
            'You are not an author of this protocol, so you cannot sign it as its author. Sign as approval or responsibility. Nothing was signed.',
          );
        }
      } else {
        await assertSignerIsNotAuthor(target, orgId, userId, { command: 'sign', meaning, client });
      }
    } catch (err) {
      if (err instanceof ProtocolSignatureRefusal) throw err;
      if (err instanceof SeparationOfDutiesError) throw new ProtocolSignatureRefusal(403, err.code, err.message);
      if (err instanceof SeparationOfDutiesAuthorUnresolvedError) throw new ProtocolSignatureRefusal(409, err.code, err.message);
      if (err instanceof SeparationOfDutiesUnverifiedError) throw new ProtocolSignatureRefusal(503, err.code, err.message);
      throw err;
    }

    const signedPayload = { ...payload, meaning };
    const gov = await recordGovernedAction(client, {
      orgId,
      userId,
      command: 'sign',
      target,
      reason,
      payload: signedPayload,
      domain: 'protocol_development',
      surface: 'protocol-workspace',
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
