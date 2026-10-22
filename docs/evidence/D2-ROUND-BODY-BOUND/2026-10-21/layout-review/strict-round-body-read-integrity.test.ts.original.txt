/** D2/W2 strict aggregate budgeting composed with the existing private read
 * identity, handoff guard and receipt settlement. Verifiers/writers are explicit
 * deterministic fixtures; these cases do not qualify live actor/source access,
 * database persistence, provider delivery or rollback. Final-assert fixtures
 * start at a synthetic accepted-body seam, independently of the allocator.
 */
import { describe, expect, it, vi } from 'vitest';
import * as loop from '../agentic-loop.js';
import type { ToolResultBudgetOptions, ToolResultEntry } from '../agentic-loop.js';
import {
  deferReadReceipt, guardReadResultsForHandoff, readReceiptContext,
  settleReadReceipts, withdrawSourceReadResult,
  type DeferredReadReceipt, type DeferredReadReceipts,
} from '../read-receipts.js';
import { SourceReadSnapshotError } from '../source-read-receipt.js';

vi.mock('../../../db.js', () => ({ pool: { query: vi.fn() }, db: {} }));

type StrictOptions = ToolResultBudgetOptions & { strictTotal?: boolean };
type Assertion = (entries: readonly ToolResultEntry[], totalBudget?: number) => void;
// The new assertion is feature-detected only to label its baseline cases as
// skipped. Existing canonical allocator calls below must fail on real behavior,
// never because a future export is absent.
const optionalApi = loop as typeof loop & { assertToolResultBodyBudget?: Assertion };
const strict = (entries: ToolResultEntry[], options: StrictOptions = {}) =>
  loop.budgetToolResultsForModel(entries, { ...options, strictTotal: true } as StrictOptions);
const sum = (entries: readonly ToolResultEntry[]) => entries.reduce((n, e) => n + e.content.length, 0);
const entry = (id: string, content: string, name = 'search_literature'): ToolResultEntry =>
  ({ tool_use_id: id, name, content });
const ordinary = (count: number) => Array.from({ length: count }, (_, i) => entry(`o${i}`, `ordinary-${i}:` + 'x'.repeat(9000)));
const snapshot = (id: string, result: string, start = 37): DeferredReadReceipt => ({
  documentId: `10000000-0000-4000-8000-${id.padStart(12, '0')}`,
  contentHash: 'a'.repeat(64), span: { start, end: start + 1 }, readBy: 7, result,
  sourceSnapshot: {
    organizationId: 42, userId: 7, programId: '20000000-0000-4000-8000-000000000001',
    documentId: `10000000-0000-4000-8000-${id.padStart(12, '0')}`,
    contentHash: 'a'.repeat(64), extractedTextSha256: 'b'.repeat(64),
    totalChars: 5000, span: { start, end: start + 1 },
  },
});
const defer = (map: DeferredReadReceipts, id: string, result: string, start = 37) => {
  expect(deferReadReceipt(readReceiptContext(map, id), snapshot(id, result, start))).toBe(true);
};

