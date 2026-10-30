/** Real registered-flow transitions: robustness is independent of whether efficacy succeeded. */
import { describe, expect, it } from 'vitest';
import { advanceFlow } from '../engine';
import { getFlowDefinition } from '../flows';
import type { FlowEngineContext, FlowState } from '../types';

const CTX: FlowEngineContext = { organizationId: 7, userId: 3, projectId: null, clientType: 'biotech' };
const at = (currentNodeId: string, answers: FlowState['answers'] = {}): FlowState => ({
  flowId: 'csr-scientific-reasoning', flowCategory: 'csr_report', currentNodeId, answers,
  completedNodes: [], issues: [], startedAt: '2026-10-30T00:00:00Z', complete: false, sectionProgress: {},
});
const primary = (met: boolean) => ({ primary_endpoint_description: 'The source-defined primary endpoint', primary_endpoint_met: met,
  primary_endpoint_result_summary: 'The primary result and its interpretation are retained in the source output.' });

describe('CSR robustness follows the recorded analysis, not a success/failure shortcut', () => {
  it.each([true, false])('a general study with primary endpoint met=%s reaches sensitivity questions', met => {
    const result = advanceFlow(at('primary_results'), 'primary_results', primary(met), CTX);
    expect(result.event?.node.id).toBe('sensitivity_analyses');
  });

  it.each([true, false])('an oncology study with primary endpoint met=%s keeps its therapeutic-area questions', met => {
    const result = advanceFlow(at('primary_results', { study_information: { therapeutic_area: 'oncology' } }), 'primary_results', primary(met), CTX);
    expect(result.event?.node.id).toBe('oncology_efficacy');
    const next = advanceFlow(result.state, 'oncology_efficacy', { recist_version: 'recist_1_1', independent_radiology_review: true }, CTX);
    expect(next.event?.node.id).toBe('sensitivity_analyses');
  });

  it('a vaccine study keeps its source-specific questions before robustness questions', () => {
    const result = advanceFlow(at('primary_results', { study_information: { therapeutic_area: 'vaccines' } }), 'primary_results', primary(true), CTX);
    expect(result.event?.node.id).toBe('vaccine_efficacy');
    const next = advanceFlow(result.state, 'vaccine_efficacy', { vaccine_efficacy_percent: 72, ve_confidence_interval: 'Source interval', seroconversion_rate: 80 }, CTX);
    expect(next.event?.node.id).toBe('sensitivity_analyses');
  });

  it('does not require a successful study to explain a failure, or invent sensitivity analyses that were not performed', () => {
    const result = advanceFlow(at('sensitivity_analyses', { primary_results: primary(true) }), 'sensitivity_analyses', {
      sensitivity_analyses_performed: false,
      sensitivity_analysis_rationale: 'The retained SAP and analysis report explain why no sensitivity analysis was performed; independent statistical review is required.',
      post_hoc_analyses_performed: false,
    }, CTX);
    expect(result.event?.node.id).toBe('secondary_results');
    expect(result.event?.newIssues?.filter(issue => issue.checkId.startsWith('validation_')) ?? []).toEqual([]);
  });

  it('teaches same-estimand sensitivity, different-estimand supplementary work and exploratory post hoc work', () => {
    const node = getFlowDefinition('csr_report', CTX)!.nodes.find(candidate => candidate.id === 'sensitivity_analyses')!;
    expect(node.guidance).toMatch(/same estimand/i);
    expect(node.guidance).toMatch(/different estimand/i);
    expect(node.guidance).toMatch(/post.hoc.*exploratory|exploratory.*post.hoc/i);
    expect(node.question).not.toMatch(/since.*not met/i);
  });

  it('describes uncertainty and decision criteria under the actual SAP method, not a universal superiority p-value', () => {
    const nodes = getFlowDefinition('csr_report', CTX)!.nodes;
    const primaryGuidance = nodes.find(node => node.id === 'primary_results')!.guidance!;
    expect(primaryGuidance).toMatch(/confidence interval/i);
    expect(primaryGuidance).toMatch(/credible interval/i);
    expect(primaryGuidance).toMatch(/p-values only when applicable/i);
    expect(primaryGuidance).toMatch(/noninferiority|equivalence/i);
    const conclusion = nodes.find(node => node.id === 'study_conclusions')!;
    const text = conclusion.fields.map(field => field.placeholder ?? '').join('\n');
    expect(text).toMatch(/confidence or credible interval/i);
    expect(text).toMatch(/p-values only when applicable/i);
    expect(text).toMatch(/margins|Bayesian criteria/i);
  });
});

describe('CSR safety review does not invent a high rate from a nonzero count', () => {
  const safety = { meddra_version: '26.1', total_aes_reported: 1, drug_related_aes: 0, grade_3_or_higher_aes: 1,
    discontinuations_due_to_aes: 1, most_common_aes: 'The source safety output reports the coded terms and exact counts by arm.' };

  it('one event among a large population triggers factual review without an elevated-incidence claim', () => {
    const result = advanceFlow(at('safety_overview', { analysis_populations: { safety_population_size: 1000 } }), 'safety_overview', safety, CTX);
    const issues = result.event?.newIssues?.filter(issue => /discontinuation|grade3/.test(issue.checkId)) ?? [];
    expect(issues).toHaveLength(2);
    for (const issue of issues) {
      expect(issue.severity).toBe('info');
      expect(`${issue.title} ${issue.message}`).not.toMatch(/high rate|elevated|incidence.*notable/i);
      expect(issue.message).toMatch(/source|denominator|analysis|review/i);
    }
  });

  it('a missing denominator is not substituted with a high-rate assessment', () => {
    const result = advanceFlow(at('safety_overview'), 'safety_overview', safety, CTX);
    const text = result.event?.newIssues?.map(issue => `${issue.title} ${issue.message}`).join('\n') ?? '';
    expect(text).not.toMatch(/high rate|elevated discontinuation|incidence.*notable/i);
  });

  it('zero supplied counts do not produce those event-presence issues', () => {
    const result = advanceFlow(at('safety_overview'), 'safety_overview', { ...safety, grade_3_or_higher_aes: 0, discontinuations_due_to_aes: 0 }, CTX);
    expect(result.event?.node.id).toBe('serious_events');
    expect(result.event?.newIssues?.filter(issue => /discontinuation|grade3/.test(issue.checkId)) ?? []).toEqual([]);
  });
});
