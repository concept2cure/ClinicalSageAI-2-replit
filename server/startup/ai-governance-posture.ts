/**
 * AI-governance production-visibility guardrail.
 *
 * The two AI content-safety gates are deliberate progressive-rollout toggles,
 * default-permissive so pilot/dev flows are not broken by the heuristics' false
 * positives:
 *   - AI_PII_ENFORCEMENT (server/services/ai-gateway/pii-screen.ts) defaults to
 *     'audit' — in NON-PRODUCTION, PHI/PII is detected and recorded but not
 *     blocked. In production the last-mile placement contract
 *     (sensitive-placement-policy.ts) is enforced at dispatch regardless of
 *     this setting; the toggle only governs non-production behavior, so the
 *     warning below is about posture hygiene, not an open dispatch path.
 *   - AI_GROUNDEDNESS_ENFORCE (server/services/ai-governance/groundedness.ts) is
 *     ON by default as of 2026-08-13 — low-citation AI content is blocked on
 *     accept unless a human acknowledges it. It stays listed here because it
 *     can still be turned OFF per deployment, and an off gate in production is
 *     what this module exists to surface.
 *
 * Running production with either gate permissive is a valid rollout state, but —
 * exactly like the RLS enforcement and audit-trail postures
 * (`assertRlsEnforcementForProduction` / `assertAuditTrailForProduction`) — it
 * must be VISIBLE rather than silent. This module adds the boot-time guardrail
 * those gates were missing: a loud warning when the app boots in production with
 * either gate permissive, and a hard fail-closed ONLY when the operator
 * explicitly opts in via `AI_GOVERNANCE_REQUIRE_ENFORCE=true`.
 *
 * Default behaviour is unchanged (warn, do not block boot). This does NOT change
 * either gate's runtime behaviour — it only surfaces the posture at boot. The env
 * resolution here mirrors the canonical getters `getPiiEnforcement()` and
 * `groundednessEnforcedByDefault()`; it is duplicated (not imported) so the
 * guardrail is a pure, env-injectable function like its sibling posture asserts.
 *
 * @compliance FDA AI/ML guidance (traceability/reproducibility); 21 CFR Part 11.
 * @module server/startup/ai-governance-posture
 */

export type PiiEnforcement = 'off' | 'audit' | 'block';

/** PII screen enforcement, resolved as in pii-screen.ts `getPiiEnforcement()`. */
export function readPiiEnforcement(env: NodeJS.ProcessEnv = process.env): PiiEnforcement {
  const raw = (env.AI_PII_ENFORCEMENT || 'audit').trim().toLowerCase();
  return raw === 'off' || raw === 'block' ? raw : 'audit';
}

/**
 * Groundedness gate default, resolved EXACTLY as in groundedness.ts
 * `groundednessEnforcedByDefault()` — ON unless explicitly disabled.
 *
 * This mirror must track that function. It is duplicated (not imported) so the
 * posture check stays a pure, env-injectable function, which means the two can
 * drift — and a drift here is not cosmetic: this is the module that TELLS the
 * operator what the posture is. Left at the old `v === '1'` logic it would have
 * reported "AI_GROUNDEDNESS_ENFORCE is off" on a deployment where the gate was
 * enforcing, which is the precise failure this codebase keeps producing.
 * ai-governance-posture.test.ts pins the two to the same table.
 */
export function isGroundednessEnforced(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.AI_GROUNDEDNESS_ENFORCE;
  if (v === undefined || v === '') return true;
  return !(v === '0' || v.toLowerCase() === 'false' || v.toLowerCase() === 'off');
}

export interface AiGovernancePostureLogger {
  warn: (message: string) => void;
}

export interface AiGovernancePosture {
  piiEnforcement: PiiEnforcement;
  groundednessEnforced: boolean;
}

/**
 * Surface (or, opt-in, block) a production boot with either AI-governance gate
 * in its permissive default. Mirrors `assertRlsEnforcementForProduction` /
 * `assertAuditTrailForProduction`. No-op outside production and when both gates
 * are strict.
 *
 * @returns the resolved posture.
 * @throws when `AI_GOVERNANCE_REQUIRE_ENFORCE=true` and a gate is permissive in production.
 */
export function assertAiGovernancePostureForProduction(
  env: NodeJS.ProcessEnv = process.env,
  logger: AiGovernancePostureLogger = { warn: (m) => console.warn(m) },
): AiGovernancePosture {
  const piiEnforcement = readPiiEnforcement(env);
  const groundednessEnforced = isGroundednessEnforced(env);
  const isProduction = (env.NODE_ENV ?? '').toLowerCase() === 'production';

  const permissive: string[] = [];
  if (piiEnforcement !== 'block') {
    permissive.push(
      `AI_PII_ENFORCEMENT is "${piiEnforcement}" (not "block") — in production the ` +
        'sensitive-data placement contract is still enforced at dispatch (PHI/PII cannot ' +
        'reach a provider outside AI_PROVIDER_PLACEMENT_APPROVALS); in non-production ' +
        (piiEnforcement === 'audit'
          ? 'this setting records detections without blocking'
          : 'this setting disables the screen entirely'),
    );
  }
  if (!groundednessEnforced) {
    permissive.push(
      'AI_GROUNDEDNESS_ENFORCE is off — low-citation AI content is scored but not ' +
        'blocked on accept',
    );
  }

  if (!isProduction || permissive.length === 0) {
    return { piiEnforcement, groundednessEnforced };
  }

  const message =
    'AI-governance gates are permissive in production: ' +
    permissive.join('; ') +
    '. For a real-PHI / paying-customer (G2) posture set AI_PII_ENFORCEMENT=block ' +
    'and AI_GROUNDEDNESS_ENFORCE=1 (see .env.example).';

  if ((env.AI_GOVERNANCE_REQUIRE_ENFORCE ?? '').trim().toLowerCase() === 'true') {
    // Operator opted into fail-closed: refuse to boot with a permissive gate.
    throw new Error(`[ai-governance-posture] FAIL-CLOSED: ${message}`);
  }

  logger.warn(`⚠️  ${message}`);
  return { piiEnforcement, groundednessEnforced };
}
