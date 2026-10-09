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

/**
 * The three ways a person takes an action AnA proposed (the server's
 * governedTierOf): 'esignature' — reason and re-authentication; 'reason' — a
 * reason for change; 'confirm' — an explicit yes, no reason, no credentials
 * (the ordinary writes, since 2026-09-26 proposals rather than actions AnA
 * takes unaided; security audit 2026-09-24 DP-08, P0-12).
 */
export type GovernedTier = 'confirm' | 'reason' | 'esignature';

/** The tier a server envelope names, or the one its signature flag implies (older servers). */
export function tierOf(data: { tier?: unknown; signatureRequired?: unknown } | undefined | null): GovernedTier {
  const t = data?.tier;
  if (t === 'confirm' || t === 'reason' || t === 'esignature') return t;
  return data?.signatureRequired === true ? 'esignature' : 'reason';
}

/** A governed action AnA proposed that needs the user's sign-off to run. */
export interface PendingSignoff {
  command: string;
  params: Record<string, unknown>;
  /** True for high-impact actions: an e-signature (re-auth) is also required. */
  signatureRequired: boolean;
  /** Which of the three tiers; absent on older fixtures, derived from signatureRequired then. */
  tier?: GovernedTier;
  /** Server's human-readable explanation of what is being signed off. */
  message: string;
  /**
   * Set when AnA is HOLDING A TURN on this decision rather than having ended
   * it. The pair routes the outcome back to the waiting run, so she carries on
   * from what the person decided instead of the action running on its own
   * after her turn is over.
   *
   * Absent for the original flow — a command blocked during a turn that has
   * already finished — which still works exactly as it did.
   */
  runId?: string;
  toolUseId?: string;
}

/** An `approval_required` frame, as the stream sends one. */
interface ApprovalRequiredEvent {
  type?: string;
  runId?: unknown;
  toolUseId?: unknown;
  action?: unknown;
  message?: unknown;
  data?: {
    tier?: unknown;
    reasonRequired?: boolean;
    signatureRequired?: boolean;
    retry?: { command?: string; params?: Record<string, unknown> };
  };
}

/**
 * Pure: turn a live `approval_required` frame into the same PendingSignoff the
 * end-of-turn path produces.
 *
 * Deliberately the SAME shape, so GovernedActionSignoff renders it unchanged
 * and there is one sign-off surface rather than two to keep in step. Only
 * well-formed frames — carrying a command AND the run/tool pair that routes the
 * answer back — produce a prompt; anything else would render a dialog whose
 * confirm button had nowhere to go.
 */
export function pendingSignoffFromApproval(event: ApprovalRequiredEvent): PendingSignoff | null {
  const command = event?.data?.retry?.command;
  const runId = event?.runId;
  const toolUseId = event?.toolUseId;
  if (typeof command !== 'string' || !command) return null;
  if (typeof runId !== 'string' || !runId) return null;
  if (typeof toolUseId !== 'string' || !toolUseId) return null;
  const tier = tierOf(event.data);
  return {
    command,
    params: event.data?.retry?.params ?? {},
    signatureRequired: tier === 'esignature',
    tier,
    message: typeof event.message === 'string' ? event.message : defaultMessageFor(tier),
    runId,
    toolUseId,
  };
}

function defaultMessageFor(tier: GovernedTier): string {
  return tier === 'confirm'
    ? 'AnA proposed this action. Confirm to run it under your name.'
    : 'This action requires a reason for change.';
}

/** A raw command result as it arrives in post_done.executedCommands. */
interface ExecutedCommandResult {
  success?: boolean;
  action?: string;
  error?: string;
  message?: string;
  data?: {
    tier?: unknown;
    reasonRequired?: boolean;
    signatureRequired?: boolean;
    retry?: { command?: string; params?: Record<string, unknown> };
  };
}

/** The two envelopes a blocked command answers with: the Part 11 gate's, and the proposal gate's. */
const PENDING_SIGNOFF_ERRORS: ReadonlySet<string> = new Set(['PART11_SIGNATURE_REQUIRED', 'HUMAN_CONFIRMATION_REQUIRED']);

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
    // HUMAN_CONFIRMATION_REQUIRED (an agent proposed something only a person
    // may do) had no reader here at all, so an end-of-turn proposal never
    // rendered; only the live stream path did (audit DP-08, P0-12).
    if (typeof r?.error !== 'string' || !PENDING_SIGNOFF_ERRORS.has(r.error)) continue;
    const command = r.data?.retry?.command;
    if (typeof command !== 'string' || command.length === 0) continue;
    const tier = tierOf(r.data);
    out.push({
      command,
      params: r.data?.retry?.params ?? {},
      signatureRequired: tier === 'esignature',
      tier,
      message: typeof r.message === 'string' ? r.message : defaultMessageFor(tier),
    });
  }
  return out;
}

export interface SubmitSignoffArgs {
  command: string;
  params: Record<string, unknown>;
  /** Required for the reason and e-signature tiers; absent for the confirm tier. */
  reasonForChange?: string;
  /** The confirm tier's explicit yes; the server requires it for that tier and ignores it otherwise. */
  confirm?: true;
  /** Required only for the high-impact (e-signature) tier. */
  password?: string;
  /** Required when the signer has MFA enabled (high-impact tier). */
  mfaToken?: string;
  /**
   * Routes the outcome back to a turn that is waiting on this decision. When
   * both are present the server reads the command and params FROM THE RUN ROW
   * and ignores the ones posted here — so what the person saw is what executes,
   * and a tampered body cannot redirect their signature onto another action.
   */
  runId?: string;
  toolUseId?: string;
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

  /**
   * A person's no to an action AnA is holding a turn on. Releases the run at
   * once; without it the turn waited out the pause ceiling. Best-effort: if it
   * cannot be sent, the run still ends at the ceiling and records the lapse.
   */
  const decline = useCallback(async (held: { runId: string; toolUseId: string }): Promise<boolean> => {
    try {
      const res = await fetch('/api/ana-ri/governed-action', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ runId: held.runId, toolUseId: held.toolUseId, decision: 'decline' }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  return { submit, decline, submitting, error };
}
