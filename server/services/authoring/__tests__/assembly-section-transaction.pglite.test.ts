/** Actual canonical single-section placement with injected evidence failures.
 * PGlite proves rollback of rows and index shifts, not native concurrent locks. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const evidence = vi.hoisted(() => ({ fail: '' }));
vi.mock('../../clinical-regulatory-evidence/lineage-gate', () => ({ enforceAuthorLineage: vi.fn(async () => ({})) }));
vi.mock('../authoring-evidence', async original => ({
  ...await original<typeof import('../authoring-evidence')>(),
  createRevision: vi.fn(async () => { if (evidence.fail === 'revision') throw new Error('injected genesis failure'); return 'revision'; }),
  writeAuthoringAuditTrail: vi.fn(async () => { if (evidence.fail === 'audit') throw new Error('injected audit failure'); }),
}));

import { createSection, type CreateContext } from '../authoring-documents';

const DOC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let pg: PGlite;
let context: CreateContext;
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE authoring_documents(id uuid PRIMARY KEY,tenant_id integer,status text,locked_at timestamptz,updated_at timestamptz DEFAULT now());
    CREATE TABLE authoring_sections(id uuid PRIMARY KEY,doc_id uuid,code text,title text,content text,order_index integer,
      tenant_id integer,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
    CREATE UNIQUE INDEX authoring_sections_doc_code_tenant_uq ON authoring_sections(doc_id,code,tenant_id);`);
  const query = async (sql: string, values?: unknown[]) => {
    const result = await pg.query(sql, values);
    return { ...result, rowCount: result.rows.length || result.affectedRows };
  };
  const pool = { query, connect: async () => ({ query, release() {} }) };
  context = { pool, tenantId: 7, actor: { id: '4', email: 'author@example.test' }, audit: {
    pool, tenantId: 7, actorId: '4', actorEmail: 'author@example.test', actorRole: 'member', ipAddress: '', userAgent: '',
  } } as unknown as CreateContext;
});
afterAll(async () => { await pg.close(); });
beforeEach(async () => {
  evidence.fail = '';
  await pg.exec('DELETE FROM authoring_sections; DELETE FROM authoring_documents;');
  await pg.query("INSERT INTO authoring_documents(id,tenant_id,status) VALUES($1,7,'draft')", [DOC]);
  await pg.query("INSERT INTO authoring_sections(id,doc_id,code,title,content,order_index,tenant_id) VALUES(gen_random_uuid(),$1,'2.5.2','Kept','Original text',100,7)", [DOC]);
});

describe('canonical section creation enlists its evidence in the same transaction', () => {
  it.each(['revision', 'audit'])('rolls back the new section and existing order shift on %s failure', async failure => {
    evidence.fail = failure;
    await createSection(context, { doc_id: DOC, code: '2.5.1', title: 'Added', content: 'New text' }).catch(() => undefined);
    const rows = await pg.query('SELECT code,content,order_index FROM authoring_sections ORDER BY order_index');
    expect(rows.rows).toEqual([{ code: '2.5.2', content: 'Original text', order_index: 100 }]);
  });

  it('retains ordinary single-create placement and exact existing content', async () => {
    expect((await createSection(context, { doc_id: DOC, code: '2.5.1', title: 'Added', content: 'New text' })).kind).toBe('created');
    const rows = await pg.query('SELECT code,content FROM authoring_sections ORDER BY order_index');
    expect(rows.rows).toEqual([{ code: '2.5.1', content: 'New text' }, { code: '2.5.2', content: 'Original text' }]);
  });
});
