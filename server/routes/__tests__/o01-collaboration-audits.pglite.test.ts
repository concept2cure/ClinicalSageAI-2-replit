/** Actual feature/change stores plus the real canonical chained audit writer. No provider or agency I/O. */
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { SQL } from 'drizzle-orm';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import * as schema from '../../../shared/schema';
import { AUDIT_LOGS_PGLITE_DDL } from '../../db/pglite-harness';

const h = vi.hoisted(() => ({ db: null as PgliteDatabase | null, pg: null as PGlite | null }));
vi.mock('../../db', () => ({
  get db() { return h.db; },
  pool: { query: (sql: string, args?: unknown[]) => h.pg!.query(sql, args),
    connect: async () => ({ query: (sql: string, args?: unknown[]) => h.pg!.query(sql, args), release() {} }) },
}));
vi.mock('../../utils/logger', () => ({ createScopedLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));
// The secondary external audit backend is deliberately unavailable. Only a real audit_logs INSERT can succeed.
vi.mock('../../lib/tamper-proof-audit', async importOriginal => ({
  ...await importOriginal<typeof import('../../lib/tamper-proof-audit')>(),
  getTamperProofAuditLog: () => ({ initialize: async () => undefined, log: async () => { throw new Error('Synthetic secondary store unavailable'); } }),
}));
import annotationRoutes from '../inline-annotations';
import cmcRoutes from '../cmc-changes.routes';
import regulatoryRoutes from '../reg-change.routes';

let pg: PGlite;
function app(orgId = 9, role = 'member') {
  const a = express(); a.use(express.json()); a.use((req, _res, next) => {
    Object.assign(req, { userId: 7, user: { id: 7, name: 'Synthetic member', role, organizationId: orgId },
      tenantContext: { organizationId: orgId }, tenantId: orgId }); next();
  });
  a.use('/api/inline-annotations', annotationRoutes); a.use('/api/cmc-changes', cmcRoutes); a.use('/api/reg-change', regulatoryRoutes); return a;
}
beforeAll(async () => {
  pg = new PGlite(); h.pg = pg; h.db = drizzle(pg);
  const base = await readFile('migrations/0000_sweet_joseph.sql', 'utf8');
  for (const table of [schema.organizations, schema.users, schema.clientWorkspaces, schema.projects]) {
    const cfg = getTableConfig(table), ddl = base.match(new RegExp(`CREATE TABLE "${cfg.name}" \\([\\s\\S]*?\\n\\);`))?.[0];
    if (!ddl) throw new Error(`Canonical DDL missing: ${cfg.name}`); await pg.exec(ddl);
    const known = new Set((await pg.query<{ column_name: string }>('SELECT column_name FROM information_schema.columns WHERE table_name=$1', [cfg.name])).rows.map(r => r.column_name));
    for (const column of cfg.columns) if (!known.has(column.name)) await pg.exec(`ALTER TABLE "${cfg.name}" ADD COLUMN "${column.name}" ${column.getSQLType()}`);
  }
  // These stores are created by ensureCoreTables/Drizzle. Mirror their actual declared columns/defaults.
  // PGlite has no pgvector; the unused nullable embedding column is TEXT. No vector behavior is exercised.
  const dialect = new PgDialect();
  for (const table of [schema.projectIntelligenceProfiles, schema.projectMemoryEntries]) {
    const cfg = getTableConfig(table);
    const columns = cfg.columns.map(c => `"${c.name}" ${c.getSQLType().replace(/^vector\(\d+\)$/, 'text')}${c.primary ? ' PRIMARY KEY' : ''}${c.notNull ? ' NOT NULL' : ''}${c.default instanceof SQL ? ` DEFAULT ${dialect.sqlToQuery(c.default).sql}` : c.default !== undefined ? ` DEFAULT '${String(c.default)}'` : ''}`);
    await pg.exec(`CREATE TABLE "${cfg.name}" (${columns.join(',')})`);
  }
  await pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await pg.exec('ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS chain_seq BIGSERIAL');
  for (const path of ['db/migrations/20260730_cmc_change_control_store.sql', 'db/migrations/20260801_reg_change_store.sql']) await pg.exec(await readFile(path, 'utf8'));
  await pg.exec(`INSERT INTO organizations(id,name,slug) VALUES(9,'Synthetic nine','o-nine'),(10,'Synthetic ten','o-ten');
    INSERT INTO client_workspaces(id,organization_id,name,slug) VALUES(1,9,'Workspace nine','w-nine');
    INSERT INTO projects(id,organization_id,client_workspace_id,name,type) VALUES(3,9,1,'Source workspace','IND');
    INSERT INTO project_intelligence_profiles(id,project_id,organization_id) VALUES(1,3,9);`);
});
beforeEach(async () => {
  await pg.exec(`ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS o01_audit_refused;
    ALTER TABLE project_memory_entries DROP CONSTRAINT IF EXISTS o01_store_refused;
    DELETE FROM audit_logs; DELETE FROM project_memory_entries; DELETE FROM cmc_change_controls; DELETE FROM reg_change_items;`);
  await pg.query(`INSERT INTO project_memory_entries(id,project_profile_id,project_id,organization_id,category,subcategory,title,content)
    VALUES(31,1,3,9,'inline_annotation','annotation','Actual retained annotation',$1)`, [JSON.stringify({ documentId: 12, annotationType: 'comment', selectedText: 'Synthetic source text', content: 'Retained note', status: 'pending', replies: [] })]);
});
afterAll(async () => { await pg?.close(); });
const unavailableAudit = () => pg.exec('ALTER TABLE audit_logs ADD CONSTRAINT o01_audit_refused CHECK(false) NOT VALID');
const auditRows = async () => (await pg.query('SELECT tenant_id,user_id,action,record_id,sha256_chain FROM audit_logs')).rows;
const createdAnnotation = { annotationType: 'comment', selectedText: 'Synthetic source passage', rangeFrom: 0, rangeTo: 24, content: 'Saved review note' };
const expected = (failed: boolean) => failed ? { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' } : { persisted: true, chained: true };

describe('annotation response shapes retain their audit outcomes in canonical headers', () => {
  it.each([true, false])('creation, reply and decision remain durable with audit unavailable=%s', async failed => {
    if (failed) await unavailableAudit();
    const a = app();
    const created = await request(a).post('/api/inline-annotations/12').send(createdAnnotation);
    const reply = await request(a).post('/api/inline-annotations/12/31/reply').send({ content: 'Saved reply' });
    const decision = await request(a).post('/api/inline-annotations/12/31/decide').send({ decision: 'resolved', note: 'Resolved review note' });
    for (const res of [created, reply, decision]) {
      expect(res.status, JSON.stringify(res.body)).toBe(res === decision ? 200 : 201);
      expect(res.headers['x-audit-row-persisted']).toBe(String(!failed));
      expect(res.headers['x-audit-row-code']).toBe(failed ? 'AUDIT_ROW_NOT_PERSISTED' : undefined);
      expect(res.body).not.toHaveProperty('data');
    }
    expect(created.body.content).toBe('Saved review note'); expect(reply.body.content).toBe('Saved reply'); expect(decision.body.status).toBe('resolved');
    const rows = (await pg.query<{ content: string }>('SELECT content FROM project_memory_entries WHERE organization_id=9')).rows.map(row => JSON.parse(row.content));
    expect(rows).toContainEqual(expect.objectContaining({ content: 'Saved review note', documentId: 12 }));
    expect(rows).toContainEqual(expect.objectContaining({ status: 'resolved', replies: [expect.objectContaining({ content: 'Saved reply' })] }));
    expect(await auditRows()).toHaveLength(failed ? 0 : 3);
    if (!failed) for (const row of await auditRows()) expect(row).toMatchObject({ tenant_id: 9, user_id: 7, record_id: '12', sha256_chain: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });
  it.each(['reply', 'decide'])('refuses %s for a different document or tenant before writes or audit', async action => {
    for (const [org, doc] of [[9, 13], [10, 12]]) {
      const res = await request(app(org)).post(`/api/inline-annotations/${doc}/31/${action}`).send({ content: 'Unauthorized reply', decision: 'approved' });
      expect(res.status).toBe(404); expect(res.headers['x-audit-row-persisted']).toBeUndefined();
    }
    expect(JSON.parse((await pg.query<{ content: string }>('SELECT content FROM project_memory_entries WHERE id=31')).rows[0].content)).toMatchObject({ status: 'pending', replies: [] });
    expect(await auditRows()).toHaveLength(0);
  });
  it.each(['/not-an-id', '/12/no-id/reply', '/12/no-id/decide'])('refuses malformed exact target %s', async path => {
    const res = await request(app()).post(`/api/inline-annotations${path}`).send({ ...createdAnnotation, decision: 'approved' });
    expect(res.status).toBe(400); expect(await auditRows()).toHaveLength(0);
  });
  it('business failure preserves the old annotation and emits no audit receipt', async () => {
    await pg.exec('ALTER TABLE project_memory_entries ADD CONSTRAINT o01_store_refused CHECK(false) NOT VALID');
    const res = await request(app()).post('/api/inline-annotations/12/31/decide').send({ decision: 'approved' });
    expect(res.status).toBe(500); expect(res.headers['x-audit-row-persisted']).toBeUndefined(); expect(await auditRows()).toHaveLength(0);
    expect(JSON.parse((await pg.query<{ content: string }>('SELECT content FROM project_memory_entries WHERE id=31')).rows[0].content).status).toBe('pending');
  });
});

describe('change proposals report real committed records and canonical audit results', () => {
  it.each([true, false])('CMC and regulatory change persistence and reload with audit unavailable=%s', async failed => {
    if (failed) await unavailableAudit();
    const a = app();
    const cmc = await request(a).post('/api/cmc-changes').send({ title: 'Saved scale change', dosageFormFamily: 'immediate_release_oral_solid', changeCategory: 'scale_up' });
    const regulatory = await request(a).post('/api/reg-change').send({ title: 'Saved tracked guidance', kind: 'guidance', sev: 'med' });
    for (const res of [cmc, regulatory]) {
      expect(res.status, JSON.stringify(res.body)).toBe(201); expect(res.body.meta?.auditTrail).toMatchObject(expected(failed));
      expect(JSON.stringify(res.body)).not.toMatch(/o01_audit_refused|constraint|Synthetic secondary store/);
    }
    expect(cmc.body.meta.module3WriteThrough).toBe('skipped_no_project');
    expect((await request(a).get('/api/cmc-changes')).body.data).toContainEqual(expect.objectContaining({ title: 'Saved scale change' }));
    expect((await pg.query('SELECT id,title FROM cmc_change_controls')).rows).toEqual([{ id: cmc.body.id, title: 'Saved scale change' }]);
    expect((await request(a).get('/api/reg-change')).body.data).toContainEqual(expect.objectContaining({ id: regulatory.body.id, title: 'Saved tracked guidance' }));
    expect((await request(app(10)).get('/api/cmc-changes')).body.data).toEqual([]); expect((await request(app(10)).get('/api/reg-change')).body.data).toEqual([]);
    expect(await auditRows()).toHaveLength(failed ? 0 : 2);
  });
  it('subsequent recovery writes real history without manufacturing a receipt for the earlier act', async () => {
    await unavailableAudit();
    const lost = await request(app()).post('/api/reg-change').send({ title: 'Saved during outage', kind: 'guidance', sev: 'low' });
    expect(lost.status).toBe(201); expect(lost.body.meta.auditTrail.persisted).toBe(false);
    await pg.exec('ALTER TABLE audit_logs DROP CONSTRAINT o01_audit_refused');
    const recovered = await request(app()).post('/api/reg-change').send({ title: 'Saved after recovery', kind: 'standard', sev: 'low' });
    expect(recovered.status).toBe(201); expect(recovered.body.meta.auditTrail).toMatchObject({ persisted: true, chained: true });
    expect((await pg.query('SELECT title FROM reg_change_items')).rows).toHaveLength(2); expect(await auditRows()).toHaveLength(1);
  });
  it('invalid business inputs produce no change or successful audit outcome', async () => {
    for (const [route, body] of [['cmc-changes', { title: 'Rejected CMC change', dosageFormFamily: 'not-valid', changeCategory: 'scale_up' }], ['reg-change', { title: 'Rejected tracked change', kind: 'not-valid', sev: 'low' }]] as const) {
      const res = await request(app()).post(`/api/${route}`).send(body);
      expect(res.status).toBe(400); expect(res.body.meta?.auditTrail).toBeUndefined();
    }
    expect((await pg.query('SELECT id FROM cmc_change_controls')).rows).toHaveLength(0); expect((await pg.query('SELECT id FROM reg_change_items')).rows).toHaveLength(0); expect(await auditRows()).toHaveLength(0);
  });
});
