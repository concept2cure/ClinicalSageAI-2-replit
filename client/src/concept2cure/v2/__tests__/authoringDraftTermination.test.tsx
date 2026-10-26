// @vitest-environment jsdom
/** Existing client refusal controls, not fail-first proof of the server defect. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AssemblySection } from '@shared/authoring/assembly';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({
  ...(await original<typeof import('@/lib/queryClient')>()), apiRequest,
}));
vi.mock('@/services/portal/authService', async original => ({
  ...await original<typeof import('@/services/portal/authService')>(),
  useAuth: () => ({ user: { id: '7', organizationId: '9' } }),
}));

import { ApiRequestError } from '@/lib/queryClient';
import { authService } from '@/services/portal/authService';
import { AuthoringAiDraft } from '../surfaces/AuthoringAiDraft';
import { publishShellProject } from '../shellProject';
import { generateAuthoringDraft } from '../editor/authoringDraftTransport';
import { runAssemblyDrafts } from '../editor/assemblyDraftQueue';
import { initialAssemblyState, type AssemblyBucket, type AssemblyBuildOptions } from '../editor/assemblyBuildState';
import { captureAssemblyHeaders } from '../editor/assemblyBuildTransport';
import type { AssemblyOperation } from '../editor/useAuthoringAssemblyBuild';

const PROGRAM = 'bbbbbbbb-0000-4000-8000-000000000001';
const DOC = 'termination-document';
const MESSAGE = 'This draft was cut off. Shorten or split this section, then regenerate before accepting it.';
const fireToast = vi.fn();
const onAccepted = vi.fn();
const onClose = vi.fn();
const response = (body: unknown): Response => ({ ok: true, status: 200, json: async () => body }) as Response;
const cutoff = () => new ApiRequestError(MESSAGE, 422,
  { success: false, error: { code: 'DRAFT_TRUNCATED', message: MESSAGE } }, 'DRAFT_TRUNCATED');
const candidate = (id: string, content: string) => response({ success: true,
  draft: { draftId: id, content, metadata: { source: 'model', retrievalStatus: 'ok' } } });

function mount() {
  return render(<AuthoringAiDraft sectionId="section-1" sectionCode="2.5" sectionTitle="Overview"
    docId={DOC} docSealed={false} editorDirty={false} onAccepted={onAccepted}
    onClose={onClose} fireToast={fireToast} />);
}
function savedSections(): AssemblySection[] {
  return ['first', 'second', 'third'].map((id, index) => ({ id, doc_id: DOC, code: `2.5.${index + 1}`,
    title: id, content: '', order_index: index, updated_at: '2026-10-18T00:00:00Z' }));
}
function operationFor(sections: AssemblySection[]): AssemblyOperation {
  const token = {};
  const identity = { generation: 0, retired: false, actor: { userId: '7', organizationId: '9' }, session: authService.captureSessionReadGuard() };
  const options: AssemblyBuildOptions = { docId: DOC, programId: PROGRAM, docSealed: false,
    editorDirty: false, onStructureBuilt: vi.fn(), onReviewSection: vi.fn() };
  const bucket: AssemblyBucket = { token, owner: identity, stopRequested: false, sourceRevision: 0,
    state: { ...initialAssemblyState(), phase: 'built', withAna: true,
      slots: sections.map(section => ({ section, status: 'not-started', draftRegion: 'FDA',
        referenceContext: '', sourceSelectionKey: 'template-only',
        review: { draft: null, body: '', changeReason: '', refusal: null } })) } };
  const owner: AssemblyOperation['owner'] = { options, key: 'current-editor', revision: 0,
    contextRevision: 0, savedReuseRevision: 0, alive: true, bucket, redraw: vi.fn(),
    identity, authCurrent: identity.session.sameRevision, headers: captureAssemblyHeaders, leaveRefusal: () => null };
  return { owner, bucket, token, options, headers: owner.headers(), current: () => true,
    update: patch => { bucket.state = { ...bucket.state, ...patch }; } };
}

beforeEach(() => {
  apiRequest.mockReset(); fireToast.mockReset(); onAccepted.mockReset(); onClose.mockReset();
  authService.setToken(`fixture.${btoa(JSON.stringify({ userId: 7, organizationId: 9 }))}.synthetic`,
    { id: '7', organizationId: '9', roles: ['author'], permissions: [] }, 'fixture-refresh', 3600);
  publishShellProject({ id: PROGRAM });
});
afterEach(() => { cleanup(); authService.endSession(null); });

describe('editor termination refusal uses the existing actual transport and review hooks', () => {
  it('retains the nested 422 classification through the shared generation transport', async () => {
    apiRequest.mockRejectedValue(cutoff());
    const result = await generateAuthoringDraft({ sectionId: 'section-1' });
    expect(result).toEqual({ ok: false, status: 422, code: 'DRAFT_TRUNCATED', message: MESSAGE, unknown: false });
    expect(result).not.toHaveProperty('draft');
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest.mock.calls[0][1]).toBe('/api/authoring/sections/section-1/ai/draft');
  });

  it('a fresh refusal creates no review body or Accept control and reports the repair action', async () => {
    // Production apiRequest throws for 422; it does not resolve a non-ok Response.
    apiRequest.mockRejectedValue(cutoff());
    mount();
    fireEvent.click(screen.getByTestId('ai-draft-generate'));
    await waitFor(() => expect(fireToast).toHaveBeenCalledWith(expect.stringContaining(MESSAGE), 'error'));
    expect(screen.queryByTestId('ai-draft-body')).toBeNull();
    expect(screen.queryByTestId('ai-draft-accept')).toBeNull();
    expect(screen.queryByTestId('ai-draft-grounding')).toBeNull();
    expect(onAccepted).not.toHaveBeenCalled();
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest.mock.calls.some(([, url]) => String(url).endsWith('/accept'))).toBe(false);
  });

  it('failed regeneration preserves the prior valid candidate and edited review until explicit acceptance', async () => {
    apiRequest.mockResolvedValueOnce(candidate('kept-candidate', 'Original valid candidate.'))
      .mockRejectedValueOnce(cutoff())
      .mockResolvedValueOnce(response({ success: true, section: { id: 'section-1', doc_id: DOC, content: 'My reviewed text.' } }));
    mount();
    fireEvent.click(screen.getByTestId('ai-draft-generate'));
    await screen.findByTestId('ai-draft-body');
    fireEvent.change(screen.getByTestId('ai-draft-body'), { target: { value: 'My reviewed text.' } });
    fireEvent.change(screen.getByPlaceholderText('Accepted AI draft'), { target: { value: 'Checked against the source.' } });
    fireEvent.click(screen.getByTestId('ai-draft-regenerate'));
    await waitFor(() => expect(fireToast).toHaveBeenCalledWith(expect.stringContaining(MESSAGE), 'error'));
    expect((screen.getByTestId('ai-draft-body') as HTMLTextAreaElement).value).toBe('My reviewed text.');
    expect((screen.getByPlaceholderText('Accepted AI draft') as HTMLInputElement).value).toBe('Checked against the source.');
    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(onAccepted).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('ai-draft-accept'));
    await waitFor(() => expect(onAccepted).toHaveBeenCalledTimes(1));
    expect(apiRequest.mock.calls[2]).toEqual(['POST', '/api/authoring/sections/section-1/ai/draft/accept',
      { draftId: 'kept-candidate', content: 'My reviewed text.', changeReason: 'Checked against the source.' }]);
  });
});

describe('actual assembly queue preserves completed work on a termination refusal', () => {
  it('retains the first candidate, fails the second, and never starts the third or accepts/retries automatically', async () => {
    const sections = savedSections();
    apiRequest.mockImplementation(async (method: string, url: string) => {
      const path = new URL(url, 'http://localhost').pathname;
      if (method === 'GET' && path === '/api/authoring/docs') return response({ success: true, documents: [{ id: DOC, program_id: PROGRAM, readScope: 'document' }] });
      if (method === 'GET' && path === `/api/authoring/docs/${DOC}`) return response({ success: true, document: { id: DOC, client_program_id: PROGRAM, readScope: 'document' } });
      if (method === 'GET' && path.endsWith('/sections')) return response({ success: true, sections, readScope: 'document' });
      if (url === '/api/authoring/sections/first/ai/draft') return candidate('first-candidate', 'Completed first candidate.');
      if (url === '/api/authoring/sections/second/ai/draft') throw cutoff();
      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    const operation = operationFor(sections);
    await runAssemblyDrafts(operation);
    const { state } = operation.bucket;
    expect(state.phase).toBe('stopped');
    expect(state.slots.map(slot => [slot.section.id, slot.status])).toEqual([
      ['first', 'ready'], ['second', 'failed'], ['third', 'not-started'],
    ]);
    expect(state.slots[0].review).toMatchObject({ draft: { draftId: 'first-candidate', generated: 'Completed first candidate.' }, body: 'Completed first candidate.' });
    expect(state.slots[0].current?.()).toBe(true);
    expect(state.slots[1]).toMatchObject({ message: MESSAGE, review: { draft: null, body: '' } });
    expect(state.message).toMatch(/1 candidate retained.*retry failed or not-started.*explicitly/i);
    const posts = apiRequest.mock.calls.filter(([method]) => method === 'POST');
    expect(posts.map(([, url]) => url)).toEqual([
      '/api/authoring/sections/first/ai/draft', '/api/authoring/sections/second/ai/draft',
    ]);
    for (const [method, url] of apiRequest.mock.calls) {
      if (method === 'GET') expect(new URL(String(url), 'http://localhost').searchParams.get('programId')).toBe(PROGRAM);
    }
    expect(sections.every(section => section.content === '')).toBe(true);
    expect(onAccepted).not.toHaveBeenCalled();
  });
});
