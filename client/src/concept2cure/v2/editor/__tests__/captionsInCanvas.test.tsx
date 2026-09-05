// @vitest-environment jsdom
/**
 * Captions in the canvas: written as words, numbered by position, and
 * referenceable.
 *
 * ── What this pins ──────────────────────────────────────────────────────────
 * 1. A STORED CAPTION SURVIVES THE EDITOR. It did not. The schema had no notion
 *    of `<caption>`, so ProseMirror descended into the unknown element and put
 *    its text where the only thing that fits is a CELL — a caption became the
 *    table's first data row, and the next save wrote that into the governed
 *    record. The fail-closed fidelity gate could not catch it: that gate
 *    compares TEXT and every character survived. This is the regression test
 *    for that, asserted on the serialized content rather than on the screen.
 * 2. THE NUMBER IS DRAWN, NEVER STORED. The canvas shows "Table 1. Summary of
 *    adverse events"; `grep` over the serialized content finds no ordinal
 *    anywhere. Tables and figures are counted separately, and the count
 *    continues from the sections above this one — a canvas numbering from 1
 *    would show "Table 1" for an object the filing prints as "Table 3", which
 *    is the plausible-looking wrong number the whole design exists to remove.
 * 3. A TABLE ADDED IN AN EARLIER SECTION RENUMBERS THIS ONE while this
 *    section's stored content is byte-identical. One stored string, two
 *    directories, two renderings — the same proof the cross-reference and
 *    citation canvases are held to.
 * 4. THE RIBBON CAN WRITE A CAPTION, and what it puts in the record is the
 *    words plus an identity. There is deliberately no field for a number.
 * 5. A REFERENCE CAN POINT AT A TABLE, prints its current number, and SAYS SO
 *    when the table is gone — never a number that would look right.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';

import { RichSectionEditor, type RichSectionEditorHandle } from '../RichSectionEditor';
import {
  CaptionNumbering,
  CaptionedTable,
  captionOrderKey,
  captionTargets,
  captionedObjectsInHtml,
  numberDocumentCaptions,
} from '../captionNumbering';
import { AuthoringImage } from '../imageNode';
import { CAPTION_ID_ATTR } from '@shared/authoring/captions';
import { CROSS_REFERENCE_MISSING_TEXT } from '@shared/authoring/cross-references';

afterEach(cleanup);

const AE_TABLE = 'e2b0c6a1-4d55-4f70-9a11-77c3e0b41f92';
const PK_TABLE = '9f41d7c2-1b88-4a03-8e64-5d2a0c9b7e31';
const CHROMATOGRAM = '3c7a5e10-88ba-4c92-b0d6-2e1f4a760c58';

const base = {
  onSave: vi.fn(async () => {}),
  chrome: 'full' as const,
  ariaLabel: 'Section content',
};

/** Stored content as the record holds it: the caption's WORDS and the object's
 *  identity. No ordinal anywhere. */
const STORED_TABLE =
  `<table ${CAPTION_ID_ATTR}="${AE_TABLE}"><caption>Summary of adverse events</caption>` +
  `<tbody><tr><th>System organ class</th><th>n (%)</th></tr>` +
  `<tr><td>Headache</td><td>12 (4.1)</td></tr></tbody></table>`;

const STORED_FIGURE =
  `<img ${CAPTION_ID_ATTR}="${CHROMATOGRAM}" src="/api/authoring/images/77" ` +
  `alt="Chromatogram of batch 21-004">`;

const canvasText = () => document.querySelector('.tiptap')?.textContent ?? '';

