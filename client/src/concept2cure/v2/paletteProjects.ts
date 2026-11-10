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
  /** The project's client (its sponsor, for a CRO), or null when it has none; absent where the list was not asked for it. */
  client?: { id: number; name: string } | null;
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
  return id && title ? { id, title, code: text(r.code), ws: text(r.ws), status: text(r.status), client: clientOf(r) } : null;
}

function clientOf(r: Record<string, unknown>): PaletteProject['client'] {
  const id = Number(r.client_workspace_id);
  const name = text(r.client_name);
  return r.client_workspace_id != null && Number.isInteger(id) && id > 0 && name ? { id, name } : null;
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

/** Open a project found in the palette on its page, as Projects and Home open one. */
/** A listed project as the shell's open project (shellProject.ts ShellProject). */
export function shellProjectOfPalette(p: PaletteProject): ShellProject & { title: string } {
  return { id: p.id, title: p.title, ...(p.code ? { code: p.code } : {}),
    ...(p.ws ? { ws: p.ws } : {}), ...(p.status ? { status: p.status } : {}) };
}

export function openPaletteProject(p: PaletteProject, onNav: (id: string) => void): void {
  openProjectHome(shellProjectOfPalette(p), onNav);
}

/** Projects whose title or code contains the search, in the list's order. */
export function paletteProjectResults(projects: readonly PaletteProject[], term: string): PaletteProject[] {
  const t = term.trim().toLowerCase();
  if (!t) return [];
  return projects.filter((p) => p.title.toLowerCase().includes(t) || (p.code ?? '').toLowerCase().includes(t)).slice(0, SHOWN);
}
