// @vitest-environment jsdom
/**
 * The Quality app's buttons do what they say, through the QMS routes.
 *
 * Audit 2026-10-17. "New controlled document", the library template cards,
 * the document number ("open"), "Revise", the periodic-review rows, "Raise
 * change request", "Advance" and "Link a record" each handed a sentence to AnA
 * and changed nothing. Every one of them has a route in server/routes/mdx-qms.ts
 * whose table is on the deploy path:
 *
 *   POST /api/mdx/qms/documents                create (audited, draft only)
 *   POST /api/mdx/qms/documents/:id/revise     reason required (audited)
 *   POST /api/mdx/qms/changes                  create (audited)
 *   POST /api/mdx/qms/changes/:id/transition   reason required (audited)
 *   POST /api/mdx/qms/changes/:id/links        link (audited)
 *
 * and "open" is the register's own controlled-document dialog. These cases
 * press each control and assert the request that leaves, and that AnA was not
 * asked instead. The two analysis requests that remain AnA's say so on the
 * button.
 */
import * as React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

const H = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  refresh: vi.fn(),
  docs: [] as unknown[],
  reviewRows: [] as unknown[],
}));

const TEMPLATES = [
  {
    key: 'sop', label: 'Standard operating procedure', docType: 'sop', family: 'quality_system',
    description: 'A procedure.', numberPrefix: 'SOP-', category: 'quality_system',
    sections: [{ key: 'purpose', label: 'Purpose', order: 1 }],
  },
  {
    key: 'change_request_form', label: 'Change-request form', docType: 'form', family: 'change_control',
    description: 'The controlled change form.', numberPrefix: 'CC-', category: 'change_control',
    sections: [{ key: 'identification', label: 'Change identification', order: 1 }],
  },
  {
    key: 'change_control_sop', label: 'Change-control procedure', docType: 'sop', family: 'change_control',
    description: 'The change SOP.', numberPrefix: 'SOP-CC-', category: 'change_control',
    sections: [{ key: 'identification', label: 'Change identification', order: 1 }],
  },
];

const PROGRAM = '40000000-0000-4000-8000-000000000001';
const AUTHORING_DOCUMENT = '40000000-0000-4000-8000-000000000002';
const EFFECTIVE = {
  id: 6, docNumber: 'SOP-015', title: 'Supplier controls', docType: 'sop', category: null,
  authoringDocumentId: AUTHORING_DOCUMENT, programId: PROGRAM,
  version: '1.0', status: 'effective', effectiveDate: '2026-09-01', nextReviewDate: '2026-10-01', updatedAt: null,
};

vi.mock('../hooks', () => ({
  useSopRegister: () => ({ docs: H.docs, loading: false, error: null, refresh: H.refresh }),
  useSopTemplates: () => ({ templates: TEMPLATES, loading: false, error: null }),
  useReviewDue: () => ({ rows: H.reviewRows, loading: false, error: null, refresh: vi.fn() }),
  useTrainingCompliance: () => ({ rows: [], loading: false, error: null, refresh: vi.fn() }),
  useTrainingExpiring: () => ({ rows: [], failed: false, error: null, refresh: vi.fn() }),
}));
vi.mock('../changeHooks', async () => {
  const { CHANGE_SUMMARY } = await import('./changeRows');
  return { useChangeSummary: () => ({ summary: CHANGE_SUMMARY, loading: false, error: null }) };
});
vi.mock('@/services/portal/authService', () => ({
  useAuthUser: () => ({ id: 9, organizationId: 3, name: 'Q. Author', role: 'editor' }),
}));
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...a: unknown[]) => H.apiRequest(...a),
  serverMessage: (p: { error?: string } | null) => p?.error ?? null,
  redactInternals: (m: string) => m,
}));
vi.mock('../../v2/shellProject', () => ({ useShellProject: () => ({ id: PROGRAM }), shellProgramId: (p: { id: string }) => p.id }));
vi.mock('../ControlledDocumentWorkbench', () => ({
  ControlledDocumentWorkbench: (p: { documentId: number }) => <div role="region" aria-label="Controlled editing copy" data-document-id={p.documentId} />,
}));
vi.mock('../PersonalTrainingReader', () => ({
  PersonalTrainingReader: (p: { documentId: number }) => (
    <div role="dialog" aria-label="Controlled document" data-document-id={p.documentId} />
  ),
}));

import { SopRegister } from '../SopRegister';
import { ChangeControl } from '../ChangeControl';
import { CHANGE_ROWS } from './changeRows';

const json = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

