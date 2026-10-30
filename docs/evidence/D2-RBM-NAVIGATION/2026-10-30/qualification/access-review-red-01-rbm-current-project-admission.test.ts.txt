import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ access: vi.fn(), query: vi.fn() }));
vi.mock('../../db', () => ({ pool: { query: h.query, connect: async () => ({ query: h.query, release: vi.fn() }) } }));
vi.mock('../../services/c2c/current-program-access', async original => ({ ...(await original<Record<string, unknown>>()), requireCurrentProgramAccess: h.access }));
vi.mock('../../services/part11/resolve-signer-role', () => ({ resolveSignerOrgRole: async () => 'admin' }));
vi.mock('../../services/part11/reverify-signer-deps', () => ({ signerReverificationDeps: vi.fn() }));
vi.mock('../../services/c2c/governed-program-write', () => ({ requireGovernedProgramWriteTx: async () => {} }));
import router from '../mdx-rbm';
const PROGRAM = '11111111-1111-4111-8111-111111111111';
function app() { const a = express(); a.use(express.json()); a.use((req, _res, next) => { Object.assign(req, { user: { id: 3, organizationId: 7, role: 'admin' }, dbClient: { query: h.query } }); next(); }); a.use('/api/mdx', router); return a; }
beforeEach(() => { h.query.mockReset().mockResolvedValue({ rows: [{ id: 1, program_id: PROGRAM, status: 'draft' }] }); h.access.mockReset().mockRejectedValue(Object.assign(new Error('Current project access does not permit this operation.'), { status: 403, code: 'PROJECT_PERMISSION_DENIED' })); });
describe('RBM current project admission', () => {
 it('refuses a private same-organization project before creating its assessment', async () => {
  const out = await request(app()).post('/api/mdx/rbm-assessments').send({ programId: PROGRAM, title: 'Private study assessment' });
  expect(out.status).toBe(403);
  expect(h.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO rbm_risk_assessments'))).toBe(false);
 });
 it.each([
  ['/rbm-assessments?program_id=' + PROGRAM, { title: 'Query-only project' }],
  ['/rbm-assessments', { title: 'Ignored body alias', program_id: PROGRAM }],
  ['/rbm-risk-items', { assessmentId: 1, ctqFactor: 'Parent-only programme', likelihood: 2, impact: 3 }],
 ])('refuses an unanchored create whose handler does not consume the admitted context: %s', async (path, body) => {
  h.access.mockResolvedValue({});
  const out = await request(app()).post('/api/mdx' + path).send(body);
  expect(out.status).toBe(422);
  expect(h.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO'))).toBe(false);
 });
 it('keeps a valid body programme attached to its actual persisted assessment', async () => {
  h.access.mockResolvedValue({});
  const out = await request(app()).post('/api/mdx/rbm-assessments').send({ programId: PROGRAM, title: 'Anchored draft' });
  expect(out.status).toBe(201);
  const insert = h.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO rbm_risk_assessments'))!;
  expect(insert[1][1]).toBe(PROGRAM);
 });
});
