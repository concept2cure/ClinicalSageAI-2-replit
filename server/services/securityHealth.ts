/**
 * Security-posture self-test.
 *
 * Runs a panel of named checks that verify the security work landed in
 * this branch is actually engaged in the running process. Used by:
 *
 *   - GET /api/admin/security-health  → admin-only on-demand diagnostic
 *   - server/startup/security-self-test.ts → boot-time gate that
 *     refuses to start in production when a critical check fails
 *
 * Each check returns a `SecurityCheckResult` with a clear status
 * (pass / warn / fail / skipped) and a short reason. Operators read
 * the JSON, ops dashboards alert on `fail`, regulators inspect the
 * audit-shape and chain-integrity rows after deployment.
 *
 * Checks (current panel):
 *
 *   jwt_secret_strength        — JWT_SECRET (or env-variant) ≥32 chars
 *   csp_middleware_active      — helmet emits CSP with a nonce
 *   clamav_connectivity        — clamd reachable + responding (when
 *                                CLAMAV_HOST is set). Sends the EICAR
 *                                test signature and expects a FOUND
 *                                reply, confirming both reachability
 *                                AND detection.
 *   audit_chain_integrity      — hash chain of audit_events is intact
 *                                from the first row to the latest.
 *   audit_event_coverage       — every action label the branch added
 *                                has at least one row in the last 24h
 *                                (so an inspector can see they're
 *                                wired). A check that returns warn
 *                                if a category is empty just means
 *                                the platform hasn't exercised that
 *                                event in the window — not a bug.
 *   cer_report_migration       — counts files at the legacy
 *                                `data/cer_reports/*.json` path. Any
 *                                count > 0 means the per-tenant move
 *                                hasn't happened yet.
 *
 * Each check has a `critical` flag. Critical checks failing fail
 * production boot; non-critical only emit a warn-level log entry.
 */

import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Pool } from 'pg';
import { createScopedLogger } from '../utils/logger';
import { scanBuffer } from '../utils/virusScan';
import { isJwtRotationInProgress } from '../utils/jwtVerify';

const log = createScopedLogger('security-health');

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skipped';

export interface SecurityCheckResult {
  name: string;
  status: CheckStatus;
  /** True when a fail should block boot / be paged on. */
  critical: boolean;
  reason?: string;
  details?: Record<string, unknown>;
  durationMs: number;
}

export interface SecurityHealthReport {
  overall: 'healthy' | 'degraded' | 'failing';
  checkedAt: string;
  checks: SecurityCheckResult[];
}

// ---------------------------------------------------------------------------
// EICAR — the standard antivirus-test string. NOT a real virus; every
// AV vendor must detect it. Used to verify clamd is actually scanning
// (not just reachable).
// ---------------------------------------------------------------------------

const EICAR_TEST_STRING =
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

const NEW_AUDIT_ACTIONS = [
  'user_login',
  'user_logout',
  'tenant_impersonation_attempt',
  'document_view',
  'document_download',
  'api_key_created',
  'api_key_revoked',
  'csrf_validation_failed',
];

// ---------------------------------------------------------------------------
// JWT secret strength
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// JWT rotation visibility
// ---------------------------------------------------------------------------

async function checkJwtRotation(): Promise<SecurityCheckResult> {
  const start = Date.now();
  const inProgress = isJwtRotationInProgress();
  const durationMs = Date.now() - start;

  // Non-critical: rotation-in-progress is the normal operational
  // state during a planned rotation, not a fault. We surface it as
  // warn so dashboards can see "yes, rotation is in flight" without
  // paging anyone. An operator who left the previous secret set
  // beyond the 24h access-token TTL will see this warning and clean
  // it up.
  if (inProgress) {
    return {
      name: 'jwt_rotation_status',
      status: 'warn',
      critical: false,
      reason: 'rotation in progress — clear JWT_SECRET_PREVIOUS after access-token TTL elapses',
      durationMs,
    };
  }
  return {
    name: 'jwt_rotation_status',
    status: 'pass',
    critical: false,
    durationMs,
  };
}

async function checkJwtSecretStrength(): Promise<SecurityCheckResult> {
  const start = Date.now();
  const suffix = process.env.NODE_ENV === 'production' ? 'PROD' : 'DEV';
  const envVar = `JWT_SECRET_${suffix}`;
  const secret = process.env[envVar] ?? process.env.JWT_SECRET;
  const durationMs = Date.now() - start;

  if (!secret) {
    return {
      name: 'jwt_secret_strength',
      status: 'fail',
      critical: true,
      reason: `no JWT secret found (looked for ${envVar} and JWT_SECRET)`,
      durationMs,
    };
  }
  if (secret.length < 32) {
    return {
      name: 'jwt_secret_strength',
      status: 'fail',
      critical: true,
      reason: 'JWT secret shorter than 32 characters',
      details: { length: secret.length },
      durationMs,
    };
  }
  return {
    name: 'jwt_secret_strength',
    status: 'pass',
    critical: true,
    details: { length: secret.length, source: process.env[envVar] ? envVar : 'JWT_SECRET' },
    durationMs,
  };
}

