// @vitest-environment jsdom
/**
 * RichSectionEditor — the two ways in-progress work used to disappear.
 *
 * The editor already caches every keystroke to `dc::<storageKey>` and offers it
 * back on return, which covers a crash and a reload. Two exits it did NOT
 * cover, both silent:
 *
 *   1. Closing the tab. The device cache is device-local — it is not the
 *      record, it does not travel, and a colleague opening the section sees the
 *      last saved text. Nothing warned before the tab went.
 *   2. Unmounting inside an autosave debounce. Hosts that pass `autosaveMs`
 *      (the MDX dossier drawer, 600ms) armed a timer that was dropped with the
 *      component: close the drawer 300ms after the last keystroke and those
 *      edits were never written anywhere but the device cache.
 *
 * Both are pinned here at the component boundary, so they hold for every host —
 * the flagship authoring surface, which deliberately runs with no autosave at
 * all, and the drawer, which relies on one.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

import { RichSectionEditor } from '../editor/RichSectionEditor';
import type { Editor } from '@tiptap/core';

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

function canvas(): Editor {
  const el = document.querySelector('.rse-body .tiptap') as (HTMLElement & { editor?: Editor }) | null;
  if (!el?.editor) throw new Error('editor not mounted');
  return el.editor;
}
function type(words: string) {
  canvas().chain().focus().selectAll().insertContent(words).run();
}
function discardTab(): boolean {
  const ev = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(ev);
  return ev.defaultPrevented;
}

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('the browser is asked to confirm before unsaved work is discarded', () => {
  it('refuses a silent tab close while dirty, and stops once saved', async () => {
    const onSave = vi.fn(async () => undefined);
    const ref = React.createRef<React.ComponentRef<typeof RichSectionEditor>>();
    render(
      <RichSectionEditor ref={ref} value="<p>Stability narrative.</p>" onSave={onSave} storageKey={null} />
    );
    await waitFor(() => expect(document.querySelector('.rse-body .tiptap')).toBeTruthy());

    expect(discardTab()).toBe(false);
    type('Half a sentence about');
    await waitFor(() => expect(discardTab()).toBe(true));

    await ref.current!.save();
    await waitFor(() => expect(discardTab()).toBe(false));
  });

  it('does not hold a read-only canvas hostage', async () => {
    render(
      <RichSectionEditor value="<p>Frozen content.</p>" onSave={vi.fn()} readOnly storageKey={null} />
    );
    await waitFor(() => expect(document.querySelector('.rse-body .tiptap')).toBeTruthy());
    expect(discardTab()).toBe(false);
  });

  it('releases the guard when the canvas goes away', async () => {
    const { unmount } = render(
      <RichSectionEditor value="<p>Stability narrative.</p>" onSave={vi.fn()} storageKey={null} />
    );
    await waitFor(() => expect(document.querySelector('.rse-body .tiptap')).toBeTruthy());
    type('Unsaved');
    await waitFor(() => expect(discardTab()).toBe(true));
    unmount();
    // A listener left behind would block every later navigation in the app.
    expect(discardTab()).toBe(false);
  });
});

describe('a debounced autosave survives the unmount that interrupts it', () => {
  it('flushes work still inside the debounce window', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Typed with the content param the editor actually passes, so
    // mock.calls[0][0] below is a string, not an index into an empty tuple.
    const onSave = vi.fn(async (_content: string) => undefined);
    const { unmount } = render(
      <RichSectionEditor
        value="Interim dossier note."
        format="text"
        autosaveMs={600}
        onSave={onSave}
        storageKey={null}
      />
    );
    await waitFor(() => expect(document.querySelector('.rse-body .tiptap')).toBeTruthy());

    type('Edits made 300ms before the drawer closed');
    await vi.advanceTimersByTimeAsync(300);
    // Still inside the debounce: nothing written yet, by design.
    expect(onSave).not.toHaveBeenCalled();

    unmount();
    await vi.advanceTimersByTimeAsync(0);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(String((onSave.mock.calls[0] as unknown[])[0])).toContain('Edits made 300ms before the drawer closed');
    vi.useRealTimers();
  });

  it('writes nothing on unmount when the autosave already landed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onSave = vi.fn(async () => undefined);
    const { unmount } = render(
      <RichSectionEditor
        value="Interim dossier note."
        format="text"
        autosaveMs={600}
        onSave={onSave}
        storageKey={null}
      />
    );
    await waitFor(() => expect(document.querySelector('.rse-body .tiptap')).toBeTruthy());

    type('Edits that had time to save');
    await vi.advanceTimersByTimeAsync(700);
    expect(onSave).toHaveBeenCalledTimes(1);

    unmount();
    await vi.advanceTimersByTimeAsync(0);
    // Exactly one write — an unmount flush must not duplicate the save that
    // already happened.
    expect(onSave).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('writes nothing on unmount when no autosave was ever armed', async () => {
    const onSave = vi.fn(async () => undefined);
    const { unmount } = render(
      <RichSectionEditor value="<p>Stability narrative.</p>" onSave={onSave} storageKey={null} />
    );
    await waitFor(() => expect(document.querySelector('.rse-body .tiptap')).toBeTruthy());
    type('Explicit-save host — nothing may be written without the author');
    unmount();
    await Promise.resolve();
    expect(onSave).not.toHaveBeenCalled();
  });
});
