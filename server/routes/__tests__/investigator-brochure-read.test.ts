/**
 * GET /api/investigator-brochure — ICH E6(R3) Appendix A IB section-structure read, for one project.
 *
 * REAL-STORE contract (GA, 2026-08). The route reads a project's IB readiness through
 * `investigator-brochure-view-assembler.assembleProjectIBSections` (which derives the four
 * IB input domains from the real upstream stores) — the seed-only
 * `c2c_investigator_brochure` blob is retired and never read. Locks: the { data } envelope
 * with the display keys ({ number, title, required, status, gaps, description, depth,
 * needsData }); the real per-section verdict passed straight through from the assembler;
 * and fail-closed to the honest deterministic skeleton (meta.pendingStore on 42P01), with
 * a 500, never a skeleton, for any other store error.
 *
 * ONE PROJECT (2026-11-12, S12 sweep finding 92). Locks added: no project named answers
 * 400 PROJECT_REQUIRED with no rows and no figure, and reads nothing; the reader is
 * admitted to the project by the Projects routes' own check before anything is read, and
 * a refusal there is answered as that check answers it (404 for a project the reader
 * cannot open); the assembler is asked for that organisation and that project.
 *
 * The assembler is mocked here; its real SQL + tenant and project scope are proven in
 * server/services/authoring/__tests__/investigator-brochure-view-assembler.pglite.integration.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

// Mock the assembler the route reads through. The route still uses the REAL (AI-free,
// DB-free) ib-builder gap engine for its fail-closed skeleton, so ib-builder is NOT mocked.
const assembleProjectIBSections = vi.fn();
vi.mock('../../services/authoring/investigator-brochure-view-assembler', () => ({
  assembleProjectIBSections: (...a: unknown[]) => assembleProjectIBSections(...a),
}));

// The Projects routes' admission is mocked at its door; what it answers on a refusal is the real code.
const requireProjectRouteAccess = vi.fn();
vi.mock('../c2c/project-route-access', async () => {
  const { ProgramReadAccessError } = await vi.importActual<typeof import('../../services/c2c/current-program-access')>('../../services/c2c/current-program-access');
  return {
    requireProjectRouteAccess: (...a: unknown[]) => requireProjectRouteAccess(...a),
    // server/routes/c2c/project-route-access.ts sendProjectAccessFailure, verbatim.
    sendProjectAccessFailure: (res: Response, error: unknown, concealDenied = false) => {
      const failure = error instanceof ProgramReadAccessError ? error
        : new ProgramReadAccessError(503, 'PROJECT_ACCESS_UNAVAILABLE', 'Current project access could not be verified. No project data was supplied.');
      const hidden = failure.status === 404 || (concealDenied && failure.status === 403);
      return res.status(hidden ? 404 : failure.status).json({ success: false,
        error: hidden ? 'PROJECT_NOT_FOUND' : failure.code,
        message: hidden ? 'Project not found.' : failure.message });
    },
  };
});

import ibRouter from '../investigator-brochure.routes';
import { ibSectionRows, type IBInputDomain } from '../../services/authoring/ib-builder';
import { ProgramReadAccessError } from '../../services/c2c/current-program-access';

const PROJECT = '11111111-1111-4111-8111-111111111111';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { id: 3, organizationId: org };
    next();
  });
  app.use('/api/investigator-brochure', ibRouter);
  return app;
}

const DISPLAY_KEYS = ['number', 'title', 'required', 'status', 'gaps', 'description', 'depth', 'needsData'];

/** The exact row shape the assembler returns for a given domain-availability map. */
function rowsFor(avail: Partial<Record<Exclude<IBInputDomain, 'none'>, boolean>>) {
  return ibSectionRows({ product: !!avail.product, nonclinical: !!avail.nonclinical, clinical: !!avail.clinical, safety: !!avail.safety, none: true });
}

beforeEach(() => {
  assembleProjectIBSections.mockReset();
  requireProjectRouteAccess.mockReset();
  requireProjectRouteAccess.mockResolvedValue({ programId: PROJECT, projectId: 1, clientWorkspaceId: null, actor: { userId: 3, role: 'admin' } });
});

