/**
 * Navigation directives → action chips. The join the loop was missing.
 *
 * ── What was open ────────────────────────────────────────────────────────────
 * `shared/navigation` locks the contract, `list_app_screens` and `navigate_to`
 * are registered and return a validated `NavigationDirective`, and the shell
 * navigates by surface id. Nothing carried the directive from the tool result
 * to the client, so AnA could decide to navigate and could not navigate. This
 * module is that carrier, and it is the only one — a second path from model
 * output to a screen change is the thing the design below exists to prevent.
 *
 * ── Tool-driven, never signal-driven ─────────────────────────────────────────
 * `shared/navigation` also exports `parseNavigationSignals`, which extracts
 * ```ana-navigate fences from the response text. That path is NOT used here and
 * should not be added. A tool call is schema-validated, argument-logged through
 * `logToolRun`, and refuses an unknown target; fenced prose is just text, and
 * text reaches the context window from retrieved documents and tool output as
 * readily as from the user. Steering the client from prose would make any
 * ingested PDF able to move the operator's screen. The gateway already scans
 * non-user content for injection precisely because that is the realistic attack
 * path; this module declines to open a second one.
 *
 * ── Why a chip and not an automatic jump ─────────────────────────────────────
 * The directive is surfaced as an action the user activates, not as a
 * navigation the server performs. A model that is confidently wrong about where
 * someone should be would otherwise move them mid-task, and in a regulated
 * workflow the cost of being moved away from an unsaved judgement is real. The
 * chip keeps the human as the actor and AnA as the one offering.
 *
 * Pure and synchronous: no database, no network, no wall-clock read.
 *
 * @module server/services/ana-ri/navigation-actions
 */

import type { NavigationDirective } from '../../../shared/navigation/index.js';

/**
 * An executed-action chip carrying a navigation target.
 *
 * `actionType: 'navigate'` is what tells the client to move rather than to hand
 * the label back to AnA as a new question — the default for every other chip.
 * `targetId` is the registry id the shell navigates by; `path` travels with it
 * for any consumer that routes by path instead.
 */
export interface NavigationAction {
  actionType: 'navigate';
  label: string;
  targetId: string;
  path: string;
  scope: NavigationDirective['scope'];
  params?: Record<string, string>;
  executed: true;
}

/** Chips beyond this are dropped: a turn offering more is not offering. */
export const MAX_NAVIGATION_ACTIONS = 3;

/**
 * Read a `navigate_to` tool result and return its directive, or null.
 *
 * Accepts the raw result string the executor produced. Anything that is not a
 * successful navigation — `unknown_target`, `needs_parameters`, an error, or
 * unparseable output — returns null rather than a partial chip. A refusal
 * upstream must not become a jump downstream.
 */
export function directiveFromToolResult(
  toolName: string,
  resultStr: string,
): NavigationDirective | null {
  if (toolName !== 'navigate_to') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(resultStr);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  if (o.status !== 'navigation_ready') return null;
  const d = o.directive as Record<string, unknown> | undefined;
  if (!d || typeof d !== 'object') return null;
  if (
    d.actionType !== 'navigate' ||
    typeof d.targetId !== 'string' ||
    typeof d.label !== 'string' ||
    typeof d.path !== 'string'
  ) {
    return null;
  }
  return d as unknown as NavigationDirective;
}

/**
 * Collapse a turn's directives into chips, in order, first occurrence winning.
 *
 * A turn that calls `navigate_to` twice for the same target offers one chip;
 * AnA re-deciding is not the user needing to choose twice.
 */
export function toNavigationActions(
  directives: readonly NavigationDirective[],
): NavigationAction[] {
  const seen = new Set<string>();
  const out: NavigationAction[] = [];
  for (const d of directives) {
    if (out.length >= MAX_NAVIGATION_ACTIONS) break;
    const key = `${d.targetId}:${JSON.stringify(d.params ?? {})}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      actionType: 'navigate',
      label: d.label,
      targetId: d.targetId,
      path: d.path,
      scope: d.scope,
      ...(d.params && Object.keys(d.params).length > 0 ? { params: d.params } : {}),
      executed: true,
    });
  }
  return out;
}
