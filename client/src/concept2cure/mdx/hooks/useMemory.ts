/**
 * useMemory — live data adapter for the AnA memory surface.
 *
 * Calls `GET /api/mdx/memory` (cross-program). Endpoint not yet
 * implemented; surface stays in `defaultMode: 'fixture'` until
 * 2026-10-15 per the dataMode registry.
 */

import { useFetchJson } from './useFetchJson';
import {
  MEM_ATOMS,
  MEM_CATEGORIES,
  MEM_EFFECTS,
  MEM_IMPORTANCE,
  MEM_INGEST,
} from '../data/memory';

type AtomRow = (typeof MEM_ATOMS)[number];
type CategoryRow = (typeof MEM_CATEGORIES)[number];
type EffectRow = (typeof MEM_EFFECTS)[number];
type ImportanceRow = (typeof MEM_IMPORTANCE)[number];
type IngestRow = (typeof MEM_INGEST)[number];

interface MemoryPayload {
  data: {
    atoms: AtomRow[];
    categories: CategoryRow[];
    effects: EffectRow[];
    importance: ImportanceRow[];
    ingest: IngestRow[];
  };
}

export interface UseMemoryResult {
  atoms: AtomRow[] | null;
  categories: CategoryRow[] | null;
  effects: EffectRow[] | null;
  importance: ImportanceRow[] | null;
  ingest: IngestRow[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useMemory(): UseMemoryResult {
  const { data, loading, error, refresh } = useFetchJson<MemoryPayload>('/api/mdx/memory');
  return {
    atoms: data?.data.atoms ?? null,
    categories: data?.data.categories ?? null,
    effects: data?.data.effects ?? null,
    importance: data?.data.importance ?? null,
    ingest: data?.data.ingest ?? null,
    loading,
    error,
    refresh,
  };
}
