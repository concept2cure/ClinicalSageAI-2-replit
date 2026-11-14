/** Actual SQL, constraints, production scaffolder and audit writer; no query stub. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { scaffoldProjectDocuments } from '../../server/services/c2c/scaffold-project-documents';
import { findActiveRulePack, IVD_510K_RULE_PACK_VERSION } from '../../server/services/c2c/rule-pack-lookup';
import { FDA_510K_IVD_SECTIONS } from '../../shared/regulatory/device-authoring-sections';

const read = (p: string) => readFileSync(p, 'utf8');
const OLD = [
  'migrations/20260804_phase9_rule_pack_outlines.sql',
  'migrations/20260810c_rule_pack_provenance.sql',
  'migrations/20260810d_rule_pack_review_attribution.sql',
  'migrations/20260901b_estar_510k_denovo_outlines.sql',
  'migrations/20261005c_k510_denovo_estar_outline_v1_1.sql',
];
const NEW = 'migrations/20261114_k510_ivd_estar_outline_v1_0.sql';
const ORIGINAL_PROJECT = '11111111-2222-3333-4444-555555555555';
const IVD_PROJECT = '21111111-2222-3333-4444-555555555555';
const CDX_PROJECT = '31111111-2222-3333-4444-555555555555';
const DEVICE_PROJECT = '41111111-2222-3333-4444-555555555555';
let pg: PGlite;
let originalId: string;
let original: unknown;
const client = () => ({ query: (sql: string, params?: unknown[]) => pg.query(sql, params) }) as Parameters<typeof scaffoldProjectDocuments>[0]['client'];
const scaffold = (projectId: string, productType: string) => scaffoldProjectDocuments({
  client: client(), orgId: 7, userId: 1, projectId,
  programType: '510k', primaryAgency: 'FDA', productName: 'Synthetic assay', productType,
});
async function retained() {
  return {
    document: (await pg.query('SELECT * FROM c2c_documents WHERE id=$1', [originalId])).rows,
    sections: (await pg.query('SELECT * FROM c2c_document_sections WHERE document_id=$1 ORDER BY path_order', [originalId])).rows,
  };
}
async function deploy() {
  for (const file of [...OLD, NEW]) await pg.exec(read(file));
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE organizations (id serial PRIMARY KEY);
    CREATE TABLE users (id serial PRIMARY KEY);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY);
    CREATE TABLE audit_logs (
      id text PRIMARY KEY, tenant_id integer, user_id integer, action text,
      table_name text, record_id text, actor_id text, target text, target_type text,
      target_id text, reason text, payload_hash text, ana_action_id text, sha256_chain text,
      occurred_at timestamptz DEFAULT now(), hmac_seal text, old_values json, new_values json,
      ip_address text, user_agent text
    );
    INSERT INTO users VALUES (1);
    INSERT INTO organizations VALUES (7);
  `);
  for (const id of [ORIGINAL_PROJECT, IVD_PROJECT, CDX_PROJECT, DEVICE_PROJECT]) {
    await pg.query('INSERT INTO regulatory_programs(id) VALUES ($1)', [id]);
  }
  await pg.exec(read('migrations/20260527_mutation_primitives.sql'));
  await pg.exec(read('migrations/20260528_phase9_document_schema.sql'));
  for (const file of OLD) await pg.exec(read(file));
  expect(await findActiveRulePack(client(), 'k510', 'fda', 'ivd')).toBeNull();
  await pg.exec('BEGIN');
  const created = await scaffold(ORIGINAL_PROJECT, 'device');
  originalId = created.documentId!;
  await pg.exec("SET LOCAL app.actor_id='1'");
  await pg.query(`UPDATE c2c_document_sections SET content='{"paragraphs":["Retained original source-linked draft text"]}'::jsonb
    WHERE document_id=$1 AND section_key='B1'`, [originalId]);
  await pg.exec('COMMIT');
  original = await retained();
  await pg.exec(read(NEW));
}, 60_000);
afterAll(async () => { await pg?.close(); });

describe('the approved parallel IVD outline survives deploy replay and preserves history', () => {
  it('replays the old and new files three times, retaining both exact variant trees', async () => {
    for (let i = 0; i < 3; i++) await deploy();
    const live = await pg.query<{ version: string; count: number }>(`SELECT version,jsonb_array_length(required_sections) AS count
      FROM c2c_rule_packs WHERE doc_type='k510' AND agency='fda' AND superseded_by IS NULL ORDER BY version`);
    expect(live.rows).toEqual([
      { version: IVD_510K_RULE_PACK_VERSION, count: 47 },
      { version: 'fda-estar-510k-v1.1', count: 38 },
    ]);
    expect(await retained()).toEqual(original);
    const denovo = await findActiveRulePack(client(), 'denovo', 'fda', 'ivd');
    expect(denovo?.version).toBe('fda-estar-denovo-v1.1');
  }, 60_000);

  it.each([
    ['ivd', IVD_PROJECT, IVD_510K_RULE_PACK_VERSION, 47],
    ['cdx', CDX_PROJECT, IVD_510K_RULE_PACK_VERSION, 47],
    ['device', DEVICE_PROJECT, 'fda-estar-510k-v1.1', 38],
  ] as const)('%s creates the correctly bound empty outline with its actual governed audit', async (productType, projectId, version, count) => {
    await pg.exec('BEGIN');
    try {
      const result = await scaffold(projectId, productType);
      expect(result.skipped).toBeUndefined();
      expect(result.sectionCount).toBe(count);
      const docs = await pg.query<{ doc_type: string; agency: string; rule_pack_version: string }>(
        'SELECT doc_type,agency,rule_pack_version FROM c2c_documents WHERE id=$1', [result.documentId]);
      expect(docs.rows).toEqual([{ doc_type: 'k510', agency: 'fda', rule_pack_version: version }]);
      const rows = await pg.query<{ section_key: string; status: string; content: unknown; draft_source: string }>(
        'SELECT section_key,status,content,draft_source FROM c2c_document_sections WHERE document_id=$1 ORDER BY path_order', [result.documentId]);
      expect(rows.rows).toHaveLength(count);
      expect(rows.rows.every(r => r.status === 'todo' && r.draft_source === 'template' && JSON.stringify(r.content) === '{}')).toBe(true);
      expect(rows.rows.some(r => r.section_key === 'E9')).toBe(productType !== 'device');
      const audit = await pg.query<{ user_id: number; tenant_id: number; sha256_chain: string; payload_hash: string }>(
        'SELECT user_id,tenant_id,sha256_chain,payload_hash FROM audit_logs WHERE target=$1', [`document:${result.documentId}`]);
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]).toMatchObject({ user_id: 1, tenant_id: 7 });
      expect(audit.rows[0].sha256_chain).toBeTruthy();
      expect(audit.rows[0].payload_hash).toMatch(/^[0-9a-f]{64}$/);
      const action = await pg.query<{ payload: unknown }>('SELECT payload FROM c2c_ana_actions WHERE target=$1', [`document:${result.documentId}`]);
      expect(action.rows).toHaveLength(1);
      expect(JSON.stringify(action.rows[0].payload)).toContain(version);
      await pg.exec('COMMIT');
    } catch (error) { await pg.exec('ROLLBACK'); throw error; }
    expect(await retained()).toEqual(original);
  }, 60_000);

  it('uses exactly the shared template keys, labels, order and mandatory flags', async () => {
    const pack = await findActiveRulePack(client(), 'k510', 'fda', 'ivd');
    expect(pack?.required_sections).toEqual(FDA_510K_IVD_SECTIONS.map((s, i) => ({
      key: s.code, label: s.title, parent_key: s.code.length === 1 ? null : s.code[0],
      path_order: i + 1, mandatory: s.required,
    })));
  });

  it.each(['truncated', 'changed', 'superseded'] as const)('refuses a conflicting %s IVD version instead of silently retaining it', async (kind) => {
    await pg.exec('BEGIN');
    try {
      const statement = kind === 'truncated' ? "required_sections = required_sections - 0"
        : kind === 'changed' ? "required_sections = jsonb_set(required_sections,'{0,label}','\"Wrong\"'::jsonb)"
          : "superseded_by='unexpected'";
      await pg.query(`UPDATE c2c_rule_packs SET ${statement} WHERE doc_type='k510' AND agency='fda' AND version=$1`, [IVD_510K_RULE_PACK_VERSION]);
      await expect(pg.exec(read(NEW))).rejects.toThrow(/must hold this file's 47 nodes and remain live/);
    } finally { await pg.exec('ROLLBACK'); }
  });

  it('the precise parallel-version exception does not admit another unexpected live pack', async () => {
    await pg.exec('BEGIN');
    try {
      await pg.exec(`INSERT INTO c2c_rule_packs(doc_type,agency,version,label,required_sections)
        VALUES ('k510','fda','unexpected','Unexpected','[]')`);
      await expect(pg.exec(read(OLD[4]))).rejects.toThrow(/exactly one live pack/);
    } finally { await pg.exec('ROLLBACK'); }
  });
});