// ---------------------------------------------------------------------------
// CSP middleware active
// ---------------------------------------------------------------------------

async function checkCspMiddleware(): Promise<SecurityCheckResult> {
  const start = Date.now();
  try {
    // Lazy-import so this module can be referenced from places that
    // don't want to drag in helmet at module-init.
    const { cspNonce, securityHeaders } = await import('../middleware/enterprise-security');

    // Synthesize a tiny req/res pair and run the nonce middleware to
    // verify a nonce is produced. helmet's CSP header itself is
    // pinned by server/middleware/__tests__/csp-nonce.test.ts;
    // here we confirm only that the middleware is the one this
    // process is using (not a stub from a missed import).
    const fakeReq: any = {};
    const fakeRes: any = { locals: {}, setHeader() {}, getHeader() {} };
    cspNonce(fakeReq, fakeRes, () => {});

    const nonce = (fakeRes.locals as Record<string, unknown>).cspNonce;
    const durationMs = Date.now() - start;
    if (typeof nonce === 'string' && nonce.length >= 16) {
      return {
        name: 'csp_middleware_active',
        status: 'pass',
        critical: true,
        details: { nonceLength: nonce.length, hasSecurityHeaders: typeof securityHeaders === 'function' },
        durationMs,
      };
    }
    return {
      name: 'csp_middleware_active',
      status: 'fail',
      critical: true,
      reason: 'cspNonce middleware did not produce a nonce',
      durationMs,
    };
  } catch (err) {
    return {
      name: 'csp_middleware_active',
      status: 'fail',
      critical: true,
      reason: `import failed: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    };
  }
}

// ---------------------------------------------------------------------------
// ClamAV connectivity
// ---------------------------------------------------------------------------

async function checkClamavConnectivity(): Promise<SecurityCheckResult> {
  const start = Date.now();

  if (!process.env.CLAMAV_HOST) {
    return {
      name: 'clamav_connectivity',
      status: 'skipped',
      critical: false,
      reason: 'CLAMAV_HOST not set — virus scan bypassed (intentional in non-prod)',
      durationMs: Date.now() - start,
    };
  }

  // Send the EICAR test signature. A real clamd MUST detect it and
  // return FOUND. Anything else is a misconfiguration we need ops to
  // see immediately.
  try {
    const result = await scanBuffer(Buffer.from(EICAR_TEST_STRING));
    const durationMs = Date.now() - start;

    if (!result.scanned) {
      return {
        name: 'clamav_connectivity',
        status: 'fail',
        critical: true,
        reason: `clamd unreachable: ${result.reason ?? 'unknown'}`,
        durationMs,
      };
    }
    if (result.clean) {
      // Scan ran but didn't detect EICAR — daemon is up but signature
      // DB is broken or stale.
      return {
        name: 'clamav_connectivity',
        status: 'fail',
        critical: true,
        reason: 'clamd reachable but did NOT detect EICAR test — signature database broken',
        durationMs,
      };
    }
    return {
      name: 'clamav_connectivity',
      status: 'pass',
      critical: true,
      details: { signature: result.signature },
      durationMs,
    };
  } catch (err) {
    return {
      name: 'clamav_connectivity',
      status: 'fail',
      critical: true,
      reason: `scan threw: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    };
  }
}

// ---------------------------------------------------------------------------
// Audit chain integrity
// ---------------------------------------------------------------------------

