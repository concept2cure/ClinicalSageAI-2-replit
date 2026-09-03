// @vitest-environment jsdom
/**
 * ConversationThread must draw the 21 CFR Part 11 signature gate.
 *
 * ── What was shipping ─────────────────────────────────────────────────────────
 * `toTurn` adapted a real `AnaChatMessage` into the `CtTurn` this surface
 * renders, and it mapped exactly three fields: text, thinking, grounding. A turn
 * whose governed command the server had BLOCKED with `PART11_SIGNATURE_REQUIRED`
 * carries `pendingSignoffs` — and that field was dropped on the floor.
 *
 * The result was not a visible error. The turn rendered as an ordinary answer,
 * so the user saw AnA say what it was going to do, saw no prompt, and had no
 * way to learn that a mutation was sitting on the server waiting for a reason
 * for change and a §11.50 signature that nobody was ever asked for. A signature
 * gate with nowhere to draw is not a deferred gate; it is an absent one.
 *
 * ── Why it got worse, not better ──────────────────────────────────────────────
 * This was survivable while the surface was reachable only from the Home
 * composer. It stopped being survivable when `ownsConversation` landed: surfaces
 * that own the conversation now route ⌘K asks *here*, which makes this a
 * destination for questions that can carry governed actions — and, by the
 * definition of `ownsConversation`, the shell rail (the other place the prompt
 * is drawn) is not on screen to catch them.
 *
 * ── The two directions this test has to hold ──────────────────────────────────
 * Both tests below were falsified against the code before the fix: the first
 * fails when `toTurn` drops the field (the prompt is absent), and the second
 * fails if the prompt is drawn unconditionally (which would put a signature
 * demand on every ordinary answer). One without the other is not coverage.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import type { AnaChatMessage } from '../../components/ana/useAnaChat';

/* The surface's live data reads — held offline so the render under test is the
   turn adaptation and nothing else. */
vi.mock('../dataConnect', () => ({
  connected: () => false,
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));

/* useAnaChat is the real streaming client (POST /api/ana-ri/stream). The
   messages it would produce are the input to this test, so it is replaced with
   a fixed transcript rather than a network. */
const chatMessages: { current: AnaChatMessage[] } = { current: [] };
vi.mock('../../components/ana/useAnaChat', () => ({
  useAnaChat: () => ({
    messages: chatMessages.current,
    isStreaming: false,
    isLoadingThread: false,
    loadThread: vi.fn().mockResolvedValue(undefined),
    send: vi.fn(),
  }),
}));

import { ConversationThread } from '../surfaces/ConversationThread';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

/* `ownsConversation: true` narrows the component to `OwnedSurfaceViewProps` —
   everything a surface gets EXCEPT the shell's `onAsk`. Spelling the type out
   rather than passing a bare `onNav` keeps this test honest against the
   registry contract: if the props a surface receives change, this stops
   compiling instead of drifting. */
const OWNED_PROPS: OwnedSurfaceViewProps = {
  surface: { id: 'conversation-thread', label: 'Conversation' } as OwnedSurfaceViewProps['surface'],
  segment: 'biotech',
  onNav: () => {},
};

/** A turn the server blocked pending a high-impact §11.50 e-signature. */
const BLOCKED_TURN: AnaChatMessage = {
  id: 'm2',
  role: 'assistant',
  text: 'I can revert section 2.5.4 to v0.8.',
  pendingSignoffs: [
    {
      command: 'revert_section',
      params: { section: '2.5.4', toVersion: '0.8' },
      signatureRequired: true,
      message: 'Reverting a section requires an electronic signature.',
    },
  ],
} as AnaChatMessage;

/** The same turn, minus the block — an ordinary grounded answer. */
const PLAIN_TURN: AnaChatMessage = {
  id: 'm2',
  role: 'assistant',
  text: 'Section 2.5.4 currently cites the locked CSR-201 point estimate.',
} as AnaChatMessage;

const USER_TURN: AnaChatMessage = { id: 'm1', role: 'user', text: 'Revert 2.5.4.' } as AnaChatMessage;

beforeEach(() => {
  (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO = { id: 'new' };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
});

describe('ConversationThread — 21 CFR Part 11 signature gate', () => {
  it('draws the signature prompt for a turn the server blocked pending sign-off', () => {
    chatMessages.current = [USER_TURN, BLOCKED_TURN];
    render(<ConversationThread {...OWNED_PROPS} />);

    // The dialog itself — GovernedActionSignoff renders role="dialog".
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();

    // High-impact tier: the heading must say a signature is required, not merely
    // that a reason is. The two tiers are legally different.
    expect(screen.getByText('Electronic signature required')).toBeTruthy();

    // The server's own explanation of what is being signed, not a local string.
    expect(screen.getByText('Reverting a section requires an electronic signature.')).toBeTruthy();

    // The §11.50 meaning radiogroup — the declared meaning of the signature is
    // what makes it a signature rather than a confirmation click.
    expect(screen.getByRole('radiogroup')).toBeTruthy();
    for (const meaning of ['Authorship', 'Review', 'Approval']) {
      expect(screen.getByRole('radio', { name: meaning })).toBeTruthy();
    }

    // Re-authentication is captured at signing time (§11.100(b)), so the
    // password field must be present on this tier.
    expect(screen.getByLabelText('Password (electronic signature)')).toBeTruthy();
  });

  it('draws no prompt for an ordinary answer', () => {
    chatMessages.current = [USER_TURN, PLAIN_TURN];
    render(<ConversationThread {...OWNED_PROPS} />);

    expect(screen.getByText(PLAIN_TURN.text!)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.textContent).not.toMatch(/signature required/i);
    expect(document.body.textContent).not.toMatch(/Reason for change/i);
  });
});
