/**
 * A memory entry with no recorded confidence reports none (finding 24,
 * 2026-10-15).
 *
 * What the code used to do: getProjectMemory returned `confidence ?? 0.8`,
 * so an entry nobody scored went out of GET
 * /api/intelligence/projects/:id/memory at confidence 0.8.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../db', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'orderBy']) chain[m] = () => chain;
  chain.limit = async () => [
    { id: 1, category: 'regulatory', title: 'Unscored', content: 'c', confidence: null, source: null },
    { id: 2, category: 'regulatory', title: 'Scored', content: 'c', confidence: 0.6, source: 'doc.pdf' },
  ];
  return { db: { select: () => chain } };
});

import { getProjectMemory } from '../project-intelligence-service';

describe('getProjectMemory', () => {
  it('passes a recorded confidence through and invents none', async () => {
    const entries = await getProjectMemory(5, 6);
    expect(entries.map(e => [e.title, e.confidence])).toEqual([
      ['Unscored', null],
      ['Scored', 0.6],
    ]);
  });
});
