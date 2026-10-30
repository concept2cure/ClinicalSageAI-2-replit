// @vitest-environment jsdom
/**
 * Labeling words a refusal by what it is, not as a failed read (D2, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/refusal-not-failed-read/).
 *
 * GET /api/mdx/labeling?program_id= admits the project first and sits behind
 * the module gate; the symbol and translation reads refuse a document outside
 * the organization. Every refusal was drawn as "Couldn't load …", and AnA was
 * told the store had failed. Each is now said as itself; a genuine failure is
 * still a failed read.
 *
 * apiRequest is replaced by one that answers as the real one does: a non-OK
 * response is thrown as ApiRequestError with the message and code
 * extractApiError reads from the server's envelope.
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

import { Labeling } from '../surfaces/Labeling';
import { clearShellProject, publishShellProject } from '../shellProject';

const PROJECT = '0b6f1c1e-4d2a-4c55-9a1e-3f7b2d9c8e10';
const DOCS = `/api/mdx/labeling?program_id=${PROJECT}`;
const DOC = { id: 4, device_name: 'Aurora CGM', doc_kind: 'ifu', version: '3', organization_id: 7, program_id: PROJECT, status: 'draft', udi_di: null };

type Answer = { status: number; body: unknown };
const answers = new Map<string, Answer>();
const okData = (data: unknown): Answer => ({ status: 200, body: { data } });
beforeEach(() => {
  answers.clear();
  answers.set(DOCS, okData([DOC]));
  answers.set('/api/mdx/labeling/4/symbols', okData([]));
  answers.set('/api/mdx/labeling/4/translations', okData([]));
  published.current = null;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, rawPath: unknown) => {
    const { status, body } = answers.get(String(rawPath)) ?? okData([]);
    if (status >= 400) {
      const { message, code } = extractApiError(body, status);
      throw new ApiRequestError(message, status, body, code);
    }
    return { ok: true, status, json: async () => body } as Response;
  });
  publishShellProject({ id: PROJECT, title: 'Aurora' });
});
afterEach(() => { cleanup(); clearShellProject(); });

const mount = () => render(<Labeling {...({ onAsk: () => {}, onNav: vi.fn() } as unknown as React.ComponentProps<typeof Labeling>)} />);
const text = () => document.body.textContent ?? '';
const FAILED_READ = /could not load|couldn.t load|could not be read|couldn.t read/i;

const REFUSALS: ReadonlyArray<[label: string, answer: Answer, words: string, retry: boolean]> = [
  ['a project the organization does not own (404)', { status: 404, body: { error: 'Project not found' } },
    'This project was not found in your organization, so the labeling document was not read.', false],
  ['an ownership check that could not run (503)', {
    status: 503, body: { success: false, error: 'VERIFICATION_UNAVAILABLE', message: 'The project ownership check could not be run.' },
  }, 'The check that this project belongs to your organization was unavailable, so the labeling document was not read.', true],
  ['the module gate (403 MODULE_NOT_LICENSED)', {
    status: 403, body: { error: 'Module access denied', code: 'MODULE_NOT_LICENSED', module: 'labeling', modules: ['labeling'] },
  }, 'This feature is not enabled for your organization, so the labeling document was not read.', false],
  ['launch scope (403 LAUNCH_SCOPE)', {
    status: 403, body: { error: { code: 'LAUNCH_SCOPE', message: 'This part of the product is not in this release.' } },
  }, 'This part of the product is not in this release, so the labeling document was not read.', false],
  ['a role refusal (403)', { status: 403, body: { error: 'Insufficient permissions' } },
    'Your role cannot do this, so the labeling document was not read.', false],
  ['a signature the act requires (428)', { status: 428, body: { error: 'A signature is required.' } },
    'This step needs your electronic signature, so the labeling document was not read.', false],
];

describe('Labeling — the labeling document says why it was not read', () => {
  for (const [label, answer, words, retry] of REFUSALS) {
    it(`${label} is said as itself, to the reader and to AnA`, async () => {
      answers.set(DOCS, answer);
      mount();
      const refused = await screen.findByTestId('labeling-refused');
      expect(refused.getAttribute('role')).toBe('alert');
      expect(refused.textContent).toContain(words);
      expect(text()).not.toMatch(FAILED_READ);
      expect(text()).not.toMatch(/No labeling document yet/);
      expect(Boolean(screen.queryByRole('button', { name: /try again/i }))).toBe(retry);
      expect(published.current?.summary ?? '').toContain(words);
      expect(published.current?.summary ?? '').not.toMatch(/because of a failure|could not be read/);
    });
  }

  it('the check that could not run is tried again, and its answer is drawn', async () => {
    answers.set(DOCS, { status: 503, body: { success: false, error: 'VERIFICATION_UNAVAILABLE', message: 'x' } });
    mount();
    await screen.findByTestId('labeling-refused');
    answers.set(DOCS, okData([DOC]));
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(text()).toMatch(/Instructions for use v3/));
    expect(screen.queryByTestId('labeling-refused')).toBeNull();
  });

  it('a genuine failure (500) is still a failed read', async () => {
    answers.set(DOCS, { status: 500, body: { error: 'Internal error' } });
    mount();
    await waitFor(() => expect(text()).toMatch(/Couldn't load the labeling document/));
    expect(screen.queryByTestId('labeling-refused')).toBeNull();
    expect(published.current?.summary ?? '').toMatch(/because of a failure/);
  });
});

describe('Labeling — the symbol and translation reads say why they were not read', () => {
  it('a document not in this organization (404) is said as itself on both panels', async () => {
    answers.set('/api/mdx/labeling/4/symbols', { status: 404, body: { error: 'Labeling document not found' } });
    answers.set('/api/mdx/labeling/4/translations', { status: 404, body: { error: 'Labeling document not found' } });
    mount();
    const symbols = await screen.findByTestId('labeling-symbols-refused');
    expect(symbols.textContent).toContain('This labeling document was not found in your organization, so the symbol glossary was not read.');
    const translations = await screen.findByTestId('labeling-translations-refused');
    expect(translations.textContent).toContain('This labeling document was not found in your organization, so the translation set was not read.');
    expect(text()).toContain("This labeling document was not found in your organization, so this label's translation coverage was not read.");
    expect(text()).not.toMatch(FAILED_READ);
  });

  it('the module gate (403 MODULE_NOT_LICENSED) on the translations is said as itself', async () => {
    answers.set('/api/mdx/labeling/4/translations', { status: 403, body: { error: 'Module access denied', code: 'MODULE_NOT_LICENSED' } });
    mount();
    const translations = await screen.findByTestId('labeling-translations-refused');
    expect(translations.textContent).toContain('This feature is not enabled for your organization, so the translation set was not read.');
    expect(text()).not.toMatch(/Couldn't load translations|Couldn't read this label's translation coverage/);
  });

  it('a genuine failure (500) of the translations is still a failed read', async () => {
    answers.set('/api/mdx/labeling/4/translations', { status: 500, body: { error: 'boom' } });
    mount();
    await waitFor(() => expect(text()).toMatch(/Couldn't load translations/));
    expect(text()).toMatch(/Couldn't read this label's translation coverage/);
    expect(screen.queryByTestId('labeling-translations-refused')).toBeNull();
  });
});
