// @vitest-environment jsdom
/**
 * Slice 0 of the placement map (.design/client-journey/INFORMATION_ARCHITECTURE.md,
 * the `device-presub` row): the detail pane shows the selected Q-Sub's record
 * and no other.
 *
 * `<PreSubDetail row={sel} />` had no key, so its `usePresubDetail` survived a
 * row change, and `useFetchJson` keeps the previous body while the next URL
 * loads. PreSubDetail checked only `!detail`, so clicking Q-Sub B while A was
 * open drew B's title, Q-number and stage strip over A's summary, A's questions
 * and A's FDA responses until B's read returned: the agency's answer to one
 * submission under another submission's name.
 *
 * The same hook drew one more frame that was neither: the render before its
 * fetch effect runs (no detail, not loading, no error), which fell to the
 * "Package in draft" empty state. The last two cases pin the hook's contract
 * with an id, whoever keys its caller: every render is pending, that id's
 * record, or a failure.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent, act } from '@testing-library/react';
import { PreSubManager } from '../PreSubManager';
import { usePresubDetail } from '../../hooks/usePresub';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const row = (id: string, qNumber: string, title: string) => ({
  id, qNumber, type: 'presub', prog: 'DEV-1', progTitle: 'Device one',
  title, stage: 'feedback', daysIn: 4, filed: '2026-09-01',
  targetDate: null, meeting: null, questions: 1, answered: 1, commitments: 0, rolledIn: 0,
  fdaTeam: 'OHT3', tone: '',
});
const ROW_A = row('qs-a', 'Q000001', 'Alpha');
const ROW_B = row('qs-b', 'Q000002', 'Beta');

const detail = (id: string, tag: string) => ({
  id,
  summary: `Summary of ${tag}`,
  questions: [{
    id: `${id}-q1`, n: 1, question: `${tag} question`, ourPosition: `${tag} position`,
    fdaResponse: `FDA said yes to ${tag}`, status: 'answered', commitments: [],
  }],
  timeline: [],
});
const DETAIL_A = detail('qs-a', 'ALPHA');
const DETAIL_B = detail('qs-b', 'BETA');

const ok = (body: unknown) => ({ ok: true, status: 200, text: async () => '', json: async () => body });

/* B's read is held until the test releases it. */
let releaseB: () => void = () => {};
beforeEach(() => {
  const heldB = new Promise<void>((resolve) => { releaseB = resolve; });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/q-sub?program_id=p-1') return ok({ data: { rows: [ROW_A, ROW_B], count: 2 } });
    if (url === '/api/q-sub/qs-a') return ok({ data: DETAIL_A });
    if (url === '/api/q-sub/qs-b') { await heldB; return ok({ data: DETAIL_B }); }
    throw new Error(`unexpected fetch ${url}`);
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

const detailTitle = (container: HTMLElement) =>
  container.querySelector('.ps-detail-title')?.textContent ?? null;

describe('PreSubManager — the detail pane shows the selected Q-Sub and no other', () => {
  it("while B's read is pending, B's header is not drawn over A's summary or A's FDA response", async () => {
    const { container } = render(<PreSubManager programId="p-1" onAskAna={() => {}} />);
    await waitFor(() => expect(screen.getByText('FDA said yes to ALPHA')).toBeTruthy());
    expect(detailTitle(container)).toBe('Alpha');

    const rowB = Array.from(container.querySelectorAll<HTMLButtonElement>('button.ps-row'))
      .find((b) => (b.textContent ?? '').includes('Beta'))!;
    fireEvent.click(rowB);

    await waitFor(() => expect(detailTitle(container)).toBe('Beta'));
    const pane = container.querySelector('.ps-detail')!.textContent ?? '';
    for (const alpha of ['Summary of ALPHA', 'ALPHA question', 'ALPHA position', 'FDA said yes to ALPHA']) {
      expect(pane).not.toContain(alpha);
    }
    expect(screen.getByText('Loading Q-Sub detail')).toBeTruthy();

    // And once B's read lands, B's own record is what is shown.
    await act(async () => { releaseB(); });
    await waitFor(() => expect(screen.getByText('FDA said yes to BETA')).toBeTruthy());
    expect(screen.getByText('Summary of BETA')).toBeTruthy();
    expect(container.textContent).not.toContain('ALPHA');
  });
});

describe('usePresubDetail — with an id, every render is pending, delivered or failed', () => {
  it('never reports no detail, not loading and no error (the frame that read "Package in draft")', async () => {
    const seen: Array<{ detail: boolean; loading: boolean; error: string | null }> = [];
    function Probe() {
      const r = usePresubDetail('qs-a');
      seen.push({ detail: r.detail !== null, loading: r.loading, error: r.error });
      return null;
    }
    render(<Probe />);
    await waitFor(() => expect(seen[seen.length - 1].detail).toBe(true));
    expect(seen.filter((s) => !s.detail && !s.loading && s.error === null)).toEqual([]);
  });

  it("never hands back the previous id's record for a new id, whoever keys the caller", async () => {
    const seen: Array<{ id: string; summary: string | null; loading: boolean }> = [];
    function Probe({ id }: { id: string }) {
      const r = usePresubDetail(id);
      seen.push({ id, summary: r.detail?.summary ?? null, loading: r.loading });
      return null;
    }
    const { rerender } = render(<Probe id="qs-a" />);
    await waitFor(() => expect(seen[seen.length - 1].summary).toBe('Summary of ALPHA'));
    rerender(<Probe id="qs-b" />);
    await waitFor(() => expect(seen[seen.length - 1].id).toBe('qs-b'));
    expect(seen.filter((s) => s.id === 'qs-b' && s.summary === 'Summary of ALPHA')).toEqual([]);
    expect(seen[seen.length - 1].loading).toBe(true);
    await act(async () => { releaseB(); });
    await waitFor(() => expect(seen[seen.length - 1].summary).toBe('Summary of BETA'));
  });
});
