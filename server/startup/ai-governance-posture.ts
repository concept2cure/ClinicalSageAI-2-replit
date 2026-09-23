/**
 * AI-governance production boot gate.
 *
 * The two AI content-safety gates are progressive-rollout toggles, default-
 * permissive OUTSIDE production so pilot/dev flows are not broken by the
 * heuristics' false positives:
 *   - AI_PII_ENFORCEMENT (server/services/ai-gateway/pii-screen.ts): non-
 *     production default 'audit' (detect + record, never block).
 *   - AI_GROUNDEDNESS_ENFORCE (server/services/ai-governance/groundedness.ts):
 *     ON by default everywhere since 2026-08-13; it can be turned OFF per
 *     deployment with 0/false/off.
 *
 * ── Production posture (runbook B19 / B20, 2026-09-20) ──────────────────────
 * Until this date production only WARNED when a gate ran permissive and failed
 * closed only under an opt-in flag — a fail-open default on the two controls a
 * GxP buyer is sold. It now mirrors RLS_ENFORCE and AUDIT_SEAL_ACCEPT_UNSEALED:
 *
 *   AI_PII_ENFORCEMENT      unset → 'block'. Explicit 'audit' / 'off' is a
 *                           deliberate degraded posture.
 *   AI_GROUNDEDNESS_ENFORCE unset → enforced. Explicit 0/false/off is a
 *                           deliberate degraded posture.
 *
 * A deliberate degraded posture is permitted only with the written acceptance
 * AI_GOVERNANCE_ACCEPT_PERMISSIVE=true, which produces one prominent structured
 * warning naming the accepted risk (the AUDIT_SEAL_ACCEPT_UNSEALED shape).
 * Without it the process REFUSES TO BOOT (the RLS_ENFORCE shape).
 *
 * ── Ordering of the flags (the B20 hazard, resolved) ─────────────────────────
 * Evaluated strictly in this order; the first matching line decides:
 *   1. NODE_ENV != production                         → no-op (warn nothing, refuse nothing).
 *   2. both gates strict (by value or by default)     → boots silently. Acceptance is ignored.
 *   3. AI_GOVERNANCE_REQUIRE_ENFORCE=true             → REFUSES TO BOOT. Outranks acceptance:
 *      the operator who set REQUIRE has said "never permissive here", and an
 *      acceptance left behind cannot override that (the weak-key rule in
 *      auditSealPosture: a present-but-wrong value is refused regardless).
 *   4. AI_GOVERNANCE_ACCEPT_PERMISSIVE=true           → boots, one structured warning per boot.
 *   5. otherwise                                      → REFUSES TO BOOT, naming the gate and both exits
 *      (set the gate strict, or record the acceptance).
 *
 * So the safe sequence for an operator is: set the gate values in the same
 * change window as the artifacts they depend on (B20); never set REQUIRE
 * before the gates are strict, because REQUIRE blocks the boot on any
 * permissive value; and set ACCEPT only as a dated, reviewed decision and
 * clear it when the gate goes strict. Nothing here changes either gate's
 * runtime behaviour — pii-screen.ts resolves its own effective mode (and forces
 * 'block' on an unaccepted production value, as defence in depth); the
 * groundedness gate never runs in a process this module refused.
 *
 * `isGroundednessEnforced` mirrors groundedness.ts::groundednessEnforcedByDefault
 * and is pinned to it by ai-governance-posture.test.ts; `resolvePiiEnforcement`
 * is imported from pii-screen.ts, so there is one PII resolver, not two.
 *
 * @compliance FDA AI/ML guidance (traceability/reproducibility); 21 CFR Part 11.
 * @module server/startup/ai-governance-posture
 */

import {
  acceptsPermissiveAiGovernance,
  isProductionEnv,
  resolvePiiEnforcement,
  type PiiEnforcement,
} from '../services/ai-gateway/pii-screen';

export type { PiiEnforcement };

/** PII screen mode as the gateway will run it (see pii-screen.ts). */
export function readPiiEnforcement(env: NodeJS.ProcessEnv = process.env): PiiEnforcement {
  return resolvePiiEnforcement(env).effective;
}

/**
 * Groundedness gate, resolved EXACTLY as in groundedness.ts
 * `groundednessEnforcedByDefault()` — ON unless explicitly disabled. Duplicated
 * (not imported) so this stays a pure, env-injectable function; the test pins
 * the two to the same table so they cannot drift.
 */
export function isGroundednessEnforced(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.AI_GROUNDEDNESS_ENFORCE;
  if (v === undefined || v === '') return true;
  return !(v === '0' || v.toLowerCase() === 'false' || v.toLowerCase() === 'off');
}

