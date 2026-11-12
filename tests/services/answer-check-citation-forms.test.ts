/**
 * AnA's answer check reads the citations a device, diagnostics or EU client
 * actually writes (finding GRD-CITES of the 2026-10-04 map of AnA's reasoning,
 * docs/evidence/ANA-REASONING/2026-10-04/map-findings.md, "GRD-missed").
 *
 * THE DEFECT. The check (server/services/ana/answer-grounding.ts, checkAnswer)
 * read trial and literature identifiers, FDA submission numbers, CFR sections,
 * ICH codes, quotes and figures — the forms a US drug sponsor writes. An answer
 * whose specific claims were "MDR Article 61", "ISO 14971:2019", "MDCG 2020-6"
 * or "EMA/CHMP/ICH/135/1995" held, as far as the check could tell, nothing: it
 * reported `claims: 0`, the strip said "No specific claims to check against
 * this turn's sources", and a memory item resting on such a citation stood in
 * project memory unchecked (memory-fact-check.ts treats zero claims as
 * nothing to withhold). Run against the engine as it was, every answer in this
 * file returned `claims=0`.
 *
 * That silence fell hardest on the clients it should have served: a device or
 * diagnostics sponsor cites the MDR, the IVDR, ISO and IEC standards and MDCG
 * guidance in almost every regulatory sentence, and a trial application outside
 * the US cites Regulation (EU) No 536/2014 and EMA guidelines.
 *
 * THE RULE THESE FORMS FOLLOW is the one the file already states for CFR and
 * ICH: a regulation, standard or guideline can be recalled correctly, so a miss
 * means "not in this turn's sources", never "fabricated". And "found" keeps its
 * meaning: the citation is in a source of this turn, not proven apt.
 *
 * What is deliberately NOT read (and why) is pinned at the end of this file.
 */
import { describe, expect, it } from 'vitest';
import {
  ANSWER_CHECK_VERSION,
  checkAnswer,
  toolEvidence,
  type AnswerCheck,
  type EvidenceEntry,
} from '../../server/services/ana/answer-grounding';

const tool = (name: string, content: string, input: unknown = {}, generated: string[] = []): EvidenceEntry =>
  toolEvidence(name, { status: 'success', input, content, generated: { calls: generated.length, texts: generated, overflow: false } })!;

/** A source that holds none of the citations: the claims are compared, and in none. */
const UNRELATED = tool('search_knowledge', '{"note":"nothing relevant here"}');
const doc = (text: string) => tool('read_project_document', text, { doc_id: 'd-1' });

const texts = (list: Array<{ text: string }>) => list.map((c) => c.text).sort();
const everyClaim = (c: AnswerCheck) => [...c.notFound, ...c.unchecked, ...c.fromPerson, ...c.fromInput];
const notFound = (answer: string, entries: EvidenceEntry[]) => checkAnswer(answer, entries).notFound;
/**
 * Every claim in the answer is found, AND there is at least one. `notFound`
 * being empty is not enough: it is also empty when the citation was never read
 * as a claim, which is the defect this file is about.
 */
const allFound = (answer: string, entries: EvidenceEntry[]): boolean => {
  const c = checkAnswer(answer, entries);
  return c.claims > 0 && c.found === c.claims && c.notFound.length === 0;
};

