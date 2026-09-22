// @vitest-environment jsdom
/**
 * DocumentCanvas — accessibility, motion, microcopy and the small-screen
 * contract (docs/design/ANA_DOCUMENT_CANVAS.md; evidence under
 * docs/evidence/CANVAS-POLISH/2026-09-21/).
 *
 * `documentCanvas.test.tsx` pins WHAT the canvas shows and that it converts
 * into the one editor. This file pins how it behaves for someone who is not
 * using a mouse, on a phone, or with motion turned down — the four things the
 * canvas owed when its worker was stopped:
 *
 *   1. The class namespace is the canvas's own. `.dc` is Design Controls'
 *      (coverage-v2.css `.c2c-v2 .dc { padding: 26px 30px 80px }`), and the
 *      canvas took the same name: every card was rendered 60px narrower and
 *      80px taller than its own stylesheet asked for, at every width. A class
 *      the canvas shares with another surface is the defect, so the test is
 *      over the rendered class list, not over one stylesheet.
 *   2. Keyboard. Collapse → expand → edit → collapse with no trap; Escape
 *      collapses FROM ANYWHERE in the expanded region — including when focus
 *      has been left on the body, which a listener bound to the canvas
 *      element never sees — and focus returns to the control that expanded it.
 *      The expand control names what it does and points at what it controls.
 *   3. One way back. The canvas bar and the workbench's own crumbs each drew
 *      "Back to conversation", 75px apart, and the second one overprinted the
 *      crumb trail beside it.
 *   4. Motion and microcopy, read off the source: every transition in the
 *      canvas's stylesheet is ≤200ms ease-out with a reduced-motion escape,
 *      and no string in the canvas, its dialogs or its rails cheers, hedges
 *      or exclaims.
 */
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
}));
vi.mock('../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));
vi.mock('../surfaces/AuthoringPlaceIntoFiling', () => ({
  AuthoringPlaceIntoFiling: () => <button type="button" data-testid="place-into-filing-stub">Place into filing</button>,
}));

const emptyRects = function () { return [] as unknown as DOMRectList; };
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = emptyRects;
  if (typeof proto.getBoundingClientRect !== 'function') {
    proto.getBoundingClientRect = function () {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect;
    };
  }
}

import { DocumentCanvas } from '../editor/DocumentCanvas';
import { clearEditorTarget } from '../editorTarget';

const DOC = 'aaaaaaaa-0000-4000-8000-000000000003';
const PID = '5ac45b38-a1d8-4a41-9488-fac39a57b852';
const ok = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload }) as Response;

const DOC_ROW = {
  success: true,
  document: {
    id: DOC, title: 'Module 2.5 Clinical Overview — C2C-101', module: 'M2', product_code: 'clinical_overview',
    status: 'DRAFT', updated_at: '2026-09-21T10:00:00Z', section_count: 2,
    provenance: { source: 'ana', conversationId: 'thread-1', turnId: 't-9', model: 'claude-fable-5-1' },
  },
};
const SECTIONS = {
  success: true,
  sections: [
    { id: 'S1', doc_id: DOC, code: '2.5.1', title: 'Product Development Rationale', content: '<p>Body one.</p>', order_index: 0, comment_count: 0, revision_count: 1, citation_count: 0, updated_at: null },
    { id: 'S2', doc_id: DOC, code: '2.5.2', title: 'Overview of Biopharmaceutics', content: '<p>Body two.</p>', order_index: 1, comment_count: 0, revision_count: 1, citation_count: 0, updated_at: null },
  ],
};
const PROGRAM = { id: PID, code: 'CAMA', name: '[Demo · Biotech] C2C-101 anti-IL-23p19 mAb', program_type: 'ind', status: 'active', phase: 'planning' };

