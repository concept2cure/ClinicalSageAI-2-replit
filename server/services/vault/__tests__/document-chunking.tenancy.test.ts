/**
 * The vault chunk writer reaches vault.document_chunks only through the
 * document's program and the caller's organization. vault.documents has no
 * organization_id of its own, so a bare `WHERE document_id = $1` would let a
 * guessed uuid from another tenant be re-indexed — or wiped — by anyone.
 *
 * P0-11 (SECURITY_AUDIT_2026-09-24 DP-07) adds the ordering: the ownership
 * check runs BEFORE the text is embedded, so a foreign document's text is
 * never sent to an embedding provider under this caller's placement policy,
 * and the embedding call runs under the verified organisation's tenant scope
 * so the provider's placement gate sees that organisation.
 *
 * @module server/services/vault/__tests__/document-chunking.tenancy.test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Call = { sql: string; params: unknown[] };
const calls: Call[] = [];
let owned = true;

function answerOwnership(sql: string) {
  if (/SELECT 1 FROM vault\.documents/.test(sql)) {
    return owned ? { rowCount: 1, rows: [{ '?column?': 1 }] } : { rowCount: 0, rows: [] };
  }
  return null;
}

const client = {
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    const ownership = answerOwnership(sql);
    if (ownership) return ownership;
    if (/INSERT INTO vault\.document_chunks/.test(sql)) return { rowCount: 1, rows: [] };
    return { rowCount: 0, rows: [] };
  }),
  release: vi.fn(),
};

const poolCalls: Call[] = [];
const poolConnect = vi.fn(async () => client);

vi.mock('../../../db.js', () => ({
  pool: {
    connect: poolConnect,
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      poolCalls.push({ sql, params });
      return answerOwnership(sql) ?? { rows: [], rowCount: 0 };
    }),
  },
}));
vi.mock('../../featureToggleService.js', () => ({
  FeatureToggleService: { isFeatureEnabled: vi.fn(async () => true) },
}));

/** Every embedding call the writer makes, with the tenant scope it ran under. */
const embedCalls: Array<{ texts: string[]; tenantId: string | undefined }> = [];
vi.mock('../../enhancedEmbeddingService.js', () => ({
  getEmbeddingService: () => ({
    embedBatch: async (texts: string[]) => {
      const { getTenantScope } = await import('../../../db/tenantStore.js');
      embedCalls.push({ texts, tenantId: getTenantScope()?.tenantId });
      return texts.map(() => ({ embedding: [0.1, 0.2, 0.3] }));
    },
  }),
}));

const DOC = '5b1f0d1e-0000-4000-8000-00000000abcd';
const ORG = 42;

describe('vault chunk writer tenancy', () => {
  beforeEach(() => {
    calls.length = 0;
    poolCalls.length = 0;
    embedCalls.length = 0;
    poolConnect.mockClear();
    owned = true;
  });

  it('refuses a document that is not in the caller\'s organization, writing nothing', async () => {
    owned = false;
    const { chunkAndEmbedDocument } = await import('../document-chunking.service');
    const result = await chunkAndEmbedDocument({ documentId: DOC, organizationId: ORG, text: 'Some extracted text.' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/organization/);
    expect(calls.some(c => /INSERT INTO vault\.document_chunks|DELETE FROM vault\.document_chunks/.test(c.sql))).toBe(false);
    // Refused up front: no transaction is even opened for it.
    expect(poolConnect).not.toHaveBeenCalled();
    expect(calls.map(c => c.sql)).not.toContain('BEGIN');
  });

  /* DP-07: the text of a document the caller does not own was embedded — sent
     to the configured provider under the CALLER's placement policy — before the
     ownership check refused the write. Refusal must come before any egress. */
  it('refuses a foreign document before any embedding call', async () => {
    owned = false;
    const { chunkAndEmbedDocument } = await import('../document-chunking.service');
    const result = await chunkAndEmbedDocument({ documentId: DOC, organizationId: ORG, text: 'Some extracted text.' });
    expect(result.ok).toBe(false);
    expect(embedCalls).toHaveLength(0);
    // The ownership question was asked, bound to the caller's organization.
    const ownership = poolCalls.filter(c => /SELECT 1 FROM vault\.documents/.test(c.sql));
    expect(ownership).toHaveLength(1);
    expect(ownership[0].params).toEqual([DOC, ORG]);
  });

  it('embeds an owned document under that organization\'s tenant scope', async () => {
    const { chunkAndEmbedDocument } = await import('../document-chunking.service');
    const result = await chunkAndEmbedDocument({ documentId: DOC, organizationId: ORG, text: 'Some extracted text.' });
    expect(result).toEqual({ ok: true, chunkCount: 1 });
    expect(embedCalls).toHaveLength(1);
    expect(embedCalls[0].texts).toEqual(['Some extracted text.']);
    expect(embedCalls[0].tenantId).toBe(String(ORG));
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
    embedCalls.length = 0;
    poolConnect.mockClear();
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
