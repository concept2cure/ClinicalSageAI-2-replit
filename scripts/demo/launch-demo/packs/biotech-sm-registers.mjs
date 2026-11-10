/**
 * C2C-201's other eleven CMC registers (P-122, 2026-11-10) — fictional, like
 * everything in this pack. Read by `ensureCmcRegisters` (cmc-registers.mjs).
 *
 * C2C-201 is the pack's small molecule: an oral JAK1 inhibitor, 15 mg
 * film-coated tablets, made by a four-step synthesis (biotech-work-content.mjs
 * BIOTECH_SM_CMC). Everything below is consistent with that record: the same
 * batches, methods, dose and container, so the composed §3.2 sections agree
 * with the registers beside them.
 *
 * Chosen so a CMC lead sees the module's engines work on real-looking data:
 *   • impurities of every class the assessment routes — an ICH Q3A process
 *     impurity, a Q3B degradant, an M7 Class 3 alkyl halide and an M7 Class 5
 *     (alert, Ames-negative), a Q3C Class 3 solvent and a Q3D Class 2B element;
 *   • two dissolution profiles of the biobatch and the next batch, run under one
 *     method with twelve units and recorded variability, so f2 is computable;
 *   • lactose recorded with its animal origin and TSE statement, which §3.2.A.2
 *     reads.
 * No row is signed: the qualification, validation and approval acts are
 * ceremonies, taken on stage.
 */
const DS = 'C2C-201';
const DP = 'C2C-201 tablets';
const MDD = '15 mg';

const point = (timepoint, meanPercent, sd, min, max) =>
  ({ timepoint: String(timepoint), meanPercent: String(meanPercent), sd: String(sd), rsd: (sd / meanPercent * 100).toFixed(1), min: String(min), max: String(max), n: '12' });

const DISSOLUTION_METHOD = {
  apparatus: 'USP II (paddle)', rotationSpeed: '50 rpm', medium: 'pH 6.8 phosphate buffer', mediumVolume: '900 mL',
  temperature: '37.0 ± 0.5 °C', specification: 'NLT 80 % (Q) released at 30 minutes', unitsTested: 12, productName: DP, strength: '15 mg',
};

