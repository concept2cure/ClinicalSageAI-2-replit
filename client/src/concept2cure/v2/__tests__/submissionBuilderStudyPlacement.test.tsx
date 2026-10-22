// @vitest-environment jsdom
/** Study reports must carry reviewed metadata through the existing Builder PUT. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { apiRequest, auth } = vi.hoisted(() => ({ apiRequest: vi.fn(), auth: { revision: 1 } }));
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', () => ({ authService: {
  getUser: () => ({ id: 7, organizationId: 4 }),
  captureSessionReadGuard: () => { const revision = auth.revision; return { sameRevision: () => revision === auth.revision }; },
  on: () => () => {},
} }));
import { BuilderWorkspace } from '../surfaces/SubmissionSeqWorkspaces';

const SEQ = { id: 21, sequenceNumber: '0000', type: 'original', status: 'assembling', region: 'fda', validationStatus: null };
const DOCS = [{ id: 8, title: 'Study report', moduleNumber: '5.3.5.1', status: 'approved' },
  { id: 9, title: 'Other report', moduleNumber: '5.3.5.1', status: 'approved' }];
const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
const receipt = (extra = {}) => ({ id: 62, sequenceId: 21, sectionCode: '5.3.5.1', title: DOCS[0].title,
  lifecycleOp: 'new', documentTable: 'coauthor_documents', documentId: 8,
  studyId: 'STUDY-101', stfFileTag: 'human-review-tag', auditTrail: { persisted: true, chained: true }, ...extra });
const writes = () => apiRequest.mock.calls.filter(c => c[0] === 'PUT');
function setup(write = async () => ok(receipt())) {
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method === 'PUT') return write();
    if (path.split('?')[0].endsWith('/leaves')) return ok([]);
    if (path.endsWith('/history')) return ok({ entries: [], chain: { ok: true, rowsChecked: 0 }, truncated: false });
    if (path.startsWith('/api/coauthor/documents')) return ok({ documents: DOCS, total: 2, returned: 2, offset: 0 });
    return ok([]);
  });
}
async function open(seq = SEQ) {
  render(<BuilderWorkspace seq={seq} />);
  fireEvent.click(await screen.findByRole('button', { name: /Place a Co-Author document as a leaf/ }));
  fireEvent.change(await screen.findByLabelText('Source document'), { target: { value: '8' } });
  fireEvent.change(screen.getByLabelText(/Reason for/), { target: { value: 'Place the sponsor reviewed study report' } });
}
function tag() {
  fireEvent.change(screen.getByLabelText('Study id'), { target: { value: ' STUDY-101 ' } });
  fireEvent.change(screen.getByLabelText('STF file-tag'), { target: { value: ' human-review-tag ' } });
}
const place = () => fireEvent.click(screen.getByRole('button', { name: 'Place leaf in the sequence' }));
beforeEach(() => { apiRequest.mockReset(); auth.revision = 1; });
afterEach(cleanup);

describe('Builder study placement inputs', () => {
  it('requires both values before placing an FDA study report', async () => {
    setup(); await open();
    expect(screen.getByRole('button', { name: 'Place leaf in the sequence' })).toHaveProperty('disabled', true);
    place(); expect(writes()).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Study id'), { target: { value: 'STUDY-101' } });
    place(); expect(writes()).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('STF file-tag'), { target: { value: 'human-review-tag' } }); place();
    await waitFor(() => expect(writes()).toHaveLength(1));
  });
  it('places the exact reviewed pair through the existing writer and checks its receipt', async () => {
    setup(); await open(); tag(); place();
    expect(await screen.findByText(/Leaf 5.3.5.1 placed.*server-confirmed/)).toBeTruthy();
    expect(writes()[0]).toEqual(['PUT', '/api/submissions/sequences/21/leaves', {
      sectionCode: '5.3.5.1', title: 'Study report', lifecycleOp: 'new', documentTable: 'coauthor_documents', documentId: 8,
      reason: 'Place the sponsor reviewed study report', studyId: 'STUDY-101', stfFileTag: 'human-review-tag',
    }]);
  });
  it('refuses a study id that cannot form the existing STF filename', async () => {
    setup(); await open(); tag();
    fireEvent.change(screen.getByLabelText('Study id'), { target: { value: 'STUDY/101' } }); place();
    expect(writes()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Place leaf in the sequence' })).toHaveProperty('disabled', true);
  });
  it('clears manually reviewed values when the source or canonical section changes', async () => {
    setup(); await open(); tag();
    fireEvent.change(screen.getByLabelText('Source document'), { target: { value: '9' } });
    expect(screen.getByLabelText('Study id')).toHaveProperty('value', '');
    tag(); fireEvent.change(screen.getByLabelText('Section code'), { target: { value: '5.3.5.2' } });
    expect(screen.getByLabelText('STF file-tag')).toHaveProperty('value', '');
  });
  it.each(['4.3', '5.2', '5.3.6', '5.4', '2.5'])('preserves placement without tags for exempt section %s', async sectionCode => {
    setup(async () => ok(receipt({ sectionCode, studyId: null, stfFileTag: null })));
    await open(); fireEvent.change(screen.getByLabelText('Section code'), { target: { value: sectionCode } }); place();
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0][2]).not.toHaveProperty('studyId');
    expect(screen.queryByLabelText('Study id')).toBeNull();
  });
  it('retains the existing non-US advisory and delete exemptions', async () => {
    setup(async () => ok(receipt({ lifecycleOp: 'delete', studyId: null, stfFileTag: null })));
    await open({ ...SEQ, region: 'eu', type: 'amendment', sequenceNumber: '0001' });
    expect(screen.getByRole('button', { name: 'Place leaf in the sequence' })).toHaveProperty('disabled', false);
    tag(); fireEvent.change(screen.getByLabelText('Lifecycle operation'), { target: { value: 'delete' } }); place();
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0][2]).not.toHaveProperty('studyId');
  });
});

describe('Builder study placement confirmation', () => {
  it.each([{ stfFileTag: undefined }, { studyId: 'OTHER' }, { documentId: 9 }, { sequenceId: 99 }])('holds incomplete/mismatched receipts: %j', async mismatch => {
    setup(async () => ok(receipt(mismatch))); await open(); tag(); place();
    await screen.findByText(/cannot confirm whether the leaf was placed/i);
    expect(screen.getByLabelText('Study id')).toHaveProperty('value', ' STUDY-101 ');
    expect(screen.getByRole('button', { name: 'Place leaf in the sequence' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Check sequence leaves' })).toBeTruthy();
    place(); expect(writes()).toHaveLength(1);
    expect(screen.queryByText(/placed.*server-confirmed/)).toBeNull();
  });
  it.each([204, 200, 408])('holds a bodyless success or an uncertain failure (HTTP %s)', async status => {
    setup(async () => status === 204 ? new Response(null, { status }) : new Response(status === 200 ? '' : '{"message":"Request timed out"}', { status }));
    await open(); tag(); place();
    await screen.findByText(/cannot confirm whether the leaf was placed/i);
    expect(screen.getByLabelText('Source document')).toHaveProperty('disabled', true);
    expect(screen.getByLabelText('STF file-tag')).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Check sequence leaves' }));
    await screen.findByRole('button', { name: /Place a Co-Author document as a leaf/ });
    expect(writes()).toHaveLength(1);
  });
  it('keeps a definite refusal retryable and distinguishes a no-op', async () => {
    let attempt = 0;
    setup(async () => ++attempt === 1 ? new Response('{"message":"The source is locked"}', { status: 409 }) : ok(receipt({ unchanged: true, auditTrail: null })));
    await open(); tag(); place();
    await screen.findByText(/The leaf was not placed/);
    expect(screen.getByRole('button', { name: 'Place leaf in the sequence' })).toHaveProperty('disabled', false); place();
    expect(await screen.findByText(/Nothing was placed, so nothing was recorded/)).toBeTruthy();
    expect(writes()).toHaveLength(2);
  });
  it('warns independently about unconfirmed sequence-transition audit', async () => {
    setup(async () => ok(receipt({ sequenceStatusChanged: { from: 'validated', to: 'assembling', auditTrail: { persisted: true, chained: false } } })));
    await open(); tag(); place();
    expect(await screen.findByText(/sequence transition audit entry is not confirmed/)).toBeTruthy();
  });
  it('does not start placement using an expired actor session', async () => {
    setup(); await open(); tag(); auth.revision += 1; place();
    expect(writes()).toHaveLength(0);
  });
});

describe('Builder placement ownership during a request', () => {
  it('keeps inputs inert and discards a late receipt after an actor revision change', async () => {
    let release!: (value: Response) => void;
    setup(() => new Promise(resolve => { release = resolve; }));
    await open(); tag(); place();
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(screen.getByLabelText('Source document')).toHaveProperty('disabled', true);
    expect(screen.getByLabelText('Study id')).toHaveProperty('disabled', true);
    auth.revision += 1;
    await act(async () => { release(ok(receipt())); });
    expect(screen.queryByText(/placed.*server-confirmed/)).toBeNull();
    expect(writes()).toHaveLength(1);
  });
});
