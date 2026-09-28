// @vitest-environment jsdom
/**
 * RichSectionEditor — a save carries only what it says it carries, and says
 * "saved" only for text that was sent.
 *
 * Periodic review 2026-09-28, editor family. Two findings, both about a wait
 * the author can keep typing through:
 *
 *   SEC-B-3 — Comment on a selection. The dirty check ran once, before the
 *     host's promise, and that promise resolves only after the author has
 *     written and posted the comment in the rail. The canvas stays editable
 *     meanwhile, so prose typed during the wait was saved as a revision under
 *     the system reason "Comment anchor applied", and the anchor went onto the
 *     stale offsets — onto whatever words sat there now, not the ones quoted to
 *     the server.
 *
 *   V-2 — Source mode. `doSave` compared a closure copy of the textarea text
 *     with itself, so text typed while a save was in flight was reported "All
 *     changes saved", the host was told the section was clean (disarming every
 *     leave guard), and the device cache holding that text was deleted. The
 *     autosave path saved the text from BEFORE its triggering keystroke. Rich
 *     mode deleted the device cache after a mid-save edit the same way.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';

import { RichSectionEditor } from '../editor/RichSectionEditor';
import { collectCommentAnchors, type CommentAnchorPayload } from '../editor/commentAnchor';
import { deviceDraftKey } from '@/lib/deviceDraftCache';

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

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const p = new Promise<T>((r) => {
    resolve = r;
  });
  return { p, resolve };
}

function canvas(): Editor {
  const el = document.querySelector('.rse-body .tiptap') as (HTMLElement & { editor?: Editor }) | null;
  if (!el?.editor) throw new Error('editor not mounted');
  return el.editor;
}

/** Document positions of the first occurrence of `word`. */
function rangeOf(ed: Editor, word: string): { from: number; to: number } {
  let found: { from: number; to: number } | null = null;
  ed.state.doc.descendants((node, pos) => {
    if (found || !node.isText) return;
    const i = (node.text ?? '').indexOf(word);
    if (i >= 0) found = { from: pos + i, to: pos + i + word.length };
  });
  if (!found) throw new Error(`"${word}" is not in the canvas`);
  return found;
}

/** The words the comment's anchor mark actually covers. */
function anchoredText(ed: Editor, id: string): string | null {
  const r = collectCommentAnchors(ed.state.doc).get(id);
  return r ? ed.state.doc.textBetween(r.from, r.to, ' ') : null;
}

const footer = () => (document.querySelector('.rse-save') as HTMLElement | null)?.textContent ?? '';
const sourceArea = () => document.querySelector('textarea.rse-source') as HTMLTextAreaElement | null;
const saveButton = () => screen.getByRole('button', { name: /Save \(⌘S\)|Saving…/ }) as HTMLButtonElement;
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

/* ── SEC-B-3 ─────────────────────────────────────────────────────────────── */

const SECTION = '<p>The endpoint was met.</p>';
const SYSTEM_REASON = 'Comment anchor applied';

async function mountForComment(trackOn = false) {
  const pending = deferred<string | null>();
  const onCreate = vi.fn((_anchor: CommentAnchorPayload) => pending.p);
  const onAnchored = vi.fn();
  const onSave = vi.fn(async (_serialized: string, _systemReason?: string) => undefined);
  const ref = React.createRef<React.ComponentRef<typeof RichSectionEditor>>();
  render(
    <RichSectionEditor
      ref={ref}
      value={SECTION}
      onSave={onSave}
      storageKey={null}
      commentsApi={{ onCreate, onAnchored }}
      track={
        trackOn
          ? { enabled: true, author: { id: 'reviewer-7', name: 'Reviewer' }, onToggle: () => undefined }
          : null
      }
    />,
  );
  await waitFor(() => expect(document.querySelector('.rse-body .tiptap')).toBeTruthy());
  act(() => {
    canvas().commands.setTextSelection(rangeOf(canvas(), 'endpoint'));
  });
  fireEvent.click(screen.getByRole('button', { name: 'Comment on the selection' }));
  await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
  expect(onCreate.mock.calls[0][0].quote).toBe('endpoint');
  /** The author posts the comment in the rail; the host resolves its id. */
  const post = async (id: string) => {
    await act(async () => {
      pending.resolve(id);
      await pending.p;
    });
  };
  return { onCreate, onAnchored, onSave, ref, post };
}