describe('the defect: these citations were not claims at all', () => {
  it('reads an EU regulation, a standard, an EU guidance document and an EMA reference as four claims', () => {
    const c = checkAnswer(
      'Clinical evaluation follows MDR Article 61 and ISO 14971:2019, with MDCG 2020-6 and EMA/CHMP/ICH/135/1995 as guidance.',
      [UNRELATED],
    );
    expect(c.claims).toBe(4);
    expect([...c.notFound].sort((a, b) => a.kind.localeCompare(b.kind))).toEqual([
      { kind: 'ema_ref', text: 'EMA/CHMP/ICH/135/1995' },
      { kind: 'eu_guidance', text: 'MDCG 2020-6' },
      { kind: 'eu_law', text: 'MDR Article 61' },
      { kind: 'standard', text: 'ISO 14971:2019' },
    ]);
  });

  it('names the engine that reads them, so a check made before this is never taken for one made after', () => {
    expect(ANSWER_CHECK_VERSION).toBe('answer-check/3');
  });

  it('still reads the US forms beside them', () => {
    const c = checkAnswer('Under 21 CFR 820.30(g) and ICH E6(R2), and under MDR Article 61.', [UNRELATED]);
    expect(c.notFound.map((n) => n.kind).sort()).toEqual(['cfr', 'eu_law', 'ich']);
  });
});

describe('an EU regulation or directive', () => {
  it('is found where a source holds the same article of the same act, whichever name the act goes by', () => {
    // "MDR" and "Regulation (EU) 2017/745" are one act; so are "IVDR" and 2017/746.
    expect(allFound('Clinical evaluation is required by MDR Article 61.', [doc('See Article 61 of Regulation (EU) 2017/745.')])).toBe(true);
    expect(allFound('See Regulation (EU) 2017/745, Article 61.', [doc('MDR Article 61 covers clinical evaluation.')])).toBe(true);
    expect(allFound('Performance studies follow Article 56 of the IVDR.', [doc('Regulation (EU) 2017/746, Article 56.')])).toBe(true);
  });

  it('is not credited by the same article of another act', () => {
    expect(notFound('Clinical evaluation is required by MDR Article 61.', [doc('Performance evaluation: Article 61 of the IVDR.')])).toEqual([
      { kind: 'eu_law', text: 'MDR Article 61' },
    ]);
  });

  it('reads the paragraph: a source holding 61(4) does not hold 61(1), and one holding 61(1)(a) does', () => {
    expect(allFound('MDR Article 61(1) applies.', [doc('Regulation (EU) 2017/745 Article 61(1)(a) requires it.')])).toBe(true);
    expect(notFound('MDR Article 61(1) applies.', [doc('Regulation (EU) 2017/745 Article 61(4) covers implantables.')])).toEqual([
      { kind: 'eu_law', text: 'MDR Article 61(1)' },
    ]);
    // The article as a whole is in a source that cites any paragraph of it.
    expect(allFound('MDR Article 61 applies.', [doc('Article 61(4) of the MDR covers implantables.')])).toBe(true);
    // And 61 is not 6, 610 or 161.
    expect(notFound('MDR Article 61 applies.', [doc('MDR Article 6 and Article 161 and Article 610.')])).toEqual([
      { kind: 'eu_law', text: 'MDR Article 61' },
    ]);
  });

  it('reads an annex as its own numeral: XIV is not XV, and not XI', () => {
    expect(allFound('See MDR Annex XIV.', [doc('MDR Annex XIV, Part A: clinical evaluation.')])).toBe(true);
    expect(notFound('See MDR Annex XIV.', [doc('MDR Annex XV covers clinical investigations; Annex XI covers conformity.')])).toEqual([
      { kind: 'eu_law', text: 'MDR Annex XIV' },
    ]);
  });

  it('reads the provisions an answer lists after one act, each as its own claim', () => {
    expect(texts(notFound('MDR Article 61 and Annex XIV Part A set the route.', [UNRELATED]))).toEqual(['MDR Annex XIV', 'MDR Article 61']);
    expect(texts(notFound('MDR Articles 61 and 62 apply.', [UNRELATED]))).toEqual(['MDR Article 61', 'MDR Article 62']);
    // Only what a source holds is found: 61 here, not 62.
    expect(texts(notFound('MDR Articles 61 and 62 apply.', [doc('MDR Article 61.')]))).toEqual(['MDR Article 62']);
  });

  it('reads the act itself when it is cited by number with no provision', () => {
    const answer = 'The trial application is filed under Regulation (EU) No 536/2014 and Directive 2001/83/EC.';
    expect(texts(notFound(answer, [UNRELATED]))).toEqual(['Directive 2001/83/EC', 'Regulation (EU) No 536/2014']);
    // "No" is optional in a source, and the act is the same.
    expect(allFound(answer, [doc('Regulation (EU) 536/2014 on clinical trials; Directive 2001/83/EC on medicinal products.')])).toBe(true);
  });

  it('reads an act named both ways at once as one act', () => {
    const c = checkAnswer('Regulation (EU) 2017/745 (MDR), Article 61 applies.', [UNRELATED]);
    expect(c.notFound).toEqual([{ kind: 'eu_law', text: 'Regulation (EU) 2017/745 (MDR), Article 61' }]);
  });

  it('cited by number, is not credited by a source that only names it', () => {
    // The number is the claim. A source that says "the MDR" does not state it.
    expect(notFound('Regulation (EU) 2017/745 applies.', [doc('The MDR applies to the device.')])).toEqual([
      { kind: 'eu_law', text: 'Regulation (EU) 2017/745' },
    ]);
  });

  it('counts one provision once, however often and however it is written', () => {
    const c = checkAnswer('MDR Article 61 applies. Under Article 61 of the MDR, and under Regulation (EU) 2017/745 Article 61, it is required.', [UNRELATED]);
    expect(c.claims).toBe(1);
  });

  it('finds it in a record whose act and article are separate fields', () => {
    const found = tool(
      'search_eu_regulations',
      JSON.stringify({ results: [{ regulation: 'MDR', title: 'Clinical evaluation', article: '61' }] }),
      { topic: 'clinical evaluation' },
    );
    expect(allFound('Clinical evaluation is required by MDR Article 61.', [found])).toBe(true);
  });

  it('is found in the record a lookup returns, not in the echo of a miss', () => {
    const lookup = (content: unknown) => tool('lookup_eu_provision', JSON.stringify(content), { provision: 'MDR Article 61' });
    const exact = lookup({ source: 'EUR-Lex', match: 'exact', provision: { act: 'Regulation (EU) 2017/745', article: 'Article 61', title: 'Clinical evaluation' } });
    expect(allFound('MDR Article 61 applies.', [exact])).toBe(true);
    const miss = lookup({ source: 'EUR-Lex', provision: 'MDR Article 61', provisions: [], note: 'No provision matched "MDR Article 61".' });
    expect(notFound('MDR Article 61 applies.', [miss])).toEqual([{ kind: 'eu_law', text: 'MDR Article 61' }]);
  });

  it('is not credited by text a model wrote inside the tool call', () => {
    const drafted = 'Clinical evaluation per MDR Article 61 was completed.';
    expect(notFound('Per MDR Article 61, the evaluation is complete.', [tool('batch_draft_sections', drafted, {}, [drafted])])).toEqual([
      { kind: 'eu_law', text: 'MDR Article 61' },
    ]);
  });
});

