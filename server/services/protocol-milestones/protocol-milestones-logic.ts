/**
 * Protocol Milestones / Timeline deterministic logic (Capability C2C-20b)
 *
 * Pure, DB-free, LLM-free: bucket milestones by urgency (mirrors the grants
 * deadline-urgency pattern) and summarize the timeline (counts + chronological
 * ordering + the next upcoming milestone). `today` is injected for testability.
 *
 * @module server/services/protocol-milestones/protocol-milestones-logic
 */

/** ISO (YYYY-MM-DD) → epoch days, or null. Pure, timezone-free. */
function toDays(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000) : null;
}

export type MilestoneBucket = 'overdue' | 'due_30' | 'due_90' | 'upcoming' | 'undated' | 'done';

export interface MilestoneView {
  id?: number;
  name?: string;
  milestoneType?: string;
  targetDate?: string | null;
  status?: string;
}

/** Bucket one milestone. Terminal statuses (met/cancelled) → 'done'. Pure. */
export function milestoneBucket(m: MilestoneView, today: string): MilestoneBucket {
  if (m.status === 'met' || m.status === 'cancelled') return 'done';
  const due = toDays(m.targetDate);
  const now = toDays(today);
  if (due == null || now == null) return 'undated';
  if (due < now) return 'overdue';
  const days = due - now;
  if (days <= 30) return 'due_30';
  if (days <= 90) return 'due_90';
  return 'upcoming';
}

export interface TimelineSummary {
  total: number;
  counts: Record<MilestoneBucket, number>;
  /** Milestones ordered by target date (undated last), each with its bucket + days remaining. */
  ordered: Array<MilestoneView & { bucket: MilestoneBucket; daysRemaining: number | null }>;
  /** The soonest non-terminal, dated milestone, if any. */
  next: (MilestoneView & { daysRemaining: number | null }) | null;
}

/** Summarize a protocol's milestone timeline. Pure. */
export function summarizeTimeline(milestones: MilestoneView[], today: string): TimelineSummary {
  const counts: Record<MilestoneBucket, number> = { overdue: 0, due_30: 0, due_90: 0, upcoming: 0, undated: 0, done: 0 };
  const now = toDays(today);
  const ordered = milestones
    .map((m) => {
      const bucket = milestoneBucket(m, today);
      const due = toDays(m.targetDate);
      counts[bucket] += 1;
      return { ...m, bucket, daysRemaining: due != null && now != null ? due - now : null };
    })
    .sort((a, b) => {
      const da = toDays(a.targetDate ?? null);
      const db = toDays(b.targetDate ?? null);
      if (da == null && db == null) return 0;
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db;
    });

  const next = ordered.find((m) => m.bucket !== 'done' && m.daysRemaining != null && m.daysRemaining >= 0) ?? null;
  return { total: milestones.length, counts, ordered, next: next ? { ...next } : null };
}
