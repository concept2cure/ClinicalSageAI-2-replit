/**
 * GET /api/authoring-actions/section-evidence reads the caller's organization's
 * evidence, returns the rows it read, and says so when it could not read.
 *
 * What the code used to do (until 2026-10-15):
 *   - it resolved no tenant: getStageEvidence was called with no organization
 *     (which now refuses an unscoped read) and the gap analysis with the
 *     literal organization 1 — another tenant's coverage;
 *   - it tested `Array.isArray(stageEvidence)` on the driver's result object,
 *     which is never an array, so recorded evidence was never returned;
 *   - every failure fell into `catch { /* Service unavailable *\/ }` and was
 *     answered 200 "No evidence found for section X" — an unread store
 *     reported as an empty one.
 *   - a row with no recorded regulatory status was shown as 'pending'.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const H = vi.hoisted(() => ({
  getStageEvidence: vi.fn(),
  performGapAnalysis: vi.fn(),
}));

vi.mock('../../services/EvidenceManagementService.js', () => ({
  EvidenceManagementService: class {
    getStageEvidence = H.getStageEvidence;
    performGapAnalysis = H.performGapAnalysis;
  },
}));

import authoringActionsRouter from '../authoring-actions';

function app(tenantId: number | null) {
  const a = express();
  a.use((req, _res, next) => {
    if (tenantId !== null) (req as any).tenantId = tenantId;
    (req as any).userId = 7;
    next();
  });
  a.use('/api/authoring-actions', authoringActionsRouter);
  return a;
}

const ROW = {
  id: 'ev-1',
  file_name: 'ISO 10993-5 cytotoxicity report.pdf',
  category: 'biocompatibility',
  test_type: null,
  fda_requirement: 'biocompat',
  fda_section: 'cytotoxicity',
  regulatory_status: null,
};
const GAPS = { completeness: 50, gaps: [], critical_gaps: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  H.getStageEvidence.mockResolvedValue({ rows: [ROW] });
  H.performGapAnalysis.mockResolvedValue(GAPS);
});

const get = (tenantId: number | null = 3) =>
  request(app(tenantId)).get('/api/authoring-actions/section-evidence/12/2.4');

describe('GET /section-evidence', () => {
  it("reads the caller's organization for both the evidence and the gap analysis", async () => {
    await get(3);
    expect(H.getStageEvidence).toHaveBeenCalledWith('12', 1, 3);
    expect(H.performGapAnalysis).toHaveBeenCalledWith('12', 3);
  });

  it('returns the evidence rows it read, with their recorded name and status', async () => {
    const res = await get(3);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('data');
    expect(res.body.evidenceCount).toBe(1);
    expect(res.body.evidence[0]).toMatchObject({
      id: 'ev-1',
      title: 'ISO 10993-5 cytotoxicity report.pdf',
      type: 'biocompatibility',
      status: null, // not recorded — never 'pending'
    });
  });

  it('answers 503 when the evidence store cannot be read, never "No evidence found"', async () => {
    H.getStageEvidence.mockRejectedValue(new Error('connection terminated'));
    const res = await get(3);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      status: 'unavailable',
      action: 'section_evidence',
      error: 'EVIDENCE_READ_FAILED',
      message: "The evidence store could not be read, so nothing is known about this section's evidence.",
    });
  });

  it('refuses a request with no tenant, and reads nothing', async () => {
    const res = await get(null);
    expect(res.status).toBe(401);
    expect(H.getStageEvidence).not.toHaveBeenCalled();
    expect(H.performGapAnalysis).not.toHaveBeenCalled();
  });
});
