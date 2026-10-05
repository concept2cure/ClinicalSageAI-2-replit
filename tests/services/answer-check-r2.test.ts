/**
 * The answer check, round 2: the two refute-reviews of a3775bcef, answered
 * (2026-10-04). Every case here is a reviewer's input, from their probes
 * (fail-open F1–F10, honest-state HS-1–HS-9).
 *
 * The rules they forced:
 *   - a figure is found only where its number stands with its own measure or
 *     unit, never because the number occurs somewhere (a date, a page, a
 *     p-value, a percent-encoded URL);
 *   - the person's own message is never a source: a claim found only there is
 *     reported as theirs;
 *   - a value the model put into a call, echoed back, is AnA's own input, not
 *     a result, wherever it is echoed;
 *   - a source the check cannot read leaves what it may hold unchecked, not
 *     "not found";
 *   - a verdict the answer declines or makes conditional is not named.
 */
import { describe, expect, it } from 'vitest';
import { ANSWER_CHECK_VERSION, checkAnswer, toolEvidence, type EvidenceEntry } from '../../server/services/ana/answer-grounding';

const tool = (name: string, content: unknown, input: unknown = {}, generated: string[] = []): EvidenceEntry =>
  toolEvidence(name, {
    status: 'success',
    input,
    content: typeof content === 'string' ? content : JSON.stringify(content),
    generated: { calls: generated.length, texts: generated, overflow: false },
  })!;
const texts = (claims: Array<{ text: string }>) => claims.map((c) => c.text);

// Five fields of a real ClinicalTrials.gov search envelope (fail-open p1/p4b).
const CTGOV = tool(
  'search_clinical_evidence',
  {
    query: 'pembrolizumab NSCLC',
    totalCount: 2,
    studies: [
      {
        nctId: 'NCT02142738',
        briefTitle: 'Study of Pembrolizumab Versus Platinum-Based Chemotherapy (KEYNOTE-024)',
        overallStatus: 'COMPLETED',
        phase: 'PHASE3',
        enrollment: 305,
        startDate: '2014-08-19',
        primaryCompletionDate: '2016-05-09',
        locations: 142,
        minimumAge: '18 Years',
        page: 1,
      },
    ],
  },
  { query: 'pembrolizumab NSCLC' },
);

