/**
 * Quality / SOP register — live data hooks (`live ?? fixture`).
 *
 * All three hooks read the live QMS API mounted at /api/mdx/qms/* and adapt
 * snake_case rows into the surface's camelCase shapes. They reuse the shared
 * MDX `useFetchJson` (the single source of truth for auth headers + cancellable
 * fetches), so the surface lights up with live data when the org is
 * authenticated and falls back to the typed fixtures otherwise.
 *
 * @module client/src/concept2cure/quality/hooks
 */

import { useMemo } from 'react';
import { useFetchJson } from '../mdx/hooks/useFetchJson';
import type { QmsDoc, DocStatus, SopTemplate, ReviewDueRow, TrainingRow, TrainingSummary } from './data';
import {adaptDoc,adaptPeriodicReview,nextReviewDueOf,type ServerDoc} from './qmsDocumentRecord';
import { listOf } from './qmsList';

/** A body arrived but held no list — a 200 we could not read. Reported through
 *  the hook's existing `error` so "unreadable" is not silently indistinguishable
 *  from "still loading". */
function shapeError(path: string, payload: unknown, rows: unknown[] | null): string | null {
  return payload != null && rows === null ? `unexpected response shape for ${path}` : null;
}

/** Controlled-document register — GET /api/mdx/qms/documents. */
const DOCS_PATH = '/api/mdx/qms/documents';
export function useSopRegister() {
  const { data, loading, error, refresh } = useFetchJson<unknown>(DOCS_PATH);
  const rows = useMemo(() => listOf<ServerDoc>(data), [data]);
  const docs = useMemo<QmsDoc[] | null>(() => rows?.map(adaptDoc) ?? null, [rows]);
  return { docs, loading, error: error ?? shapeError(DOCS_PATH, data, rows), refresh };
}

/** Quality system template family — GET /api/mdx/qms/templates. */
const TEMPLATES_PATH = '/api/mdx/qms/templates';
export function useSopTemplates() {
  const { data, loading, error } = useFetchJson<unknown>(TEMPLATES_PATH);
  const templates = useMemo<SopTemplate[] | null>(() => listOf<SopTemplate>(data), [data]);
  return { templates, loading, error: error ?? shapeError(TEMPLATES_PATH, data, templates) };
}

/** Periodic-review tracking — GET /api/mdx/qms/documents/review-due. */
export function useReviewDue(within = 120) {
  const path = `/api/mdx/qms/documents/review-due?within=${within}`;
  const { data, loading, error, refresh } = useFetchJson<unknown>(path);
  const raw = useMemo(() => listOf<ServerDoc>(data), [data]);
  const rows = useMemo<ReviewDueRow[] | null>(
    () =>
      raw?.map((r) => ({
        id: r.id,
        docNumber: r.doc_number,
        title: r.title,
        nextReviewDate: nextReviewDueOf(r),
        overdue: !!r.overdue,
        status: r.status as DocStatus,
        version: r.in_force?.version ?? r.version,
        underRevision: !!r.in_force,
        lastReview: adaptPeriodicReview(r),
        signedReviewDate: r.next_review_date,
      })) ?? null,
    [raw],
  );
  return { rows, loading, error: error ?? shapeError(path, data, raw), refresh };
}

interface ServerTraining {
  id: number;
  doc_number: string;
  title: string;
  current: number | null;
  of: number | null;
  last_cycle: string | null;
  document_version?: string;
  eligible?: boolean;
  unavailable_reason?: string | null;
  assignment?: string;
  me?: { assigned?: unknown; countsNow?: unknown } | null;
}

const ASSIGNMENT_STATES = new Set(['assigned', 'not_assigned', 'no_active_assignees']);
const countOrNull = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);
const SUMMARY_KEYS = ['documents', 'assigned', 'notAssigned', 'noActiveAssignees', 'unavailable'] as const;
const summaryOf = (data: unknown): TrainingSummary | null => {
  const s = (data as { meta?: { summary?: Record<string, unknown> } } | null)?.meta?.summary;
  if (!s || !SUMMARY_KEYS.every(k => countOrNull(s[k]) !== null)) return null;
  const pct = s.averageCurrentPct;
  return pct === null || countOrNull(pct) !== null ? (s as unknown as TrainingSummary) : null;
};

