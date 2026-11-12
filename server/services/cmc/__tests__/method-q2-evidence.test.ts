/**
 * A method's per-characteristic validation evidence reaches the ICH Q2 check
 * (2026-11-12).
 *
 * Walked in the running app: the ICH Q2 check said every method was "missing
 * validation evidence: specificity, linearity / range, accuracy, precision",
 * and nothing on the method form could clear it. The check reads
 * specificity_data and its three siblings from the method's source payload;
 * the register's table has no such columns, it keeps the Q2 record in one
 * JSON column (ich_q2_parameters), so the mapper always wrote null. The form
 * now records each characteristic's result in that record (evidence), and the
 * mapper reads it from there.
 */
import { describe, expect, it } from 'vitest';
import { mapAnalyticalMethodPayload } from '../../cmc-write-through';
import { normalizeMethodPayload } from '../analytical-method-source';
import { checkQ2 } from '../ich-compliance-q2';
import type { ProgramStage, ProjectInputs } from '../ich-compliance-rules';

const ROW = {
  methodCode: 'AM-011',
  title: 'RP-HPLC assay and related substances',
  purpose: 'Assay',
  analyte: 'BX-733',
  matrix: 'Drug product',
  technique: 'HPLC',
  status: 'validated',
  validatedBy: 7,
  validationDate: new Date('2026-11-01T00:00:00Z'),
  ichQ2Parameters: {
    characteristics: ['specificity', 'linearity', 'accuracy', 'precision'],
    summary: 'Full validation to ICH Q2(R2).',
    evidence: {
      specificity: 'No interference from placebo or degradants at the analyte peak.',
      linearity: 'r² 0.9998 over 50–150% of target.',
      accuracy: 'Mean recovery 99.6% at three levels.',
      precision: 'Repeatability RSD 0.4% (n = 6).',
    },
  },
};

const marketing: ProgramStage = { application: 'marketing', phase: null, basis: 'filing type "nda"' };
const inputs = (methods: ProjectInputs['methods']): ProjectInputs => ({
  specs: [], methods, stability: [], drugSubs: [], processes: [], sourceObjects: [], sections: [], stage: marketing,
});

describe('the Q2 record’s evidence, as the ICH check reads it', () => {
  it('each characteristic’s recorded result reaches the method source', () => {
    const m = normalizeMethodPayload(mapAnalyticalMethodPayload(ROW));
    expect(m.specificityData).toBe('No interference from placebo or degradants at the analyte peak.');
    expect(m.linearityData).toBe('r² 0.9998 over 50–150% of target.');
    expect(m.accuracyData).toBe('Mean recovery 99.6% at three levels.');
    expect(m.precisionData).toBe('Repeatability RSD 0.4% (n = 6).');
  });

  it('a method whose record carries all four is not reported missing evidence', () => {
    const m = normalizeMethodPayload(mapAnalyticalMethodPayload(ROW));
    const findings = checkQ2(inputs([m as unknown as ProjectInputs['methods'][number]]));
    expect(findings.filter((f) => f.ruleId === 'Q2_INCOMPLETE_VALIDATION')).toEqual([]);
  });

  it('control: a characteristic with no recorded result is still named missing', () => {
    const partial = { ...ROW, ichQ2Parameters: { ...ROW.ichQ2Parameters, evidence: { specificity: 'Shown.', precision: '  ' } } };
    const m = normalizeMethodPayload(mapAnalyticalMethodPayload(partial));
    expect(m.precisionData).toBeNull();
    const findings = checkQ2(inputs([m as unknown as ProjectInputs['methods'][number]]));
    const incomplete = findings.find((f) => f.ruleId === 'Q2_INCOMPLETE_VALIDATION');
    expect(incomplete?.message).toMatch(/linearity \/ range, accuracy, precision/);
    expect(incomplete?.message).not.toMatch(/specificity/);
  });
});
