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
  mapComparabilityPayload,
  mapDrugProductPayload,
  mapDrugSubstancePayload,
  mapProcessValidationPayload,
  mapQcTestingPayload,
  mapSpecificationPayload,
  mapContainerClosurePayload,
  mapReferenceStandardPayload,
  mapImpurityProfilePayload,
  mapDissolutionProfilePayload,
  mapMaterialSpecPayload,
  mapFormulationRecordPayload,
  mapManufacturingProcessPayload,
  mapCharacterizationStudyPayload,
} from '../cmc-write-through';
import { MODULE3_SECTION_RULES, composeModule3FromCanonicalSources, tablesToMarkdown } from '../module3Composer';

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
    /* §3.2.P.1 also requires ONE formulation record carrying its own
       composition: the quantitative composition table is the section's
       substance, and it read a first-match components array. */
    expect(required('3.2.P.1')).toEqual([
      'dosageFormDescription',
      'composition',
      'strength',
      'formulationCompositionComplete',
    ]);
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
    /* The composition text alone no longer completes the section: §3.2.P.1's
       substance is the quantitative composition, which comes from the
       formulation register. */
    expect(p1.missingInputs).toEqual(['formulationCompositionComplete']);
    expect(p1.narrativeDraft).toContain('No formulation record is on file');
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

/* ═══════════════════════════════════════════════════════════════════════════
   Item 2 of the coverage evaluation: data the product CAPTURED and then never
   showed. QC results gated §3.2.S.4/§3.2.P.5 completeness while the batch-
   analyses tables those sections exist for were absent; the change history and
   the comparability rationale lived only as register rows.
   ═══════════════════════════════════════════════════════════════════════════ */

const qcRow = (over: Record<string, unknown> = {}) =>
  mapQcTestingPayload({
    sampleId: 'S-2407-118',
    sampleType: 'finished-product',
    testMethod: 'AM-011 RP-HPLC assay',
    testResults: { value: '99.2', unit: '%', observation: '' },
    specifications: { acceptanceCriteria: '95.0–105.0%' },
    passFailStatus: 'pass',
    certificateOfAnalysis: 'CoA-2407-118',
    reviewedBy: 7,
    releaseDate: '2026-04-02T00:00:00Z',
    ...over,
  });

describe('§3.2.P.5.4 / §3.2.S.4.4 — the recorded QC results are RENDERED, not just counted', () => {
  it('a finished-product result appears in the drug product batch-analyses table with its real values', () => {
    const p5 = composeModule3FromCanonicalSources([src('qc_result', qcRow())])
      .find((s) => s.sectionKey === '3.2.P.5')!;
    const table = p5.tables.find((t) => t.title.includes('Batch Analyses — Drug Product'));
    expect(table).toBeTruthy();
    expect(table!.rows[0]).toEqual([
      'S-2407-118', 'finished-product', 'AM-011 RP-HPLC assay', '95.0–105.0%', '99.2 %', 'pass', 'reviewed',
    ]);
    /* The disposition is COMPUTED from the result against its criterion, not
       read off passFailStatus — a declared "pass" over a failing number used to
       compose as "1 conforming, 0 out of specification". Here the record and
       the numbers agree. */
    expect(p5.narrativeDraft).toMatch(/1 recorded QC result\(s\).*1 within criterion, 0 out of specification/s);
  });

  it('an out-of-specification result is reported as recorded — never smoothed into a pass', () => {
    const oos = qcRow({
      passFailStatus: 'fail',
      testResults: { value: '92.1', unit: '%', observation: 'Below lower limit; investigation raised.' },
      reviewedBy: null,
    });
    const p5 = composeModule3FromCanonicalSources([src('qc_result', oos)])
      .find((s) => s.sectionKey === '3.2.P.5')!;
    const table = p5.tables.find((t) => t.title.includes('Batch Analyses — Drug Product'))!;
    expect(table.rows[0][4]).toBe('92.1 % — Below lower limit; investigation raised.');
    expect(table.rows[0][5]).toBe('fail');
    // The §11 second-person review state is visible: unreviewed is not releasable evidence.
    expect(table.rows[0][6]).toBe('not reviewed');
    expect(p5.narrativeDraft).toMatch(/1 out of specification/);
    expect(p5.narrativeDraft).toMatch(/investigation and disposition are not asserted/);
    expect(p5.narrativeDraft).toMatch(/1 result\(s\) have not completed second-person review/);
  });

  it('a finished-product result never files itself as DRUG SUBSTANCE batch analyses, and vice versa', () => {
    const sections = composeModule3FromCanonicalSources([
      src('qc_result', qcRow()),
      src('qc_result', qcRow({ sampleId: 'S-RAW-01', sampleType: 'raw-material' })),
    ]);
    const s4 = sections.find((s) => s.sectionKey === '3.2.S.4')!;
    const p5 = sections.find((s) => s.sectionKey === '3.2.P.5')!;
    const s4Table = s4.tables.find((t) => t.title.includes('Batch Analyses — Drug Substance'))!;
    const p5Table = p5.tables.find((t) => t.title.includes('Batch Analyses — Drug Product'))!;
    expect(s4Table.rows.map((r) => r[0])).toEqual(['S-RAW-01']);
    expect(p5Table.rows.map((r) => r[0])).toEqual(['S-2407-118']);
  });

  it('a cleaning-verification swab is not a batch analysis — not counted AND not rendered, on EITHER side', () => {
    // The first version of this pin asserted on §3.2.P.5 — the one section a
    // non-finished-product swab never reaches — so a real leak into the
    // §3.2.S.4.4 table passed it. Assert the section the row would actually
    // land in.
    const swab = qcRow({ sampleId: 'CV-09', sampleType: 'cleaning-verification' });
    expect(swab.batchAnalyses).toBeNull();
    expect(swab.isBatchAnalysis).toBe(false);
    const sections = composeModule3FromCanonicalSources([src('qc_result', swab)]);
    const s4 = sections.find((s) => s.sectionKey === '3.2.S.4')!;
    const p5 = sections.find((s) => s.sectionKey === '3.2.P.5')!;
    expect(s4.missingInputs).toContain('drugSubstanceBatchAnalyses');
    expect(p5.missingInputs).toContain('drugProductBatchAnalyses');
    // And it is NOT rendered as batch-analyses evidence anywhere.
    expect(s4.tables.find((t) => t.title.includes('Batch Analyses'))).toBeUndefined();
    expect(p5.tables.find((t) => t.title.includes('Batch Analyses'))).toBeUndefined();
    expect(s4.narrativeDraft).not.toMatch(/recorded QC result/);
  });

  it('a reference-standard qualification is not batch data either — it belongs to §3.2.S.5', () => {
    const refstd = qcRow({ sampleId: 'RS-QUAL-3', sampleType: 'reference-standard' });
    expect(refstd.isBatchAnalysis).toBe(false);
    const s4 = composeModule3FromCanonicalSources([src('qc_result', refstd)])
      .find((s) => s.sectionKey === '3.2.S.4')!;
    expect(s4.tables.find((t) => t.title.includes('Batch Analyses'))).toBeUndefined();
    expect(s4.missingInputs).toContain('drugSubstanceBatchAnalyses');
  });

  it('completeness and the rendered table agree: a finished-product result greens ONLY the drug product section', () => {
    // Unscoped completeness let one result satisfy BOTH sections while
    // rendering into one — the falsely-green dashboard, moved rather than
    // closed. 'finished-product' is the register form's default.
    const sections = composeModule3FromCanonicalSources([src('qc_result', qcRow())]);
    const s4 = sections.find((s) => s.sectionKey === '3.2.S.4')!;
    const p5 = sections.find((s) => s.sectionKey === '3.2.P.5')!;
    expect(p5.missingInputs).not.toContain('drugProductBatchAnalyses');
    expect(p5.tables.some((t) => t.title.includes('Batch Analyses'))).toBe(true);
    // The drug substance section stays honestly incomplete AND empty.
    expect(s4.missingInputs).toContain('drugSubstanceBatchAnalyses');
    expect(s4.tables.find((t) => t.title.includes('Batch Analyses'))).toBeUndefined();
  });

  it('a raw-material result greens ONLY the drug substance section — the mirror case', () => {
    const sections = composeModule3FromCanonicalSources([
      src('qc_result', qcRow({ sampleId: 'S-RAW-01', sampleType: 'raw-material' })),
    ]);
    const s4 = sections.find((s) => s.sectionKey === '3.2.S.4')!;
    const p5 = sections.find((s) => s.sectionKey === '3.2.P.5')!;
    expect(s4.missingInputs).not.toContain('drugSubstanceBatchAnalyses');
    expect(p5.missingInputs).toContain('drugProductBatchAnalyses');
    expect(p5.tables.find((t) => t.title.includes('Batch Analyses'))).toBeUndefined();
  });

  it('a result with no MEASUREMENT never counts — empty object, empty array, blanks, observation-only', () => {
    for (const testResults of [{}, [], { value: '', unit: '' }, { observation: 'Sample cloudy.' }]) {
      const p = qcRow({ testResults });
      expect(p.batchAnalyses, JSON.stringify(testResults)).toBeNull();
      const p5 = composeModule3FromCanonicalSources([src('qc_result', p)])
        .find((s) => s.sectionKey === '3.2.P.5')!;
      expect(p5.missingInputs, JSON.stringify(testResults)).toContain('drugProductBatchAnalyses');
    }
    // A real measurement still counts.
    expect(qcRow({ testResults: { value: '99.2', unit: '%' } }).batchAnalyses).toBeTruthy();
  });

  it('no QC results means no table and no sentence — never an empty table implying testing happened', () => {
    const p5 = composeModule3FromCanonicalSources([src('specification', mapSpecificationPayload({
      material_type: 'drug_product', material_name: 'BX-204 injection',
      acceptance_criteria: { release: '95.0–105.0%', shelf: '' }, approval_status: 'approved',
    }))]).find((s) => s.sectionKey === '3.2.P.5')!;
    expect(p5.tables.find((t) => t.title.includes('Batch Analyses'))).toBeUndefined();
    expect(p5.narrativeDraft).not.toMatch(/recorded QC result/);
  });
});

