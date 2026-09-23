/**
 * What AnA's hands know before she moves — which screens are closed to this
 * person, which programs they have — and what the prompt tells her to do with
 * those hands.
 *
 * ── Locked screens ───────────────────────────────────────────────────────────
 * `locked_screens` arrives on the stream request body, i.e. from the client.
 * It may only ever RESTRICT what AnA attempts, so the parser's job is to be
 * boring: drop what is malformed, never let a hostile body grow the map without
 * bound, and give every entry a reason she can say out loud.
 *
 * ── Programs ─────────────────────────────────────────────────────────────────
 * "Take me to the Vault for BX-301" must open THIS organisation's BX-301, or
 * say plainly that it cannot — never guess between two, never find another
 * tenant's, and never present a failed read as "you have no programs".
 *
 * ── The prompt ───────────────────────────────────────────────────────────────
 * With Live Drive on she answered "click Settings in the sidebar" instead of
 * going there. The block has to tell her to DO the move, to run demos, and
 * what a "[Screen report]" means; with Live Drive off it must say the moves are
 * OFFERED, so she never claims one she did not make.
 */

import { describe, it, expect, vi } from 'vitest';

import {
  parseLockedScreens,
  resolveProgramRef,
  listProgramCandidates,
  MAX_LOCKED_SCREENS,
  type ProgramQuery,
} from '../drive-context';
import { buildLiveDrivePromptBlock, buildOfferedMovesPromptBlock } from '../live-drive';
import { MAX_NAVIGATION_ACTIONS } from '../navigation-actions';
import { DRIVE_BUDGETS } from '../../../../shared/navigation/drive-policy';

// ─────────────────────────────────────────────────────────────────────────────
// parseLockedScreens
// ─────────────────────────────────────────────────────────────────────────────

