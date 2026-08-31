/**
 * The write-through mappers map the ROWS the product actually stores — all of
 * them, not just stability.
 *
 * ── The defect class these pin against ───────────────────────────────────────
 * The coverage evaluation (docs/audits/CMC_CAPTURE_ANALYSIS_M3_EVALUATION_
 * 2026-08-31.md) found seven mappers reading row keys their tables never had —
 * the same class as the stability mapper defect fixed earlier. A staffer typed
 * the manufacturer, the synthetic route, the CPPs, the ICH Q2 record, the
 * change's filing category — the save succeeded — and the canonical payload
 * stored '' or null, so the compiled Module 3 said "not specified". Each test
 * here feeds a mapper the EXACT shape its route hands over (the Drizzle
 * .returning() row with its nested json columns, or the raw snake_case row the
 * SQL routes build) and asserts the captured data — and the composer's own
 * required fields where this source type is their producer — survive.
 */
import { describe, expect, it } from 'vitest';

import {
  mapAnalyticalMethodPayload,
  mapBatchRecordPayload,
  mapChangeControlPayload,
  mapDrugProductPayload,
  mapDrugSubstancePayload,
  mapProcessValidationPayload,
  mapSpecificationPayload,
} from '../cmc-write-through';
import { MODULE3_SECTION_RULES, composeModule3FromCanonicalSources } from '../module3Composer';

/** A canonical source as the composer receives it. */
const src = (sourceType: string, sourcePayload: Record<string, unknown>) =>
  ({ id: 'x', sourceType, sourcePayload, sourceHash: 'h' }) as never;

const required = (sectionKey: string) =>
  MODULE3_SECTION_RULES.find((r) => r.sectionKey === sectionKey)?.requiredFields ?? [];

describe('mapDrugSubstancePayload — the §3.2.S register row (Drizzle camelCase, nested manufacturing_process json)', () => {
  const row = {
    id: 3,
    organizationId: 42,
    substanceName: 'BX-204',
    inn: 'examplinib',
    casNumber: '123456-78-9',
    molecularFormula: 'C21H27N5O2',
    molecularWeight: '381.47',
    structuralFormula: 'CC1=CC(=O)...',
    // Exactly how drugSubstanceBody nests it (cmcRegisterForms.ts).
    manufacturingProcess: {
      manufacturer: 'Lonza AG',
      route: 'Four-step convergent synthesis from intermediate INT-2; final recrystallisation from ethanol/water.',
      site: 'Visp, Switzerland',
    },
    specifications: null,
    impuritiesProfile: { specified: ['IMP-A ≤ 0.15%'] },
    stability: null,
    controlOfMaterials: null,
    status: 'qualified',
    developmentPhase: 'phase2',
  };
  const p = mapDrugSubstancePayload(row);

  it("3.2.S.1's required fields come from the row: name and MANUFACTURER", () => {
    expect(required('3.2.S.1')).toEqual(['name', 'manufacturer']);
    expect(p.name).toBe('BX-204');
    expect(p.manufacturer).toBe('Lonza AG');
  });

  it("3.2.S.2's manufacturingRoute and processDescription come from the nested route", () => {
    expect(required('3.2.S.2')).toContain('manufacturingRoute');
    expect(p.manufacturingRoute).toMatch(/Four-step convergent synthesis/);
    expect(p.processDescription).toMatch(/Four-step convergent synthesis/);
    expect(p.manufacturingSite).toBe('Visp, Switzerland');
  });

  it('identity and structured evidence survive; characterization is NOT invented from a structure string', () => {
    expect(p.cas).toBe('123456-78-9');
    expect(p.structure).toBe('CC1=CC(=O)...');
    expect(p.impurities).toEqual({ specified: ['IMP-A ≤ 0.15%'] });
    // A SMILES string is not structural elucidation — honest null.
    expect(p.structuralElucidation).toBeNull();
  });
});

