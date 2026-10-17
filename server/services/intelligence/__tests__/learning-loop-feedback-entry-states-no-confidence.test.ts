/**
 * A recommendation-feedback memory entry records what the user did; it states
 * no confidence, because nothing computed one.
 *
 * What the code used to do (until 2026-10-15): recordFeedback wrote every
 * feedback entry with `confidenceScore: 1.0`. Memory readers rank and cite
 * entries by that column (the orchestrator weighs it, the context blocks print
 * it as "N% confidence"), so a click on "dismiss" entered AnA's context as a
 * 100%-confidence fact. Unscored is null, which those readers render as
 * "[unscored]" and leave out of the evidence-chain strength.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  selectRows: [] as unknown[][],
  inserts: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../../db', () => {
  const chain = () => {
    const c: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'orderBy']) c[m] = () => c;
    c.limit = async () => h.selectRows.shift() ?? [];
    return c;
  };
  return {
    db: {
      select: () => chain(),
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          h.inserts.push(values);
          return Object.assign(Promise.resolve(undefined), { returning: async () => [{ id: 9 }] });
        },
      }),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
    },
  };
});

import { recordFeedback } from '../learning-loop-service';

beforeEach(() => {
  h.selectRows = [[{ id: 4 }]]; // the project's intelligence profile
  h.inserts.length = 0;
});

describe('recordFeedback — the stored feedback entry', () => {
  it.each(['accepted', 'dismissed', 'resolved', 'overridden'] as const)(
    'a %s entry carries no confidence (null), not 1.0',
    async (action) => {
      await recordFeedback({
        recommendationId: 'rec-1',
        recommendationType: 'evidence_gap',
        action,
        userId: 7,
        projectId: 62,
        organizationId: 61,
      });
      const entry = h.inserts.find(v => v.category === 'recommendation_feedback');
      expect(entry, 'no feedback entry was stored').toBeDefined();
      expect(entry!.confidenceScore).toBeNull();
    },
  );
});
