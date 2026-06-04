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
import type { QmsDoc, DocType, DocStatus, SopTemplate, ReviewDueRow } from './data';

/** Unwrap the API envelope — `ok(res, rows, meta)` returns `{ data, ... }`,
 *  but tolerate a bare array or a `{ rows }` shape too. */
interface Envelope<T> {
  data?: T[];
  rows?: T[];
  count?: number;
}
function listOf<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  const p = payload as Envelope<T> | null;
  return p?.data ?? p?.rows ?? [];
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
export function useSopRegister() {
  const { data, loading, error, refresh } = useFetchJson<unknown>('/api/mdx/qms/documents');
  const docs = useMemo<QmsDoc[] | null>(
    () => (data ? listOf<ServerDoc>(data).map(adaptDoc) : null),
    [data],
  );
  return { docs, loading, error, refresh };
}

/** Quality system template family — GET /api/mdx/qms/templates. */
export function useSopTemplates() {
  const { data, loading, error } = useFetchJson<unknown>('/api/mdx/qms/templates');
  const templates = useMemo<SopTemplate[] | null>(
    () => (data ? listOf<SopTemplate>(data) : null),
    [data],
  );
  return { templates, loading, error };
}

/** Periodic-review tracking — GET /api/mdx/qms/documents/review-due. */
export function useReviewDue(within = 120) {
  const { data, loading, error } = useFetchJson<unknown>(
    `/api/mdx/qms/documents/review-due?within=${within}`,
  );
  const rows = useMemo<ReviewDueRow[] | null>(() => {
    if (!data) return null;
    return listOf<ServerDoc>(data).map((r) => ({
      id: r.id,
      docNumber: r.doc_number,
      title: r.title,
      nextReviewDate: r.next_review_date,
      overdue: !!r.overdue,
      status: r.status as DocStatus,
    }));
  }, [data]);
  return { rows, loading, error };
}
