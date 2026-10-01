/**
 * Periodic review records — what the compliance reports surface reads and
 * sends for "Record review" (P1-25 audit-trail review, P1-43 access review;
 * ADR-0014 §8). Pure, so the component stays a renderer.
 *
 * The contract is GET /api/audit/reviews (the latest signed review of each kind,
 * whether it is overdue, and whether this session may sign one),
 * POST /api/audit/reviews (a draft) and POST /api/audit/reviews/:id/sign (the
 * signature, through the platform's ceremony). The server decides overdue,
 * completeness and the content hash; this file states what it answered.
 *
 * Decision lines for an access review come from the user access review run on
 * this screen: its privileged accounts are the lines the review decides on, and
 * the review names that sealed run (its export id and data hash) as its scope.
 * An audit trail review names the integrity attestation run on this screen the
 * same way. The server checks the run is this organisation's, and refuses a
 * period that leaves days unreviewed after the last signed review of its kind,
 * so a new review starts the day after that one ended (periodFor).
 */
import { REVIEW_SOURCE_REPORT, type ReviewKind } from '@shared/constants/compliance-review';
import type { ApiResult } from '../apiCall';
import { apiErrorText } from '../apiCall';
import { isRecord, str } from './complianceReportData';
import { defaultPeriod, type RunResult } from './complianceReportsModel';

export const REVIEWS_PATH = '/api/audit/reviews';
export type { ReviewKind };
export const REVIEW_KINDS: readonly ReviewKind[] = ['access', 'audit_trail'];
export const KIND_LABEL: Readonly<Record<ReviewKind, string>> = { access: 'User access review', audit_trail: 'Audit trail review' };

export interface LatestReview {
  id: number;
  periodStart: string;
  periodEnd: string;
  signedAt: string;
  reviewerName: string | null;
  nextDue: string;
}
export interface KindStatus {
  state: 'none' | 'current' | 'overdue';
  latest: LatestReview | null;
}
export interface ReviewsState {
  canSign: boolean;
  status: Record<ReviewKind, KindStatus>;
}

function toLatest(raw: unknown): LatestReview | null {
  if (!isRecord(raw)) return null;
  const id = Number(raw.id);
  const fields = [raw.periodStart, raw.periodEnd, raw.signedAt, raw.nextDue];
  if (!Number.isInteger(id) || id <= 0 || !fields.every((f) => typeof f === 'string' && f)) return null;
  return {
    id,
    periodStart: String(raw.periodStart),
    periodEnd: String(raw.periodEnd),
    signedAt: String(raw.signedAt),
    reviewerName: str(raw.reviewerName) ?? null,
    nextDue: String(raw.nextDue),
  };
}

function toStatus(raw: unknown): KindStatus | null {
  if (!isRecord(raw)) return null;
  if (raw.state === 'none') return raw.latest == null ? { state: 'none', latest: null } : null;
  if (raw.state !== 'current' && raw.state !== 'overdue') return null;
  const latest = toLatest(raw.latest);
  return latest ? { state: raw.state, latest } : null;
}

/** The review status as the server stated it, or null when the body is not that. */
export function parseReviews(body: unknown): ReviewsState | null {
  if (!isRecord(body) || typeof body.canSign !== 'boolean' || !isRecord(body.status)) return null;
  const access = toStatus(body.status.access);
  const auditTrail = toStatus(body.status.audit_trail);
  if (!access || !auditTrail) return null;
  return { canSign: body.canSign, status: { access, audit_trail: auditTrail } };
}

const day = (iso: string) => iso.slice(0, 10);

/** One calm sentence for a kind's status. Dates are the server's; none is ever supplied here. */
export function statusLine(kind: ReviewKind, s: KindStatus): string {
  const label = KIND_LABEL[kind];
  if (!s.latest) return `${kind === 'access' ? 'No access review' : 'No audit trail review'} recorded.`;
  const by = s.latest.reviewerName ? ` by ${s.latest.reviewerName}` : '';
  const covered = `for ${s.latest.periodStart} to ${s.latest.periodEnd}`;
  if (s.state === 'overdue') {
    return `${label}: overdue. The last one was signed ${day(s.latest.signedAt)}${by}, ${covered}; the next was due by ${s.latest.nextDue}.`;
  }
  return `${label}: signed ${day(s.latest.signedAt)}${by}, ${covered}. Next due by ${s.latest.nextDue}.`;
}

/* ── The form ──────────────────────────────────────────────────────────── */

export type Decision = 'keep' | 'reduce' | 'remove';
export interface DecisionLine {
  userId: number;
  account: string;
  role: string;
  decision: Decision | '';
  reducedTo: string;
  changeReference: string;
}
export interface FindingLine {
  finding: string;
  action: string;
}
export interface ReviewForm {
  kind: ReviewKind;
  periodStart: string;
  periodEnd: string;
  description: string;
  outcome: string;
  lines: DecisionLine[];
  findings: FindingLine[];
}

