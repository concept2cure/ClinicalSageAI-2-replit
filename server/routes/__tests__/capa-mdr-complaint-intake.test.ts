/**
 * POST /api/capa-mdr/complaints requires the harm and severity assessments.
 *
 * Both were optional: an absent patientHarm was stored as 'none' and the
 * intake triage classified the complaint "No harm reported — log under
 * 820.198, no MDR", a reportability determination nobody had made.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const H = vi.hoisted(() => ({ createComplaint: vi.fn() }));

vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 7, organizationId: 3 };
    next();
  },
}));
vi.mock('../../services/capa-mdr/capaMdr.service', () => {
  class TenantAccessError extends Error {}
  class NotFoundError extends Error {}
  class ComplaintAssessmentRequired extends Error {}
  return {
    createComplaint: H.createComplaint,
    TenantAccessError,
    NotFoundError,
    ComplaintAssessmentRequired,
    CapaAccessError:class extends Error {},
    CapaPersistenceError:class extends Error {},
  };
});

import capaMdrRoutes from '../capa-mdr';

const app = express();
app.use(express.json());
app.use('/api/capa-mdr', capaMdrRoutes);

const BODY = {
  programId: '11111111-1111-4111-8111-111111111111',
  source: 'customer',
  channel: 'email',
  receivedAt: '2026-10-15T09:00:00Z',
  eventNarrative: 'Device alarmed during use',
};

beforeEach(() => {
  H.createComplaint.mockReset();
  H.createComplaint.mockResolvedValue({ id: 'c-1' });
});

describe('complaint intake requires the assessments the classification is computed from', () => {
  it('refuses a complaint with no patientHarm, and records nothing', async () => {
    const res = await request(app).post('/api/capa-mdr/complaints').send({ ...BODY, severityAssessment: 'minor' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/patientHarm is required/);
    expect(H.createComplaint).not.toHaveBeenCalled();
  });

  it('refuses a harm outside the vocabulary rather than reading it as none', async () => {
    const res = await request(app)
      .post('/api/capa-mdr/complaints')
      .send({ ...BODY, patientHarm: 'unknown', severityAssessment: 'minor' });
    expect(res.status).toBe(422);
    expect(H.createComplaint).not.toHaveBeenCalled();
  });

  it('refuses a complaint with no severityAssessment', async () => {
    const res = await request(app).post('/api/capa-mdr/complaints').send({ ...BODY, patientHarm: 'injury' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/severityAssessment is required/);
    expect(H.createComplaint).not.toHaveBeenCalled();
  });

  it('records the assessments it was given, as given', async () => {
    const res = await request(app)
      .post('/api/capa-mdr/complaints')
      .send({ ...BODY, patientHarm: 'serious_injury', severityAssessment: 'serious' });
    expect(res.status).toBe(201);
    expect(H.createComplaint).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ patientHarm: 'serious_injury', severityAssessment: 'serious' }),
      { userId:7 },
    );
  });
});
