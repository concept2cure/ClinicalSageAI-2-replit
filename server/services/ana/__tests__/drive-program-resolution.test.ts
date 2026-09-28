/**
 * The program AnA opens — found in the real table, and carried to her next
 * move in the same round.
 *
 * ── The window ───────────────────────────────────────────────────────────────
 * Resolution read the 100 most recently touched programs and matched in
 * memory. In a workspace with more, an older program could not be opened even
 * by its exact code (it was "not found"), and "ambiguous" was judged over
 * whichever hundred were recent — so a name shared with an older program was
 * opened as if it were unique. The match now runs in SQL; these tests run that
 * SQL on Postgres (PGlite, with the migration that creates the table), which
 * is also the only place three of its details can be seen to hold: the uuid id
 * is compared as text, so "BX-301" is not an error; the person's `%`, `_` and
 * `\` are literal; and the tenant predicate is on every read.
 *
 * ── The race ─────────────────────────────────────────────────────────────────
 * The stream runs one round's tool calls concurrently (mapWithConcurrency).
 * "Open BX-301" (act_on_screen projects.open-program) and "take me to its
 * Vault" (navigate_to) asked in the same round raced: the navigation read the
 * turn's program before the open's database read returned, and asked which
 * program — or showed the one that had been open before. The reads of the
 * program being opened are held back here so the race is lost every time
 * rather than some of the time.
 *
 * ── The guess ────────────────────────────────────────────────────────────────
 * act_on_screen handed every open to the Projects screen, which matches it
 * against the one page of the portfolio it loaded. Once the server judged
 * ambiguity over every program, a reference it knew named two could still
 * look unique on that page, and the screen opened one of them.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

import { resolveProgramRef, type ProgramQuery } from '../../ana-ri/drive-context.js';
import { getToolHandler, type ToolContext } from '../AnaToolExecutor.js';
import { mapWithConcurrency } from '../agentic-loop.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CREATOR = path.resolve(here, '../../../../migrations/20260524_program_workbench_schema.sql');

const ORG = 5;
const OTHER_ORG = 6;
// Hex letters in every id, so an upper-cased id is a different string.
const U = (n: number) => `abcdef00-0000-4000-8000-${String(n).padStart(12, '0')}`;
const BX301 = { id: U(301), name: 'Bexarotene Phase 2', code: 'BX-301' };
const BX302 = { id: U(302), name: 'Bexarotene Phase 3', code: 'BX-302' };
const LEGACY = { id: U(7), name: 'Zeta Device Study', code: 'LEGACY-7' };

let pg: PGlite;
const sql: ProgramQuery = (text, params) => pg.query(text, params);

/** Program reads whose $2 contains `match` answer only after `ms`. */
let held: Array<{ match: string; ms: number }> = [];

/**
 * The handlers read programs through the app's pool. It is patched, not the
 * db module mocked: drive-context imports db.js lazily on every read, and
 * vitest hands the ORIGINAL module to some of several concurrent dynamic
 * imports of a mocked one — so a mock is bypassed by exactly the concurrent
 * reads this file races (they reached the stub pool and found nothing).
 */
