/**
 * The canonical fact store refuses a stated confidence outside 0–1, naming it,
 * before it writes anything.
 *
 * Until 2026-10-15 any number was written: 1.5 was stored as a confidence above
 * certainty, 85 (a percent) overflowed numeric(5,4) inside the INSERT, and on a
 * re-version the active fact had already been marked superseded when that
 * INSERT failed — leaving the value with no active fact at all.
 *
 * The database is stubbed; the writes are captured.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ inserted: [] as Array<Record<string, unknown>>, updates: 0 }));

vi.mock('../../../db', () => ({
  db: {
    // resolveActiveFact: no active fact yet, so upsert inserts version 1.
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        h.inserted.push(v);
        return { returning: async () => [{ id: 'fact-2', ...v }] };
      },
    }),
    update: () => ({
      set: () => {
        h.updates += 1;
        return { where: () => ({ returning: async () => [] }) };
      },
    }),
  },
}));

import { FactInputRefusal, supersedeAndReversion, upsertCanonicalFact } from '../canonical-fact-store';
import type { CanonicalFact } from '../../../../shared/schema/living-record-spine';

const BASE = { organizationId: 7, programId: 'prog-1', entity: 'study', field: 'enrollment', valueNum: 186 };
const EXISTING = {
  id: 'fact-1', organizationId: 7, programId: 'prog-1', entity: 'study', field: 'enrollment',
  comparator: '=', valueType: 'count', version: 1,
} as unknown as CanonicalFact;

const refusalOf = (call: Promise<unknown>) => call.then(() => null, (e: unknown) => e);

beforeEach(() => {
  h.inserted.length = 0;
  h.updates = 0;
});

describe('a stated confidence outside 0–1', () => {
  it.each([1.5, 85, -0.1, Number.NaN, Number.POSITIVE_INFINITY])('%s is refused, naming the confidence, and nothing is written', async (confidence) => {
    const err = await refusalOf(upsertCanonicalFact({ ...BASE, confidence }));
    expect(err, `a confidence of ${confidence} was written`).not.toBeNull();
    expect(err).toBeInstanceOf(FactInputRefusal);
    expect((err as FactInputRefusal).field).toBe('confidence');
    expect((err as Error).message).toMatch(/confidence/);
    expect(h.inserted).toEqual([]);
  });

  it('is refused on a re-version before the active fact is superseded', async () => {
    const err = await refusalOf(supersedeAndReversion(EXISTING, { valueNum: 190, confidence: 85 }));
    expect(err, 'a confidence of 85 was written').not.toBeNull();
    expect(err).toBeInstanceOf(FactInputRefusal);
    expect(h.updates, 'the active fact was superseded before the refusal').toBe(0);
    expect(h.inserted).toEqual([]);
  });
});

describe('a stated confidence within 0–1, or none', () => {
  it.each([[0, '0'], [1, '1'], [0.75, '0.75']])('%s is stored as stated', async (confidence, stored) => {
    await upsertCanonicalFact({ ...BASE, confidence });
    expect(h.inserted[0].confidence).toBe(stored);
  });

  it('none is stored as unscored', async () => {
    await upsertCanonicalFact({ ...BASE, confidence: null });
    expect(h.inserted[0].confidence).toBeNull();
  });
});
