/**
 * useMemory — live data adapter for the AnA memory surface.
 *
 * Installs the kit surface against the real endpoint
 * `GET /api/mdx/ana/memory` (server/routes/mdx-ana-memory.ts), which
 * returns client_memory_entries rows. The kit payload blends three things,
 * handled honestly:
 *   - atoms      → real server rows, mapped to the kit AtomRow shape.
 *   - categories → the closed category registry (labels/desc/color are UI),
 *                  with `count` recomputed from the live atoms.
 *   - importance → the closed importance registry (UI labels).
 *   - effects / ingest → memory-effect analytics + ingestion-job history;
 *                  no backend yet, so null (surface renders its empty state).
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

/** Row shape from client_memory_entries (mdx-ana-memory list route). */
interface ServerMemoryRow {
  id: string;
  category: string | null;
  subcategory: string | null;
  title: string;
  content: string | null;
  source_document_name: string | null;
  importance_level: string | null;
  is_verified_by_user: boolean | null;
  superseded_by_id: string | null;
  status: string | null;
  updated_at: string | null;
}

/** Server envelope: ok(res, rows) → { data: rows }. */
interface MemoryPayload {
  data: ServerMemoryRow[];
}

function adaptAtoms(rows: ServerMemoryRow[]): AtomRow[] {
  return rows.map((r) => ({
    id: r.id,
    cat: r.category ?? 'persona',
    imp: r.importance_level ?? 'medium',
    verified: Boolean(r.is_verified_by_user),
    pinned: false,
    scope: [],
    source: r.source_document_name ?? '',
    supersedes: r.superseded_by_id,
    useCount: 0,
    lastUsed: r.updated_at ?? '',
    title: r.title,
    body: r.content ?? '',
  })) as AtomRow[];
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
  const { data, loading, error, refresh } =
    useFetchJson<MemoryPayload>('/api/mdx/ana/memory');
  if (!data) {
    return { atoms: null, categories: null, effects: null, importance: null, ingest: null, loading, error, refresh };
  }
  const atoms = adaptAtoms(data.data ?? []);
  const counts = atoms.reduce<Record<string, number>>((acc, a) => {
    acc[a.cat] = (acc[a.cat] ?? 0) + 1;
    return acc;
  }, {});
  const categories = MEM_CATEGORIES.map((c) => ({ ...c, count: counts[c.id] ?? 0 }));
  return {
    atoms,
    categories,
    importance: MEM_IMPORTANCE.slice(),
    effects: null,
    ingest: null,
    loading,
    error,
    refresh,
  };
}