describe('reading the document’s captioned objects', () => {
  it('reads a stored section’s tables and figures, in order', () => {
    expect(captionedObjectsInHtml(STORED_TABLE + STORED_FIGURE)).toEqual([
      { kind: 'table', caption: 'Summary of adverse events', id: AE_TABLE },
      { kind: 'figure', caption: 'Chromatogram of batch 21-004', id: CHROMATOGRAM },
    ]);
  });

  it('does not count an uncaptioned table, or a figure inside a cell', () => {
    /* An uncaptioned table is not "Table 4": numbering it would name an object
       the document never labels. A figure in a cell is part of its table. */
    const html =
      '<table><tbody><tr><td><img src="/x.png" alt="Subject device"></td></tr></tbody></table>';
    expect(captionedObjectsInHtml(html)).toEqual([]);
  });

  it('numbers tables and figures as two separate sequences', () => {
    const numbered = numberDocumentCaptions(
      [
        { kind: 'table', caption: 'Baseline demographics', id: 'a' },
        { kind: 'figure', caption: 'Study schema', id: 'b' },
      ],
      null,
      [{ kind: 'table', caption: 'Exposure', id: 'c' }],
    );
    expect(numbered.before.map((n) => n.code)).toEqual(['Table 1', 'Figure 1']);
    expect(numbered.after.map((n) => n.code)).toEqual(['Table 2']);
  });

  it('offers as reference targets only the objects that carry an identity', () => {
    /* A caption with no id still NUMBERS — the ordinal is positional — it just
       cannot be pointed at. Content written before captions had ids looks
       exactly like this, and its neighbours must still number correctly. */
    const targets = captionTargets(
      [
        { kind: 'table', caption: 'Anonymous' },
        { kind: 'table', caption: 'Summary of adverse events', id: AE_TABLE },
      ],
      null,
      [],
    );
    expect(targets).toEqual([
      { id: AE_TABLE, code: 'Table 2', title: 'Summary of adverse events' },
    ]);
  });
});

describe('a stored caption survives the editor', () => {
  it('round-trips as a <caption>, and is NOT turned into a table row', () => {
    const ref = React.createRef<RichSectionEditorHandle>();
    render(<RichSectionEditor {...base} ref={ref} value={STORED_TABLE} />);

    const stored = ref.current!.getContent();
    // The regression: the caption's words came back as a `<td>`, i.e. as data.
    expect(stored).toContain('<caption>Summary of adverse events</caption>');
    expect(stored).not.toContain('<td colspan="1" rowspan="1"><p>Summary of adverse events');
    // And the identity is still on the table, so references to it survive.
    expect(stored).toContain(`${CAPTION_ID_ATTR}="${AE_TABLE}"`);
  });

  it('keeps the section RICH-EDITABLE — the fidelity gate is not tripped by it', () => {
    /* The gate compares stored text against parsed text and falls back to a raw
       textarea on any mismatch. A caption held as a node ATTRIBUTE contributes
       no content text, so without being taught about it the gate would drop
       every section holding a captioned table into source mode — the capability
       would disable the editor it ships in. */
    render(<RichSectionEditor {...base} value={STORED_TABLE} />);
    expect(document.querySelector('.tiptap')).not.toBeNull();
    expect(document.querySelector('textarea')).toBeNull();
  });
});

describe('numbering in the canvas', () => {
  it('draws the number beside the caption, and stores no ordinal', () => {
    const ref = React.createRef<RichSectionEditorHandle>();
    render(<RichSectionEditor {...base} ref={ref} value={STORED_TABLE} />);

    expect(canvasText()).toContain('Table 1. Summary of adverse events');
    // What the record holds is the words. The number is a rendering.
    expect(ref.current!.getContent()).not.toMatch(/Table \d/);
  });

  it('continues the count from the sections above this one', () => {
    /* A canvas numbering from 1 would show "Table 1" for an object the filing
       prints as "Table 3" — the plausible-looking wrong number this design
       exists to remove. */
    render(
      <RichSectionEditor
        {...base}
        value={STORED_TABLE}
        crossRefsApi={{
          sections: [],
          captionsBefore: [
            { kind: 'table', caption: 'Baseline demographics', id: 'x' },
            { kind: 'table', caption: 'Disposition', id: 'y' },
          ],
        }}
      />,
    );
    expect(canvasText()).toContain('Table 3. Summary of adverse events');
  });

  it('A TABLE ADDED EARLIER RENUMBERS THIS SECTION, with its stored content untouched', () => {
    const first = React.createRef<RichSectionEditorHandle>();
    const { unmount } = render(
      <RichSectionEditor
        {...base}
        ref={first}
        value={STORED_TABLE}
        crossRefsApi={{ sections: [], captionsBefore: [] }}
      />,
    );
    const before = canvasText();
    const storedBefore = first.current!.getContent();
    unmount();

    const second = React.createRef<RichSectionEditorHandle>();
    render(
      <RichSectionEditor
        {...base}
        ref={second}
        value={STORED_TABLE}
        crossRefsApi={{
          sections: [],
          captionsBefore: [{ kind: 'table', caption: 'Baseline demographics', id: 'x' }],
        }}
      />,
    );

    expect(before).toContain('Table 1. Summary of adverse events');
    expect(canvasText()).toContain('Table 2. Summary of adverse events');
    // The point: the stored string did not change by one byte.
    expect(second.current!.getContent()).toBe(storedBefore);
  });
});