function mockApi() {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === `/api/authoring/docs/${DOC}`) return ok(DOC_ROW);
    if (method === 'GET' && url === `/api/authoring/docs/${DOC}/sections`) return ok(SECTIONS);
    if (method === 'GET' && url === `/api/c2c/projects/${PID}`) return ok(PROGRAM);
    if (method === 'GET' && url === '/api/task-management/assignees') return ok({ success: true, data: [{ id: '42', name: 'OQ Signer' }], total: 1 });
    if (method === 'GET' && url.startsWith('/api/authoring/sections/')) return ok({ success: true, sources: [], revisions: [] });
    if (method === 'GET' && url.startsWith('/api/authoring/documents/')) return ok({ success: true, comments: [] });
    if (method === 'GET' && url.startsWith(`/api/c2c/projects/${PID}/sources`)) return ok({ sources: [] });
    if (method === 'GET' && url.startsWith('/api/c2c/documents/')) return ok({ success: false }, 404);
    return ok({ success: true });
  });
}

const nav = vi.fn();

function Host() {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <div>
      <button type="button" data-testid="before">Before the canvas</button>
      <DocumentCanvas
        docId={DOC}
        programId={PID}
        conversationId="thread-1"
        fromThisConversation
        draftTitle="Draft title from the stream"
        expanded={expanded}
        onExpandedChange={setExpanded}
        onNav={nav}
        onAsk={() => undefined}
        fireToast={() => undefined}
      />
      <button type="button" data-testid="after">After the canvas</button>
    </div>
  );
}

beforeEach(() => {
  mockApi();
  nav.mockReset();
  clearEditorTarget();
});
afterEach(() => {
  cleanup();
  clearEditorTarget();
});

const REPO = path.resolve(__dirname, '..', '..', '..', '..', '..');
const CSS_DIR = path.join(REPO, 'client', 'src', 'concept2cure', 'v2', 'styles');
const readCss = (f: string) => fs.readFileSync(path.join(CSS_DIR, f), 'utf8');

/** Every class this stylesheet DEFINES (not the ones it only descends into). */
function definedClasses(css: string): Set<string> {
  const out = new Set<string>();
  for (const m of css.matchAll(/\.([a-zA-Z][\w-]*)/g)) out.add(m[1]);
  return out;
}

describe('DocumentCanvas — the class namespace is its own', () => {
  it('shares no class name with the Design Controls surface, whose stylesheet also owns a “.dc” family', async () => {
    render(<Host />);
    const canvas = await screen.findByTestId('document-canvas');
    await screen.findByText('Module 2.5 Clinical Overview — C2C-101');

    const designControls = definedClasses(readCss('coverage-v2.css'));
    /* Every class the canvas puts on the page, including its children — the
       collision is invisible in either stylesheet alone and only shows up in
       the cascade, so the rendered tree is what is checked. */
    const mine = new Set<string>();
    for (const el of [canvas, ...Array.from(canvas.querySelectorAll('*'))]) {
      for (const c of Array.from(el.classList)) mine.add(c);
    }
    /* Classes the canvas deliberately reuses from the shared kit — a button
       is a button. The namespace rule is about the canvas's OWN names. */
    const SHARED = new Set(['btn', 'primary', 'ghost', 'ico', 'req', 'half', 'c2c-input', 'scaf-note', 'nda-open', 'ed-back', 'ed-full-sec-body']);
    const collisions = Array.from(mine).filter(c => !SHARED.has(c) && designControls.has(c));
    expect(collisions).toEqual([]);
  });
});