let restorePool: (() => void) | null = null;
async function routePoolToPostgres() {
  const { getPool } = await import('../../../db.js');
  const shared = getPool() as unknown as { query: (q: unknown, params?: unknown[]) => unknown };
  const original = shared.query;
  shared.query = async (q: unknown, params?: unknown[]) => {
    const text = typeof q === 'string' ? q : String((q as { text?: unknown } | null)?.text ?? '');
    // Other modules use the pool too (telemetry); only the program reads matter.
    if (!text.includes('FROM regulatory_programs')) return { rows: [], rowCount: 0 };
    const arg = String(params?.[1] ?? '').toLowerCase();
    for (const h of held) {
      if (arg.includes(h.match.toLowerCase())) await new Promise(r => setTimeout(r, h.ms));
    }
    return pg.query(text, params ?? []);
  };
  restorePool = () => {
    shared.query = original;
  };
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(fs.readFileSync(CREATOR, 'utf8'));
  const add = (org: number, id: string, name: string, code: string, daysAgo: number, deleted = false) =>
    pg.query(
      `INSERT INTO regulatory_programs
         (id, organization_id, name, code, program_type, product_type, primary_agency, product_name, updated_at, deleted_at)
       VALUES ($1::uuid, $2, $3, $4, 'IND', 'drug', 'FDA', $3, now() - make_interval(days => $5), $6)`,
      [id, org, name, code, daysAgo, deleted ? new Date() : null]
    );
  await add(ORG, BX301.id, BX301.name, BX301.code, 1);
  await add(ORG, BX302.id, BX302.name, BX302.code, 2);
  await add(ORG, U(303), 'Zeta Stability Study', 'ZS-1', 3);
  await add(ORG, U(304), 'Legacy Formulation', 'BX-30', 4);
  await add(ORG, U(305), 'Dose Escalation 50% Cohort', 'DE-50', 5);
  await add(ORG, U(306), 'Oncology Basket', 'ONC_B', 6);
  await add(ORG, U(307), 'Deleted Program', 'DEL-1', 0, true);
  // 130 more, so the workspace has more programs than any recent window.
  for (let i = 1; i <= 130; i++) {
    await add(ORG, U(1000 + i), `Program ${String(i).padStart(3, '0')}`, `P-${i}`, 10 + i);
  }
  // The oldest program of all: the 137th most recently touched.
  await add(ORG, LEGACY.id, LEGACY.name, LEGACY.code, 1000);
  // Another organisation's programs, one with the same code as ORG's.
  await add(OTHER_ORG, U(6301), 'Other Tenant Bexarotene', 'BX-301', 1);
  await add(OTHER_ORG, U(6302), 'Other Tenant Only', 'OT-9', 2);
  await routePoolToPostgres();
}, 60_000);

afterAll(async () => {
  restorePool?.();
  await pg?.close();
});

afterEach(() => {
  held = [];
});

