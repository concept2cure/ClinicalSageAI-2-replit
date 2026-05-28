/**
 * useCerGspr — live adapter for the CerWorkbench Conformity tab.
 *
 * Calls GET /api/gspr/catalog?regulation=MDR and adapts the catalog
 * requirements to GsprRow format. Conformance status defaults to 'na'
 * (not yet mapped) until per-program mapping decisions are recorded.
 * Falls back to CER_GSPR seed data when the catalog is empty or on error.
 */

import { CER_GSPR } from '../data/cer';
import type { GsprRow, GsprChapter } from '../data/cer';
import { useFetchJson } from './useFetchJson';

interface GsprCatalogRequirement {
  id: string;
  regulation: string;
  annex: string;
  chapter: string | null;
  clause: string;
  title: string;
  status: string;
}

interface CatalogPayload {
  regulation: string;
  requirements: GsprCatalogRequirement[];
  count: number;
}

const CHAPTER_MAP: Record<string, GsprChapter> = { I: 'I', II: 'II', III: 'III' };

function adaptRequirement(req: GsprCatalogRequirement): GsprRow {
  return {
    id: req.clause,
    ch: (req.chapter ? CHAPTER_MAP[req.chapter] : undefined) ?? 'I',
    title: req.title,
    status: 'na',
    evidence: '—',
    note: '',
  };
}

export interface UseCerGsprResult {
  gspr: GsprRow[];
  loading: boolean;
}

export function useCerGspr(): UseCerGsprResult {
  const { data, loading } = useFetchJson<CatalogPayload>('/api/gspr/catalog?regulation=MDR');
  const requirements = data?.requirements;
  return {
    gspr: requirements && requirements.length > 0
      ? requirements.map(adaptRequirement)
      : CER_GSPR,
    loading,
  };
}
