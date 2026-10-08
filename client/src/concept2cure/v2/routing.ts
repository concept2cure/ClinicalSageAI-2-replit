/**
 * ui-v2 URL model — every reconciled registry id is a route segment under
 * /concept2cure, resolved by the shell (replaces ZenRouter's four-surface
 * switch). Pure module so routing stays unit-testable without the shell.
 */
import { DEEP_LINK_ALIASES } from './registryModel';

export const UI_V2_BASE = '/concept2cure';

/** /concept2cure[/:surfaceId[/…]] → surface id ('home' for the bare base). */
export function surfaceIdFromLocation(location: string): string {
  if (!location.startsWith(UI_V2_BASE)) return 'home';
  const rest = location.slice(UI_V2_BASE.length).replace(/^\//, '');
  if (!rest) return 'home';
  const seg = rest.split('/')[0].split('?')[0];
  return DEEP_LINK_ALIASES[seg] ?? seg;
}

/** surface id → its canonical URL. */
export function locationForSurface(id: string): string {
  return id === 'home' ? UI_V2_BASE : `${UI_V2_BASE}/${id}`;
}

/* ── The conversation on screen, in the URL ──────────────────────────────────
   `/concept2cure/conversation-thread/<threadId>`. The screen learned which
   conversation to show only from `window.C2C_CONVO`, which a reload clears, so
   a reload came back as "New conversation" with the answered turn nowhere on
   screen (QA 2026-10-08, j5). The surface id is still the first segment, so
   `surfaceIdFromLocation` and everything keyed on it are unchanged. Only a
   well-formed id is read or written: the URL is input, never a path. */
const CONVERSATION_SURFACE = 'conversation-thread';
const THREAD_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

/** The conversation id a location names, or null when it names none. */
export function conversationIdFromLocation(location: string): string | null {
  const base = `${locationForSurface(CONVERSATION_SURFACE)}/`;
  if (!location.startsWith(base)) return null;
  const segment = location.slice(base.length).split(/[/?#]/)[0];
  let id: string;
  try {
    id = decodeURIComponent(segment);
  } catch {
    return null;
  }
  return THREAD_ID.test(id) ? id : null;
}

/** The URL of the conversation screen showing `threadId` (the bare screen for none). */
export function locationForConversation(threadId: string | null): string {
  const base = locationForSurface(CONVERSATION_SURFACE);
  return threadId && THREAD_ID.test(threadId) ? `${base}/${encodeURIComponent(threadId)}` : base;
}
