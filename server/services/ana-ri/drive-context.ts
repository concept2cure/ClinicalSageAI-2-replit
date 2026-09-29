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
 * Every program read: this organisation's live programs, most recently touched
 * first. The tenant predicate is written once, here, so no read can leave it
 * out; a read adds its own match on `$2` after it.
 */
const PROGRAMS_OF_ORG = `SELECT id, name, code FROM regulatory_programs
        WHERE organization_id = $1 AND deleted_at IS NULL`;
const MOST_RECENT_FIRST = `ORDER BY updated_at DESC NULLS LAST, name`;

/** How many of several matches a caller is shown; one more is read to know there are more. */
const MAX_MATCHES_SHOWN = 10;

function toRefs(rows: Array<Record<string, unknown>>): ProgramRef[] {
  return rows.map(toRef).filter((p): p is ProgramRef => p !== null);
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
      `${PROGRAMS_OF_ORG}
        ${MOST_RECENT_FIRST}
        LIMIT $2`,
      [organizationId, Math.max(1, Math.min(100, limit))]
    );
    return { ok: true, programs: toRefs(rows) };
  } catch {
    return { ok: false, programs: [] };
  }
}

export type ProgramResolution =
  | { status: 'found'; program: ProgramRef }
  /** `truncated`: more matched than the ten most recent listed in `matches`. */
  | { status: 'ambiguous'; matches: ProgramRef[]; truncated: boolean }
  | { status: 'not_found'; candidates: ProgramRef[] }
  | { status: 'unavailable' };

/** `ref` as a LIKE literal: its own `\`, `%` and `_` match themselves, not anything. */
function likeLiteral(ref: string): string {
  return ref.replace(/[\\%_]/g, ch => `\\${ch}`);
}

/**
 * Exact: the id, or the name or code case-insensitively. The id column is a
 * uuid, and comparing it as one would make Postgres throw on every reference
 * that is not a uuid — "BX-301", a name — so it is compared as text (a uuid's
 * text form is lower-case, hence `lower($2)`). The code is trimmed, as `toRef`
 * trims it, so the code AnA was shown is the code that opens the program.
 */
const EXACT_MATCH = `${PROGRAMS_OF_ORG}
          AND (id::text = lower($2) OR lower(name) = lower($2) OR lower(btrim(code)) = lower($2))
        ${MOST_RECENT_FIRST}
        LIMIT ${MAX_MATCHES_SHOWN + 1}`;

/** Partial: `$2` is a `%…%` pattern built from `likeLiteral`, so a `%` the person typed is literal. */
const PARTIAL_MATCH = `${PROGRAMS_OF_ORG}
          AND (name ILIKE $2 ESCAPE '\\' OR code ILIKE $2 ESCAPE '\\')
        ${MOST_RECENT_FIRST}
        LIMIT ${MAX_MATCHES_SHOWN + 1}`;

/**
 * Resolve a person's reference to one of THEIR programs: an exact id, an exact
 * code or name (case-insensitive), else a unique partial match on code or
 * name. Never crosses organisations; never guesses between several matches.
 *
 * The matching happens in the database, over every program the organisation
 * has. It used to read the 100 most recently touched and match those in
 * memory, so in a larger workspace an older program could not be opened even
 * by its exact code — it was reported as not existing — and "ambiguous" was
 * judged over whichever hundred happened to be recent.
 *
 * Any failed read is `unavailable`, never `not_found`: a read that errored has
 * not shown that the program is absent.
 */
export async function resolveProgramRef(
  organizationId: number | null | undefined,
  ref: string,
  query: ProgramQuery = defaultQuery
): Promise<ProgramResolution> {
  const wanted = ref.trim();
  if (!organizationId || !wanted) return { status: 'unavailable' };
  const decide = (matches: ProgramRef[]): ProgramResolution | null =>
    matches.length === 1
      ? { status: 'found', program: matches[0] }
      : matches.length > 1
        ? {
            status: 'ambiguous',
            matches: matches.slice(0, MAX_MATCHES_SHOWN),
            truncated: matches.length > MAX_MATCHES_SHOWN,
          }
        : null;
  try {
    // An exact match wins over the partial ones it also satisfies: "BX-30" is
    // one program's code and a prefix of others', and must open that one.
    const exact = decide(toRefs((await query(EXACT_MATCH, [organizationId, wanted])).rows));
    if (exact) return exact;
    const partial = decide(
      toRefs((await query(PARTIAL_MATCH, [organizationId, `%${likeLiteral(wanted)}%`])).rows)
    );
    if (partial) return partial;
  } catch {
    return { status: 'unavailable' };
  }
  const listed = await listProgramCandidates(organizationId, 25, query);
  if (!listed.ok) return { status: 'unavailable' };
  return { status: 'not_found', candidates: listed.programs };
}

/** Compact program list for a tool result the model reads. */
export function programChoices(programs: ProgramRef[]): Array<{ id: string; name: string; code?: string }> {
  return programs.map(p => ({ id: p.id, name: p.name, ...(p.code ? { code: p.code } : {}) }));
}
