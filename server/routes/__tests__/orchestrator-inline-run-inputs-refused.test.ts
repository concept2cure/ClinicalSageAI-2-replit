/**
 * A submission run's clinical and nonclinical figures come from the record,
 * not from the request (CLAUDE.md Rule 2; Rule 2 audit S1, 2026-10-26).
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `POST /api/submission-orchestrator/runs` and `/runs/:runId/regenerate`
 * refused only inline `cmcSources` outside development. A body could still
 * carry the rest:
 *   • `csrInputs`, `nonclinicalStudies` and `clinicalStudyData` (Mode B, and
 *     `clinicalStudyData` in Mode A too). The run composed Module 2.4, 2.5 and
 *     2.7 and the CSR tables from them, and `package.sign` could sign that
 *     package. Every figure was whatever the caller typed.
 *   • A Mode A `ctdProgramId`. It composed 2.4 from `ctd_nonclinical_studies`,
 *     the landing table of the model-run preclinical extractor, not a record.
 *   • A Mode A regenerate. It runs no loader, so every step re-ran over empty
 *     inputs.
 *
 * ── What is asserted ──────────────────────────────────────────────────────────
 *   • Outside development, each of these is refused 400 before anything is
 *     read or a run starts, and the refusal names the route to use instead.
 *   • A refusal does not echo the figures it refused.
 *   • Empty arrays and a plain Mode A run are not refused.
 *   • Development keeps the fixture door.
 *
 * Harness: orchestrator-module3-governed.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({
  runOrchestrator: vi.fn(),
  regenerateAffected: vi.fn(),
  getRun: vi.fn(),
  loadSubmissionFkBySubmissionIdText: vi.fn(),
  evaluateFinalExportGate: vi.fn(),
  loadCmcSourcesForProject: vi.fn(),
  loadCsrInputs: vi.fn(),
  loadNonclinical: vi.fn(),
  logAction: vi.fn(async (_row: Record<string, unknown>) => undefined),
  isDevelopment: false,
  scope: vi.fn(),
}));
vi.mock('../../services/csr/project-scope', async importOriginal => ({ ...(await importOriginal<typeof import('../../services/csr/project-scope')>()), resolveCsrScope: h.scope }));

vi.mock('../../services/submission-package-orchestrator.js', () => ({
  runOrchestrator: h.runOrchestrator,
  loadSubmissionFkBySubmissionIdText: h.loadSubmissionFkBySubmissionIdText,
  getRun: h.getRun,
  getRunAudit: vi.fn(),
  regenerateAffected: h.regenerateAffected,
}));
vi.mock('../../services/cmc/final-export-gate.js', () => ({ evaluateFinalExportGate: h.evaluateFinalExportGate }));
vi.mock('../../services/cmc/load-cmc-sources-for-project.js', () => ({ loadCmcSourcesForProject: h.loadCmcSourcesForProject }));
vi.mock('../../services/csr/load-csr-inputs-for-project.js', () => ({ loadCsrInputsForProject: (...a: unknown[]) => h.loadCsrInputs(...a) }));
vi.mock('../../services/preclinical/load-nonclinical-studies-for-project.js', () => ({
  loadNonclinicalStudiesForProject: (...a: unknown[]) => h.loadNonclinical(...a),
}));
vi.mock('../../config/environment.js', () => ({
  config: {
    get isDevelopment() {
      return h.isDevelopment;
    },
  },
}));
vi.mock('../../db.js', () => ({
  pool: { query: vi.fn(async () => ({ rows: [{ id: 1 }] })) },
  db: { execute: vi.fn(async () => ({ rows: [] })) },
}));
vi.mock('../../services/auditService.js', () => ({
  default: { logAction: (row: Record<string, unknown>) => h.logAction(row) },
}));

import orchestratorRouter from '../submission-orchestrator';

const ORG = 42;
const RUNS = '/api/submission-orchestrator/runs';
const REGEN = `${RUNS}/run-0/regenerate`;

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { organizationId: ORG, id: 5, role: 'member' };
    next();
  });
  a.use('/api/submission-orchestrator', orchestratorRouter);
  return a;
}

function body(over: Record<string, unknown> = {}) {
  return { submissionId: '9001', applicationNumber: 'NDA-000000', region: 'US', submissionType: 'NDA', clinicalStudyData: [], skipValidation: true, ...over };
}

/** Figures a caller typed. None of them may come back in a refusal. */
const CSR = {
  studyId: 'X-301', protocolNumber: 'X-301', phase: '3', studyDesign: 'randomized, double-blind',
  primaryEndpoint: 'ORR', primaryResult: 'ORR 42%', primaryEndpointMet: true, sampleSize: 312,
};
const STUDY = { studyId: 'TX-1', studyType: 'toxicology', species: 'rat', primaryFinding: 'hepatocellular hypertrophy', noael: '50 mg/kg/day', reportSection: '4.2.3.2' };
const STUDY_DATA = { studyId: 'X-301', protocolNumber: 'X-301', treatmentArms: [{ arm: 'A' }], disposition: [], demographics: [], efficacy: [{ orr: 0.42 }], adverseEvents: [] };