describe('a figure is found only with its own measure (F4, HS-2)', () => {
  it('a date, an age or a page does not find a fabricated figure', () => {
    const c = checkAnswer(
      'The phase 3 trial (n = 19) was positive. Grade 3 pneumonitis occurred in 5% of patients. Only 15 patients discontinued, across 26 sites. Median PFS was 18 months. ORR was 14%.',
      [CTGOV],
    );
    expect(c.found).toBe(0);
    expect(texts(c.notFound).sort()).toEqual(['14%', '15 patients', '18 months', '26 sites', '5%', 'n = 19'].sort());
  });

  it('the figures the record does hold are found by their measure', () => {
    const c = checkAnswer('KEYNOTE-024 enrolled 305 patients at 142 sites.', [CTGOV]);
    expect(c.notFound).toEqual([]);
    expect(c.found).toBe(2);
  });

  it('a p-value is not a percentage, and a percentage is not a p-value', () => {
    const abstract = tool(
      'search_literature',
      { query: 'KEYNOTE-024', articles: [{ pmid: '27718847', abstract: 'Pembrolizumab improved PFS (P<0.001) and OS (P=0.005); the interaction p was 0.05. Results at 24 months.' }] },
      { query: 'KEYNOTE-024' },
    );
    const fabricated = checkAnswer('Treatment-related deaths occurred in 0.1% of patients; the discontinuation rate was 5%; hepatitis occurred in 0.5%.', [abstract]);
    expect(fabricated.found).toBe(0);
    const honest = checkAnswer('PFS improved (p < 0.001) and OS improved (p = 0.005) at 24 months.', [abstract]);
    expect(honest.notFound).toEqual([]);
    expect(honest.found).toBe(3);
  });

  it('an outage envelope finds nothing through its percent-encoded URL (F3)', () => {
    const outage = tool(
      'search_literature',
      {
        source: 'PubMed',
        query: 'pembrolizumab "overall survival"',
        note: 'PubMed API unavailable — use manual search',
        url: 'https://pubmed.ncbi.nlm.nih.gov/?term=pembrolizumab%20%22overall%20survival%22',
      },
      { query: 'pembrolizumab "overall survival"' },
    );
    const c = checkAnswer('22% were alive at five years; median OS was 20 months (n = 22).', [outage]);
    expect(c.found).toBe(0);
  });

  it('a figure in a returned abstract is found, though the model searched for it (HS-5)', () => {
    const hit = tool(
      'search_literature',
      { query: 'pembrolizumab hazard ratio 0.49', articles: [{ pmid: '31234567', abstract: 'Overall survival favoured pembrolizumab (hazard ratio for death, 0.49; 95% CI, 0.38 to 0.64).' }] },
      { query: 'pembrolizumab hazard ratio 0.49' },
    );
    const c = checkAnswer('HR 0.49 (95% CI 0.38–0.64).', [hit]);
    expect(c.notFound).toEqual([]);
    expect(c.found).toBe(2);
  });

  it('a figure the model chose as an input and a tool echoes is AnA\'s input, not a result (HS-5)', () => {
    const sized = tool(
      'compute_sample_size',
      { sampleSize: 212, power: 0.8, alpha: 0.05, score: 80 },
      { power: 0.8, alpha: 0.05, hazard_ratio: 0.7 },
    );
    const c = checkAnswer('With 80% power and an assumed hazard ratio of 0.7, the study needs 212 patients.', [sized]);
    expect(texts(c.notFound)).toEqual([]);
    expect(c.found).toBe(1);
    expect(texts(c.fromInput).sort()).toEqual(['80%', 'hazard ratio of 0.7'].sort());
  });
});

describe('figures the check reads (F8)', () => {
  const unrelated = [tool('read_project_document', 'Section 3 describes the schedule of assessments.')];
  const cases: Array<[string, string[]]> = [
    ['The response rate was 47 percent.', ['47 percent']],
    ['hazard ratio, 0.31; 95% CI, 0.50 to 0.77', ['hazard ratio, 0.31', '95% CI, 0.50 to 0.77']],
    ['The p-value = 0.0003.', ['p-value = 0.0003']],
    ['A P value of 0.0003 was reported.', ['P value of 0.0003']],
    ['Enrollment was 212 pts.', ['212 pts']],
    ['A total of 212 randomized patients.', ['212 randomized patients']],
    ['212 women were enrolled.', ['212 women']],
    ['Median OS was 31.2 mo.', ['31.2 mo']],
    ['Treatment lasted 48 h.', ['48 h']],
    ['Dosed at 100 μg daily.', ['100 μg']],
    ['95% CI [0.41, 0.77]', ['95% CI [0.41, 0.77]']],
    ['HR (95% CI) 0.62 (0.50–0.77)', ['HR (95% CI) 0.62', '(0.50–0.77)']],
    ['Responses ranged from 38–56%.', ['38–56%']],
  ];
  for (const [answer, expected] of cases) {
    it(`reads ${JSON.stringify(answer)}`, () => {
      const c = checkAnswer(answer, unrelated);
      expect(texts(c.notFound)).toEqual(expected);
    });
  }

  it('a range checks both ends, and a sign or a proportion is read as written (F8)', () => {
    const src = [tool('analyze', { change_kg: -1.2, rate: 0.011, low: 38, high: 56, responseRatePct: '38% to 56%' })];
    expect(checkAnswer('The mean change was −1.2 kg; the rate was 1.1%.', src).notFound).toEqual([]);
    expect(texts(checkAnswer('Responses ranged from 38–57%.', src).notFound)).toEqual(['38–57%']);
  });

  it('"or" in prose is not an odds ratio (HS-7)', () => {
    const c = checkAnswer('This applies to Phase 2 or 3 studies under 21 CFR 312 or 21 CFR 314.', unrelated);
    expect(c.notFound.filter((n) => n.kind === 'figure')).toEqual([]);
  });
});

