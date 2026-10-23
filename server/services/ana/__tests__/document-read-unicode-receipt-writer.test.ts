/**
 * Real registered reads -> private deferral -> settlement -> guarded legacy
 * receipt writer and PGlite transaction/INSERT SQL. Actor/source admission is
 * synthetic and explicit. Minimal owner-mode tables do not qualify native RLS,
 * concurrent locking, durable V2 admission or any provider delivery.
 */
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '../AnaToolExecutor.js';
import type { CatalogDocumentRow } from '../../vault/document-catalog.service.js';

const state = vi.hoisted(() => ({ sourceText: '', writerText: '', queries: [] as string[] }));
const vaultModule = vi.hoisted(() => () => import('./support/read-delivery-vault.js'));
vi.mock('../catalog-scope.js', async original =>
  (await vaultModule()).catalogScopeMock(await original<Record<string, unknown>>()));
vi.mock('../../c2c/current-program-access.js', async original =>
  (await import('./support/source-read-tool-fixture.js'))
    .syntheticProgramAccessMock(await original<Record<string, unknown>>()));
vi.mock('../../../db.js', () => ({ pool: { query: async () => ({ rows: [] }) }, getPool: () => ({}), db: {} }));
vi.mock('../../vault/document-catalog.service.js', async () => (await vaultModule()).serviceMock());
vi.mock('../document-tools-shared.js', async original =>
  (await vaultModule()).gatesMock(await original<Record<string, unknown>>()));

import { registerDocumentCatalogHandlers } from '../document-catalog-tools.js';
import { notDeliveredResult, RESULT_BUDGET, type ToolResultEntry } from '../agentic-loop.js';
import { deferReadReceipt, readReceiptContext, settleReadReceipts, type DeferredReadReceipt, type DeferredReadReceipts } from '../read-receipts.js';
import { writeGuardedReadReceipt, type SourceReadReceiptDependencies } from '../source-read-receipt.js';
import { runWithTenantScope } from '../../../db/tenantStore.js';
import { addDocument, resetVault } from './support/read-delivery-vault.js';

const DOC = '10000000-0000-4000-8000-000000000081';
const PROGRAM = '90000000-0000-4000-8000-000000000001';
const TOOL = 'unicode-read-writer';
const ORG: ToolContext = { organizationId: 42, userId: 7, threadId: 'unicode-writer-thread' };
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
let database: PGlite;
const handlers = new Map<string, (input: Record<string, unknown>, context?: ToolContext) => Promise<string>>();
registerDocumentCatalogHandlers((name, handler) => handlers.set(name, handler));

async function query(sql: string, values: unknown[] = []) {
  state.queries.push(sql);
  const result = await database.query(sql, values);
  return { rows: result.rows, rowCount: result.rows.length || result.affectedRows || 0 };
}

function writerDocument(): CatalogDocumentRow {
  return { id: DOC, organizationId: 42, isCurrent: true, programId: PROGRAM,
    contentHash: digest(state.sourceText), extractedText: state.writerText, disposition: null,
    documentCode: null, documentTitle: 'Synthetic admitted source', documentType: null,
    fileName: 'source.txt', mimeType: 'text/plain', folderId: null, evidenceKind: null,
    ctdSection: null, placementStatus: 'unfiled', catalog: {
      contentHash: digest(state.sourceText), status: 'extracted', extractionMethod: 'utf8',
      extractionConfidence: null, extractionError: null, charCount: state.writerText.length,
      wordCount: null, pageCount: null, documentKind: null, purpose: null,
      summary: null, keyData: null, catalogedAt: null,
    } };
}

const dependencies: SourceReadReceiptDependencies = {
  connect: async () => ({ query, release: () => undefined }),
  admitScope: async () => ({ organizationId: 42, userId: 7, role: 'viewer', projectId: 3,
    programId: PROGRAM, accessibleProgramIds: [PROGRAM], actorFiltered: true }),
  holdActor: async () => ({ role: 'viewer', projectId: 3 }),
  loadDocument: async () => writerDocument(),
};

interface ReadBody { ok: boolean; window: { start: number; end: number; text: string }; totalChars: number }
async function read(text: string, input: Record<string, unknown>) {
  resetVault();
  state.sourceText = text; state.writerText = text;
  addDocument(DOC, text);
  const deferred: DeferredReadReceipts = new Map();
  const raw = await handlers.get('read_project_document')!({ document_id: DOC, ...input },
    { ...ORG, ...readReceiptContext(deferred, TOOL) });
  const body = JSON.parse(raw) as ReadBody;
  expect(body.ok).toBe(true);
  expect(deferred.size).toBe(1);
  return { raw, body, deferred };
}
const entry = (content: string): ToolResultEntry => ({ tool_use_id: TOOL, name: 'read_project_document', content });
async function settle(readResult: Awaited<ReturnType<typeof read>>, admitted = readResult.raw) {
  const write = vi.fn((receipt: DeferredReadReceipt) => writeGuardedReadReceipt(receipt, dependencies));
  const count = await runWithTenantScope({ tenantId: '42', role: 'viewer', source: 'request', caller: 'unicode-read-writer-test' },
    () => settleReadReceipts([entry(readResult.raw)], [entry(admitted)], readResult.deferred, write));
  return { count, write };
}
async function rows() {
  // tenant-isolation-safe: isolated fixture has exactly one admitted document/actor.
  return (await database.query<{ char_start: number; char_end: number; read_by: number; thread_id: string }>(
    'SELECT char_start, char_end, read_by, thread_id FROM vault.document_read_receipts WHERE document_id=$1 ORDER BY id', [DOC])).rows;
}