describe('mapDrugProductPayload — the §3.2.P register row (nested packaging/process json)', () => {
  const row = {
    productName: 'BX-204 injection',
    dosageForm: 'Solution for injection',
    strength: '50 mg/mL',
    routeOfAdministration: 'Intravenous',
    composition: { description: 'BX-204 50 mg/mL; histidine buffer; polysorbate 80; WFI qs.' },
    manufacturingProcess: { description: 'Compounding → sterile filtration → aseptic fill.', site: 'Basel' },
    batchFormula: { perBatch: '2000 L: BX-204 100 kg…' },
    processControls: { bioburden: 'pre-filtration ≤ 10 CFU/100 mL' },
    packagingMaterials: { containerClosure: '2R Type I glass vial, bromobutyl stopper' },
    status: 'development',
  };
  const p = mapDrugProductPayload(row);

  it("3.2.P.1's required fields survive — composition as TEXT, because every consumer reads it with val()", () => {
    expect(required('3.2.P.1')).toEqual(['dosageFormDescription', 'composition', 'strength']);
    expect(p.dosageFormDescription).toBe('Solution for injection');
    expect(p.strength).toBe('50 mg/mL');
    // An object here rendered "[object Object]" into 3.2.P.1/3.2.R.1 and hid
    // ingredient names from 3.2.A.3's animal-origin scan.
    expect(p.composition).toBe('BX-204 50 mg/mL; histidine buffer; polysorbate 80; WFI qs.');
    expect(p.compositionDetail).toEqual(row.composition);
  });

  it("the TSE/BSE scan can SEE the ingredients: a gelatin composition surfaces as scannable text", () => {
    const gel = mapDrugProductPayload({
      ...row,
      composition: { description: 'Gelatin capsule shell; lactose monohydrate; magnesium stearate' },
    });
    expect(String(gel.composition)).toMatch(/gelatin/i);
  });

  it('an EMPTY composition {} maps to null — it must never satisfy a required field', () => {
    const blank = mapDrugProductPayload({ ...row, composition: {} });
    expect(blank.composition).toBeNull();
    expect(blank.compositionDetail).toBeNull();
  });

  it('the container closure, process description and site come out of their nests', () => {
    expect(p.containerClosure).toBe('2R Type I glass vial, bromobutyl stopper');
    expect(p.processDescription).toBe('Compounding → sterile filtration → aseptic fill.');
    expect(p.manufacturingSite).toBe('Basel');
    expect(p.processControls).toEqual(row.processControls);
  });

  it("3.2.P.3's formulation is the BATCH formula as TEXT — never the per-unit composition, never an object", () => {
    // 3.2.P.3 renders formulation with val(); an object printed
    // "[object Object]" into the governed Batch Formula table.
    expect(p.formulation).toBe('perBatch: 2000 L: BX-204 100 kg…');
    expect(p.batchFormulaDetail).toEqual(row.batchFormula);
    const noBatchFormula = mapDrugProductPayload({ ...row, batchFormula: undefined });
    expect(noBatchFormula.formulation).toBeNull();
  });
});

describe('mapAnalyticalMethodPayload — the register row (title/technique/status identity)', () => {
  const row = {
    methodCode: 'AM-011',
    title: 'RP-HPLC assay and related substances',
    purpose: 'Assay',
    analyte: 'BX-204',
    matrix: 'Drug product',
    technique: 'HPLC',
    status: 'validated',
    ichQ2Parameters: { characteristics: ['specificity', 'linearity', 'accuracy'], summary: 'Q2(R2) full validation' },
    systemSuitability: { rsd: '≤ 2.0%' },
    acceptance_criteria: { assay: '95.0–105.0%' },
    robustness_data: null,
    validationDate: new Date('2026-05-01T00:00:00Z'),
  };
  const p = mapAnalyticalMethodPayload(row);

  it("3.2.P.5's methodName and 3.2.S.4's validationStatus come from the row's real identity", () => {
    expect(required('3.2.P.5')).toContain('methodName');
    expect(required('3.2.S.4')).toContain('validationStatus');
    expect(p.methodName).toBe('RP-HPLC assay and related substances');
    expect(p.validationStatus).toBe('validated');
  });

  it('the ICH Q2 record travels whole', () => {
    expect(p.ichQ2Parameters).toEqual(row.ichQ2Parameters);
    expect(p.validationDate).toEqual(row.validationDate);
    expect(p.technique).toBe('HPLC');
    expect(p.methodCode).toBe('AM-011');
    expect(p.acceptanceCriteria).toEqual({ assay: '95.0–105.0%' });
  });
});