function trainingRowOf(r: ServerTraining): TrainingRow {
  return {
    ...(Number.isInteger(r.id) && r.id > 0 ? { documentId: r.id } : {}),
    ...(typeof r.document_version === 'string' ? { documentVersion: r.document_version } : {}),
    ...(typeof r.eligible === 'boolean' ? { eligible: r.eligible } : {}),
    ...(typeof r.unavailable_reason === 'string' || r.unavailable_reason === null ? { unavailableReason: r.unavailable_reason } : {}),
    ...(ASSIGNMENT_STATES.has(String(r.assignment)) ? { assignment: r.assignment as TrainingRow['assignment'] } : {}),
    ...(r.me && typeof r.me === 'object' ? { me: { assigned: r.me.assigned === true, countsNow: r.me.countsNow === true } } : {}),
    doc: `${r.doc_number} ${r.title}`,
    // An absent count is not zero: a document assigned to nobody has no figure (P-49).
    current: countOrNull(r.current),
    of: countOrNull(r.of),
    lastCycle: r.last_cycle ? String(r.last_cycle).slice(0, 10) : '—',
  };
}

/** Read-and-understood compliance per controlled procedure —
 *  GET /api/mdx/qms/training/compliance. Numerator: the people assigned with a
 *  current acknowledgement of the version in force; denominator: the people
 *  assigned (P-49). `summary` is the server's register figure, or null when the
 *  body carries none: the client computes no percentage. */
const TRAINING_PATH = '/api/mdx/qms/training/compliance';
export function useTrainingCompliance() {
  const { data, loading, error, refresh } = useFetchJson<unknown>(TRAINING_PATH);
  const raw = useMemo(() => listOf<ServerTraining>(data), [data]);
  const rows = useMemo<TrainingRow[] | null>(() => raw?.map(trainingRowOf) ?? null, [raw]);
  const summary = useMemo(() => summaryOf(data), [data]);
  return { rows, summary, loading, error: error ?? shapeError(TRAINING_PATH, data, raw), refresh };
}

export interface TrainingExpiryRow {
  userId: number; userName: string | null; documentId: number; docNumber: string; title: string;
  documentVersion: string; expiresAt: string; daysLeft: number;
  /** Already lapsed: no current receipt, and the last one on this release expired. */
  lapsed: boolean;
}
const isExpiryRow = (r: unknown): r is TrainingExpiryRow => {
  const o = r as Record<string, unknown> | null;
  return !!o && Number.isInteger(o.userId) && Number.isInteger(o.documentId) && typeof o.docNumber === 'string' &&
    typeof o.expiresAt === 'string' && typeof o.daysLeft === 'number' && typeof o.lapsed === 'boolean' &&
    (o.userName === null || typeof o.userName === 'string');
};
/** Each active member whose current training lapses within `withinDays` —
 *  GET /api/mdx/qms/training/expiring (G10). A body that is not that list is a failure. */
export function useTrainingExpiring(withinDays: number) {
  const path = `/api/mdx/qms/training/expiring?within=${withinDays}`;
  const { data, loading, error, refresh } = useFetchJson<unknown>(path);
  const raw = useMemo(() => listOf<unknown>(data), [data]);
  const rows = useMemo(() => (raw && raw.every(isExpiryRow) ? raw : null), [raw]);
  const unreadable = data != null && rows === null ? `unexpected response shape for ${path}` : null;
  const failed = !loading && (error != null || unreadable != null);
  return { rows: loading || failed ? null : rows, failed, error: error ?? unreadable, refresh };
}

/* ── Job roles and training assignments (P-49; design §3.12) ──
   Each read is the envelope's `data` object, checked: a body that is not the
   shape is a failed read, never an empty one. */

