import { describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repo = path.resolve(__dirname, '../../../..');
const script = path.join(repo, 'scripts/process-data-room-captures.mjs');

async function cli() {
  return import(/* @vite-ignore */ script);
}

function report(overrides: Record<string, unknown> = {}) {
  return {
    examined: 1, processed: 0, unreadable: [], dryRun: true,
    completed: 0, failed: 0, blocked: 0, skipped: 0,
    items: [{ sourceId: 71, status: 'candidate' }],
    diagnosticCounts: {
      blocked: 0, busy: 0, retry_not_due: 0, retry_exhausted: 0,
      extraction_failed: 0, stale_source: 0,
    },
    limit: 50, diagnosticLimit: 50, diagnosticsCapped: false,
    ...overrides,
  };
}

function fixture(result = report()) {
  const service = {
    processPendingSourcesForTenant: vi.fn().mockResolvedValue(result),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    service, loadService: vi.fn().mockResolvedValue(service),
    stdout: vi.fn(), stderr: vi.fn(),
  };
}

function runProcess(args: string[]) {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'data-room-recovery-cli-'));
  try {
    const env: NodeJS.ProcessEnv = { ...process.env, SKIP_DB_STARTUP_TEST: 'true', LOG_LEVEL: 'debug' };
    delete env.DATABASE_URL;
    delete env.APP_DATABASE_URL;
    delete env.DATABASE_URL_DEV;
    delete env.NEON_DATABASE_URL;
    delete env.DATABASE_NEON_NEW_SECRET;
    return spawnSync(process.execPath, [
      '--import', path.join(repo, 'node_modules/tsx/dist/loader.mjs'), script, ...args,
    ], { cwd, env, encoding: 'utf8', timeout: 30_000 });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

describe('Data Room recovery operator arguments', () => {
  it('requires one explicit organization and defaults to bounded report-only work', async () => {
    const { parseRecoveryArgs } = await cli();
    expect(parseRecoveryArgs(['--org', '42'])).toEqual({
      organizationId: 42, sourceId: undefined, limit: 50, apply: false, retryFailed: false,
    });
    expect(parseRecoveryArgs(['--org', '42', '--source', '71', '--limit', '500', '--apply', '--retry-failed']))
      .toEqual({ organizationId: 42, sourceId: 71, limit: 500, apply: true, retryFailed: true });
  });

  it.each([
    [], ['--org'], ['--org', '0'], ['--org', '-1'], ['--org', '1.5'],
    ['--org', '1e2'], ['--org', '0x2a'], ['--org', ' 42'], ['--org', '9007199254740992'],
    ['--org', '42', '--source', '0'], ['--org', '42', '--source', 'NaN'],
    ['--org', '42', '--source', '1e3'], ['--org', '42', '--limit', '0'],
    ['--org', '42', '--limit', '501'], ['--org', '42', '--limit', '1.5'],
    ['--org', '42', '--limit', '1e2'], ['--org', '42', '--limit'],
    ['--org', '42', '--all'], ['--org', '42', 'other'], ['--org=42'],
    ['--org', '42', '--apply', 'true'], ['--org', '42', '--retry-failed', 'false'],
    ['--org', '42', '--org', '43'], ['--org', '42', '--source', '71', '--source', '72'],
    ['--org', '42', '--limit', '2', '--limit', '3'],
    ['--org', '42', '--apply', '--apply'], ['--org', '42', '--retry-failed', '--retry-failed'],
  ])('refuses invalid/ambiguous arguments before loading the database: %j', async (...args: string[]) => {
    const { runRecoveryCli } = await cli();
    const f = fixture();
    expect(await runRecoveryCli(args, f)).toBe(2);
    expect(f.loadService).not.toHaveBeenCalled();
    expect(f.stdout).not.toHaveBeenCalled();
    expect(JSON.parse(f.stderr.mock.calls[0][0])).toMatchObject({ code: 'USAGE_ERROR' });
  });
});

describe('Data Room recovery operator report and exit status', () => {
  it('calls only the canonical tenant wrapper and preserves report caps', async () => {
    const { runRecoveryCli } = await cli();
    const f = fixture();
    expect(await runRecoveryCli(['--org', '42'], f)).toBe(0);
    expect(f.service.processPendingSourcesForTenant).toHaveBeenCalledExactlyOnceWith(42, {
      sourceId: undefined, limit: 50, retryFailed: false, apply: false,
    });
    expect(f.service.close).toHaveBeenCalledOnce();
    expect(JSON.parse(f.stdout.mock.calls[0][0])).toMatchObject({
      code: 'RECOVERY_REPORT', organizationId: 42, sourceId: null, dryRun: true,
      examined: 1, completed: 0, limit: 50, diagnosticLimit: 50, diagnosticsCapped: false,
      items: [{ sourceId: 71, status: 'candidate' }],
    });
  });

  it('explicit apply forwards exact-source/retry selection and counts readable completion', async () => {
    const { runRecoveryCli } = await cli();
    const f = fixture(report({ dryRun: false, processed: 1, completed: 1,
      limit: 1, items: [{ sourceId: 71, status: 'completed' }] }));
    expect(await runRecoveryCli(['--org', '42', '--source', '71', '--limit', '1', '--retry-failed', '--apply'], f))
      .toBe(0);
    expect(f.service.processPendingSourcesForTenant).toHaveBeenCalledExactlyOnceWith(42, {
      sourceId: 71, limit: 1, retryFailed: true, apply: true,
    });
  });

  it.each([
    ['extraction_failed', 'EXTRACTION_FAILED'], ['retryable_failure', 'PERSISTENCE_FAILED'],
    ['blocked', 'STAGE_METADATA_INVALID'], ['stale_source', 'ATTEMPT_STALE'],
    ['busy', 'ATTEMPT_BUSY'], ['retry_not_due', 'RETRY_NOT_DUE'], ['retry_exhausted', 'RETRY_EXHAUSTED'],
  ])('reports %s as unresolved rather than clean completion', async (status, reasonCode) => {
    const { runRecoveryCli } = await cli();
    const f = fixture(report({ dryRun: false, items: [{ sourceId: 71, status, reasonCode }] }));
    expect(await runRecoveryCli(['--org', '42', '--apply'], f)).toBe(1);
    expect(JSON.parse(f.stdout.mock.calls[0][0]).items[0]).toEqual({
      sourceId: 71, status, reasonCode,
    });
  });

  it('keeps bounded diagnostics visible when no runnable source was selected', async () => {
    const { runRecoveryCli } = await cli();
    const f = fixture(report({ examined: 0, items: [], blocked: 1, diagnosticsCapped: true,
      diagnosticCounts: { blocked: 1, busy: 0, retry_not_due: 0, retry_exhausted: 0,
        extraction_failed: 0, stale_source: 0 } }));
    expect(await runRecoveryCli(['--org', '42'], f)).toBe(1);
    expect(JSON.parse(f.stdout.mock.calls[0][0])).toMatchObject({
      examined: 0, blocked: 1, diagnosticsCapped: true, diagnosticCounts: { blocked: 1 },
    });
  });

  it('allows an empty clean dry-run without claiming any source was processed', async () => {
    const { runRecoveryCli } = await cli();
    const f = fixture(report({ examined: 0, items: [] }));
    expect(await runRecoveryCli(['--org', '42'], f)).toBe(0);
    expect(JSON.parse(f.stdout.mock.calls[0][0])).toMatchObject({ processed: 0, completed: 0, dryRun: true });
  });

  it('whitelists report content and never prints raw private data or provider errors', async () => {
    const { runRecoveryCli } = await cli();
    const secret = '/private/client-study/file.pdf';
    const privateCode = 'PRIVATE_PROVIDER_TOKEN_0123456789';
    const f = fixture(report({
      unreadable: [{ sourceId: 71, reason: secret }], providerError: secret,
      items: [{ sourceId: 71, status: 'blocked', reasonCode: privateCode, fileName: secret, bytes: secret }],
      diagnosticCounts: { blocked: 1, busy: 0, retry_not_due: 0, retry_exhausted: 0,
        extraction_failed: 0, stale_source: 0, privatePath: secret },
    }));
    expect(await runRecoveryCli(['--org', '42'], f)).toBe(1);
    const output = JSON.stringify([...f.stdout.mock.calls, ...f.stderr.mock.calls]);
    expect(output).not.toContain(secret);
    expect(output).not.toContain(privateCode);
    expect(JSON.parse(f.stdout.mock.calls[0][0]).items[0].reasonCode).toBe('UNSPECIFIED');
  });
});

describe('Data Room recovery operator failure handling', () => {
  it.each([
    report({ dryRun: false }), report({ examined: -1 }), report({ completed: 1.5 }),
    report({ items: [{ sourceId: 71, status: '/private/bad' }] }),
    report({ diagnosticCounts: {} }), report({ limit: 501 }),
    report({ processed: 2, completed: 2 }), report({ processed: 1, completed: 0 }),
  ])('fails closed on a malformed or mode-mismatched service report', async result => {
    const { runRecoveryCli } = await cli();
    const f = fixture(result);
    expect(await runRecoveryCli(['--org', '42'], f)).toBe(1);
    expect(f.stdout).not.toHaveBeenCalled();
    expect(JSON.parse(f.stderr.mock.calls[0][0])).toMatchObject({ code: 'REPORT_INVALID' });
    expect(f.service.close).toHaveBeenCalledOnce();
  });

  it('refuses a report for another exact source before printing any source identity', async () => {
    const { runRecoveryCli } = await cli();
    const f = fixture(report());
    expect(await runRecoveryCli(['--org', '42', '--source', '72'], f)).toBe(1);
    expect(f.stdout).not.toHaveBeenCalled();
    expect(JSON.parse(f.stderr.mock.calls[0][0])).toMatchObject({ code: 'REPORT_INVALID' });
  });

  it('closes the loaded service after fatal errors and emits a safe error code', async () => {
    const { runRecoveryCli } = await cli();
    const f = fixture();
    f.service.processPendingSourcesForTenant.mockRejectedValue(new Error('/private/path: provider token=secret'));
    expect(await runRecoveryCli(['--org', '42', '--apply'], f)).toBe(1);
    expect(f.service.close).toHaveBeenCalledOnce();
    expect(f.stdout).not.toHaveBeenCalled();
    expect(JSON.parse(f.stderr.mock.calls[0][0])).toEqual({ code: 'RECOVERY_UNAVAILABLE' });
  });

  it('reports cleanup failure without emitting its private message', async () => {
    const { runRecoveryCli } = await cli();
    const f = fixture();
    f.service.close.mockRejectedValue(new Error('/private/cleanup'));
    expect(await runRecoveryCli(['--org', '42'], f)).toBe(1);
    expect(JSON.parse(f.stderr.mock.calls[0][0])).toEqual({ code: 'CLEANUP_FAILED' });
  });
});

describe('Data Room recovery actual executable', () => {
  it('rejects invalid arguments with usage exit 2 before any server import', () => {
    const r = runProcess(['--org', '42', '--limit', '501']);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
    expect(JSON.parse(r.stderr)).toMatchObject({ code: 'USAGE_ERROR' });
  });

  it('resolves the real server imports and refuses a missing database without a socket', () => {
    const r = runProcess(['--org', '42']);
    expect(r.error).toBeUndefined();
    expect(r.status).toBe(1);
    expect(r.stdout).toBe('');
    expect(`${r.stdout}\n${r.stderr}`).not.toMatch(/ERR_MODULE_NOT_FOUND|Cannot find module/);
    expect(JSON.parse(r.stderr)).toEqual({ code: 'DATABASE_UNAVAILABLE' });
  }, 45_000);
});
