// @vitest-environment jsdom
/**
 * BP-W1-1 — the editor can MAKE tables and scientific notation, and refuses to
 * silently destroy what it cannot represent.
 *
 * Three defects pinned here, at the component boundary:
 *
 *   1. TableKit was configured but nothing in the client could INSERT a table
 *      — the one structure a CTD Module 3 is made of arrived only by paste.
 *      The ribbon now carries an insert-table control and structure commands.
 *   2. Superscript/subscript were declared in package.json and imported
 *      nowhere, so stored `cm<sup>2</sup>` flattened to `cm2` — text intact,
 *      meaning changed, and the text-only fidelity gate could not see it.
 *   3. Content carrying an <img>/<figure> passed the text-only fidelity gate
 *      (an image has no text to lose), parsed to nothing, and was silently
 *      rewritten out of the governed record on the next save. It now fails
 *      closed into source mode, where the raw string round-trips.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { RichSectionEditor } from '../editor/RichSectionEditor';

const noop = () => undefined;

describe('RichSectionEditor — authoring affordances (BP-W1-1)', () => {
  it('the ribbon offers table insertion for rich content', async () => {
    render(
      <RichSectionEditor value="<p>Stability narrative.</p>" onSave={noop} storageKey={null} />,
    );
    await waitFor(() => {
      expect(screen.getByTitle(/insert table/i)).toBeTruthy();
    });
    /* Matched by accessible NAME, not an exact title string. The ribbon now
       names each control's keyboard shortcut in its own label ("Superscript
       (⌘.)") so the faster path is discoverable — a bare noun taught nobody
       it existed. An exact-equality assertion on the label makes the copy
       unimprovable, which is not what this test is for: it exists to prove the
       ribbon OFFERS sub/superscript, and it still does. */
    expect(screen.getByRole('button', { name: /^superscript/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^subscript/i })).toBeTruthy();
    expect(screen.getByLabelText('Insert symbol')).toBeTruthy();
  });

  it('stored superscript/subscript open in rich mode with the marks intact', async () => {
    render(
      <RichSectionEditor
        value="<p>BSA in cm<sup>2</sup>; CO<sub>2</sub> ≤ 5%.</p>"
        onSave={noop}
        storageKey={null}
      />,
    );
    await waitFor(() => {
      // Rich mode (ProseMirror canvas), not the source-mode textarea.
      expect(document.querySelector('.ProseMirror')).toBeTruthy();
    });
    expect(document.querySelector('.ProseMirror sup')?.textContent).toBe('2');
    expect(document.querySelector('.ProseMirror sub')?.textContent).toBe('2');
  });

  it('content carrying an image opens RICH with the figure held, not refused to source mode', async () => {
    /* This test used to pin the opposite: with no image node in the schema,
       rich mode would have silently rewritten the figure out of the record,
       so the gate forced source mode. The schema holds figures now
       (editor/imageNode.ts), so the same content opens rich and the
       reference — src and alt — is in the canvas, intact. */
    const stored =
      '<p>Figure 1 — chromatogram.</p><img src="/api/authoring/images/file_1_a" alt="chromatogram">';
    const onSave = vi.fn();
    render(<RichSectionEditor value={stored} onSave={onSave} storageKey={null} />);
    await waitFor(() => {
      expect(document.querySelector('.ProseMirror')).toBeTruthy();
    });
    expect(document.querySelector('textarea.rse-source')).toBeNull();
    await waitFor(() => {
      expect(document.querySelector('.ProseMirror figure.rse-img')).toBeTruthy();
    });
    // And nothing was saved behind the author's back on mount.
    expect(onSave).not.toHaveBeenCalled();
  });

  it('markup the schema still cannot hold (a <figure>) keeps failing closed into source mode', async () => {
    const stored = '<figure><img src="/api/authoring/images/file_1_a"><figcaption>Fig 1</figcaption></figure>';
    const onSave = vi.fn();
    render(<RichSectionEditor value={stored} onSave={onSave} storageKey={null} />);
    await waitFor(() => {
      expect(document.querySelector('textarea.rse-source')).toBeTruthy();
    });
    const ta = document.querySelector('textarea.rse-source') as HTMLTextAreaElement;
    expect(ta.value).toBe(stored);
    expect(onSave).not.toHaveBeenCalled();
  });
  it('plain-text content the parse would rewrite (a space-aligned column) opens in source mode', async () => {
    /* format: 'text' used to skip the fidelity gate on the premise that plain
       text is always representable. The parse collapses runs of spaces, so a
       space-aligned table was silently rewritten on the first save. */
    const stored = 'Dose      Subjects\n10 mg     12\n20 mg     11';
    const onSave = vi.fn();
    render(<RichSectionEditor value={stored} format="text" onSave={onSave} storageKey={null} />);
    await waitFor(() => {
      expect(document.querySelector('textarea.rse-source')).toBeTruthy();
    });
    expect((document.querySelector('textarea.rse-source') as HTMLTextAreaElement).value).toBe(stored);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('ordinary plain text still opens rich', async () => {
    render(<RichSectionEditor value={'First paragraph.\n\nSecond paragraph.'} format="text" onSave={vi.fn()} storageKey={null} />);
    await waitFor(() => {
      expect(document.querySelector('.ProseMirror')).toBeTruthy();
    });
    expect(document.querySelector('textarea.rse-source')).toBeNull();
  });
});
