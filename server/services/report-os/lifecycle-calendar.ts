/** Recorded lifecycle dates, on the current actor's admitted program scope.
 * This reader neither generates occurrences nor assesses legal applicability. */
import { getCurrentAccessibleProgramScope, requireProgramScopeStillCurrent, type ProgramAccessExecutor } from '../c2c/current-program-access';
import { obligationUrgency, summarizeCalendar } from '../lifecycle-obligations/lifecycle-logic';
import type { DomainReportResult } from './research-compliance-report-providers';

export const LIFECYCLE_CALENDAR_TYPE = 'lifecycle.obligation_calendar';
export const LIFECYCLE_CALENDAR_LIMIT = 'Legal applicability, completeness and regulatory currency are not assessed by recorded lifecycle dates. No agency acknowledgement is inferred.';
export interface ReportRecordContext { executor: ProgramAccessExecutor; userId: number | undefined }
export class LifecycleCalendarUnavailable extends Error {
  constructor(message: string) { super(message); this.name = 'LifecycleCalendarUnavailable'; }
}
export interface CalendarObligation {
  id: number; product_id: number | null; product_name: string | null; submission_id: number | null;
  project_id: number | null; region: string; obligation_type: string; classification: string | null;
  title: string; status: string; due_date: string | null; submitted_date: string | null; recurrence_months: number | null;
}
export interface CalendarEvent {
  id: number; obligation_id: number; title: string; project_id: number | null;
  period_start: string | null; period_end: string | null; due_date: string | null; status: string; submitted_date: string | null;
}
export interface LifecycleCalendarSnapshot {
  observed_at: string | Date; obligation_count: number; event_count: number;
  obligations: CalendarObligation[]; events: CalendarEvent[];
}
export interface LifecycleCalendar {
  schemaVersion: 1; observedAt: string;
  obligations: Array<CalendarObligation & { urgency: string }>;
  events: Array<CalendarEvent & { urgency: string }>;
  obligationSummary: ReturnType<typeof summarizeCalendar>; eventSummary: ReturnType<typeof summarizeCalendar>;
  gaps: Array<{ title: string; message: string; severity: 'critical' | 'high' }>;
  limits: string[];
}

/** Both sources and observation time share one MVCC statement. The admitted
 * program allowlist is canonical, current and verified on this same executor.
 * A foreign/deleted/unresolved parent cannot contribute rows or provenance. */
export const LIFECYCLE_CALENDAR_SQL = `
WITH visible_obligations AS (
  SELECT o.id, o.product_id, p.product_name, o.submission_id, a.id AS project_id,
    o.region, o.obligation_type, o.classification, o.title, o.status, o.due_date, o.submitted_date, o.recurrence_months
  FROM lifecycle_obligations o
  LEFT JOIN rim_products p ON p.id=o.product_id AND p.organization_id=o.organization_id AND p.deleted_at IS NULL
  LEFT JOIN submissions s ON s.id=o.submission_id AND s.organization_id=o.organization_id AND s.deleted_at IS NULL
  LEFT JOIN regulatory_programs r ON r.id=s.program_id AND r.organization_id=o.organization_id AND r.deleted_at IS NULL
  LEFT JOIN projects a ON a.regulatory_program_id=r.id AND a.organization_id=o.organization_id AND a.status IS DISTINCT FROM 'deleted'
  WHERE o.organization_id=$1 AND o.deleted_at IS NULL
    AND (o.product_id IS NULL OR p.id IS NOT NULL)
    AND (o.submission_id IS NULL OR (s.id IS NOT NULL AND r.id::text=ANY($2::text[]) AND a.id IS NOT NULL))
), visible_events AS (
  SELECT e.id, e.obligation_id, o.title, o.project_id, e.period_start, e.period_end, e.due_date, e.status, e.submitted_date
  FROM lifecycle_obligation_events e JOIN visible_obligations o ON o.id=e.obligation_id
  WHERE e.organization_id=$1 AND e.deleted_at IS NULL
), bounded_obligations AS (SELECT * FROM visible_obligations ORDER BY due_date NULLS LAST,id LIMIT 501),
 bounded_events AS (SELECT * FROM visible_events ORDER BY due_date NULLS LAST,id LIMIT 501)
SELECT CURRENT_TIMESTAMP AS observed_at,
  (SELECT count(*)::int FROM bounded_obligations) AS obligation_count,
  (SELECT count(*)::int FROM bounded_events) AS event_count,
  COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.due_date NULLS LAST,o.id) FROM bounded_obligations o),'[]'::jsonb) AS obligations,
  COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.due_date NULLS LAST,e.id) FROM bounded_events e),'[]'::jsonb) AS events`;

