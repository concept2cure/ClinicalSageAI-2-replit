/** A2.9: old creation requests cannot reach private writers; stored rows remain readable. */
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  createProject: vi.fn(), onboardOrganization: vi.fn(), executeAction: vi.fn(),
  createCTDProject: vi.fn(), listCTDProjects: vi.fn(),
  createJourney: vi.fn(), updateStage: vi.fn(), listJourneys: vi.fn(),
  updateSettings: vi.fn(), toggleModule: vi.fn(), recordAudit: vi.fn(), logAction: vi.fn(),
}));
vi.mock('../../services/ana-platform-controller', () => ({ anaPlatformController: h }));
vi.mock('../../services/ctd-ingestion-service.js', () => ({
  createCTDProject: h.createCTDProject, listCTDProjects: h.listCTDProjects,
  getCTDProjectStatus: vi.fn(), uploadCTDDocument: vi.fn(), detectCTDSection: vi.fn(), validateCTDCompleteness: vi.fn(),
}));
vi.mock('../../services/program-journey/program-journey-service', () => ({
  createProgramJourney: h.createJourney, updateJourneyStage: h.updateStage, listProgramJourneys: h.listJourneys,
  ProgramJourneyValidationError: class extends Error {},
}));
vi.mock('../../auth.js', () => ({ authMiddleware: (_req: Request, _res: Response, next: NextFunction) => next() }));
vi.mock('../../services/audit/audit-write-outcome', () => ({ recordAuditRow: h.recordAudit }));
vi.mock('../../services/auditService', () => ({ default: { logAction: h.logAction } }));

import platform from '../ana-platform-control';
import ctd from '../ctd-onboarding';
import journey from '../program-journey.routes';

function app() {
  const result = express();
  result.use(express.json());
  result.use((req, _res, next) => {
    Object.assign(req, { tenantId: 7, userId: 5, tenantContext: { organizationId: 7 }, user: { id: 5, role: 'admin', roles: ['admin'], organizationId: 7 } });
    next();
  });
  result.use('/api/ana/platform', platform);
  result.use('/api/ctd', ctd);
  result.use('/api/program-journey', journey);
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const name of ['createProject', 'onboardOrganization', 'executeAction'] as const) h[name].mockResolvedValue({ success: true, result: {} });
  h.createCTDProject.mockResolvedValue({ projectId: 1, gaps: [] });
  h.createJourney.mockResolvedValue({ id: 'legacy-journey' });
  h.updateStage.mockResolvedValue({ journey_id: 'legacy-journey', stage_id: 'ind', status: 'done', pct: 100 });
});

describe('retired secondary project creation entry points', () => {
  it.each([
    ['/api/ana/platform/projects', { name: 'Legacy project' }],
    ['/api/ana/platform/onboard', { therapeuticArea: 'oncology', primaryAgency: 'FDA', submissionType: 'NDA' }],
    ['/api/ana/platform/execute', { category: 'project', action: 'create', parameters: { name: 'Legacy project' }, requiresConfirmation: false }],
    ['/api/ana/platform/execute', { category: 'project', action: 'create', parameters: { name: 'Legacy project' }, requiresConfirmation: true }],
    ['/api/ctd/projects', { name: 'Legacy CTD', regulatoryRegion: 'FDA', submissionType: 'NDA', productName: 'Synthetic product', productType: 'drug' }],
    ['/api/program-journey', { seg: 'pharma', code: 'Legacy program', currentStage: 'ind' }],
    ['/api/program-journey/legacy-journey/stages/ind', { status: 'done', pct: 100 }],
  ])('%s is absent even for an administrator and invokes no writer', async (path, body) => {
    const response = await request(app()).post(path).send(body);
    expect(response.status).toBe(404);
    expect(response.body.result?.pendingAction).toBeUndefined();
    for (const writer of [h.createProject, h.onboardOrganization, h.executeAction, h.createCTDProject, h.createJourney, h.updateStage, h.updateSettings, h.toggleModule, h.recordAudit, h.logAction]) expect(writer).not.toHaveBeenCalled();
  });

  it('still reads stored CTD rows through the retained route', async () => {
    h.listCTDProjects.mockResolvedValue([{ id: 91, name: 'Recorded CTD' }]);
    const response = await request(app()).get('/api/ctd/projects');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ projects: [{ id: 91, name: 'Recorded CTD' }], total: 1 });
    expect(h.listCTDProjects).toHaveBeenCalledWith(7);
  });

  it('still reads stored journey rows through the retained route', async () => {
    h.listJourneys.mockResolvedValue([{ id: 'recorded-journey', current: 'review' }]);
    const response = await request(app()).get('/api/program-journey');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ id: 'recorded-journey', current: 'review' }]);
    expect(h.listJourneys).toHaveBeenCalledWith(7);
  });
});
