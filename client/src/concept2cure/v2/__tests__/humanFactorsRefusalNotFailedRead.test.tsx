// @vitest-environment jsdom
/**
 * Human factors words a refusal by what it is, not as a failed read (D2,
 * 2026-10-29; docs/evidence/D2-ONE-ANA/2026-10-29/refusal-not-failed-read/).
 *
 * GET /api/human-factors?program_id= (server/routes/human-factors.ts) answers
 * 403 ORG_REQUIRED when it cannot confirm the organization, admits the project
 * first (404 / 503 VERIFICATION_UNAVAILABLE), and sits behind the module gate.
 * Every refusal was drawn as "Couldn't load the HFE/UE file", and AnA was told
 * the store had failed. Each is now said as itself; a genuine failure is still
 * a failed read.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiRequestError, extractApiError } from '@/lib/queryClient';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
type Published = { summary?: string };
const published = vi.hoisted(() => ({ current: null as null | Published }));
vi.mock('../surfaceContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../surfaceContext')>()),
  usePublishSurfaceContext: (_id: string, ctx: Published) => { published.current = ctx; },
}));

import { HumanFactors } from '../surfaces/HumanFactors';
import { clearShellProject, publishShellProject } from '../shellProject';

const PROJECT = '0b6f1c1e-4d2a-4c55-9a1e-3f7b2d9c8e10';
const READ = `/api/human-factors?program_id=${PROJECT}`;
const FILE = {
  data: { device: 'BX-204 CGM', framework: 'IEC 62366-1', present: {}, scenarios: [] },
  meta: { count: 0, source: 'hf_engineering_files', scope: 'program', programId: PROJECT },
};

type Answer = { status: number; body: unknown };
let answer: Answer;
beforeEach(() => {
  answer = { status: 200, body: FILE };
  published.current = null;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method !== 'GET' || path !== READ) return { ok: true, status: 200, json: async () => ({ data: null }) };
    const { status, body } = answer;
    if (status >= 400) {
      const { message, code } = extractApiError(body, status);
      throw new ApiRequestError(message, status, body, code);
    }
    return { ok: true, status, json: async () => body };
  });
  publishShellProject({ id: PROJECT, title: 'Aurora' });
});
afterEach(() => { cleanup(); clearShellProject(); });

const mount = () => render(<HumanFactors {...({ onAsk: vi.fn(), onNav: vi.fn() } as unknown as React.ComponentProps<typeof HumanFactors>)} />);
const text = () => document.body.textContent ?? '';
const FAILED_READ = /could not load|couldn.t load|could not be read/i;

const REFUSALS: ReadonlyArray<[label: string, answer: Answer, words: string, retry: boolean]> = [
  ['a project the organization does not own (404)', { status: 404, body: { error: 'Project not found' } },
    'This project was not found in your organization, so the HFE/UE file was not read.', false],
  ['an ownership check that could not run (503)', {
    status: 503, body: { success: false, error: 'VERIFICATION_UNAVAILABLE', message: 'The project ownership check could not be run.' },
  }, 'The check that this project belongs to your organization was unavailable, so the HFE/UE file was not read.', true],
  ['the module gate (403 MODULE_NOT_LICENSED)', {
    status: 403, body: { error: 'Module access denied', code: 'MODULE_NOT_LICENSED', module: 'human-factors', modules: ['human-factors'] },
  }, 'This feature is not enabled for your organization, so the HFE/UE file was not read.', false],
  ['launch scope (403 LAUNCH_SCOPE)', {
    status: 403, body: { error: { code: 'LAUNCH_SCOPE', message: 'This part of the product is not in this release.' } },
  }, 'This part of the product is not in this release, so the HFE/UE file was not read.', false],
  ['an organization the route could not confirm (403 ORG_REQUIRED)', {
    status: 403, body: { error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } },
  }, 'Your organization could not be confirmed, so the HFE/UE file was not read.', false],
  ['a role refusal (403)', { status: 403, body: { error: 'Insufficient permissions' } },
    'Your role cannot do this, so the HFE/UE file was not read.', false],
  ['a signature the act requires (428)', { status: 428, body: { error: 'A signature is required.' } },
    'This step needs your electronic signature, so the HFE/UE file was not read.', false],
];

describe('HumanFactors — the HFE/UE file says why it was not read', () => {
  for (const [label, a, words, retry] of REFUSALS) {
    it(`${label} is said as itself, to the reader and to AnA`, async () => {
      answer = a;
      mount();
      const refused = await screen.findByTestId('hf-refused');
      expect(refused.getAttribute('role')).toBe('alert');
      expect(refused.textContent).toContain(words);
      expect(text()).not.toMatch(FAILED_READ);
      expect(text()).not.toMatch(/No HFE\/UE file yet|critical-task gate/i);
      expect(Boolean(screen.queryByRole('button', { name: /try again/i }))).toBe(retry);
      expect(published.current?.summary ?? '').toContain(words);
      expect(published.current?.summary ?? '').not.toMatch(/because of a failure|could not be read/);
    });
  }

  it('the check that could not run is tried again, and its answer is drawn', async () => {
    answer = { status: 503, body: { success: false, error: 'VERIFICATION_UNAVAILABLE', message: 'x' } };
    mount();
    await screen.findByTestId('hf-refused');
    answer = { status: 200, body: FILE };
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(text()).toMatch(/complete against IEC 62366-1/));
    expect(screen.queryByTestId('hf-refused')).toBeNull();
  });

  it('a genuine failure (500) is still a failed read', async () => {
    answer = { status: 500, body: { error: { code: 'INTERNAL', message: 'Failed to read the HFE/UE file.' } } };
    mount();
    await waitFor(() => expect(text()).toMatch(/Couldn't load the HFE\/UE file/));
    expect(screen.queryByTestId('hf-refused')).toBeNull();
    expect(published.current?.summary ?? '').toMatch(/because of a failure/);
  });
});
