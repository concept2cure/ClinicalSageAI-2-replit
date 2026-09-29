/**
 * The designated program, for the workbench and canvas headers.
 *
 * One read — GET /api/c2c/projects/:id, the same row ProjectHome renders —
 * and one way to say it: name, then phase. Nothing here is guessed: with no
 * program id there is no program to name, and a failed read is `error`, not
 * an unnamed program.
 */
import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';

export interface ProgramSummary {
  id: string;
  name: string | null;
  code: string | null;
  phase: string | null;
  programType: string | null;
  status: string | null;
}

export type ProgramSummaryState = 'idle' | 'loading' | 'ready' | 'error';

const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
};

/** The regulatory_programs row as the route serves it (bare row, no envelope —
 *  projects.ts `GET /:id` returns `rows[0]`). Tolerates an envelope anyway. */
export function programFromBody(body: unknown, id: string): ProgramSummary | null {
  if (!body || typeof body !== 'object') return null;
  const raw = ((body as { data?: unknown }).data ?? body) as Record<string, unknown>;
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: str(raw.id) ?? id,
    name: str(raw.name) ?? str(raw.title),
    code: str(raw.code),
    phase: str(raw.phase),
    programType: str(raw.program_type) ?? str(raw.programType),
    status: str(raw.status),
  };
}

/**
 * The program and the state of its read. 2026-09-28 (GE-H-2, coverage-gap
 * sweep): the state this module declares was never returned, so a failed read
 * left `program` null exactly as a read in flight does, and the canvas said
 * "Reading the program…" forever after a 500, a 404 or an expired session.
 */
export function useProgramRead(programId: string | null): { program: ProgramSummary | null; state: ProgramSummaryState } {
  const [program, setProgram] = useState<ProgramSummary | null>(null);
  const [state, setState] = useState<ProgramSummaryState>('idle');
  useEffect(() => {
    let alive = true;
    setProgram(null);
    if (!programId) {
      setState('idle');
      return undefined;
    }
    setState('loading');
    void (async () => {
      try {
        const res = await apiRequest('GET', `/api/c2c/projects/${encodeURIComponent(programId)}`);
        if (!res.ok) {
          if (alive) setState('error');
          return;
        }
        const body = await res.json().catch(() => null);
        if (!alive) return;
        const read = programFromBody(body, programId);
        setProgram(read);
        setState(read ? 'ready' : 'error');
      } catch {
        if (alive) setState('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [programId]);
  return { program, state };
}

/** The program alone, for headers that show nothing until it is read. */
export function useProgramSummary(programId: string | null): ProgramSummary | null {
  return useProgramRead(programId).program;
}

/** The canvas's program line: the program, a read in flight, or a read that failed — never one for another. */
export function programLineFor(program: ProgramSummary | null, state: ProgramSummaryState): string | null {
  const line = programHeadline(program);
  if (line) return line;
  if (state === 'loading') return 'Reading the program…';
  if (state === 'error') return 'Program details could not be read';
  return null;
}

/** The program's name as a person says it — name, else code. */
export function programName(p: ProgramSummary | null): string | null {
  if (!p) return null;
  return p.name ?? p.code ?? null;
}

/** "planning" → "Planning", "ind_enabling" → "IND enabling". */
export function programPhase(p: ProgramSummary | null): string | null {
  const raw = p?.phase;
  if (!raw) return null;
  const words = raw.replace(/[_-]+/g, ' ').trim();
  if (!words) return null;
  return words
    .split(' ')
    .map((w, i) => (/^(ind|nda|bla|maa|ide|pma|cta|ctd)$/i.test(w) ? w.toUpperCase() : i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** "<name> · <phase>" — the header line; name alone when no phase is recorded. */
export function programHeadline(p: ProgramSummary | null): string | null {
  const name = programName(p);
  if (!name) return null;
  const phase = programPhase(p);
  return phase ? `${name} · ${phase}` : name;
}
