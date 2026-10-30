// @vitest-environment jsdom
/**
 * The quality records (decision P-48): each register reads its QMS route, says
 * so when that read fails, and writes through the route that records the audit
 * row. A nonconformance's disposition is refused without its rationale.
 */
import * as React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

const H = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  refresh: vi.fn(),
  reads: {} as Record<string, { data: unknown; loading: boolean; error: string | null }>,
  program: null as string | null,
}));

vi.mock('../../mdx/hooks/useFetchJson', () => ({
  useFetchJson: (url: string) => ({ ...(H.reads[url] ?? { data: null, loading: true, error: null }), refresh: H.refresh }),
}));
vi.mock('../../v2/shellProject', () => ({ shellProgramId: () => H.program }));
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => ({ name: 'Q. Approver' }) }));
/* The signing dialog hands over what a signer typed (ChangeControlApproval.test.tsx). */
vi.mock('../../_shared/components/EsignModal', () => ({
  esignSignerOf: () => undefined,
  EsignModal: (p: { action: string; meanings?: string[]; onSign: (i: { meaning: string; reason: string; password: string }) => Promise<unknown> }) => (
    <div role="dialog" aria-label={p.action} data-meanings={(p.meanings ?? []).join(',')}>
      <button onClick={() => void p.onSign({ meaning: 'approval', reason: 'Re-test after column replacement confirmed a lab error.', password: 'pw' }).catch(() => undefined)}>
        stub-sign
      </button>
    </div>
  ),
}));
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...a: unknown[]) => H.apiRequest(...a),
  serverMessage: (p: { error?: string } | null) => p?.error ?? null,
  redactInternals: (m: string) => m,
}));

import { QmsRecords } from '../QmsRecords';

const NC = {
  id: 4, nc_number: 'NC-2026-004', device_name: 'Drug substance', lot_or_serial: 'B-1021', source: 'final_inspection',
  description: 'Assay out of specification at release', disposition: null, disposition_rationale: null,
  disposition_at: null, detected_at: '2026-10-20T09:00:00Z', capa_linked: false,
};

const CAPA = {
  id: 'c0ffee00-0000-4000-8000-000000000001', programId: 'p', capaCode: 'CAPA-007', title: 'Assay OOS recurrence',
  type: 'corrective', source: 'nonconformance', riskLevel: 'high', state: 'effectiveness_check',
  targetCloseDate: '2026-11-30T00:00:00Z', problemStatement: null, closedAt: null,
};

afterEach(() => { cleanup(); H.apiRequest.mockReset(); H.reads = {}; H.program = null; });

