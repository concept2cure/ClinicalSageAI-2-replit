// @vitest-environment jsdom
/** The existing Builder completes study metadata without replacing the source leaf. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { apiRequest, auth } = vi.hoisted(() => ({ apiRequest: vi.fn(), auth: { revision: 1, actor: 7 } }));
vi.mock('@/lib/queryClient', async (original) => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', () => ({ authService: {
  getUser: () => ({ id: auth.actor, organizationId: 4 }),
  captureSessionReadGuard: () => { const revision = auth.revision; return { sameRevision: () => revision === auth.revision }; },
  on: () => () => {},
} }));
import { BuilderWorkspace } from '../surfaces/SubmissionSeqWorkspaces';

const SEQ = { id: 21, sequenceNumber: '0000', type: 'original', status: 'assembling', region: 'fda', validationStatus: null };
const LEAF = { id: 62, sequenceId: 21, sectionCode: '5.3.5.1', title: 'Study report', lifecycleOp: 'new',
  granularity: null, documentTable: 'vault_documents', documentId: null, documentUuid: 'source-uuid', documentType: null,
  studyId: 'OLD-101', stfFileTag: 'study-report-body', updatedAt: '2026-10-20T10:00:00.000Z' };
const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
const receipt = (extra = {}) => ({ ...LEAF, studyId: 'STUDY-101', stfFileTag: 'human-review-tag',
  updatedAt: '2026-10-20T11:00:00.000Z', auditTrail: { persisted: true, chained: true }, ...extra });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
let stored: Record<string, unknown>;
function setup(write = async () => ok(receipt())) {
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'PUT') return write();
    if (path.split('?')[0].endsWith('/leaves')) return ok([stored]);
    if (path.endsWith('/history')) return ok({ entries: [], chain: { ok: true, rowsChecked: 0 }, truncated: false });
    return ok([]);
  });
}
async function edit() {
  fireEvent.click(await screen.findByRole('button', { name: 'Edit study tagging for leaf 5.3.5.1 Study report' }));
  fireEvent.change(screen.getByLabelText('Study id'), { target: { value: 'STUDY-101' } });
  fireEvent.change(screen.getByLabelText('STF file-tag'), { target: { value: 'human-review-tag' } });
  fireEvent.change(screen.getByLabelText(/Reason for/), { target: { value: 'Record the sponsor reviewed study identity' } });
}
const writes = () => apiRequest.mock.calls.filter(c => c[0] === 'PUT');
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save study tagging' }));

beforeEach(() => { apiRequest.mockReset(); stored = { ...LEAF }; auth.revision = 1; auth.actor = 7; });
afterEach(cleanup);

describe('Builder study tagging on the existing leaf', () => {
  it('displays recorded metadata even when the sequence is immutable', async () => {
    setup(); render(<BuilderWorkspace seq={{ ...SEQ, status: 'frozen' }} />);
    expect(await screen.findByText('OLD-101')).toBeTruthy();
    expect(screen.getByText('study-report-body')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Edit study tagging/ })).toBeNull();
  });

  it('requires a reason, sends only metadata plus exact optimistic expectations, and refreshes after confirmation', async () => {
    setup(); render(<BuilderWorkspace seq={SEQ} />); await edit();
    fireEvent.change(screen.getByLabelText(/Reason for/), { target: { value: '' } }); save(); expect(writes()).toHaveLength(0);
    fireEvent.change(screen.getByLabelText(/Reason for/), { target: { value: 'Record the sponsor reviewed study identity' } }); save();
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual(['PUT', '/api/submissions/sequences/21/leaves', {
      leafId: 62, sectionCode: '5.3.5.1', title: 'Study report', studyId: 'STUDY-101', stfFileTag: 'human-review-tag',
      reason: 'Record the sponsor reviewed study identity', studyTaggingEdit: {
        expectedStudyId: 'OLD-101', expectedStfFileTag: 'study-report-body', expectedUpdatedAt: LEAF.updatedAt,
      },
    }]);
    expect(await screen.findByText(/Study tagging saved.*server-confirmed/)).toBeTruthy();
    expect(apiRequest.mock.calls.filter(c => c[1].endsWith('/history')).length).toBeGreaterThan(1);
  });

  it('sends explicit nulls to clear both values rather than omitting them', async () => {
    setup(async () => ok(receipt({ studyId: null, stfFileTag: null })));
    render(<BuilderWorkspace seq={SEQ} />); await edit();
    fireEvent.change(screen.getByLabelText('Study id'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('STF file-tag'), { target: { value: '' } }); save();
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0][2]).toMatchObject({ studyId: null, stfFileTag: null });
    expect(await screen.findByText(/Study tagging saved.*server-confirmed/)).toBeTruthy();
  });

  it('reports a confirmed no-op without claiming a new write', async () => {
    setup(async () => ok(receipt({ unchanged: true, auditTrail: null })));
    render(<BuilderWorkspace seq={SEQ} />); await edit(); save();
    expect(await screen.findByText(/Study tagging is unchanged.*Nothing was recorded/)).toBeTruthy();
    expect(screen.queryByText(/Study tagging saved/)).toBeNull();
  });

  it('warns when metadata committed but the audit is not confirmed and propagates sequence demotion', async () => {
    const changed = vi.fn(); setup(async () => ok(receipt({ auditTrail: { persisted: false, chained: false }, sequenceStatusChanged: { from: 'validated', to: 'draft' } })));
    render(<BuilderWorkspace seq={{ ...SEQ, status: 'validated' }} onSequenceChanged={changed} />); await edit(); save();
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    expect(changed.mock.calls[0][0]).toMatchObject({ tone: 'warn' });
    expect(changed.mock.calls[0][0].text).toMatch(/audit.*not confirmed/);
    expect(changed.mock.calls[0][0].text).toMatch(/validate it again/);
  });

  it('warns separately when the leaf audit stands but the sequence transition audit is unconfirmed', async () => {
    const changed = vi.fn(); setup(async () => ok(receipt({ sequenceStatusChanged: {
      from: 'validated', to: 'assembling', auditTrail: { persisted: true, chained: false },
    } })));
    render(<BuilderWorkspace seq={{ ...SEQ, status: 'validated' }} onSequenceChanged={changed} />); await edit(); save();
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    expect(changed.mock.calls[0][0]).toMatchObject({ tone: 'warn' });
    expect(changed.mock.calls[0][0].text).toMatch(/sequence transition audit.*not confirmed/i);
  });

  it.each([
    { id: 999 }, { sequenceId: 99 }, { studyId: 'OTHER-STUDY' }, { stfFileTag: undefined },
  ])('does not accept a mismatched or incomplete metadata receipt: %j', async mismatch => {
    setup(async () => ok(receipt(mismatch))); render(<BuilderWorkspace seq={SEQ} />); await edit(); save();
    expect(await screen.findByText(/cannot confirm whether the study tagging was recorded/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save study tagging' })).toHaveProperty('disabled', true);
    expect(screen.queryByText(/Study tagging saved/)).toBeNull();
  });

});

describe('Builder study tagging reconciliation', () => {
  it('holds an unknown outcome until explicit successful reread; preserves inputs and never replays the write', async () => {
    setup(async () => { throw new TypeError('network lost'); }); render(<BuilderWorkspace seq={SEQ} />); await edit(); save();
    await screen.findByText(/cannot confirm whether the study tagging was recorded/i);
    expect(writes()).toHaveLength(1);
    stored = { ...LEAF, studyId: 'CONCURRENT-202', stfFileTag: 'other-tag', updatedAt: '2026-10-20T12:00:00.000Z' };
    fireEvent.click(screen.getByRole('button', { name: 'Reread current leaf' }));
    await screen.findByText(/Current study tagging was reread/);
    expect(screen.getByLabelText('Study id')).toHaveProperty('value', 'STUDY-101');
    expect(screen.getByLabelText('STF file-tag')).toHaveProperty('value', 'human-review-tag');
    expect(screen.getByLabelText(/Reason for/)).toHaveProperty('value', 'Record the sponsor reviewed study identity');
    expect(writes()).toHaveLength(1);
    save(); await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1][2]).toMatchObject({ studyTaggingEdit: {
      expectedStudyId: 'CONCURRENT-202', expectedStfFileTag: 'other-tag', expectedUpdatedAt: stored.updatedAt,
    } });
  });

  it('keeps uncertainty and entered values after an unverifiable reread', async () => {
    setup(async () => { throw new TypeError('network lost'); }); render(<BuilderWorkspace seq={SEQ} />); await edit(); save();
    await screen.findByText(/cannot confirm whether the study tagging was recorded/i);
    stored = { ...LEAF, updatedAt: undefined };
    fireEvent.click(screen.getByRole('button', { name: 'Reread current leaf' }));
    await screen.findByText(/current leaf could not be verified/i);
    expect(screen.getByRole('button', { name: 'Save study tagging' })).toHaveProperty('disabled', true);
    expect(screen.getByLabelText('Study id')).toHaveProperty('value', 'STUDY-101');
    expect(writes()).toHaveLength(1);
  });

  it('refreshes parent status and history on confirmed no-op after an earlier unknown write', async () => {
    let attempt = 0; const changed = vi.fn();
    setup(async () => { if (++attempt === 1) throw new TypeError('network lost'); return ok(receipt({ unchanged: true, auditTrail: null })); });
    render(<BuilderWorkspace seq={{ ...SEQ, status: 'validated' }} onSequenceChanged={changed} />); await edit(); save();
    await screen.findByText(/cannot confirm whether the study tagging was recorded/i);
    stored = receipt(); fireEvent.click(screen.getByRole('button', { name: 'Reread current leaf' }));
    await screen.findByText(/Current study tagging was reread/); expect(changed).not.toHaveBeenCalled(); save();
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    expect(changed.mock.calls[0][0].text).toMatch(/earlier.*audit.*not confirmed/i);
    await waitFor(() => expect(apiRequest.mock.calls.filter(c => c[1].endsWith('/history')).length).toBeGreaterThan(1));
  });

  it('rereads parent state on explicit close after an unknown write without silently saving', async () => {
    const changed = vi.fn(); setup(async () => { throw new TypeError('network lost'); });
    render(<BuilderWorkspace seq={SEQ} onSequenceChanged={changed} />); await edit(); save();
    await screen.findByText(/cannot confirm whether the study tagging was recorded/i);
    fireEvent.click(screen.getByRole('button', { name: 'Close study tagging' }));
    expect(changed).toHaveBeenCalledOnce(); expect(writes()).toHaveLength(1);
    expect(changed.mock.calls[0][0].text).toMatch(/earlier.*not confirmed/i);
  });

  it('reviews a concurrently moved or retitled leaf and submits its current identity without losing entered values', async () => {
    let attempt = 0;
    setup(async () => { if (++attempt === 1) throw new TypeError('network lost'); return ok(receipt({ sectionCode: '5.3.5.2', title: 'Reclassified report' })); });
    render(<BuilderWorkspace seq={SEQ} />); await edit(); save();
    await screen.findByText(/cannot confirm whether the study tagging was recorded/i);
    stored = { ...LEAF, sectionCode: '5.3.5.2', title: 'Reclassified report', updatedAt: '2026-10-20T12:00:00.000Z' };
    fireEvent.click(screen.getByRole('button', { name: 'Reread current leaf' }));
    await screen.findByText(/Current leaf: 5.3.5.2.*Reclassified report/);
    expect(screen.getByLabelText('Study id')).toHaveProperty('value', 'STUDY-101');
    expect(writes()).toHaveLength(1); save(); await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes()[1][2]).toMatchObject({ leafId: 62, sectionCode: '5.3.5.2', title: 'Reclassified report' });
    expect(await screen.findByText(/Study tagging saved.*server-confirmed/)).toBeTruthy();
  });

  it('carries the selected submission and project on initial and reconciliation leaf reads', async () => {
    setup(async () => { throw new TypeError('network lost'); });
    render(<BuilderWorkspace seq={SEQ} submission={{ id: 12, title: 'IND', applicationType: 'IND', primaryRegion: 'fda', programId: '11111111-1111-4111-8111-111111111111' }} />);
    await edit(); save(); await screen.findByText(/cannot confirm whether the study tagging was recorded/i);
    fireEvent.click(screen.getByRole('button', { name: 'Reread current leaf' })); await screen.findByText(/Current study tagging was reread/);
    const reads = apiRequest.mock.calls.filter(c => c[0] === 'GET' && c[1].includes('/leaves'));
    expect(reads).toHaveLength(2);
    for (const call of reads) {
      const url = new URL(call[1], 'https://fixture.invalid');
      expect(url.searchParams.get('submissionId')).toBe('12');
      expect(url.searchParams.get('programId')).toBe('11111111-1111-4111-8111-111111111111');
    }
  });

});

describe('Builder study tagging read ownership', () => {
  it('does not fabricate optimistic expectations for legacy rows lacking metadata/timestamps', async () => {
    stored = { ...LEAF, studyId: undefined, updatedAt: undefined }; setup(); render(<BuilderWorkspace seq={SEQ} />); await edit();
    expect(screen.getByRole('button', { name: 'Save study tagging' })).toHaveProperty('disabled', true);
    expect(screen.getByText(/Reread the current leaf before saving/)).toBeTruthy(); expect(writes()).toHaveLength(0);
  });

  it('discards an old write receipt after project A to B to A, even with the same leaf id', async () => {
    const pending = deferred<Response>(); setup(() => pending.promise);
    const view = render(<BuilderWorkspace seq={SEQ} scopeContext="project-A" />); await edit(); save();
    view.rerender(<BuilderWorkspace seq={SEQ} scopeContext="project-B" />);
    view.rerender(<BuilderWorkspace seq={SEQ} scopeContext="project-A" />);
    await act(async () => { pending.resolve(ok(receipt())); });
    expect(screen.queryByText(/Study tagging saved/)).toBeNull();
  });

  it('discards a late refusal after an actor revision change', async () => {
    const pending = deferred<Response>(); setup(() => pending.promise);
    const view = render(<BuilderWorkspace seq={SEQ} />); await edit(); save();
    auth.actor = 8; auth.revision += 1; view.rerender(<BuilderWorkspace seq={SEQ} />);
    await act(async () => { pending.resolve(new Response(JSON.stringify({ error: 'Old actor refusal' }), { status: 409 })); });
    expect(screen.queryByText(/Old actor refusal/)).toBeNull();
  });
});