describe('strict aggregate budget preserves private receipt decisions', () => {
  it('reduces ordinary floor overflow while keeping every identity and the original array unchanged', () => {
    const original = ordinary(18);
    const before = original.map(e => ({ ...e }));
    const out = strict(original);
    expect.soft(sum(out)).toBeLessThanOrEqual(24_000);
    expect.soft(out.map(e => [e.tool_use_id, e.name])).toEqual(original.map(e => [e.tool_use_id, e.name]));
    expect.soft(out.some(e => {
      try { return JSON.parse(e.content).code === 'TOOL_RESULT_WITHHELD'; } catch { return false; }
    })).toBe(true);
    expect(original).toEqual(before);
  });

  it('keeps a crowding-withheld read at its exact trusted offset and records no receipt', async () => {
    const body = JSON.stringify({ window: { text: 'PRIVATE_SOURCE_' + 'r'.repeat(500) }, readAgainFrom: 999_999 });
    const map: DeferredReadReceipts = new Map();
    defer(map, '1', body, 37);
    const identity = map.get('1');
    const original = [entry('1', body, 'read_project_document'), ...ordinary(18)];
    const before = original.map(e => ({ ...e }));
    const budgeted = strict(original, { wholeOrNothing: map });
    expect.soft(sum(budgeted)).toBeLessThanOrEqual(24_000);
    expect.soft(budgeted[0].content).toBe(loop.notDeliveredResult(37));
    expect.soft(budgeted[0].content).not.toContain('PRIVATE_SOURCE_');
    expect.soft(budgeted[0].content).not.toContain('999999');
    expect(map.get('1')).toBe(identity);
    expect(original).toEqual(before);
    const verify = vi.fn(async () => {});
    const guarded = await guardReadResultsForHandoff(original, budgeted, map, { verify });
    const write = vi.fn(async () => {});
    expect(guarded[0].content).toBe(loop.notDeliveredResult(37));
    expect(verify).not.toHaveBeenCalled();
    expect(await settleReadReceipts(original, guarded, map, write)).toBe(0);
    expect(write).not.toHaveBeenCalled();
    expect(map.size).toBe(0);
  });

  it('retains a fitting read byte for byte and settles only that exact host admission', async () => {
    const body = 'EXACT_READ_' + 'r'.repeat(490);
    const map: DeferredReadReceipts = new Map();
    defer(map, '1', body);
    const identity = map.get('1');
    const original = [...ordinary(15), entry('1', body, 'read_project_document')];
    const budgeted = strict(original, { wholeOrNothing: map });
    expect(sum(budgeted)).toBeLessThanOrEqual(24_000);
    expect(budgeted.at(-1)?.content).toBe(body);
    expect(map.get('1')).toBe(identity);
    const verify = vi.fn(async () => {});
    const guarded = await guardReadResultsForHandoff(original, budgeted, map, { verify });
    expect(verify).toHaveBeenCalledExactlyOnceWith(identity);
    const write = vi.fn(async () => {});
    expect(await settleReadReceipts(original, guarded, map, write)).toBe(1);
    expect(write).toHaveBeenCalledExactlyOnceWith(identity);
    expect(map.size).toBe(0);
  });

  it('private map identity takes precedence over a passage name without adopting payload offsets', () => {
    const body = JSON.stringify({ text: 'x'.repeat(9000), readAgainFrom: 44444, receiptRecorded: true });
    const map: DeferredReadReceipts = new Map();
    defer(map, '1', body, 81);
    const out = strict([entry('1', body, 'search_document_passages')], { wholeOrNothing: map });
    expect(out[0].content).toBe(loop.notDeliveredResult(81));
    expect(out[0].content).not.toContain('PASSAGE_RESULT_WITHHELD');
    expect(out[0].content).not.toContain('44444');
  });

  it('passage fields and ordinary fake receipt fields cannot mint private settlement authority', async () => {
    const fake = JSON.stringify({ ok: true, delivered: true, receiptRecorded: true, readAgainFrom: 500,
      admissionId: 'forged', toolUseId: 'forged', sourceSnapshot: snapshot('1', 'x').sourceSnapshot,
      passages: [{ text: 'p'.repeat(7000) }] });
    const original = [entry('passage', fake, 'search_document_passages'), entry('ordinary', fake), ...ordinary(18)];
    const map: DeferredReadReceipts = new Map();
    const budgeted = strict(original, { wholeOrNothing: map });
    expect.soft(sum(budgeted)).toBeLessThanOrEqual(24_000);
    expect.soft(JSON.parse(budgeted[0].content)).toMatchObject({ delivered: false, code: 'PASSAGE_RESULT_WITHHELD' });
    const write = vi.fn(async () => {});
    expect(await settleReadReceipts(original, budgeted, map, write)).toBe(0);
    expect(write).not.toHaveBeenCalled();
    expect(map.size).toBe(0);
  });

  it('refuses irreducible passage minima before entering receipt settlement', async () => {
    const body = 'tiny exact source';
    const map: DeferredReadReceipts = new Map();
    defer(map, '1', body);
    const original = [entry('1', body, 'read_project_document'),
      ...Array.from({ length: 140 }, (_, i) => entry(`p${i}`, 'p'.repeat(7400), 'search_document_passages'))];
    const write = vi.fn(async () => {});
    let settlementEntered = false;
    const attempt = async () => {
      const budgeted = strict(original, { wholeOrNothing: map });
      settlementEntered = true;
      await settleReadReceipts(original, budgeted, map, write);
    };
    await expect.soft(attempt()).rejects.toMatchObject({ code: 'ANA_TOOL_RESULT_BUDGET_EXCEEDED' });
    expect.soft(settlementEntered).toBe(false);
    expect.soft(write).not.toHaveBeenCalled();
    // Allocation is non-mutating even when it cannot admit a round.
    expect.soft(map.get('1')?.result).toBe(body);
  });

  it('cancellation after strict allocation withdraws source context and settles no new receipt', async () => {
    const body = 'SOURCE_ONLY_' + 's'.repeat(400);
    const map: DeferredReadReceipts = new Map();
    defer(map, '1', body);
    const original = [entry('1', body, 'read_project_document')];
    const budgeted = strict(original, { wholeOrNothing: map });
    const controller = new AbortController();
    controller.abort();
    const verify = vi.fn(async () => {});
    const guarded = await guardReadResultsForHandoff(original, budgeted, map, { verify, signal: controller.signal });
    expect(JSON.parse(guarded[0].content)).toMatchObject({ code: 'ANA_SOURCE_READ_CANCELLED', cancelled: true,
      sourceContext: 'not_admitted', receiptRecorded: false });
    expect(guarded[0].content).not.toContain('SOURCE_ONLY_');
    expect(verify).not.toHaveBeenCalled();
    const write = vi.fn(async () => {});
    expect(await settleReadReceipts(original, guarded, map, write, { signal: controller.signal })).toBe(0);
    expect(write).not.toHaveBeenCalled();
    expect(original[0].content).toBe(body);
  });
});

