import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Module 3 contradictions becoming real, assignable work.
 *
 * ── What this is guarding ─────────────────────────────────────────────────────
 * The contradiction sweep replaces `cmc_contradictions` wholesale on every run.
 * Tasks cannot follow that model: an assigned, started or commented-on task
 * carries human state the sweep knows nothing about. So the two failure modes
 * that matter are opposite in direction and equally bad —
 *
 *   • re-running the sweep piling up a duplicate task each time, which turns the
 *     board into noise and trains people to ignore it;
 *   • the sweep touching a task that already exists, which quietly discards
 *     somebody's assignment or progress.
 *
 * Everything else here is about not lying to the caller: a tasking failure must
 * not fail the sweep, and must not be reported as success either.
 */

const selectRows = vi.fn();
const createUnifiedTask = vi.fn();

vi.mock('../../../db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(selectRows()) }),
      }),
    }),
  },
}));

vi.mock('../../unifiedTaskService', () => ({
  default: { createUnifiedTask: (...a: unknown[]) => createUnifiedTask(...a) },
}));

import { syncContradictionTasks, contradictionTaskKey } from '../contradiction-tasks';

const PROJECT = 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab';

const contradiction = (over: Partial<Record<string, unknown>> = {}) => ({
  contradictionType: 'dissolution_failure',
  severity: 'high',
  details: '2 dissolution test(s) failed: 40C/75RH',
  impactedSections: ['3.2.P.2', '3.2.P.5'],
  requiredReviewers: ['Formulation Scientist', 'Analytical Lead'],
  ...over,
});

/**
 * The service makes two kinds of read: resolve the project, then look for an
 * existing task per contradiction. Both go through the same mocked chain, so
 * queue their results in order.
 */
const reads = (...queued: unknown[][]) => {
  let i = 0;
  selectRows.mockImplementation(() => queued[i++] ?? []);
};

beforeEach(() => {
  selectRows.mockReset();
  createUnifiedTask.mockReset();
  createUnifiedTask.mockResolvedValue({ id: 1 });
});

describe('contradictionTaskKey', () => {
  it('is keyed on the project and the contradiction TYPE', () => {
    // Deliberately not the cmc_contradictions row id: that row is deleted and
    // re-inserted every sweep, so keying on it would make each run look like a
    // brand-new contradiction.
    expect(contradictionTaskKey(PROJECT, 'dissolution_failure')).toBe(
      `cmc-contradiction:${PROJECT}:dissolution_failure`,
    );
    expect(contradictionTaskKey(PROJECT, 'a')).not.toBe(contradictionTaskKey(PROJECT, 'b'));
    expect(contradictionTaskKey('p1', 'a')).not.toBe(contradictionTaskKey('p2', 'a'));
  });
});

