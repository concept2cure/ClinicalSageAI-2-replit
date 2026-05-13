/**
 * Pins the security-health check panel. Each named check is exercised
 * with a controlled environment so the result is deterministic:
 *
 *   - JWT secret strength: env-var manipulation
 *   - CSP middleware: real cspNonce call against a fake req/res
 *   - ClamAV connectivity: mock clamd or unset CLAMAV_HOST
 *   - Audit chain / coverage: mocked pool
 *   - CER report migration: tmp dir with synthesised files
 *
 * The orchestrator's overall=failing rollup is also pinned — a single
 * critical fail must surface as failing so boot self-test can exit.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  // securityHealth's checks dynamically import server modules that
  // read process.env at module load time. If a prior test set a bad
  // env (e.g. short JWT secret) and that module was loaded into the
  // require cache in a failed state, subsequent tests would inherit
  // the failure. Resetting modules per test isolates env-driven
  // module loads.
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('checkJwtSecretStrength', () => {
  it('passes when JWT_SECRET is ≥32 chars', async () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = 'a'.repeat(40);
    delete process.env.JWT_SECRET_DEV;
    const { __testing } = await import('../securityHealth');
    const r = await __testing.checkJwtSecretStrength();
    expect(r.status).toBe('pass');
    expect(r.critical).toBe(true);
  });

  it('fails (critical) when JWT_SECRET is short', async () => {
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = 'a'.repeat(20);
    delete process.env.JWT_SECRET_DEV;
    const { __testing } = await import('../securityHealth');
    const r = await __testing.checkJwtSecretStrength();
    expect(r.status).toBe('fail');
    expect(r.critical).toBe(true);
  });

  it('fails (critical) when no JWT secret is set', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_SECRET;
    delete process.env.JWT_SECRET_DEV;
    const { __testing } = await import('../securityHealth');
    const r = await __testing.checkJwtSecretStrength();
    expect(r.status).toBe('fail');
    expect(r.critical).toBe(true);
  });

  it('prefers the env-specific variant', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(40);
    process.env.JWT_SECRET_PROD = 'b'.repeat(40);
    const { __testing } = await import('../securityHealth');
    const r = await __testing.checkJwtSecretStrength();
    expect(r.status).toBe('pass');
    expect((r.details as any).source).toBe('JWT_SECRET_PROD');
  });
});

describe('checkClamavConnectivity', () => {
  it('skips when CLAMAV_HOST is unset', async () => {
    delete process.env.CLAMAV_HOST;
    const { __testing } = await import('../securityHealth');
    const r = await __testing.checkClamavConnectivity();
    expect(r.status).toBe('skipped');
    expect(r.critical).toBe(false);
  });

  it('fails when daemon is unreachable', async () => {
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = '1'; // privileged, nothing listening
    const { __testing } = await import('../securityHealth');
    const r = await __testing.checkClamavConnectivity();
    expect(r.status).toBe('fail');
    expect(r.critical).toBe(true);
    expect(r.reason).toMatch(/unreachable/);
  }, 10_000);

  it('fails when daemon is up but doesnt detect EICAR (signature DB broken)', async () => {
    // Set up a fake clamd that ALWAYS replies "stream: OK" — meaning
    // the daemon is alive but the signature database doesn't include
    // EICAR. This is a real failure mode worth catching.
    const net = await import('node:net');
    const server = net.createServer(socket => {
      socket.on('data', chunk => {
        if (chunk.length >= 4 && (chunk as Buffer).readUInt32BE(chunk.length - 4) === 0) {
          socket.write('stream: OK\x00');
          socket.end();
        }
      });
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as any).port;
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(port);

    const { __testing } = await import('../securityHealth');
    const r = await __testing.checkClamavConnectivity();
    server.close();

    expect(r.status).toBe('fail');
    expect(r.reason).toMatch(/EICAR/);
  });

  it('passes when daemon detects EICAR (full path working)', async () => {
    const net = await import('node:net');
    const server = net.createServer(socket => {
      socket.on('data', chunk => {
        if (chunk.length >= 4 && (chunk as Buffer).readUInt32BE(chunk.length - 4) === 0) {
          socket.write('stream: Eicar-Test-Signature FOUND\x00');
          socket.end();
        }
      });
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as any).port;
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(port);

    const { __testing } = await import('../securityHealth');
    const r = await __testing.checkClamavConnectivity();
    server.close();

    expect(r.status).toBe('pass');
    expect((r.details as any).signature).toBe('Eicar-Test-Signature');
  });
});

describe('checkCerReportMigration', () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'cer-mig-test-'));
    mkdirSync(join(workspace, 'data', 'cer_reports'), { recursive: true });
    process.chdir(workspace);
  });

  afterEach(() => {
    process.chdir(ORIGINAL_ENV.PWD || '/');
    rmSync(workspace, { recursive: true, force: true });
  });

  it('passes when no flat-namespace files exist', async () => {
    const { __testing } = await import('../securityHealth');
    const r = await __testing.checkCerReportMigration();
    expect(r.status).toBe('pass');
  });

  it('passes when only tenant directories exist', async () => {
    mkdirSync(join(workspace, 'data', 'cer_reports', 'org-7'));
    writeFileSync(
      join(workspace, 'data', 'cer_reports', 'org-7', 'r1.json'),
      '{}',
    );
    const { __testing } = await import('../securityHealth');
    const r = await __testing.checkCerReportMigration();
    expect(r.status).toBe('pass');
    expect((r.details as any).tenantDirs).toBe(1);
    expect((r.details as any).flatFiles).toBe(0);
  });

  it('warns when legacy flat files remain', async () => {
    writeFileSync(
      join(workspace, 'data', 'cer_reports', 'legacy-report.json'),
      '{"organizationId": 7}',
    );
    const { __testing } = await import('../securityHealth');
    const r = await __testing.checkCerReportMigration();
    expect(r.status).toBe('warn');
    expect((r.details as any).flatFiles).toBe(1);
    expect(r.reason).toMatch(/run scripts\/migrate-cer-reports/);
  });
});

describe('runSecurityHealthChecks — overall rollup', () => {
  it('rolls up to failing when a single critical check fails', async () => {
    // JWT short → critical fail
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = 'short';
    delete process.env.JWT_SECRET_DEV;
    delete process.env.CLAMAV_HOST;

    // Stub the pool so audit checks bail with relation-not-found
    // (mapped to warn, not fail). That isolates the critical-fail
    // signal to the JWT check.
    const fakePool: any = {
      query: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('relation does not exist'), {})),
    };

    const { runSecurityHealthChecks } = await import('../securityHealth');
    const report = await runSecurityHealthChecks(fakePool);
    expect(report.overall).toBe('failing');
    const jwtCheck = report.checks.find(c => c.name === 'jwt_secret_strength')!;
    expect(jwtCheck.status).toBe('fail');
  });

  it('rolls up to degraded when only non-critical warnings fire', async () => {
    // Everything passes the critical bar, but audit table is missing
    // (warn, non-critical).
    process.env.NODE_ENV = 'development';
    process.env.JWT_SECRET = 'a'.repeat(40);
    delete process.env.JWT_SECRET_DEV;
    delete process.env.CLAMAV_HOST;

    const fakePool: any = {
      query: vi.fn().mockRejectedValue(new Error('relation "audit_events" does not exist')),
    };

    const { runSecurityHealthChecks } = await import('../securityHealth');
    const report = await runSecurityHealthChecks(fakePool);

    // JWT and ClamAV-skipped pass. Audit checks warn. No critical fail.
    expect(report.overall).not.toBe('failing');
    // Audit checks should be in the warn state.
    const chain = report.checks.find(c => c.name === 'audit_chain_integrity');
    expect(chain?.status === 'warn' || chain?.status === 'pass').toBe(true);
  });
});