export function calculateLifecycleCalendar(snapshot: LifecycleCalendarSnapshot): LifecycleCalendar {
  if (snapshot.obligation_count > 500 || snapshot.event_count > 500) throw new LifecycleCalendarUnavailable('The admitted lifecycle source exceeds 500 rows. No truncated calendar was generated; narrow the source before reporting.');
  const observedAt = new Date(snapshot.observed_at).toISOString();
  const today = observedAt.slice(0, 10);
  const terminal = new Set(['approved', 'submitted', 'closed']);
  const deadline = (row: { due_date: string | null; status: string }) => ({ dueDate: row.due_date, terminal: terminal.has(row.status) });
  const obligations = snapshot.obligations.map(row => ({ ...row, urgency: obligationUrgency(deadline(row), today) }));
  const events = snapshot.events.map(row => ({ ...row, urgency: obligationUrgency(deadline(row), today) }));
  const gaps: LifecycleCalendar['gaps'] = [{ title: 'Lifecycle legal assessment unavailable', message: LIFECYCLE_CALENDAR_LIMIT, severity: 'critical' }];
  for (const [kind, rows] of [['Obligation', obligations], ['Occurrence', events]] as const) {
    for (const row of rows) if (row.urgency === 'undated') gaps.push({ title: `${kind} ${row.id}: due date unknown`, message: 'No usable due date is recorded; no deadline is inferred.', severity: 'high' });
  }
  if (!obligations.length) gaps.push({ title: 'No admitted obligation records', message: 'This is not evidence that no obligations exist or apply.', severity: 'high' });
  return { schemaVersion: 1, observedAt, obligations, events,
    obligationSummary: summarizeCalendar(obligations.map(deadline), today), eventSummary: summarizeCalendar(events.map(deadline), today), gaps,
    limits: [LIFECYCLE_CALENDAR_LIMIT,
      'The collection includes organization-owned unlinked obligations and submission-linked obligations in the current actor\'s admitted projects. A selected project is context, not an organization-completeness claim.',
      'Only persisted occurrences are shown. Parent obligations and occurrences are counted separately; no new deadline or recurrence is generated.',
      'Date standing compares the recorded due date with the database observation date. Submitted and approved are stored statuses, not agency acknowledgements.',
      'Sources above 500 admitted rows per table are refused rather than silently truncated.'],
  };
}

export async function computeLifecycleCalendarReport(organizationId: number, context?: ReportRecordContext): Promise<DomainReportResult> {
  if (!context?.executor || !Number.isSafeInteger(context.userId) || !context.userId) throw new LifecycleCalendarUnavailable('Current actor and database context are required for a lifecycle calendar.');
  const q = context.executor;
  const identity = { organizationId, userId: context.userId };
  const scope = await getCurrentAccessibleProgramScope(q, identity);
  const response = await q.query(LIFECYCLE_CALENDAR_SQL, [organizationId, scope.programIds]);
  const snapshot = response.rows[0] as unknown as LifecycleCalendarSnapshot | undefined;
  if (!snapshot || !Array.isArray(snapshot.obligations) || !Array.isArray(snapshot.events) || !Number.isSafeInteger(snapshot.obligation_count) || !Number.isSafeInteger(snapshot.event_count)) throw new Error('The lifecycle calendar snapshot could not be read.');
  const calendar = calculateLifecycleCalendar(snapshot);
  await requireProgramScopeStillCurrent(q, identity, scope);
  const accessProjectIds = [...new Set(calendar.obligations.flatMap(row => row.project_id == null ? [] : [row.project_id]))];
  const byStatus: Record<string, number> = {};
  for (const row of calendar.obligations) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
  return { computedScope: 'organization', accessProjectIds, criticalBlockers: [LIFECYCLE_CALENDAR_LIMIT],
    summary: { obligations: calendar.obligations.length, byStatus, overdue: calendar.obligationSummary.overdue, lifecycleCalendar: calendar },
    provider: { provider: 'lifecycle_obligation_calendar', observedAt: calendar.observedAt, status: calendar.obligations.length ? 'partial' : 'missing', blocker: LIFECYCLE_CALENDAR_LIMIT,
      atoms: [...calendar.obligations.map(row => ({ sourceTable: 'lifecycle_obligations', recordId: row.id, transformation: 'direct_copy' as const })), ...calendar.events.map(row => ({ sourceTable: 'lifecycle_obligation_events', recordId: row.id, transformation: 'direct_copy' as const }))],
      calculation: { method: 'Canonical obligationUrgency and summarizeCalendar over recorded admitted rows', snapshot: 'single-statement', asOfDate: calendar.observedAt.slice(0, 10), computedScope: 'organization' } },
    provenance: { organizationId, observedAt: calendar.observedAt, computedScope: 'organization', queries: [{ query: LIFECYCLE_CALENDAR_SQL, parameters: [organizationId, { redacted: true, reason: 'The current actor program allowlist may include unrelated private programs. Only contributing source records are retained.' }], rows: response.rows }] },
  };
}
