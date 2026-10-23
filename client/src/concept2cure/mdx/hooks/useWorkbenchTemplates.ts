/** Optional template-library adapter, isolated from project workflow reads. */
import { useMemo } from 'react';
import type { Template } from '../data/workbench';
import { firstArray, shapeMismatch } from '../lib/payloadShape';
import { formatRelativeShort } from '../lib/formatRelativeShort';
import { useFetchJson } from './useFetchJson';

/* ─── Templates ────────────────────────────────────────────────────── */

interface ServerTemplate {
  id: string | number;
  name: string;
  description?: string | null;
  category?: string | null;
  type?: string | null;
  region?: string | null;
  source?: string;
  usageCount?: number;
  updatedAt?: string;
}

interface TemplatesPayload {
  templates?: ServerTemplate[];
  data?: ServerTemplate[];
  ind?: ServerTemplate[];
  document?: ServerTemplate[];
  ectd?: ServerTemplate[];
}


function adaptTemplate(t: ServerTemplate): Template {
  const tags: string[] = [];
  if (t.category) tags.push(t.category);
  if (t.type && t.type !== t.category) tags.push(t.type);
  if (t.region) tags.push(t.region);
  return {
    id:      String(t.id),
    name:    t.name,
    uses:    t.usageCount ?? 0,
    owner:   t.source === 'ectd' ? 'Reg Affairs' : t.source === 'ind' ? 'Reg Affairs' : 'Templates',
    updated: formatRelativeShort(t.updatedAt),
    tags,
  };
}

export interface UseWorkbenchTemplatesResult {
  templates: Template[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Fetch templates from /api/templates (server already aggregates
 * indTemplates + documentTemplates + ectdTemplates) and adapt each
 * row into the kit's Template shape.
 */
export function useWorkbenchTemplates(): UseWorkbenchTemplatesResult {
  const { data, loading, error, refresh } = useFetchJson<TemplatesPayload>('/api/templates');
  /*
   * Same chain as the task board, plus a spread: `[...(data.ind ?? [])]` throws
   * "is not iterable" the moment `ind` is an object rather than a list, which is
   * one envelope change away. Only the fields that are actually arrays are read,
   * and a body carrying none of them is reported instead of rendering as an
   * empty template library.
   */
  const rows = useMemo<ServerTemplate[] | null>(() => {
    if (data == null) return null;
    const direct = firstArray<ServerTemplate>(data.templates, data.data);
    if (direct) return direct;
    const grouped = [data.ind, data.document, data.ectd].filter(
      (part): part is ServerTemplate[] => Array.isArray(part),
    );
    return grouped.length ? grouped.flat() : null;
  }, [data]);
  const failed = error ?? (data != null && rows === null ? shapeMismatch('/api/templates') : null);
  const templates = useMemo(() => (rows ? rows.map(adaptTemplate) : null), [rows]);
  return { templates, loading, error: failed, refresh };
}
