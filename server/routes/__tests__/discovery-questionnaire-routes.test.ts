import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyDiscoveryAnswers, onboardingDiscoveryAnswersSchema, type OnboardingDiscoveryRecord } from '@shared/types/onboarding-discovery';

const state = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  exists: true, readFails: false, auditFails: false,
  readRequests: [] as unknown[], writeRequests: [] as number[],
}));
vi.mock('express-rate-limit', () => ({ default: () => (_req: Request, _res: Response, next: NextFunction) => next() }));
vi.mock('../../auth', () => ({
  authMiddleware: (req: Request, res: Response, next: NextFunction) => {
    const header = req.get('authorization');
    if (!header?.startsWith('Test ')) return res.status(401).json({ success: false, error: 'Sign in required.' });
    const [org, role = 'member', actor = '7'] = header.slice(5).split(' ');
    Object.assign(req, { user: { id: Number(actor), organizationId: org === 'none' ? null : Number(org), role, roles: ['admin'] }, userRole: role });
    next();
  },
}));
vi.mock('../../db/requestDb', () => ({
  requestDb: (req: Request) => {
    state.readRequests.push(req);
    return { select: () => ({ from: () => ({ where: () => ({ limit: async () => {
      if (state.readFails) throw new Error('sensitive database detail');
      return state.exists ? [{ settings: state.settings }] : [];
    } }) }) }) };
  },
}));
vi.mock('../../services/tenant/tenant-settings-writer', () => ({
  asSettings: (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value : {},
  writeTenantSettings: async (_req: Request, org: number, change: { next: (current: Record<string, unknown>, tier: string) => Record<string, unknown> }) => {
    state.writeRequests.push(org);
    if (!state.exists) return null;
    const next = change.next(state.settings, 'standard');
    if (state.auditFails) throw new Error('chained audit insert rejected');
    state.settings = next;
    return next;
  },
}));

let app: express.Express;
beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use('/api/onboarding/discovery', (await import('../onboarding-discovery-routes')).default);
});
beforeEach(() => {
  state.settings = { security: { mfaRequired: true }, notifications: { weeklyReports: true } };
  state.exists = true; state.readFails = false; state.auditFails = false;
  state.readRequests = []; state.writeRequests = [];
});
const path = '/api/onboarding/discovery';
const body = () => ({ answers: { ...emptyDiscoveryAnswers(), companyGoal: 'Confidential company goal' }, expectedRevision: 0, complete: false, reason: 'Recorded in the discovery meeting.' });
const completeBody = () => ({ ...body(), complete: true, answers: {
  ...emptyDiscoveryAnswers(), role: 'regulatory', regulatoryExperience: 'working_knowledge',
  businessContext: 'sponsor', companyStage: 'growing', companyGoal: 'Develop our first product',
  productModalities: ['small_molecule'], developmentStage: 'preclinical', therapeuticAreas: ['Oncology'],
  indication: 'Advanced solid tumors', projectName: 'First IND', projectGoal: 'Prepare a clinical program',
  firstDeliverable: 'submission', targetMarkets: ['us'], workflowNeeds: ['projects', 'vault'],
  teamSize: '2_10', collaborationModel: 'internal', dataReadiness: 'partial',
  securityNeeds: ['unsure'], successCriteria: 'Reviewed documents before the agency meeting', supportPreference: 'guided',
} });
const patch = (payload: unknown = body(), token = 'Test 2 admin') => request(app).patch(path).set('Authorization', token).send(payload as object);

