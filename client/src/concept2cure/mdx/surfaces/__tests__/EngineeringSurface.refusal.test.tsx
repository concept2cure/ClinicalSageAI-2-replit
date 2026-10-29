// @vitest-environment jsdom
/**
 * The engineering screen puts the route's two refusals into words.
 *
 * GET /api/mdx/engineering/:programId admits the project through
 * server/lib/admit-project.ts (ad0b119b):
 *   - 404 {"error":"Project not found"}: this organization does not own it;
 *   - 503 {"error":"VERIFICATION_UNAVAILABLE", …}: the ownership check could
 *     not run.
 * Either way the route reads nothing. The screen drew every panel's
 * "Could not load …" with "Try again", and said neither fact. A retry cannot
 * change a 404.
 *
 * Every other failure is still a failed read, panel by panel.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, fireEvent, screen } from '@testing-library/react';
import { EngineeringSurface } from '../EngineeringSurface';
import { projectRefusalOf } from '../../hooks/useEngineering';
import { OPEN_PROGRAM_EVENT } from '../../../v2/programAction';
import type { Program } from '../../data/programs';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const PROGRAM = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  title: 'ENG-1 Sensor',
  code: 'ENG-1',
} as unknown as Program;

/* The two bodies admit-project.ts sends: notFoundInTenant(res, 'Project') and
   respondVerificationUnavailable(res, log, 'The project ownership check', err). */
const NOT_OWNED = { error: 'Project not found' };
const UNCHECKED = {
  success: false,
  error: 'VERIFICATION_UNAVAILABLE',
  message:
    'The project ownership check could not be run. This is not a verdict: nothing was verified and nothing failed verification. Quote the reference below if you contact support.',
  correlationId: 'req-7f3a9c',
};

const EMPTY_DATA = {
  summary: { dhfCompletion: 0, openEcrs: 0, openRisks: 0, openIssues: 0, riskLastUpdated: null },
  dhf: [], trace: [], risks: [], ecrs: [], issues: [], documents: [],
};

const answer = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); cleanup(); });

function mount() {
  return render(<EngineeringSurface program={PROGRAM} onAskAna={() => {}} onOpenEditor={() => {}} />);
}

async function settled(c: HTMLElement) {
  await waitFor(() => expect(c.textContent ?? '').not.toMatch(/Loading/i));
}

/** Nothing on screen may read as a panel, an empty result or the transport line. */
function noPanelsAndNoTransport(c: HTMLElement) {
  const text = c.textContent ?? '';
  expect(text, 'the transport line').not.toMatch(/HTTP \d{3}/);
  expect(text, 'the JSON body').not.toMatch(/[{}"]|VERIFICATION_UNAVAILABLE|Project not found/);
  expect(text, 'a panel failure per panel').not.toMatch(/Could not load/);
  expect(c.querySelector('[data-testid="data-gate-empty"]'), 'an empty panel').toBeNull();
  expect(c.querySelector('[data-testid="data-gate-error"]'), 'a failed panel').toBeNull();
  expect(c.querySelector('[data-testid="eng-no-blockers"]'), 'a blocker verdict').toBeNull();
  expect(c.querySelector('.metrics-row'), 'the metric cards').toBeNull();
  expect(text, 'the blocker section').not.toMatch(/What.s blocking your documents/);
  expect(text, 'the awareness section').not.toMatch(/Situational awareness/);
}

describe('EngineeringSurface — the route refuses the project', () => {
  it('a 404 says the project is not one this organization can see, and offers another project, not a retry', async () => {
    fetchMock.mockResolvedValue(answer(404, NOT_OWNED));
    const { container } = mount();
    await settled(container);

    expect(container.textContent, 'what the screen says').toContain("This project isn't one this organization can see");
    const refusal = screen.getByTestId('eng-project-refused');
    expect(refusal.getAttribute('role')).toBe('alert');
    expect(refusal.textContent).toContain('Nothing was read for it, so no engineering record is shown.');
    expect(screen.queryByRole('button', { name: 'Try again' }), 'a retry cannot change a 404').toBeNull();
    noPanelsAndNoTransport(container);

    const opened = vi.fn();
    window.addEventListener(OPEN_PROGRAM_EVENT, opened);
    fireEvent.click(screen.getByRole('button', { name: 'Choose or create a project' }));
    window.removeEventListener(OPEN_PROGRAM_EVENT, opened);
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('a 503 says the project could not be checked, so nothing was shown, and the retry reads again', async () => {
    fetchMock.mockResolvedValueOnce(answer(503, UNCHECKED)).mockResolvedValue(answer(200, { data: EMPTY_DATA, meta: { unavailable: [] } }));
    const { container } = mount();
    await settled(container);

    expect(container.textContent, 'what the screen says').toContain("This project couldn't be checked, so nothing was shown");
    const refusal = screen.getByTestId('eng-project-refused');
    expect(refusal.getAttribute('role')).toBe('alert');
    expect(refusal.textContent).toContain(
      'Whether this organization can see the project could not be checked, so no engineering record was read. This says nothing about the project.',
    );
    noPanelsAndNoTransport(container);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByTestId('eng-project-refused')).toBeNull());
    expect(container.textContent).toMatch(/What.s blocking your documents/);
  });

  it('any other failure is still a failed read on each panel, never the ownership words', async () => {
    fetchMock.mockResolvedValue(answer(503, { error: 'SERVICE_UNAVAILABLE' }));
    const { container } = mount();
    await settled(container);

    expect(screen.queryByTestId('eng-project-refused')).toBeNull();
    expect(container.textContent).toContain('Could not load engineering metrics');
    expect(container.textContent).not.toMatch(/organization can see|couldn.t be checked/);
    expect(container.querySelector('[data-testid="data-gate-empty"]'), 'a failure drawn as empty').toBeNull();
  });
});

describe('projectRefusalOf — the two answers admit-project.ts gives, from useFetchJson\'s line', () => {
  const line = (status: number, body: unknown) => `HTTP ${status}: ${JSON.stringify(body).slice(0, 200)}`;

  it('reads the 404 and the 503 by their bodies', () => {
    expect(projectRefusalOf(line(404, NOT_OWNED))).toBe('not-visible');
    expect(projectRefusalOf(line(503, UNCHECKED))).toBe('unchecked');
  });

  it('is null for every other failure, including a 404 or 503 that is not the ownership answer', () => {
    expect(projectRefusalOf(null)).toBeNull();
    expect(projectRefusalOf('')).toBeNull();
    expect(projectRefusalOf('HTTP 404')).toBeNull();
    expect(projectRefusalOf(line(404, { error: 'Not found' }))).toBeNull();
    expect(projectRefusalOf(line(503, { error: 'SERVICE_UNAVAILABLE' }))).toBeNull();
    expect(projectRefusalOf(line(500, NOT_OWNED))).toBeNull();
    expect(projectRefusalOf(line(500, UNCHECKED))).toBeNull();
    expect(projectRefusalOf('Failed to fetch')).toBeNull();
  });
});