beforeAll(async () => {
  database = new PGlite();
  await database.exec(`
    CREATE SCHEMA vault;
    CREATE TABLE vault.documents (id uuid PRIMARY KEY);
    CREATE TABLE vault.document_catalog (document_id uuid PRIMARY KEY);
    CREATE TABLE vault.document_read_receipts (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      document_id uuid NOT NULL, content_hash text NOT NULL,
      char_start integer NOT NULL, char_end integer NOT NULL,
      read_by integer NOT NULL, thread_id text
    );
  `);
});
beforeEach(async () => {
  vi.stubEnv('ANA_DURABLE_SOURCE_READ_RECEIPTS', '0');
  // tenant-isolation-safe: only this test's one document/actor exists in this isolated table.
  await database.exec('TRUNCATE vault.document_read_receipts');
  state.queries.length = 0;
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => { await database?.close(); });

describe('actual safe windows reach the guarded writer and SQL row unchanged', () => {
  it.each([
    { name: 'split requested start', offset: 2, maxChars: 2, window: { start: 1, end: 3, text: '🧬' } },
    { name: 'one-unit whole-character minimum', offset: 1, maxChars: 1, window: { start: 1, end: 3, text: '🧬' } },
    { name: 'split requested end', offset: 0, maxChars: 2, window: { start: 0, end: 1, text: 'A' } },
  ])('$name', async ({ offset, maxChars, window }) => {
    const { start, end, text } = window;
    const result = await read('A🧬B', { offset, max_chars: maxChars });
    const receipt = result.deferred.get(TOOL)!;
    const saved = await settle(result);
    expect(saved.count).toBe(1);
    expect(saved.write).toHaveBeenCalledOnce();
    expect(result.body.window).toEqual({ start, end, text });
    expect(receipt.span).toEqual({ start, end });
    expect(receipt.sourceSnapshot.span).toEqual({ start, end });
    expect(receipt.result).toBe(result.raw);
    expect(await rows()).toEqual([{ char_start: start, char_end: end, read_by: 7, thread_id: ORG.threadId }]);
    expect(state.queries).toContain('COMMIT');
    expect(Buffer.from(result.body.window.text).toString('utf8')).toBe(result.body.window.text);
  });

  it('fits escaped text without a split and persists every selected actual span', async () => {
    for (const prefix of [0, 1, 2, 3]) {
      const text = 'a'.repeat(prefix) + '\\'.repeat(1200) + '𠮷'.repeat(1800) + 'z';
      const result = await read(text, { max_chars: RESULT_BUDGET });
      const span = result.deferred.get(TOOL)!.span;
      expect(result.raw.length).toBeLessThanOrEqual(RESULT_BUDGET);
      expect((await settle(result)).count).toBe(1);
      expect(result.body.window.text).toBe(text.slice(span.start, span.end));
      expect(Buffer.from(result.body.window.text).toString('utf8')).toBe(result.body.window.text);
      expect((await rows()).at(-1)).toMatchObject({ char_start: span.start, char_end: span.end });
    }
  });
});

describe('guarded writer preserves the existing admission controls', () => {
  it('retains an ordinary ASCII result and exact legacy SQL span', async () => {
    const result = await read('ABCDE', { offset: 1, max_chars: 3 });
    expect((await settle(result)).count).toBe(1);
    expect(result.body.window).toEqual({ start: 1, end: 4, text: 'BCD' });
    expect(await rows()).toEqual([{ char_start: 1, char_end: 4, read_by: 7, thread_id: ORG.threadId }]);
  });

  it('writes nothing when the current extraction changed after the handler returned', async () => {
    const result = await read('A🧬B', { offset: 0, max_chars: 4 });
    state.writerText = 'Changed extraction.';
    expect((await settle(result)).count).toBe(0);
    expect(await rows()).toEqual([]);
    expect(state.queries).toContain('ROLLBACK');
    expect(state.queries).not.toContain('COMMIT');
  });

  it.each(['amended', 'withheld'] as const)('writes nothing for a %s host result', async kind => {
    const result = await read('A🧬B', { offset: 0, max_chars: 4 });
    const admitted = kind === 'amended' ? result.raw + ' ' : notDeliveredResult(result.body.window.start);
    const saved = await settle(result, admitted);
    expect(saved.count).toBe(0);
    expect(saved.write).not.toHaveBeenCalled();
    expect(await rows()).toEqual([]);
  });

  it('refuses an internally deferred span that disagrees with the unchanged rendered payload', async () => {
    const result = await read('A🧬B', { offset: 0, max_chars: 4 });
    const original = result.deferred.get(TOOL)!;
    result.deferred.clear();
    const wrong = { start: 0, end: 3 };
    expect(deferReadReceipt(readReceiptContext(result.deferred, TOOL), { ...original, span: wrong,
      sourceSnapshot: { ...original.sourceSnapshot, span: wrong } })).toBe(true);
    expect((await settle(result)).count).toBe(0);
    expect(await rows()).toEqual([]);
    expect(state.queries).toContain('ROLLBACK');
  });
});
