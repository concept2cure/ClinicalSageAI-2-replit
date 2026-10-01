// @vitest-environment jsdom
/**
 * EditorBridge.propose — the conversation's door to an anchored proposal.
 *
 * The conversation never holds the editor; it holds the bridge the embedded
 * workbench hands it for the open section (DocumentWorkbench's
 * `onEditorBridge` effect). An AnA proposal names the section it is for
 * (`sectionId`) and the version of it AnA READ — the SHA-256 of its stored
 * content (`baseSha256`, the hash authoring-read reports) and/or its
 * `updated_at` (`baseUpdatedAt`). The bridge refuses:
 *   - `wrong-section` when the proposal is for a section that is not open;
 *   - `no-base` when it names no version at all — a quote with no base cannot
 *     be shown to have been chosen against the text that is there;
 *   - `stale` when either base differs from the section as loaded, or the
 *     section was saved, reverted or switched after the bridge was handed out;
 *   - `not-editable` when the document is sealed;
 * and otherwise goes through the editor handle's `proposeReplacement`, which
 * refuses for itself where the section cannot take it.
 *
 * Stood up the way the conversation stands it up: DocumentCanvas, expanded,
 * over a mocked store — so the bridge under test is the one the effect builds.
 */
import React from 'react';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
}));
/* Header widgets unrelated to the bridge, which reach for hooks this test does
   not stand up — the same stubs the canvas suites use. */
vi.mock('../../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));
vi.mock('../../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));

/* The sealed-document branch of the bridge, isolated. A sealed document also
   makes the real editor read-only, so the editor's own `not-editable` would
   pass that test whether or not the bridge checks the seal. With `stub.on`,
   the workbench mounts an editor that is always editable and records every
   proposal that reaches it: the refusal must then come from the bridge. */
const stub = vi.hoisted(() => ({ on: false, calls: 0 }));
vi.mock('../RichSectionEditor', async (importOriginal) => {
  const real = await importOriginal<typeof import('../RichSectionEditor')>();
  const Stub = React.forwardRef<unknown, { value?: string }>((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      proposeReplacement: () => {
        stub.calls += 1;
        return { ok: true };
      },
      insertSuggestion: () => true,
      getContent: () => props.value ?? '',
    }));
    return <div className="tiptap" data-testid="editor-stub" />;
  });
  type Props = React.ComponentProps<typeof real.RichSectionEditor>;
  const RichSectionEditor = React.forwardRef<unknown, Props>((props, ref) =>
    stub.on ? (
      <Stub ref={ref} value={props.value} />
    ) : (
      <real.RichSectionEditor {...props} ref={ref as React.Ref<never>} />
    ),
  );
  return { ...real, RichSectionEditor };
});

const emptyRects = function () {
  return [] as unknown as DOMRectList;
};
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<
  Record<string, unknown>
>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = emptyRects;
  if (typeof proto.getBoundingClientRect !== 'function') {
    proto.getBoundingClientRect = function () {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect;
    };
  }
}

import { DocumentCanvas } from '../DocumentCanvas';
import type { EditorBridge } from '../DocumentWorkbench';
import { clearEditorTarget } from '../../editorTarget';

const DOC = 'aaaaaaaa-0000-4000-8000-0000000000b4';
const PID = '5ac45b38-a1d8-4a41-9488-fac39a57b852';
/* What the store says the section was last saved at, and holds. */
const SAVED_AT = '2026-09-30T12:00:00Z';
const STORED = '<p>The product is stable for 18 months at 25 °C/60% RH.</p>';
/* The base authoring-read reports: SHA-256 of the stored content, hex. */
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const STORED_SHA = sha256(STORED);
/* After a save: the row the server hands back. */
const SAVED_AGAIN_AT = '2026-10-01T09:30:00Z';
let patched: string | null = null;
const TURN = 'b2e7d9f0-1a3c-4b5d-9e8f-7a6b5c4d3e21';
const ANA = { id: 'ana', name: 'AnA (AI draft)', sourceRecord: TURN };

const ok = (payload: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => payload }) as Response;

