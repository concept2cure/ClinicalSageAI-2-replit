// @vitest-environment jsdom
/**
 * Protocol development — which section is the current one.
 *
 * ── The defect (periodic review 2026-09-28, editor family, A-C-2) ────────────
 * The section outline showed the open section by a class alone
 * (`.pd-tree-row.on`): a tint. Every row computed the same role, name and state
 * whether it was the open one or not, so a screen-reader user was never told
 * which section the editor showed (WCAG 1.3.1, 4.1.2). The open row now carries
 * `aria-current`.
 *
 * The lens reported the sixteen-tab strip for the same reason. That half was
 * fixed the same day by another lane as a full WAI-ARIA tablist (780a0639,
 * GA-2), so it is not repeated here; the tabs are reached below by their text,
 * which holds whether a tab is a button or a `role="tab"`.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  version: '0.7', status: 'draft', sponsor: 'Sponsor', pi: 'PI', updated: '2026-09-20',
  completeness: 68, openSection: 's1',
  sections: [
    { id: 's1', num: '1', title: 'Synopsis', status: 'draft', required: true },
    { id: 's2', num: '2', title: 'Background', status: 'not_started', required: true },
  ],
  content: {}, objectives: [], eligibility: { inclusion: [], exclusion: [] },
  soa: { visits: [], assessments: [], cells: {}, issues: [] }, risks: [], milestones: [],
  budget: { params: null, items: [], summary: null }, amendments: [], deviations: [],
  reviews: [], consent: [], completenessFindings: [], studyDesign: null,
};

function Providers({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function mount() {
  render(
    <Providers>
      <ProtocolWorkspace surface={{ id: 'protocol-dev', label: 'Protocol', navTier: 'project' } as never}
        onAsk={vi.fn()} onNav={vi.fn()} segment="biotech" />
    </Providers>,
  );
  await screen.findByRole('button', { name: /^Ask AnA$/ });
}

/** The outline rows that currently claim to be the open section. */
const current = () => screen.getAllByRole('button').filter((b) => b.classList.contains('pd-tree-row') && b.hasAttribute('aria-current'));
/** A tab, by its text: a plain button before 780a0639 and a role="tab" after. */
const tab = (label: string) => screen.getAllByText(label).map((el) => el.closest('button')).find(Boolean) as HTMLElement;

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) =>
    method === 'GET' && url.startsWith('/api/protocol-dev') ? ok({ success: true, data: [DOC] }) : ok({}),
  );
});
afterEach(() => cleanup());

describe('the section outline exposes the open section (A-C-2)', () => {
  it('marks the open section as current, and moves the mark with the selection', async () => {
    await mount();
    const synopsis = screen.getByRole('button', { name: /1\s*Synopsis/ });
    expect(synopsis.getAttribute('aria-current')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /2\s*Background/ }));
    expect(screen.getByRole('button', { name: /2\s*Background/ }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('button', { name: /1\s*Synopsis/ }).hasAttribute('aria-current')).toBe(false);
  });

  it('never has more than one current section, across a tab change', async () => {
    await mount();
    expect(current()).toHaveLength(1);
    fireEvent.click(tab('Risk register'));
    fireEvent.click(tab('Document'));
    fireEvent.click(screen.getByRole('button', { name: /2\s*Background/ }));
    expect(current()).toHaveLength(1);
  });
});