describe('mapSpecificationPayload — the raw snake_case quality_specifications row', () => {
  const row = {
    id: 'a-uuid',
    material_type: 'drug_product',
    material_name: 'BX-204 injection',
    test_parameters: [{ test: 'Assay' }],
    acceptance_criteria: { assay: '95.0–105.0% of label claim' },
    test_methods: [{ method: 'AM-011' }],
    justification: 'Limits per ICH Q6A decision tree #1.',
    regulatory_basis: { pharmacopoeia: 'Ph. Eur.' },
    approval_status: 'approved',
  };
  const p = mapSpecificationPayload(row);

  it("3.2.S.4's acceptanceCriteria AND 3.2.P.5's releaseCriteria are both fed by the recorded limits", () => {
    expect(required('3.2.S.4')).toContain('acceptanceCriteria');
    expect(required('3.2.P.5')).toContain('releaseCriteria');
    expect(p.acceptanceCriteria).toEqual(row.acceptance_criteria);
    // Text, because the P.5 narrative reads it with val() — an object would
    // render "[object Object]". The projection is the record's own values.
    expect(p.releaseCriteria).toBe('assay: 95.0–105.0% of label claim');
  });

  it('has no fabricated validation status — that field is the method register’s to produce', () => {
    expect(p.validationStatus).toBe('');
  });

  it('the register’s real {release, shelf} shape splits into DISTINCT claims — shelf never folds under the release label', () => {
    const split = mapSpecificationPayload({
      ...row,
      acceptance_criteria: { release: '98.0–102.0%', shelf: '95.0–105.0%' },
    });
    expect(split.releaseCriteria).toBe('98.0–102.0%');
    expect(split.shelfLifeCriteria).toBe('95.0–105.0%');
  });

  it('blank limits fabricate NOTHING: {release:"", shelf:""} maps releaseCriteria to null', () => {
    const blank = mapSpecificationPayload({
      ...row,
      acceptance_criteria: { release: '', shelf: '' },
    });
    expect(blank.releaseCriteria).toBeNull();
    expect(blank.shelfLifeCriteria).toBeNull();
  });

  it("a NON-drug-product spec never produces releaseCriteria — a substance's limits must not bleed into 3.2.P.5", () => {
    const ds = mapSpecificationPayload({
      ...row,
      material_type: 'drug_substance',
      acceptance_criteria: { release: '98.0–102.0%', shelf: '' },
    });
    expect(ds.releaseCriteria).toBeNull();
    // The limits still travel as this spec's own acceptance criteria.
    expect(ds.acceptanceCriteria).toEqual({ release: '98.0–102.0%', shelf: '' });
  });
});

describe('mapBatchRecordPayload — the raw snake_case cmc_batch_records row (with parity + release columns)', () => {
  const row = {
    batch_number: 'L2026-014',
    product_name: 'BX-204 injection',
    batch_type: 'ppq',
    material_type: 'drug_product',
    scale: 'commercial',
    site: 'Basel',
    manufacturing_date: '2026-03-10',
    batch_size: '2000',
    batch_size_unit: 'L',
    process_version: 'v3',
    status: 'released',
    disposition: 'released',
    release_status: 'released',
    released_by: 'qp.olsen@example.test',
    released_at: '2026-04-01T09:00:00Z',
    specification_compliance: { assay: 'pass' },
    oos_events: null,
    deviations: null,
  };
  const p = mapBatchRecordPayload(row);

  it("3.2.P.3's batchNumber survives, and the governed release decision travels", () => {
    expect(required('3.2.P.3')).toContain('batchNumber');
    expect(p.batchNumber).toBe('L2026-014');
    expect(p.disposition).toBe('released');
    expect(p.releaseStatus).toBe('released');
    expect(p.releasedBy).toBe('qp.olsen@example.test');
    expect(p.manufacturingSite).toBe('Basel');
    expect(p.scale).toBe('commercial');
  });

  it('formulation is never invented — this table has no such column', () => {
    expect(p.formulation).toBeNull();
  });
});

describe('mapChangeControlPayload — the register row (nested risk_assessment, filing category)', () => {
  const row = {
    changeNumber: 'CC-2026-041',
    changeType: 'process',
    description: 'Increase fill volume from 5.2 to 5.4 mL.',
    justification: 'Extractable-volume complaints; no quality impact.',
    impactAssessment: { summary: 'Fill validation addendum', impactedSections: ['3.2.P.3'] },
    riskAssessment: { level: 'medium' },
    regulatoryFiling: 'CBE-30',
    status: 'approved',
    implementationDate: new Date('2026-09-01T00:00:00Z'),
  };
  const p = mapChangeControlPayload(row);

  it('the change identity, assessed risk and ICH Q12 filing category all survive', () => {
    expect(p.changeNumber).toBe('CC-2026-041');
    expect(p.changeTitle).toBe('CC-2026-041');
    expect(p.riskLevel).toBe('medium');
    expect(p.regulatoryFiling).toBe('CBE-30');
    expect(p.implementationDate).toEqual(row.implementationDate);
    expect(p.changeDescription).toMatch(/fill volume/);
  });
});

