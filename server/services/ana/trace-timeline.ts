/**
 * Trace timeline projection.
 *
 * Turns persisted chat_messages rows into a clean, stable per-turn view of AnA's
 * work: which tools she ran and how her self-verification grounding came out.
 * This is the contract a timeline UI (or an API consumer) reads, so it does not
 * have to reverse-engineer the hidden message-metadata shape produced by the
 * stream loop (tool-trace.ts / answer-grounding.ts).
 *
 * Pure and defensive: it accepts metadata as either a parsed object (node-pg
 * jsonb) or a JSON string, skips non-assistant rows and rows with nothing to
 * show, and never throws on malformed input.
 */

export interface TimelineTool {
  label: string;
  status: string;
  resultSummary: string;
}

export interface TimelineGrounding {
  checked: number;
  grounded: number;
  /** Count of unsupported claims (not the full list — that stays in metadata). */
  unsupported: number;
}

export interface TraceTimelineEntry {
  messageId: string | null;
  at: string | null;
  tools: TimelineTool[];
  grounding: TimelineGrounding | null;
}

export interface TimelineRow {
  id?: string | number;
  role?: string;
  metadata?: unknown;
  created_at?: unknown;
}

function parseMeta(metadata: unknown): { toolTrace?: unknown; grounding?: unknown } | null {
  if (!metadata) return null;
  let m: unknown = metadata;
  if (typeof m === 'string') {
    try {
      m = JSON.parse(m);
    } catch {
      return null;
    }
  }
  return m && typeof m === 'object' ? (m as { toolTrace?: unknown; grounding?: unknown }) : null;
}

function toIso(value: unknown): string | null {
  if (value == null) return null;
  const d = new Date(value as string | number | Date);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Project chat-message rows into the per-assistant-turn trace timeline. Only
 * assistant messages that carry a tool-trace or a grounding verdict appear.
 */
export function buildTraceTimeline(rows: TimelineRow[]): TraceTimelineEntry[] {
  const out: TraceTimelineEntry[] = [];
  for (const row of rows) {
    if (row.role && row.role !== 'assistant') continue;
    const meta = parseMeta(row.metadata);
    if (!meta) continue;

    const trace = Array.isArray(meta.toolTrace) ? meta.toolTrace : [];
    const g =
      meta.grounding && typeof meta.grounding === 'object'
        ? (meta.grounding as { checked?: unknown; grounded?: unknown; unsupported?: unknown })
        : null;
    if (trace.length === 0 && !g) continue;

    out.push({
      messageId: row.id != null ? String(row.id) : null,
      at: toIso(row.created_at),
      tools: trace.map(t => {
        const e = (t ?? {}) as { label?: unknown; status?: unknown; resultSummary?: unknown };
        return {
          label: String(e.label ?? ''),
          status: String(e.status ?? 'success'),
          resultSummary: String(e.resultSummary ?? ''),
        };
      }),
      grounding: g
        ? {
            checked: Number(g.checked ?? 0),
            grounded: Number(g.grounded ?? 0),
            unsupported: Array.isArray(g.unsupported)
              ? g.unsupported.length
              : Number(g.unsupported ?? 0),
          }
        : null,
    });
  }
  return out;
}
