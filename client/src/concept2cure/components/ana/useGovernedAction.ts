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
      const res = await fetch('/api/ana-ri/governed-action', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      const payload = (await res.json().catch(() => ({}))) as Record<string, any>;
      if (!res.ok) {
        const msg = (payload?.error as string) || (payload?.message as string) || `HTTP ${res.status}`;
        setError(msg);
        return null;
      }
      // The route returns the underlying CommandResult under `data`.
      const result = (payload?.data ?? payload) as { success?: boolean; message?: string };
      return {
        success: result?.success === true,
        message: typeof result?.message === 'string' ? result.message : 'Action completed.',
      };
    } catch (e: any) {
      setError(e?.message || 'Request failed');
      return null;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { submit, submitting, error };
}
