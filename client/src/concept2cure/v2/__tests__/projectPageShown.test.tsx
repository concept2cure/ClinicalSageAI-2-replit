// @vitest-environment jsdom
/**
 * The project page shows the work (founder decision P-122 §3.3, 2026-11-10).
 *
 *   - The open step says what to do next: one quiet line under the steps with the step's guidance
 *     (PJ_LIFECYCLE[].now, rendered nowhere since a9819177d) and its action, the next step. No band.
 *   - Records and Activity are open sections of Project knowledge, not closed disclosures (8225e3075, e84c4f1ef).
 *   - The Review step lists its approvals and the readiness the server computes (d50c5f07e removed both).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(), useAuth: () => ({ user: null }) }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProjectHome } from '../surfaces/ProjectHome';
import { __resetSurfaceActionBus } from '../surfaceActions';
import { PJ_LIFECYCLE } from '../fixtures/project-home-data';

const PID = '5b2d7c11-2222-4333-8444-555566667777';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const IND = { id: PID, name: 'BX-410', product_name: 'Torvanib', program_type: 'IND', primary_agency: 'FDA', product_type: 'drug', status: 'active' };
const DOC = { id: 'doc-1', title: 'Clinical protocol', status: 'DRAFT', updated_at: '2026-10-24T09:00:00Z', program_id: PID };
const RECORDS = {
  projectId: PID,
  records: {
    submissions: { available: true, rows: [{ id: 7, title: 'IND 12345', application_type: 'ind', primary_region: 'fda', status: 'draft' }] },
    sources: { available: true, rows: [{ id: 1, title: 'CSR-001.pdf', source_type: 'client_document' }] },
    vaultDocuments: { available: false, rows: [], reason: 'could not be read' },
  },
};
const ACTIVITY = { activity: [{ actor_name: 'Avery Author', action: 'data_modify', table_name: 'regulatory_programs', occurred_at: '2026-11-09T10:00:00Z', reason: 'Scope agreed with FDA' }] };
const WORK = {
  items: [
    { id: 'review:wi-1', source: 'review', title: 'Approve the 2.5 Clinical Overview', status: 'open', priority: 'high', dueAt: '2026-11-20T00:00:00Z', ownerName: 'Raj Patel', blocking: true },
    { id: 'board:t-1', source: 'board', title: 'Draft the protocol synopsis', status: 'open', priority: 'medium', dueAt: '2026-11-18T00:00:00Z', ownerName: 'Avery Author', blocking: false },
    { id: 'review:wi-2', source: 'review', title: 'Sign the cover letter', status: 'done', priority: null, dueAt: null, ownerName: null, blocking: false },
  ],
  summary: { total: 3, blocking: 1, done: 1, partial: false },
};
const DOSSIER = {
  projectId: PID, measuredAt: '2026-11-10T09:00:00Z',
  home: { state: 'measured', pct: 40, counted: 10, complete: 4 },
  markets: [], rows: [],
};

function serve() {
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === `/api/c2c/projects/${PID}`) return ok(IND);
    if (url.startsWith('/api/authoring/docs')) return ok({ documents: [DOC] });
    if (url.startsWith(`/api/c2c/projects/${PID}/records`)) return ok(RECORDS);
    if (url.startsWith(`/api/c2c/projects/${PID}/activity`)) return ok(ACTIVITY);
    if (url.startsWith(`/api/c2c/projects/${PID}/dossier`)) return ok(DOSSIER);
    if (url.startsWith(`/api/concept2cure/projects/${PID}/unified-work`)) return ok(WORK);
    if (url.startsWith('/api/chat/threads')) return ok({ threads: [] });
    return ok({});
  });
}

const tab = (label: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('.pj-lc-stage')).find((b) => b.textContent?.trim() === label)!;
const activeLabel = () => document.querySelector('.pj-lc-stage[aria-current="step"]')?.textContent?.trim() ?? null;
const step = (id: string) => PJ_LIFECYCLE.find((s) => s.id === id)!;

function mount() {
  render(<ProjectHome surface={{ id: 'project-home', label: 'Project home' } as never} onAsk={vi.fn()} onNav={vi.fn()} segment="biopharma" />);
}

beforeEach(() => {
  apiRequest.mockReset();
  serve();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-410' };
});
afterEach(() => {
  cleanup();
  __resetSurfaceActionBus();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('the open step says what to do next, in one line under the steps', () => {
  it('each step\'s guidance and its next step, right under the step control', async () => {
    mount();
    await screen.findByTestId('pj-documents');
    for (const [label, id, next] of [['Plan', 'plan', 'Evidence'], ['Evidence', 'evidence', 'Author'], ['Review', 'review', 'Submit']] as const) {
      fireEvent.click(tab(label));
      const line = screen.getByTestId('pj-step-guidance');
      expect(line.previousElementSibling?.classList.contains('pj-lc')).toBe(true);
      expect(within(line).getByTestId('pj-step-now').textContent).toBe(step(id).now);
      expect(within(line).getByRole('button', { name: new RegExp(`^Next: ${next}`) })).toBeTruthy();
    }
  });

  it('its action opens the next step, and the last step has none', async () => {
    mount();
    await screen.findByTestId('pj-documents');
    fireEvent.click(tab('Plan'));
    fireEvent.click(within(screen.getByTestId('pj-step-guidance')).getByRole('button', { name: /^Next: Evidence/ }));
    expect(activeLabel()).toBe('Evidence');
    fireEvent.click(tab('Respond'));
    const line = screen.getByTestId('pj-step-guidance');
    expect(within(line).getByTestId('pj-step-now').textContent).toBe(step('respond').now);
    expect(within(line).queryByRole('button')).toBeNull();
  });

  it('is a line, not the retired band', async () => {
    mount();
    await screen.findByTestId('pj-documents');
    expect(screen.queryByTestId('pj-stageband')).toBeNull();
    expect(document.body.textContent).not.toMatch(/What to do now/);
    expect(screen.getByTestId('pj-step-guidance').tagName).toBe('P');
  });
});

describe('Records and Activity are open sections', () => {
  it('every store of Records is shown open, with its records, and nothing in the card is a closed disclosure', async () => {
    mount();
    const card = await screen.findByRole('region', { name: 'Records' });
    await waitFor(() => expect(within(card).getByText('IND 12345')).toBeTruthy());
    expect(within(card).getByText('CSR-001.pdf')).toBeTruthy();
    expect(within(card).getByRole('heading', { name: 'Data Room sources · 1' })).toBeTruthy();
    expect(within(card).getByRole('heading', { name: 'Vault documents · not available' })).toBeTruthy();
    expect(card.querySelectorAll('details')).toHaveLength(0);
  });

  it('Activity is its own open section in Project knowledge, its acts and reasons shown', async () => {
    mount();
    const activity = await screen.findByRole('region', { name: 'Activity' });
    await waitFor(() => expect(within(activity).getByText('Avery Author')).toBeTruthy());
    expect(within(activity).getByTestId('pj-act-reason').textContent).toContain('Scope agreed with FDA');
    expect(activity.closest('details')).toBeNull();
    expect(activity.closest('.pj-side')).toBeTruthy();
  });
});

describe('the Review step lists its approvals and the server\'s readiness', () => {
  it('its tasks and approvals, from the page\'s one work read, as Review listed them before d50c5f07e', async () => {
    mount();
    await screen.findByTestId('pj-documents');
    fireEvent.click(tab('Review'));
    const panel = await screen.findByRole('region', { name: 'Tasks and approvals' });
    await waitFor(() => expect(within(panel).getByText('Approve the 2.5 Clinical Overview')).toBeTruthy());
    expect(within(panel).getByText('Draft the protocol synopsis')).toBeTruthy();
    expect(within(panel).getByText(/Raj Patel/)).toBeTruthy();
    expect(within(panel).queryByText('Sign the cover letter')).toBeNull();
    expect(within(panel).getByText(/1 done/)).toBeTruthy();
  });

  it('the dossier readiness the server measured, with what it counts', async () => {
    mount();
    await screen.findByTestId('pj-documents');
    fireEvent.click(tab('Review'));
    const readiness = await screen.findByRole('region', { name: 'Readiness' });
    await waitFor(() => expect(within(readiness).getByTestId('pj-dossier-value').textContent).toBe('40%'));
    expect(within(readiness).getByText('4 of 10 sections approved or locked.')).toBeTruthy();
  });

  it('a failed work read says it failed, never that nothing is waiting', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url.startsWith(`/api/concept2cure/projects/${PID}/unified-work`)) return { ok: false, status: 500, json: async () => ({ error: 'boom' }) } as unknown as Response;
      if (url === `/api/c2c/projects/${PID}`) return ok(IND);
      if (url.startsWith('/api/authoring/docs')) return ok({ documents: [DOC] });
      return ok({});
    });
    mount();
    await screen.findByTestId('pj-documents');
    fireEvent.click(tab('Review'));
    const panel = await screen.findByRole('region', { name: 'Tasks and approvals' });
    await waitFor(() => expect(within(panel).getByText("Couldn't load this project's tasks and approvals")).toBeTruthy());
    expect(within(panel).queryByText('No tasks or approvals on this project')).toBeNull();
  });
});
