// @vitest-environment jsdom
/**
 * The correspondence drafter shows the tenant's own letter, and drafts with AnA
 * from it. It authors nothing, and it shows no letter that was never received.
 *
 * ── What was shipping ──────────────────────────────────────────────────────
 * First, "Generate" fabricated a response in the browser: string templates, an
 * 850 ms delay to look like work, `generated_by: 'AnA'`, and a sign-off roster
 * of four people who do not exist. That was removed — and this file pinned the
 * removal against CORRESP_DETAIL, the drafter's only data source.
 *
 * CORRESP_DETAIL was itself the larger fabrication: four agency and notified-
 * body letters that were never sent (a CDRH AI-Hold on "K-251401", an RTA, a
 * Day-100 letter on "P250048", NB GSPR questions), and an "AnA-drafted"
 * response to one of them. The drafter opened ONLY for those ids, so it never
 * once showed a real letter; a live letter fell through to a bare AnA prompt.
 *
 * ── What this pins ─────────────────────────────────────────────────────────
 * The drafter reads GET /api/regulatory-correspondence/correspondence/:id and
 * renders that record's text and parsed issues; "Draft with AnA" hands that
 * real content to AnA; a failed read or a missing record says so.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { AnaDrafter } from '../components/AnaDrafter';
import type { Correspondence } from '../types';

const INVENTED = ['Jordan Chen', 'Marcus Wei', 'Lee Hartman', 'Priya Shah', 'K-251401', 'P250048', 'IV-415'];

const LETTER: Correspondence = {
  id: 'c0ffee00-0000-4000-8000-000000000001',
  kind: 'Additional Information',
  channel: 'CDRH Portal',
  from: 'FDA CDRH',
  received: '2026-09-01T10:00:00Z',
  due: '2026-10-15',
  status: 'open',
  subject: 'AI request on biocompatibility testing',
  summary: 'Reviewer requests cytotoxicity data.',
  refs: [],
};

const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

function serveDetail(body: unknown | Error) {
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url.startsWith('/api/regulatory-correspondence/correspondence/')) {
      if (body instanceof Error) throw body;
      return json(body);
    }
    return json({ data: [] });
  });
}

function mount(onAskAna = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AnaDrafter correspondence={LETTER} pathway="k510" onClose={() => {}} onOpenSection={() => {}} onAskAna={onAskAna} />
    </QueryClientProvider>,
  );
  return onAskAna;
}

beforeEach(() => {
  apiRequest.mockReset();
});
afterEach(cleanup);

const DETAIL = {
  data: {
    id: LETTER.id,
    sender: 'FDA CDRH',
    source_channel: 'CDRH Portal',
    received_at: '2026-09-01T10:00:00Z',
    subject: LETTER.subject,
    parsed_text: 'Dear Sponsor,\n\nPlease provide cytotoxicity data per ISO 10993-5.\n\nSincerely,',
  },
  issues: [
    { id: 'iss-1', category: 'biocompatibility', subcategory: 'cytotoxicity', severity: 'high', blocker: false,
      source_excerpt: 'Provide cytotoxicity data per ISO 10993-5.', mapped_ctd_sections: ['15'], resolution_status: 'open' },
  ],
  responsePackages: [{ id: 'pkg-1', title: 'AI response package', status: 'draft', created_at: '2026-09-05T00:00:00Z' }],
};

describe('AnaDrafter — the letter is the tenant’s own record', () => {
  it('renders the live letter’s text, its parsed issue and its response package — and nothing invented', async () => {
    serveDetail(DETAIL);
    mount();
    await waitFor(() => expect(screen.getByText(/Please provide cytotoxicity data per ISO 10993-5\./)).toBeTruthy());
    expect(screen.getByText('biocompatibility · cytotoxicity')).toBeTruthy();
    expect(screen.getByTestId('drafter-packages').textContent).toContain('AI response package');
    expect(apiRequest.mock.calls.some((c) => c[1] === `/api/regulatory-correspondence/correspondence/${LETTER.id}`)).toBe(true);
    const body = document.body.textContent ?? '';
    for (const s of INVENTED) expect(body, `invented "${s}" is on screen`).not.toContain(s);
  });

  it('hands the real letter and its issues to AnA — and authors nothing itself', async () => {
    serveDetail(DETAIL);
    const onAskAna = mount();
    await waitFor(() => expect(screen.getByRole('button', { name: /Draft with AnA/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Draft with AnA/ }));
    expect(onAskAna).toHaveBeenCalledTimes(1);
    const prompt = String(onAskAna.mock.calls[0][0]);
    expect(prompt).toContain(LETTER.subject);
    expect(prompt).toContain('Provide cytotoxicity data per ISO 10993-5.');
    expect(prompt).toContain('CTD 15');
    // No drafted response appears on this screen, and nothing was written.
    expect(document.body.textContent).not.toMatch(/We respectfully request|generated_by/);
    expect(apiRequest.mock.calls.every((c) => c[0] === 'GET')).toBe(true);
  });

  it('says a failed read failed — it never shows a blank or borrowed letter', async () => {
    serveDetail(new Error('upstream unavailable'));
    mount();
    await waitFor(() => expect(screen.getByTestId('drafter-unavailable').textContent).toMatch(/could not be loaded/));
    expect(screen.getByRole('button', { name: /Try again/ })).toBeTruthy();
  });

  it('says a letter with no record is not on record', async () => {
    serveDetail({ data: null, issues: [], responsePackages: [] });
    mount();
    await waitFor(() => expect(screen.getByTestId('drafter-unavailable').textContent).toMatch(/not on record/));
  });
});

describe('the drafter data module holds no letter', () => {
  it('exports no letter fixture', async () => {
    const mod = (await import('../data/correspondenceDetail')) as Record<string, unknown>;
    expect(mod.CORRESP_DETAIL).toBeUndefined();
    expect(typeof mod.toDrafterView).toBe('function');
  });
});