function mockApi(status = 'DRAFT') {
  const exact: Record<string, () => Response> = {
    [`/api/authoring/docs/${DOC}`]: () =>
      ok({
        success: true,
        document: {
          id: DOC, title: 'Module 3.2.P.8 Stability', module: 'M3', product_code: null,
          status, updated_at: SAVED_AT, section_count: 1,
        },
      }),
    [`/api/authoring/docs/${DOC}/sections`]: () =>
      ok({
        success: true,
        sections: [
          {
            id: 'S1', doc_id: DOC, code: '3.2.P.8.1', title: 'Stability Summary and Conclusion',
            content: STORED, order_index: 0,
            comment_count: 0, revision_count: 1, citation_count: 0, updated_at: SAVED_AT,
          },
        ],
      }),
    [`/api/c2c/projects/${PID}`]: () => ok({ id: PID, name: 'C2C-101', phase: 'planning' }),
  };
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: { content?: string }) => {
    if (method === 'PATCH' && url === '/api/authoring/sections/S1') {
      patched = body?.content ?? null;
      return ok({
        success: true,
        section: {
          id: 'S1', doc_id: DOC, code: '3.2.P.8.1', title: 'Stability Summary and Conclusion',
          content: patched, order_index: 0, comment_count: 0, revision_count: 2, citation_count: 0,
          updated_at: SAVED_AGAIN_AT,
        },
      });
    }
    if (method !== 'GET') return ok({ success: true });
    if (url.startsWith('/api/c2c/documents/')) return ok({ success: false }, 404);
    if (url.startsWith('/api/authoring/sections/S1/')) return ok({ success: true, sources: [], revisions: [] });
    if (url.startsWith('/api/authoring/documents/')) return ok({ success: true, comments: [] });
    const hit = exact[url];
    return hit ? hit() : ok({ success: true });
  });
}

/** Mount the canvas expanded and resolve with the bridge its workbench builds. */
async function openBridge(): Promise<() => EditorBridge> {
  let latest: EditorBridge | null = null;
  render(
    <DocumentCanvas
      docId={DOC}
      programId={PID}
      conversationId="thread-1"
      fromThisConversation
      expanded
      onExpandedChange={() => undefined}
      onNav={() => undefined}
      onAsk={() => undefined}
      fireToast={() => undefined}
      onEditorBridge={(_docId, bridge) => {
        latest = bridge;
      }}
    />,
  );
  await screen.findByTestId('dc-expanded');
  await vi.waitFor(
    () => {
      if (!latest || !document.querySelector('.dcv-workbench .tiptap')) throw new Error('no editor bridge yet');
    },
    { timeout: 4000 },
  );
  // Always the newest: the effect rebuilds the bridge when the section row changes.
  return () => latest!;
}

const PROPOSAL = { sectionId: 'S1', quote: '18 months', replacement: '24 months' };

beforeEach(() => {
  mockApi();
  clearEditorTarget();
  stub.on = false;
  stub.calls = 0;
  patched = null;
});
afterEach(() => {
  cleanup();
  clearEditorTarget();
});

const noRedline = () => {
  expect(document.querySelector('.dcv-workbench del')).toBeNull();
  expect(document.querySelector('.dcv-workbench ins')).toBeNull();
};

describe('EditorBridge.propose — which section, and which version of it', () => {
  it('redlines the open section when the base hash is the section as loaded', async () => {
    const bridge = await openBridge();
    await expect(bridge().propose({ ...PROPOSAL, baseSha256: STORED_SHA }, ANA)).resolves.toEqual({ ok: true });
    const del = document.querySelector('.dcv-workbench del[data-author-id="ana"]');
    const ins = document.querySelector('.dcv-workbench ins[data-author-id="ana"]');
    expect(del?.textContent).toBe('18 months');
    expect(ins?.textContent).toBe('24 months');
    expect(del?.getAttribute('data-source-record')).toBe(TURN);
  });

  it('redlines when the base updated_at is the section as loaded, in either serialization', async () => {
    const bridge = await openBridge();
    // The same instant written with milliseconds is the same base.
    await expect(
      bridge().propose({ ...PROPOSAL, baseUpdatedAt: '2026-09-30T12:00:00.000Z' }, ANA),
    ).resolves.toEqual({ ok: true });
    expect(document.querySelector('.dcv-workbench del[data-author-id="ana"]')?.textContent).toBe('18 months');
  });

  it('refuses stale when the hash AnA read is not the stored content, and changes nothing', async () => {
    const bridge = await openBridge();
    await expect(
      bridge().propose({ ...PROPOSAL, baseSha256: sha256('<p>An older text.</p>') }, ANA),
    ).resolves.toEqual({ ok: false, reason: 'stale' });
    noRedline();
  });

  it('refuses stale when the section was saved after AnA read it, and changes nothing', async () => {
    const bridge = await openBridge();
    await expect(
      bridge().propose({ ...PROPOSAL, baseUpdatedAt: '2026-09-29T08:00:00Z' }, ANA),
    ).resolves.toEqual({ ok: false, reason: 'stale' });
    noRedline();
  });

  it('refuses stale when either of two bases differs', async () => {
    const bridge = await openBridge();
    await expect(
      bridge().propose({ ...PROPOSAL, baseSha256: STORED_SHA, baseUpdatedAt: '2026-09-29T08:00:00Z' }, ANA),
    ).resolves.toEqual({ ok: false, reason: 'stale' });
    await expect(
      bridge().propose({ ...PROPOSAL, baseSha256: sha256('other'), baseUpdatedAt: SAVED_AT }, ANA),
    ).resolves.toEqual({ ok: false, reason: 'stale' });
    noRedline();
  });

  it('refuses no-base when the proposal names no version of the section', async () => {
    const bridge = await openBridge();
    await expect(bridge().propose({ ...PROPOSAL }, ANA)).resolves.toEqual({ ok: false, reason: 'no-base' });
    await expect(
      bridge().propose({ ...PROPOSAL, baseSha256: '', baseUpdatedAt: null }, ANA),
    ).resolves.toEqual({ ok: false, reason: 'no-base' });
    noRedline();
  });

  it('refuses wrong-section when the proposal is for a section that is not open', async () => {
    const bridge = await openBridge();
    await expect(
      bridge().propose({ ...PROPOSAL, sectionId: 'S2', baseSha256: STORED_SHA }, ANA),
    ).resolves.toEqual({ ok: false, reason: 'wrong-section' });
    noRedline();
  });

  it('passes the editor’s own refusal through, and keeps the existing fields', async () => {
    const bridge = await openBridge();
    await expect(
      bridge().propose({ ...PROPOSAL, quote: '36 months', baseSha256: STORED_SHA }, ANA),
    ).resolves.toEqual({ ok: false, reason: 'not-found' });
    expect(bridge()).toMatchObject({ docId: DOC, sectionCode: '3.2.P.8.1', editable: true });
    expect(typeof bridge().insert).toBe('function');
  });
});

