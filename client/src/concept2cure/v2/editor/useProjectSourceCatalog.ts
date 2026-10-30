import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { useDataReadVisit, type DataReadOwner, type DataReadVisit } from '../dataConnect';
import { isProgramId } from './draftToDocument';
import { parseProjectSourcePage, projectSourceCatalogUrl, type ProjectSourceRecord } from './projectSourceCatalog';

export type SourceReadState = 'idle' | 'loading' | 'ready' | 'error';
interface Snapshot { programId: string | null; state: SourceReadState; sources: ProjectSourceRecord[]; loaded: number; total: number | null; error: string | null }
interface OwnedSnapshot { visit: DataReadVisit | null; snapshot: Snapshot }
const PAGE_SIZE = 200;
const empty = (programId: string | null): Snapshot => ({ programId, state: programId ? 'loading' : 'idle', sources: [], loaded: 0, total: null, error: null });
const CHANGED = 'The source catalogue changed while it was being read. Retry to read its current complete contents.';

async function readPage(programId: string, offset: number, current: () => boolean) {
  try {
    if (!current()) return null;
    const response = await apiRequest('GET', projectSourceCatalogUrl(programId, { limit: PAGE_SIZE, offset }));
    if (!current()) return null;
    const body: unknown = await response.json().catch(() => null);
    if (!current()) return null;
    if (!response.ok) return { ok: false as const, message: serverMessage(body) ?? 'The project source catalogue could not be read.' };
    return parseProjectSourcePage(body, { programId, limit: PAGE_SIZE, offset });
  } catch (error) {
    if (!current()) return null;
    return { ok: false as const, message: redactInternals(error instanceof Error ? error.message : '', 'The project source catalogue could not be read.') };
  }
}

/** Walk metadata pages; only a confirmed complete catalogue supplies a citation lookup. */
export function useProjectSourceCatalog(programId: string | null, owner?: DataReadOwner) {
  const owned = useDataReadVisit(programId, owner);
  const [epoch, setEpoch] = useState(0);
  const [read, setRead] = useState<OwnedSnapshot>(() => ({ visit: owned.visit, snapshot: empty(programId) }));
  const generation = useRef(0);
  const currentProgram = useRef(programId);
  currentProgram.current = programId;
  useEffect(() => {
    if (!owned.current()) return;
    const run = ++generation.current;
    const current = () => generation.current === run && currentProgram.current === programId && owned.current();
    const publish = (snapshot: Snapshot) => {
      if (current()) setRead(previous => current() ? { visit: owned.visit, snapshot } : previous);
    };
    publish(empty(programId));
    if (!programId) return;
    if (!isProgramId(programId)) {
      publish({ ...empty(programId), state: 'error', error: 'The project identity could not be verified. Open its project and retry.' });
      return;
    }
    const load = async () => {
      const sources: ProjectSourceRecord[] = [];
      const seen = new Set<number>();
      let total: number | null = null;
      let offset = 0;
      while (current()) {
        const result = await readPage(programId, offset, current);
        if (!current() || !result) return;
        const changed = result.ok && ((total !== null && total !== result.page.total) || result.page.sources.some(row => seen.has(row.id)));
        if (!result.ok || changed) {
          publish({ programId, state: 'error', sources: [], loaded: sources.length, total, error: result.ok ? CHANGED : result.message });
          return;
        }
        total = result.page.total;
        result.page.sources.forEach(row => { seen.add(row.id); sources.push(row); });
        offset += result.page.sources.length;
        const complete = !result.page.window.truncated;
        publish({ programId, state: complete ? 'ready' : 'loading', sources: complete ? sources : [], loaded: sources.length, total, error: null });
        if (complete) return;
      }
    };
    void load();
    return () => { if (generation.current === run) generation.current += 1; };
    // Canonical visit identity changes a read; fresh owner wrappers do not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId, epoch, owned.visit]);
  const retry = useCallback(() => {
    const current = () => currentProgram.current === programId && owned.current();
    if (!current()) return;
    generation.current += 1;
    setRead(previous => current() ? { visit: owned.visit, snapshot: empty(programId) } : previous);
    setEpoch(value => current() ? value + 1 : value);
    // Retain the original visit across result publication and inline owner wrappers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId, owned.visit]);
  const current = read.visit === owned.visit && owned.current() && read.snapshot.programId === programId ? read.snapshot : empty(programId);
  return { ...current, retry };
}
