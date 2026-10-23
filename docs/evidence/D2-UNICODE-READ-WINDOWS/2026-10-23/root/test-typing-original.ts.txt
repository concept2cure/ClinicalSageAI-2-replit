/** Actual registered read handler/fitter/deferral; synthetic admitted Vault.
 * No database persistence, native RLS, provider or deployment proof is claimed. */
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '../AnaToolExecutor.js';

type Candidate = { size: number; result: string };
type Fitted = Candidate & { asked: number; candidates: Candidate[] };
const h = vi.hoisted(() => ({ historical: false, fits: [] as Fitted[] }));
const vaultModule = vi.hoisted(() => () => import('./support/read-delivery-vault.js'));

function readService(service: ReturnType<typeof import('./support/read-delivery-vault.js').serviceMock>) {
  return { ...service, loadDocumentForActor: async (input: Parameters<typeof service.loadDocumentForActor>[0]) => {
    const doc = await service.loadDocumentForActor(input);
    if (!doc || !h.historical) return doc;
    return { ...doc, isCurrent: false, sourceAccess: { ...doc.sourceAccess, currentVersion: false,
      currentUseEligible: false, receiptEligible: false, notice: 'Historical source; not current evidence.' } };
  } };
}

vi.mock('../catalog-scope.js', async original =>
  (await vaultModule()).catalogScopeMock(await original<Record<string, unknown>>()),
);
vi.mock('../../c2c/current-program-access.js', async original =>
  (await import('./support/source-read-tool-fixture.js'))
    .syntheticProgramAccessMock(await original<Record<string, unknown>>()),
);
vi.mock('../../../db.js', () => ({ pool: { query: vi.fn(async () => ({ rows: [] })) }, getPool: () => ({}), db: {} }));
vi.mock('../../vault/document-catalog.service.js', async () => readService((await vaultModule()).serviceMock()));
vi.mock('../document-tools-shared.js', async original => {
  const gates = (await vaultModule()).gatesMock(await original<Record<string, unknown>>());
  return { ...gates, requireDocumentAccess: async (context: Parameters<typeof gates.requireDocumentAccess>[0], tool: string) => {
    const admitted = await gates.requireDocumentAccess(context, tool);
    return 'svc' in admitted ? { ...admitted, svc: readService(admitted.svc) } : admitted;
  } };
});
vi.mock('../read-receipts.js', async original => {
  const real = await original<typeof import('../read-receipts.js')>();
  return { ...real, fitReadWindow: (render: (size: number) => string, asked: number) => {
    const candidates: Candidate[] = [];
    const fit = real.fitReadWindow(size => {
      const result = render(size);
      candidates.push({ size, result });
      return result;
    }, asked);
    h.fits.push({ ...fit, asked, candidates });
    return fit;
  } };
});

import { registerDocumentCatalogHandlers } from '../document-catalog-tools.js';
import { RESULT_BUDGET } from '../agentic-loop.js';
import { readReceiptContext, type DeferredReadReceipts } from '../read-receipts.js';
import { addDocument, resetVault, receiptsFor } from './support/read-delivery-vault.js';

const DOC = '10000000-0000-4000-8000-000000000041';
const TOOL = 'unicode-handler-read';
const ORG: ToolContext = { organizationId: 42, userId: 7, threadId: 'unicode-handler-thread' };
const handlers = new Map<string, (input: Record<string, unknown>, context?: ToolContext) => Promise<string>>();
registerDocumentCatalogHandlers((name, handler) => handlers.set(name, handler));
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
interface ReadResult {
  ok: boolean; window: { start: number; end: number; text: string }; totalChars: number;
  extractedTextSha256: string; message: string;
  coverage: { coveredChars: number; complete: boolean; prospective: boolean; providerServedProof: boolean };
  comprehension?: unknown; comprehensionWithheld?: string;
}

async function read(input: Record<string, unknown> = {}, host = true) {
  const deferred: DeferredReadReceipts = new Map();
  const context = host ? { ...ORG, ...readReceiptContext(deferred, TOOL) } : ORG;
  const raw = await handlers.get('read_project_document')!({ document_id: DOC, ...input }, context);
  return { raw, result: JSON.parse(raw) as ReadResult, deferred, fit: h.fits.at(-1) };
}

function expectExact(source: string, result: ReadResult): void {
  expect(result.ok).toBe(true);
  expect(result.totalChars).toBe(source.length);
  expect(result.extractedTextSha256).toBe(sha(source));
  expect(result.window.text).toBe(source.slice(result.window.start, result.window.end));
  expect(result.window.text.length).toBe(result.window.end - result.window.start);
  expect(Buffer.from(result.window.text, 'utf8').toString('utf8')).toBe(result.window.text);
}

