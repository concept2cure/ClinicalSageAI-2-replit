/**
 * Audit & compliance reports — the catalog, the period, the run request and
 * its refusals, and what AnA can see. Pure, so the component stays a renderer.
 * What a run RETURNS is read in complianceReportData.ts.
 *
 * The contract is GET /api/audit/reports and GET /api/audit/reports/:id; the
 * full audit trail is the one entry that runs elsewhere (its catalog row names
 * the signed export as `endpoint`).
 *
 * The catalog is read strictly: one malformed entry fails the whole read. A
 * catalog with an entry silently dropped would present a partial list as the
 * complete set of reports a regulator can be given.
 */
import type { ApiResult } from '../apiCall';
import { errorCodeOf, redactInternals, serverMessage } from '@/lib/queryClient';
import { safeFileName } from '../download';
import {
  chainLine, isRecord, isStringList, manifestFacts, storeLines, str,
  type ReportData, type ReportExport, type StatementLine,
} from './complianceReportData';

/* ── Copy that more than one place must say identically ──────────────────── */

const DEFAULT_READERS = 'organisation owners, admins and managers, and platform administrators';
export const NOT_RECORDED_REFUSAL =
  'The report was not produced because it could not be recorded on the audit trail. Nothing was exported.';
export const IN_PROGRESS = 'A report is already running for your organisation. Try again when it finishes.';
export const UNREADABLE_RESULT = 'The report came back in a form this screen cannot read. Nothing is shown.';
/** The one report that checks the audit chain; every other report says it does not. */
export const INTEGRITY_REPORT_ID = 'audit-trail-integrity';

/* ── Shapes ─────────────────────────────────────────────────────────────── */

export type PeriodKind = 'range' | 'as-of';

export interface ReportSummary {
  id: string;
  title: string;
  purpose: string;
  basis: string[];
  period: PeriodKind;
  sections: { key: string; title: string }[];
  notRecorded: string[];
  /** Present only on the full audit trail entry: the signed export it runs. */
  endpoint?: string;
}

export interface Catalog {
  canRun: boolean;
  /** "Available to …" — who may run reports, in the server's words. */
  readersNotice: string;
  reports: ReportSummary[];
}

export interface Period {
  from: string;
  to: string;
}

export interface RunError {
  kind: 'readers' | 'refused' | 'busy' | 'period' | 'not-recorded' | 'other';
  message: string;
}

/* ── The catalog ─────────────────────────────────────────────────────────── */

/** Only a same-origin API path may be called; anything else is not an endpoint. */
const SAFE_ENDPOINT = /^\/api\/[A-Za-z0-9/_-]+$/;

function toSections(raw: unknown): { key: string; title: string }[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw.map((s) => (isRecord(s) && str(s.key) && str(s.title) ? { key: String(s.key), title: String(s.title) } : null));
  return out.every(Boolean) ? (out as { key: string; title: string }[]) : null;
}

/** One catalog entry, or null when any field is not what the contract says. */
function toReport(raw: unknown): ReportSummary | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  const title = str(raw.title);
  const sections = toSections(raw.sections);
  if (!id || !title || typeof raw.purpose !== 'string' || !sections) return null;
  if (raw.period !== 'range' && raw.period !== 'as-of') return null;
  if (!isStringList(raw.basis) || !Array.isArray(raw.notRecorded) || !raw.notRecorded.every((s) => typeof s === 'string')) return null;
  const endpoint = raw.endpoint;
  if (endpoint !== undefined && !(typeof endpoint === 'string' && SAFE_ENDPOINT.test(endpoint))) return null;
  return {
    id, title, purpose: raw.purpose, basis: raw.basis, period: raw.period, sections,
    notRecorded: raw.notRecorded.filter((s) => s.trim()),
    ...(typeof endpoint === 'string' ? { endpoint } : {}),
  };
}

