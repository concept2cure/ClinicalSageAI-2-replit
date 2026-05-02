/**
 * AnA-MDX tool policy — shared gate for every governed MDX tool handler.
 *
 * Consolidates four checks every state-mutating tool needs:
 *
 *   1. Multi-turn confirmation merge — if the user replied 'confirm: yes'
 *      in a follow-up turn after AnA proposed an action, pull the stashed
 *      params out of `mdx-pending-actions.ts` and merge them in so the
 *      user does not have to re-state every field.
 *   2. Confirmation (`confirm`/`reason` two-phase invocation contract).
 *   3. Per-tenant permission (allow / deny lists in
 *      organizations.settings.anaToolPolicy).
 *   4. Reason-quality filter — defends against degenerate reasons that
 *      pass the length check but carry no auditable signal. Also emits
 *      a SOFT `reasonReferencedArtifact` flag so handlers can record
 *      whether the reason mentioned a concrete artifact (section number,
 *      Q-number, commitment code, FDA letter id, SOP id, or date).
 *
 * Returns a single object the handler either short-circuits on (gate
 * failed) or treats as a green light (gate passed; carries the
 * validated reason + the artifact-reference flag).
 *
 * Used by mdx-command-handlers.ts and mdx-command-handlers-phase2.ts /
 * phase3.ts.
 */

import type { CommandContext, CommandResult } from './command-executor';
import {
  proposeAction,
  lookupPendingAction,
  clearPendingAction,
} from './mdx-pending-actions';
import { checkAnaToolRateLimit } from './mdx-tool-rate-limit';

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
  /** When ok=true, did the reason cite a concrete artifact? Soft signal
   *  only — handlers stamp the audit row with this so an auditor can
   *  filter for "AnA-initiated mutations whose reason did NOT cite a
   *  specific artifact". */
  reasonReferencedArtifact?: boolean;
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
 * Load the per-tenant policy from `organizations.settings.anaToolPolicy`.
 * Returns an empty policy when:
 *   - the org row is missing (treat as no constraint),
 *   - settings is null,
 *   - the anaToolPolicy field is absent or malformed.
 *
 * The dispatcher calls this once per `executeCommands` invocation and
 * stamps the result on `ctx.anaToolPolicy`. Per-tool calls then read
 * the cached value via the gate.
 */
export async function loadAnaToolPolicy(
  pool: { query: (sql: string, params: unknown[]) => Promise<{ rows: any[] }> },
  organizationId: number,
): Promise<AnaToolPolicy> {
  if (!Number.isFinite(organizationId) || organizationId <= 0) return {};
  try {
    const { rows } = await pool.query(
      `SELECT settings FROM organizations WHERE id = $1 LIMIT 1`,
      [organizationId],
    );
    const raw = rows[0]?.settings?.anaToolPolicy;
    if (!raw || typeof raw !== 'object') return {};
    const policy: AnaToolPolicy = {};
    if (Array.isArray(raw.deny)) policy.deny = raw.deny.filter((s: unknown) => typeof s === 'string');
    if (Array.isArray(raw.allow)) policy.allow = raw.allow.filter((s: unknown) => typeof s === 'string');
    return policy;
  } catch {
    // Loader must never throw — treat any DB issue as default-allow.
    return {};
  }
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
  return ctx.anaToolPolicy ?? {};
}

// ─── Reason-quality filter ─────────────────────────────────────────────────

/**
 * Patterns that indicate the reason cites a concrete artifact. Hits any
 * one and we flag `reasonReferencedArtifact = true`. The list is
 * intentionally generous — false positives are fine; false negatives
 * (legit reason flagged as fabricated) are not.
 */
