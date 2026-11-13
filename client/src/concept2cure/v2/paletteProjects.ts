/**
 * The ⌘K palette's Projects group (2026-10-31 client demo: the palette found screens,
 * steps and AnA actions, and no project). It reads the same project list Projects and
 * Home read, GET /api/c2c/projects, while the palette is open, and matches a search on
 * a project's title and code. A hit opens the project's page the one way every list
 * opens it (shellProject.ts openProjectHome).
 *
 * A failed read is said in the palette, never shown as "no project matches".
 */
import { useMemo } from 'react';
import { useLiveData } from './dataConnect';
import { openProjectHome, type ShellProject } from './shellProject';

/** One row of GET /api/c2c/projects, as the palette uses it. */
export interface PaletteProject {
  id: string;
  title: string;
  code: string | null;
  ws: string | null;
  status: string | null;
}

export type PaletteProjectsRead =
  | { state: 'closed' | 'reading' | 'failed' }
  | { state: 'ready'; projects: PaletteProject[] };

/** The list route's own cap; the palette asks for one page. */
export const PALETTE_PROJECTS_URL = '/api/c2c/projects?limit=200';
/** The most project hits shown under one search. */
const SHOWN = 8;

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

function projectOf(row: unknown): PaletteProject | null {
  const r = (row ?? {}) as Record<string, unknown>;
  const id = text(r.id);
  const title = text(r.title);
  return id && title ? { id, title, code: text(r.code), ws: text(r.ws), status: text(r.status) } : null;
}

const isRows = (v: unknown): v is unknown[] => Array.isArray(v);

/** The organization's projects, read each time the palette opens. */
export function usePaletteProjects(open: boolean): PaletteProjectsRead {
  const read = useLiveData<unknown[]>(open ? PALETTE_PROJECTS_URL : null, [open], isRows);
  const { loading, error, data } = read;
  return useMemo<PaletteProjectsRead>(() => {
    if (!open) return { state: 'closed' };
    if (loading) return { state: 'reading' };
    if (error || !Array.isArray(data)) return { state: 'failed' };
    return { state: 'ready', projects: data.map(projectOf).filter((p): p is PaletteProject => p !== null) };
  }, [open, loading, error, data]);
}

/** A listed project as the shell's open project (shellProject.ts ShellProject). */
export function shellProjectOfPalette(p: PaletteProject): ShellProject & { title: string } {
  return { id: p.id, title: p.title, ...(p.code ? { code: p.code } : {}),
    ...(p.ws ? { ws: p.ws } : {}), ...(p.status ? { status: p.status } : {}) };
}

/** Open a project found in the palette on its page, as Projects and Home open one. */
export function openPaletteProject(p: PaletteProject, onNav: (id: string) => void): void {
  openProjectHome(shellProjectOfPalette(p), onNav);
}

/** What a search lists: the projects shown, and how many others match and are not shown. */
export interface PaletteProjectHits { hits: PaletteProject[]; more: number }

/**
 * Projects whose title or code contains the search. A project whose code or title is exactly the search
 * comes first, then one whose code or title starts with it, then the rest, each group in the list's order
 * (newest-updated first). Only SHOWN are listed, and `more` counts the others, so a cut is never silent:
 * "C2C-101" listed eight newer projects whose codes contained it and dropped C2C-101 itself (S12's sweep,
 * 2026-11-09).
 */
export function paletteProjectResults(projects: readonly PaletteProject[], term: string): PaletteProjectHits {
  const t = term.trim().toLowerCase();
  if (!t) return { hits: [], more: 0 };
  const rank = (p: PaletteProject): number => {
    const code = (p.code ?? '').toLowerCase();
    const title = p.title.toLowerCase();
    if (code === t || title === t) return 0;
    return code.startsWith(t) || title.startsWith(t) ? 1 : 2;
  };
  const matches = projects
    .filter((p) => p.title.toLowerCase().includes(t) || (p.code ?? '').toLowerCase().includes(t))
    .map((p, index) => ({ p, index, rank: rank(p) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((m) => m.p);
  return { hits: matches.slice(0, SHOWN), more: Math.max(0, matches.length - SHOWN) };
}
