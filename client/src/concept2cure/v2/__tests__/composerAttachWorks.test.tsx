// @vitest-environment jsdom
/**
 * Every attach affordance actually attaches.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Reported by the product owner: "paper clips on the AnA discussion panels
 * don't work." They were right, on two surfaces, in two different ways:
 *
 *   ConversationThread.tsx:409
 *     <button className="ct-comp-attach" title="Attach a document for AnA to
 *     use">{I.paperclip}</button>
 *     — no onClick. Not a no-op handler; no handler at all. There was no file
 *     input anywhere on the surface for it to open.
 *
 *   EctdCoauthor.tsx:473
 *     <span className="ec-chip">{I.paperclip} Sources</span>
 *     — a paperclip and an action word rendered as a <span>. Not focusable, not
 *     clickable, not a control at all.
 *
 * Both sit in composers on surfaces whose whole job is discussing documents
 * with an assistant. The working path existed the entire time — `useChatUpload`
 * → POST /api/chat/upload, which the shell composer and ProjectHome both use —
 * these two surfaces just never called it.
 *
 * ── What this asserts ────────────────────────────────────────────────────────
 * Not "a paperclip is rendered" — that was always true and is exactly what made
 * the bug invisible. It asserts the CHAIN: the control is a real focusable
 * button, clicking it opens a file picker, and choosing a file reaches the
 * upload transport. A dead paperclip fails at the second step.
 *
 * The click→picker link is observed by spying on HTMLInputElement.click, which
 * is what a hidden-input picker must call and what jsdom cannot otherwise show.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

/** Files handed to the upload hook, across all surfaces under test. */
const uploaded: string[] = [];

vi.mock('../../hooks/useChatUpload', () => ({
  useChatUpload: () => ({
    attachments: [],
    uploading: false,
    statusMessage: '',
    addFiles: (files: FileList | File[] | null) => {
      if (!files) return;
      for (const f of Array.from(files as FileList)) uploaded.push(f.name);
    },
    removeAttachment: () => {},
    clear: () => {},
  }),
  attachmentReadLabel: () => 'read · 12 words',
  SR_ONLY_STYLE: { position: 'absolute', width: 1, height: 1, overflow: 'hidden' },
}));

/** The chat transport is not under test; stub it so the composers mount. */
vi.mock('../../components/ana/useAnaChat', () => ({
  useAnaChat: () => ({
    messages: [],
    isStreaming: false,
    isLoadingThread: false,
    send: vi.fn(),
    loadThread: vi.fn(async () => {}),
    threadId: null,
  }),
}));

import { ConversationThread } from '../surfaces/ConversationThread';
import { EctdCoauthor } from '../surfaces/EctdCoauthor';

const noopProps = {
  onAsk: () => {},
  onNav: () => {},
  onSend: () => {},
  segment: 'mdx',
} as any;

let clickSpy: ReturnType<typeof vi.spyOn>;
/** Inputs whose .click() was called — i.e. pickers that were actually opened. */
let openedPickers: HTMLInputElement[] = [];

beforeEach(() => {
  uploaded.length = 0;
  openedPickers = [];
  clickSpy = vi
    .spyOn(HTMLInputElement.prototype, 'click')
    .mockImplementation(function (this: HTMLInputElement) {
      openedPickers.push(this);
    });
});

afterEach(() => {
  clickSpy.mockRestore();
  cleanup();
});

/** A real File, so the change event carries what a picker would carry. */
function pickFile(input: HTMLInputElement, name: string) {
  const file = new File(['%PDF-1.4 test'], name, { type: 'application/pdf' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

const SURFACES: Array<{
  name: string;
  Component: React.ComponentType<any>;
  button: string;
  input: string;
}> = [
  {
    name: 'ConversationThread',
    Component: ConversationThread as React.ComponentType<any>,
    button: 'ct-attach-button',
    input: 'ct-attach-input',
  },
  {
    name: 'EctdCoauthor',
    Component: EctdCoauthor as React.ComponentType<any>,
    button: 'ec-attach-button',
    input: 'ec-attach-input',
  },
];

describe.each(SURFACES)('$name composer attach', ({ Component, button, input }) => {
  it('renders the paperclip as a real button, not a span', async () => {
    render(<Component {...noopProps} />);
    const el = await screen.findByTestId(button);
    // The EctdCoauthor failure mode exactly: styled like a control, not one.
    expect(el.tagName).toBe('BUTTON');
    // Reachable by keyboard, and named for a screen reader.
    expect(el.hasAttribute('disabled')).toBe(false);
    expect(el.getAttribute('title') || el.getAttribute('aria-label')).toBeTruthy();
  });

  it('opens a file picker when clicked', async () => {
    render(<Component {...noopProps} />);
    const el = await screen.findByTestId(button);

    fireEvent.click(el);

    // The ConversationThread failure mode exactly: a click that goes nowhere.
    await waitFor(() => expect(openedPickers.length).toBeGreaterThan(0));
    expect(openedPickers[0].getAttribute('data-testid')).toBe(input);
  });

  it('hands a chosen file to the upload transport', async () => {
    render(<Component {...noopProps} />);
    const el = (await screen.findByTestId(input)) as HTMLInputElement;

    pickFile(el, 'predicate-K123456.pdf');

    // The whole point: bytes reach /api/chat/upload rather than a filename
    // being kept and the File dropped on the floor.
    await waitFor(() => expect(uploaded).toContain('predicate-K123456.pdf'));
  });

  it('accepts more than one file, because regulatory sources come in sets', async () => {
    render(<Component {...noopProps} />);
    const el = (await screen.findByTestId(input)) as HTMLInputElement;
    expect(el.hasAttribute('multiple')).toBe(true);
  });
});
