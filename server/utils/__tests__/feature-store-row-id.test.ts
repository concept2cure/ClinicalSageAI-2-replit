/**
 * A feature-store entity's id is its row's id.
 *
 * rowToEntity built { id: row.id, ...content }, so an `id` inside the stored
 * content — which every mission-control create used to accept from the request
 * body — replaced the row's id on every read, and getById / update then
 * addressed a different row. Only the database is replaced.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db', () => {
  const row = {
    id: 12, content: JSON.stringify({ id: 999, title: 'T', createdAt: '2000-01-01' }),
    createdAt: new Date('2026-10-01T00:00:00Z'), updatedAt: new Date('2026-10-02T00:00:00Z'),
  };
  const chain: any = {
    from: () => chain, where: () => chain, orderBy: async () => [row], limit: async () => [row],
  };
  return { db: { select: () => chain } };
});

import { createFeatureStore } from '../feature-persistence';

describe('feature store entities', () => {
  const store = createFeatureStore('mission_control');

  it('getById answers the row id, not an id stored in the content', async () => {
    const e = await store.getById(12, 5);
    expect(e.id).toBe(12);
    expect(e.createdAt).toEqual(new Date('2026-10-01T00:00:00Z'));
  });

  it('query answers the row id too', async () => {
    const [e] = await store.query(5, 'artifact');
    expect(e.id).toBe(12);
  });
});
