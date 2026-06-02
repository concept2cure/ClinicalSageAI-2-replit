/**
 * useSignApproval — commits an approval e-signature.
 *
 * Per the runbook decision ("Extend /approve server-side"), the single
 * "Apply signature" action POSTs to /api/approval-workflows/:id/approve.
 * Keying off the approval id (not a document/version id) means this works
 * for every pending row regardless of whether it backs a section or a
 * package — the case the two-call /esignature/sign path could not cover.
 *
 * BACKEND GAP (logged): /approve currently persists only `comments`. The
 * `meaning` + `credential` sent below are the Part 11 attestation; they are
 * written so the electronic_signatures row is recorded atomically the moment
 * the endpoint is extended server-side to capture them. Until then the action
 * advances the workflow step without writing the Part 11 row. This is the
 * same "log the gap, don't block the slice" treatment as the audit manifest.
 */

import { useCallback, useState } from 'react';

export interface SignApprovalInput {
  approvalId: string;
  /** Meaning-of-signature attestation (21 CFR §11.50). */
  meaning: string;
  /** Re-entered credential (21 CFR §11.200(a)). */
  password: string;
}

export interface UseSignApprovalResult {
  sign: (input: SignApprovalInput) => Promise<boolean>;
  signing: boolean;
  error: string | null;
}

export function useSignApproval(onSigned?: () => void): UseSignApprovalResult {
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sign = useCallback(
    async (input: SignApprovalInput): Promise<boolean> => {
      setSigning(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/approval-workflows/${encodeURIComponent(input.approvalId)}/approve`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              // Read today by the endpoint:
              comments: input.meaning,
              // Part 11 attestation — captured once /approve is extended:
              meaning: input.meaning,
              signatureMeaning: input.meaning,
              signaturePassword: input.password,
            }),
          },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body?.error || `Signature failed (HTTP ${res.status})`);
        }
        onSigned?.();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Signature failed');
        return false;
      } finally {
        setSigning(false);
      }
    },
    [onSigned],
  );

  return { sign, signing, error };
}