describe('Quality records', () => {
  it('lists nonconformances and dispositions one only through a signature, its reason the rationale', async () => {
    H.reads['/api/mdx/qms/nonconforming'] = { data: { data: [NC] }, loading: false, error: null };
    H.apiRequest.mockResolvedValue({ status: 201, json: async () => ({ data: { ...NC, disposition: 'rework' }, signedAt: '2026-10-29T12:00:00.000Z', meaning: 'approval' }) });
    render(<QmsRecords tab="nonconforming" onAsk={vi.fn()} />);

    expect(screen.getByText('NC-2026-004')).toBeTruthy();
    expect(screen.getByText('Awaiting disposition', { selector: '.qms-pill' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Disposition/ }));
    const drawer = screen.getByRole('dialog');
    fireEvent.change(within(drawer).getByLabelText(/^Disposition/), { target: { value: 'rework' } });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Continue to sign' }));
    // Nothing is sent until the signature.
    const signing = await screen.findByRole('dialog', { name: 'Sign disposition' });
    expect(signing.getAttribute('data-meanings')).toBe('approval,responsibility');
    expect(H.apiRequest).not.toHaveBeenCalled();

    fireEvent.click(within(signing).getByRole('button', { name: 'stub-sign' }));
    await waitFor(() => expect(H.apiRequest).toHaveBeenCalledTimes(1));
    expect(H.apiRequest).toHaveBeenCalledWith('PATCH', '/api/mdx/qms/nonconforming/4/disposition', {
      disposition: 'rework', password: 'pw', meaning: 'approval',
      reason: 'Re-test after column replacement confirmed a lab error.',
    });
    await waitFor(() => expect(screen.getByText('NC-2026-004: Rework was signed.')).toBeTruthy());
  });

  it('records a deviation\'s investigation along the server lifecycle, and closes it only by a signature (P-57)', async () => {
    const DEV = {
      id: 5, deviation_number: 'DEV-2026-001', title: 'EM excursion, Grade B room 2', description: 'Viable count above the action limit.',
      deviation_type: 'unplanned', classification: 'major', category: 'environmental', detected_date: '2026-10-20T00:00:00Z',
      location: null, batch_number: null, product_name: null, impact_level: null, investigation_status: 'in_progress',
      immediate_actions: null, root_cause: null, resolution_description: null, status: 'under_investigation',
      target_closure_date: null, actual_closure_date: null, qa_approved_by: null,
    };
    H.reads['/api/mdx/qms/deviations'] = { data: { data: [DEV] }, loading: false, error: null };
    H.reads['/api/capa-mdr/capa'] = { data: { rows: [] }, loading: false, error: null };
    H.apiRequest.mockResolvedValue({ status: 200, json: async () => ({ data: { ...DEV, status: 'pending_approval' } }) });
    const view = render(<QmsRecords tab="deviations" onAsk={vi.fn()} />);
    expect(screen.getByText('DEV-2026-001')).toBeTruthy();
    // Only the moves the server allows: from under investigation, to pending approval. No close yet.
    expect(screen.queryByRole('button', { name: /^Close$/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Investigate/ }));
    const d = screen.getByRole('dialog');
    const moves = [...(within(d).getByLabelText(/Move to/) as HTMLSelectElement).options].map((o) => o.value).filter(Boolean);
    expect(moves).toEqual(['pending_approval']);
    fireEvent.change(within(d).getByLabelText(/Move to/), { target: { value: 'pending_approval' } });
    fireEvent.change(within(d).getByLabelText(/Root cause/), { target: { value: 'HEPA seal gap.' } });
    fireEvent.change(within(d).getByLabelText(/^Resolution/), { target: { value: 'Seal replaced; room requalified.' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Record' }));
    await waitFor(() => expect(H.apiRequest).toHaveBeenCalledWith('PATCH', '/api/mdx/qms/deviations/5', {
      status: 'pending_approval', rootCause: 'HEPA seal gap.', resolutionDescription: 'Seal replaced; room requalified.',
    }));

    // Pending approval: the close is a signature.
    H.apiRequest.mockReset();
    H.apiRequest.mockResolvedValue({ status: 201, json: async () => ({ data: { ...DEV, status: 'closed' }, signedAt: '2026-10-29T12:00:00.000Z' }) });
    H.reads['/api/mdx/qms/deviations'] = { data: { data: [{ ...DEV, status: 'pending_approval', root_cause: 'HEPA seal gap.', resolution_description: 'Seal replaced.' }] }, loading: false, error: null };
    view.rerender(<QmsRecords tab="deviations" onAsk={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Close$/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Continue to sign' }));
    const signing = await screen.findByRole('dialog', { name: 'Close deviation' });
    expect(signing.getAttribute('data-meanings')).toBe('approval,responsibility');
    expect(H.apiRequest).not.toHaveBeenCalled();
    fireEvent.click(within(signing).getByRole('button', { name: 'stub-sign' }));
    await waitFor(() => expect(H.apiRequest).toHaveBeenCalledWith('POST', '/api/mdx/qms/deviations/5/close', {
      password: 'pw', meaning: 'approval', reason: 'Re-test after column replacement confirmed a lab error.',
    }));
    await waitFor(() => expect(screen.getByText('DEV-2026-001 was closed.')).toBeTruthy());
  });

  it('shows a failed supplier read as a failure, not an empty register', () => {
    H.reads['/api/mdx/qms/suppliers'] = { data: null, loading: false, error: 'HTTP 500' };
    render(<QmsRecords tab="suppliers" onAsk={vi.fn()} />);
    expect(screen.getByText('The suppliers register could not be read')).toBeTruthy();
    expect(screen.queryByText(/No suppliers recorded yet/)).toBeNull();
  });

  it("names a supplier's quality agreement by its controlled document, and records a new one by id", async () => {
    const SUPPLIER = {
      id: 9, supplier_name: 'Acme Biologics', supplier_code: 'ACM', scope: 'Drug substance', criticality: 'critical',
      approval_status: 'approved', approval_date: '2026-01-10', reapproval_date: null, last_audit_date: null,
      next_audit_date: null, iso_certifications: null, quality_agreement_id: 31,
    };
    const doc = (id: number, num: string, status: string) => ({
      id, doc_number: num, title: `Quality agreement ${num}`, doc_type: 'agreement', category: null, version: '1.0',
      status, effective_date: null, next_review_date: null, updated_at: null,
    });
    H.reads['/api/mdx/qms/suppliers'] = { data: { data: [SUPPLIER] }, loading: false, error: null };
    H.reads['/api/mdx/qms/documents'] = { data: { data: [doc(31, 'QA-0007', 'effective'), doc(32, 'QA-0008', 'effective')] }, loading: false, error: null };
    H.apiRequest.mockResolvedValue({ status: 200, json: async () => ({ data: { ...SUPPLIER, quality_agreement_id: 32 } }) });
    render(<QmsRecords tab="suppliers" onAsk={vi.fn()} />);

    expect(screen.getByText('QA-0007')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Update/ }));
    const drawer = screen.getByRole('dialog');
    fireEvent.change(within(drawer).getByLabelText(/^Quality agreement/), { target: { value: '32' } });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Record update' }));
    await waitFor(() => expect(H.apiRequest).toHaveBeenCalledTimes(1));
    expect(H.apiRequest).toHaveBeenCalledWith('PATCH', '/api/mdx/qms/suppliers/9', { qualityAgreementId: 32 });
  });

  it("signs a supplier's standing, and sends nothing before the signature", async () => {
    const PENDING = {
      id: 9, supplier_name: 'Acme Biologics', supplier_code: 'ACM', scope: null, criticality: 'critical',
      approval_status: 'pending', approval_date: null, reapproval_date: null, last_audit_date: null,
      next_audit_date: null, iso_certifications: null, quality_agreement_id: null,
    };
    H.reads['/api/mdx/qms/suppliers'] = { data: { data: [PENDING] }, loading: false, error: null };
    H.reads['/api/mdx/qms/documents'] = { data: { data: [] }, loading: false, error: null };
    H.apiRequest.mockResolvedValue({ status: 201, json: async () => ({ data: { ...PENDING, approval_status: 'approved' }, signedAt: '2026-10-29T12:00:00.000Z' }) });
    render(<QmsRecords tab="suppliers" onAsk={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Approval/ }));
    const drawer = screen.getByRole('dialog');
    fireEvent.change(within(drawer).getByLabelText(/^Standing/), { target: { value: 'approved' } });
    // An approval names its next re-approval; without it nothing goes on to the signature.
    fireEvent.click(within(drawer).getByRole('button', { name: 'Continue to sign' }));
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByText(/an approval needs its next re-approval date/)).toBeTruthy());
    const nextYear = `${new Date().getUTCFullYear() + 1}-06-30`;
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText(/^Next re-approval/), { target: { value: nextYear } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Continue to sign' }));
    const signing = await screen.findByRole('dialog', { name: 'Sign supplier standing' });
    expect(H.apiRequest).not.toHaveBeenCalled();

    fireEvent.click(within(signing).getByRole('button', { name: 'stub-sign' }));
    await waitFor(() => expect(H.apiRequest).toHaveBeenCalledWith('POST', '/api/mdx/qms/suppliers/9/approval', {
      approvalStatus: 'approved', reapprovalDate: nextYear, password: 'pw', meaning: 'approval', reason: 'Re-test after column replacement confirmed a lab error.',
    }));
    await waitFor(() => expect(screen.getByText('Acme Biologics is now approved.')).toBeTruthy());
  });

  it("says a supplier's quality agreement is unread when the controlled documents could not be read", () => {
    H.reads['/api/mdx/qms/suppliers'] = { data: { data: [{
      id: 9, supplier_name: 'Acme Biologics', supplier_code: null, scope: null, criticality: 'major',
      approval_status: 'pending', approval_date: null, reapproval_date: null, last_audit_date: null,
      next_audit_date: null, iso_certifications: null, quality_agreement_id: 31,
    }] }, loading: false, error: null };
    H.reads['/api/mdx/qms/documents'] = { data: null, loading: false, error: 'HTTP 500' };
    render(<QmsRecords tab="suppliers" onAsk={vi.fn()} />);
    expect(screen.getByText('document #31 (register not read)')).toBeTruthy();
  });

  it('moves a CAPA only along the server lifecycle, and closes it only with its effectiveness result', async () => {
    H.reads['/api/capa-mdr/capa'] = { data: { rows: [CAPA], count: 1 }, loading: false, error: null };
    H.apiRequest.mockResolvedValue({ status: 200, json: async () => ({ ...CAPA, state: 'closed_effective', meta: {} }) });
    render(<QmsRecords tab="capa" onAsk={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Advance/ }));
    const moveTo = within(screen.getByRole('dialog')).getByLabelText(/^Move to/) as HTMLSelectElement;
    expect([...moveTo.options].map((o) => o.value).filter(Boolean)).toEqual(['closed_effective', 'closed_not_effective', 'escalated']);

    fireEvent.change(moveTo, { target: { value: 'closed_effective' } });
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText(/Reason for this move/), {
      target: { value: 'Three consecutive lots released within specification after the fix.' },
    });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Record the move' }));
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByText(/needs the effectiveness check result/)).toBeTruthy());
    expect(H.apiRequest).not.toHaveBeenCalled();

    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText(/Effectiveness check result/), {
      target: { value: 'No recurrence in 3 lots.' },
    });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Record the move' }));
    await waitFor(() => expect(H.apiRequest).toHaveBeenCalledWith('POST', `/api/capa-mdr/capa/${CAPA.id}/transition`, {
      to: 'closed_effective',
      reason: 'Three consecutive lots released within specification after the fix.',
      effectivenessCheckResult: { outcome: 'effective', narrative: 'No recurrence in 3 lots.' },
    }));
    await waitFor(() => expect(screen.getByText('CAPA-007 moved to Closed, effective.')).toBeTruthy());
  });

  it('refuses to raise a CAPA with no project open', async () => {
    H.reads['/api/capa-mdr/capa'] = { data: { rows: [], count: 0 }, loading: false, error: null };
    render(<QmsRecords tab="capa" onAsk={vi.fn()} />);
    expect(screen.getByText('No CAPAs recorded yet.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Raise CAPA/ }));
    const d = screen.getByRole('dialog');
    fireEvent.change(within(d).getByLabelText(/^Title/), { target: { value: 'Supplier CoA gaps' } });
    fireEvent.click(within(d).getByRole('radio', { name: 'Corrective' }));
    fireEvent.change(within(d).getByLabelText(/Raised from/), { target: { value: 'supplier' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Raise CAPA' }));
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByText(/open a project first/)).toBeTruthy());
    expect(H.apiRequest).not.toHaveBeenCalled();
  });

  it('raises a CAPA from a nonconformance, in the open project, with the record as its source', async () => {
    H.program = '40000000-0000-4000-8000-000000000001';
    H.reads['/api/mdx/qms/nonconforming'] = { data: { data: [NC] }, loading: false, error: null };
    H.apiRequest.mockResolvedValue({ status: 201, json: async () => ({ ...CAPA, capaCode: 'CAPA-008', meta: {} }) });
    render(<QmsRecords tab="nonconforming" onAsk={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Raise CAPA/ }));
    const d = screen.getByRole('dialog');
    expect((within(d).getByLabelText(/^Title/) as HTMLInputElement).value).toBe('NC-2026-004: Assay out of specification at release');
    fireEvent.click(within(d).getByRole('radio', { name: 'Corrective' }));
    fireEvent.click(within(d).getByRole('button', { name: 'Raise CAPA' }));
    await waitFor(() => expect(H.apiRequest).toHaveBeenCalledTimes(1));
    const [method, url, body] = H.apiRequest.mock.calls[0];
    expect([method, url]).toEqual(['POST', '/api/capa-mdr/capa']);
    expect(body).toMatchObject({
      programId: H.program, type: 'corrective', source: 'nonconformance',
      sourceRefs: [{ kind: 'qms_nonconforming_product', id: '4', label: 'NC-2026-004' }],
    });
    await waitFor(() => expect(screen.getByText('CAPA-008 was raised from NC-2026-004.')).toBeTruthy());
  });

  it('completes a CAPA action only with its evidence, along the server action lifecycle', async () => {
    H.reads['/api/capa-mdr/capa'] = { data: { rows: [CAPA], count: 1 }, loading: false, error: null };
    H.reads[`/api/capa-mdr/capa/${CAPA.id}`] = {
      data: { ...CAPA, actions: [{ id: 'a1', n: 1, type: 'corrective', description: 'Replace the HPLC column', owner: 'QC', dueDate: null, state: 'in_progress', completedAt: null }] },
      loading: false, error: null,
    };
    H.apiRequest.mockResolvedValue({ status: 200, json: async () => ({ id: 'a1', n: 1, state: 'done', meta: {} }) });
    render(<QmsRecords tab="capa" onAsk={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'CAPA-007' }));
    expect(screen.getByText('Replace the HPLC column')).toBeTruthy();
    const moves = ['Done', 'Blocked', 'Cancelled'].map((n) => screen.getByRole('button', { name: n }));
    expect(moves).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Planned' })).toBeNull();

    fireEvent.click(moves[0]);
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText(/Evidence of completion/), { target: { value: '   ' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Record the move' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(H.apiRequest).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();

    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText(/Evidence of completion/), { target: { value: 'Column log CL-22, re-test report TR-118' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Record the move' }));
    await waitFor(() => expect(H.apiRequest).toHaveBeenCalledWith('POST', '/api/capa-mdr/capa/actions/a1/transition', {
      to: 'done', evidenceRefs: [{ kind: 'reference', label: 'Column log CL-22, re-test report TR-118' }],
    }));
    await waitFor(() => expect(screen.getByText('Action 1 is done.')).toBeTruthy());
  });

  it('records a management-review action and closes it only with its note', async () => {
    const REVIEW = { id: 3, review_date: '2026-10-01', period: 'H2-2026', inputs: null, outputs: { decisions: 'Staff QA', actions: [
      { n: 1, description: 'Appoint a QA lead', owner: 'CEO', dueDate: '2026-12-01', state: 'open' },
    ] }, open_action_count: 1, closed_action_count: 0 };
    H.reads['/api/mdx/qms/management-reviews'] = { data: { data: [REVIEW] }, loading: false, error: null };
    H.apiRequest.mockResolvedValue({ status: 200, json: async () => ({ data: { ...REVIEW, outputs: { actions: [{ ...REVIEW.outputs.actions[0], state: 'closed' }] } } }) });
    render(<QmsRecords tab="reviews" onAsk={vi.fn()} />);
    expect(screen.getByText('1 open · 0 closed')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'H2-2026' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText(/How it was closed/), { target: { value: 'short' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close action' }));
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByText(/closure note of at least/)).toBeTruthy());
    expect(H.apiRequest).not.toHaveBeenCalled();

    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText(/How it was closed/), { target: { value: 'QA lead started on 2026-11-15' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close action' }));
    await waitFor(() => expect(H.apiRequest).toHaveBeenCalledWith('POST', '/api/mdx/qms/management-reviews/3/actions/1/close', {
      closureNote: 'QA lead started on 2026-11-15',
    }));
    await waitFor(() => expect(screen.getByText('Action 1 was closed.')).toBeTruthy());
  });

  it('shows the CAPA raised from a nonconformance, from the CAPA register, and never "none" over an unread register', () => {
    H.reads['/api/mdx/qms/nonconforming'] = { data: { data: [NC, { ...NC, id: 5, nc_number: 'NC-2026-005' }] }, loading: false, error: null };
    H.reads['/api/capa-mdr/capa'] = { data: { rows: [{ ...CAPA, capaCode: 'CAPA-008', sourceRefs: [{ kind: 'qms_nonconforming_product', id: '4', label: 'NC-2026-004' }] }] }, loading: false, error: null };
    render(<QmsRecords tab="nonconforming" onAsk={vi.fn()} />);
    const row = (nc: string) => screen.getByText(nc).closest('.qms-row') as HTMLElement;
    expect(within(row('NC-2026-004')).getByText('CAPA-008')).toBeTruthy();
    expect(within(row('NC-2026-005')).queryByText(/CAPA-/)).toBeNull();
    cleanup();

    H.reads['/api/capa-mdr/capa'] = { data: null, loading: false, error: 'HTTP 500' };
    render(<QmsRecords tab="nonconforming" onAsk={vi.fn()} />);
    expect(within(screen.getByText('NC-2026-004').closest('.qms-row') as HTMLElement).getByText('not read')).toBeTruthy();
  });

  it('tells the shell for AnA what the register read, and that a failed read is a failure', async () => {
    H.reads['/api/mdx/qms/nonconforming'] = { data: { data: [NC] }, loading: false, error: null };
    const onContext = vi.fn();
    render(<QmsRecords tab="nonconforming" onAsk={vi.fn()} onContext={onContext} />);
    await waitFor(() => expect(onContext).toHaveBeenLastCalledWith(expect.objectContaining({ tab: 'nonconforming', state: 'ready', count: 1 })));
    const ctx = onContext.mock.calls.at(-1)![0];
    expect(ctx.records).toEqual([expect.objectContaining({ nonconformance: 'NC-2026-004', disposition: 'awaiting disposition', lot: 'B-1021' })]);
    expect(ctx.counts).toContainEqual({ label: 'Awaiting disposition', val: '1' });
    cleanup();

    H.reads['/api/mdx/qms/nonconforming'] = { data: null, loading: false, error: 'HTTP 500' };
    const failed = vi.fn();
    render(<QmsRecords tab="nonconforming" onAsk={vi.fn()} onContext={failed} />);
    await waitFor(() => expect(failed).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'failed', count: null, records: [] })));
  });
});