describe('§3.2.P.3 — the change history and the governed release decision reach the document', () => {
  const change = mapChangeControlPayload({
    changeNumber: 'CC-2026-041', changeType: 'process',
    description: 'Increase fill volume from 5.2 to 5.4 mL.',
    justification: 'Extractable volume; no quality impact.',
    riskAssessment: { level: 'medium' }, regulatoryFiling: 'CBE-30',
    status: 'approved', implementationDate: '2026-09-01T00:00:00Z',
  });
  const batch = mapBatchRecordPayload({
    batch_number: 'L2026-014', product_name: 'BX-204 injection', site: 'Basel',
    status: 'released', disposition: 'released', release_status: 'released',
    released_by: 'qp.olsen@example.test', released_at: '2026-04-01T09:00:00Z',
  });

  it('the ICH Q12 change history renders with its filing category — never inferred, only as recorded', () => {
    const p3 = composeModule3FromCanonicalSources([src('change_control', change), src('batch', batch)])
      .find((s) => s.sectionKey === '3.2.P.3')!;
    const table = p3.tables.find((t) => t.title.includes('Change History'))!;
    expect(table.rows[0]).toEqual([
      'CC-2026-041', 'process', 'Increase fill volume from 5.2 to 5.4 mL.', 'medium', 'CBE-30', 'approved', '2026-09-01',
    ]);
    // Reports what the register RECORDED (the impact assessment's own
    // sections) instead of asserting every change is "against this process".
    expect(p3.narrativeDraft).toMatch(/1 controlled change\(s\) are recorded in the change register/);
  });

  it('an unclassified change says so rather than guessing a filing category', () => {
    const unclassified = mapChangeControlPayload({
      changeNumber: 'CC-2026-042', changeType: 'analytical',
      description: 'Column supplier change.', justification: 'Equivalent chemistry.',
      riskAssessment: { level: 'low' }, status: 'draft',
    });
    const p3 = composeModule3FromCanonicalSources([src('change_control', unclassified)])
      .find((s) => s.sectionKey === '3.2.P.3')!;
    const table = p3.tables.find((t) => t.title.includes('Change History'))!;
    expect(table.rows[0][4]).toBe('not classified');
  });

  it('the QP release decision — which batch, who released it, when — is stated', () => {
    const p3 = composeModule3FromCanonicalSources([src('batch', batch)])
      .find((s) => s.sectionKey === '3.2.P.3')!;
    expect(p3.narrativeDraft).toMatch(
      /Batch L2026-014 disposition: released, released by qp\.olsen@example\.test on 2026-04-01/,
    );
  });

  it('the release facts travel TOGETHER — one batch\'s releaser is never attached to another batch', () => {
    // val() scans each key independently across sources, so with two batch
    // records the disposition, the releaser and the date could each come from
    // a different batch — a §11 attribution the register never made.
    const otherBatch = mapBatchRecordPayload({
      batch_number: 'L2026-099', product_name: 'BX-204 injection', status: 'in-progress',
    });
    const p3 = composeModule3FromCanonicalSources([
      src('batch', otherBatch), src('batch', batch),
    ]).find((s) => s.sectionKey === '3.2.P.3')!;
    // The released batch is named with ITS OWN releaser — never L2026-099.
    expect(p3.narrativeDraft).toMatch(/Batch L2026-014 disposition: released, released by qp\.olsen@example\.test/);
    expect(p3.narrativeDraft).not.toMatch(/L2026-099 disposition: released/);
  });

  it('free text with newlines and pipes cannot shatter the governed markdown table', () => {
    const messy = mapChangeControlPayload({
      changeNumber: 'CC-2026-050', changeType: 'process',
      description: 'Line one\nline two | with a pipe',
      justification: 'ok', riskAssessment: { level: 'low' }, status: 'draft',
    });
    const p3 = composeModule3FromCanonicalSources([src('change_control', messy)])
      .find((s) => s.sectionKey === '3.2.P.3')!;
    const md = tablesToMarkdown(p3.tables);
    const changeRow = md.split('\n').find((l) => l.includes('CC-2026-050'))!;
    // The text is PRESERVED, on one line, with the pipe escaped — a row that
    // splits or grows a column corrupts the filed artifact.
    expect(changeRow).toContain('Line one line two \\| with a pipe');
    expect(changeRow.split(/(?<!\\)\|/).length - 1).toBe(8); // 7 columns → 8 delimiters
  });
});