describe('writing a caption from the ribbon', () => {
  it('stores the words and mints an identity, and never a number', () => {
    const ref = React.createRef<RichSectionEditorHandle>();
    render(
      <RichSectionEditor
        {...base}
        ref={ref}
        value={'<table><tbody><tr><td>Headache</td></tr></tbody></table>'}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /caption this table/i }));
    fireEvent.change(screen.getByLabelText(/caption text/i), {
      target: { value: 'Summary of adverse events' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }));

    const stored = ref.current!.getContent();
    expect(stored).toContain('<caption>Summary of adverse events</caption>');
    // An identity is minted so a reference can point at it…
    expect(stored).toMatch(new RegExp(`${CAPTION_ID_ATTR}="[^"]+"`));
    // …and no ordinal is written anywhere.
    expect(stored).not.toMatch(/Table \d/);
    // It is numbered on screen the moment it has words.
    expect(canvasText()).toContain('Table 1. Summary of adverse events');
  });

  it('offers no way to type a number', () => {
    render(
      <RichSectionEditor
        {...base}
        value={'<table><tbody><tr><td>Headache</td></tr></tbody></table>'}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /caption this table/i }));
    // One field, for the words. The bar says where the number comes from.
    const bar = screen.getByRole('group', { name: /caption/i });
    expect(bar.querySelectorAll('input')).toHaveLength(1);
    expect(screen.getByLabelText(/caption text/i)).toBeTruthy();
    expect(screen.getByText(/numbered automatically by position/i)).toBeTruthy();
  });

  it('captions a SELECTED FIGURE, keeping its identity across a rewording', () => {
    /* The command path a figure takes, exercised directly: the component's
       ribbon needs a node selection, which is what `setNodeSelection` makes. */
    const editor = new Editor({
      extensions: [
        StarterKit,
        TableKit.configure({ table: false }),
        CaptionedTable.configure({ resizable: false }),
        AuthoringImage,
        CaptionNumbering,
      ],
      content: '<img src="/api/authoring/images/77">',
    });
    editor.commands.setNodeSelection(0);

    expect(editor.commands.setObjectCaption('Chromatogram of batch 21-004')).toBe(true);
    const first = editor.getHTML();
    expect(first).toContain('alt="Chromatogram of batch 21-004"');
    const id = /data-caption-id="([^"]+)"/.exec(first)?.[1];
    expect(id).toBeTruthy();

    // Rewording keeps the identity: a reference points at the object, not at
    // the sentence, and must survive an editorial pass over the caption.
    editor.commands.setNodeSelection(0);
    editor.commands.setObjectCaption('Chromatogram of batch 21-004 (validation lot)');
    expect(editor.getHTML()).toContain(`data-caption-id="${id}"`);
    expect(editor.getHTML()).toContain('(validation lot)');
    editor.destroy();
  });

  it('changes nothing when the caret is on neither a table nor a figure', () => {
    const editor = new Editor({
      extensions: [
        StarterKit,
        TableKit.configure({ table: false }),
        CaptionedTable.configure({ resizable: false }),
        AuthoringImage,
        CaptionNumbering,
      ],
      content: '<p>Plain prose.</p>',
    });
    expect(editor.commands.setObjectCaption('Nowhere')).toBe(false);
    expect(editor.getHTML()).toBe('<p>Plain prose.</p>');
    editor.destroy();
  });
});

