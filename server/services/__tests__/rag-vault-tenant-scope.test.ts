/**
 * Vault retrieval carries its own tenant predicate, and refuses without a tenant.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 * Both arms of `searchVaultSimilar` used to carry NO organization predicate at
 * all. Each was annotated `tenant-isolation-safe: RLS-scoped`, delegating the
 * boundary entirely to Postgres row-level security. Three things made that
 * annotation wrong:
 *
 *   1. `organizationUuid` is OPTIONAL on this path, and `withTenantContext`
 *      simply does not set `app.current_org_id` when it is absent — so with no
 *      org, the boundary it names was never established.
 *   2. `vault.documents` and `vault.document_chunks` are ENABLE ROW LEVEL
 *      SECURITY, never FORCE (db/migrations/044c_gcc_vault_schema.sql:112,
 *      migrations/20260905b_vault_document_chunks.sql:76). Postgres does not
 *      apply ENABLE-only policies to the table OWNER.
 *   3. server/db/getDatabaseUrl.ts:77-83 falls back to the owner DATABASE_URL
 *      when APP_DATABASE_URL is unset — the default single-role deployment.
 *
 * On that shape there was no tenant boundary on vault retrieval whatsoever, and
 * the comment asserting otherwise is what a reviewer would have read.
 *
 * These tests hold the two properties that replace it: the SQL constrains the
 * organization itself, and a request with no usable tenant returns nothing
 * rather than everything.
 */
import { describe, it, expect, vi } from 'vitest';
import { AdvancedRAGPipeline } from '../advancedRAGPipeline';

const ORG_UUID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

type Captured = { sql: string; params: unknown[] };

/**
 * A pipeline whose pool records every statement. Built via Object.create so the
 * constructor's pool/OpenAI/router wiring stays out of it, matching
 * advancedRAGPipeline-mmr.test.ts.
 */
function makePipeline(): { pipeline: any; queries: Captured[] } {
  const queries: Captured[] = [];
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql: String(sql), params: params ?? [] });
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const pipeline = Object.create(AdvancedRAGPipeline.prototype);
  pipeline.pool = { connect: async () => client };
  pipeline.embeddingService = {
    embed: async () => ({ embedding: [0.1, 0.2, 0.3] }),
  };
  return { pipeline, queries };
}

/** Statements that actually hit the vault corpus (not BEGIN/COMMIT/set_config). */
const vaultStatements = (queries: Captured[]) =>
  queries.filter(q => /vault\.document_chunks/.test(q.sql));

describe('searchVaultSimilar — refusal without a tenant', () => {
  it('returns nothing and issues no vault query when organizationUuid is absent', async () => {
    const { pipeline, queries } = makePipeline();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const out = await pipeline.searchVaultSimilar('anything', 10, 0.5, undefined, false, true);

    expect(out).toEqual([]);
    // Not merely an empty result set — the query is never sent at all.
    expect(vaultStatements(queries)).toHaveLength(0);
    // Silence would make an authorization refusal look like an empty corpus.
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('refuses a malformed organization id rather than letting ::uuid raise', async () => {
    const { pipeline, queries } = makePipeline();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // A 22P02 here would surface as a retrieval failure rather than as the
    // authorization refusal it actually is.
    const out = await pipeline.searchVaultSimilar('anything', 10, 0.5, 'not-a-uuid', false, true);

    expect(out).toEqual([]);
    expect(vaultStatements(queries)).toHaveLength(0);
    warn.mockRestore();
  });
});

describe('searchVaultSimilar — explicit tenant predicate', () => {
  it('constrains organization_id on the dense arm and binds the org uuid', async () => {
    const { pipeline, queries } = makePipeline();
    await pipeline.searchVaultSimilar('q', 10, 0.5, ORG_UUID, false, false);

    const [dense] = vaultStatements(queries);
    expect(dense).toBeDefined();
    expect(dense.sql).toMatch(/d\.organization_id IN \(SELECT o\.id FROM organizations o WHERE o\.uuid = \$4::uuid\)/);
    // $4 is the org uuid — filters, if any, start at $5 (see rag-filters.test.ts).
    expect(dense.params[3]).toBe(ORG_UUID);
  });

  it('constrains organization_id on the sparse arm too', async () => {
    const { pipeline, queries } = makePipeline();
    await pipeline.searchVaultSimilar('q', 10, 0.5, ORG_UUID, false, true);

    const statements = vaultStatements(queries);
    // Hybrid runs both arms; the lexical one is the one matching on tsvector.
    const sparse = statements.find(q => /websearch_to_tsquery/.test(q.sql));
    expect(sparse).toBeDefined();
    expect(sparse!.sql).toMatch(/d\.organization_id IN \(SELECT o\.id FROM organizations o WHERE o\.uuid = \$3::uuid\)/);
    expect(sparse!.params[2]).toBe(ORG_UUID);
  });

  it('constrains every vault statement it issues, with no exceptions', async () => {
    const { pipeline, queries } = makePipeline();
    await pipeline.searchVaultSimilar('q', 10, 0.5, ORG_UUID, true, true);

    const statements = vaultStatements(queries);
    expect(statements.length).toBeGreaterThan(0);
    for (const q of statements) {
      expect(q.sql).toContain('d.organization_id IN');
    }
  });
});
