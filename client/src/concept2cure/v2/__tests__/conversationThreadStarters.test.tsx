// @vitest-environment jsdom
/**
 * The front door of a conversation must not invent the workspace behind it.
 *
 * A new conversation opens on three starter chips. They were hard-coded as
 * "File a 510(k) for our glucose monitoring patch", "Is the section 2.5.4
 * efficacy claim defensible?" and "What blocks the Module 3 freeze?" — read
 * aloud to every organisation, including a brand-new Biotech & Pharma
 * workspace with no projects and no documents (launch row D2). The first names
 * a device as "ours"; the other two assert a 2.5.4 claim and a Module 3 freeze
 * that exist nowhere. Nothing read them from the server; they were demo copy.
 *
 * A starter is the product speaking before the person has said anything, so it
 * may presuppose nothing about their programs, documents or dossier. These
 * tests hold the chips to that for more than one kind of organisation, and keep
 * the chip's one job — sending exactly what it says — intact.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

/* The surface's live data reads — held offline so the render under test is the
   empty conversation and nothing else. Same stubs as the signoff suite. */
vi.mock('../dataConnect', () => ({
  connected: () => false,
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));

const send = vi.fn();
vi.mock('../../components/ana/useAnaChat', () => ({
  useAnaChat: () => ({
    messages: [],
    isStreaming: false,
    isLoadingThread: false,
    loadThread: vi.fn().mockResolvedValue(undefined),
    send,
  }),
}));

import { ConversationThread } from '../surfaces/ConversationThread';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const propsFor = (segment: string): OwnedSurfaceViewProps => ({
  surface: { id: 'conversation-thread', label: 'Conversation' } as OwnedSurfaceViewProps['surface'],
  segment,
  onNav: () => {},
});

/**
 * What a starter must never do, each taken from the chips that shipped:
 * claim a product as the organisation's own, name a dossier section or module,
 * or assert a milestone state.
 */
const PRESUPPOSES: Array<[string, RegExp]> = [
  ['claims a product as the organisation’s', /\b(our|my)\s+(?!workspace\b)\w+/i],
  ['names a specific product', /glucose|patch|monitor/i],
  ['names a CTD section', /\b(section\s+)?\d\.\d+(\.\d+)?\b/i],
  ['names a CTD module', /\bmodule\s+\d\b/i],
  ['asserts a milestone state', /\bfreeze\b|\block(ed)?\b/i],
  ['assumes a device pathway', /510\(k\)|\bPMA\b|De Novo/i],
];

function starterChips(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.ct-empty-chip'));
}

beforeEach(() => {
  (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO = { id: 'new' };
  send.mockReset();
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
});

describe('ConversationThread — starter chips presuppose nothing about the workspace', () => {
  for (const segment of ['biopharma', 'medtech', 'cro']) {
    it(`offers starters that assume no product, section or milestone (${segment})`, () => {
      render(<ConversationThread {...propsFor(segment)} />);

      const chips = starterChips();
      expect(chips.length).toBeGreaterThan(0);
      for (const chip of chips) {
        const text = chip.textContent ?? '';
        for (const [what, pattern] of PRESUPPOSES) {
          expect(text, `starter "${text}" ${what}`).not.toMatch(pattern);
        }
      }
    });
  }

  it('sends exactly the starter the person pressed', () => {
    render(<ConversationThread {...propsFor('biopharma')} />);

    const [first] = starterChips();
    fireEvent.click(first);
    expect(send).toHaveBeenCalledWith(first.textContent);
  });
});
