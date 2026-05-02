/**
 * AnA-MDX tool policy — shared gate for every governed MDX tool handler.
 *
 * Consolidates three checks every state-mutating tool needs:
 *
 *   1. Confirmation (`confirm`/`reason` two-phase invocation contract).
 *   2. Per-tenant permission (allow / deny lists in
 *      organizations.settings.anaToolPolicy).
 *   3. Reason-quality filter (defends against degenerate reason strings
 *      that pass the length check but carry no auditable signal).
 *
 * Returns a single object the handler either short-circuits on (gate
 * failed) or treats as a green light (gate passed; carries the
 * validated reason).
 *
 * Used by mdx-command-handlers.ts and mdx-command-handlers-phase2.ts.
 */

import type { CommandContext, CommandResult } from './command-executor';

// ─── Confirmation contract ──────────────────────────────────────────────────

const DEFAULT_REASON_MIN = 10;
const REASON_MIN_DISTINCT_CHARS = 5;

export interface ConfirmRequirements {
  /** Required value of `confirm`. Default: 'yes'. ESG transmit overrides
   *  to 'yes-transmit'. */
  expected?: string;
  /** Minimum reason length. Default: 10. ESG transmit overrides to 30. */
  minReasonLength?: number;
}

export interface PolicyCheck {
  ok: boolean;
  /** When ok=false, the CommandResult to return verbatim. */
  result: CommandResult;
  /** When ok=true, the validated trimmed reason string. */
  reason: string;
}

/**
 * Per-tenant policy stored under organizations.settings.anaToolPolicy.
 */
export interface AnaToolPolicy {
  /** Tools the tenant has explicitly disabled. Hard refusal. */
  deny?: string[];
  /** Tools the tenant has explicitly allowed. When set, ANY tool not
   *  in this list is refused (allowlist mode). */
  allow?: string[];
}

/**
 * Resolve policy from a CommandContext-level cache. The actual lookup
 * happens at chat-session start; this function reads the cached value
 * from `(ctx as any).anaToolPolicy`. If absent, the resolver returns
 * an empty policy (all tools allowed) — matches the BETA default.
 *
 * Loading the policy from `organizations.settings` at session start
 * keeps every tool call hot-path-free of an extra DB query.
 */
function getCachedPolicy(ctx: CommandContext): AnaToolPolicy {
  const raw = (ctx as unknown as { anaToolPolicy?: AnaToolPolicy }).anaToolPolicy;
  return raw ?? {};
}

// ─── Reason-quality filter ─────────────────────────────────────────────────

/**
 * Counts distinct characters in a reason string, ignoring case + whitespace.
 * Reasons made of one repeated character (e.g. 'aaaaaaaaaa') trip the
 * minimum and get refused.
 */
function distinctCharCount(s: string): number {
  const seen = new Set<string>();
  for (const ch of s.toLowerCase()) {
    if (!/\s/.test(ch)) seen.add(ch);
  }
  return seen.size;
}

// ─── Main gate ──────────────────────────────────────────────────────────────

export function requireGovernedToolGate(
  action: string,
  ctx: CommandContext,
  params: Record<string, unknown>,
  reqs: ConfirmRequirements = {},
): PolicyCheck {
  const expected = (reqs.expected ?? 'yes').toLowerCase();
  const minLen = reqs.minReasonLength ?? DEFAULT_REASON_MIN;

  // ── 1. Tenant policy gate ─────────────────────────────────────────────
  const policy = getCachedPolicy(ctx);
  if (Array.isArray(policy.deny) && policy.deny.includes(action)) {
    return {
      ok: false,
      reason: '',
      result: {
        success: false,
        action,
        message: `Tool '${action}' is disabled for your organization. Contact a tenant admin to enable it.`,
        error: 'TOOL_DENIED',
      },
    };
  }
  if (Array.isArray(policy.allow) && policy.allow.length > 0 && !policy.allow.includes(action)) {
    return {
      ok: false,
      reason: '',
      result: {
        success: false,
        action,
        message: `Tool '${action}' is not in your organization's allowlist for AnA-initiated mutations.`,
        error: 'TOOL_NOT_ALLOWED',
      },
    };
  }

  // ── 2. Confirmation ──────────────────────────────────────────────────
  const confirm = typeof params.confirm === 'string' ? params.confirm.toLowerCase() : '';
  const reasonRaw = typeof params.reason === 'string' ? params.reason.trim() : '';

  if (confirm !== expected) {
    const helpFragment =
      expected === 'yes'
        ? `Re-issue with confirm='yes' and a reason ≥ ${minLen} chars.`
        : `Re-issue with confirm='${expected}' and a reason ≥ ${minLen} chars.`;
    return {
      ok: false,
      reason: '',
      result: {
        success: false,
        action: 'confirmation_required',
        message: `This is a governed mutation (action='${action}'). ${helpFragment}`,
        data: {
          requiredAction: action,
          requiredFields: ['confirm', 'reason'],
          confirmExpected: expected,
          reasonMinLength: minLen,
        },
        error: 'CONFIRMATION_REQUIRED',
      },
    };
  }
  if (reasonRaw.length < minLen) {
    return {
      ok: false,
      reason: '',
      result: {
        success: false,
        action: 'confirmation_required',
        message: `reason must be at least ${minLen} characters describing why this change is being made.`,
        data: { requiredAction: action, requiredFields: ['reason'], reasonMinLength: minLen },
        error: 'REASON_TOO_SHORT',
      },
    };
  }

  // ── 3. Reason-quality filter ─────────────────────────────────────────
  if (distinctCharCount(reasonRaw) < REASON_MIN_DISTINCT_CHARS) {
    return {
      ok: false,
      reason: '',
      result: {
        success: false,
        action: 'confirmation_required',
        message:
          `reason appears degenerate (too few distinct characters). Provide a ` +
          `meaningful explanation of why this change is being made.`,
        data: { requiredAction: action, requiredFields: ['reason'] },
        error: 'REASON_DEGENERATE',
      },
    };
  }

  return { ok: true, reason: reasonRaw, result: null as unknown as CommandResult };
}

// ─── Helpers exposed to handlers ───────────────────────────────────────────

/** Map a TenantAccessError-like thrown error to a CommandResult. */
export function mapServiceError(action: string, err: unknown): CommandResult {
  if (err instanceof Error && err.name === 'TenantAccessError') {
    return {
      success: false,
      action,
      message: 'Access denied: the resource is not in your organization.',
      error: 'TENANT_ACCESS_DENIED',
    };
  }
  const detail = err instanceof Error ? err.message : 'unknown';
  return {
    success: false,
    action,
    message: `Action failed: ${detail}`,
    error: 'EXECUTION_FAILED',
  };
}