/** True when AI_GOVERNANCE_REQUIRE_ENFORCE carries the explicit value. */
export function requiresStrictAiGovernance(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.AI_GOVERNANCE_REQUIRE_ENFORCE ?? '').trim().toLowerCase() === 'true';
}

export interface AiGovernancePostureLogger {
  warn: (message: string, meta?: Record<string, unknown>) => void;
}

export type AiGovernanceBootPosture = 'strict' | 'permissive-accepted' | 'non-production';

export interface AiGovernancePosture {
  /** Effective PII mode the gateway runs with. */
  piiEnforcement: PiiEnforcement;
  /** Value AI_PII_ENFORCEMENT carries (undefined when unset/unrecognized). */
  piiConfigured: PiiEnforcement | undefined;
  groundednessEnforced: boolean;
  posture: AiGovernanceBootPosture;
}

/** The permissive clauses, if any, for a resolved environment. */
function permissiveClauses(env: NodeJS.ProcessEnv): string[] {
  const pii = resolvePiiEnforcement(env);
  const clauses: string[] = [];
  if (pii.configured !== undefined && pii.configured !== 'block') {
    clauses.push(
      `AI_PII_ENFORCEMENT is "${pii.configured}" (not "block") — ` +
        (pii.configured === 'audit'
          ? 'PHI/PII detections are recorded, and dispatch is not refused on this setting'
          : 'PHI/PII screening is disabled entirely'),
    );
  }
  if (!isGroundednessEnforced(env)) {
    clauses.push(
      'AI_GROUNDEDNESS_ENFORCE is off — low-citation AI content is scored but not blocked on accept',
    );
  }
  return clauses;
}

/**
 * Production boot gate for the AI-governance posture. See the ordering table
 * in the module header. No-op outside production.
 *
 * @returns the resolved posture.
 * @throws in production when a gate is explicitly permissive and either
 *         AI_GOVERNANCE_REQUIRE_ENFORCE=true is set or no acceptance is recorded.
 */
export function assertAiGovernancePostureForProduction(
  env: NodeJS.ProcessEnv = process.env,
  logger: AiGovernancePostureLogger = { warn: (m, meta) => console.warn(m, meta ?? '') },
): AiGovernancePosture {
  const pii = resolvePiiEnforcement(env);
  const groundednessEnforced = isGroundednessEnforced(env);
  const base = { piiEnforcement: pii.effective, piiConfigured: pii.configured, groundednessEnforced };

  // 1. Non-production: nothing to enforce, nothing to warn.
  if (!isProductionEnv(env)) return { ...base, posture: 'non-production' };

  // 2. Strict by value or by default.
  const clauses = permissiveClauses(env);
  if (clauses.length === 0) return { ...base, posture: 'strict' };

  const message =
    'AI-governance gate(s) explicitly permissive in production: ' +
    clauses.join('; ') +
    '. The production defaults are AI_PII_ENFORCEMENT=block and AI_GROUNDEDNESS_ENFORCE=1 — ' +
    'leave both unset (or set them strict) to run the real-PHI / paying-customer posture.';

  // 3. REQUIRE outranks ACCEPT.
  if (requiresStrictAiGovernance(env)) {
    throw new Error(
      `[ai-governance-posture] FAIL-CLOSED: ${message} AI_GOVERNANCE_REQUIRE_ENFORCE=true forbids ` +
        'a permissive gate here regardless of AI_GOVERNANCE_ACCEPT_PERMISSIVE.',
    );
  }

  // 5. No written acceptance → refuse.
  if (!acceptsPermissiveAiGovernance(env)) {
    throw new Error(
      `[ai-governance-posture] REFUSING TO BOOT: ${message} To run a permissive gate ` +
        'intentionally (e.g. a synthetic-data pilot), set AI_GOVERNANCE_ACCEPT_PERMISSIVE=true ' +
        'to record the accepted risk explicitly.',
    );
  }

  // 4. Accepted: permitted, but visible — one structured warning per boot.
  logger.warn(`⚠️  ${message}`, {
    controlledBy: 'AI_PII_ENFORCEMENT / AI_GROUNDEDNESS_ENFORCE',
    acceptedVia: 'AI_GOVERNANCE_ACCEPT_PERMISSIVE=true',
    acceptedRisk: clauses,
    remediation:
      'set the gate(s) strict (or unset them) and clear AI_GOVERNANCE_ACCEPT_PERMISSIVE; ' +
      'set AI_GOVERNANCE_REQUIRE_ENFORCE=true once strict so it cannot regress',
  });
  return { ...base, posture: 'permissive-accepted' };
}
