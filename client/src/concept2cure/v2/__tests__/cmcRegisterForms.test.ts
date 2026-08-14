import { describe, it, expect } from 'vitest';
import {
  csvToArray,
  isoDate,
  asUserId,
  methodForm,
  methodBody,
  qcTestForm,
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
