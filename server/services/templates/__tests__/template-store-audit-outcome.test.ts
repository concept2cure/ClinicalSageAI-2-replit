/**
 * Template Library writes — create, update, deactivate — and their §11.10(e)
 * audit rows.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `auditTemplate` wrapped `await auditService.logAction(…)` in a try/catch its
 * comment called best-effort, and discarded the resolved outcome. `logAction`
 * does not reject when the row is lost — it resolves `persisted: false` — so
 * the catch could only ever see a bug, and every template change answered the
 * same whether or not an audit row existed. The Template Library surface
 * (Authoring, a launch app) then said "Template saved".
 *
 * ── What these tests hold ────────────────────────────────────────────────────
 * The change stands when the row is lost, and each writer now resolves the
 * outcome beside its result; the route forwards it as `auditTrail`, which the
 * client transport turns into "The request completed, but the audit trail did not record it".
 */

import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
const logActionMock = vi.fn();

vi.mock('../../../db.js', () => ({ pool: { query: (...a: unknown[]) => queryMock(...a) } }));
vi.mock('../../auditService.js', () => ({
  default: { logAction: (...a: unknown[]) => logActionMock(...a) },
}));

const LOST = { persisted: false, chained: false, tamperProof: false, error: 'relation "audit_logs" is locked' };
const KEPT = { persisted: true, chained: true, tamperProof: true };

const ROW = {
  id: 'tpl_1',
  org_id: 7,
  project_id: null,
  name: 'House CTD',
  description: null,
  source_file_name: null,
  source_file_type: null,
  spec: {},
  extraction_confidence: null,
  extraction_warnings: [],
  verified: false,
  is_active: true,
  created_by: 3,
  created_at: new Date('2026-09-24T00:00:00Z'),
  updated_at: new Date('2026-09-24T00:00:00Z'),
};

beforeEach(() => {
  queryMock.mockReset();
  logActionMock.mockReset();
  queryMock.mockImplementation(async (sql: string) => {
    if (/SET is_active = false/.test(sql)) return { rows: [{ id: 'tpl_1' }] };
    return { rows: [ROW] };
  });
});

describe('templateStore writers carry the audit-row outcome', () => {
  it('createTemplate: a lost row still creates the template, and says the row is missing', async () => {
    const { createTemplate } = await import('../templateStore');
    logActionMock.mockResolvedValueOnce(LOST);
    const created = await createTemplate({ orgId: 7, userId: 3, name: 'House CTD', spec: {} as any });
    expect(created.record.id).toBe('tpl_1');
    expect(created.auditTrail).toEqual({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED', message: expect.any(String) });
    expect(JSON.stringify(created)).not.toContain('locked');
  });

  it('updateTemplate: a written row says so', async () => {
    const { updateTemplate } = await import('../templateStore');
    logActionMock.mockResolvedValueOnce(KEPT);
    const updated = await updateTemplate(7, 3, 'tpl_1', { verified: true });
    expect(updated?.record.id).toBe('tpl_1');
    expect(updated?.auditTrail).toEqual({ persisted: true, chained: true });
  });

  it('deactivateTemplate: a lost row still deactivates, and says the row is missing', async () => {
    const { deactivateTemplate } = await import('../templateStore');
    logActionMock.mockResolvedValueOnce(LOST);
    const done = await deactivateTemplate(7, 3, 'tpl_1');
    expect(done).not.toBeNull();
    expect(done?.auditTrail).toMatchObject({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' });
  });

  it('a writer that throws is reported as a lost row, not as success', async () => {
    const { deactivateTemplate } = await import('../templateStore');
    logActionMock.mockRejectedValueOnce(new Error('bug below the guard'));
    const done = await deactivateTemplate(7, 3, 'tpl_1');
    expect(done?.auditTrail).toMatchObject({ persisted: false });
  });
});

describe('/api/c2c/templates forwards the outcome', () => {
  async function app() {
    const router = (await import('../../../routes/c2c/templates')).default;
    const a = express();
    a.use(express.json());
    a.use((req: Request, _res: Response, next: NextFunction) => {
      (req as any).organizationId = 7;
      (req as any).userId = 3;
      next();
    });
    a.use('/api/c2c/templates', router);
    return a;
  }

  it('PUT answers the updated template with auditTrail', async () => {
    logActionMock.mockResolvedValueOnce(LOST);
    const res = await request(await app()).put('/api/c2c/templates/tpl_1').send({ verified: true });
    expect(res.status).toBe(200);
    expect(res.body.template.id).toBe('tpl_1');
    expect(res.body.auditTrail).toMatchObject({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' });
  });

  it('DELETE answers success with auditTrail', async () => {
    logActionMock.mockResolvedValueOnce(KEPT);
    const res = await request(await app()).delete('/api/c2c/templates/tpl_1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, auditTrail: { persisted: true, chained: true } });
  });

  it('POST (create from spec) answers 201 with auditTrail', async () => {
    logActionMock.mockResolvedValueOnce(LOST);
    const res = await request(await app()).post('/api/c2c/templates').send({ name: 'House CTD', spec: {} });
    expect(res.status).toBe(201);
    expect(res.body.template.id).toBe('tpl_1');
    expect(res.body.auditTrail).toMatchObject({ persisted: false });
  });
});
