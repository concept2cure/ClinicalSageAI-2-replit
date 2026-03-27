import { describe, expect, it } from 'vitest';
import { summarizeRegulatoryTaskCoverage } from '../../services/evals/regulatoryTaskCoverage';

describe('summarizeRegulatoryTaskCoverage', () => {
  it('summarizes domain and persona coverage', () => {
    const summary = summarizeRegulatoryTaskCoverage([
      {
        id: 't1',
        domain: 'fda_510k',
        persona: 'medical_writer',
        workflow: 'drafting',
        description: 'x',
      },
      {
        id: 't2',
        domain: 'fda_510k',
        persona: 'regulatory_reviewer',
        workflow: 'review_export_gate',
        description: 'y',
      },
      {
        id: 't3',
        domain: 'eu_cer',
        persona: 'medical_writer',
        workflow: 'drafting',
        description: 'z',
      },
    ]);

    expect(summary.taskCount).toBe(3);
    expect(summary.domainCoverage.fda_510k).toBe(2);
    expect(summary.domainCoverage.eu_cer).toBe(1);
    expect(summary.personaCoverage.medical_writer).toBe(2);
    expect(summary.personaCoverage.regulatory_reviewer).toBe(1);
  });
});