describe('tenant-scoped organization discovery', () => {
  it('requires authentication on reads and writes', async () => {
    expect((await request(app).get(path)).status).toBe(401);
    expect((await request(app).patch(path).send(body())).status).toBe(401);
    expect(state.readRequests).toHaveLength(0);
    expect(state.writeRequests).toHaveLength(0);
  });

  it('refuses missing, zero and fractional organization context without touching storage', async () => {
    for (const org of ['none', '0', '2.1']) {
      expect((await request(app).get(path).set('Authorization', `Test ${org} admin`)).status).toBe(403);
      expect((await patch(body(), `Test ${org} admin`)).status).toBe(403);
    }
    expect(state.readRequests).toHaveLength(0);
    expect(state.writeRequests).toHaveLength(0);
  });

  it('returns an honest unstarted assessment and allows members to read only', async () => {
    const res = await request(app).get(path).set('Authorization', 'Test 2 member');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ discovery: null, canEdit: false, assessment: { completionPercent: 0, readyToComplete: false } });
    expect(res.body.data).not.toHaveProperty('settings');
    expect(res.body).not.toHaveProperty('security');
  });

  it('honors the current membership role rather than claimed role arrays or platform spellings', async () => {
    for (const role of ['member', 'viewer', 'manager', 'super_admin', 'platform_admin', 'business_admin']) {
      expect((await patch(body(), `Test 2 ${role}`)).status).toBe(403);
    }
    expect(state.writeRequests).toHaveLength(0);
    expect((await patch(body(), 'Test 2 owner')).status).toBe(200);
  });

  it('records draft answers with server attribution while preserving all unrelated settings', async () => {
    const res = await patch();
    expect(res.status).toBe(200);
    expect(state.writeRequests).toEqual([2]);
    expect(res.body.data).toMatchObject({ canEdit: true, discovery: { schemaVersion: 1, revision: 1, updatedBy: 7, completedAt: null, answers: { companyGoal: 'Confidential company goal' } } });
    expect(res.body.auditTrail).toEqual({ persisted: true, chained: true });
    expect(state.settings).toMatchObject({ security: { mfaRequired: true }, notifications: { weeklyReports: true } });
    expect((await request(app).get(path).set('Authorization', 'Test 2 admin')).body.data.discovery).toEqual(res.body.data.discovery);
  });

  it('rejects caller-controlled ownership, metadata, short reasons and invalid answers', async () => {
    for (const payload of [
      { ...body(), organizationId: 8 }, { ...body(), completedAt: '2026-10-14T00:00:00.000Z' },
      { ...body(), reason: 'ok' }, { ...body(), answers: { ...body().answers, role: 'invented' } },
      { ...body(), answers: { ...body().answers, security: { mfaRequired: false } } },
    ]) expect((await patch(payload)).status).toBe(400);
    expect(state.writeRequests).toHaveLength(0);
  });

  it('never marks an incomplete questionnaire complete and reports what is missing', async () => {
    const res = await patch({ ...body(), complete: true });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('DISCOVERY_INCOMPLETE');
    expect(res.body.missingFields).toContain('projectGoal');
    expect(state.writeRequests).toHaveLength(0);
  });

  it('persists a completed questionnaire without claiming a project exists or security is configured', async () => {
    const res = await patch(completeBody());
    expect(res.status).toBe(200);
    expect(res.body.data.assessment.readyToComplete).toBe(true);
    expect(res.body.data.discovery.completedAt).toBe(res.body.data.discovery.updatedAt);
    expect(res.body.data).not.toHaveProperty('projectId');
    expect(res.body.data).not.toHaveProperty('securityConfigured');
    expect(state.settings.security).toEqual({ mfaRequired: true });
  });
});

describe('saved discovery revisions and unavailable data', () => {
  it('refuses stale revisions rather than overwriting a teammate’s saved discovery', async () => {
    await patch();
    const saved = JSON.parse(JSON.stringify(state.settings));
    const conflict = await patch({ ...body(), answers: { ...body().answers, companyGoal: 'Overwrite attempt' } });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('DISCOVERY_REVISION_CONFLICT');
    expect(state.settings).toEqual(saved);
    const updated = await patch({ ...body(), expectedRevision: 1 });
    expect(updated.body.data.discovery.revision).toBe(2);
  });

  it('fails closed on unreadable or invalid stored discovery instead of showing empty results', async () => {
    state.readFails = true;
    const readError = await request(app).get(path).set('Authorization', 'Test 2 admin');
    expect(readError.status).toBe(503);
    expect(readError.body).not.toHaveProperty('data');
    expect(JSON.stringify(readError.body)).not.toContain('sensitive database');
    state.readFails = false;
    state.settings.onboardingDiscovery = { revision: 1, answers: {} };
    expect((await request(app).get(path).set('Authorization', 'Test 2 admin')).status).toBe(503);
    expect((await patch()).status).toBe(503);
  });

  it('never announces a saved discovery when its chained audit write fails', async () => {
    state.auditFails = true;
    const before = JSON.parse(JSON.stringify(state.settings));
    const res = await patch();
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/nothing was changed/i);
    expect(res.body).not.toHaveProperty('auditTrail');
    expect(state.settings).toEqual(before);
  });

  it('does not manufacture a user identity or successful write when the organization is missing', async () => {
    expect((await patch(body(), 'Test 2 admin 0')).status).toBe(403);
    expect(state.writeRequests).toHaveLength(0);
    state.exists = false;
    expect((await request(app).get(path).set('Authorization', 'Test 2 admin')).status).toBe(404);
    expect((await patch()).status).toBe(404);
  });

  it('clears the completion marker on a new draft without changing existing security', async () => {
    const record: OnboardingDiscoveryRecord = { schemaVersion: 1, revision: 4, answers: onboardingDiscoveryAnswersSchema.parse(completeBody().answers), updatedAt: '2026-10-01T00:00:00.000Z', updatedBy: 7, completedAt: '2026-10-01T00:00:00.000Z' };
    state.settings.onboardingDiscovery = record;
    const res = await patch({ ...body(), expectedRevision: 4 });
    expect(res.status).toBe(200);
    expect(res.body.data.discovery).toMatchObject({ revision: 5, completedAt: null });
    expect(state.settings.security).toEqual({ mfaRequired: true });
  });
});
