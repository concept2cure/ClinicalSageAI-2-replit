/**
 * useTemplates — live data adapter for the Templates browser surface.
 *
 * Calls `GET /api/mdx/templates`. Replaces the older
 * `useWorkbenchTemplates` (workbench placeholder retained for non-Phase 5
 * surfaces but no longer wired to the templates route). Endpoint defaults
 * to 'both' mode in the dataMode registry (expectedLiveBy 2026-08-01).
 */

import { useFetchJson } from './useFetchJson';
import { TEMPLATES, TPL_FRAMEWORKS } from '../data/templates';

type TemplateRow = (typeof TEMPLATES)[number];
type FrameworkRow = (typeof TPL_FRAMEWORKS)[number];

interface TemplatesPayload {
  data: {
    templates: TemplateRow[];
    frameworks: FrameworkRow[];
  };
}

export interface UseTemplatesResult {
  templates: TemplateRow[] | null;
  frameworks: FrameworkRow[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useTemplates(): UseTemplatesResult {
  const { data, loading, error, refresh } =
    useFetchJson<TemplatesPayload>('/api/mdx/templates');
  return {
    templates: data?.data.templates ?? null,
    frameworks: data?.data.frameworks ?? null,
    loading,
    error,
    refresh,
  };
}
