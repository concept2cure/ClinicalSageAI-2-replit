/**
 * AnA's create-project refuses when the organization's project limit is not
 * recorded, and compares a recorded limit as recorded.
 *
 * What it used to do (until 2026-10-15): `access.org.maxProjects || 10`. A NULL
 * max_projects — a limit nobody recorded — became 10 and the project was
 * created, while the canonical create path (atomicQuotaService) refuses it as
 * QUOTA_NOT_RECORDED; a recorded limit of 0 also became 10.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ count: '0' as unknown, inserted: 0 }));

vi.mock('../../db', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => [{ count: h.count }] }) }),
    insert: () => {
      h.inserted += 1;
      return { values: () => ({ returning: async () => [{ id: 1, name: 'P' }] }) };
    },
  },
}));
vi.mock('../auditService.js', () => ({ default: { log: vi.fn(), logAction: vi.fn(), record: vi.fn() } }));

import { anaPlatformController } from '../ana-platform-controller';

const withLimit = (maxProjects: number | null) => {
  vi.spyOn(anaPlatformController, 'verifyPaidAccess').mockResolvedValue({ authorized: true, org: { maxProjects, settings: {} } });
  // The audit write after a create is not under test here.
  vi.spyOn(anaPlatformController as unknown as { auditLog: () => Promise<unknown> }, 'auditLog').mockResolvedValue({ persisted: true });
};

beforeEach(() => {
  vi.restoreAllMocks();
  h.inserted = 0;
});

describe('anaPlatformController.createProject — project limit', () => {
  it('refuses when no project limit is recorded, and creates nothing', async () => {
    withLimit(null);
    h.count = '3';
    const r = await anaPlatformController.createProject(7, { name: 'P' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not recorded/);
    expect(h.inserted).toBe(0);
  });

  it('refuses at a recorded limit of 0', async () => {
    withLimit(0);
    h.count = '0';
    const r = await anaPlatformController.createProject(7, { name: 'P' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Project limit reached \(0\)/);
    expect(h.inserted).toBe(0);
  });

  it('compares the counted projects as a number against the recorded limit', async () => {
    withLimit(10);
    h.count = '9';
    await anaPlatformController.createProject(7, { name: 'P' }).catch(() => undefined);
    expect(h.inserted).toBe(1);
  });
});
