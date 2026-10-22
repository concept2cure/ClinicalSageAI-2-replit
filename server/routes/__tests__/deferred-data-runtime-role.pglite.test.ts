/** Execute the route SQL with a real NOSUPERUSER role and FORCE RLS, rather
 * than a mock that can return empty rows regardless of connection scope. */
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
const provider = vi.hoisted(() => vi.fn(async () => { throw new Error('Provider calls forbidden in this test'); }));
vi.mock('../../lib/unified-ai-client', () => ({ aiComplete: provider }));
import graph from '../graphrag';
import analytics from '../mdx-analytics';
let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE ROLE deferred_runtime NOSUPERUSER;
    CREATE TABLE knowledge_graph_nodes(id text PRIMARY KEY, organization_id integer, entity_type text, name text, description text, metadata jsonb, confidence real, source_document_id text);
    CREATE TABLE knowledge_graph_edges(id text PRIMARY KEY, organization_id integer, source_id text, target_id text, relationship_type text, weight real, metadata jsonb);
    CREATE TABLE citation_chains(id text PRIMARY KEY, organization_id integer, source_document_id text, target_document_id text, citation_type text, context text, page_number integer, section_id text, confidence real, created_at timestamptz);
    CREATE TABLE regulatory_programs(id text PRIMARY KEY, organization_id integer, status text, regulatory_path text, deleted_at timestamptz);
    CREATE TABLE submission_transmittals(organization_id integer, status text);
    INSERT INTO knowledge_graph_nodes VALUES
      ('own-drug',7,'drug','Our medicine','Own description','{}',0.9,'our-doc'),
      ('own-disease',7,'disease','Our indication','Own description','{}',0.9,'our-doc-2'),
      ('foreign-drug',8,'drug','Confidential other medicine','Other description','{}',0.9,'foreign-doc'),
      ('foreign-disease',8,'disease','Confidential other indication','Other description','{}',0.9,'foreign-doc-2'),
      ('orphan',NULL,'drug','Unattributed legacy medicine','Legacy description','{}',0.9,'orphan-doc');
    INSERT INTO knowledge_graph_edges VALUES
      ('own-edge',7,'own-drug','own-disease','TREATS',1,'{}'),
      ('foreign-edge',8,'foreign-drug','foreign-disease','TREATS',1,'{}');
    INSERT INTO citation_chains VALUES
      ('own-citation',7,'our-doc','our-doc-2','supporting_evidence','Our quoted evidence',1,'2.5',0.9,now()),
      ('foreign-citation',8,'foreign-doc','foreign-doc-2','supporting_evidence','Confidential other quote',1,'2.5',0.9,now());
    INSERT INTO regulatory_programs VALUES ('our-1',7,'active','510k',NULL),('our-2',7,'approved','pma',NULL),('foreign',8,'active','510k',NULL);
    INSERT INTO submission_transmittals VALUES (7,'received'),(8,'review_started');
  `);
  for (const table of ['knowledge_graph_nodes','knowledge_graph_edges','citation_chains','regulatory_programs','submission_transmittals']) {
    await pg.exec(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation_policy ON ${table} USING (organization_id = nullif(current_setting('app.current_tenant_id',true),'')::integer);
      GRANT SELECT ON ${table} TO deferred_runtime;`);
  }
  await pg.exec('SET ROLE deferred_runtime');
});
afterAll(async () => { await pg.close(); });
const app = (org: number) => {
  const a = express(); a.use(express.json());
  a.use(async (req, _res, next) => {
    await pg.query("SELECT set_config('app.current_tenant_id',$1,false)", [String(org)]);
    (req as any).user = { id: 1, organizationId: org };
    (req as any).dbClient = { query: (sql: string, params: unknown[]) => pg.query(sql, params) };
    next();
  });
  a.use('/api/graphrag', graph); a.use('/api/mdx', analytics); return a;
};
describe('retained deferred reads under tenant RLS', () => {
  it('reproduces the unscoped zero and proves the actual test role cannot bypass RLS', async () => {
    await pg.query("SELECT set_config('app.current_tenant_id','',false)");
    const role = await pg.query<{ rolsuper: boolean }>('SELECT rolsuper FROM pg_roles WHERE rolname = current_user');
    expect(role.rows[0].rolsuper).toBe(false);
    expect((await pg.query('SELECT id FROM knowledge_graph_nodes')).rows).toEqual([]);
  });
  it('returns positive graph rows for the owning tenant', async () => {
    const r = await request(app(7)).get('/api/graphrag/communities');
    expect(r.status).toBe(200); expect(r.body.data.totalEntities).toBe(2); expect(r.body.data.totalRelationships).toBe(1);
    expect(JSON.stringify(r.body)).not.toMatch(/Confidential|Unattributed/);
  });
  it('returns the other tenant only on that tenant connection', async () => {
    const r = await request(app(8)).get('/api/graphrag/communities');
    expect(r.body.data.totalEntities).toBe(2); expect(JSON.stringify(r.body)).not.toContain('Our medicine');
  });
  it('does not traverse a guessed foreign node or cite a guessed foreign document', async () => {
    const n = await request(app(7)).get('/api/graphrag/entities/foreign-drug/neighborhood');
    expect(n.status).toBe(200); expect(n.body.data.entities).toEqual([]);
    const c = await request(app(7)).get('/api/graphrag/citation-trace/foreign-doc?depth=1');
    expect(c.status).toBe(200); expect(c.body.data.totalCitations).toBe(0);
    expect(JSON.stringify(c.body)).not.toContain('Confidential other quote');
  });
  it('reads a real positive citation and counts only the owning tenant graph', async () => {
    const c = await request(app(7)).get('/api/graphrag/citation-trace/our-doc?depth=1');
    expect(c.body.data.totalCitations).toBe(1); expect(c.body.data.citationChains[0].context).toBe('Our quoted evidence');
    const h = await request(app(7)).get('/api/graphrag/health');
    expect(h.body.graphStore.postgres).toEqual({ nodes: 2, edges: 1 });
  });
  it('returns real tenant analytics counts, not shared-pool zeros or another tenant totals', async () => {
    const r = await request(app(7)).get('/api/mdx/analytics/portfolio');
    expect(r.status).toBe(200); expect(r.body.data.programs.total).toBe(2); expect(r.body.data.submissions.total).toBe(1);
    expect(r.body.data.byPathway).toHaveLength(2); expect(provider).not.toHaveBeenCalled();
  });
});
