// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import type { AnaTurnRecordStatus } from '../../../components/ana/useAnaChat.types';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', () => ({
  // authService too: useAuthoringAssemblyBuild's actor() reads the singleton.
  authService: { getUser: () => ({ id: 1, organizationId: 1 }) }, useAuth: () => ({ user: { displayName: 'Author', email: 'author@test.co' } }) }));
vi.mock('../../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));
vi.mock('../../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));
vi.mock('../ProjectFilesPanel', () => ({ ProjectFilesPanel: ({ onOpenDocument }: { onOpenDocument?: (id: string) => void }) => <button type="button" onClick={() => onOpenDocument?.('cccccccc-0000-4000-8000-000000000001')}>Open pulled working copy</button> }));

import { DocumentAuthoring } from '../../surfaces/DocumentAuthoring';
import { ConversationThread } from '../../surfaces/ConversationThread';
import { AuthoringRemedies } from '../AuthoringRemedies';
import { DocumentCanvas } from '../DocumentCanvas';
import { clearEditorTarget, peekEditorTarget } from '../../editorTarget';

const DOC = 'dddddddd-0000-4000-8000-000000000001';
const SEC = 'aaaaaaaa-0000-4000-8000-000000000001';
const PID = 'bbbbbbbb-0000-4000-8000-000000000001';
const AT = '2026-10-13T10:00:00Z';
const TURN = 'eeeeeeee-0000-4000-8000-000000000001';
const QUALIFIED = { provider: 'anthropic', model: 'qualified-test-model', qualified: true, approvedForHighRisk: true, pq: 'pending' as const };
const recorded = (qualified = true): AnaTurnRecordStatus => ({ status: 'recorded', id: TURN, sha256: 'b'.repeat(64), servedBy: [{ ...QUALIFIED, qualified, approvedForHighRisk: qualified }] });
const remedy = (base = AT) => ({ sectionId: SEC, baseUpdatedAt: base, quote: '18 months', replacement: '24 months', reason: 'Align the stated duration with the source AnA read.' });
const answer = (base = AT) => `A duration needs correction.\n\n\`\`\`authoring-remedy\n${JSON.stringify(remedy(base))}\n\`\`\``;
const doc = { id: DOC, title: 'Stability summary', module: 'M3', status: 'draft', updated_at: AT, section_count: 1 };
const section = { id: SEC, doc_id: DOC, code: '3.2.P.8.1', title: 'Stability Summary', content: '<p>The product is stable for 18 months.</p>', order_index: 0, updated_at: AT };
const ok = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload }) as Response;

for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = () => [];
  if (typeof proto.getBoundingClientRect !== 'function') proto.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
}

beforeEach(() => {
  localStorage.clear();
  window.C2C_PROJECT = { id: PID } as typeof window.C2C_PROJECT;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_method: string, url: string) => {
    if (url.startsWith('/api/authoring/docs?')) return ok({ documents: [doc] });
    if (url === `/api/authoring/docs/${DOC}`) return ok({ document: doc });
    if (url === `/api/authoring/docs/${DOC}/sections`) return ok({ sections: [section] });
    if (url === `/api/authoring/sections/${SEC}/sources`) return ok({ sources: [{ citationId: 'cite-1', source: { id: 17, title: 'Stability report' } }] });
    if (url.startsWith('/api/c2c/documents/')) return ok({ success: false }, 404);
    return ok({ success: true });
  });
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); delete window.C2C_PROJECT; delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO; clearEditorTarget(); });

function stream(text: string, turnRecord: AnaTurnRecordStatus) {
  return new ReadableStream<Uint8Array>({ start(controller) {
    for (const event of [{ type: 'text', content: text }, { type: 'done' }, { type: 'post_done', cleanedResponse: text, turnRecord }]) {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
    }
    controller.close();
  } });
}

