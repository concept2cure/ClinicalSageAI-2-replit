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
import type { QmsDoc, DocStatus, SopTemplate, ReviewDueRow, TrainingRow } from './data';
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
  current: number;
  of: number;
  last_cycle: string | null;
  document_version?: string;
  eligible?: boolean;
  unavailable_reason?: string | null;
}

/** Read-and-understood compliance per controlled procedure —
 *  GET /api/mdx/qms/training/compliance. Numerator is distinct current
 *  acknowledgments; denominator is the org roster. */
const TRAINING_PATH = '/api/mdx/qms/training/compliance';
export function useTrainingCompliance() {
  const { data, loading, error, refresh } = useFetchJson<unknown>(TRAINING_PATH);
  const raw = useMemo(() => listOf<ServerTraining>(data), [data]);
  const rows = useMemo<TrainingRow[] | null>(
    () =>
      raw?.map((r) => ({
        ...(Number.isInteger(r.id) && r.id > 0 ? { documentId: r.id } : {}),
        ...(typeof r.document_version === 'string' ? { documentVersion: r.document_version } : {}),
        ...(typeof r.eligible === 'boolean' ? { eligible: r.eligible } : {}),
        ...(typeof r.unavailable_reason === 'string' || r.unavailable_reason === null ? { unavailableReason: r.unavailable_reason } : {}),
        doc: `${r.doc_number} ${r.title}`,
        current: r.current ?? 0,
        of: r.of ?? 0,
        lastCycle: r.last_cycle ? String(r.last_cycle).slice(0, 10) : '—',
      })) ?? null,
    [raw],
  );
  return { rows, loading, error: error ?? shapeError(TRAINING_PATH, data, raw), refresh };
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
