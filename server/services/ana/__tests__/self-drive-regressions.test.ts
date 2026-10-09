/**
 * AnA's hands, end to end on the server — regressions from the turn where a
 * real person asked her to navigate, operate a screen and run a demo, and
 * nothing happened.
 *
 * Each block below pins one break in that chain. Every one of them failed
 * GREEN: the deploy passed, the model answered, and the person watched AnA
 * describe moves she never made.
 *
 *   1. The transcript. A round that called tools without narrating staged
 *      `{ role: 'assistant', content: '' }`; the Messages API 400s an empty
 *      non-final message, so the follow-up call failed on every fallback model
 *      and the turn ended "An error occurred" after its first move.
 *   2. The ceiling. A demonstration is decided mid-turn (when
 *      start_product_demo answers), after the round ceiling was fixed, and a
 *      tour was cut off partway.
 *   3. The offer. Over ~760 tools the relevance cap scored none of the
 *      self-drive tools for "go to biostatistics" or "show me around", so the
 *      model was never SHOWN navigate_to and answered in prose. The first fix
 *      made them always-on, which forced them onto voice and background deep
 *      investigations too — callers that can move no screen and render no
 *      chip. They are pinned by the callers that can surface a move instead.
 *   4. The handlers. Moves onto screens closed to this workspace; project
 *      screens opened with no program ("open a program" empty state); the
 *      program opened a moment ago forgotten by the next move; and a
 *      destination that returned no hint of what could be done there.
 *
 * The DB is mocked at the pool: program resolution runs for real through
 * services/ana-ri/drive-context against rows scoped to ONE organisation, so a
 * handler that forgot the org id would find nothing rather than pass. The
 * program reads are answered by support/program-table, which answers each by
 * its WHERE clause the way the table would — drive-context matches a program
 * in SQL, and a pool that handed back every row for any read would report a
 * code that names one program as ambiguous between all of them.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { pool, programReads } = vi.hoisted(() => {
  // Bound below, once the table fake is imported: the pool is built before any
  // import runs, and only calls it later.
  const programReads: { answer: ProgramQuery | null } = { answer: null };
  const pool = {
    query: vi.fn(async (sql: unknown, params?: unknown[]) => {
      // Other modules touch the pool at load (config objects, not SQL text);
      // only the program read matters here.
      const text = typeof sql === 'string' ? sql : String((sql as { text?: unknown } | null)?.text ?? '');
      if (text.includes('FROM regulatory_programs')) {
        if (!programReads.answer) throw new Error('program table not bound');
        return programReads.answer(text, params ?? []);
      }
      return { rows: [] };
    }),
    connect: vi.fn(),
  };
  return { pool, programReads };
});

vi.mock('../../../db.js', () => ({ getPool: () => pool, pool, db: {} }));

import {
  assistantTurnContent,
  runAgenticToolLoop,
  type ModelTurn,
  type ToolCall,
  type ToolResultEntry,
} from '../agentic-loop.js';
import { selectToolsForTurn, ALWAYS_ON_TOOLS, SELF_DRIVE_TOOLS } from '../tool-selection';
import { getAllEnabledTools } from '../AnaToolDefinitions.js';
import { getToolHandler, type ToolContext } from '../AnaToolExecutor.js';
import type { ProgramQuery } from '../../ana-ri/drive-context';
import { programTable } from '../../ana-ri/__tests__/support/program-table';

// Organisation 5's programs, most recently touched first. Any other
// organisation has none — each read is answered by the org id it is given, the
// same way the real WHERE clause is.
programReads.answer = programTable(
  [
    { id: 'prog-301', name: 'Bexarotene Phase 2', code: 'BX-301' },
    { id: 'prog-302', name: 'Bexarotene Phase 3', code: 'BX-302' },
    { id: 'prog-900', name: 'Cardiac Monitor', code: null },
  ].map((p, i, all) => ({ ...p, organization_id: 5, updated_at: all.length - i })),
);

async function call(tool: string, input: Record<string, unknown>, ctx?: ToolContext) {
  const handler = getToolHandler(tool);
  if (!handler) throw new Error(`no handler registered for ${tool}`);
  return JSON.parse(await handler(input, ctx));
}

beforeEach(() => pool.query.mockClear());

// ─────────────────────────────────────────────────────────────────────────────
// 1. The staged assistant turn is never empty
// ─────────────────────────────────────────────────────────────────────────────

describe('assistantTurnContent — the transcript the next round reads', () => {
  it('names the tools a round ran when the model wrote no text before calling them', () => {
    // The common case, and every demo stop after the first: tools, no prose.
    const out = assistantTurnContent('', [{ name: 'navigate_to' }, { name: 'act_on_screen' }]);
    expect(out.trim().length, 'a tool-only round staged an empty assistant turn').toBeGreaterThan(0);
    expect(out).toContain('navigate_to');
    expect(out).toContain('act_on_screen');
  });

  it('treats whitespace-only narration as no narration', () => {
    const out = assistantTurnContent('  \n\t ', [{ name: 'navigate_to' }]);
    expect(out.trim().length).toBeGreaterThan(0);
    expect(out).toContain('navigate_to');
  });

  it('names a tool once however many times the round called it', () => {
    const out = assistantTurnContent('', [{ name: 'act_on_screen' }, { name: 'act_on_screen' }]);
    expect(out.match(/act_on_screen/g)).toHaveLength(1);
  });

  it('is still non-empty when there is neither text nor a result to name', () => {
    expect(assistantTurnContent('', []).trim().length).toBeGreaterThan(0);
    expect(assistantTurnContent('', [{ name: '' }]).trim().length).toBeGreaterThan(0);
  });

  it('passes real narration through unchanged — it is what the model said', () => {
    const said = 'Opening the Vault for BX-301.';
    expect(assistantTurnContent(said, [{ name: 'navigate_to' }])).toBe(said);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. A ceiling that rises mid-turn is honoured
// ─────────────────────────────────────────────────────────────────────────────

describe('runAgenticToolLoop — maxRoundsFloor', () => {
  /** A unique input per call so every round is novel work, never thrash. */
  const novel = (i: number): ToolCall => ({ id: `c${i}`, name: 'navigate_to', input: { target: `t${i}` } });

  /**
   * A model that makes one move per round until `stopAfter`, then answers.
   * `executed` counts rounds whose tools ran — the floor below reads it, the
   * way the stream route reads "has start_product_demo answered yet".
   */
  function tour(stopAfter: number) {
    const state = { executed: 0 };
    const deps = {
      executeTools: async (calls: ToolCall[]): Promise<ToolResultEntry[]> => {
        state.executed++;
        return calls.map(c => ({ tool_use_id: c.id, name: c.name, content: 'ok' }));
      },
      callModel: async (
        _results: ToolResultEntry[],
        _priorText: string,
        round: number,
        includeTools: boolean,
      ): Promise<ModelTurn> => ({
        text: '',
        toolCalls: includeTools && round + 1 <= stopAfter ? [novel(round + 1)] : [],
      }),
    };
    return { state, deps };
  }

  it('continues past maxRounds once the floor rises mid-turn', async () => {
    // Ordinary turn ceiling of 2. After the second round the turn becomes a
    // demonstration and the floor rises to 20; the tour needs 7 stops.
    const { state, deps } = tour(7);
    const result = await runAgenticToolLoop({ text: '', toolCalls: [novel(1)] }, deps, {
      maxRounds: 2,
      maxRoundsFloor: () => (state.executed >= 2 ? 20 : 0),
    });
    expect(result.rounds, 'the demonstration was cut off at the ceiling fixed before it began').toBeGreaterThan(2);
    expect(state.executed).toBe(7);
    expect(result.stoppedReason).not.toBe('max_rounds');
  });

  it('never lowers maxRounds — a floor below it changes nothing', async () => {
    const { state, deps } = tour(3);
    const result = await runAgenticToolLoop({ text: '', toolCalls: [novel(1)] }, deps, {
      maxRounds: 6,
      maxRoundsFloor: () => 1,
    });
    expect(state.executed).toBe(3);
    expect(result.stoppedReason).not.toBe('max_rounds');
  });

  it('without a floor the ceiling holds exactly as before', async () => {
    const { deps } = tour(7);
    const result = await runAgenticToolLoop({ text: '', toolCalls: [novel(1)] }, deps, { maxRounds: 2 });
    expect(result.rounds).toBe(2);
    expect(result.stoppedReason).toBe('max_rounds');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. The self-drive tools are offered whatever the wording — to the callers
//    that can use them, and only to those
// ─────────────────────────────────────────────────────────────────────────────

describe('selectToolsForTurn — AnA has her hands where a move can be made', () => {
  // The real surface, exactly what the stream route offers: every AnA tool plus
  // any enabled server tools. A synthetic list would sit under the cap and prove
  // nothing — the bug only exists when relevance filtering engages.
  const surface = getAllEnabledTools();
  const saved = process.env.ANA_TOOL_SELECTION_DISABLED;
  beforeEach(() => {
    delete process.env.ANA_TOOL_SELECTION_DISABLED;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.ANA_TOOL_SELECTION_DISABLED;
    else process.env.ANA_TOOL_SELECTION_DISABLED = saved;
  });

  it('the surface is over the cap, so filtering is really engaged', () => {
    expect(surface.length).toBeGreaterThan(50);
  });

  it('names exactly the six tools that move and operate a screen', () => {
    expect([...SELF_DRIVE_TOOLS].sort()).toEqual(
      ['act_on_screen', 'list_app_screens', 'list_demo_scripts', 'list_screen_actions', 'navigate_to', 'start_product_demo'],
    );
  });

  it.each([
    'go to biostatistics',
    'open settings',
    'show me around the product',
    'search the vault for stability',
    'switch to the billing tab',
    'run the sales demo',
  ])('a caller that pins SELF_DRIVE_TOOLS is offered all six for "%s"', prompt => {
    // What the stream route and the chat route pass: every turn there can
    // make the move live or offer it as a chip, so wording must not decide it.
    const offered = new Set(selectToolsForTurn(surface, prompt, { pinned: [...SELF_DRIVE_TOOLS] }).map(t => t.name));
    const missing = SELF_DRIVE_TOOLS.filter(n => !offered.has(n));
    expect(missing, `not offered for "${prompt}" — AnA would answer in prose`).toEqual([]);
  });

  it('pinned, they survive when the turn carries project context (IND)', () => {
    const offered = new Set(
      selectToolsForTurn(surface, 'take me there', {
        pinned: [...SELF_DRIVE_TOOLS],
        context: { projectType: 'IND' },
      }).map(t => t.name),
    );
    expect(SELF_DRIVE_TOOLS.filter(n => !offered.has(n))).toEqual([]);
  });

  it('none of them is always-on — voice and deep investigations cannot drive', () => {
    // ALWAYS_ON_TOOLS reaches every selectToolsForTurn caller, including
    // ana-realtime and deep-investigation, which can neither move a screen nor
    // render a chip. A self-drive tool there is a move promised to nobody.
    expect(SELF_DRIVE_TOOLS.filter(n => ALWAYS_ON_TOOLS.has(n))).toEqual([]);
  });

  it('a caller that pins nothing is not handed them for a turn with no screen in it', () => {
    // The observable half of the line above, through the selector itself:
    // an unrelated question with no pins gets no self-drive tool forced on it.
    const offered = new Set(
      selectToolsForTurn(surface, 'summarise the pharmacokinetic half-life findings').map(t => t.name),
    );
    expect(SELF_DRIVE_TOOLS.filter(n => offered.has(n))).toEqual([]);
  });

  it('both routes that can surface a move pin them', () => {
    // The pin is the whole fix on the caller side; a route that forgets it is
    // back to deciding AnA's hands by wording. Read from the shipped source,
    // because the routes are too large to drive here.
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
    for (const route of ['server/routes/ana-ri/stream.ts', 'server/routes/chat/send-message.ts']) {
      const src = readFileSync(path.join(repoRoot, route), 'utf8');
      const call = src.slice(src.indexOf('selectToolsForTurn('));
      const pinned = call.slice(call.indexOf('pinned:'), call.indexOf('context:'));
      expect(pinned, `${route} does not pin the self-drive tools`).toMatch(/\.\.\.SELF_DRIVE_TOOLS/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4a. Locked screens are refused honestly, never "visited"
// ─────────────────────────────────────────────────────────────────────────────

describe('self-drive handlers — screens closed to this workspace', () => {
  const lockedCtx = (ids: string[]): ToolContext => ({
    organizationId: 5,
    userId: 1,
    projectId: null,
    lockedScreens: new Map(ids.map(id => [id, 'not in this release'])),
  });

  it('navigate_to refuses a locked target with no directive to apply', async () => {
    const out = await call('navigate_to', { target: 'cmc' }, lockedCtx(['cmc']));
    expect(out.status, 'AnA moved the person onto a "not in this release" panel').toBe('not_available');
    expect(out.directive).toBeUndefined();
    expect(out.message).toContain('not in this release');
  });

  it('list_app_screens does not offer a locked screen', async () => {
    const out = await call('list_app_screens', {}, lockedCtx(['cmc']));
    expect(out.status).toBe('ok');
    expect(out.screens.some((s: { id: string }) => s.id === 'cmc')).toBe(false);
    // The unlocked catalog is still there.
    expect(out.screens.some((s: { id: string }) => s.id === 'vault')).toBe(true);
  });

  it('act_on_screen refuses an action whose screen is locked', async () => {
    const out = await call('act_on_screen', { action: 'vault.search', params: { query: 'stability' } }, lockedCtx(['vault']));
    expect(out.status).toBe('not_available');
    expect(out.directive).toBeUndefined();
  });

  it('the demonstration tools drop scripts that would walk onto a locked screen', async () => {
    const ctx = lockedCtx(['device-510k', 'device-workstream', 'risk']);

    const listed = await call('list_demo_scripts', {}, ctx);
    const ids = listed.scripts.map((s: { id: string }) => s.id);
    expect(ids).not.toContain('sales-medtech');
    expect(ids).not.toContain('training-medtech');
    expect(ids.length, 'every script was dropped — the lock filter over-reached').toBeGreaterThan(0);

    const started = await call('start_product_demo', { demo: 'sales-medtech' }, ctx);
    expect(started.status, 'a demo was started that fails at its first locked stop').toBe('not_available');
    expect(Array.isArray(started.availableDemos)).toBe(true);
    const available = started.availableDemos.map((d: { id: string }) => d.id);
    expect(available).not.toContain('sales-medtech');
    expect(available.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4b. A project screen opens a real program, or asks which
// ─────────────────────────────────────────────────────────────────────────────

describe('navigate_to — project-scope screens and programs', () => {
  const ctx = (): ToolContext => ({ organizationId: 5, userId: 1, projectId: null });

  it('with no program open and none named, asks which — listing this org\'s programs', async () => {
    const out = await call('navigate_to', { target: 'vault' }, ctx());
    expect(out.status, 'moved onto an empty "open a program" state').toBe('needs_project');
    expect(out.directive).toBeUndefined();
    expect(out.programs.map((p: { code?: string }) => p.code)).toContain('BX-301');
    // Scoped to the person's organisation — never a cross-tenant list.
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('organization_id = $1'), expect.arrayContaining([5]));
  });

  it('opens the named program — by code — on the directive', async () => {
    const out = await call('navigate_to', { target: 'vault', program: 'BX-301' }, ctx());
    expect(out.status).toBe('navigation_ready');
    expect(out.directive.program).toEqual({ id: 'prog-301', name: 'Bexarotene Phase 2', code: 'BX-301' });
  });

  it('refuses to guess between several matches', async () => {
    const out = await call('navigate_to', { target: 'vault', program: 'Bexarotene' }, ctx());
    expect(out.status).toBe('needs_parameters');
    expect(out.directive).toBeUndefined();
    expect(out.programs.map((p: { id: string }) => p.id).sort()).toEqual(['prog-301', 'prog-302']);
  });

  it('says so when nothing matches, with the programs that do exist', async () => {
    const out = await call('navigate_to', { target: 'vault', program: 'ZZ-999' }, ctx());
    expect(out.status).toBe('needs_parameters');
    expect(out.programs.length).toBe(3);
  });

  it('never resolves another organisation\'s program', async () => {
    const out = await call('navigate_to', { target: 'vault', program: 'BX-301' }, { organizationId: 6, userId: 1, projectId: null });
    expect(out.status).not.toBe('navigation_ready');
    expect(out.directive).toBeUndefined();
  });

  it('a global screen needs no program', async () => {
    const out = await call('navigate_to', { target: 'protocol-dev' }, ctx());
    expect(out.status).toBe('navigation_ready');
    expect(out.directive.program).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4c. The program AnA opened this turn carries to her next move
// ─────────────────────────────────────────────────────────────────────────────

describe('turnState — "open BX-301, then take me to its Vault"', () => {
  it('act_on_screen projects.open-program sets the turn\'s program, and navigate_to follows it', async () => {
    const ctx: ToolContext = { organizationId: 5, userId: 1, projectId: null, turnState: { program: null } };

    const opened = await call('act_on_screen', { action: 'projects.open-program', params: { program: 'BX-301' } }, ctx);
    expect(opened.status).toBe('action_ready');
    expect(ctx.turnState?.program).toMatchObject({ id: 'prog-301', code: 'BX-301' });

    // The request's projectRef still says nothing was open when the turn began.
    const moved = await call('navigate_to', { target: 'vault' }, ctx);
    expect(moved.status, 'AnA asked again which program, a moment after opening it').toBe('navigation_ready');
    expect(moved.directive.program).toMatchObject({ id: 'prog-301', code: 'BX-301' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4d. The destination says what can be done there
// ─────────────────────────────────────────────────────────────────────────────

describe('navigate_to — screenActions on arrival', () => {
  it('lists the destination\'s registry actions so the next move needs no discovery round', async () => {
    const out = await call('navigate_to', { target: 'vault', program: 'BX-301' }, { organizationId: 5, userId: 1, projectId: null });
    expect(out.status).toBe('navigation_ready');
    expect(Array.isArray(out.screenActions)).toBe(true);
    expect(out.screenActions.map((a: { id: string }) => a.id)).toContain('vault.search');
  });
});
