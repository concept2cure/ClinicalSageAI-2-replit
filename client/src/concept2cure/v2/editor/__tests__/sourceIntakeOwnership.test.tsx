// @vitest-environment jsdom
/** Real intake/auth/shell owners; only HTTP and saved records are synthetic. */
import React from 'react';
import { flushSync } from 'react-dom';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthoringSourceImportData, AuthoringSourceImportPreviewData, BinaryImportOrigin, WorkflowImportSource } from '@shared/authoring/source-import';
import { authService } from '@/services/portal/authService';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
import { SourceImportDialog } from '../SourceImportDialog';
import { clearShellProject, publishShellProject } from '../../shellProject';
import { useSourceIntake } from '../useSourceIntake';

const PROGRAM = '11111111-1111-4111-8111-111111111781';
const OTHER = '11111111-1111-4111-8111-111111111782';
const DOC = '22222222-2222-4222-8222-222222222781';
const SECTION = '33333333-3333-4333-8333-333333333781';
const SOURCE = { kind: 'data-room' as const, sourceId: 42 };
const WORKFLOW: WorkflowImportSource = { kind: 'csr', jobId: 14, sectionNumbers: ['11'] };
const HASH = 'ab'.repeat(32);
const ACTOR = { id: '7', organizationId: '12', roles: ['admin'], permissions: ['governed:write'] };
const bearer = (visit = 'initial', id = 7) => `fixture.${btoa(JSON.stringify({ userId: id, organizationId: 12, visit }))}.synthetic`;
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const success = (data: unknown) => response({ success: true, data });
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve }; }
const binaryOrigin: BinaryImportOrigin = { kind: 'data-room', id: '42', programId: PROGRAM, title: 'Saved diagnostics evidence',
  fileName: 'evidence.pdf', mimeType: 'application/pdf', sha256: HASH, documentType: 'Report', sectionCode: null, conversion: 'extracted-text' };
const preview: AuthoringSourceImportPreviewData = { preview: true, fingerprint: HASH,
  origin: { kind: 'csr', id: '14', selection: WORKFLOW, programId: PROGRAM, title: 'Saved CSR', version: 'v1',
    documentType: null, sectionCode: null, fingerprint: HASH, conversion: 'ich-e3-sections', gaps: [],
    sourceScope: { level: 'program', programId: PROGRAM, projectId: 2 }, association: { mode: 'recorded', reason: null },
    sectionOrigins: [{ code: 'CSR_11', sourceRowId: '31', contentSha256: HASH, originalAuthorship: 'unknown', model: null, modelEvidence: 'unrecorded' }] },
  sections: [{ code: 'CSR_11', title: 'Efficacy', contentSha256: HASH }], gaps: [], warnings: [], target: { programId: PROGRAM, projectId: 2 },
  association: { mode: 'recorded', required: false, reasonRequired: false, sourceProgramId: PROGRAM, sourceProjectId: 2, targetProgramId: PROGRAM } };