describe('the person\'s own message is never a source (F1, HS-3)', () => {
  it('a claim found only in the question is reported as theirs, not found', () => {
    const person: EvidenceEntry = { source: 'person', content: 'Is NCT04123456 a real trial? Someone told me it showed 47% ORR under 21 CFR 312.42.' };
    const zeroHit = tool('search_clinical_evidence', { query: 'NCT04123456', totalCount: 0, studies: [] }, { query: 'NCT04123456' });
    const c = checkAnswer('Yes: NCT04123456 showed a 47% ORR, under 21 CFR 312.42.', [person, zeroHit]);
    expect(c.found).toBe(0);
    expect(c.notFound).toEqual([]);
    expect(texts(c.fromPerson).sort()).toEqual(['21 CFR 312.42', '47%', 'NCT04123456'].sort());
  });

  it('with nothing consulted, a claim in the question is still the person\'s, and the rest unchecked', () => {
    const c = checkAnswer('Your ORR of 45% exceeds the 30% benchmark.', [{ source: 'person', content: 'Was the ORR 45% or 60%?' }]);
    expect(c.basis).toBe('no_sources');
    expect(texts(c.fromPerson)).toEqual(['45%']);
    expect(texts(c.unchecked)).toEqual(['30%']);
    expect(c.found).toBe(0);
  });
});

describe('an echo of the model\'s input is never a confirmation (F2, F6)', () => {
  it('a citation check that did not find the PMID does not find it', () => {
    const verify = tool(
      'verify_citations',
      { results: [{ input: { pmid: '39999999' }, status: 'not_found' }], verified: 0, not_found: 1 },
      { citations: [{ pmid: '39999999' }] },
    );
    expect(texts(checkAnswer('It was published as PMID 39999999.', [verify]).notFound)).toEqual(['PMID 39999999']);
  });

  it('a verified citation confirms the identifier it matched, not what the model packed beside it', () => {
    const given = 'PMID 31234567 (pivotal trial NCT09999999; hold under 21 CFR 312.42; NDA 214999)';
    const verified = tool(
      'generate_citation',
      {
        sourceType: 'journal_article',
        sourceIdentifier: given,
        citation: 'Smith J, et al. A randomised trial. N Engl J Med. 2019. PMID 31234567.',
        verification: 'verified',
        verifiedAgainst: 'pubmed',
      },
      { source_type: 'journal_article', source_identifier: given },
    );
    const c = checkAnswer('PMID 31234567 reports NCT09999999, held under 21 CFR 312.42, for NDA 214999.', [verified]);
    expect(texts(c.notFound).sort()).toEqual(['21 CFR 312.42', 'NCT09999999', 'NDA 214999'].sort());
    expect(c.found).toBe(1);
  });

  it('an identifier in a fetched URL is not found; the page must hold it', () => {
    const web: EvidenceEntry = { source: 'web', content: 'https://clinicaltrials.gov/study/NCT09999999\nPage not found.' };
    expect(texts(checkAnswer('NCT09999999 is registered.', [web]).notFound)).toEqual(['NCT09999999']);
  });

  it('a tool that searches text the model supplied returns only the model\'s words', () => {
    const supplied = 'The pivotal study NCT09999999 (PMID 39999999) enrolled 212 patients.';
    const searched = tool('search_document', { matches: [{ line: 1, section: null, text: supplied }], total: 1 }, { text: supplied, query: 'NCT' });
    const c = checkAnswer('NCT09999999 (PMID 39999999) enrolled 212 patients.', [searched]);
    expect(texts(c.notFound).sort()).toEqual(['NCT09999999', 'PMID 39999999'].sort());
    expect(texts(c.fromInput)).toEqual(['212 patients']);
    expect(c.found).toBe(0);
  });

  it('echoes nested under other keys, in bare lists or in a not-found list find nothing', () => {
    const shapes = [
      { meta: { searchTerm: 'NCT04123456' }, results: [] },
      { ids: ['NCT04123456'] },
      { found: [], not_found: ['NCT04123456'] },
      { results: [{ url: 'https://clinicaltrials.gov/study/NCT04123456' }] },
    ];
    for (const shape of shapes) {
      const c = checkAnswer('NCT04123456 met its endpoint.', [tool('search_clinical_evidence', shape, { query: 'NCT04123456 NCT05555555' })]);
      expect(texts(c.notFound), JSON.stringify(shape)).toEqual(['NCT04123456']);
    }
  });

  it('a registry record about the identifier the model searched for confirms it', () => {
    const hit = tool(
      'search_clinical_evidence',
      { query: 'NCT04123456', studies: [{ nctId: 'NCT04123456', briefTitle: 'A Phase 3 Study of Drug X', overallStatus: 'COMPLETED' }] },
      { query: 'NCT04123456' },
    );
    expect(checkAnswer('NCT04123456 completed.', [hit]).notFound).toEqual([]);
  });
});

