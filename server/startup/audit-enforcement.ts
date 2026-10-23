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
 * This module adds the boot-time guardrail the audit trail was missing: in
 * production a process with the audit trail inactive refuses to boot. Enforce
 * is the production default since 2026-10-22 (MR-03 SEC-18, decision P-43);
 * only an explicit `AUDIT_REQUIRE_ENFORCE=false` turns it into a loud warning,
 * and the hosted deployment refuses that value at boot (startup/env.ts).
 * Outside production nothing is enforced unless `AUDIT_REQUIRE_ENFORCE=true`.
 *
 * This does NOT change the gating flag or the interceptor's behaviour — it only
 * surfaces the audit posture at boot.
 *
 * ── Immutability triggers (2026-09-25, security audit DP-06, plan item P0-9a) ──
 * The audit stores are append-only because database triggers refuse UPDATE and
 * DELETE on them. Nothing at boot checked that those triggers existed, so a
 * database restored from an older dump, a fresh install booted before
 * `deploy-migrate`, or an `ALTER TABLE … DISABLE TRIGGER` left the stores
 * writable behind a green boot. `assertAuditImmutabilityForProduction` runs the
 * catalog check (`server/services/audit/audit-immutability-triggers.ts`) once
 * the database is reachable (wired from `verifyDatabaseConnection`,
 * `server/startup/services.ts`). Unlike the trail flag above, a missing trigger
 * is NOT a rollout state: production refuses to boot regardless of
 * `AUDIT_REQUIRE_ENFORCE`. What enforcement adds is fail-closed on "could not
 * check" — the probe failing, or the daily integrity sweep being switched off —
 * where `AUDIT_REQUIRE_ENFORCE=false` only warns.
 *
 * @compliance FDA 21 CFR Part 11 §11.10(e).
 * @module server/startup/audit-enforcement
 */

import { runWithSystemTenantScope } from '../db/tenantStore';
import {
  assertAuditImmutabilityTriggers,
  describeAuditImmutabilityGap,
  type AuditImmutabilityTriggerReport,
  type TriggerCatalogClient,
} from '../services/audit/audit-immutability-triggers';

/** True when the global audit trail is switched on (mirrors the interceptor's gate). */
export function isAuditTrailActive(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AUDIT_TRAIL_ENABLED === 'true';
}

function isProductionEnv(env: NodeJS.ProcessEnv): boolean {
  return (env.NODE_ENV ?? '').toLowerCase() === 'production';
}

/** On in production unless written `false` (P-43); elsewhere only when written `true`. */
function requiresEnforce(env: NodeJS.ProcessEnv): boolean {
  const value = (env.AUDIT_REQUIRE_ENFORCE ?? '').trim().toLowerCase();
  if (value === 'true') return true;
  return isProductionEnv(env) && value !== 'false';
}

export interface AuditTrailPostureLogger {
  warn: (message: string, context?: unknown) => void;
  info?: (message: string, context?: unknown) => void;
}

const consoleLogger: AuditTrailPostureLogger = {
  warn: (message, context) => (context === undefined ? console.warn(message) : console.warn(message, context)),
  info: (message, context) => (context === undefined ? console.info(message) : console.info(message, context)),
};

/**
 * Block (or, with AUDIT_REQUIRE_ENFORCE=false, surface) a production boot with the tamper-proof audit
 * trail inactive. Mirrors `assertRlsEnforcementForProduction`.
 *
 * @returns whether the audit trail is active.
 * @throws in production when the trail is inactive, unless `AUDIT_REQUIRE_ENFORCE=false`.
 */
export function assertAuditTrailForProduction(
  env: NodeJS.ProcessEnv = process.env,
  logger: AuditTrailPostureLogger = consoleLogger,
): boolean {
  const active = isAuditTrailActive(env);
  const isProduction = isProductionEnv(env);
  if (!isProduction || active) return active;

  const message =
    'AUDIT_TRAIL_ENABLED is not "true" in production — the tamper-proof audit ' +
    'interceptor is NOT recording mutations and the chain-integrity monitor is ' +
    'not running (21 CFR 11 §11.10(e) audit trail inactive). Provision the ' +
    '`audit.tamper_proof_log` table + AUDIT_HMAC_SECRET, then set ' +
    'AUDIT_TRAIL_ENABLED=true (operator runbook in server/startup/audit-trail.ts).';

  if (requiresEnforce(env)) {
    // Fail closed, the production default: refuse to boot with the audit trail off.
    throw new Error(`[audit-enforcement] FAIL-CLOSED: ${message}`);
  }

  logger.warn(`⚠️  ${message}`);
  return active;
}

// ── Daily integrity sweep posture ─────────────────────────────────────────────

export interface AuditChainSweepPosture {
  enabled: boolean;
  controlledBy: 'ENABLE_AUDIT_CHAIN_CHECK';
  reason: string;
}

/**
 * The gating matrix of the daily audit integrity sweep
 * (`server/jobs/auditChainIntegritySweep.ts`), in one place so the job that
 * schedules it and the boot gate that requires it cannot disagree:
 *
 *   - ENABLE_AUDIT_CHAIN_CHECK=false → never schedule (explicit opt-out)
 *   - ENABLE_AUDIT_CHAIN_CHECK=true  → always schedule
 *   - unset, NODE_ENV=production     → schedule (default ON at GA)
 *   - unset, elsewhere               → schedule only when the audit trail is
 *                                       active (AUDIT_TRAIL_ENABLED=true)
 */
