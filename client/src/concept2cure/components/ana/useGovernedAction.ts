/**
 * useGovernedAction — client side of AnA's 21 CFR Part 11 governed-action flow.
 *
 * When AnA tries to run a record-altering command under enforcement, the server
 * blocks it with `PART11_SIGNATURE_REQUIRED` and returns enough to re-submit.
 * {@link extractPendingSignoffs} turns those blocked command results into pending
 * sign-off prompts; the hook posts the completed sign-off (reason-for-change +,
 * for high-impact actions, re-authentication) to /api/ana-ri/governed-action.
 *
 * Re-auth secrets (password, MFA token) are passed to fetch and never stored.
 *
 * @module client/src/concept2cure/components/ana/useGovernedAction
 */

import { useState, useCallback } from 'react';
import { extractApiError } from '@/lib/queryClient';
import { getAuthHeaders } from '../../../utils/authToken';

/** A governed action AnA proposed that needs the user's sign-off to run. */
export interface PendingSignoff {
  command: string;
  params: Record<string, unknown>;
  /** True for high-impact actions: an e-signature (re-auth) is also required. */
  signatureRequired: boolean;
  /** Server's human-readable explanation of what is being signed off. */
  message: string;
}

/** A raw command result as it arrives in post_done.executedCommands. */
interface ExecutedCommandResult {
  success?: boolean;
  action?: string;
  error?: string;
  message?: string;
  data?: {
    signatureRequired?: boolean;
    retry?: { command?: string; params?: Record<string, unknown> };
  };
}

/**
 * Pure: pull the governed actions that were blocked pending a Part 11 sign-off
 * out of a turn's executed-command results. Only well-formed blocks (carrying a
 * retry payload) are surfaced, so a malformed result never produces a prompt.
 */
export function extractPendingSignoffs(
  executedCommands: ExecutedCommandResult[] | undefined | null
): PendingSignoff[] {
  if (!Array.isArray(executedCommands)) return [];
  const out: PendingSignoff[] = [];
  for (const r of executedCommands) {
    if (r?.error !== 'PART11_SIGNATURE_REQUIRED') continue;
    const command = r.data?.retry?.command;
    if (typeof command !== 'string' || command.length === 0) continue;
    out.push({
      command,
      params: r.data?.retry?.params ?? {},
      signatureRequired: r.data?.signatureRequired === true,
      message: typeof r.message === 'string' ? r.message : 'This action requires a reason for change.',
    });
  }
  return out;
}

export interface SubmitSignoffArgs {
  command: string;
  params: Record<string, unknown>;
  reasonForChange: string;
  /** Required only for the high-impact (e-signature) tier. */
  password?: string;
  /** Required when the signer has MFA enabled (high-impact tier). */
  mfaToken?: string;
}

export interface GovernedActionResult {
  success: boolean;
  message: string;
}

/** Posts a completed governed-action sign-off and exposes pending/error state. */
export function useGovernedAction() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (args: SubmitSignoffArgs): Promise<GovernedActionResult | null> => {
    setSubmitting(true);
    setError(null);
    try {
      // /api/ana-ri is mounted behind Bearer-only authenticateToken — cookies
      // alone never authenticate it, so the Authorization header is required
      // (same posture as useVerifiedSeal).
      const res = await fetch('/api/ana-ri/governed-action', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(args),
      });
      const payload = (await res.json().catch(() => ({}))) as Record<string, any>;
      if (!res.ok) {
        // `payload.error` was read before `payload.message`, so the governed
        // refusals — which answer { error: '<CODE>', message: '<why>' } — put
        // the code in the sign-off dialog instead of the reason, and a body
        // with no copy fell through to a bare "HTTP 403". extractApiError takes
        // the server's sentence where there is one and a status-keyed sentence
        // where there is not, and always returns a string, so the original
        // constraint holds: an object can never reach setError.
        //
        // The PART11_SIGNATURE_REQUIRED test in extractPendingSignoffs is a
        // different thing entirely — a control-flow branch on an AnA stream
        // event, not display copy — and is deliberately left as it is.
        setError(extractApiError(payload, res.status).message);
        return null;
      }
      // The route returns the underlying CommandResult under `data`.
      const result = (payload?.data ?? payload) as { success?: boolean; message?: string };
      return {
        success: result?.success === true,
        message: typeof result?.message === 'string' ? result.message : 'Action completed.',
      };
    } catch {
      // Nothing in the try block throws a reduced API error — the response body
      // is parsed defensively above — so anything caught here is the fetch
      // itself failing, whose native message is "Failed to fetch". That is not
      // an answer to give someone mid sign-off.
      setError('The sign-off could not be sent. Check your connection and try again.');
      return null;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { submit, submitting, error };
}