describe('§3.2.P.8 — the comparability rationale, not just its one-word status', () => {
  it('the assessment, what changed, its outcome and reviewer all render', () => {
    const comp = mapComparabilityPayload({
      title: 'Post-scale-up comparability', product: 'BX-204 DS',
      type: 'process', status: 'comparable',
      methods: ['SE-HPLC', 'icIEF'],
      outcome: 'Post-change lots within pre-change ranges for all CQAs.',
      owner: 'a.reviewer@example.test',
    });
    const p8 = composeModule3FromCanonicalSources([src('comparability', comp)])
      .find((s) => s.sectionKey === '3.2.P.8')!;
    const table = p8.tables.find((t) => t.title.includes('Comparability Assessments'))!;
    expect(table.rows[0][0]).toBe('Post-scale-up comparability');
    expect(table.rows[0][1]).toBe('BX-204 DS');
    expect(table.rows[0][4]).toMatch(/within pre-change ranges/);
    expect(table.rows[0][5]).toBe('a.reviewer@example.test');
    expect(p8.narrativeDraft).toMatch(/1 comparability assessment\(s\) are summarized above/);
    // Without a stability source, no shelf life is claimed.
    expect(p8.narrativeDraft).toMatch(/No drug product stability study is present/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   §3.2.S.5 / §3.2.S.6 / §3.2.P.6 / §3.2.P.7 — the two registers that did not
   exist.

   The composer has demanded a `container_closure` and a `reference_standard`
   source since Module 3 was modelled and no table anywhere held one, so those
   four sections could never leave zero completeness no matter what a CMC
   staffer recorded. These pin the new capture path end to end: the register row
   the route hands over, the payload, the completeness decision, and what the
   composed section actually says.
   ═══════════════════════════════════════════════════════════════════════════ */

describe('mapContainerClosurePayload — the cmc_container_closures row', () => {
  const dpRow = {
    id: 7,
    organizationId: 42,
    projectId: 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab',
    scope: 'drug_product',
    systemName: '10 mL Type I vial / 20 mm stopper',
    componentType: 'primary',
    containerDescription: '10 mL clear Type I borosilicate glass vial, 20 mm neck finish',
    closureDescription: '20 mm bromobutyl rubber stopper, fluoropolymer-laminated, aluminium flip-off seal',
    supplier: 'Schott / West',
    compendialStandards: ['USP <660>', 'USP <381>', 'Ph. Eur. 3.2.1'],
    suitabilityJustification:
      'Protection from light and moisture demonstrated over 12 months; compatibility shown by unchanged assay and impurity profile.',
    materialsOfConstruction: [
      { component: 'Vial', material: 'Type I borosilicate glass', supplier: 'Schott', specification: 'SPEC-VIAL-01', compendialReference: 'USP <660>' },
      { component: 'Stopper', material: 'Bromobutyl rubber', supplier: 'West', specification: 'SPEC-STP-04', compendialReference: 'USP <381>' },
    ],
    extractablesLeachables: {
      studyType: 'Controlled extraction, 40C/75%RH, 6 months',
      protocol: 'PR-EL-014',
      analyticalEvaluationThreshold: '1.5 ug/day',
      conclusion: 'All extractables below the analytical evaluation threshold.',
      results: [
        { analyte: 'Zinc dibutyldithiocarbamate', level: '0.4', unit: 'ug/day', threshold: '1.5 ug/day', assessment: 'below AET' },
      ],
    },
    integrityTesting: { method: 'Helium leak (USP <1207>)', acceptanceCriteria: '<= 6e-6 mbar L/s', result: '2.1e-6 mbar L/s' },
    status: 'qualified',
    qualificationDate: '2026-06-01T00:00:00.000Z',
  };

  it('carries the container, closure, materials, E&L and integrity data through', () => {
    const p = mapContainerClosurePayload(dpRow);
    expect(p.containerDescription).toContain('Type I borosilicate');
    expect(p.closureDescription).toContain('bromobutyl');
    expect(p.materialsOfConstruction).toHaveLength(2);
    expect((p.extractablesLeachables as Record<string, unknown>).protocol).toBe('PR-EL-014');
    expect((p.integrityTesting as Record<string, unknown>).result).toBe('2.1e-6 mbar L/s');
    expect(p.compendialStandards).toContain('USP <381>');
  });

  it('emits ONLY the drug-product side keys for a drug-product system', () => {
    const p = mapContainerClosurePayload(dpRow);
    expect(p.drugProductContainerDescription).toBeTruthy();
    expect(p.drugProductClosureDescription).toBeTruthy();
    expect(p.drugProductSuitabilityJustification).toBeTruthy();
    expect(p.drugSubstanceContainerDescription).toBeNull();
    expect(p.drugSubstanceClosureDescription).toBeNull();
    expect(p.drugSubstanceSuitabilityJustification).toBeNull();
  });

  it('emits both sides for a system recorded as evidence for both', () => {
    const p = mapContainerClosurePayload({ ...dpRow, scope: 'both' });
    expect(p.drugSubstanceContainerDescription).toBeTruthy();
    expect(p.drugProductContainerDescription).toBeTruthy();
  });

  it('reports no E&L study for a form that was opened and left blank', () => {
    /* `{}` and `{ studyType: '' }` are both truthy. Storing either as a
       recorded study would erase the section's "no E&L study is recorded"
       statement — the one thing that tells a reviewer the package is absent. */
    const blank = mapContainerClosurePayload({ ...dpRow, extractablesLeachables: {}, integrityTesting: { method: '' } });
    expect(blank.extractablesLeachables).toBeNull();
    expect(blank.integrityTesting).toBeNull();
    expect(blank.containerClosureStudies).toBeNull();
  });

  it('names the studies on file for §3.2.P.2, from the drug-product side only', () => {
    const dp = mapContainerClosurePayload(dpRow);
    expect(String(dp.containerClosureStudies)).toContain('extractables/leachables');
    expect(String(dp.containerClosureStudies)).toContain('container closure integrity');
    const ds = mapContainerClosurePayload({ ...dpRow, scope: 'drug_substance' });
    expect(ds.containerClosureStudies).toBeNull();
  });

  it('does not complete a section from a system recorded without a suitability justification', () => {
    const p = mapContainerClosurePayload({ ...dpRow, suitabilityJustification: '' });
    expect(p.drugProductSuitabilityJustification).toBeNull();
    const composed = composeModule3FromCanonicalSources([src('container_closure', p)]);
    const p7 = composed.find((c) => c.sectionKey === '3.2.P.7')!;
    expect(p7.missingInputs).toContain('drugProductSuitabilityJustification');
    expect(p7.completeness).toBeLessThan(100);
  });
});

describe('mapReferenceStandardPayload — the cmc_reference_standards row', () => {
  const dsRow = {
    id: 4,
    organizationId: 42,
    projectId: 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab',
    scope: 'drug_substance',
    standardCode: 'RS-DS-001',
    standardName: 'BX-204 primary reference standard',
    standardType: 'primary',
    materialSource: 'DS lot BX204-DS-2403',
    lotNumber: 'RS-LOT-2405',
    assignedValue: '98.7% (as-is)',
    characterization: [
      { attribute: 'Identity', method: 'FTIR', result: 'Conforms to reference spectrum' },
      { attribute: 'Purity', method: 'RP-HPLC', result: '99.4% area' },
    ],
    certificateOfAnalysis: 'CoA-RS-001-2405',
    qualificationProtocol: 'PR-RS-002',
    storageConditions: '-70C, desiccated',
    retestDate: '2027-05-01T00:00:00.000Z',
    status: 'qualified',
  };

  it('builds the description from the record own fields and keeps the CoA', () => {
    const p = mapReferenceStandardPayload(dsRow);
    expect(p.referenceStandardDescription).toContain('BX-204 primary reference standard');
    expect(p.referenceStandardDescription).toContain('RS-DS-001');
    expect(p.referenceStandardDescription).toContain('lot RS-LOT-2405');
    expect(p.referenceStandardDescription).toContain('assigned value 98.7% (as-is)');
    expect(p.certificateOfAnalysis).toBe('CoA-RS-001-2405');
    expect(p.characterization).toHaveLength(2);
  });

  it('emits ONLY the drug-substance side keys for a drug-substance standard', () => {
    const p = mapReferenceStandardPayload(dsRow);
    expect(p.drugSubstanceReferenceStandard).toBeTruthy();
    expect(p.drugSubstanceReferenceStandardCoA).toBe('CoA-RS-001-2405');
    expect(p.drugProductReferenceStandard).toBeNull();
    expect(p.drugProductReferenceStandardCoA).toBeNull();
  });

  it('produces no description at all for a record with neither a name nor a code', () => {
    const p = mapReferenceStandardPayload({ ...dsRow, standardCode: '', standardName: '' });
    expect(p.referenceStandardDescription).toBeNull();
    expect(p.drugSubstanceReferenceStandard).toBeNull();
  });
});

describe('the two new registers reach their sections, and only their own', () => {
  const containerDp = mapContainerClosurePayload({
    scope: 'drug_product',
    systemName: 'PVC/Aclar blister',
    containerDescription: 'PVC/PVdC-Aclar 300 blister with 20 um hard-temper aluminium lidding',
    closureDescription: 'Heat-sealed aluminium lidding foil',
    suitabilityJustification: 'Moisture ingress below the limit over 12 months at 40C/75%RH.',
    compendialStandards: ['USP <671>'],
    materialsOfConstruction: [{ component: 'Blister film', material: 'PVC/PVdC-Aclar', compendialReference: 'USP <661.1>' }],
    extractablesLeachables: {
      studyType: 'Simulated-use leachables, 6 months',
      results: [{ analyte: 'Bisphenol A', level: '< 0.05', unit: 'ug/blister', threshold: '1.5 ug/day', assessment: 'below AET' }],
      conclusion: 'No leachable exceeded the analytical evaluation threshold.',
    },
    status: 'qualified',
  });
  const standardDs = mapReferenceStandardPayload({
    scope: 'drug_substance',
    standardCode: 'RS-DS-001',
    standardName: 'BX-204 primary reference standard',
    standardType: 'primary',
    certificateOfAnalysis: 'CoA-RS-001-2405',
    characterization: [{ attribute: 'Identity', method: 'FTIR', result: 'Conforms' }],
    status: 'qualified',
  });

  const composed = composeModule3FromCanonicalSources([
    src('container_closure', containerDp),
    src('reference_standard', standardDs),
    src('drug_substance', { name: 'BX-204', manufacturer: 'Lonza AG' }),
    src('drug_product', { name: 'BX-204 tablets', dosageFormDescription: 'Film-coated tablet' }),
  ]);
  const section = (key: string) => composed.find((c) => c.sectionKey === key)!;

  it('completes §3.2.P.7 and §3.2.S.5 from the recorded registers', () => {
    expect(section('3.2.P.7').completeness).toBe(100);
    expect(section('3.2.S.5').completeness).toBe(100);
  });

  /* THE cross-bleed pin. A drug-product blister and a drug-substance standard
     must not turn the OTHER side's section green: both container closure
     sections match every container_closure source and both reference standard
     sections match every reference_standard source, so without the side-scoped
     keys one recorded system would complete a section that never renders it. */
  it('leaves §3.2.S.6 and §3.2.P.6 honestly incomplete — the other side has no record', () => {
    const s6 = section('3.2.S.6');
    expect(s6.completeness).toBe(0);
    expect(s6.missingInputs).toEqual(
      expect.arrayContaining(['drugSubstanceContainerDescription', 'drugSubstanceSuitabilityJustification']),
    );
    expect(s6.narrativeDraft).toContain('No container closure system is recorded for the drug substance');
    expect(s6.tables).toHaveLength(0);

    const p6 = section('3.2.P.6');
    expect(p6.completeness).toBe(0);
    expect(p6.narrativeDraft).toContain('No reference standard is recorded for the drug product');
  });

  it('renders the drug-product container closure system with its materials, E&L and compendial citations', () => {
    const p7 = section('3.2.P.7');
    const md = tablesToMarkdown(p7.tables);
    expect(md).toContain('PVC/PVdC-Aclar');
    expect(md).toContain('USP <661.1>');
    expect(md).toContain('Bisphenol A');
    expect(md).toContain('below AET');
    expect(p7.narrativeDraft).toContain('USP <671>');
    expect(p7.narrativeDraft).toContain('Moisture ingress below the limit');
    /* Suitability is the applicant's recorded statement, never the composer's
       conclusion. */
    expect(p7.narrativeDraft).toContain('Suitability justification recorded by the applicant');
  });

  it('renders the drug-substance reference standard with its characterisation', () => {
    const s5 = section('3.2.S.5');
    const md = tablesToMarkdown(s5.tables);
    expect(md).toContain('RS-DS-001');
    expect(md).toContain('FTIR');
    expect(s5.narrativeDraft).toContain('1 primary standard(s) are recorded');
    expect(s5.narrativeDraft).toContain('All recorded standards carry a qualified status');
  });

  it('feeds the drug-product container closure studies to §3.2.P.2', () => {
    const p2 = section('3.2.P.2');
    expect(p2.missingInputs).not.toContain('containerClosureStudies');
  });
});

describe('the composed sections refuse to assert what the register does not say', () => {
  it('does not report a standard as qualified because it exists', () => {
    const draft = mapReferenceStandardPayload({
      scope: 'drug_product',
      standardCode: 'RS-DP-002',
      standardName: 'BX-204 tablet working standard',
      standardType: 'working',
      certificateOfAnalysis: 'CoA-RS-002',
      status: 'draft',
    });
    const composed = composeModule3FromCanonicalSources([src('reference_standard', draft)]);
    const p6 = composed.find((c) => c.sectionKey === '3.2.P.6')!;
    expect(p6.narrativeDraft).toContain('0 of 1 recorded standard(s) carry a qualified status');
    expect(p6.narrativeDraft).toContain('No primary standard is recorded');
    expect(p6.narrativeDraft).toContain('No characterisation data are recorded');
  });

  it('does not assert an E&L safety conclusion the study has not reached', () => {
    const noConclusion = mapContainerClosurePayload({
      scope: 'drug_substance',
      systemName: 'HDPE drum with LDPE liner',
      containerDescription: 'HDPE drum, 25 kg',
      closureDescription: 'Screw cap with tamper-evident seal',
      suitabilityJustification: 'Protects from moisture over the retest period.',
      extractablesLeachables: { studyType: 'Controlled extraction', protocol: 'PR-EL-020' },
      status: 'draft',
    });
    const composed = composeModule3FromCanonicalSources([src('container_closure', noConclusion)]);
    const s6 = composed.find((c) => c.sectionKey === '3.2.S.6')!;
    expect(s6.narrativeDraft).toContain('no study conclusion supported by per-analyte results is recorded');
    expect(s6.narrativeDraft).not.toContain('below AET');
    /* The study exists but has no per-analyte results — reported as a study
       design row, never as data. */
    expect(tablesToMarkdown(s6.tables)).toContain('no per-analyte results recorded');
    expect(s6.narrativeDraft).toContain('No container closure integrity testing is recorded');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   The adversarial review of the registers above. Each of these is a defect a
   review lens found in the shipped code and a scenario the section got wrong.
   ═══════════════════════════════════════════════════════════════════════════ */

describe('review: a section is never assembled out of records that are each incomplete', () => {
  /* `availableFields` is a UNION over every matched source, so the section's
     completeness asked only whether SOME record carried each key. Two systems
     neither of which carries a suitability justification must not report a
     served section, and the narrative must name how many are unjustified. */
  it('a register of systems none of which is justified does not complete §3.2.P.7', () => {
    const primary = mapContainerClosurePayload({
      scope: 'drug_product',
      systemName: '10 mL Type I vial / 20 mm stopper',
      componentType: 'primary',
      containerDescription: '10 mL Type I borosilicate glass vial',
      closureDescription: '20 mm bromobutyl stopper',
      status: 'draft',
    });
    const other = mapContainerClosurePayload({
      scope: 'drug_product',
      systemName: 'Prefilled syringe presentation',
      componentType: 'primary',
      containerDescription: '1 mL long glass syringe barrel',
      closureDescription: 'Rigid needle shield',
      status: 'draft',
    });
    const composed = composeModule3FromCanonicalSources([
      src('container_closure', primary),
      src('container_closure', other),
    ]);
    const p7 = composed.find((c) => c.sectionKey === '3.2.P.7')!;
    expect(p7.completeness).toBeLessThan(100);
    expect(p7.missingInputs).toEqual(
      expect.arrayContaining(['drugProductSuitabilityJustification', 'drugProductContainerClosureComplete']),
    );
    expect(p7.narrativeDraft).toContain('No suitability justification is recorded');
  });

  it('one fully recorded system does complete it', () => {
    const whole = mapContainerClosurePayload({
      scope: 'drug_product',
      systemName: 'PVC/Aclar blister',
      containerDescription: 'PVC/PVdC-Aclar 300 blister',
      closureDescription: 'Heat-sealed aluminium lidding foil',
      suitabilityJustification: 'Moisture ingress below the limit over 12 months.',
      status: 'draft',
    });
    const composed = composeModule3FromCanonicalSources([src('container_closure', whole)]);
    expect(composed.find((c) => c.sectionKey === '3.2.P.7')!.completeness).toBe(100);
  });

  it('the same rule holds for a reference standard: identity and CoA on ONE record', () => {
    const named = mapReferenceStandardPayload({
      scope: 'drug_substance', standardCode: 'RS-A', standardName: 'Standard A', standardType: 'primary', status: 'draft',
    });
    const alsoNamed = mapReferenceStandardPayload({
      scope: 'drug_substance', standardCode: 'RS-B', standardName: 'Standard B', standardType: 'working', status: 'draft',
    });
    /* A register of standards, none of which has a Certificate of Analysis.
       The CoA key is genuinely missing and the section says so. */
    const split = composeModule3FromCanonicalSources([
      src('reference_standard', named),
      src('reference_standard', alsoNamed),
    ]).find((c) => c.sectionKey === '3.2.S.5')!;
    expect(split.completeness).toBeLessThan(100);
    expect(split.missingInputs).toEqual(
      expect.arrayContaining(['drugSubstanceReferenceStandardCoA', 'drugSubstanceReferenceStandardComplete']),
    );
    /* And one standard carrying BOTH completes it — the union is allowed to
       find a whole record, never to assemble one. */
    const whole = mapReferenceStandardPayload({
      scope: 'drug_substance', standardCode: 'RS-C', standardName: 'Standard C', standardType: 'primary',
      certificateOfAnalysis: 'CoA-C-2405', status: 'qualified',
    });
    const served = composeModule3FromCanonicalSources([
      src('reference_standard', named),
      src('reference_standard', whole),
    ]).find((c) => c.sectionKey === '3.2.S.5')!;
    expect(served.completeness).toBe(100);
  });

  /* A fully described SECONDARY carton is not a container closure system for
     the purposes of §3.2.P.7: the section's subject is the packaging in contact
     with the product. */
  it('a complete secondary carton does not stand in for an undescribed primary container', () => {
    const primary = mapContainerClosurePayload({
      scope: 'drug_product', systemName: 'Blister', componentType: 'primary',
      containerDescription: 'PVC/Aclar blister', closureDescription: 'Aluminium lidding', status: 'draft',
    });
    const carton = mapContainerClosurePayload({
      scope: 'drug_product', systemName: 'Secondary carton', componentType: 'secondary',
      containerDescription: 'Printed folding carton', closureDescription: 'Tamper-evident flap seal',
      suitabilityJustification: 'Provides light protection in transit.', status: 'draft',
    });
    const p7 = composeModule3FromCanonicalSources([
      src('container_closure', primary),
      src('container_closure', carton),
    ]).find((c) => c.sectionKey === '3.2.P.7')!;
    expect(p7.completeness).toBeLessThan(100);
    expect(p7.missingInputs).toContain('drugProductContainerClosureComplete');
  });
});

describe('review: the composed text never credits what the data does not carry', () => {
  it('an E&L conclusion with no per-analyte results is reported as unsupported', () => {
    const claimed = mapContainerClosurePayload({
      scope: 'drug_substance',
      systemName: 'HDPE drum',
      containerDescription: 'HDPE drum, 25 kg',
      closureDescription: 'Screw cap',
      suitabilityJustification: 'Protects from moisture over the retest period.',
      extractablesLeachables: {
        studyType: 'Controlled extraction',
        protocol: 'PR-EL-020',
        conclusion: 'All extractables below the analytical evaluation threshold.',
      },
      status: 'draft',
    });
    const s6 = composeModule3FromCanonicalSources([src('container_closure', claimed)])
      .find((c) => c.sectionKey === '3.2.S.6')!;
    expect(s6.narrativeDraft).toContain('no study conclusion supported by per-analyte results is recorded');
    expect(s6.narrativeDraft).toContain('1 recorded conclusion(s) have no per-analyte results in this section');
    expect(tablesToMarkdown(s6.tables)).toContain('no per-analyte results recorded');
  });

  /* The system's supplier is not the component's. A materials line typed with
     the supplier cell left blank rendered the vial maker's name against a
     stopper nobody said they made. */
  it('a component with no recorded supplier does not inherit the system supplier', () => {
    const p = mapContainerClosurePayload({
      scope: 'drug_product',
      systemName: 'Vial system',
      containerDescription: '10 mL vial',
      closureDescription: '20 mm stopper',
      suitabilityJustification: 'Demonstrated over 12 months.',
      supplier: 'Schott / West',
      materialsOfConstruction: [{ component: 'Stopper', material: 'Bromobutyl rubber' }],
      status: 'draft',
    });
    const p7 = composeModule3FromCanonicalSources([src('container_closure', p)])
      .find((c) => c.sectionKey === '3.2.P.7')!;
    const materials = p7.tables.find((t) => t.title.startsWith('Materials of Construction'))!;
    expect(materials.rows[0]).toEqual(['Vial system', 'Stopper', 'Bromobutyl rubber', '—', '—', '—']);
  });

  /* §3.3 read ONE description with val(), which returns the first matched
     source — so whichever standard was recorded first was named "the primary
     reference standard", working standards included. */
  it('§3.3 names as primary only a standard the register records as primary', () => {
    const working = mapReferenceStandardPayload({
      scope: 'drug_product', standardCode: 'RS-DP-002', standardName: 'Tablet working standard',
      standardType: 'working', lotNumber: 'WS-2406', certificateOfAnalysis: 'CoA-002', status: 'draft',
    });
    const primary = mapReferenceStandardPayload({
      scope: 'drug_substance', standardCode: 'RS-DS-001', standardName: 'BX-204 primary reference standard',
      standardType: 'primary', certificateOfAnalysis: 'CoA-001', status: 'qualified',
    });
    const s33 = composeModule3FromCanonicalSources([
      src('reference_standard', working),
      src('reference_standard', primary),
      src('drug_substance', { name: 'BX-204' }),
      src('drug_product', { dosageFormDescription: 'Film-coated tablet' }),
    ]).find((c) => c.sectionKey === '3.3')!;
    expect(s33.narrativeDraft).toContain('Primary reference standard: BX-204 primary reference standard');
    expect(s33.narrativeDraft).not.toContain('Primary reference standard: Tablet working standard');
  });

  it('§3.3 asserts no primacy at all when the register records none', () => {
    const working = mapReferenceStandardPayload({
      scope: 'both', standardCode: 'RS-W', standardName: 'Working standard',
      standardType: 'working', certificateOfAnalysis: 'CoA-W', status: 'draft',
    });
    const s33 = composeModule3FromCanonicalSources([src('reference_standard', working)])
      .find((c) => c.sectionKey === '3.3')!;
    expect(s33.narrativeDraft).toContain('none is recorded as a primary standard');
  });

  /* Captured and read by nothing: the date a reviewer checks a retest interval
     from, and the date a packaging system was signed off. */
  it('the recorded qualification dates reach both sections', () => {
    const standard = mapReferenceStandardPayload({
      scope: 'drug_substance', standardCode: 'RS-DS-001', standardName: 'Primary standard',
      standardType: 'primary', certificateOfAnalysis: 'CoA-001', status: 'qualified',
      qualificationDate: '2026-06-01T00:00:00.000Z',
    });
    const system = mapContainerClosurePayload({
      scope: 'drug_product', systemName: 'Vial system', containerDescription: '10 mL vial',
      closureDescription: '20 mm stopper', suitabilityJustification: 'Demonstrated.',
      status: 'qualified', qualificationDate: '2026-05-04T00:00:00.000Z',
    });
    const composed = composeModule3FromCanonicalSources([
      src('reference_standard', standard),
      src('container_closure', system),
    ]);
    expect(tablesToMarkdown(composed.find((c) => c.sectionKey === '3.2.S.5')!.tables)).toContain('2026-06-01');
    expect(tablesToMarkdown(composed.find((c) => c.sectionKey === '3.2.P.7')!.tables)).toContain('2026-05-04');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   §3.2.S.3.2 / §3.2.P.5.5 impurities and §3.2.P.2 / §3.2.P.5 dissolution — the
   other two source types the composer demanded and nothing produced.

   The composer had three live defects waiting for these sources to exist: both
   dissolution sections read the SAME four first-match keys, the impurity tables
   read one first-match array out of a register holding one row per impurity, and
   §3.2.S.3 appended a percent sign to whatever number was in the level field.
   ═══════════════════════════════════════════════════════════════════════════ */

const impurity = (over: Record<string, unknown> = {}) =>
  mapImpurityProfilePayload({
    scope: 'drug_substance',
    materialName: 'BX-204 drug substance',
    impurityName: 'Impurity A',
    impurityType: 'process-related',
    observedLevel: '0.08',
    levelUnit: '%',
    maximumDailyDose: '500 mg',
    status: 'draft',
    ...over,
  });

describe('mapImpurityProfilePayload — one row per impurity, assessed against ICH', () => {
  it('renders a ppm level as ppm, never as a percentage', () => {
    /* The table this replaced printed `${observedLevel}%` unconditionally, so a
       residual solvent recorded at 300 ppm appeared in a filing as 300% — a
       twenty-thousand-fold overstatement. */
    const composed = composeModule3FromCanonicalSources([
      src('impurity_profile', impurity({ impurityName: 'Methanol', impurityType: 'residual-solvent', observedLevel: '300', levelUnit: 'ppm' })),
    ]);
    const md = tablesToMarkdown(composed.find((c) => c.sectionKey === '3.2.S.3')!.tables);
    expect(md).toContain('300 ppm');
    expect(md).not.toContain('300%');
  });

  it('says so when a level carries no unit at all, rather than assuming a percentage', () => {
    const composed = composeModule3FromCanonicalSources([
      src('impurity_profile', impurity({ observedLevel: '0.08', levelUnit: '' })),
    ]);
    const s3 = composed.find((c) => c.sectionKey === '3.2.S.3')!;
    expect(tablesToMarkdown(s3.tables)).toContain('unit not recorded');
    expect(s3.narrativeDraft).toContain('cannot be compared to a threshold');
  });

  it('renders EVERY impurity in the register, not the first one', () => {
    /* `valArr(m, 'impurities')` returned the first matched source's array. Over
       one-row-per-impurity payloads that is one impurity out of however many
       the register holds. */
    const composed = composeModule3FromCanonicalSources([
      src('impurity_profile', impurity({ impurityName: 'Impurity A' })),
      src('impurity_profile', impurity({ impurityName: 'Impurity B', observedLevel: '0.19' })),
      src('impurity_profile', impurity({ impurityName: 'Impurity C', observedLevel: '0.02' })),
    ]);
    const md = tablesToMarkdown(composed.find((c) => c.sectionKey === '3.2.S.3')!.tables);
    for (const name of ['Impurity A', 'Impurity B', 'Impurity C']) expect(md).toContain(name);
  });

  it('states no threshold at all when no maximum daily dose is recorded', () => {
    const composed = composeModule3FromCanonicalSources([
      src('impurity_profile', impurity({ maximumDailyDose: '' })),
    ]);
    const s3 = composed.find((c) => c.sectionKey === '3.2.S.3')!;
    expect(s3.narrativeDraft).toContain('No maximum daily dose is recorded');
    expect(s3.narrativeDraft).toContain('not established by this section');
    expect(s3.missingInputs).toContain('drugSubstanceImpurityProfileComplete');
  });

  it('does not count an impurity below the reporting threshold as a reported impurity', () => {
    // MDD 500 mg → Q3A reporting threshold 0.05%. 0.02% is below it.
    const composed = composeModule3FromCanonicalSources([
      src('impurity_profile', impurity({ observedLevel: '0.02' })),
    ]);
    const s3 = composed.find((c) => c.sectionKey === '3.2.S.3')!;
    /* The claim is made over the impurities that were actually COMPARED to a
       threshold, and says so: asserted over a register whose impurities were
       all refused, "none is above the reporting threshold" stated the opposite
       of the truth — nothing had been compared to anything. */
    expect(s3.narrativeDraft).toContain('None of the 1 compared to an ICH Q3A/Q3B threshold is above it');
    expect(s3.narrativeDraft).toContain('1 are below the reporting threshold');
    expect(tablesToMarkdown(s3.tables)).toContain('not above the reporting threshold');
  });

  it('forces the statement when an impurity is above the qualification threshold with no basis', () => {
    // MDD 500 mg → Q3A qualification threshold 0.15% (1.0 mg/day is 0.2%, so
    // the percentage governs). 0.30% is above it.
    const composed = composeModule3FromCanonicalSources([
      src('impurity_profile', impurity({ observedLevel: '0.30', structure: 'CC1=CC(=O)N' })),
    ]);
    const s3 = composed.find((c) => c.sectionKey === '3.2.S.3')!;
    expect(s3.narrativeDraft).toContain('Outstanding against ICH');
    expect(s3.narrativeDraft).toContain('no qualification basis recorded');
  });

  it('names an impurity above the identification threshold with no structure as unidentified', () => {
    const composed = composeModule3FromCanonicalSources([
      src('impurity_profile', impurity({ observedLevel: '0.12' })),
    ]);
    expect(composed.find((c) => c.sectionKey === '3.2.S.3')!.narrativeDraft)
      .toContain('no structure recorded — reported as an unidentified impurity');
  });

  it('refuses to apply a Q3A threshold to a class the guideline does not cover', () => {
    /* Inorganic. A residual solvent and an elemental impurity USED to land here
       too; they are governed by Q3C and Q3D, those tables are modelled, and
       they are now assessed under them rather than refused. */
    const composed = composeModule3FromCanonicalSources([
      src('impurity_profile', impurity({ impurityName: 'Chloride', impurityType: 'inorganic', observedLevel: '3', levelUnit: 'ppm' })),
    ]);
    const s3 = composed.find((c) => c.sectionKey === '3.2.S.3')!;
    expect(s3.narrativeDraft).toContain('cannot be compared to a threshold');
    expect(tablesToMarkdown(s3.tables)).toContain('does not set thresholds for this impurity class');
  });

  it('assesses an elemental impurity under Q3D once its route is recorded', () => {
    const composed = composeModule3FromCanonicalSources([
      src('impurity_profile', impurity({
        impurityName: 'Pb', impurityType: 'elemental',
        observedLevel: '3', levelUnit: 'µg/day', routeOfAdministration: 'oral',
      })),
    ]);
    const s3 = composed.find((c) => c.sectionKey === '3.2.S.3')!;
    expect(s3.narrativeDraft).toContain('assessed against ICH Q3D(R2)');
    expect(tablesToMarkdown(s3.tables)).toContain('within the ICH Q3D');
  });

  it('refuses an elemental impurity whose route was never recorded', () => {
    const composed = composeModule3FromCanonicalSources([
      src('impurity_profile', impurity({ impurityName: 'Pb', impurityType: 'elemental', observedLevel: '3', levelUnit: 'µg/day' })),
    ]);
    expect(composed.find((c) => c.sectionKey === '3.2.S.3')!.narrativeDraft)
      .toContain('route of administration is not recorded');
  });

  it('never states a total impurity figure from whatever rows are on file', () => {
    const composed = composeModule3FromCanonicalSources([
      src('impurity_profile', impurity({ impurityName: 'Impurity A' })),
      src('impurity_profile', impurity({ impurityName: 'Impurity B' })),
    ]);
    expect(composed.find((c) => c.sectionKey === '3.2.S.3')!.narrativeDraft)
      .toContain('A total impurity figure is not stated here');
  });

  it('does not let a drug-substance impurity serve the drug-product section', () => {
    const composed = composeModule3FromCanonicalSources([
      src('impurity_profile', impurity({ scope: 'drug_substance' })),
      src('specification', { releaseCriteria: 'per ICH Q6A', acceptanceCriteria: { assay: '95-105%' } }),
      src('method', { methodName: 'HPLC-UV', validationStatus: 'validated' }),
    ]);
    const p5 = composed.find((c) => c.sectionKey === '3.2.P.5')!;
    expect(p5.missingInputs).toContain('drugProductImpurityProfileComplete');
    expect(p5.narrativeDraft).toContain('No impurity is recorded for the drug product');
  });

  it('reports the recorded maximum daily doses disagreeing rather than picking one', () => {
    const composed = composeModule3FromCanonicalSources([
      src('impurity_profile', impurity({ impurityName: 'Impurity A', maximumDailyDose: '500 mg' })),
      src('impurity_profile', impurity({ impurityName: 'Impurity B', maximumDailyDose: '750 mg' })),
    ]);
    expect(composed.find((c) => c.sectionKey === '3.2.S.3')!.narrativeDraft)
      .toContain('recorded maximum daily doses disagree');
  });
});

const profile = (over: Record<string, unknown> = {}) =>
  mapDissolutionProfilePayload({
    purpose: 'development',
    productName: 'BX-204 film-coated tablet',
    batchNumber: 'BX204-DP-2407',
    apparatus: 'USP II (paddle)',
    rotationSpeed: '50 rpm',
    medium: 'pH 6.8 phosphate buffer',
    mediumVolume: '900 mL',
    unitsTested: 12,
    results: [
      { timepoint: '10', meanPercent: '42', sd: '3.1', rsd: '7.4', n: '12' },
      { timepoint: '20', meanPercent: '78', sd: '2.6', rsd: '3.3', n: '12' },
      { timepoint: '30', meanPercent: '94', sd: '1.9', rsd: '2.0', n: '12' },
    ],
    status: 'draft',
    ...over,
  });

describe('mapDissolutionProfilePayload — a profile files under ONE section', () => {
  it('a development profile serves §3.2.P.2 and never §3.2.P.5', () => {
    /* Both sections read `condition` / `specification` / `results` / `passFail`
       through first-match helpers, so one record rendered identically into the
       method-development section and the release control section. */
    const composed = composeModule3FromCanonicalSources([
      src('dissolution_profile', profile({ purpose: 'development' })),
      src('specification', { releaseCriteria: 'per ICH Q6A' }),
      src('method', { methodName: 'HPLC-UV', validationStatus: 'validated' }),
      src('drug_product', { dosageFormDescription: 'Film-coated tablet' }),
    ]);
    const p2 = tablesToMarkdown(composed.find((c) => c.sectionKey === '3.2.P.2')!.tables);
    expect(p2).toContain('pH 6.8 phosphate buffer');
    const p5 = composed.find((c) => c.sectionKey === '3.2.P.5')!;
    expect(p5.narrativeDraft).toContain('No release specification dissolution profile is recorded');
    expect(tablesToMarkdown(p5.tables)).not.toContain('pH 6.8 phosphate buffer');
  });

  it('a release-specification profile serves §3.2.P.5 and never §3.2.P.2', () => {
    const composed = composeModule3FromCanonicalSources([
      src('dissolution_profile', profile({ purpose: 'release-specification', specification: 'Q = 80% at 30 min' })),
      src('drug_product', { dosageFormDescription: 'Film-coated tablet' }),
      src('specification', { releaseCriteria: 'per ICH Q6A' }),
      src('method', { methodName: 'HPLC-UV', validationStatus: 'validated' }),
    ]);
    expect(tablesToMarkdown(composed.find((c) => c.sectionKey === '3.2.P.5')!.tables)).toContain('Q = 80% at 30 min');
    expect(composed.find((c) => c.sectionKey === '3.2.P.2')!.narrativeDraft)
      .toContain('No development dissolution profile is recorded');
  });

  it('renders the profile per timepoint with its variability and unit count', () => {
    const composed = composeModule3FromCanonicalSources([src('dissolution_profile', profile())]);
    const md = tablesToMarkdown(composed.find((c) => c.sectionKey === '3.2.P.2')!.tables);
    expect(md).toContain('Mean % Dissolved');
    expect(md).toContain('%RSD');
    for (const mean of ['42', '78', '94']) expect(md).toContain(mean);
  });

  it('says a profile with no unit count supports no conformance and no comparison', () => {
    const composed = composeModule3FromCanonicalSources([
      src('dissolution_profile', profile({ unitsTested: null })),
    ]);
    const p2 = composed.find((c) => c.sectionKey === '3.2.P.2')!;
    expect(p2.narrativeDraft).toContain('do not record how many units were tested');
    expect(tablesToMarkdown(p2.tables)).toContain('not recorded');
  });

  it('does not carry a typed pass/fail into the dossier', () => {
    /* Whether a profile meets its criterion is a comparison against the recorded
       specification, not a word somebody typed. */
    const p = mapDissolutionProfilePayload({
      purpose: 'release-specification', productName: 'X', apparatus: 'USP II (paddle)',
      medium: 'water', unitsTested: 12, passFail: 'pass',
      results: [{ timepoint: '30', meanPercent: '95' }], status: 'draft',
    });
    expect(p.passFail).toBeUndefined();
  });

  it('never asserts f2 similarity from a rendered table', () => {
    const composed = composeModule3FromCanonicalSources([src('dissolution_profile', profile())]);
    expect(composed.find((c) => c.sectionKey === '3.2.P.2')!.narrativeDraft)
      .toContain('Profile similarity (f2) is not asserted in this section');
  });

  it('a release profile with no acceptance criterion does not complete §3.2.P.5', () => {
    const p = mapDissolutionProfilePayload({
      purpose: 'release-specification', productName: 'X', apparatus: 'USP II (paddle)',
      medium: 'water', unitsTested: 12,
      results: [{ timepoint: '30', meanPercent: '95' }], status: 'draft',
    });
    expect(p.releaseDissolutionProfileComplete).toBeNull();
    expect(p.releaseDissolutionProfile).toBeTruthy();
  });
});

describe('review: the impurity section claims only what it compared', () => {
  it('says nothing was compared when every impurity was refused', () => {
    /* The headline finding, converged on by six independent review lenses:
       "None is at or above the ICH reporting threshold" was asserted over a
       register whose every impurity had been REFUSED — no dose, no unit, an
       out-of-scope class. It stated the opposite of the truth. */
    const composed = composeModule3FromCanonicalSources([
      src('impurity_profile', impurity({ impurityName: 'Impurity A', maximumDailyDose: '' })),
      /* A solvent OUTSIDE the Q3C catalog: still refused, and refused by name.
         Methanol was the original example here and is now assessed under Q3C,
         which is the point of that change — the refusal case had to move to a
         record that genuinely cannot be assessed. */
      src('impurity_profile', impurity({ impurityName: 'Chlorobutanol', impurityType: 'residual-solvent', levelUnit: 'ppm', observedLevel: '300' })),
    ]);
    const s3 = composed.find((c) => c.sectionKey === '3.2.S.3')!;
    expect(s3.narrativeDraft).toContain('None has been compared to an ICH threshold');
    expect(s3.narrativeDraft).not.toContain('None of the');
    expect(s3.narrativeDraft).toContain('cannot be compared to a threshold');
    // …and names the guideline that does govern the refused one.
    expect(s3.narrativeDraft).toContain('Q3C');
    // …and never invents the Class 3 limit for a solvent it does not recognise.
    expect(s3.narrativeDraft).not.toContain('5000');
  });

  it('does not report a section complete over impurities it cannot assess', () => {
    /* The completeness key used a field-presence proxy weaker than the engine,
       so the section went green over records it rendered as "not assessable". */
    const composed = composeModule3FromCanonicalSources([
      src('impurity_profile', impurity({ maximumDailyDose: 'two tablets' })),
      src('drug_substance', { structuralElucidation: 'NMR', physicochemicalProperties: 'white powder', biologicalActivity: 'n/a' }),
    ]);
    const s3 = composed.find((c) => c.sectionKey === '3.2.S.3')!;
    expect(s3.missingInputs).toContain('drugSubstanceImpurityProfileComplete');
    expect(s3.completeness).toBeLessThan(100);
  });

  it('reads two spellings of the same dose as the same dose', () => {
    const composed = composeModule3FromCanonicalSources([
      src('impurity_profile', impurity({ impurityName: 'A', maximumDailyDose: '500 mg' })),
      src('impurity_profile', impurity({ impurityName: 'B', maximumDailyDose: '0.5 g' })),
    ]);
    const s3 = composed.find((c) => c.sectionKey === '3.2.S.3')!;
    expect(s3.narrativeDraft).not.toContain('doses disagree');
    expect(tablesToMarkdown(s3.tables)).toContain('ICH Threshold Basis');
  });

  it('prints the limit the comparison actually used, not only the guideline wording', () => {
    /* At a 1500 mg dose the 1.0 mg/day alternative governs (0.067%), and the
       section said an impurity was "above 0.10% or 1.0 mg/day (whichever is
       lower)" — two numbers, neither of them the one it compared against. */
    const composed = composeModule3FromCanonicalSources([
      src('impurity_profile', impurity({ maximumDailyDose: '1500 mg', observedLevel: '0.09' })),
    ]);
    expect(tablesToMarkdown(composed.find((c) => c.sectionKey === '3.2.S.3')!.tables)).toContain('0.0667%');
  });

  it('leaves a retired impurity out of the current profile', () => {
    const composed = composeModule3FromCanonicalSources([
      src('impurity_profile', impurity({ impurityName: 'Superseded', status: 'retired' })),
      /* An active source keeps the section composing, so this pins that the
         RETIRED impurity is excluded rather than that the section is empty. */
      src('drug_substance', { name: 'BX-204' }),
    ]);
    const s3 = composed.find((c) => c.sectionKey === '3.2.S.3')!;
    expect(s3.narrativeDraft).toContain('No impurity is recorded for the drug substance');
    /* And it does not satisfy the impurity requirement from the grave. */
    expect(s3.missingInputs).toContain('drugSubstanceImpurityProfileComplete');
  });

  it('a section whose only sources are retired says so, rather than "no data"', () => {
    const composed = composeModule3FromCanonicalSources([
      src('impurity_profile', impurity({ impurityName: 'Superseded', status: 'retired' })),
    ]);
    const s3 = composed.find((c) => c.sectionKey === '3.2.S.3')!;
    expect(s3.narrativeDraft).toContain('are retired and do not compose');
    expect(s3.lineage).toHaveLength(0);
  });

  it('states a recorded threshold that contradicts the guideline instead of replacing it silently', () => {
    const composed = composeModule3FromCanonicalSources([
      src('impurity_profile', impurity({ qualificationThreshold: '0.50%' })),
    ]);
    expect(composed.find((c) => c.sectionKey === '3.2.S.3')!.narrativeDraft)
      .toContain('state thresholds that differ from the ICH values applied above');
  });
});

describe('review: the dissolution section', () => {
  it('renders the reference profile a comparison is against', () => {
    const composed = composeModule3FromCanonicalSources([
      src('dissolution_profile', profile({
        purpose: 'comparability',
        comparisonBatch: 'BX204-DP-2401',
        comparisonResults: [{ timepoint: '10', meanPercent: '40', rsd: '6.0', n: '12' }],
      })),
    ]);
    const md = tablesToMarkdown(composed.find((c) => c.sectionKey === '3.2.P.2')!.tables);
    expect(md).toContain('Reference Profile Compared Against');
    expect(md).toContain('BX204-DP-2401');
  });

  it('says how many profiles carry timepoints when only some do', () => {
    const composed = composeModule3FromCanonicalSources([
      src('dissolution_profile', profile()),
      src('dissolution_profile', profile({ batchNumber: 'EMPTY', results: [] })),
    ]);
    expect(composed.find((c) => c.sectionKey === '3.2.P.2')!.narrativeDraft)
      .toContain('of which 1 carry per-timepoint results');
  });

  it('reports variability as unrecorded when the register stored an explicit null', () => {
    const composed = composeModule3FromCanonicalSources([
      src('dissolution_profile', profile({
        results: [
          { timepoint: '10', meanPercent: '42', sd: null, rsd: null, n: '12' },
          { timepoint: '20', meanPercent: '78', sd: null, rsd: null, n: '12' },
        ],
      })),
    ]);
    expect(composed.find((c) => c.sectionKey === '3.2.P.2')!.narrativeDraft)
      .toContain('record no standard deviation or %RSD');
  });

  it('leaves a retired profile out of the section, and says why it is empty', () => {
    /* A retired record feeds no section at all — not its tables, not its
       completeness. The section distinguishes "nothing recorded" from "the only
       record is retired" so a reviewer does not go hunting for data that is
       there and superseded. */
    const composed = composeModule3FromCanonicalSources([
      src('dissolution_profile', profile({ status: 'retired' })),
    ]);
    const p2 = composed.find((c) => c.sectionKey === '3.2.P.2')!;
    expect(p2.narrativeDraft).toContain('are retired and do not compose');
    expect(tablesToMarkdown(p2.tables)).not.toContain('Dissolution');
    expect(p2.lineage).toHaveLength(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   §3.2.P.4 materials and §3.2.P.1 formulation — the last three source types
   the composer demanded with a first-match read standing in for a register.
   ═══════════════════════════════════════════════════════════════════════════ */

const material = (over: Record<string, unknown> = {}) =>
  mapMaterialSpecPayload({
    materialRole: 'excipient',
    materialName: 'Microcrystalline cellulose',
    functionInFormulation: 'Diluent',
    grade: 'PH-102',
    compendialMonograph: 'USP-NF',
    supplier: 'DuPont',
    origin: 'plant',
    status: 'specified',
    ...over,
  });

const formulation = (over: Record<string, unknown> = {}) =>
  mapFormulationRecordPayload({
    formulationName: 'BX-701 5 mg film-coated tablet',
    version: 'F-v2.0',
    batchSize: '250,000 tablets',
    components: [
      { component: 'BX-701', role: 'Active', amountPerUnit: '5', unit: 'mg', percentWeight: '4.0' },
      { component: 'Microcrystalline cellulose', role: 'Diluent', amountPerUnit: '80', unit: 'mg', percentWeight: '64.0' },
    ],
    status: 'current',
    ...over,
  });

describe('mapMaterialSpecPayload — one register, two source types', () => {
  it('renders EVERY excipient, not the first one', () => {
    /* §3.2.P.4 read a single first-match materialName/grade pair out of a
       register holding one row per material, so a product using twelve
       excipients rendered one — and which one depended on arrival order. */
    const composed = composeModule3FromCanonicalSources([
      src('excipient', material({ materialName: 'Microcrystalline cellulose' })),
      src('excipient', material({ materialName: 'Croscarmellose sodium', functionInFormulation: 'Disintegrant' })),
      src('excipient', material({ materialName: 'Magnesium stearate', functionInFormulation: 'Lubricant' })),
    ]);
    const md = tablesToMarkdown(composed.find((c) => c.sectionKey === '3.2.P.4')!.tables);
    for (const name of ['Microcrystalline cellulose', 'Croscarmellose sodium', 'Magnesium stearate']) {
      expect(md).toContain(name);
    }
  });

  it('a raw material files under §3.2.S.2.3, not the drug product excipient section', () => {
    /* §3.2.P.4 is Control of EXCIPIENTS. A starting material for the drug
       substance rendered inside it because that was the only section rule
       naming `raw_material_spec` — so a reviewer opening the drug product's
       excipient section found a synthetic intermediate, while the register grid
       told the staffer the same row filed under §3.2.S.2.3. */
    const composed = composeModule3FromCanonicalSources([
      src('raw_material_spec', material({ materialRole: 'starting-material', materialName: 'Intermediate INT-2' })),
      src('drug_substance', { manufacturingRoute: 'Four-step convergent synthesis' }),
    ]);
    const p4 = composed.find((c) => c.sectionKey === '3.2.P.4')!;
    expect(p4.missingInputs).toContain('excipientControlComplete');
    expect(tablesToMarkdown(p4.tables)).not.toContain('Intermediate INT-2');

    const s2 = composed.find((c) => c.sectionKey === '3.2.S.2')!;
    expect(tablesToMarkdown(s2.tables)).toContain('Intermediate INT-2');
    expect(s2.narrativeDraft).toContain('raw or starting material specification(s) are recorded');
  });

  it('says when an excipient records neither a specification nor a monograph', () => {
    const composed = composeModule3FromCanonicalSources([
      src('excipient', material({ compendialMonograph: '', testParameters: null })),
    ]);
    const p4 = composed.find((c) => c.sectionKey === '3.2.P.4')!;
    expect(p4.narrativeDraft).toContain('record neither a specification nor a compendial monograph');
    expect(p4.missingInputs).toContain('excipientControlComplete');
  });

  it('names a novel excipient recorded without a justification', () => {
    const composed = composeModule3FromCanonicalSources([
      src('excipient', material({ novelExcipient: true })),
    ]);
    expect(composed.find((c) => c.sectionKey === '3.2.P.4')!.narrativeDraft)
      .toContain('record no justification');
  });

  it('carries the recorded origin without inferring one', () => {
    const p = material({ origin: '' });
    expect(p.origin).toBe('');
    expect(p.humanOrAnimalOrigin).toBeNull();
    const gelatin = material({ materialName: 'Gelatin capsule shell', origin: 'bovine', tseCertificate: 'CEP R1-CEP 2019-123' });
    expect(gelatin.humanOrAnimalOrigin).toBe(true);
  });
});

describe('mapFormulationRecordPayload — one current version, rendered', () => {
  it('renders the CURRENT formulation, not whichever arrived first', () => {
    const composed = composeModule3FromCanonicalSources([
      src('formulation_record', formulation({ formulationName: 'Old tablet', version: 'F-v1.0', status: 'superseded', components: [{ component: 'Lactose', role: 'Diluent' }] })),
      src('formulation_record', formulation()),
      src('drug_product', { dosageFormDescription: 'Film-coated tablet', strength: '5 mg', composition: 'BX-701 5 mg' }),
    ]);
    const p1 = composed.find((c) => c.sectionKey === '3.2.P.1')!;
    expect(p1.narrativeDraft).toContain('The current formulation is BX-701 5 mg film-coated tablet');
    const md = tablesToMarkdown(p1.tables);
    expect(md).toContain('Microcrystalline cellulose');
    // The superseded version is retained in the record, as a version row.
    expect(md).toContain('F-v1.0');
    expect(p1.narrativeDraft).toContain('1 superseded version(s) are retained');
  });

  it('refuses to elect a current formulation when none is marked current', () => {
    const composed = composeModule3FromCanonicalSources([
      src('formulation_record', formulation({ status: 'draft' })),
      src('drug_product', { dosageFormDescription: 'Tablet', strength: '5 mg', composition: 'x' }),
    ]);
    const p1 = composed.find((c) => c.sectionKey === '3.2.P.1')!;
    expect(p1.narrativeDraft).toContain('none is marked current');
    expect(p1.narrativeDraft).toContain('not established by this section');
  });

  it('says which composition governs is not established when two claim to be current', () => {
    const composed = composeModule3FromCanonicalSources([
      src('formulation_record', formulation({ version: 'F-v2.0' })),
      src('formulation_record', formulation({ version: 'F-v3.0' })),
    ]);
    expect(composed.find((c) => c.sectionKey === '3.2.P.1')!.narrativeDraft)
      .toContain('are marked current, so which composition governs is not established');
  });

  it('names an overage recorded without a justification', () => {
    /* An overage is a regulatory question in its own right (ICH Q8 §2.3). */
    const composed = composeModule3FromCanonicalSources([
      src('formulation_record', formulation({
        components: [{ component: 'BX-701', role: 'Active', amountPerUnit: '5', unit: 'mg', overage: '2%' }],
      })),
    ]);
    expect(composed.find((c) => c.sectionKey === '3.2.P.1')!.narrativeDraft)
      .toContain('component overage(s) are recorded without a justification');
  });
});


describe('mapManufacturingProcessPayload — the process, not one sentence about it', () => {
  /* The row shape manufacturing_processes hands back through Drizzle. */
  const process = (over: Record<string, unknown> = {}) => ({
    id: '8f14e45f-ceea-467a-9c8d-1a2b3c4d5e6f',
    organizationId: 42,
    projectId: 'aa11bb22-cc33-dd44-ee55-ff6677889900',
    processName: 'BX-204 drug substance synthesis',
    processType: 'Drug Substance',
    processDescription: '',
    processSteps: [
      {
        stepNumber: 2,
        unitOperation: 'Crystallisation',
        description: 'Crystallise from ethanol/water 3:1',
        inProcessControls: [{ test: 'Crystal form', acceptanceCriteria: 'Form I by XRPD' }],
        holdTime: '24 h',
      },
      {
        stepNumber: 1,
        unitOperation: 'Coupling',
        description: 'Couple INT-2 with the amine',
        inProcessControls: [{ test: 'Reaction completion', acceptanceCriteria: 'NLT 98% by HPLC' }],
      },
    ],
    criticalProcessParameters: [
      { parameter: 'Crystallisation temperature', step: 'Crystallisation', target: '5', rangeLow: '2', rangeHigh: '8', unit: '°C', criticality: 'critical', linkedCqa: 'Polymorphic form' },
    ],
    processControls: [{ test: 'Residual solvent', acceptanceCriteria: 'Ethanol NMT 5000 ppm' }],
    equipmentList: [{ equipment: 'RX-200 reactor', type: 'Glass-lined reactor', model: 'GL-2000', qualificationStatus: 'IQ/OQ/PQ complete' }],
    batchSize: '25 kg',
    validationStatus: 'validated',
    ...over,
  });

  it('orders the steps by their recorded number, not by array position', () => {
    const p = mapManufacturingProcessPayload(process());
    expect((p.processSteps as any[]).map((st) => st.unitOperation)).toEqual(['Coupling', 'Crystallisation']);
    /* And the derived description follows that order. */
    expect(p.processDescription).toBe('Coupling; Crystallisation');
  });

  it('keeps the recorded order when no step carries a number', () => {
    /* Reordering an unnumbered list would assert a sequence the register does
       not hold. */
    const p = mapManufacturingProcessPayload(process({
      processSteps: [{ unitOperation: 'Blend' }, { unitOperation: 'Compress' }, { unitOperation: 'Coat' }],
    }));
    expect((p.processSteps as any[]).map((st) => st.unitOperation)).toEqual(['Blend', 'Compress', 'Coat']);
  });

  it('collects in-process controls from the steps as well as the process level', () => {
    /* A section reading only the process-level list would report "no in-process
       controls" over a process that records one on every step. */
    const p = mapManufacturingProcessPayload(process({ processControls: [] }));
    expect(p.processControls).toContain('Reaction completion');
    expect(p.processControls).toContain('Crystal form');
  });

  it('scopes to the recorded side: a drug substance process cannot complete §3.2.P.3', () => {
    const p = mapManufacturingProcessPayload(process());
    expect(p.manufacturingProcessComplete).toBe('BX-204 drug substance synthesis');
    expect(p.drugProductProcessComplete).toBeNull();

    const dp = mapManufacturingProcessPayload(process({ processType: 'Drug Product' }));
    expect(dp.drugProductProcessComplete).toBe('BX-204 drug substance synthesis');
    expect(dp.manufacturingProcessComplete).toBeNull();
  });

  it('does not report a process complete when it records no in-process control', () => {
    const p = mapManufacturingProcessPayload(process({
      processControls: [],
      processSteps: [{ stepNumber: 1, unitOperation: 'Coupling' }],
    }));
    expect(p.manufacturingProcessComplete).toBeNull();
  });

  it('§3.2.S.2 is not complete on a name and steps split across two records', () => {
    /* The composer unions availableFields across matched sources, so without a
       single-record key two half-filled processes would add up to a complete
       manufacturing section. */
    const composed = composeModule3FromCanonicalSources([
      src('manufacturing_process', mapManufacturingProcessPayload(process({ processControls: [], processSteps: [] }))),
      src('manufacturing_process', mapManufacturingProcessPayload(process({ processName: '', processControls: [] }))),
      src('drug_substance', { manufacturingRoute: 'Four-step convergent synthesis' }),
    ]);
    const s2 = composed.find((c) => c.sectionKey === '3.2.S.2')!;
    expect(s2.missingInputs).toContain('manufacturingProcessComplete');
    expect(s2.completeness).toBeLessThan(100);
  });

  it('renders the steps, the CPPs and the equipment into §3.2.S.2', () => {
    const composed = composeModule3FromCanonicalSources([
      src('manufacturing_process', mapManufacturingProcessPayload(process())),
    ]);
    const md = tablesToMarkdown(composed.find((c) => c.sectionKey === '3.2.S.2')!.tables);
    expect(md).toContain('Manufacturing Process Steps');
    expect(md).toContain('Crystallisation');
    expect(md).toContain('Form I by XRPD');
    expect(md).toContain('Critical Process Parameters');
    expect(md).toContain('2 – 8');
    expect(md).toContain('RX-200 reactor');
  });

  it('names a critical parameter recorded without a proven range instead of dropping it', () => {
    const composed = composeModule3FromCanonicalSources([
      src('manufacturing_process', mapManufacturingProcessPayload(process({
        criticalProcessParameters: [{ parameter: 'Agitation rate', target: '150', unit: 'rpm' }],
      }))),
    ]);
    const s2 = composed.find((c) => c.sectionKey === '3.2.S.2')!;
    expect(tablesToMarkdown(s2.tables)).toContain('not recorded');
    expect(s2.narrativeDraft).toContain('carry no proven acceptable range');
  });

  it('a drug-product process does not appear in §3.2.S.2', () => {
    const composed = composeModule3FromCanonicalSources([
      src('manufacturing_process', mapManufacturingProcessPayload(process({ processType: 'Drug Product' }))),
    ]);
    expect(tablesToMarkdown(composed.find((c) => c.sectionKey === '3.2.S.2')!.tables))
      .not.toContain('Crystallisation');
    expect(tablesToMarkdown(composed.find((c) => c.sectionKey === '3.2.P.3')!.tables))
      .toContain('Crystallisation');
  });

  it('leaves a retired process out of the section', () => {
    /* Through the register's OWN lifecycle column. This table predates the
       register family and its column is validation_status, so the mapper has to
       carry that to the composer as `status` — the key the retirement filter
       reads. Emitting it only as processValidationStatus made the filter, and
       processRendering's own, dead code: a superseded synthetic route composed
       as the process the filing describes and scored §3.2.S.2 100% complete. */
    const composed = composeModule3FromCanonicalSources([
      src('manufacturing_process', mapManufacturingProcessPayload(process({ validationStatus: 'retired' }))),
      /* An active source keeps the section composing, so this pins that the
         RETIRED process is excluded rather than that the whole section is. */
      src('drug_substance', { manufacturingRoute: 'Four-step convergent synthesis' }),
    ]);
    const s2 = composed.find((c) => c.sectionKey === '3.2.S.2')!;
    expect(tablesToMarkdown(s2.tables)).not.toContain('Crystallisation');
    expect(s2.missingInputs).toContain('manufacturingProcessComplete');
  });

  it('§3.2.P.3 renders the register rather than the drug product form when both exist', () => {
    /* The section read `processSteps` through a first-match array helper, so
       once the register began emitting rows the two shapes competed for one
       column mapping. The register wins; the form's list is the fallback. */
    const composed = composeModule3FromCanonicalSources([
      src('manufacturing_process', mapManufacturingProcessPayload(process({ processType: 'Drug Product' }))),
      src('drug_product', { processSteps: [{ operation: 'Typed on the drug product form' }] }),
    ]);
    const md = tablesToMarkdown(composed.find((c) => c.sectionKey === '3.2.P.3')!.tables);
    expect(md).toContain('Crystallisation');
    expect(md).not.toContain('Typed on the drug product form');
  });

  it('still renders the drug product form list when no process is recorded', () => {
    const composed = composeModule3FromCanonicalSources([
      src('drug_product', { processSteps: [{ operation: 'Blending', ipc: 'Blend uniformity' }] }),
    ]);
    const md = tablesToMarkdown(composed.find((c) => c.sectionKey === '3.2.P.3')!.tables);
    expect(md).toContain('Blending');
  });
});

describe('mapCharacterizationStudyPayload — one study answers ONE of the three questions', () => {
  const study = (over: Record<string, unknown> = {}) => ({
    id: 7,
    organizationId: 42,
    projectId: 'p-1',
    scope: 'drug_substance',
    studyType: 'structural',
    studyTitle: 'Structure confirmation of BX-204',
    technique: '1H/13C NMR, HRMS, FT-IR, elemental analysis',
    attribute: 'Molecular structure',
    result: 'Consistent with the proposed structure',
    resultUnit: '',
    conclusion: 'The structure of BX-204 is confirmed',
    studyReference: 'RPT-CHAR-001',
    status: 'qualified',
    ...over,
  });

  it('a structural study answers structuralElucidation and nothing else', () => {
    const p = mapCharacterizationStudyPayload(study());
    expect(p.structuralElucidation).toBeTruthy();
    expect(p.physicochemicalProperties).toBeUndefined();
    expect(p.biologicalActivity).toBeUndefined();
  });

  it('three studies of one type do not complete the section', () => {
    /* This is what storing the type is FOR. Without it, three NMR studies would
       have greened physicochemical properties and biological activity too. */
    const composed = composeModule3FromCanonicalSources([
      src('characterization', mapCharacterizationStudyPayload(study({ studyTitle: 'NMR 1' }))),
      src('characterization', mapCharacterizationStudyPayload(study({ studyTitle: 'NMR 2' }))),
      src('characterization', mapCharacterizationStudyPayload(study({ studyTitle: 'NMR 3' }))),
    ]);
    const s3 = composed.find((c) => c.sectionKey === '3.2.S.3')!;
    expect(s3.missingInputs).toContain('physicochemicalProperties');
    expect(s3.missingInputs).toContain('biologicalActivity');
    expect(s3.narrativeDraft).toContain('physicochemical properties');
    expect(s3.narrativeDraft).toContain('not established by this section');
  });

  it('three studies of three types answer all three', () => {
    const composed = composeModule3FromCanonicalSources([
      src('characterization', mapCharacterizationStudyPayload(study())),
      src('characterization', mapCharacterizationStudyPayload(study({
        studyType: 'physicochemical', studyTitle: 'Aqueous solubility', technique: 'Shake-flask',
        attribute: 'Solubility at pH 6.8', result: '0.42', resultUnit: 'mg/mL', conclusion: 'Low solubility, BCS class II',
      }))),
      src('characterization', mapCharacterizationStudyPayload(study({
        studyType: 'biological', studyTitle: 'Target inhibition', technique: 'Enzymatic assay',
        attribute: 'IC50', result: '12', resultUnit: 'nM', conclusion: 'Potency confirmed',
      }))),
    ]);
    const s3 = composed.find((c) => c.sectionKey === '3.2.S.3')!;
    expect(s3.missingInputs).not.toContain('structuralElucidation');
    expect(s3.missingInputs).not.toContain('physicochemicalProperties');
    expect(s3.missingInputs).not.toContain('biologicalActivity');
    expect(s3.narrativeDraft).toContain('are each established by at least one recorded study');
  });

  it('a study with no result and no conclusion establishes nothing', () => {
    const p = mapCharacterizationStudyPayload(study({ result: '', conclusion: '' }));
    expect(p.structuralElucidation).toBeNull();
    const composed = composeModule3FromCanonicalSources([src('characterization', p)]);
    const s3 = composed.find((c) => c.sectionKey === '3.2.S.3')!;
    /* It still RENDERS — a reviewer must be able to see the study was run and
       that its result is missing. */
    expect(tablesToMarkdown(s3.tables)).toContain('Structure confirmation of BX-204');
    expect(s3.narrativeDraft).toContain('with neither a result nor a conclusion recorded');
    expect(s3.missingInputs).toContain('structuralElucidation');
  });

  it('reports a number whose unit was never recorded as such', () => {
    const composed = composeModule3FromCanonicalSources([
      src('characterization', mapCharacterizationStudyPayload(study({
        studyType: 'physicochemical', technique: 'Shake-flask', result: '0.42', resultUnit: '',
      }))),
    ]);
    expect(tablesToMarkdown(composed.find((c) => c.sectionKey === '3.2.S.3')!.tables))
      .toContain('0.42 (unit not recorded)');
  });

  it('a drug-product study does not answer the drug substance section', () => {
    const p = mapCharacterizationStudyPayload(study({ scope: 'drug_product' }));
    expect(p.structuralElucidation).toBeNull();
    const composed = composeModule3FromCanonicalSources([src('characterization', p)]);
    expect(composed.find((c) => c.sectionKey === '3.2.S.3')!.missingInputs)
      .toContain('structuralElucidation');
  });

  it('leaves a retired study out of the section', () => {
    const composed = composeModule3FromCanonicalSources([
      src('characterization', { ...mapCharacterizationStudyPayload(study()), status: 'retired' }),
      src('drug_substance', { name: 'BX-204' }),
    ]);
    const s3 = composed.find((c) => c.sectionKey === '3.2.S.3')!;
    expect(tablesToMarkdown(s3.tables)).not.toContain('Structure confirmation of BX-204');
    expect(s3.missingInputs).toContain('structuralElucidation');
  });

  it('renders the supporting data attributed to its own study', () => {
    const composed = composeModule3FromCanonicalSources([
      src('characterization', mapCharacterizationStudyPayload(study({
        supportingData: [{ label: 'δ 7.82 (d, 2H)', value: 'Aromatic H-3/H-5', note: '1H NMR, DMSO-d6' }],
      }))),
    ]);
    const md = tablesToMarkdown(composed.find((c) => c.sectionKey === '3.2.S.3')!.tables);
    expect(md).toContain('Characterisation Supporting Data');
    expect(md).toContain('Aromatic H-3/H-5');
  });
});


describe('review: what the register data is allowed to CLAIM', () => {
  const process = (over: Record<string, unknown> = {}) => ({
    processName: 'Tablet compression', processType: 'drug_product',
    processSteps: [{ stepNumber: 1, unitOperation: 'Blending', inProcessControls: [{ test: 'Blend uniformity', acceptanceCriteria: 'RSD <= 5%' }] }],
    processControls: [{ test: 'Weight variation', acceptanceCriteria: '+/- 5%' }],
    ...over,
  });

  it('§3.2.P.3 does not deny the in-process controls it prints', () => {
    /* processControls is side-scoped to the drug substance (it is §3.2.S.2's
       required field) and the drug-product text travels under its own key, so
       reading only the first made this clause unconditionally true for
       §3.2.P.3 — the section stated "No in-process control is recorded"
       directly beneath a table printing the controls it denied. */
    const composed = composeModule3FromCanonicalSources([
      src('drug_product', { formulation: 'F' }),
      src('batch', { batchNumber: 'B1' }),
      src('manufacturing_process', mapManufacturingProcessPayload(process())),
    ]);
    const p3 = composed.find((c) => c.sectionKey === '3.2.P.3')!;
    expect(p3.narrativeDraft).not.toContain('No in-process control is recorded');
    expect(tablesToMarkdown(p3.tables)).toContain('Blend uniformity');
  });

  it('every recorded in-process control reaches a table, not just the first process', () => {
    /* Both sections read the flattened control TEXT with a first-match helper
       over a register that is one row per process, so with two processes on a
       side the second one's controls appeared in no table and no sentence
       anywhere in Module 3. */
    const composed = composeModule3FromCanonicalSources([
      src('drug_substance', { manufacturingRoute: 'r' }),
      src('manufacturing_process', mapManufacturingProcessPayload({
        processName: 'Fermentation', processType: 'drug_substance',
        processSteps: [{ stepNumber: 1, unitOperation: 'Fermentation' }],
        processControls: [{ test: 'Viable count', acceptanceCriteria: 'NLT 1e6 CFU/mL' }],
      })),
      src('manufacturing_process', mapManufacturingProcessPayload({
        processName: 'Purification', processType: 'drug_substance',
        processSteps: [{ stepNumber: 1, unitOperation: 'Chromatography' }],
        processControls: [{ test: 'Endotoxin', acceptanceCriteria: 'NMT 0.5 EU/mg' }],
      })),
    ]);
    const md = tablesToMarkdown(composed.find((c) => c.sectionKey === '3.2.S.2')!.tables);
    expect(md).toContain('Viable count');
    expect(md).toContain('Endotoxin');
  });

  it('a signed process validation reaches the composed section', () => {
    const composed = composeModule3FromCanonicalSources([
      src('drug_substance', { manufacturingRoute: 'r' }),
      src('manufacturing_process', mapManufacturingProcessPayload({
        processName: 'BX-204 synthesis', processType: 'drug_substance', validationStatus: 'validated',
        processSteps: [{ stepNumber: 1, unitOperation: 'Coupling' }],
        processControls: [{ test: 'Completion', acceptanceCriteria: 'NLT 98%' }],
      })),
    ]);
    expect(composed.find((c) => c.sectionKey === '3.2.S.2')!.narrativeDraft)
      .toContain('recorded as validated in the process register');
  });

  it('a drug-product characterisation study reaches §3.2.P.2 rather than nothing', () => {
    /* The form and the register grid both tell the staffer a drug-product study
       files under §3.2.P.2; `characterization` appeared in §3.2.S.3's rule only,
       so the study was written through to cmc_source_objects and reached no
       composed section at all. */
    const composed = composeModule3FromCanonicalSources([
      src('drug_product', { dosageFormDescription: 'Tablet' }),
      src('characterization', mapCharacterizationStudyPayload({
        scope: 'drug_product', studyType: 'physicochemical', studyTitle: 'Polymorph screen on compressed tablets',
        technique: 'XRPD', attribute: 'Solid form', result: 'Form I only', conclusion: 'No form change on compression',
      })),
    ]);
    const p2 = composed.find((c) => c.sectionKey === '3.2.P.2')!;
    expect(tablesToMarkdown(p2.tables)).toContain('Polymorph screen on compressed tablets');
    /* And §3.2.P.2 does not invent §3.2.S.3.1's three-question requirement. */
    expect(p2.narrativeDraft).not.toContain('No recorded study establishes');
  });

  it('§3.2.P.1 is not complete over a formulation the section says does not govern', () => {
    /* formulationCompositionComplete was emitted from a name and components
       alone, while the section renders the composition only for the record
       marked current — so the dashboard called the composition section finished
       in the same breath as the section text said the governing composition was
       not established. */
    const draft = mapFormulationRecordPayload({
      formulationName: 'BX-701 tablet', status: 'draft',
      components: [{ component: 'BX-701' }, { component: 'MCC' }],
    });
    const composed = composeModule3FromCanonicalSources([
      src('drug_product', { dosageFormDescription: 'Tablet', strength: '5 mg', composition: 'x' }),
      src('formulation_record', draft),
    ]);
    const p1 = composed.find((c) => c.sectionKey === '3.2.P.1')!;
    expect(p1.missingInputs).toContain('formulationCompositionComplete');
    expect(p1.completeness).toBeLessThan(100);
    expect(mapFormulationRecordPayload({
      formulationName: 'BX-701 tablet', status: 'current',
      components: [{ component: 'BX-701' }],
    }).formulationCompositionComplete).toBe('BX-701 tablet');
  });

  it('§3.2.P.4 is not complete over an excipient with no recorded way of being tested', () => {
    /* The union hole the *Complete key exists to close was open on exactly the
       field the key did not check: one excipient carried the key while a
       DIFFERENT one supplied excipientAnalyticalProcedures. */
    // A carries a specification and no way of testing it.
    const a = mapMaterialSpecPayload({
      materialName: 'Excipient A',
      testParameters: [{ test: 'Assay', acceptanceCriteria: '>= 99%' }],
    });
    // B carries the analytical procedure and no specification.
    const b = mapMaterialSpecPayload({ materialName: 'Excipient B', analyticalProcedures: 'Per in-house SOP AP-14' });
    expect(a.excipientSpecifications).toBeTruthy();
    expect(a.excipientControlComplete).toBeNull();
    expect(b.excipientAnalyticalProcedures).toBeTruthy();
    expect(b.excipientControlComplete).toBeNull();

    const composed = composeModule3FromCanonicalSources([src('excipient', a), src('excipient', b)]);
    const p4 = composed.find((c) => c.sectionKey === '3.2.P.4')!;
    // The two other required fields ARE satisfied — by different excipients.
    expect(p4.missingInputs).not.toContain('excipientSpecifications');
    expect(p4.missingInputs).not.toContain('excipientAnalyticalProcedures');
    expect(p4.missingInputs).toContain('excipientControlComplete');
  });

  it('§3.2.P.4 does not claim every excipient is controlled when one is not', () => {
    const composed = composeModule3FromCanonicalSources([
      src('excipient', mapMaterialSpecPayload({
        materialName: 'Excipient A', analyticalProcedures: 'In-house',
        testParameters: [{ test: 'Assay', acceptanceCriteria: '>= 99%' }],
      })),
      src('excipient', mapMaterialSpecPayload({ materialName: 'Excipient C' })),
    ]);
    const narrative = composed.find((c) => c.sectionKey === '3.2.P.4')!.narrativeDraft;
    expect(narrative).not.toContain('each controlled to the specification');
    expect(narrative).toContain('record neither a specification nor a compendial monograph');
  });
});
