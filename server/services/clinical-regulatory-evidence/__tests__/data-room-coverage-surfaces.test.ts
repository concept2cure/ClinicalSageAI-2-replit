/**
 * D2 / W2 — the coverage vocabulary and the recovery CLI's partial outcome
 * (docs/evidence/D2-OCR-BUDGET/2026-10-18/CONTRACT.md, Amendment A:
 * "One vocabulary" and "CLI (B3)").
 *
 * Written from the contract only, fail-first against the baseline bytes. The
 * CLI is driven through its injected service seam, exactly as
 * processing-recovery-cli.test.ts does; no database is opened.
 */
import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import * as status from '../../../../shared/data-room-processing-status';

const repo = path.resolve(__dirname, '../../../..');
const script = path.join(repo, 'scripts/process-data-room-captures.mjs');

const vocabulary = status as unknown as Record<string, unknown>;
function readExtractionCoverage(value: unknown): unknown {
  expect(typeof vocabulary.readExtractionCoverage).toBe('function');
  return (vocabulary.readExtractionCoverage as (v: unknown) => unknown)(value);
}

describe('shared vocabulary — readExtractionCoverage', () => {
  it.each([
    { pageCount: 250, pagesRead: 100, limitedBy: 'page_budget' },
    { pageCount: 40, pagesRead: 17, limitedBy: 'time_budget' },
    { pageCount: 7, pagesRead: null, limitedBy: 'ocr_failed' },
    { pageCount: null, pagesRead: null, limitedBy: 'ocr_failed' },
    { pageCount: 3, pagesRead: 3, limitedBy: null },
    { pageCount: 0, pagesRead: 0, limitedBy: null },
  ])('accepts well-formed %j and returns an equal copy', (value) => {
    const read = readExtractionCoverage(value);
    expect(read).toEqual(value);
    expect(read).not.toBe(value);
    (read as Record<string, unknown>).pagesRead = 999;
    expect(value.pagesRead).not.toBe(999);
  });

  it.each([
    ['negative pageCount', { pageCount: -1, pagesRead: 0, limitedBy: null }],
    ['negative pagesRead', { pageCount: 3, pagesRead: -1, limitedBy: 'page_budget' }],
    ['fractional pageCount', { pageCount: 2.5, pagesRead: 1, limitedBy: null }],
    ['fractional pagesRead', { pageCount: 3, pagesRead: 1.5, limitedBy: 'time_budget' }],
    ['NaN pagesRead', { pageCount: 3, pagesRead: Number.NaN, limitedBy: null }],
    ['infinite pageCount', { pageCount: Number.POSITIVE_INFINITY, pagesRead: 1, limitedBy: null }],
    ['string pageCount', { pageCount: '250', pagesRead: 100, limitedBy: 'page_budget' }],
    ['string pagesRead', { pageCount: 250, pagesRead: '100', limitedBy: 'page_budget' }],
    ['unknown limitedBy', { pageCount: 3, pagesRead: 3, limitedBy: 'bogus' }],
    ['EXTRACTION_PARTIAL as limitedBy', { pageCount: 3, pagesRead: 3, limitedBy: 'EXTRACTION_PARTIAL' }],
    ['missing limitedBy', { pageCount: 3, pagesRead: 3 }],
    ['missing pageCount', { pagesRead: 3, limitedBy: null }],
    ['missing pagesRead', { pageCount: 3, limitedBy: null }],
    ['empty object', {}],
    ['array', [250, 100, 'page_budget']],
    ['empty array', []],
    ['string', 'page_budget'],
    ['number', 100],
    ['null', null],
    ['undefined', undefined],
  ])('rejects %s', (_kind, value) => {
    expect(readExtractionCoverage(value)).toBeNull();
  });

  it('EXTRACTION_COVERAGE_LIMITS is exactly page_budget, time_budget, ocr_failed', () => {
    expect(vocabulary.EXTRACTION_COVERAGE_LIMITS).toEqual(['page_budget', 'time_budget', 'ocr_failed']);
  });
});

