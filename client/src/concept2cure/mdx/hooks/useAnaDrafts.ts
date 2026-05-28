/**
 * useAnaDrafts — live adapter for the AnA review queue surface.
 *
 * Calls `GET /api/mdx/ana-drafts` (mdx-ana-drafts.ts route). Falls back
 * to the kit fixture (ARQ_DRAFTS) on load/error so the surface never
 * renders empty.
 *
 * The API only returns pending drafts (draft_source='ana', not yet
 * accepted). All other ArqDraft fields that the API doesn't provide
 * (confidence, evidenceN, sources) are given safe defaults.
 */

import { useFetchJson } from './useFetchJson';
import { ARQ_DRAFTS } from '../data/ana-review';
import type { ArqDraft } from '../data/ana-review';

interface ApiCard {
  sectionId: number;
  sectionKey: string;
  sectionNumber: string;
  sectionTitle: string;
  category: string | null;
  programId: string | null;
  programCode: string | null;
  programName: string | null;
  pathway: string | null;
  draftedAt: string;
  draftedSummary: string | null;
}

interface AnaDraftsPayload {
  data: ApiCard[];
}

function relTime(iso: string | undefined): string {
  if (!iso) return 'recently';
  const d = Date.now() - new Date(iso).getTime();
  if (!isFinite(d) || d < 0) return 'just now';
  const m = Math.floor(d / 60_000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function adaptCard(c: ApiCard): ArqDraft {
  const section = [c.sectionNumber, c.sectionTitle].filter(Boolean).join(' ');
  return {
    id: String(c.sectionId),
    surface: c.pathway ?? c.category ?? 'mdx',
    program: c.programCode ?? c.programId ?? '',
    section,
    confidence: 0.85,
    status: 'pending',
    author: 'AnA',
    when: relTime(c.draftedAt),
    reviewer: '',
    priority: 'medium',
    evidenceN: 0,
    sources: [],
    summary: c.draftedSummary ?? '',
  };
}

export interface UseAnaDraftsResult {
  drafts: ArqDraft[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useAnaDrafts(): UseAnaDraftsResult {
  const { data, loading, error, refresh } = useFetchJson<AnaDraftsPayload>('/api/mdx/ana-drafts');
  return {
    drafts: data ? data.data.map(adaptCard) : ARQ_DRAFTS,
    loading,
    error,
    refresh,
  };
}
