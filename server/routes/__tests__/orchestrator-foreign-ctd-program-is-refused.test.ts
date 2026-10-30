/**
 * A Mode A run naming a CTD program that is not the caller's organization's is
 * refused 422 CTD_PROGRAM_NOT_FOUND, not answered 500.
 *
 * Before (to 2026-10-15): loadNonclinicalStudiesForProject now throws
 * CtdProgramNotFoundError for another organization's (or no) program — it used
 * to read as a program with no studies — and the input-assembly catch in
 * server/routes/submission-orchestrator.ts sent every error but CsrScopeError
 * to serverError, so the caller's own bad input read as a server failure.
 *
 * Since Rule 2 audit S1 (2026-10-26) a `ctdProgramId` is refused 400
 * CTD_PROGRAM_INPUTS_REFUSED outside development, before any loader runs
 * (orchestrator-inline-run-inputs-refused.test.ts). It is read only on a
 * development server, so these cases run there.
 *
 * Harness: orchestrator-module3-governed.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({
  runOrchestrator: vi.fn(),
  loadSubmissionFkBySubmissionIdText: vi.fn(),
  evaluateFinalExportGate: vi.fn(),
  loadCmcSourcesForProject: vi.fn(),
  logAction: vi.fn(async (_row: Record<string, unknown>) => undefined),
  isDevelopment: false,
  scope: vi.fn(),
  loadNonclinical: vi.fn(),
}));
vi.mock('../../services/csr/project-scope', async importOriginal => ({ ...(await importOriginal<typeof import('../../services/csr/project-scope')>()), resolveCsrScope: h.scope }));

vi.mock('../../services/submission-package-orchestrator.js', () => ({
  runOrchestrator: h.runOrchestrator,
  loadSubmissionFkBySubmissionIdText: h.loadSubmissionFkBySubmissionIdText,
  getRun: vi.fn(),
  getRunAudit: vi.fn(),
  regenerateAffected: vi.fn(),
}));

vi.mock('../../services/cmc/final-export-gate.js', () => ({
  evaluateFinalExportGate: h.evaluateFinalExportGate,
}));
vi.mock('../../services/cmc/load-cmc-sources-for-project.js', () => ({
  loadCmcSourcesForProject: h.loadCmcSourcesForProject,
}));

vi.mock('../../services/csr/load-csr-inputs-for-project.js', () => ({
  loadCsrInputsForProject: vi.fn(async () => []),
}));
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
const PROGRAM = '11111111-2222-3333-4444-555555555555';

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
  return {
    submissionId: '9001',
    applicationNumber: 'NDA-000000',
    region: 'US',
    submissionType: 'NDA',
    clinicalStudyData: [],
    skipValidation: true,
    ...over,
  };
}

/** A Mode A body: the route assembles the inputs from the record. */
function modeABody(over: Record<string, unknown> = {}) {
  return body({ projectId: 7, cmcProjectId: PROGRAM, ...over });
}

import { CtdProgramNotFoundError } from '../../services/preclinical/nonclinical-program-loader';

beforeEach(() => {
  h.runOrchestrator.mockReset().mockResolvedValue({
    run: { runId: 'run-1', status: 'complete', steps: [] },
    outputs: { module3Sections: [], csrTables: [], m23: null, m24: null, m25: null, m27: null },
  });
  h.loadSubmissionFkBySubmissionIdText.mockReset().mockResolvedValue(null);
  h.loadCmcSourcesForProject.mockReset().mockResolvedValue([]);
  h.evaluateFinalExportGate.mockReset().mockResolvedValue({ allowed: true, data: { approvedSections: 0, totalSections: 0 } });
  h.scope.mockReset().mockResolvedValue({ projectId: 7 });
  h.loadNonclinical.mockReset();
  h.logAction.mockClear();
  h.isDevelopment = true;
});

describe('a CTD program outside the organization', () => {
  it('is 422 CTD_PROGRAM_NOT_FOUND, and no run starts', async () => {
    h.loadNonclinical.mockRejectedValue(new CtdProgramNotFoundError(77));
    const res = await request(app()).post('/api/submission-orchestrator/runs').send(modeABody({ ctdProgramId: 77 }));

    expect(res.status, `a foreign ctdProgramId answered ${res.status}: ${JSON.stringify(res.body)}`).toBe(422);
    expect(res.body.code).toBe('CTD_PROGRAM_NOT_FOUND');
    expect(res.body.error).toMatch(/CTD dossier 77 is not on record/);
    expect(h.runOrchestrator).not.toHaveBeenCalled();
  });

  it('any other assembly failure is still a 500 that carries no error text', async () => {
    h.loadNonclinical.mockRejectedValue(new Error('SENTINEL connection reset'));
    const res = await request(app()).post('/api/submission-orchestrator/runs').send(modeABody({ ctdProgramId: 77 }));

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('SENTINEL');
  });
});
