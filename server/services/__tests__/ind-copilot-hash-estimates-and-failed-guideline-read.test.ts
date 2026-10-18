/**
 * indCopilot says what its numbers are, and a failed guideline read is an error.
 *
 * Until 2026-10-15 (audit report_ind_ivd_irb finding 24):
 *  - ind_content_validations.content_hash was `Buffer.from(content)
 *    .toString('base64').slice(0, 20)`: the base64 of the first 15 bytes, so any
 *    two drafts with the same opening collided, and it carried that opening;
 *  - generated and follow-up responses carried `prompt_tokens` /
 *    `completion_tokens` — the provider's field names — holding length / 4
 *    estimates no provider counted;
 *  - a failed guideline read was returned AS the guidance text ('Unable to
 *    fetch specific guidelines…', 'Unable to fetch guidelines due to an
 *    internal error.'), drafted against, and served by GET …/guidance with 200.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';

const F = vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
  return {
    inserts: [] as Array<{ table: string; rows: Record<string, unknown> }>,
    select: {} as Record<string, { data: unknown; error: unknown }>,
    single: {} as Record<string, { data: unknown; error: unknown }>,
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
    b.insert = async (rows: Record<string, unknown>) => {
      F.inserts.push({ table, rows });
      return { error: null };
    };
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

type Json = Record<string, any>;
const copilot = indCopilot as unknown as {
  generateSectionContent: (id: string, code: string, o?: Json) => Promise<Json>;
  generateFollowupResponse: (id: string, code: string, original: string, instruction: string, o?: Json) => Promise<Json>;
  getRegulatoryGuidance: (code: string) => Promise<Json>;
};

let draft = '';

beforeEach(() => {
  F.inserts.length = 0;
  F.throwOn = null;
  F.select = {
    regulatory_guidelines: { data: [{ title: 'ICH E3', text: 'Clinical study report structure.', url: null }], error: null },
    ind_references: { data: [], error: null },
  };
  F.single = { ind_wizards: { data: { id: 'sub-1', phase: 'Phase 1' }, error: null } };
  S.chat.mockReset();
  S.chat.mockImplementation(async (req: Json) => {
    if (req.callerModule === 'indCopilot.extractEntities') return { content: '{"entities":[]}' };
    if (req.callerModule === 'indCopilot.validateContent') return { content: '{"narrative":"ok","suggestions":[]}', model: 'm' };
    return { content: draft, model: 'claude-opus-5' };
  });
});

describe('content_hash', () => {
  it('is the SHA-256 of the whole content, so two drafts with the same opening differ', async () => {
    const opening = 'This section summarises the clinical program in full detail. ';
    const hashes: string[] = [];
    for (const tail of ['Study A enrolled 40 subjects.', 'Study B enrolled 12 subjects.']) {
      draft = opening + tail;
      await copilot.generateSectionContent('sub-1', '5.3');
      const row = F.inserts.filter((i) => i.table === 'ind_content_validations').at(-1)!.rows;
      expect(row.content_hash).toBe(createHash('sha256').update(draft).digest('hex'));
      hashes.push(String(row.content_hash));
    }
    expect(hashes[0], 'two different drafts got the same "hash"').not.toBe(hashes[1]);
  });
});

describe('token figures are named as estimates', () => {
  it('a generated section carries estimated_* counts, not the provider field names', async () => {
    draft = 'x'.repeat(400);
    const r = await copilot.generateSectionContent('sub-1', '5.3');
    expect(r.prompt_tokens, 'an estimate under the provider field name').toBeUndefined();
    expect(r.completion_tokens).toBeUndefined();
    expect(r.estimated_completion_tokens).toBe(100);
    expect(typeof r.estimated_prompt_tokens).toBe('number');
  });

  it('a follow-up response does the same', async () => {
    draft = 'y'.repeat(80);
    const r = await copilot.generateFollowupResponse('sub-1', '5.3', 'original text', 'shorten it');
    expect(r.prompt_tokens, 'an estimate under the provider field name').toBeUndefined();
    expect(r.completion_tokens).toBeUndefined();
    expect(r.estimated_completion_tokens).toBe(20);
  });
});

describe('a failed guideline read is an error, never the guidance', () => {
  it('a read the store refused rejects getRegulatoryGuidance', async () => {
    F.select.regulatory_guidelines = { data: null, error: { message: 'permission denied for table regulatory_guidelines' } };
    const out = await copilot.getRegulatoryGuidance('2.7').then(
      (v) => ({ resolved: v }),
      (e: unknown) => ({ rejected: e }),
    );
    expect(out, 'the failed read was returned as guidance').toHaveProperty('rejected');
    expect(String((out as { rejected: Error }).rejected.message)).not.toContain('permission denied');
  });

  // Each case uses a section code no earlier test read: a successful read is
  // cached per section code for an hour.
  it('a read that threw rejects getRegulatoryGuidance', async () => {
    F.throwOn = 'regulatory_guidelines';
    await expect(copilot.getRegulatoryGuidance('4.2')).rejects.toThrow(/could not be read/);
  });

  it('a section is not drafted against a failed guideline read', async () => {
    F.select.regulatory_guidelines = { data: null, error: { message: 'permission denied' } };
    draft = 'drafted anyway';
    await expect(copilot.generateSectionContent('sub-1', '2.6')).rejects.toThrow(/could not be read/);
    expect(S.chat).not.toHaveBeenCalled();
  });

  it('guidelines that were read are returned as read', async () => {
    const g = await copilot.getRegulatoryGuidance('2.7');
    expect(g.guidance).toContain('Clinical study report structure.');
  });
});
