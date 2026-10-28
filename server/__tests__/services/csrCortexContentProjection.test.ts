import { describe, expect, it } from 'vitest';
import { projectCsrContentEvidence } from '../../services/clinical-regulatory-evidence/csr-content-projection';

const base = { reportId: 'CSR-001', sourceId: 12, studyId: 4 };
describe('CSR Cortex evidence projection', () => {
  it('projects recorded efficacy, statistics, safety and disposition into existing CRE types', () => {
    const atoms = projectCsrContentEvidence({
      ...base,
      content: {
        efficacy_results: 'Primary endpoint estimate 1.2; p=0.03',
        statistical_analyses: 'ANCOVA in ITT population',
        adverse_events: 'Two serious adverse events',
        participant_disposition: '128 randomized',
      },
    });
    expect(atoms).toHaveLength(4);
    expect(atoms.map(a => a.tags[1])).toEqual([
      'efficacy', 'biostatistics', 'safety', 'study_conduct',
    ]);
    expect(atoms.every(a => a.structuredData.verificationStatus === 'unverified')).toBe(true);
    expect(atoms.every(a => a.structuredData.sourceId === 12)).toBe(true);
  });

  it('does not invent missing data or infer statistical significance', () => {
    expect(projectCsrContentEvidence({ ...base, content: { conclusions: null } })).toEqual([]);
  });

  it('keeps stable provenance identity across reruns and changes on source revision', () => {
    const one = projectCsrContentEvidence({ ...base, content: { efficacy_results: 'Observed value A' } });
    const again = projectCsrContentEvidence({ ...base, content: { efficacy_results: 'Observed value A' } });
    const revised = projectCsrContentEvidence({ ...base, content: { efficacy_results: 'Observed value B' } });
    expect(one[0].sourceRef).toBe(again[0].sourceRef);
    expect(one[0].sourceRef).toBe(revised[0].sourceRef);
    expect(one[0].structuredData.valueHash).not.toBe(revised[0].structuredData.valueHash);
  });

  it('does not put oversized participant-level source payloads into retrieval snippets', () => {
    expect(projectCsrContentEvidence({ ...base, content: { adverse_events: 'x'.repeat(12001) } })).toEqual([]);
  });
});

describe('CSR privacy and revision safeguards', () => {
  it('does not embed structured patient-level payloads', () => {
    const atoms = projectCsrContentEvidence({
      ...base, content: { adverse_events: [{ subject_id: 'PATIENT-001', event: 'headache' }] },
    });
    expect(atoms).toEqual([]);
  });
  it('does not use an unverified clinical confidence of 1', () => {
    const atoms = projectCsrContentEvidence({ ...base, content: { efficacy_results: 'Observed endpoint result' } });
    expect(atoms[0].confidence).toBeLessThan(1);
  });
});
