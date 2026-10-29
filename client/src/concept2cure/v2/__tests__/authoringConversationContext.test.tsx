// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return {
    ...actual,
    authService: {
      // One account object, as AuthService.getUser() returns: the authoring read
      // session is owned by that reference (authoringCurrentRead.ts), so a fresh
      // object per call re-mints the session on every render and never settles.
      getUser: vi.fn().mockReturnValue({ id: 1, organizationId: 1 }),
      captureSessionReadGuard: actual.authService.captureSessionReadGuard.bind(actual.authService),
      on: actual.authService.on.bind(actual.authService),
    },
    useAuth: () => ({ user: { displayName: 'Author', email: 'author@test.co' } })
  };
});
import {
  CanonicalAuthoringFlow, clearAuthoringFlowScope, FLOW_DOC, FLOW_PROGRAM, FLOW_SECTION,
  sendAuthoringPrefill, sentAuthoringTurns, serveAuthoringStream, setAuthoringFlowScope, toolbarDraftButton,
} from './canonicalAuthoringFlow';

const SECOND_SECTION = 'aaaaaaaa-0000-4000-8000-000000000002';
const AT = '2026-10-13T10:00:00Z';
const B_AT = '2026-10-13T11:00:00Z';
const doc = { id: FLOW_DOC, title: 'Current saved document', module: 'M3', status: 'draft', program_id: FLOW_PROGRAM, updated_at: AT, section_count: 2 };
const sections = [
  { id: FLOW_SECTION, doc_id: FLOW_DOC, code: '3.2.S.1', title: 'Section A', content: '<p>Saved section A.</p>', order_index: 0, updated_at: AT },
  { id: SECOND_SECTION, doc_id: FLOW_DOC, code: '3.2.S.2', title: 'Section B', content: '<p>Saved section B.</p>', order_index: 1, updated_at: B_AT },
];
const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

beforeEach(() => {
  setAuthoringFlowScope();
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_method: string, url: string) => {
    if (url.startsWith('/api/authoring/docs?')) return ok({ documents: [doc] });
    // The current read names its project (`?programId=`, authoringCurrentReadPath); the route is the path.
    if (url.split('?')[0] === `/api/authoring/docs/${FLOW_DOC}`) return ok({ document: doc });
    if (url.split('?')[0] === `/api/authoring/docs/${FLOW_DOC}/sections`) return ok({ sections });
    if (url.startsWith('/api/c2c/documents/')) return ok({}, 404);
    return ok({ success: true, sources: [], revisions: [], comments: [] });
  });
  serveAuthoringStream(() => new ReadableStream<Uint8Array>({ start(controller) {
    for (const event of [{ type: 'text', content: 'Saved records reviewed.' }, { type: 'done' }, { type: 'post_done', cleanedResponse: 'Saved records reviewed.' }]) {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
    }
    controller.close();
  } }));
});
afterEach(() => { cleanup(); clearAuthoringFlowScope(); vi.unstubAllGlobals(); });

function reviewOpenSection() {
  fireEvent.click(screen.getByText('Review with AnA'));
  fireEvent.click(screen.getByRole('button', { name: 'Review section' }));
}

describe('embedded asks carry the saved section that asked', () => {
  it('retains current saved section context when a phone ask hides the canvas after the arrival origin was spent', async () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('max-width'), media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: () => false })));
    render(<CanonicalAuthoringFlow />);
    await screen.findAllByText('Section A');
    fireEvent.click(toolbarDraftButton());
    await sendAuthoringPrefill();
    await screen.findByText('Saved records reviewed.');
    expect(screen.queryByTestId('ct-ask-origin')).toBeNull();
    fireEvent.click(await screen.findByTestId('ct-ready-doc-open'));
    await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('Saved section A.'));
    const editor = (document.querySelector('.tiptap') as unknown as { editor: Editor }).editor;
    act(() => { editor.commands.insertContent('Unsaved phone draft. '); });
    reviewOpenSection();
    expect((screen.getByTestId('dc-expanded') as HTMLElement).hidden).toBe(true);
    expect(document.querySelector('.tiptap')?.textContent).toContain('Unsaved phone draft.');
    const composer = screen.getByRole('textbox', { name: 'Reply to AnA' });
    expect(sentAuthoringTurns()).toHaveLength(1);
    await waitFor(() => expect((screen.getByRole('button', { name: 'Send message to AnA' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.keyDown(composer, { key: 'Enter' });
    await waitFor(() => expect(sentAuthoringTurns()).toHaveLength(2));
    expect(sentAuthoringTurns()[1].authoring_context).toMatchObject({ projectId: FLOW_PROGRAM, artifactId: FLOW_DOC, sectionId: FLOW_SECTION, sectionUpdatedAt: AT });
    expect(sentAuthoringTurns()[1].module_context).toMatchObject({ documentId: FLOW_DOC, sectionId: FLOW_SECTION, savedRecordOnly: true });
    expect(JSON.stringify(sentAuthoringTurns()[1])).not.toContain('Unsaved phone draft.');
    expect(apiRequest.mock.calls.some(([method]) => method === 'PATCH')).toBe(false);
  });

  it('uses section B when its review replaces the initial section A handoff before the first send', async () => {
    render(<CanonicalAuthoringFlow />);
    await screen.findAllByText('Section A');
    fireEvent.click(toolbarDraftButton());
    await screen.findByRole('textbox', { name: 'Reply to AnA' });
    await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('Saved section A.'));
    const sectionB = Array.from(document.querySelectorAll('button.ed-tree-row')).find(button => button.textContent?.includes('3.2.S.2'));
    expect(sectionB).toBeTruthy();
    fireEvent.click(sectionB!);
    await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('Saved section B.'));
    reviewOpenSection();
    await sendAuthoringPrefill();
    await waitFor(() => expect(sentAuthoringTurns()).toHaveLength(1));
    expect(sentAuthoringTurns()[0].authoring_context).toMatchObject({ projectId: FLOW_PROGRAM, artifactId: FLOW_DOC, sectionId: SECOND_SECTION, sectionUpdatedAt: B_AT });
    expect(sentAuthoringTurns()[0].module_context).toMatchObject({ documentId: FLOW_DOC, sectionId: SECOND_SECTION, sectionCode: '3.2.S.2', savedRecordOnly: true });
  });
});
