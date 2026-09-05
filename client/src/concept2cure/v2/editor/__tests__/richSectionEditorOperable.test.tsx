// @vitest-environment jsdom
/**
 * The editor's toolbar — operable by keyboard, and honest about the record.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 * `grep fireEvent.click` across the existing editor suites returns two hits,
 * both on the surface's own Save button. NOTHING had ever pressed a ribbon
 * control. `richSectionEditorAuthoring.test.tsx` asserts
 * `screen.getByTitle(/insert table/i)` EXISTS and never activates it — so a
 * toolbar in which twelve buttons could not be operated from a keyboard at all
 * passed a green suite indefinitely.
 *
 * ── The three defects pinned here ────────────────────────────────────────────
 *
 * 1. MOUSE-ONLY CONTROLS. Every ribbon button bound `onMouseDown` and nothing
 *    else. Keyboard activation of a <button> dispatches only `click`, so Enter
 *    and Space did nothing. TipTap's own keymaps rescue nine of them (⌘B, ⌘I,
 *    ⌘U, the lists, undo/redo), which is why it went unnoticed — but Insert
 *    table, Cite the selected claim, Comment on the selection and all six table
 *    controls had NO keyboard path. WCAG 2.1.1, on the surface where a CTD
 *    author builds tables.
 *
 * 2. A TOOLBAR REBUILT ON EVERY KEYSTROKE. `RB` was declared inside the render
 *    body, so each render was a new component TYPE and React tore down and
 *    rebuilt all twelve-to-seventeen buttons' DOM nodes. `onUpdate` fires four
 *    state setters per keystroke, so that was every character — and the pressed
 *    button's node being destroyed under the pointer dropped focus to <body>.
 *
 * 3. A FABRICATED WORD COUNT. In source mode the TipTap instance is constructed
 *    empty, and the footer read its count from there — so a section the
 *    fidelity gate had dropped to raw source reported "0 words" while holding a
 *    full section of text. Invented metadata on exactly the records the gate
 *    flagged as most delicate.
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import { RichSectionEditor } from '../RichSectionEditor';

afterEach(cleanup);

const base = {
  value: '<p>Sterile filter validation summary.</p>',
  onSave: vi.fn(async () => {}),
  chrome: 'full' as const,
  ariaLabel: 'Section content',
};

describe('the ribbon is operable without a mouse', () => {
  it('activates on click, which is what Enter and Space dispatch', () => {
    render(<RichSectionEditor {...base} />);
    const table = screen.getByRole('button', { name: /insert table/i });

    /* fireEvent.click is exactly what a keyboard Enter/Space produces on a
       <button>. Before the fix this handler did not exist — the control bound
       only onMouseDown — so the document was unchanged and nothing happened. */
    fireEvent.click(table);

    expect(
      document.querySelector('.tiptap table'),
      'Insert table did nothing when activated the way a keyboard activates it',
    ).toBeTruthy();
  });

  it('reports its pressed state as false rather than omitting it', () => {
    render(<RichSectionEditor {...base} />);
    const bold = screen.getByRole('button', { name: /^bold/i });
    /* `aria-pressed={active || undefined}` removed the attribute when off,
       which tells a screen reader "not a toggle" rather than "not pressed". */
    expect(bold.getAttribute('aria-pressed')).toBe('false');
  });

  it('names its shortcut so it is discoverable', () => {
    render(<RichSectionEditor {...base} />);
    /* Every title was a bare noun. A toolbar that hides its own shortcuts
       teaches nobody the faster path. */
    expect(screen.getByRole('button', { name: /bold \(⌘B\)/i })).toBeTruthy();
  });
});

