/**
 * P-111 item 3 (A1): the roll-up of a filing project's work projects' tasks is opt-in. Only the unified-work route,
 * which has just admitted its reader, passes `rollUpFor`; every other caller (the task board, submission-ops, the
 * cross-object resolver) passes nothing and gets exactly what it got before: no decision is asked for and no extra
 * read is made.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const decide = vi.hoisted(() => vi.fn());
vi.mock('../../tasking/task-project', () => ({ workProjectsReadableBy: decide }));
vi.mock('../../../db', () => ({ db: {} }));

import { loadUnifiedWork } from '../unified-work-view';

/** A drizzle stand-in: every select resolves to no rows, and each select is counted. */
function fakeDatabase() {
  const selects = vi.fn();
  const chain = { from: () => chain, where: () => Promise.resolve([]) };
  return { database: { select: (...a: unknown[]) => { selects(...a); return chain; } } as never, selects };
}

beforeEach(() => { decide.mockReset(); decide.mockResolvedValue([{ id: 101, name: 'Drug substance CMC' }]); });

describe('the work projects\' roll-up is opt-in (P-111 item 3)', () => {
  it('asks for no decision and makes no extra read when the caller passes no reader', async () => {
    const { database, selects } = fakeDatabase();
    const view = await loadUnifiedWork({ organizationId: 9, projectId: 11 }, database);
    expect(decide).not.toHaveBeenCalled();
    expect(selects).toHaveBeenCalledTimes(4);
    expect(view.items).toEqual([]);
  });

  it('decides once, for the admitted reader, and reads the work projects\' tasks in one more select', async () => {
    const { database, selects } = fakeDatabase();
    const executor = { query: vi.fn() };
    await loadUnifiedWork({ organizationId: 9, projectId: 11, rollUpFor: { userId: 12, role: 'member', executor } }, database);
    expect(decide).toHaveBeenCalledExactlyOnceWith(executor, 9, { userId: 12, role: 'member' }, 11);
    expect(selects).toHaveBeenCalledTimes(5);
  });

  it('says an undecidable roll-up as an unread source, never as no work', async () => {
    decide.mockRejectedValue(new Error('connection reset'));
    const { database } = fakeDatabase();
    const view = await loadUnifiedWork({ organizationId: 9, projectId: 11, rollUpFor: { userId: 12, role: 'member', executor: { query: vi.fn() } } }, database);
    expect(view.sources.unified_tasks.ran).toBe(false);
    expect(view.summary.partial).toBe(true);
  });
});
