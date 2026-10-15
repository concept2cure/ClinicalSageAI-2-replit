/**
 * What AnA is handed when she asks the CMC regulatory record a question:
 * cited answers that fit what the model can read, refusals that say what is
 * wrong, and "not indexed" — never an empty answer — when the record has
 * nothing.
 */
import { describe, expect, it } from 'vitest';
import { CMC_RESULT_BUDGET, cmcGuidance, cmcRequirements, cmcTopic } from '../cmc-knowledge-tools';
import { CMC_RECORD } from '../../cmc/knowledge';

describe('find_cmc_guidance', () => {
  it('answers a code with the document, its status, date and URL', () => {
    const ich = CMC_RECORD.sources.find((s) => s.authority === 'ICH' && s.status === 'final')!;
    const out = JSON.parse(cmcGuidance({ query: ich.code, authority: 'ICH' }));
    expect(out.documents[0].cite).toContain(ich.code);
    expect(out.documents[0].cite).toContain(ich.date);
    expect(out.documents[0].url).toBe(ich.url);
    expect(out.record).toMatch(/Record as of \d{4}-\d{2}-\d{2}/);
  });

  it('marks a draft as a draft in the citation', () => {
    const draft = CMC_RECORD.sources.find((s) => s.status === 'draft');
    if (!draft) return;
    const out = JSON.parse(cmcGuidance({ query: draft.code, authority: draft.authority }));
    expect(out.documents.find((d: any) => d.cite.includes(draft.code)).cite).toContain('DRAFT');
  });

  it('refuses an authority the record does not know, and names the ones it does', () => {
    const out = JSON.parse(cmcGuidance({ query: 'stability', authority: 'Narnia' }));
    expect(out.error).toMatch(/No authority "Narnia"/);
    expect(out.error).toContain('PMDA');
  });

  it('says "not indexed", and not to answer from memory, when nothing matches', () => {
    const out = JSON.parse(cmcGuidance({ query: 'zzzz-not-a-guideline' }));
    expect(out.found).toBe(0);
    expect(out.note).toMatch(/do not supply/i);
  });
});

describe('get_cmc_requirements', () => {
  it('returns an authority’s pathway with its requirements, each cited', () => {
    const p = CMC_RECORD.pathways[0];
    const out = JSON.parse(cmcRequirements({ authority: p.authority }));
    expect(out.pathway.some((x: any) => x.authority === p.authority)).toBe(true);
    for (const r of out.requirements) expect(r.sources.length, r.requirement).toBeGreaterThan(0);
  });

  it('filters by CTD section', () => {
    const out = JSON.parse(cmcRequirements({ ctd_section: '3.2.S.7' }));
    expect(out.found).toBeGreaterThan(0);
    for (const r of out.requirements) expect(String(r.ctd), r.requirement).toMatch(/3\.2\.S(\.7|\b)|^3\.2\b|^3\b/);
  });
});

describe('explain_cmc_topic', () => {
  it('answers a note’s own topic with its citations, or says the record has no notes yet', () => {
    const n = CMC_RECORD.notes[0];
    if (!n) {
      expect(JSON.parse(cmcTopic({ query: 'stability' })).note).toMatch(/Not indexed/);
      return;
    }
    const out = JSON.parse(cmcTopic({ query: n.topic }));
    expect(out.notes[0].cite.length).toBeGreaterThan(0);
  });
});

describe('every answer fits what the model is given to read', () => {
  it('stays inside the budget for the broadest questions', () => {
    for (const out of [
      cmcRequirements({}),
      cmcRequirements({ authority: 'FDA' }),
      cmcRequirements({ topic: 'stability' }),
      cmcGuidance({ query: 'Q' }),
      cmcTopic({ query: 'impurities stability validation biologics' }),
    ]) {
      expect(out.length).toBeLessThanOrEqual(CMC_RESULT_BUDGET);
      expect(JSON.parse(out)).not.toHaveProperty('status');
    }
  });
});
