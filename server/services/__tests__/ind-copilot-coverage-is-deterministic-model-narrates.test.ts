/**
 * indCopilot: figures and verdicts come from the CTD record, the model narrates.
 *
 * Until 2026-10-15 (audit report_ind_ivd_irb finding 20) three functions asked a
 * model for a figure or a verdict and returned or persisted what it said:
 *  - validateContent: { valid, score 0-100 "compliance level", missingElements },
 *    returned as the draft's `validation`, stored in ind_content_validations and
 *    as ind_generation_events.validation_score;
 *  - analyzeContent: { completeness_score 0-100, regulatory_gaps };
 *  - checkFDACompliance: { score 0-100, overall_assessment }, `passed` = score >= 70.
 * Their catch blocks answered score 0 / valid false for an error, which reads
 * as a measured zero. CLAUDE.md RULE 2: a tool that asks a model for a figure is
 * a defect.
 *
 * Now the only figure is the deterministic coverage of the record's required
 * sections (headings present in the text); the model's reply contributes
 * narrative and suggestions only, and a failed narration is marked unavailable.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const F = vi.hoisted(() => {
  process.env.SUPABASE_URL = 'https://supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
  return {
    inserts: [] as Array<{ table: string; rows: Record<string, unknown> }>,
    select: {} as Record<string, { data: unknown; error: unknown }>,
    single: {} as Record<string, { data: unknown; error: unknown }>,
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
  return { createClient: () => ({ from: (table: string) => builder(table) }) };
});

const S = vi.hoisted(() => ({ chat: vi.fn() }));
vi.mock('../../lib/unified-ai-client', () => ({ ai: { chat: S.chat } }));

import indCopilot from '../indCopilot.js';
import { resolveSectionBriefSource } from '../ind/ctd/index';

type Json = Record<string, any>;
const copilot = indCopilot as unknown as {
  generateSectionContent: (id: string, code: string, o?: Json) => Promise<Json>;
  analyzeContent: (id: string, code: string) => Promise<Json>;
  checkFDACompliance: (content: string, code: string) => Promise<Json>;
  sectionRequirementCoverage: (code: string, content: string) => Json;
};
const { sectionRequirementCoverage } = copilot;

// A 3.2.P draft with two of the record's required headings.
const DRAFT = [
  '3.2.P Drug Product',
  '3.2.P.1 Description and Composition of the Drug Product',
  'Film-coated tablet, 50 mg.',
  '## 3.2.P.2 Pharmaceutical Development',
  'Formulation development is summarised below.',
].join('\n');

/** What the model "says": a narrative wrapped in the figures it used to be asked for. */
const MODEL_FIGURES = {
  valid: true,
  score: 97,
  completeness_score: 91,
  overall_assessment: 'pass',
  missingElements: [],
  regulatory_gaps: [],
  narrative: 'The composition table is clear; development rationale is thin.',
  suggestions: ['Add the overage justification.'],
};

beforeEach(() => {
  F.inserts.length = 0;
  F.select = {
    regulatory_guidelines: { data: [{ title: 'ICH M4Q', text: 'Quality module structure.', url: null }], error: null },
    ind_references: { data: [], error: null },
    ind_blocks: { data: [{ block_type: 'markdown', content: { markdown: DRAFT } }], error: null },
  };
  F.single = {
    ind_wizards: { data: { id: 'sub-1', phase: 'Phase 1', sponsor_name: 'Acme' }, error: null },
    ind_drug_info: { data: { generic_name: 'BX-099', indication: 'NSCLC' }, error: null },
  };
  S.chat.mockReset();
  S.chat.mockImplementation(async (req: Json) => {
    if (req.callerModule === 'indCopilot.generateSectionContent') return { content: DRAFT, model: 'claude-opus-5' };
    if (req.callerModule === 'indCopilot.extractEntities') return { content: '{"entities":[]}', model: 'claude-opus-5' };
    return { content: JSON.stringify(MODEL_FIGURES), model: 'claude-opus-5' };
  });
});

/** The oracle, read from the record itself: what 3.2.P contains that is required for an IND. */
const REQUIRED_3_2_P = resolveSectionBriefSource('3.2.P')!
  .children!.filter((c) => c.requiredFor.includes('IND'))
  .map((c) => c.code);

describe('generateSectionContent: the validation figure is the record coverage, not the model', () => {
  it("returns and persists no model score or validity verdict", async () => {
    const r = await copilot.generateSectionContent('sub-1', '3.2.P');
    const v = r.validation;
    expect(v.score, "the model's compliance score was relayed").toBeUndefined();
    expect(v.valid, "the model's validity verdict was relayed").toBeUndefined();
    expect(v.coverage.present_headings).toEqual(['3.2.P.1', '3.2.P.2']);
    expect(v.coverage.percent).toBe(Math.round((2 / REQUIRED_3_2_P.length) * 100));
    expect(v.narrative).toBe(MODEL_FIGURES.narrative);
    expect(v.narration).toMatchObject({ status: 'narrated', narrated_by: 'claude-opus-5' });

    const stored = F.inserts.find((i) => i.table === 'ind_content_validations')!.rows;
    expect(JSON.stringify(stored.validation_result)).not.toMatch(/"(score|valid|completeness_score|overall_assessment)"/);
    const event = F.inserts.find((i) => i.table === 'ind_generation_events')!.rows;
    expect(event.validation_score, "the model's score was persisted as the validation score").toBeNull();
  });

  it('a failed narration reads as unavailable, never as a 0 score or an invalid verdict', async () => {
    S.chat.mockImplementation(async (req: Json) => {
      if (req.callerModule === 'indCopilot.generateSectionContent') return { content: DRAFT, model: 'claude-opus-5' };
      if (req.callerModule === 'indCopilot.extractEntities') return { content: '{"entities":[]}' };
      throw new Error('gateway timeout');
    });
    const r = await copilot.generateSectionContent('sub-1', '3.2.P');
    expect(r.validation.score, 'an error was reported as a measured 0').toBeUndefined();
    expect(r.validation.valid).toBeUndefined();
    expect(r.validation.narration.status).toBe('unavailable');
    expect(r.validation.narrative).toBeNull();
    expect(r.validation.coverage.present_headings).toEqual(['3.2.P.1', '3.2.P.2']);
    expect(JSON.stringify(r.validation)).not.toContain('gateway timeout');
  });
});

