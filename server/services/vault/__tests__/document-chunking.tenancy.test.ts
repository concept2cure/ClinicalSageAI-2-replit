/**
 * The vault chunk writer reaches vault.document_chunks only through the
 * document's program and the caller's organization. vault.documents has no
 * organization_id of its own, so a bare `WHERE document_id = $1` would let a
 * guessed uuid from another tenant be re-indexed — or wiped — by anyone.
 *
 * @module server/services/vault/__tests__/document-chunking.tenancy.test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Call = { sql: string; params: unknown[] };
const calls: Call[] = [];
let owned = true;

const client = {
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/SELECT 1 FROM vault\.documents/.test(sql)) {
      return owned ? { rowCount: 1, rows: [{ '?column?': 1 }] } : { rowCount: 0, rows: [] };
    }
    if (/INSERT INTO vault\.document_chunks/.test(sql)) return { rowCount: 1, rows: [] };
    return { rowCount: 0, rows: [] };
  }),
  release: vi.fn(),
};

const poolCalls: Call[] = [];

vi.mock('../../../db.js', () => ({
  pool: {
    connect: vi.fn(async () => client),
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      poolCalls.push({ sql, params });
      return { rows: [], rowCount: 0 };
    }),
  },
}));
vi.mock('../../featureToggleService.js', () => ({
  FeatureToggleService: { isFeatureEnabled: vi.fn(async () => true) },
}));
vi.mock('../../enhancedEmbeddingService.js', () => ({
  getEmbeddingService: () => ({
    embedBatch: async (texts: string[]) => texts.map(() => ({ embedding: [0.1, 0.2, 0.3] })),
  }),
}));

const DOC = '5b1f0d1e-0000-4000-8000-00000000abcd';
const ORG = 42;

describe('vault chunk writer tenancy', () => {
  beforeEach(() => {
    calls.length = 0;
    poolCalls.length = 0;
    owned = true;
  });

  it('refuses a document that is not in the caller\'s organization, writing nothing', async () => {
    owned = false;
    const { chunkAndEmbedDocument } = await import('../document-chunking.service');
    const result = await chunkAndEmbedDocument({ documentId: DOC, organizationId: ORG, text: 'Some extracted text.' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/organization/);
    expect(calls.some(c => /INSERT INTO vault\.document_chunks|DELETE FROM vault\.document_chunks/.test(c.sql))).toBe(false);
    expect(calls.map(c => c.sql)).toContain('ROLLBACK');
  });

  it('every statement that touches vault.document_chunks is bound to the organization', async () => {
    const { chunkAndEmbedDocument } = await import('../document-chunking.service');
    const result = await chunkAndEmbedDocument({ documentId: DOC, organizationId: ORG, text: 'Some extracted text.' });
    expect(result).toEqual({ ok: true, chunkCount: 1 });
    const touching = calls.filter(c => /vault\.document_chunks/.test(c.sql));
    expect(touching.length).toBeGreaterThanOrEqual(2); // the DELETE and at least one INSERT
    for (const c of touching) {
      expect(c.sql, c.sql).toMatch(/regulatory_programs p ON p\.id = d\.program_id/);
      expect(c.sql, c.sql).toMatch(/p\.organization_id = \$\d+/);
      expect(c.params, c.sql).toContain(ORG);
    }
  });
});

describe('vault chunking ledger tenancy', () => {
  beforeEach(() => {
    calls.length = 0;
    poolCalls.length = 0;
    owned = true;
  });

  /* The writer refuses a foreign document — but the LEDGER write that follows
     it keyed on document_id alone, so the refusal itself was stamped onto the
     other tenant's catalog row: their chunk_status flipped to 'chunk_failed'
     and their chunk_error carried a message about an organization that is not
     theirs. A refusal must leave the other tenant's record untouched. */
  it('a refused foreign document leaves the other tenant\'s ledger row alone', async () => {
    owned = false;
    const { chunkDocumentForIngest } = await import('../document-chunking.service');
    await chunkDocumentForIngest(DOC, ORG, 'Some extracted text.');

    const ledgerWrites = poolCalls.filter(c => /UPDATE vault\.document_catalog/.test(c.sql));
    for (const w of ledgerWrites) {
      expect(w.sql, w.sql).toMatch(/regulatory_programs p ON p\.id = d\.program_id/);
      expect(w.sql, w.sql).toMatch(/p\.organization_id = \$\d+/);
      expect(w.params, w.sql).toContain(ORG);
    }
  });

  it('the ledger write for an owned document is bound to the organization too', async () => {
    const { recordChunkOutcome } = await import('../document-chunking.service');
    await recordChunkOutcome({ documentId: DOC, organizationId: ORG, result: { ok: true, chunkCount: 3 } });
    const ledgerWrites = poolCalls.filter(c => /UPDATE vault\.document_catalog/.test(c.sql));
    expect(ledgerWrites.length).toBe(1);
    expect(ledgerWrites[0].sql).toMatch(/p\.organization_id = \$\d+/);
    expect(ledgerWrites[0].params).toContain(ORG);
  });
});
