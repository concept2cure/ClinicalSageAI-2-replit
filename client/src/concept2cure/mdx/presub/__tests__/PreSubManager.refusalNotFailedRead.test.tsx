// @vitest-environment jsdom
/**
 * Pre-Sub words a refusal by what it is, not as a failed read (D2, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/refusal-not-failed-read/).
 *
 * GET /api/q-sub?program_id= admits the project first (server/lib/admit-project.ts)
 * and sits behind the module gate. Every refusal it answers with was drawn as
 * "Could not load your Q-Submissions", the words for an outage. Each is now
 * said as itself, and only a genuine failure is still a failed read.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { PreSubManager } from '../PreSubManager';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const LIST = '/api/q-sub?program_id=p-1';
const ROW = {
  id: 'qs-1', qNumber: 'Q000001', type: 'presub', prog: 'DEV-1', progTitle: 'Device one',
  title: 'Biocompatibility strategy', stage: 'feedback', daysIn: 4, filed: '2026-09-01',
  targetDate: null, meeting: null, questions: 2, answered: 1, commitments: 0, rolledIn: 0,
  fdaTeam: 'OHT3', tone: '',
};

type Answer = { status: number; body: unknown };
let list: Answer;
let detail: Answer;
let fetchMock: ReturnType<typeof vi.fn>;
const reply = ({ status, body }: Answer) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
  json: async () => body,
});
beforeEach(() => {
  list = { status: 200, body: { data: { rows: [ROW], count: 1 } } };
  detail = { status: 200, body: { data: { id: 'qs-1', summary: '', questions: [], timeline: [] } } };
  fetchMock = vi.fn(async (url: string) => reply(url === LIST ? list : detail));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

const mount = () => render(<PreSubManager programId="p-1" onAskAna={() => {}} />);
const FAILED_READ = /could not load|couldn.t load|could not be read/i;

const REFUSALS: ReadonlyArray<[label: string, answer: Answer, words: string, retry: boolean]> = [
  ['a project the organization does not own (404)', { status: 404, body: { error: 'Project not found' } },
    'This project was not found in your organization, so the Q-Submission list was not read.', false],
  ['an ownership check that could not run (503)', {
    status: 503,
    body: { success: false, error: 'VERIFICATION_UNAVAILABLE', message: 'The project ownership check could not be run.' },
  }, 'The check that this project belongs to your organization was unavailable, so the Q-Submission list was not read.', true],
  ['the module gate (403 MODULE_NOT_LICENSED)', {
    status: 403,
    body: { error: 'Module access denied', code: 'MODULE_NOT_LICENSED', module: 'device-presub', modules: ['device-presub'] },
  }, 'This feature is not enabled for your organization, so the Q-Submission list was not read.', false],
  ['launch scope (403 LAUNCH_SCOPE)', {
    status: 403, body: { error: { code: 'LAUNCH_SCOPE', message: 'This part of the product is not in this release.' } },
  }, 'This part of the product is not in this release, so the Q-Submission list was not read.', false],
  ['a role refusal (403)', { status: 403, body: { error: 'Insufficient permissions' } },
    'Your role cannot do this, so the Q-Submission list was not read.', false],
  ['a signature the act requires (428)', { status: 428, body: { error: 'Signature required.' } },
    'This step needs your electronic signature, so the Q-Submission list was not read.', false],
];

describe('PreSubManager — the Q-Submission list says why it was not read', () => {
  for (const [label, answer, words, retry] of REFUSALS) {
    it(`${label} is said as itself, not as a failed read`, async () => {
      list = answer;
      mount();
      const refused = await screen.findByTestId('presub-list-refused');
      expect(refused.getAttribute('role')).toBe('alert');
      expect(refused.textContent).toContain(words);
      expect(refused.textContent).not.toMatch(FAILED_READ);
      expect(screen.queryByTestId('presub-list-error')).toBeNull();
      expect(screen.queryByText('No Q-Subs yet')).toBeNull();
      expect(screen.queryByText('No Q-Subs match these filters')).toBeNull();
      expect(Boolean(screen.queryByRole('button', { name: /try again/i }))).toBe(retry);
    });
  }

  it('the check that could not run is tried again, and its answer is drawn', async () => {
    list = { status: 503, body: { success: false, error: 'VERIFICATION_UNAVAILABLE', message: 'x' } };
    mount();
    await screen.findByTestId('presub-list-refused');
    list = { status: 200, body: { data: { rows: [ROW], count: 1 } } };
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(screen.queryByTestId('presub-list-refused')).toBeNull());
    expect(screen.getAllByText('Biocompatibility strategy').length).toBeGreaterThan(0);
  });

  it('a genuine failure (500) is still a failed read, with a retry', async () => {
    list = { status: 500, body: { error: 'Internal error' } };
    mount();
    const failed = await screen.findByTestId('presub-list-error');
    expect(failed.textContent).toMatch(FAILED_READ);
    expect(screen.queryByTestId('presub-list-refused')).toBeNull();
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
  });
});

describe('PreSubManager — a Q-Sub detail says why it was not read', () => {
  it('a Q-Sub not in this organization (404) is said as itself', async () => {
    detail = { status: 404, body: { error: 'Q-Sub not found' } };
    mount();
    const refused = await screen.findByTestId('presub-detail-refused');
    expect(refused.textContent).toContain("This Q-Sub was not found in your organization, so the Q-Sub's detail was not read.");
    expect(refused.textContent).not.toMatch(FAILED_READ);
    expect(screen.queryByTestId('presub-detail-error')).toBeNull();
  });

  it('the module gate (403 MODULE_NOT_LICENSED) is said as itself', async () => {
    detail = { status: 403, body: { error: 'Module access denied', code: 'MODULE_NOT_LICENSED' } };
    mount();
    const refused = await screen.findByTestId('presub-detail-refused');
    expect(refused.textContent).toContain("This feature is not enabled for your organization, so the Q-Sub's detail was not read.");
    expect(screen.queryByTestId('presub-detail-error')).toBeNull();
  });

  it('a genuine failure (500) is still a failed read', async () => {
    detail = { status: 500, body: { error: 'Internal error' } };
    mount();
    await screen.findByTestId('presub-detail-error');
    expect(screen.queryByTestId('presub-detail-refused')).toBeNull();
  });
});