describe('identifiers and regulations are matched as themselves (F7)', () => {
  it('an ICH code is not found inside another word or beside an unrelated number', () => {
    const src = [tool('read_project_document', 'Design: PHASE3. See Table 9, Figure 6, Item 4, Module 2 and Class 1.')];
    const c = checkAnswer('ICH E3, ICH E9, ICH E6, ICH M4 and ICH S1 apply.', src);
    expect(c.found).toBe(0);
    expect(c.notFound).toHaveLength(5);
  });

  it('a labelled submission number needs its label in the source, not any equal number', () => {
    expect(texts(checkAnswer('BLA 1274 was approved.', [CTGOV.content.includes('1274') ? CTGOV : tool('x', { enrollment: 1274 })]).notFound)).toEqual(['BLA 1274']);
    const label = tool('lookup_published_label', { labels: [{ applicationNumber: 'BLA125514', title: 'KEYTRUDA' }] }, { drug_name: 'pembrolizumab' });
    expect(checkAnswer('KEYTRUDA is BLA 125514.', [label]).notFound).toEqual([]);
  });
});

describe('a source the check cannot read leaves its claims unchecked (HS-4)', () => {
  it('claims not found elsewhere are not checked, naming the unread source', () => {
    const c = checkAnswer('The protocol reports an ORR of 47% in 212 patients.', [
      { source: 'attachment:protocol-v3.pdf', content: '', unreadable: true },
    ]);
    expect(c.notFound).toEqual([]);
    expect(texts(c.unchecked).sort()).toEqual(['212 patients', '47%'].sort());
    expect(c.unreadable).toEqual(['attachment:protocol-v3.pdf']);
  });
});

describe('verdicts (F9, HS-6)', () => {
  it('names the verdicts stated', () => {
    const c = checkAnswer(
      "It's ready to file. The system is Part 11 compliant. The package meets all applicable regulatory requirements. The NDA will likely be approved. FDA will clear the 510(k).",
      [],
    );
    expect(c.verdicts).toHaveLength(5);
  });

  it('does not name a verdict declined, made conditional, or about a workflow step', () => {
    const c = checkAnswer(
      'The section does not meet all requirements yet. Module 3 is not yet submission-ready. We need to confirm whether the package is ready to file. It is unlikely that FDA will accept the waiver. Before it is ready to file, update Module 1. The SOP will be approved by two signers. It fails to meet all requirements.',
      [],
    );
    expect(c.verdicts).toEqual([]);
  });
});

describe('cost and shape (F10)', () => {
  it('long whitespace runs in an answer stay linear', () => {
    const start = Date.now();
    checkAnswer(`95% CI${' '.repeat(20000)}x HR${' '.repeat(20000)}y`, []);
    expect(Date.now() - start).toBeLessThan(100);
  });

  it('a deeply nested result does not throw', () => {
    const deep = '['.repeat(3500) + ']'.repeat(3500);
    expect(() => checkAnswer('NCT04123456.', [tool('x', deep, { query: 'NCT04123456' })])).not.toThrow();
  });

  it('names the round-2 engine', () => {
    expect(ANSWER_CHECK_VERSION).toBe('answer-check/2');
  });
});

