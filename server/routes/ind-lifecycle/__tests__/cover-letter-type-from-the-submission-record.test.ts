/**
 * The cover letter's submission type is the one the caller states, else the one
 * the submission record's lifecycle stage names (lifecycleStageToSubmissionType),
 * else not stated — the letter then carries the "[Submission Type]" placeholder
 * and a submissionType gap.
 *
 * What the code used to do (until 2026-10-15): the IND screen's cover-letter
 * card sent submissionType 'original' for every letter, and POST /cover-letter
 * (and /pdf) refused one without a type (400) — so the screen could send
 * nothing else, and every letter, an annual report's or an amendment's
 * included, read "Initial Investigational New Drug Application".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../../middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  default: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../../db', () => ({ db: {} }));
const m = vi.hoisted(() => ({ getSubmission: vi.fn() }));
vi.mock('../../../services/submission-service/submission-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/submission-service/submission-service')>()),
  getSubmission: m.getSubmission,
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

const letter = (b: Record<string, unknown>) => request(app()).post('/api/ind-lifecycle/cover-letter').send({ sponsorName: 'Acme Bio', drugName: 'Zexanib', fdaCenter: 'CDER', ...b });

beforeEach(() => vi.clearAllMocks());

describe('POST /cover-letter — the submission type comes from what is recorded, or is not stated', () => {
  it('reads it from the submission record\'s lifecycle stage', async () => {
    m.getSubmission.mockResolvedValue({ id: 31, lifecycleStage: 'annual', productName: 'ZX-9' });
    const res = await letter({ submissionId: 31 });
    expect(res.status).toBe(200);
    expect(m.getSubmission).toHaveBeenCalledWith(31, { userId: 9, organizationId: 1 });
    expect(res.body.submissionType).toBe('annual_report');
    expect(res.body.body).toContain('Annual Report');
    expect(res.body.gaps).not.toContain('submissionType');
  });

  it('a record whose stage names no type (planning, the default) leaves it not stated — never "original"', async () => {
    m.getSubmission.mockResolvedValue({ id: 31, lifecycleStage: 'planning' });
    const res = await letter({ submissionId: 31 });
    expect(res.status).toBe(200);
    expect(res.body.submissionType).toBeNull();
    expect(res.body.gaps).toContain('submissionType');
    expect(res.body.body).toContain('[Submission Type]');
    expect(res.body.body).not.toContain('Initial Investigational New Drug Application');
  });

  it('with no type and no record, the letter is assembled with the gap — not refused', async () => {
    const res = await letter({});
    expect(res.status).toBe(200);
    expect(res.body.submissionType).toBeNull();
    expect(res.body.gaps).toContain('submissionType');
    expect(m.getSubmission).not.toHaveBeenCalled();
  });

  it('a type the caller states wins, and the record is not read', async () => {
    const res = await letter({ submissionId: 31, submissionType: 'information_amendment' });
    expect(res.body.submissionType).toBe('information_amendment');
    expect(m.getSubmission).not.toHaveBeenCalled();
  });

  it('a submissionId that is not a positive integer is 400 naming it; an unknown one is 404', async () => {
    const bad = await letter({ submissionId: 'abc' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toContain('submissionId');
    m.getSubmission.mockRejectedValue(Object.assign(new Error('Submission not found.'), { code: 'NOT_FOUND' }));
    const missing = await letter({ submissionId: 404 });
    expect(missing.status).toBe(404);
  });

  it('the PDF route reads the same record', async () => {
    m.getSubmission.mockResolvedValue({ id: 31, lifecycleStage: 'original' });
    const res = await request(app())
      .post('/api/ind-lifecycle/cover-letter/pdf')
      .send({ sponsorName: 'Acme Bio', drugName: 'Zexanib', submissionId: 31 });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(m.getSubmission).toHaveBeenCalledTimes(1);
  });
});
