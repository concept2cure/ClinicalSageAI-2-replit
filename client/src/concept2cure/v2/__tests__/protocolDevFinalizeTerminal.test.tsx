// @vitest-environment jsdom
/**
 * Protocol development — a finalized protocol is not offered for finalization.
 *
 * ── The defect (periodic review 2026-09-28, editor family, P11-C-4) ──────────
 * The outline's finalize gate was gated on completeness alone, never on the
 * protocol's status. A finalized protocol passes the completeness check it
 * passed to be finalized, so the gate kept saying "Ready to finalize" beside a
 * header badge reading "Finalized", with a live "Finalize protocol" button.
 * Pressing it ran the whole e-signature ceremony (password, authenticator
 * code, one of the shared signing attempts) before the server refused with
 * "Protocol is already finalized." A superseded protocol was the same.
 *
 * Those are exactly the two states the server refuses
 * (`finalizeProtocolTx`), so they are the two the outline shows as terminal:
 * the state, and no action. Every other status keeps the gate.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProtocolWorkspace } from '../surfaces/ProtocolDev';

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as Response;

const DOC = {
  id: '41', title: 'A Phase II Study of X', shortTitle: 'X-201', kind: 'clinical',
  version: '2.0', status: 'finalized', sponsor: 'Sponsor', pi: 'PI', updated: '2026-09-20',
  completeness: 100, openSection: 's1',
  sections: [{ id: 's1', num: '1', title: 'Synopsis', status: 'complete', required: true }],
  content: {}, objectives: [], eligibility: { inclusion: [], exclusion: [] },
  soa: { visits: [], assessments: [], cells: {}, issues: [] }, risks: [], milestones: [],
  budget: { params: null, items: [], summary: null }, amendments: [], deviations: [],
  reviews: [], consent: [], completenessFindings: [], studyDesign: null,
};

function Providers({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function mount(doc: Record<string, unknown>) {
  apiRequest.mockImplementation(async (method: string, url: string) =>
    method === 'GET' && url.startsWith('/api/protocol-dev') ? ok({ success: true, data: [doc] }) : ok({}),
  );
  render(
    <Providers>
      <ProtocolWorkspace surface={{ id: 'protocol-dev', label: 'Protocol', navTier: 'project' } as never}
        onAsk={vi.fn()} onNav={vi.fn()} segment="biotech" />
    </Providers>,
  );
  await screen.findByRole('button', { name: /^Ask AnA$/ });
}

beforeEach(() => { apiRequest.mockReset(); });
afterEach(() => cleanup());

describe('the finalize gate shows a terminal protocol\'s state, not the action (P11-C-4)', () => {
  it('a finalized protocol offers no Finalize and does not read "Ready to finalize"', async () => {
    await mount(DOC);
    expect(screen.queryByRole('button', { name: /Finalize protocol/ })).toBeNull();
    expect(screen.queryByText(/Ready to finalize/)).toBeNull();
    expect(screen.getByText('Finalized — v2.0')).toBeTruthy();
    expect(screen.getByText(/nothing left to finalize/)).toBeTruthy();
  });

  it('a superseded protocol offers no Finalize either, and says why', async () => {
    await mount({ ...DOC, status: 'superseded', version: '1.0' });
    expect(screen.queryByRole('button', { name: /Finalize protocol/ })).toBeNull();
    expect(screen.queryByText(/Ready to finalize/)).toBeNull();
    expect(screen.getByText('Superseded — v1.0')).toBeTruthy();
    expect(screen.getByText(/later version replaces this one/)).toBeTruthy();
  });

  it('a protocol still in development keeps the gate and its action', async () => {
    await mount({ ...DOC, status: 'in_development', version: '1.3' });
    const finalize = screen.getByRole('button', { name: /Finalize protocol/ });
    expect((finalize as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(/Ready to finalize/)).toBeTruthy();
    expect(screen.queryByText(/Finalized — v/)).toBeNull();
  });

  it('a protocol in development with a blocker keeps the gate, with the action disabled', async () => {
    await mount({
      ...DOC, status: 'draft', version: '0.4',
      completenessFindings: [{ sev: 'critical', text: 'Required section "Synopsis" is draft.' }],
    });
    const finalize = screen.getByRole('button', { name: /Finalize protocol/ });
    expect((finalize as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/1 blocker/)).toBeTruthy();
  });
});