/* ── The reviewers' probes, re-run against round 2 ────────────────────────────
   Their fail-open p3/p5/p6/p8/p9 and honest-state probe-verdicts, run again on
   this engine before it landed, found what it still did wrong. */

describe('an engine restating AnA\'s own input, in another form, does not confirm it (probe p3 A2/A3)', () => {
  it('a proportion she passed, restated as a percentage, is her input', () => {
    const c = checkAnswer('The response rate is 47%.', [tool('compute_rate', { status: 'computed', assumed_rate: '47%' }, { rate: 0.47 })]);
    expect(c.found).toBe(0);
    expect(texts(c.fromInput)).toEqual(['47%']);
  });

  it('a percentage she passed, restated as a proportion, is her input', () => {
    const c = checkAnswer('The response rate is 47%.', [tool('compute_rate', { status: 'computed', rate: 0.47 }, { rate_pct: 47 })]);
    expect(c.found).toBe(0);
    expect(texts(c.fromInput)).toEqual(['47%']);
  });

  it('a figure she searched for is still found in a passage the source returns (HS-5 holds)', () => {
    const hit = tool(
      'search_pubmed',
      { articles: [{ pmid: '30280635', abstract: 'Overall survival was longer with pembrolizumab (hazard ratio for death, 0.49; 95% CI, 0.38 to 0.64).' }] },
      { query: 'pembrolizumab hazard ratio 0.49' },
    );
    expect(checkAnswer('The HR for death was 0.49.', [hit]).found).toBe(1);
    expect(checkAnswer('The HR was 0.49.', [hit]).found).toBe(1);
  });

  it('a figure one tool restates from her input is found in another tool that returns it', () => {
    const engine = tool('compute_rate', { status: 'computed', assumed_rate: '47%' }, { rate: 0.47 });
    const registry = tool('search_clinical_evidence', { studies: [{ nctId: 'NCT02142738', orr: '47%', briefTitle: 'KEYNOTE-024' }] }, { query: 'KEYNOTE-024' });
    const c = checkAnswer('The response rate is 47%.', [engine, registry]);
    expect(c.found).toBe(1);
    expect(c.fromInput).toEqual([]);
  });
});

describe('an identifier the citation tool verified is found (probe p5 G1)', () => {
  // The real generate_citation shape (citation-generator.ts journalCitation):
  // the PMID is in the echoed sourceIdentifier and the PubMed URL only.
  const verified = (given: string) =>
    tool(
      'generate_citation',
      {
        sourceType: 'journal_article',
        sourceIdentifier: given,
        citation: 'Reck M, Rodríguez-Abreu D. Pembrolizumab versus chemotherapy for PD-L1-positive NSCLC. N Engl J Med. 2016.',
        verification: 'verified',
        verifiedAgainst: 'pubmed',
        url: 'https://pubmed.ncbi.nlm.nih.gov/27718847/',
      },
      { source_type: 'journal_article', source_identifier: given },
    );

  it('a labelled PMID the tool verified is found', () => {
    expect(checkAnswer('KEYNOTE-024 was reported in PMID 27718847.', [verified('PMID 27718847')]).found).toBe(1);
    expect(checkAnswer('KEYNOTE-024 was reported in PMID: 27718847.', [verified('PMID: 27718847')]).found).toBe(1);
  });

  it('what the model packed beside it is still not found', () => {
    const c = checkAnswer('PMID 27718847 reports NCT09999999.', [verified('PMID 27718847 (pivotal trial NCT09999999)')]);
    expect(texts(c.notFound).sort()).toEqual(['NCT09999999', 'PMID 27718847'].sort());
  });
});

describe('regulations cited as a list are each read (probe p9 I7)', () => {
  it('reads "21 CFR Parts 50 and 56" as two parts', () => {
    const c = checkAnswer('21 CFR Parts 50 and 56 apply to the study.', [tool('read_project_document', 'Section 4 describes the consent process under 21 CFR 50.')]);
    expect(c.found).toBe(1);
    expect(texts(c.notFound)).toEqual(['21 CFR 56']);
    // At the end of a sentence too, and never past a different title.
    expect(checkAnswer('Consent and IRB rules are in 21 CFR Parts 50 and 56.', []).claims).toBe(2);
    expect(checkAnswer('See 21 CFR 312.32 and 15 days later 21 U.S.C. 355.', []).claims).toBe(2);
  });
});