/** The run on this screen that a review of `kind` reads, when one has been run. */
export function sourceRun(kind: ReviewKind, result: RunResult | null): RunResult | null {
  // The report each kind of review reads, and whose sealed run it names as its scope.
  return result && result.report.id === REVIEW_SOURCE_REPORT[kind] && result.data.kind === 'sections' ? result : null;
}

/** One line per privileged account on the user access review run here, or null when it has not been run. */
export function linesFromAccessRun(result: RunResult | null): DecisionLine[] | null {
  const run = sourceRun('access', result);
  if (!run || run.data.kind !== 'sections') return null;
  const privileged = run.data.sections.find((s) => s.key === 'privileged');
  if (!privileged) return null;
  return privileged.rows
    .filter((r) => Number.isInteger(Number(r.user_id)) && Number(r.user_id) > 0)
    .map((r) => ({
      userId: Number(r.user_id),
      account: [r.name, r.email].filter((v) => typeof v === 'string' && v).join(', ') || `User ${String(r.user_id)}`,
      role: String(r.org_role ?? r.platform_roles ?? ''),
      decision: '',
      reducedTo: '',
      changeReference: '',
    }));
}

const DAY_MS = 86_400_000;
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00.000Z`) + DAY_MS).toISOString().slice(0, 10);

/**
 * The period a new review of `kind` starts with: from the day after the last
 * signed review of that kind ended, so no days go unreviewed, or the last
 * ninety days when there is none; to today. Dates are UTC.
 */
export function periodFor(kind: ReviewKind, status: Record<ReviewKind, KindStatus>, now: Date = new Date()): { from: string; to: string } {
  const base = defaultPeriod(now);
  const latest = status[kind].latest;
  return latest ? { from: nextDay(latest.periodEnd), to: base.to } : base;
}

const RUN_FIRST: Readonly<Record<ReviewKind, string>> = {
  access: 'Run the user access review first. Its privileged accounts are the lines this review decides on.',
  audit_trail: 'Run the audit trail integrity attestation on this screen first. The review names that run.',
};

/** What is missing before the form can be signed, in one sentence, or null. `run` is the report run the review names. */
export function formProblem(f: ReviewForm, run: RunResult | null): string | null {
  if (!f.periodStart || !f.periodEnd) return 'Enter the period the review covers.';
  if (f.periodEnd < f.periodStart) return 'The period ends before it starts.';
  if (!f.description.trim()) return 'Say what the review covered.';
  if (!f.outcome.trim()) return 'Record the outcome of the review.';
  if (!run) return RUN_FIRST[f.kind];
  if (f.kind === 'access') {
    if (f.lines.length === 0) return RUN_FIRST.access;
    if (f.lines.some((l) => !l.decision)) return 'Choose keep, reduce or remove for every account.';
    if (f.lines.some((l) => l.decision === 'reduce' && !l.reducedTo.trim())) return 'Name the role each reduced account keeps.';
    if (f.lines.some((l) => l.decision !== 'keep' && !l.changeReference.trim())) {
      return 'Name the change that carried out each reduce or remove.';
    }
  } else if (f.findings.some((x) => !x.finding.trim() || !x.action.trim())) {
    return 'Each finding needs what was found and what was done.';
  }
  return null;
}

/** The draft as the server takes it. `run` is the sealed report run the review read, when there is one. */
export function draftBody(f: ReviewForm, run: RunResult | null): Record<string, unknown> {
  const exportId = run ? str(run.exp.manifest.exportId) : null;
  const dataHash = run ? str(run.exp.manifest.dataHash) : null;
  const scope: Record<string, unknown> = { description: f.description.trim() };
  if (exportId) scope.reportExportId = exportId;
  if (dataHash && /^[0-9a-f]{64}$/.test(dataHash)) scope.reportDataHash = dataHash;
  const decisions =
    f.kind === 'access'
      ? f.lines.map((l) => ({
          userId: l.userId,
          role: l.role || 'member',
          decision: l.decision,
          ...(l.decision === 'reduce' ? { reducedTo: l.reducedTo.trim() } : {}),
          ...(l.decision !== 'keep' ? { changeReference: l.changeReference.trim() } : {}),
        }))
      : f.findings.map((x) => ({ finding: x.finding.trim(), action: x.action.trim() }));
  return { kind: f.kind, periodStart: f.periodStart, periodEnd: f.periodEnd, scope, outcome: f.outcome.trim(), decisions };
}

/** The server's refusal as a sentence that says nothing was signed. */
export function refusalText(r: ApiResult, fallback: string): string {
  const text = apiErrorText(r, fallback).trim();
  return /Nothing was (signed|recorded)\.$/.test(text) ? text : `${text.replace(/\.?$/, '.')} Nothing was signed.`;
}
