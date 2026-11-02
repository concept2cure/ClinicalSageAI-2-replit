// @vitest-environment jsdom
/**
 * Your work, quiet (D1-4; .design/claude-convergence/D1.md §D1.G).
 *
 * WHY THIS EXISTS
 * The tray was the loudest panel in the shell: a tinted orange "Triage my day"
 * box, a green dot on every row including rows with nothing to flag ("due in
 * 14d"), "0 overdue" stated as a count, orange hovers on the row arrow and the
 * foot, and 11–12.5px text under the 12px floor. Claude's right-hand sheets are
 * a 16px title, one quiet line of counts and plain lists, with colour only where
 * something is late or blocked (ONE_DESIGN_PLAN §2: status colour only for
 * meaning; orange only for the send, the spark, focus and one primary).
 *
 * The triage ask was also an inline string, so the tray, Home's first starter
 * (D1-6b) and the task board (D6-1) could not share it. `TRIAGE_ASK` is the one
 * source; D6-1 imports it (BUILD_ORDER §0 item 4, a hard edge).
 *
 * WHAT IS PINNED
 *   - `TRIAGE_ASK` is exported, and the triage row asks exactly it;
 *   - the header: "n assigned · none overdue", or the number when one is late;
 *     the close is D0's `.btn`;
 *   - the triage row is a ghost button led by the ✻, not an icon in a tinted box;
 *   - a row or notice with nothing to flag keeps its dot's place but hides it
 *     (`data-quiet`); late, blocked, warning and critical keep their dot;
 *   - Mark read is `btn small`, the open button `btn ghost small`, Notification
 *     preferences `btn small`;
 *   - in the tray's rules: no orange except the ✻, no text under 12px, the
 *     group heads in sentence case, a quiet dot hidden.
 *
 * `.tt-badge` was excluded from the CSS checks until D1-2 (§D1.B step 7) re-valued it:
 * ink at 12px, red when something is overdue. It meets them now, so it is checked too.
 *
 * Red at 9bf83a8f0f (before D1-4): docs/evidence/DESIGN/D1/D1-4/red/.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
const actor = vi.hoisted(() => ({ user: { id: '42', organizationId: '7', role: 'admin' } as Record<string, string> | null }));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: actor.user }),
  authService: { getUser: () => actor.user },
}));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { TaskTray, TRIAGE_ASK } from '../TaskTray';
import { OpenWorkGroups, type MyWorkItem } from '../OpenWork';
import { setAuthToken, clearAuthToken } from '@/utils/authToken';

const res = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload });
const DAY = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * DAY + 3_600_000).toISOString();

const task = (over: Partial<MyWorkItem>): MyWorkItem => ({
  taskId: 'T-1', title: 'Write 3.2.S.4.1', projectId: 3, projectName: 'C2C-101', moduleType: 'authoring',
  status: 'pending', priority: 'medium', dueDate: at(14), overdue: false, dueSoon: false, blocked: false,
  approvalRequired: false, approvalStatus: 'approved', criticalPath: false, ...over,
});

function serve(work: { items: MyWorkItem[]; overdue: number }, notices: unknown[] = []) {
  apiRequest.mockImplementation(async (_method: string, url: string) => {
    if (url.startsWith('/api/mdx/notifications/unread-count')) return res({ data: { unread: notices.length } });
    if (url.startsWith('/api/mdx/notifications')) return res({ data: notices, meta: { count: notices.length } });
    if (url === '/api/task-management/my-work') {
      return res({ success: true, data: { items: work.items, total: work.items.length, overdue: work.overdue, dueSoon: 0, blocked: 0, approvalsPending: 0 } });
    }
    if (url === '/api/concept2cure/reviews/my-queue') {
      return res({ data: { threads: [], tasks: [], totalThreads: 0, totalTasks: 0, unreadNotifications: 0, overdueTasks: 0 } });
    }
    return res({ data: null });
  });
}

async function openTray() {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Your work/ })); });
  await waitFor(() => expect(screen.getByRole('dialog', { name: 'Your work' })).toBeTruthy());
  return screen.getByRole('dialog', { name: 'Your work' });
}

afterEach(() => { cleanup(); clearAuthToken(); });
beforeEach(() => {
  apiRequest.mockReset();
  actor.user = { id: '42', organizationId: '7', role: 'admin' };
  setAuthToken(`test.${btoa(JSON.stringify({ userId: 42, organizationId: 7 }))}.synthetic`);
});

describe('TRIAGE_ASK: one source for the tray, Home and the task board (D1 §D1.C step 5, §D1.G step 2)', () => {
  it('is exported with the words the tray has always asked', () => {
    expect(TRIAGE_ASK).toBe('Triage everything assigned to me across all projects and tell me what to do first');
  });

  it('the triage row asks exactly it, as a quiet ghost button led by the ✻', async () => {
    serve({ items: [], overdue: 0 });
    const onAsk = vi.fn();
    render(<TaskTray onNav={vi.fn()} onAsk={onAsk} />);
    const panel = await openTray();
    const triage = within(panel).getByRole('button', { name: 'Triage my day with AnA' });
    expect(triage.className.split(/\s+/)).toEqual(expect.arrayContaining(['btn', 'ghost', 'tt-triage']));
    const spark = triage.querySelector('.tt-spark');
    expect(spark?.textContent).toBe('✻');
    expect(spark?.getAttribute('aria-hidden')).toBe('true');
    expect(triage.querySelector('svg')).toBeNull();
    fireEvent.click(triage);
    expect(onAsk).toHaveBeenCalledWith(TRIAGE_ASK);
  });
});

describe('the header (D1 §D1.G step 1)', () => {
  it('says "none overdue" rather than counting zero, and closes with a D0 button', async () => {
    serve({ items: [task({}), task({ taskId: 'T-2', title: 'Write 3.2.P.8' })], overdue: 0 });
    render(<TaskTray onNav={vi.fn()} />);
    const panel = await openTray();
    await waitFor(() => expect(panel.querySelector('.tt-head-meta')?.textContent).toBe('2 assigned · none overdue'));
    expect(panel.querySelector('.tt-head b')?.textContent).toBe('Your work');
    const close = within(panel).getByRole('button', { name: 'Close' });
    expect(close.classList.contains('btn')).toBe(true);
  });

  it('still gives the number when something is late', async () => {
    serve({ items: [task({ overdue: true, dueDate: at(-3) })], overdue: 1 });
    render(<TaskTray onNav={vi.fn()} />);
    const panel = await openTray();
    await waitFor(() => expect(panel.querySelector('.tt-head-meta')?.textContent).toBe('1 assigned · 1 overdue'));
  });
});

describe('rows: colour only where something is late or blocked (D1 §D1.G step 3)', () => {
  const rowOf = (title: string) => screen.getByRole('button', { name: new RegExp(title) });
  const dotOf = (row: HTMLElement) => row.querySelector('.tt-dot') as HTMLElement;

  it('a row due in 14 days keeps its dot’s place but shows none; late and blocked rows keep theirs', () => {
    render(<OpenWorkGroups workLoading={false} assigned={[
      task({ taskId: 'calm', title: 'Calm row' }),
      task({ taskId: 'late', title: 'Late row', overdue: true, dueDate: at(-3) }),
      task({ taskId: 'held', title: 'Held row', blocked: true }),
    ]} queue={null} approvalRows={[]} go={vi.fn()} openTask={vi.fn()} />);

    const calm = rowOf('Calm row');
    expect(calm.textContent).toContain('due in 14d');
    expect(dotOf(calm)).toBeTruthy();
    expect(dotOf(calm).hasAttribute('data-quiet')).toBe(true);

    const late = rowOf('Late row');
    expect(late.textContent).toContain('overdue');
    expect(dotOf(late).hasAttribute('data-quiet')).toBe(false);
    expect(dotOf(late).classList.contains('tt-dot-err')).toBe(true);

    const held = rowOf('Held row');
    expect(held.textContent).toContain('blocked');
    expect(dotOf(held).hasAttribute('data-quiet')).toBe(false);
    expect(dotOf(held).classList.contains('tt-dot-warn')).toBe(true);
  });
});

describe('messages and alerts (D1 §D1.G step 4)', () => {
  const NOTICES = [
    { id: 1, category: 'general', severity: 'info', title: 'Routine notice', body: null, resource_type: 'document', resource_id: '41' },
    { id: 2, category: 'general', severity: 'warning', title: 'Warning notice', body: null },
    { id: 3, category: 'general', severity: 'critical', title: 'Critical notice', body: null },
  ];

  it('shows a severity dot only for a warning or a critical notice', async () => {
    serve({ items: [], overdue: 0 }, NOTICES);
    render(<TaskTray onNav={vi.fn()} />);
    await openTray();
    const dot = async (title: string) => ((await screen.findByText(title)).closest('.tt-notif')!.querySelector('.tt-dot') as HTMLElement);
    expect((await dot('Routine notice')).hasAttribute('data-quiet')).toBe(true);
    expect((await dot('Warning notice')).hasAttribute('data-quiet')).toBe(false);
    expect((await dot('Warning notice')).classList.contains('tt-dot-warn')).toBe(true);
    expect((await dot('Critical notice')).hasAttribute('data-quiet')).toBe(false);
    expect((await dot('Critical notice')).classList.contains('tt-dot-err')).toBe(true);
  });

  it('draws Mark read, the open button and the preferences button with D0’s buttons', async () => {
    serve({ items: [], overdue: 0 }, NOTICES.slice(0, 1));
    render(<TaskTray onNav={vi.fn()} />);
    const panel = await openTray();
    const classes = (el: HTMLElement) => el.className.split(/\s+/);
    const markRead = await within(panel).findByRole('button', { name: 'Mark "Routine notice" read' });
    expect(classes(markRead)).toEqual(expect.arrayContaining(['btn', 'small']));
    expect(markRead.getAttribute('title')).toBe('Mark read');
    const open = within(panel).getByRole('button', { name: 'Open linked record' });
    expect(classes(open)).toEqual(expect.arrayContaining(['btn', 'ghost', 'small']));
    const prefs = within(panel).getByRole('button', { name: 'Notification preferences' });
    expect(classes(prefs)).toEqual(expect.arrayContaining(['btn', 'small']));
    expect(classes(prefs)).not.toContain('ghost');
  });
});

/* ── The tray's rules in app-v2.css ─────────────────────────────────────── */

