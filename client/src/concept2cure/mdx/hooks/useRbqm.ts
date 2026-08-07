/**
 * useRbqm — read-only RBQM (risk-based quality monitoring) for the MDX
 * Clinical studies workstream.
 *
 * The RBQM compute engine (`server/routes/mdx-rbm.ts`, `mdx-rbm-board.ts`)
 * is owned and actively evolved elsewhere; this hook only *consumes* its
 * read endpoints so monitoring flows into the MDX device shell alongside
 * the clinical-study conduct record, without duplicating the engine.
 *
 * Everything here keys off the **project** — `program_id`, a
 * `regulatory_programs.id` UUID, which the codebase treats as the
 * canonical project id space that clinical studies, CMC, labeling and
 * RBM all hang off. That is the same `program.id` the MDX shell already
 * carries as context, so a study, its protocol and its monitoring share
 * one key.
 *
 *   GET /api/mdx/rbm-summary/:programId    → count roll-ups per domain
 *   GET /api/mdx/rbm-attention/:programId  → ranked attention feed
 *
 * Both are `DataState`s: with no project selected the state is `idle`
 * (no request is issued), and a project with no RBM data reads its
 * honest zeros rather than a fabricated risk posture.
 */

import { useFetchJson } from './useFetchJson';
import { firstArray } from '../lib/payloadShape';
import { toDataState, type DataState } from '../lib/dataState';

/* ─── rbm-summary shape (mdx-rbm.ts:1291, `{ data }` envelope) ────── */

export interface RbqmCountBlock {
  total: number;
  [k: string]: number;
}

export interface RbqmSummary {
  /** Server-derived overall posture label, or null when not computed. */
  overallRisk: string | null;
  riskItems: { total: number; critical: number; open: number; high: number };
  kris: { total: number; red: number; amber: number };
  qtls: { total: number; breached: number; approaching: number };
  signals: { total: number; open: number; high: number };
  sites: { total: number; enhanced: number };
}

interface SummaryPayload {
  data: RbqmSummary;
}

/* ─── rbm-attention shape (mdx-rbm.ts:1367, `{ data, meta }`) ─────── */

export interface AttentionItem {
  severity: string;
  kind: string;
  label: string;
  detail?: string;
}

interface AttentionPayload {
  data: AttentionItem[];
  meta?: { count?: number };
}

/**
 * Severity rank for the attention feed. The feed tolerates two
 * vocabularies (critical/high/… and err/warn/…); an unrecognised token
 * sorts to the middle rather than the top, so an unknown label never
 * masquerades as the most urgent item.
 */
const SEV_RANK: Record<string, number> = {
  critical: 0,
  err: 0,
  error: 0,
  high: 1,
  warn: 1,
  warning: 1,
  medium: 2,
  moderate: 2,
  low: 3,
  info: 4,
};

export function attentionRank(severity: string): number {
  return SEV_RANK[String(severity).toLowerCase()] ?? 2;
}

/** Stable most-urgent-first ordering, without mutating the input. */
export function orderAttention(items: AttentionItem[]): AttentionItem[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => attentionRank(a.item.severity) - attentionRank(b.item.severity) || a.i - b.i)
    .map(({ item }) => item);
}

export interface UseRbqmResult {
  summary: DataState<RbqmSummary>;
  attention: DataState<AttentionItem[]>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * @param programId The project's `regulatory_programs.id` (UUID), or null
 *                  when no project is in context — RBM is project-scoped,
 *                  so without one there is nothing to fetch.
 */
export function useRbqm(programId: string | null): UseRbqmResult {
  const base = programId ? `/${encodeURIComponent(programId)}` : null;
  const summaryUrl = base ? `/api/mdx/rbm-summary${base}` : null;
  const attentionUrl = base ? `/api/mdx/rbm-attention${base}` : null;

  const s = useFetchJson<SummaryPayload>(summaryUrl);
  const a = useFetchJson<AttentionPayload>(attentionUrl);

  const idleReason = 'Select a project or a study to see its risk-based monitoring.';

  // orderAttention sorts, so a non-array payload throws here the same way a
  // `.map` would. Same guard, same reason.
  const attentionRowsRaw = firstArray<AttentionItem>(a.data?.data);
  const attentionRows = attentionRowsRaw ? orderAttention(attentionRowsRaw) : null;

  return {
    summary: toDataState(s.data?.data ?? null, s.loading, s.error, { idleReason }),
    attention: toDataState(attentionRows, a.loading, a.error, { idleReason }),
    loading: s.loading || a.loading,
    error: s.error ?? a.error,
    refresh: () => {
      s.refresh();
      a.refresh();
    },
  };
}