let asked: string[];
beforeEach(() => {
  asked = [];
  H.docs = [EFFECTIVE];
  H.reviewRows = [{ id: 6, docNumber: 'SOP-015', title: 'Supplier controls', nextReviewDate: '2026-10-01', overdue: true, status: 'effective' }];
  H.refresh.mockReset();
  H.apiRequest.mockReset();
  H.apiRequest.mockImplementation(async (method: string, url: string, body: Record<string, unknown>) => {
    if (method === 'GET' && url.startsWith('/api/c2c/projects')) return json(200, { data: [{ id: PROGRAM, title: 'Current program' }] });
    if (method === 'POST' && url === '/api/mdx/qms/documents') {
      return json(201, { data: { id: 77, doc_number: body.docNumber, version: '1.0', status: 'draft', authoring_document_id: AUTHORING_DOCUMENT } });
    }
    if (method === 'POST' && /\/revise$/.test(url)) return json(200, { data: { id: 6, version: '2.0', status: 'draft', authoring_document_id: AUTHORING_DOCUMENT } });
    if (method === 'POST' && url === '/api/mdx/qms/changes') return json(201, { data: { id: 40, change_number: body.changeNumber } });
    if (method === 'POST' && /\/transition$/.test(url)) return json(200, { data: { id: 1, status: body.to } });
    if (method === 'POST' && /\/links$/.test(url)) return json(201, { data: { id: 99 } });
    return json(200, { data: {} });
  });
});
afterEach(cleanup);

const renderRegister = () =>
  render(<SopRegister onAsk={(q) => asked.push(q)} filter="all" onFilterChange={() => {}} />);

function renderLog() {
  return render(
    <ChangeControl
      onAsk={(q) => asked.push(q)}
      stage="all"
      onStageChange={() => {}}
      openId={1}
      onOpenIdChange={() => {}}
      changes={CHANGE_ROWS}
      loading={false}
      onRetry={H.refresh}
    />,
  );
}

const drawer = (name: RegExp) => screen.getByRole('dialog', { name });
const fill = (scope: HTMLElement, label: RegExp, value: string) =>
  fireEvent.change(within(scope).getByLabelText(label), { target: { value } });

describe('SOP register — governed actions reach their routes', () => {
  it('creates a controlled document through POST /documents, then opens it', async () => {
    renderRegister();
    fireEvent.click(screen.getByRole('button', { name: /New controlled document/ }));
    const d = drawer(/New controlled document/);
    await waitFor(() => expect(within(d).getByLabelText('Project').querySelector(`option[value="${PROGRAM}"]`)).toBeTruthy());
    fill(d, /^Project$/, PROGRAM);
    fill(d, /^Template$/, 'sop');
    fill(d, /Document type/, 'sop');
    fill(d, /^Template$/, 'sop');
    fill(d, /Document number/, 'SOP-021');
    fill(d, /^Title/, 'Deviation management');
    fill(d, /^Reason$/, 'Create this controlled procedure for the program.');
    fireEvent.click(within(d).getByRole('button', { name: 'Create and open' }));
    await waitFor(() =>
      expect(H.apiRequest).toHaveBeenCalledWith('POST', '/api/mdx/qms/documents', expect.objectContaining({
        docNumber: 'SOP-021', title: 'Deviation management', docType: 'sop', templateKey: 'sop',
      })),
    );
    expect(await screen.findByRole('region', { name: 'Controlled editing copy' })).toHaveProperty('dataset.documentId', '77');
    expect(asked).toEqual([]);
  });

  it('a library card opens the same create form with its template chosen', async () => {
    renderRegister();
    fireEvent.click(screen.getByRole('button', { name: /Change-request form/ }));
    const d = drawer(/New controlled document/);
    expect(within(d).getByText('Template: Change-request form')).toBeTruthy();
    expect((within(d).getByLabelText(/Document type/) as HTMLSelectElement).value).toBe('form');
    expect(asked).toEqual([]);
  });

  it('the document number opens the document, not a chat', () => {
    renderRegister();
    fireEvent.click(screen.getByRole('button', { name: 'SOP-015' }));
    expect(screen.getByRole('region', { name: 'Controlled editing copy' }).getAttribute('data-document-id')).toBe('6');
    expect(asked).toEqual([]);
  });

  it('Revise opens a reason-for-change dialog and posts the reason to /revise', async () => {
    renderRegister();
    fireEvent.click(screen.getByRole('button', { name: /Revise/ }));
    const d = screen.getByRole('dialog', { name: 'Create controlled revision' });
    fill(d, /^Reason$/, 'Periodic review found the supplier tiers out of date.');
    fireEvent.click(within(d).getByRole('button', { name: 'Create revision' }));
    await waitFor(() =>
      expect(H.apiRequest).toHaveBeenCalledWith('POST', '/api/mdx/qms/documents/6/revise', {
        reason: 'Periodic review found the supplier tiers out of date.',
      }),
    );
    expect(H.refresh).toHaveBeenCalled();
    expect(asked).toEqual([]);
  });

  it('a periodic-review row opens the document instead of asking AnA to "schedule" it', () => {
    renderRegister();
    fireEvent.click(screen.getByRole('button', { name: /periodic review/i }));
    expect(screen.getByRole('dialog', { name: 'Controlled document' }).getAttribute('data-document-id')).toBe('6');
    expect(asked).toEqual([]);
  });

  it('the pre-inspection check says it is a request to AnA', () => {
    renderRegister();
    fireEvent.click(screen.getByRole('button', { name: /Ask AnA.*pre-inspection check/i }));
    expect(asked).toHaveLength(1);
  });
});

