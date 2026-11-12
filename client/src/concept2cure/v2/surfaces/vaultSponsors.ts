/**
 * The Vault with no project open, for an organization that works for several sponsors (a CRO).
 *
 * Founder decision P-107, item 3 (2026-11-08): "With no project open, the Vault first asks which sponsor; every view
 * is inside one sponsor. Search never spans sponsors." The list of projects and the organization's governed
 * artifacts were shown across every sponsor at once. This reads the sponsors from the projects the person can open
 * (the project list's client workspace, `client_workspace_id`; `ws` is the product segment, not a sponsor) and gates what is shown; the server does the narrowing itself, from
 * the verified sponsor of the anchor project (`sameClientAs`), never from a sponsor the request names.
 */
import { useMemo } from 'react';
import { useLiveData } from '../dataConnect';
import { PALETTE_PROJECTS_URL, type PaletteProject } from '../paletteProjects';

/** A project of the list with its sponsor: the client workspace the project is anchored to, never its segment. */
export interface VaultProject extends PaletteProject {
  clientId: string | null;
  clientName: string | null;
}

export type VaultProjectsRead = { state: 'closed' | 'reading' | 'failed' } | { state: 'ready'; projects: VaultProject[] };

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** One row of GET /api/c2c/projects, with `client_workspace_id` and `client_name` kept. A row with no id or title is not a project. */
export function vaultProjectOf(row: unknown): VaultProject | null {
  const r = (row ?? {}) as Record<string, unknown>;
  const id = text(r.id);
  const title = text(r.title);
  if (!id || !title) return null;
  const client = r.client_workspace_id;
  return {
    id, title, code: text(r.code), ws: text(r.ws), status: text(r.status),
    clientId: typeof client === 'number' || (typeof client === 'string' && client.trim()) ? String(client) : null,
    clientName: text(r.client_name),
  };
}

/** The projects the person can open, with each one's sponsor: the palette's own read of the list, read while `open`. */
export function useVaultProjects(open: boolean): VaultProjectsRead {
  const { loading, error, data } = useLiveData<unknown[]>(open ? PALETTE_PROJECTS_URL : null, [open], (v): v is unknown[] => Array.isArray(v));
  return useMemo<VaultProjectsRead>(() => {
    if (!open) return { state: 'closed' };
    if (loading) return { state: 'reading' };
    if (error || !Array.isArray(data)) return { state: 'failed' };
    return { state: 'ready', projects: data.map(vaultProjectOf).filter((p): p is VaultProject => p !== null) };
  }, [open, loading, error, data]);
}

/** The key of the projects that carry no client workspace. */
export const NO_SPONSOR = '\u0000none';

export interface VaultSponsor {
  key: string;
  name: string;
  projects: VaultProject[];
}

/** The sponsors of these projects, by name, with the projects that record none last. */
export function sponsorsOf(projects: readonly VaultProject[]): VaultSponsor[] {
  const by = new Map<string, VaultSponsor>();
  for (const p of projects) {
    const key = p.clientId ?? NO_SPONSOR;
    const s = by.get(key) ?? { key, name: p.clientId ? p.clientName ?? `Client ${p.clientId}` : 'No client recorded', projects: [] };
    s.projects.push(p);
    by.set(key, s);
  }
  return [...by.values()].sort((a, b) =>
    a.key === NO_SPONSOR ? 1 : b.key === NO_SPONSOR ? -1 : a.name.localeCompare(b.name));
}

export interface SponsorGate {
  /** True while the person has to say which sponsor: nothing of any sponsor is shown. */
  ask: boolean;
  sponsors: VaultSponsor[];
  /** The projects to list: the chosen sponsor's, or the only sponsor's. */
  projects: VaultProject[];
  /** A project of that sponsor, by which the server narrows the organization's artifacts; null when there is none. */
  anchorProjectId: string | null;
}

/** What the no-project Vault shows, given the sponsor chosen (or none yet). A choice no longer listed asks again. */
export function sponsorGate(projects: readonly VaultProject[], chosen: string | null): SponsorGate {
  const sponsors = sponsorsOf(projects);
  const one = sponsors.length <= 1 ? sponsors[0] ?? null : sponsors.find((s) => s.key === chosen) ?? null;
  if (sponsors.length > 1 && !one) return { ask: true, sponsors, projects: [], anchorProjectId: null };
  return { ask: false, sponsors, projects: one?.projects ?? [], anchorProjectId: one?.projects[0]?.id ?? null };
}
