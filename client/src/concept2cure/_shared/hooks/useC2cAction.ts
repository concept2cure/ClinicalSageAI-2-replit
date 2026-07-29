/**
 * useC2cAction — universal hook for governed mutations.
 *
 * Wraps POST /api/c2c/actions/:command. Handles idempotency, re-auth gate
 * for risk='high' (via the existing <EsignModal>), and surfaces loading /
 * error state to the caller.
 *
 * Usage:
 *   const { trigger, pending, error } = useTransition();
 *   await trigger({ target: 'document:doc_abc', reason: 'Sending to QC' });
 *
 * For high-risk mutations (sign / lock / revoke-signature), pass
 * `reauth: { password, totp }` in the trigger args — useC2cAction sends
 * them to the server and does NOT store them client-side after the call.
 *
 * @module client/src/concept2cure/_shared/hooks/useC2cAction
 */

import { useCallback, useState } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export type C2cActionCommand =
  | 'claim'
  | 'transition'
  | 'resolve'
  | 'sign'
  | 'accept-ai-suggestion'
  | 'lock'
  | 'unclaim'
  | 'transition-back'
  | 'reopen'
  | 'revoke-signature'
  | 'reject-ai-suggestion'
  | 'unlock';

export type C2cRisk = 'low' | 'med' | 'high';

export interface C2cTriggerArgs<TPayload = unknown> {
  target:          string;
  reason:          string;
  payload?:        TPayload;
  idempotencyKey?: string;
  /** Required when command is sign / lock / revoke-signature.
   *  Populated by <EsignModal>; never stored after the call. */
  reauth?: {
    password?: string;
    totp?:     string;
  };
}

export interface C2cActionResult {
  actionId:    string;
  auditId:     string;
  sha256Chain: string;
  state:       string;
}

export interface UseC2cActionReturn<TPayload = unknown> {
  trigger: (args: C2cTriggerArgs<TPayload>) => Promise<C2cActionResult>;
  pending: boolean;
  error:   string | null;
  reset:   () => void;
}

// ── Generic hook ─────────────────────────────────────────────────────────────

export function useC2cAction<TPayload = unknown>(
  command: C2cActionCommand,
): UseC2cActionReturn<TPayload> {
  const [pending, setPending] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const reset = useCallback(() => setError(null), []);

  const trigger = useCallback(
    async (args: C2cTriggerArgs<TPayload>): Promise<C2cActionResult> => {
      setPending(true);
      setError(null);

      try {
        const body: Record<string, unknown> = {
          target:  args.target,
          reason:  args.reason,
        };
        if (args.payload !== undefined) body.payload         = args.payload;
        if (args.idempotencyKey)        body.idempotencyKey  = args.idempotencyKey;
        if (args.reauth)                body.reauth          = args.reauth;

        const res = await fetch(`/api/c2c/actions/${command}`, {
          method:      'POST',
          credentials: 'include',
          headers:     { 'Content-Type': 'application/json' },
          body:        JSON.stringify(body),
        });

        if (res.status === 401) {
          const detail = await res.json().catch(() => ({}));
          const code = (detail as any)?.error ?? 'AUTH_REQUIRED';
          throw new Error(code);
        }

        if (!res.ok) {
          const detail = await res.json().catch(() => ({}));
          const msg = (detail as any)?.error ?? `HTTP ${res.status}`;
          throw new Error(msg);
        }

        return (await res.json()) as C2cActionResult;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'UNKNOWN_ERROR';
        setError(msg);
        throw err;
      } finally {
        setPending(false);
      }
    },
    [command],
  );

  return { trigger, pending, error, reset };
}

// ── Six convenience wrappers ─────────────────────────────────────────────────

export const useClaim           = () => useC2cAction('claim');
export const useTransition      = () => useC2cAction('transition');
export const useResolve         = () => useC2cAction('resolve');
export const useSign            = () => useC2cAction('sign');
export const useAcceptAi        = () => useC2cAction('accept-ai-suggestion');
export const useLock            = () => useC2cAction('lock');

// Reverse counterparts
export const useUnclaim         = () => useC2cAction('unclaim');
export const useTransitionBack  = () => useC2cAction('transition-back');
export const useReopen          = () => useC2cAction('reopen');
export const useRevokeSignature = () => useC2cAction('revoke-signature');
export const useRejectAi        = () => useC2cAction('reject-ai-suggestion');
export const useUnlock          = () => useC2cAction('unlock');
