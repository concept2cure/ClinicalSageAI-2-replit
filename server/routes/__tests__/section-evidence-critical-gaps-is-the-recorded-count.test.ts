/**
 * GET /api/authoring-actions/section-evidence reports criticalGaps as the count
 * the gap analysis holds, or null when it records none.
 *
 * What the code used to do (until 2026-10-15): it returned
 * `criticalGaps: critical_gaps || []`. summarizeRequirementCoverage's
 * critical_gaps is a count, so a project with no critical gap was answered
 * `[]` (an empty list) and one with two was answered `2`: one field holding
 * two types, and a recorded zero turned into a list. No client reads the
 * field; the honest type is the one the gap analysis holds.
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

const app = express();
app.use((req, _res, next) => {
  (req as any).tenantId = 3;
  (req as any).userId = 7;
  next();
});
app.use('/api/authoring-actions', authoringActionsRouter);

const ROW = { id: 'ev-1', file_name: 'ISO 10993-5 report.pdf', category: 'biocompatibility', fda_requirement: 'biocompat', fda_section: 'cytotoxicity', regulatory_status: 'approved' };

beforeEach(() => {
  vi.clearAllMocks();
  H.getStageEvidence.mockResolvedValue({ rows: [ROW] });
});

const criticalGaps = async (gapAnalysis: Record<string, unknown>) => {
  H.performGapAnalysis.mockResolvedValue(gapAnalysis);
  const res = await request(app).get('/api/authoring-actions/section-evidence/12/2.4');
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('data');
  return res.body.gapAnalysis.criticalGaps;
};

describe('GET /section-evidence — criticalGaps', () => {
  it('is the recorded count when it is zero, not an empty list', async () => {
    expect(await criticalGaps({ completeness: 100, gaps: [], critical_gaps: 0 }), 'a recorded zero was answered []').toBe(0);
  });

  it('is the recorded count', async () => {
    expect(await criticalGaps({ completeness: 50, gaps: [{}, {}], critical_gaps: 2 })).toBe(2);
  });

  it('is null when the gap analysis records no count', async () => {
    expect(await criticalGaps({ completeness: 50, gaps: [] })).toBeNull();
  });
});