describe('referencing a table from the canvas', () => {
  /** A section whose prose points at a table in the section BELOW it, with a
   *  deliberately STALE cached number in the element's text. */
  const STORED_REFERENCE =
    `<p>Exposure is summarised in ` +
    `<a data-xref="${PK_TABLE}" data-xref-display="code">Table 9</a>.</p>`;

  it('prints the table’s CURRENT number, not the cached one', () => {
    render(
      <RichSectionEditor
        {...base}
        value={STORED_REFERENCE}
        crossRefsApi={{
          sections: [],
          captionsAfter: [
            { kind: 'table', caption: 'Pharmacokinetic parameters', id: PK_TABLE },
          ],
        }}
      />,
    );
    expect(canvasText()).toContain('Exposure is summarised in Table 1.');
    expect(canvasText()).not.toContain('Table 9');
  });

  it('follows the table when one is added above it, with no stored change', () => {
    const ref = React.createRef<RichSectionEditorHandle>();
    const { unmount } = render(
      <RichSectionEditor
        {...base}
        ref={ref}
        value={STORED_REFERENCE}
        crossRefsApi={{
          sections: [],
          captionsAfter: [
            { kind: 'table', caption: 'Pharmacokinetic parameters', id: PK_TABLE },
          ],
        }}
      />,
    );
    const storedBefore = ref.current!.getContent();
    expect(canvasText()).toContain('Table 1.');
    unmount();

    const after = React.createRef<RichSectionEditorHandle>();
    render(
      <RichSectionEditor
        {...base}
        ref={after}
        value={STORED_REFERENCE}
        crossRefsApi={{
          sections: [],
          captionsBefore: [{ kind: 'table', caption: 'Baseline demographics', id: 'x' }],
          captionsAfter: [
            { kind: 'table', caption: 'Pharmacokinetic parameters', id: PK_TABLE },
          ],
        }}
      />,
    );
    expect(canvasText()).toContain('Table 2.');
    expect(after.current!.getContent()).toBe(storedBefore);
  });

  it('SAYS SO when the table it points at is gone', () => {
    /* Honest failure, in place. Not the cached "Table 9", not a number that
       would look right, and not a gap. */
    render(
      <RichSectionEditor {...base} value={STORED_REFERENCE} crossRefsApi={{ sections: [] }} />,
    );
    expect(canvasText()).toContain(CROSS_REFERENCE_MISSING_TEXT);
    expect(canvasText()).not.toContain('Table 9');
    expect(canvasText()).not.toMatch(/Table \d/);
  });

  it('offers this document’s tables and figures in the reference picker', () => {
    render(
      <RichSectionEditor
        {...base}
        value="<p>See </p>"
        crossRefsApi={{
          sections: [{ id: 'sec-1', code: '2.7.4.1', title: 'Adverse Events' }],
          captionsAfter: [
            { kind: 'table', caption: 'Pharmacokinetic parameters', id: PK_TABLE },
            { kind: 'figure', caption: 'Chromatogram of batch 21-004', id: CHROMATOGRAM },
          ],
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /insert a cross-reference/i }));
    const picker = screen.getByLabelText(
      /section, table or figure to reference/i,
    ) as HTMLSelectElement;
    const labels = [...picker.options].map((o) => o.textContent);

    expect(labels).toContain('2.7.4.1 Adverse Events');
    // The number offered is the one the filing prints — derived, not typed.
    expect(labels).toContain('Table 1 Pharmacokinetic parameters');
    expect(labels).toContain('Figure 1 Chromatogram of batch 21-004');
  });
});

describe('the order key', () => {
  it('changes when a caption changes, so references repaint then and not per keystroke', () => {
    const editor = new Editor({
      extensions: [
        StarterKit,
        TableKit.configure({ table: false }),
        CaptionedTable.configure({ resizable: false }),
        AuthoringImage,
        CaptionNumbering,
      ],
      content: STORED_TABLE,
    });
    const before = captionOrderKey(editor.state.doc);
    editor.commands.setTextSelection(2);
    editor.commands.insertContent('x');
    expect(captionOrderKey(editor.state.doc)).toBe(before);

    editor.commands.setTextSelection(2);
    editor.commands.setObjectCaption('Summary of treatment-emergent adverse events');
    expect(captionOrderKey(editor.state.doc)).not.toBe(before);
    editor.destroy();
  });
});
