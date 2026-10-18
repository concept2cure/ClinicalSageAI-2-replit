/**
 * An atom's embedding and its embedding_audit_log row are stored together, or
 * neither is — and embedAtom says which.
 *
 * ── What the code used to do ────────────────────────────────────────────────
 * embedAtom UPDATEd lumen_data_atoms with the vector, then wrote the audit row
 * in a separate INSERT wrapped in `try { … } catch { // Silently fail audit
 * logging }`. A failed audit write vanished: the vector stayed, embedAtom
 * resolved, every caller logged the atom as embedded, and the append-only log
 * under-reported which atoms were embedded with which model. And when the
 * UPDATE matched no row, the audit row was written anyway — for an embedding
 * that was never stored.
 *
 * The statement runs on a real engine (PGlite). This build has no pgvector, so
 * `vector` is a domain over text; the eligibility predicate (not under test
 * here) is TRUE.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const embed = vi.hoisted(() => vi.fn());
vi.mock('../ai-gateway/embeddings/embedding-provider', () => ({ getEmbeddingProvider: () => ({ embed }) }));
vi.mock('../document-data-disposition/eligibility.js', () => ({
  atomDataEligibleSql: () => 'TRUE',
  atomOriginalFileAvailableSql: () => 'TRUE',
}));

import { EnhancedEmbeddingService } from '../enhancedEmbeddingService';

let pg: PGlite;
/** The service's executor shape, over PGlite. */
const executor = () => ({ query: (text: string, params?: unknown[]) => pg.query<Record<string, unknown>>(text, params) });

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE DOMAIN vector AS text;
    CREATE TABLE lumen_data_atoms (
      id serial PRIMARY KEY, content text, title text, atom_type text,
      embedding vector, embedding_model text, embedding_updated_at timestamptz
    );
    CREATE TABLE embedding_audit_log (
      id serial PRIMARY KEY,
      atom_id integer REFERENCES lumen_data_atoms(id) ON DELETE SET NULL,
      model varchar(100) NOT NULL, token_count integer NOT NULL,
      cached boolean DEFAULT false, created_at timestamptz DEFAULT now()
    );
    CREATE FUNCTION refuse() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'permission denied for table %', TG_TABLE_NAME; END $$;
    CREATE FUNCTION skip_row() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
  `);
});
afterAll(async () => { await pg.close(); });

beforeEach(async () => {
  await pg.exec(`
    DROP TRIGGER IF EXISTS refuse_audit ON embedding_audit_log;
    DROP TRIGGER IF EXISTS skip_update ON lumen_data_atoms;
    TRUNCATE embedding_audit_log, lumen_data_atoms RESTART IDENTITY;
    INSERT INTO lumen_data_atoms (content, title, atom_type) VALUES ('Primary endpoint: HbA1c at week 26.', 'Synopsis', 'source_chunk');
  `);
  embed.mockReset();
  embed.mockResolvedValue({ embeddings: [[0.1, 0.2, 0.3]], inputTokens: 9 });
});

const state = async () => ({
  embedding: (await pg.query<{ embedding: string | null }>('SELECT embedding FROM lumen_data_atoms WHERE id = 1')).rows[0].embedding,
  audit: (await pg.query<{ atom_id: number; model: string; token_count: number; cached: boolean }>(
    'SELECT atom_id, model, token_count, cached FROM embedding_audit_log',
  )).rows,
});

describe('embedAtom', () => {
  it('stores the vector and its audit row', async () => {
    await new EnhancedEmbeddingService(executor()).embedAtom(1);
    const s = await state();
    expect(s.embedding).toBe('[0.1,0.2,0.3]');
    expect(s.audit).toEqual([{ atom_id: 1, model: 'text-embedding-3-small', token_count: 9, cached: false }]);
  });

  it('rejects, and stores no vector, when the audit row cannot be written', async () => {
    await pg.exec('CREATE TRIGGER refuse_audit BEFORE INSERT ON embedding_audit_log FOR EACH ROW EXECUTE FUNCTION refuse()');
    await expect(new EnhancedEmbeddingService(executor()).embedAtom(1)).rejects.toThrow(/embedding_audit_log/);
    const s = await state();
    expect(s.embedding, 'an embedding with no audit row must not exist').toBeNull();
    expect(s.audit).toEqual([]);
  });

  it('rejects, and writes no audit row, when the atom was not updated', async () => {
    await pg.exec('CREATE TRIGGER skip_update BEFORE UPDATE ON lumen_data_atoms FOR EACH ROW EXECUTE FUNCTION skip_row()');
    await expect(new EnhancedEmbeddingService(executor()).embedAtom(1)).rejects.toThrow(/no embedding was stored/);
    const s = await state();
    expect(s.embedding).toBeNull();
    expect(s.audit, 'no audit row for an embedding that was never stored').toEqual([]);
  });
});
