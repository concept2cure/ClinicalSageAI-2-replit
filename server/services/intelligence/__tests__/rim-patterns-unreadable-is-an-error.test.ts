/**
 * An unreadable pattern store is an error, never "no patterns learned"
 * (finding 10, 2026-10-15).
 *
 * What the code used to do: loadPersistedPatterns caught a failed read and
 * returned []. The store's ensureLoaded then marked the organization loaded,
 * so the empty answer stood for the life of the process even after the
 * database recovered, and the next observation of a pattern persisted as
 * 4 occurrences at confidence 80 re-seeded it in memory at 1 / 50 — and the
 * upsert wrote 1 / 50 over the stored counts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  healthy: true,
  writes: [] as Array<{ confidence: unknown; occurrences: unknown }>,
}));

vi.mock('../../../db', () => ({
  pool: {
    query: async (sql: string, params: unknown[]) => {
      if (/FROM rim_learned_patterns/.test(sql)) {
        if (!h.healthy) {
          throw Object.assign(new Error('connection terminated unexpectedly'), { code: '57P01' });
        }
        const org = Number(params[0]);
        return {
          rows: [{
            organization_id: org,
            pattern_key: `${org}::fda::deficiency::compliance rule x violated`,
            domain: 'fda',
            signal_type: 'deficiency',
            observation: 'Compliance rule X violated',
            confidence: 80,
            occurrences: 4,
            first_seen: '2026-01-01T00:00:00.000Z',
            last_seen: '2026-02-01T00:00:00.000Z',
          }],
        };
      }
      if (/INSERT INTO rim_learned_patterns/.test(sql)) {
        h.writes.push({ confidence: params[5], occurrences: params[6] });
      }
      return { rows: [] };
    },
  },
  db: {},
}));

import { loadPersistedPatterns } from '../rim-pattern-persistence';
import { InMemoryRimPatternStore, recordPattern } from '../rim-pattern-store';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const OBSERVATION = { domain: 'fda', signalType: 'deficiency' as const, observation: 'Compliance rule X violated' };

beforeEach(() => {
  h.healthy = true;
  h.writes.length = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('rim pattern reads', () => {
  it('a failed read rejects instead of returning []', async () => {
    h.healthy = false;
    await expect(loadPersistedPatterns('7')).rejects.toThrow(/could not be read/);
  });

  it('the store does not mark the organization loaded after a failed read', async () => {
    const store = new InMemoryRimPatternStore();
    h.healthy = false;
    await expect(store.getPatterns({ orgId: 8 })).rejects.toThrow(/could not be read/);
    h.healthy = true; // the database is back
    const recovered = await store.getPatterns({ orgId: 8 });
    expect(recovered.map(p => [p.occurrences, p.confidence])).toEqual([[4, 80]]);
  });

  it('an observation made while the store is unreadable does not overwrite the stored counts', async () => {
    h.healthy = false;
    await expect(recordPattern({ orgId: 9, ...OBSERVATION })).resolves.toBeNull();
    await flush();
    expect(h.writes).toEqual([]);

    h.healthy = true;
    const strengthened = await recordPattern({ orgId: 9, ...OBSERVATION });
    await flush();
    expect([strengthened?.occurrences, strengthened?.confidence]).toEqual([5, 85]);
    expect(h.writes).toEqual([{ confidence: 85, occurrences: 5 }]);
  });
});
