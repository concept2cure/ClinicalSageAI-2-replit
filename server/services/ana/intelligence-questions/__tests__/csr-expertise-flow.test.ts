import { describe, expect, it } from 'vitest';
import { advanceFlow } from '../engine';
import { getFlowDefinition } from '../flows';
import type { FlowEngineContext, FlowState } from '../types';

const CTX: FlowEngineContext = { organizationId: 7, userId: 5, projectId: null, clientType: 'biotech' };
const state = (currentNodeId: string, answers: FlowState['answers'] = {}): FlowState => ({
  flowId: 'csr-report-v1', flowCategory: 'csr_report', currentNodeId, answers, completedNodes: [], issues: [],
  startedAt: '2026-10-30T00:00:00.000Z', complete: false, sectionProgress: {},
});
const primary = (met: boolean) => ({ primary_endpoint_description: 'Prespecified response endpoint', primary_endpoint_met: met,
  primary_endpoint_result_summary: 'Source output is awaited; no efficacy conclusion is established.' });

describe('the registered CSR interview always asks about robustness', () => {
  it.each([true, false])('primary endpoint met=%s still reaches sensitivity questions', met => {
    const step = advanceFlow(state('primary_results'), 'primary_results', primary(met), CTX);
    expect(step.event?.node.id).toBe('sensitivity_analyses');
    expect(step.event?.node.question).not.toMatch(/since.*not met/i);
  });

  it.each(['oncology', 'vaccines'])('preserves the %s branch before sensitivity for either primary outcome', area => {
    for (const met of [true, false]) {
      const step = advanceFlow(state('primary_results', { study_id: { therapeutic_area: area } }), 'primary_results', primary(met), CTX);
      const expected = area === 'oncology' ? 'oncology_efficacy' : 'vaccine_efficacy';
      expect(step.event?.node.id).toBe(expected);
      const answers = area === 'oncology'
        ? { recist_version: 'recist_1_1', independent_radiology_review: false }
        : { vaccine_efficacy_percent: 60, ve_confidence_interval: 'Source CI recorded in output', seroconversion_rate: 70 };
      expect(advanceFlow(step.state, expected, answers, CTX).event?.node.id).toBe('sensitivity_analyses');
    }
  });

  it('does not require a reason for failure after success, or a summary of analyses not performed', () => {
    const answers = { primary_results: primary(true) };
    const step = advanceFlow(state('sensitivity_analyses', answers), 'sensitivity_analyses', { sensitivity_analyses_performed: false }, CTX);
    expect(step.event?.node.id).toBe('secondary_results');
    expect((step.event?.newIssues ?? []).filter(i => i.checkId.startsWith('validation_'))).toEqual([]);
  });

  it('still asks for source-supported reasons after failure', () => {
    const step = advanceFlow(state('sensitivity_analyses', { primary_results: primary(false) }), 'sensitivity_analyses',
      { sensitivity_analyses_performed: false }, CTX);
    expect(step.event?.node.id).toBe('sensitivity_analyses');
    expect(step.event?.newIssues?.map(i => i.checkId)).toContain('validation_potential_reasons_for_failure');
  });

  it('distinguishes same-estimand sensitivity, different-estimand supplementary, and post hoc work', () => {
    const node = getFlowDefinition('csr_report', CTX)!.nodes.find(n => n.id === 'sensitivity_analyses')!;
    expect(node.guidance).toMatch(/same estimand/i);
    expect(node.guidance).toMatch(/supplementary.*different estimand/i);
    expect(node.guidance).toMatch(/post.hoc.*exploratory/i);
    expect(node.fields.some(f => f.id === 'supplementary_analysis_summary')).toBe(true);
  });
});

describe('absolute adverse event counts do not establish incidence', () => {
  it('offers neutral review of nonzero counts, without an uncomputed high-rate finding', () => {
    const step = advanceFlow(state('safety_overview'), 'safety_overview', {
      meddra_version: 'Source version', total_aes_reported: 3, drug_related_aes: 1, grade_3_or_higher_aes: 1, discontinuations_due_to_aes: 1,
      most_common_aes: 'Source-coded preferred terms and denominators are awaited.',
    }, CTX);
    expect(step.event?.node.id).toBe('serious_events');
    const issues = step.event?.newIssues ?? [];
    expect(issues).toHaveLength(2);
    expect(issues.every(i => i.severity === 'info')).toBe(true);
    expect(issues.map(i => `${i.title} ${i.message}`).join('\n')).not.toMatch(/high rate|elevated.*rate|incidence.*notable/i);
    expect(issues.every(i => /denominator/i.test(i.message))).toBe(true);
  });
});