// ─────────────────────────────────────────────────────────────────────────────
// The window: resolution against the real table
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveProgramRef — against Postgres', () => {
  it('opens the oldest program by its exact code — the 137th most recent', async () => {
    const r = await resolveProgramRef(ORG, 'legacy-7', sql);
    expect(r).toEqual({ status: 'found', program: LEGACY });
  });

  it('opens a program by its id, as the uuid it is, in either case', async () => {
    expect(await resolveProgramRef(ORG, BX301.id, sql)).toEqual({ status: 'found', program: BX301 });
    expect(await resolveProgramRef(ORG, BX301.id.toUpperCase(), sql)).toEqual({ status: 'found', program: BX301 });
  });

  it('a reference that is not a uuid is a reference, not a database error', async () => {
    // Compared as a uuid, every code and name made Postgres throw "invalid
    // input syntax for type uuid" — and every open was "unavailable".
    expect(await resolveProgramRef(ORG, 'BX-301', sql)).toEqual({ status: 'found', program: BX301 });
    expect((await resolveProgramRef(ORG, "x'; DROP TABLE regulatory_programs; --", sql)).status).toBe('not_found');
  });

  it('an exact code wins over the programs it is a prefix of', async () => {
    const r = await resolveProgramRef(ORG, 'BX-30', sql);
    expect(r.status === 'found' && r.program.id).toBe(U(304));
  });

  it('judges ambiguity over every program, most recent first', async () => {
    // Among the 100 most recent, "zeta" is unique; opening it would have been
    // a guess between two of the person's programs.
    const r = await resolveProgramRef(ORG, 'zeta', sql);
    expect(r).toEqual({
      status: 'ambiguous',
      matches: [{ id: U(303), name: 'Zeta Stability Study', code: 'ZS-1' }, LEGACY],
      truncated: false,
    });
  });

  it('lists ten of many matches, most recent first, and says there were more', async () => {
    const r = await resolveProgramRef(ORG, 'program', sql);
    expect(r.status).toBe('ambiguous');
    if (r.status !== 'ambiguous') return;
    expect(r.matches.map(p => p.name)).toEqual(
      Array.from({ length: 10 }, (_, i) => `Program ${String(i + 1).padStart(3, '0')}`)
    );
    expect(r.truncated).toBe(true);
  });

  it('"%" is a character, not "every program"', async () => {
    const r = await resolveProgramRef(ORG, '%', sql);
    expect(r.status === 'found' && r.program.code).toBe('DE-50');
  });

  it('"_" is a character, not "any one character"', async () => {
    const r = await resolveProgramRef(ORG, 'c_b', sql);
    expect(r.status === 'found' && r.program.code).toBe('ONC_B');
    // Unescaped, "n_o" is "n, any character, o" — the "nco" of Oncology.
    expect((await resolveProgramRef(ORG, 'n_o', sql)).status).toBe('not_found');
  });

  it('"\\" is a character, not an escape of the one after it', async () => {
    // Unescaped, "onc\ology" is the pattern for "oncology" — and opens a
    // program the person did not name.
    expect((await resolveProgramRef(ORG, 'onc\\ology', sql)).status).toBe('not_found');
  });

  it('never reads another organisation, and never a deleted program', async () => {
    const theirs = await resolveProgramRef(OTHER_ORG, 'BX-301', sql);
    expect(theirs.status === 'found' && theirs.program.id).toBe(U(6301));
    expect((await resolveProgramRef(ORG, 'Other Tenant', sql)).status).toBe('not_found');

    const deleted = await resolveProgramRef(ORG, 'DEL-1', sql);
    expect(deleted.status).toBe('not_found');
    expect(deleted.status === 'not_found' && deleted.candidates.map(p => p.code)).not.toContain('DEL-1');
  });

  it('not_found offers the 25 most recent programs that do exist', async () => {
    const r = await resolveProgramRef(ORG, 'ZZ-999', sql);
    expect(r.status).toBe('not_found');
    if (r.status !== 'not_found') return;
    expect(r.candidates).toHaveLength(25);
    expect(r.candidates.slice(0, 2)).toEqual([BX301, BX302]);
  });

  it('navigate_to opens a program older than any recent window', async () => {
    const out = await call('navigate_to', { target: 'vault', program: 'LEGACY-7' }, { organizationId: ORG, userId: 1, projectId: null });
    expect(out.status).toBe('navigation_ready');
    expect(out.directive.program).toEqual(LEGACY);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The race: a program opened and a project screen asked for in one round
// ─────────────────────────────────────────────────────────────────────────────

async function call(tool: string, input: Record<string, unknown>, ctx?: ToolContext) {
  const handler = getToolHandler(tool);
  if (!handler) throw new Error(`no handler for ${tool}`);
  return JSON.parse(await handler(input, ctx));
}

/** One model round, run the way stream.ts runs it: concurrently, results in order. */
function round(ctx: ToolContext, calls: Array<[string, Record<string, unknown>]>) {
  return mapWithConcurrency(calls, ([tool, input]) => call(tool, input, ctx), 4);
}

function turn(opts: { program?: typeof BX301 | null; projectRef?: string | null } = {}): ToolContext {
  return {
    organizationId: ORG,
    userId: 1,
    projectId: null,
    projectRef: opts.projectRef ?? null,
    liveDrive: true,
    turnState: { program: opts.program ?? null },
  };
}

const OPEN = (program: string): [string, Record<string, unknown>] => [
  'act_on_screen',
  { action: 'projects.open-program', params: { program } },
];
const TO_VAULT: [string, Record<string, unknown>] = ['navigate_to', { target: 'vault' }];

describe('turnState — a program opened and a project screen asked for in the same round', () => {
  beforeAll(async () => {
    // Load every module the handlers import, so what the race measures is the
    // program read and not a first import.
    await round(turn({ program: BX301 }), [OPEN('BX-301'), TO_VAULT]);
  });

  it('the navigation shows the program being opened, not "which program?"', async () => {
    held = [{ match: 'BX-301', ms: 150 }];
    const ctx = turn();
    const [opened, moved] = await round(ctx, [OPEN('BX-301'), TO_VAULT]);
    expect(opened.status).toBe('action_ready');
    expect(moved.status, 'asked which program a moment after opening one').toBe('navigation_ready');
    expect(moved.directive.program).toEqual(BX301);
    expect(ctx.turnState?.program).toEqual(BX301);
    expect(ctx.turnState?.pendingProgram ?? null, 'a settled open is not left pending').toBeNull();
  });

  it('the navigation shows the program being opened, not the one open before it', async () => {
    held = [{ match: 'BX-301', ms: 150 }];
    const ctx = turn({ program: BX302, projectRef: BX302.id });
    const [, moved] = await round(ctx, [OPEN('BX-301'), TO_VAULT]);
    expect(moved.directive.program).toEqual(BX301);
  });

  it('a program named on one navigation carries to the next in the same round', async () => {
    held = [{ match: 'BX-301', ms: 150 }];
    const ctx = turn();
    const [first, second] = await round(ctx, [
      ['navigate_to', { target: 'vault', program: 'BX-301' }],
      ['navigate_to', { target: 'cmc' }],
    ]);
    expect(first.directive.program).toEqual(BX301);
    expect(second.status).toBe('navigation_ready');
    expect(second.directive.program).toEqual(BX301);
  });

  it('two opens in one round leave the second open, even when the first one\'s read returns last', async () => {
    held = [{ match: 'BX-302', ms: 200 }];
    const ctx = turn();
    const [, , moved] = await round(ctx, [OPEN('BX-302'), OPEN('BX-301'), TO_VAULT]);
    expect(moved.directive.program).toEqual(BX301);
    expect(ctx.turnState?.program, 'the next round would show the program the screen is no longer on').toEqual(BX301);
  });

  it('a navigation asked BEFORE the open does not take the program the open is about to set', async () => {
    held = [{ match: 'BX-301', ms: 150 }];
    const ctx = turn({ program: BX302, projectRef: BX302.id });
    const [moved] = await round(ctx, [TO_VAULT, OPEN('BX-301')]);
    expect(moved.directive.program).toEqual(BX302);
    expect(ctx.turnState?.program).toEqual(BX301);
  });

  it('an open that resolves nothing, or is refused, releases the moves waiting on it', async () => {
    const unknown = turn({ program: BX302, projectRef: BX302.id });
    const [, moved] = await round(unknown, [OPEN('ZZ-999'), TO_VAULT]);
    expect(moved.directive.program).toEqual(BX302);
    expect(unknown.turnState?.pendingProgram ?? null).toBeNull();

    // Refused before it reads anything: the Projects screen is locked here.
    const locked: ToolContext = { ...turn({ program: BX302, projectRef: BX302.id }), lockedScreens: new Map([['projects', 'plan tier']]) };
    const [refused, movedAnyway] = await round(locked, [OPEN('BX-301'), TO_VAULT]);
    expect(refused.status).toBe('not_available');
    expect(movedAnyway.directive.program).toEqual(BX302);
    expect(locked.turnState?.pendingProgram ?? null).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// An open the server knows is ambiguous is never handed to the screen
// ─────────────────────────────────────────────────────────────────────────────

describe('act_on_screen projects.open-program — a reference that names several programs', () => {
  // "zeta" names two programs: the 3rd most recently touched and the oldest
  // (the 137th). The Projects screen resolves an open against the one page of
  // the portfolio it loaded (/api/c2c/projects, the 50 most recent), where
  // "zeta" is unique. The directive went to it anyway, so the screen opened
  // Zeta Stability Study — a guess between two of the person's programs —
  // while the turn recorded no program, and the next project screen asked
  // which one or showed the program open before.
  it('is refused with the programs it names, and the screen is not asked to guess', async () => {
    const ctx = turn({ program: BX302, projectRef: BX302.id });
    const [opened, moved] = await round(ctx, [OPEN('zeta'), TO_VAULT]);
    expect(opened.status, 'the directive reached a screen that would open one of the two').toBe('needs_parameters');
    expect(opened.directive).toBeUndefined();
    expect(opened.programs.map((p: { code?: string }) => p.code)).toEqual(['ZS-1', 'LEGACY-7']);
    // Nothing opened, so the Vault stays on the program that was open.
    expect(moved.directive.program).toEqual(BX302);
    expect(ctx.turnState?.program).toEqual(BX302);
  });

  it('is refused on the chat route too, which offers the open as a chip and keeps no turn state', async () => {
    const out = await call(
      'act_on_screen',
      { action: 'projects.open-program', params: { program: 'zeta' } },
      { organizationId: ORG, userId: 1, projectId: null }
    );
    expect(out.status).toBe('needs_parameters');
    expect(out.directive).toBeUndefined();
  });

  it('navigate_to and act_on_screen refuse an ambiguous program in the same words', async () => {
    const viaNav = await call('navigate_to', { target: 'vault', program: 'program' }, turn());
    const viaOpen = await call('act_on_screen', { action: 'projects.open-program', params: { program: 'program' } }, turn());
    expect(viaOpen).toEqual(viaNav);
    expect(viaNav.message).toMatch(/matches more than 10 programs/);
    expect(viaNav.programs).toHaveLength(10);
  });

  it('a failed read refuses navigate_to, and leaves the open to the screen\'s own read', async () => {
    // No organisation: resolution is `unavailable` without a query.
    const unread: ToolContext = { ...turn(), organizationId: null };
    const moved = await call('navigate_to', { target: 'vault', program: 'BX-301' }, unread);
    expect(moved.status).toBe('error');
    expect(moved.directive).toBeUndefined();
    const opened = await call('act_on_screen', { action: 'projects.open-program', params: { program: 'BX-301' } }, unread);
    expect(opened.status).toBe('action_ready');
    expect(unread.turnState?.program ?? null).toBeNull();
  });

  it('a reference that names one program still opens it', async () => {
    const ctx = turn();
    const opened = await call('act_on_screen', { action: 'projects.open-program', params: { program: 'LEGACY-7' } }, ctx);
    expect(opened.status).toBe('action_ready');
    expect(opened.directive.params.program).toBe('LEGACY-7');
    expect(ctx.turnState?.program).toEqual(LEGACY);
  });

  // LEGACY-7 is the 137th most recent program: the Projects screen lists the
  // 50 most recent, so it could only refuse the open as "No program named".
  it('hands the screen the program found, so one past its first page opens', async () => {
    const opened = await call('act_on_screen', { action: 'projects.open-program', params: { program: 'legacy-7' } }, turn());
    expect(opened.directive.program).toEqual(LEGACY);
    expect(opened.directive.params).toEqual({ program: 'legacy-7' });
  });

  it('a program the model supplies never reaches the screen, as a param or beside one', async () => {
    const missed = await call(
      'act_on_screen',
      {
        action: 'projects.open-program',
        params: { program: 'no such program', programId: BX301.id },
        program: { id: BX301.id, name: 'Forged' },
      },
      turn(),
    );
    // A miss still goes to the screen, which refuses it with its own list.
    expect(missed.status).toBe('action_ready');
    expect(missed.directive.params).toEqual({ program: 'no such program' });
    expect(missed.directive.program).toBeUndefined();
  });
});
