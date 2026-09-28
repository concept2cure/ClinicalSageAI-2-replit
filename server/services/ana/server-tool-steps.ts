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

/** How many consulted sources the trace lists before it stops enumerating. */
export const MAX_LISTED_SOURCES = 8;

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/**
 * The trace label for a server-tool step.
 *
 * Written in the same register as AnA's own tool rows ("Searching the document
 * for …"), so a web search reads as one more step she took rather than as an
 * interruption from somewhere else. Falls back to a plain description rather
 * than inventing a query it does not have — a label that named a search term
 * nobody searched for would be a fabricated record.
 */
export function describeServerToolStep(step: GatewayServerToolUse): string {
  const input = step.input ?? {};
  if (step.name === 'web_search') {
    const query = asString((input as any).query);
    return query ? `Searching the web for "${query}"` : 'Searching the web';
  }
  if (step.name === 'web_fetch') {
    const url = asString((input as any).url);
    return url ? `Reading ${url}` : 'Reading a web page';
  }
  return `Running ${step.name}`;
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
