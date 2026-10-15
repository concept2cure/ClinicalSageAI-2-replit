/**
 * AnA searches and reads the client's Vault with no AI key and no feature flag
 * (D2, founder direction 2026-10-01: "Vault search should not depend on an
 * OpenAI key or a Claude key or any key"; evidence
 * docs/evidence/D2/2026-10-01-vault-search-no-key/).
 *
 * On PostgreSQL as the runtime role with RLS on, through the real ingest route
 * and the real AnA tool handlers, with OPENAI_API_KEY and ANTHROPIC_API_KEY
 * unset and 'ana.document_catalog' off (its launch default):
 *
 *   - a question in plain English finds the document by its text, and the
 *     current version only;
 *   - another organisation's document is never among the hits, from either side;
 *   - list_project_documents lists and read_project_document reads it, with
 *     no refusal naming a setting;
 *   - a question no document's words answer is said as nothing found.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';

const PROBE = 'dbtest-anavs ';
const CODE = 'DBTEST-ANAVS';
const WORD = 'quokkaline';

type Tenant = { orgId: number; orgUuid: string };
let owner: Pool;
let userId: number;
let mine: Tenant;
let theirs: Tenant;
let current: string;
let earlier: string;
let theirDoc: string;
const saved: Record<string, string | undefined> = {};

async function appFor(t: Tenant): Promise<express.Express> {
  const createVaultIngestRoutes = (await import('../../server/routes/vault-ingest')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req, {
      userId, tenantId: t.orgId, userRole: 'admin',
      user: { id: userId, organizationId: t.orgId, organizationUuid: t.orgUuid, role: 'admin' },
    });
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/vault/ingest', createVaultIngestRoutes());
  return a;
}

async function ingest(t: Tenant, programId: string, text: string, fields: Record<string, string>): Promise<string> {
  let r = request(await appFor(t)).post('/api/vault/ingest').field('programId', programId).field('documentType', 'OTHER');
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  const res = await r.attach('file', Buffer.from(text, 'utf8'), { filename: `${fields.documentTitle}.txt`, contentType: 'text/plain' });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return String(res.body.document.id);
}

async function tool(t: Tenant, name: string, input: Record<string, unknown>) {
  const { getToolHandler } = await import('../../server/services/ana/AnaToolExecutor');
  const { runWithTenantScope } = await import('../../server/db/tenantStore');
  const handler = getToolHandler(name);
  if (!handler) throw new Error(`tool ${name} is not registered`);
  const raw = await runWithTenantScope(
    { tenantId: String(t.orgId), orgUuid: t.orgUuid, role: 'admin', source: 'request', caller: 'tests/db/ana-vault-search-no-key.dbtest.ts' },
    () => handler(input, { organizationId: t.orgId, userId, humanConfirmed: true }),
  );
  return JSON.parse(raw);
}

async function tenant(slug: string): Promise<Tenant> {
  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PROBE}${slug}`, `dbtest-anavs-${slug}`],
  );
  return { orgId: Number(org.rows[0].id), orgUuid: String(org.rows[0].uuid) };
}

async function program(t: Tenant, name: string): Promise<string> {
  const prog = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Quokkamab') RETURNING id`,
    [`${PROBE}${name}`, `${CODE}-${name.toUpperCase().replace(/\W+/g, '-')}`, t.orgId],
  );
  return String(prog.rows[0].id);
}

async function cleanup(): Promise<void> {
  const client = await owner.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_delete');
    await client.query(`DELETE FROM audit_logs WHERE tenant_id IN (SELECT id FROM organizations WHERE slug LIKE 'dbtest-anavs-%')`);
    await client.query('ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_no_delete');
    await client.query('COMMIT');
  } catch {
    await client.query('ROLLBACK').catch(() => {});
  } finally {
    client.release();
  }
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1 AND supersedes_id IS NOT NULL', [`${CODE}%`]);
  await owner.query('DELETE FROM vault.documents WHERE document_code LIKE $1', [`${CODE}%`]);
  await owner.query('DELETE FROM regulatory_programs WHERE name LIKE $1', [`${PROBE}%`]);
}

beforeAll(async () => {
  for (const k of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'ANA_DOCUMENT_CATALOG_FORCE_ON']) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ('dbtest-anavs@example.test', 'Ana Search', 'not-a-real-hash')
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
  );
  userId = Number(user.rows[0].id);
  await cleanup();
  mine = await tenant('mine');
  theirs = await tenant('theirs');
  const prog = await program(mine, 'alpha');
  const progT = await program(theirs, 'their program');
  earlier = await ingest(mine, prog, `Stability report. The ${WORD} degradant stays under 0.1% at 24 months.`, { documentCode: `${CODE}-A`, documentTitle: 'Alpha stability report' });
  current = await ingest(mine, prog, `Stability report, revised. The ${WORD} degradant stays under 0.05% at 24 months.`, { supersedesDocumentId: earlier, documentTitle: 'Alpha stability report' });
  theirDoc = await ingest(theirs, progT, `Their own ${WORD} degradation study.`, { documentCode: `${CODE}-T`, documentTitle: 'Their study' });
}, 90_000);

afterAll(async () => {
  await cleanup();
  await owner?.end();
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});

describe('AnA reaches the Vault with no key and the catalog off (D2)', () => {
  it('the catalog really is off for these organisations', async () => {
    const { isDocumentCatalogEnabled } = await import('../../server/services/vault/document-catalog.service');
    expect(await isDocumentCatalogEnabled(mine.orgId)).toBe(false);
  });

  it('a question in plain English finds the current version by its text', async () => {
    const out = await tool(mine, 'search_project_documents', { query: `Which report shows how much ${WORD} degradant there is at 24 months?` });
    expect(out.ok, JSON.stringify(out)).toBe(true);
    const ids = out.hits.map((x: any) => x.documentId);
    expect(ids).toContain(current);
    expect(ids).not.toContain(earlier);
    expect(out.hits.find((x: any) => x.documentId === current).matchedBy).toEqual(['text']);
    expect(out.semantic).toMatchObject({ available: false, reason: 'catalog_off' });
  });

  it("another organisation's document is never a hit, from either side", async () => {
    const mineOut = await tool(mine, 'search_project_documents', { query: WORD });
    expect(mineOut.hits.map((x: any) => x.documentId)).not.toContain(theirDoc);
    const theirsOut = await tool(theirs, 'search_project_documents', { query: WORD });
    expect(theirsOut.hits.map((x: any) => x.documentId)).toEqual([theirDoc]);
  });

  it('lists and reads the document, with no refusal naming a setting', async () => {
    const listed = await tool(mine, 'list_project_documents', {});
    expect(JSON.stringify(listed)).not.toMatch(/not enabled|ana\.document_catalog/);
    expect(JSON.stringify(listed)).toContain(current);
    const read = await tool(mine, 'read_project_document', { document_id: current });
    expect(JSON.stringify(read)).not.toMatch(/not enabled|ana\.document_catalog/);
    expect(JSON.stringify(read)).toContain('0.05%');
  });

  it('a question no document answers is nothing found, not unavailable', async () => {
    const out = await tool(mine, 'search_project_documents', { query: 'paediatric investigation plan waiver' });
    expect(out.ok).toBe(true);
    expect(out.hits).toEqual([]);
    expect(out.unavailable).toBeUndefined();
  });
});
