/**
 * generate_citation formats only what it can stand behind, and says which.
 *
 * It filled a string template per source type. A journal article came back as
 * `[Author(s)]. "[Title]." [Journal], <id>. DOI: [doi].` — a citation-shaped
 * placeholder a draft could carry forward — and the requested style was
 * echoed but never applied. A journal citation is now formatted from the
 * record PubMed or Crossref returned for the identifier, or not at all; an ICH
 * citation takes its title from the ICH corpus; every other source type is
 * formatted from the caller's identifier and labelled not verified.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { verifyCitations } = vi.hoisted(() => ({ verifyCitations: vi.fn() }));
vi.mock('../../citation-verification-service', () => ({ verifyCitations }));
vi.mock('../../citation-verification-service.js', () => ({ verifyCitations }));

import { getToolHandler } from '../AnaToolExecutor.js';

const run = async (input: Record<string, unknown>) =>
  JSON.parse(await getToolHandler('generate_citation')!(input, { organizationId: 7 } as any));

const verified = (match: Record<string, unknown>, extra: Record<string, unknown> = {}) => [{
  status: 'verified', exists: true, confidence: 1, match: { source: 'pubmed', ...match }, detail: 'Verified by PMID.', checkedAt: '2026-09-30T00:00:00Z', ...extra,
}];

beforeEach(() => verifyCitations.mockReset());

describe('generate_citation', () => {
  it('formats a journal article from the record PubMed returned for its PMID', async () => {
    verifyCitations.mockResolvedValue(verified({
      title: 'A randomized trial of X.', authors: 'Smith JA, van der Berg B', journal: 'N Engl J Med', year: 2020, pmid: '12345678', url: 'https://pubmed.ncbi.nlm.nih.gov/12345678/',
    }));
    const out = await run({ source_type: 'journal_article', source_identifier: 'PMID 12345678' });
    expect(verifyCitations).toHaveBeenCalledWith([{ pmid: '12345678' }]);
    expect(out.verification).toBe('verified');
    expect(out.citation).toBe('Smith JA, van der Berg B. A randomized trial of X. N Engl J Med. 2020.');
    expect(out.verifiedAgainst).toBe('pubmed');
    expect(out.styleApplied).toBe('vancouver');
  });

  it('looks a DOI up as a DOI', async () => {
    verifyCitations.mockResolvedValue(verified({ source: 'crossref', title: 'T', authors: 'Jane Roe', journal: 'J', year: 2019, doi: '10.1000/xyz' }));
    const out = await run({ source_type: 'journal_article', source_identifier: 'https://doi.org/10.1000/xyz', citation_style: 'vancouver' });
    expect(verifyCitations).toHaveBeenCalledWith([{ doi: '10.1000/xyz' }]);
    expect(out.citation).toBe('Roe J. T. J. 2019.');
  });

  it.each(['not_found', 'unverifiable', 'error'])(
    'returns no citation when the article is %s — never a placeholder',
    async (status) => {
      verifyCitations.mockResolvedValue([{ status, exists: status === 'not_found' ? false : null, confidence: null, match: null, detail: 'x', checkedAt: 'now' }]);
      const out = await run({ source_type: 'journal_article', source_identifier: '10.9999/nope' });
      expect(out.citation).toBeNull();
      expect(out.verification).toBe(status);
      expect(JSON.stringify(out)).not.toMatch(/\[(Author|Title|Journal|doi)/i);
    },
  );

  it('carries a retraction with the citation', async () => {
    verifyCitations.mockResolvedValue(verified({ title: 'T', authors: 'Smith J', journal: 'J', year: 2001 }, { retracted: true }));
    const out = await run({ source_type: 'journal_article', source_identifier: '99999' });
    expect(out.retracted).toBe(true);
    expect(out.warning).toMatch(/retracted/i);
  });

  it('keeps PubMed author names as PubMed gives them, a collective author included', async () => {
    verifyCitations.mockResolvedValue(verified({ title: 'T', authors: 'RECOVERY Collaborative Group, Horby P, Lim WS', journal: 'J', year: 2021 }));
    const out = await run({ source_type: 'journal_article', source_identifier: '32678530' });
    expect(out.citation).toBe('RECOVERY Collaborative Group, Horby P, Lim WS. T. J. 2021.');
  });

  it('formats Crossref authors from their family and given names, particles and organisations included', async () => {
    verifyCitations.mockResolvedValue(verified({
      source: 'crossref', title: 'T', journal: 'J', year: 2020, doi: '10.1000/abc',
      authors: 'Pieter De Smet, Ludwig van Beethoven',
      authorParts: [{ given: 'Pieter', family: 'De Smet' }, { given: 'Ludwig', family: 'van Beethoven' }, { name: 'WHO Working Group' }],
    }));
    const out = await run({ source_type: 'journal_article', source_identifier: '10.1000/abc' });
    expect(out.citation).toBe('De Smet P, van Beethoven L, WHO Working Group. T. J. 2020.');
  });

  it('looks a reference up by its PMID when it carries both, so a retraction is seen', async () => {
    verifyCitations.mockResolvedValue(verified({ title: 'T', authors: 'Wakefield AJ', journal: 'Lancet', year: 1998 }, { retracted: true }));
    const out = await run({ source_type: 'journal_article', source_identifier: 'PMID 9500320 doi:10.1016/S0140-6736(97)11096-0' });
    expect(verifyCitations).toHaveBeenCalledWith([{ pmid: '9500320' }]);
    expect(out.retracted).toBe(true);
  });

  it('says retraction status was not checked when only Crossref verified it', async () => {
    verifyCitations.mockResolvedValue(verified({ source: 'crossref', title: 'T', authors: 'Jane Roe', journal: 'J', year: 2019, doi: '10.1000/xyz' }));
    const out = await run({ source_type: 'journal_article', source_identifier: '10.1000/xyz' });
    expect(out.retractionChecked).toBe(false);
    expect(out.note).toMatch(/retraction status was not checked/i);
  });

  it('takes an ICH guideline\'s title from the ICH corpus', async () => {
    const out = await run({ source_type: 'ich_guideline', source_identifier: 'ICH E6(R3)' });
    expect(out.verification).toBe('identified');
    expect(out.citation).toMatch(/^International Council for Harmonisation\. ICH E6\(R3\): Good Clinical Practice/);
    expect(verifyCitations).not.toHaveBeenCalled();
  });

  it('formats an ICH code the corpus does not hold, and says it is not in the corpus', async () => {
    const out = await run({ source_type: 'ich_guideline', source_identifier: 'E6(R2)' });
    expect(out.verification).toBe('not_in_corpus');
    expect(out.citation).toBe('International Council for Harmonisation. ICH E6(R2).');
  });

  it.each([
    ['21cfr', '820.30', '21 CFR 820.30.'],
    ['fda_guidance', 'Clinical Trial Endpoints for the Approval of Cancer Drugs and Biologics', 'U.S. Food and Drug Administration. Clinical Trial Endpoints for the Approval of Cancer Drugs and Biologics.'],
    ['eu_mdr', 'Article 61', 'Regulation (EU) 2017/745 of the European Parliament and of the Council on medical devices, Article 61.'],
    ['iso_standard', 'ISO 14155:2020', 'ISO 14155:2020.'],
  ])('formats a %s citation from the identifier given and labels it not verified', async (type, id, expected) => {
    const out = await run({ source_type: type, source_identifier: id });
    expect(out.citation).toBe(expected);
    expect(out.verification).toBe('not_verified');
    expect(out.note).toMatch(/not checked/i);
  });

  it('applies the style it names, and says when it cannot apply the one asked for', async () => {
    verifyCitations.mockResolvedValue(verified({ title: 'T', authors: 'Smith J', journal: 'J', year: 2001, doi: '10.1056/NEJMoa2034577' }));
    const ama = await run({ source_type: 'journal_article', source_identifier: '10.1056/NEJMoa2034577', citation_style: 'ama' });
    expect(ama.styleApplied).toBe('ama');
    expect(ama.citation).toContain('doi:10.1056/NEJMoa2034577');
    const apa = await run({ source_type: 'journal_article', source_identifier: '10.1056/NEJMoa2034577', citation_style: 'apa' });
    expect(apa.styleApplied).toBe('vancouver');
    expect(apa.note).toMatch(/APA is not supported/);
  });

  it('asks for what is missing instead of formatting nothing', async () => {
    expect((await run({ source_type: 'journal_article' })).error).toMatch(/source_identifier/);
    expect((await run({ source_type: 'patent', source_identifier: 'x' })).error).toMatch(/source_type/);
  });
});
