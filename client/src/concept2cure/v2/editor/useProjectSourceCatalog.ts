import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { isProgramId } from './draftToDocument';
import { parseProjectSourcePage, projectSourceCatalogUrl, type ProjectSourceRecord } from './projectSourceCatalog';

export type SourceReadState = 'idle' | 'loading' | 'ready' | 'error';
interface Snapshot { programId: string | null; state: SourceReadState; sources: ProjectSourceRecord[]; loaded: number; total: number | null; error: string | null }
const PAGE_SIZE = 200;
const empty = (programId: string | null): Snapshot => ({ programId, state: programId ? 'loading' : 'idle', sources: [], loaded: 0, total: null, error: null });
const CHANGED = 'The source catalogue changed while it was being read. Retry to read its current complete contents.';

async function readPage(programId: string, offset: number) {
  try {
    const response = await apiRequest('GET', projectSourceCatalogUrl(programId, { limit: PAGE_SIZE, offset }));
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) return { ok: false as const, message: serverMessage(body) ?? 'The project source catalogue could not be read.' };
    return parseProjectSourcePage(body, { programId, limit: PAGE_SIZE, offset });
  } catch (error) {
    return { ok: false as const, message: redactInternals(error instanceof Error ? error.message : '', 'The project source catalogue could not be read.') };
  }
}

/** Walk metadata pages; only a confirmed complete catalogue supplies a citation lookup. */
export function useProjectSourceCatalog(programId: string | null) {
  const [epoch, setEpoch] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot>(() => empty(programId));
  const generation = useRef(0);
  useEffect(() => {
    const run = ++generation.current;
    setSnapshot(empty(programId));
    if (!programId) return;
    if (!isProgramId(programId)) {
      setSnapshot({ ...empty(programId), state: 'error', error: 'The project identity could not be verified. Open its project and retry.' });
      return;
    }
    const current = () => generation.current === run;
    const load = async () => {
      const sources: ProjectSourceRecord[] = [];
      const seen = new Set<number>();
      let total: number | null = null;
      let offset = 0;
      while (current()) {
        const result = await readPage(programId, offset);
        if (!current()) return;
        const changed = result.ok && ((total !== null && total !== result.page.total) || result.page.sources.some(row => seen.has(row.id)));
        if (!result.ok || changed) {
          setSnapshot({ programId, state: 'error', sources: [], loaded: sources.length, total, error: result.ok ? CHANGED : result.message });
          return;
        }
        total = result.page.total;
        result.page.sources.forEach(row => { seen.add(row.id); sources.push(row); });
        offset += result.page.sources.length;
        const complete = !result.page.window.truncated;
        setSnapshot({ programId, state: complete ? 'ready' : 'loading', sources: complete ? sources : [], loaded: sources.length, total, error: null });
        if (complete) return;
      }
    };
    void load();
    return () => { generation.current += 1; };
  }, [programId, epoch]);
  const retry = useCallback(() => { generation.current += 1; setSnapshot(empty(programId)); setEpoch(value => value + 1); }, [programId]);
  const current = snapshot.programId === programId ? snapshot : empty(programId);
  return { ...current, retry };
}
