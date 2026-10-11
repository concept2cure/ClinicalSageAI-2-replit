/**
 * AnA's reply text as a person reads it: tool status codes said in words.
 *
 * AnA's tools answer the model with a machine status — `action_ready`,
 * `navigation_ready`, `needs_project` … (server/services/ana/AnaToolExecutor.ts).
 * A model that repeats the result verbatim writes that code into its answer,
 * and the answer reached the conversation as "Vault search result:
 * action_ready." (QA 2026-10-08, walk 2, j5). The server streams the model's
 * text unchanged (server/routes/ana-ri/stream.ts) and stores it as written, so
 * the record keeps exactly what the model said; this is where it is rendered
 * for a reader, the ONE place: AnaMarkdown (every host's answer renderer) and
 * the "AnA's reply is in the conversation" strip both call it.
 *
 * Only whole, known status codes are replaced. An unknown snake_case word is
 * left alone — it may be a real identifier the person asked about.
 *
 * @module client/src/concept2cure/v2/anaReplyText
 */

/** Each tool status code AnA's tools return, in words. */
export const TOOL_STATUS_WORDS: Readonly<Record<string, string>> = {
  action_ready: 'sent to the screen',
  navigation_ready: 'screen opened',
  demo_ready: 'demonstration ready',
  needs_project: 'a project has to be opened first',
  needs_parameters: 'more details are needed',
  needs_context: 'more context is needed',
  unknown_action: 'not an action this screen offers',
  governed_refused: 'refused, because it needs a governed sign-off',
  unknown_command: 'not a known command',
  unknown_demo: 'not a known demonstration',
  invalid_demo: 'not a known demonstration',
  not_found: 'not found',
  no_match: 'no match',
  no_data: 'no data',
  lookup_failed: 'the lookup failed',
  read_failed: 'the read failed',
  not_available: 'not available',
  not_assessable: 'cannot be assessed',
  not_assessed: 'not assessed',
  not_comparable: 'cannot be compared',
  ownership_unverifiable: 'ownership could not be verified',
};

const TOKEN = new RegExp(`(?<![A-Za-z0-9_])(${Object.keys(TOOL_STATUS_WORDS).join('|')})(?![A-Za-z0-9_])`, 'g');

/** The reply with every known tool status code said in words. */
export function readableReplyText(text: string): string {
  if (!text || !text.includes('_')) return text;
  return text.replace(TOKEN, (code: string) => TOOL_STATUS_WORDS[code] ?? code);
}