describe('a standard', () => {
  it('is found with its edition only where a source states that edition', () => {
    const answer = 'Risk management follows ISO 14971:2019.';
    expect(allFound(answer, [doc('Applicable standards: ISO 14971:2019, IEC 62304.')])).toBe(true);
    expect(notFound(answer, [doc('ISO 14971:2007 was the earlier edition.')])).toEqual([{ kind: 'standard', text: 'ISO 14971:2019' }]);
    // An undated mention does not state the edition the answer does. Editions
    // differ in substance, and a harmonised-standards list names one.
    expect(notFound(answer, [doc('ISO 14971 applies to the device.')])).toEqual([{ kind: 'standard', text: 'ISO 14971:2019' }]);
  });

  it('is found without an edition wherever a source holds the standard, dated or not', () => {
    expect(allFound('The software lifecycle follows IEC 62304.', [doc('IEC 62304:2006+A1:2015 (software life cycle processes).')])).toBe(true);
    expect(allFound('Biocompatibility follows ISO 10993.', [doc('ISO 10993-1:2018, evaluation and testing.')])).toBe(true);
  });

  it('reads the part: 60601-1 is not 60601-1-2', () => {
    const emc = doc('EMC is covered by IEC 60601-1-2.');
    expect(notFound('IEC 60601-1 applies.', [emc])).toEqual([{ kind: 'standard', text: 'IEC 60601-1' }]);
    expect(allFound('IEC 60601-1-2 applies.', [emc])).toBe(true);
  });

  it('is not credited by its bare number: an enrolment of 14971 is not ISO 14971', () => {
    expect(notFound('ISO 14971 applies.', [tool('get_trial_details', '{"enrolled":14971}')])).toEqual([{ kind: 'standard', text: 'ISO 14971' }]);
  });

  it('reads a joint or adopted designation as one standard', () => {
    const c = checkAnswer('ISO/IEC 27001 and EN ISO 13485:2016 apply; see ISO/TR 24971:2020.', [UNRELATED]);
    expect(texts(c.notFound)).toEqual(['EN ISO 13485:2016', 'ISO/IEC 27001', 'ISO/TR 24971:2020']);
    // The European adoption is the same standard and edition.
    expect(allFound('EN ISO 13485:2016 applies.', [doc('The QMS is certified to ISO 13485:2016.')])).toBe(true);
  });
});

