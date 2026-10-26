// @vitest-environment jsdom
/**
 * Slice 0 of the placement map (.design/client-journey/INFORMATION_ARCHITECTURE.md,
 * the `device-presub` row): no commitments is not "all integrated".
 *
 * The KPI strip is derived from the /api/q-sub list (usePresub's deriveKpis).
 * With zero commitments across the list — an empty portfolio, or Q-Subs still
 * awaiting FDA before any commitment exists — "Pending rollin" read
 * "0 · All integrated" in green, saying commitments had been folded into the
 * dossier when none exist, and "Commitments rolled" read "0% · 0 of 0" in red,
 * a failure where nothing was assessed. Both now say nothing is recorded, with
 * no tone; with commitments on record the strip reads as before.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { PreSubManager } from '../PreSubManager';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const row = (over: Record<string, unknown>) => ({
  id: 'qs-1', qNumber: 'Q000001', type: 'presub', prog: 'DEV-1', progTitle: 'Device one',
  title: 'Biocompatibility strategy', stage: 'await', daysIn: 4, filed: '2026-09-01',
  targetDate: null, meeting: null, questions: 2, answered: 0, commitments: 0, rolledIn: 0,
  fdaTeam: 'OHT3', tone: '',
  ...over,
});

let rows: unknown[] = [];
beforeEach(() => {
  rows = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    text: async () => '',
    json: async () =>
      url === '/api/q-sub'
        ? { data: { rows, count: rows.length } }
        : { data: { id: 'qs-1', summary: 'Two questions.', questions: [], timeline: [] } },
  })));
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

const card = (container: HTMLElement, label: string) =>
  Array.from(container.querySelectorAll<HTMLElement>('.metric-card')).find(
    (c) => c.querySelector('.metric-label')?.textContent === label,
  );

describe('PreSubManager — no commitments recorded is neither integrated nor failed', () => {
  it('a Q-Sub with no commitments yet: no "All integrated", no green or red commitment card', async () => {
    rows = [row({ commitments: 0, rolledIn: 0 })];
    const { container } = render(<PreSubManager onAskAna={() => {}} />);
    await waitFor(() => expect(card(container, 'Pending rollin')).toBeTruthy());

    const rolled = card(container, 'Commitments rolled')!;
    const pending = card(container, 'Pending rollin')!;
    expect({
      rolled: [rolled.textContent, rolled.getAttribute('data-tone')],
      pending: [pending.textContent, pending.getAttribute('data-tone')],
    }).toEqual({
      rolled: ['Commitments rolled—No commitments recorded yet', ''],
      pending: ['Pending rollin—No commitments recorded yet', ''],
    });
    expect(screen.queryByText('All integrated')).toBeNull();
  });

  it('an empty portfolio says the same', async () => {
    rows = [];
    const { container } = render(<PreSubManager onAskAna={() => {}} />);
    await waitFor(() => expect(screen.getByText('No Q-Subs yet')).toBeTruthy());
    expect(screen.queryByText('All integrated')).toBeNull();
    expect(card(container, 'Commitments rolled')!.getAttribute('data-tone')).toBe('');
  });

  it('with commitments on record, the strip reads as before', async () => {
    rows = [row({ stage: 'feedback', commitments: 2, rolledIn: 1 })];
    const { container } = render(<PreSubManager onAskAna={() => {}} />);
    await waitFor(() => expect(card(container, 'Pending rollin')).toBeTruthy());
    const rolled = card(container, 'Commitments rolled')!;
    const pending = card(container, 'Pending rollin')!;
    expect(rolled.textContent).toBe('Commitments rolled50%1 of 2');
    expect(rolled.getAttribute('data-tone')).toBe('warn');
    expect(pending.textContent).toBe('Pending rollin1Open in dossier');
    expect(pending.getAttribute('data-tone')).toBe('warn');
  });

  it('every commitment rolled in still reads "All integrated"', async () => {
    rows = [row({ stage: 'feedback', commitments: 2, rolledIn: 2 })];
    const { container } = render(<PreSubManager onAskAna={() => {}} />);
    await waitFor(() => expect(card(container, 'Pending rollin')).toBeTruthy());
    expect(card(container, 'Pending rollin')!.textContent).toBe('Pending rollin0All integrated');
    expect(card(container, 'Pending rollin')!.getAttribute('data-tone')).toBe('ok');
  });
});
