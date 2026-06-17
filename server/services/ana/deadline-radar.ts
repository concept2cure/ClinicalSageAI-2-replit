/**
 * Regulatory Deadline Radar — backing service for the AnA `regulatory_deadline_radar` tool.
 *
 * Aggregates an organization's regulatory obligations/commitments (the
 * `regulatory_obligations` table) into a prioritized "what's overdue / due soon /
 * upcoming" view so AnA can proactively surface time-critical regulatory work.
 *
 * The date-bucketing (`bucketObligations`) is a pure function so it can be unit
 * tested without a database; `getDeadlineRadar` is the thin DB-scoped wrapper.
 * Deterministic — no LLM, no fabrication.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import { regulatoryObligations } from '../../../shared/schema';

/** Terminal statuses that are not "open" work and are excluded by default. */
const TERMINAL_STATUSES = new Set(['completed', 'cancelled']);

export interface ObligationLike {
  id: number;
  title: string | null;
  agency: string | null;
  obligationType: string | null;
  category: string | null;
  regulatoryPathway: string | null;
  priority: string | null;
  status: string | null;
  dueDate: Date | string | null;
  legalBasis: string | null;
  consequenceOfNonCompliance: string | null;
}

export type DeadlineBucket = 'overdue' | 'due_soon' | 'upcoming';

export interface RadarItem {
  id: number;
  title: string | null;
  agency: string | null;
  obligationType: string | null;
  category: string | null;
  regulatoryPathway: string | null;
  priority: string | null;
  status: string | null;
  dueDate: string;
  daysUntilDue: number;
  bucket: DeadlineBucket;
  legalBasis: string | null;
  consequenceOfNonCompliance: string | null;
}

export interface RadarResult {
  windowDays: number;
  summary: { overdue: number; due_soon: number; upcoming: number; total: number };
  items: RadarItem[];
}

export interface BucketOptions {
  now?: Date;
  windowDays?: number;
  includeCompleted?: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Pure: bucket dated obligations into overdue / due_soon / upcoming and sort by
 * urgency (most overdue first). Obligations with no due date are omitted (they
 * are not deadlines). Terminal-status items are omitted unless includeCompleted.
 */
export function bucketObligations(rows: ObligationLike[], opts: BucketOptions = {}): RadarResult {
  const now = opts.now ?? new Date();
  const windowDays = opts.windowDays && opts.windowDays > 0 ? opts.windowDays : 30;
  const includeCompleted = opts.includeCompleted === true;

  const items: RadarItem[] = rows
    .filter(r => includeCompleted || !TERMINAL_STATUSES.has((r.status ?? '').toLowerCase()))
    .filter(r => r.dueDate != null)
    .map(r => {
      const due = r.dueDate instanceof Date ? r.dueDate : new Date(r.dueDate as string);
      const daysUntilDue = Math.floor((due.getTime() - now.getTime()) / MS_PER_DAY);
      const bucket: DeadlineBucket =
        daysUntilDue < 0 ? 'overdue' : daysUntilDue <= windowDays ? 'due_soon' : 'upcoming';
      return {
        id: r.id,
        title: r.title,
        agency: r.agency,
        obligationType: r.obligationType,
        category: r.category,
        regulatoryPathway: r.regulatoryPathway,
        priority: r.priority,
        status: r.status,
        dueDate: due.toISOString(),
        daysUntilDue,
        bucket,
        legalBasis: r.legalBasis,
        consequenceOfNonCompliance: r.consequenceOfNonCompliance,
      };
    })
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  const summary = {
    overdue: items.filter(i => i.bucket === 'overdue').length,
    due_soon: items.filter(i => i.bucket === 'due_soon').length,
    upcoming: items.filter(i => i.bucket === 'upcoming').length,
    total: items.length,
  };

  return { windowDays, summary, items };
}

/**
 * DB-scoped: fetch an organization's regulatory obligations and bucket them.
 * Always tenant-scoped by organizationId (and clientWorkspaceId when provided).
 */
export async function getDeadlineRadar(opts: {
  organizationId: number;
  clientWorkspaceId?: number;
  windowDays?: number;
  includeCompleted?: boolean;
}): Promise<RadarResult> {
  const rows = await db
    .select({
      id: regulatoryObligations.id,
      title: regulatoryObligations.title,
      agency: regulatoryObligations.agency,
      obligationType: regulatoryObligations.obligationType,
      category: regulatoryObligations.category,
      regulatoryPathway: regulatoryObligations.regulatoryPathway,
      priority: regulatoryObligations.priority,
      status: regulatoryObligations.status,
      dueDate: regulatoryObligations.dueDate,
      legalBasis: regulatoryObligations.legalBasis,
      consequenceOfNonCompliance: regulatoryObligations.consequenceOfNonCompliance,
    })
    .from(regulatoryObligations)
    .where(
      and(
        eq(regulatoryObligations.organizationId, opts.organizationId),
        opts.clientWorkspaceId
          ? eq(regulatoryObligations.clientWorkspaceId, opts.clientWorkspaceId)
          : undefined
      )
    );

  return bucketObligations(rows as ObligationLike[], {
    windowDays: opts.windowDays,
    includeCompleted: opts.includeCompleted,
  });
}
