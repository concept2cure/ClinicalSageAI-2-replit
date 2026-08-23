/**
 * Tests — thread-keyed working memory carries project attribution.
 *
 * The nightly consolidation job can only promote a thread-keyed row (the shape
 * the live AnA chat path writes: conversation_id NULL) if the row records
 * which project the conversation belonged to. That attribution is written HERE,
 * at write time, the moment the surface actually knows it — never inferred
 * later.
 *
 * The 20260820 migration adds the column; like the embedding column before it,
 * the writer probes for it and degrades to the pre-migration INSERT (with one
 * loud warning) when it is absent, so a half-migrated database loses project
 * attribution — never the whole write.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type QueryCall = { sql: string; values: unknown[] };

const state: { columnPresent: boolean; calls: QueryCall[]; warns: string[] } = {
  columnPresent: true,
  calls: [],
  warns: [],
};

vi.mock('../../db', () => ({
  pool: {
    query: async (sql: string, values?: unknown[]) => {
      state.calls.push({ sql, values: values ?? [] });
      if (sql.includes('information_schema.columns')) {
        return { rows: state.columnPresent ? [{ '?column?': 1 }] : [] };
      }
      return { rows: [] };
    },
  },
}));

vi.mock('../../utils/logger', () => ({
  createScopedLogger: () => ({
    info: () => {},
    warn: (msg: string) => state.warns.push(msg),
    error: () => {},
    debug: () => {},
  }),
}));

const STRUCTURED = {
  objective: 'Test objective',
  lockedFacts: [],
  decisions: [],
  openQuestions: [],
  nextActions: [],
  createdArtifacts: [],
  exclusions: [],
};

const lastInsert = () => state.calls.filter(c => c.sql.includes('INSERT INTO conversation_working_memory')).at(-1);

describe('storeWorkingMemoryForThread — project attribution', () => {
  beforeEach(() => {
    vi.resetModules();
    state.calls = [];
    state.warns = [];
  });

  it('records project_id on the row when the column exists', async () => {
    state.columnPresent = true;
    const { storeWorkingMemoryForThread } = await import('../working-memory.js');

    await storeWorkingMemoryForThread('thread_a', 1, 'A summary of decent length.', STRUCTURED, 24, 11);

    const insert = lastInsert();
    expect(insert).toBeDefined();
    expect(insert!.sql).toContain('project_id');
    expect(insert!.values).toContain(11);
    expect(state.warns).toEqual([]);
  });

  it('degrades to the pre-migration INSERT — with one warning — when the column is missing', async () => {
    state.columnPresent = false;
    const { storeWorkingMemoryForThread } = await import('../working-memory.js');

    await storeWorkingMemoryForThread('thread_b', 1, 'A summary of decent length.', STRUCTURED, 24, 11);
    await storeWorkingMemoryForThread('thread_b', 1, 'Another summary, same process.', STRUCTURED, 25, 11);

    const inserts = state.calls.filter(c => c.sql.includes('INSERT INTO conversation_working_memory'));
    expect(inserts).toHaveLength(2);
    for (const ins of inserts) {
      expect(ins.sql).not.toContain('project_id');
    }
    // Loud once, not per-write: a missing column is a deploy defect worth one
    // line, not a log flood.
    expect(state.warns.filter(w => w.includes('20260820_working_memory_project_id'))).toHaveLength(1);
  });

  it('never records a non-positive or non-finite project id', async () => {
    state.columnPresent = true;
    const { storeWorkingMemoryForThread } = await import('../working-memory.js');

    await storeWorkingMemoryForThread('thread_c', 1, 'A summary of decent length.', STRUCTURED, 24, 0);
    await storeWorkingMemoryForThread('thread_c', 1, 'A summary of decent length.', STRUCTURED, 24, Number.NaN);
    await storeWorkingMemoryForThread('thread_c', 1, 'A summary of decent length.', STRUCTURED, 24, null);

    const inserts = state.calls.filter(c => c.sql.includes('INSERT INTO conversation_working_memory'));
    expect(inserts).toHaveLength(3);
    for (const ins of inserts) {
      expect(ins.sql).not.toContain('project_id');
    }
  });
});
