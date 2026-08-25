// @vitest-environment jsdom
/**
 * v2 Orchestration surface — live-payload adoption mapping.
 *
 * The workflowAudit only exercises the offline (sample) path; this locks the
 * live path: server-truth payload shapes (ReadinessAssessment from the
 * readiness engine, { workflows } from the execution engine, the
 * { data, meta } checkpoint envelope proven against migration 0007 DDL) must
 * map onto the surface's display contract — and anything else must be
 * rejected (null) so the surface fails closed to its fixture.
 */
import { describe, it, expect } from 'vitest';
import { mapReadiness, mapRuns, mapCps } from '../surfaces/Orchestration';

// ── ReadinessAssessment as computeReadinessAssessment() returns it ──────────
const ASSESSMENT = {
  projectId: 301,
  organizationId: 7,
  overallScore: 71,
  status: 'at_risk',
  scores: { completeness: 60, quality: 70, compliance: 55, routing: 80, consistency: 50 },
  moduleBreakdown: [],
  documentInventory: [],
  blockers: [
    {
      severity: 'critical', category: 'validation_failure',
      message: 'CSR-201 has 2 critical validation finding(s)',
      targetType: 'document', targetId: 12, targetTitle: 'CSR-201',
      suggestedResolution: 'Run AI-assisted refinement to address critical findings',
    },
    {
      severity: 'major', category: 'missing_document',
      message: 'Module 4 has no documents assigned',
      targetType: 'module', targetId: 'Module 4', module: 'Module 4',
      suggestedResolution: 'Draft or route content to Module 4',
    },
    {
      severity: 'minor', category: 'stale_content',
      message: '1 approved document(s) may be stale (>60 days since last update)',
      targetType: 'project', targetId: 301,
      suggestedResolution: 'Review approved documents for currency',
    },
  ],
  recommendations: [],
  assessedAt: '2026-07-16T09:14:00Z',
};

describe('mapReadiness', () => {
  it('adopts the ReadinessAssessment fields with honest semantics', () => {
    const r = mapReadiness(ASSESSMENT);
    expect(r).not.toBeNull();
    expect(r!.overallScore).toBe(71);
    expect(r!.isReady).toBe(false); // status !== 'ready'
    // blocker-class = severity critical (the only class that blocks readiness
    // server-side); majors/minors surface as warning/advisory rows instead.
    expect(r!.blockerCount).toBe(1);
    expect(r!.findings.validation).toHaveLength(1);
    expect(r!.findings.validation[0]).toMatchObject({
      rule: 'CSR-201 has 2 critical validation finding(s)',
      type: 'validation_failure', sev: 'blocker', status: 'fail',
      detail: 'Run AI-assisted refinement to address critical findings',
    });
    expect(r!.findings.rules).toHaveLength(2);
    expect(r!.findings.rules.map((f) => f.sev)).toEqual(['warning', 'advisory']);
    // No ai-inferred class exists server-side — the ai group is honestly empty
    // (the surface no longer injects a fixture for it).
    expect(r!.findings.ai).toHaveLength(0);
  });

  it('marks status ready only when the engine says ready', () => {
    const r = mapReadiness({ ...ASSESSMENT, status: 'ready', blockers: [] });
    expect(r!.isReady).toBe(true);
    expect(r!.blockerCount).toBe(0);
    expect(r!.findings.rules).toHaveLength(0);
  });

  it('rejects payloads without the assessment fields (fail-closed)', () => {
    expect(mapReadiness(null)).toBeNull();
    expect(mapReadiness({})).toBeNull();
    expect(mapReadiness({ overallScore: '71', status: 'ready', blockers: [], assessedAt: 'x' })).toBeNull();
    expect(mapReadiness({ overallScore: 71, status: 'ready', assessedAt: 'x' })).toBeNull();
  });
});

// ── { workflows } as GET /api/orchestration/project/:id returns it ──────────
const EXECUTION = {
  executionId: 'e7a1c2d3-0000-0000-0000-000000000001',
  templateId: 'submission_readiness_review',
  status: 'completed',
  projectId: 301,
  organizationId: 7,
  steps: [
    { stepId: 's1', name: 'Assemble cross-object context', status: 'completed' },
    { stepId: 's2', name: 'Evaluate readiness rules', status: 'failed' },
    { stepId: 's3', name: 'Summarize findings', status: 'skipped' },
  ],
  currentStepIndex: 2,
  progressPercent: 100,
  startedAt: '2026-07-16T08:00:00Z',
  requestedBy: { userId: 42, userName: 'reg.lead@example.com' },
  result: {
    summary: 'done',
    blockers: [{ severity: 'critical', category: 'validation_failure', message: 'CSR-201 has criticals' }],
    recommendations: [{ suggestedAction: 'Route §2.7.4 to Module 2', reason: 'unrouted' }],
    createdObjects: [{ type: 'readiness_report', id: 'rr-1', title: 'Readiness report' }],
    updatedObjects: [{ type: 'document', id: 12, title: 'CSR-201' }],
  },
  auditTrail: [],
};

