/**
 * Boot-time security self-test.
 *
 * Called from server/index.ts before HTTP listen. Runs the
 * `runSecuritySelfTest()` panel and decides whether to:
 *
 *   - Continue boot (overall === 'healthy' or 'degraded')
 *   - Exit the process with code 1 (overall === 'failing' AND
 *     production AND not opted out via SECURITY_SELF_TEST_NONBLOCKING)
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
 * Opt-out: SECURITY_SELF_TEST_NONBLOCKING=true keeps the test
 * running (so the log line still appears) but skips the
 * process.exit. Use only when an operator has explicitly accepted
 * a temporarily-degraded posture (e.g. clamd outage during a
 * planned maintenance window).
 */

import type { Pool } from 'pg';
import { runSecuritySelfTest } from '../services/securityHealth';
import { createScopedLogger } from '../utils/logger';

const log = createScopedLogger('security-self-test');

const NONBLOCKING_ENV = 'SECURITY_SELF_TEST_NONBLOCKING';

export async function runBootSecuritySelfTest(pool: Pool): Promise<void> {
  const report = await runSecuritySelfTest(pool);

  if (report.overall !== 'failing') return;

  if (process.env.NODE_ENV !== 'production') {
    log.warn(
      'Security self-test FAILED in non-production — would have blocked boot in prod',
    );
    return;
  }

  if (process.env[NONBLOCKING_ENV] === 'true') {
    log.error(
      `Security self-test FAILED but ${NONBLOCKING_ENV} is set — continuing boot anyway`,
      { report },
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
  // eslint-disable-next-line no-console
  console.error(
    `[security-self-test] FAILED. Critical checks:\n` +
      failures.map(f => `  - ${f.name}: ${f.reason ?? 'no reason'}`).join('\n') +
      `\nSet ${NONBLOCKING_ENV}=true to override (NOT recommended).`,
  );
  process.exit(1);
}