describe('DocumentCanvas — keyboard', () => {
  it('names what the expand control does and what it controls, and moves focus into the region it opens', async () => {
    render(<Host />);
    await screen.findByText('Module 2.5 Clinical Overview — C2C-101');
    const open = screen.getByTestId('dc-open-editor');
    expect((open.textContent || '').trim()).toBe('Open full editor');
    expect(open.getAttribute('aria-expanded')).toBe('false');
    // aria-controls names the region, and that region exists once opened.
    const controls = open.getAttribute('aria-controls');
    expect(controls).toBeTruthy();

    fireEvent.click(open);
    const expanded = await screen.findByTestId('dc-expanded');
    expect(expanded.getAttribute('id')).toBe(controls);
    expect(screen.getByTestId('dc-open-editor').getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(screen.getByTestId('dc-back'));
  });

  it('Escape collapses from anywhere in the expanded region — including with focus left on the body — and returns focus to the header control', async () => {
    render(<Host />);
    await screen.findByText('Module 2.5 Clinical Overview — C2C-101');
    fireEvent.click(screen.getByTestId('dc-open-editor'));
    await screen.findByTestId('dc-expanded');
    await waitFor(() => expect(document.querySelector('.ed')).not.toBeNull());

    /* Focus on the body is the ordinary state after a click on non-focusable
       chrome. A keydown listener bound to the canvas element never receives
       it, so Escape did nothing and the only way out was the mouse. */
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.getByTestId('dc-expanded').hasAttribute('hidden')).toBe(true));
    expect(document.activeElement).toBe(screen.getByTestId('dc-open-editor'));
  });

  it('offers exactly one way back while expanded', async () => {
    render(<Host />);
    await screen.findByText('Module 2.5 Clinical Overview — C2C-101');
    fireEvent.click(screen.getByTestId('dc-open-editor'));
    const expanded = await screen.findByTestId('dc-expanded');
    await waitFor(() => expect(document.querySelector('.ed')).not.toBeNull());
    expect(within(expanded).getAllByRole('button', { name: /Back to conversation/ })).toHaveLength(1);
  });

  it('does not trap: every control in the collapsed card is reachable, and the card does not hold focus', async () => {
    render(<Host />);
    await screen.findByText('Module 2.5 Clinical Overview — C2C-101');
    const canvas = screen.getByTestId('document-canvas');
    const focusables = Array.from(
      canvas.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
    );
    expect(focusables.length).toBeGreaterThan(3);
    for (const el of focusables) {
      el.focus();
      expect(document.activeElement).toBe(el);
    }
    // Nothing on the canvas pulls focus back when it leaves.
    screen.getByTestId('after').focus();
    expect(document.activeElement).toBe(screen.getByTestId('after'));
  });
});

describe('DocumentCanvas — the dialogs it opens are real dialogs', () => {
  for (const [label, opener, title] of [
    ['File to vault', 'dc-file-to-vault', 'File to vault'],
    ['Assign review', 'dc-assign-review', 'Assign review'],
  ] as const) {
    it(`${label}: labelled, modal, focus trapped while open, focus restored on close`, async () => {
      render(<Host />);
      await screen.findByText('Module 2.5 Clinical Overview — C2C-101');
      const trigger = screen.getByTestId(opener);
      trigger.focus();
      fireEvent.click(trigger);

      const dlg = await screen.findByRole('dialog');
      expect(dlg.getAttribute('aria-modal')).toBe('true');
      expect(document.getElementById(dlg.getAttribute('aria-labelledby')!)?.textContent).toBe(title);
      // Focus is inside the dialog, not left behind on the page.
      await waitFor(() => expect(dlg.contains(document.activeElement)).toBe(true));

      // Tab from the last control wraps to the first rather than escaping.
      const items = Array.from(
        dlg.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      );
      expect(items.length).toBeGreaterThan(1);
      items[items.length - 1].focus();
      fireEvent.keyDown(document, { key: 'Tab' });
      expect(document.activeElement).toBe(items[0]);
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(items[items.length - 1]);

      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(document.activeElement).toBe(screen.getByTestId(opener));
    });
  }
});