export const BIOTECH_SM_REGISTERS = {
  referenceStandards: [
    { scope: 'both', standardCode: 'RS-201-P01', standardName: 'C2C-201 primary reference standard', standardType: 'primary',
      materialSource: 'Recrystallised from drug-substance lot C2C201-DS-2502', lotNumber: 'RS201-24-001', assignedValue: '99.7 % (as is)',
      characterization: [
        { attribute: 'Identity', method: '1H and 13C NMR, HRMS, IR', result: 'Conforms to the proposed structure' },
        { attribute: 'Chromatographic purity', method: 'HPLC-UV assay and related substances', result: '99.8 % area' },
        { attribute: 'Water', method: 'Karl Fischer water determination', result: '0.08 % w/w' },
      ],
      qualificationProtocol: 'QP-RS-201-01', storageConditions: '2–8 °C, protected from light', retestDateInDays: 365, status: 'draft' },
    { scope: 'drug_substance', standardCode: 'RS-201-IMP-A', standardName: 'Impurity A (des-cyclopropyl amide) reference material', standardType: 'secondary',
      materialSource: 'Synthesised by the step-3 route without the acyl chloride', lotNumber: 'RSA-24-002', assignedValue: '98.9 % (as is)',
      storageConditions: '2–8 °C', retestDateInDays: 365, status: 'draft' },
  ],
  impurities: [
    { scope: 'drug_substance', materialName: DS, impurityName: 'Impurity A (des-cyclopropyl amide)', impurityType: 'process-related',
      origin: 'Incomplete amide formation at step 3', relativeRetentionTime: '0.82', analyticalMethod: 'HPLC-UV assay and related substances',
      observedLevel: '0.08', levelUnit: '%', maximumDailyDose: MDD, specificationLimit: 'NMT 0.20 %', routeOfAdministration: 'oral',
      batchesObserved: ['C2C201-DS-2502'], status: 'draft' },
    { scope: 'drug_product', materialName: DP, impurityName: 'Impurity B (N-oxide)', impurityType: 'degradation',
      origin: 'Oxidative degradant; grows at 40 °C/75 % RH', relativeRetentionTime: '0.64', analyticalMethod: 'HPLC-UV assay and related substances',
      observedLevel: '0.12', levelUnit: '%', maximumDailyDose: MDD, specificationLimit: 'NMT 0.30 %', routeOfAdministration: 'oral',
      batchesObserved: ['C2C201-DP-2503'], status: 'draft' },
    { scope: 'drug_substance', materialName: DS, impurityName: '2-Chloroethyl ethyl ether (PGI-1)', impurityType: 'mutagenic',
      origin: 'Alkylating reagent impurity carried from step 1', analyticalMethod: 'GC-MS, SIM (fictional method GC-201)',
      observedLevel: '12', levelUnit: 'ppm', maximumDailyDose: MDD, routeOfAdministration: 'oral',
      amesResult: 'not-tested', structuralAlert: 'yes', carcinogenicityData: 'not-tested', treatmentDuration: '1-to-12-months', cohortOfConcern: 'not_coc',
      controlStrategy: 'Option 1: tested in the drug substance at release', batchesObserved: ['C2C201-DS-2502'], status: 'draft' },
    { scope: 'drug_substance', materialName: DS, impurityName: 'SNAr regioisomer (Impurity C)', impurityType: 'mutagenic',
      origin: 'Minor regioisomer of the step-1 coupling', analyticalMethod: 'HPLC-UV assay and related substances',
      observedLevel: '0.05', levelUnit: '%', maximumDailyDose: MDD, routeOfAdministration: 'oral',
      amesResult: 'negative', structuralAlert: 'yes', carcinogenicityData: 'not-tested', treatmentDuration: '1-to-12-months', cohortOfConcern: 'not_coc',
      batchesObserved: ['C2C201-DS-2502'], status: 'draft' },
    { scope: 'drug_substance', materialName: DS, impurityName: 'Ethanol', impurityType: 'residual-solvent',
      origin: 'Crystallisation solvent, step 4', analyticalMethod: 'Headspace GC (fictional method GC-202)',
      observedLevel: '820', levelUnit: 'ppm', maximumDailyDose: MDD, routeOfAdministration: 'oral', batchesObserved: ['C2C201-DS-2502'], status: 'draft' },
    { scope: 'drug_substance', materialName: DS, impurityName: 'Palladium', impurityType: 'elemental',
      origin: 'Catalyst residue carried from the starting material supplier’s route', analyticalMethod: 'ICP-MS (fictional method ICP-201)',
      observedLevel: '3', levelUnit: 'ppm', maximumDailyDose: MDD, routeOfAdministration: 'oral', batchesObserved: ['C2C201-DS-2502'], status: 'draft' },
  ],
  dissolution: [
    { ...DISSOLUTION_METHOD, purpose: 'development', batchNumber: 'C2C201-DP-2503', testDateInDays: -150, status: 'reported',
      results: [point(10, 52, 4.1, 46, 59), point(15, 71, 3.6, 65, 76), point(20, 84, 2.9, 80, 88), point(30, 93, 1.8, 90, 96), point(45, 97, 1.2, 95, 99)] },
    { ...DISSOLUTION_METHOD, purpose: 'comparability', batchNumber: 'C2C201-DP-2601', comparisonBatch: 'C2C201-DP-2503', testDateInDays: -20, status: 'reported',
      results: [point(10, 48, 4.4, 41, 55), point(15, 68, 3.9, 62, 74), point(20, 82, 3.1, 77, 87), point(30, 92, 2.0, 89, 95), point(45, 97, 1.3, 94, 99)] },
  ],
  characterisation: [
    { scope: 'drug_substance', studyType: 'structural', studyTitle: 'C2C-201 structure elucidation', technique: '1H/13C NMR, HRMS, IR, single-crystal X-ray',
      attribute: 'Structure', result: 'Consistent with the proposed structure; absolute configuration confirmed by single-crystal X-ray',
      conclusion: 'Structure confirmed (fictional).', studyReference: 'CHAR-201-001', performedDateInDays: -240, status: 'draft' },
    { scope: 'drug_substance', studyType: 'physicochemical', studyTitle: 'C2C-201 solid-form screen', technique: 'XRPD, DSC, TGA, DVS',
      attribute: 'Polymorphic form', result: 'Form I anhydrate is the stable form at 25 °C; converts to a hemihydrate above 85 % RH',
      conclusion: 'Form I is manufactured and controlled by XRPD and water content.', studyReference: 'CHAR-201-002', performedDateInDays: -200, status: 'draft',
      supportingData: [{ label: 'Melting onset', value: '211', unit: '°C', note: 'DSC, 10 °C/min' }, { label: 'Water uptake at 80 % RH', value: '0.4', unit: '% w/w', note: 'DVS, 25 °C' }] },
  ],
  processes: [
    { processName: 'C2C-201 drug substance — four-step synthesis', processType: 'drug_substance', validationStatus: 'not-started', batchSize: '25 kg',
      processDescription: 'SNAr coupling of the pyrrolopyrimidine core, Boc deprotection, amide formation with cyclopropanecarbonyl chloride, crystallisation from ethanol/water to Form I.',
      processSteps: [
        { stepNumber: '1', unitOperation: 'SNAr coupling', description: 'Core + amine, DIPEA, NMP, 90 °C', equipment: 'R-201 500 L glass-lined reactor' },
        { stepNumber: '2', unitOperation: 'Boc deprotection', description: 'HCl in IPA, 40 °C', equipment: 'R-201' },
        { stepNumber: '3', unitOperation: 'Amide formation', description: 'Cyclopropanecarbonyl chloride, TEA, THF, 0–5 °C', equipment: 'R-202 250 L reactor' },
        { stepNumber: '4', unitOperation: 'Crystallisation', description: 'Ethanol/water, controlled cooling to 5 °C', equipment: 'CR-201 crystalliser', holdTime: '12 h' },
      ],
      criticalProcessParameters: [
        { parameter: 'Acyl chloride addition temperature', step: '3', target: '2', rangeLow: '0', rangeHigh: '5', unit: '°C', criticality: 'critical', linkedCqa: 'Impurity A' },
        { parameter: 'Cooling rate', step: '4', target: '10', rangeLow: '8', rangeHigh: '12', unit: '°C/h', criticality: 'critical', linkedCqa: 'Solid form' },
      ],
      processControls: [{ test: 'Step-3 conversion by HPLC', acceptanceCriteria: '≥ 99.0 %', samplingPoint: 'End of step 3', frequency: 'Every batch' }],
      equipmentList: [{ equipment: 'R-201', type: 'Glass-lined reactor', model: '500 L', qualificationStatus: 'IQ/OQ complete' }] },
    { processName: 'C2C-201 tablets 15 mg — dry granulation', processType: 'drug_product', validationStatus: 'not-started', batchSize: '250 kg',
      processDescription: 'Dry blend, roller compaction, milling, final blend with magnesium stearate, compression and film coating.',
      processSteps: [
        { stepNumber: '1', unitOperation: 'Blending', description: 'Bin blend, 20 min at 12 rpm', equipment: 'IBC blender 1000 L' },
        { stepNumber: '2', unitOperation: 'Roller compaction', description: 'Ribbon density target 0.9 g/cm³', equipment: 'Roller compactor RC-3' },
        { stepNumber: '3', unitOperation: 'Compression', description: '333 mg core, 9 mm round', equipment: 'Rotary press TP-36' },
        { stepNumber: '4', unitOperation: 'Film coating', description: 'Opadry II, 3 % weight gain', equipment: 'Pan coater PC-48' },
      ],
      criticalProcessParameters: [
        { parameter: 'Roll force', step: '2', target: '6', rangeLow: '5', rangeHigh: '7', unit: 'kN/cm', criticality: 'critical', linkedCqa: 'Dissolution' },
        { parameter: 'Compression force', step: '3', target: '12', rangeLow: '10', rangeHigh: '14', unit: 'kN', criticality: 'critical', linkedCqa: 'Dissolution' },
      ],
      processControls: [{ test: 'Tablet weight', acceptanceCriteria: '333 mg ± 5 %', samplingPoint: 'Compression', frequency: 'Every 15 minutes' }] },
  ],
  processValidation: [
    { processName: 'C2C-201 tablets 15 mg — process design (Stage 1)', stage: 'design', status: 'in-progress',
      batchNumbers: ['C2C201-DP-2503', 'C2C201-DP-2601'],
      criticalProcessParameters: { parameters: ['Roll force', 'Compression force', 'Coating weight gain'] },
      criticalQualityAttributes: { attributes: ['Assay', 'Dissolution', 'Content uniformity'] },
      controlStrategy: { summary: 'CPP ranges set from the development batches; PPQ follows before the NDA (fictional).' },
      validationProtocol: 'PV-PROT-201-01' },
  ],
  formulations: [
    { formulationName: 'C2C-201 tablets 15 mg — clinical formulation', version: '2.0', dosageForm: 'Film-coated tablet', strength: '15 mg', batchSize: '250 kg',
      theoreticalYield: '750,000 tablets', status: 'draft',
      formulationDevelopment: 'The Phase 1 capsule was replaced by a dry-granulated tablet for Phase 2; dissolution was bridged on the biobatch (fictional).',
      components: [
        { component: 'C2C-201', role: 'active', amountPerUnit: '15.0', unit: 'mg', percentWeight: '4.5', amountPerBatch: '11.25 kg', compendialReference: 'In-house' },
        { component: 'Microcrystalline cellulose', role: 'filler', amountPerUnit: '150.0', unit: 'mg', percentWeight: '45.0', amountPerBatch: '112.5 kg', compendialReference: 'NF / Ph. Eur.' },
        { component: 'Lactose monohydrate', role: 'filler', amountPerUnit: '150.0', unit: 'mg', percentWeight: '45.0', amountPerBatch: '112.5 kg', compendialReference: 'NF / Ph. Eur.', origin: 'animal' },
        { component: 'Croscarmellose sodium', role: 'disintegrant', amountPerUnit: '13.3', unit: 'mg', percentWeight: '4.0', amountPerBatch: '10.0 kg', compendialReference: 'NF / Ph. Eur.' },
        { component: 'Magnesium stearate', role: 'lubricant', amountPerUnit: '3.3', unit: 'mg', percentWeight: '1.0', amountPerBatch: '2.5 kg', compendialReference: 'NF / Ph. Eur.' },
        { component: 'Opadry II white', role: 'film coat', amountPerUnit: '10.0', unit: 'mg', amountPerBatch: '7.5 kg', compendialReference: 'Supplier specification' },
      ] },
  ],
  materials: [
    { materialRole: 'excipient', materialName: 'Microcrystalline cellulose (PH-102)', functionInFormulation: 'Filler', grade: 'PH-102', compendialMonograph: 'NF / Ph. Eur.',
      compendialCompliance: 'Complies', supplier: 'Fictional Cellulose Co.', origin: 'plant', novelExcipient: false, status: 'draft',
      testParameters: [{ test: 'Identification', method: 'NF', acceptanceCriteria: 'Conforms' }, { test: 'Loss on drying', method: 'NF', acceptanceCriteria: 'NMT 5.0 %' }] },
    { materialRole: 'excipient', materialName: 'Lactose monohydrate', functionInFormulation: 'Filler', grade: 'Spray-dried', compendialMonograph: 'NF / Ph. Eur.',
      compendialCompliance: 'Complies', supplier: 'Fictional Dairy Excipients', origin: 'animal', originDetail: 'Bovine milk from healthy animals, fit for human consumption',
      tseCertificate: 'Supplier TSE/BSE statement per EMA/410/01 rev.3 (fictional)', novelExcipient: false, status: 'draft' },
    { materialRole: 'excipient', materialName: 'Croscarmellose sodium', functionInFormulation: 'Disintegrant', compendialMonograph: 'NF / Ph. Eur.',
      compendialCompliance: 'Complies', supplier: 'Fictional Cellulose Co.', origin: 'plant', novelExcipient: false, status: 'draft' },
    { materialRole: 'excipient', materialName: 'Magnesium stearate', functionInFormulation: 'Lubricant', grade: 'Vegetable source', compendialMonograph: 'NF / Ph. Eur.',
      compendialCompliance: 'Complies', supplier: 'Fictional Oleochemicals', origin: 'plant', novelExcipient: false, status: 'draft' },
    { materialRole: 'coating', materialName: 'Opadry II white', functionInFormulation: 'Film coat', compendialMonograph: 'Components individually compendial',
      supplier: 'Fictional Coatings Ltd.', origin: 'synthetic', novelExcipient: false, status: 'draft' },
  ],
  containerClosures: [
    { scope: 'drug_product', systemName: 'HDPE bottle, 30 count, child-resistant', componentType: 'primary',
      containerDescription: '60 mL white round HDPE bottle', closureDescription: '33 mm child-resistant polypropylene cap with induction-seal liner; 1 g silica gel canister',
      compendialStandards: ['USP <661.1>', 'USP <661.2>', 'USP <671>'], supplier: 'Fictional Packaging Inc.',
      suitabilityJustification: 'Moisture protection shown by USP <671> and the 25 °C/60 % RH stability data; materials meet USP <661>.',
      materialsOfConstruction: [{ component: 'Bottle', material: 'HDPE', supplier: 'Fictional Packaging Inc.', specification: 'PKG-201-01', compendialReference: 'USP <661.1>' }],
      status: 'draft' },
    { scope: 'drug_substance', systemName: 'Double LDPE bag in fibre drum', componentType: 'primary',
      containerDescription: 'Two antistatic LDPE bags, each tied, with a desiccant between them', closureDescription: 'Fibre drum with a locking lid and tamper-evident seal',
      compendialStandards: ['USP <661.1>'], status: 'draft' },
  ],
  changes: [
    { changeNumber: 'CC-2026-014', changeType: 'supplier', description: 'Add a second supplier of magnesium stearate (vegetable source).',
      justification: 'Supply continuity; same grade and monograph, supplier qualified by audit (fictional).', riskAssessment: { level: 'low' },
      impactAssessment: { summary: 'Lubricant sensitivity assessed on two pilot blends; no dissolution change.', impactedSections: ['3.2.P.4', '3.2.P.3.3'] },
      status: 'under-review' },
    { changeNumber: 'CC-2026-019', changeType: 'facility', description: 'Move tablet compression from Building 3 to Building 4, same equipment class.',
      justification: 'Capacity for the Phase 2 supply; equipment of the same design and operating principle (fictional).', riskAssessment: { level: 'medium' },
      impactAssessment: { summary: 'Bridged by dissolution on C2C201-DP-2601 against the biobatch.', impactedSections: ['3.2.P.3.1', '3.2.P.3.3', '3.2.P.5.4'] },
      status: 'draft', implementationDateInDays: 45 },
  ],
  comparability: [
    { title: 'C2C-201 Phase 1 capsule to Phase 2 tablet bridging', type: 'process', product: DP,
      methods: ['Dissolution (USP <711>, apparatus 2)', 'HPLC-UV assay and related substances'], status: 'in-progress' },
  ],
};
