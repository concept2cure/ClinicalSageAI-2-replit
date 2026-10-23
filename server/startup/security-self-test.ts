/**
 * Boot-time security self-test.
 *
 * Called from server/index.ts before HTTP listen. Runs the
 * `runSecuritySelfTest()` panel and decides whether to:
 *
 *   - Continue boot (overall === 'healthy' or 'degraded')
 *   - Exit the process with code 1 (overall === 'failing' AND
 *     production)
 *
 * Production must NOT serve traffic with broken security posture —
 * a missing JWT secret, unreachable clamd, or broken audit chain
 * are the kinds of regressions that warrant page-able failure at
 * boot rather than silent operation.
 *
 * In non-production environments the test still runs and logs but
 * never blocks startup. Dev iterations frequently lack a real
 * clamd or have a stale audit table; we don't want every dev boot
 * to die.
 *
 * No production opt-out. SECURITY_SELF_TEST_NONBLOCKING=true used to
 * skip the process.exit; one environment line then let production boot
 * with every critical failure at once (no virus scanner included).
 * startup/env.ts now refuses it at boot in production (MR-08), and this
 * gate no longer reads it there. Outside production it changes nothing:
 * the self-test never blocks a non-production boot.
 */

import type { Pool } from 'pg';
import { runSecuritySelfTest } from '../services/securityHealth';
import { createScopedLogger } from '../utils/logger';

const log = createScopedLogger('security-self-test');

export async function runBootSecuritySelfTest(pool: Pool): Promise<void> {
  const report = await runSecuritySelfTest(pool);

  if (report.overall !== 'failing') return;

  if (process.env.NODE_ENV !== 'production') {
    log.warn(
      'Security self-test FAILED in non-production — would have blocked boot in prod',
    );
    return;
  }

  // Surface the per-check failures clearly before exit so the boot
  // log shows operators exactly what's wrong without grepping the
  // structured JSON.
  const failures = report.checks.filter(c => c.status === 'fail' && c.critical);
  log.error('Security self-test FAILED — refusing to start in production', {
    overall: report.overall,
    failures: failures.map(f => ({ name: f.name, reason: f.reason })),
  });
   
  console.error(
    `[security-self-test] FAILED. Critical checks:\n` +
      failures.map(f => `  - ${f.name}: ${f.reason ?? 'no reason'}`).join('\n'),
  );
  process.exit(1);
}
