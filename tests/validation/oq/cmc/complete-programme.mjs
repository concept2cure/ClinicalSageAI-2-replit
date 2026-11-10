/**
 * OQ-008: the second programme, whose records compose a Module 3 every section
 * of which can be approved (OQ-CMC-03b; v0.13).
 *
 * The first programme (OQ-CMC-03) holds six reference records. They compose 21
 * sections, 14 of them incomplete, which is what the steps on refusals need
 * and why no run before v0.13 reached the final-export gate's pass, the
 * placement, or the two steps behind it. This programme holds what a
 * small-molecule US IND records for a complete Module 3, each entered through
 * the register route the CMC screens call. Nothing here is written to the
 * database directly.
 *
 * The values are reference data for the protocol, not a real product's. A
 * named expert's signature on them is owed before the package is signed
 * (OQ-008 §4), as it is for OQ-CMC-03's.
 */
import { dataOf } from './signed-acts.mjs';

export const completeInd = (stamp) => ({
  name: `BX-702 IND ${stamp}`,
  productName: 'BX-702',
  programType: 'ind',
  productType: 'drug',
  applicationNumber: `1613${String(stamp).slice(-2)}`,
  primaryAgency: 'FDA',
  priority: 'high',
  indication: 'Relapsed multiple myeloma',
});

const TABLET = 'BX-702 5 mg film-coated tablet';
const ASSAY_LIMITS = { release: '98.0-102.0%', shelf: '95.0-105.0%' };
const longTerm = { climaticZone: 'II', studyType: 'long_term', storageConditions: ['LT', '25C/60%RH'], duration: 24, testParameters: ['assay'], timePoints: ['0', '3', '6', '12', '24'], status: 'ACTIVE' };

/** The drug substance's side, with the two records both sides share (the method and the reference standard). */
const substanceRecords = (s) => [
  ['drugSubstance', '/api/cmc/drug-substances', {
    substanceName: 'BX-702', inn: 'bexanistat', casNumber: '1234-56-8', molecularFormula: 'C17H19N3O2', molecularWeight: '297.36',
    manufacturingProcess: { manufacturer: 'Acme Fine Chemicals', route: 'Four-step chemical synthesis from 2-aminopyridine; final step crystallisation from ethanol/water', site: 'Basel' },
    status: 'development', developmentPhase: 'phase1', modality: 'small_molecule',
  }],
  ['drugProduct', '/api/cmc/drug-products', {
    productName: TABLET, dosageForm: 'Film-coated tablet', strength: '5 mg', routeOfAdministration: 'oral',
    composition: 'BX-702 5 mg; microcrystalline cellulose PH-102 80 mg; gelatin 3 mg; film coat 3 mg',
    batchFormula: { description: 'Per 100,000 tablets: BX-702 0.500 kg; microcrystalline cellulose PH-102 8.000 kg; gelatin 0.300 kg; film coat 0.300 kg' },
    status: 'development',
  }],
  ['analyticalMethod', '/api/cmc/analytical-methods', {
    methodCode: `AM2-${s}`, title: 'RP-HPLC Assay', purpose: 'assay', analyte: 'BX-702', matrix: 'drug substance', technique: 'HPLC',
    ichQ2Parameters: {
      specificity: 'No interference from placebo, impurities or degradants at the BX-702 retention time',
      accuracy: '98.0-102.0% recovery at 80, 100 and 120%',
      precision: 'Repeatability RSD <= 1.0% (n=6); intermediate precision RSD <= 2.0%',
      linearity: 'r >= 0.999 over 50-150% of nominal',
      range: '50-150% of nominal',
    },
  }],
  ['specification', '/api/cmc/specifications', {
    materialType: 'drug_substance', materialName: 'BX-702', acceptanceCriteria: ASSAY_LIMITS, testMethods: { method: 'RP-HPLC Assay' },
    regulatoryBasis: { ich: 'ICH Q6A' }, justification: 'Batch history n=12 supports the limits', approvalStatus: 'draft',
  }],
  ['batchRecord', '/api/cmc/batch-records', { batchNumber: `B2-${s}`, productName: 'Drug substance', status: 'in-progress', yieldData: { percent: 94 }, deviations: { open: 0 } }],
  ['stabilityStudy', '/api/cmc/stability-studies', { productName: 'BX-702', batchNumber: `B2-${s}`, dosageForm: 'solution', scope: 'DS', ...longTerm, startDate: '2026-01-01T00:00:00.000Z' }],
  // 3.2.S.6, 3.2.P.7, 3.2.P.2 and 3.2.A.1: the two primary container closure systems.
  ['containerClosureDrugSubstance', '/api/cmc/container-closures', {
    scope: 'drug_substance', systemName: 'Double LDPE bag in HDPE drum',
    containerDescription: 'Double low-density polyethylene bags, each closed with a tie, inside a 25 L high-density polyethylene drum',
    closureDescription: 'Tamper-evident HDPE lid with a tinned-steel locking ring',
    suitabilityJustification: 'LDPE in contact with the substance meets Ph. Eur. 3.1.3; no interaction seen in 12 months at 25C/60%RH',
  }],
  ['containerClosureDrugProduct', '/api/cmc/container-closures', {
    scope: 'drug_product', systemName: 'PVC/PVDC-aluminium blister',
    containerDescription: 'Clear PVC/PVDC 250/60 forming film blister, 10 tablets per card',
    closureDescription: '20 micron hard-temper aluminium lidding foil with heat-seal lacquer',
    suitabilityJustification: 'Moisture barrier shown adequate by 6 months at 40C/75%RH; materials meet 21 CFR 177',
    extractablesLeachables: { studyType: 'Controlled extraction', result: 'No extractable above the analytical evaluation threshold' },
    integrityTesting: { method: 'Dye ingress, blue dye at -60 kPa for 10 min', result: 'No ingress in 30 of 30 blisters' },
  }],
  // 3.2.S.5 and 3.2.P.6.
  ['referenceStandard', '/api/cmc/reference-standards', {
    scope: 'both', standardCode: `RS-${s}`, standardName: 'BX-702 primary reference standard',
    certificateOfAnalysis: 'CoA RS-001: assay 99.8% (mass balance); identity by NMR, MS and IR conforms',
  }],
  // 3.2.S.3: one study of each kind the section asks for.
  ['characterizationStructural', '/api/cmc/characterization-studies', {
    studyType: 'structural', studyTitle: 'Structural elucidation of BX-702', technique: '1H and 13C NMR, HRMS, IR, single-crystal X-ray diffraction',
    result: 'All data consistent with the proposed structure', conclusion: 'The structure of BX-702 is confirmed',
  }],
  ['characterizationPhysicochemical', '/api/cmc/characterization-studies', {
    studyType: 'physicochemical', studyTitle: 'Physicochemical properties of BX-702', technique: 'DSC, TGA, XRPD, pH-solubility profile, pKa by potentiometry',
    result: 'Melting point 182 C; pKa 6.4; one polymorph (Form I) across screening', conclusion: 'Form I is the stable form and is the form manufactured',
  }],
  ['characterizationBiological', '/api/cmc/characterization-studies', {
    studyType: 'biological', studyTitle: 'Biological activity of BX-702', technique: 'Enzyme inhibition assay',
    result: 'IC50 4.2 nM against the target enzyme (n=3)', conclusion: 'Potency is consistent across the three development batches',
  }],
];

