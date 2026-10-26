import { beforeEach, describe, expect, it, vi } from 'vitest';

const rows = vi.hoisted(() => vi.fn());
vi.mock('../../db', () => ({
  pool: { query: vi.fn() },
  db: { select: () => ({ from: () => ({ where: () => ({ orderBy: rows, limit: rows }) }) }) },
}));
vi.mock('../tenant/actor-names', () => ({ actorLabel: vi.fn(), resolveActorNames: async () => new Map() }));
import { listPrograms, getProgramById } from '../regulatory-programs.service';

const row = (progressPercent: number | null) => ({
  id: '11111111-2222-4333-8444-555555555555', name: 'Device', code: 'DV-1',
  programType: '510K', productType: 'device', primaryAgency: 'FDA', productName: 'Device',
  status: 'active', progressPercent, createdAt: new Date('2026-10-01'), updatedAt: new Date('2026-10-02'),
});
beforeEach(() => rows.mockReset());
describe('regulatory program progress serialization', () => {
  it('keeps missing progress null in list and detail', async () => {
    rows.mockResolvedValue([row(null)]);
    expect((await listPrograms(7))[0].progressPercent).toBeNull();
    expect((await getProgramById(7, row(null).id))?.progressPercent).toBeNull();
  });
  it('preserves a recorded zero as progress, without claiming it measures readiness', async () => {
    rows.mockResolvedValue([row(0)]);
    expect((await listPrograms(7))[0].progressPercent).toBe(0);
  });
});