describe('SEC-B-3 — commenting on a selection while the canvas stays editable', () => {
  it('does not save prose typed during the wait under the system reason, and anchors the quoted words', async () => {
    const { onSave, onAnchored, post } = await mountForComment();

    // While the comment rail is open the author goes back to the canvas and
    // corrects the text ABOVE the selection — every offset after it moves.
    act(() => {
      canvas().chain().insertContentAt(1, 'Dose changed to 100 mg. ').run();
    });
    await post('c-1');
    await waitFor(() => expect(onAnchored).toHaveBeenCalled());

    // Nothing the author typed is recorded under a reason they did not give.
    expect(onSave.mock.calls.filter((c) => c[1] === SYSTEM_REASON)).toEqual([]);
    expect(onSave).not.toHaveBeenCalled();
    // The anchor is on the words quoted to the server, not on the stale offsets.
    expect(anchoredText(canvas(), 'c-1')).toBe('endpoint');
    // The section is left dirty for the author's own save, and they are told so.
    expect(footer()).toMatch(/Unsaved changes/);
    expect(onAnchored).toHaveBeenCalledWith('c-1', false);
    expect(screen.getByRole('alert').textContent).toMatch(/your own reason/);
  });

  it('follows the range through the tracking plugin\'s own transactions', async () => {
    const { onSave, onAnchored, post } = await mountForComment(true);

    // With track changes on, deleting "The " is a root transaction that
    // removes four characters and an appended one that restores them struck
    // through — the net shift is zero only if both are followed.
    act(() => {
      canvas().chain().deleteRange({ from: 1, to: 5 }).run();
    });
    expect(canvas().getHTML()).toContain('<del');
    await post('c-1');
    await waitFor(() => expect(onAnchored).toHaveBeenCalled());

    expect(anchoredText(canvas(), 'c-1')).toBe('endpoint');
    expect(onSave).not.toHaveBeenCalled();
    expect(onAnchored).toHaveBeenCalledWith('c-1', false);
  });

  it('saves only the anchor under the system reason once the author saved their own edits during the wait', async () => {
    const { onSave, onAnchored, ref, post } = await mountForComment();

    act(() => {
      canvas().chain().insertContentAt(1, 'Dose changed to 100 mg. ').run();
    });
    // The author saves their correction with their own reason while the
    // comment is still being written.
    await act(async () => {
      await ref.current!.save();
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][1]).toBeUndefined();
    const ownSave = onSave.mock.calls[0][0];

    await post('c-1');
    await waitFor(() => expect(onAnchored).toHaveBeenCalled());

    expect(onSave).toHaveBeenCalledTimes(2);
    const [anchorSave, reason] = onSave.mock.calls[1];
    expect(reason).toBe(SYSTEM_REASON);
    // The system-reason revision differs from the author's own by the anchor
    // mark and nothing else.
    expect(anchorSave.replace(/<span data-comment-id="c-1" class="rse-comment-anchor">([^<]*)<\/span>/, '$1')).toBe(ownSave);
    expect(anchoredText(canvas(), 'c-1')).toBe('endpoint');
    expect(onAnchored).toHaveBeenCalledWith('c-1', true);
  });

  it('refuses the anchor when the quoted words themselves changed during the wait', async () => {
    const { onSave, onAnchored, post } = await mountForComment();

    // One letter of the quoted word is retyped: same length, same offsets,
    // different text.
    act(() => {
      const r = rangeOf(canvas(), 'endpoint');
      canvas().chain().insertContentAt({ from: r.from + 5, to: r.from + 6 }, 'I').run();
    });
    expect(canvas().state.doc.textContent).toContain('endpoInt');
    await post('c-1');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(collectCommentAnchors(canvas().state.doc).size).toBe(0);
    expect(onSave).not.toHaveBeenCalled();
    expect(onAnchored).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/not highlighted/);
  });

  it('CONTROL: an untouched buffer is anchored and saved under the system reason, as before', async () => {
    const { onSave, onAnchored, post } = await mountForComment();
    await post('c-1');
    await waitFor(() => expect(onAnchored).toHaveBeenCalled());

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][1]).toBe(SYSTEM_REASON);
    expect(onSave.mock.calls[0][0]).toBe(
      '<p>The <span data-comment-id="c-1" class="rse-comment-anchor">endpoint</span> was met.</p>',
    );
    expect(onAnchored).toHaveBeenCalledWith('c-1', true);
    expect(footer()).toMatch(/All changes saved/);
  });
});

/* ── V-2 ─────────────────────────────────────────────────────────────────── */

/** Markup the schema cannot hold: the fidelity gate opens it in source mode. */
const FIG = '<figure><img src="/api/authoring/images/file_1_a"><figcaption>Fig 1</figcaption></figure>';

async function mountSource(props: Partial<React.ComponentProps<typeof RichSectionEditor>> = {}) {
  const inFlight = deferred();
  const onSave = vi.fn((_s: string) => inFlight.p);
  const onDirty = vi.fn();
  render(
    <RichSectionEditor value={FIG} onSave={onSave} onDirtyChange={onDirty} storageKey="sec-1" {...props} />,
  );
  const ta = await waitFor(() => {
    const t = sourceArea();
    expect(t).toBeTruthy();
    return t!;
  });
  const settle = async () => {
    await act(async () => {
      inFlight.resolve();
      await inFlight.p;
    });
  };
  return { ta, onSave, onDirty, settle };
}

