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
import type { SurfaceActionDirective } from '../../../shared/navigation/surface-actions.js';

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
  /** The program a project-scope destination opens (navigate_to's `program`). */
  program?: { id: string; name?: string; code?: string };
  executed: true;
}

/**
 * Chips beyond this are dropped: a turn offering more is not offering. Equal
 * to the assist drive budget (shared/navigation/drive-policy), so driving
 * never moves a person more times than offering would have offered.
 */
export const MAX_NAVIGATION_ACTIONS = 6;

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
    const program = (d as NavigationDirective & { program?: NavigationAction['program'] }).program;
    const key = `${d.targetId}:${JSON.stringify(d.params ?? {})}:${program?.id ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      actionType: 'navigate',
      label: d.label,
      targetId: d.targetId,
      path: d.path,
      scope: d.scope,
      ...(d.params && Object.keys(d.params).length > 0 ? { params: d.params } : {}),
      ...(program && typeof program.id === 'string' ? { program } : {}),
      executed: true,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Surface actions — the same carrier contract for `act_on_screen`.
// Tool-driven only, offered (chip) unless the person opted into Live Drive,
// registry-validated at every hand-off. One module carries both directive
// kinds so a second, subtly different carrier can never grow beside this one.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An offer-chip carrying a validated surface action. The client performs it
 * through the ONE surface-action bus (v2/surfaceActions) when the person
 * activates it — same offered-not-performed contract as the navigate chip.
 */
export interface SurfaceActionChip {
  actionType: 'surface_action';
  label: string;
  actionId: string;
  surfaceId: string;
  params?: Record<string, string>;
  executed: true;
}

/**
 * Read an `act_on_screen` tool result and return its directive, or null.
 * Anything that is not a successful `action_ready` — an unknown action, a
 * governed refusal, missing params, or unparseable output — returns null.
 * A refusal upstream must not become an operation downstream.
 */
export function surfaceActionFromToolResult(
  toolName: string,
  resultStr: string,
): SurfaceActionDirective | null {
  if (toolName !== 'act_on_screen') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(resultStr);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  if (o.status !== 'action_ready') return null;
  const d = o.directive as Record<string, unknown> | undefined;
  if (!d || typeof d !== 'object') return null;
  if (
    d.actionType !== 'surface_action' ||
    typeof d.actionId !== 'string' ||
    typeof d.surfaceId !== 'string' ||
    typeof d.label !== 'string'
  ) {
    return null;
  }
  return d as unknown as SurfaceActionDirective;
}

/**
 * Collapse a turn's surface-action directives into chips — same dedup, cap,
 * and first-occurrence-wins contract as the navigation chips.
 */
export function toSurfaceActionChips(
  directives: readonly SurfaceActionDirective[],
): SurfaceActionChip[] {
  const seen = new Set<string>();
  const out: SurfaceActionChip[] = [];
  for (const d of directives) {
    if (out.length >= MAX_NAVIGATION_ACTIONS) break;
    const key = `${d.actionId}:${JSON.stringify(d.params ?? {})}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      actionType: 'surface_action',
      label: d.label,
      actionId: d.actionId,
      surfaceId: d.surfaceId,
      ...(d.params && Object.keys(d.params).length > 0 ? { params: d.params } : {}),
      executed: true,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Demonstration starts — "show me the system" typed in chat with Live Drive OFF.
//
// `start_product_demo` fetches a validated script. Under Live Drive the turn
// drives it stop by stop. Without Live Drive nothing can move the screen, so
// the tool result says the moves are OFFERED — and until this carrier existed
// the person got a paragraph telling them where the menu was. The honest path
// is one click: the start itself is offered as a chip, and the client runs it
// through the SAME `startDemo` the rail's Control menu calls (consent shown by
// the toggle turning on, demo mode committed, budgets and take-over unchanged).
// Same offered-not-performed contract, same carrier module, no second path.
// ─────────────────────────────────────────────────────────────────────────────

/** What a demo-ready result says about the script it fetched. */
export interface DemoStartDirective {
  demoId: string;
  title: string;
}

/** The chip: the client resolves `demoId` against the shared script registry. */
export interface DemoStartChip {
  actionType: 'start_demo';
  label: string;
  demoId: string;
  demoTitle: string;
  executed: true;
}

/**
 * Read a `start_product_demo` result and return the script to offer, or null.
 *
 * Only an OFFERED demonstration becomes a chip: the result must say
 * `driven: false`. A driven turn is already running the script live and a
 * "start" chip there would restart what is playing. A refusal
 * (`unknown_demo`, `invalid_demo`, `needs_parameters`), an older result with
 * no `driven` field, or unparseable output returns null — a refusal upstream
 * must not become a start downstream.
 */
export function demoStartFromToolResult(
  toolName: string,
  resultStr: string,
): DemoStartDirective | null {
  if (toolName !== 'start_product_demo') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(resultStr);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  if (o.status !== 'demo_ready' || o.driven !== false) return null;
  const script = o.script as Record<string, unknown> | undefined;
  if (!script || typeof script !== 'object') return null;
  if (typeof script.id !== 'string' || !script.id || typeof script.title !== 'string' || !script.title) {
    return null;
  }
  return { demoId: script.id, title: script.title };
}

/** The chip label — one wording, shared by the server test and the rail test. */
export function demoStartLabel(title: string): string {
  return `Start demonstration: ${title}`;
}

/**
 * Collapse a turn's demo starts into chips — same dedup, cap and
 * first-occurrence-wins contract as the navigation chips.
 */
export function toDemoStartChips(directives: readonly DemoStartDirective[]): DemoStartChip[] {
  const seen = new Set<string>();
  const out: DemoStartChip[] = [];
  for (const d of directives) {
    if (out.length >= MAX_NAVIGATION_ACTIONS) break;
    if (seen.has(d.demoId)) continue;
    seen.add(d.demoId);
    out.push({
      actionType: 'start_demo',
      label: demoStartLabel(d.title),
      demoId: d.demoId,
      demoTitle: d.title,
      executed: true,
    });
  }
  return out;
}
