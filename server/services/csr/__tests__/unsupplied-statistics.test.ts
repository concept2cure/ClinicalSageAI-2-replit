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

const { completeMock } = vi.hoisted(() => ({
  completeMock: vi.fn(async (_messages: unknown, _options?: unknown) => ''),
}));
vi.mock('../../../lib/unified-ai-client.js', () => ({
  ai: { complete: completeMock },
  default: { complete: completeMock },
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

import { findUnsuppliedStatistics, isStatisticalSection } from '../unsupplied-statistics';
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
  return { number, title: 'T', required: true, description: 'D', content: '', status: 'empty' } as CSRSection;
}

const request = { organizationId: 1, userId: 1, studyInfo: STUDY } as CSRBuildRequest;

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

  it('admits placeholder prose', () => {
    const draft = '[DATA TO BE INSERTED] The primary endpoint was [met/not met] (p=[value]); [N] patients completed.';
    expect(findUnsuppliedStatistics(draft, STUDY)).toEqual([]);
  });

  it('treats methods and results sections as statistical, and ethics as not', () => {
    for (const n of ['2', '9.7', '10.1', '11.4', '12.2', '13', '14.2']) expect(isStatisticalSection(n)).toBe(true);
    for (const n of ['5', '7', '8.1', '9.1', '9.3']) expect(isStatisticalSection(n)).toBe(false);
  });
});

describe('draftCSRSectionWithProvenance', () => {
  beforeEach(() => completeMock.mockReset());

  it('does not store a §11.4 model draft that states results nobody supplied', async () => {
    completeMock.mockResolvedValueOnce(
      'EFFICACY RESULTS\nThe primary endpoint was met: Drug X reduced the score by 4.2 points versus placebo (p<0.001; 95% CI 2.9 to 5.5).',
    );
    const drafted = await draftCSRSectionWithProvenance(section('11.4'), request);

    expect(drafted.source).toBe('template');
    expect(drafted.content).toContain('[DATA TO BE INSERTED]');
    expect(drafted.content).not.toContain('4.2');
    expect(drafted.lineage?.rejectedModelDraft).toMatchObject({ reason: 'unsupplied_statistics' });
  });

  it('keeps a model draft of a statistical section that states nothing unsupplied', async () => {
    completeMock.mockResolvedValueOnce('EFFICACY RESULTS\n[DATA TO BE INSERTED] for the primary endpoint in the 300 planned subjects.');
    const drafted = await draftCSRSectionWithProvenance(section('11.4'), request);
    expect(drafted.source).toBe('ai');
  });

  it('does not apply the guard to a non-statistical section', async () => {
    completeMock.mockResolvedValueOnce('ETHICS\nThe study was approved by 12 IRBs.');
    const drafted = await draftCSRSectionWithProvenance(section('5'), request);
    expect(drafted.source).toBe('ai');
  });

  it('the §9.7 template no longer asserts an analysis population or alpha nobody supplied', async () => {
    completeMock.mockResolvedValueOnce('');
    const drafted = await draftCSRSectionWithProvenance(section('9.7'), request);
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
