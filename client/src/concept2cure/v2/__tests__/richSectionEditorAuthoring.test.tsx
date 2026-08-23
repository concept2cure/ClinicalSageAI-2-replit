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
    expect(screen.getByTitle('Superscript')).toBeTruthy();
    expect(screen.getByTitle('Subscript')).toBeTruthy();
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

  it('content carrying an image fails closed into source mode instead of being silently dropped', async () => {
    const stored = '<p>Figure 1 — chromatogram.</p><img src="data:image/png;base64,AAAA" alt="chromatogram">';
    const onSave = vi.fn();
    render(<RichSectionEditor value={stored} onSave={onSave} storageKey={null} />);
    await waitFor(() => {
      expect(document.querySelector('textarea.rse-source')).toBeTruthy();
    });
    // The raw record — image tag included — is what is being edited.
    const ta = document.querySelector('textarea.rse-source') as HTMLTextAreaElement;
    expect(ta.value).toBe(stored);
    // And nothing was saved behind the author's back on mount.
    expect(onSave).not.toHaveBeenCalled();
  });
});
