// @vitest-environment jsdom
/**
 * The Q-Submission manager reports FDA's side of a conversation, so it may
 * only report what /api/q-sub returned.
 *
 * PRESUB_LIST, PRESUB_KPIS and PRESUB_DETAIL invented that conversation:
 * Q-numbers in the agency's own format, a named FDA reviewer, a confirmed
 * teleconference, counts of questions FDA had answered and commitments it had
 * made, and — in PRESUB_DETAIL — sentences attributed to the agency ("FDA
 * agrees K212284 is appropriate as the primary predicate"). The manager showed
 * the list with no sample banner at all.
 *
 * Removing them exposed the list's single empty state, "No Q-Subs match these
 * filters · Clear filters to see the full portfolio", which was reachable only
 * through a filter while a fixture guaranteed rows. Without one it became the
 * reading for a failed read and for an empty portfolio too — advice that cannot
 * help either. The three are different facts; these cases pin that they stay
 * different, including the one where the old sentence is still right.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { PreSubManager } from '../PreSubManager';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

function respond(body: unknown | null) {
  fetchMock.mockImplementation(async () =>
    body === null
      ? { ok: false, status: 503, text: async () => 'upstream unavailable', json: async () => ({}) }
      : { ok: true, status: 200, text: async () => '', json: async () => body },
  );
}

const mount = () => render(<PreSubManager onAskAna={() => {}} />);

describe('PreSubManager — a failed read, an empty portfolio and a filter are three facts', () => {
  it('reports a FAILED read as a failure, never as a filter mismatch', async () => {
    respond(null);
    mount();
    await waitFor(() => expect(screen.getByTestId('presub-list-error')).toBeTruthy());
    expect(screen.queryByText('No Q-Subs match these filters')).toBeNull();
    expect(screen.queryByText('Clear filters to see the full portfolio.')).toBeNull();
  });

  it('says an empty portfolio is empty, and does not tell the user to clear filters', async () => {
    respond({ data: { rows: [], count: 0 } });
    mount();
    await waitFor(() => expect(screen.getByText('No Q-Subs yet')).toBeTruthy());
    expect(screen.queryByText('Clear filters to see the full portfolio.')).toBeNull();
    expect(screen.queryByTestId('presub-list-error')).toBeNull();
  });

  it('renders no Q-number, FDA reviewer or agency statement the read did not return', async () => {
    respond({ data: { rows: [], count: 0 } });
    const { container } = mount();
    await waitFor(() => expect(screen.getByText('No Q-Subs yet')).toBeTruthy());
    const text = container.textContent ?? '';
    for (const invented of ['Q251142', 'Q250987', 'Dr. K. Patel', 'OHT2', 'FDA agrees']) {
      expect(text).not.toContain(invented);
    }
  });
});

describe('PreSubManager — an unreadable body is not a pending one', () => {
  it('reports a 200 it cannot read as a failure, instead of loading forever', async () => {
    respond({ data: [] });
    mount();
    await waitFor(() => expect(screen.getByTestId('presub-list-error')).toBeTruthy());
    expect(screen.queryByTestId('presub-list-loading')).toBeNull();
  });
});

describe('the Q-Sub data module records no agency interaction', () => {
  it('exports the program structure and nothing about any submission', async () => {
    const mod = await import('../../data/presub');
    const exported = Object.keys(mod);
    for (const gone of ['PRESUB_LIST', 'PRESUB_KPIS', 'PRESUB_DETAIL']) {
      expect(exported).not.toContain(gone);
    }
    expect(exported).toContain('PRESUB_TYPES');
    expect(exported).toContain('PRESUB_STAGES');
  });
});