describe('shared vocabulary — result reason codes', () => {
  it('DATA_ROOM_RESULT_REASON_CODES is every stage code plus EXTRACTION_PARTIAL', () => {
    const result = vocabulary.DATA_ROOM_RESULT_REASON_CODES as readonly string[] | undefined;
    expect(Array.isArray(result)).toBe(true);
    for (const code of status.DATA_ROOM_PROCESSING_REASON_CODES) expect(result).toContain(code);
    expect(result).toContain('EXTRACTION_PARTIAL');
    expect(result).toHaveLength(status.DATA_ROOM_PROCESSING_REASON_CODES.length + 1);
  });

  it('CONTROL: the stage vocabulary does not contain EXTRACTION_PARTIAL', () => {
    expect(status.DATA_ROOM_PROCESSING_REASON_CODES as readonly string[]).not.toContain('EXTRACTION_PARTIAL');
  });

  it('CONTROL: a completed stage summary carrying EXTRACTION_PARTIAL is not a valid summary', () => {
    const completed = { state: 'completed', retryable: false, reasonCode: null, leaseExpiresAt: null, nextRetryAt: null };
    expect(status.isDataRoomProcessingSummary(completed)).toBe(true);
    expect(status.isDataRoomProcessingSummary({ ...completed, reasonCode: 'EXTRACTION_PARTIAL' })).toBe(false);
  });
});

// ── Recovery CLI ──────────────────────────────────────────────────────────────

async function cli() {
  return import(/* @vite-ignore */ script);
}

function report(overrides: Record<string, unknown> = {}) {
  return {
    examined: 1, processed: 1, unreadable: [], dryRun: false,
    completed: 1, failed: 0, blocked: 0, skipped: 0,
    items: [{ sourceId: 71, status: 'completed' }],
    diagnosticCounts: {
      blocked: 0, busy: 0, retry_not_due: 0, retry_exhausted: 0,
      extraction_failed: 0, stale_source: 0,
    },
    limit: 50, diagnosticLimit: 50, diagnosticsCapped: false,
    ...overrides,
  };
}

function fixture(result: unknown) {
  const service = {
    processPendingSourcesForTenant: vi.fn().mockResolvedValue(result),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return { service, loadService: vi.fn().mockResolvedValue(service), stdout: vi.fn(), stderr: vi.fn() };
}

async function run(result: unknown) {
  const { runRecoveryCli } = await cli();
  const f = fixture(result);
  const exitCode = await runRecoveryCli(['--org', '42', '--apply'], f);
  expect(f.stderr).not.toHaveBeenCalled();
  return { exitCode, output: JSON.parse(f.stdout.mock.calls[0][0]) };
}

describe('recovery CLI — a partial read is reported as partial (B3)', () => {
  it('keeps EXTRACTION_PARTIAL on a completed item, counts partial: 1 and reports outcome partial', async () => {
    const { output } = await run(report({ items: [{ sourceId: 71, status: 'completed', reasonCode: 'EXTRACTION_PARTIAL' }] }));
    expect(output.items[0]).toEqual({ sourceId: 71, status: 'completed', reasonCode: 'EXTRACTION_PARTIAL' });
    expect(output.partial).toBe(1);
    expect(output.outcome).toBe('partial');
  });

  it('counts every partial item', async () => {
    const { output } = await run(report({
      examined: 3, processed: 3, completed: 3,
      items: [
        { sourceId: 71, status: 'completed', reasonCode: 'EXTRACTION_PARTIAL' },
        { sourceId: 72, status: 'completed' },
        { sourceId: 73, status: 'completed', reasonCode: 'EXTRACTION_PARTIAL' },
      ],
    }));
    expect(output.partial).toBe(2);
    expect(output.outcome).toBe('partial');
  });

  it('a clean run reports partial: 0 and outcome clean', async () => {
    const { exitCode, output } = await run(report());
    expect(output).toMatchObject({ outcome: 'clean', partial: 0 });
    expect(exitCode).toBe(0);
  });

  it('unresolved still wins over partial', async () => {
    const { exitCode, output } = await run(report({
      examined: 2,
      items: [
        { sourceId: 71, status: 'completed', reasonCode: 'EXTRACTION_PARTIAL' },
        { sourceId: 72, status: 'extraction_failed', reasonCode: 'EXTRACTION_FAILED' },
      ],
    }));
    expect(output.outcome).toBe('unresolved');
    expect(output.partial).toBe(1);
    expect(output.items[0].reasonCode).toBe('EXTRACTION_PARTIAL');
    expect(exitCode).toBe(1);
  });

  it('CONTROL: an unknown reason code is still reported as UNSPECIFIED', async () => {
    const { output } = await run(report({ items: [{ sourceId: 71, status: 'completed', reasonCode: 'PRIVATE_PROVIDER_TOKEN' }] }));
    expect(output.items[0].reasonCode).toBe('UNSPECIFIED');
    expect(JSON.stringify(output)).not.toContain('PRIVATE_PROVIDER_TOKEN');
  });

  it('CONTROL: a clean apply run still exits 0 with outcome clean', async () => {
    const { exitCode, output } = await run(report());
    expect(output.outcome).toBe('clean');
    expect(exitCode).toBe(0);
  });
});
