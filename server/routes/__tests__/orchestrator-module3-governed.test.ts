/**
 * One Module 3 path: a submission package carries only Module 3 the record holds
 * and the export gate cleared.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * GA plan item 1 (decision 2026-10-05). Module 3 reaches a submission through
 * one governed path: compile the sections, approve each under Part 11, let
 * `evaluateFinalExportGate` judge the program, then place them as leaves.
 * Approval is where a person takes responsibility; the gate is where the
 * program's contradictions, staleness, provenance gaps and compiled-record
 * drift are weighed.
 *
 * `POST /api/submission-orchestrator/runs` had a second path that skipped all
 * of it, in two ways:
 *
 *   • **Mode B** accepted a hand-built `cmcSources[]` in the REQUEST BODY.
 *   • **Mode A** called `loadCmcSourcesForProject`, which reads EVERY
 *     `cmc_source_objects` row for the program — approved or not, swept or not,
 *     stale or not.
 *
 * Either way `m3.compose` composed Module 3 from them, `package.assemble`
 * derived one leaf per composed section, and `package.sign` signed those
 * leaves. So a program whose Module 3 nobody had approved — or whose approvals
 * the gate refuses — could be composed, assembled, validated and released
 * under an e-signature. `POST /m2/qos` was the same defect on a smaller route:
 * a Quality Overall Summary composed from a `module3Sections` array in the
 * body, which is what `cmc-quality-summary-tool.ts` was rewritten to stop
 * doing on 2026-10-04.
 *
 * ── What is asserted ──────────────────────────────────────────────────────────
 *   • inline `cmcSources` is refused outside development, on BOTH routes that
 *     accept run inputs, before anything is read or written, and the refusal
 *     names the governed path; an empty array is not refused, and development
 *     keeps the fixture door;
 *   • Mode A carries Module 3 only when the gate is open — a closed gate, and a
 *     gate that cannot be evaluated, both carry none and SAY which;
 *   • the audit row tells the three no-Module-3 states apart;
 *   • `/m2/qos` is gone;
 *   • `useAI` cannot be set from a request, so `m3.refine`'s model path is
 *     unreachable from a launch route.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  assessProgramCompositionScope: vi.fn(),
}));
vi.mock('../../services/csr/project-scope', async importOriginal => ({ ...(await importOriginal<typeof import('../../services/csr/project-scope')>()), resolveCsrScope: h.scope }));

vi.mock('../../services/submission-package-orchestrator.js', () => ({
  runOrchestrator: h.runOrchestrator,
  loadSubmissionFkBySubmissionIdText: h.loadSubmissionFkBySubmissionIdText,
  getRun: vi.fn(),
  getRunAudit: vi.fn(),
  regenerateAffected: vi.fn(),
}));

/* The governed loader is NOT mocked — it is the subject. Its two dependencies
   are, so the gate's verdict can be stated per case. */
vi.mock('../../services/cmc/final-export-gate.js', () => ({
  evaluateFinalExportGate: h.evaluateFinalExportGate,
}));
vi.mock('../../services/cmc/load-cmc-sources-for-project.js', () => ({
  loadCmcSourcesForProject: h.loadCmcSourcesForProject,
}));
/* The composition boundary (decision P-28), asked once the gate opens; it is
   judged on a real engine in composition-boundary-readers.pglite.test.ts. */
vi.mock('../../services/cmc/module3-compile.js', () => ({
  assessProgramCompositionScope: h.assessProgramCompositionScope,
}));

/* The other two Mode A loaders are not this suite's subject; they belong to the
   CSR and nonclinical lanes and each has its own tests. */
