/**
 * A cover letter names the filed sequence it accompanies, and an information
 * amendment's letter then says what it contains (21 CFR 312.31(b)), read from
 * that sequence's stored leaves (D5, 2026-10-30, the CSR path sweep).
 *
 * b9dbaeff4 taught the planner and the letter "Information Amendment:
 * Clinical", but no screen could reach it. The letter's type came from what
 * the caller stated, else from submissions.lifecycle_stage, which names only
 * original and annual and which nothing advances. The IND screen states no
 * type, so every amendment's letter, the LMN-201 CSR's included, carried a
 * submissionType gap and could never identify its contents.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../../middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  default: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../../db', () => ({ db: {} }));
vi.mock('../../../services/auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true })) } }));
const m = vi.hoisted(() => ({ getSubmission: vi.fn(), listSequences: vi.fn(), listLeaves: vi.fn() }));
vi.mock('../../../services/submission-service/submission-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/submission-service/submission-service')>()),
  getSubmission: m.getSubmission,
  listSequences: m.listSequences,
  listLeaves: m.listLeaves,
}));

import documentsRoutes from '../documents.routes';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as unknown as { user: unknown }).user = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
    next();
  });
  a.use('/api/ind-lifecycle', documentsRoutes);
  return a;
}

const CTX = { userId: 9, organizationId: 1 };
const letter = (b: Record<string, unknown>) => request(app()).post('/api/ind-lifecycle/cover-letter')
  .send({ sponsorName: 'Lumen Bioscience', drugName: 'LMN-201', fdaCenter: 'CDER', submissionId: 31, ...b });

/** The leaves the amendment filing writes for a CSR: the transmittal pair and the report at 5.3.5.1. */
const CSR_AMENDMENT = [
  { sectionCode: 'm1.1', documentType: 'form_1571' },
  { sectionCode: 'm1.2', documentType: 'cover_letter' },
  { sectionCode: 'm5.3.5.1', documentType: 'clinical_study_report' },
];

beforeEach(() => {
  vi.clearAllMocks();
  m.getSubmission.mockResolvedValue({ id: 31, lifecycleStage: 'planning' });
  m.listSequences.mockResolvedValue([
    { id: 90, sequenceNumber: '0000', type: 'original' },
    { id: 94, sequenceNumber: '0007', type: 'amendment' },
  ]);
  m.listLeaves.mockResolvedValue(CSR_AMENDMENT);
});

describe('POST /cover-letter for a filed sequence', () => {
  it('a CSR information amendment says "Information Amendment: Clinical", with no type gap', async () => {
    const res = await letter({ sequenceNumber: '0007' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.submissionType).toBe('information_amendment');
    expect(res.body.body).toContain('Information Amendment: Clinical');
    expect(res.body.gaps).not.toContain('submissionType');
    expect(res.body.gaps.join(' ')).not.toMatch(/312\.31\(b\) requires/);
    // Read from this organization's own sequence and its stored leaves.
    expect(m.listSequences).toHaveBeenCalledWith(31, CTX);
    expect(m.listLeaves).toHaveBeenCalledWith(94, CTX);
  });

  it('a protocol amendment is not called an information amendment: its type stays a gap (control)', async () => {
    m.listLeaves.mockResolvedValue([...CSR_AMENDMENT.slice(0, 2), { sectionCode: 'm5.3.5.1', documentType: 'protocol' }]);
    const res = await letter({ sequenceNumber: '0007' });
    expect(res.status).toBe(200);
    expect(res.body.submissionType).toBeNull();
    expect(res.body.gaps).toContain('submissionType');
    expect(res.body.body).not.toContain('Information Amendment');
  });

  it('a sequence this submission has not filed is 404 naming it, and no letter is assembled', async () => {
    const res = await letter({ sequenceNumber: '0009' });
    expect(res.status).toBe(404);
    expect(res.body.error.message).toContain('0009');
  });

  it('a sequence number that is not four digits is 400 naming it', async () => {
    const res = await letter({ sequenceNumber: '7' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('sequenceNumber');
  });

  it('a type the caller states still wins, and no sequence is read (control)', async () => {
    const res = await letter({ sequenceNumber: '0007', submissionType: 'annual_report' });
    expect(res.body.submissionType).toBe('annual_report');
    expect(m.listSequences).not.toHaveBeenCalled();
  });
});