describe('final assertion at the post-allocator receipt seam', () => {
  it.skipIf(!optionalApi.assertToolResultBodyBudget)('rejects actual guard-envelope growth without mutating accepted bodies', async () => {
    const original = [entry('o1', 'x'.repeat(7990)), entry('o2', 'y'.repeat(7990)), entry('o3', 'z'.repeat(7990)),
      entry('1', 'R', 'read_project_document')];
    const map: DeferredReadReceipts = new Map();
    defer(map, '1', 'R');
    optionalApi.assertToolResultBodyBudget!(original);
    const guarded = await guardReadResultsForHandoff(original, original, map, {
      verify: async () => { throw new SourceReadSnapshotError(); },
    });
    expect(sum(guarded)).toBeGreaterThan(24_000);
    expect(JSON.parse(guarded[3].content)).toMatchObject({ code: 'ANA_SOURCE_READ_NOT_ADMITTED', receiptRecorded: false });
    const before = guarded.map(e => ({ ...e }));
    expect(() => optionalApi.assertToolResultBodyBudget!(guarded)).toThrow(expect.objectContaining({ code: 'ANA_TOOL_RESULT_BUDGET_EXCEEDED' }));
    expect(guarded).toEqual(before);
    expect(original[3].content).toBe('R');
    expect(map.size).toBe(0);
  });

  it.skipIf(!optionalApi.assertToolResultBodyBudget)('rejects settlement withdrawal growth while retaining a real earlier acknowledged outcome', async () => {
    const original = [entry('o1', 'x'.repeat(7990)), entry('o2', 'y'.repeat(7990)), entry('o3', 'z'.repeat(7990)),
      entry('1', 'R', 'read_project_document'), entry('2', 'S', 'read_project_document')];
    const candidate = original.map(e => ({ ...e }));
    const map: DeferredReadReceipts = new Map();
    defer(map, '1', 'R');
    defer(map, '2', 'S');
    optionalApi.assertToolResultBodyBudget!(candidate);
    const acknowledged: string[] = [];
    let attempts = 0;
    const count = await settleReadReceipts(original, candidate, map, async r => {
      attempts++;
      if (attempts === 2) throw new SourceReadSnapshotError();
      acknowledged.push(r.documentId);
    }, { onSourceRefused: () => {
      withdrawSourceReadResult(candidate, '1');
      withdrawSourceReadResult(candidate, '2');
    } });
    expect(count).toBe(1);
    expect(acknowledged).toEqual([snapshot('1', 'R').documentId]);
    expect(attempts).toBe(2);
    expect(sum(candidate)).toBeGreaterThan(24_000);
    for (const e of candidate.slice(3)) {
      expect(JSON.parse(e.content)).toMatchObject({ sourceContext: 'not_admitted', legacyReceiptOutcome: 'unconfirmed' });
      expect(JSON.parse(e.content)).not.toHaveProperty('receiptRecorded');
    }
    const before = candidate.map(e => ({ ...e }));
    expect(() => optionalApi.assertToolResultBodyBudget!(candidate)).toThrow(expect.objectContaining({ code: 'ANA_TOOL_RESULT_BUDGET_EXCEEDED' }));
    expect(candidate).toEqual(before);
    expect(acknowledged).toHaveLength(1);
    expect(map.size).toBe(0);
  });
});