describe('verdicts, re-run (probes p8 and probe-verdicts)', () => {
  it('names the verdicts round 2 still missed', () => {
    for (const sentence of [
      'The package is ready for FDA submission.',
      'The facility is GMP-compliant.',
      'The protocol complies with ICH E6(R3).',
      'It satisfies all FDA requirements.',
      'The NDA should be approved.',
      'The BLA will be approved.',
      'The section is in compliance with 21 CFR 312.23.',
    ]) {
      expect(checkAnswer(sentence, []).verdicts, sentence).toHaveLength(1);
    }
  });

  it('does not name a verdict asked, doubted, or made conditional after it', () => {
    for (const sentence of [
      'Is the section fully compliant? That needs the gap analysis.',
      'There is no guarantee the agency will accept this approach.',
      'The system is compliant only when audit trails are switched on.',
      'The package is ready to file once the stability update is in.',
      'The SOP will likely be approved by the two signers this week.',
    ]) {
      expect(checkAnswer(sentence, []).verdicts, sentence).toEqual([]);
    }
  });
});

describe('cost at scale (probe p6)', () => {
  it('200 identifiers and 200 figures against 25 sources of 60k characters take well under two seconds', () => {
    // The reviewers' p6 turn: round 1 ran it in 232 ms, this engine first in 5.6 s.
    const filler = Array.from({ length: 6000 }, (_, i) => `row ${i} value ${(i * 7) % 997} date 2019-0${(i % 9) + 1}-1${i % 9}`).join('\n').slice(0, 60_000);
    const sources = Array.from({ length: 25 }, (_, i) => tool(`t${i}`, `${filler} NCT0${String(1000000 + i).padStart(7, '0')}`));
    const ids = Array.from({ length: 200 }, (_, i) => `NCT0${String(2000000 + i).padStart(7, '0')}`).join(', ');
    const figs = Array.from({ length: 200 }, (_, i) => `${(i % 97) + 1}.${i % 10}%`).join(', ');
    const start = Date.now();
    const c = checkAnswer(`${ids}. ${figs}.`, sources);
    expect(Date.now() - start).toBeLessThan(2000);
    expect(c.claims).toBeGreaterThan(300);
  });
});

/* ── Every rule pinned ────────────────────────────────────────────────────────
   The first mutation run of round 2 left these rules with no test that fails
   when the rule is removed (r2/mutants). Each case is the input that rule
   exists for: an equal number in the wrong place. */

describe('a figure needs its own measure, kind by kind (round-2 mutants)', () => {
  const page = tool('read_project_document', { page: 212, durationDays: 240, alpha: 0.05, doseMgPerKg: 0.62 });

  it('a p-value needs p: alpha is not a p-value', () => {
    expect(texts(checkAnswer('The p-value was 0.05.', [page]).notFound)).toEqual(['p-value was 0.05']);
  });

  it('a hazard ratio needs its name: a dose is not a hazard ratio', () => {
    expect(texts(checkAnswer('The HR was 0.62.', [page]).notFound)).toEqual(['HR was 0.62']);
  });

  it('n and a count need what they count: a page number is neither', () => {
    expect(texts(checkAnswer('In total, n = 212.', [page]).notFound)).toEqual(['n = 212']);
    expect(texts(checkAnswer('It enrolled 212 patients.', [page]).notFound)).toEqual(['212 patients']);
  });

  it('a dose needs its unit: a duration in days is not a dose in mg', () => {
    expect(texts(checkAnswer('The dose was 240 mg.', [page]).notFound)).toEqual(['240 mg']);
  });

  it('a date is not a count, even in a field named for a cohort or a sample', () => {
    const dates = tool('read_project_document', { cohortStartDate: '2019-03-12', sampleCollectionDate: '2020-05-18T09:30:00Z' });
    expect(texts(checkAnswer('The cohort had 12 patients (n = 18).', [dates]).notFound).sort()).toEqual(['12 patients', 'n = 18'].sort());
  });

  it('"or" in a source\'s prose is not an odds ratio', () => {
    const prose = tool('read_project_document', 'Cohorts received 1.8 or 2.4 mg/kg every three weeks.');
    expect(texts(checkAnswer('The odds ratio was 2.4.', [prose]).notFound)).toEqual(['odds ratio was 2.4']);
  });
});

