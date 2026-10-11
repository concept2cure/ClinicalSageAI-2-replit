/**
 * A project's AnA conversations, a screenful at a time.
 *
 * The project page listed the newest 8 of a program's conversations and
 * nothing else: with 25 on the program, 17 could not be opened from the
 * project at all (QA 2026-10-08, j5). Each read now asks for one more than a
 * screenful, which says whether older ones exist without a count query, and
 * "Show older conversations" reads the next screenful from where the list
 * ends (GET /api/chat/threads?program_id=&limit=&offset=). A failed read says
 * so and keeps what is shown; it is never shown as the end of the list.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { hasKeys, liveGetOrNull, useLiveData, type DataState } from '../dataConnect';

/** One persisted AnA thread of this program (GET /api/chat/threads?program_id=). */
export interface ThreadRow { id: string; title: string | null; created_at: string | null; updated_at: string | null; program_id?: string | null }

/** How many conversations a screenful shows. */
export const THREAD_PAGE = 8;

function threadsUrl(pid: string, offset: number): string {
  const base = `/api/chat/threads?program_id=${encodeURIComponent(pid)}&limit=${THREAD_PAGE + 1}`;
  return offset > 0 ? `${base}&offset=${offset}` : base;
}

export interface ProjectThreads {
  /** The first read, for the section's loading, error and empty states. */
  state: DataState<{ threads: ThreadRow[] }>;
  /** Every conversation read so far, newest first, each once. */
  shown: ThreadRow[];
  /** A read returned more than a screenful: there are older ones. */
  hasOlder: boolean;
  loadingOlder: boolean;
  /** Why the last older read failed, or null. */
  olderError: string | null;
  showOlder: () => void;
}

export function useProjectThreads(pid: string | null): ProjectThreads {
  /* A reply with no `threads` is a failed read, never an empty list (design
     review 2026-10-08, honest-state lens). */
  const state = useLiveData<{ threads: ThreadRow[] }>(pid ? threadsUrl(pid, 0) : null, [pid], hasKeys<{ threads: ThreadRow[] }>('threads'));
  const first = state.data?.threads ?? [];
  const [older, setOlder] = useState<{ rows: ThreadRow[]; more: boolean | null }>({ rows: [], more: null });
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);
  /* A program switch starts the list over; a read for the last program that
     lands afterwards is dropped. */
  const pidRef = useRef(pid);
  useEffect(() => {
    pidRef.current = pid;
    setOlder({ rows: [], more: null });
    setOlderError(null);
    setLoadingOlder(false);
  }, [pid]);

  const seen = new Set<string>();
  const shown = [...first.slice(0, THREAD_PAGE), ...older.rows].filter((t) => !seen.has(t.id) && seen.add(t.id));
  const hasOlder = older.more ?? first.length > THREAD_PAGE;
  /* Where the next read starts: the rows read so far, before any repeat is
     dropped (a conversation updated between reads moves to the top). */
  const readSoFar = Math.min(first.length, THREAD_PAGE) + older.rows.length;

  const showOlder = useCallback(() => {
    if (!pid || loadingOlder) return;
    const forPid = pid;
    setLoadingOlder(true);
    setOlderError(null);
    void liveGetOrNull<{ threads: ThreadRow[] }>(threadsUrl(forPid, readSoFar)).then((r) => {
      if (pidRef.current !== forPid) return;
      setLoadingOlder(false);
      if (r.error || !Array.isArray(r.data?.threads)) {
        setOlderError("Couldn't load older conversations. Try again.");
        return;
      }
      const page = r.data.threads;
      setOlder((prev) => ({ rows: [...prev.rows, ...page.slice(0, THREAD_PAGE)], more: page.length > THREAD_PAGE }));
    });
  }, [pid, loadingOlder, readSoFar]);

  return { state, shown, hasOlder, loadingOlder, olderError, showOlder };
}
