/**
 * A schedule store that cannot be read is an error, not a project with no
 * schedule.
 *
 * getScheduleOfEvents answered a missing table (42P01) with `plan: null` and
 * no milestones — "no schedule has been generated" — on a database the
 * drizzle schema should have provisioned.
 */
import { describe, it, expect, vi } from 'vitest';

const H = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../../db', () => ({ pool: { query: H.query } }));
vi.mock('../../../notifications/notification-service', () => ({ createNotification: vi.fn() }));

import { getScheduleOfEvents } from '../service';

describe('getScheduleOfEvents', () => {
  it('rejects when the schedule tables are missing, rather than answering "no schedule"', async () => {
    H.query.mockRejectedValue(
      Object.assign(new Error('relation "project_schedule_of_events" does not exist'), { code: '42P01' }),
    );
    await expect(getScheduleOfEvents(3, 12)).rejects.toThrow(/does not exist/);
  });

  it('a project with no schedule rows is still an answer', async () => {
    H.query.mockResolvedValue({ rows: [] });
    const view = await getScheduleOfEvents(3, 12);
    expect(view.plan).toBeNull();
    expect(view.milestones).toEqual([]);
    expect(view.health.overallStatus).toBe('not_assessed');
  });
});