describe('Change control — governed actions reach their routes', () => {
  it('raises a change request through POST /changes', async () => {
    renderLog();
    fireEvent.click(screen.getByRole('button', { name: /Raise change request/ }));
    const d = drawer(/Raise change request/);
    fill(d, /Change number/, 'CC-2026-020');
    fill(d, /^Title/, 'Replace the autoclave controller');
    fill(d, /Reason for the change/, 'The controller is end-of-life and no longer supported.');
    fireEvent.click(within(d).getByRole('button', { name: /Raise change/ }));
    await waitFor(() =>
      expect(H.apiRequest).toHaveBeenCalledWith('POST', '/api/mdx/qms/changes', expect.objectContaining({
        changeNumber: 'CC-2026-020', title: 'Replace the autoclave controller',
        reason: 'The controller is end-of-life and no longer supported.',
      })),
    );
    expect(H.refresh).toHaveBeenCalled();
    expect(asked).toEqual([]);
  });

  it("Advance offers the server's next states, never approval, and posts the move with its reason", async () => {
    renderLog();
    const row = screen.getByText('CC-2026-014').closest('.qms-row') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: /Advance/ }));
    const d = drawer(/Advance CC-2026-014/);
    const to = within(d).getByLabelText(/Move to/) as HTMLSelectElement;
    const values = Array.from(to.options).map((o) => o.value).filter(Boolean);
    expect(values).toEqual(['rejected', 'cancelled']);
    fill(d, /Move to/, 'rejected');
    fill(d, /Reason for this move/, 'Second-source filter failed bacterial retention.');
    fireEvent.click(within(d).getByRole('button', { name: /Record the move/ }));
    await waitFor(() =>
      expect(H.apiRequest).toHaveBeenCalledWith('POST', '/api/mdx/qms/changes/1/transition', {
        to: 'rejected', reason: 'Second-source filter failed bacterial retention.',
      }),
    );
    expect(asked).toEqual([]);
  });

  it('links a record through POST /changes/:id/links', async () => {
    renderLog();
    fireEvent.click(screen.getByRole('button', { name: /Link a record/ }));
    const d = drawer(/Link a record to CC-2026-014/);
    fill(d, /Record type/, 'capa');
    fill(d, /Reference/, 'CAPA-91');
    fireEvent.click(within(d).getByRole('button', { name: /Link record/ }));
    await waitFor(() =>
      expect(H.apiRequest).toHaveBeenCalledWith('POST', '/api/mdx/qms/changes/1/links', expect.objectContaining({
        linkType: 'capa', linkedRef: 'CAPA-91',
      })),
    );
    expect(asked).toEqual([]);
  });

  it('the forms gallery is the server library, and a card opens the create form', () => {
    renderLog();
    expect(screen.queryByText('Impact-assessment form')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Change-control procedure/ }));
    const d = drawer(/New controlled document/);
    expect(within(d).getByText('Template: Change-control procedure')).toBeTruthy();
    expect((within(d).getByLabelText(/Document type/) as HTMLSelectElement).value).toBe('sop');
    expect(asked).toEqual([]);
  });

  it('creates a gallery document with the selected program and reason, then opens its bound editing copy', async () => {
    renderLog();
    fireEvent.click(screen.getByRole('button', { name: /Change-control procedure/ }));
    const d = drawer(/New controlled document/);
    await waitFor(() => expect((within(d).getByLabelText('Project') as HTMLSelectElement).value).toBe(PROGRAM));
    expect((within(d).getByRole('button', { name: 'Create and open' }) as HTMLButtonElement).disabled).toBe(true);
    expect(H.apiRequest.mock.calls.some(([method]) => method === 'POST')).toBe(false);
    fill(d, /^Reason$/, 'Establish change control for the current program.');
    fireEvent.click(within(d).getByRole('button', { name: 'Create and open' }));
    expect(await screen.findByRole('region', { name: 'Controlled editing copy' })).toHaveProperty('dataset.documentId', '77');
    expect(H.apiRequest).toHaveBeenCalledWith('POST', '/api/mdx/qms/documents', {
      programId: PROGRAM, reason: 'Establish change control for the current program.',
      templateKey: 'change_control_sop', title: 'Change-control procedure', docType: 'sop',
    });
    expect(asked).toEqual([]);
    expect(screen.queryByRole('dialog', { name: 'Controlled document' })).toBeNull();
  });

  it('the health check says it is a request to AnA', () => {
    renderLog();
    fireEvent.click(screen.getByRole('button', { name: /Ask AnA.*health check/i }));
    expect(asked).toHaveLength(1);
  });
});
