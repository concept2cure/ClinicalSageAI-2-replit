/**
 * HTTP-level contract for the two study-design engines that had no caller:
 * `eligibility-model.ts` and `registry-filing.ts`.
 *
 * This imports the real router the app mounts at `/api/study-design`, so it proves the new
 * read-only routes exist and are reachable by path. It pins three things:
 *
 *   • the routes return the ENGINE's output verbatim — the route adds a key and the design's
 *     defensibility report, and changes nothing inside;
 *   • a design that does not exist FOR THIS TENANT is 404, never an empty object. The loader is
 *     tenant-scoped, so "another tenant's design" and "no such design" are the same answer;
 *   • `loadStudyDesign` is called with the tenant resolved from the request, once, per request.
 *
 * `loadStudyDesign` is the only thing mocked; every engine runs for real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const loadStudyDesign = vi.fn();

vi.mock('../../services/study-design', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/study-design')>();
  return { ...actual, loadStudyDesign };
});

const router = (await import('../study-design')).default;
const { assessEligibility, projectRegistryEligibility, projectRegistration, buildRegistryFiling } =
  await import('../../services/study-design');

/** A design whose criteria mix the readable and the unreadable — the realistic case. */
function design() {
  return {
    title: 'Phase 3 engine-route fixture',
    phase: '3',
    indication: 'type 2 diabetes',
    productType: 'drug',
    targetRegions: ['Germany'],
    objectives: [{ level: 'primary', order: 1, text: 'Superiority', endpointName: 'Primary' }],
    estimands: [],
    endpoints: [{ name: 'Primary', role: 'primary', type: 'continuous', definition: 'change at week 24', timepoint: 'week 24' }],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
    population: {
      targetDescription: 'adults',
      analysisPopulations: [{ kind: 'ITT', definition: 'all' }],
      eligibility: [
        { type: 'inclusion', text: 'Age 18-75 years' },
        { type: 'inclusion', text: 'HbA1c 7.0-10.5%' },
        { type: 'inclusion', text: 'Able and willing to provide written informed consent' },
        { type: 'exclusion', text: 'Pregnancy or breastfeeding' },
      ],
    },
    arms: [
      { name: 'Drug', interventions: [{ name: 'Drug', role: 'investigational' }] },
      { name: 'Placebo', interventions: [{ name: 'Placebo', role: 'placebo' }] },
    ],
    randomization: { ratio: [1, 1], allocationMethod: 'stratified', blinding: 'double' },
    statisticalPlan: { alpha: 0.05, oneSided: true, plannedSampleSize: 300, plannedAnalyses: [{ endpointName: 'Primary', method: 'MMRM' }] },
  };
}

const VALIDATION = { riskLevel: 'low', canAdvance: true, findings: [] };

function appWith(orgId: number | null) {
  const app = express();
  app.use(express.json({ limit: '4mb' }));
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (orgId !== null) (req as any).user = { id: 1, organizationId: orgId };
    next();
  });
  app.use('/api/study-design', router);
  return app;
}

const authed = () => appWith(1);
const anon = () => appWith(null);

beforeEach(() => {
  loadStudyDesign.mockReset();
});

// ─── GET /:studyId/eligibility ────────────────────────────────────────────────

describe('GET /api/study-design/:studyId/eligibility', () => {
  it('returns the eligibility engine’s output verbatim', async () => {
    const d = design();
    loadStudyDesign.mockResolvedValue({ design: d, validation: VALIDATION });

    const res = await request(authed()).get('/api/study-design/study-1/eligibility');
    expect(res.status).toBe(200);
    expect(res.body.assessment).toEqual(JSON.parse(JSON.stringify(assessEligibility(d.population.eligibility as any))));
    expect(res.body.registryEligibility).toEqual(
      JSON.parse(JSON.stringify(projectRegistryEligibility(d.population.eligibility as any))),
    );
    expect(res.body.validation).toEqual(VALIDATION);
  });

  it('keeps the unreadable criteria in the response rather than dropping them', async () => {
    const d = design();
    loadStudyDesign.mockResolvedValue({ design: d, validation: VALIDATION });
    const res = await request(authed()).get('/api/study-design/study-1/eligibility');
    const texts = res.body.registryEligibility.criteria.map((c: { text: string }) => c.text);
    expect(texts).toEqual(d.population.eligibility.map(c => c.text));
  });

  it('reports sex and healthy volunteers absent, each naming what would settle it', async () => {
    loadStudyDesign.mockResolvedValue({ design: design(), validation: VALIDATION });
    const res = await request(authed()).get('/api/study-design/study-1/eligibility');
    expect(res.body.registryEligibility.sex).toBeNull();
    expect(res.body.registryEligibility.healthyVolunteers).toBeNull();
    const absent = res.body.registryEligibility.absent.map((a: { field: string }) => a.field);
    expect(absent).toContain('Sex');
    expect(absent).toContain('Accepts healthy volunteers');
  });

  it('404s a design that does not exist for this tenant, and returns no body content', async () => {
    loadStudyDesign.mockResolvedValue(null);
    const res = await request(authed()).get('/api/study-design/not-mine/eligibility');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'NOT_FOUND' });
    expect(res.body.assessment).toBeUndefined();
    expect(res.body.registryEligibility).toBeUndefined();
  });

  it('loads through the tenant-scoped loader, with this request’s tenant', async () => {
    loadStudyDesign.mockResolvedValue(null);
    await request(appWith(42)).get('/api/study-design/study-1/eligibility');
    expect(loadStudyDesign).toHaveBeenCalledTimes(1);
    expect(loadStudyDesign).toHaveBeenCalledWith('study-1', 42);
  });

  it('rejects without an authenticated tenant, without touching the loader', async () => {
    const res = await request(anon()).get('/api/study-design/study-1/eligibility');
    expect(res.status).toBe(401);
    expect(loadStudyDesign).not.toHaveBeenCalled();
  });
});

