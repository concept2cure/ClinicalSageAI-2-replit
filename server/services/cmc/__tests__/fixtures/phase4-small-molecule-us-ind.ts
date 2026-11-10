/**
 * The named fixture programme the §11 build order's phase 4 is accepted
 * against: one small-molecule US IND, with its CMC registers recorded as the
 * product records them.
 *
 * ## Why a fixture, and why this one
 *
 * Phase 4's acceptance clause asks that "fixture batch/stability tables match
 * expected cells" and that "OOS is explicitly flagged"
 * (`docs/design/ONE_DESIGN_PLAN.md` §11 table). The engines are unit-tested a
 * case at a time; what was missing is one programme whose recorded data is
 * fixed, composed through the real engine, with every cell of the two
 * quantitative tables written down. A per-case test says a rule holds; this
 * says what the product files.
 *
 * It is deliberately a SMALL-MOLECULE US IND, because that is the composition
 * boundary this platform ships (P-28, `services/cmc/composition-scope.ts`).
 * `PHASE4_BIOLOGIC_SUBSTANCE` is the same programme with a biologic substance,
 * so the acceptance run also shows the boundary refusing by name rather than
 * composing something it must not.
 *
 * ## What is recorded, and what each record is for
 *
 * - a drug substance and a drug product, so §3.2.S.1 and §3.2.P.1 compose;
 * - one specification and one analytical method, which §3.2.S.4 and §3.2.P.5
 *   both read — the record that proves the 2.3 and the 3.2 cite ONE method;
 * - four QC results: a clean substance pass, a substance result recorded as
 *   `pass` whose own criterion it FAILS, a product result with no recorded
 *   disposition that is outside its criterion, and a reference-standard
 *   qualification that is not batch evidence at all;
 * - two stability studies, one per side, each with an in-criterion point and
 *   one outside it.
 *
 * Every expected table in this file was read cell by cell against the register
 * payload beside it. They are the acceptance statement, not a snapshot: a cell
 * that changes is a change to what this product would file, and must be read
 * and re-stated deliberately.
 *
 * ## Each record is written the way the register writes it
 *
 * The payloads are produced by the REAL write-through mappers
 * (`services/cmc-write-through.ts`), from register rows of the shape those
 * mappers receive — not hand-written canonical payloads. A hand-written one
 * drifts from the register the moment a mapper changes a key, and then the
 * acceptance fixture passes on data the product cannot produce. §3.2.S.7's own
 * required fields are an example: a drug-substance study satisfies them with
 * `drugSubstanceTimePoints` and `drugSubstanceStorageCondition`, which only
 * `mapStabilityPayload` knows to emit, and only for a study whose recorded
 * scope covers that side.
 *
 * @module server/services/cmc/__tests__/fixtures/phase4-small-molecule-us-ind
 */
import {
  mapAnalyticalMethodPayload,
  mapDrugProductPayload,
  mapDrugSubstancePayload,
  mapQcTestingPayload,
  mapSpecificationPayload,
  mapStabilityPayload,
} from '../../../cmc-write-through';

/** A canonical source as the compile engine receives it. */
export interface FixtureSource {
  id: string;
  sourceType: string;
  sourcePayload: Record<string, unknown>;
  sourceHash: string;
}

const source = (id: string, sourceType: string, sourcePayload: Record<string, unknown>): FixtureSource => ({
  id,
  sourceType,
  sourcePayload,
  sourceHash: `hash-${id}`,
});

export const PHASE4_PROGRAM = {
  /** What it files; the composition boundary admits exactly this. */
  application: 'us_ind' as const,
  substanceName: 'CSX-114',
  productName: 'CSX-114 25 mg tablet',
};

export const PHASE4_DRUG_SUBSTANCE = source('src-substance', 'drug_substance', mapDrugSubstancePayload({
  substanceName: PHASE4_PROGRAM.substanceName,
  manufacturer: 'Concept2Cure Chemical Operations',
  manufacturingRoute: 'Three-step synthesis from CSX-001; isolation by crystallisation from ethanol/water.',
  modality: 'small_molecule',
}));

export const PHASE4_DRUG_PRODUCT = source('src-product', 'drug_product', mapDrugProductPayload({
  productName: PHASE4_PROGRAM.productName,
  dosageForm: 'immediate-release tablet',
  strength: '25 mg',
  composition: 'CSX-114 25 mg, microcrystalline cellulose 120 mg, magnesium stearate 1.5 mg',
}));

/**
 * TWO specifications, because the registers hold two: §3.2.P.5's release
 * criteria are produced only by a DRUG PRODUCT spec (`mapSpecificationPayload`
 * refuses to emit them for a substance spec, so a substance's limits can never
 * render under the product's release label).
 */
export const PHASE4_SPECIFICATION_SUBSTANCE = source('src-specification-ds', 'specification', mapSpecificationPayload({
  materialType: 'drug_substance',
  materialName: PHASE4_PROGRAM.substanceName,
  acceptanceCriteria: { assay: '95.0 - 105.0 %', 'total impurities': 'NMT 1.0 %' },
  testMethods: { method: 'HPLC-UV assay (AM-114)' },
}));

export const PHASE4_SPECIFICATION_PRODUCT = source('src-specification-dp', 'specification', mapSpecificationPayload({
  materialType: 'drug_product',
  materialName: PHASE4_PROGRAM.productName,
  acceptanceCriteria: { release: '95.0 - 105.0 %', shelf: '93.0 - 107.0 %' },
  testMethods: { method: 'HPLC-UV assay (AM-114)' },
}));

