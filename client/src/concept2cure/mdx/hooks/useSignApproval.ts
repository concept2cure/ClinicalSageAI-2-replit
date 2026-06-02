/**
 * useSignApproval — commits an approval e-signature.
 *
 * Single POST to /api/approval-workflows/:id/approve carries the Part 11
 * attestation (meaning + password + TOTP). The server verifies BOTH factors
 * inline (no pre-call to /verify-mfa), writes the electronic_signatures row
 * with authentication_method='password+totp', and advances the workflow
 * step in one call — matching the strength of /api/esignature/sign.
 *
 * Response: { success, signatureId, signaturePending, ...workflowResult }.
 * `signaturePending: true` means the step advanced but the Part 11 row write
 * failed and needs reconciliation — surface this to the user if it ever fires.
 */

import { useCallback, useState } from 'react';

export interface SignApprovalInput {
  approvalId: string;
  /** Meaning-of-signature attestation (21 CFR §11.50). */
  meaning: string;
  /** Re-entered credential (21 CFR §11.200(a)(1)). */
  password: string;
  /** Current 6-digit TOTP code (21 CFR §11.200(a)(1)(ii) — second factor). */
  mfaToken: string;
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
              meaning: input.meaning,
              signaturePassword: input.password,
              mfaToken: input.mfaToken,
            }),
          },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          if (res.status === 401 && body?.error === 'SIGNATURE_INVALID') {
            throw new Error('Password did not match — signature not recorded.');
          }
          if (res.status === 401 && body?.error === 'MFA_INVALID') {
            throw new Error('Authentication code did not match — signature not recorded.');
          }
          if (res.status === 400 && body?.error === 'MFA_TOKEN_REQUIRED') {
            throw new Error('Enter your 6-digit authentication code.');
          }
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