vi.mock('../../services/csr/load-csr-inputs-for-project.js', () => ({
  loadCsrInputsForProject: vi.fn(async () => []),
}));
vi.mock('../../services/preclinical/load-nonclinical-studies-for-project.js', () => ({
  loadNonclinicalStudiesForProject: vi.fn(async () => []),
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
import { CsrScopeError } from '../../services/csr/project-scope';

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

const A_SOURCE = { id: 'ds-1', sourceType: 'drug_substance', sourcePayload: { name: 'BX-115' } };

function orchestratorResult() {
  return {
    run: { runId: 'run-1', status: 'complete', steps: [] },
    outputs: { module3Sections: [], csrTables: [], m23: null, m24: null, m25: null, m27: null },
  };
}

function inputsPassed() {
  expect(h.runOrchestrator, 'the orchestrator was never invoked').toHaveBeenCalled();
  return h.runOrchestrator.mock.calls[0][0] as Record<string, unknown>;
}

/** The details of the inputs-assembled audit row. */
function assemblyAudit(): Record<string, unknown> {
  const row = h.logAction.mock.calls
    .map(c => c[0])
    .find(r => r?.action === 'orchestrator_inputs_assembled');
  expect(row, 'no inputs-assembled audit row was written').toBeTruthy();
  return (row as { details: Record<string, unknown> }).details;
}

/** The gate's verdict for a program whose Module 3 may be exported. */
const GATE_OPEN = { allowed: true, data: { approvedSections: 4, totalSections: 4 } };
const GATE_CLOSED = {
  allowed: false,
  error: '2 of 4 composed sections are not approved, so Module 3 cannot be exported.',
  data: { approvedSections: 2, totalSections: 4 },
};

beforeEach(() => {
  h.runOrchestrator.mockReset();
  h.loadSubmissionFkBySubmissionIdText.mockReset();
  h.evaluateFinalExportGate.mockReset();
  h.loadCmcSourcesForProject.mockReset();
  h.logAction.mockClear();
  h.isDevelopment = false;
  h.scope.mockReset().mockResolvedValue({ projectId: 7 });
  h.runOrchestrator.mockResolvedValue(orchestratorResult());
  h.loadSubmissionFkBySubmissionIdText.mockResolvedValue(null);
  h.loadCmcSourcesForProject.mockResolvedValue([A_SOURCE]);
  h.evaluateFinalExportGate.mockResolvedValue(GATE_OPEN);
  h.assessProgramCompositionScope.mockReset().mockResolvedValue(null);
});

describe('CMC data cannot be supplied in the request', () => {
  it('refuses an inaccessible project before loading any private input arrays or starting a run', async () => {
    h.scope.mockRejectedValueOnce(new CsrScopeError('CSR_PROJECT_ACCESS_DENIED', 403, 'Current project access is required.'));
    const res = await request(app()).post('/api/submission-orchestrator/runs').send(modeABody());
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSR_PROJECT_ACCESS_DENIED');
    expect(h.loadCmcSourcesForProject).not.toHaveBeenCalled();
    expect(h.runOrchestrator).not.toHaveBeenCalled();
  });
  it('refuses inline cmcSources on POST /runs, before anything is read or written', async () => {
    const res = await request(app())
      .post('/api/submission-orchestrator/runs')
      .send(body({ cmcSources: [A_SOURCE], nonclinicalStudies: [], csrInputs: [] }));

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'INLINE_CMC_SOURCES_REFUSED', field: 'cmcSources' });
    // The remedy is the governed path, by route.
    expect(res.body.message).toContain('/api/cmc/module3-os/compile/');
    expect(res.body.message).toContain('/api/cmc/module3-os/place-into-submission/');
    expect(h.runOrchestrator, 'a refused run still orchestrated').not.toHaveBeenCalled();
    expect(h.loadCmcSourcesForProject).not.toHaveBeenCalled();
  });

  it('refuses it on the regenerate route too — the same door one level down', async () => {
    const { getRun } = await import('../../services/submission-package-orchestrator.js');
    (getRun as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      runId: 'run-0',
      organizationId: ORG,
      steps: [],
    });

    const res = await request(app())
      .post('/api/submission-orchestrator/runs/run-0/regenerate')
      .send(body({ cmcSources: [A_SOURCE], nonclinicalStudies: [], csrInputs: [] }));

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'INLINE_CMC_SOURCES_REFUSED' });
  });

  it('does not refuse an EMPTY array — it carries no Module 3 either way', async () => {
    const res = await request(app())
      .post('/api/submission-orchestrator/runs')
      .send(body({ cmcSources: [], nonclinicalStudies: [], csrInputs: [] }));

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(inputsPassed().cmcSources).toEqual([]);
  });

  it('keeps the fixture door open in development', async () => {
    h.isDevelopment = true;

    const res = await request(app())
      .post('/api/submission-orchestrator/runs')
      .send(body({ cmcSources: [A_SOURCE], nonclinicalStudies: [], csrInputs: [] }));

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(inputsPassed().cmcSources).toEqual([A_SOURCE]);
  });
});

