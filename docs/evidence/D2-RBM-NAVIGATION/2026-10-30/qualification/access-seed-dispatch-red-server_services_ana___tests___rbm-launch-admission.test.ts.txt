import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ access: vi.fn(), status: '', query: vi.fn(), poolQuery: vi.fn(), connect: vi.fn(), release: vi.fn() }));
vi.mock('../../../db', async original => {
 const pool = { query: h.poolQuery, connect: h.connect };
 return { ...(await original<Record<string, unknown>>()), getPool: () => pool };
});
vi.mock('../../c2c/program-access', async original => ({ ...(await original<Record<string, unknown>>()), programInOrganization: async () => true }));
vi.mock('../../c2c/current-program-access', async original => ({ ...(await original<Record<string, unknown>>()), requireCurrentProgramAccess: h.access }));
vi.mock('../../part11/editor-role', async original => ({ ...(await original<Record<string, unknown>>()), editorRoleDecision: async () => ({ allowed: true, role: 'admin' }) }));
vi.mock('../../entitlements/enforcement-mode', () => ({ currentEnforcementMode: async () => ({ mode: 'off' }) }));
vi.mock('../../c2c/governed-program-write', () => ({ requireGovernedProgramWriteTx: async () => {} }));
import { getToolHandler } from '../AnaToolExecutor';
import { getPool } from '../../../db';
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const ctx = { organizationId: 7, userId: 3, humanConfirmed: true };
beforeEach(() => {
 vi.stubEnv('LAUNCH_SCOPE_ENFORCE', 'off'); h.status = ''; h.access.mockReset().mockResolvedValue({ programId: PROGRAM, projectId: 9, actor: { userId: 3, role: 'admin' } });
 h.query.mockReset().mockImplementation(async (sql: string) => {
  if (sql.includes('INSERT INTO rbm_risk_assessments')) { h.status = sql.includes("'active'") ? 'active' : 'draft'; return { rows: [{ id: 1, status: h.status, overall_risk: 'medium' }] }; }
  if (sql.includes('FROM rbm_risk_assessments')) return { rows: h.status ? [{ id: 1, status: h.status, overall_risk: 'medium' }] : [] };
  return { rows: [] };
 });
 h.poolQuery.mockReset().mockImplementation((sql: string, params?: unknown[]) => h.query(sql, params));
 h.release.mockReset(); h.connect.mockReset().mockImplementation(async () => ({ query: h.query, release: h.release }));
});
afterEach(() => vi.unstubAllEnvs());
describe('registered RBM tool admission and draft seed', () => {
 it('refuses a private same-organization project before reading its RBM records', async () => {
  h.access.mockRejectedValue(Object.assign(new Error('Private project'), { status: 403, code: 'PROJECT_PERMISSION_DENIED' }));
  const out = JSON.parse(await getToolHandler('run_rbm_assessment')!({ programId: PROGRAM }, ctx));
  expect(out.code).toBe('PROJECT_PERMISSION_DENIED');
  expect(h.query.mock.calls.some(([sql]) => sql.includes('FROM rbm_risk_assessments'))).toBe(false);
 });
 it('seeds an unsigned assessment as a draft through the registered handler', async () => {
  const out = JSON.parse(await getToolHandler('run_rbm_assessment')!({ programId: PROGRAM, seed: true }, ctx));
  expect(out.assessment?.status).toBe('draft');
  expect(h.query.mock.calls.some(([sql]) => sql.trim() === 'COMMIT')).toBe(true);
 });
 it('leases the canonical pool supplied as sqlClient instead of transacting through pool.query', async () => {
  h.poolQuery.mockImplementation((sql: string, params?: unknown[]) => {
   if (/^(BEGIN|COMMIT|ROLLBACK|INSERT)\b/.test(sql.trim())) throw new Error('Pool queries cannot own a seed transaction');
   return h.query(sql, params);
  });
  const out = JSON.parse(await getToolHandler('run_rbm_assessment')!({ programId: PROGRAM, seed: true }, { ...ctx, sqlClient: getPool() }));
  expect(out.assessment?.status).toBe('draft');
  expect(h.connect).toHaveBeenCalledOnce(); expect(h.release).toHaveBeenCalledOnce();
  expect(h.poolQuery.mock.calls.some(([sql]) => /^(BEGIN|COMMIT|ROLLBACK|INSERT)\b/.test(sql.trim()))).toBe(false);
 });
 it('uses a supplied pinned client without reconnecting it or falling back to the pool', async () => {
  const pinned = { query: h.query, connect: vi.fn(async () => { throw new Error('Client has already been connected'); }) };
  const out = JSON.parse(await getToolHandler('run_rbm_assessment')!({ programId: PROGRAM, seed: true }, { ...ctx, sqlClient: pinned }));
  expect(out.assessment?.status).toBe('draft');
  expect(pinned.connect).not.toHaveBeenCalled(); expect(h.connect).not.toHaveBeenCalled(); expect(h.poolQuery).not.toHaveBeenCalled();
  expect(h.query.mock.calls.some(([sql]) => sql.trim() === 'BEGIN')).toBe(true);
  expect(h.query.mock.calls.some(([sql]) => sql.trim() === 'COMMIT')).toBe(true);
 });
});