const APP = readFileSync(resolve(__dirname, '../styles/app-v2.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
/** Every innermost `selector { declarations }` whose selector names a `.tt-` class (media wrappers seen through). */
const TRAY_RULES = [...APP.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map((m) => ({ sel: m[1].trim().replace(/\s+/g, ' '), decls: m[2] }))
  .filter((r) => /\.tt-/.test(r.sel));
/** Every tray rule, the badge's included: D1-2 (§D1.B step 7) took it off orange and 10px. */
const OWN = TRAY_RULES;
const decl = (sel: string, prop: string) =>
  TRAY_RULES.filter((r) => r.sel.split(',').map((s) => s.trim()).includes(sel))
    .map((r) => new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(r.decls)?.[1]?.trim())
    .filter(Boolean) as string[];

/** A font-size in px: a literal, or a `var(--fs-…, Npx)` fallback, or the D0 token's value. */
const FS: Record<string, number> = { '--fs-caption': 12, '--fs-small': 13, '--fs-body': 14, '--fs-section': 15, '--fs-prose': 16 };
function px(value: string): number {
  const fallback = /var\((--fs-[\w-]+)\s*(?:,\s*([\d.]+)px)?\)/.exec(value);
  if (fallback) return fallback[2] ? Number(fallback[2]) : FS[fallback[1]];
  const lit = /([\d.]+)px/.exec(value);
  return lit ? Number(lit[1]) : NaN;
}

describe("the tray's rules (app-v2.css, D1 §D1.G step 5)", () => {
  it('finds the tray block', () => {
    expect(OWN.length).toBeGreaterThan(20);
  });

  it('uses orange only for the ✻', () => {
    const orange = OWN.filter((r) => /--accent/.test(r.decls) && r.sel !== '.c2c-v2 .tt-spark').map((r) => r.sel);
    expect(orange).toEqual([]);
    expect(decl('.c2c-v2 .tt-spark', 'color')).toEqual(['var(--accent-100)']);
  });

  it('sets no text under the 12px floor', () => {
    const small = OWN.flatMap((r) => [...r.decls.matchAll(/font-size\s*:\s*([^;]+)/g)]
      .filter((m) => !(px(m[1]) >= 12)).map((m) => `${r.sel} { font-size: ${m[1].trim()} }`));
    expect(small).toEqual([]);
  });

  it('keeps the group heads in sentence case and hides a quiet dot', () => {
    expect(decl('.c2c-v2 .tt-group-head', 'text-transform')).toEqual(['none']);
    expect(decl('.c2c-v2 .tt-dot[data-quiet]', 'visibility')).toEqual(['hidden']);
  });

  it('gives the panel title 16px and the counts line 13px', () => {
    expect(decl('.c2c-v2 .tt-head b', 'font-size')).toEqual(['16px']);
    expect(decl('.c2c-v2 .tt-head-meta', 'font-size')).toEqual(['var(--fs-small,13px)']);
  });
});
