/**
 * AnA tool-trace memory.
 *
 * A structured record of the tools AnA ran during a turn and what they returned,
 * so the work persists across turns. The trace is:
 *   - stored hidden in the assistant message's metadata (never in the visible
 *     answer);
 *   - surfaced live to the client via step/plan events, and reconstructable for
 *     past turns from the stored metadata;
 *   - summarized back into AnA's context on the next turn so she remembers what
 *     she already did (and does not redundantly repeat it).
 *
 * This module is the pure core: building trace entries, summarizing a tool
 * result to one line, collecting traces from prior history, and formatting the
 * continuity note. The DB persistence and route wiring live elsewhere.
 */

import type { HumanControlEvent } from './run-control-registry.js';

export interface ToolTraceEntry {
  tool: string;
  /** Human-readable step label (from describeToolPlan). */
  label: string;
  status: 'success' | 'error' | 'not_found';
  /** One-line summary of the tool's result. */
  resultSummary: string;
}

function truncate(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

/**
 * Summarize a tool result (JSON string) to a single informative line. Pulls out
 * the common shapes (errors, match counts, structure counts, diff summaries,
 * result arrays); falls back to truncated text.
 */
export function summarizeToolResult(content: string, max = 180): string {
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    return truncate(content, max);
  }
  if (!parsed || typeof parsed !== 'object') return truncate(String(parsed), max);

  if (parsed.error) return truncate(`error: ${parsed.error}`, max);
  if (parsed.note && Object.keys(parsed).length <= 2) return truncate(String(parsed.note), max);

  const bits: string[] = [];
  if (typeof parsed.totalMatches === 'number') {
    bits.push(`${parsed.totalMatches} match${parsed.totalMatches === 1 ? '' : 'es'}`);
  }
  if (parsed.counts && typeof parsed.counts === 'object') {
    const c = parsed.counts;
    if (typeof c.sections === 'number') bits.push(`${c.sections} sections`);
    if (typeof c.headings === 'number') bits.push(`${c.headings} headings`);
  }
  if (parsed.summary && typeof parsed.summary === 'object') {
    const s = parsed.summary;
    const parts = ['added', 'removed', 'modified']
      .filter(k => typeof s[k] === 'number' && s[k] > 0)
      .map(k => `${s[k]} ${k}`);
    if (parts.length) bits.push(parts.join(', '));
  }
  if (Array.isArray(parsed.results)) {
    bits.push(`${parsed.results.length} result${parsed.results.length === 1 ? '' : 's'}`);
  }
  if (bits.length) return truncate(bits.join('; '), max);
  return truncate(JSON.stringify(parsed), max);
}

/** Build a trace entry from a tool's label, status and raw result. */
export function buildTraceEntry(
  tool: string,
  label: string,
  status: ToolTraceEntry['status'],
  resultContent: string,
): ToolTraceEntry {
  return { tool, label, status, resultSummary: summarizeToolResult(resultContent) };
}

interface HistoryMessage {
  role: string;
  content: string;
  metadata?: unknown;
}

/**
 * Collect tool-trace entries stored on prior assistant messages, most recent
 * last, capped to `maxEntries` to bound context size.
 */
export function collectTracesFromHistory(history: HistoryMessage[], maxEntries = 12): ToolTraceEntry[] {
  const entries: ToolTraceEntry[] = [];
  for (const msg of history) {
    const meta = msg.metadata as { toolTrace?: unknown } | null | undefined;
    const trace = meta && Array.isArray(meta.toolTrace) ? meta.toolTrace : null;
    if (!trace) continue;
    for (const e of trace) {
      if (e && typeof e === 'object' && typeof (e as any).label === 'string') {
        entries.push({
          tool: String((e as any).tool ?? ''),
          label: String((e as any).label),
          status: ((e as any).status ?? 'success') as ToolTraceEntry['status'],
          resultSummary: String((e as any).resultSummary ?? ''),
        });
      }
    }
  }
  return entries.length > maxEntries ? entries.slice(entries.length - maxEntries) : entries;
}