describe('mapRuns', () => {
  it('adopts executions with template display names, newest first', () => {
    const older = { ...EXECUTION, executionId: 'e-old', startedAt: '2026-07-15T08:00:00Z', status: 'running', result: undefined };
    const runs = mapRuns(
      { workflows: [older, EXECUTION] },
      { submission_readiness_review: 'Submission Readiness Review' },
    );
    expect(runs).not.toBeNull();
    expect(runs!.map((r) => r.id)).toEqual([EXECUTION.executionId, 'e-old']);
    const run = runs![0];
    expect(run.title).toBe('Submission Readiness Review');
    expect(run.status).toBe('completed');
    expect(run.by).toBe('reg.lead@example.com');
    expect(run.pct).toBe(100);
    expect(run.steps.map((s) => s.st)).toEqual(['done', 'failed', 'skipped']);
    expect(run.touched).toEqual(['CSR-201']);
    expect(run.outputs).toEqual(['Readiness report']);
    expect(run.blockers).toEqual(['CSR-201 has criticals']);
    expect(run.recs).toEqual(['Route §2.7.4 to Module 2']);
    // run without a result yet → empty collections, humanized templateId fallback
    expect(runs![1].outputs).toEqual([]);
    expect(mapRuns({ workflows: [older] }, {})![0].title).toBe('submission readiness review');
  });

  it('rejects empty or malformed workflow lists (fail-closed to fixture)', () => {
    expect(mapRuns({ workflows: [] }, {})).toBeNull();
    expect(mapRuns({}, {})).toBeNull();
    expect(mapRuns(null, {})).toBeNull();
    expect(mapRuns({ workflows: [{ status: 'running' }] }, {})).toBeNull();
  });
});

// ── { data } rows exactly as GET /api/orchestration/checkpoints projects them
//    (aliases proven against migrations/0007_orchestration_phase3.sql) ───────
const CP_ROW = {
  id: '33333333-3333-3333-3333-333333333333',
  stepName: 'Workstream reviewer',
  gateType: 'role_based',
  status: 'awaiting_review',
  workflowRunId: '11111111-1111-1111-1111-111111111111',
  runName: 'Approve Pre-IND briefing book → approved',
  runStatus: 'awaiting_approval',
  requiredApproverRoles: ['regulatory', 'regulatory_lead', 'workstream_lead'],
  requiredApproverCount: 1,
  approvals: [],
  protectedAction: 'pdev_activity_review',
  proposedAt: '2026-07-16T10:00:00.000Z',
  resolvedAt: null,
};

describe('mapCps', () => {
  it('adopts persisted checkpoints through the { data } envelope', () => {
    const decided = {
      ...CP_ROW,
      id: '44444444-4444-4444-4444-444444444444',
      stepName: 'Regulatory approver',
      status: 'approved',
      approvals: [{ approverId: '42', approverName: 'J. Chen', approverRole: 'regulatory_lead', decision: 'approved', decidedAt: '2026-07-16T10:05:00Z' }],
    };
    const cps = mapCps({ data: [CP_ROW, decided], meta: { count: 2 } });
    expect(cps).not.toBeNull();
    expect(cps![0]).toMatchObject({
      id: CP_ROW.id,
      label: 'Workstream reviewer',
      gateType: 'role_based',
      run: 'Approve Pre-IND briefing book → approved',
      status: 'awaiting_review',
      required: '1 × regulatory / regulatory_lead / workstream_lead',
      approvers: [],
    });
    expect(cps![1].approvers).toHaveLength(1);
    expect(cps![1].approvers[0]).toMatchObject({ who: 'J. Chen', role: 'regulatory_lead', decision: 'approved' });
    expect(cps![1].approvers[0].when).toBeTruthy();
  });

  it('rejects empty envelopes and rows without the gate keys (fail-closed)', () => {
    expect(mapCps({ data: [], meta: { count: 0 } })).toBeNull();
    expect(mapCps({ data: [{ id: 'x' }] })).toBeNull();
    expect(mapCps(null)).toBeNull();
  });
});

/**
 * A run must remember which template it ran.
 *
 * ── The defect ──────────────────────────────────────────────────────────────
 * "Retry" (on a failed or cancelled run) and "Replay" (on a completed one) were
 * both `noop` behind a disabled flag, on the surface whose header advertises
 * runs as "versioned, pausable, replayable". The reason they could not be wired
 * was here: `mapRuns` used `templateId` to TITLE the row and then dropped it, so
 * no control had anything to name when starting the run again.
 *
 * The engine can start a run from a template (POST /api/orchestration/execute).
 * It keeps no resumable state for a finished one — so Retry and Replay are a NEW
 * run of the same template, which is what they now say and do, and Pause/Resume
 * stay disabled with that stated rather than a generic "unwired".
 */
describe('mapRuns carries the template a run can be started from again', () => {
  const exec = (over: Record<string, unknown> = {}) => ({
    executionId: 'wf_1', templateId: 'ind_initial_filing', status: 'failed',
    startedAt: '2026-08-01T10:00:00Z', progressPercent: 40,
    requestedBy: { userName: 'R. Patel' }, steps: [{ stepId: 's1', name: 'Assemble', status: 'failed' }],
    ...over,
  });

  it('keeps templateId on the display row', () => {
    const rows = mapRuns({ workflows: [exec()] }, { ind_initial_filing: 'IND initial filing' });
    expect(rows).not.toBeNull();
    expect(rows![0].templateId).toBe('ind_initial_filing');
    expect(rows![0].title).toBe('IND initial filing');
  });

  it('reports NO template rather than inventing one when the engine did not record it', () => {
    // A run that cannot name its template cannot be started again, and the
    // control says exactly that instead of failing on click.
    for (const missing of [{ templateId: undefined }, { templateId: '' }]) {
      const rows = mapRuns({ workflows: [exec(missing)] }, {});
      expect(rows![0].templateId).toBeNull();
    }
  });

  it('still titles a run whose template is not in the registry, without claiming a name', () => {
    const rows = mapRuns({ workflows: [exec({ templateId: 'not_registered' })] }, {});
    expect(rows![0].templateId).toBe('not_registered');
    expect(rows![0].title).toBe('not registered');
  });
});
