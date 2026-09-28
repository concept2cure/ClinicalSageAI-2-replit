// @vitest-environment jsdom
/**
 * The device draft cache belongs to the person who typed it.
 *
 * RichSectionEditor keeps unsaved text in localStorage so a reload or a crash
 * does not lose it. Until 2026-09-28 the key was the section alone
 * (`dc::<storageKey>`) and sign-out removed only the auth keys, so the next
 * person to sign in on the same browser was offered the previous person's
 * unsaved, unreasoned regulated text — "A draft cached on this device differs
 * from the saved section" — and one click and a save put it in the record
 * under their name. The offer also appeared on a read-only (frozen) section.
 * Periodic review 2026-09-28, editor family, SEC-A-5 / SEC-B-6 / SEC-C-6.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';

import { RichSectionEditor } from '../editor/RichSectionEditor';
import { authService } from '@/services/portal/authService';

const emptyRects = function () {
  return [] as unknown as DOMRectList;
};
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = emptyRects;
  if (typeof proto.getBoundingClientRect !== 'function') {
    proto.getBoundingClientRect = function () {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect;
    };
  }
}

const who = { id: 7 as number | null };

function canvas(): Editor {
  const el = document.querySelector('.rse-body .tiptap') as (HTMLElement & { editor?: Editor }) | null;
  if (!el?.editor) throw new Error('editor not mounted');
  return el.editor;
}

const SAVED = '<p>Stability narrative.</p>';
const OFFER = /A draft cached on this device/;

async function typeAsCurrentUser(storageKey: string): Promise<void> {
  const { unmount } = render(<RichSectionEditor value={SAVED} onSave={vi.fn()} storageKey={storageKey} />);
  await waitFor(() => expect(document.querySelector('.rse-body .tiptap')).toBeTruthy());
  canvas().chain().focus().selectAll().insertContent('<p>Unreasoned change to the stability claim.</p>').run();
  await waitFor(() => expect(Object.keys(localStorage).some((k) => k.startsWith('dc::'))).toBe(true));
  unmount();
}

beforeEach(() => {
  localStorage.clear();
  who.id = 7;
  vi.spyOn(authService, 'getUser').mockImplementation(
    () => (who.id == null ? null : ({ id: who.id } as unknown as ReturnType<typeof authService.getUser>)),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('a cached draft is offered only to the person who typed it (SEC-A-5)', () => {
  it('the same person is offered it back', async () => {
    await typeAsCurrentUser('sec-1');
    render(<RichSectionEditor value={SAVED} onSave={vi.fn()} storageKey="sec-1" />);
    expect(await screen.findByText(OFFER)).toBeTruthy();
  });

  it('another person on the same browser is not', async () => {
    await typeAsCurrentUser('sec-1');
    who.id = 8;
    render(<RichSectionEditor value={SAVED} onSave={vi.fn()} storageKey="sec-1" />);
    await waitFor(() => expect(document.querySelector('.rse-body .tiptap')).toBeTruthy());
    expect(screen.queryByText(OFFER)).toBeNull();
  });

  it('a read-only section offers no draft, even its author’s', async () => {
    await typeAsCurrentUser('sec-1');
    render(<RichSectionEditor value={SAVED} onSave={vi.fn()} storageKey="sec-1" readOnly />);
    await waitFor(() => expect(document.querySelector('.rse-body .tiptap')).toBeTruthy());
    expect(screen.queryByText(OFFER)).toBeNull();
  });

  it('the offer goes when the section becomes read-only while open', async () => {
    await typeAsCurrentUser('sec-1');
    const view = render(<RichSectionEditor value={SAVED} onSave={vi.fn()} storageKey="sec-1" />);
    expect(await screen.findByText(OFFER)).toBeTruthy();
    view.rerender(<RichSectionEditor value={SAVED} onSave={vi.fn()} storageKey="sec-1" readOnly />);
    await waitFor(() => expect(screen.queryByText(OFFER)).toBeNull());
  });
});

describe('signing out removes every device draft (SEC-A-5)', () => {
  it('drafts under any key shape are purged; other storage is kept', async () => {
    await typeAsCurrentUser('sec-1');
    localStorage.setItem('dc::sec-9', 'a draft cached by an older build');
    localStorage.setItem('theme', 'dark');
    authService.endSession(null);
    expect(Object.keys(localStorage).filter((k) => k.startsWith('dc::'))).toEqual([]);
    expect(localStorage.getItem('theme')).toBe('dark');
  });
});
