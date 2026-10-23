/**
 * indCopilot: a failed reference read and a failed record insert are failures.
 *
 * Until 2026-10-15:
 *  - fetchAvailableReferences answered a failed `ind_references` read (an error
 *    from the store, or a throw) with [] — "this submission has no references"
 *    — and the section was drafted, followed up and streamed against that empty
 *    list, its citations parsed against nothing;
 *  - the Supabase inserts that record a generation, a follow-up, a validation
 *    and an analysis (ind_generation_events, ind_content_validations,
 *    ind_content_analyses) were awaited and their `{ error }` discarded, so a
 *    write the store refused was reported to the caller as success.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const F = vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
  return {
    select: {} as Record<string, { data: unknown; error: unknown }>,
    single: {} as Record<string, { data: unknown; error: unknown }>,
    insertError: {} as Record<string, { message: string }>,
    throwOn: null as string | null,
  };
});

vi.mock('@supabase/supabase-js', () => {
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.in = () => b;
    b.single = async () => F.single[table] ?? { data: null, error: { code: 'PGRST116', message: 'not found' } };
    b.insert = async () => ({ error: F.insertError[table] ?? null });
    b.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
      Promise.resolve(F.select[table] ?? { data: [], error: null }).then(ok, ko);
    return b;
  };
  return {
    createClient: () => ({
      from: (table: string) => {
        if (F.throwOn === table) throw new TypeError('fetch failed');
        return builder(table);
      },
    }),
  };
});

const S = vi.hoisted(() => ({ chat: vi.fn() }));
vi.mock('../../lib/unified-ai-client', () => ({ ai: { chat: S.chat } }));

import indCopilot from '../indCopilot.js';

type Json = Record<string, unknown>;
const copilot = indCopilot as unknown as {
  generateSectionContent: (id: string, code: string, o?: Json) => Promise<Json>;
  generateFollowupResponse: (id: string, code: string, original: string, instruction: string, o?: Json) => Promise<Json>;
  streamSectionContent: (id: string, code: string, o?: Json) => Promise<unknown>;
  analyzeContent: (id: string, code: string) => Promise<Json>;
};

/** Model calls that draft or revise text (not narration or entity extraction). */
const draftingCalls = () =>
  S.chat.mock.calls.filter(([req]) => /generateSectionContent|generateFollowupResponse|streamSectionContent/.test(String((req as Json).callerModule)));

beforeEach(() => {
  F.throwOn = null;
  F.insertError = {};
  F.select = {
    regulatory_guidelines: { data: [{ title: 'ICH E3', text: 'Clinical study report structure.', url: null }], error: null },
    ind_references: { data: [], error: null },
    ind_blocks: { data: [{ content: '5.3 Clinical study reports', block_type: 'text' }], error: null },
  };
  F.single = { ind_wizards: { data: { id: 'sub-1', phase: 'Phase 1' }, error: null } };
  S.chat.mockReset();
  S.chat.mockImplementation(async (req: Json) => {
    if (req.callerModule === 'indCopilot.extractEntities') return { content: '{"entities":[]}' };
    if (req.callerModule === 'indCopilot.validateContent' || req.callerModule === 'indCopilot.analyzeContent') {
      return { content: '{"narrative":"ok","suggestions":[]}', model: 'm' };
    }
    return { content: 'A drafted section.', model: 'claude-opus-5' };
  });
});

describe('a failed reference read is an error, never "no references"', () => {
  it.each([
    ['the store refused the read', () => { F.select.ind_references = { data: null, error: { message: 'permission denied for table ind_references' } }; }],
    ['the read threw', () => { F.throwOn = 'ind_references'; }],
  ])('%s: the section is not drafted against an empty reference list', async (_case, arrange) => {
    arrange();
    await expect(copilot.generateSectionContent('sub-1', '5.3'), 'drafted against no references').rejects.toThrow(/references .*could not be read/i);
    expect(draftingCalls()).toEqual([]);
  });

  it('a follow-up and a stream refuse too', async () => {
    F.select.ind_references = { data: null, error: { message: 'permission denied' } };
    await expect(copilot.generateFollowupResponse('sub-1', '5.3', 'original', 'shorten it')).rejects.toThrow(/could not be read/i);
    await expect(copilot.streamSectionContent('sub-1', '5.3')).rejects.toThrow(/could not be read/i);
    expect(draftingCalls()).toEqual([]);
  });

  it("the store's own message stays out of the error", async () => {
    F.select.ind_references = { data: null, error: { message: 'permission denied for table ind_references' } };
    await expect(copilot.generateSectionContent('sub-1', '5.3')).rejects.not.toThrow(/permission denied/);
  });
});

describe('a record insert the store refused is a failure, not success', () => {
  it.each([
    ['ind_generation_events', () => copilot.generateSectionContent('sub-1', '5.3')],
    ['ind_content_validations', () => copilot.generateSectionContent('sub-1', '5.3')],
    ['ind_content_analyses', () => copilot.analyzeContent('sub-1', '5.3')],
  ])('a refused %s insert rejects', async (table, run) => {
    F.insertError[table] = { message: `insert into ${table} violates row-level security` };
    await expect(run(), `the refused ${table} write was reported as success`).rejects.toThrow(/could not be recorded/i);
  });

  it('a refused follow-up event insert rejects', async () => {
    F.insertError.ind_generation_events = { message: 'insert refused' };
    await expect(copilot.generateFollowupResponse('sub-1', '5.3', 'original', 'shorten it')).rejects.toThrow(/could not be recorded/i);
  });

  it('control: when every write lands, a section is generated', async () => {
    const r = await copilot.generateSectionContent('sub-1', '5.3');
    expect(r.content).toBe('A drafted section.');
  });
});
