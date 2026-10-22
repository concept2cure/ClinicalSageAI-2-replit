// @vitest-environment jsdom
/**
 * EditorBridge.propose under the governed-write rule (AnA reasoning round 14,
 * SEC-A-7).
 *
 * `propose` redlines a quoted passage of the open section as an attributed
 * tracked suggestion, and the person's next Save PATCHes that HTML into
 * `authoring_sections`. So the rule that governs `insert` — only an approved,
 * performance-qualified model may write regulatory text (CLAUDE.md RULE 2,
 * launch row D4) — governs this door too, and the bridge is where it belongs:
 * round 13 left the check to "a caller that redlines with AnA's text", and
 * there is no such caller yet. A rule a future caller must remember to apply
 * is not a rule.
 *
 * Which section and which version of it `propose` takes is the sibling suite,
 * `editorBridgePropose.test.tsx`. This one is only the rule. The scaffolding
 * below is this editor family's per-suite scaffolding, as the canvas suites
 * use it (`vi.mock` is hoisted per file and cannot be shared).
 */
import React from 'react';
import type { Editor } from '@tiptap/core';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async original => ({ ...(await original<typeof import('@/services/portal/authService')>()),
  useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
}));
/* Header widgets unrelated to the bridge, which reach for hooks this test does
   not stand up — the same stubs the canvas suites use. */