describe('an interval needs both bounds together, beside CI (round-2 mutants)', () => {
  it('two bounds far apart in one text are not an interval', () => {
    const far = tool(
      'read_project_document',
      `The 95% CI lower bound was 0.50 in the first cohort. ${'Enrolment continued across all regions as planned. '.repeat(3)}The response rate was 0.77 in the expansion cohort.`,
    );
    expect(texts(checkAnswer('95% CI 0.50 to 0.77', [far]).notFound)).toEqual(['95% CI 0.50 to 0.77']);
  });

  it('two numbers that are not a CI are not an interval', () => {
    const doses = tool('read_project_document', 'Doses of 0.50 to 0.77 mg/kg were tested.');
    expect(texts(checkAnswer('95% CI 0.50 to 0.77', [doses]).notFound)).toEqual(['95% CI 0.50 to 0.77']);
  });

  it('bounds from two different records are not one interval', () => {
    const arms = tool('get_results', { arms: [{ arm: 'A', ciLower: 0.5, ciUpper: 0.6 }, { arm: 'B', ciLower: 0.7, ciUpper: 0.77 }] });
    expect(texts(checkAnswer('95% CI 0.50 to 0.77', [arms]).notFound)).toEqual(['95% CI 0.50 to 0.77']);
    expect(checkAnswer('95% CI 0.70 to 0.77', [arms]).found).toBe(1);
  });

  it('an interval returned as a pair of numbers is found', () => {
    const pair = tool('get_results', { hr: 0.62, ci95: [0.5, 0.77] });
    expect(checkAnswer('HR 0.62 (95% CI 0.50 to 0.77)', [pair]).notFound).toEqual([]);
  });
});

describe('what a record must hold before it confirms what the model asked for (round-2 mutants)', () => {
  it('a record that says it was not found confirms nothing it names', () => {
    const miss = tool(
      'verify_citations',
      { results: [{ pmid: '39999999', status: 'not_found', detail: 'Identifier did not resolve in PubMed.' }] },
      { citations: [{ pmid: '39999999' }] },
    );
    expect(texts(checkAnswer('It was published as PMID 39999999.', [miss]).notFound)).toEqual(['PMID 39999999']);
  });

  it('a record holding only the model\'s own identifier and a position confirms nothing', () => {
    const supplied = 'The pivotal study NCT09999999 met its endpoint.';
    const found = tool('extract_identifiers', { identifiers: [{ value: 'NCT09999999', offset: 18 }] }, { text: supplied });
    expect(texts(checkAnswer('NCT09999999 met its endpoint.', [found]).notFound)).toEqual(['NCT09999999']);
  });

  it('a record whose own value is a figure ("47%") does confirm the identifier it is about', () => {
    const hit = tool('search_clinical_evidence', { studies: [{ nctId: 'NCT04123456', orr: '47%' }] }, { query: 'NCT04123456' });
    expect(checkAnswer('NCT04123456 reported its results.', [hit]).notFound).toEqual([]);
  });
});

describe('a malformed identifier is flagged, not skipped (round-2 mutants)', () => {
  it('a nine-digit NCT number is a claim of its own, not the trial inside it', () => {
    const c = checkAnswer('NCT025786801 is the pivotal trial.', [tool('search_clinical_evidence', { studies: [{ nctId: 'NCT02578680', briefTitle: 'A Study' }] })]);
    expect(texts(c.notFound)).toEqual(['NCT025786801']);
  });
});
