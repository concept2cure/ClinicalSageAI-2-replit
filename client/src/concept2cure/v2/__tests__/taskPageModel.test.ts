/**
 * The Tasks page's rules, without rendering the board (taskPageModel.ts; P-131; D6.md §A.7):
 * whose work is shown, what AnA is told when the person's work could not be read, and
 * Team productivity naming the work with no owner.
 */
import { describe, expect, it } from 'vitest';
import {
  boardRows, needFactsForAna, OTHER_STORES_LABEL, taskPageLine, teamRows, whoFromParam, type PageCard,
} from '../surfaces/taskPageModel';
import { ANA_SUGGESTIONS } from '../registryModel';
import { TASK_STARTERS } from '../surfaces/TaskPageHeader';
import { greetingFor } from '../surfaces/taskGreeting';

const NOW = Date.parse('2026-11-13T12:00:00Z');
const at = (d: number) => new Date(NOW + d * 86_400_000).toISOString();
const card = (over: Partial<PageCard> & { taskId: string }): PageCard => ({
  title: over.taskId, status: 'pending', priority: 'medium', assignee: '7', moduleType: 'cmc', source: 'unified',
  due: '', dueDateIso: null, project: '31', ...over,
});
const reads = { board: { loading: false, failed: false, ownUnread: false }, myWork: { loading: false, failed: false },
  approvals: { loading: false, failed: false }, signOffs: 0 };
const noop = () => undefined;

describe('whose work', () => {
  it('reads the tasking.filter values Mine, Everyone and Needs an owner, and refuses any other', () => {
    expect(whoFromParam('true')).toBe('mine');
    expect(whoFromParam('false')).toBe('everyone');
    expect(whoFromParam('unassigned')).toBe('unowned');
    expect(whoFromParam('nobody')).toBeNull();
  });

  it('lists in Needs an owner only open board work with nobody assigned, never another store’s card', () => {
    const rows = boardRows([
      card({ taskId: 'mine' }),
      card({ taskId: 'none', assignee: '' }),
      card({ taskId: 'none-done', assignee: '', status: 'completed' }),
      card({ taskId: 'none-archived', assignee: '', status: 'cancelled' }),
      card({ taskId: 'schedule', assignee: '', readOnly: true }),
    ], { proj: 'all', mod: 'all', who: 'unowned', myId: '7' }, NOW);
    expect(rows.map((r) => r.taskId)).toEqual(['none']);
  });

  it('keeps everyone’s open and finished work in Everyone, archived work never (control)', () => {
    const rows = boardRows([card({ taskId: 'a' }), card({ taskId: 'b', status: 'completed' }), card({ taskId: 'c', status: 'cancelled' })],
      { proj: 'all', mod: 'all', who: 'everyone', myId: '7' }, NOW);
    expect(rows.map((r) => r.taskId).sort()).toEqual(['a', 'b']);
  });
});

describe('the line', () => {
  it('names the first task that needs an owner in Needs an owner', () => {
    const unowned = [card({ taskId: 'u1', title: 'Write the cover letter', assignee: '', dueDateIso: at(2) })];
    const line = taskPageLine({ who: 'unowned', reads, rows: unowned, unowned, projectName: null, blockedAt: null,
      open: noop, showUnowned: noop, showPath: noop, now: NOW });
    expect(line.kind).toBe('unowned');
    if (line.kind === 'unowned') {
      expect(line.text).toBe('1 open task needs an owner.');
      expect(line.first?.title).toBe('Write the cover letter');
    }
  });

  it('in Mine, says the board’s own tasks could not be read rather than "Nothing is assigned to you"', () => {
    const line = taskPageLine({ who: 'mine', reads: { ...reads, board: { ...reads.board, ownUnread: true } }, rows: [], unowned: [],
      projectName: null, blockedAt: null, open: noop, showUnowned: noop, showPath: noop, now: NOW });
    expect(line.kind === 'mine' && line.line.kind).toBe('unread');
    if (line.kind === 'mine' && line.line.kind === 'unread') expect(line.line.text).toMatch(/the board’s own tasks|the board's own tasks/);
  });

  it('says nothing over a failed board read: the error panel says it', () => {
    const line = taskPageLine({ who: 'mine', reads: { ...reads, board: { ...reads.board, failed: true } }, rows: [], unowned: [],
      projectName: null, blockedAt: null, open: noop, showUnowned: noop, showPath: noop, now: NOW });
    expect(line.kind).toBe('quiet');
  });
});

describe('what AnA is told', () => {
  it('says the person’s items are unknown, not none, when their read failed', () => {
    const facts = needFactsForAna({ unowned: [], myWork: { loading: false, error: 'unavailable', items: [] }, now: NOW });
    expect(facts.yourOpenItems).toBeNull();
    expect(facts.yourOpenItemsRead).toBe('failed');
  });

  it('lists the person’s items in the order of need when their read succeeded (control)', () => {
    const item = (taskId: string, priority: string, days: number, overdue = false) => ({
      taskId, title: taskId, projectId: 31, moduleType: 'cmc', status: 'pending', priority, dueDate: at(days), overdue,
      dueSoon: false, blocked: false, approvalRequired: false, approvalStatus: 'not_started', criticalPath: false,
    });
    const facts = needFactsForAna({
      unowned: null,
      myWork: { loading: false, items: [item('low-2d', 'low', 2), item('crit-6d', 'critical', 6), item('late', 'low', -1, true)] },
      now: NOW,
    });
    expect(facts.yourOpenItems?.map((i) => i.taskId)).toEqual(['late', 'crit-6d', 'low-2d']);
    expect(facts.needsAnOwner).toBeNull();
  });
});

describe('Team productivity', () => {
  it('names Unassigned and puts other stores’ work on its own row, people first by open work', () => {
    const name = (id: string) => ({ '7': 'Rae Okafor', '9': 'Sam Lee' } as Record<string, string>)[id] ?? '';
    const rows = teamRows([
      card({ taskId: 'a', assignee: '7' }),
      card({ taskId: 'b', assignee: '9' }), card({ taskId: 'c', assignee: '9' }),
      card({ taskId: 'd', assignee: '' }),
      card({ taskId: 'e', assignee: '', readOnly: true, source: 'schedule' }),
    ], name);
    expect(rows.map((r) => [r.label, r.open])).toEqual([
      ['Sam Lee', 2], ['Rae Okafor', 1], ['Unassigned', 1], [OTHER_STORES_LABEL, 1],
    ]);
  });
});

describe('AnA’s suggestions on Tasks are the page’s own starters', () => {
  it('so the two never disagree', () => {
    expect(ANA_SUGGESTIONS.tasks).toEqual(TASK_STARTERS.map((s) => s.label));
  });
});

describe('the greeting, one rule for Home and Tasks (P-131 item 4)', () => {
  it('greets by time of day and first name, never an email address', () => {
    expect(greetingFor({ firstName: 'Rae' }, 9)).toBe('Good morning, Rae');
    expect(greetingFor({ firstName: '', displayName: 'rae@example.com' }, 13)).toBe('Good afternoon, rae');
    expect(greetingFor(null, 18)).toBe('Good evening, there');
  });
});