describe('parseLockedScreens', () => {
  it('reads well-formed entries into target id → reason', () => {
    const out = parseLockedScreens([
      { id: 'cmc', reason: 'not in this release' },
      { id: 'device-510k', reason: '  plan tier  ' },
    ]);
    expect([...out.entries()]).toEqual([
      ['cmc', 'not in this release'],
      ['device-510k', 'plan tier'],
    ]);
  });

  it('gives every entry a reason she can say, even when none was sent', () => {
    const out = parseLockedScreens([{ id: 'cmc' }, { id: 'risk', reason: '   ' }, { id: 'vault', reason: 42 }]);
    for (const id of ['cmc', 'risk', 'vault']) {
      expect(out.get(id), `${id} had no reason`).toBeTruthy();
      expect(out.get(id)!.trim().length).toBeGreaterThan(0);
    }
  });

  it('drops malformed entries and ids rather than guessing at them', () => {
    const out = parseLockedScreens([
      null,
      'cmc',
      42,
      {},
      { id: 7 },
      { id: '' },
      { id: 'CMC' }, // registry ids are lower-case
      { id: '-leading-dash' },
      { id: 'has space' },
      { id: '../vault' },
      { id: 'x'.repeat(65) },
      { id: 'ok-id' },
    ]);
    expect([...out.keys()]).toEqual(['ok-id']);
  });

  it('is empty for anything that is not an array', () => {
    for (const raw of [undefined, null, 'cmc', 3, { id: 'cmc' }]) {
      expect(parseLockedScreens(raw).size).toBe(0);
    }
  });

  it('caps what a request body can make it read at MAX_LOCKED_SCREENS', () => {
    const raw = Array.from({ length: MAX_LOCKED_SCREENS + 50 }, (_, i) => ({ id: `screen-${i}` }));
    const out = parseLockedScreens(raw);
    expect(out.size).toBe(MAX_LOCKED_SCREENS);
    expect(out.has(`screen-${MAX_LOCKED_SCREENS}`)).toBe(false);
  });

  it('trims an oversized reason', () => {
    const out = parseLockedScreens([{ id: 'cmc', reason: 'r'.repeat(1000) }]);
    expect(out.get('cmc')!.length).toBeLessThanOrEqual(160);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveProgramRef
// ─────────────────────────────────────────────────────────────────────────────

const ORG = 5;
const ROWS = [
  { id: 'prog-301', name: 'Bexarotene Phase 2', code: 'BX-301' },
  { id: 'prog-302', name: 'Bexarotene Phase 3', code: 'BX-302' },
  { id: 'prog-900', name: 'Cardiac Monitor', code: null },
  { id: 'prog-400', name: 'Oncology Platform', code: '  ' },
  { id: 'prog-030', name: 'Legacy Formulation', code: 'BX-30' },
];

/** A query that answers only for ORG — every other organisation has nothing. */
function orgQuery() {
  return vi.fn<ProgramQuery>(async (_text, params) => ({ rows: params[0] === ORG ? ROWS : [] }));
}

describe('resolveProgramRef', () => {
  it('finds an exact id', async () => {
    const r = await resolveProgramRef(ORG, 'prog-900', orgQuery());
    expect(r).toEqual({ status: 'found', program: { id: 'prog-900', name: 'Cardiac Monitor', code: null } });
  });

  it('finds an exact code, case-insensitively', async () => {
    const r = await resolveProgramRef(ORG, 'bx-301', orgQuery());
    expect(r.status).toBe('found');
    expect(r.status === 'found' && r.program.id).toBe('prog-301');
  });

  it('finds an exact name, case-insensitively, ignoring surrounding space', async () => {
    const r = await resolveProgramRef(ORG, '  BEXAROTENE PHASE 3 ', orgQuery());
    expect(r.status === 'found' && r.program.id).toBe('prog-302');
  });

  it('prefers the exact match over the partial ones it also satisfies', async () => {
    // "BX-30" is exactly one program's code and a partial of two more. The
    // person named a program; calling that ambiguous would make BX-30 the one
    // program in the workspace she could never open by its own code.
    const r = await resolveProgramRef(ORG, 'BX-30', orgQuery());
    expect(r.status).toBe('found');
    expect(r.status === 'found' && r.program.id).toBe('prog-030');
  });

  it('finds a unique partial match', async () => {
    const r = await resolveProgramRef(ORG, 'cardiac', orgQuery());
    expect(r.status === 'found' && r.program.id).toBe('prog-900');
  });

  it('never guesses between several partial matches', async () => {
    const r = await resolveProgramRef(ORG, 'bexarotene', orgQuery());
    expect(r.status).toBe('ambiguous');
    expect(r.status === 'ambiguous' && r.matches.map(p => p.id).sort()).toEqual(['prog-301', 'prog-302']);
  });

  it('reports not_found with the candidates that do exist', async () => {
    const r = await resolveProgramRef(ORG, 'ZZ-999', orgQuery());
    expect(r.status).toBe('not_found');
    expect(r.status === 'not_found' && r.candidates.map(p => p.id)).toEqual(ROWS.map(p => p.id));
  });

  it('a blank code is read as no code', async () => {
    const r = await resolveProgramRef(ORG, 'Oncology', orgQuery());
    expect(r.status === 'found' && r.program).toEqual({ id: 'prog-400', name: 'Oncology Platform', code: null });
  });

  it('is unavailable — not "no programs" — when the read fails', async () => {
    const failing: ProgramQuery = async () => {
      throw new Error('connection terminated');
    };
    expect(await resolveProgramRef(ORG, 'BX-301', failing)).toEqual({ status: 'unavailable' });
    expect(await listProgramCandidates(ORG, 25, failing)).toEqual({ ok: false, programs: [] });
  });

  it('is unavailable without an organisation or a reference, and does not query', async () => {
    const q = orgQuery();
    expect(await resolveProgramRef(null, 'BX-301', q)).toEqual({ status: 'unavailable' });
    expect(await resolveProgramRef(ORG, '   ', q)).toEqual({ status: 'unavailable' });
    expect(q).not.toHaveBeenCalled();
  });

  it('only ever reads the person\'s own organisation', async () => {
    const q = orgQuery();
    await resolveProgramRef(ORG, 'BX-301', q);
    expect(q).toHaveBeenCalledTimes(1);
    const [text, params] = q.mock.calls[0];
    expect(text).toMatch(/WHERE\s+organization_id\s*=\s*\$1/);
    expect(params[0]).toBe(ORG);

    // Another organisation's BX-301 is not this one's.
    const other = await resolveProgramRef(6, 'BX-301', orgQuery());
    expect(other.status).toBe('not_found');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The prompt blocks
// ─────────────────────────────────────────────────────────────────────────────

describe('live-drive prompt blocks', () => {
  it('assist mode tells her to make the moves, run demos, and read a screen report', () => {
    const block = buildLiveDrivePromptBlock('assist');
    expect(block).toContain('navigate_to');
    expect(block, 'a demo request would get a description instead of a demonstration').toContain('start_product_demo');
    expect(block, 'she would not know a move had failed to land').toContain('[Screen report]');
    // The words that stopped her answering with click-here directions.
    expect(block).toMatch(/DO IT/);
    expect(block).toMatch(/never answer with directions/i);
  });

  it('assist mode states the budget the policy actually enforces', () => {
    const block = buildLiveDrivePromptBlock('assist');
    expect(block).toContain(`${DRIVE_BUDGETS.assist.navigations} navigations`);
    expect(block).toContain(`${DRIVE_BUDGETS.assist.actions} screen actions`);
  });

  it('with Live Drive off, the moves are OFFERED and never claimed', () => {
    const block = buildOfferedMovesPromptBlock();
    expect(block).toContain('OFFERED');
    expect(block).toContain('navigate_to');
    expect(block).toContain('start_product_demo');
    expect(block).toMatch(/never that you did it/);
  });

  it('the assist drive budget is the chip budget — driving never moves more than offering offers', () => {
    expect(DRIVE_BUDGETS.assist.navigations).toBe(MAX_NAVIGATION_ACTIONS);
  });
});
