/**
 * The canonical fact store writes the confidence it was given, and NULL
 * ("unscored") when it was given none.
 *
 * Until 2026-10-15 `factColumns` wrote '0.5000' for every fact whose caller
 * stated no confidence — a score nobody assigned, stored on the value of record
 * and read back as if someone had.
 *
 * The database is stubbed; the INSERT's values are captured.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ inserted: [] as Array<Record<string, unknown>> }));

vi.mock('../../../db', () => ({
  db: {
    // resolveActiveFact: no active fact yet, so upsert inserts version 1.
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        h.inserted.push(v);
        return { returning: async () => [{ id: 'fact-1', ...v }] };
      },
    }),
  },
}));

import { upsertCanonicalFact } from '../canonical-fact-store';

const BASE = { organizationId: 7, programId: 'prog-1', entity: 'study', field: 'enrollment', valueNum: 186 };

beforeEach(() => {
  h.inserted.length = 0;
});

describe('upsertCanonicalFact', () => {
  it('stores no confidence when none was stated', async () => {
    await upsertCanonicalFact({ ...BASE });
    expect(h.inserted).toHaveLength(1);
    expect(h.inserted[0].confidence).toBeNull();
  });

  it('stores a stated confidence as stated', async () => {
    await upsertCanonicalFact({ ...BASE, confidence: 0.75 });
    expect(h.inserted[0].confidence).toBe('0.75');
  });
});
