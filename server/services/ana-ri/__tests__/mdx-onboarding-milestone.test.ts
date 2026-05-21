/**
 * MDX onboarding milestone evaluator tests — verifies the priority order
 * of milestones based on signal counts.
 */

import { describe, it, expect, vi } from 'vitest';
import { getMdxOnboardingMilestone } from '../mdx-onboarding-milestone';

function clientWith(rowsByQuery: Map<string, any[]>) {
  // Iterate in REVERSE insertion order so more-specific keys (added later,
  // e.g. 'predicate_devices') win over the generic 'count(*) AS c FROM
  // regulatory_programs' key that ALSO appears in the predicate-count query.
  return {
    query: vi.fn(async (sql: string) => {
      const entries = Array.from(rowsByQuery.entries()).reverse();
      for (const [key, rows] of entries) {
        if (sql.includes(key)) return { rows };
      }
      return { rows: [] };
    }),
  } as any;
}

describe('getMdxOnboardingMilestone', () => {
  it('returns no_program when zero programs exist', async () => {
    const c = clientWith(
      new Map([['count(*)::int AS c\n       FROM regulatory_programs', [{ c: 0 }]]]),
    );
    const m = await getMdxOnboardingMilestone(c, 1);
    expect(m.id).toBe('no_program');
    expect(m.signals.programs).toBe(0);
  });

  it('returns transmitted when audit_logs has a transmit row', async () => {
    const c = clientWith(
      new Map<string, any[]>([
        ['count(*)::int AS c\n       FROM regulatory_programs', [{ c: 1 }]],
        ['predicate_devices', [{ c: 1 }]],
        ['cerv2_510k_sections', [{ drafting: 0, approved: 4 }]],
        ['q_submissions q', [{ c: 0 }]],
        ['k510_workflow.transmit', [{ c: 1 }]],
      ]),
    );
    const m = await getMdxOnboardingMilestone(c, 1);
    expect(m.id).toBe('transmitted');
  });

  it('returns preflight_ready when ≥4 sections approved + 0 drafting', async () => {
    const c = clientWith(
      new Map<string, any[]>([
        ['count(*)::int AS c\n       FROM regulatory_programs', [{ c: 1 }]],
        ['predicate_devices', [{ c: 1 }]],
        ['cerv2_510k_sections', [{ drafting: 0, approved: 5 }]],
        ['q_submissions q', [{ c: 0 }]],
        ['k510_workflow.transmit', [{ c: 0 }]],
      ]),
    );
    const m = await getMdxOnboardingMilestone(c, 1);
    expect(m.id).toBe('preflight_ready');
    expect(m.workflowId).toBe('W5');
  });

  it('returns presub_in_flight when a Q-Sub is mid-review', async () => {
    const c = clientWith(
      new Map<string, any[]>([
        ['count(*)::int AS c\n       FROM regulatory_programs', [{ c: 1 }]],
        ['predicate_devices', [{ c: 1 }]],
        ['cerv2_510k_sections', [{ drafting: 0, approved: 1 }]],
        ['q_submissions q', [{ c: 2 }]],
        ['k510_workflow.transmit', [{ c: 0 }]],
      ]),
    );
    const m = await getMdxOnboardingMilestone(c, 1);
    expect(m.id).toBe('presub_in_flight');
    expect(m.workflowId).toBe('W3');
  });

  it('returns authoring when sections are in drafting', async () => {
    const c = clientWith(
      new Map<string, any[]>([
        ['count(*)::int AS c\n       FROM regulatory_programs', [{ c: 1 }]],
        ['predicate_devices', [{ c: 1 }]],
        ['cerv2_510k_sections', [{ drafting: 3, approved: 1 }]],
        ['q_submissions q', [{ c: 0 }]],
        ['k510_workflow.transmit', [{ c: 0 }]],
      ]),
    );
    const m = await getMdxOnboardingMilestone(c, 1);
    expect(m.id).toBe('authoring');
    expect(m.workflowId).toBe('W2');
  });

  it('returns no_predicates when programs exist but no predicate set', async () => {
    const c = clientWith(
      new Map<string, any[]>([
        ['count(*)::int AS c\n       FROM regulatory_programs', [{ c: 1 }]],
        ['predicate_devices', [{ c: 0 }]],
        ['cerv2_510k_sections', [{ drafting: 0, approved: 0 }]],
        ['q_submissions q', [{ c: 0 }]],
        ['k510_workflow.transmit', [{ c: 0 }]],
      ]),
    );
    const m = await getMdxOnboardingMilestone(c, 1);
    expect(m.id).toBe('no_predicates');
    expect(m.workflowId).toBe('W1');
  });

  it('returns predicates_set when predicates picked but no further work', async () => {
    const c = clientWith(
      new Map<string, any[]>([
        ['count(*)::int AS c\n       FROM regulatory_programs', [{ c: 1 }]],
        ['predicate_devices', [{ c: 1 }]],
        ['cerv2_510k_sections', [{ drafting: 0, approved: 0 }]],
        ['q_submissions q', [{ c: 0 }]],
        ['k510_workflow.transmit', [{ c: 0 }]],
      ]),
    );
    const m = await getMdxOnboardingMilestone(c, 1);
    expect(m.id).toBe('predicates_set');
  });

  it('is fail-soft when individual queries throw', async () => {
    const c = {
      query: vi.fn(async (sql: string) => {
        // Only the bare regulatory_programs count succeeds; everything else
        // (including the predicate-aware count, sections, q-subs, audits)
        // throws. The bare count omits 'predicate_devices', so the matcher
        // distinguishes them.
        if (
          sql.includes('count(*)::int AS c\n       FROM regulatory_programs') &&
          !sql.includes('predicate_devices')
        ) {
          return { rows: [{ c: 1 }] };
        }
        throw new Error('table missing on this tenant');
      }),
    } as any;
    const m = await getMdxOnboardingMilestone(c, 1);
    // Falls through to no_predicates given default counts.
    expect(['no_predicates']).toContain(m.id);
  });
});
