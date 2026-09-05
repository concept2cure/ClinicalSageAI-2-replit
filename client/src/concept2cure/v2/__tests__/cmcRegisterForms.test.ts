import { describe, it, expect } from 'vitest';
import {
  csvToArray,
  isoDate,
  asUserId,
  methodForm,
  methodBody,
  qcTestForm,
  containerClosureForm,
  containerClosureBody,
  containerClosurePatch,
  referenceStandardForm,
  referenceStandardBody,
  referenceStandardPatch,
  qualifyForm,
  qualifyBody,
  parseRowLines,
  rowLinesOf,
  MATERIAL_COLUMNS,
  CHARACTERISATION_COLUMNS,
  manufacturingProcessForm,
  manufacturingProcessPatch,
} from '../surfaces/cmcRegisterForms';
import type { ContainerClosureRow } from '../surfaces/cmcRegisterForms';
import {
  qcTestBody,
  qcReviewBody,
  stabilityForm,
  stabilityBody,
  studyTypeForCode,
  stabilityResultForm,
  stabilityResultBody,
  stabilityCloseoutBody,
  readStabilityResults,
  processValidationForm,
  processValidationBody,
  changeControlForm,
  changeControlBody,
  drugSubstanceForm,
  drugSubstanceBody,
  drugProductForm,
  drugProductBody,
  comparabilityForm,
  comparabilityBody,
} from '../surfaces/cmcRegisterForms';
import type { C2CFormConfig } from '../C2CForm';

/**
 * These mappings are the boundary between what a CMC scientist types and what
 * the governed CMC tables will accept. Two properties matter and are what the
 * suite asserts:
 *
 *  1. Every NOT NULL column on the target table is a REQUIRED field on the form
 *     that feeds it. A form that can be submitted without one produces a row the
 *     database refuses, and the scientist sees an opaque write failure instead of
 *     a named field.
 *
 *  2. A blank optional field is ABSENT from the body, never an empty string, an
 *     Invalid Date, or a fabricated default. In a regulated record, "not
 *     recorded" and "recorded as empty" are different claims.
 */

/** The keys a form marks required — the contract against the table's NOT NULLs. */
function requiredKeys(config: C2CFormConfig): string[] {
  return config.fields.filter((f) => f.required).map((f) => f.key);
}

/** Fill every field of a form with a plausible value, as the drawer would. */
function fill(config: C2CFormConfig, over: Record<string, string> = {}): Record<string, string> {
  const v: Record<string, string> = {};
  for (const f of config.fields) {
    if (f.default != null) v[f.key] = f.default;
    else if (f.options?.length) {
      const first = f.options[0];
      v[f.key] = typeof first === 'string' ? first : first.value;
    } else if (f.type === 'date') v[f.key] = '2026-05-04';
    else if (f.type === 'number') v[f.key] = '12';
    else v[f.key] = 'x-' + f.key;
  }
  return { ...v, ...over };
}

describe('cmcRegisterForms helpers', () => {
  it('csvToArray splits on commas, semicolons and newlines and drops blanks', () => {
    expect(csvToArray('0, 3,6 ;9\n12,,')).toEqual(['0', '3', '6', '9', '12']);
    expect(csvToArray('')).toEqual([]);
    expect(csvToArray(null)).toEqual([]);
    expect(csvToArray(undefined)).toEqual([]);
  });

  it('isoDate turns a form date into an ISO instant and a blank into undefined', () => {
    expect(isoDate('2026-05-04')).toBe(new Date('2026-05-04').toISOString());
    // A blank optional date must not become `new Date('')` → Invalid Date.
    expect(isoDate('')).toBeUndefined();
    expect(isoDate('   ')).toBeUndefined();
    expect(isoDate(null)).toBeUndefined();
    expect(isoDate('not a date')).toBeUndefined();
  });

  it('asUserId accepts a positive integer id and rejects everything else', () => {
    expect(asUserId('42')).toBe(42);
    expect(asUserId(42)).toBe(42);
    expect(asUserId('0')).toBeUndefined();
    expect(asUserId('-1')).toBeUndefined();
    expect(asUserId('a3b1c2d4-e5f6')).toBeUndefined();
    expect(asUserId(null)).toBeUndefined();
  });
});