describe('the canvas stylesheet — motion', () => {
  const CANVAS_BLOCK = (() => {
    const css = readCss('authoring-v2.css');
    const start = css.indexOf('══ Document canvas');
    expect(start).toBeGreaterThan(-1);
    return css.slice(start);
  })();

  it('every transition and animation is at most 200ms and eases out — no spring, no bounce, no overshoot', () => {
    const tooSlow: string[] = [];
    const notEaseOut: string[] = [];
    for (const m of CANVAS_BLOCK.matchAll(/(?:transition|animation)\s*:\s*([^;]+);/g)) {
      const value = m[1].replace(/\s+/g, ' ').trim();
      if (value === 'none') continue;
      for (const dur of value.matchAll(/(\d*\.?\d+)(ms|s)\b/g)) {
        const ms = dur[2] === 's' ? parseFloat(dur[1]) * 1000 : parseFloat(dur[1]);
        if (ms > 200) tooSlow.push(value);
      }
      if (!/\bease-out\b|\blinear\b/.test(value)) notEaseOut.push(value);
      // A cubic-bezier that leaves [0,1] on either control point overshoots.
      const cb = /cubic-bezier\(([^)]*)\)/.exec(value);
      if (cb) {
        const n = cb[1].split(',').map(Number);
        if (n[1] < 0 || n[3] > 1) notEaseOut.push(value);
      }
    }
    expect({ tooSlow, notEaseOut }).toEqual({ tooSlow: [], notEaseOut: [] });
  });

  it('every animation and transition it declares is removed under prefers-reduced-motion', () => {
    const animated = new Set<string>();
    // The selector immediately above each transition/animation declaration.
    for (const m of CANVAS_BLOCK.matchAll(/([.#][\w][\w\-[\]'"=\s>.:()]*)\{[^{}]*?(?:transition|animation)\s*:\s*(?!none)[^;]+;/g)) {
      const sel = m[1].trim().split(/\s|,/)[0].replace(/[{,]/g, '');
      if (sel) animated.add(sel);
    }
    expect(animated.size).toBeGreaterThan(0);
    const reduced = CANVAS_BLOCK.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n  \}/g) ?? [];
    const reducedText = reduced.join('\n');
    const missing = Array.from(animated).filter(sel => !reducedText.includes(sel.replace(/^\./, '.')));
    expect(missing).toEqual([]);
  });
});

describe('the canvas — microcopy', () => {
  const FILES = [
    'editor/DocumentCanvas.tsx',
    'editor/FileToVaultDialog.tsx',
    'editor/AssignReviewDialog.tsx',
    'editor/ProjectFilesPanel.tsx',
    'editor/ReviewTasksPanel.tsx',
  ];
  const V2 = path.join(REPO, 'client', 'src', 'concept2cure', 'v2');

  /** The user-visible strings: JSX text and quoted strings, minus comments. */
  function visibleText(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ');
  }

  it('never exclaims and never cheers', () => {
    const hits: string[] = [];
    for (const f of FILES) {
      const body = visibleText(fs.readFileSync(path.join(V2, f), 'utf8'));
      for (const line of body.split('\n')) {
        if (/[!]['"’`]|! ['"]|\w!['"]/.test(line)) hits.push(`${f}: ${line.trim()}`);
        if (/\b(Great|Awesome|Oops|Whoops|Nice work|All set|You're all set|Success!|Perfect)\b/.test(line)) hits.push(`${f}: ${line.trim()}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('never hedges in a user-facing string', () => {
    const HEDGE = /\b(might want to|maybe try|you may want to|perhaps|we think|it seems like|sorry|please note|kindly)\b/i;
    const hits: string[] = [];
    for (const f of FILES) {
      const body = visibleText(fs.readFileSync(path.join(V2, f), 'utf8'));
      for (const m of body.matchAll(/(['"])((?:(?!\1)[^\\\n]|\\.){12,240})\1/g)) {
        if (HEDGE.test(m[2])) hits.push(`${f}: ${m[2]}`);
      }
      // JSX text nodes between tags.
      for (const m of body.matchAll(/>([^<>{}\n]{12,240})</g)) {
        if (HEDGE.test(m[1])) hits.push(`${f}: ${m[1].trim()}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
