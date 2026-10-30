// @vitest-environment jsdom
/**
 * UDI words a refusal by what it is, not as a failed read (D2, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/refusal-not-failed-read/).
 *
 * One read (GET /api/mdx/udi/summary?program_id=) feeds the screen's four
 * panels, so a refusal used to draw four "Could not load …" panels under a row
 * of zero counts. A refusal is now said once, as itself, and no figure is drawn
 * beside it. A genuine failure is still a failed read on each panel.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { UdiSurface } from '../UdiSurface';

vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 'test-token', getOrgId: () => '7' }));

const PROJECT = '11111111-1111-4111-8111-111111111111';
const SUMMARY = `/api/mdx/udi/summary?program_id=${PROJECT}`;
const LABEL = { id: 'lbl-1', device: 'Aurora pump', kind: 'IFU', region: 'US', lang: 'en', ver: '1', size: '—', status: 'draft', updated: '2026-10-01' };
const OK = { data: { devices: [], labels: [LABEL], symbols: [], issues: [], mri: [] }, meta: { scope: 'program' } };

type Answer = { status: number; body: unknown };
let answer: Answer;
const urls: string[] = [];
beforeEach(() => {
  urls.length = 0;
  answer = { status: 200, body: OK };
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    urls.push(String(input));
    const { status, body } = answer;
    return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body), json: async () => body };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const mount = () => render(<UdiSurface programId={PROJECT} onAskAna={() => {}} />);
const FAILED_READ = /could not load|couldn.t load|could not be read/i;

const REFUSALS: ReadonlyArray<[label: string, answer: Answer, words: string, retry: boolean]> = [
  ['a project the organization does not own (404)', { status: 404, body: { error: 'Project not found' } },
    'This project was not found in your organization, so the UDI and labeling record was not read.', false],
  ['an ownership check that could not run (503)', {
    status: 503, body: { success: false, error: 'VERIFICATION_UNAVAILABLE', message: 'The project ownership check could not be run.' },
  }, 'The check that this project belongs to your organization was unavailable, so the UDI and labeling record was not read.', true],
  ['the module gate (403 MODULE_NOT_LICENSED)', {
    status: 403, body: { error: 'Module access denied', code: 'MODULE_NOT_LICENSED', module: 'device-udi', modules: ['device-udi'] },
  }, 'This feature is not enabled for your organization, so the UDI and labeling record was not read.', false],
  ['launch scope (403 LAUNCH_SCOPE)', {
    status: 403, body: { error: { code: 'LAUNCH_SCOPE', message: 'This part of the product is not in this release.' } },
  }, 'This part of the product is not in this release, so the UDI and labeling record was not read.', false],
  ['a role refusal (403)', { status: 403, body: { error: 'Insufficient permissions' } },
    'Your role cannot do this, so the UDI and labeling record was not read.', false],
];

describe('UdiSurface — a refused read says why, once, and draws no figure', () => {
  for (const [label, a, words, retry] of REFUSALS) {
    it(`${label} is said as itself, not as a failed read`, async () => {
      answer = a;
      mount();
      const refused = await screen.findByTestId('udi-refused');
      expect(refused.textContent).toContain(words);
      expect(document.body.textContent).not.toMatch(FAILED_READ);
      expect(screen.queryAllByTestId('data-gate-error')).toEqual([]);
      /* No count is drawn beside a read that was refused. */
      expect(document.body.textContent).not.toMatch(/Documents in flight|Blocked documents|Awaiting signature/);
      expect(Boolean(screen.queryByRole('button', { name: /try again/i }))).toBe(retry);
    });
  }

  it('the check that could not run is tried again, and its answer is drawn', async () => {
    answer = { status: 503, body: { success: false, error: 'VERIFICATION_UNAVAILABLE', message: 'x' } };
    mount();
    await screen.findByTestId('udi-refused');
    answer = { status: 200, body: OK };
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(document.body.textContent).toContain('Aurora pump — IFU (en)'));
    expect(urls.filter((u) => u === SUMMARY).length).toBe(2);
    expect(screen.queryByTestId('udi-refused')).toBeNull();
  });

  it('a genuine failure (500) is still a failed read on the panels', async () => {
    answer = { status: 500, body: { error: 'Internal error' } };
    mount();
    await waitFor(() => expect(screen.getAllByTestId('data-gate-error').length).toBeGreaterThan(0));
    expect(screen.queryByTestId('udi-refused')).toBeNull();
    expect(document.body.textContent).toMatch(FAILED_READ);
  });
});