describe('analytical methods — analytical_methods', () => {
  it('requires every NOT NULL column the table declares', () => {
    // methodCode, title, purpose, analyte, matrix, technique, status.
    expect(requiredKeys(methodForm()).sort()).toEqual(
      ['analyte', 'matrix', 'methodCode', 'purpose', 'status', 'technique', 'title'].sort(),
    );
  });

  it('maps a filled form onto the insert body and carries the project through', () => {
    const body = methodBody(
      {
        methodCode: 'AM-014',
        title: 'Charge variants by icIEF',
        technique: 'icIEF',
        analyte: 'Acidic variants',
        matrix: 'Drug substance',
        purpose: 'Charge variants',
        status: 'validated',
        validationDate: '2026-05-04',
        characteristics: 'Specificity, Linearity, Accuracy',
        summary: 'All characteristics met.',
      },
      'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab',
    );
    expect(body).toEqual({
      methodCode: 'AM-014',
      title: 'Charge variants by icIEF',
      purpose: 'Charge variants',
      analyte: 'Acidic variants',
      matrix: 'Drug substance',
      technique: 'icIEF',
      status: 'validated',
      ichQ2Parameters: {
        characteristics: ['Specificity', 'Linearity', 'Accuracy'],
        summary: 'All characteristics met.',
      },
      validationDate: new Date('2026-05-04').toISOString(),
      projectId: 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab',
    });
  });

  it('omits the validation date and the project when neither is given', () => {
    const body = methodBody({
      methodCode: 'AM-001', title: 'Assay by HPLC', technique: 'HPLC',
      analyte: 'BX-204', matrix: 'Drug product', purpose: 'Assay / content',
      status: 'development', validationDate: '', characteristics: '', summary: '',
    });
    expect('validationDate' in body).toBe(false);
    expect('projectId' in body).toBe(false);
    expect(body.ichQ2Parameters).toEqual({ characteristics: [] });
  });

  it('round-trips: an edit form seeded from a body reproduces the same body', () => {
    const original = methodBody({
      methodCode: 'AM-014', title: 'icIEF', technique: 'icIEF', analyte: 'Acidic',
      matrix: 'Drug substance', purpose: 'Charge variants', status: 'validated',
      validationDate: '2026-05-04', characteristics: 'Specificity, Robustness', summary: 'ok',
    });
    // The edit drawer is built from the persisted body, then submitted unchanged.
    const reEntered = methodBody(fill(methodForm(original)));
    expect(reEntered).toEqual(original);
  });
});

describe('QC testing — qc_testing', () => {
  it('requires the columns the table declares NOT NULL', () => {
    // sampleId, sampleType, testMethod, testDate.
    expect(requiredKeys(qcTestForm()).sort()).toEqual(
      ['sampleId', 'sampleType', 'testDate', 'testMethod'].sort(),
    );
  });

  it('maps the result and its acceptance criterion into the json columns', () => {
    const body = qcTestBody(
      {
        sampleId: 'S-2407-118', sampleType: 'finished-product', testMethod: 'AM-014 icIEF',
        testDate: '2026-05-04', passFailStatus: 'pass', value: '1.4', unit: '%',
        acceptanceCriteria: '<= 2.0%', observation: 'Clear, colourless',
        certificateOfAnalysis: 'CoA-2407-118',
      },
      7,
    );
    expect(body).toEqual({
      sampleId: 'S-2407-118',
      sampleType: 'finished-product',
      testMethod: 'AM-014 icIEF',
      testDate: new Date('2026-05-04').toISOString(),
      testResults: { value: '1.4', unit: '%', observation: 'Clear, colourless' },
      specifications: { acceptanceCriteria: '<= 2.0%' },
      passFailStatus: 'pass',
      certificateOfAnalysis: 'CoA-2407-118',
      analyst: 7,
    });
  });

  it('leaves the result json empty rather than inventing values, and omits an unknown analyst', () => {
    const body = qcTestBody({
      sampleId: 'S-1', sampleType: 'in-process', testMethod: 'pH',
      testDate: '2026-05-04', passFailStatus: '', value: '', unit: '',
      acceptanceCriteria: '', observation: '', certificateOfAnalysis: '',
    });
    expect(body.testResults).toEqual({});
    expect(body.specifications).toEqual({});
    expect(body.passFailStatus).toBe('pending');
    expect('analyst' in body).toBe(false);
    expect('certificateOfAnalysis' in body).toBe(false);
  });

  it('review sets the disposition and the reviewer, and never the analyst', () => {
    const body = qcReviewBody(
      { passFailStatus: 'pass', releaseDate: '2026-05-06', certificateOfAnalysis: 'CoA-9' },
      12,
    );
    expect(body).toEqual({
      passFailStatus: 'pass',
      releaseDate: new Date('2026-05-06').toISOString(),
      certificateOfAnalysis: 'CoA-9',
      reviewedBy: 12,
    });
    expect('analyst' in body).toBe(false);
  });

  it('a review with no release date does not fabricate one', () => {
    const body = qcReviewBody({ passFailStatus: 'fail', releaseDate: '', certificateOfAnalysis: '' });
    expect(body).toEqual({ passFailStatus: 'fail' });
  });

  /* QC results ARE the batch analyses of §3.2.S.4.4 / §3.2.P.5.4, and the
     server's write-through to that canonical source is keyed on the project. If
     the body omits it the write-through cannot fire and the result never reaches
     Module 3 — which is exactly how this register came to be the only one with
     no path into the submission. */
  it('carries the project on both the result and the review, so it reaches Module 3', () => {
    const created = qcTestBody(
      { sampleId: 'S-1', sampleType: 'finished-product', testMethod: 'HPLC', testDate: '2026-05-06', passFailStatus: 'pass' },
      7,
      'proj-uuid',
    );
    expect(created.projectId).toBe('proj-uuid');

    const reviewed = qcReviewBody({ passFailStatus: 'pass' }, 12, 'proj-uuid');
    expect(reviewed.projectId).toBe('proj-uuid');
  });

  it('omits the project rather than sending an empty one', () => {
    // No program in context is a real state; a blank projectId would make the
    // server attempt a canonical write for a project that does not exist.
    expect('projectId' in qcTestBody(
      { sampleId: 'S-1', sampleType: 'x', testMethod: 'y', testDate: '2026-05-06', passFailStatus: 'pass' },
      7,
    )).toBe(false);
    expect('projectId' in qcReviewBody({ passFailStatus: 'pass' }, 12, '')).toBe(false);
  });
});

