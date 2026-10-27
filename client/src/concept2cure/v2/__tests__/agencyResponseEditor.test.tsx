// @vitest-environment jsdom
/** HAQ preparation owns a current saved snapshot, never another answer editor. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('../editor/SourceImportDialog', async original => {
  const actual = await original<typeof import('../editor/SourceImportDialog')>();
  return { ...actual, SourceImportDialog: (props: { source: unknown; programId: string; initialSectionCode?: string; onOpenDocument?: (id: string, code?: string) => void }) =>
    <div role="dialog" aria-label="Existing source import"><span>{JSON.stringify({ source: props.source, programId: props.programId, code: props.initialSectionCode })}</span>
      <button onClick={() => props.onOpenDocument?.('30000000-0000-4000-8000-000000000001')}>Confirmed answer copy</button>
      <button onClick={() => props.onOpenDocument?.('30000000-0000-4000-8000-000000000001', 'agency.context')}>Explicit context section</button>
    </div> };
});
import { AgencyResponseEditor } from '../surfaces/AgencyResponseEditor';
import type { ResponseEditorProps } from '../surfaces/useAgencyResponseEditor';
import { useAgencyResponseEditor } from '../surfaces/useAgencyResponseEditor';
import type { ResponseEditorRead } from '../surfaces/agencyResponseEditorState';
import { authService } from '@/services/portal/authService';
import { clearAuthToken } from '@/utils/authToken';
import { clearEditorTarget, peekEditorTarget } from '../editorTarget';
import { clearShellProject, publishShellProject } from '../shellProject';

const PROGRAM = '20000000-0000-4000-8000-000000000001';
const DOC = '30000000-0000-4000-8000-000000000001';
const SECTION = '40000000-0000-4000-8000-000000000001';
const TOKEN = `fixture.${btoa(JSON.stringify({ userId: 7, organizationId: 12 }))}.synthetic`;
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
function payload(eventId = 'ace_1', text = 'Saved answer.', revision = 2): { success: true; data: ResponseEditorRead } {
  return { success: true, data: { programId: PROGRAM, currentRevision: revision,
    source: { kind: 'agency-response', eventId, questionId: 7 }, copies: [{ documentId: DOC, sectionId: SECTION,
      sha256: 'a'.repeat(64), updatedAt: '2026-10-26T10:00:00.000Z', sourceRevision: revision,
      ready: true, refusal: null, text }] } };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(finish => { resolve = finish; }); return { promise, resolve }; }
function props(over: Partial<ResponseEditorProps> = {}): ResponseEditorProps {
  return { projectId: '42', eventId: 'ace_1', questionId: 7, questionRef: 'Q1', responseRevision: 2,
    onNav: vi.fn(), onSaved: vi.fn(), onBusy: vi.fn(), onCancel: vi.fn(), fire: vi.fn(), ...over };
}
function login() {
  authService.setToken(TOKEN, { id: '7', organizationId: '12', roles: ['admin'], permissions: ['governed:write'] }, 'fixture-refresh', 3600);
}
type Observed = { eventId: string; text: string | null | undefined; reason: string; canSave: boolean };
function SnapshotProbe({ values, observe }: { values: ResponseEditorProps; observe: (value: Observed) => void }) {
  const state = useAgencyResponseEditor(values);
  observe({ eventId: values.eventId, text: state.copy?.text, reason: state.reason, canSave: state.canSave });
  return <input aria-label="Probe reason" value={state.reason} onChange={event => state.setReason(event.target.value)} />;
}
function CallbackProbe({ values, observe }: { values: ResponseEditorProps; observe: (state: ReturnType<typeof useAgencyResponseEditor>) => void }) {
  const state = useAgencyResponseEditor(values); observe(state);
  return <input aria-label="Callback reason" value={state.reason} onChange={event => state.setReason(event.target.value)} />;
}
beforeEach(() => {
  authService.endSession(null); clearAuthToken(); localStorage.clear(); sessionStorage.clear();
  login(); publishShellProject({ id: PROGRAM }); apiRequest.mockReset();
});
afterEach(() => {
  cleanup(); clearEditorTarget(); authService.endSession(null); clearAuthToken(); clearShellProject(); localStorage.clear(); sessionStorage.clear();
});

// The actual import dialog's preview/copy/refusal contract has its own tests;
// this seam checks the host's exact selector and the real editor target channel.
describe('the existing editor door', () => {
  it('passes the exact question and response preference then opens only the confirmed copy', async () => {
    apiRequest.mockResolvedValue(ok(payload())); const values = props(); render(<AgencyResponseEditor {...values} />);
    await screen.findByLabelText('Saved response preview');
    expect(screen.queryByRole('textbox', { name: 'Response' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open response in editor' }));
    expect(screen.getByRole('dialog').textContent).toContain(JSON.stringify({ source: { kind: 'agency-response', eventId: 'ace_1', questionId: 7 }, programId: PROGRAM, code: 'agency.response' }));
    expect(values.onNav).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmed answer copy' }));
    expect(values.onNav).toHaveBeenCalledWith('document-authoring');
    expect(peekEditorTarget()).toMatchObject({ docId: DOC, programId: PROGRAM, sectionCode: 'agency.response' });
    expect(apiRequest.mock.calls.filter(call => call[0] === 'PUT')).toHaveLength(0);
  });
  it('honors an explicitly selected saved context section', async () => {
    apiRequest.mockResolvedValue(ok(payload())); render(<AgencyResponseEditor {...props()} />);
    await screen.findByLabelText('Saved response preview');
    fireEvent.click(screen.getByRole('button', { name: 'Open response in editor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Explicit context section' }));
    expect(peekEditorTarget()).toMatchObject({ docId: DOC, programId: PROGRAM, sectionCode: 'agency.context' });
  });
  it('closes an earlier source door when the question changes', async () => {
    apiRequest.mockImplementation(async (_method: string, path: string) => ok(payload(path.includes('ace_2') ? 'ace_2' : 'ace_1')));
    const values = props(); const view = render(<AgencyResponseEditor {...values} />);
    await screen.findByLabelText('Saved response preview'); fireEvent.click(screen.getByRole('button', { name: 'Open response in editor' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    view.rerender(<AgencyResponseEditor {...values} eventId="ace_2" />);
    await screen.findByLabelText('Saved response preview'); expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('current response ownership', () => {
  it('ignores a late preview from the preceding question', async () => {
    const old = deferred<Response>(); apiRequest.mockReturnValueOnce(old.promise).mockResolvedValue(ok(payload('ace_2', 'Current question answer.')));
    const values = props(); const view = render(<AgencyResponseEditor {...values} />);
    view.rerender(<AgencyResponseEditor {...values} eventId="ace_2" />);
    await screen.findByText('Current question answer.');
    await act(async () => { old.resolve(ok(payload('ace_1', 'Old question answer.'))); });
    expect(screen.queryByText('Old question answer.')).toBeNull(); expect(screen.getByText('Current question answer.')).toBeTruthy();
  });
  it('does not acknowledge an old save after the same actor starts a new session', async () => {
    const old = deferred<Response>(); let nextSession = false;
    apiRequest.mockImplementation((method: string) => method === 'PUT' ? old.promise : Promise.resolve(ok(payload('ace_1', nextSession ? 'New session answer.' : 'Saved answer.'))));
    const values = props(); render(<AgencyResponseEditor {...values} />); await screen.findByLabelText('Saved response preview');
    fireEvent.change(screen.getByLabelText('Reason for this change'), { target: { value: 'Use the reviewed editor response.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use saved editor response' }));
    expect(apiRequest.mock.calls.find(call => call[0] === 'PUT')?.[2]).toEqual({ expectedRevision: 2, reason: 'Use the reviewed editor response.',
      editorSource: { documentId: DOC, sectionId: SECTION, expectedSha256: 'a'.repeat(64), expectedUpdatedAt: '2026-10-26T10:00:00.000Z' } });
    await act(async () => { nextSession = true; authService.endSession(null); login(); });
    await screen.findByText('New session answer.');
    await act(async () => { old.resolve(ok({ success: true, data: {} })); });
    expect(values.fire).not.toHaveBeenCalled(); expect(values.onSaved).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Reason for this change') as HTMLInputElement).value).toBe('');
  });
  it('refreshes the separate question read without rebasing an older working copy', async () => {
    const values = props(); const fresh = payload('ace_1', 'Current answer.', 3);
    fresh.data.copies[0] = { ...fresh.data.copies[0], sourceRevision: 2, ready: false, refusal: 'Prepare a fresh source copy.', text: null };
    apiRequest.mockResolvedValueOnce(ok(payload())).mockResolvedValue(ok(fresh));
    const view = render(<AgencyResponseEditor {...values} />); await screen.findByText('Saved answer.');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh saved response' }));
    await screen.findByText('Prepare a fresh source copy.'); expect(values.onSaved).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: 'Use saved editor response' }) as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<AgencyResponseEditor {...values} responseRevision={3} />);
    await waitFor(() => expect(screen.queryByText('The registered response changed. Refresh the saved response before saving.')).toBeNull());
    expect((screen.getByRole('button', { name: 'Use saved editor response' }) as HTMLButtonElement).disabled).toBe(true);
    expect(apiRequest.mock.calls.filter(call => call[0] === 'PUT')).toHaveLength(0);
  });
});

describe('scope ownership before effects run', () => {
  it('masks the preceding question snapshot on the first new-scope render', async () => {
    const next = deferred<Response>();
    apiRequest.mockImplementation((_method: string, path: string) => path.includes('ace_2') ? next.promise : Promise.resolve(ok(payload())));
    const seen: Observed[] = []; const values = props();
    const view = render(<SnapshotProbe values={values} observe={value => seen.push(value)} />);
    await waitFor(() => expect(seen.at(-1)?.text).toBe('Saved answer.'));
    fireEvent.change(screen.getByLabelText('Probe reason'), { target: { value: 'Reviewed source-supported answer.' } });
    expect(seen.at(-1)?.canSave).toBe(true); seen.length = 0;
    view.rerender(<SnapshotProbe values={{ ...values, eventId: 'ace_2' }} observe={value => seen.push(value)} />);
    expect(seen[0]).toEqual({ eventId: 'ace_2', text: undefined, reason: '', canSave: false });
  });
  it('refuses to start old captured save and refresh callbacks in a new session', async () => {
    apiRequest.mockResolvedValue(ok(payload())); const values = props();
    let latest!: ReturnType<typeof useAgencyResponseEditor>;
    render(<CallbackProbe values={values} observe={state => { latest = state; }} />);
    await waitFor(() => expect(latest.copy?.ready).toBe(true));
    fireEvent.change(screen.getByLabelText('Callback reason'), { target: { value: 'Reviewed source-supported answer.' } });
    expect(latest.canSave).toBe(true); const old = latest;
    await act(async () => { authService.endSession(null); login(); });
    await waitFor(() => expect(latest.copy?.ready).toBe(true));
    const before = apiRequest.mock.calls.length;
    await act(async () => { await old.save(); await old.refresh(); });
    expect(apiRequest.mock.calls).toHaveLength(before);
    expect(values.onSaved).not.toHaveBeenCalled(); expect(values.fire).not.toHaveBeenCalled();
  });
  it('retires a captured callback immediately when the host letter changes before unmount effects', async () => {
    apiRequest.mockResolvedValue(ok(payload())); let hostLetter = 'ace_1';
    const values = props({ hostCurrent: () => hostLetter === 'ace_1' });
    let latest!: ReturnType<typeof useAgencyResponseEditor>;
    render(<CallbackProbe values={values} observe={state => { latest = state; }} />);
    await waitFor(() => expect(latest.copy?.ready).toBe(true));
    fireEvent.change(screen.getByLabelText('Callback reason'), { target: { value: 'Reviewed source-supported answer.' } });
    const old = latest; expect(old.canSave).toBe(true); const before = apiRequest.mock.calls.length;
    hostLetter = 'ace_2';
    await act(async () => { await old.save(); await old.refresh(); });
    expect(apiRequest.mock.calls).toHaveLength(before); expect(values.onSaved).not.toHaveBeenCalled();
  });
});
