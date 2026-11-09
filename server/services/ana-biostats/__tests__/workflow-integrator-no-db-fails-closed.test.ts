/**
 * With no database, the biostatistics workflow reports failure — not a
 * prepared task and not an invented id.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `WorkflowIntegrator` has three no-DB branches. One of them was fixed, and its
 * comment says what was wrong (workflow-integrator.ts:129):
 *
 *   "Nothing was stored, so this is not a success, and there is no id to hand
 *    out: it used to report success with Date.now() as the artifact id, which
 *    every caller then presented as a stored document."
 *
 * The other two were left exactly as described:
 *
 *   :260 createReviewThread   success: true, reviewThreadId: Date.now()
 *   :405 createEscalationTask success: true, "Escalation task prepared (no DB)"
 *
 * So the review thread still hands out a clock reading as a thread id, and the
 * escalation still claims to have been prepared when nothing was written. The
 * escalation is the one raised when statistical review finds CRITICAL risk, so
 * a critical finding could be reported handled and exist nowhere.
 *
 * CLAUDE.md working agreement: "Fail closed, never fabricate." A row that was
 * not written is not a success, and an id that was never issued is not a
 * number off the clock.
 *
 * RED before the fix: both report success, and the thread returns an id.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* The integrator lazily imports the db module and reads `.db` off it; a null
   there is the no-database deployment this file is about. `!db` short-circuits
   before the schema import, so only this one mock is needed. */
vi.mock('../../../db', () => ({
  db: null,
  pool: { connect: vi.fn(), query: vi.fn() },
}));

import { WorkflowIntegrator } from '../workflow-integrator';

const DOCUMENT = {
  organizationId: 9,
  title: 'Statistical Analysis Plan — BX-204',
  content: '# SAP\n\nThe primary analysis is an MMRM.\n',
  type: 'full_statistical_analysis_plan',
} as never;

/* `dimensions` and `flags` are read before the no-DB branch is reached
   (workflow-integrator.ts:253 filters them), so a fixture without them makes
   the method throw and its catch return success:false — which would make the
   review-thread cases below pass for entirely the wrong reason. They did, on
   the first run of this file; this fixture is complete so the cases reach the
   branch they are about. */
const JUDGMENT = {
  overallRisk: 'critical',
  overallVerdict: 'inadequate',
  actionRecommendation: 'escalate',
  escalationReasons: ['Power below 0.7 at the stated effect', 'No multiplicity control'],
  dimensions: [
    { name: 'Power adequacy', verdict: 'inadequate', flags: ['ICH E9'] },
    { name: 'Multiplicity', verdict: 'marginal', flags: [] },
  ],
} as never;

type Result = { action: string; success: boolean; message: string; reviewThreadId?: number };

const integrator = () => new WorkflowIntegrator();
const reviewThread = () => (integrator() as any).createReviewThread(DOCUMENT, JUDGMENT, 41) as Promise<Result>;
const escalation = () => (integrator() as any).createEscalationTask(DOCUMENT, JUDGMENT, 41) as Promise<Result>;
const artifact = () => (integrator() as any).createArtifact(DOCUMENT) as Promise<Result>;

beforeEach(() => vi.clearAllMocks());

describe('with no database', () => {
  it('the review thread is not a success', async () => {
    const r = await reviewThread();
    expect(r.success, 'a review thread that was never stored reported success').toBe(false);
  });

  it('the review thread hands out no id — a clock reading is not a thread id', async () => {
    const r = await reviewThread();
    expect(r.reviewThreadId, 'an id was issued for a thread that does not exist').toBeUndefined();
  });

  it('the escalation task is not a success', async () => {
    const r = await escalation();
    expect(r.success, 'a critical-risk escalation that was never written reported success').toBe(false);
  });

  it('the escalation says nothing was created, not that it was "prepared"', async () => {
    const r = await escalation();
    expect(r.message).not.toMatch(/prepared/i);
    expect(r.message).toMatch(/not|no database|unavailable/i);
  });

  /* The guard: the branch that was already fixed stays fixed, so this file
     cannot pass by having made the other two match a broken sibling. */
  it('the artifact branch still fails closed, as it has since its own fix', async () => {
    const r = await artifact();
    expect(r.success).toBe(false);
  });
});