describe('an EU guidance document', () => {
  it('reads an MDCG document by its own number', () => {
    const answer = 'MDCG 2020-6 sets out sufficient clinical evidence.';
    expect(allFound(answer, [doc('Guidance: MDCG 2020-6, clinical evidence for legacy devices.')])).toBe(true);
    expect(notFound(answer, [doc('MDCG 2020-16 covers classification of IVDs.')])).toEqual([{ kind: 'eu_guidance', text: 'MDCG 2020-6' }]);
    // 2020-1 is not the start of 2020-16.
    expect(notFound('MDCG 2020-1 covers clinical evaluation of software.', [doc('MDCG 2020-16 covers classification of IVDs.')])).toEqual([
      { kind: 'eu_guidance', text: 'MDCG 2020-1' },
    ]);
  });

  it('reads a MEDDEV with its revision: rev 3 is not rev 4', () => {
    const answer = 'MEDDEV 2.7/1 rev. 4 describes clinical evaluation.';
    expect(allFound(answer, [doc('MEDDEV 2.7/1 revision 4 (June 2016).')])).toBe(true);
    expect(allFound(answer, [doc('MEDDEV 2.7.1 Rev 4.')])).toBe(true);
    expect(notFound(answer, [doc('MEDDEV 2.7/1 rev 3 was superseded.')])).toEqual([{ kind: 'eu_guidance', text: 'MEDDEV 2.7/1 rev. 4' }]);
    // Cited without a revision, any revision of it is the document.
    expect(allFound('MEDDEV 2.7/1 describes clinical evaluation.', [doc('MEDDEV 2.7/1 revision 4.')])).toBe(true);
  });
});

describe('an EMA document reference', () => {
  it('is the same document under its old and new prefixes, by its number and year', () => {
    expect(allFound('GCP is EMA/CHMP/ICH/135/1995.', [doc('Note for guidance on GCP (CPMP/ICH/135/95).')])).toBe(true);
    expect(allFound('GCP is CPMP/ICH/135/95.', [doc('EMA/CHMP/ICH/135/1995, Guideline for good clinical practice.')])).toBe(true);
    expect(notFound('GCP is EMA/CHMP/ICH/135/1995.', [doc('EMA/CHMP/ICH/136/1995 is another document.')])).toEqual([
      { kind: 'ema_ref', text: 'EMA/CHMP/ICH/135/1995' },
    ]);
    // The year is half of the reference: the same serial number recurs across years.
    expect(notFound('GCP is EMA/CHMP/ICH/135/1995.', [doc('EMA/CHMP/ICH/135/2016 is another document.')])).toEqual([
      { kind: 'ema_ref', text: 'EMA/CHMP/ICH/135/1995' },
    ]);
  });

  it('is read in its two-digit-year form too', () => {
    expect(notFound('See EMEA/CHMP/EWP/1776/99.', [UNRELATED])).toEqual([{ kind: 'ema_ref', text: 'EMEA/CHMP/EWP/1776/99' }]);
  });
});

