import React from 'react';
import { expect, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { DocumentAuthoring } from '../surfaces/DocumentAuthoring';
import { ConversationThread } from '../surfaces/ConversationThread';
import { clearEditorTarget } from '../editorTarget';

export const FLOW_PROGRAM = 'bbbbbbbb-0000-4000-8000-000000000001';
export const FLOW_DOC = 'dddddddd-0000-4000-8000-000000000001';
export const FLOW_SECTION = 'aaaaaaaa-0000-4000-8000-000000000001';

export function setAuthoringFlowScope() {
  window.C2C_PROJECT = { id: FLOW_PROGRAM } as typeof window.C2C_PROJECT;
}
export function clearAuthoringFlowScope() {
  delete window.C2C_PROJECT;
  delete window.C2C_CONVO;
  clearEditorTarget();
}

/** Only the actual SSE provider request receives the fixture stream. */
export function serveAuthoringStream(makeStream: () => ReadableStream<Uint8Array>) {
  vi.stubGlobal('fetch', vi.fn(async (url: Parameters<typeof globalThis.fetch>[0]) => String(url).includes('/api/ana-ri/stream')
    ? { ok: true, status: 200, body: makeStream() }
    : { ok: false, status: 503, json: async () => ({}) }));
}

/** Actual surface navigation; the editor's ask prefills the one conversation. */
export function CanonicalAuthoringFlow({ segment = 'biotech' }: { segment?: string }) {
  const [surface, setSurface] = React.useState('document-authoring');
  return surface === 'document-authoring'
    ? <DocumentAuthoring onNav={setSurface} segment={segment} surface={{ id: surface, label: 'Authoring' } as never} />
    : <div data-testid="canonical-conversation"><ConversationThread onNav={setSurface} segment={segment} surface={{ id: surface, label: 'Conversation' } as never} /></div>;
}

export function sentAuthoringTurns(): Array<{ message?: string; context?: { screen?: string }; authoring_context?: Record<string, unknown>; module_context?: Record<string, unknown> }> {
  const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  return calls.filter(c => String(c[0]).includes('/api/ana-ri/stream')).map(c => JSON.parse((c[1] as { body?: string })?.body ?? '{}'));
}

/** Prefilling is not a request: the person confirms it in the canonical composer. */
export async function sendAuthoringPrefill(text?: string) {
  const composer = await screen.findByRole('textbox', { name: 'Reply to AnA' }) as HTMLTextAreaElement;
  expect(sentAuthoringTurns()).toHaveLength(0);
  if (text) fireEvent.change(composer, { target: { value: text } });
  await waitFor(() => expect((screen.getByRole('button', { name: 'Send message to AnA' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.keyDown(composer, { key: 'Enter' });
  return screen.findByTestId('canonical-conversation');
}

export function toolbarDraftButton() {
  const button = screen.getAllByRole('button', { name: /Draft with AnA/ }).find(b => !b.closest('.rse-empty-cta'));
  expect(button, 'the toolbar Draft with AnA button').toBeTruthy();
  return button!;
}
