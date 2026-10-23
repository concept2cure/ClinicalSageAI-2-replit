import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import type { VaultSearchHit } from '../surfaces/VaultLibraryResults';

/** One search hit: the find view's contract (VaultLibraryResults.tsx), not a second copy of it. */
export type SearchHit = VaultSearchHit;
type ReadState = 'idle' | 'loading' | 'ready' | 'error';
interface SearchSnapshot {
  key: string; state: ReadState; hits: SearchHit[]; total: number; nextOffset: number;
  error: string | null; pageError: string | null; pageBusy: boolean;
}
type SearchPage = { ok: true; hits: SearchHit[]; total: number } | { ok: false; message: string };
const PAGE_SIZE = 25;
const INVALID_PAGE = 'The server did not confirm the search results. Try again to read the current matches.';
export const SEARCH_RESULTS_CHANGED = 'The search results changed while loading. Refresh search to read the current matches.';
const emptySearch = (key: string, state: ReadState = 'idle'): SearchSnapshot => ({
  key, state, hits: [], total: 0, nextOffset: 0, error: null, pageError: null, pageBusy: false,
});

function readPage(data: { results?: SearchHit[]; total?: number; offset?: number } | undefined, offset: number): SearchPage {
  if (!data || !Array.isArray(data.results) || !Number.isSafeInteger(data.total) || data.total! < 0
    || data.results.length > PAGE_SIZE || (data.offset !== undefined && data.offset !== offset)
    || !data.results.every(row => row && typeof row.id === 'string' && row.id.trim() && typeof row.title === 'string')
    || (data.results.length === 0 && data.total! > offset) || offset + data.results.length > data.total!
    || new Set(data.results.map(row => row.id)).size !== data.results.length) {
    return { ok: false, message: INVALID_PAGE };
  }
  return { ok: true, hits: data.results, total: data.total! };
}

async function searchProjectVault(programId: string, query: string, offset: number): Promise<SearchPage> {
  try {
    const url = `/api/c2c/project-vault/${encodeURIComponent(programId)}/search?q=${encodeURIComponent(query)}&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await apiRequest('GET', url);
    const body = await res.json().catch(() => null) as { success?: boolean; data?: Parameters<typeof readPage>[0] } | null;
    if (!res.ok || body?.success === false) return { ok: false, message: serverMessage(body) ?? `The vault could not be searched (HTTP ${res.status}).` };
    return readPage(body?.data, offset);
  } catch (error) {
    return { ok: false, message: redactInternals(error instanceof Error ? error.message : '', 'The vault could not be searched.') };
  }
}

function appendPage(snapshot: SearchSnapshot, page: Extract<SearchPage, { ok: true }>, offset: number): SearchSnapshot {
  const hits = new Map(snapshot.hits.map(hit => [hit.id, hit]));
  page.hits.forEach(hit => hits.set(hit.id, hit));
  return { ...snapshot, hits: [...hits.values()], total: page.total, nextOffset: offset + page.hits.length, pageBusy: false, pageError: null };
}

function applyMorePage(snapshot: SearchSnapshot, page: SearchPage, offset: number): SearchSnapshot {
  if (!page.ok) return { ...snapshot, pageBusy: false, pageError: page.message };
  const loaded = new Set(snapshot.hits.map(hit => hit.id));
  if (page.hits.some(hit => loaded.has(hit.id)) || page.total < snapshot.hits.length) {
    return { ...snapshot, pageBusy: false, pageError: SEARCH_RESULTS_CHANGED };
  }
  return appendPage(snapshot, page, offset);
}

/** Every page belongs to the exact current query; failed later reads retain the loaded rows. */
export function useProjectVaultSearch(programId: string | null, query: string) {
  const term = query.trim();
  const key = JSON.stringify([programId, term]);
  const [epoch, setEpoch] = useState(0);
  const [snapshot, setSnapshot] = useState<SearchSnapshot>(() => emptySearch(key));
  const generation = useRef(0);
  const requestBusy = useRef(false);
  useEffect(() => {
    const sequence = ++generation.current;
    requestBusy.current = false;
    setSnapshot(emptySearch(key, programId && term ? 'loading' : 'idle'));
    if (!programId || !term) return;
    const timer = setTimeout(async () => {
      const page = await searchProjectVault(programId, term, 0);
      if (sequence !== generation.current) return;
      setSnapshot(page.ok ? { ...appendPage(emptySearch(key, 'ready'), page, 0), state: 'ready' }
        : { ...emptySearch(key, 'error'), error: page.message });
    }, 250);
    return () => { clearTimeout(timer); generation.current += 1; };
  }, [programId, term, key, epoch]);

  const loadMore = useCallback(async () => {
    if (!programId || snapshot.key !== key || snapshot.state !== 'ready' || requestBusy.current
      || snapshot.nextOffset >= snapshot.total) return;
    const sequence = generation.current;
    const offset = snapshot.nextOffset;
    requestBusy.current = true;
    setSnapshot(previous => ({ ...previous, pageBusy: true, pageError: null }));
    const page = await searchProjectVault(programId, term, offset);
    if (sequence !== generation.current) return;
    requestBusy.current = false;
    setSnapshot(previous => applyMorePage(previous, page, offset));
  }, [programId, term, key, snapshot]);
  const retrySearch = useCallback(() => setEpoch(value => value + 1), []);
  const current = snapshot.key === key ? snapshot : emptySearch(key, term ? 'loading' : 'idle');
  return { searchState: current.state, hits: current.hits, hitsTotal: current.total, searchError: current.error,
    pageBusy: current.pageBusy, pageError: current.pageError, hasMore: current.nextOffset < current.total,
    loadMore, retrySearch };
}
