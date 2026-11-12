/**
 * Opening the help and support agent (P-127, docs/design/HELP_AND_SUPPORT_2026-11-10.md §3.3): the conversation, in
 * support mode, from Get help (the account menu and the top bar's Help) and from Help & training's "Ask support".
 *
 * The hand-off is the conversation screen's one channel, `window.C2C_CONVO`, with `support: true`: a new conversation
 * whose turns carry `support_mode`, so AnA answers from the Help Center with the support tools only.
 */
export const SUPPORT_SURFACE = 'conversation-thread';

/** What the support conversation's composer offers before the person types. */
export const SUPPORT_PREFILL = '';

export interface SupportHandOff {
  id: 'new';
  seed: null;
  support: true;
  prefill?: string | null;
}

export function supportHandOff(prefill: string | null = null): SupportHandOff {
  return { id: 'new', seed: null, support: true, ...(prefill ? { prefill } : {}) };
}

/** Opens the support conversation. `onAsk` is unused: the support conversation is its own, never the shell's rail. */
export function askSupport(onNav: (id: string) => void, _onAsk?: (text: string) => void, prefill: string | null = null): void {
  (window as unknown as { C2C_CONVO?: SupportHandOff }).C2C_CONVO = supportHandOff(prefill);
  onNav(SUPPORT_SURFACE);
}
