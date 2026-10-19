/**
 * AdvancedRAGPipeline.expandContext, vault branch: the neighbour window becomes
 * one exact source span (docs/evidence/D2-PASSAGE-CONTEXT/2026-10-19/CONTRACT.md),
 * never chunk texts joined with '\n\n'.
 *
 * Written from the contract alone. Driven like rag-context-expansion.test.ts
 * (a prototype instance with a stub pool); the vault branch reaches the stub
 * through withTenantContext's pool.connect(). The stub reads the statement's
 * SELECT list and answers under the names it asks for, and emulates the
 * contract's `CASE WHEN c.id = $hit THEN d.extracted_text END` by returning
 * the document text on the row whose id equals that parameter, and only there.
 */
import { describe, expect, it, vi } from 'vitest';
import { AdvancedRAGPipeline, type RetrievedDocument } from '../advancedRAGPipeline';
import { chunkExtractedText } from '../vault/document-chunking.service';
import { draftSourceIdentityForText } from '../ana/draft-source-identity';

const ORG_UUID = '20000000-0000-4000-8000-000000000001';
const DOC = '30000000-0000-4000-8000-000000000001';
const HASH = 'b'.repeat(64);
const chunkId = (i: number) => `40000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const NEIGHBOUR_SQL = /FROM\s+vault\.document_chunks\b/i;

type Row = Record<string, unknown>;
type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: Row[] }>;
type Expanded = RetrievedDocument & { passageContext?: unknown; hitSpan?: unknown };
type WithExpand = {
  pool: { query: QueryFn; connect: () => Promise<{ query: QueryFn; release: () => void }> };
  expandContext(documents: RetrievedDocument[], window: number, organizationUuid?: string, organizationId?: number): Promise<Expanded[]>;
};
interface StoredChunk { id: string; chunkIndex: number; charStart: number | null; charEnd: number | null; text: string }

/** 100 code units ending '. ', so the chunker cuts at sentences; never '\n\n'. */
function sentence(n: number, body?: string): string {
  const head = body ?? `Sentence ${String(n).padStart(3, '0')} of the study report records a routine observation`;
  return `${head} ${'-'.repeat(98)}`.slice(0, 98) + '. ';
}

/** Header in chunk 4, 12/40 (30%) in chunk 5, N=40 (ITT) in chunk 6, from the real chunker. */
function splitFixture() {
  const T = Array.from({ length: 40 }, (_, i) => {
    if (i === 19) return sentence(i, 'Table 14.2.1 Primary efficacy responder analysis');
    if (i === 22) return sentence(i, 'Responders at week 12 were 12/40 (30%) of randomised participants');
    if (i === 26) return sentence(i, 'Analysis population N=40 (ITT) as randomised and dosed');
    return sentence(i);
  }).join('');
  const window: StoredChunk[] = chunkExtractedText(T, { maxChars: 600, overlapChars: 150 })
    .filter(c => c.index >= 4 && c.index <= 6)
    .map(c => ({ id: chunkId(c.index), chunkIndex: c.index, charStart: c.charStart, charEnd: c.charEnd, text: c.text }));
  const [c4, c5, c6] = window;
  return { T, window, c4, c5, c6 };
}

function selectItems(sql: string): string[] {
  const list = /SELECT\s+([\s\S]*?)\s+FROM\s+vault\.document_chunks\b/i.exec(sql)?.[1] ?? '';
  const items: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of list) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { items.push(current.trim()); current = ''; } else current += ch;
  }
  if (current.trim()) items.push(current.trim());
  return items;
}
const expressionOf = (item: string) => item.replace(/\s+AS\s+"?\w+"?\s*$/i, '').trim();
function outputName(item: string): string {
  const alias = /\s+AS\s+"?(\w+)"?\s*$/i.exec(item)?.[1];
  if (alias) return alias;
  if (/^CASE\b/i.test(item)) return 'case';
  return /(\w+)(?:::\w+)?$/.exec(item)?.[1] ?? item;
}
function selectedName(sql: string, column: string): string | null {
  const re = new RegExp(`^${column.replace('.', '\\.')}(?:::\\w+)?$`, 'i');
  const item = selectItems(sql).find(i => re.test(expressionOf(i)));
  return item ? outputName(item) : null;
}
const HIT_CASE = /^CASE\s+WHEN\s+c\.id(?:::\w+)?\s*=\s*\$(\d+)(?:::\w+)?\s+THEN\s+d\.extracted_text(?:\s+ELSE\s+NULL)?\s+END$/i;
function hitTextColumn(sql: string): { name: string; param: number } | null {
  const item = selectItems(sql).find(i => HIT_CASE.test(expressionOf(i)));
  return item ? { name: outputName(item), param: Number(HIT_CASE.exec(expressionOf(item))?.[1]) } : null;
}

/** Rows as Postgres would return them for the statement the pipeline actually sent. */
function rowsFor(chunks: StoredChunk[], extractedText: string | null) {
  return (sql: string, params: unknown[]): Row[] => {
    const [lo, hi] = [params[1], params[2]];
    const hitText = hitTextColumn(sql);
    return chunks.filter(c => typeof lo !== 'number' || typeof hi !== 'number' || (c.chunkIndex >= lo && c.chunkIndex <= hi))
      .map(c => {
        const row: Row = {};
        const values: Array<[string, unknown]> = [['c.id', c.id], ['c.chunk_index', c.chunkIndex], ['c.char_start', c.charStart],
          ['c.char_end', c.charEnd], ['c.chunk_text', c.text], ['d.content_hash', HASH]];
        for (const [column, value] of values) {
          row[column.slice(2)] = value;
          const name = selectedName(sql, column);
          if (name) row[name] = value;
        }
        if (hitText) row[hitText.name] = c.id === params[hitText.param - 1] ? extractedText : null;
        return row;
      });
  };
}

function pipeline(rows: (sql: string, params: unknown[]) => Row[]) {
  const query = vi.fn(async (sql: string, params: unknown[] = []) => ({ rows: NEIGHBOUR_SQL.test(sql) ? rows(sql, params) : [] }));
  const p = Object.create(AdvancedRAGPipeline.prototype) as WithExpand;
  p.pool = { query, connect: async () => ({ query, release: () => undefined }) };
  return { p, query };
}

function vaultHit(hit: StoredChunk): RetrievedDocument {
  return { id: hit.id, chunkId: hit.id, documentId: DOC, contentHash: HASH, content: hit.text, title: 'Clinical study report',
    atomType: 'vault_chunk', initialScore: 0.6, finalScore: 0.6, chunkIndex: hit.chunkIndex };
}

function neighbourStatement(query: ReturnType<typeof pipeline>['query']): [string, unknown[]] {
  const calls = query.mock.calls.filter(([sql]) => NEIGHBOUR_SQL.test(sql));
  expect(calls).toHaveLength(1);
  return [calls[0][0], calls[0][1] ?? []];
}

const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe('expandContext vault branch: the statement', () => {
  it('selects chunk ids, indices and offsets, and the extracted text on the hit row only', async () => {
    const { T, window, c5 } = splitFixture();
    const { p, query } = pipeline(rowsFor(window, T));
    await p.expandContext([vaultHit(c5)], 1, ORG_UUID);
    const [sql, params] = neighbourStatement(query);
    for (const column of ['c.id', 'c.chunk_index', 'c.char_start', 'c.char_end']) {
      expect(selectedName(sql, column), `${column} is selected`).not.toBeNull();
    }
    const hitText = hitTextColumn(sql);
    expect(hitText, 'CASE WHEN c.id = $hit THEN d.extracted_text END').not.toBeNull();
    expect(params[(hitText?.param ?? 0) - 1]).toBe(c5.id);
    expect(selectedName(sql, 'd.extracted_text'), 'the document text is not selected on every row').toBeNull();
    // Every existing tenant, disposition, programme and supersession predicate stays.
    expect(sql).toMatch(/c\.chunk_index BETWEEN \$2 AND \$3/);
    expect(params.slice(0, 4)).toEqual([DOC, 4, 6, ORG_UUID]);
    for (const predicate of ['d.deleted_at IS NULL', 'document_data_dispositions', 'p.deleted_at IS NULL', 'vault.documents succ']) {
      expect(sql).toContain(predicate);
    }
  });

  it('pins the content hash when the hit carries one, even without a source read scope', async () => {
    const { T, window, c5 } = splitFixture();
    const { p, query } = pipeline(rowsFor(window, T));
    await p.expandContext([vaultHit(c5)], 1, ORG_UUID);
    const [sql, params] = neighbourStatement(query);
    const pin = /d\.content_hash\s*=\s*\$(\d+)/.exec(sql);
    expect(pin, 'AND d.content_hash = $n').not.toBeNull();
    expect(params[Number(pin?.[1]) - 1]).toBe(HASH);
  });
});

describe('expandContext vault branch: the expanded text', () => {
  it('is the exact source span: the overlap once, no invented seam, an identity that verifies', async () => {
    const { T, window, c4, c5, c6 } = splitFixture();
    const { p } = pipeline(rowsFor(window, T));
    const [out] = await p.expandContext([vaultHit(c5)], 1, ORG_UUID);
    const span = { start: c4.charStart ?? -1, end: c6.charEnd ?? -1, totalChars: T.length };
    expect(out.expandedContent).toBe(T.slice(span.start, span.end));
    expect(occurrences(out.expandedContent ?? '', T.slice(c5.charStart ?? 0, c4.charEnd ?? 0))).toBe(1);
    expect(occurrences(out.expandedContent ?? '', T.slice(c6.charStart ?? 0, c5.charEnd ?? 0))).toBe(1);
    expect(out.expandedContent).not.toContain('\n\n');
    expect(out.content).toBe(c5.text);
    expect(out.hitSpan).toEqual({ start: c5.charStart, end: c5.charEnd });
    expect(out.passageContext).toEqual({
      status: 'available', text: T.slice(span.start, span.end), chunkRange: [4, 6], clipped: false,
      reference: { documentId: DOC, contentHash: HASH, span, ...draftSourceIdentityForText(T, span) },
    });
  });

  it('legacy chunks without offsets keep the hit text alone and say why', async () => {
    const { T, window, c5 } = splitFixture();
    const legacy = window.map(c => ({ ...c, charStart: null, charEnd: null }));
    const { p } = pipeline(rowsFor(legacy, T));
    const out = await p.expandContext([vaultHit(c5)], 1, ORG_UUID);
    expect(out).toHaveLength(1);
    expect(out[0].expandedContent).toBeUndefined();
    expect(out[0].content).toBe(c5.text);
    expect(out[0].passageContext).toEqual({ status: 'unavailable', reason: 'no_offsets' });
    expect(out[0].hitSpan).toBeNull();
  });

  it('offsets that do not address the current text are refused, never shifted', async () => {
    const { T, window, c5 } = splitFixture();
    const { p } = pipeline(rowsFor(window, `\n  ${T}`));
    const out = await p.expandContext([vaultHit(c5)], 1, ORG_UUID);
    expect(out).toHaveLength(1);
    expect(out[0].expandedContent).toBeUndefined();
    expect(out[0].passageContext).toEqual({ status: 'unavailable', reason: 'basis_mismatch' });
  });

  it('a re-chunked document contributes no neighbours from the new chunk set', async () => {
    const { T, window, c5 } = splitFixture();
    const rechunked = window.map(c => ({ ...c, id: chunkId(100 + c.chunkIndex) }));
    const { p } = pipeline(rowsFor(rechunked, T));
    const out = await p.expandContext([vaultHit(c5)], 1, ORG_UUID);
    for (const doc of out) {
      expect(doc.expandedContent).toBeUndefined();
      expect(doc.passageContext).toEqual({ status: 'unavailable', reason: 'chunk_set_changed' });
    }
  });
});

describe('expandContext: unchanged behaviour (controls)', () => {
  it('drops a vault candidate whose neighbour query returns no rows', async () => {
    const { c5 } = splitFixture();
    const { p } = pipeline(() => []);
    expect(await p.expandContext([vaultHit(c5)], 1, ORG_UUID)).toEqual([]);
  });

  it('rag_chunk expansion still joins its window and gains no passage context', async () => {
    const query = vi.fn(async () => ({ rows: [{ content: 'prev' }, { content: 'hit' }, { content: 'next' }] }));
    const p = Object.create(AdvancedRAGPipeline.prototype) as WithExpand;
    p.pool = { query, connect: async () => ({ query, release: () => undefined }) };
    const [out] = await p.expandContext([{ id: 'r', documentId: 'doc-1', chunkId: 'r', content: 'chunk-r', title: 't',
      atomType: 'rag_chunk', initialScore: 0.6, finalScore: 0.6, chunkIndex: 5 }], 1);
    expect(out.expandedContent).toBe('prev\n\nhit\n\nnext');
    expect(out.passageContext).toBeUndefined();
    expect(out.hitSpan).toBeUndefined();
  });
});
