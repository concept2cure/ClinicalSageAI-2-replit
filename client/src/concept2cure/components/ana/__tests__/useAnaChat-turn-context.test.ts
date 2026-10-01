// @vitest-environment jsdom
/**
 * A turn can name the document the person has open, for that turn only
 * (2026-10-01, D2 canvas → editor, step 5).
 *
 * The conversation thread runs on the shell's chat, which is created without
 * an authoring context: the shell does not know a document is open beside the
 * conversation. So a turn sent while the person builds a document reached AnA
 * with no document, no section and no module. "Draft this section" named
 * nothing she could resolve.
 *
 * `send(text, files, { authoringContext })` puts the open document on that one
 * turn, through the same `authoring_context` slot the editor's own chat uses
 * (rendered by the stream route as "Current Authoring Context"). A host's own
 * context is the default; the turn's wins; and a turn without one sends the
 * host's, never the last turn's.
 *
 * Asserted on the wire, as useAnaChat-drive.test.ts does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

import type { AuthoringContextPack } from '@shared/types/authoring-context';
import { useAnaChat } from '../useAnaChat';

const ev = (o: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(o)}\n\n`);
function closedStream() {
  return new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(ev({ type: 'text', content: 'ok' }));
      c.enqueue(ev({ type: 'done' }));
      c.close();
    },
  });
}

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => ({ ok: true, status: 200, body: closedStream() }));
  (globalThis.fetch as unknown) = fetchMock;
});
afterEach(() => cleanup());

const streamBodies = () =>
  fetchMock.mock.calls
    .filter((c) => String(c[0]).includes('/api/ana-ri/stream'))
    .map((c) => JSON.parse(String((c[1] as RequestInit).body)));

const OPEN: AuthoringContextPack = {
  projectId: '5ac45b38-a1d8-4a41-9488-fac39a57b852',
  workflowStage: 'section-workspace',
  artifactId: 'aaaaaaaa-0000-4000-8000-000000000002',
  artifactStatus: 'DRAFT',
  moduleCode: 'M2',
  sectionCode: '2.5.1',
  sectionTitle: 'Product Development Rationale',
};

describe('a turn names the document open beside the conversation', () => {
  it('sends the turn’s authoring context as authoring_context and in the route context', async () => {
    const { result } = renderHook(() => useAnaChat({ projectId: OPEN.projectId }));
    await act(async () => {
      await result.current.send('Draft this section', undefined, { authoringContext: OPEN });
    });
    const [body] = streamBodies();
    expect(body.authoring_context).toMatchObject({
      projectId: OPEN.projectId,
      workflowStage: 'section-workspace',
      artifactId: OPEN.artifactId,
      sectionCode: '2.5.1',
      sectionTitle: 'Product Development Rationale',
      moduleCode: 'M2',
    });
    expect(body.document_context).toEqual({ section: '2.5.1', module: 'M2' });
    expect(body.context.sectionCode).toBe('2.5.1');
  });

  it('a turn without one sends the host’s context, not the previous turn’s', async () => {
    const { result } = renderHook(() => useAnaChat({ projectId: OPEN.projectId }));
    await act(async () => {
      await result.current.send('first', undefined, { authoringContext: OPEN });
    });
    await act(async () => {
      await result.current.send('second');
    });
    const [, second] = streamBodies();
    expect(second.authoring_context).toBeUndefined();
    expect(second.context.sectionCode).toBeUndefined();
  });

  it('the turn’s context wins over the host’s own', async () => {
    const host: AuthoringContextPack = { projectId: OPEN.projectId, workflowStage: 'section-workspace', sectionCode: '3.2.S.1' };
    const { result } = renderHook(() => useAnaChat({ projectId: OPEN.projectId, authoringContext: host }));
    await act(async () => {
      await result.current.send('with the host’s');
    });
    await act(async () => {
      await result.current.send('with the turn’s', undefined, { authoringContext: OPEN });
    });
    const [first, second] = streamBodies();
    expect(first.authoring_context.sectionCode).toBe('3.2.S.1');
    expect(second.authoring_context.sectionCode).toBe('2.5.1');
  });
});