describe('stability studies — stability_studies', () => {
  it('requires every NOT NULL column, including the ones the old read-only card never showed', () => {
    const keys = requiredKeys(stabilityForm());
    for (const k of ['productName', 'batchNumber', 'dosageForm', 'scope', 'climaticZone', 'condition', 'duration', 'testParameters', 'timePoints', 'startDate', 'status']) {
      expect(keys).toContain(k);
    }
  });

  it('derives the study type from the chosen ICH condition code', () => {
    expect(studyTypeForCode('ACC')).toBe('accelerated');
    expect(studyTypeForCode('INT')).toBe('intermediate');
    expect(studyTypeForCode('STR')).toBe('stress');
    expect(studyTypeForCode('LT')).toBe('long-term');
    expect(studyTypeForCode('anything-else')).toBe('long-term');
  });

  it('records both the storage code and the condition a reviewer reads', () => {
    const body = stabilityBody({
      studyTitle: 'BX-204 DP primary stability',
      productName: 'BX-204 injection', batchNumber: 'BX204-DP-2407',
      scope: 'DP', dosageForm: 'Solution for injection', strength: '50 mg/mL',
      climaticZone: 'II', condition: 'ACC|40°C ± 2°C / 75% ± 5% RH',
      duration: '6', startDate: '2026-01-15',
      timePoints: '0, 1, 3, 6', testParameters: 'Appearance, Assay',
      status: 'ACTIVE', notes: '',
    });
    expect(body.storageConditions).toEqual(['ACC', '40°C ± 2°C / 75% ± 5% RH']);
    expect(body.studyType).toBe('accelerated');
    expect(body.duration).toBe(6);
    expect(body.timePoints).toEqual(['0', '1', '3', '6']);
    expect(body.testParameters).toEqual(['Appearance', 'Assay']);
    expect(body.startDate).toBe(new Date('2026-01-15').toISOString());
    expect('notes' in body).toBe(false);
  });

  it('derives the planned end from the start and the registered duration', () => {
    const body = stabilityBody({
      productName: 'P', batchNumber: 'B', scope: 'DS', dosageForm: 'Powder',
      climaticZone: 'II', condition: 'LT|25°C ± 2°C / 60% ± 5% RH', duration: '24',
      startDate: '2026-01-15', timePoints: '0', testParameters: 'Assay', status: 'ACTIVE',
    });
    const expected = new Date(new Date('2026-01-15').toISOString());
    expected.setMonth(expected.getMonth() + 24);
    expect(body.plannedEndDate).toBe(expected.toISOString());
  });

  it('falls back to a 24-month duration only when the number is unusable', () => {
    const base = {
      productName: 'P', batchNumber: 'B', scope: 'DP', dosageForm: 'Tablet',
      climaticZone: 'II', condition: 'LT|25°C', startDate: '2026-01-15',
      timePoints: '0', testParameters: 'Assay', status: 'ACTIVE',
    };
    expect(stabilityBody({ ...base, duration: '' }).duration).toBe(24);
    expect(stabilityBody({ ...base, duration: '0' }).duration).toBe(24);
    expect(stabilityBody({ ...base, duration: '36' }).duration).toBe(36);
  });
});

describe('stability results — the series accumulates, it never overwrites', () => {
  const existing = {
    results: [
      { timePoint: '0', parameter: 'Assay', result: '99.8%', withinSpecification: true },
      { timePoint: '3', parameter: 'Assay', result: '99.1%', withinSpecification: true },
    ],
  };

  it('appends the new pull point to the recorded series', () => {
    const body = stabilityResultBody(
      { timePoint: '6', parameter: 'Assay', result: '98.4%', specification: '95.0 – 105.0%', withinSpecification: 'yes', testedOn: '2026-07-15' },
      existing,
      { condition: '25°C/60% RH', recordedBy: 'A. Analyst' },
    );
    expect(body.stabilityData.results).toHaveLength(3);
    expect(body.stabilityData.results.slice(0, 2)).toEqual(existing.results);
    expect(body.stabilityData.results[2]).toEqual({
      timePoint: '6',
      parameter: 'Assay',
      result: '98.4%',
      specification: '95.0 – 105.0%',
      withinSpecification: true,
      testedOn: new Date('2026-07-15').toISOString(),
      condition: '25°C/60% RH',
      recordedBy: 'A. Analyst',
    });
  });

  it('records an out-of-specification result as out of specification', () => {
    const body = stabilityResultBody(
      { timePoint: '12', parameter: 'Aggregates', result: '3.4%', specification: '<= 2.0%', withinSpecification: 'no' },
      null,
    );
    expect(body.stabilityData.results[0].withinSpecification).toBe(false);
  });

  it('starts a series from a study that has none', () => {
    expect(stabilityResultBody({ timePoint: '0', parameter: 'Assay', result: '100%', withinSpecification: 'yes' }, null)
      .stabilityData.results).toHaveLength(1);
  });

  it('reads the series back from every shape the json column can hold', () => {
    expect(readStabilityResults(existing)).toHaveLength(2);
    expect(readStabilityResults(JSON.stringify(existing))).toHaveLength(2);
    // A bare array from an older writer.
    expect(readStabilityResults(existing.results)).toHaveLength(2);
    // Unknown shapes read as "no results", never as fabricated ones.
    expect(readStabilityResults(null)).toEqual([]);
    expect(readStabilityResults('not json')).toEqual([]);
    expect(readStabilityResults({ nothing: true })).toEqual([]);
    expect(readStabilityResults([{ notAResult: 1 }])).toEqual([]);
  });

  it('offers the study’s own pull points and parameters as the choices', () => {
    const config = stabilityResultForm({ timePoints: ['0', '3', '6'], testParameters: ['Assay', 'Water'] });
    const point = config.fields.find((f) => f.key === 'timePoint');
    const param = config.fields.find((f) => f.key === 'parameter');
    expect(point?.type).toBe('select');
    expect(point?.options).toEqual(['0', '3', '6']);
    expect(param?.options).toEqual(['Assay', 'Water']);
  });

  it('falls back to free text when the study has no schedule recorded', () => {
    const config = stabilityResultForm({ timePoints: null, testParameters: [] });
    expect(config.fields.find((f) => f.key === 'timePoint')?.type).toBe('text');
    expect(config.fields.find((f) => f.key === 'parameter')?.type).toBe('text');
  });

  it('close-out records the shelf life and the status without inventing a basis', () => {
    expect(stabilityCloseoutBody({ shelfLife: '24 months at 5°C ± 3°C', status: 'COMPLETED', notes: '' }))
      .toEqual({ shelfLife: '24 months at 5°C ± 3°C', status: 'COMPLETED' });
  });
});

