// @vitest-environment jsdom
/**
 * IndLifecycle — the cover letter's submission type is never assumed by the
 * screen.
 *
 * What the screen used to do (until 2026-10-15): the cover-letter card sent
 * submissionType: 'original' for every letter, so every letter it assembled —
 * for an annual report, an amendment, a response — read "Initial
 * Investigational New Drug Application". It now names the submission it is for
 * (the checklist's submissionId); the server reads the type from that record,
 * or reports it not stated. A refusal reads in the server's words, not "sign
 * in and retry" for every failure.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { IndLifecycle } from '../surfaces/IndLifecycle';

const CHECKLIST = {
  submissionId: 31,
  code: 'ZX-9',
  drugName: 'Zexanib',
  productName: 'ZX-9 First-in-Human',
  indication: null,
  sponsorName: 'Acme Bio',
  submissionType: 'IND',
  targetReceiptDate: null,
  forms: [],
  sections: [],
};

type Reply = { ok: boolean; status: number; body: unknown };
function mockApi(letter: Reply, checklist: Record<string, unknown> = CHECKLIST) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/ind-checklist') {
      return { ok: true, status: 200, json: async () => ({ data: [checklist], meta: { count: 1 } }) } as Response;
    }
    if (method === 'POST' && url === '/api/ind-lifecycle/cover-letter') {
      return { ok: letter.ok, status: letter.status, json: async () => letter.body } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
}

const props = () => ({ onAsk: vi.fn(), onNav: vi.fn() }) as any;
const sent = () => apiRequest.mock.calls.filter((c) => c[0] === 'POST' && c[1] === '/api/ind-lifecycle/cover-letter').map((c) => c[2]);

async function coverLetterCard() {
  render(<IndLifecycle {...props()} />);
  await screen.findByText('Pre-IND Briefing Book');
  return screen.getByText('IND Cover Letter').closest('.indl-dcard')! as HTMLElement;
}

afterEach(cleanup);
beforeEach(() => apiRequest.mockReset());

describe('cover letter — the submission type comes from the record, never from the screen', () => {
  it('sends no submission type, and names the submission the letter is for', async () => {
    mockApi({ ok: true, status: 200, body: { body: 'RE: [Submission Type] — Zexanib', gaps: ['submissionType'], submissionType: null } });
    const card = await coverLetterCard();
    fireEvent.click(within(card).getByText('Assemble now'));

    expect(await within(card).findByText(/Missing before filing: submissionType/)).toBeTruthy();
    expect(sent()[0]).not.toHaveProperty('submissionType');
    expect(sent()[0]).toEqual({ sponsorName: 'Acme Bio', drugName: 'Zexanib', submissionId: 31 });
  });

  it('with no submission on the checklist it names none — and still invents no type', async () => {
    mockApi({ ok: true, status: 200, body: { body: 'LETTER', gaps: ['submissionType'] } }, { ...CHECKLIST, submissionId: null });
    const card = await coverLetterCard();
    fireEvent.click(within(card).getByText('Assemble now'));
    await within(card).findByText('LETTER');
    expect(sent()[0]).toEqual({ sponsorName: 'Acme Bio', drugName: 'Zexanib' });
  });

  it('a refusal that is not about signing in reads in the server\'s words', async () => {
    mockApi({ ok: false, status: 404, body: { error: { code: 'NOT_FOUND', message: 'Submission not found.' } } });
    const card = await coverLetterCard();
    fireEvent.click(within(card).getByText('Assemble now'));
    expect(await within(card).findByText('Could not assemble the cover letter — Submission not found.')).toBeTruthy();
  });
});