/** The catalog, or null when the body — or any one entry in it — is not the catalog. */
export function parseCatalog(body: unknown): Catalog | null {
  if (!isRecord(body) || !Array.isArray(body.reports) || typeof body.canRun !== 'boolean') return null;
  const reports = body.reports.map(toReport);
  if (!reports.every((r): r is ReportSummary => r !== null)) return null;
  if (new Set(reports.map((r) => r.id)).size !== reports.length) return null;
  const readers = (redactInternals(body.readers, '') || DEFAULT_READERS).trim().replace(/\.$/, '');
  return { canRun: body.canRun, readersNotice: `Available to ${readers}.`, reports };
}

/* ── Periods (UTC dates, inclusive) ──────────────────────────────────────── */

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function utcMs(date: string): number | null {
  if (!DATE.test(date)) return null;
  const ms = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === date ? ms : null;
}

/** To = today (UTC), From = 90 days earlier — the server's own defaults. */
export function defaultPeriod(now: Date = new Date()): Period {
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - 90 * DAY_MS).toISOString().slice(0, 10);
  return { from, to };
}

/** The client-side check before any request; null when the period may be sent. */
export function periodProblem(kind: PeriodKind, period: Period): string | null {
  const to = utcMs(period.to);
  if (to === null) return kind === 'as-of' ? 'Enter the date the report is as of.' : 'Enter an end date.';
  if (kind === 'as-of') return null;
  const from = utcMs(period.from);
  if (from === null) return 'Enter a start date.';
  if (from > to) return 'The start date is after the end date. Choose a start on or before the end.';
  return null;
}

/**
 * What the period means for this report. An as-of report reads membership (or
 * existence) as of the date, but most fields have no recorded history, so they
 * are read as they are now; the sections' notes say which.
 */
export function periodRule(report: ReportSummary): string {
  if (report.period === 'range') return 'Reports the records in a date range.';
  return report.id === 'access-review'
    ? 'Membership is taken as of one date; other fields are shown as they are when the report is run, as each section notes.'
    : 'Records are taken as of one date; other fields are shown as they are when the report is run, as each section notes.';
}

/** For an as-of date before the run, the reminder that status is today's. */
export function pastAsOfNote(report: ReportSummary, period: Period, generatedAt: string | null): string | null {
  if (report.period !== 'as-of') return null;
  const generatedOn = generatedAt && DATE.test(generatedAt.slice(0, 10)) ? generatedAt.slice(0, 10) : defaultPeriod().to;
  if (period.to >= generatedOn) return null;
  return report.id === 'access-review'
    ? 'Status and roles are shown as they are now, not as of this date.'
    : 'Status is shown as it is now, not as of this date.';
}

/* ── Running ─────────────────────────────────────────────────────────────── */

/**
 * The request for one run. The full audit trail goes to its signed export with
 * that route's own parameter names; its end bound is a timestamp compared with
 * `<=`, so the last instant of the day is sent to keep the end date inclusive,
 * as it is for every other report.
 */
export function runUrl(report: ReportSummary, period: Period, format: 'json' | 'csv'): string {
  if (report.endpoint) {
    const q = new URLSearchParams({
      format,
      start_date: `${period.from}T00:00:00.000Z`,
      end_date: `${period.to}T23:59:59.999Z`,
    });
    return `${report.endpoint}?${q.toString()}`;
  }
  const q = new URLSearchParams(
    report.period === 'as-of' ? { to: period.to, format } : { from: period.from, to: period.to, format },
  );
  return `/api/audit/reports/${encodeURIComponent(report.id)}?${q.toString()}`;
}

/** The `export` object of a run, or null when the body does not carry one. */
export function parseExport(body: unknown): ReportExport | null {
  const exp = isRecord(body) ? body.export : null;
  if (!isRecord(exp) || typeof exp.data !== 'string' || !isRecord(exp.manifest)) return null;
  return {
    data: exp.data,
    manifest: exp.manifest,
    signature: typeof exp.signature === 'string' ? exp.signature : '',
    verification: isRecord(exp.verification) ? exp.verification : null,
  };
}

/**
 * A refused or failed run. A 403 is the readers notice only when the audit-read
 * gate refused it; any other 403 says why in the server's words. A 429 is a run
 * already in progress for the organisation, or the per-person rate limit.
 */
