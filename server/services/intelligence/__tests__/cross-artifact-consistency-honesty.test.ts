/**
 * The consistency checks say what they compared, and only what they compared.
 *
 * Three defects, each reproduced against the code before this change:
 *
 *  (a) A two-number fact lost its sign and its second bound. The CI pattern
 *      put the minus sign outside the capture, and the upper bound was stored
 *      as the fact's `unit`. So "95% CI -0.10 to 0.30" (crosses zero) matched
 *      "95% CI 0.10 to 0.30" (excludes it), and "ages 18 to 65" matched
 *      "ages 18 to 75".
 *  (b) check_numerical_integrity called a correct two-arm N ("Drug X n=305;
 *      placebo n=303") or two dose cohorts a LIKELY INCONSISTENCY and "RTF
 *      territory". FDA refuses to file an application that is incomplete on
 *      its face; an internal value difference is not that. The likely verdict
 *      now comes only from the canonical in-document rule, checkValueConsistency.
 *  (c) check_dossier_consistency answered "No consistency issues detected"
 *      when nothing had been compared (project 0, a short draft, no facts),
 *      and did not say when its artifact cap cut the comparison short.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbState = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock('../../../db.js', async importOriginal => {
  const real = await importOriginal<Record<string, unknown>>();
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: async (n: number) => dbState.rows.slice(0, n),
  };
  return { ...real, db: { ...(real.db as object), select: () => chain } };
});

import {
  extractNumericalFacts,
  checkInternalNumericalIntegrity,
  checkDossierConsistency,
} from '../cross-artifact-consistency';

function artifact(id: number, content: string, title = `Doc ${id}`) {
  return { id, artifactId: `a-${id}`, title, content, ctdSection: null, status: 'draft' };
}

const PAD = ' The analysis followed the prespecified statistical analysis plan for the study.';

beforeEach(() => {
  dbState.rows = [];
});

describe('(a) two-number facts keep their sign and both bounds', () => {
  it('a CI keeps the signed lower bound and the upper bound, and has no unit', () => {
    const ci = extractNumericalFacts('The treatment difference was 0.10 (95% CI -0.10 to 0.30) at Week 12.')
      .find(f => f.label === 'confidence_interval')!;
    expect(ci.value).toBe('-0.10');
    expect(ci.upper).toBe('0.30');
    expect(ci.unit).toBeUndefined();
  });

  it('normalises a Unicode minus so the bound parses as a number', () => {
    const ci = extractNumericalFacts('The LSM difference was reported with 95% CI −0.9 to −0.1 overall.')
      .find(f => f.label === 'confidence_interval')!;
    expect(ci.value).toBe('-0.9');
    expect(ci.upper).toBe('-0.1');
  });

  it('an age range keeps both ends', () => {
    const age = extractNumericalFacts('Eligible patients were ages 18 to 65 years at screening.')
      .find(f => f.label === 'age_range')!;
    expect(age.value).toBe('18');
    expect(age.upper).toBe('65');
    expect(age.unit).toBeUndefined();
  });

  it('ages 18 to 65 and ages 18 to 75 in one document are a candidate', () => {
    const report = checkInternalNumericalIntegrity(
      'The protocol enrolled patients ages 18 to 65 years. The synopsis says ages 18 to 75 years were eligible.',
    );
    const c = report.candidates.find(x => x.label === 'age_range');
    expect(c).toBeDefined();
    expect(c!.distinctValues).toEqual(['18 to 65', '18 to 75']);
  });

  it('a lower bound of 0 does not hide a negative one in the same document', () => {
    const report = checkInternalNumericalIntegrity(
      'The primary result was 95% CI 0 to 0.30 in the text, but Table 14.2 reports 95% CI -0.50 to 0.30.',
    );
    expect(report.candidates.find(x => x.label === 'confidence_interval')).toBeDefined();
  });

  it('a CI that crosses zero diverges from one that excludes it, across documents', async () => {
    dbState.rows = [artifact(1, 'The treatment difference was 0.2 (95% CI 0.10 to 0.30) for the primary endpoint.' + PAD)];
    const report = await checkDossierConsistency({
      projectId: 12,
      organizationId: 7,
      draftContent: 'The treatment difference was 0.2 (95% CI -0.10 to 0.30) for the primary endpoint.' + PAD,
    });
    const d = report.divergences.find(x => x.kind === 'numeric_divergence');
    expect(d).toBeDefined();
    expect(d!.description).toContain('-0.10 to 0.30');
    expect(d!.description).toContain('0.10 to 0.30');
  });

  it('a different upper bound diverges too', async () => {
    dbState.rows = [artifact(1, 'The treatment difference was 0.5 (95% CI 0.10 to 0.90) for the primary endpoint.' + PAD)];
    const report = await checkDossierConsistency({
      projectId: 12,
      organizationId: 7,
      draftContent: 'The treatment difference was 0.2 (95% CI 0.10 to 0.30) for the primary endpoint.' + PAD,
    });
    expect(report.divergences.some(x => x.kind === 'numeric_divergence')).toBe(true);
  });
});

describe('(a) a label stated more than once is not decided on its first occurrence', () => {
  it('the same two arms listed in a different order are not a divergence', async () => {
    dbState.rows = [artifact(1, 'Safety population (placebo n=303; Drug X n=305) received at least one dose.' + PAD)];
    const report = await checkDossierConsistency({
      projectId: 12,
      organizationId: 7,
      draftContent: 'Safety population (Drug X n=305; placebo n=303) received at least one dose.' + PAD,
    });
    expect(report.divergences.filter(d => d.kind === 'numeric_divergence')).toEqual([]);
  });

  it('a figure repeated verbatim is still one value, compared at its label severity', async () => {
    dbState.rows = [artifact(1, 'The sample size: 200 subjects were planned for the pivotal trial.' + PAD)];
    const report = await checkDossierConsistency({
      projectId: 12,
      organizationId: 7,
      draftContent: 'The sample size: 240 subjects were planned. As noted, the sample size: 240 was confirmed.' + PAD,
    });
    const d = report.divergences.filter(x => x.kind === 'numeric_divergence');
    expect(d).toHaveLength(1);
    expect(d[0].severity).toBe('critical');
    expect(d[0].draftValue).toBe('240');
  });

  it('disjoint value sets are flagged at medium, saying the values could not be paired', async () => {
    dbState.rows = [artifact(1, 'Safety population (placebo n=290; Drug X n=301) received at least one dose.' + PAD)];
    const report = await checkDossierConsistency({
      projectId: 12,
      organizationId: 7,
      draftContent: 'Safety population (Drug X n=305; placebo n=303) received at least one dose.' + PAD,
    });
    const d = report.divergences.filter(x => x.kind === 'numeric_divergence');
    expect(d).toHaveLength(1);
    expect(d[0].severity).toBe('medium');
    expect(d[0].description).toMatch(/could not be paired/);
  });
});

describe('(b) check_numerical_integrity takes its likely verdict from the canonical rule', () => {
  const runTool = async (content: string) => {
    const { getToolHandler } = await import('../../ana/AnaToolExecutor');
    return JSON.parse(await getToolHandler('check_numerical_integrity')!({ content }, { organizationId: 7, userId: 3 } as any));
  };

  it('a correct two-arm N is a review candidate, not a likely inconsistency, and never RTF', async () => {
    const out = await runTool(
      'Safety population (Drug X n=305; placebo n=303) received at least one dose of study drug during the trial.',
    );
    expect(out.verdict).toBe('review_candidates');
    expect(JSON.stringify(out)).not.toMatch(/RTF|refuse to file/i);
  }, 30_000);

  it('two dose cohorts are a review candidate, not a likely inconsistency', async () => {
    const out = await runTool(
      'Cohort A received 10 mg once daily and Cohort B received 20 mg once daily for 12 weeks of treatment.',
    );
    expect(out.verdict).toBe('review_candidates');
    expect(JSON.stringify(out)).not.toMatch(/RTF|refuse to file/i);
  }, 30_000);

  it('the same document-level sample size stated twice is still a likely inconsistency', async () => {
    const out = await runTool(
      'The planned sample size: 240 subjects across sites. Later in the synopsis the sample size: 220 subjects is stated.',
    );
    expect(out.verdict).toBe('likely_inconsistency');
    expect(out.valueInconsistencies).toHaveLength(1);
    expect(out.valueInconsistencies[0].variants).toEqual(['240', '220']);
    expect(JSON.stringify(out)).not.toMatch(/RTF|refuse to file/i);
  }, 30_000);

  it('the engine itself no longer issues a likely verdict from a severity label', () => {
    const report = checkInternalNumericalIntegrity(
      'Cohort A received 10 mg once daily and Cohort B received 20 mg once daily for 12 weeks of treatment.',
    );
    expect(report.verdict).toBe('review_candidates');
  });
});

describe('(c) check_dossier_consistency does not call "nothing compared" clean', () => {
  const DRAFT =
    'In the pivotal study the sample size was N = 240 subjects, randomized 1:1. ' +
    'The NOAEL was 50 mg/kg/day in the 28-day rat study, and the primary endpoint was met.';

  const runTool = async (input: Record<string, unknown>) => {
    const { getToolHandler } = await import('../../ana/AnaToolExecutor');
    return JSON.parse(await getToolHandler('check_dossier_consistency')!(input, { organizationId: 7, userId: 3 } as any));
  };

  it('the engine marks each early return notCompared', async () => {
    expect((await checkDossierConsistency({ projectId: 0, organizationId: 7, draftContent: DRAFT })).notCompared)
      .toBe('invalid_project');
    expect((await checkDossierConsistency({ projectId: 12, organizationId: 7, draftContent: DRAFT.slice(0, 99) })).notCompared)
      .toBe('draft_too_short');
    expect((await checkDossierConsistency({ projectId: 12, organizationId: 7, draftContent: 'x'.repeat(150) })).notCompared)
      .toBe('no_draft_facts');
  });

  it('project_id 0 answers with an error and no verdict', async () => {
    const out = await runTool({ draft_content: DRAFT, project_id: 0 });
    expect(out.notCompared).toBe('invalid_project');
    expect(typeof out.error).toBe('string');
    expect(out).not.toHaveProperty('verdict');
  }, 30_000);

  it('a 99-character draft answers with an error and no verdict', async () => {
    const out = await runTool({ draft_content: DRAFT.slice(0, 99), project_id: 12 });
    expect(out.notCompared).toBe('draft_too_short');
    expect(out).not.toHaveProperty('verdict');
    expect(JSON.stringify(out)).not.toMatch(/No consistency issues/);
  }, 30_000);

  it('a draft with no labelled figures answers with an error and no verdict', async () => {
    const out = await runTool({ draft_content: 'x'.repeat(150), project_id: 12 });
    expect(out.notCompared).toBe('no_draft_facts');
    expect(out).not.toHaveProperty('verdict');
  }, 30_000);

  it('zero other documents is not described as "no consistency issues"', async () => {
    const out = await runTool({ draft_content: DRAFT, project_id: 12 });
    expect(out.artifactsCompared).toBe(0);
    expect(out.recommendation).toBe('No other documents in this project were found, so nothing was compared.');
    expect(JSON.stringify(out)).not.toMatch(/No consistency issues/);
  }, 30_000);

  it('reports truncated when more artifacts exist than were compared', async () => {
    dbState.rows = [1, 2, 3].map(i => artifact(i, 'The sample size was N = 240 subjects in this document.' + PAD));
    const report = await checkDossierConsistency({ projectId: 12, organizationId: 7, draftContent: DRAFT, maxArtifacts: 2 });
    expect(report.artifactsCompared).toBe(2);
    expect(report.truncated).toBe(true);
  });

  it('is not truncated when every artifact fit under the cap', async () => {
    dbState.rows = [1, 2].map(i => artifact(i, 'The sample size was N = 240 subjects in this document.' + PAD));
    const report = await checkDossierConsistency({ projectId: 12, organizationId: 7, draftContent: DRAFT, maxArtifacts: 2 });
    expect(report.artifactsCompared).toBe(2);
    expect(report.truncated).toBeUndefined();
  });

  it('the tool says when its 25-document cap cut the comparison short', async () => {
    dbState.rows = Array.from({ length: 26 }, (_, i) => artifact(i + 1, 'The sample size was N = 240 subjects here.' + PAD));
    const out = await runTool({ draft_content: DRAFT, project_id: 12 });
    expect(out.artifactsCompared).toBe(25);
    expect(out.truncated).toBe(true);
    expect(out.recommendation).toMatch(/^Only 25 of this project's documents were compared/);
  }, 30_000);
});
