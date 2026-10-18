// @vitest-environment jsdom
/**
 * The Module 2.6 builder shows §2.6.1 as not assessed, in words, with the reason.
 *
 * GET /api/nonclinical-summary used to report §2.6.1 Introduction 'complete'
 * for every organization (server m26-m4-view.ts: `intro: true, // 2.6.1 is
 * always renderable boilerplate`), and this panel rendered a green "complete"
 * chip for a section nobody had written. The projection now reports
 * 'not_assessed' with a note saying what was not assessed. This pins that the
 * surface renders that state as "not assessed" (not the raw token), keeps the
 * note, and does not list the section among those to draft as "not written".
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Nonclinical } from '../surfaces/Nonclinical';

const ok = (body: unknown) => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const INTRO_NOTE = 'Not assessed: the study registry does not record whether the 2.6.1 introduction (product, pharmacologic class, mechanism, indication) has been written.';
const SUMMARY = {
  m26: [
    { n: '2.6.1', l: 'Introduction', st: 'not_assessed', note: INTRO_NOTE },
    { n: '2.6.2', l: 'Pharmacology written summary', st: 'missing', note: 'No pharmacology / safety-pharmacology study in the registry.' },
  ],
  m4: [],
  send: { inScope: 0, validated: 0, missingDomains: [], risk: 'none' },
  completeness: 0,
  gaps: [],
  provisioned: true,
};

const props = () => ({
  surface: { id: 'nonclinical' } as never,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/nonclinical/studies') return ok([]) as unknown as Response;
    if (method === 'GET' && url === '/api/nonclinical-summary') return ok({ data: SUMMARY }) as unknown as Response;
    return ok({ data: null }) as unknown as Response;
  });
});
afterEach(() => cleanup());

describe('Nonclinical — §2.6.1 Introduction', () => {
  it('reads "not assessed" with its reason, never the raw token or "complete"', async () => {
    render(<Nonclinical {...props()} />);
    const row = (await screen.findByText('2.6.1')).closest('button');
    expect(row?.textContent, 'the 2.6.1 chip must say what the state is, in words').toMatch(/not assessed$/);
    expect(row?.textContent).not.toMatch(/not_assessed|complete/);
    expect(row?.textContent).toContain(INTRO_NOTE);
    expect(document.body.textContent).not.toMatch(/§2\.6\.1 Introduction not written/);
  });
});
