/**
 * What a tool result says about itself, read deterministically (TP-RL-4, AnA
 * reasoning round 5, 2026-10-05).
 *
 * The loop counted a step as failed only when its handler threw or refused
 * (`{ error }`, tool-trace.ts refusalOf). A search that found nothing, a
 * service that could not be reached and a tool that needs input it was not
 * given all answered as successes, so the round wrote no adaptation note and
 * the model went on to its answer with nothing telling it these steps
 * returned nothing usable. The tools say so themselves: some 90 handlers
 * answer `status: 'needs_parameters'`, others `'unavailable'`,
 * `'lookup_failed'` or `'not_found'`, an outage envelope carries "API
 * unavailable", and a search with no hits returns a count of 0 or an empty
 * result list; a project search answers in a sentence of its own ("No
 * matching passages were found…"). Only a result's own statement of what it
 * returned is read here, never an inference from its content, and a result
 * that returned anything is never a shortfall.
 *
 * The note this builds rides the next model turn beside the round's results,
 * next to the failure note (agentic-loop.ts buildAdaptationNote).
 *
 * @module server/services/ana/tool-outcome
 */

import { refusalOf } from './tool-trace.js';

/** What a step returned instead of a usable result. */
export type ShortfallKind = 'empty' | 'unavailable' | 'needs_input';

export interface Shortfall {
  kind: ShortfallKind;
  /** The tool's own words for it, when it gave any. */
  detail?: string;
}

const NEEDS_INPUT = new Set(['needsparameters', 'needsinput', 'missingparameters', 'needsclarification']);
const UNAVAILABLE = new Set(['unavailable', 'lookupfailed', 'serviceunavailable', 'timeout', 'timedout']);
const EMPTY = new Set(['notfound', 'noresults', 'nomatch', 'nonefound', 'empty']);

/** Top-level fields that hold what a search or lookup returned. */
const RESULT_KEYS = ['results', 'studies', 'articles', 'items', 'hits', 'records', 'trials', 'documents', 'labels', 'matches', 'data', 'passages'];
/** Top-level fields that count what it returned (`found`: the CMC record lookups, cmc-knowledge-tools.ts). */
const COUNT_KEYS = ['count', 'total', 'totalCount', 'resultCount', 'totalResults', 'numFound', 'found'];
/** An outage envelope's own words. */
const OUTAGE_RE = /\b(?:API|service)\s+(?:is\s+)?(?:currently\s+)?unavailable\b|could not be reached|timed out/i;
/**
 * A plain-text result that is wholly the tool's own sentence saying it found
 * nothing, or was not given what it needs (project_knowledge_search answers
 * so). Anchored to what was searched for, so "No issues found" — a finding —
 * is not one, and bounded, so an analysis that opens with "No … found" is not.
 */
const PROSE_EMPTY_RE = /^No (?:matching |other )?(?:passages?|documents?|results?|records?|matches|studies|articles|trials)\b[^.\n]{0,120}?\b(?:found|matched)\b/;
const PROSE_NEEDS_INPUT_RE = /^No (?:query|queries|input|text|active project)\b[^.\n]{0,120}?\b(?:provided|given|in context)\b/;
const PROSE_MAX = 400;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

const cut = (s: string) => (s.length > 160 ? `${s.slice(0, 159)}…` : s);

/** The tool's own words for what happened, first of message, note, reason, detail. */
function detailOf(r: Record<string, unknown>): string | undefined {
  for (const k of ['message', 'note', 'reason', 'detail']) {
    const v = r[k];
    if (typeof v === 'string' && v.trim()) return cut(v.trim());
  }
  return undefined;
}

/** The shortfall a plain-text result states of itself, or null. */
function proseShortfall(text: string): Shortfall | null {
  const t = text.trim();
  if (t.length > PROSE_MAX) return null;
  const kind: ShortfallKind | null = PROSE_NEEDS_INPUT_RE.test(t) ? 'needs_input' : PROSE_EMPTY_RE.test(t) ? 'empty' : null;
  return kind ? { kind, detail: cut(t) } : null;
}

/**
 * Whether it holds a result list, and whether it returned anything. Any
 * non-empty top-level list counts as returned, under whatever name: records
 * under a field not named here must never be called nothing.
 */
function resultLists(r: Record<string, unknown>): { present: boolean; anyEntries: boolean } {
  const present = RESULT_KEYS.some((k) => Array.isArray(r[k]));
  const anyEntries = Object.values(r).some((v) => Array.isArray(v) && v.length > 0);
  return { present, anyEntries };
}

/** What a status field says, if it says one of the shortfalls. */
function statusShortfall(status: unknown): ShortfallKind | null {
  if (typeof status !== 'string') return null;
  const s = norm(status);
  if (NEEDS_INPUT.has(s)) return 'needs_input';
  if (UNAVAILABLE.has(s)) return 'unavailable';
  if (EMPTY.has(s)) return 'empty';
  return null;
}

/** A result as a JSON object, or null when it is not one. */
function resultObject(resultContent: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(resultContent);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The shortfall a result declares, or null when it returned something. */
export function shortfallOf(resultContent: string): Shortfall | null {
  const r = resultObject(resultContent);
  if (!r) return proseShortfall(resultContent);
  // A refusal is the loop's failure path, not a shortfall (refusalOf: `error`,
  // `refused`, or `ok: false` without the work it judges).
  if (refusalOf(resultContent)) return null;
  const detail = detailOf(r);
  const declared = statusShortfall(r.status) ?? (r.unavailable === true ? 'unavailable' : null);
  if (declared) return { kind: declared, ...(detail && { detail }) };
  const lists = resultLists(r);
  if (lists.anyEntries) return null;
  if (detail && OUTAGE_RE.test(detail)) return { kind: 'unavailable', detail };
  const zeroCount = COUNT_KEYS.some((k) => r[k] === 0);
  return zeroCount || lists.present ? { kind: 'empty' } : null;
}

const SAID: Record<ShortfallKind, string> = {
  empty: 'returned no results',
  unavailable: 'the service could not be reached',
  needs_input: 'needs input it was not given',
};

/** One step of a round, as the stream ran it. */
export interface RoundStep {
  label: string;
  status: string;
  heldBack?: boolean;
  result: string;
}

/**
 * The note for the next model turn naming each step that returned nothing
 * usable, or '' when every step returned something. A failed, stopped or held
 * step is the failure note's (buildAdaptationNote), not this one's.
 */
export function buildShortfallNote(steps: RoundStep[], totalCalls: number): string {
  const named: string[] = [];
  for (const step of steps) {
    if (step.status !== 'success' || step.heldBack) continue;
    const s = shortfallOf(step.result);
    if (s) named.push(`${step.label} — ${SAID[s.kind]}${s.detail ? ` (${s.detail})` : ''}`);
  }
  if (named.length === 0) return '';
  const plural = totalCalls === 1 ? 'call' : 'calls';
  return (
    `[Adaptation note] ${named.length} of ${totalCalls} tool ${plural} this round returned nothing usable: ` +
    `${named.join('; ')}. Do not present what these did not return as found: vary the input or try another ` +
    `source, ask the person for what is missing, or say plainly what could not be found.`
  );
}