describe('mapProcessValidationPayload — the register row (CPPs/CQAs/control strategy json)', () => {
  const row = {
    processName: 'Drug product fill-finish, 2000 L scale',
    stage: 'qualification',
    batchNumbers: ['PPQ-01', 'PPQ-02', 'PPQ-03'],
    criticalProcessParameters: { parameters: ['Fill speed', 'Bulk hold time'] },
    criticalQualityAttributes: { attributes: ['Assay', 'Sub-visible particulates'] },
    controlStrategy: { summary: 'Each CPP held within PAR; CQAs verified at release and on stability.' },
    validationProtocol: 'PV-PROT-011',
    validationReport: null,
    status: 'in-progress',
    approvalDate: null,
  };
  const p = mapProcessValidationPayload(row);

  it("3.2.S.2's processControls is the recorded control strategy's own sentence — text, for the narrative's val() read", () => {
    expect(required('3.2.S.2')).toContain('processControls');
    expect(p.processControls).toBe('Each CPP held within PAR; CQAs verified at release and on stability.');
    // The structured object still travels on its own key.
    expect(p.controlStrategy).toEqual(row.controlStrategy);
  });

  it('the validation record travels whole — CPPs, CQAs, batches, protocol', () => {
    expect(p.criticalProcessParameters).toEqual(row.criticalProcessParameters);
    expect(p.criticalQualityAttributes).toEqual(row.criticalQualityAttributes);
    expect(p.batchNumbers).toEqual(['PPQ-01', 'PPQ-02', 'PPQ-03']);
    expect(p.validationProtocol).toBe('PV-PROT-011');
    expect(p.stage).toBe('qualification');
  });

  it("emits the KEYS the composer's PV slots actually read — protocol, validationStatus, consecutiveBatches", () => {
    // The 3.2.S.2/3.2.P.3 process-validation summary reads val('protocol'),
    // val('validationStatus'), val('consecutiveBatches'); nothing produced
    // them, so the PV summary table could never render from the register.
    expect(p.protocol).toBe('PV-PROT-011');
    expect(p.validationStatus).toBe('in-progress');
    expect(p.consecutiveBatches).toBe('PPQ-01, PPQ-02, PPQ-03');
  });

  it('a control strategy is NOT rendered as a process description', () => {
    expect(p.processDescription).toBe('');
  });
});

