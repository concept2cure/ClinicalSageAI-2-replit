// @vitest-environment jsdom
/**
 * Quality on the one work-area page pattern (D7-B, `.design/claude-convergence/D7.md` §B;
 * D5 §WA; ONE_DESIGN_PLAN §2 "A work area"). One header with the rail's label, one line
 * under it, AnA's starters, the registers as tabs below the header, and the register as a
 * calm section. The second topbar, the "Workstream" eyebrow, the four tiles and the nine
 * per-document-type cards are gone (RULE 4: a document type is data, chosen in "New
 * controlled document"), and every capability they gave is kept (§B.5).
 */
import * as React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';

const TEMPLATES = [
  { key: 'sop', label: 'Standard operating procedure', docType: 'sop', family: 'quality', numberPrefix: 'SOP-',
    description: 'A controlled, step-by-step procedure for a repeatable process.', category: 'misc', sections: [{ key: 'purpose', label: 'Purpose', order: 1 }] },
  { key: 'policy', label: 'Policy', docType: 'policy', family: 'quality', numberPrefix: 'POL-',
    description: 'A governing statement of intent.', category: 'misc', sections: [{ key: 'purpose', label: 'Purpose', order: 1 }] },
];
const DOC = { id: 1, docNumber: 'QS-SOP-001', title: 'Handling of customer complaints', docType: 'sop', category: null,
  version: '1.0', status: 'in_review', effectiveDate: null, nextReviewDate: null, updatedAt: null, authorId: 1 };
const H = vi.hoisted(() => ({ asked: [] as string[], request: vi.fn(), user: { id: '2', name: 'Quinn Approver' } as { id: string; name: string },
  shell: null as null | { id: string; code?: string; title?: string },
  reviewRows: [] as Array<Record<string, unknown>> }));
vi.mock('../hooks', () => ({
  useSopRegister: () => ({ docs: [DOC], loading: false, error: null, refresh: vi.fn() }),
  useSopTemplates: () => ({ templates: TEMPLATES, loading: false, error: null }),
  useReviewDue: () => ({ rows: H.reviewRows, loading: false, error: null, refresh: vi.fn() }),
  useTrainingCompliance: () => ({ rows: [], loading: false, error: null, refresh: vi.fn() }),
  useTrainingExpiring: () => ({ rows: [], failed: false, error: null, refresh: vi.fn() }),
  useTrainingAssignments: () => ({ listing: null, failed: false, error: null, refresh: vi.fn() }),
  useJobRoles: () => ({ listing: null, failed: false, error: null, refresh: vi.fn() }),
}));
vi.mock('../changeHooks', () => ({ useChangeRegister: () => ({ changes: [], loading: false, error: null, refresh: vi.fn() }),
  useChangeSummary: () => ({ summary: { total: 0, open: 0, awaitingApproval: 0, inImplementation: 0, awaitingVerification: 0, overdueImplementation: 0 }, loading: false, error: null }) }));
// Change control's reviewed-learning step reads the session through authService (a2f9264a5): keep the real module.
vi.mock('@/services/portal/authService', async (original) => ({
  ...(await original<typeof import('@/services/portal/authService')>()), useAuthUser: () => H.user,
}));
vi.mock('@/lib/queryClient', async (original) => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest: (...a: unknown[]) => H.request(...a) }));
vi.mock('../../v2/shellProject', () => ({ useShellProject: () => H.shell, shellProgramId: (p: { id: string } | null) => (p ? p.id : null) }));
vi.mock('../../v2/surfaceActions', () => ({ useSurfaceActionHandlers: () => undefined, notifySurfaceActionReady: () => undefined }));
vi.mock('../../v2/surfaceContext', () => ({ usePublishSurfaceContext: () => undefined }));

import { QualityApp } from '../App';
import { ceremonyOpen } from '../../v2/ceremony';

beforeEach(() => {
  H.asked = [];
  H.user = { id: '2', name: 'Quinn Approver' };
  H.request.mockReset().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [], meta: {} }) });
});
afterEach(cleanup);
const mount = () => render(<QualityApp onAskAna={(q) => H.asked.push(q)} />);