describe('V-2 — source mode reports "saved" only for the text it sent', () => {
  it('source mode: text typed while the save is in flight stays unsaved, guarded and cached', async () => {
    const { ta, onSave, onDirty, settle } = await mountSource();
    const S1 = FIG + '<p>First paragraph.</p>';
    const S2 = S1 + '<p>Typed while the save was in flight.</p>';

    fireEvent.change(ta, { target: { value: S1 } });
    fireEvent.click(saveButton());
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toBe(S1);

    fireEvent.change(ta, { target: { value: S2 } });
    await settle();

    expect(ta.value).toBe(S2);
    expect(footer()).toMatch(/Unsaved changes/);
    expect(footer()).not.toMatch(/All changes saved/);
    expect(onDirty.mock.calls.at(-1)?.[0]).toBe(true);
    expect(localStorage.getItem(deviceDraftKey(null, 'sec-1'))).toBe(S2);
    expect(discardTab()).toBe(true);
    expect(saveButton().disabled).toBe(false);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('source mode: a keystroke during the save does not claim the save has settled', async () => {
    const { ta, settle } = await mountSource();
    const S1 = FIG + '<p>First paragraph.</p>';
    fireEvent.change(ta, { target: { value: S1 } });
    fireEvent.click(saveButton());
    fireEvent.change(ta, { target: { value: S1 + '<p>More.</p>' } });

    // Still in flight: the footer and the Save control say so, exactly as the
    // rich canvas does, so a second save cannot be started over the first.
    expect(footer()).toMatch(/Saving…/);
    expect(saveButton().disabled).toBe(true);

    await settle();
    expect(footer()).toMatch(/Unsaved changes/);
    expect(saveButton().disabled).toBe(false);
  });

  it('source mode autosave: the debounced save sends the latest keystroke, not the one before it', async () => {
    // format="text" with a double space: the plain-text round trip collapses
    // it, so the section opens in source mode.
    const S0 = 'Visit 1  Day 1';
    const onSave = vi.fn(async (_s: string) => undefined);
    const onDirty = vi.fn();
    render(
      <RichSectionEditor
        value={S0}
        format="text"
        autosaveMs={30}
        onSave={onSave}
        onDirtyChange={onDirty}
        storageKey="sec-4"
      />,
    );
    const ta = await waitFor(() => {
      const t = sourceArea();
      expect(t).toBeTruthy();
      return t!;
    });

    // Two keystrokes inside one debounce window.
    fireEvent.change(ta, { target: { value: S0 + 'X' } });
    fireEvent.change(ta, { target: { value: S0 + 'XY' } });
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    expect(onSave.mock.calls.map((c) => c[0])).toEqual([S0 + 'XY']);
    expect(footer()).toMatch(/All changes saved/);
    expect(onDirty.mock.calls.at(-1)?.[0]).toBe(false);
    expect(localStorage.getItem(deviceDraftKey(null, 'sec-4'))).toBeNull();
  });

  it('source mode: a restored device draft is what the next save sends', async () => {
    const cached = FIG + '<p>Recovered after a crash.</p>';
    localStorage.setItem(deviceDraftKey(null, 'sec-1'), cached);
    const { onSave, settle } = await mountSource();
    fireEvent.click(screen.getByRole('button', { name: 'Restore the device draft' }));
    fireEvent.click(saveButton());
    expect(onSave.mock.calls.map((c) => c[0])).toEqual([cached]);
    await settle();
    expect(footer()).toMatch(/All changes saved/);
  });

  it('CONTROL: source mode with nothing typed mid-save is saved and leaves no device draft', async () => {
    const { ta, onSave, settle } = await mountSource();
    const S1 = FIG + '<p>Only edit.</p>';
    fireEvent.change(ta, { target: { value: S1 } });
    expect(localStorage.getItem(deviceDraftKey(null, 'sec-1'))).toBe(S1);
    fireEvent.click(saveButton());
    await settle();
    expect(onSave.mock.calls.map((c) => c[0])).toEqual([S1]);
    expect(footer()).toMatch(/All changes saved/);
    expect(localStorage.getItem(deviceDraftKey(null, 'sec-1'))).toBeNull();
    expect(discardTab()).toBe(false);
  });

});

describe('V-2 — the rich canvas keeps its device draft the same way', () => {
  it('rich mode: an edit made while the save is in flight keeps its device draft', async () => {
    const inFlight = deferred();
    const onSave = vi.fn((_s: string) => inFlight.p);
    const onDirty = vi.fn();
    render(
      <RichSectionEditor value="<p>Stability narrative.</p>" onSave={onSave} onDirtyChange={onDirty} storageKey="sec-2" />,
    );
    await waitFor(() => expect(document.querySelector('.rse-body .tiptap')).toBeTruthy());
    act(() => {
      canvas().commands.insertContentAt(canvas().state.doc.content.size - 1, ' First edit.');
    });
    fireEvent.click(saveButton());
    expect(onSave).toHaveBeenCalledTimes(1);
    act(() => {
      canvas().commands.insertContentAt(canvas().state.doc.content.size - 1, ' Typed mid-save.');
    });
    await act(async () => {
      inFlight.resolve();
      await inFlight.p;
    });

    expect(footer()).toMatch(/Unsaved changes/);
    expect(onDirty.mock.calls.at(-1)?.[0]).toBe(true);
    expect(localStorage.getItem(deviceDraftKey(null, 'sec-2'))).toBe(canvas().getHTML());
    expect(localStorage.getItem(deviceDraftKey(null, 'sec-2'))).toContain('Typed mid-save.');
  });
});