function expectDeferred(call: Awaited<ReturnType<typeof read>>): void {
  const { raw, result, deferred } = call;
  const span = { start: result.window.start, end: result.window.end };
  expect(deferred.get(TOOL)).toMatchObject({ documentId: DOC, span, result: raw, resultSha256: sha(raw),
    sourceSnapshot: { organizationId: 42, userId: 7, documentId: DOC, span,
      totalChars: result.totalChars, extractedTextSha256: result.extractedTextSha256 } });
  expect(result.coverage.coveredChars).toBe(span.end - span.start);
  expect(result.coverage.prospective).toBe(true);
  expect(result.coverage.providerServedProof).toBe(false);
  expect(receiptsFor(DOC)).toEqual([]);
}

beforeEach(() => { resetVault(); h.historical = false; h.fits = []; });

describe('registered Vault reads preserve complete Unicode characters', () => {
  it('ends before a split pair when preceding text still fits', async () => {
    addDocument(DOC, 'A🧬B');
    const call = await read({ max_chars: 2 });
    expect(call.result.window).toEqual({ start: 0, end: 1, text: 'A' });
    expectExact('A🧬B', call.result); expectDeferred(call);
  });

  it('moves a requested low-surrogate start backward rather than skipping its character', async () => {
    addDocument(DOC, 'A🧬B');
    const call = await read({ offset: 2, max_chars: 2 });
    expect(call.result.window).toEqual({ start: 1, end: 3, text: '🧬' });
    expectExact('A🧬B', call.result); expectDeferred(call);
  });

  it.each([1, 2])('returns one whole pair for max_chars1 from requested offset%i', async offset => {
    addDocument(DOC, 'A🧬B');
    const call = await read({ offset, max_chars: 1 });
    expect(call.result.window).toEqual({ start: 1, end: 3, text: '🧬' });
    expectExact('A🧬B', call.result); expectDeferred(call);
  });

  it('uses actual shortened bounds when nominal fit.size is larger', async () => {
    addDocument(DOC, 'A🧬B');
    const call = await read({ max_chars: 2 });
    expect(call.fit?.size).toBe(2);
    expect(call.result.window.end - call.result.window.start).toBe(1);
    expectDeferred(call);
  });

  it('uses actual expanded bounds when one whole pair exceeds nominal fit.size', async () => {
    addDocument(DOC, '🧬');
    const call = await read({ max_chars: 1 });
    expect(call.fit?.size).toBe(1);
    expect(call.result.window).toEqual({ start: 0, end: 2, text: '🧬' });
    expect(call.result.coverage.complete).toBe(true);
    expectDeferred(call);
  });

  it('retains UTF-16 totals and offsets for Japanese and scientific supplementary text', async () => {
    const source = '𠮷𝛼🧬B'; addDocument(DOC, source);
    const call = await read({ offset: 2, max_chars: 3 });
    expect(call.result.window).toEqual({ start: 2, end: 4, text: '𝛼' });
    expect(call.result.totalChars).toBe(7);
    expectExact(source, call.result); expectDeferred(call);
  });

  it('walks by actual end at max_chars1 without gaps, code-point reindexing or stalled progress', async () => {
    const source = '\ufeffA𠮷🧬𝛼e\u0301日本\r\nZ'; addDocument(DOC, source);
    const delivered: string[] = [];
    for (let offset = 0; offset < source.length;) {
      const call = await read({ offset, max_chars: 1 });
      expectExact(source, call.result); expectDeferred(call);
      expect(call.result.window.start).toBe(offset);
      expect(call.result.window.end).toBeGreaterThan(offset);
      delivered.push(call.result.window.text);
      offset = call.result.window.end;
    }
    expect(delivered.join('')).toBe(source);
  });
});