function saved(workflow = false): AuthoringSourceImportData {
  const origin = workflow ? preview.origin : binaryOrigin;
  return { doc: { id: DOC, title: origin.title, tenant_id: 12, client_program_id: PROGRAM, created_by: 7,
    status: 'DRAFT', module: null, product_code: null, updated_at: '2026-10-23T00:00:00Z', section_count: 1,
    c2c_document_id: null, readScope: 'document', sourceMetadataState: 'available',
    provenance: { source: 'import', importSource: { ...origin, reason: 'Review saved source evidence', warnings: [] } } },
    sections: [{ id: SECTION, doc_id: DOC, tenant_id: 12, code: workflow ? 'CSR_11' : 'source.1', title: 'Saved section',
      content: '<p>Recorded source text</p>', order_index: 0, updated_at: null }], origin, warnings: [], reused: false };
}
function dialog(props: Partial<React.ComponentProps<typeof SourceImportDialog>> = {}) {
  return <SourceImportDialog programId={PROGRAM} source={SOURCE} title="Saved evidence" onClose={() => {}} {...props} />;
}
function create() {
  fireEvent.change(screen.getByLabelText('Reason for creating a working copy'), { target: { value: 'Review saved source evidence' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create working copy' }));
}
function changeOwner(kind: string) {
  if (kind === 'account') act(() => authService.setToken(bearer('other-account', 8), { ...ACTOR, id: '8' }, 'other', 3600));
  if (kind === 'session') act(() => authService.setToken(bearer('replacement'), ACTOR, 'replacement', 3600));
  if (kind === 'bearer') act(() => setAuthToken(bearer('unadopted')));
  if (kind === 'project') act(() => { publishShellProject({ id: OTHER }); publishShellProject({ id: PROGRAM }); });
}
async function refresh() {
  vi.stubGlobal('fetch', vi.fn(async () => response({ accessToken: bearer('refreshed'), refreshToken: 'rotated', expiresIn: 3600 })));
  await act(async () => { expect(await authService.refreshToken()).toBe(true); });
}
const typedUnknown = (overrides: Record<string, unknown> = {}) => ({ success: false, ok: false, code: 'AUTHORING_CREATE_COMMIT_UNCONFIRMED',
  creationOutcome: 'unconfirmed', retryAllowed: false, error: 'Check the original working document before creating another copy.',
  recovery: { documentId: DOC, organizationId: 12, programId: PROGRAM }, ...overrides });
function installReads(data = saved()) {
  apiRequest.mockImplementation(async (method: string, path: string) => {
    if (method !== 'GET') throw new Error('No additional import write was authorized');
    const url = new URL(path, 'http://localhost');
    if (url.pathname === '/api/authoring/docs') return response({ success: true, documents: [{ ...data.doc, program_id: PROGRAM }] });
    if (url.pathname === `/api/authoring/docs/${DOC}`) return response({ success: true, document: data.doc, access: { edit: { allowed: true } } });
    if (url.pathname === `/api/authoring/docs/${DOC}/sections`) return response({ success: true, sections: data.sections, readScope: 'document' });
    throw new Error(`Unexpected recovery read ${path}`);
  });
}
beforeEach(() => {
  authService.endSession(null); clearAuthToken(); localStorage.clear(); sessionStorage.clear();
  authService.setToken(bearer(), ACTOR, 'fixture-refresh', 3600); publishShellProject({ id: PROGRAM }); apiRequest.mockReset();
});
afterEach(() => { cleanup(); authService.endSession(null); clearAuthToken(); clearShellProject(); localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); });

describe('source intake owns one signed-in source/project visit', () => {
  it.each(['account', 'session', 'bearer', 'project'])('discards a late workflow preview after %s replacement', async kind => {
    const pending = deferred<Response>(); apiRequest.mockReturnValue(pending.promise); render(dialog({ source: WORKFLOW }));
    changeOwner(kind); await act(async () => { pending.resolve(success(preview)); await pending.promise; });
    expect(screen.queryByTestId('workflow-import-preview')).toBeNull();
    expect(screen.queryByLabelText('Reason for creating a working copy')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Close' }).length).toBeGreaterThan(0);
  });
  it.each(['account', 'session', 'bearer', 'project'])('discards a late saved receipt after %s replacement', async kind => {
    const pending = deferred<Response>(); apiRequest.mockReturnValue(pending.promise); const onOpenDocument = vi.fn(); render(dialog({ onOpenDocument }));
    create(); changeOwner(kind); await act(async () => { pending.resolve(success(saved())); await pending.promise; });
    expect(screen.queryByTestId('source-import-result')).toBeNull(); expect(onOpenDocument).not.toHaveBeenCalled();
  });
  it('checks ownership again after a successful response body is delayed', async () => {
    const body = deferred<unknown>(); apiRequest.mockResolvedValue({ ok: true, status: 201, json: () => body.promise });
    render(dialog()); create(); await act(async () => { await Promise.resolve(); }); changeOwner('account');
    await act(async () => { body.resolve({ success: true, data: saved() }); await body.promise; });
    expect(screen.queryByTestId('source-import-result')).toBeNull();
  });
  it('keeps the original request headers and accepts a canonical refreshed response', async () => {
    const pending = deferred<Response>(); apiRequest.mockReturnValue(pending.promise); render(dialog()); create();
    const original = bearer(); await refresh(); await act(async () => { pending.resolve(success(saved())); await pending.promise; });
    expect(screen.getByTestId('source-import-result')).toBeTruthy();
    expect(apiRequest.mock.calls[0][3]).toEqual({ Authorization: `Bearer ${original}`, 'x-organization-id': '12' });
  });
  it('keeps a preview and reason through canonical refresh, then uses the adopted bearer for the next create', async () => {
    apiRequest.mockResolvedValueOnce(success(preview)).mockResolvedValueOnce(success(saved(true))); render(dialog({ source: WORKFLOW }));
    await screen.findByTestId('workflow-import-preview');
    fireEvent.change(screen.getByLabelText('Reason for creating a working copy'), { target: { value: 'Review saved source evidence' } });
    await refresh(); expect(screen.getByTestId('workflow-import-preview')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create working copy' })); await screen.findByTestId('source-import-result');
    expect(apiRequest.mock.calls[1][3]).toEqual({ Authorization: `Bearer ${bearer('refreshed')}`, 'x-organization-id': '12' });
  });
  it.each(['account', 'session', 'bearer', 'project'])('refuses Open for an earlier saved receipt after %s replacement', async kind => {
    apiRequest.mockResolvedValue(success(saved())); const onOpenDocument = vi.fn(); render(dialog({ onOpenDocument }));
    create(); await screen.findByRole('button', { name: 'Open working copy' }); changeOwner(kind);
    const open = screen.queryByRole('button', { name: 'Open working copy' }); if (open) fireEvent.click(open);
    expect(onOpenDocument).not.toHaveBeenCalled(); expect(screen.queryByTestId('source-import-result')).toBeNull();
  });
  it('consults the latest dirty-work hold before opening and preserves the saved copy', async () => {
    apiRequest.mockResolvedValue(success(saved())); const onOpenDocument = vi.fn(); const view = render(dialog({ onOpenDocument }));
    create(); await screen.findByRole('button', { name: 'Open working copy' }); view.rerender(dialog({ onOpenDocument, openBlocked: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Open working copy' })); expect(onOpenDocument).not.toHaveBeenCalled();
    view.rerender(dialog({ onOpenDocument, openBlocked: false })); fireEvent.click(screen.getByRole('button', { name: 'Open working copy' }));
    expect(onOpenDocument).toHaveBeenCalledWith(DOC);
  });
  it.each(['source', 'unmount'])('does not deliver an old pending create after %s', async kind => {
    const pending = deferred<Response>(); apiRequest.mockReturnValue(pending.promise); const onOpenDocument = vi.fn(); const view = render(dialog({ onOpenDocument }));
    create(); if (kind === 'source') view.rerender(dialog({ source: { kind: 'data-room', sourceId: 43 }, onOpenDocument })); else view.unmount();
    await act(async () => { pending.resolve(success(saved())); await pending.promise; });
    expect(screen.queryByTestId('source-import-result')).toBeNull(); expect(onOpenDocument).not.toHaveBeenCalled();
  });
});

describe('uncertain source creation stays held until an explicit scoped check', () => {
  it.each(['binary', 'workflow'])('holds another %s write and preview replacement after a lost create response', async kind => {
    if (kind === 'workflow') apiRequest.mockResolvedValueOnce(success(preview));
    apiRequest.mockRejectedValueOnce(new Error('Lost response')); render(dialog({ source: kind === 'workflow' ? WORKFLOW : SOURCE }));
    if (kind === 'workflow') await screen.findByTestId('workflow-import-preview'); create();
    const check = await screen.findByRole('button', { name: 'Check working documents' }); const before = apiRequest.mock.calls.length;
    const createButton = screen.queryByRole('button', { name: 'Create working copy' }); if (createButton) fireEvent.click(createButton);
    const reload = screen.queryByRole('button', { name: 'Reload source preview' }); if (reload) fireEvent.click(reload);
    expect(apiRequest.mock.calls).toHaveLength(before); expect(check).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Close' }).some(button => !(button as HTMLButtonElement).disabled)).toBe(true);
  });
  it('reads generic inventory without inferring a saved receipt or automatically repeating creation', async () => {
    apiRequest.mockRejectedValueOnce(new Error('Lost response')); render(dialog()); create();
    const check = await screen.findByRole('button', { name: 'Check working documents' }); installReads(); fireEvent.click(check);
    await waitFor(() => expect(screen.getByText(/does not identify which request/i)).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Open working copy' })).toBeNull();
    expect(apiRequest.mock.calls.filter(([method]) => method === 'POST')).toHaveLength(1);
    expect(apiRequest.mock.calls.filter(([method]) => method === 'GET')).toHaveLength(1);
    expect((screen.getByRole('button', { name: 'Create working copy' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('recovers an identified import through exact current records and offers a separate Open', async () => {
    apiRequest.mockResolvedValueOnce(response(typedUnknown(), 503)); const onOpenDocument = vi.fn(); render(dialog({ onOpenDocument })); create();
    const check = await screen.findByRole('button', { name: 'Check working documents' }); installReads(); fireEvent.click(check);
    const open = await screen.findByRole('button', { name: 'Open working copy' }); expect(onOpenDocument).not.toHaveBeenCalled();
    const reads = apiRequest.mock.calls.filter(([method]) => method === 'GET'); expect(reads).toHaveLength(3);
    for (const [, path, , headers] of reads) { expect(new URL(path, 'http://localhost').searchParams.get('programId')).toBe(PROGRAM);
      expect(headers).toEqual({ Authorization: `Bearer ${bearer()}`, 'x-organization-id': '12' }); }
    fireEvent.click(open); expect(onOpenDocument).toHaveBeenCalledWith(DOC);
    expect(apiRequest.mock.calls.filter(([method]) => method === 'POST')).toHaveLength(1);
  });
  it.each([
    { recovery: { documentId: DOC, organizationId: 99, programId: PROGRAM } },
    { recovery: { documentId: 'not-a-uuid', organizationId: 12, programId: PROGRAM } },
    { recovery: { documentId: DOC, organizationId: 12, programId: OTHER } },
  ])('keeps a recognized but foreign/malformed recovery identity held: %j', async invalid => {
    apiRequest.mockResolvedValueOnce(response(typedUnknown(invalid), 503)); render(dialog()); create();
    const check = await screen.findByRole('button', { name: 'Check working documents' }); installReads(); fireEvent.click(check);
    await waitFor(() => expect((check as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByRole('button', { name: 'Open working copy' })).toBeNull();
    const createButton = screen.queryByRole('button', { name: 'Create working copy' }); if (createButton) fireEvent.click(createButton);
    expect(apiRequest.mock.calls.filter(([method]) => method === 'POST')).toHaveLength(1);
  });
  it('leaves a failed preview retryable without creating a document', async () => {
    apiRequest.mockRejectedValueOnce(new Error('Preview unavailable')).mockResolvedValueOnce(success(preview)); render(dialog({ source: WORKFLOW }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reload source preview' })); await screen.findByTestId('workflow-import-preview');
    expect(apiRequest.mock.calls.every(([, , payload]) => payload.previewOnly === true)).toBe(true);
    expect(screen.queryByRole('button', { name: 'Check working documents' })).toBeNull();
  });
});

describe('source dispatch requires the admitted live owner', () => {
  it.each(['binary', 'workflow'])('does not dispatch %s intake anonymously or through storage-only credentials', async kind => {
    authService.endSession(null); setAuthToken(bearer('storage-only')); publishShellProject({ id: PROGRAM });
    apiRequest.mockResolvedValue(success(kind === 'workflow' ? preview : saved())); render(dialog({ source: kind === 'workflow' ? WORKFLOW : SOURCE }));
    const field = screen.queryByLabelText('Reason for creating a working copy');
    if (field) fireEvent.change(field, { target: { value: 'Review saved source evidence' } });
    const button = screen.queryByRole('button', { name: 'Create working copy' }); if (button) fireEvent.click(button);
    await act(async () => { await Promise.resolve(); }); expect(apiRequest).not.toHaveBeenCalled();
  });
  it('rejects a selected source mutated in place before Create', async () => {
    const source = { ...SOURCE }; apiRequest.mockResolvedValue(success(saved())); render(dialog({ source }));
    fireEvent.change(screen.getByLabelText('Reason for creating a working copy'), { target: { value: 'Review saved source evidence' } });
    source.sourceId = 43; fireEvent.click(screen.getByRole('button', { name: 'Create working copy' }));
    await act(async () => { await Promise.resolve(); }); expect(apiRequest).not.toHaveBeenCalled();
  });
  it('preserves pending preview work through same-project metadata and canonical refresh', async () => {
    const pending = deferred<Response>(); apiRequest.mockReturnValue(pending.promise); render(dialog({ source: WORKFLOW }));
    act(() => publishShellProject({ id: PROGRAM, title: 'Updated project label' })); await refresh();
    await act(async () => { pending.resolve(success(preview)); await pending.promise; });
    expect(screen.getByTestId('workflow-import-preview')).toBeTruthy();
    expect(apiRequest.mock.calls[0][3]).toEqual({ Authorization: `Bearer ${bearer()}`, 'x-organization-id': '12' });
  });
});

describe('retained intake callbacks preserve their original visit', () => {
  it.each(['account', 'session', 'bearer', 'project'])('refuses retained fields and actions after %s replacement', async kind => {
    const view = renderHook(() => useSourceIntake(PROGRAM, SOURCE));
    act(() => view.result.current.setReason('Original source reason')); const retained = view.result.current; changeOwner(kind);
    await act(async () => { retained.setReason('Later account reason'); retained.setAssociationReason('Later association');
      await retained.pull(); await retained.refresh(); await retained.check(); });
    expect(apiRequest).not.toHaveBeenCalled(); expect(view.result.current.retired).toBe(true);
    expect(view.result.current.reason).toBe(''); expect(view.result.current.associationReason).toBe('');
    expect(view.result.current.result).toBeNull(); expect(view.result.current.preview).toBeNull();
  });
  it('retires retained source A callbacks across a rendered source A-B-A visit', async () => {
    const source = { ...SOURCE }; const view = renderHook(({ selected }) => useSourceIntake(PROGRAM, selected), { initialProps: { selected: source } });
    act(() => view.result.current.setReason('Source A reason')); const retained = view.result.current;
    view.rerender({ selected: { ...SOURCE, sourceId: 43 } }); view.rerender({ selected: source });
    await act(async () => { retained.setReason('Previous A visit'); await retained.pull(); });
    expect(apiRequest).not.toHaveBeenCalled(); expect(view.result.current.retired).toBe(true);
  });
  it('refuses retained actions after their mounted intake closes', async () => {
    const view = renderHook(() => useSourceIntake(PROGRAM, SOURCE)); act(() => view.result.current.setReason('Original source reason'));
    const retained = view.result.current; view.unmount();
    await act(async () => { retained.setReason('Closed reason'); await retained.pull(); await retained.refresh(); await retained.check(); });
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it('allows current retained actions after canonical refresh and uses the newly adopted bearer', async () => {
    apiRequest.mockResolvedValue(success(saved())); const view = renderHook(() => useSourceIntake(PROGRAM, SOURCE)); const retained = view.result.current;
    await refresh(); await act(async () => { retained.setReason('Refreshed source reason'); });
    await act(async () => { await retained.pull(); }); expect(view.result.current.result?.doc.id).toBe(DOC);
    expect(apiRequest.mock.calls[0][3]).toEqual({ Authorization: `Bearer ${bearer('refreshed')}`, 'x-organization-id': '12' });
  });
  it('rechecks the original owner after the host closes the dialog and before navigation', async () => {
    apiRequest.mockResolvedValue(success(saved())); const onOpenDocument = vi.fn();
    render(dialog({ onClose: () => changeOwner('account'), onOpenDocument })); create();
    fireEvent.click(await screen.findByRole('button', { name: 'Open working copy' })); expect(onOpenDocument).not.toHaveBeenCalled();
  });
});

describe('source recovery uses the original saved import and read owner', () => {
  it.each([408, 500])('holds HTTP %i creation failures instead of treating them as retryable preview failures', async status => {
    apiRequest.mockResolvedValueOnce(response({ success: false, error: 'Creation response unavailable' }, status)); render(dialog()); create();
    await screen.findByRole('button', { name: 'Check working documents' });
    const button = screen.queryByRole('button', { name: 'Create working copy' }); if (button) fireEvent.click(button);
    expect(apiRequest.mock.calls).toHaveLength(1);
  });
  it('holds an affirmative malformed save receipt for checking instead of opening or retrying', async () => {
    apiRequest.mockResolvedValueOnce(success({ ...saved(), sections: [{ ...saved().sections[0], doc_id: OTHER }] })); render(dialog()); create();
    await screen.findByRole('button', { name: 'Check working documents' }); expect(screen.queryByTestId('source-import-result')).toBeNull();
    expect(apiRequest.mock.calls).toHaveLength(1);
  });
  it('requires a fresh explicit workflow preview after checking generic uncertainty', async () => {
    apiRequest.mockResolvedValueOnce(success(preview)).mockRejectedValueOnce(new Error('Lost response')); render(dialog({ source: WORKFLOW }));
    await screen.findByTestId('workflow-import-preview'); create(); const check = await screen.findByRole('button', { name: 'Check working documents' });
    installReads(saved(true)); fireEvent.click(check); await waitFor(() => expect(screen.getByText(/does not identify which request/i)).toBeTruthy());
    expect(screen.queryByTestId('workflow-import-preview')).toBeNull();
    expect((screen.getByRole('button', { name: 'Create working copy' }) as HTMLButtonElement).disabled).toBe(true);
    apiRequest.mockResolvedValueOnce(success(preview)); fireEvent.click(screen.getByRole('button', { name: 'Reload source preview' }));
    await screen.findByTestId('workflow-import-preview'); expect(apiRequest.mock.calls.at(-1)?.[2].previewOnly).toBe(true);
    expect((screen.getByRole('button', { name: 'Create working copy' }) as HTMLButtonElement).disabled).toBe(false);
    expect(apiRequest.mock.calls.filter(([method]) => method === 'POST')).toHaveLength(3);
  });
  it.each(['tenant', 'creator', 'source', 'projection', 'metadata'])('refuses identified recovery with unverified %s ownership', async mismatch => {
    apiRequest.mockResolvedValueOnce(response(typedUnknown(), 503)); render(dialog()); create();
    const check = await screen.findByRole('button', { name: 'Check working documents' }); const data = saved();
    if (mismatch === 'tenant') data.doc.tenant_id = 99;
    if (mismatch === 'creator') data.doc.created_by = 8;
    if (mismatch === 'source') data.doc.provenance = { source: 'import', importSource: { ...binaryOrigin, id: '43' } };
    if (mismatch === 'projection') data.doc.readScope = 'sections';
    if (mismatch === 'metadata') data.doc.sourceMetadataState = 'unavailable';
    installReads(data); fireEvent.click(check); await waitFor(() => expect((check as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByRole('button', { name: 'Open working copy' })).toBeNull();
    expect(apiRequest.mock.calls.filter(([method]) => method === 'POST')).toHaveLength(1);
  });
  it('opens an identified workflow copy using its actual retained edited section code', async () => {
    apiRequest.mockResolvedValueOnce(success(preview)).mockResolvedValueOnce(response(typedUnknown(), 503)); const onOpenDocument = vi.fn();
    render(dialog({ source: WORKFLOW, onOpenDocument })); await screen.findByTestId('workflow-import-preview'); create();
    const check = await screen.findByRole('button', { name: 'Check working documents' }); const edited = saved(true);
    edited.sections = [{ ...edited.sections[0], code: 'edited.summary', content: 'Later reviewed wording' }]; installReads(edited); fireEvent.click(check);
    fireEvent.click(await screen.findByRole('button', { name: 'Open working copy' })); expect(onOpenDocument).toHaveBeenCalledWith(DOC, 'edited.summary');
    expect(apiRequest.mock.calls.filter(([method]) => method === 'POST')).toHaveLength(2);
  });
  it('pins every recovery hop to the dispatched bearer while accepting a canonical refresh', async () => {
    apiRequest.mockResolvedValueOnce(response(typedUnknown(), 503)); render(dialog({ onOpenDocument: vi.fn() })); create();
    const check = await screen.findByRole('button', { name: 'Check working documents' }); installReads(); const read = apiRequest.getMockImplementation()!;
    const inventory = deferred<Response>(); apiRequest.mockImplementation((method: string, path: string) =>
      new URL(path, 'http://localhost').pathname === '/api/authoring/docs' ? inventory.promise : read(method, path));
    fireEvent.click(check); await refresh();
    await act(async () => { inventory.resolve(response({ success: true, documents: [{ ...saved().doc, program_id: PROGRAM }] })); await inventory.promise; });
    await screen.findByRole('button', { name: 'Open working copy' });
    const reads = apiRequest.mock.calls.filter(([method]) => method === 'GET'); expect(reads).toHaveLength(3);
    expect(reads.every(([, , , headers]) => headers.Authorization === `Bearer ${bearer()}`)).toBe(true);
  });
});

describe('delayed working-document checks remain owned reads', () => {
  it.each(['account', 'session', 'bearer', 'project'])('does not continue recovery hops after a delayed inventory body and %s replacement', async kind => {
    apiRequest.mockResolvedValueOnce(response(typedUnknown(), 503)); const onOpenDocument = vi.fn(); render(dialog({ onOpenDocument })); create();
    const check = await screen.findByRole('button', { name: 'Check working documents' }); const body = deferred<unknown>();
    apiRequest.mockResolvedValue({ ok: true, status: 200, json: () => body.promise }); fireEvent.click(check);
    await act(async () => { await Promise.resolve(); }); changeOwner(kind);
    await act(async () => { body.resolve({ success: true, documents: [{ ...saved().doc, program_id: PROGRAM }] }); await body.promise; });
    expect(apiRequest.mock.calls.filter(([method]) => method === 'GET')).toHaveLength(1);
    expect(screen.queryByTestId('source-import-result')).toBeNull(); expect(screen.queryByRole('button', { name: 'Check working documents' })).toBeNull();
    expect(onOpenDocument).not.toHaveBeenCalled();
  });
  it('retains the hold after a failed inventory check and releases generic uncertainty only after a later valid explicit read', async () => {
    apiRequest.mockRejectedValueOnce(new Error('Lost create response')); render(dialog()); create();
    const check = await screen.findByRole('button', { name: 'Check working documents' }); apiRequest.mockRejectedValueOnce(new Error('Read unavailable'));
    fireEvent.click(check); await waitFor(() => expect((check as HTMLButtonElement).disabled).toBe(false));
    const createButton = screen.getByRole('button', { name: 'Create working copy' }); expect((createButton as HTMLButtonElement).disabled).toBe(true);
    installReads(); fireEvent.click(check); await waitFor(() => expect((createButton as HTMLButtonElement).disabled).toBe(false));
    expect(apiRequest.mock.calls.filter(([method]) => method === 'GET')).toHaveLength(2);
    expect(apiRequest.mock.calls.filter(([method]) => method === 'POST')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Open working copy' })).toBeNull();
  });
});

function CloseUpdatesHost({ hold, original, latest }: { hold: boolean; original: (id: string) => void; latest: (id: string) => void }) {
  const [closed, setClosed] = React.useState(false);
  return dialog({ onClose: () => flushSync(() => setClosed(true)), openBlocked: hold && closed,
    onOpenDocument: closed && !hold ? latest : original });
}

describe('review regressions preserve latest host and actual saved structure', () => {
  it.each(['hold', 'callback'])('rechecks a synchronous host %s update during explicit Open', async change => {
    apiRequest.mockResolvedValue(success(saved())); const original = vi.fn(), latest = vi.fn();
    render(<CloseUpdatesHost hold={change === 'hold'} original={original} latest={latest} />); create();
    fireEvent.click(await screen.findByRole('button', { name: 'Open working copy' })); expect(original).not.toHaveBeenCalled();
    if (change === 'hold') expect(latest).not.toHaveBeenCalled(); else expect(latest).toHaveBeenCalledWith(DOC);
  });
  it.each(['binary', 'workflow'])('opens a verified reused %s working copy after its sections were legitimately removed', async kind => {
    if (kind === 'workflow') apiRequest.mockResolvedValueOnce(success(preview));
    apiRequest.mockResolvedValueOnce(success({ ...saved(kind === 'workflow'), reused: true, sections: [] })); const onOpenDocument = vi.fn();
    render(dialog({ source: kind === 'workflow' ? WORKFLOW : SOURCE, onOpenDocument }));
    if (kind === 'workflow') await screen.findByTestId('workflow-import-preview'); create();
    const open = await screen.findByRole('button', { name: 'Open working copy' });
    expect(screen.queryByRole('combobox', { name: 'Section to open' })).toBeNull();
    expect(onOpenDocument).not.toHaveBeenCalled(); fireEvent.click(open); expect(onOpenDocument).toHaveBeenCalledWith(DOC);
  });
});