const ARTIFACT_REFERENCE_PATTERNS: RegExp[] = [
  /§\s*\d+/i,                            // section number "§6"
  /\bsection\s+\d+(\.\d+)?\b/i,           // "section 11" / "section 3.2"
  /\bQ\d{4,}/,                            // FDA Q-number "Q251142"
  /\bK\d{6}\b/,                           // FDA K-number "K212284"
  /\bcm-[a-z0-9-]+/i,                     // commitment display code "cm-1142-3"
  /\bSAP\b/,                              // statistical analysis plan
  /\bSOP[-\s]?[A-Z0-9-]+\b/i,             // SOP reference
  /\bAI\s+letter\b|\bdeficiency\b|\bIR\b/i, // FDA letter / deficiency / IR
  /\bISO[-\s]?\d{3,}/i,                   // ISO standard
  /\bASTM[-\s]?[A-Z]?\d{3,}/i,            // ASTM standard
  /\b21\s*CFR\s*(?:§|Part)?\s*\d+/i,      // 21 CFR citation
  /\b[A-Za-z][a-z]+\s+\d{1,2},?\s+20\d{2}\b/, // "Mar 14, 2025"
  /\b\d{4}-\d{2}-\d{2}\b/,                // ISO date
];

function reasonCitesArtifact(reason: string): boolean {
  return ARTIFACT_REFERENCE_PATTERNS.some(re => re.test(reason));
}

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
  const threadId = typeof ctx.threadId === 'string' ? ctx.threadId : null;

  // ── 0. Multi-turn confirmation merge ─────────────────────────────────
  // If the caller looks like a confirming reply (confirm + reason
  // present, but the rest of the params is sparse), pull the proposed
  // action out of the pending-action store and merge its captured
  // params in. Mutates `params` IN PLACE so downstream handler logic
  // reads merged values without changes.
  if (
    threadId &&
    Number.isFinite(ctx.organizationId) &&
    typeof params.confirm === 'string'
  ) {
    const pending = lookupPendingAction({
      organizationId: ctx.organizationId,
      threadId,
    });
    if (pending && pending.action === action) {
      for (const [k, v] of Object.entries(pending.params)) {
        if (params[k] === undefined) {
          params[k] = v;
        }
      }
    }
  }

  // ── 0.5. Per-tool rate limit ─────────────────────────────────────────
  // Defends against runaway agent loops. Identity is `<org>:<action>`
  // so tenants share no counter and tools share no counter. ESG
  // transmit has the strictest ceiling (5/hr); audit.explain has the
  // most generous (200/hr). See mdx-tool-rate-limit.ts.
  const rate = checkAnaToolRateLimit(ctx, action);
  if (!rate.allowed && rate.result) {
    return { ok: false, reason: '', result: rate.result };
  }

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
    // Stash whatever params the user supplied so the next turn can
    // confirm without re-stating them. Token returned in the response
    // so the chat layer can echo it; the gate's merge step will find
    // the pending action by (org, thread) anyway.
    let pendingActionToken: string | undefined;
    if (threadId && Number.isFinite(ctx.organizationId)) {
      const stashed = proposeAction({
        organizationId: ctx.organizationId,
        threadId,
        action,
        params,
      });
      pendingActionToken = stashed.token;
    }
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
          pendingActionToken,
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

  // Gate passed; clear any stale pending action for this (org, thread).
  if (threadId && Number.isFinite(ctx.organizationId)) {
    clearPendingAction({ organizationId: ctx.organizationId, threadId });
  }

  return {
    ok: true,
    reason: reasonRaw,
    reasonReferencedArtifact: reasonCitesArtifact(reasonRaw),
    result: null as unknown as CommandResult,
  };
}

// ─── Helpers exposed to handlers ───────────────────────────────────────────

/**
 * Build the standard `details.*` shape every `agent.ana.*` audit row
 * carries. Handlers spread this into their auditService.logAction call:
 *
 *     details: {
 *       ...agentAuditDetails(ctx, gate),
 *       programId: row.programId,
 *       title: row.title,
 *     },
 *
 * Captures: actorKind, agentReason, reasonReferencedArtifact (soft
 * signal), and the chat-thread / chat-message ids if present so an
 * auditor can trace the conversation that produced the mutation.
 */
export function agentAuditDetails(
  ctx: CommandContext,
  gate: PolicyCheck,
): Record<string, unknown> {
  return {
    actorKind: 'agent:ana',
    agentReason: gate.reason,
    reasonReferencedArtifact: gate.reasonReferencedArtifact === true,
    threadId: ctx.threadId ?? null,
    chatMessageId: ctx.chatMessageId ?? null,
  };
}

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
