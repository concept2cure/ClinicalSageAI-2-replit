// @vitest-environment jsdom
/**
 * Slice 0 of the placement map (.design/client-journey/INFORMATION_ARCHITECTURE.md,
 * the `device-presub` row): a Q-Sub detail the client cannot read is a failed
 * read, never a filing status.
 *
 * `usePresubDetail` had no shape check, unlike the list beside it. A 200 whose
 * body was not `{ data: { … } }` gave no detail, no error and no loading, and
 * the pane fell to "Package in draft — The question list and the FDA response
 * appear here once the Q-Sub is filed": a status the code did not know, about a
 * Q-Sub that may be in Feedback. A body whose `data` was a list or an empty
 * object was drawn as a Q-Sub with no questions. The server sends neither:
 * `getQSubDetail` returns the record (a Q-Sub in Planning has `questions: []`)
 * or the route answers 404, which is the error branch.
 *
 * A Q-Sub with no questions on record is a real answer, and says so.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { PreSubManager } from '../PreSubManager';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const ROW = {
  id: 'qs-1', qNumber: 'Q000001', type: 'presub', prog: 'DEV-1', progTitle: 'Device one',
  title: 'Biocompatibility strategy', stage: 'feedback', daysIn: 4, filed: '2026-09-01',
  targetDate: null, meeting: null, questions: 2, answered: 1, commitments: 0, rolledIn: 0,
  fdaTeam: 'OHT3', tone: '',
};

let detailBody: unknown;
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => (url === '/api/q-sub?program_id=p-1' ? { data: { rows: [ROW], count: 1 } } : detailBody),
  })));
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

const UNREADABLE: ReadonlyArray<[label: string, body: unknown]> = [
  ['an envelope with no payload', {}],
  ['an explicit null payload', { data: null }],
  ['a list where the record was expected', { data: [] }],
  ['a record with no questions or timeline field', { data: {} }],
  ['a JSON null body', null],
];

describe('PreSubManager — an unreadable Q-Sub detail is a failed read', () => {
  for (const [label, body] of UNREADABLE) {
    it(`reports ${label} as a failure with a retry, not as a draft or an empty Q-Sub`, async () => {
      detailBody = body;
      const { container } = render(<PreSubManager programId="p-1" onAskAna={() => {}} />);
      await waitFor(() => expect(screen.getByTestId('presub-detail-error')).toBeTruthy());
      expect(screen.getByRole('button', { name: /try again|retry/i })).toBeTruthy();
      const text = container.textContent ?? '';
      expect(text).not.toContain('Package in draft');
      expect(text).not.toContain('once the Q-Sub is filed');
      expect(container.querySelector('.ps-tabs')).toBeNull();
    });
  }
});

describe('PreSubManager — a Q-Sub with no questions on record says so', () => {
  it('draws the record with an empty question list that is named, not blank', async () => {
    detailBody = { data: { id: 'qs-1', summary: '', questions: [], timeline: [] } };
    const { container } = render(<PreSubManager programId="p-1" onAskAna={() => {}} />);
    await waitFor(() => expect(container.querySelector('.ps-tabs')).toBeTruthy());
    expect(screen.queryByTestId('presub-detail-error')).toBeNull();
    expect(screen.getByText('No questions recorded')).toBeTruthy();
    expect(container.textContent).not.toContain('Package in draft');
  });
});
