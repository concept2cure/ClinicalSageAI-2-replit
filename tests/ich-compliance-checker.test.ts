/**
 * Unit tests for the ICH compliance checker's per-rule functions. The
 * runIchComplianceCheck() entry point pulls from the DB; these tests
 * exercise the pure rule logic against fixture inputs so every check
 * runs without a database.
 */

import { describe, it, expect } from 'vitest';
import {
  checkQ1A, checkQ2, checkQ3AandQ3B, checkQ3D, checkQ6AandQ6B,
  checkQ8, checkQ9, checkQ10,
  type ProjectInputs,
} from '../server/services/cmc/ich-compliance-rules';

function emptyInputs(): ProjectInputs {
  return {
    specs: [],
    methods: [],
    stability: [],
    drugSubs: [],
    processes: [],
    sourceObjects: [],
    sections: [],
  };
}

describe('ICH Q1A(R2) — stability', () => {
  it('fails when there are no stability studies', () => {
    const f = checkQ1A(emptyInputs());
    expect(f).toHaveLength(1);
    expect(f[0].status).toBe('fail');
    expect(f[0].ruleId).toBe('Q1A_NO_STABILITY');
    expect(f[0].citation).toMatch(/ICH Q1A/);
  });

  it('fails when no long-term study is recorded', () => {
    const inp = emptyInputs();
    inp.stability = [
      { studyName: 'Accel-1', studyType: 'accelerated', storageCondition: '40°C / 75% RH', status: 'in_progress' },
    ];
    const f = checkQ1A(inp);
    expect(f.some(x => x.ruleId === 'Q1A_NO_LONG_TERM' && x.status === 'fail')).toBe(true);
  });

  it('warns when fewer than three long-term batches', () => {
    const inp = emptyInputs();
    inp.stability = [
      { studyName: 'LT-1', studyType: 'long-term', storageCondition: '25°C / 60% RH', status: 'in_progress' },
      { studyName: 'Accel-1', studyType: 'accelerated', storageCondition: '40°C / 75% RH', status: 'in_progress' },
    ];
    const f = checkQ1A(inp);
    expect(f.some(x => x.ruleId === 'Q1A_BATCH_COUNT' && x.status === 'warning')).toBe(true);
  });

  it('fails when a stability study is in failed status', () => {
    const inp = emptyInputs();
    inp.stability = [
      { studyName: 'LT-1', studyType: 'long-term', storageCondition: '25°C / 60% RH', status: 'in_progress' },
      { studyName: 'LT-2', studyType: 'long-term', storageCondition: '25°C / 60% RH', status: 'in_progress' },
      { studyName: 'LT-3', studyType: 'long-term', storageCondition: '25°C / 60% RH', status: 'failed' },
      { studyName: 'Accel-1', studyType: 'accelerated', storageCondition: '40°C / 75% RH', status: 'in_progress' },
    ];
    const f = checkQ1A(inp);
    expect(f.some(x => x.ruleId === 'Q1A_FAILED_STUDY' && x.status === 'fail')).toBe(true);
  });

  it('passes when 3+ long-term, accelerated present, none failed', () => {
    const inp = emptyInputs();
    inp.stability = [
      { studyName: 'LT-1', studyType: 'long-term', storageCondition: '25°C / 60% RH', status: 'in_progress' },
      { studyName: 'LT-2', studyType: 'long-term', storageCondition: '25°C / 60% RH', status: 'in_progress' },
      { studyName: 'LT-3', studyType: 'long-term', storageCondition: '25°C / 60% RH', status: 'in_progress' },
      { studyName: 'Accel-1', studyType: 'accelerated', storageCondition: '40°C / 75% RH', status: 'in_progress' },
    ];
    const f = checkQ1A(inp);
    expect(f.some(x => x.status === 'pass')).toBe(true);
    expect(f.every(x => x.status !== 'fail')).toBe(true);
  });
});