describe('Unicode read windows compose with the existing serialized budget fitter', () => {
  it('keeps escaped Unicode text intact after budget-driven candidate shrinking', async () => {
    const source = '🧬"\\\n𠮷𝛼'.repeat(1600); addDocument(DOC, source);
    const call = await read();
    expect(call.raw.length).toBeLessThanOrEqual(RESULT_BUDGET);
    expect(call.result.window.end).toBeLessThan(RESULT_BUDGET);
    expect(call.fit!.candidates.length).toBeGreaterThan(2);
    expectExact(source, call.result); expectDeferred(call);
  });

  it('fits control-heavy text by serialized size without losing the actual source span', async () => {
    const source = '\u0001\n"\\🧬'.repeat(1600); addDocument(DOC, source);
    const call = await read({ max_chars: RESULT_BUDGET });
    expect(call.raw.length).toBeLessThanOrEqual(RESULT_BUDGET);
    expect(call.result.window.text.length).toBeLessThan(RESULT_BUDGET / 2);
    expectExact(source, call.result); expectDeferred(call);
  });

  it('records the selected span even when the fitter last rendered a rejected larger candidate', async () => {
    const source = '🧬"\\\n'.repeat(2400); addDocument(DOC, source);
    let witnessedRejectedLastCandidate = false;
    for (let requested = 4000; requested <= 4032 && !witnessedRejectedLastCandidate; requested++) {
      const call = await read({ max_chars: requested });
      const last = call.fit!.candidates.at(-1)!;
      if (last.size <= call.fit!.size || last.result === call.raw) continue;
      witnessedRejectedLastCandidate = true;
      expect(last.result.length).toBeGreaterThan(RESULT_BUDGET);
      expect(call.fit!.result).toBe(call.raw);
      expectExact(source, call.result); expectDeferred(call);
    }
    expect(witnessedRejectedLastCandidate).toBe(true);
  });

  it('withholds oversized comprehension through the same fitter and retains an intact useful window', async () => {
    const source = '𠮷🧬𝛼'.repeat(2200);
    addDocument(DOC, source, { status: 'cataloged', documentKind: 'Report', summary: 's'.repeat(4500) });
    const call = await read();
    expect(call.result.comprehension).toBeUndefined();
    expect(call.result.comprehensionWithheld).toContain('too long to send beside');
    expect(call.result.window.text.length).toBeGreaterThan(1000);
    expect(h.fits).toHaveLength(2);
    expect(call.raw.length).toBeLessThanOrEqual(RESULT_BUDGET);
    expectExact(source, call.result); expectDeferred(call);
  });
});

describe('Unicode correction preserves existing read controls', () => {
  it.each(['ABCDEFGH', '日本語αβ測定値'])('preserves exact existing ASCII/BMP window for %s', async source => {
    addDocument(DOC, source);
    const call = await read({ offset: 2, max_chars: 4 });
    expect(call.result.window).toEqual({ start: 2, end: 6, text: source.slice(2, 6) });
    expectExact(source, call.result); expectDeferred(call);
  });

  it('keeps finite flooring, negative-offset clamping and minimum requested size', async () => {
    addDocument(DOC, 'ABCDE');
    const call = await read({ offset: -3.8, max_chars: 0.4 });
    expect(call.result.window).toEqual({ start: 0, end: 1, text: 'A' });
    expectDeferred(call);
  });

  it('keeps nonfinite request defaults and a short source verbatim', async () => {
    const source = '\ufeff 𠮷 \r\n '; addDocument(DOC, source);
    const call = await read({ offset: Number.NaN, max_chars: Number.POSITIVE_INFINITY });
    expect(call.result.window).toEqual({ start: 0, end: source.length, text: source });
    expectExact(source, call.result); expectDeferred(call);
  });

  it('refuses a past-end offset without returning text or deferring a receipt', async () => {
    addDocument(DOC, 'A🧬B');
    const call = await read({ offset: 4 });
    expect(call.result.ok).toBe(false); expect(call.result.window).toBeUndefined();
    expect(call.deferred.size).toBe(0);
    expect(JSON.parse(call.raw).error).toContain('beyond');
  });

  it('outside a settling host returns intact text but no prospective new coverage', async () => {
    const source = 'A🧬B'; addDocument(DOC, source);
    const call = await read({ offset: 2, max_chars: 1 }, false);
    expectExact(source, call.result);
    expect(call.result.coverage).toMatchObject({ coveredChars: 0, prospective: false });
    expect(call.deferred.size).toBe(0); expect(receiptsFor(DOC)).toEqual([]);
  });

  it('historical reads stay disclosed and earn no current-source receipt', async () => {
    const source = 'A🧬B'; addDocument(DOC, source); h.historical = true;
    const call = await read({ offset: 2, max_chars: 1 });
    expectExact(source, call.result);
    expect(call.result.message).toContain('Historical');
    expect(call.result.coverage.prospective).toBe(false);
    expect(call.deferred.size).toBe(0);
  });

  it('preserves complete source characters across a deterministic 180-window corpus', async () => {
    let cases = 0;
    for (const pair of ['𠮷', '🧬', '𝛼']) {
      const source = `A${pair}B${pair}C`; addDocument(DOC, source);
      for (let offset = 0; offset < 6; offset++) {
        for (let size = 1; size <= 10; size++) {
          const call = await read({ offset, max_chars: size });
          expectExact(source, call.result); expectDeferred(call);
          expect(call.result.window.start).toBeLessThanOrEqual(offset);
          expect(call.result.window.start).toBeGreaterThanOrEqual(offset - 1);
          expect(call.result.window.end).toBeGreaterThan(call.result.window.start);
          cases++;
        }
      }
    }
    expect(cases).toBe(180);
  });
});
