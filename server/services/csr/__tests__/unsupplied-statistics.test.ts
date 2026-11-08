/**
 * Rule 2 on the CSR → Module 2 path (2026-10-05).
 *
 * The CSR builder drafts every ICH E3 section with a model from study metadata
 * alone. Before this change a drafted §11.4 could state a p-value and an
 * effect size nobody computed, be stored as the section, and be copied into
 * Module 2.5 / 2.7 as the study's primary result. These tests pin the three
 * closures:
 *   1. findUnsuppliedStatistics finds figures the study information lacks;
 *   2. the builder does not store a statistical section that states one, and
 *      records why in the lineage;
 *   3. the Module 2 loader never quotes §11.4 text as the primary result.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../project-scope', () => ({ resolveCsrScope: async () => ({ projectId: 2 }) }));

const { completeMock } = vi.hoisted(() => ({
  completeMock: vi.fn(async (_messages: unknown, _options?: unknown) => ''),
}));
// The provenance drafter reads the gateway's full reply (content + served model).
const chat = async (messages: unknown, options?: unknown) => ({ content: await completeMock(messages, options), model: 'test-model', usage: { totalTokens: 7 } });
vi.mock('../../../lib/unified-ai-client.js', () => ({
  ai: { complete: completeMock, chat },
  default: { complete: completeMock, chat },
}));
vi.mock('../../usage-metering.js', () => ({
  checkQuota: vi.fn(async () => ({ allowed: true, remaining: 10, limit: 10 })),
  recordUsage: vi.fn(async () => undefined),
}));

const dbRows = vi.hoisted(() => ({
  jobs: [] as Array<Record<string, unknown>>,
  sections: [] as Array<Record<string, unknown>>,
}));
vi.mock('../../../db', () => ({
  db: {
    // The loader's read of each study's pivotal declaration (2026-10-29): none.
    execute: async () => ({ rows: [] }),
    selectDistinctOn: () => ({ from: () => ({ where: () => ({ orderBy: async () => dbRows.jobs }) }) }),
    select: () => ({
      from: () => ({
        where: () => {
          const jobs = Promise.resolve(dbRows.jobs);
          return Object.assign(jobs, { orderBy: async () => dbRows.sections });
        },
      }),
    }),
  },
}));

import { acceptEvidenceBoundDraft, findUnclaimedNumbers, findUnsuppliedStatistics, findUnsupportedCsrOutcomeConclusion, unsupportedCsrDeathCounts, unclaimedCsrSynopsisResults, isStatisticalSection, isCsrObservedResultsSection } from '../unsupplied-statistics';
import { draftCSRSectionWithProvenance, type CSRBuildRequest, type CSRSection } from '../../csr-builder';
import { loadCsrInputsForProject } from '../load-csr-inputs-for-project';

const STUDY: CSRBuildRequest['studyInfo'] = {
  title: 'A Phase 3 Study of Drug X in Condition Y',
  protocolNumber: 'X-301',
  phase: '3',
  indication: 'Condition Y',
  sponsor: 'Sponsor',
  investigationalProduct: 'Drug X',
  comparator: 'placebo',
  studyDesign: 'randomized, double-blind, placebo-controlled',
  primaryEndpoint: 'change from baseline in score at week 12',
  sampleSize: 300,
} as CSRBuildRequest['studyInfo'];

function section(number: string): CSRSection {
  return { number, title: 'T', required: true, description: 'D', draftingMode: 'narrative', content: '', status: 'empty' } as CSRSection;
}

const request = { organizationId: 1, userId: 1, studyInfo: STUDY } as CSRBuildRequest;

describe('findUnclaimedNumbers (evidence-bound sections)', () => {
  const known = { claimed: ['12 (10.5%)', '114'] };
  it('passes claimed numbers and cross-references to report parts', () => {
    expect(findUnclaimedNumbers('12 of 114 patients (10.5%); see Table 14.3.1, Listing 16.2.7, §12.2.1 and ICH E3.', known)).toEqual([]);
  });
  it('refuses any other number, however it is written', () => {
    expect(findUnclaimedNumbers('13 of 114 patients; 11.5 percent; 1,250 events', known).map(f => f.text)).toEqual(['13', '11.5', '1250']);
  });
  it('does not let a reference word hide a percentage', () => {
    expect(findUnclaimedNumbers('section 11.5% of patients', known).map(f => f.text)).toEqual(['11.5']);
  });

  it.each([
    ['<0.001', 'p=0.001'], ['0.001', 'p<0.001'], ['>0.999', 'p≥0.999'],
    ['-2.50', 'The difference was 2.50.'], ['2.50', 'The difference was 2.5.'],
    ['12%', '12 patients completed.'], ['12', '12% completed.'], ['0.001', 'p=0.001e-3'],
  ])('does not let the supplied display %s authorize %s', (value, prose) => {
    expect(findUnclaimedNumbers(prose, { claimed: [value] })).not.toEqual([]);
  });

  it('checks a conflicting occurrence even when an exact occurrence is also present', () => {
    expect(findUnclaimedNumbers('p<0.001 in the table; p=0.001 in the conclusion.', { claimed: ['<0.001'] })).not.toEqual([]);
  });

  it('reads encoded operators as visible figures and ignores digits in markup', () => {
    expect(findUnclaimedNumbers('<p data-run="99">p &lt; 0.001 and a difference of &#8722;2.50.</p>',
      { claimed: ['<0.001', '-2.50'] })).toEqual([]);
    expect(findUnclaimedNumbers('<p>p &gt; 0.001.</p>', { claimed: ['<0.001'] })).not.toEqual([]);
    expect(findUnclaimedNumbers('<p title="x>99">p &lt;0.001.</p>', { claimed: ['<0.001'] })).toEqual([]);
  });

  it.each(['p&Lt;0.001', 'p&ne;0.001', 'p≈0.001', 'p=0.001&unknownunit;', 'p=0.001abc',
    'p=0.001%3', 'p=0.001mg/mL'])('does not borrow supplied scalars across the boundary in %s', prose => {
    expect(findUnclaimedNumbers(prose, { claimed: ['0.001', '0.001%', '0.001mg', '3'] })).not.toEqual([]);
  });

  it.each(['constructor', 'toString'])('refuses unknown entity &%s; without throwing', entity => {
    expect(findUnclaimedNumbers(`<p>p &${entity};0.001.</p>`, { claimed: ['0.001'] })).not.toEqual([]);
  });

  it('decodes original draft prose once and never promotes a literal entity spelling to a threshold', () => {
    expect(findUnclaimedNumbers('<p>p &amp;lt;0.001.</p>', { claimed: ['<0.001'] })).not.toEqual([]);
    expect(findUnclaimedNumbers('<p>p &lt;0.001.</p>', { claimed: ['<0.001'] })).toEqual([]);
  });

  it.each(['ng/mL', 'µg/mL', 'pg/mL', 'copies/mL'])('keeps a separated %s concentration distinct from a count', unit => {
    expect(findUnclaimedNumbers(`Concentration: 5 ${unit}.`, { claimed: ['5'] })).not.toEqual([]);
    expect(findUnclaimedNumbers('5 subjects.', { claimed: [`5 ${unit}`] })).not.toEqual([]);
    expect(findUnclaimedNumbers(`Concentration: 5 ${unit}.`, { claimed: [`5 ${unit}`] })).toEqual([]);
    expect(findUnclaimedNumbers('5 subjects.', { claimed: ['5'] })).toEqual([]);
  });
});

describe('findUnsuppliedStatistics', () => {
  it('finds each kind of figure a model could invent', () => {
    const draft =
      'The primary endpoint was met (p=0.003). The hazard ratio was 0.72 (0.58, 0.89). ' +
      'Adverse events occurred in 41.5% of patients; n=148 completed. A significance level of 0.05 was used. ' +
      '12 deaths were reported.';
    const kinds = findUnsuppliedStatistics(draft, STUDY).map((s) => s.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(['p-value', 'confidence interval', 'effect estimate', 'percentage', 'count', 'significance level']),
    );
  });

  it('admits a figure the study information supplied, and a confidence level', () => {
    const draft = 'Approximately 300 subjects were planned. Results are reported with 95% CI where applicable.';
    expect(findUnsuppliedStatistics(draft, STUDY)).toEqual([]);
  });

  it('finds a Bayesian result a model could invent: a posterior, an n/N and an unbracketed interval', () => {
    const draft = 'Global cure occurred in 10/12 participants on Drug X and 4/11 on placebo. ' +
      'The posterior probability that Drug X is superior was 0.993; the odds ratio was 7.8 (95% CrI 1.1 to 69.5).';
    const found = findUnsuppliedStatistics(draft, STUDY);
    expect(found.map((s) => s.kind)).toEqual(expect.arrayContaining(['count', 'posterior probability', 'interval', 'effect estimate']));
    expect(found.map((s) => s.text)).toEqual(expect.arrayContaining(['10/12', '4/11', 'CrI 1.1 to 69.5']));
  });

  it('admits a supplied phase written n/N, a date and a posterior placeholder', () => {
    const draft = 'This Phase 2/3 study was locked on 10/12/2025. The posterior probability [DATA TO BE INSERTED] is reported in the SAP.';
    expect(findUnsuppliedStatistics(draft, { ...STUDY, phase: '2/3' })).toEqual([]);
  });

  it('admits placeholder prose', () => {
    const draft = '[DATA TO BE INSERTED] The primary endpoint was [met/not met] (p=[value]); [N] patients completed.';
    expect(findUnsuppliedStatistics(draft, STUDY)).toEqual([]);
  });

  it('treats methods and results sections as statistical, and ethics as not', () => {
    for (const n of ['2', '9.7', '10.1', '11.4', '12.2', '13', '14.2']) expect(isStatisticalSection(n)).toBe(true);
    for (const n of ['5', '7', '8.1', '9.1', '9.3']) expect(isStatisticalSection(n)).toBe(false);
  });
});

describe('evidence-bound clinical result figures cannot borrow planned numbers', () => {
  // Every record is synthetic. These tests distinguish the plan/metadata from
  // observed outcomes; a matching decimal is not an analysis provenance link.
  const evidence = {
    evidenceDigest: 'e'.repeat(64),
    tables: [{
      key: 'deathsSAEsDiscontinuations',
      title: 'Serious-event results', headers: ['Outcome', 'Study treatment'],
      rows: [['Deaths', '300']],
      sha256: 'f'.repeat(64),
    }],
  } as unknown as Parameters<typeof acceptEvidenceBoundDraft>[1];
  const base = { sampleSize: 300, phase: '3', protocolNumber: 'SYN-300',
    studyDesign: 'Phase 3, randomized', primaryEndpoint: 'Responder rate 95%' };
  const attempt = (sectionNumber: string, prose: string, claims: unknown[] = []) => {
    const lineage: Record<string, unknown> = {};
    const accepted = acceptEvidenceBoundDraft({ sectionNumber, prose, claims },
      evidence, base, lineage);
    return { accepted, lineage };
  };

  it.each([
    ['10.1', '300 participants completed the study.'],
    ['11.4.1', 'The response rate was 95%.'],
    ['12.2', 'A total of 300 patients died.'],
    ['13', 'An odds ratio of 3 was observed.'],
  ])('does not use planned metadata to support observed clinical facts in §%s', (section, prose) => {
    expect(isCsrObservedResultsSection(section)).toBe(true);
    expect(attempt(section, prose)).toMatchObject({
      accepted: false, lineage: { rejectedModelDraft: { reason: 'unreconciled_figures' } },
    });
  });

  it('allows a result figure only when a claimed cell matches the retained table', () => {
    const claim = { table: 'deathsSAEsDiscontinuations', row: 0, column: 1, value: '300' };
    expect(attempt('12.3', 'The source table records 300 deaths.', [claim])).toMatchObject({
      accepted: true,
      lineage: { reconciliation: { status: 'matches', basis: 'exact_retained_table_cell' } },
    });
  });

  it.each([['Response (%)', true], ['95% CI', false], ['n (%)', false], ['Count (%)', false]])(
    'requires a percent-only column for an implicit percentage unit (%s)', (header, accepted) => {
    const percentageEvidence = { ...evidence, tables: [{ key: 'primaryEfficacy', title: 'Synthetic efficacy',
      headers: ['Endpoint', header], rows: [['Response', '83.3']], sha256: 'a'.repeat(64) }] } as unknown as Parameters<typeof acceptEvidenceBoundDraft>[1];
    const lineage: Record<string, unknown> = {};
    expect(acceptEvidenceBoundDraft({ sectionNumber: '11.4', prose: 'The response rate was 83.3%.',
      claims: [{ table: 'primaryEfficacy', row: 0, column: 1, value: '83.3' }] }, percentageEvidence, {}, lineage)).toBe(accepted);
  });

  it('does not prevent the documented planned enrollment in the statistical-methods section', () => {
    expect(isCsrObservedResultsSection('9.7.1')).toBe(false);
    expect(attempt('9.7.1', 'Enrollment of 300 participants was planned.')).toMatchObject({
      accepted: true, lineage: { reconciliation: { status: 'not_assessed' } },
    });
  });
});

describe('qualitative clinical outcome claims require independent source-backed interpretation', () => {
  const evidence = {
    evidenceDigest: 'f'.repeat(64),
    tables: [{
      key: 'deathsSAEsDiscontinuations',
      title: 'Deaths and serious events',
      headers: ['Outcome', 'Treatment'], rows: [['Fatal adverse events', '0']],
      sha256: 'a'.repeat(64),
    }],
  } as unknown as Parameters<typeof acceptEvidenceBoundDraft>[1];

  it.each([
    ['12.3', 'No deaths were reported in the treatment arm.', 'absence_of_safety_event'],
    ['12.2', 'No serious adverse events occurred.', 'absence_of_safety_event'],
    ['11.4.1', 'The primary endpoint was met.', 'endpoint_success'],
    ['13', 'The treatment demonstrated noninferiority.', 'comparative_success'],
    ['13', 'Treatment was well tolerated.', 'safety_or_benefit_risk_verdict'],
    ['2', 'The primary endpoint was achieved.', 'endpoint_success'],
  ])('refuses unsubstantiated §%s categorical assertion', (section, prose, category) => {
    expect(findUnsupportedCsrOutcomeConclusion(section, prose)).toBe(category);
    const lineage: Record<string, unknown> = {};
    expect(acceptEvidenceBoundDraft({ sectionNumber: section, prose, claims: [] }, evidence, STUDY, lineage)).toBe(false);
    expect(lineage.rejectedModelDraft).toMatchObject({ reason: 'unsubstantiated_outcome_conclusion', category });
  });

  it('retains truthful unknown-source prose rather than claiming no events', () => {
    expect(findUnsupportedCsrOutcomeConclusion('12.3', 'The number of fatal events was not supplied.')).toBeNull();
    expect(findUnsupportedCsrOutcomeConclusion('11.4.1', 'Whether the primary endpoint was met is not established.')).toBeNull();
    expect(findUnsupportedCsrOutcomeConclusion('9.7.1', 'The primary endpoint was met in the prior literature.')).toBeNull();
  });

  it('still accepts an exact source-backed count rather than an ungrounded absence verdict', () => {
    const lineage: Record<string, unknown> = {};
    expect(acceptEvidenceBoundDraft({
      sectionNumber: '12.3', prose: 'Fatal adverse events: 0 in the retained table.',
      claims: [{ table: 'deathsSAEsDiscontinuations', row: 0, column: 1, value: '0' }],
    }, evidence, STUDY, lineage)).toBe(true);
    expect(lineage.reconciliation).toMatchObject({ status: 'matches' });
  });
});

describe('ICH E3 synopsis separates planned study numbers from actual outcomes', () => {
  it('does not mistake planned enrollment for observed completion even when both use 300', () => {
    const prose = 'An enrollment of 300 was planned. 300 participants completed treatment.';
    expect(unclaimedCsrSynopsisResults(prose, [])).toEqual(['300']);
  });
  it('permits clearly planned recruitment but requires current completion receipts', () => {
    expect(unclaimedCsrSynopsisResults('We planned to enroll 300 participants.', [])).toEqual([]);
    expect(unclaimedCsrSynopsisResults('Of 300 participants, 114 completed treatment.', ['300', '114']))
      .toEqual([]);
    expect(unclaimedCsrSynopsisResults('Of 300 participants, 114 completed treatment.', ['114']))
      .toEqual(['300']);
    expect(unclaimedCsrSynopsisResults('114 participants completed treatment.', []))
      .toEqual(['114']);
  });
  it('preserves study identifiers and reference numbers when inspecting actual outcomes', () => {
    expect(unclaimedCsrSynopsisResults(
      'In SYN-300 (NCT05330182), 114 participants completed treatment (Table 14.1.1).',
      [],
    )).toEqual(['114']);
  });
});

describe('death count semantic receipts', () => {
  const evidence = {
    evidenceDigest: 'd'.repeat(64),
    tables: [{
      key: 'analysisPopulations', title: 'Analysis populations',
      headers: ['Population', 'Treatment'], rows: [['Safety population', '300']],
      sha256: 'e'.repeat(64),
    }, {
      key: 'deathsSAEsDiscontinuations', title: 'Death and serious event counts',
      headers: ['Outcome', 'Treatment'], rows: [['Fatal AEs', '1']],
      sha256: 'f'.repeat(64),
    }],
  } as unknown as Parameters<typeof acceptEvidenceBoundDraft>[1];
  const population = { table: 'analysisPopulations', row: 0, column: 1, value: '300' };
  const death = { table: 'deathsSAEsDiscontinuations', row: 0, column: 1, value: '1' };

  it('does not present the safety population as the number of deaths', () => {
    const lineage: Record<string, unknown> = {};
    const prose = '300 patients died during treatment.';
    expect(unsupportedCsrDeathCounts(prose, [population], evidence)).toEqual(['300']);
    expect(acceptEvidenceBoundDraft({
      sectionNumber: '12.3.3', prose, claims: [population],
    }, evidence, { plannedSampleSize: 300 }, lineage)).toBe(false);
    expect(lineage.rejectedModelDraft).toMatchObject({
      reason: 'outcome_cell_mismatch', category: 'death_count',
    });
  });

  it('permits exact fatal-event counts from the correct source row', () => {
    const lineage: Record<string, unknown> = {};
    const prose = '1 patient died during treatment.';
    expect(unsupportedCsrDeathCounts(prose, [death], evidence)).toEqual([]);
    expect(acceptEvidenceBoundDraft({
      sectionNumber: '12.3', prose, claims: [death],
    }, evidence, {}, lineage)).toBe(true);
    expect(lineage.reconciliation).toMatchObject({ status: 'matches' });
  });

  it('does not infer zero deaths from an absence of data', () => {
    const lineage: Record<string, unknown> = {};
    const prose = 'No deaths were reported.';
    expect(acceptEvidenceBoundDraft({
      sectionNumber: '12.3', prose, claims: [],
    }, evidence, {}, lineage)).toBe(false);
    expect(lineage.rejectedModelDraft).toMatchObject({
      reason: 'unsubstantiated_outcome_conclusion',
    });
  });
});

describe('draftCSRSectionWithProvenance', () => {
  beforeEach(() => completeMock.mockReset());

  // Since 2026-10-29 the builder drafts E3's own headings: §11.4 through
  // §11.4.1–11.4.7, ethics through §5.1–5.3, §9.7 through §9.7.1–9.7.2.
  it('does not store a statistical-plan model draft that states figures nobody supplied', async () => {
    completeMock.mockResolvedValueOnce(
      'STATISTICAL PLAN\nThe plan assumed a mean difference of 4.2 points, alpha=0.05 and 80% power.',
    );
    const drafted = await draftCSRSectionWithProvenance(section('9.7.1'), request);

    expect(drafted.source).toBe('template');
    expect(drafted.content).toContain('[DATA TO BE INSERTED FROM THE SAP]');
    expect(drafted.content).not.toContain('4.2');
    expect(drafted.lineage?.rejectedModelDraft).toMatchObject({ reason: 'unsupplied_statistics' });
  });

  it('keeps a statistical-plan draft that states only the supplied planned sample size', async () => {
    completeMock.mockResolvedValueOnce('STATISTICAL PLAN\n[DATA TO BE INSERTED FROM THE SAP] for the primary endpoint in the 300 planned subjects.');
    const drafted = await draftCSRSectionWithProvenance(section('9.7.1'), request);
    expect(drafted.source).toBe('ai');
    // The served model and token cost are the gateway's, not null and 0.
    expect(drafted).toMatchObject({ model: 'test-model', tokenCost: 7 });
  });

  it('retains non-statistical source-limited narrative drafting', async () => {
    completeMock.mockResolvedValueOnce('ETHICS\n[DATA TO BE INSERTED FROM APPROVAL RECORDS].');
    const drafted = await draftCSRSectionWithProvenance(section('5.1'), request);
    expect(drafted.source).toBe('ai');
  });

  it('the §9.7 template no longer asserts an analysis population or alpha nobody supplied', async () => {
    completeMock.mockResolvedValueOnce('');
    const drafted = await draftCSRSectionWithProvenance(section('9.7.1'), request);
    expect(drafted.source).toBe('template');
    expect(drafted.content).not.toMatch(/intent-to-treat|0\.05|finalized prior to database lock/i);
    expect(drafted.content).toContain('[DATA TO BE INSERTED FROM THE SAP]');
  });
});

describe('loadCsrInputsForProject — the Module 2 primary result', () => {
  it('quotes the pointer to §11.4, never §11.4 text, even when the section states a result', async () => {
    dbRows.jobs = [{ id: 7, studyId: 'X-301', studyInfoSnapshot: { studyInfo: STUDY } }];
    dbRows.sections = [
      {
        sectionNumber: '11.4',
        content: 'The primary endpoint was met (p<0.001).',
        jobId: 7,
      },
    ];
    const [input] = await loadCsrInputsForProject(1, 2);
    expect(input.primaryResult).toBe('See §11.4 (Efficacy Results) of the CSR for tabulated results.');
    expect(input.primaryResult).not.toContain('p<0.001');
    expect(input.csrSections?.map((s) => s.number)).toEqual(['11.4']);
  });
});