describe('ICH Q2(R1) — analytical method validation', () => {
  it('fails when there are no methods', () => {
    const f = checkQ2(emptyInputs());
    expect(f[0].status).toBe('fail');
    expect(f[0].ruleId).toBe('Q2_NO_METHODS');
  });

  it('fails when any method lacks validated status', () => {
    const inp = emptyInputs();
    inp.methods = [
      { methodName: 'HPLC Assay', methodType: 'HPLC', purpose: 'assay', validationStatus: 'validated',
        specificityData: {}, linearityData: {}, accuracyData: {}, precisionData: {} },
      { methodName: 'HPLC Imp', methodType: 'HPLC', purpose: 'impurities', validationStatus: 'in_progress',
        specificityData: {}, accuracyData: {}, precisionData: {} },
    ];
    const f = checkQ2(inp);
    expect(f.some(x => x.ruleId === 'Q2_UNVALIDATED_METHODS' && x.status === 'fail')).toBe(true);
  });

  it('warns when a quantitative method lacks linearity / accuracy / precision', () => {
    const inp = emptyInputs();
    inp.methods = [
      { methodName: 'HPLC Assay', methodType: 'HPLC', purpose: 'assay', validationStatus: 'validated',
        specificityData: {} /* missing linearity, accuracy, precision */ },
    ];
    const f = checkQ2(inp);
    const inc = f.find(x => x.ruleId === 'Q2_INCOMPLETE_VALIDATION');
    expect(inc).toBeDefined();
    expect(inc?.status).toBe('warning');
    expect(inc?.message).toMatch(/linearity/);
    expect(inc?.message).toMatch(/accuracy/);
    expect(inc?.message).toMatch(/precision/);
  });

  it('passes when all methods are validated with complete evidence', () => {
    const inp = emptyInputs();
    inp.methods = [
      { methodName: 'HPLC Assay', methodType: 'HPLC', purpose: 'assay', validationStatus: 'validated',
        specificityData: {}, linearityData: {}, accuracyData: {}, precisionData: {} },
    ];
    const f = checkQ2(inp);
    expect(f.some(x => x.status === 'pass')).toBe(true);
  });

  it('skips Q2 sub-checks for identity-only methods', () => {
    const inp = emptyInputs();
    inp.methods = [
      { methodName: 'HPLC Identity', methodType: 'HPLC', purpose: 'identity', validationStatus: 'validated',
        specificityData: {} },
    ];
    const f = checkQ2(inp);
    expect(f.some(x => x.ruleId === 'Q2_INCOMPLETE_VALIDATION')).toBe(false);
  });
});

describe('ICH Q3A(R2) / Q3B(R2) — impurities', () => {
  it('warns when there are no drug substance records', () => {
    const f = checkQ3AandQ3B(emptyInputs());
    expect(f.some(x => x.ruleId === 'Q3A_NO_DRUG_SUBSTANCE' && x.status === 'warning')).toBe(true);
  });

  it('fails when DS records have no impurity profile', () => {
    const inp = emptyInputs();
    inp.drugSubs = [{ substanceName: 'API-X' }];
    const f = checkQ3AandQ3B(inp);
    expect(f.some(x => x.ruleId === 'Q3A_NO_IMPURITY_PROFILE' && x.status === 'fail')).toBe(true);
  });

  it('warns when DP specs lack degradation-product control', () => {
    const inp = emptyInputs();
    inp.drugSubs = [{ substanceName: 'API-X', impurities: { 'imp-A': '0.1' } }];
    inp.specs = [
      { materialType: 'drug_product', materialName: 'DP', testParameters: { assay: '95-105%' } },
    ];
    const f = checkQ3AandQ3B(inp);
    expect(f.some(x => x.ruleId === 'Q3B_NO_DEGRADANTS_SPEC' && x.status === 'warning')).toBe(true);
  });

  it('passes when impurities + DP degradant control are both present', () => {
    const inp = emptyInputs();
    inp.drugSubs = [{ substanceName: 'API-X', impurities: { 'imp-A': '0.1' } }];
    inp.specs = [
      { materialType: 'drug_product', materialName: 'DP', testParameters: { assay: '95-105%', 'related substances': '<0.5%' } },
    ];
    const f = checkQ3AandQ3B(inp);
    expect(f.some(x => x.status === 'pass')).toBe(true);
  });
});

describe('ICH Q3D(R2) — elemental impurities', () => {
  it('fails when no elemental assessment is found in specs or source objects', () => {
    const f = checkQ3D(emptyInputs());
    expect(f[0].status).toBe('fail');
    expect(f[0].ruleId).toBe('Q3D_NO_ASSESSMENT');
  });

  it('passes when an elemental-impurity test parameter is on a spec', () => {
    const inp = emptyInputs();
    inp.specs = [
      { materialType: 'drug_substance', materialName: 'API', testParameters: { 'elemental impurities': '<5 ppm' } },
    ];
    const f = checkQ3D(inp);
    expect(f[0].status).toBe('pass');
  });

  it('passes when a Q3D source object is present', () => {
    const inp = emptyInputs();
    inp.sourceObjects = [{ sourceKey: 'q3d_risk_assessment_v1', sourceType: 'elemental_impurities' }];
    const f = checkQ3D(inp);
    expect(f[0].status).toBe('pass');
  });
});

