// @vitest-environment jsdom
/**
 * Slice 0 of the placement map (.design/client-journey/INFORMATION_ARCHITECTURE.md,
 * the `device-presub` row): a filter named "Mine" must filter on ownership.
 *
 * "Mine" was `['BX-204', 'OR-801'].includes(r.prog)` — two program codes from
 * the UI kit's demo data (the kit was ported with it in 4dc35f5d9), not an
 * owner. The /api/q-sub list row carries no owner or assignee. So for a real
 * tenant "Mine" emptied the list and said "No Q-Subs match these filters ·
 * Clear filters to see the full portfolio" while the user had Q-Subs, and a
 * tenant that happened to hold one of those codes saw them labelled as theirs.
 * The control is not offered until the list carries an owner (slice 12 lists
 * this screen's project scoping); the type and stage filters are unchanged.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { PreSubManager } from '../PreSubManager';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const row = (over: Record<string, unknown>) => ({
  id: 'qs-1', qNumber: 'Q000001', type: 'presub', prog: 'DEV-1', progTitle: 'Device one',
  title: 'Biocompatibility strategy', stage: 'await', daysIn: 4, filed: '2026-09-01',
  targetDate: null, meeting: null, questions: 1, answered: 0, commitments: 0, rolledIn: 0,
  fdaTeam: 'OHT3', tone: '',
  ...over,
});

const ROWS = [
  row({ id: 'qs-1', title: 'Biocompatibility strategy', prog: 'DEV-1', type: 'presub' }),
  row({ id: 'qs-2', title: 'Shelf-life question', prog: 'BX-204', type: 'info' }),
];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    text: async () => '',
    json: async () =>
      url === '/api/q-sub?program_id=p-1'
        ? { data: { rows: ROWS, count: ROWS.length } }
        : { data: { id: 'qs-1', summary: 'One question.', questions: [], timeline: [] } },
  })));
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

const listTitles = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('.ps-row .ps-row-title')).map((n) => n.textContent);

describe('PreSubManager — no "Mine" filter without an owner to filter on', () => {
  it('does not offer "Mine", which matched two demo program codes', async () => {
    const { container } = render(<PreSubManager programId="p-1" onAskAna={() => {}} />);
    await waitFor(() => expect(listTitles(container)).toHaveLength(2));
    // Where it is offered, record what it claimed: the demo-code row as "mine".
    const mine = screen.queryByRole('button', { name: 'Mine' });
    if (mine) fireEvent.click(mine);
    expect({ mineOffered: mine !== null, listed: listTitles(container) }).toEqual({
      mineOffered: false,
      listed: ['Biocompatibility strategy', 'Shelf-life question'],
    });
  });

  it('keeps the type filters, which filter on a field the list carries', async () => {
    const { container } = render(<PreSubManager programId="p-1" onAskAna={() => {}} />);
    await waitFor(() => expect(listTitles(container)).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Informational' }));
    expect(listTitles(container)).toEqual(['Shelf-life question']);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(listTitles(container)).toHaveLength(2);
  });
});
