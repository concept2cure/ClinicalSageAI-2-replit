/**
 * useEsignature — 21 CFR Part 11 re-authentication + signing hook.
 *
 * Wraps the real e-signature backend at `/api/esignature`:
 *   POST /verify-password  → { valid: boolean }
 *   POST /verify-mfa       → { valid: boolean }   (body: { token })
 *   POST /sign             → { signatureId, signatureHash, signedAt }
 *
 * The shared <EsignModal> uses verifyPassword / verifyMfa to gate the confirm
 * step, then the caller runs the governed mutation. When the governed record
 * maps to a numeric (documentId, versionId) pair, sign() durably records the
 * signing event in `electronic_signatures` so the audit trail is real. Where
 * the governed mutation has its own server-side audit (for example CMC batch
 * release), the mutation itself is the recorded action and sign() is optional.
 *
 * Re-auth secrets (password, token) are passed to fetch and never stored or
 * logged client-side. Mirrors the react-query idioms in useCMC.ts.
 *
 * @module client/src/concept2cure/hooks/useEsignature
 */

import { useMutation } from '@tanstack/react-query';

const BASE = '/api/esignature';

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (payload?.error as string) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return payload as T;
}

// ── Signature meaning enum (§11.50) ──────────────────────────────────────────

export type EsigMeaning =
  | 'authorship'
  | 'review'
  | 'approval'
  | 'responsibility'
  | 'release';

export interface VerifyResult {
  valid: boolean;
  error?: string;
}

export interface SignArgs {
  documentId: number;
  versionId: number;
  /** Maps to the signature meaning enum / server signaturePurpose. */
  signaturePurpose: EsigMeaning | string;
  /** Server verb, e.g. "released" | "approved" | "reviewed". */
  action: string;
  /** Free-text reason-for-change, stored verbatim in the audit trail. */
  signatureMeaning?: string;
  secondFactorVerified?: boolean;
  signatureType?: string;
}

export interface SignResult {
  signatureId: number;
  signatureHash: string;
  signedAt: string;
}

/**
 * useEsignature — exposes the three governed-action primitives as react-query
 * mutations. Each returns the unwrapped server payload and surfaces error /
 * pending state for inline display.
 */
export function useEsignature() {
  const verifyPasswordMut = useMutation<VerifyResult, Error, { password: string }>({
    mutationFn: (body) => postJson<VerifyResult>('/verify-password', body),
  });

  const verifyMfaMut = useMutation<VerifyResult, Error, { token: string }>({
    mutationFn: (body) => postJson<VerifyResult>('/verify-mfa', body),
  });

  const signMut = useMutation<SignResult, Error, SignArgs>({
    mutationFn: (body) => postJson<SignResult>('/sign', body),
  });

  return {
    /** Verify the current user's password. Resolves { valid }. */
    verifyPassword: (password: string) => verifyPasswordMut.mutateAsync({ password }),
    /** Verify a 6-digit TOTP. Resolves { valid }. */
    verifyMfa: (token: string) => verifyMfaMut.mutateAsync({ token }),
    /** Durably record a signing event. Requires numeric documentId/versionId. */
    sign: (args: SignArgs) => signMut.mutateAsync(args),

    verifyingPassword: verifyPasswordMut.isPending,
    verifyingMfa: verifyMfaMut.isPending,
    signing: signMut.isPending,
    signError: signMut.error?.message ?? null,
  };
}