describe('ICH Q6A / Q6B — specifications', () => {
  it('fails when no specs exist', () => {
    const f = checkQ6AandQ6B(emptyInputs());
    expect(f[0].status).toBe('fail');
    expect(f[0].ruleId).toBe('Q6A_NO_SPECS');
  });

  it('warns when specs lack justification text', () => {
    const inp = emptyInputs();
    inp.specs = [
      { materialType: 'drug_product', materialName: 'DP', testParameters: { assay: '95-105%' }, justification: null },
      { materialType: 'drug_product', materialName: 'DP', testParameters: { assay: '95-105%' }, justification: 'short' },
    ];
    const f = checkQ6AandQ6B(inp);
    expect(f.some(x => x.ruleId === 'Q6A_UNJUSTIFIED' && x.status === 'warning')).toBe(true);
  });

  it('flags biologic Q6B when characterization indicates HOS / peptide-map data', () => {
    const inp = emptyInputs();
    inp.specs = [
      { materialType: 'drug_substance', materialName: 'mAb', testParameters: { potency: '70-130%' }, justification: 'Justified per ICH Q6B with batch experience and HOS comparability data.' },
    ];
    inp.drugSubs = [
      { substanceName: 'mAb', characterizationData: { 'peptide_map': true, 'higher_order_structure': true } },
    ];
    const f = checkQ6AandQ6B(inp);
    expect(f.some(x => x.ruleId === 'Q6B_BIOLOGIC_PRESENT' && x.status === 'pass')).toBe(true);
  });
});

describe('ICH Q8(R2) — pharmaceutical development', () => {
  it('warns when no CPPs or QbD source objects exist', () => {
    const f = checkQ8(emptyInputs());
    expect(f[0].status).toBe('warning');
    expect(f[0].ruleId).toBe('Q8_NO_QBD_EVIDENCE');
  });

  it('passes when CPPs are recorded on a manufacturing process', () => {
    const inp = emptyInputs();
    inp.processes = [
      { processName: 'P-1', criticalProcessParameters: [{ name: 'temperature', range: '20-25°C' }] },
    ];
    const f = checkQ8(inp);
    expect(f[0].status).toBe('pass');
  });

  it('passes when a QbD / design_space source object is present', () => {
    const inp = emptyInputs();
    inp.sourceObjects = [{ sourceKey: 'design_space_v1', sourceType: 'control_strategy' }];
    const f = checkQ8(inp);
    expect(f[0].status).toBe('pass');
  });
});

describe('ICH Q9 — quality risk management', () => {
  it('warns when no risk-related source object or section narrative exists', () => {
    const f = checkQ9(emptyInputs());
    expect(f[0].status).toBe('warning');
    expect(f[0].ruleId).toBe('Q9_NO_RISK_ASSESSMENT');
  });

  it('passes when a section narrative references FMEA / HAZOP / risk assessment', () => {
    const inp = emptyInputs();
    inp.sections = [
      { sectionKey: '3.2.P.2', approvalState: 'draft', stale: false, narrativeText: 'A formal FMEA was conducted on the granulation step.' },
    ];
    const f = checkQ9(inp);
    expect(f[0].status).toBe('pass');
  });
});

describe('ICH Q10 — pharmaceutical quality system', () => {
  it('warns when fewer than two lifecycle signals are present', () => {
    const f = checkQ10(emptyInputs());
    expect(f[0].status).toBe('warning');
    expect(f[0].ruleId).toBe('Q10_LIFECYCLE_THIN');
  });

  it('passes with two or more lifecycle signals (validated process + approved section)', () => {
    const inp = emptyInputs();
    inp.processes = [{ processName: 'P-1', validationStatus: 'validated' }];
    inp.sections = [{ sectionKey: '3.2.P.3.3', approvalState: 'approved', stale: false }];
    const f = checkQ10(inp);
    expect(f[0].status).toBe('pass');
  });

  it('passes with three lifecycle signals (change control + validated + approved)', () => {
    const inp = emptyInputs();
    inp.sourceObjects = [{ sourceType: 'change_control', sourceKey: 'cc-1' }];
    inp.processes = [{ processName: 'P-1', validationStatus: 'validated' }];
    inp.sections = [{ sectionKey: '3.2.P.3.3', approvalState: 'approved', stale: false }];
    const f = checkQ10(inp);
    expect(f[0].status).toBe('pass');
    expect(f[0].evidence.length).toBe(3);
  });
});
