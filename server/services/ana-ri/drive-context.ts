/**
 * What AnA's hands need to know about the person's workspace before she
 * moves — which screens are closed to them, and which programs exist.
 *
 * ── Locked screens ───────────────────────────────────────────────────────────
 * The shell reads the server's own per-request verdict set
 * (/api/module-subscriptions/navigation: launch scope, plan tier, module
 * grants) and sends, with every turn, the navigation targets whose screen that
 * verdict locks. navigate_to, act_on_screen and the demonstration tools refuse
 * them honestly instead of "taking" the person to a "not in this release"
 * panel — in production, with the launch catalog enforced, that was 61 of 96
 * targets and every stop of both MedTech demonstrations.
 *
 * The list only ever RESTRICTS what AnA attempts. A client that under-reports
 * gets moves into locked panels (the gate still holds); one that over-reports
 * gets fewer moves. Nothing here grants access to anything.
 *
 * ── Programs ─────────────────────────────────────────────────────────────────
 * Project-scoped screens (the Vault, CMC, Authoring, …) show a program. AnA
 * resolves the one the person named — by id, code or name, within their own
 * organisation — so "take me to the Vault for BX-301" opens BX-301's vault
 * instead of an empty "open a program" state, and a demonstration has real
 * programs to open rather than a name guessed from its script.
 *
 * @module server/services/ana-ri/drive-context
 */

/** At most this many locked targets are read off a request (the registry has ~100). */
export const MAX_LOCKED_SCREENS = 200;

/**
 * Read `locked_screens` off a stream request body: `[{ id, reason? }]`.
 * Anything malformed is dropped; the result maps target id → reason.
 */
export function parseLockedScreens(raw: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (!Array.isArray(raw)) return out;
  for (const entry of raw.slice(0, MAX_LOCKED_SCREENS)) {
    if (!entry || typeof entry !== 'object') continue;
    const { id, reason } = entry as { id?: unknown; reason?: unknown };
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) continue;
    out.set(id, typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 160) : 'not available here');
  }
  return out;
}

export interface ProgramRef {
  id: string;
  name: string;
  code: string | null;
}

/** A pool-shaped query function (injected so this module tests without a DB). */
export type ProgramQuery = (
  text: string,
  params: unknown[]
) => Promise<{ rows: Array<Record<string, unknown>> }>;

async function defaultQuery(text: string, params: unknown[]) {
  const { getPool } = await import('../../db.js');
  return getPool().query(text, params);
}

function toRef(row: Record<string, unknown>): ProgramRef | null {
  const id = row.id == null ? '' : String(row.id);
  const name = typeof row.name === 'string' ? row.name : '';
  if (!id || !name) return null;
  const code = typeof row.code === 'string' && row.code.trim() ? row.code.trim() : null;
  return { id, name, code };
}

/**
 * The organisation's programs, most recently touched first — the candidates
 * AnA offers or picks from. Empty on any read failure (the caller says so;
 * an empty list is never presented as "you have no programs" unless it came
 * back empty from a successful read — see `ok`).
 */
export async function listProgramCandidates(
  organizationId: number | null | undefined,
  limit = 25,
  query: ProgramQuery = defaultQuery
): Promise<{ ok: boolean; programs: ProgramRef[] }> {
  if (!organizationId) return { ok: false, programs: [] };
  try {
    const { rows } = await query(
      `SELECT id, name, code FROM regulatory_programs
        WHERE organization_id = $1 AND deleted_at IS NULL
        ORDER BY updated_at DESC NULLS LAST, name
        LIMIT $2`,
      [organizationId, Math.max(1, Math.min(100, limit))]
    );
    return { ok: true, programs: rows.map(toRef).filter((p): p is ProgramRef => p !== null) };
  } catch {
    return { ok: false, programs: [] };
  }
}

export type ProgramResolution =
  | { status: 'found'; program: ProgramRef }
  | { status: 'ambiguous'; matches: ProgramRef[] }
  | { status: 'not_found'; candidates: ProgramRef[] }
  | { status: 'unavailable' };

/**
 * Resolve a person's reference to one of THEIR programs: an exact id, an exact
 * code or name (case-insensitive), else a unique partial match on code or
 * name. Never crosses organisations; never guesses between several matches.
 */
export async function resolveProgramRef(
  organizationId: number | null | undefined,
  ref: string,
  query: ProgramQuery = defaultQuery
): Promise<ProgramResolution> {
  const wanted = ref.trim();
  if (!organizationId || !wanted) return { status: 'unavailable' };
  const listed = await listProgramCandidates(organizationId, 100, query);
  if (!listed.ok) return { status: 'unavailable' };
  const programs = listed.programs;
  const lower = wanted.toLowerCase();
  const exact = programs.filter(
    p => p.id === wanted || p.name.toLowerCase() === lower || (p.code ?? '').toLowerCase() === lower
  );
  if (exact.length === 1) return { status: 'found', program: exact[0] };
  if (exact.length > 1) return { status: 'ambiguous', matches: exact.slice(0, 10) };
  const partial = programs.filter(
    p => p.name.toLowerCase().includes(lower) || (p.code ?? '').toLowerCase().includes(lower)
  );
  if (partial.length === 1) return { status: 'found', program: partial[0] };
  if (partial.length > 1) return { status: 'ambiguous', matches: partial.slice(0, 10) };
  return { status: 'not_found', candidates: programs.slice(0, 25) };
}

/** Compact program list for a tool result the model reads. */
export function programChoices(programs: ProgramRef[]): Array<{ id: string; name: string; code?: string }> {
  return programs.map(p => ({ id: p.id, name: p.name, ...(p.code ? { code: p.code } : {}) }));
}