describe('process validation — process_validation', () => {
  it('requires the NOT NULL columns', () => {
    const keys = requiredKeys(processValidationForm());
    expect(keys).toContain('processName');
    expect(keys).toContain('stage');
  });

  it('maps the CPP and CQA lists into their json columns', () => {
    const body = processValidationBody({
      processName: 'Fill-finish, 2000 L', stage: 'qualification', status: 'in-progress',
      batchNumbers: 'PPQ-01, PPQ-02, PPQ-03',
      criticalProcessParameters: 'Fill speed, Bulk hold time',
      criticalQualityAttributes: 'Assay, Sub-visible particulates',
      controlStrategy: 'Each CPP held within its proven acceptable range.',
      validationProtocol: 'PV-PROT-011', approvalDate: '',
    });
    expect(body.batchNumbers).toEqual(['PPQ-01', 'PPQ-02', 'PPQ-03']);
    expect(body.criticalProcessParameters).toEqual({ parameters: ['Fill speed', 'Bulk hold time'] });
    expect(body.criticalQualityAttributes).toEqual({ attributes: ['Assay', 'Sub-visible particulates'] });
    expect(body.controlStrategy).toEqual({ summary: 'Each CPP held within its proven acceptable range.' });
    expect('approvalDate' in body).toBe(false);
  });
});

describe('change control — cmc_change_control', () => {
  it('requires justification, which the table declares NOT NULL', () => {
    const keys = requiredKeys(changeControlForm());
    for (const k of ['changeNumber', 'changeType', 'description', 'justification', 'status']) {
      expect(keys).toContain(k);
    }
  });

  it('maps the risk level and the impacted sections', () => {
    const body = changeControlBody({
      changeNumber: 'CC-2026-041', changeType: 'process',
      description: '200 L to 2000 L scale-up', justification: 'Commercial demand',
      riskLevel: 'high', status: 'under-review',
      regulatoryFiling: 'Prior-Approval Supplement (PAS)',
      implementationDate: '2026-09-01',
      impactedSections: '3.2.S.2, 3.2.P.3', impactSummary: 'Comparability required.',
    });
    expect(body.riskAssessment).toEqual({ level: 'high' });
    expect(body.impactAssessment).toEqual({
      summary: 'Comparability required.',
      impactedSections: ['3.2.S.2', '3.2.P.3'],
    });
    expect(body.implementationDate).toBe(new Date('2026-09-01').toISOString());
  });

  it('defaults the risk to medium rather than leaving the column unset', () => {
    const body = changeControlBody({
      changeNumber: 'CC-1', changeType: 'analytical', description: 'd', justification: 'j',
      riskLevel: '', status: '', regulatoryFiling: '', implementationDate: '',
      impactedSections: '', impactSummary: '',
    });
    expect(body.riskAssessment).toEqual({ level: 'medium' });
    expect(body.status).toBe('draft');
    expect(body.impactAssessment).toEqual({});
    expect('regulatoryFiling' in body).toBe(false);
  });
});

describe('drug substance and drug product — §3.2.S / §3.2.P', () => {
  it('requires the substance name, and the product name, form and strength', () => {
    expect(requiredKeys(drugSubstanceForm())).toContain('substanceName');
    const dp = requiredKeys(drugProductForm());
    for (const k of ['productName', 'dosageForm', 'strength']) expect(dp).toContain(k);
  });

  it('collects the manufacturing route into the json column', () => {
    const body = drugSubstanceBody({
      substanceName: 'BX-204', inn: 'bexatinib', casNumber: '1234-56-7',
      molecularFormula: 'C21H27N5O2', molecularWeight: '381.47',
      developmentPhase: 'phase3', manufacturer: 'Acme Pharma',
      site: 'Cork, Ireland', route: 'Five-step synthesis from intermediate A.',
      structuralFormula: 'CC(=O)…', status: 'qualified',
    });
    expect(body.manufacturingProcess).toEqual({
      manufacturer: 'Acme Pharma',
      route: 'Five-step synthesis from intermediate A.',
      site: 'Cork, Ireland',
    });
    expect(body.molecularWeight).toBe('381.47');
  });

  it('omits every blank optional column instead of writing an empty string', () => {
    const body = drugSubstanceBody({
      substanceName: 'BX-204', inn: '', casNumber: '', molecularFormula: '',
      molecularWeight: '', developmentPhase: '', manufacturer: '', site: '',
      route: '', structuralFormula: '', status: '',
    });
    expect(body).toEqual({ substanceName: 'BX-204', manufacturingProcess: {}, status: 'development' });
  });

  it('collects the composition and container closure for §3.2.P', () => {
    const body = drugProductBody({
      productName: 'BX-204 injection', dosageForm: 'Solution for injection',
      strength: '50 mg/mL', routeOfAdministration: 'Intravenous', status: 'development',
      composition: 'BX-204 50 mg/mL, histidine buffer, sucrose, polysorbate 80.',
      process: 'Compounding, sterile filtration, aseptic fill.',
      site: 'Cork, Ireland', containerClosure: '2R Type I glass vial, bromobutyl stopper',
    });
    expect(body.composition).toEqual({ description: 'BX-204 50 mg/mL, histidine buffer, sucrose, polysorbate 80.' });
    expect(body.packagingMaterials).toEqual({ containerClosure: '2R Type I glass vial, bromobutyl stopper' });
    expect(body.manufacturingProcess).toEqual({
      description: 'Compounding, sterile filtration, aseptic fill.',
      site: 'Cork, Ireland',
    });
  });
});

