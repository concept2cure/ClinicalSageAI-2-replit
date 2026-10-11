/**
 * How Anthropic-executed work appears in AnA's work trace.
 *
 * A web search or a web fetch runs on Anthropic's infrastructure, not ours; we
 * learn it happened only from `server_tool_use` / `*_tool_result` blocks, which
 * the gateway now collects (see `collectServerToolBlock`). This module turns
 * one of those into the label and summary the trace shows.
 *
 * Pure, no I/O — so the wording can be tested without a stream.
 *
 * @module server/services/ana/server-tool-steps
 */

import type { GatewayServerToolUse } from '../ai-gateway/types.js';
import { stepLabel, unknownStepLabel, type StepFact, type StepTense, type StepVerb } from '@shared/ana/step-verbs';
import { cleanStepText, stepMessage } from './step-presentation.js';

/** How many consulted sources the trace lists before it stops enumerating. */
export const MAX_LISTED_SOURCES = 8;

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/**
 * A server-run step's own id as the stream's pairing field, when the API
 * reported one. The client pairs each tool_result with its call by
 * `toolUseId`; these steps are correct without it only because each use and
 * its result are written back to back, and the id keeps them correct if that
 * ordering ever changes. Kept here rather than inline in the stream's emitter
 * so the emitter's branching stays under the complexity ceiling.
 */
export function serverToolStepIdField(step: GatewayServerToolUse): { toolUseId?: string } {
  return typeof step.id === 'string' && step.id ? { toolUseId: step.id } : {};
}

/**
 * How each server-run step reads, from the same closed verb table as AnA's own
 * tools (shared/ana/step-verbs.ts), with source `web`. The query a search used
 * is its preview, never part of the label; a step with no query has no
 * preview rather than an invented one — a label that named a search term
 * nobody searched for would be a fabricated record. A server tool this module
 * does not know reads "Running a step", never its name.
 */
const SERVER_STEPS: Readonly<Record<string, { verb: StepVerb; object: string; preview: 'query' | 'url' }>> = {
  web_search: { verb: 'search', object: 'the web', preview: 'query' },
  web_fetch: { verb: 'read', object: 'a web page', preview: 'url' },
};

/** The trace label for a server-tool step, in the tense asked for. */
export function describeServerToolStep(step: GatewayServerToolUse, tense: StepTense = 'doing'): string {
  const known = SERVER_STEPS[step.name];
  return known ? stepLabel(known.verb, known.object, tense) : unknownStepLabel(tense);
}

/**
 * What the stream's `tool_use` and `tool_result` frames say about a server-run
 * step. Both are written once the step is over, so the result reads in the
 * done form when it succeeded. No model generation of ours ran for it, but the
 * work was the provider's: `usedModel` is unknown (null).
 */
export function serverToolStepFields(step: GatewayServerToolUse) {
  const known = SERVER_STEPS[step.name];
  const raw = known ? (step.input as Record<string, unknown> | undefined)?.[known.preview] : undefined;
  const preview = cleanStepText(raw);
  const facts: StepFact[] = preview && known?.preview === 'query' ? [{ name: 'Searched for', value: preview }] : [];
  const summary = summariseServerToolResult(step);
  const found = summary.ok ? summary.sources.length + summary.omitted : null;
  const finishedFacts: StepFact[] =
    found === null ? facts : [...facts, { name: 'Found', value: `${found} ${found === 1 ? 'source' : 'sources'}` }];
  const base = { source: 'web' as const, preview };
  const doing = describeServerToolStep(step, 'doing');
  // The one status sentence (step-presentation.ts stepMessage), not one of this module's own.
  const message = step.isError ? stepMessage('error', false, undefined, doing) : null;
  return {
    announced: { ...base, label: doing, facts },
    finished: {
      ...base,
      label: step.isError ? doing : describeServerToolStep(step, 'done'),
      facts: finishedFacts,
      usedModel: null,
      ...(message ? { message } : {}),
    },
  };
}

/** One consulted source, as the trace shows it. */
export interface ConsultedSource {
  title?: string;
  url?: string;
}

export type ServerToolSummary =
  | { ok: true; tool: string; sources: ConsultedSource[]; omitted: number }
  | { ok: false; tool: string; errorCode?: string };

/** One result entry as a consulted source, or null when it names neither. */
function toSource(entry: unknown): ConsultedSource | null {
  const e = entry as any;
  const url = asString(e?.url) ?? asString(e?.document?.source?.url);
  const title = asString(e?.title) ?? asString(e?.document?.title);
  if (!url && !title) return null;
  return { ...(title ? { title } : {}), ...(url ? { url } : {}) };
}

/**
 * Every source a result body names, in order.
 *
 * A search returns a list; a fetch returns one document object. Anything else
 * yields nothing — an unrecognised entry is skipped, never guessed at.
 */
function extractSources(raw: unknown): ConsultedSource[] {
  const entries: unknown[] = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
  return entries.map(toSource).filter((x): x is ConsultedSource => x !== null);
}

/**
 * What the trace records about the result — what was consulted, not its text.
 *
 * A web fetch returns an entire document; forwarding it into the event stream
 * would put a page of third-party content into the trace for every read. The
 * trace's job is to say which sources AnA looked at, so that is what it keeps.
 *
 * Deliberately conservative about shape. A success is a LIST of result entries;
 * a failure is an OBJECT with an `error_code`; a fetch is a single document.
 * Anything this does not recognise yields an empty source list rather than a
 * guessed one, and `omitted` says how many were left out so a long list is
 * never presented as the whole of what was read.
 */
export function summariseServerToolResult(step: GatewayServerToolUse): ServerToolSummary {
  if (step.isError) {
    const code = asString((step.result as any)?.error_code);
    return { ok: false, tool: step.name, ...(code ? { errorCode: code } : {}) };
  }

  const sources = extractSources(step.result);
  return {
    ok: true,
    tool: step.name,
    sources: sources.slice(0, MAX_LISTED_SOURCES),
    omitted: Math.max(0, sources.length - MAX_LISTED_SOURCES),
  };
}

/** How much of one hosted-tool result the grounding corpus keeps. */
export const MAX_SERVER_TOOL_EVIDENCE_CHARS = 12_000;

/** The text of a fetched document, when the result carries it as text. */
function fetchedText(raw: unknown): string | undefined {
  const r = raw as any;
  const source = r?.content?.source ?? r?.document?.source;
  return source?.type === 'text' ? asString(source.data) : undefined;
}

/**
 * What a hosted web step contributes to the grounding corpus.
 *
 * The answer is verified against the evidence the turn gathered
 * (answer-grounding.ts). A search or fetch Anthropic ran was never part of that
 * corpus, so a citation AnA took from a web result could not be credited. The
 * corpus gets each source's title and URL, and a fetched document's text up to
 * {@link MAX_SERVER_TOOL_EVIDENCE_CHARS}. A failed step contributes nothing: no
 * result was seen, so nothing can be grounded in it.
 */
export function serverToolEvidence(step: GatewayServerToolUse): string | null {
  if (step.isError) return null;
  const lines = extractSources(step.result).map(
    s => `[${step.name}] ${[s.title, s.url].filter(Boolean).join(' — ')}`,
  );
  const text = fetchedText(step.result);
  if (text) lines.push(text);
  if (lines.length === 0) return null;
  const evidence = lines.join('\n');
  return evidence.length > MAX_SERVER_TOOL_EVIDENCE_CHARS
    ? evidence.slice(0, MAX_SERVER_TOOL_EVIDENCE_CHARS)
    : evidence;
}
