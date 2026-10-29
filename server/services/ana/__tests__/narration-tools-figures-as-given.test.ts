/**
 * AnA's two narration tools say the figures and facts they narrate are as given
 * in the call (D5, 2026-10-29; CSR path review, order of work item 2, Rule 2).
 *
 * narrate_statistical_result and draft_safety_narrative compose prose
 * deterministically, but every number and clinical fact in it is an argument
 * the model passed. Their output was labelled "AnA Statistical Narrator" and
 * "AnA Safety Narrative (ICH E3 §16)", like an engine's result, and said nothing
 * about where the figures came from. A figure narrated this way could read as
 * computed. Each output now states that its figures or facts are as given,
 * that none was read from a retained run or the study's data, and where the
 * sourced path is. Each tool's description says the same before AnA calls it.
 */
import { describe, expect, it } from 'vitest';
// Importing the executor registers every handler as a side effect.
import { getToolHandler } from '../AnaToolExecutor';
import { DRAFT_SAFETY_NARRATIVE, NARRATE_STATISTICAL_RESULT } from '../evidence-literature-tool-defs';

const call = async (name: string, input: Record<string, unknown>) => {
  const handler = getToolHandler(name);
  expect(handler, name).toBeDefined();
  return JSON.parse(await handler!(input, {} as never) as string) as Record<string, unknown>;
};

describe('the narration tools say their figures are as given', () => {
  it('narrate_statistical_result: every figure as given, none from a retained run, and where the run is read', async () => {
    const out = await call('narrate_statistical_result', {
      endpoint: 'recurrence of C. difficile infection through week 8', analysis_type: 'binary',
      arms: [{ name: 'LMN-201', n: 12, value: '8.3', unit: '%' }, { name: 'placebo', n: 11, value: '45.5', unit: '%' }],
      measure: 'risk difference', estimate: -37.2, ci_lower: -68.1, ci_upper: -6.3, p_value: 0.03,
    });
    expect(out.narrative).toEqual(expect.stringContaining('-37.2'));
    expect(out.figureSource).toBe('as-given');
    expect(out.source).not.toBe('AnA Statistical Narrator');
    expect(out.figureSourceNote).toMatch(/^Every figure here is as given in this call\. None was read from a retained analysis run\./);
    expect(out.figureSourceNote).toMatch(/get_csr_section_evidence/);
    expect(out.figureSourceNote).toMatch(/scientific review/);
  });

  it('draft_safety_narrative: every fact as given, none from the study data, and where the sourced narratives are built', async () => {
    const out = await call('draft_safety_narrative', {
      subject_id: 'CDI02-0107', study_id: 'LMN-201-CDI02', treatment_arm: 'LMN-201',
      event: { term: 'Clostridioides difficile colitis', severity: 'moderate', seriousness_criteria: ['hospitalization'], outcome: 'recovered' },
    });
    expect(out.narrative).toEqual(expect.stringContaining('CDI02-0107'));
    expect(out.factSource).toBe('as-given');
    expect(out.source).not.toBe('AnA Safety Narrative (ICH E3 §16)');
    expect(out.factSourceNote).toMatch(/^Every fact here is as given in this call\. None was read from the study's ADaM data\./);
    expect(out.factSourceNote).toMatch(/narrative job/);
  });

  it('each tool says so in its description, before AnA calls it', () => {
    expect(NARRATE_STATISTICAL_RESULT.description).toMatch(/as given/);
    expect(NARRATE_STATISTICAL_RESULT.description).toMatch(/get_csr_section_evidence/);
    expect(DRAFT_SAFETY_NARRATIVE.description).toMatch(/as given/);
    expect(DRAFT_SAFETY_NARRATIVE.description).toMatch(/ADaM/);
  });

  it('a refusal is unchanged: no figure, no narrative', async () => {
    expect(await call('narrate_statistical_result', { endpoint: '' })).toEqual({ error: 'narrate_statistical_result requires endpoint and a valid analysis_type.' });
    expect(await call('draft_safety_narrative', { subject_id: 'X' })).toEqual({ error: 'draft_safety_narrative requires subject_id and event.term.' });
  });
});