describe('comparability — the handler’s field names, not the table’s', () => {
  it('requires the assessment name, changed element and change type', () => {
    const keys = requiredKeys(comparabilityForm());
    for (const k of ['title', 'product', 'type', 'status']) expect(keys).toContain(k);
  });

  it('maps the affected parameters into the aliased methods array', () => {
    const body = comparabilityBody(
      {
        title: 'Comparability — scale-up', product: 'DS manufacturing scale', type: 'process',
        methods: 'Bioreactor volume, Feed strategy', status: 'in-progress',
        outcome: 'Material found comparable against all pre-defined criteria.',
      },
      'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab',
    );
    expect(body).toEqual({
      title: 'Comparability — scale-up',
      type: 'process',
      product: 'DS manufacturing scale',
      methods: ['Bioreactor volume', 'Feed strategy'],
      status: 'in-progress',
      outcome: 'Material found comparable against all pre-defined criteria.',
      projectId: 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab',
    });
  });
});

describe('every create form is fully submittable from its own defaults', () => {
  /**
   * A required field with no default and no options is one the drawer cannot
   * pre-fill, which is correct for a name or a code but wrong for a status or a
   * classification. This guards the second kind: a required select whose option
   * list is empty would block the drawer with no way forward.
   */
  const forms: Array<[string, C2CFormConfig]> = [
    ['analytical method', methodForm()],
    ['QC result', qcTestForm()],
    ['stability study', stabilityForm()],
    ['process validation', processValidationForm()],
    ['change control', changeControlForm()],
    ['drug substance', drugSubstanceForm()],
    ['drug product', drugProductForm()],
    ['comparability', comparabilityForm()],
    ['container closure', containerClosureForm()],
    ['reference standard', referenceStandardForm()],
  ];

  it.each(forms)('%s: required selects always offer at least one option', (_name, config) => {
    for (const f of config.fields) {
      if (f.required && (f.type === 'select' || f.type === 'seg')) {
        expect(f.options?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it.each(forms)('%s: no field key is declared twice', (_name, config) => {
    const keys = config.fields.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   Container closure + reference standards — the two registers §3.2.S.5 /
   §3.2.S.6 / §3.2.P.6 / §3.2.P.7 had no capture path for at all.
   ═══════════════════════════════════════════════════════════════════════════ */

describe('parseRowLines — a tabular field typed into a textarea', () => {
  it('maps pipe-delimited lines onto the declared keys', () => {
    expect(parseRowLines('Vial | Type I glass | Schott | SPEC-01 | USP <660>', [
      'component', 'material', 'supplier', 'specification', 'compendialReference',
    ])).toEqual([
      { component: 'Vial', material: 'Type I glass', supplier: 'Schott', specification: 'SPEC-01', compendialReference: 'USP <660>' },
    ]);
  });

  it('omits blank cells rather than storing empty strings, and skips blank lines', () => {
    expect(parseRowLines('Stopper | Bromobutyl | |  | \n\n  \n', [
      'component', 'material', 'supplier', 'specification', 'compendialReference',
    ])).toEqual([{ component: 'Stopper', material: 'Bromobutyl' }]);
  });

  it('is empty for an untouched field — never a row of nothing', () => {
    expect(parseRowLines('', ['component'])).toEqual([]);
    expect(parseRowLines(undefined, ['component'])).toEqual([]);
  });
});

describe('containerClosureBody', () => {
  const filled = {
    systemName: '10 mL Type I vial / 20 mm stopper',
    scope: 'drug_product',
    componentType: 'primary',
    containerDescription: '10 mL clear Type I borosilicate glass vial',
    closureDescription: '20 mm bromobutyl stopper, aluminium flip-off seal',
    supplier: 'Schott / West',
    status: 'qualified',
    compendialStandards: 'USP <660>, USP <381>',
    materialsOfConstruction: 'Vial | Type I borosilicate glass | Schott | SPEC-VIAL-01 | USP <660>',
    suitabilityJustification: 'Protection and compatibility demonstrated over 12 months.',
    elStudyType: 'Controlled extraction, 40C/75%RH, 6 months',
    elProtocol: 'PR-EL-014',
    elThreshold: '1.5 ug/day',
    elConclusion: 'All extractables below the AET.',
    elResults: 'Zinc dibutyldithiocarbamate | 0.4 | ug/day | 1.5 ug/day | below AET',
    integrityMethod: 'Helium leak (USP <1207>)',
    integrityCriteria: '<= 6e-6 mbar L/s',
    integrityResult: '2.1e-6 mbar L/s',
    qualificationDate: '2026-06-01',
  };

  it('carries every recorded field, with the tabular ones parsed into json rows', () => {
    const body = containerClosureBody(filled, 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab');
    expect(body.scope).toBe('drug_product');
    expect(body.compendialStandards).toEqual(['USP <660>', 'USP <381>']);
    expect(body.materialsOfConstruction).toEqual([
      { component: 'Vial', material: 'Type I borosilicate glass', supplier: 'Schott', specification: 'SPEC-VIAL-01', compendialReference: 'USP <660>' },
    ]);
    expect(body.extractablesLeachables).toMatchObject({
      studyType: 'Controlled extraction, 40C/75%RH, 6 months',
      protocol: 'PR-EL-014',
      analyticalEvaluationThreshold: '1.5 ug/day',
      conclusion: 'All extractables below the AET.',
    });
    expect((body.extractablesLeachables as { results: unknown[] }).results).toHaveLength(1);
    expect(body.integrityTesting).toEqual({
      method: 'Helium leak (USP <1207>)',
      acceptanceCriteria: '<= 6e-6 mbar L/s',
      result: '2.1e-6 mbar L/s',
    });
    expect(body.projectId).toBe('a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab');
  });

  /* An empty study object is truthy. Sending one would be recorded as an E&L
     study that does not exist, and the composed section would stop saying the
     package is absent — which is the only signal a reviewer has. */
  it('sends no E&L study and no integrity record when neither was entered', () => {
    const body = containerClosureBody({
      systemName: 'HDPE drum',
      scope: 'drug_substance',
      componentType: 'primary',
      containerDescription: 'HDPE drum, 25 kg',
      closureDescription: 'Screw cap',
      status: 'draft',
    });
    expect(body.extractablesLeachables).toBeUndefined();
    expect(body.integrityTesting).toBeUndefined();
    expect(body.materialsOfConstruction).toBeUndefined();
    expect(body.compendialStandards).toBeUndefined();
    expect(body.projectId).toBeUndefined();
  });
});

describe('referenceStandardBody', () => {
  it('carries the identity, the characterisation rows and the dates', () => {
    const body = referenceStandardBody({
      standardCode: 'RS-DS-001',
      standardName: 'BX-204 primary reference standard',
      scope: 'drug_substance',
      standardType: 'primary',
      lotNumber: 'RS-LOT-2405',
      assignedValue: '98.7% (as-is)',
      materialSource: 'DS lot BX204-DS-2403',
      characterization: 'Identity | FTIR | Conforms to reference spectrum\nPurity | RP-HPLC | 99.4% area',
      certificateOfAnalysis: 'CoA-RS-001-2405',
      qualificationProtocol: 'PR-RS-002',
      storageConditions: '-70C, desiccated',
      status: 'qualified',
      retestDate: '2027-05-01',
    }, 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab');
    expect(body.standardCode).toBe('RS-DS-001');
    expect(body.characterization).toHaveLength(2);
    expect(body.characterization?.[1]).toEqual({ attribute: 'Purity', method: 'RP-HPLC', result: '99.4% area' });
    expect(body.retestDate).toBe(new Date('2027-05-01').toISOString());
    expect(body.expiryDate).toBeUndefined();
    expect(body.projectId).toBe('a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   The adversarial review of the two registers: what the edit drawer destroyed,
   what it could not clear, and what it silently dropped.
   ═══════════════════════════════════════════════════════════════════════════ */

describe('the edit drawer is seeded from the stored record', () => {
  const stored: ContainerClosureRow = {
    scope: 'drug_product',
    systemName: '10 mL Type I vial / 20 mm stopper',
    componentType: 'primary',
    containerDescription: '10 mL clear Type I borosilicate glass vial',
    closureDescription: '20 mm bromobutyl stopper',
    supplier: 'Schott / West',
    compendialStandards: ['USP <660>', 'USP <381>'],
    suitabilityJustification: 'Protection and compatibility demonstrated over 12 months.',
    materialsOfConstruction: [
      { component: 'Vial', material: 'Type I borosilicate glass', supplier: 'Schott', specification: 'SPEC-VIAL-01', compendialReference: 'USP <660>' },
      { component: 'Stopper', material: 'Bromobutyl rubber', supplier: 'West' },
    ],
    extractablesLeachables: {
      studyType: 'Controlled extraction',
      protocol: 'PR-EL-014',
      conditions: '40C/75%RH, 6 months',
      analyticalEvaluationThreshold: '1.5 ug/day',
      results: [{ analyte: 'Zinc dibutyldithiocarbamate', level: '0.4', unit: 'ug/day', threshold: '1.5 ug/day', assessment: 'below AET' }],
    },
    integrityTesting: { method: 'Helium leak (USP <1207>)', acceptanceCriteria: '<= 6e-6 mbar L/s', result: '2.1e-6 mbar L/s', testDate: '2026-04-02T00:00:00.000Z' },
    status: 'draft',
  };
  const valuesOf = (config: ReturnType<typeof containerClosureForm>) =>
    Object.fromEntries(config.fields.map((f) => [f.key, f.default ?? '']));

  /* The drawer opened blank over every json column. A packaging engineer adding
     the E&L conclusion therefore sent an object containing only the conclusion,
     and the PUT replaced the whole column — the analyte results, the protocol
     and the threshold destroyed by a save that reported success. */
  it('carries the stored E&L package, materials and integrity record into the form', () => {
    const v = valuesOf(containerClosureForm(stored));
    expect(v.elStudyType).toBe('Controlled extraction');
    expect(v.elProtocol).toBe('PR-EL-014');
    expect(v.elConditions).toBe('40C/75%RH, 6 months');
    expect(v.elThreshold).toBe('1.5 ug/day');
    expect(v.elResults).toContain('Zinc dibutyldithiocarbamate | 0.4 | ug/day | 1.5 ug/day | below AET');
    expect(v.materialsOfConstruction).toContain('Vial | Type I borosilicate glass | Schott | SPEC-VIAL-01 | USP <660>');
    expect(v.materialsOfConstruction).toContain('Stopper | Bromobutyl rubber | West');
    expect(v.integrityMethod).toBe('Helium leak (USP <1207>)');
    expect(v.integrityTestDate).toBe('2026-04-02');
  });

  it('a round trip through the drawer changes nothing it was not asked to change', () => {
    const patched = containerClosurePatch(valuesOf(containerClosureForm(stored)));
    expect(patched.materialsOfConstruction).toEqual(stored.materialsOfConstruction);
    expect(patched.extractablesLeachables).toEqual(stored.extractablesLeachables);
    expect(patched.integrityTesting).toEqual(stored.integrityTesting);
    expect(patched.compendialStandards).toEqual(stored.compendialStandards);
    expect(patched.suitabilityJustification).toBe(stored.suitabilityJustification);
  });

  it('adding one E&L conclusion keeps the results that were already recorded', () => {
    const v = { ...valuesOf(containerClosureForm(stored)), elConclusion: 'All extractables below the AET.' };
    const patched = containerClosurePatch(v);
    expect(patched.extractablesLeachables?.conclusion).toBe('All extractables below the AET.');
    expect(patched.extractablesLeachables?.results).toHaveLength(1);
    expect(patched.extractablesLeachables?.protocol).toBe('PR-EL-014');
  });

  /* The mirror defect: `opt()` omits a blank, so a value entered against the
     wrong record could be overwritten but never removed. */
  it('a field the staffer clears is actually cleared', () => {
    const v = { ...valuesOf(containerClosureForm(stored)), suitabilityJustification: '', supplier: '' };
    const patched = containerClosurePatch(v);
    expect(patched.suitabilityJustification).toBeNull();
    expect(patched.supplier).toBeNull();
    // Untouched fields are still carried, not nulled with it.
    expect(patched.materialsOfConstruction).toHaveLength(2);
  });

  it('the reference standard drawer does the same for its characterisation', () => {
    const row = {
      scope: 'drug_substance', standardCode: 'RS-DS-001', standardName: 'Primary standard',
      standardType: 'primary', status: 'draft',
      characterization: [
        { attribute: 'Identity', method: 'FTIR', result: 'Conforms' },
        { attribute: 'Purity', method: 'RP-HPLC', result: '99.4% area' },
      ],
      certificateOfAnalysis: 'CoA-001',
    };
    const v = Object.fromEntries(referenceStandardForm(row).fields.map((f) => [f.key, f.default ?? '']));
    expect(v.characterization).toBe('Identity | FTIR | Conforms\nPurity | RP-HPLC | 99.4% area');
    const patched = referenceStandardPatch({ ...v, lotNumber: 'RS-LOT-2405' });
    expect(patched.characterization).toEqual(row.characterization);
    expect(patched.lotNumber).toBe('RS-LOT-2405');
    expect(patched.expiryDate).toBeNull();
  });
});

describe('neither register offers qualification as a status', () => {
  /* Qualification is a Part 11 signature (POST .../:id/qualify) that records who
     qualified the record, when and why. The API refuses a self-declared
     'qualified' on create and update, so offering it here would only produce a
     rejected save — and, worse, would look like the governed act. */
  it('the status control cannot set qualified', () => {
    for (const config of [containerClosureForm(), referenceStandardForm()]) {
      const status = config.fields.find((f) => f.key === 'status')!;
      expect(status.options).not.toContain('qualified');
    }
  });

  /* A qualified record KEEPS its status through an ordinary edit. Offering only
     the ungoverned statuses sent 'draft' on every Update, which reverted a Part
     11 signature while leaving qualified_by and qualification_date populated —
     an unsigned de-qualification the drawer performed automatically. */
  it('a qualified record round-trips its own status instead of reverting to draft', () => {
    const status = containerClosureForm({ status: 'qualified' } as never).fields.find((f) => f.key === 'status')!;
    expect(status.default).toBe('qualified');
    expect(status.options).toContain('qualified');
    // …and it still cannot be sent BACK to draft from the drawer.
    expect(status.options).not.toContain('draft');
  });

  it('the qualification form collects a reason and a re-authentication', () => {
    const keys = qualifyForm('container closure system', 'Vial system').fields.map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(['meaning', 'reason', 'password']));
    const body = qualifyBody({ reason: 'Qualification report QR-014 accepted.', meaning: 'approval', password: 'pw', totp: '' });
    expect(body).toEqual({
      reason: 'Qualification report QR-014 accepted.',
      meaning: 'approval',
      reauth: { password: 'pw', totp: undefined },
    });
  });
});

describe('parseRowLines keeps what was typed', () => {
  /* Iterating the KEYS silently dropped every cell past the last column: a note
     typed as a sixth cell simply vanished from the record and the dossier. */
  it('keeps cells beyond the declared columns rather than deleting them', () => {
    expect(parseRowLines('Ferrule | Al | West | SPEC-1 | USP <381> | re-qualified 2026 | see NC-114', MATERIAL_COLUMNS))
      .toEqual([{
        component: 'Ferrule', material: 'Al', supplier: 'West', specification: 'SPEC-1',
        compendialReference: 'USP <381> | re-qualified 2026 | see NC-114',
      }]);
  });

  it('round-trips through rowLinesOf', () => {
    const rows = [{ attribute: 'Identity', method: 'FTIR', result: 'Conforms' }];
    expect(parseRowLines(rowLinesOf(rows, CHARACTERISATION_COLUMNS), CHARACTERISATION_COLUMNS)).toEqual(rows);
  });

  it('rowLinesOf is empty for a column that holds nothing', () => {
    expect(rowLinesOf(null, MATERIAL_COLUMNS)).toBe('');
    expect(rowLinesOf([{}], MATERIAL_COLUMNS)).toBe('');
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * The edit round trip must not delete what the drawer cannot show.
 *
 * rowLinesOf/parseRowLines project a jsonb row to the columns the textarea
 * declares. PROCESS_STEP_COLUMNS has no `inProcessControls`, so per-step
 * controls — which the mapper reads, the card counts, and §3.2.S.2 renders —
 * were silently dropped on every Update. The PUT sends processSteps
 * unconditionally, so the truncated array overwrote the stored column: pressing
 * Update with no changes at all deleted every step-level control, dropped the
 * card's count to "none", and flipped §3.2.S.2's completeness key to null.
 *
 * This is the exact failure rowLinesOf's own doc comment says it was added to
 * prevent, one level deeper.
 * ────────────────────────────────────────────────────────────────────────── */
describe('manufacturingProcessPatch — the round trip preserves what it cannot render', () => {
  const storedSteps = [
    {
      stepNumber: '1',
      unitOperation: 'Blending',
      description: 'Blend for 10 minutes',
      inProcessControls: [{ test: 'Blend uniformity', acceptanceCriteria: 'RSD <= 5%' }],
      scaleDependencies: { orderOfAddition: 'API last' },
    },
    {
      stepNumber: '2',
      unitOperation: 'Compression',
      inProcessControls: [{ test: 'Hardness', acceptanceCriteria: '8-12 kp' }],
    },
  ];
  const row = {
    processName: 'Tablet manufacture',
    processType: 'drug_product',
    batchSize: '250,000 tablets',
    processSteps: storedSteps,
  };

  it('an Update that changes nothing keeps every step-level in-process control', () => {
    const form = manufacturingProcessForm(row as never);
    const values: Record<string, string> = {};
    for (const f of form.fields) values[f.key] = String((f as { default?: unknown }).default ?? '');

    const body = manufacturingProcessPatch(values, row as never) as {
      processSteps: Array<Record<string, unknown>> | null;
    };
    expect(body.processSteps).toHaveLength(2);
    expect(body.processSteps![0].inProcessControls).toEqual([
      { test: 'Blend uniformity', acceptanceCriteria: 'RSD <= 5%' },
    ]);
    expect(body.processSteps![1].inProcessControls).toEqual([
      { test: 'Hardness', acceptanceCriteria: '8-12 kp' },
    ]);
    /* Anything else the drawer cannot show survives too — the fix is the class,
       not the one key. */
    expect(body.processSteps![0].scaleDependencies).toEqual({ orderOfAddition: 'API last' });
    // …and the fields the drawer DOES show still round-trip.
    expect(body.processSteps![0].unitOperation).toBe('Blending');
    expect(body.processSteps![1].stepNumber).toBe('2');
  });

  it('an edited step keeps its own controls, and a new step simply has none', () => {
    const values: Record<string, string> = {
      processName: 'Tablet manufacture',
      processType: 'drug_product',
      validationStatus: 'not-started',
      processSteps: '1 | Blending | Blend for 12 minutes\n2 | Compression\n3 | Coating',
    };
    const body = manufacturingProcessPatch(values, row as never) as {
      processSteps: Array<Record<string, unknown>>;
    };
    expect(body.processSteps).toHaveLength(3);
    expect(body.processSteps[0].description).toBe('Blend for 12 minutes');
    expect(body.processSteps[0].inProcessControls).toEqual([
      { test: 'Blend uniformity', acceptanceCriteria: 'RSD <= 5%' },
    ]);
    expect(body.processSteps[2].unitOperation).toBe('Coating');
    expect(body.processSteps[2].inProcessControls).toBeUndefined();
  });

  it('a deleted step takes its own controls with it', () => {
    const values: Record<string, string> = {
      processName: 'Tablet manufacture',
      processType: 'drug_product',
      validationStatus: 'not-started',
      processSteps: '1 | Blending',
    };
    const body = manufacturingProcessPatch(values, row as never) as {
      processSteps: Array<Record<string, unknown>>;
    };
    expect(body.processSteps).toHaveLength(1);
    expect(body.processSteps[0].inProcessControls).toEqual([
      { test: 'Blend uniformity', acceptanceCriteria: 'RSD <= 5%' },
    ]);
  });
});
