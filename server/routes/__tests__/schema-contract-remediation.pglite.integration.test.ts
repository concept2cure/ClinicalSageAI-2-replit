/**
 * Schema-contract remediation — END-TO-END against a real (in-process PGlite)
 * Postgres. The repo-wide audit (scripts/db/audit-referenced-tables.mjs) found
 * tables the server SQL queries that no migration created. This applies the four
 * remediation migrations and runs the REAL statements the referencing code
 * executes, proving the new tables actually back them (not just that the DDL
 * parses). Mirrors authoring-migration.pglite.integration.test.ts.
 *
 * PGlite has no pgvector, so knowledge_graph_nodes.embedding is skipped by the
 * migration's guard; the embedding-similarity SELECT is the one path not covered
 * here (it is exercised by the Neon preview-DB CI check instead).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const MIG = path.join(__dirname, '../../../db/migrations');
const FILES = [
  '20260730_graphrag_knowledge_tables.sql',
  '20260730_cmc_evidence_tables.sql',
  '20260730_submission_center_tables.sql',
  '20260730_licensing_ip_tables.sql',
];
const EXPECTED_TABLES = [
  'knowledge_graph_nodes', 'knowledge_graph_edges', 'citation_chains', 'knowledge_documents',
  'cmc_methods', 'qa_methods', 'dp_specs', 'qc_specs', 'proc_control_strategy', 'stab_signoffs', 'specification_audit_log',
  'submission_projects', 'submission_tasks', 'fda_510k_initial_data_forms', 'c2c_investigator_brochure', 'reg_question_events', 'reg_mail_ingest',
  'licenses', 'patent_portfolio', 'predicate_intelligence_results',
];

let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite();
  for (const f of FILES) await pg.exec(fs.readFileSync(path.join(MIG, f), 'utf8'));
});
afterAll(async () => { await pg.close(); });

describe('remediation migrations apply and back the real queries', () => {
  it('creates all 20 tables', async () => {
    const rows = (await pg.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1)`,
      [EXPECTED_TABLES],
    )).rows.map((r: any) => r.table_name);
    const missing = EXPECTED_TABLES.filter((t) => !rows.includes(t));
    expect(missing, `not created: ${missing.join(', ')}`).toEqual([]);
  });

  it('graphrag: node upsert (ON CONFLICT GREATEST), edge upsert, traversal JOIN, citation ANY', async () => {
    // knowledge_graph_nodes INSERT ... ON CONFLICT (id) DO UPDATE (graphrag.ts:694)
    const upsert = `INSERT INTO knowledge_graph_nodes (id, entity_type, name, description, metadata, confidence, source_document_id, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7, now())
      ON CONFLICT (id) DO UPDATE SET metadata = EXCLUDED.metadata, confidence = GREATEST(knowledge_graph_nodes.confidence, EXCLUDED.confidence)`;
    await pg.query(upsert, ['n1', 'drug', 'Aspirin', 'd', JSON.stringify({ projectId: 'p1' }), 0.4, 'doc1']);
    await pg.query(upsert, ['n1', 'drug', 'Aspirin', 'd', JSON.stringify({ projectId: 'p1' }), 0.9, 'doc1']); // higher confidence wins
    await pg.query(upsert, ['n2', 'disease', 'Headache', 'd', JSON.stringify({ projectId: 'p1' }), 0.8, 'doc1']);
    const conf = (await pg.query(`SELECT confidence FROM knowledge_graph_nodes WHERE id='n1'`)).rows[0] as any;
    expect(Number(conf.confidence)).toBeCloseTo(0.9); // GREATEST kept the higher

    // edges ON CONFLICT DO NOTHING (graphrag.ts:721)
    const edge = `INSERT INTO knowledge_graph_edges (id, source_id, target_id, relationship_type, weight, metadata, created_at) VALUES ($1,$2,$3,$4,$5,$6, now()) ON CONFLICT (id) DO NOTHING`;
    await pg.query(edge, ['e1', 'n1', 'n2', 'TREATS', 1.0, '{}']);
    await pg.query(edge, ['e1', 'n1', 'n2', 'TREATS', 9.9, '{}']); // ignored

    // multi-hop traversal JOIN (graphrag.ts:347-348)
    const hop = await pg.query(
      `SELECT kge.source_id, kge.target_id, kge.relationship_type
         FROM knowledge_graph_edges kge
         JOIN knowledge_graph_nodes kgn ON (kgn.id = kge.target_id OR kgn.id = kge.source_id)
        WHERE kge.source_id = ANY($1::text[])`, [['n1']]);
    expect(hop.rows.length).toBeGreaterThan(0);

    // project-scoped node read (graphrag.ts:806-807)
    const byProject = await pg.query(`SELECT id FROM knowledge_graph_nodes WHERE metadata->>'projectId' = $1`, ['p1']);
    expect(byProject.rows.length).toBe(2);

    // citation_chains SELECT ... WHERE source_document_id = ANY (graphrag.ts:614)
    await pg.query(`INSERT INTO citation_chains (id, source_document_id, target_document_id, citation_type, context, page_number, section_id, confidence, created_at) VALUES ('c1','doc1','doc2','direct','ctx',3,'2.5',0.7, now())`);
    const cites = await pg.query(`SELECT id, citation_type FROM citation_chains WHERE source_document_id = ANY($1::text[]) OR target_document_id = ANY($1::text[])`, [['doc1']]);
    expect(cites.rows.length).toBe(1);
  });

  it('knowledge_documents: the sage-plus filtered SELECT executes', async () => {
    await pg.query(`INSERT INTO knowledge_documents (title, content, category, status) VALUES ('Guidance','body text','regulatory','published')`);
    const r = await pg.query(
      `SELECT * FROM knowledge_documents WHERE ($1='' OR title ILIKE $1 OR content ILIKE $1) AND ($2='' OR category = $2) ORDER BY updated_at DESC LIMIT $3 OFFSET $4`,
      ['%guid%', 'regulatory', 10, 0]);
    expect(r.rows.length).toBe(1);
  });

  it('cmc: stab_signoffs INSERT RETURNING + history SELECT; specification_audit_log INSERT + history', async () => {
    // stab_signoffs (stability.router.ts:2437 / :2465) — the real 500-causing statements
    const study = '11111111-1111-1111-1111-111111111111';
    const ins = await pg.query(
      `INSERT INTO stab_signoffs (study_id, stage, signer_name, signer_email, reason, hash, signed_at) VALUES ($1,$2,$3,$4,$5,$6, now()) RETURNING *`,
      [study, 'LOCKED', 'Jane', 'j@x.co', 'complete', 'deadbeef']);
    expect(ins.rows.length).toBe(1);
    const hist = await pg.query(`SELECT stage, signer_name, signed_at, hash FROM stab_signoffs WHERE study_id=$1 ORDER BY signed_at DESC`, [study]);
    expect(hist.rows.length).toBe(1);

    // specification_audit_log (specificationRoutes.ts:159/:412) — the audit rows + history read
    const spec = '22222222-2222-2222-2222-222222222222';
    await pg.query(`INSERT INTO specification_audit_log (specification_id, action, changed_by, new_values) VALUES ($1,'created',$2,$3)`, [spec, 'system', '{}']);
    await pg.query(`INSERT INTO specification_audit_log (specification_id, action, changed_by, previous_values, new_values) VALUES ($1,'updated',$2,$3,$4)`, [spec, '42', '{"a":1}', '{"a":2}']);
    const audit = await pg.query(`SELECT sal.* FROM specification_audit_log sal WHERE sal.specification_id=$1 ORDER BY sal.created_at DESC`, [spec]);
    expect(audit.rows.length).toBe(2);
  });

  it('cmc: the product_id-keyed evidence SELECTs execute (dp_specs/qc_specs/qa_methods/proc_control_strategy/cmc_methods)', async () => {
    await pg.query(`INSERT INTO dp_specs (product_id, attribute, unit, limit_low, limit_high, method_id, method_status) VALUES ('P-1','Assay','%',95,105, gen_random_uuid(), 'validated')`);
    await pg.query(`INSERT INTO qc_specs (product_id, attribute, unit, limit_low, limit_high, method_id, method_ref) VALUES ('P-1','Assay','%',95,105, gen_random_uuid(), 'M-1')`);
    await pg.query(`INSERT INTO qa_methods (method_id, name, status, product_id) VALUES (gen_random_uuid(),'HPLC','validated','P-1')`);
    await pg.query(`INSERT INTO proc_control_strategy (product_id, control_id, version, mapping_json) VALUES ('P-1','CS-1','1','{}')`);
    await pg.query(`INSERT INTO cmc_methods (title, status) VALUES ('HPLC Assay','active')`);
    expect((await pg.query(`SELECT attribute, unit, limit_low, limit_high, method_id, method_status FROM dp_specs WHERE product_id=$1 LIMIT 50`, ['P-1'])).rows.length).toBe(1);
    expect((await pg.query(`SELECT attribute, unit, limit_low, limit_high, method_id, method_ref FROM qc_specs WHERE product_id=$1`, ['P-1'])).rows.length).toBe(1);
    expect((await pg.query(`SELECT method_id, name, status FROM qa_methods WHERE product_id=$1 LIMIT 50`, ['P-1'])).rows.length).toBe(1);
    expect((await pg.query(`SELECT control_id, version, mapping_json FROM proc_control_strategy WHERE product_id=$1 ORDER BY updated_at DESC LIMIT 1`, ['P-1'])).rows.length).toBe(1);
    expect((await pg.query(`SELECT id as method_id, title as name, status FROM cmc_methods WHERE status='active' ORDER BY status DESC`)).rows.length).toBe(1);
  });

  it('submission: project INSERT RETURNING + task FK + stage UPDATE', async () => {
    const proj = await pg.query(
      `INSERT INTO submission_projects (name, description, submission_type, status, stage, target_agency, target_date, priority, created_by) VALUES ($1,$2,$3,'planning','planning','FDA',NULL,'high','User') RETURNING *`,
      ['IND-1', 'desc', 'IND']);
    const pid = (proj.rows[0] as any).id;
    await pg.query(
      `INSERT INTO submission_tasks (project_id, title, description, status, priority, module_type, category, type) VALUES ($1,$2,$3,'pending','medium',$4,$5,'task')`,
      [pid, 'Draft 2.5', 'd', 'm2', 'clinical']);
    const joined = await pg.query(`SELECT p.name, count(t.id)::int AS n FROM submission_projects p LEFT JOIN submission_tasks t ON p.id = t.project_id GROUP BY p.id, p.name`);
    expect((joined.rows[0] as any).n).toBe(1);
    await pg.query(`UPDATE submission_projects SET stage=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2`, ['authoring', pid]);
    expect(((await pg.query(`SELECT stage FROM submission_projects WHERE id=$1`, [pid])).rows[0] as any).stage).toBe('authoring');
    // FK enforced
    await expect(pg.query(`INSERT INTO submission_tasks (project_id, title) VALUES (999999,'x')`)).rejects.toThrow();
  });

  it('regulatory intake: reg_question_events, reg_mail_ingest dedup UNIQUE, fda forms, IB org read', async () => {
    await pg.query(`INSERT INTO reg_question_events (q_id, sub_id, action, by_user, payload_json) VALUES ('q1','s1','CREATED','jane','{}')`);
    await pg.query(`INSERT INTO reg_question_events (q_id, sub_id, action, by_user) VALUES ('q1','s1','SUBMITTED','jane')`);
    expect((await pg.query(`SELECT * FROM reg_question_events WHERE q_id=$1 ORDER BY created_at asc`, ['q1'])).rows.length).toBe(2);

    // reg_mail_ingest: msg_id is the UNIQUE dedup key
    await pg.query(`INSERT INTO reg_mail_ingest (msg_id, thread_id, sub_id, subject, from_addr, to_addr, received_at, snippet, labels, extracted) VALUES ('m1','t1','s1','Subj','a@x','b@x', now(),'snip', $1, $2)`, [['INBOX'], JSON.stringify({ region: 'US' })]);
    await expect(pg.query(`INSERT INTO reg_mail_ingest (msg_id) VALUES ('m1')`)).rejects.toThrow(); // dup msg_id blocked
    expect((await pg.query(`SELECT 1 FROM reg_mail_ingest WHERE msg_id=$1`, ['m1'])).rows.length).toBe(1);

    await pg.query(`INSERT INTO fda_510k_initial_data_forms (project_id, form_type, form_data) VALUES (7,'device','{"deviceName":"X"}')`);
    expect((await pg.query(`SELECT id, project_id, form_type, form_data FROM fda_510k_initial_data_forms WHERE project_id=$1`, [7])).rows.length).toBe(1);

    await pg.query(`INSERT INTO c2c_investigator_brochure (organization_id, request) VALUES (3, $1)`, [JSON.stringify({ product: { productName: 'X' } })]);
    expect((await pg.query(`SELECT request FROM c2c_investigator_brochure WHERE organization_id=$1 ORDER BY id DESC LIMIT 1`, [3])).rows.length).toBe(1);
  });

  it('licensing/IP: full 20-col licenses INSERT + quota SELECT; patent + predicate reads', async () => {
    await pg.query(
      `INSERT INTO licenses (id, client_id, client_name, company_name, contact_email, license_type, license_key, access_token, max_users, max_submissions, max_storage_gb, max_projects, features, valid_from, valid_until, ip_restrictions, notes, status, organization_id)
       VALUES ('L1','5','Acme','Acme Co','e@x.co','enterprise','KEY','TOK',50,20,500,40,$1, now(), now(), $2,'note','active', 3)`,
      [JSON.stringify({ ai: true }), JSON.stringify([])]);
    // No server code reads `licenses` any more: the organization-keyed quota
    // lookup this line mirrors was removed (the ceilings are organizations.*),
    // and the client-workspace licence router was removed with it. The table
    // and its migration stay for installs that already carry rows, so the
    // stored shape is still pinned here — but as a record of what is on disk,
    // not as the contract behind a live query.
    expect((await pg.query(`SELECT * FROM licenses WHERE organization_id = $1 AND status = 'active'`, [3])).rows.length).toBe(1);

    await pg.query(`INSERT INTO patent_portfolio (organization_id, title, patent_number, jurisdiction, status, filing_date, expiration_date, inventors, category, fto_status, related_compounds) VALUES (3,'T','US1','US','granted','2020-01-01','2040-01-01','[]','small-molecule','clear','[]')`);
    expect((await pg.query(`SELECT id, title, patent_number, jurisdiction, status, filing_date, expiration_date, inventors, category, fto_status, related_compounds FROM patent_portfolio WHERE organization_id = $1 ORDER BY filing_date DESC`, [3])).rows.length).toBe(1);

    await pg.query(`INSERT INTO predicate_intelligence_results (organization_id, device_name, pathway, decision_date, predicate_device, outcome, similarity, key_questions) VALUES (3,'Dev','510k','2023-05-01','Pred','SE',0.82,'[]')`);
    expect((await pg.query(`SELECT id, device_name, pathway, decision_date, predicate_device, outcome, similarity, key_questions FROM predicate_intelligence_results WHERE organization_id = $1 ORDER BY decision_date DESC LIMIT 50`, [3])).rows.length).toBe(1);
  });

  it('RLS shadow-mode: a tenant-scoped table reads/writes freely when app.rls_enforce is unset', async () => {
    // c2c_investigator_brochure has FORCE RLS + tenant_isolation_policy; with no
    // app.rls_enforce the shadow-mode bypass clause must let this INSERT/SELECT pass.
    await pg.query(`INSERT INTO c2c_investigator_brochure (organization_id, request) VALUES (77, '{}'::jsonb)`);
    const r = await pg.query(`SELECT count(*)::int AS n FROM c2c_investigator_brochure WHERE organization_id=77`);
    expect((r.rows[0] as any).n).toBe(1);
  });
});
