// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ revision: 0, account: { id: '7', organizationId: '12' } }));
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', () => ({ authService: {
  getUser: () => state.account,
  captureSessionReadGuard: () => { const revision = state.revision; return { sameRevision: () => state.revision === revision }; },
} }));
import * as handoff from '../authoringHandoff';
import { publishShellProject } from '../shellProject';
import { clearEditorTarget, peekEditorTarget } from '../editorTarget';
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const DOC = '33333333-3333-4333-8333-333333333333';
const SECTION = '44444444-4444-4444-8444-444444444444';
const input = { title: 'Study analysis', module: 'M5', code: 'study.analysis', content: '<p>Recorded result</p>', subject: 'the analysis' };
const document = { id: DOC, title: input.title, client_program_id: PROGRAM, module: 'M5' };
const section = { id: SECTION, doc_id: DOC, code: input.code, title: input.title };
const reply = (body: unknown, status = 201) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const docReply = (governance = { bound: false, reason: 'No governed filing is bound.' }) => reply({ success: true, document, governance });
const sectionReply = () => reply({ success: true, section });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { resolve, promise }; }
beforeEach(() => { apiRequest.mockReset(); state.revision = 0; state.account = { id: '7', organizationId: '12' }; publishShellProject({ id: PROGRAM }); clearEditorTarget(); });

describe('specialist handoff exact receipts and current context', () => {
  it('returns the exact document, project and section code with its binding outcome', async () => {
    apiRequest.mockResolvedValueOnce(docReply()).mockResolvedValueOnce(sectionReply());
    const result = await handoff.saveToAuthoring(input);
    expect(result).toMatchObject({ ok: true, docId: DOC, programId: PROGRAM, code: input.code, bound: false });
    expect(result.message).toContain('Not bound to a filing');
  });
  it.each([
    { document },
    { success: false, document },
    { success: true, document: { ...document, client_program_id: OTHER } },
    { success: true, document: { ...document, id: 12 } },
    { success: true, document: { ...document, title: undefined } },
  ])('does not write a section after an unconfirmed document receipt %#', async body => {
    apiRequest.mockResolvedValueOnce(reply(body)).mockResolvedValueOnce(sectionReply());
    const result = await handoff.saveToAuthoring(input);
    expect(result).toMatchObject({ ok: false, phase: 'unknown' });
    expect(result.message).not.toContain('Nothing was saved');
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
  it.each([
    { section },
    { success: false, section },
    { success: true, section: { ...section, doc_id: OTHER } },
    { success: true, section: { ...section, code: 'another.section' } },
    { success: true, section: { ...section, id: 12 } },
  ])('retains the document identity after an unconfirmed section receipt %#', async body => {
    apiRequest.mockResolvedValueOnce(docReply()).mockResolvedValueOnce(reply(body));
    const result = await handoff.saveToAuthoring(input);
    expect(result).toMatchObject({ ok: false, phase: 'unknown', docId: DOC, programId: PROGRAM, code: input.code });
    expect(result.message).toContain(DOC);
    expect(result.message).not.toContain('Nothing was saved');
  });
  it('does not claim nothing was saved after a lost document response', async () => {
    apiRequest.mockRejectedValueOnce(new Error('offline'));
    const result = await handoff.saveToAuthoring(input);
    expect(result).toMatchObject({ ok: false, phase: 'unknown' });
    expect(result.message).not.toContain('Nothing was saved');
  });
  it('retains confirmed document identity after a lost section response', async () => {
    apiRequest.mockResolvedValueOnce(docReply()).mockRejectedValueOnce(new Error('offline'));
    const result = await handoff.saveToAuthoring(input);
    expect(result).toMatchObject({ ok: false, phase: 'unknown', docId: DOC });
    expect(result.message).toContain(DOC);
    expect(result.message).not.toContain('Nothing was saved');
  });
  it.each(['project', 'project-round-trip', 'account', 'organization', 'session'] as const)('refuses a %s change before the section write', async change => {
    const pending = deferred<Response>(); apiRequest.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(sectionReply());
    const operation = handoff.saveToAuthoring(input);
    if (change === 'project' || change === 'project-round-trip') publishShellProject({ id: OTHER });
    if (change === 'project-round-trip') publishShellProject({ id: PROGRAM });
    if (change === 'account') state.account = { ...state.account, id: '8' };
    if (change === 'organization') state.account = { ...state.account, organizationId: '13' };
    if (change === 'session') state.revision++;
    pending.resolve(docReply());
    expect(await operation).toMatchObject({ ok: false, phase: 'stale' });
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(peekEditorTarget()).toBeNull();
  });
  it('rechecks scope after reading the response body', async () => {
    const body = deferred<unknown>(); apiRequest.mockResolvedValueOnce({ ok: true, status: 201, json: () => body.promise }).mockResolvedValueOnce(sectionReply());
    const operation = handoff.saveToAuthoring(input); await Promise.resolve();
    publishShellProject({ id: OTHER }); body.resolve({ success: true, document });
    expect(await operation).toMatchObject({ ok: false, phase: 'stale' });
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
  it('allows same-project metadata updates for the unchanged account', async () => {
    const pending = deferred<Response>(); apiRequest.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(sectionReply());
    const operation = handoff.saveToAuthoring(input);
    publishShellProject({ id: PROGRAM, title: 'Current study name' });
    pending.resolve(docReply()); expect(await operation).toMatchObject({ ok: true });
  });
  it('opens the exact saved target and refuses a later project or account change', async () => {
    apiRequest.mockResolvedValueOnce(docReply()).mockResolvedValueOnce(sectionReply());
    const result = await handoff.saveToAuthoring(input); const nav = vi.fn();
    expect(handoff.openSavedAuthoring(result, nav)).toBe(true);
    expect(peekEditorTarget()).toMatchObject({ docId: DOC, programId: PROGRAM, sectionCode: input.code });
    expect(nav).toHaveBeenCalledWith('document-authoring');
    clearEditorTarget(); state.revision++;
    expect(handoff.openSavedAuthoring(result, nav)).toBe(false);
    expect(peekEditorTarget()).toBeNull(); expect(nav).toHaveBeenCalledTimes(1);
  });
});
