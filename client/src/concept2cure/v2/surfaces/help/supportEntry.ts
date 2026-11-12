/**
 * Opening the help and support agent (P-127, docs/design/HELP_AND_SUPPORT_2026-11-10.md §3.3): the conversation, asked
 * as support, from Get help (the account menu and the top bar's Help) and from Help & training's "Ask support".
 *
 * The hand-off is the conversation screen's one channel, `window.C2C_CONVO`, with an ask origin
 * (ConversationThread.tsx, ONE_ANA_ONE_CANVAS slice 8): the conversation shows "From Help & training", offers "Back to
 * Help & training", and the turn the person sends carries the origin's module context, `{ support: true }`. On that turn
 * the server pins the Help Center and support tools and briefs AnA as Concept2Cure support
 * (server/services/ana/help-support-tools.ts isSupportTurn). Nothing is sent for the person: what they type is the
 * first question.
 */
export const SUPPORT_SURFACE = 'conversation-thread';
export const SUPPORT_ORIGIN_SURFACE = 'training';

export interface SupportOrigin {
  surfaceId: typeof SUPPORT_ORIGIN_SURFACE;
  label: 'Help & training';
  moduleContext: { surface: typeof SUPPORT_ORIGIN_SURFACE; support: true };
}

export interface SupportHandOff {
  id: 'new';
  seed: null;
  prefill: string | null;
  origin: SupportOrigin;
}

export function supportHandOff(prefill: string | null = null): SupportHandOff {
  return {
    id: 'new',
    seed: null,
    prefill: prefill && prefill.trim() ? prefill : null,
    origin: { surfaceId: SUPPORT_ORIGIN_SURFACE, label: 'Help & training', moduleContext: { surface: SUPPORT_ORIGIN_SURFACE, support: true } },
  };
}

/** Opens the conversation as support. `onAsk` is unused: support is asked in the conversation, never the shell's rail. */
export function askSupport(onNav: (id: string) => void, _onAsk?: (text: string) => void, prefill: string | null = null): void {
  (window as unknown as { C2C_CONVO?: SupportHandOff }).C2C_CONVO = supportHandOff(prefill);
  onNav(SUPPORT_SURFACE);
}