describe('analyzeContent: no model completeness score', () => {
  it('reports the record coverage and the narrative', async () => {
    const r = await copilot.analyzeContent('sub-1', '3.2.P');
    expect(r.completeness_score, "the model's completeness score was relayed").toBeUndefined();
    expect(r.regulatory_gaps).toBeUndefined();
    expect(r.coverage.present_headings).toEqual(['3.2.P.1', '3.2.P.2']);
    expect(r.narrative).toBe(MODEL_FIGURES.narrative);
    const stored = F.inserts.find((i) => i.table === 'ind_content_analyses')!.rows;
    expect(JSON.stringify(stored.analysis_result)).not.toMatch(/"(score|completeness_score|regulatory_gaps)"/);
  });

  it('a section with no content is measured from the record, with nothing narrated', async () => {
    F.select.ind_blocks = { data: [], error: null };
    const r = await copilot.analyzeContent('sub-1', '3.2.P');
    expect(r.completeness_score).toBeUndefined();
    expect(r.coverage.present_headings).toEqual([]);
    expect(r.coverage.percent).toBe(0);
    expect(r.narrative).toBeNull();
    expect(S.chat).not.toHaveBeenCalled();
  });
});

describe('checkFDACompliance: no model score, no pass/fail', () => {
  it('relays no score, pass verdict or overall assessment from the model', async () => {
    const r = await copilot.checkFDACompliance(DRAFT, '3.2.P');
    expect(r.score, "the model's compliance score was relayed").toBeUndefined();
    expect(r.passed).toBeUndefined();
    expect(r.overall_assessment).toBeUndefined();
    expect(r.coverage.present_headings).toEqual(['3.2.P.1', '3.2.P.2']);
    expect(r.suggestions).toEqual(MODEL_FIGURES.suggestions);
  });

  it('a failed narration is unavailable, not score 0 / passed false', async () => {
    S.chat.mockRejectedValue(Object.assign(new Error('bad request'), { status: 400 }));
    const r = await copilot.checkFDACompliance(DRAFT, '3.2.P');
    expect(r.score, 'an error was reported as a measured 0').toBeUndefined();
    expect(r.passed).toBeUndefined();
    expect(r.narration.status).toBe('unavailable');
    expect(r.coverage.percent).toBe(Math.round((2 / REQUIRED_3_2_P.length) * 100));
  });
});

describe('sectionRequirementCoverage', () => {
  it('measures only what the record lists as required for an IND within a parent section', () => {
    const c = sectionRequirementCoverage('3.2.P', DRAFT);
    expect(c.record_match).toBe('parent');
    expect(c.required_headings).toEqual(REQUIRED_3_2_P);
    expect(REQUIRED_3_2_P).toContain('3.2.P.8');
    expect(REQUIRED_3_2_P).not.toContain('3.2.P.2.1.1'); // not required for an IND in the record
    expect(c.missing_headings).toContain('3.2.P.8');
    expect(c.not_assessed).toBeNull();
  });

  it('a heading code mentioned in prose is not a heading', () => {
    const c = sectionRequirementCoverage('3.2.P', 'See 3.2.P.1 for the composition.\nCross-reference: 3.2.P.8 stability.');
    expect(c.present_headings).toEqual([]);
  });

  it('a section the record describes only in prose is not measured, and says why', () => {
    const c = sectionRequirementCoverage('2.5', '2.5.1 Product Development Rationale\nText.');
    expect(c.record_match).toBe('exact');
    expect(c.percent).toBeNull();
    expect(c.not_assessed).toMatch(/descriptions/);
    expect(c.elements.length).toBeGreaterThan(0);
    expect(c.elements_verified).toBe(false);
  });

  it('a parent with no section required for an IND is not measured', () => {
    const c = sectionRequirementCoverage('2.7', '2.7.1 Biopharmaceutics');
    expect(c.required_headings).toEqual([]);
    expect(c.percent).toBeNull();
    expect(c.not_assessed).toMatch(/none of the sections within 2\.7/i);
  });

  it('a code the record does not index is not measured', () => {
    const c = sectionRequirementCoverage('2.1', 'anything');
    expect(c.record_match).toBe('not_indexed');
    expect(c.percent).toBeNull();
    expect(c.not_assessed).toMatch(/no entry/i);
  });
});