describe('register row → payload → composed section: the whole chain, no "[object Object]", no false claims', () => {
  it('a gelatin composition reaches 3.2.P.1 readably and 3.2.A.3 can never call it animal-free', () => {
    const payload = mapDrugProductPayload({
      productName: 'BX-cap',
      dosageForm: 'Capsule',
      strength: '25 mg',
      composition: { description: 'Gelatin capsule shell; lactose monohydrate; magnesium stearate' },
      manufacturingProcess: {},
      packagingMaterials: {},
      status: 'development',
    });
    const sections = composeModule3FromCanonicalSources([src('drug_product', payload)]);
    const p1 = sections.find((s) => s.sectionKey === '3.2.P.1')!;
    expect(p1.narrativeDraft).toMatch(/Gelatin capsule shell/);
    expect(p1.narrativeDraft).not.toMatch(/object Object/);
    expect(p1.missingInputs).toEqual([]);
  });

  it('an EMPTY composition {} leaves 3.2.P.1 honestly incomplete', () => {
    const payload = mapDrugProductPayload({
      productName: 'BX-cap',
      dosageForm: 'Capsule',
      strength: '25 mg',
      composition: {},
      manufacturingProcess: {},
      packagingMaterials: {},
      status: 'development',
    });
    const p1 = composeModule3FromCanonicalSources([src('drug_product', payload)])
      .find((s) => s.sectionKey === '3.2.P.1')!;
    expect(p1.missingInputs).toContain('composition');
  });

  it('two methods in different lifecycle states are reported BY NAME in 3.2.S.4 — one status is never stamped on every row', () => {
    const spec = mapSpecificationPayload({
      material_type: 'drug_substance',
      material_name: 'BX-204',
      acceptance_criteria: { assay: '95.0–105.0%', impurities: '≤ 0.5%' },
      approval_status: 'approved',
    });
    const validated = mapAnalyticalMethodPayload({
      methodCode: 'AM-011', title: 'RP-HPLC assay', purpose: 'Assay', analyte: 'BX-204',
      matrix: 'DS', technique: 'HPLC', status: 'validated', ichQ2Parameters: null,
    });
    const inDev = mapAnalyticalMethodPayload({
      methodCode: 'AM-012', title: 'Related substances', purpose: 'Purity', analyte: 'BX-204',
      matrix: 'DS', technique: 'HPLC', status: 'development', ichQ2Parameters: null,
    });
    const s4 = composeModule3FromCanonicalSources([
      src('specification', spec), src('method', validated), src('method', inDev),
    ]).find((s) => s.sectionKey === '3.2.S.4')!;
    // The narrative names each status with its method…
    expect(s4.narrativeDraft).toMatch(/validated \(RP-HPLC assay\)/);
    expect(s4.narrativeDraft).toMatch(/development \(Related substances\)/);
    // …and never asserts one blanket state.
    expect(s4.narrativeDraft).not.toMatch(/Analytical methods are validated\./);
    // The criteria rows point at the methods table instead of stamping one method.
    const criteriaTable = s4.tables.find((t) => t.title.includes('Acceptance Criteria'))!;
    for (const row of criteriaTable.rows) {
      expect(row[1]).toBe('See Analytical Methods table');
    }
    // The methods table lists both, with their own statuses.
    const methodsTable = s4.tables.find((t) => t.title === 'Analytical Methods')!;
    expect(methodsTable.rows).toHaveLength(2);
  });

  it("a drug-substance spec's limits never render as the drug product's 3.2.P.5 release criteria", () => {
    const dsSpec = mapSpecificationPayload({
      material_type: 'drug_substance',
      material_name: 'BX-204',
      acceptance_criteria: { release: '98.0–102.0%', shelf: '' },
      approval_status: 'approved',
    });
    const p5 = composeModule3FromCanonicalSources([src('specification', dsSpec)])
      .find((s) => s.sectionKey === '3.2.P.5')!;
    expect(p5.missingInputs).toContain('releaseCriteria');
    expect(p5.narrativeDraft).not.toMatch(/98\.0–102\.0%/);
  });

  it('the PV register renders a real Process Validation Summary in 3.2.S.2', () => {
    const pv = mapProcessValidationPayload({
      processName: 'DS final step', stage: 'qualification',
      batchNumbers: ['PPQ-01', 'PPQ-02', 'PPQ-03'],
      criticalProcessParameters: { parameters: ['Temp'] },
      criticalQualityAttributes: { attributes: ['Assay'] },
      controlStrategy: { summary: 'CPPs held within PAR.' },
      validationProtocol: 'PV-PROT-011', status: 'approved',
    });
    const s2 = composeModule3FromCanonicalSources([src('process_validation', pv)])
      .find((s) => s.sectionKey === '3.2.S.2')!;
    const pvTable = s2.tables.find((t) => t.title === 'Process Validation Summary');
    expect(pvTable).toBeTruthy();
    expect(pvTable!.rows).toEqual(expect.arrayContaining([
      ['Validation Protocol', 'PV-PROT-011'],
      ['Validation Status', 'approved'],
      ['Consecutive Batches', 'PPQ-01, PPQ-02, PPQ-03'],
    ]));
    expect(s2.narrativeDraft).not.toMatch(/object Object/);
  });

  it('the recorded route renders ONCE in 3.2.S.2 — never duplicated as its own process description', () => {
    const ds = mapDrugSubstancePayload({
      substanceName: 'BX-204',
      manufacturingProcess: { manufacturer: 'Lonza', route: 'Four-step convergent synthesis.', site: 'Visp' },
      status: 'qualified',
    });
    const s2 = composeModule3FromCanonicalSources([src('drug_substance', ds)])
      .find((s) => s.sectionKey === '3.2.S.2')!;
    const occurrences = s2.narrativeDraft.split('Four-step convergent synthesis').length - 1;
    expect(occurrences).toBe(1);
  });
});