/* P-122 (2026-11-10): opened with a project open, Quality reads the whole organisation and says so; narrowing to the
   project is one quiet control. C14 (QP3) had made the project's records the default, so the registers looked empty. */
describe('Quality says whose records it lists', () => {
  afterEach(() => { H.shell = null; H.reviewRows = []; window.history.replaceState(null, '', '/concept2cure/quality'); });
  it("reads the whole organisation with a project open, narrows to the project and back", () => {
    H.shell = { id: '40000000-0000-4000-8000-000000000001', code: 'C11', title: 'Gasket programme' };
    mount();
    expect(screen.getByTestId('quality-scope').textContent).toBe("The whole organisation's quality records.");
    expect(new URLSearchParams(window.location.search).get('quality')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show C11 · Gasket programme only' }));
    expect(new URLSearchParams(window.location.search).get('quality')).toBe('project');
    expect(screen.getByTestId('quality-scope').textContent).toMatch(/^C11 · Gasket programme: its controlled documents and their periodic review, changes, CAPAs and nonconformances\. Training, deviations, suppliers, audits and management reviews are the organisation's\.$/);
    fireEvent.click(screen.getByRole('button', { name: 'Show the whole organisation' }));
    expect(new URLSearchParams(window.location.search).get('quality')).toBeNull();
    expect(screen.getByTestId('quality-scope').textContent).toBe("The whole organisation's quality records.");
  });

  // The SOP tab in a project's scope is its documents and their review: the organisation's schedule is filtered to them.
  it("narrowed to the project, lists for periodic review only the project's documents, and says training is the organisation's", () => {
    H.shell = { id: '40000000-0000-4000-8000-000000000001', code: 'C11', title: 'Gasket programme' };
    window.history.replaceState(null, '', '/concept2cure/quality?quality=project');
    H.reviewRows = [
      { id: 1, docNumber: 'QS-SOP-001', title: 'Handling of customer complaints', nextReviewDate: '2026-11-20', overdue: false, status: 'effective' },
      { id: 99, docNumber: 'QS-SOP-099', title: 'Another project\'s procedure', nextReviewDate: '2026-11-21', overdue: true, status: 'effective' },
    ];
    mount();
    const review = screen.getByRole('heading', { name: 'Periodic review' }).closest('section') as HTMLElement;
    expect(review.textContent).toContain('QS-SOP-001');
    expect(review.textContent).not.toContain('QS-SOP-099');
    expect(within(review).getByTestId('qms-review-figure').textContent).toMatch(/^none overdue/);
    expect(screen.getByTestId('qms-coverage-figure').textContent).toMatch(/^Organisation-wide/);
  });

  it('offers no choice with no project open', () => {
    mount();
    expect(screen.getByTestId('quality-scope').textContent).toBe('Controlled documents and their training, change control, CAPA and the other quality records.');
    expect(screen.queryByRole('button', { name: /Show the whole organisation|only$/ })).toBeNull();
  });
});

describe('Quality is one work area with one header (D7-B)', () => {
  it('has one title, the rail label, and no second topbar or eyebrow', () => {
    const { container } = mount();
    const titles = screen.getAllByRole('heading', { level: 1 });
    expect(titles.map((h) => h.textContent)).toEqual(['Quality']);
    expect(container.querySelector('[data-work-area="quality"]')).toBeTruthy();
    expect(container.querySelector('.qms-topbar')).toBeNull();
    expect(screen.queryByText('Workstream')).toBeNull();
    expect(screen.queryByText('Quality system')).toBeNull();
  });

  it('puts the registers as tabs below the header, with no icons, and keeps arrow keys', () => {
    mount();
    const tablist = screen.getByRole('tablist', { name: 'Quality registers' });
    const header = screen.getByRole('heading', { level: 1 }).closest('header')!;
    expect(header.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['SOP register', 'Change control', 'CAPA', 'Deviations', 'Nonconformances', 'Suppliers', 'Internal audits', 'Management reviews']);
    expect(tablist.querySelector('svg')).toBeNull();
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(within(tablist).getByRole('tab', { name: 'Change control' }).getAttribute('aria-selected')).toBe('true');
  });

  it("asks AnA through at most three starters, one of them the pre-inspection check", () => {
    mount();
    const starters = within(screen.getByRole('group', { name: 'Ask AnA' })).getAllByRole('button');
    expect(starters.length).toBeLessThanOrEqual(3);
    expect(starters.map((b) => b.textContent)).toEqual(['Give me a read-out on SOP register', 'Run a pre-inspection check', 'Where is training missing?']);
    fireEvent.click(starters[1]);
    expect(H.asked).toHaveLength(1);
    expect(H.asked[0]).toMatch(/pre-inspection check/i);
    expect(screen.queryByRole('button', { name: /^Ask AnA$/ })).toBeNull();
  });

  it('shows no stat tiles and no per-document-type cards (RULE 4)', () => {
    const { container } = mount();
    expect(container.querySelector('.qms-kpi')).toBeNull();
    expect(screen.queryByText('Build from the Quality system library')).toBeNull();
    expect(container.querySelector('.qms-tpl-card')).toBeNull();
  });

  it('keeps the document types in "New controlled document", each with its number prefix and description', () => {
    mount();
    const register = screen.getByRole('region', { name: 'Controlled documents' });
    fireEvent.click(within(register).getByRole('button', { name: 'New controlled document' }));
    const dialog = screen.getByRole('dialog', { name: 'New controlled document' });
    const type = within(dialog).getByLabelText('Template') as HTMLSelectElement;
    expect([...type.options].map((o) => o.textContent)).toEqual([
      'Standard controlled-document sections', 'Standard operating procedure (SOP-)', 'Policy (POL-)',
    ]);
    fireEvent.change(type, { target: { value: 'policy' } });
    expect(within(dialog).getByText('A governing statement of intent.')).toBeTruthy();
    expect((within(dialog).getByLabelText('Title') as HTMLInputElement).value).toBe('Policy');
    expect((within(dialog).getByLabelText('Document type') as HTMLSelectElement).value).toBe('policy');
  });

  // C15: the form is the product's one drawer (D0 `.de`, as C2CForm's), and a ceremony while it is open, so AnA does
  // not change the screen under it (v2/ceremony.ts; the shell refuses AnA's moves while one is open).
  it('opens "New controlled document" in the one drawer, and holds AnA off the screen while it is open', () => {
    mount();
    expect(ceremonyOpen()).toBe(false);
    fireEvent.click(within(screen.getByRole('region', { name: 'Controlled documents' })).getByRole('button', { name: 'New controlled document' }));
    const dialog = screen.getByRole('dialog', { name: 'New controlled document' });
    expect(dialog.className).toBe('de');
    expect(dialog.parentElement!.className).toBe('de-bd');
    expect(within(dialog).getByRole('button', { name: 'Create and open' }).closest('.de-f')).toBeTruthy();
    expect(ceremonyOpen()).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(ceremonyOpen()).toBe(false);
  });

  it("keeps each tab's own AnA request as a starter: Change control's procedure, a record register's read-out", () => {
    mount();
    fireEvent.click(screen.getByRole('tab', { name: 'Change control' }));
    const starters = () => within(screen.getByRole('group', { name: 'Ask AnA' })).getAllByRole('button');
    expect(starters().map((b) => b.textContent)).toEqual(['Give me a read-out on change control', 'Run a pre-inspection check', 'Explain the change procedure']);
    // The read-out carries what the health check asked (awaiting approval, overdue, open links), ranked by risk.
    fireEvent.click(starters()[0]);
    expect(H.asked[0]).toMatch(/awaiting approval.*overdue for implementation.*deviations or CAPAs.*ranked by risk/);
    // The procedure's explanation, which was a button in a guidance box under the log; AnA explains, it never attests.
    fireEvent.click(starters()[2]);
    expect(H.asked[1]).toMatch(/how to raise a change request/i);
    expect(H.asked[1]).not.toMatch(/quiz me|record read-and-understood training/i);
    // An empty log claims nothing: no "none overdue" of nothing.
    expect(screen.queryByTestId('change-figures')).toBeNull();
    expect(screen.getAllByText('No changes in the log yet.')).toHaveLength(1);
    // ...and an empty log has no stage filter of zeroes to offer.
    expect(screen.queryByRole('group', { name: 'Lifecycle stage' })).toBeNull();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    fireEvent.click(screen.getByRole('tab', { name: 'CAPA' }));
    expect(starters()[0].textContent).toBe('Give me a read-out on CAPA');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  // P-122: a row shows the actions that fit its state inline, and Ask AnA as an icon; More reveals the rest in the row.
  it('a register row shows its state\'s actions inline, and More reveals every other action in the row', () => {
    mount();
    const row = screen.getByText('Handling of customer complaints', { selector: '.qms-title' }).closest('tbody') as HTMLElement;
    const shown = () => within(row).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(shown()).toEqual(['QS-SOP-001', 'Approve', 'Review route', 'Ask AnA about this document', 'More actions for QS-SOP-001']);
    const more = within(row).getByRole('button', { name: 'More actions for QS-SOP-001' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    const group = within(row).getByRole('group', { name: 'Actions for QS-SOP-001' });
    expect(within(group).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual([
      'Open', 'Training', 'Revise', 'View version history of QS-SOP-001',
    ]);
    fireEvent.click(within(row).getByRole('button', { name: 'Ask AnA about this document' }));
    expect(H.asked).toEqual(['Summarize QS-SOP-001 Handling of customer complaints and tell me what it needs next.']);
  });

  it("does not offer its author an approval the server refuses: the author's next step is the review route", () => {
    H.user = { id: '1', name: 'Ada Author' };
    mount();
    const row = screen.getByText('Handling of customer complaints', { selector: '.qms-title' }).closest('tbody') as HTMLElement;
    expect(within(row).queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(within(row).getByTestId('qms-route-open').textContent).toBe('Review route');
  });

  // C1: the SOP tab is one column of quiet sections; every section head is the work area's, no box or two-up grid.
  it('lays the SOP tab out as one column of sections, each with its own head and no box', () => {
    const { container } = mount();
    expect(container.querySelector('.qms-grid2, .qms-sec-head, .qms-train-fill')).toBeNull();
    const heads = [...container.querySelectorAll('[data-work-area] h2')];
    expect(heads.map((h) => h.textContent)).toEqual(['Controlled documents', 'Periodic review', 'Read-and-understood training', 'Training overdue, due or lapsing']);
    for (const h of heads) expect(h.parentElement?.classList.contains('pj-sec-h'), h.textContent ?? '').toBe(true);
    expect(screen.getByRole('button', { name: 'Job roles' }).querySelector('svg')).toBeNull();
    expect((screen.getByText('How coverage is counted').closest('details') as HTMLDetailsElement).open).toBe(false);
  });

  // C6: the register is D0's table with real column headers (WCAG 1.3.1), not Quality's own boxed div grid.
  it('is a table with column headers, one body per document', () => {
    const { container } = mount();
    const register = screen.getByRole('region', { name: 'Controlled documents' });
    const table = within(register).getByRole('table');
    expect(table.classList.contains('reg-tbl')).toBe(true);
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Number', 'Title', 'Type', 'Version', 'Status', 'Effective', 'Next review', 'Actions']);
    expect(container.querySelectorAll('tbody.qms-doc')).toHaveLength(1);
    // C18a: a date is kept on one line; it broke at its hyphen ("2026-" over "11-10") in the narrow column at 1440.
    expect([...container.querySelectorAll('tbody.qms-doc .qms-when')].map((e) => e.textContent)).toEqual(['—']);
    expect(container.querySelector('.qms-table, .qms-thead, .qms-pill, .qms-tag')).toBeNull();
  });

  it('states the register in one sentence above its rows', () => {
    mount();
    expect(screen.getByTestId('qms-register-figures').textContent).toBe('1 controlled document: 1 in review; none overdue for review.');
    // C18a: a sentence is the line under the head (D0's standalone `p.sec-sub`), not crowded into it beside the actions.
    const line = screen.getByTestId('qms-register-figures');
    expect(line.tagName, 'the sentence is its own line').toBe('P');
    expect(line.previousElementSibling?.classList.contains('pj-sec-h'), 'directly under the section head').toBe(true);
  });
});