describe('the toolbar is not rebuilt on every render', () => {
  it('defines its button at module scope, not inside the render body', () => {
    /* This started as a DOM-identity assertion — render, fire an input at the
       canvas, expect the same button node. It passed with the defect
       reintroduced, because `fireEvent.input` on a ProseMirror canvas does not
       drive a React re-render in jsdom, so there was nothing for it to observe.
       A check that cannot fail is worse than no check: it reports safety it has
       not established. (Verified by injecting the defect and watching it stay
       green.)
       The property is structural, so it is asserted structurally. `RB` declared
       inside the component body is a new component TYPE on every render, which
       is what made React tear down and rebuild all twelve-to-seventeen ribbon
       buttons per keystroke and drop focus to <body>. At module scope it cannot. */
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'RichSectionEditor.tsx'),
      'utf8',
    );
    const rbDecl = src.indexOf('const RB = React.memo');
    const componentDecl = src.indexOf('export const RichSectionEditor');
    expect(rbDecl, 'RB is no longer declared as a memoized component').toBeGreaterThan(-1);
    expect(componentDecl).toBeGreaterThan(-1);
    expect(
      rbDecl < componentDecl,
      'RB is declared inside the component body — every render rebuilds the whole ribbon',
    ).toBe(true);
    /* And nothing shadows it with a per-render wrapper. */
    expect(src.slice(componentDecl)).not.toMatch(/^\s+const RB\s*=/m);
  });
});

describe('the footer counts what is actually there', () => {
  it('counts the source text when the fidelity gate drops to raw source', () => {
    /* An <img> has no text, so the text-only fidelity gate cannot judge it and
       the editor falls back to source mode — see RichSectionEditor's boot. */
    render(
      <RichSectionEditor
        {...base}
        value={'<p>One two three four five.</p><figure><img src="x.png" alt="" /></figure>'}
      />,
    );
    const foot = document.querySelector('.rse-foot');
    expect(foot, 'no footer rendered').toBeTruthy();
    /* Was "0 words": the count came from a TipTap instance that source mode
       constructs empty. */
    /* No trailing \b: the footer concatenates without spacing, so "words" is
       immediately followed by "Save" and a word boundary cannot match there. */
    expect(foot!.textContent).not.toMatch(/(^|\W)0 words/);
    expect(foot!.textContent).toMatch(/(^|\W)5 words/);
  });
});

describe('an AI draft is never reported as inserted when it is discarded', () => {
  /* The worst kind of failure this surface can have: the author is TOLD their
     regulatory text landed, and sent to review it, while it was thrown away.
     In source mode the TipTap instance exists but is a shell — the textarea is
     the document, and `doSave` serializes that, never the editor. The insert
     went into an invisible ProseMirror document and `run()` still returned
     true, so the caller's honest failure branch never fired. */
  it('refuses in source mode, where the editor is not the document', () => {
    const ref = React.createRef<any>();
    render(
      <RichSectionEditor
        {...base}
        ref={ref}
        /* An <img> carries no text, so the text-only fidelity gate cannot judge
           it and the editor drops to raw source. */
        value={'<p>Stored section.</p><figure><img src="x.png" alt="" /></figure>'}
      />,
    );
    expect(
      ref.current?.insertSuggestion('Proposed CER wording.', { id: 'ana', name: 'AnA (AI draft)' }),
      'reported success for a draft that is discarded on save',
    ).toBe(false);
  });

  it('refuses on a frozen section, whose save the server would refuse anyway', () => {
    const ref = React.createRef<any>();
    render(<RichSectionEditor {...base} ref={ref} readOnly />);
    expect(
      ref.current?.insertSuggestion('Proposed wording.', { id: 'ana', name: 'AnA (AI draft)' }),
      'reported success for an insert into a sealed record',
    ).toBe(false);
  });

  it('still inserts, and reports so, on an editable rich section', () => {
    const ref = React.createRef<any>();
    render(<RichSectionEditor {...base} ref={ref} />);
    expect(
      ref.current?.insertSuggestion('Proposed wording.', { id: 'ana', name: 'AnA (AI draft)' }),
      'the working path must keep working',
    ).toBe(true);
    expect(document.querySelector('.tiptap')?.textContent).toContain('Proposed wording.');
  });
});