describe("the product's own formatter is not a source for what it was handed", () => {
  /* AnA's generate_citation tool (server/services/ana/citation-generator.ts)
     formats an `eu_mdr` or `iso_standard` citation from the identifier the
     model gives it and says so: verification 'not_verified'. Round 1 of this
     engine was overturned for exactly this — "a tool's echo of the model's
     request confirmed the request" — and the first version of these readers
     repeated it: the model asks for "Article 61" with no act, the tool answers
     "Regulation (EU) 2017/745 …, Article 61", and the act in the reply made it
     look like a record. What the model asked for is the provision, whichever
     field carried the act. */
  const NOTE = 'Formatted from the identifier given; its existence and wording were not checked against a source.';
  const formatted = (sourceType: string, sourceIdentifier: string, citation: string) =>
    tool(
      'generate_citation',
      JSON.stringify({ sourceType, sourceIdentifier, citation, verification: 'not_verified', styleRequested: 'regulatory', styleApplied: 'regulatory', note: NOTE }),
      { source_type: sourceType, source_identifier: sourceIdentifier },
    );

  it('an EU provision formatted from what the model gave finds nothing', () => {
    const echo = formatted(
      'eu_mdr',
      'Article 61',
      'Regulation (EU) 2017/745 of the European Parliament and of the Council on medical devices, Article 61.',
    );
    expect(notFound('Clinical evaluation is required by MDR Article 61.', [echo])).toEqual([{ kind: 'eu_law', text: 'MDR Article 61' }]);
  });

  it('a standard formatted from what the model gave finds nothing, with or without its designation in the request', () => {
    expect(notFound('Risk management follows ISO 14971:2019.', [formatted('iso_standard', 'ISO 14971:2019', 'ISO 14971:2019.')])).toEqual([
      { kind: 'standard', text: 'ISO 14971:2019' },
    ]);
    // Asked for by number alone, and a tool that wrote the designation in front of it.
    const dressed = tool('lookup_standard', JSON.stringify({ query: '14971', title: 'ISO 14971 (as requested)', results: [] }), { query: '14971' });
    expect(notFound('Risk management follows ISO 14971.', [dressed])).toEqual([{ kind: 'standard', text: 'ISO 14971' }]);
  });

  it('an act asked for by its number is not found in a reply that only dresses the number up', () => {
    const dressed = tool('lookup_eu_act', JSON.stringify({ query: '536/2014', title: 'Regulation (EU) No 536/2014 (as requested)', results: [] }), { query: '536/2014' });
    expect(notFound('The application is filed under Regulation (EU) No 536/2014.', [dressed])).toEqual([
      { kind: 'eu_law', text: 'Regulation (EU) No 536/2014' },
    ]);
  });

  it('an EU guidance document and an EMA reference the model asked for are found only in a record', () => {
    const miss = (query: string) => tool('search_guidance', JSON.stringify({ query, results: [], note: `No guidance matched "${query}".` }), { query });
    expect(notFound('MDCG 2020-6 applies.', [miss('MDCG 2020-6')])).toEqual([{ kind: 'eu_guidance', text: 'MDCG 2020-6' }]);
    expect(notFound('GCP is EMA/CHMP/ICH/135/1995.', [miss('EMA/CHMP/ICH/135/1995')])).toEqual([{ kind: 'ema_ref', text: 'EMA/CHMP/ICH/135/1995' }]);
    const hit = tool(
      'search_guidance',
      JSON.stringify({ results: [{ reference: 'MDCG 2020-6', title: 'Sufficient clinical evidence for legacy devices' }] }),
      { query: 'MDCG 2020-6' },
    );
    expect(allFound('MDCG 2020-6 applies.', [hit])).toBe(true);
  });

  it('reads the citation that formatter writes, in an answer, as the provision it is', () => {
    const answer = 'See Regulation (EU) 2017/745 of the European Parliament and of the Council on medical devices, Article 61.';
    expect(notFound(answer, [UNRELATED])).toEqual([
      { kind: 'eu_law', text: 'Regulation (EU) 2017/745 of the European Parliament and of the Council on medical devices, Article 61' },
    ]);
    // And it is the same claim as the short form.
    expect(checkAnswer(`${answer} MDR Article 61 applies.`, [UNRELATED]).claims).toBe(1);
  });
});