vi.mock('../../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));
vi.mock('../../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));

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
const SAVED_AT = '2026-09-30T12:00:00Z';
const STORED = '<p>The product is stable for 18 months at 25 °C/60% RH.</p>';
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const STORED_SHA = sha256(STORED);
const TURN = 'b2e7d9f0-1a3c-4b5d-9e8f-7a6b5c4d3e21';
const ANA = { id: 'ana', name: 'AnA (AI draft)', sourceRecord: TURN };
const PROPOSAL = { sectionId: 'S1', quote: '18 months', replacement: '24 months' };

const ok = (payload: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => payload }) as Response;

function mockApi() {
  const exact: Record<string, () => Response> = {
    [`/api/authoring/docs/${DOC}`]: () =>
      ok({
        success: true,
        document: {
          id: DOC, title: 'Module 3.2.P.8 Stability', module: 'M3', product_code: null,
          status: 'DRAFT', updated_at: SAVED_AT, section_count: 1,
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
  apiRequest.mockImplementation(async (method: string, url: string) => {
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
      if (!latest.canPropose?.()) throw new Error('editor not ready yet');
    },
    { timeout: 4000 },
  );
  return () => latest!;
}

const noRedline = () => {
  expect(document.querySelector('.dcv-workbench del')).toBeNull();
  expect(document.querySelector('.dcv-workbench ins')).toBeNull();
};

beforeEach(() => {
  localStorage.clear();
  mockApi();
  clearEditorTarget();
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  clearEditorTarget();
});

describe('EditorBridge.propose — the governed-write rule, as insert applies it (round 14, SEC-A-7)', () => {
  /* `propose` redlines AnA's words into the section, and the person's next
     Save PATCHes that HTML. So the rule that governs `insert` governs this
     door too, and the bridge is where it belongs: the door has no production
     caller today, which is exactly why the check must exist before one is
     written against it. Fails closed on an absent record, as insert does. */
  const SHA = 'a'.repeat(64);
  const QUALIFIED = { provider: 'anthropic', model: 'claude-opus-5-5', qualified: true, approvedForHighRisk: true, pq: 'pending' as const };
  const UNQUALIFIED = { provider: 'anthropic', model: 'claude-sonnet-5', qualified: false, approvedForHighRisk: false, pq: 'pending' as const };
  const recorded = (servedBy?: typeof QUALIFIED[]) =>
    ({ status: 'recorded' as const, id: TURN, sha256: SHA, ...(servedBy ? { servedBy } : {}) });

  it('refuses a redline whose turn the rule does not admit, and names the model as the reason', async () => {
    const bridge = await openBridge();
    const refused = await bridge().propose({ ...PROPOSAL, baseSha256: STORED_SHA }, ANA, recorded([UNQUALIFIED]));
    expect(refused).toEqual({
      ok: false,
      reason: 'model-not-approved',
      message: 'This answer was written by claude-sonnet-5, which is not approved for regulatory drafting, so the answer can\u2019t be inserted.',
    });
    noRedline();
  });

  it('fails closed when the models are not given at all, or the answer did not finish', async () => {
    const bridge = await openBridge();
    /* No servedBy, no record, and a finished-flag the caller did not set: each
       is a view that was not told, and none may redline AnA's words. */
    for (const call of [
      () => bridge().propose({ ...PROPOSAL, baseSha256: STORED_SHA }, ANA, recorded()),
      () => bridge().propose({ ...PROPOSAL, baseSha256: STORED_SHA }, ANA),
      () => bridge().propose({ ...PROPOSAL, baseSha256: STORED_SHA }, ANA, recorded([QUALIFIED]), true),
    ]) {
      const r = await call();
      expect(r.ok).toBe(false);
      expect(r).toMatchObject({ reason: 'model-not-approved' });
      expect(typeof (r as { message?: string }).message).toBe('string');
    }
    noRedline();
  });

  it('gives the model as the reason even when the section and the base are wrong too', async () => {
    /* The truest reason, not the first one the old order happened to reach:
       telling the person to re-read a section they are not in cannot help when
       the model is what the rule refuses. Also the cheapest check — no
       WebCrypto, no await on the section hash. */
    const bridge = await openBridge();
    await expect(bridge().propose({ ...PROPOSAL, sectionId: 'S-OTHER', baseSha256: STORED_SHA }, ANA, recorded([UNQUALIFIED])))
      .resolves.toMatchObject({ ok: false, reason: 'model-not-approved' });
    await expect(bridge().propose({ ...PROPOSAL }, ANA, recorded([UNQUALIFIED])))
      .resolves.toMatchObject({ ok: false, reason: 'model-not-approved' });
    noRedline();
  });

  it('takes a redline the rule admits, and a person\u2019s own is not its business (negative controls)', async () => {
    const bridge = await openBridge();
    await expect(bridge().propose({ ...PROPOSAL, baseSha256: STORED_SHA }, ANA, recorded([QUALIFIED])))
      .resolves.toEqual(expect.objectContaining({ ok: true }));
    expect(document.querySelector('.dcv-workbench del[data-author-id="ana"]')?.textContent).toBe('18 months');
  });

  it('does not gate a person\u2019s own redline, which the rule is not about', async () => {
    /* The rule is about model-authored text. A reviewer redlining a passage
       herself has no turn and needs none, so a gate that asked for one would
       break the door for the people it is meant to protect. */
    const bridge = await openBridge();
    await expect(bridge().propose({ ...PROPOSAL, baseSha256: STORED_SHA }, { id: 'user-7', name: 'Jordan Medical Writer' }))
      .resolves.toEqual(expect.objectContaining({ ok: true }));
    expect(document.querySelector('.dcv-workbench del[data-author-id="user-7"]')?.textContent).toBe('18 months');
  });

  it('a successfully applied fix admits its turn for paste attribution, as insert does', async () => {
    const bridge = await openBridge();
    await expect(bridge().propose({ ...PROPOSAL, baseSha256: STORED_SHA }, ANA, recorded([QUALIFIED])))
      .resolves.toEqual(expect.objectContaining({ ok: true }));
    const ins = document.querySelector('.dcv-workbench ins[data-author-id="ana"]');
    expect(ins?.getAttribute('data-source-record')).toBe(TURN);
    const editor = (document.querySelector('.tiptap') as unknown as { editor: Editor }).editor;
    editor.commands.focus('end');
    editor.view.pasteHTML(`<p>${ins!.outerHTML}</p>`, new Event('paste') as unknown as Parameters<Editor['view']['pasteHTML']>[1]);
    const pasted = Array.from(document.querySelectorAll('.tiptap ins')).filter(el => el.textContent === '24 months');
    expect(pasted).toHaveLength(2);
    expect(pasted.every(el => el.getAttribute('data-author-id') === 'ana' && el.getAttribute('data-source-record') === TURN)).toBe(true);
  });
});