/** The drug product's side, and the batch analyses and impurities of both. */
const productRecords = (s) => [
  // 3.2.S.3, 3.2.S.4 and 3.2.P.5: an impurity the engine can assess, on each side.
  ['impurityDrugSubstance', '/api/cmc/impurity-profiles', {
    scope: 'drug_substance', materialName: 'BX-702', impurityName: 'Des-methyl BX-702', impurityType: 'process-related',
    observedLevel: '0.05', levelUnit: '%', maximumDailyDose: '10 mg',
  }],
  ['impurityDrugProduct', '/api/cmc/impurity-profiles', {
    scope: 'drug_product', materialName: TABLET, impurityName: 'BX-702 N-oxide', impurityType: 'degradation',
    observedLevel: '0.05', levelUnit: '%', maximumDailyDose: '10 mg',
  }],
  // 3.2.S.4 and 3.2.P.5: batch analyses.
  ['qcDrugSubstance', '/api/cmc/qc-testing', {
    sampleId: `QC-DS-${s}`, sampleType: 'raw-material', testMethod: 'RP-HPLC Assay', testResults: { assay: { value: 99.5, unit: '%' } },
    testDate: '2026-02-01T00:00:00.000Z', batchNumber: `B2-${s}`,
  }],
  ['qcDrugProduct', '/api/cmc/qc-testing', {
    sampleId: `QC-DP-${s}`, sampleType: 'finished-product', testMethod: 'RP-HPLC Assay', testResults: { assay: { value: 99.1, unit: '%' } },
    testDate: '2026-02-15T00:00:00.000Z', batchNumber: `P2-${s}`,
  }],
  // 3.2.P.5: the product's release criteria, the same limits as the substance's.
  ['specificationDrugProduct', '/api/cmc/specifications', {
    materialType: 'drug_product', materialName: TABLET, acceptanceCriteria: ASSAY_LIMITS, testMethods: { method: 'RP-HPLC Assay' },
    regulatoryBasis: { ich: 'ICH Q6A' }, justification: 'Limits follow the drug substance and three development batches', approvalStatus: 'draft',
  }],
  // 3.2.P.4 and 3.2.A.3: each excipient, with the origin of the one that is of animal origin.
  ['excipientCellulose', '/api/cmc/material-specs', {
    materialRole: 'excipient', materialName: 'Microcrystalline cellulose PH-102', compendialMonograph: 'Ph. Eur. 0316 / USP-NF', origin: 'plant',
  }],
  ['excipientGelatin', '/api/cmc/material-specs', {
    materialRole: 'excipient', materialName: 'Gelatin', compendialMonograph: 'Ph. Eur. 0330 / USP-NF', origin: 'bovine',
    tseCertificate: 'EDQM CEP R1-CEP 2001-332 (TSE)',
  }],
  // 3.2.P.1 and 3.2.P.2.
  ['formulation', '/api/cmc/formulation-records', {
    formulationName: `${TABLET}, formulation F3`, status: 'current',
    components: [
      { component: 'BX-702', function: 'Active', quantity: '5 mg' },
      { component: 'Microcrystalline cellulose PH-102', function: 'Diluent', quantity: '80 mg' },
      { component: 'Gelatin', function: 'Binder', quantity: '3 mg' },
      { component: 'Film coat', function: 'Coating', quantity: '3 mg' },
    ],
    formulationDevelopment: 'F1 (capsule) and F2 (uncoated tablet) were replaced by F3 to improve content uniformity and mask taste; the excipient ratio was fixed by a two-factor design',
  }],
  // 3.2.S.2, 3.2.P.3 and 3.2.P.2.
  ['processDrugSubstance', '/api/cmc/manufacturing-processes', {
    processType: 'drug_substance', processName: 'BX-702 drug substance synthesis',
    processSteps: [
      { step: 1, name: 'Coupling', description: 'Amide coupling of intermediates A and B in THF' },
      { step: 2, name: 'Crystallisation', description: 'Crystallisation from ethanol/water and drying' },
    ],
    processControls: [
      { test: 'Reaction completion by HPLC', acceptanceCriteria: 'Intermediate A not more than 0.5%' },
      { test: 'Loss on drying', acceptanceCriteria: 'Not more than 0.5%' },
    ],
  }],
  ['processDrugProduct', '/api/cmc/manufacturing-processes', {
    processType: 'drug_product', processName: 'BX-702 tablet manufacture',
    processSteps: [
      { step: 1, name: 'Blending', description: 'Blend the active with the diluent and binder' },
      { step: 2, name: 'Compression', description: 'Compress to 91 mg cores' },
      { step: 3, name: 'Coating', description: 'Film coat to a 3% weight gain' },
    ],
    processControls: [
      { test: 'Blend uniformity', acceptanceCriteria: 'RSD not more than 5.0%' },
      { test: 'Tablet hardness', acceptanceCriteria: '60-100 N' },
    ],
    processDevelopment: 'Direct compression was chosen over wet granulation after the blend showed adequate flow; coating parameters were set by a three-batch study',
  }],
  // 3.2.P.8.
  ['stabilityDrugProduct', '/api/cmc/stability-studies', {
    productName: TABLET, batchNumber: `P2-${s}`, dosageForm: 'tablet', scope: 'DP', ...longTerm, startDate: '2026-01-15T00:00:00.000Z',
    shelfLife: '24 months when stored at or below 25 C',
  }],
];

/** Each record as `[key, register path, body]`, in the order it is entered. The programme id is added by the caller. */
export const completeRecords = (s) => [...substanceRecords(s), ...productRecords(s)];

/** The compiled sections of a programme, as the list read returns them. */
export async function sectionsOf(api, projectId) {
  const r = await api('GET', `/api/cmc/module3-os/sections/${projectId}`);
  const body = dataOf(r);
  return Array.isArray(body) ? body : (body.sections ?? []);
}

/** A section the compiler scored complete, with nothing missing: the only kind that can be approved. */
export const isComplete = (s) => Number(s.completeness) === 100 && (s.missingInputs ?? []).length === 0;

/** The open findings of a programme's contradiction register. */
export async function openFindings(api, projectId) {
  const r = await api('GET', `/api/cmc/module3-os/contradictions/${projectId}`);
  const body = dataOf(r);
  return (Array.isArray(body) ? body : (body.findings ?? [])).filter((f) => f.status === 'open');
}

/** The Module 3 requirement findings in a sequence's dispatch verdict (IND_MODULE3_REQUIRED). */
export const module3RequirementFindings = (readiness) =>
  (readiness?.readiness?.findings ?? []).filter((f) => f.code === 'IND_MODULE3_REQUIRED');
