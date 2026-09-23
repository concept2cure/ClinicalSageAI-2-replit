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
 *   2. §11.200 re-authentication (verifyReauth), before anything is written
 *   3. BEGIN, the domain write
 *   4. separation of duties against the protocol's authors
 *   5. the ledger pair and the electronic_signatures row, on the same client
 *   6. COMMIT, so the change and its signature land together or not at all
 *
 * @module server/services/protocol-development/protocol-signature
 */

import type { PoolClient } from 'pg';
import { pool } from '../../db';
import { recordGovernedAction, verifyReauth } from '../../routes/c2c/actions';
import {
  assertSignerIsNotAuthor,
  SeparationOfDutiesAuthorUnresolvedError,
  SeparationOfDutiesError,
  SeparationOfDutiesUnverifiedError,
} from '../governance/separation-of-duties';
import { persistGovernedSignSignature } from '../part11/signature-persistence';
import { setTenantContextTx } from '../tenant/governed-tenant-context';

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
  /** The domain write. Runs first inside the transaction; throw to refuse. */
  write: (
    client: PoolClient,
    meaning: ProtocolSignMeaning,
  ) => Promise<{ payload?: Record<string, unknown>; body: Record<string, unknown> }>;
}

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

  const reauth = asReauth(input.reauth);
  const verified = await verifyReauth(userId, reauth);
  if (!verified.ok) {
    throw new ProtocolSignatureRefusal(
      401,
      verified.error ?? 'REAUTH_REQUIRED',
      'Re-enter your password to sign. Nothing was signed.',
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, orgId);
    const { payload = {}, body } = await input.write(client, meaning);

    try {
      await assertSignerIsNotAuthor(target, orgId, userId, { command: 'sign', meaning });
    } catch (err) {
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

/** The client IP for the signature row when resolvable; null, never invented. */
export function signerIpAddress(req: { headers: Record<string, unknown>; socket?: { remoteAddress?: string } }): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  return (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : '') || req.socket?.remoteAddress || null;
}