/**
 * Format collected traces into a compact continuity note injected into AnA's
 * context next turn. Returns '' when there is nothing to carry forward.
 *
 * Successful and unsuccessful attempts are reported separately and given
 * different guidance: reuse the findings of tools that succeeded (do not repeat
 * them), but treat a failed or empty attempt as unfinished — do not loop on the
 * same call, yet do not assume it covered the ground either. Lumping the two
 * together let a failed search read as "already done", leaving a real evidence
 * gap silently unfilled.
 */
export function formatTraceForContext(entries: ToolTraceEntry[]): string {
  if (entries.length === 0) return '';
  const succeeded = entries.filter(e => e.status === 'success');
  const failed = entries.filter(e => e.status !== 'success');
  const sections: string[] = [];

  if (succeeded.length > 0) {
    sections.push(
      'Tools you have already run earlier in this conversation (reuse these ' +
        'findings; do not repeat them needlessly):\n' +
        succeeded.map(e => `- ${e.label}: ${e.resultSummary}`).join('\n')
    );
  }

  if (failed.length > 0) {
    sections.push(
      'Tool attempts that did not return a usable result (do not loop on the ' +
        'same call; retry only with a changed approach, or proceed and state ' +
        'plainly what could not be retrieved — do not treat these as covered):\n' +
        failed.map(e => `- ${e.label} [${e.status}]: ${e.resultSummary}`).join('\n')
    );
  }

  return sections.join('\n\n');
}

/** Grounding verdict as persisted on the assistant message metadata. */
export interface GroundingSummary {
  checked: number;
  grounded: number;
  unsupported: Array<{ kind: string; text: string }>;
}

/** Hidden metadata stored on an assistant message: durable turn-quality record. */
export interface AssistantMessageMetadata {
  toolTrace?: ToolTraceEntry[];
  grounding?: GroundingSummary;
  /**
   * AnA's extended-thinking / reasoning for the turn. Streamed live to the
   * client as `thinking` events and persisted here so the thought process
   * survives reload and becomes part of the auditable turn record (it is
   * otherwise live-only and lost). Rendered by the client's "Reasoning"
   * collapsible on rehydration.
   */
  reasoning?: string;
  /**
   * Human control actions taken against this turn's in-flight run (pause /
   * resume / interject / cancel). Persisted so a mid-run redirection is part of
   * the auditable decision lineage and shows in the document dossier.
   */
  humanControls?: HumanControlEvent[];
}

/** Cap on persisted reasoning so a pathological turn can't bloat a message row. */
const MAX_PERSISTED_REASONING_CHARS = 24_000;

/**
 * Build the assistant message's hidden metadata from the turn's tool-trace,
 * grounding verdict, and reasoning. Returns undefined when there is nothing
 * worth storing, so callers persist `null` rather than an empty object. The
 * grounding verdict is only stored when claims were actually checked
 * (`checked > 0`); reasoning is stored only when non-empty and is capped.
 */
export function buildAssistantMetadata(
  toolTrace: ToolTraceEntry[],
  grounding: GroundingSummary | null,
  reasoning?: string | null,
  humanControls?: HumanControlEvent[] | null,
): AssistantMessageMetadata | undefined {
  const meta: AssistantMessageMetadata = {};
  if (toolTrace.length > 0) meta.toolTrace = toolTrace;
  if (grounding && grounding.checked > 0) {
    meta.grounding = {
      checked: grounding.checked,
      grounded: grounding.grounded,
      unsupported: grounding.unsupported,
    };
  }
  const trimmedReasoning = typeof reasoning === 'string' ? reasoning.trim() : '';
  if (trimmedReasoning) {
    meta.reasoning =
      trimmedReasoning.length > MAX_PERSISTED_REASONING_CHARS
        ? `${trimmedReasoning.slice(0, MAX_PERSISTED_REASONING_CHARS)}…`
        : trimmedReasoning;
  }
  if (humanControls && humanControls.length > 0) meta.humanControls = humanControls;
  return Object.keys(meta).length > 0 ? meta : undefined;
}
