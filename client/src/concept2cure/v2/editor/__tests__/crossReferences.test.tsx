// @vitest-environment jsdom
/**
 * Cross-references in the canvas: inserted by picking a SECTION, stored as that
 * section's identity, displayed as what the section is called now.
 *
 * ── What this pins ──────────────────────────────────────────────────────────
 * 1. THE RIBBON CAN INSERT ONE, and what it writes into the governed record is
 *    the target's id — never the number on screen. `grep data-xref` over the
 *    serialized content is the proof; a stored "2.7.4.2" would be the defect.
 * 2. RENUMBERING THE TARGET CHANGES WHAT THE CANVAS SHOWS while the stored
 *    content is byte-identical. That is the entire value of the feature, and it
 *    is asserted here the same way it is asserted server-side: one stored
 *    string, two directories, two renderings.
 * 3. A REFERENCE WHOSE TARGET IS GONE SAYS SO, in place, in words — not as a
 *    plausible-looking wrong number and not as a gap.
 * 4. THE FIDELITY GATE STILL LETS THE SECTION BE EDITED. The gate compares
 *    stored text against parsed text and falls back to a raw textarea on any
 *    mismatch; a node contributing no text would have dropped every section
 *    holding a reference into source mode, i.e. the capability would have
 *    disabled the editor it ships in.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import { RichSectionEditor, type RichSectionEditorHandle } from '../RichSectionEditor';
import { CROSS_REFERENCE_MISSING_TEXT } from '@shared/authoring/cross-references';

afterEach(cleanup);

const EFFICACY = '7b2c1d84-9a35-4f10-8c2e-1f4a6b0d55e1';
const SAFETY = '1a9e4c77-2b60-4d31-9f88-33c0ae512d40';

const ORIGINAL = [
  { id: EFFICACY, code: '2.7.4.2', title: 'Efficacy Summary' },
  { id: SAFETY, code: '2.7.4.3', title: 'Safety Summary' },
];
/** The same sections after one was inserted above them. Same ids, new codes. */
const RENUMBERED = [
  { id: EFFICACY, code: '2.7.5.2', title: 'Efficacy Summary' },
  { id: SAFETY, code: '2.7.5.3', title: 'Safety Summary' },
];

const base = {
  onSave: vi.fn(async () => {}),
  chrome: 'full' as const,
  ariaLabel: 'Section content',
};

/** Stored content holding one reference, with a deliberately STALE cache. */
const STORED_STALE =
  `<p>Efficacy is summarised in ` +
  `<a data-xref="${EFFICACY}" data-xref-display="code">9.9.9</a>.</p>`;

const canvasText = () => document.querySelector('.tiptap')?.textContent ?? '';

describe('inserting a cross-reference', () => {
  it('stores the target’s identity, not the number on screen', () => {
    const ref = React.createRef<RichSectionEditorHandle>();
    render(
      <RichSectionEditor
        {...base}
        ref={ref}
        value="<p>See </p>"
        crossRefsApi={{ sections: ORIGINAL }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /insert a cross-reference/i }));
    fireEvent.change(screen.getByLabelText(/section, table or figure to reference/i), {
      target: { value: SAFETY },
    });
    fireEvent.click(screen.getByRole('button', { name: /^insert$/i }));

    const stored = ref.current!.getContent();
    expect(stored, 'nothing was inserted').toContain('data-xref');
    // The identity is what the governed record holds.
    expect(stored).toContain(`data-xref="${SAFETY}"`);
    /* And it holds NO printed number as data — the digits in the serialized
       element are the cache, and the target id is what is authoritative. */
    expect(stored).not.toMatch(/data-xref="[0-9.]+"/);
    // The canvas shows the section's current name.
    expect(canvasText()).toContain('2.7.4.3 Safety Summary');
  });

  it('offers the document’s sections to pick from, by their current codes', () => {
    render(
      <RichSectionEditor {...base} value="<p>x</p>" crossRefsApi={{ sections: RENUMBERED }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /insert a cross-reference/i }));

    const picker = screen.getByLabelText(/section, table or figure to reference/i) as HTMLSelectElement;
    expect([...picker.options].map((o) => o.textContent)).toEqual([
      '2.7.5.2 Efficacy Summary',
      '2.7.5.3 Safety Summary',
    ]);
    /* There is deliberately no field in which to TYPE a section number: a typed
       number is the unmanaged text this replaces. */
    expect(screen.queryByLabelText(/section number/i)).toBeNull();
  });

  it('hides the capability entirely when the host supplies no directory', () => {
    render(<RichSectionEditor {...base} value="<p>x</p>" />);
    expect(screen.queryByRole('button', { name: /insert a cross-reference/i })).toBeNull();
  });
});

