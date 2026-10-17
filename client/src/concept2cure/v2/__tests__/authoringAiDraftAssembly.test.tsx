// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
const identity = vi.hoisted(() => ({ revision: 1, id: '7', organizationId: '9' }));
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: identity }),
  authService: { getUser: () => identity, captureSessionReadGuard: () => {
    const revision = identity.revision;
    return { sameRevision: () => revision === identity.revision };
  } },
}));
import { AuthoringAiDraft, type AiDraftReviewState, type AuthoringAiDraftProps } from '../surfaces/AuthoringAiDraft';
import { publishShellProject } from '../shellProject';
import { ApiRequestError } from '@/lib/queryClient';
import { acceptAuthoringDraft, generateAuthoringDraft } from '../editor/authoringDraftTransport';

const docId = 'document-1';
const projectId = 'bbbbbbbb-0000-4000-8000-000000000001';
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
const candidate = (sectionId = 'section-1') => ({ sectionId, generated: 'Candidate text.', draftId: `draft-${sectionId}`, metadata: {}, check: null });
const initial = (sectionId = 'section-1'): AiDraftReviewState => ({ draft: candidate(sectionId), body: `Edited ${sectionId}.`, changeReason: 'Reviewed against evidence.', refusal: null });
const onAccepted = vi.fn();
const onClose = vi.fn();
const fireToast = vi.fn();
function props(extra: Partial<AuthoringAiDraftProps> = {}): AuthoringAiDraftProps {
  return { sectionId: 'section-1', sectionCode: '2.5', sectionTitle: 'Overview', docId,
    docSealed: false, editorDirty: false, onAccepted, onClose, fireToast, ...extra };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) };
}
function RetainedPanel(extra: Partial<AuthoringAiDraftProps>) {
  const [state, update] = useState(initial);
  return <AuthoringAiDraft {...props(extra)} reviewSession={{ state, update, isCurrent: () => true }} />;
}
beforeEach(() => {
  identity.revision = 1; identity.id = '7'; identity.organizationId = '9';
  apiRequest.mockReset(); onAccepted.mockClear(); onClose.mockClear(); fireToast.mockClear();
  publishShellProject({ id: projectId });
});