export interface JobRole {
  id: number; name: string; description: string | null; documentCount: number;
  members: Array<{ userId: number; label: string; addedAt: string; active: boolean }>;
}
export interface JobRoleListing { roles: JobRole[]; people: Array<{ userId: number; label: string }>; canAdminister: boolean }

export interface TrainingAssignment {
  id: number; kind: 'role' | 'person'; jobRoleId: number | null; jobRoleName: string | null;
  userId: number | null; userLabel: string | null; active: boolean | null;
  assignedBy: number; assignedByLabel: string; assignedAt: string;
}
export interface TrainingAssignmentListing {
  assignments: TrainingAssignment[];
  trainable: { inForce: { version: string; effectiveDate: string | null } | null; pending: { version: string; effectiveDate: string | null } | null };
  /** Every person assigned (`peopleScope: 'everyone'`), or only the reader's own line (`'own'`, P-50 Q3). */
  people: Array<{ userId: number; label: string; via: string[]; coveredSince: string }>;
  peopleCount: number;
  peopleScope: 'everyone' | 'own';
  /** null: whether the reader may change them could not be checked. */
  canAssign: boolean | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isPerson = (p: unknown) => isObj(p) && Number.isInteger(p.userId) && typeof p.label === 'string';
const isJobRole = (r: unknown) => isObj(r) && Number.isInteger(r.id) && typeof r.name === 'string' &&
  Number.isInteger(r.documentCount) && Array.isArray(r.members) && r.members.every(m => isPerson(m) && typeof (m as { active?: unknown }).active === 'boolean');
const isJobRoleListing = (v: unknown): v is JobRoleListing =>
  isObj(v) && Array.isArray(v.roles) && v.roles.every(isJobRole) && Array.isArray(v.people) && v.people.every(isPerson) && typeof v.canAdminister === 'boolean';
const isAssignment = (a: unknown) => isObj(a) && Number.isInteger(a.id) && (a.kind === 'role' || a.kind === 'person') &&
  typeof a.assignedByLabel === 'string' && typeof a.assignedAt === 'string';
const isTrainable = (t: unknown) => isObj(t) && 'inForce' in t && 'pending' in t;
const isAssignmentListing = (v: unknown): v is TrainingAssignmentListing =>
  isObj(v) && Array.isArray(v.assignments) && v.assignments.every(isAssignment) && isTrainable(v.trainable) &&
  Array.isArray(v.people) && v.people.every(isPerson) && Number.isInteger(v.peopleCount) &&
  (v.peopleScope === 'everyone' || v.peopleScope === 'own') && (v.canAssign === null || typeof v.canAssign === 'boolean');

/** One envelope read, checked by `guard`: loading, failed (an error or a body of the wrong shape), or the value. */
function useCheckedRead<T>(path: string | null, guard: (v: unknown) => v is T) {
  const { data, loading, error, refresh } = useFetchJson<unknown>(path);
  const body = isObj(data) ? data.data : undefined;
  const value = useMemo(() => (guard(body) ? body : null), [body, guard]);
  const unreadable = data != null && value === null ? `unexpected response shape for ${path}` : null;
  const failed = !loading && (error != null || unreadable != null);
  return { value: loading || failed ? null : value, failed, error: error ?? unreadable, refresh };
}

/** The organization's job roles, who holds them and the active roster — GET /api/mdx/qms/job-roles. */
export function useJobRoles() {
  const r = useCheckedRead('/api/mdx/qms/job-roles', isJobRoleListing);
  return { listing: r.value, failed: r.failed, error: r.error, refresh: r.refresh };
}

/** Who must train on one controlled document — GET /api/mdx/qms/documents/:id/training-assignments. */
export function useTrainingAssignments(documentId: number) {
  const r = useCheckedRead(`/api/mdx/qms/documents/${documentId}/training-assignments`, isAssignmentListing);
  return { listing: r.value, failed: r.failed, error: r.error, refresh: r.refresh };
}
