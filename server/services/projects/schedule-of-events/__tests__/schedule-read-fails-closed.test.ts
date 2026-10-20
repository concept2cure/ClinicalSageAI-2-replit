/** A protected schedule read failure must never look like an empty schedule. */
import { describe, it, expect, vi } from 'vitest';

const H = vi.hoisted(() => ({ query: vi.fn(), poolQuery: vi.fn() }));
vi.mock('../../../../db', () => ({ pool: { query: H.poolQuery } }));
vi.mock('../../../notifications/notification-service', () => ({ createNotification: vi.fn() }));
vi.mock('../../../c2c/current-program-access', async original => {
  const actual = await original<typeof import('../../../c2c/current-program-access')>();
  return { ...actual, readCurrentProgramActor: async () => ({ userId: 99, role: 'member' }) };
});
vi.mock('../../../report-os/project-access', () => ({ canAccessReportProject: async () => true }));
import { getScheduleOfEvents } from '../service';
const context = {actorUserId:99,executor:{query:H.query}};

describe('getScheduleOfEvents', () => {
  it('rejects a missing schedule table after admission instead of answering no schedule', async () => {
    H.query.mockImplementation(async sql => {
      if (sql.includes('SELECT id, status FROM projects')) return {rows:[{id:12,status:'active'}]};
      throw Object.assign(new Error('relation "project_schedule_of_events" does not exist'),{code:'42P01'});
    });
    await expect(getScheduleOfEvents(3,12,context)).rejects.toThrow(/does not exist/);
    expect(H.poolQuery).not.toHaveBeenCalled();
  });
  it('an admitted project with no schedule rows remains a valid answer', async () => {
    H.query.mockImplementation(async sql => ({rows:sql.includes('SELECT id, status FROM projects') ? [{id:12,status:'active'}] : []}));
    const view = await getScheduleOfEvents(3,12,context);
    expect(view.plan).toBeNull(); expect(view.milestones).toEqual([]); expect(view.health.overallStatus).toBe('not_assessed');
    expect(H.poolQuery).not.toHaveBeenCalled();
  });
});
