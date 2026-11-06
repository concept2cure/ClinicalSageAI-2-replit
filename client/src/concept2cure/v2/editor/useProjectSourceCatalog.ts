import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { useDataReadVisit, type DataReadOwner, type DataReadVisit } from '../dataConnect';
import { isProgramId } from './draftToDocument';
import { parseProjectSourcePage, projectSourceCatalogUrl, type ProjectSourceRecord } from './projectSourceCatalog';
import { errorCodeOf } from '@/lib/apiErrorCode';
import { describeReadFailure, readFailureFor } from '../../mdx/hooks/useFetchJson';

export type SourceReadState = 'idle' | 'loading' | 'ready' | 'error';
/** `retryable` is false for a refusal (not licensed, not in this release, a role, not found, an expired
 *  session): a retry cannot change it, so the host offers none. */
interface Snapshot { programId: string | null; state: SourceReadState; sources: ProjectSourceRecord[]; loaded: number; total: number | null; error: string | null; retryable: boolean }
interface OwnedSnapshot { visit: DataReadVisit | null; snapshot: Snapshot }
const PAGE_SIZE = 200;
const empty = (programId: string | null): Snapshot => ({ programId, state: programId ? 'loading' : 'idle', sources: [], loaded: 0, total: null, error: null, retryable: true });
const CHANGED = 'The source catalogue changed while it was being read. Retry to read its current complete contents.';

const UNREAD = 'The project source catalogue could not be read.';

/* Why the catalogue was not read, said as what happened (2026-11-06). The founder, 2026-11-05: not
   licensed, not relevant, missing evidence and unavailable to this user are never one generic failure.
   A refused read showed the gate's raw "Module access denied" with Try again. A refusal is worded by the
   one read classifier, as the Data Room panel and the Vault are, and is not retryable; only a failure to
   answer keeps the server's words (or the generic ones) and the retry. */
function readFailure(status: number | undefined, code: string | undefined, fallback: string) {
  if (status === 401) return { ok: false as const, message: 'Your session has expired. Sign in again to read this project’s sources.', retryable: false };
  const kind = readFailureFor(status, code);
  if (kind === 'failed') return { ok: false as const, message: fallback, retryable: true };
  const words = describeReadFailure(kind, 'the project source catalogue');
  return { ok: false as const, message: words.message, retryable: words.retryable };
}

async function readPage(programId: string, offset: number, current: () => boolean) {
  try {
    if (!current()) return null;
    const response = await apiRequest('GET', projectSourceCatalogUrl(programId, { limit: PAGE_SIZE, offset }));
    if (!current()) return null;
    const body: unknown = await response.json().catch(() => null);
    if (!current()) return null;
    if (!response.ok) return readFailure(response.status, errorCodeOf(body), serverMessage(body) ?? UNREAD);
    return parseProjectSourcePage(body, { programId, limit: PAGE_SIZE, offset });
  } catch (error) {
    if (!current()) return null;
    const { status, code } = (error ?? {}) as { status?: unknown; code?: unknown };
    return readFailure(typeof status === 'number' && status > 0 ? status : undefined, typeof code === 'string' ? code : undefined,
      redactInternals(error instanceof Error ? error.message : '', UNREAD));
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
          // Only a refusal says retryable: false; a changed or unparseable page can be read again.
          const retryable = result.ok || (result as { retryable?: boolean }).retryable !== false;
          publish({ programId, state: 'error', sources: [], loaded: sources.length, total, error: result.ok ? CHANGED : result.message, retryable });
          return;
        }
        total = result.page.total;
        result.page.sources.forEach(row => { seen.add(row.id); sources.push(row); });
        offset += result.page.sources.length;
        const complete = !result.page.window.truncated;
        publish({ programId, state: complete ? 'ready' : 'loading', sources: complete ? sources : [], loaded: sources.length, total, error: null, retryable: true });
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