export function runErrorOf(result: ApiResult, readersNotice: string): RunError {
  const said = serverMessage(result.body);
  const code = errorCodeOf(result.body);
  if (result.status === 403) {
    return code === 'AUDIT_READ_RESTRICTED'
      ? { kind: 'readers', message: readersNotice }
      : { kind: 'refused', message: said ?? 'You do not have permission to run this report.' };
  }
  if (result.status === 429) {
    return { kind: 'busy', message: code === 'REPORT_IN_PROGRESS' ? IN_PROGRESS : said ?? 'Too many reports were run in a short time. Wait a minute and run it again.' };
  }
  if (result.status === 400) return { kind: 'period', message: said ?? 'The period was not accepted. Check both dates and run again.' };
  if (result.status === 503) return { kind: 'not-recorded', message: said ?? NOT_RECORDED_REFUSAL };
  if (result.networkError) return { kind: 'other', message: 'The request did not reach the server.' };
  return { kind: 'other', message: said ?? 'The server could not produce the report.' };
}

/* ── Files ───────────────────────────────────────────────────────────────── */

/** `<report>-<from>-<to>`; an as-of report has only its date. */
export function fileBase(report: ReportSummary, period: Period): string {
  const span = report.period === 'as-of' ? period.to : `${period.from}-${period.to}`;
  return safeFileName(`${report.id}-${span}`, 'compliance-report');
}

/* ── Screen state, and what AnA can see of it ────────────────────────────── */

export type CatalogState =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'ready'; catalog: Catalog };

export interface RunResult {
  report: ReportSummary;
  period: Period;
  exp: ReportExport;
  data: ReportData;
}

export interface RunView {
  running: boolean;
  error: RunError | null;
  result: RunResult | null;
}

/** The chain statement a result carries, one line per thing it states. */
export function statementOf(result: RunResult): StatementLine[] {
  return result.data.kind === 'sections' ? [chainLine(result.data.chain)] : storeLines(result.exp.manifest);
}

/** Counts and the chain statement only — never row content, which can name people. */
function lastRunFacts(result: RunResult) {
  const { data, exp, report, period } = result;
  return {
    report: report.id,
    period: report.period === 'as-of' ? { asOf: period.to } : period,
    sections: data.kind === 'sections'
      ? data.sections.map((s) => (s.readable ? { title: s.title, rowCount: s.rowCount, truncated: s.truncated } : { title: s.title, unreadable: true }))
      : [{ title: 'Recorded events', rowCount: data.rows.length }],
    chainStatement: statementOf(result).map((l) => l.text),
    exportId: manifestFacts(exp.manifest).exportId,
  };
}

/**
 * A failed catalog read is published as a failure, never as an organisation
 * with no reports; a run the server refused is published with its reason.
 */
export function anaContextOf(st: CatalogState, selected: ReportSummary | null, run: RunView) {
  if (st.state === 'loading') return { summary: 'Audit & compliance reports — the report catalog is still loading.' };
  if (st.state === 'error') {
    return {
      summary: 'Audit & compliance reports — the report catalog could not be read, so no reports are listed. ' +
        'That is a failed read, not an organisation without reports.',
      availableActions: ['Retry the catalog read', 'Verify a saved report'],
    };
  }
  const { catalog } = st;
  return {
    summary: `Audit & compliance reports: ${catalog.reports.length} report(s); this member ` +
      `${catalog.canRun ? 'can run them' : 'can read the list but not run them'}.` +
      (selected ? ` "${selected.title}" is selected.` : '') +
      (run.running ? ' A run is in progress.' : '') +
      (run.error ? ` The last run did not produce a report: ${run.error.message}` : ''),
    facts: {
      reports: catalog.reports.map((r) => ({ id: r.id, title: r.title, period: r.period, basis: r.basis })),
      canRun: catalog.canRun,
      selectedReport: selected?.id ?? null,
      lastRun: run.result ? lastRunFacts(run.result) : null,
    },
    availableActions: catalog.canRun
      ? ['Choose a report and its period', 'Run the report', 'Download the sealed JSON or CSV with its manifest', 'Verify a saved report']
      : ['Read what each report covers and what the platform does not record', 'Verify a saved report'],
  };
}
