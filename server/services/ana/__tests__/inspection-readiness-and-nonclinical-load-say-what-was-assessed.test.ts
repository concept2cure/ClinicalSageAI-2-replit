/**
 * Two AnA read tools say what they assessed.
 *
 * review_inspection_readiness: until 2026-10-22 it scored
 * listReadinessAreas() with scoreReadiness(areas) and no inspection type, so
 * every inspection was held to all 8 readiness domains, whatever its type
 * covers, and the answer omitted requiredDomains and notRecorded: the model
 * was told a percentage and a verdict without the domains nobody recorded.
 * GET /api/inspections/readiness/score calls getReadinessScore(org, id), which
 * holds an inspection to its type's domains; the tool now does the same.
 *
 * load_nonclinical_program: a CtdProgramNotFoundError (a CTD program that is
 * not this organization's) was answered as "Loading nonclinical program
 * failed: …", a generic failure; it is a not_found refusal with its message.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getReadinessScore: vi.fn(),
  listReadinessAreas: vi.fn(),
  loadNonclinicalProgram: vi.fn(),
}));

vi.mock('../../inspection/inspection-service.js', () => ({
  getReadinessScore: h.getReadinessScore,
  listReadinessAreas: h.listReadinessAreas,
}));
vi.mock('../../preclinical/nonclinical-program-loader.js', () => {
  class CtdProgramNotFoundError extends Error {
    constructor(id: number) {
      super(`CTD program ${id} was not found for this organization.`);
      this.name = 'CtdProgramNotFoundError';
    }
  }
  return { loadNonclinicalProgram: h.loadNonclinicalProgram, CtdProgramNotFoundError };
});

import { getToolHandler } from '../AnaToolExecutor';
import { scoreReadiness } from '../../inspection/inspection-logic';

const ctx = { organizationId: 7, userId: 3 } as never;

beforeEach(() => {
  h.getReadinessScore.mockReset();
  h.listReadinessAreas.mockReset();
  h.loadNonclinicalProgram.mockReset();
});

describe('review_inspection_readiness', () => {
  it("is held to the inspection's domains, as the route is, and names the domains nobody recorded", async () => {
    const areas = [{ area: 'Training records', status: 'ready' as const }];
    const held = scoreReadiness(areas, { inspectionType: 'bimo' });
    h.getReadinessScore.mockResolvedValue(held);
    h.listReadinessAreas.mockResolvedValue(areas);

    const out = JSON.parse(await getToolHandler('review_inspection_readiness')!({ inspection_id: 12 }, ctx));
    expect(h.getReadinessScore, 'the tool scored without the inspection type the route uses').toHaveBeenCalledWith(7, 12);
    expect(out.requiredDomains).toEqual(held.requiredDomains);
    expect(out.notRecorded, 'the domains nobody recorded were not named').toEqual(held.notRecorded);
    expect(out.score).toBe(held.score);
    expect(out.verdict).toBe(held.verdict);
  });

  it("answers not found for another organization's inspection", async () => {
    const err = Object.assign(new Error('Inspection not found for this organization.'), { name: 'InspectionError', code: 'NOT_FOUND' });
    h.getReadinessScore.mockRejectedValue(err);
    const out = JSON.parse(await getToolHandler('review_inspection_readiness')!({ inspection_id: 99 }, ctx));
    expect(out.status).toBe('not_found');
  });
});

describe('load_nonclinical_program', () => {
  it("refuses a CTD program that is not this organization's as not_found, with its message", async () => {
    const { CtdProgramNotFoundError } = await import('../../preclinical/nonclinical-program-loader.js');
    h.loadNonclinicalProgram.mockRejectedValue(new (CtdProgramNotFoundError as unknown as new (id: number) => Error)(55));
    const out = JSON.parse(await getToolHandler('load_nonclinical_program')!({ ctdProgramId: 55 }, ctx));
    expect(out, 'a program outside the organization was reported as a failed load').toEqual({
      status: 'not_found',
      message: 'CTD program 55 was not found for this organization.',
    });
  });

  it('control: any other failure is still a failure', async () => {
    h.loadNonclinicalProgram.mockRejectedValue(new Error('connection reset'));
    const out = JSON.parse(await getToolHandler('load_nonclinical_program')!({ ctdProgramId: 55 }, ctx));
    expect(out.status).not.toBe('not_found');
    expect(out.error).toBeDefined();
  });
});
