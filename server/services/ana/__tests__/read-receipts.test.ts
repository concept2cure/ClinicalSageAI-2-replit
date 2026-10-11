/**
 * The pieces of "reads deliver what they record" (ANA-SUMMARY S1), one at a
 * time: the settlement rule, the round budget's whole-or-nothing placement,
 * coverage after a window, the window fitter, and the read handler outside a
 * settling host. The host-level cases are read-delivery-executor.test.ts and
 * routes/ana-ri/__tests__/stream-read-delivery.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolContext } from '../AnaToolExecutor.js';

const vaultModule = vi.hoisted(() => () => import('./support/read-delivery-vault.js'));
vi.mock('../../../db.js', () => ({ pool: { query: vi.fn(async () => ({ rows: [] })) }, getPool: () => ({}), db: {} }));
vi.mock('../../vault/document-catalog.service.js', async () => (await vaultModule()).serviceMock());
vi.mock('../document-tools-shared.js', async importOriginal => (await vaultModule()).gatesMock(await importOriginal<Record<string, unknown>>()));

import { budgetToolResultsForModel, notDeliveredResult, RESULT_BUDGET, type ToolResultEntry } from '../agentic-loop.js';
import {
  coverageAfter,
  fitReadWindow,
  readReceiptContext,
  settleReadReceipts,
  type DeferredReadReceipt,
  type DeferredReadReceipts,
} from '../read-receipts.js';
import { computeCoverage } from '../../vault/document-catalog-core.js';
import { registerDocumentCatalogHandlers } from '../document-catalog-tools.js';
import { addDocument, prose, receiptsFor, resetVault } from './support/read-delivery-vault.js';

const entry = (id: string, content: string): ToolResultEntry => ({ tool_use_id: id, name: 'read_project_document', content });
const receipt = (id: string, result: string, start = 0): DeferredReadReceipt => ({
  documentId: `doc-${id}`,
  contentHash: 'h',
  span: { start, end: start + 10 },
  readBy: 7,
  result,
});

describe('settleReadReceipts', () => {
  it('writes a receipt only for a result sent to the model byte for byte as the read returned it', async () => {
    const deferred: DeferredReadReceipts = new Map([
      ['whole', receipt('whole', 'A')],
      ['replaced', receipt('replaced', 'B', 40)],
      ['cancelled', receipt('cancelled', 'C')],
      ['amended', receipt('amended', 'D')],
    ]);
    const original = [entry('whole', 'A'), entry('replaced', 'B'), entry('cancelled', '{"cancelled":true}'), entry('amended', 'D')];
    const budgeted = [entry('whole', 'A'), entry('replaced', notDeliveredResult(40)), entry('cancelled', '{"cancelled":true}'), entry('amended', 'D, amended')];
    const written: string[] = [];

    const n = await settleReadReceipts(original, budgeted, deferred, async r => void written.push(r.documentId));

    expect(n).toBe(1);
    expect(written).toEqual(['doc-whole']);
    expect(deferred.size, 'settled receipts are cleared').toBe(0);
  });

  it('a write that fails is skipped, not thrown, and the others are still written', async () => {
    const deferred: DeferredReadReceipts = new Map([['a', receipt('a', 'A')], ['b', receipt('b', 'B')]]);
    const both = [entry('a', 'A'), entry('b', 'B')];
    const written: string[] = [];
    const n = await settleReadReceipts(both, both, deferred, async r => {
      if (r.documentId === 'doc-a') throw new Error('database unavailable');
      written.push(r.documentId);
    });
    expect(n).toBe(1);
    expect(written).toEqual(['doc-b']);
  });

  it('with nothing deferred, writes nothing and touches no database', async () => {
    const write = vi.fn(async () => {});
    expect(await settleReadReceipts([entry('a', 'A')], [entry('a', 'A')], new Map(), write)).toBe(0);
    expect(write).not.toHaveBeenCalled();
  });
});

describe('budgetToolResultsForModel with whole-or-nothing reads', () => {
  const reads = (sizes: number[]) => sizes.map((n, k) => entry(`r${k}`, 'x'.repeat(n)));
  const whole = (es: ToolResultEntry[], start = 0) => new Map(es.map(e => [e.tool_use_id, { span: { start } }]));

  it('without any, a squeezed round is exactly what it was', () => {
    const es = reads([10_000, 10_000, 10_000, 10_000]);
    expect(budgetToolResultsForModel(es, { wholeOrNothing: new Map() })).toEqual(budgetToolResultsForModel(es));
  });

  it('reads are placed first and whole; the cuttable results share what is left, never below the floor', () => {
    const rs = reads([4900, 4900, 4900]);
    const search = [entry('s1', 'y'.repeat(8000)), entry('s2', 'y'.repeat(8000))];
    const out = budgetToolResultsForModel([...rs, ...search], { wholeOrNothing: whole(rs) });
    for (const r of out.slice(0, 3)) expect(r.content.length).toBe(4900);
    const shares = out.slice(3).map(e => e.content.length);
    for (const s of shares) expect(s).toBeGreaterThanOrEqual(1500);
    expect(out.slice(3).every(e => e.content.includes('truncated to fit the model context'))).toBe(true);
    expect(out.reduce((t, e) => t + e.content.length, 0)).toBeLessThanOrEqual(24_000 + 200);
  });

  it('a read larger than the per-result cap is replaced, never cut', () => {
    const [big] = reads([9000]);
    const [out] = budgetToolResultsForModel([big], { wholeOrNothing: whole([big], 1234) });
    expect(out.content).toBe(notDeliveredResult(1234));
  });

  it('the replacement says where to read again from, in the shape the design names', () => {
    expect(JSON.parse(notDeliveredResult(6000))).toEqual({
      delivered: false,
      reason: 'This round returned more than can be read at once.',
      readAgainFrom: 6000,
    });
  });
});

describe('coverageAfter', () => {
  it('is the recorded spans plus this window', () => {
    const before = computeCoverage([{ start: 0, end: 100 }, { start: 300, end: 400 }], 1000);
    expect(coverageAfter(before, { start: 100, end: 300 }, 1000)).toEqual(computeCoverage([{ start: 0, end: 400 }], 1000));
  });
  it('with nothing recorded, is this window alone', () => {
    expect(coverageAfter(computeCoverage([], 50), { start: 0, end: 50 }, 50).complete).toBe(true);
  });
});

describe('fitReadWindow', () => {
  it('keeps a window that fits, and shrinks one that does not to the largest that does', () => {
    const text = '"\n'.repeat(5000); // every character escapes to two
    const render = (size: number) => JSON.stringify({ text: text.slice(0, size) });
    expect(fitReadWindow(render, 100).size).toBe(100);
    const fit = fitReadWindow(render, 5000);
    expect(fit.result.length).toBeLessThanOrEqual(RESULT_BUDGET);
    expect(render(fit.size + 1).length).toBeGreaterThan(RESULT_BUDGET);
  });
});

describe('read_project_document', () => {
  const handlers = new Map<string, (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>>();
  registerDocumentCatalogHandlers((name, fn) => handlers.set(name, fn));
  const ORG: ToolContext = { organizationId: 42, userId: 7 };
  const readIt = async (input: Record<string, unknown>, ctx: ToolContext) => JSON.parse(await handlers.get('read_project_document')!(input, ctx));

  beforeEach(() => resetVault());

  it('outside a settling host it records nothing, counts nothing, and says so', async () => {
    addDocument('d', prose(3000));
    const r = await readIt({ document_id: 'd' }, ORG);
    expect(r.ok).toBe(true);
    expect(r.window).toMatchObject({ start: 0, end: 3000 });
    expect(r.coverage).toMatchObject({ coveredChars: 0, complete: false });
    expect(r.message).toMatch(/not recorded as read/);
    expect(receiptsFor('d')).toEqual([]);
  });

  it('inside one it defers the receipt for exactly the window it serves, with the result it serves', async () => {
    addDocument('d', prose(12_000));
    const deferred: DeferredReadReceipts = new Map();
    const raw = await handlers.get('read_project_document')!({ document_id: 'd', offset: 100, max_chars: 80_000 }, { ...ORG, ...readReceiptContext(deferred, 'tu_1') });
    const r = JSON.parse(raw);
    expect(raw.length).toBeLessThanOrEqual(RESULT_BUDGET);
    expect(deferred.get('tu_1')).toMatchObject({ documentId: 'd', span: { start: 100, end: r.window.end }, readBy: 7, result: raw });
    expect(r.coverage.coveredChars, 'coverage counts this window: true once it is delivered').toBe(r.window.end - 100);
    expect(r.message).toMatch(new RegExp(`Continue with offset=0`));
    expect(receiptsFor('d'), 'nothing is written by the read itself').toEqual([]);
  });

  it('a comprehension record too large to leave room for text gives way, and says so', async () => {
    addDocument('d', prose(12_000), { status: 'cataloged', documentKind: 'Report', summary: 's'.repeat(4500) });
    const r = await readIt({ document_id: 'd' }, ORG);
    expect(r.comprehension).toBeUndefined();
    expect(r.comprehensionWithheld).toMatch(/too long to send beside/);
    expect(r.window.end - r.window.start).toBeGreaterThan(1000);
  });
});