describe('Mode A carries Module 3 only when the program’s export gate is open', () => {
  it('asks the gate for THIS program, under THIS organization, and carries the sources when it opens', async () => {
    const res = await request(app()).post('/api/submission-orchestrator/runs').send(modeABody());

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(h.evaluateFinalExportGate).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG, projectId: PROGRAM }),
    );
    expect(inputsPassed().cmcSources).toEqual([A_SOURCE]);
    expect(res.body.outputs.m3Refusal).toBeNull();
    expect(assemblyAudit()).toMatchObject({ cmcExportGate: 'open', cmcSourceCount: 1 });
  });

  it('carries NO Module 3 when the gate refuses, and never reads the sources', async () => {
    h.evaluateFinalExportGate.mockResolvedValue(GATE_CLOSED);

    const res = await request(app()).post('/api/submission-orchestrator/runs').send(modeABody());

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(
      inputsPassed().cmcSources,
      'unapproved Module 3 reached the package the run signs',
    ).toEqual([]);
    expect(h.loadCmcSourcesForProject).not.toHaveBeenCalled();
  });

  it('says WHY it carried none, in the gate’s own words', async () => {
    h.evaluateFinalExportGate.mockResolvedValue(GATE_CLOSED);

    const res = await request(app()).post('/api/submission-orchestrator/runs').send(modeABody());

    expect(res.body.outputs.m3Refusal).toBe(GATE_CLOSED.error);
    expect(assemblyAudit()).toMatchObject({
      cmcExportGate: 'closed',
      cmcExportGateReason: GATE_CLOSED.error,
      cmcSourceCount: 0,
    });
  });

  it('hands the refusal to the run, so m3.compose records WHY it skipped', async () => {
    h.evaluateFinalExportGate.mockResolvedValue(GATE_CLOSED);

    await request(app()).post('/api/submission-orchestrator/runs').send(modeABody());

    /* The step mechanism distinguishes `{ skip: reason }` from a null return,
       which records 'skipped (no inputs)'. A program whose Module 3 the gate
       will not clear is not a program with no CMC data, and the run's own
       steps are where a reviewer reads the difference. */
    expect(inputsPassed().module3ExportRefusal).toBe(GATE_CLOSED.error);
  });

  it('hands no refusal when the gate opened — the step has nothing to explain', async () => {
    await request(app()).post('/api/submission-orchestrator/runs').send(modeABody());
    expect(inputsPassed().module3ExportRefusal).toBeNull();
  });

  it('a gate that cannot be evaluated carries none and reads as unknown, never as an empty program', async () => {
    h.evaluateFinalExportGate.mockImplementation(async () => {
      throw new Error('connection terminated');
    });

    const res = await request(app()).post('/api/submission-orchestrator/runs').send(modeABody());

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(inputsPassed().cmcSources).toEqual([]);
    expect(assemblyAudit()).toMatchObject({ cmcExportGate: 'unknown' });
    expect(String(res.body.outputs.m3Refusal)).toMatch(/could not be evaluated/);
    // Not "this program has no CMC data" — nothing is known about it.
    expect(String(res.body.outputs.m3Refusal)).toMatch(/Nothing is known about its approval state/);
  });

  /* The gate judges approval, not what the program is. A biologic, or a
     program filing an NDA, whose sections were approved before the boundary
     existed passes it, and its Module 3 was composed and signed into the
     package (2026-10-22). */
  it('carries NO Module 3 for a program outside the composition boundary, though the gate opened, and says why', async () => {
    const MAB = "This project's drug substance is biologically derived — CHO cell culture — and Module 3 for a biologic is not composed here.";
    h.assessProgramCompositionScope.mockResolvedValue({ code: 'CMC_MODALITY_OUT_OF_SCOPE', modality: 'biologic', message: MAB });

    const res = await request(app()).post('/api/submission-orchestrator/runs').send(modeABody());

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(h.assessProgramCompositionScope).toHaveBeenCalledWith(ORG, PROGRAM);
    expect(inputsPassed().cmcSources).toEqual([]);
    expect(h.loadCmcSourcesForProject).not.toHaveBeenCalled();
    expect(inputsPassed().module3ExportRefusal).toBe(MAB);
    expect(assemblyAudit()).toMatchObject({ cmcExportGate: 'closed', cmcExportGateReason: MAB, cmcSourceCount: 0 });
  });

  it('a boundary that cannot be evaluated carries none and reads as unknown', async () => {
    h.assessProgramCompositionScope.mockRejectedValue(new Error('connection terminated'));

    const res = await request(app()).post('/api/submission-orchestrator/runs').send(modeABody());

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(inputsPassed().cmcSources).toEqual([]);
    expect(assemblyAudit()).toMatchObject({ cmcExportGate: 'unknown' });
    expect(String(res.body.outputs.m3Refusal)).toMatch(/could not be established/);
  });

  it('does not ask the gate at all when no CMC program is named', async () => {
    const res = await request(app())
      .post('/api/submission-orchestrator/runs')
      .send(body({ projectId: 7 }));

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(h.evaluateFinalExportGate).not.toHaveBeenCalled();
    expect(inputsPassed().cmcSources).toEqual([]);
    expect(assemblyAudit()).toMatchObject({ cmcExportGate: 'open', cmcSourceCount: 0 });
  });
});

describe('the standalone QOS route is gone', () => {
  it('POST /m2/qos is not routed — the QOS is composed from records, not from a request body', async () => {
    const res = await request(app())
      .post('/api/submission-orchestrator/m2/qos')
      .send({ module3Sections: [{ sectionKey: '3.2.S.1', narrative: 'whatever the caller sent' }] });

    expect(res.status).toBe(404);
  });
});

describe('m3.refine’s model path is unreachable from a request', () => {
  it('useAI cannot be set through the run route', async () => {
    const res = await request(app()).post('/api/submission-orchestrator/runs').send(
      modeABody({ useAI: true, userId: 5 }),
    );

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    // The schema strips it, so the orchestrator's `inputs.useAI` stays falsy
    // and m3.refine records `skipped` rather than calling the gateway.
    expect(inputsPassed().useAI).toBeUndefined();
  });
});
