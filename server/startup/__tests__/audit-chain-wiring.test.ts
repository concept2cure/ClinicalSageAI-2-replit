import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Regression guards for the audit-chain self-verification wiring.
 *
 * These are static-text assertions on bootstrap source rather than
 * runtime tests, because a true runtime test would require booting the
 * server with a live Postgres pool. The grep-style guards exist to
 * catch the class of bug where someone accidentally rips out the
 * monitor wiring during a refactor — a silent regression that wouldn't
 * be detected until production audit-chain integrity stopped being
 * checked.
 *
 * If you intentionally move the wiring, update these assertions to
 * point at the new home rather than disabling them.
 */

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('audit-chain self-verification wiring', () => {
  const services = read('server/startup/services.ts');
  const shutdown = read('server/startup/shutdown.ts');
  const auditTrail = read('server/startup/audit-trail.ts');

  it('starts the chain monitor in initializeParallelServices', () => {
    expect(services).toContain('chainIntegrityMonitor');
    expect(services).toMatch(/startChainMonitor\s*\(/);
  });

  it('gates the chain monitor by the same AUDIT_TRAIL_ENABLED flag as the audit middleware', () => {
    // Both the monitor and the request-tap middleware must be on or both
    // off. Running one without the other is meaningless: a monitor with
    // no events to verify, or events that never get verified.
    expect(services).toContain("process.env.AUDIT_TRAIL_ENABLED === 'true'");
    expect(auditTrail).toContain("process.env.AUDIT_TRAIL_ENABLED === 'true'");
  });

  it('stops the chain monitor before closing the DB pool on shutdown', () => {
    expect(shutdown).toContain('stopChainMonitor');
    // Order: stopChainMonitor must appear before pool.end() in the file.
    const stopIdx = shutdown.indexOf('stopChainMonitor');
    const poolEndIdx = shutdown.indexOf('ctx.pool) await ctx.pool.end()');
    expect(stopIdx).toBeGreaterThan(0);
    expect(poolEndIdx).toBeGreaterThan(0);
    expect(stopIdx).toBeLessThan(poolEndIdx);
  });

  it('uses a 5-minute monitor interval (matches §11.10(e) continuous-monitoring guidance)', () => {
    // Either literal milliseconds or the 5*60*1000 form is acceptable.
    expect(services).toMatch(/(5\s*\*\s*60\s*\*\s*1000|300000|300_000)/);
  });
});
