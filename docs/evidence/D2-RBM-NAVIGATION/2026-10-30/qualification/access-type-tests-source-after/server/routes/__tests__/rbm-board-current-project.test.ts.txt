import express from 'express';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ access: vi.fn(), scope: vi.fn(), recheck: vi.fn(), select: vi.fn() }));
vi.mock('../../services/c2c/current-program-access', async original => ({ ...(await original<Record<string, unknown>>()), requireCurrentProgramAccess: h.access, getCurrentAccessibleProgramScope: h.scope, requireProgramScopeStillCurrent: h.recheck }));
vi.mock('../../db/requestDb', async original => ({ ...(await original<Record<string, unknown>>()), requestDb: () => ({ select: h.select }) }));
import createRouter from '../mdx-rbm-board';
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222', C = '33333333-3333-4333-8333-333333333333', D = '44444444-4444-4444-8444-444444444444';
let db: PGlite;
const tables = ['rbm_risk_assessments', 'rbm_risk_items', 'rbm_kris', 'rbm_qtls', 'rbm_signals', 'rbm_site_risk_scores', 'rbm_patient_profiles', 'rbm_monitoring_plans', 'rbm_data_runs'];
function app() { const a = express(); a.use((req, _res, next) => { Object.assign(req, { user: { id: 3, organizationId: 7 }, dbClient: { query: (sql: string, args?: unknown[]) => db.query(sql, args) } }); next(); }); a.use('/api/mdx-rbm', createRouter()); return a; }
beforeAll(async () => {
 db = new PGlite();
 await db.exec('CREATE TABLE regulatory_programs(id uuid PRIMARY KEY,organization_id integer,name text,code text,product_type text,program_type text,metadata json,deleted_at timestamptz);');
 for (const t of tables.filter(name => name !== 'rbm_site_risk_scores' && name !== 'rbm_data_runs')) await db.exec(`CREATE TABLE ${t}(id serial,organization_id integer,program_id uuid,deleted_at timestamptz);`);
 await db.exec('CREATE TABLE rbm_data_runs(id serial,organization_id integer,program_id uuid); CREATE TABLE organizations(id integer PRIMARY KEY); INSERT INTO organizations(id) VALUES(7);');
 const migration = readFileSync(new URL('../../../migrations/20260629_rbm_surfaces.sql', import.meta.url), 'utf8');
 const siteDdl = migration.match(/CREATE TABLE IF NOT EXISTS rbm_site_risk_scores \([\s\S]*?\n\);/);
 if (!siteDdl) throw new Error('Creating site risk DDL was not found');
 await db.exec(siteDdl[0]);
}, 30000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
 await db.exec('TRUNCATE regulatory_programs,' + tables.join(','));
 h.access.mockReset().mockResolvedValue({}); h.scope.mockReset().mockResolvedValue({ programIds: [A, B, D], actor: { userId: 3, role: 'admin' }, reconciliationRequired: false }); h.recheck.mockReset().mockResolvedValue(undefined); h.select.mockReset();
 await db.query(`INSERT INTO regulatory_programs(id,organization_id,name,code,product_type,program_type,metadata) VALUES ($1,7,'Actual selected project','CODE-A','drug','IND','{"riskBasedMonitoring":true}'),($2,7,'Actual legacy project','CODE-B','device','IDE','{}'),($3,7,'Private project','PRIVATE','drug','IND','{"riskBasedMonitoring":true}'),($4,7,'String flag is not selection','STRING','drug','IND','{"riskBasedMonitoring":"true"}')`, [A, B, C, D]);
 await db.query('INSERT INTO rbm_risk_assessments(organization_id,program_id) VALUES (7,$1),(7,$2)', [B, C]);
});
describe('RBM canonical project roster', () => {
 it('offers an opted-in empty project and legacy monitored project using actual names, excludes private projects and string flags', async () => {
  const out = await request(app()).get('/api/mdx-rbm/rbm-programs');
  expect(out.status).toBe(200);
  expect(out.body.data).toEqual([{ id: B, label: 'Actual legacy project', code: 'CODE-B', productType: 'device', programType: 'IDE' }, { id: A, label: 'Actual selected project', code: 'CODE-A', productType: 'drug', programType: 'IND' }]);
  expect(JSON.stringify(out.body)).not.toContain('Private'); expect(out.body.total).toBe(2);
 });
 it('uses the actual site-score DDL and includes a project whose only legacy monitoring record is its site snapshot', async () => {
  const id = '55555555-5555-4555-8555-555555555555';
  const columns = await db.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name='rbm_site_risk_scores'");
  expect(columns.rows.map(row => row.column_name)).not.toContain('deleted_at');
  await db.query("INSERT INTO regulatory_programs(id,organization_id,name,metadata) VALUES($1,7,'Site-only monitored project','{}')", [id]);
  await db.query('INSERT INTO rbm_site_risk_scores(organization_id,program_id) VALUES(7,$1)', [id]);
  h.scope.mockResolvedValue({ programIds: [id], reconciliationRequired: false });
  const out = await request(app()).get('/api/mdx-rbm/rbm-programs');
  expect(out.status).toBe(200); expect(out.body.data).toEqual([{ id, label: 'Site-only monitored project', code: null, productType: null, programType: null }]);
 });
 it('reports inaccessible anchor reconciliation generically without a hidden identity or count', async () => {
  h.scope.mockResolvedValue({ programIds: [], reconciliationRequired: true });
  const out = await request(app()).get('/api/mdx-rbm/rbm-programs');
  expect(out.status).toBe(200); expect(out.body.data).toEqual([]); expect(out.body.meta.reconciliationRequired).toBe(true); expect(JSON.stringify(out.body.meta)).not.toContain(C);
 });
 it('does not return already-read roster rows after current permission revalidation fails', async () => {
  h.recheck.mockRejectedValue(Object.assign(new Error('Changed'), { status: 503, code: 'PROJECT_ACCESS_CHANGED' }));
  const out = await request(app()).get('/api/mdx-rbm/rbm-programs');
  expect(out.status).toBe(503); expect(out.body.data).toBeUndefined(); expect(h.recheck).toHaveBeenCalledOnce();
 });
 it('reports a missing RBM store instead of a successful empty inventory', async () => {
  await db.exec('ALTER TABLE rbm_risk_items RENAME TO hidden_items');
  try { const out = await request(app()).get('/api/mdx-rbm/rbm-programs'); expect(out.status).toBe(503); expect(out.body.success).toBe(false); expect(out.body.data).toBeUndefined(); }
  finally { await db.exec('ALTER TABLE hidden_items RENAME TO rbm_risk_items'); }
 });
});
describe('RBM board project admission', () => {
 it('denies a private project before any board sections are read', async () => {
  h.access.mockRejectedValue(Object.assign(new Error('Private'), { status: 403, code: 'PROJECT_PERMISSION_DENIED' }));
  const out = await request(app()).get('/api/mdx-rbm/rbm-board/' + C);
  expect(out.status).toBe(403); expect(h.select).not.toHaveBeenCalled(); expect(out.body.data).toBeUndefined();
 });
 it('reports an unavailable board store explicitly without a healthy pendingStore board', async () => {
  h.select.mockImplementation(() => { throw Object.assign(new Error('Missing store'), { code: '42P01' }); });
  const out = await request(app()).get('/api/mdx-rbm/rbm-board/' + A);
  expect(out.status).toBe(503); expect(out.body.success).toBe(false); expect(out.body.data).toBeUndefined();
 });
});
