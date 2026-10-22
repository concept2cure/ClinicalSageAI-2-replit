/**
 * What the resolution narrative tells a person must be what happened.
 *
 * `refreshPreflightAfterExecution` did two writes and the narrative reported
 * one sentence for both: *"Preflight and readiness truth have been
 * refreshed."* The second write stamped updated_at on a
 * "concept2cure_projects" table — one that exists NOWHERE in this repository,
 * no migration and no `shared/schema` entry — inside
 * `catch { // Table may not exist }`. So it never ran, and
 * `readinessRefreshed` was set `true` whenever the function did not throw
 * (orchestrator :308-:313), which the swallowing catch guaranteed.
 * `ci:unbacked-tables` had been naming the table for weeks; its own words are
 * the finding: *"A guarded one degrades to a silent no-op, which is worse: it
 * looks durable and is not."*
 *
 * There was also nothing to invalidate. No readiness cache keyed on a
 * project's timestamp exists, and nothing anywhere reads `projects.updated_at`
 * for preflight — readiness is computed from server-side truth on every
 * assessment (`assessSequenceDispatchReadiness`,
 * server/services/ectd/assess-dispatch-readiness.ts). The write was dead
 * intent against a dead table.
 *
 * So the sentence says what the execution did: the findings it resolved are
 * restamped, and readiness is recomputed on read.
 */
import { describe, expect, it } from 'vitest';

import { buildContradictionExplanation } from '../contradiction-resolution-orchestrator';
import type { ContradictionOrchestrationResult } from '../../../../shared/types/resolution';

/** The least a result needs for the builder to render it end to end. */
const result = (readinessRefreshed: boolean): ContradictionOrchestrationResult =>
  ({
    success: true,
    decision: 'execute',
    plan: {
      summary: 'One stability specification conflict, resolved by restating the shelf-life claim.',
      authority: {
        requiresEscalation: false,
        requiresReviewerApproval: false,
        requiresHumanConfirmation: false,
      },
      actions: [
        {
          id: 'a1',
          kind: 'restate',
          targetObjectId: 'artifact-1',
          targetObjectTitle: '3.2.P.8 Stability',
          description: 'Restate the shelf-life claim to the validated range.',
          requiresConfirmation: false,
          requiresApproval: false,
          requiresEscalation: false,
        },
      ],
    },
    readinessRefreshed,
    contradictionStatesUpdated: ['finding-1'],
    timestamp: new Date().toISOString(),
  }) as unknown as ContradictionOrchestrationResult;

describe('the resolution narrative claims only what the execution did', () => {
  it('never claims that preflight or readiness state was refreshed', () => {
    for (const refreshed of [true, false]) {
      const text = buildContradictionExplanation(result(refreshed));
      expect(text, String(refreshed)).not.toMatch(/readiness truth have been refreshed/i);
      expect(text, String(refreshed)).not.toMatch(/Preflight and readiness/i);
    }
  });

  it('says what was restamped, and that readiness is recomputed rather than cached', () => {
    const text = buildContradictionExplanation(result(true));
    expect(text).toMatch(/recomputed/i);
    // And says nothing of the sort when the restamping did not run.
    expect(buildContradictionExplanation(result(false))).not.toMatch(/recomputed/i);
  });
});