export function resolveAuditChainSweepPosture(
  env: NodeJS.ProcessEnv = process.env,
): AuditChainSweepPosture {
  const controlledBy = 'ENABLE_AUDIT_CHAIN_CHECK' as const;
  const explicit = env.ENABLE_AUDIT_CHAIN_CHECK;
  if (explicit === 'false') {
    return { enabled: false, controlledBy, reason: 'explicitly disabled (ENABLE_AUDIT_CHAIN_CHECK=false)' };
  }
  if (explicit === 'true') {
    return { enabled: true, controlledBy, reason: 'explicitly enabled (ENABLE_AUDIT_CHAIN_CHECK=true)' };
  }
  if (isProductionEnv(env)) {
    return { enabled: true, controlledBy, reason: 'production default (Part 11 tamper-evidence monitoring on)' };
  }
  if (isAuditTrailActive(env)) {
    return { enabled: true, controlledBy, reason: 'audit trail active (AUDIT_TRAIL_ENABLED=true)' };
  }
  return {
    enabled: false,
    controlledBy,
    reason: 'opt-in outside production (set ENABLE_AUDIT_CHAIN_CHECK=true or AUDIT_TRAIL_ENABLED=true)',
  };
}

/**
 * With audit enforcement on (the production default; off only with
 * `AUDIT_REQUIRE_ENFORCE=false`), production may not run without the daily
 * tamper-evidence sweep: fail-closed audit posture and
 * `ENABLE_AUDIT_CHAIN_CHECK=false` contradict, and the process refuses rather
 * than picking one silently.
 *
 * @returns the resolved sweep posture.
 * @throws in production when enforcement is on and the sweep is disabled.
 */
export function assertAuditIntegritySweepForProduction(
  env: NodeJS.ProcessEnv = process.env,
): AuditChainSweepPosture {
  const posture = resolveAuditChainSweepPosture(env);
  if (isProductionEnv(env) && requiresEnforce(env) && !posture.enabled) {
    throw new Error(
      `[audit-enforcement] FAIL-CLOSED: audit enforcement is on (AUDIT_REQUIRE_ENFORCE) but the daily audit integrity ` +
        `sweep is ${posture.reason} — with ENABLE_AUDIT_CHAIN_CHECK=false no scheduled ` +
        'tamper-evidence check verifies the audit stores (21 CFR 11 §11.10(e)). Unset ' +
        'ENABLE_AUDIT_CHAIN_CHECK (the production default schedules it) or set it to true.',
    );
  }
  return posture;
}

// ── Immutability triggers ─────────────────────────────────────────────────────

export type AuditImmutabilityTriggerCheck = (
  client: TriggerCatalogClient,
) => Promise<AuditImmutabilityTriggerReport>;

/**
 * Boot gate: every audit store's immutability trigger must be present and
 * enabled before this process serves a request.
 *
 * Production boot matrix:
 *   - every trigger present and enabled        → boots (one info line)
 *   - a trigger missing or disabled            → REFUSES TO BOOT, always
 *     (a writable audit store is not a rollout state AUDIT_REQUIRE_ENFORCE
 *     opts into; it is the absence of the control)
 *   - the check itself could not run           → REFUSES TO BOOT when
 *     AUDIT_REQUIRE_ENFORCE=true; otherwise one loud warning that says the
 *     triggers were NOT verified (never a pass)
 *   - AUDIT_REQUIRE_ENFORCE=true and the daily sweep switched off → REFUSES TO
 *     BOOT before touching the database (assertAuditIntegritySweepForProduction)
 *
 * Outside production every gap is a structured warning and boot continues.
 *
 * The probe reads catalog tables estate-wide and declares its own system
 * tenant scope, so it can run on the shared pool under RLS_ENFORCE=on.
 *
 * @returns the report, or null when the check could not run (and was not fatal).
 */
export async function assertAuditImmutabilityForProduction(
  client: TriggerCatalogClient,
  env: NodeJS.ProcessEnv = process.env,
  logger: AuditTrailPostureLogger = consoleLogger,
  check: AuditImmutabilityTriggerCheck = assertAuditImmutabilityTriggers,
): Promise<AuditImmutabilityTriggerReport | null> {
  assertAuditIntegritySweepForProduction(env);
  const production = isProductionEnv(env);

  let report: AuditImmutabilityTriggerReport;
  try {
    report = await runWithSystemTenantScope('startup:assert-audit-immutability-triggers', () =>
      check(client),
    );
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    const message =
      `the audit immutability triggers could not be verified (${cause}) — this is NOT a pass: ` +
      'the audit stores may be writable and nothing has confirmed otherwise (21 CFR 11 §11.10(e)).';
    if (production && requiresEnforce(env)) {
      throw new Error(`[audit-enforcement] FAIL-CLOSED: ${message}`, { cause: err });
    }
    logger.warn(`⚠️  [audit-enforcement] ${message}`, {
      verified: false,
      controlledBy: 'AUDIT_REQUIRE_ENFORCE',
      remediation:
        'set AUDIT_REQUIRE_ENFORCE=true to refuse boot on an unverifiable posture; fix the database connection or catalog privilege',
    });
    return null;
  }

  if (report.ok) {
    logger.info?.(
      `✅ Audit immutability triggers in force (${report.present}/${report.expected} present and enabled)`,
    );
    return report;
  }

  const gap = describeAuditImmutabilityGap(report);
  if (production) {
    throw new Error(`[audit-enforcement] FAIL-CLOSED: REFUSING TO BOOT — ${gap}`);
  }
  logger.warn(`⚠️  [audit-enforcement] ${gap}`, {
    missing: report.missing,
    disabled: report.disabled,
    tablesAbsent: report.tablesAbsent,
    present: report.present,
    expected: report.expected,
  });
  return report;
}
