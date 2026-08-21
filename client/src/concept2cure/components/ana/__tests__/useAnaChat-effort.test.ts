// @vitest-environment jsdom
/**
 * The chosen effort has to reach the wire.
 *
 * The mode-to-effort mapping is pinned next door in `anaEffortMode.test.ts`.
 * A correct mapping nobody sends is worth nothing — that was the defect: the
 * composer's picker resolved to a real choice in the UI and the request went
 * out without it. So this asserts the request body itself, the way the
 * attachment suite asserts `file_ids`, because the body was never the thing
 * anyone looked at.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

import { useAnaChat } from '../useAnaChat';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');

/** An SSE stream that completes immediately, so `send` settles. */
function sseStream(): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      c.enqueue(enc.encode('data: {"type":"text","content":"ok"}\n\n'));
      c.enqueue(enc.encode('data: {"type":"done"}\n\n'));
      c.close();
    },
  });
}

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200, body: sseStream() });
  (globalThis.fetch as any) = fetchMock;
});
afterEach(cleanup);

function sentBody(): any {
  const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/ana-ri/stream'));
  if (!call) throw new Error('stream route was never called');
  return JSON.parse(call[1].body);
}

async function ask(effortLevel?: 'fast' | 'balanced' | 'thorough' | null) {
  const { result } = renderHook(() => useAnaChat({ projectId: 'p1', effortLevel }));
  await act(async () => {
    await result.current.send('how many patients do I need?');
  });
}

describe('the effort a user chose reaches the request', () => {
  it('sends thorough when Deep research is selected', async () => {
    await ask('thorough');
    expect(sentBody().effort_level).toBe('thorough');
  });

  it('sends fast when Quick ask is selected', async () => {
    await ask('fast');
    expect(sentBody().effort_level).toBe('fast');
  });

  it('omits the field entirely when no mode resolves, rather than guessing', async () => {
    // The server falls back to `balanced` for an absent value. Omitting is
    // honest; sending a level this layer invented would decide how hard AnA
    // works on the strength of a string it did not recognise.
    await ask(null);
    expect(sentBody().effort_level).toBeUndefined();
  });
});

describe('the composer wires its mode into that request', () => {
  /* Carriage. Every rail suite passes props in directly, so none of them can
     see V2App stop mapping the mode — and that seam is exactly where the
     picker was inert for its whole life. */
  const v2app = () =>
    fs.readFileSync(path.join(REPO, 'client/src/concept2cure/v2/V2App.tsx'), 'utf8');

  it('passes the mode-derived effort into useAnaChat', () => {
    expect(v2app()).toMatch(/effortLevel:\s*effortForMode\(prefs\.anaMode\)/);
  });
});
