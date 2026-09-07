/**
 * useCerPmsFeeds — the two live post-market feeds behind the CER workbench's
 * PMS/PMCF tab, both of which existed server-side and were consumed by
 * nothing on this tab (ledger L5: "complaint/enrolment feeds have no backend"
 * — they had one; the tab said otherwise):
 *
 *   GET /api/capa-mdr/complaints?program_id=…            the program's complaints
 *   GET /api/post-market/programs/:id/pmcf-enrollment    PMCF activities + summary
 *
 * Every figure the tab shows comes from these rows. Nothing is derived that the
 * rows cannot support: a program with no triaged complaint has no mean time to
 * triage, and says so; a PMCF activity that has never reported enrolment has no
 * ratio. The server's own PMCF summary is used as returned — it is computed
 * over the same array the table renders, so the two cannot disagree.
 */

import { useFetchJson } from './useFetchJson';
import { toDataState, type DataState } from '../lib/dataState';

/** Mirrors shared/schema/capa-mdr COMPLAINT_STATES. */
export type ComplaintTriageState =
  | 'new'
  | 'triaged'
  | 'investigation'
  | 'resolved'
  | 'closed'
  | 'escalated_capa'
  | 'escalated_mdr';

/** The columns of a `complaints` row this tab reads. */
export interface CerComplaint {
  id: string;
  programId: string;
  complaintCode: string;
  source: string;
  channel: string;
  receivedAt: string;
  eventNarrative: string;
  patientHarm: 'none' | 'malfunction' | 'injury' | 'serious_injury' | 'death';
  severityAssessment: 'negligible' | 'minor' | 'serious' | 'critical';
  triageState: ComplaintTriageState;
  triagedAt: string | null;
  closedAt: string | null;
}

interface ComplaintsPayload {
  rows: CerComplaint[];
  count: number;
}

/** Mirrors PmcfEnrollmentRecord (shared/schema/gspr-postmarket). */
export interface CerPmcfActivity {
  id: string;
  activityCode: string;
  activityKind: string;
  title: string;
  status: 'planned' | 'enrolling' | 'follow_up' | 'completed' | 'terminated';
  primaryEndpoint: string | null;
  sitesCount: number | null;
  targetEnrollment: number | null;
  enrolledCount: number | null;
  enrollmentAsOf: string | null;
  dataCollectionThrough: string | null;
}

/** Mirrors PmcfEnrollmentSummary — computed server-side over the same rows. */
export interface CerPmcfSummary {
  activityCount: number;
  reportingActivityCount: number;
  notReportedActivityCount: number;
  byStatus: Record<CerPmcfActivity['status'], number>;
  unlinkedToPlanCount: number;
  enrolledInReporting: number | null;
  targetInReporting: number | null;
  ratioBasisActivityCount: number;
  latestReportAsOf: string | null;
}

interface PmcfPayload {
  programId: string;
  records: CerPmcfActivity[];
  count: number;
  summary: CerPmcfSummary;
}

const OPEN_STATES: ReadonlySet<ComplaintTriageState> = new Set([
  'new',
  'triaged',
  'investigation',
  'escalated_capa',
  'escalated_mdr',
]);

export const isOpenComplaint = (c: CerComplaint): boolean => OPEN_STATES.has(c.triageState);
export const isSeriousComplaint = (c: CerComplaint): boolean =>
  c.severityAssessment === 'serious' || c.severityAssessment === 'critical';

/** Figures the complaint rows can honestly support. */
export interface ComplaintFigures {
  total: number;
  open: number;
  seriousOpen: number;
  /** Mean days from receipt to triage over triaged complaints; null when none has been triaged. */
  meanTriageDays: number | null;
  triagedCount: number;
  /** True when the server's page cap was reached, so `total` is a floor. */
  capped: boolean;
}

const PAGE_CAP = 500;

export function complaintFigures(rows: CerComplaint[], count: number): ComplaintFigures {
  const triaged = rows.filter((r) => r.triagedAt !== null);
  const days = triaged.map(
    (r) => (new Date(r.triagedAt as string).getTime() - new Date(r.receivedAt).getTime()) / 86_400_000,
  );
  const open = rows.filter(isOpenComplaint);
  return {
    total: count,
    open: open.length,
    seriousOpen: open.filter(isSeriousComplaint).length,
    meanTriageDays: days.length ? days.reduce((a, b) => a + b, 0) / days.length : null,
    triagedCount: triaged.length,
    capped: count >= PAGE_CAP,
  };
}

export interface UseCerComplaintsResult {
  state: DataState<CerComplaint[]>;
  figures: ComplaintFigures | null;
  refresh: () => void;
}

export function useCerComplaints(programId: string | null): UseCerComplaintsResult {
  const url = programId
    ? `/api/capa-mdr/complaints?program_id=${encodeURIComponent(programId)}&limit=${PAGE_CAP}`
    : null;
  const { data, loading, error, refresh } = useFetchJson<ComplaintsPayload>(url);
  const rows = data?.rows ?? null;
  return {
    state: toDataState(rows, loading, error, { idleReason: 'Complaints are held per program' }),
    figures: rows ? complaintFigures(rows, data?.count ?? rows.length) : null,
    refresh,
  };
}

export interface UseCerPmcfEnrollmentResult {
  state: DataState<CerPmcfActivity[]>;
  summary: CerPmcfSummary | null;
  refresh: () => void;
}

export function useCerPmcfEnrollment(programId: string | null): UseCerPmcfEnrollmentResult {
  const url = programId
    ? `/api/post-market/programs/${encodeURIComponent(programId)}/pmcf-enrollment`
    : null;
  const { data, loading, error, refresh } = useFetchJson<PmcfPayload>(url);
  return {
    state: toDataState(data?.records ?? null, loading, error, {
      idleReason: 'PMCF activities are held per program',
    }),
    summary: data?.summary ?? null,
    refresh,
  };
}