describe('each claim ends where the check says every claim ends', () => {
  it('is unchecked, not "not found", when nothing was consulted', () => {
    const c = checkAnswer('MDR Article 61 and ISO 14971:2019 apply.', []);
    expect(c.basis).toBe('no_sources');
    expect(texts(c.unchecked)).toEqual(['ISO 14971:2019', 'MDR Article 61']);
    expect(c.notFound).toEqual([]);
  });

  it("is the person's own, never a source, when only their message holds it", () => {
    const person: EvidenceEntry = { source: 'person', content: 'Does MDR Article 61 apply to us under ISO 14971:2019?' };
    const c = checkAnswer('Yes: MDR Article 61 applies, and ISO 14971:2019 governs risk.', [person, UNRELATED]);
    expect(texts(c.fromPerson)).toEqual(['ISO 14971:2019', 'MDR Article 61']);
    expect(c.notFound).toEqual([]);
    expect(c.found).toBe(0);
  });
});

describe('what is deliberately not read', () => {
  const standardsIn = (answer: string) => everyClaim(checkAnswer(answer, [UNRELATED])).filter((c) => c.kind === 'standard');
  const euLawIn = (answer: string) => everyClaim(checkAnswer(answer, [UNRELATED])).filter((c) => c.kind === 'eu_law');

  it('an article with no act beside it: the check cannot tell whose article it is', () => {
    // After "Under the MDR, …" a later bare "Article 62" is probably the MDR's.
    // "Probably" is a guess, and a guessed act would be reported as a claim the
    // answer never made in those words.
    expect(euLawIn('Article 12 requires a summary of safety and clinical performance.')).toEqual([]);
  });

  it('an article of something else, however near an act stands', () => {
    // A source is read by nearness, because a record keeps act and article in
    // separate fields. An answer never is: nearness would write a citation the
    // answer did not.
    expect(euLawIn('The MDR applies from 2021. Separately, Article 12 of the consortium agreement covers publication.')).toEqual([]);
  });

  it('a word after "Annex" that merely begins with a numeral\'s letter', () => {
    // "Information" begins with I, and "IVD-specific" with IV.
    expect(euLawIn('The MDR Annex Information is summarised below.')).toEqual([]);
    expect(texts(notFound('See MDR Annex IV.', [doc('MDR ANNEX IVD-SPECIFIC REQUIREMENTS ARE LISTED.')]))).toEqual(['MDR Annex IV']);
  });

  it('"MDR" alone: in a US device file it is a Medical Device Report, not the regulation', () => {
    expect(euLawIn('The MDR was filed late and a second MDR followed.')).toEqual([]);
  });

  it('a lower-case "en" before a number, which is French or Spanish, not a European standard', () => {
    expect(standardsIn('Les essais terminés en 13485 cas sont décrits.')).toEqual([]);
  });

  it('a bare "EN" and four digits: that is also a form number or a year', () => {
    expect(standardsIn('Form EN 2020 was used at the Spanish sites.')).toEqual([]);
    // With a part, an edition or five digits it is a standard.
    expect(texts(standardsIn('EN 62366-1 and EN 1041:2008 apply.'))).toEqual(['EN 1041:2008', 'EN 62366-1']);
  });
});