beforeEach(() => {
  h.isDevelopment = false;
  h.runOrchestrator.mockReset().mockResolvedValue({
    run: { runId: 'run-1', status: 'complete', steps: [] },
    outputs: { module3Sections: [], csrTables: [], m23: null, m24: null, m25: null, m27: null },
  });
  h.regenerateAffected.mockReset().mockResolvedValue({ run: { runId: 'run-2', status: 'complete', steps: [] }, supersededRunId: 'run-0', regenerated: [] });
  h.getRun.mockReset().mockResolvedValue({ runId: 'run-0', organizationId: ORG, steps: [] });
  h.loadSubmissionFkBySubmissionIdText.mockReset().mockResolvedValue(null);
  h.loadCmcSourcesForProject.mockReset().mockResolvedValue([]);
  h.evaluateFinalExportGate.mockReset().mockResolvedValue({ allowed: true, data: { approvedSections: 0, totalSections: 0 } });
  h.loadCsrInputs.mockReset().mockResolvedValue([]);
  h.loadNonclinical.mockReset().mockResolvedValue([]);
  h.scope.mockReset().mockResolvedValue({ projectId: 7 });
  h.logAction.mockClear();
});

function nothingRead() {
  expect(h.runOrchestrator, 'a refused run still orchestrated').not.toHaveBeenCalled();
  expect(h.regenerateAffected, 'a refused regenerate still ran').not.toHaveBeenCalled();
  expect(h.scope).not.toHaveBeenCalled();
  expect(h.loadCsrInputs).not.toHaveBeenCalled();
  expect(h.loadNonclinical).not.toHaveBeenCalled();
}

describe('outside development, a run takes no clinical or nonclinical figures from the request', () => {
  it.each([
    ['csrInputs', body({ csrInputs: [CSR], nonclinicalStudies: [], cmcSources: [] }), 'ORR 42%'],
    ['nonclinicalStudies', body({ nonclinicalStudies: [STUDY], csrInputs: [], cmcSources: [] }), '50 mg/kg/day'],
    ['clinicalStudyData', body({ clinicalStudyData: [STUDY_DATA] }), 'X-301'],
  ])('refuses inline %s on POST /runs, before anything is read, and names the route to use', async (field, sent, figure) => {
    const res = await request(app()).post(RUNS).send(sent);
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body).toMatchObject({ error: 'INLINE_RUN_INPUTS_REFUSED', field });
    expect(res.body.message).toContain('/api/submission-orchestrator/runs/for-program');
    expect(JSON.stringify(res.body)).not.toContain(figure);
    nothingRead();
  });

  it('refuses clinicalStudyData in a Mode A body too', async () => {
    const res = await request(app()).post(RUNS).send(body({ projectId: 7, clinicalStudyData: [STUDY_DATA] }));
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body).toMatchObject({ error: 'INLINE_RUN_INPUTS_REFUSED', field: 'clinicalStudyData' });
    nothingRead();
  });

  it('refuses a Mode A ctdProgramId: the extractor’s rows are not a record', async () => {
    const res = await request(app()).post(RUNS).send(body({ projectId: 7, ctdProgramId: 77 }));
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body).toMatchObject({ error: 'CTD_PROGRAM_INPUTS_REFUSED', field: 'ctdProgramId' });
    expect(res.body.message).toContain('/api/submission-orchestrator/runs/for-program');
    nothingRead();
  });

  it.each([
    ['csrInputs', body({ csrInputs: [CSR] }), 'INLINE_RUN_INPUTS_REFUSED'],
    ['nonclinicalStudies', body({ nonclinicalStudies: [STUDY] }), 'INLINE_RUN_INPUTS_REFUSED'],
    ['clinicalStudyData', body({ clinicalStudyData: [STUDY_DATA] }), 'INLINE_RUN_INPUTS_REFUSED'],
    ['projectId', body({ projectId: 7 }), 'REGENERATE_MODE_A_UNSUPPORTED'],
  ])('refuses %s on the regenerate route: the same door one level down', async (field, sent, error) => {
    const res = await request(app()).post(REGEN).send(sent);
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body).toMatchObject({ error, field });
    expect(res.body.message).toContain('/api/submission-orchestrator/runs/for-program');
    nothingRead();
  });
});

describe('what stays open', () => {
  it('does not refuse EMPTY arrays: they carry no figures', async () => {
    const res = await request(app()).post(RUNS).send(body({ cmcSources: [], nonclinicalStudies: [], csrInputs: [] }));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(h.runOrchestrator).toHaveBeenCalledTimes(1);
  });

  it('runs a plain Mode A body, reading the project’s own records', async () => {
    const res = await request(app()).post(RUNS).send(body({ projectId: 7 }));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(h.loadCsrInputs).toHaveBeenCalledWith(ORG, 7, expect.anything());
    expect(h.loadNonclinical).not.toHaveBeenCalled();
  });

  it('keeps the fixture door open in development', async () => {
    h.isDevelopment = true;
    const inline = await request(app()).post(RUNS).send(body({ csrInputs: [CSR], nonclinicalStudies: [STUDY], clinicalStudyData: [STUDY_DATA] }));
    expect(inline.status, JSON.stringify(inline.body)).toBe(200);
    expect(h.runOrchestrator.mock.calls[0][0]).toMatchObject({ csrInputs: [CSR], nonclinicalStudies: [STUDY] });

    const program = await request(app()).post(RUNS).send(body({ projectId: 7, ctdProgramId: 77 }));
    expect(program.status, JSON.stringify(program.body)).toBe(200);
    expect(h.loadNonclinical).toHaveBeenCalledWith(ORG, 77);
  });
});
