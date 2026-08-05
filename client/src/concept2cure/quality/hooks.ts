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
import type { QmsDoc, DocType, DocStatus, SopTemplate, ReviewDueRow, TrainingRow } from './data';

/** Unwrap the API envelope — `ok(res, rows, meta)` returns `{ data, ... }`,
 *  but tolerate a bare array or a `{ rows }` shape too.
 *
 *  Returns null when the body carries no list we can adapt. The register used to
 *  crash on `{ data: {} }`: `p?.data ?? p?.rows ?? []` only reaches the `[]`
 *  when `data` is absent, so a present-but-not-a-list `data` was handed back
 *  unchanged and `.map` threw inside useMemo during render, unwinding the whole
 *  surface. Null rather than `[]` because an empty array is a real answer —
 *  "the register is empty" — and manufacturing one for a body we cannot read
 *  would leave the surface permanently blank instead of falling back to the
 *  fixtures the way it already does when the fetch fails. */
interface Envelope<T> {
  data?: T[];
  rows?: T[];
  count?: number;
}
function listOf<T>(payload: unknown): T[] | null {
  const p = payload as Envelope<T> | null;
  const rows = Array.isArray(payload) ? payload : p?.data ?? p?.rows;
  if (!Array.isArray(rows)) return null;
  /* These are all row-list endpoints; a list of anything but row objects is a
     body we cannot adapt either (`adaptDoc(null)` throws the same way). */
  return rows.every((r) => typeof r === 'object' && r !== null) ? (rows as T[]) : null;
}

/** A body arrived but held no list — a 200 we could not read. Reported through
 *  the hook's existing `error` so "unreadable" is not silently indistinguishable
 *  from "still loading". */
function shapeError(path: string, payload: unknown, rows: unknown[] | null): string | null {
  return payload != null && rows === null ? `unexpected response shape for ${path}` : null;
}

interface ServerDoc {
  id: number;
  doc_number: string;
  title: string;
  doc_type: string;
  category: string | null;
  version: string;
  status: string;
  effective_date: string | null;
  next_review_date: string | null;
  updated_at: string | null;
  overdue?: boolean;
}

function adaptDoc(r: ServerDoc): QmsDoc {
  return {
    id: r.id,
    docNumber: r.doc_number,
    title: r.title,
    docType: r.doc_type as DocType,
    category: r.category,
    version: r.version,
    status: r.status as DocStatus,
    effectiveDate: r.effective_date,
    nextReviewDate: r.next_review_date,
    updatedAt: r.updated_at,
  };
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
  const { data, loading, error } = useFetchJson<unknown>(path);
  const raw = useMemo(() => listOf<ServerDoc>(data), [data]);
  const rows = useMemo<ReviewDueRow[] | null>(
    () =>
      raw?.map((r) => ({
        id: r.id,
        docNumber: r.doc_number,
        title: r.title,
        nextReviewDate: r.next_review_date,
        overdue: !!r.overdue,
        status: r.status as DocStatus,
      })) ?? null,
    [raw],
  );
  return { rows, loading, error: error ?? shapeError(path, data, raw) };
}

interface ServerTraining {
  id: number;
  doc_number: string;
  title: string;
  current: number;
  of: number;
  last_cycle: string | null;
}

/** Read-and-understood compliance per controlled procedure —
 *  GET /api/mdx/qms/training/compliance. Numerator is distinct current
 *  acknowledgments; denominator is the org roster. */
const TRAINING_PATH = '/api/mdx/qms/training/compliance';
export function useTrainingCompliance() {
  const { data, loading, error } = useFetchJson<unknown>(TRAINING_PATH);
  const raw = useMemo(() => listOf<ServerTraining>(data), [data]);
  const rows = useMemo<TrainingRow[] | null>(
    () =>
      raw?.map((r) => ({
        doc: `${r.doc_number} ${r.title}`,
        current: r.current ?? 0,
        of: r.of ?? 0,
        lastCycle: r.last_cycle ? String(r.last_cycle).slice(0, 10) : '—',
      })) ?? null,
    [raw],
  );
  return { rows, loading, error: error ?? shapeError(TRAINING_PATH, data, raw) };
}
