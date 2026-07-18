/**
 * Audit-trail production-visibility guardrail.
 *
 * The global tamper-proof audit interceptor (`applyAuditTrailMiddleware`,
 * `server/startup/audit-trail.ts`) and the chain-integrity monitor
 * (`server/startup/services.ts`) are both gated on `AUDIT_TRAIL_ENABLED=true`
 * and are default-off — the correct pre-provisioning posture, because the
 * tamper-proof chain needs its `audit.tamper_proof_log` table and
 * `AUDIT_HMAC_SECRET` provisioned before it can run (see the operator runbook in
 * audit-trail.ts).
 *
 * Running production with the audit trail off is a deliberate rollout state, but
 * — exactly like the RLS enforcement posture (`server/db/rlsEnforcement.ts`,
 * `assertRlsEnforcementForProduction`) — it must be VISIBLE rather than silent.
 * This module adds the boot-time guardrail the audit trail was missing: a loud
 * warning when the app boots in production with the audit trail inactive, and a
 * hard fail-closed only when the operator explicitly opts in via
 * `AUDIT_REQUIRE_ENFORCE=true`. Default behaviour is unchanged (warn, do not
 * block boot).
 *
 * This does NOT change the gating flag or the interceptor's behaviour — it only
 * surfaces the audit posture at boot.
 *
 * @compliance FDA 21 CFR Part 11 §11.10(e).
 * @module server/startup/audit-enforcement
 */

/** True when the global audit trail is switched on (mirrors the interceptor's gate). */
export function isAuditTrailActive(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AUDIT_TRAIL_ENABLED === 'true';
}

export interface AuditTrailPostureLogger {
  warn: (message: string) => void;
}

/**
 * Surface (or, opt-in, block) a production boot with the tamper-proof audit
 * trail inactive. Mirrors `assertRlsEnforcementForProduction`.
 *
 * @returns whether the audit trail is active.
 * @throws when `AUDIT_REQUIRE_ENFORCE=true` and the trail is inactive in production.
 */
export function assertAuditTrailForProduction(
  env: NodeJS.ProcessEnv = process.env,
  logger: AuditTrailPostureLogger = { warn: (m) => console.warn(m) },
): boolean {
  const active = isAuditTrailActive(env);
  const isProduction = (env.NODE_ENV ?? '').toLowerCase() === 'production';
  if (!isProduction || active) return active;

  const message =
    'AUDIT_TRAIL_ENABLED is not "true" in production — the tamper-proof audit ' +
    'interceptor is NOT recording mutations and the chain-integrity monitor is ' +
    'not running (21 CFR 11 §11.10(e) audit trail inactive). Provision the ' +
    '`audit.tamper_proof_log` table + AUDIT_HMAC_SECRET, then set ' +
    'AUDIT_TRAIL_ENABLED=true (operator runbook in server/startup/audit-trail.ts).';

  if ((env.AUDIT_REQUIRE_ENFORCE ?? '').trim().toLowerCase() === 'true') {
    // Operator opted into fail-closed: refuse to boot with the audit trail off.
    throw new Error(`[audit-enforcement] FAIL-CLOSED: ${message}`);
  }

  logger.warn(`⚠️  ${message}`);
  return active;
}