describe('GET /api/investigator-brochure: the project', () => {
  // S12 sweep finding 92: with no project the route answered 200 and "36% required sections ready".
  it('400s with no project named: no rows, no figure, and nothing is read', async () => {
    const res = await request(appWith(7)).get('/api/investigator-brochure');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PROJECT_REQUIRED');
    expect(res.body.data).toBeUndefined();
    expect(res.body.meta).toBeUndefined();
    expect(requireProjectRouteAccess).not.toHaveBeenCalled();
    expect(assembleProjectIBSections).not.toHaveBeenCalled();
  });

  it('a blank project is no project', async () => {
    const res = await request(appWith(7)).get('/api/investigator-brochure?programId=%20');
    expect(res.status).toBe(400);
    expect(assembleProjectIBSections).not.toHaveBeenCalled();
  });

  it('admits the reader to the project before reading, and answers a project they cannot open as not found', async () => {
    requireProjectRouteAccess.mockRejectedValueOnce(new ProgramReadAccessError(403, 'PROJECT_ACCESS_DENIED', 'This project is not shared with you.'));
    const res = await request(appWith(7)).get(`/api/investigator-brochure?programId=${PROJECT}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('PROJECT_NOT_FOUND');
    expect(res.body.data).toBeUndefined();
    expect(requireProjectRouteAccess).toHaveBeenCalledWith(expect.anything(), expect.anything(), { kind: 'projects', programId: PROJECT });
    expect(assembleProjectIBSections).not.toHaveBeenCalled();
  });

  it('answers 503, and reads nothing, when access to the project could not be verified', async () => {
    requireProjectRouteAccess.mockRejectedValueOnce(new Error('connection reset'));
    const res = await request(appWith(7)).get(`/api/investigator-brochure?programId=${PROJECT}`);
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('PROJECT_ACCESS_UNAVAILABLE');
    expect(assembleProjectIBSections).not.toHaveBeenCalled();
  });
});

describe('GET /api/investigator-brochure: the readiness', () => {
  it('returns the real assembled IB readiness view for the project', async () => {
    const rows = rowsFor({ product: true, nonclinical: true, clinical: true, safety: true });
    assembleProjectIBSections.mockResolvedValueOnce({
      rows,
      availability: { product: true, nonclinical: true, clinical: true, safety: true },
      sources: ['nonclinical_studies', 'clinical_studies', 'adverse_events'],
      source: 'nonclinical_studies+clinical_studies+adverse_events',
      storesWithoutProject: ['clinical_ops.studies'],
      provisioned: true,
      completeness: 100,
      productName: null,
    });

    const res = await request(appWith(7)).get(`/api/investigator-brochure?programId=${PROJECT}`);
    expect(res.status).toBe(200);
    expect(assembleProjectIBSections).toHaveBeenCalledWith(7, PROJECT);

    // Display-key contract on every row.
    for (const k of DISPLAY_KEYS) expect(res.body.data[0]).toHaveProperty(k);
    const numbers = res.body.data.map((r: { number: string }) => r.number);
    expect(numbers).toEqual(
      expect.arrayContaining(['0', '1', '2', '3', '4', '4.1', '4.2', '4.3', '5', '5.1', '5.2', '5.3', '6', '7']),
    );

    // Real verdicts flow straight through from the assembler: with every domain
    // present, the data-bearing nonclinical/clinical sections render.
    const byNum = (n: string) => res.body.data.find((r: { number: string }) => r.number === n);
    expect(byNum('0')).toMatchObject({ status: 'rendered', needsData: false }); // Title Page (boilerplate)
    expect(byNum('4')).toMatchObject({ status: 'rendered', needsData: true }); // Nonclinical — real evidence present
    expect(byNum('5').status).toBe('rendered'); // Effects in Humans — clinical + safety present
    expect(byNum('4.1').depth).toBe(1);

    // meta names the project and reflects the real store provenance.
    expect(res.body.meta.programId).toBe(PROJECT);
    expect(res.body.meta.provisioned).toBe(true);
    expect(res.body.meta.source).toContain('nonclinical_studies');
    expect(res.body.meta.storesWithoutProject).toEqual(['clinical_ops.studies']);
    expect(res.body.meta.availability).toMatchObject({ nonclinical: true, clinical: true });
    expect(res.body.meta.productName).toBeNull();
    expect(res.body.meta.completeness).toBe(100);
  });

  it('renders honest missing verdicts when the project has no real upstream evidence', async () => {
    const rows = rowsFor({});
    assembleProjectIBSections.mockResolvedValueOnce({
      rows,
      availability: { product: false, nonclinical: false, clinical: false, safety: false },
      sources: [],
      source: 'none',
      storesWithoutProject: [],
      provisioned: false,
      completeness: 0,
      productName: null,
    });

    const res = await request(appWith(7)).get(`/api/investigator-brochure?programId=${PROJECT}`);
    expect(res.status).toBe(200);
    for (const k of DISPLAY_KEYS) expect(res.body.data[0]).toHaveProperty(k);

    const byNum = (n: string) => res.body.data.find((r: { number: string }) => r.number === n);
    expect(byNum('0').status).toBe('rendered'); // boilerplate still renders
    expect(byNum('4').status).toBe('missing'); // no nonclinical evidence
    expect(byNum('4').gaps.length).toBeGreaterThan(0);
    expect(res.body.meta.provisioned).toBe(false);
    expect(res.body.meta.completeness).toBe(0);
  });

  it('fails closed to the skeleton when the store is not provisioned (42P01), with a figure of 0', async () => {
    assembleProjectIBSections.mockRejectedValueOnce(
      Object.assign(new Error('relation missing'), { code: '42P01' }),
    );
    const res = await request(appWith(7)).get(`/api/investigator-brochure?programId=${PROJECT}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const k of DISPLAY_KEYS) expect(res.body.data[0]).toHaveProperty(k);
    expect(res.body.meta.provisioned).toBe(false);
    expect(res.body.meta.pendingStore).toBe(true);
    // The title page, confidentiality statement and table of contents render, and are
    // not counted: nothing was read, so the figure is 0, not their share of the list.
    expect(res.body.meta.completeness).toBe(0);
    const byNum = (n: string) => res.body.data.find((r: { number: string }) => r.number === n);
    expect(byNum('0').status).toBe('rendered');
    expect(byNum('4').status).toBe('missing');
  });

  // Regression: this used to assert 200 + the skeleton for an unexpected error.
  // The skeleton carries a computed `completeness` percentage, so a failed
  // assembly was answered with an IB readiness figure that no query backed —
  // a number an author would reasonably act on. A missing store (asserted
  // above) may still degrade; a real fault must not.
  it('500s on an unexpected store error — never a 200 skeleton', async () => {
    assembleProjectIBSections.mockRejectedValueOnce(new Error('connection reset'));
    const res = await request(appWith(7)).get(`/api/investigator-brochure?programId=${PROJECT}`);
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
    expect(res.body.data).toBeUndefined();
  });
});