/** The ONE analytical procedure both §3.2.S.4 and §3.2.P.5 read. */
export const PHASE4_METHOD = source('src-method', 'method', mapAnalyticalMethodPayload({
  methodName: 'HPLC-UV assay (AM-114)',
  technique: 'HPLC-UV',
  validationStatus: 'validated',
  validationDate: '2026-07-14T00:00:00.000Z',
}));

/** A substance release result that meets its criterion. */
export const PHASE4_QC_SUBSTANCE_PASS = source('src-qc-ds-pass', 'qc_result', mapQcTestingPayload({
  sampleId: 'DS-2601-A',
  batchNumber: 'DS-2601-A',
  sampleType: 'in-process',
  testMethod: 'HPLC-UV assay (AM-114)',
  testResults: { value: '99.4', unit: '%' },
  specifications: { acceptanceCriteria: '95.0 - 105.0 %' },
  passFailStatus: 'pass',
  reviewedBy: 11,
}));

/**
 * A substance result RECORDED as a pass whose own acceptance criterion it
 * fails. The register stores the analyst's disposition; the composed table must
 * state the contradiction rather than print "pass".
 */
export const PHASE4_QC_SUBSTANCE_DECLARED_PASS_OOS = source('src-qc-ds-oos', 'qc_result', mapQcTestingPayload({
  sampleId: 'DS-2601-B',
  batchNumber: 'DS-2601-B',
  sampleType: 'in-process',
  testMethod: 'HPLC-UV assay (AM-114)',
  testResults: { value: '91.8', unit: '%', observation: 'repeat requested' },
  specifications: { acceptanceCriteria: '95.0 - 105.0 %' },
  passFailStatus: 'pass',
  reviewedBy: 11,
}));

/** A product result with no disposition recorded, outside its criterion. */
export const PHASE4_QC_PRODUCT_PENDING_OOS = source('src-qc-dp-oos', 'qc_result', mapQcTestingPayload({
  sampleId: 'DP-2602-A',
  batchNumber: 'DP-2602-A',
  sampleType: 'finished-product',
  testMethod: 'HPLC-UV assay (AM-114)',
  testResults: { value: '106.9', unit: '%' },
  specifications: { acceptanceCriteria: '95.0 - 105.0 %' },
  passFailStatus: 'pending',
  reviewedBy: null,
}));

/** Not batch evidence at all: a reference-standard qualification. */
export const PHASE4_QC_REFERENCE_STANDARD = source('src-qc-refstd', 'qc_result', mapQcTestingPayload({
  sampleId: 'RS-114-02',
  sampleType: 'reference-standard',
  testMethod: 'HPLC-UV assay (AM-114)',
  testResults: { value: '99.9', unit: '%' },
  specifications: { acceptanceCriteria: '98.0 - 102.0 %' },
  passFailStatus: 'pass',
  reviewedBy: 11,
}));

export const PHASE4_STABILITY_SUBSTANCE = source('src-stability-ds', 'stability', mapStabilityPayload({
  studyName: 'CSX-114 DS long-term',
  scope: 'drug_substance',
  storageCondition: '25C/60%RH',
  batchesStudied: ['DS-2601-A'],
  timePoints: ['0', '6', '12'],
  testParameters: ['assay'],
  shelfLifeClaim: '12 months retest',
  results: [
    { timePoint: '0', parameter: 'assay', result: '99.4', specification: '95.0 - 105.0 %' },
    { timePoint: '6', parameter: 'assay', result: '97.2', specification: '95.0 - 105.0 %' },
    { timePoint: '12', parameter: 'assay', result: '94.1', specification: '95.0 - 105.0 %' },
  ],
}));

export const PHASE4_STABILITY_PRODUCT = source('src-stability-dp', 'stability', mapStabilityPayload({
  studyName: 'CSX-114 DP long-term',
  scope: 'drug_product',
  storageCondition: '25C/60%RH',
  batchesStudied: ['DP-2602-A'],
  timePoints: ['0', '6'],
  testParameters: ['total impurities'],
  shelfLifeClaim: '24 months',
  containerClosure: 'HDPE bottle, 30 count',
  results: [
    { timePoint: '0', parameter: 'total impurities', result: '0.21', specification: 'NMT 1.0 %' },
    { timePoint: '6', parameter: 'total impurities', result: '1.14', specification: 'NMT 1.0 %' },
  ],
}));

/** The programme's recorded CMC data, in the order the registers hold it. */
export const PHASE4_SOURCES: FixtureSource[] = [
  PHASE4_DRUG_SUBSTANCE,
  PHASE4_DRUG_PRODUCT,
  PHASE4_SPECIFICATION_SUBSTANCE,
  PHASE4_SPECIFICATION_PRODUCT,
  PHASE4_METHOD,
  PHASE4_QC_SUBSTANCE_PASS,
  PHASE4_QC_SUBSTANCE_DECLARED_PASS_OOS,
  PHASE4_QC_PRODUCT_PENDING_OOS,
  PHASE4_QC_REFERENCE_STANDARD,
  PHASE4_STABILITY_SUBSTANCE,
  PHASE4_STABILITY_PRODUCT,
];

/** The same programme with a biologic substance: outside the shipped boundary. */
export const PHASE4_BIOLOGIC_SUBSTANCE = source('src-substance-biologic', 'drug_substance', mapDrugSubstancePayload({
  substanceName: 'CSX-114mAb',
  manufacturer: 'Concept2Cure Biologics',
  modality: 'monoclonal_antibody',
}));