describe('resolution in the canvas', () => {
  it('shows what the target is called NOW, never the cached number', () => {
    render(
      <RichSectionEditor
        {...base}
        value={STORED_STALE}
        crossRefsApi={{ sections: ORIGINAL }}
      />,
    );
    expect(canvasText()).toContain('2.7.4.2');
    expect(canvasText()).not.toContain('9.9.9');
  });

  it('RENUMBERING THE TARGET REPAINTS THE REFERENCE, with the stored content untouched', () => {
    const ref = React.createRef<RichSectionEditorHandle>();
    const { rerender } = render(
      <RichSectionEditor
        {...base}
        ref={ref}
        value={STORED_STALE}
        crossRefsApi={{ sections: ORIGINAL }}
      />,
    );
    expect(canvasText()).toContain('2.7.4.2');
    const contentBefore = ref.current!.getContent();

    /* The section list changes under the open editor — someone renumbered the
       target elsewhere in the document. No edit is made here. */
    rerender(
      <RichSectionEditor
        {...base}
        ref={ref}
        value={STORED_STALE}
        crossRefsApi={{ sections: RENUMBERED }}
      />,
    );

    expect(canvasText()).toContain('2.7.5.2');
    expect(canvasText()).not.toContain('2.7.4.2');

    /* THE HALF THAT MAKES IT SAFE: the record did not move. A repaint is a
       rendering, not an edit — it must not mint a revision, dirty the section
       or rewrite one character of a Part 11 record. */
    expect(ref.current!.getContent()).toBe(contentBefore);
    expect(contentBefore).toContain(`data-xref="${EFFICACY}"`);
  });

  it('says a dangling reference is dangling, in place', () => {
    render(
      <RichSectionEditor
        {...base}
        value={`<p>See <a data-xref="a-section-that-was-deleted">2.7.4.9</a>.</p>`}
        crossRefsApi={{ sections: ORIGINAL }}
      />,
    );
    expect(canvasText()).toContain(CROSS_REFERENCE_MISSING_TEXT);
    // Not the number it used to show, and not a blank.
    expect(canvasText()).not.toContain('2.7.4.9');
    expect(document.querySelector('.rse-xref[data-missing="1"]')).toBeTruthy();
  });
});

describe('the fidelity gate', () => {
  it('still allows rich editing of a section that holds a reference', () => {
    render(
      <RichSectionEditor
        {...base}
        value={STORED_STALE}
        crossRefsApi={{ sections: ORIGINAL }}
      />,
    );
    /* Source mode renders a raw textarea instead of the canvas. If the parse
       looked lossy — which it does the moment the reference contributes no
       text to the comparison — every section holding a cross-reference would
       lose rich editing, and the ribbon control above would be unreachable. */
    expect(document.querySelector('.rse-source')).toBeNull();
    expect(document.querySelector('.tiptap')).toBeTruthy();
  });

  it('round-trips through parse, serialization and the governed save path', async () => {
    let saved = '';
    const ref = React.createRef<RichSectionEditorHandle>();
    render(
      <RichSectionEditor
        {...base}
        ref={ref}
        value={STORED_STALE}
        onSave={async (s: string) => {
          saved = s;
        }}
        crossRefsApi={{ sections: ORIGINAL }}
      />,
    );

    /* Add a second reference, then save: the write must carry BOTH — the one
       that came in from the store and survived the parse, and the new one. */
    fireEvent.click(screen.getByRole('button', { name: /insert a cross-reference/i }));
    fireEvent.change(screen.getByLabelText(/section, table or figure to reference/i), {
      target: { value: SAFETY },
    });
    fireEvent.click(screen.getByRole('button', { name: /^insert$/i }));
    await ref.current!.save();

    expect(saved).toContain(`data-xref="${EFFICACY}"`);
    expect(saved).toContain('data-xref-display="code"');
    expect(saved).toContain(`data-xref="${SAFETY}"`);
    expect(saved).toContain('data-xref-display="code-title"');
  });
});