async function checkAuditChainIntegrity(pool: Pool): Promise<SecurityCheckResult> {
  const start = Date.now();
  try {
    const { getTamperProofAuditLog } = await import('../lib/tamper-proof-audit');
    const audit = getTamperProofAuditLog(pool);
    const result = await audit.verifyChain();
    const durationMs = Date.now() - start;

    if (result.valid) {
      return {
        name: 'audit_chain_integrity',
        status: 'pass',
        critical: true,
        details: {
          entriesVerified: result.entriesVerified,
        },
        durationMs,
      };
    }
    return {
      name: 'audit_chain_integrity',
      status: 'fail',
      critical: true,
      reason: result.invalidReason ?? 'chain verification reported invalid',
      details: {
        firstInvalidEntry: result.firstInvalidEntry,
        entriesVerified: result.entriesVerified,
      },
      durationMs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Missing table is a soft failure in fresh environments — Part 11
    // setup is a separate migration. Anything else is a hard fail.
    if (/relation .* does not exist/i.test(message) || /AUDIT_TRAIL_ENABLED/i.test(message)) {
      return {
        name: 'audit_chain_integrity',
        status: 'warn',
        critical: false,
        reason: `audit log unavailable: ${message}`,
        durationMs: Date.now() - start,
      };
    }
    return {
      name: 'audit_chain_integrity',
      status: 'fail',
      critical: true,
      reason: `verification threw: ${message}`,
      durationMs: Date.now() - start,
    };
  }
}

// ---------------------------------------------------------------------------
// Audit event coverage (last 24h)
// ---------------------------------------------------------------------------

async function checkAuditEventCoverage(pool: Pool): Promise<SecurityCheckResult> {
  const start = Date.now();
  try {
    const { rows } = await pool.query<{ event_type: string; count: string }>(
      `SELECT event_type, COUNT(*)::text AS count
       FROM audit_events
       WHERE timestamp > NOW() - INTERVAL '24 hours'
       GROUP BY event_type`,
    );
    const seen = new Map<string, number>();
    for (const row of rows) seen.set(row.event_type, Number(row.count));

    const missing = NEW_AUDIT_ACTIONS.filter(a => !seen.has(a));
    const durationMs = Date.now() - start;

    if (missing.length === 0) {
      return {
        name: 'audit_event_coverage',
        status: 'pass',
        critical: false,
        details: {
          counts: Object.fromEntries(seen),
        },
        durationMs,
      };
    }

    // Missing event types mean those flows haven't been exercised in
    // the window. Not a bug — just signal. warn level.
    return {
      name: 'audit_event_coverage',
      status: 'warn',
      critical: false,
      reason: `${missing.length} event type(s) have no rows in last 24h`,
      details: { missing, counts: Object.fromEntries(seen) },
      durationMs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation .* does not exist/i.test(message)) {
      return {
        name: 'audit_event_coverage',
        status: 'warn',
        critical: false,
        reason: 'audit_events table not provisioned',
        durationMs: Date.now() - start,
      };
    }
    return {
      name: 'audit_event_coverage',
      status: 'fail',
      critical: false,
      reason: `query failed: ${message}`,
      durationMs: Date.now() - start,
    };
  }
}

// ---------------------------------------------------------------------------
// CER report tenant migration
// ---------------------------------------------------------------------------

async function checkCerReportMigration(): Promise<SecurityCheckResult> {
  const start = Date.now();
  const reportDir = resolve(process.cwd(), 'data', 'cer_reports');

  if (!existsSync(reportDir)) {
    return {
      name: 'cer_report_migration',
      status: 'pass',
      critical: false,
      reason: 'no CER reports directory yet — fresh deployment',
      durationMs: Date.now() - start,
    };
  }

  try {
    const entries = readdirSync(reportDir);
    let flatFiles = 0;
    let tenantDirs = 0;
    for (const entry of entries) {
      const full = join(reportDir, entry);
      const st = statSync(full);
      if (st.isDirectory() && entry.startsWith('org-')) {
        tenantDirs += 1;
      } else if (st.isFile() && entry.endsWith('.json')) {
        flatFiles += 1;
      }
    }
    const durationMs = Date.now() - start;

    if (flatFiles === 0) {
      return {
        name: 'cer_report_migration',
        status: 'pass',
        critical: false,
        details: { tenantDirs, flatFiles },
        durationMs,
      };
    }
    return {
      name: 'cer_report_migration',
      status: 'warn',
      critical: false,
      reason: `${flatFiles} legacy report(s) still in flat namespace — run scripts/migrate-cer-reports.ts`,
      details: { flatFiles, tenantDirs },
      durationMs,
    };
  } catch (err) {
    return {
      name: 'cer_report_migration',
      status: 'warn',
      critical: false,
      reason: `directory scan failed: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    };
  }
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function runSecurityHealthChecks(pool: Pool): Promise<SecurityHealthReport> {
  const results = await Promise.all([
    checkJwtSecretStrength(),
    checkJwtRotation(),
    checkCspMiddleware(),
    checkClamavConnectivity(),
    checkAuditChainIntegrity(pool),
    checkAuditEventCoverage(pool),
    checkCerReportMigration(),
  ]);

  const hasFailCritical = results.some(r => r.status === 'fail' && r.critical);
  const hasAnyFail = results.some(r => r.status === 'fail');
  const hasWarn = results.some(r => r.status === 'warn');

  const overall: SecurityHealthReport['overall'] = hasFailCritical
    ? 'failing'
    : hasAnyFail || hasWarn
      ? 'degraded'
      : 'healthy';

  return {
    overall,
    checkedAt: new Date().toISOString(),
    checks: results,
  };
}

/**
 * Boot-time variant. Returns the report and writes a one-line summary
 * to the structured logger. Callers (server/startup) decide whether
 * to exit on `failing`.
 */
export async function runSecuritySelfTest(pool: Pool): Promise<SecurityHealthReport> {
  const report = await runSecurityHealthChecks(pool);
  const summary = report.checks
    .map(c => `${c.name}=${c.status}${c.reason ? `(${c.reason})` : ''}`)
    .join(' ');
  if (report.overall === 'healthy') {
    log.info('Security self-test passed', { summary });
  } else if (report.overall === 'failing') {
    log.error('Security self-test FAILED', { summary, report });
  } else {
    log.warn('Security self-test degraded', { summary });
  }
  return report;
}

/** Test-only export of the individual checks. */
export const __testing = {
  checkJwtSecretStrength,
  checkJwtRotation,
  checkCspMiddleware,
  checkClamavConnectivity,
  checkAuditChainIntegrity,
  checkAuditEventCoverage,
  checkCerReportMigration,
  NEW_AUDIT_ACTIONS,
  EICAR_TEST_STRING,
};
