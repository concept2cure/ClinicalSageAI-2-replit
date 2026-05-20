/**
 * Pure-logic tests for the PDEV state-transition guard.
 *
 * The guard's DB read is mocked so we exercise the rule logic
 * (target-state branching + dependency lookup + blocker formatting)
 * without a database.
 */
import { describe, expect, test, vi } from 'vitest';

vi.mock('../../../db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => stateFixture,
      }),
    }),
  },
  pool: undefined,
  getPool: () => {
    throw new Error('not in test scope');
  },
}));

// Mutable fixture the mock returns. Tests set this before each call.
let stateFixture: Array<{ key: string; state: string }> = [];

import {
  checkStateTransition,
  describeBlockers,
} from '../pdev-state-guard';

describe('pdev state guard — non-completing transitions are unrestricted', () => {
  test('drafting target always allowed', async () => {
    stateFixture = [];
    const r = await checkStateTransition('00000000-0000-0000-0000-000000000000', 'cmc.gmp_readiness', 'drafting');
    expect(r.allowed).toBe(true);
    if (r.allowed) expect(r.reason).toBe('unrestricted_target');
  });
  test('in_review target always allowed', async () => {
    stateFixture = [];
    const r = await checkStateTransition('00000000-0000-0000-0000-000000000000', 'cmc.gmp_readiness', 'in_review');
    expect(r.allowed).toBe(true);
  });
  test('ai_draft_generated target always allowed', async () => {
    stateFixture = [];
    const r = await checkStateTransition('00000000-0000-0000-0000-000000000000', 'cmc.gmp_readiness', 'ai_draft_generated');
    expect(r.allowed).toBe(true);
  });
});

describe('pdev state guard — completing transitions', () => {
  test('activity with no deps allowed', async () => {
    stateFixture = [];
    // cmc.candidate_optimization has dependsOn=[]
    const r = await checkStateTransition('00000000-0000-0000-0000-000000000000', 'cmc.candidate_optimization', 'approved');
    expect(r.allowed).toBe(true);
    if (r.allowed) expect(r.reason).toBe('all_dependencies_completed');
  });

  test('activity with deps NONE completed → blocked', async () => {
    stateFixture = [];
    // cmc.gmp_readiness depends on cmc.ds_manufacturing + cmc.dp_manufacturing
    const r = await checkStateTransition('00000000-0000-0000-0000-000000000000', 'cmc.gmp_readiness', 'approved');
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.blockers.length).toBe(2);
      const keys = r.blockers.map(b => b.activityKey).sort();
      expect(keys).toEqual(['cmc.dp_manufacturing', 'cmc.ds_manufacturing']);
      for (const b of r.blockers) {
        expect(b.currentState).toBe('not_started');
        expect(b.title.length).toBeGreaterThan(0);
        expect(b.workstream).toBe('cmc');
      }
    }
  });

  test('activity with deps ALL completed → allowed', async () => {
    stateFixture = [
      { key: 'cmc.ds_manufacturing', state: 'approved' },
      { key: 'cmc.dp_manufacturing', state: 'locked' },
    ];
    const r = await checkStateTransition('00000000-0000-0000-0000-000000000000', 'cmc.gmp_readiness', 'approved');
    expect(r.allowed).toBe(true);
  });

  test('activity with deps PARTIALLY completed → blocked', async () => {
    stateFixture = [
      { key: 'cmc.ds_manufacturing', state: 'approved' },
      { key: 'cmc.dp_manufacturing', state: 'in_review' },
    ];
    const r = await checkStateTransition('00000000-0000-0000-0000-000000000000', 'cmc.gmp_readiness', 'approved');
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.blockers.length).toBe(1);
      expect(r.blockers[0].activityKey).toBe('cmc.dp_manufacturing');
      expect(r.blockers[0].currentState).toBe('in_review');
    }
  });

  test('all completed states satisfy the gate (approved / locked / submission_ready / submitted)', async () => {
    const completedStates = ['approved', 'locked', 'submission_ready', 'submitted'];
    for (const s of completedStates) {
      stateFixture = [
        { key: 'cmc.ds_manufacturing', state: s },
        { key: 'cmc.dp_manufacturing', state: s },
      ];
      const r = await checkStateTransition('00000000-0000-0000-0000-000000000000', 'cmc.gmp_readiness', 'approved');
      expect(r.allowed).toBe(true);
    }
  });

  test('revision_required does NOT satisfy the gate', async () => {
    stateFixture = [
      { key: 'cmc.ds_manufacturing', state: 'revision_required' },
      { key: 'cmc.dp_manufacturing', state: 'approved' },
    ];
    const r = await checkStateTransition('00000000-0000-0000-0000-000000000000', 'cmc.gmp_readiness', 'submitted');
    expect(r.allowed).toBe(false);
  });

  test('unknown activity key produces blocker=[] result that is still allowed=false', async () => {
    stateFixture = [];
    const r = await checkStateTransition('00000000-0000-0000-0000-000000000000', 'not.a.real.key', 'approved');
    expect(r.allowed).toBe(false);
  });
});

describe('pdev state guard — describeBlockers formatting', () => {
  test('empty blocker list returns empty string', () => {
    expect(describeBlockers([])).toBe('');
  });
  test('single blocker formatted correctly', () => {
    const msg = describeBlockers([
      { activityKey: 'cmc.ds_manufacturing', currentState: 'in_review', title: 'Drug substance manufacturing', workstream: 'cmc' },
    ]);
    expect(msg).toContain('Drug substance manufacturing');
    expect(msg).toContain('cmc.ds_manufacturing');
    expect(msg).toContain('in_review');
  });
  test('long blocker lists are truncated with summary', () => {
    const blockers = Array.from({ length: 8 }, (_, i) => ({
      activityKey: `cmc.activity_${i}`,
      currentState: 'not_started' as const,
      title: `Activity ${i}`,
      workstream: 'cmc',
    }));
    const msg = describeBlockers(blockers);
    expect(msg).toContain('+3 more');
  });
});
