/**
 * A run the product starts is joinable to its submission.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `submission_orchestrator_runs` carries the submission twice: `submission_id`
 * (TEXT, legacy, free-form) and `submission_id_fk` (INTEGER, joinable). The
 * orchestrator writes the FK only when a caller hands it one — otherwise the
 * column is NULL "until a per-tenant backfill resolves it"
 * (OrchestratorInputs.submissionFk).
 *
 * No caller ever handed it one. `submissionFk` is optional on this route, no
 * client sends it, and `grep -rn submissionIdFk server` finds nothing outside
 * the orchestrator service itself. So every run the product has ever created
 * stored NULL.
 *
 * That column is not decorative. The §11.70 release-signature gate
 * (release-signature-status.ts) finds a submission's signed packages with
 * `WHERE submission_id_fk = <id>` — the FK, not the TEXT. With every run
 * unlinked, the gate found nothing and reported 'unsigned': a customer who had
 * orchestrated a package AND signed its release was told no release signature
 * existed, and the remedy that state implies — sign it — produces one more
 * unlinked run and changes nothing.
 *
 * The service already ships the resolver for exactly this, and its own
 * documentation tells callers to use it: `loadSubmissionFkBySubmissionIdText`,
 * tenant-scoped, integer-coercible ids only, null rather than a guess.
 * Nothing called it.
 *
 * ── What is asserted ──────────────────────────────────────────────────────────
 *   • a run started without an explicit FK is linked anyway — the route
 *     resolves it before the orchestrator persists the row;
 *   • an explicit FK from the caller is NOT second-guessed;
 *   • resolution is scoped to the JWT organization, never the body — a resolver
 *     called with the wrong tenant is how a cross-tenant FK gets written;
 *   • an id that cannot be resolved ('SUB-2026-001') stores NO FK and the run
 *     still succeeds: the link is best-effort and never blocks orchestration,
 *     and the gate reports such a submission as undetermined rather than
 *     unsigned (release-signature-status.test.ts).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const { runOrchestrator, loadSubmissionFkBySubmissionIdText } = vi.hoisted(() => ({
  runOrchestrator: vi.fn(),
  loadSubmissionFkBySubmissionIdText: vi.fn(),
}));

vi.mock('../../services/submission-package-orchestrator.js', () => ({
  runOrchestrator,
  loadSubmissionFkBySubmissionIdText,
  getRun: vi.fn(),
  getRunAudit: vi.fn(),
  regenerateAffected: vi.fn(),
}));

vi.mock('../../db.js', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  db: { execute: vi.fn(async () => ({ rows: [] })) },
}));

vi.mock('../../services/auditService.js', () => ({
  default: { logAction: vi.fn(async () => undefined) },
}));

import orchestratorRouter from '../submission-orchestrator';

const ORG = 42;

function app(org: number = ORG) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { organizationId: org, id: 5 };
    next();
  });
  a.use('/api/submission-orchestrator', orchestratorRouter);
  return a;
}

/** The smallest body the run route accepts (Mode B, no inline arrays). */
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

/** What the orchestrator hands back — only the fields the route reads. */
function orchestratorResult() {
  return {
    run: { runId: 'run-1', status: 'complete', steps: [] },
    outputs: { module3Sections: [], csrTables: [], m23: null, m24: null, m25: null, m27: null },
  };
}

/** The inputs the route actually passed to the orchestrator. */
function inputsPassed() {
  expect(runOrchestrator, 'the orchestrator was never invoked').toHaveBeenCalled();
  return runOrchestrator.mock.calls[0][0] as Record<string, unknown>;
}

beforeEach(() => {
  runOrchestrator.mockReset();
  loadSubmissionFkBySubmissionIdText.mockReset();
  runOrchestrator.mockResolvedValue(orchestratorResult());
  loadSubmissionFkBySubmissionIdText.mockResolvedValue(null);
});

describe('POST /runs links the run to its submission', () => {
  it('resolves the canonical FK when the caller supplies none', async () => {
    loadSubmissionFkBySubmissionIdText.mockResolvedValue(9001);

    const res = await request(app()).post('/api/submission-orchestrator/runs').send(body());

    expect(res.status).toBe(200);
    expect(
      inputsPassed().submissionFk,
      'the run was persisted with a NULL FK, so the release-signature gate cannot see it',
    ).toBe(9001);
  });

  it('resolves against the JWT organization, never the body', async () => {
    loadSubmissionFkBySubmissionIdText.mockResolvedValue(9001);

    await request(app(ORG))
      .post('/api/submission-orchestrator/runs')
      // A caller trying to steer the resolution at another tenant.
      .send(body({ organizationId: 99, tenantId: 99 }));

    expect(loadSubmissionFkBySubmissionIdText).toHaveBeenCalledWith('9001', ORG);
  });

  it('does not second-guess an FK the caller supplied', async () => {
    const res = await request(app())
      .post('/api/submission-orchestrator/runs')
      .send(body({ submissionFk: 555 }));

    expect(res.status).toBe(200);
    expect(inputsPassed().submissionFk).toBe(555);
    expect(
      loadSubmissionFkBySubmissionIdText,
      'an explicit FK was overwritten by a lookup',
    ).not.toHaveBeenCalled();
  });

  it('still runs, with no FK, when the submission id cannot be resolved', async () => {
    // 'SUB-2026-001' is not integer-coercible; the resolver refuses to guess.
    loadSubmissionFkBySubmissionIdText.mockResolvedValue(null);

    const res = await request(app())
      .post('/api/submission-orchestrator/runs')
      .send(body({ submissionId: 'SUB-2026-001' }));

    expect(res.status, 'an unresolvable id blocked the orchestration itself').toBe(200);
    expect(inputsPassed().submissionFk).toBeUndefined();
  });
});
