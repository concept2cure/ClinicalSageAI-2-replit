// @vitest-environment jsdom
/**
 * A surface that authors a typed document states its registry type, and the
 * turn carries it (D2, 2026-10-15; the client half of "the open document's
 * type reaches AnA's turn").
 *
 * Measured at d7ed0d0fb: useAnaChat sent `document_context` as {section,
 * module} only, and only when an authoring pack was present, so Protocol
 * Development, the Investigator's Brochure and the CSR workflow — which have
 * no pack — sent no document context and no type at all. The server now
 * resolves a stated registry type to its outline (open-document.ts); this is
 * how a surface states one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

import { useAnaChat } from '../useAnaChat';
import { toModuleContext } from '../../../v2/surfaceContext';

const ev = (o: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(o)}\n\n`);
const closedStream = () => new ReadableStream<Uint8Array>({
  start(c) { c.enqueue(ev({ type: 'text', content: 'ok' })); c.enqueue(ev({ type: 'done' })); c.close(); },
});

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

describe('a surface states the type of the document it authors', () => {
  it('the published context carries it on the wire as document_type', () => {
    expect(toModuleContext({ surfaceId: 'investigator-brochure', summary: 'IB', documentType: 'ICH_IB' }))
      .toMatchObject({ surface: 'investigator-brochure', document_type: 'ICH_IB' });
  });

  it('a turn from that surface sends it as document_context.documentType, with no authoring pack', async () => {
    const moduleContext = toModuleContext({ surfaceId: 'protocol-dev', summary: 'Protocol', documentType: 'ICH_PROTOCOL' });
    const { result } = renderHook(() => useAnaChat({ moduleContext: moduleContext ?? undefined }));
    await act(async () => { await result.current.send('What is missing?'); });
    const [body] = streamBodies();
    expect(body.document_context).toMatchObject({ documentType: 'ICH_PROTOCOL' });
  });

  it('an authoring pack that names its type sends it in authoring_context too', async () => {
    const pack = { projectId: 'p', workflowStage: 'section-workspace', documentType: 'ICH_CSR' } as never;
    const { result } = renderHook(() => useAnaChat({ authoringContext: pack }));
    await act(async () => { await result.current.send('Draft 9.1'); });
    const [body] = streamBodies();
    expect(body.authoring_context).toMatchObject({ documentType: 'ICH_CSR' });
    expect(body.document_context).toMatchObject({ documentType: 'ICH_CSR' });
  });

  it('a surface that states no type sends no document context, as before', async () => {
    const { result } = renderHook(() => useAnaChat({ moduleContext: { surface: 'vault', summary: 'Vault' } }));
    await act(async () => { await result.current.send('hi'); });
    expect(streamBodies()[0].document_context).toBeUndefined();
  });
});