async function prepareFix(base = AT, qualified = true) {
  const fetchMock = vi.fn(async (url: string, _init?: Parameters<typeof globalThis.fetch>[1]) => url.includes('/api/ana-ri/stream')
    ? { ok: true, status: 200, body: stream(answer(base), recorded(qualified)) }
    : { ok: false, status: 503, json: async () => ({}) });
  vi.stubGlobal('fetch', fetchMock);
  const Flow = () => {
    const [surface, setSurface] = React.useState('document-authoring');
    return surface === 'document-authoring'
      ? <DocumentAuthoring onNav={setSurface} segment="biotech" surface={{ id: surface, label: 'Authoring' } as never} />
      : <ConversationThread onNav={setSurface} segment="biotech" surface={{ id: surface, label: 'Conversation' } as never} />;
  };
  render(<Flow />);
  await screen.findAllByText('Stability Summary');
  await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('18 months'));
  fireEvent.click(screen.getByText('Review with AnA'));
  fireEvent.click(screen.getByRole('button', { name: 'Prepare targeted fixes' }));
  const composer = await screen.findByRole('textbox', { name: 'Reply to AnA' });
  await waitFor(() => expect((screen.getByRole('button', { name: 'Send message to AnA' }) as HTMLButtonElement).disabled).toBe(false));
  expect(fetchMock.mock.calls.some(([url]) => url.includes('/api/ana-ri/stream'))).toBe(false);
  fireEvent.keyDown(composer, { key: 'Enter' });
  const apply = await screen.findByRole('button', { name: 'Apply as tracked suggestion' });
  if (qualified) await waitFor(() => expect((apply as HTMLButtonElement).disabled).toBe(false));
  return { apply, fetchMock };
}