describe('acceptance protects current editor work and exact saved identity', () => {
  it('retains the candidate and blocks a new acceptance after a saved-base conflict', async () => {
    apiRequest.mockRejectedValueOnce(new ApiRequestError('Changed by another writer.', 409,
      { error: { code: 'SECTION_BASE_CHANGED', message: 'Changed by another writer.' } }, 'SECTION_BASE_CHANGED'));
    render(<RetainedPanel />);
    fireEvent.click(screen.getByTestId('ai-draft-accept'));
    await screen.findByTestId('ai-draft-refusal');
    expect(screen.getByTestId('ai-draft-body')).toBeTruthy();
    expect(screen.getByTestId('ai-draft-refusal').textContent).toMatch(/saved section changed/i);
    expect((screen.getByTestId('ai-draft-accept') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('ai-draft-regenerate') as HTMLButtonElement).disabled).toBe(false);
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it('does not remount over text typed while acceptance was pending', async () => {
    const pending = deferred<Response>(); apiRequest.mockReturnValue(pending.promise);
    const view = render(<RetainedPanel />);
    fireEvent.click(screen.getByTestId('ai-draft-accept'));
    view.rerender(<RetainedPanel editorDirty />);
    await act(async () => { pending.resolve(response({ success: true,
      section: { id: 'section-1', doc_id: docId, content: 'Edited section-1.' } })); await pending.promise; });
    expect(onAccepted).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('ai-draft-refusal').textContent).toMatch(/unsaved changes.*preserved/i);
    expect((screen.getByTestId('ai-draft-accept') as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([{ id: 'section-2', doc_id: docId }, { id: 'section-1', doc_id: 'another-document' }])('holds a mismatched saved receipt %j', async section => {
    apiRequest.mockResolvedValue(response({ success: true, section: { ...section, content: 'Wrong target.' } }));
    render(<RetainedPanel />);
    fireEvent.click(screen.getByTestId('ai-draft-accept'));
    await screen.findByRole('button', { name: 'Check saved section' });
    expect(onAccepted).not.toHaveBeenCalled();
    expect(screen.getByTestId('ai-draft-refusal').textContent).toMatch(/could not confirm/i);
  });

  it('admits one acceptance when the control is clicked twice synchronously', async () => {
    const pending = deferred<Response>(); apiRequest.mockReturnValue(pending.promise);
    render(<RetainedPanel />);
    const button = screen.getByTestId('ai-draft-accept');
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(apiRequest).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(response({ success: true, section: { id: 'section-1', doc_id: docId, content: 'Edited section-1.' } })); await pending.promise; });
    expect(onAccepted).toHaveBeenCalledTimes(1);
  });

  it('refuses a locally generated candidate from the previous signed-in session', async () => {
    apiRequest.mockResolvedValue(response({ success: true, draft: { content: 'Candidate text.', draftId: 'draft-1' } }));
    render(<AuthoringAiDraft {...props()} />);
    fireEvent.click(screen.getByTestId('ai-draft-generate'));
    await screen.findByTestId('ai-draft-accept');
    identity.revision += 1;
    fireEvent.click(screen.getByTestId('ai-draft-accept'));
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('ai-draft-refusal').textContent).toMatch(/earlier.*signed-in session/i);
  });

  it('leaves a retained review held when its acceptance completes after a section switch', async () => {
    const pending = deferred<Response>(); apiRequest.mockReturnValue(pending.promise);
    let retained = initial();
    const update = (next: AiDraftReviewState) => { retained = next; };
    const view = render(<AuthoringAiDraft {...props()} reviewSession={{ state: retained, update, isCurrent: () => true }} />);
    fireEvent.click(screen.getByTestId('ai-draft-accept'));
    expect(retained.acceptUnknown).toBe(true);
    expect(retained.refusal).toMatch(/not confirmed yet/i);
    view.rerender(<AuthoringAiDraft {...props({ sectionId: 'section-2' })}
      reviewSession={{ state: initial('section-2'), update: vi.fn(), isCurrent: () => true }} />);
    await act(async () => { pending.resolve(response({ success: true, section: { id: 'section-1', doc_id: docId, content: 'Edited section-1.' } })); await pending.promise; });
    expect(retained.acceptUnknown).toBe(true);
    expect(onAccepted).not.toHaveBeenCalled();
    expect((screen.getByTestId('ai-draft-body') as HTMLTextAreaElement).value).toBe('Edited section-2.');
  });
});

describe('shared drafting transport admission', () => {
  it('makes no provider or acceptance request for a stale owner', async () => {
    const current = () => false;
    expect(await generateAuthoringDraft({ sectionId: 'section-1' }, current)).toMatchObject({ ok: false, stale: true });
    expect(await acceptAuthoringDraft({ sectionId: 'section-1', draftId: 'draft-1', content: 'Body.' }, current)).toMatchObject({ ok: false, stale: true });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('does not decode a response after the owner becomes stale', async () => {
    let current = true;
    const json = vi.fn(async () => ({ success: true, draft: { content: 'Late.', draftId: 'late' } }));
    apiRequest.mockImplementation(async () => { current = false; return { ok: true, status: 200, json }; });
    expect(await generateAuthoringDraft({ sectionId: 'section-1' }, () => current)).toMatchObject({ ok: false, stale: true });
    expect(json).not.toHaveBeenCalled();
  });
});

describe('uncertain acceptance inspection', () => {
  it('shows freshly checked saved text beside the retained candidate without another save', async () => {
    apiRequest.mockRejectedValueOnce(new TypeError('response lost'));
    render(<RetainedPanel programId={projectId} />);
    fireEvent.click(screen.getByTestId('ai-draft-accept'));
    await screen.findByRole('button', { name: 'Check saved section' });
    apiRequest.mockResolvedValueOnce(response({ success: true, documents: [{ id: docId, program_id: projectId }] }))
      .mockResolvedValueOnce(response({ success: true, sections: [{ id: 'section-1', doc_id: docId,
        content: '<p>Actual saved content for inspection.</p>' }] }));
    fireEvent.click(screen.getByRole('button', { name: 'Check saved section' }));
    const saved = await screen.findByTestId('ai-draft-saved-check');
    expect(saved.textContent).toContain('Actual saved content for inspection.');
    expect(saved.textContent).toMatch(/does not identify which request/i);
    expect(saved.querySelector('textarea,[contenteditable="true"]')).toBeNull();
    expect((screen.getByTestId('ai-draft-body') as HTMLTextAreaElement).value).toBe('Edited section-1.');
    expect((screen.getByTestId('ai-draft-accept') as HTMLButtonElement).disabled).toBe(true);
    expect(apiRequest.mock.calls.filter(([method]) => method === 'POST')).toHaveLength(1);
    expect(onAccepted).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled();
  });
});
afterEach(() => { cleanup(); delete window.C2C_PROJECT; sessionStorage.clear(); });

describe('retained AnA section reviews', () => {
  it('blocks acceptance while the actual editor has unsaved text', async () => {
    apiRequest.mockResolvedValue(response({ success: true, draft: { content: 'Candidate text.', draftId: 'draft-1' } }));
    render(<AuthoringAiDraft {...props({ editorDirty: true })} />);
    fireEvent.click(screen.getByTestId('ai-draft-generate'));
    const accept = await screen.findByTestId('ai-draft-accept');
    expect((accept as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(accept);
    expect(apiRequest.mock.calls.filter(([, path]) => String(path).endsWith('/accept'))).toHaveLength(0);
  });

  it('retains each controlled candidate, edits and reason when sections change', async () => {
    function Owner() {
      const [selected, select] = useState('section-1');
      const [reviews, update] = useState<Record<string, AiDraftReviewState>>({ 'section-1': initial(), 'section-2': initial('section-2') });
      return <><button onClick={() => select(selected === 'section-1' ? 'section-2' : 'section-1')}>Switch review</button>
        <AuthoringAiDraft {...props({ sectionId: selected })} reviewSession={{ state: reviews[selected],
          update: next => update(all => ({ ...all, [selected]: next })), isCurrent: () => true }} /></>;
    }
    render(<Owner />);
    expect((screen.getByTestId('ai-draft-body') as HTMLTextAreaElement).value).toBe('Edited section-1.');
    fireEvent.change(screen.getByTestId('ai-draft-body'), { target: { value: 'My retained review.' } });
    fireEvent.click(screen.getByText('Switch review'));
    expect((screen.getByTestId('ai-draft-body') as HTMLTextAreaElement).value).toBe('Edited section-2.');
    fireEvent.click(screen.getByText('Switch review'));
    expect((screen.getByTestId('ai-draft-body') as HTMLTextAreaElement).value).toBe('My retained review.');
    expect((screen.getByPlaceholderText('Accepted AI draft') as HTMLInputElement).value).toBe('Reviewed against evidence.');
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it.each(['section change', 'session change', 'project round trip', 'unmount'])('suppresses a delayed generation after %s', async reason => {
    const pending = deferred<Response>();
    apiRequest.mockReturnValue(pending.promise);
    const view = render(<AuthoringAiDraft {...props()} />);
    fireEvent.click(screen.getByTestId('ai-draft-generate'));
    if (reason === 'section change') view.rerender(<AuthoringAiDraft {...props({ sectionId: 'section-2' })} />);
    if (reason === 'session change') identity.revision += 1;
    if (reason === 'project round trip') { publishShellProject({ id: 'bbbbbbbb-0000-4000-8000-000000000002' }); publishShellProject({ id: projectId }); }
    if (reason === 'unmount') view.unmount();
    await act(async () => { pending.resolve(response({ success: true, draft: { content: 'Late candidate.', draftId: 'late' } })); await pending.promise; });
    expect(screen.queryByTestId('ai-draft-body')).toBeNull();
    expect(onAccepted).not.toHaveBeenCalled();
    expect(fireToast).not.toHaveBeenCalled();
  });

  it('holds an unknown acceptance until an explicit exact saved-section check', async () => {
    apiRequest.mockRejectedValueOnce(new TypeError('response lost'));
    function Owner() {
      const [state, update] = useState(initial());
      return <AuthoringAiDraft {...props()} reviewSession={{ state, update, isCurrent: () => true }} />;
    }
    render(<Owner />);
    fireEvent.click(screen.getByTestId('ai-draft-accept'));
    await screen.findByRole('button', { name: 'Check saved section' });
    expect((screen.getByTestId('ai-draft-accept') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('ai-draft-refusal').textContent).toMatch(/could not confirm/i);
    expect(screen.getByTestId('ai-draft-refusal').textContent).not.toMatch(/unchanged/i);
    apiRequest.mockResolvedValueOnce(response({ success: true, sections: [{ id: 'section-1', doc_id: docId, content: 'Edited section-1.' }] }));
    fireEvent.click(screen.getByRole('button', { name: 'Check saved section' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', `/api/authoring/docs/${docId}/sections`));
    expect(apiRequest.mock.calls.filter(([method]) => method === 'POST')).toHaveLength(1);
    expect(onAccepted).not.toHaveBeenCalled();
    expect(screen.getByTestId('ai-draft-refusal').textContent).toMatch(/does not identify/i);
  });
});