describe('syncContradictionTasks', () => {
  it('does nothing when there are no contradictions', async () => {
    expect(await syncContradictionTasks({ organizationId: 101, projectUuid: PROJECT, contradictions: [] }))
      .toEqual({ created: 0, existing: 0 });
    expect(createUnifiedTask).not.toHaveBeenCalled();
  });

  it('creates a task carrying the detail, sections and reviewers', async () => {
    reads([{ id: 7 }], []); // project resolves to 7; no existing task
    const out = await syncContradictionTasks({
      organizationId: 101, projectUuid: PROJECT, contradictions: [contradiction()],
    });
    expect(out).toEqual({ created: 1, existing: 0 });

    const arg = createUnifiedTask.mock.calls[0][0];
    expect(arg.moduleType).toBe('CMC');
    expect(arg.title).toBe('Resolve dissolution_failure');
    expect(arg.organizationId).toBe(101);
    expect(arg.projectId).toBe(7);
    expect(arg.sourceEntityId).toBe(contradictionTaskKey(PROJECT, 'dissolution_failure'));
    expect(arg.sourceEntityType).toBe('cmc_contradiction');
    // The detail is the value of the task — without it the assignee has to go
    // back to the sweep to find out what actually conflicts.
    expect(arg.description).toContain('2 dissolution test(s) failed');
    expect(arg.description).toContain('Impacted sections: 3.2.P.2, 3.2.P.5.');
    expect(arg.description).toContain('Required reviewers: Formulation Scientist, Analytical Lead.');
    // And it says the task will not close itself, because it will not.
    expect(arg.description).toMatch(/not closed automatically/);
    expect(arg.tags).toEqual(['module-3', 'contradiction', '3.2.P.2', '3.2.P.5']);
    expect(arg.metadata).toMatchObject({ contradictionType: 'dissolution_failure', projectUuid: PROJECT });
  });

  it('leaves an existing task completely alone', async () => {
    reads([{ id: 7 }], [{ id: 42 }]); // a task already exists for this key
    const out = await syncContradictionTasks({
      organizationId: 101, projectUuid: PROJECT, contradictions: [contradiction()],
    });
    expect(out).toEqual({ created: 0, existing: 1 });
    // Not retitled, not reprioritised, not reopened — it is somebody's work item.
    expect(createUnifiedTask).not.toHaveBeenCalled();
  });

  it('creates one task per contradiction type, and skips only the ones already raised', async () => {
    reads(
      [{ id: 7 }],   // project
      [],            // type A — absent
      [{ id: 42 }],  // type B — already raised
      [],            // type C — absent
    );
    const out = await syncContradictionTasks({
      organizationId: 101,
      projectUuid: PROJECT,
      contradictions: [
        contradiction({ contradictionType: 'a' }),
        contradiction({ contradictionType: 'b' }),
        contradiction({ contradictionType: 'c' }),
      ],
    });
    expect(out).toEqual({ created: 2, existing: 1 });
    expect(createUnifiedTask.mock.calls.map(c => c[0].title)).toEqual(['Resolve a', 'Resolve c']);
  });

  it('maps severity onto the board\'s priority vocabulary', async () => {
    for (const [severity, priority] of [
      ['critical', 'critical'], ['high', 'high'], ['low', 'low'],
      ['medium', 'medium'], ['something-else', 'medium'],
    ]) {
      createUnifiedTask.mockClear();
      reads([{ id: 7 }], []);
      await syncContradictionTasks({
        organizationId: 101, projectUuid: PROJECT, contradictions: [contradiction({ severity })],
      });
      expect(createUnifiedTask.mock.calls[0][0].priority).toBe(priority);
    }
  });

  it('still creates the task when the project is not anchored to the PM spine', async () => {
    // projects.regulatory_program_id is nullable and being unanchored is a
    // common, valid state. Dropping the task would lose the work entirely; the
    // uuid is kept in metadata so it can be reconciled later.
    reads([], []); // project lookup finds nothing
    const out = await syncContradictionTasks({
      organizationId: 101, projectUuid: PROJECT, contradictions: [contradiction()],
    });
    expect(out).toEqual({ created: 1, existing: 0 });
    const arg = createUnifiedTask.mock.calls[0][0];
    expect(arg.projectId).toBeUndefined();
    expect(arg.organizationId).toBe(101);
    expect(arg.metadata.projectUuid).toBe(PROJECT);
  });

  it('reports a tasking failure rather than swallowing it or throwing', async () => {
    // The sweep's own answer must survive — but the caller must not be left to
    // assume tasks landed when none did.
    reads([{ id: 7 }], []);
    createUnifiedTask.mockRejectedValue(new Error('task board unavailable'));
    const out = await syncContradictionTasks({
      organizationId: 101, projectUuid: PROJECT, contradictions: [contradiction()],
    });
    expect(out.created).toBe(0);
    expect(out.error).toMatch(/task board unavailable/);
  });

  it('tolerates a contradiction with no sections or reviewers', async () => {
    reads([{ id: 7 }], []);
    const out = await syncContradictionTasks({
      organizationId: 101,
      projectUuid: PROJECT,
      contradictions: [contradiction({ impactedSections: null, requiredReviewers: undefined, details: null })],
    });
    expect(out.created).toBe(1);
    const arg = createUnifiedTask.mock.calls[0][0];
    expect(arg.tags).toEqual(['module-3', 'contradiction']);
    // No hollow "Impacted sections: ." line.
    expect(arg.description).not.toContain('Impacted sections');
    expect(arg.description).not.toContain('Required reviewers');
  });
});