describe('EditorBridge.propose — after a save', () => {
  it('a base read before the save is stale after it, through the old bridge and the new one', async () => {
    const bridge = await openBridge();
    const before = bridge();
    await expect(before.propose({ ...PROPOSAL, baseSha256: STORED_SHA }, ANA)).resolves.toEqual({ ok: true });

    // Save the redlined section the way the person does: a reason, then Save.
    fireEvent.change(await screen.findByTestId('change-reason'), {
      target: { value: 'AnA stability update' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('save-section'));
    });
    await vi.waitFor(() => {
      if (patched == null || bridge() === before) throw new Error('not saved yet');
    });

    const proposal = { sectionId: 'S1', quote: '25 °C', replacement: '30 °C' };
    // The bridge handed out before the save names a section that is no longer the record.
    await expect(before.propose({ ...proposal, baseSha256: STORED_SHA }, ANA)).resolves.toEqual({
      ok: false,
      reason: 'stale',
    });
    // The new one refuses the old bases, by hash and by updated_at…
    await expect(bridge().propose({ ...proposal, baseSha256: STORED_SHA }, ANA)).resolves.toEqual({
      ok: false,
      reason: 'stale',
    });
    await expect(bridge().propose({ ...proposal, baseUpdatedAt: SAVED_AT }, ANA)).resolves.toEqual({
      ok: false,
      reason: 'stale',
    });
    // …and takes the bases of what was saved.
    await expect(
      bridge().propose({ ...proposal, baseSha256: sha256(patched!), baseUpdatedAt: SAVED_AGAIN_AT }, ANA),
    ).resolves.toEqual({ ok: true });
  });
});

describe('EditorBridge.propose — a sealed document', () => {
  it('refuses not-editable on a frozen document', async () => {
    mockApi('FROZEN');
    const bridge = await openBridge();
    expect(bridge().editable).toBe(false);
    await expect(bridge().propose({ ...PROPOSAL, baseSha256: STORED_SHA }, ANA)).resolves.toEqual({
      ok: false,
      reason: 'not-editable',
    });
    noRedline();
  });

  it('refuses for the seal itself, even where the editor would take the proposal', async () => {
    stub.on = true;
    // The control: an open document reaches the (always-editable) editor.
    const open = await openBridge();
    await expect(open().propose({ ...PROPOSAL, baseSha256: STORED_SHA }, ANA)).resolves.toEqual({ ok: true });
    expect(stub.calls).toBe(1);
    cleanup();

    mockApi('FROZEN');
    const sealed = await openBridge();
    await expect(sealed().propose({ ...PROPOSAL, baseSha256: STORED_SHA }, ANA)).resolves.toEqual({
      ok: false,
      reason: 'not-editable',
    });
    expect(stub.calls, 'a sealed document\u2019s proposal reached the editor').toBe(1);
  });
});