describe('AnA remedies reach the existing editor', () => {
  it('reads saved context and applies an attributed pending replacement without saving or approving', async () => {
    const { apply, fetchMock } = await prepareFix();
    expect(screen.queryByRole('button', { name: 'Insert into 3.2.P.8.1 as tracked suggestion' })).toBeNull();
    const sent = fetchMock.mock.calls.find(([, init]) => typeof init?.body === 'string' && init.body.includes('authoring_context'));
    expect(sent).toBeTruthy();
    const body = JSON.parse(sent![1]!.body as string);
    expect(body.authoring_context).toMatchObject({ artifactId: DOC, sectionId: SEC, sectionUpdatedAt: AT });
    expect(body.authoring_context.sourceArtifactIds).toBeUndefined();
    expect(body.module_context.evidenceSourceIds).toEqual(['17']);
    expect(body.message).toContain('read_authoring_section');
    fireEvent.click(apply);
    await screen.findByRole('button', { name: 'Added as tracked suggestion' });
    expect(document.querySelector('.tiptap del[data-author-id="ana"]')?.textContent).toBe('18 months');
    expect(document.querySelector('.tiptap ins[data-author-id="ana"]')?.textContent).toBe('24 months');
    expect(document.querySelector('.tiptap ins')?.getAttribute('data-source-record')).toBe(TURN);
    expect(apiRequest.mock.calls.some(([method]) => method === 'PATCH')).toBe(false);
    expect(screen.getByText(/Adding the suggestion did not save or approve the document/)).toBeTruthy();
  });

  it('refuses a stale saved base, leaving the current section intact', async () => {
    const { apply } = await prepareFix('2026-10-12T10:00:00Z');
    fireEvent.click(apply);
    await screen.findByText(/saved section changed since AnA read it/);
    expect(document.querySelector('.tiptap del')).toBeNull();
    expect(document.querySelector('.tiptap')?.textContent).toContain('18 months');
  });

  it('shows the model refusal and never offers an unqualified answer as a fix', async () => {
    const { apply } = await prepareFix(AT, false);
    expect((apply as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(apply);
    expect(document.querySelector('.tiptap ins')).toBeNull();
    expect(screen.getByText(/not approved for regulatory drafting/)).toBeTruthy();
  });

  it('offers the same proposal door when the editor is embedded in a conversation', async () => {
    const onAsk = vi.fn();
    let bridge: import('../DocumentWorkbench').EditorBridge | null = null;
    const Mounted = () => {
      const [target, setTarget] = React.useState<typeof bridge>(null);
      return <>
        <DocumentCanvas docId={DOC} programId={PID} conversationId="thread-1" fromThisConversation expanded onExpandedChange={vi.fn()} onNav={vi.fn()} onAsk={onAsk} fireToast={vi.fn()} onEditorBridge={React.useCallback((_id: string, next: import('../DocumentWorkbench').EditorBridge | null) => { bridge = next; setTarget(next); }, [])} />
        <AuthoringRemedies text={answer()} settled record={recorded()} unfinished={false} target={target ?? undefined} />
      </>;
    };
    render(<Mounted />);
    await waitFor(() => {
      expect(bridge).toBeTruthy();
      expect(document.querySelector('.tiptap')?.textContent).toContain('18 months');
    });
    fireEvent.click(screen.getByText('Review with AnA'));
    fireEvent.click(screen.getByRole('button', { name: 'Review document' }));
    expect(onAsk.mock.calls[0][0]).toContain('critique_document');
    await waitFor(() => expect((screen.getByRole('button', { name: 'Apply as tracked suggestion' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Apply as tracked suggestion' }));
    await screen.findByRole('button', { name: 'Added as tracked suggestion' });
    expect(document.querySelector('.tiptap del')?.textContent).toBe('18 months');
    expect(document.querySelector('.tiptap ins')?.textContent).toBe('24 months');
  });

  it('opens a known other section for a fix without applying it to the section currently open', () => {
    const openSection = vi.fn();
    const propose = vi.fn();
    render(<AuthoringRemedies text={answer()} settled record={recorded()} unfinished={false} target={{
      editable: true, sectionId: 'aaaaaaaa-0000-4000-8000-000000000002', sectionCode: '3.2.P.8.2',
      sectionLabels: { [SEC]: '3.2.P.8.1 Stability Summary' }, openSection, propose,
    }} />);
    const apply = screen.getByRole('button', { name: 'Apply as tracked suggestion' });
    expect((apply as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(apply);
    expect(propose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Open section 3.2.P.8.1 Stability Summary' }));
    expect(openSection).toHaveBeenCalledWith(SEC);
    expect(screen.queryByText(SEC)).toBeNull();
  });

  it('holds a pulled working copy behind the existing unsaved guard in a pinned conversation editor', async () => {
    const onNav = vi.fn();
    render(<DocumentCanvas docId={DOC} programId={PID} conversationId="thread-1" fromThisConversation expanded onExpandedChange={vi.fn()} onNav={onNav} onAsk={vi.fn()} fireToast={vi.fn()} />);
    await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('18 months'));
    const editor = (document.querySelector('.tiptap') as unknown as { editor: Editor }).editor;
    act(() => { editor.commands.insertContent('Unsaved note. '); });
    fireEvent.click(screen.getByTestId('vault-rail-open'));
    fireEvent.click(screen.getByRole('button', { name: 'Open pulled working copy' }));
    await screen.findByRole('alertdialog', { name: 'Unsaved changes in 3.2.P.8.1' });
    expect(onNav).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onNav).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Open pulled working copy' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Leave without saving' }));
    expect(onNav).toHaveBeenCalledWith('document-authoring');
    expect(peekEditorTarget()).toMatchObject({ docId: 'cccccccc-0000-4000-8000-000000000001', programId: PID });
    expect(apiRequest.mock.calls.some(([method]) => method === 'PATCH')).toBe(false);
  });
});

describe('tracked remedy review lifecycle', () => {
  it('offers the same guarded remedy again after every tracked part is rejected', async () => {
    const { apply } = await prepareFix();
    fireEvent.click(apply);
    await screen.findByRole('button', { name: 'Added as tracked suggestion' });
    fireEvent.click(screen.getByRole('button', { name: /suggested edit/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject all' }));
    await waitFor(() => expect(document.querySelector('.tiptap ins, .tiptap del')).toBeNull());
    expect(document.querySelector('.tiptap')?.textContent).toContain('18 months');
    const retry = screen.queryByRole('button', { name: 'Apply as tracked suggestion' });
    expect(retry, document.querySelector('.authoring-remedy-note')?.textContent ?? 'No status').toBeTruthy();
    expect((retry as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(retry!);
    await waitFor(() => expect(document.querySelector('.tiptap ins[data-author-id="ana"]')?.textContent).toBe('24 months'));
    expect(document.querySelector('.tiptap del[data-author-id="ana"]')?.textContent).toBe('18 months');
    expect(apiRequest.mock.calls.some(([method]) => method === 'PATCH')).toBe(false);
  });

  it.each(['accept all', 'accept part then reject rest'])('keeps %s settled without allowing another application', async mode => {
    const { apply } = await prepareFix();
    fireEvent.click(apply);
    await screen.findByRole('button', { name: 'Added as tracked suggestion' });
    fireEvent.click(screen.getByRole('button', { name: /suggested edit/i }));
    if (mode === 'accept all') fireEvent.click(screen.getByRole('button', { name: 'Accept all' }));
    else {
      fireEvent.click(screen.getAllByRole('button', { name: 'Accept' })[0]);
      expect(document.querySelector('.tiptap ins, .tiptap del')).toBeTruthy();
      expect((screen.getByRole('button', { name: 'Added as tracked suggestion' }) as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'Reject all' }));
    }
    await waitFor(() => expect(document.querySelector('.tiptap ins, .tiptap del')).toBeNull());
    expect(screen.getByText(/tracked change has been reviewed in the editor/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Added as tracked suggestion' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Apply as tracked suggestion' })).toBeNull();
    expect(apiRequest.mock.calls.some(([method]) => method === 'PATCH')).toBe(false);
  });
});