// ─── GET /:studyId/registry-filing ────────────────────────────────────────────

describe('GET /api/study-design/:studyId/registry-filing', () => {
  it('returns the filing engine’s output verbatim, for both registries', async () => {
    const d = design();
    loadStudyDesign.mockResolvedValue({ design: d, validation: VALIDATION });

    const res = await request(authed()).get('/api/study-design/study-1/registry-filing');
    expect(res.status).toBe(200);
    const expected = {
      ctgov: buildRegistryFiling(projectRegistration(d as any, 'ctgov'), {}, []),
      ctis: buildRegistryFiling(projectRegistration(d as any, 'ctis'), {}, []),
    };
    expect(res.body.registryFilings).toEqual(JSON.parse(JSON.stringify(expected)));
  });

  it('projects one registry when asked, and computes its statutory clock from the supplied date', async () => {
    const d = design();
    loadStudyDesign.mockResolvedValue({ design: d, validation: VALIDATION });

    const res = await request(authed())
      .get('/api/study-design/study-1/registry-filing')
      .query({ registry: 'ctgov', isApplicableClinicalTrial: 'true', firstEnrollmentDate: '2026-03-01' });
    expect(res.status).toBe(200);
    const expected = buildRegistryFiling(
      projectRegistration(d as any, 'ctgov'),
      { isApplicableClinicalTrial: true, firstEnrollmentDate: '2026-03-01' },
      [],
    );
    const registration = res.body.registryFiling.obligations.find((o: { id: string }) => o.id === 'ctgov-registration');
    expect(registration.deadline).toBe('2026-03-22');
    expect(res.body.registryFiling.obligations).toEqual(
      JSON.parse(JSON.stringify(expected.obligations)),
    );
  });

  it('leaves an unrecorded applicability undetermined rather than reading it as a no', async () => {
    loadStudyDesign.mockResolvedValue({ design: design(), validation: VALIDATION });
    const res = await request(authed()).get('/api/study-design/study-1/registry-filing').query({ registry: 'ctgov' });
    const registration = res.body.registryFiling.obligations.find((o: { id: string }) => o.id === 'ctgov-registration');
    expect(registration.status).toBe('undetermined');
    expect(registration.deadline).toBeNull();
    expect(registration.settledBy).toBe('isApplicableClinicalTrial');
    expect(res.body.registryFiling.readyToFile).toBe(false);
  });

  it('404s a design that does not exist for this tenant, and returns no filing', async () => {
    loadStudyDesign.mockResolvedValue(null);
    const res = await request(authed()).get('/api/study-design/not-mine/registry-filing');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'NOT_FOUND' });
    expect(res.body.registryFiling).toBeUndefined();
    expect(res.body.registryFilings).toBeUndefined();
  });

  it('rejects without an authenticated tenant', async () => {
    const res = await request(anon()).get('/api/study-design/study-1/registry-filing');
    expect(res.status).toBe(401);
    expect(loadStudyDesign).not.toHaveBeenCalled();
  });
});

// ─── The POST shapes, for a design that is not persisted yet ──────────────────

describe('POST /api/study-design/eligibility', () => {
  it('assesses a design carried in the body', async () => {
    const d = design();
    const res = await request(authed()).post('/api/study-design/eligibility').send({ design: d });
    expect(res.status).toBe(200);
    expect(res.body.assessment).toEqual(JSON.parse(JSON.stringify(assessEligibility(d.population.eligibility as any))));
    // 2 of 4 criteria are readable, so the verdict can never be `clean`.
    expect(res.body.assessment.counts.unstructured).toBe(2);
    expect(res.body.assessment.verdict).not.toBe('clean');
  });

  it('rejects without an authenticated tenant', async () => {
    const res = await request(anon()).post('/api/study-design/eligibility').send({ design: design() });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/study-design/registry-filing', () => {
  it('takes the caller’s context and placements', async () => {
    const d = design();
    const res = await request(authed())
      .post('/api/study-design/registry-filing')
      .send({
        design: d,
        registry: 'ctgov',
        context: { isApplicableClinicalTrial: false },
        placed: [{ slot: 'registry.identification', leafId: 1, title: 'Registration record', resolvable: true }],
      });
    expect(res.status).toBe(200);
    const expected = buildRegistryFiling(
      projectRegistration(d as any, 'ctgov'),
      { isApplicableClinicalTrial: false },
      [{ slot: 'registry.identification', leafId: 1, title: 'Registration record', resolvable: true }],
    );
    expect(res.body.registryFiling).toEqual(JSON.parse(JSON.stringify(expected)));
  });

  it('rejects a malformed context rather than dropping it into an absence', async () => {
    const res = await request(authed())
      .post('/api/study-design/registry-filing')
      .send({ design: design(), context: { isApplicableClinicalTrial: 'yes please' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_PARAMS');
  });

  it('never claims a record reached a registry', async () => {
    const res = await request(authed())
      .post('/api/study-design/registry-filing')
      .send({ design: design(), context: { isApplicableClinicalTrial: true, firstEnrollmentDate: '2026-03-01', asOfDate: '2026-09-22' } });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/\b(submitted|posted|accepted|transmitted|acknowledged)\b/i);
  });

  it('rejects without an authenticated tenant', async () => {
    const res = await request(anon()).post('/api/study-design/registry-filing').send({ design: design() });
    expect(res.status).toBe(401);
  });
});
