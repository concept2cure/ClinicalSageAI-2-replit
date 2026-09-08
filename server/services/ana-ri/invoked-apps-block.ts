/**
 * Invoked apps — what an `@app` mention does on the server.
 *
 * The composer inserts `@<label>`; nothing else travels. This module reads
 * the message against the SAME vocabulary the composer used
 * (shared/navigation/callable-apps) and turns each recognised mention into
 * three concrete effects on the turn:
 *
 *   1. a prompt block naming the invoked app(s) so the model knows the person
 *      asked for THAT capability, not a guess from the wording;
 *   2. relevance hints for per-turn tool selection, so the app's tools survive
 *      the relevance cap on a large tool surface;
 *   3. the self-drive tools pinned, so AnA can open and operate the app's
 *      screen (navigate_to / act_on_screen resolve the same id).
 *
 * A label that is not in the vocabulary is ordinary text: no block, no hint,
 * no pin. Everything rendered is from the shared contract, never from the
 * message, so the block cannot be used to smuggle instruction.
 *
 * @module server/services/ana-ri/invoked-apps-block
 */

import { parseAppMentions, type CallableApp } from '../../../shared/navigation/callable-apps';

const MAX_APPS = 6;

/** The apps a message invokes, in order of first mention, capped. */
export function invokedApps(message: unknown): CallableApp[] {
  if (typeof message !== 'string') return [];
  return parseAppMentions(message).slice(0, MAX_APPS).map((m) => m.app);
}

/** Relevance terms for tool selection: the id, its words, the label and the hint. */
export function invokedAppHints(message: unknown): string[] {
  const out: string[] = [];
  for (const a of invokedApps(message)) out.push(a.id, a.hint, a.label);
  return out;
}

/** Self-drive tools to pin when any app is invoked — operating an app needs them. */
export const INVOKED_APP_PINS: readonly string[] = ['list_app_screens', 'navigate_to', 'list_screen_actions', 'act_on_screen'];

export function invokedAppPins(message: unknown): string[] {
  return invokedApps(message).length > 0 ? [...INVOKED_APP_PINS] : [];
}

/**
 * The system-prompt block. Empty when nothing was invoked. The text is the
 * shared contract's own labels and descriptions; the person's message is not
 * echoed here.
 */
export function buildInvokedAppsBlock(message: unknown): string {
  const apps = invokedApps(message);
  if (apps.length === 0) return '';
  const lines = apps.map((a) => `  - ${a.label} (id: ${a.id}) — ${a.description}`);
  return [
    '',
    '',
    '=== INVOKED APPS (the user named these with @ in the message) ===',
    'Treat each as the capability the user wants used for this request. Prefer its tools;',
    'when the request needs the screen, open it with navigate_to using the id, and operate',
    'it with act_on_screen. Do not substitute a different module because the wording fits it.',
    ...lines,
    '=== END INVOKED APPS ===',
  ].join('\n');
}
