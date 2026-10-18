/** Browser-safe transport for the opt-in, read-only scientific catalog preview.
 * A passed check binds source text. It does not accept a fact or qualify science.
 */
export type CatalogFactCheckState = 'passed' | 'failed' | 'not_established';
export interface CatalogFactReason { code: string; path?: string; explanation: string }
export interface CatalogFactCheck { state: CatalogFactCheckState; reasons: CatalogFactReason[] }
export interface CatalogFactAnchor {
  documentId: string;
  contentHash: string;
  extractedTextSha256: string;
  range: { start: number; end: number };
  exactQuote: string;
}
export interface CatalogFactWitness { path: string; anchor: CatalogFactAnchor }
export type CatalogWrittenValue =
  | { kind: 'scalar' | 'range' | 'approximate'; asWritten: string; unitAsWritten: string | null }
  | { kind: 'bound'; asWritten: string; relation: '<' | '<=' | '>' | '>='; unitAsWritten: string | null }
  | { kind: 'identifier' | 'date' | 'text'; asWritten: string };

/** Serializable projection of the existing clinical engine's frame vocabulary.
 * It supplies no browser dependency on the server engine and adds no new slots.
 */
export type CatalogClinicalArm =
  | { kind: 'arm'; drug: string; dose?: string; label: string }
  | { kind: 'total' }
  | { kind: 'combined'; drug: string; doses: string; label: string }
  | { kind: 'ole'; key: string; label: string }
  | { kind: 'role'; role: 'test' | 'control' };
export interface CatalogClinicalFrame {
  study?: { kind: 'study'; aliases: string[] } | { kind: 'pool'; members: string[][] | null; cutoff?: string; name?: string; scope?: string };
  population?: { set: 'randomized' | 'treated' | 'itt' | 'fas' | 'mitt' | 'pp' | 'efficacy_evaluable' | 'pk' | 'screened' | 'enrolled'; allRandomized?: true; stated: boolean };
  arm?: CatalogClinicalArm;
  contrast?: { test?: CatalogClinicalArm; control?: CatalogClinicalArm; stated: boolean };
  measure: { family: 'n' | 'completed_study' | 'discontinued_study' | 'deaths' | 'incidence' | 'eair' | 'lab' | 'responder' | 'effect' | 'median' | 'arm_change' | 'baseline_mean' | 'exposure' | 'demographic'; key: Record<string, string> };
  scope: { subgroups: string[]; period?: string; softPeriod?: string; timepoint?: string; part?: string };
  analysis: { role?: 'primary' | 'final' | 'primary_or_final' | 'interim' | 'updated' | 'sensitivity' | 'supportive' | 'supplementary' | 'exploratory' | 'non_primary'; occasion?: string; cutoff?: string; model?: string; estimand?: string; imputation?: string; assessor?: 'bicr' | 'investigator'; method?: string };
  endpoint?: { id?: string; role?: string };
  scale?: string;
  unit?: string;
  ci?: { level: string; sided: 'two' | 'one'; sidedStated: boolean; kind: 'confidence' | 'credible'; method?: string };
  basis?: 'adverse_event' | 'adverse_reaction';
  causality?: 'all' | 'related' | 'unstated';
}
export type CatalogClinicalSlot = 'study' | 'population' | 'arm' | 'contrast' | 'measure' | 'endpoint' | 'timepoint' | 'period' | 'subgroup' | 'part' | 'analysis' | 'model' | 'estimand' | 'imputation' | 'assessor' | 'ci' | 'scale' | 'unit' | 'value';
export type CatalogClinicalMeaning = { kind: 'pharma_clinical'; component: 'count' | 'percent' | 'denominator' | 'estimate' | 'lower' | 'upper' | 'p'; productRef?: string } & (
  | { frameState: 'complete'; frame: CatalogClinicalFrame }
  | { frameState: 'incomplete'; partialFrame: Partial<CatalogClinicalFrame>; missing: CatalogClinicalSlot[] }
);
export interface CatalogCmcMeaning {
  kind: 'cmc_result'; property: 'assay' | 'impurity' | 'particle_size' | 'storage_condition' | 'retest_period';
  productRef: string | null; batchAsWritten: string | null; materialAsWritten: string | null;
  methodAsWritten: string | null; resultRole: 'measured_result' | 'specification_limit'; conditionAsWritten?: string;
}
export interface CatalogDeviceMeaning {
  kind: 'device_test'; property: 'bench_result' | 'acceptance_criterion'; deviceRef: string | null;
  configurationAsWritten: string | null; testMethodAsWritten: string | null; endpointAsWritten: string | null;
  resultRole: 'measured_result' | 'acceptance_criterion'; softwareVersionAsWritten?: string; testConditionAsWritten?: string;
}
export interface CatalogIvdDiagnosticMeaning {
  kind: 'ivd_diagnostic'; property: 'sensitivity' | 'specificity' | 'positive_agreement' | 'negative_agreement';
  assayRef: string | null; analyteAsWritten: string | null; specimenAsWritten: string | null;
  referenceAsWritten: string | null; referenceBasis: 'reference_standard' | 'comparison_method' | 'not_established';
  cutoffAsWritten: string | null; populationAsWritten: string | null; denominatorAsWritten: string | null;
  instrumentAsWritten?: string; reagentVersionAsWritten?: string; softwareVersionAsWritten?: string;
}
export interface CatalogIvdAnalyticalMeaning {
  kind: 'ivd_analytical'; property: 'lob' | 'lod' | 'loq' | 'repeatability_sd' | 'repeatability_cv' | 'within_lab_sd' | 'within_lab_cv';
  assayRef: string | null; analyteAsWritten: string | null; specimenAsWritten: string | null;
  methodAsWritten: string | null; designAsWritten: string | null; concentrationAsWritten?: string; lotAsWritten?: string; siteAsWritten?: string;
}
export type CatalogFactMeaning = CatalogClinicalMeaning | CatalogCmcMeaning | CatalogDeviceMeaning | CatalogIvdDiagnosticMeaning | CatalogIvdAnalyticalMeaning;
export interface CatalogFactCandidate {
  schemaVersion: 1;
  meaning: CatalogFactMeaning;
  value: CatalogWrittenValue;
  origin: { kind: 'source_statement'; valueAnchor: CatalogFactAnchor; witnesses: CatalogFactWitness[] };
  legacyPath?: string;
}
export interface CatalogFactSource {
  documentId: string; contentHash: string; extractedText: string | null; extractedTextSha256: string;
  extractionCaveat?: 'ocr' | 'unsupported_language_or_layout';
}
export interface CatalogFactVerification {
  /** Shape/source/transcription binding only. Context diagnostics may still fail. */
  ok: boolean;
  checkerRevision: string;
  candidateSha256: string | null;
  source: Pick<CatalogFactSource, 'documentId' | 'contentHash' | 'extractedTextSha256'>;
  transcription: CatalogFactCheck;
  context: CatalogFactCheck;
  scientificQualification: 'unassessed'; reviewState: 'not_recorded'; persisted: false;
}
export type CatalogFactBatchValidation =
  | { ok: true; candidates: CatalogFactCandidate[] }
  | { ok: false; code: 'INVALID_FACT_SCHEMA' | 'COMPUTATION_METHOD_UNAVAILABLE'; reasons: CatalogFactReason[] };
export interface LegacyCatalogVerificationScope {
  kind: 'legacy_value_presence'; context: 'not_recorded'; scientificQualification: 'unassessed';
}
export const LEGACY_CATALOG_VERIFICATION_SCOPE: Readonly<LegacyCatalogVerificationScope> = Object.freeze({
  kind: 'legacy_value_presence', context: 'not_recorded', scientificQualification: 'unassessed',
});

/** Structural tool schema. Cross-field offsets, witness paths, actual hashes
 * and serialized batch size are additionally checked by the canonical core.
 */
type Schema = Record<string, unknown>;
const factText: Schema = { type: 'string', minLength: 1, maxLength: 2_000, pattern: '\\S' };
const nullableFactText: Schema = { anyOf: [factText, { type: 'null' }] };
const choices = (...values: string[]): Schema => ({ type: 'string', enum: values });
const literal = (value: string | number | boolean): Schema => ({ const: value });
const structure = (required: Record<string, Schema>, optional: Record<string, Schema> = {}): Schema => ({
  type: 'object', properties: { ...required, ...optional }, required: Object.keys(required), additionalProperties: false,
});
const texts: Schema = { type: 'array', maxItems: 50, items: factText };
const bool: Schema = { type: 'boolean' };
const armSchema: Schema = { anyOf: [
  structure({ kind: literal('arm'), drug: factText, label: factText }, { dose: factText }),
  structure({ kind: literal('total') }),
  structure({ kind: literal('combined'), drug: factText, doses: factText, label: factText }),
  structure({ kind: literal('ole'), key: factText, label: factText }),
  structure({ kind: literal('role'), role: choices('test', 'control') }),
] };
const measureSchema = structure({
  family: choices('n', 'completed_study', 'discontinued_study', 'deaths', 'incidence', 'eair', 'lab', 'responder', 'effect', 'median', 'arm_change', 'baseline_mean', 'exposure', 'demographic'),
  key: { type: 'object', maxProperties: 20, propertyNames: factText, additionalProperties: factText },
});
const clinicalFrameProperties: Record<string, Schema> = {
  study: { anyOf: [structure({ kind: literal('study'), aliases: { ...texts, minItems: 1 } }), structure({ kind: literal('pool'), members: { anyOf: [{ type: 'null' }, { type: 'array', maxItems: 50, items: texts }] } }, { cutoff: factText, name: factText, scope: factText })] },
  arm: armSchema, measure: measureSchema,
  population: structure({ set: choices('randomized', 'treated', 'itt', 'fas', 'mitt', 'pp', 'efficacy_evaluable', 'pk', 'screened', 'enrolled'), stated: bool }, { allRandomized: literal(true) }),
  contrast: structure({ stated: bool }, { test: armSchema, control: armSchema }),
  scope: structure({ subgroups: texts }, { period: factText, softPeriod: factText, timepoint: factText, part: factText }),
  analysis: structure({}, { role: choices('primary', 'final', 'primary_or_final', 'interim', 'updated', 'sensitivity', 'supportive', 'supplementary', 'exploratory', 'non_primary'), occasion: factText, cutoff: factText, model: factText, estimand: factText, imputation: factText, assessor: choices('bicr', 'investigator'), method: factText }),
  endpoint: structure({}, { id: factText, role: factText }), scale: factText, unit: factText,
  ci: structure({ level: factText, sided: choices('one', 'two'), sidedStated: bool, kind: choices('confidence', 'credible') }, { method: factText }),
  basis: choices('adverse_event', 'adverse_reaction'), causality: choices('all', 'related', 'unstated'),
};
const completeFrame = { ...structure({}, clinicalFrameProperties), required: ['measure', 'scope', 'analysis'] };
const clinicalCommon = { kind: literal('pharma_clinical'), component: choices('count', 'percent', 'denominator', 'estimate', 'lower', 'upper', 'p') };
const meaningSchema: Schema = { anyOf: [
  structure({ ...clinicalCommon, frameState: literal('complete'), frame: completeFrame }, { productRef: factText }),
  structure({ ...clinicalCommon, frameState: literal('incomplete'), partialFrame: structure({}, clinicalFrameProperties), missing: { type: 'array', minItems: 1, maxItems: 19, items: choices('study', 'population', 'arm', 'contrast', 'measure', 'endpoint', 'timepoint', 'period', 'subgroup', 'part', 'analysis', 'model', 'estimand', 'imputation', 'assessor', 'ci', 'scale', 'unit', 'value') } }, { productRef: factText }),
  structure({ kind: literal('cmc_result'), property: choices('assay', 'impurity', 'particle_size', 'storage_condition', 'retest_period'), productRef: nullableFactText, batchAsWritten: nullableFactText, materialAsWritten: nullableFactText, methodAsWritten: nullableFactText, resultRole: choices('measured_result', 'specification_limit') }, { conditionAsWritten: factText }),
  structure({ kind: literal('device_test'), property: choices('bench_result', 'acceptance_criterion'), deviceRef: nullableFactText, configurationAsWritten: nullableFactText, testMethodAsWritten: nullableFactText, endpointAsWritten: nullableFactText, resultRole: choices('measured_result', 'acceptance_criterion') }, { softwareVersionAsWritten: factText, testConditionAsWritten: factText }),
  structure({ kind: literal('ivd_diagnostic'), property: choices('sensitivity', 'specificity', 'positive_agreement', 'negative_agreement'), assayRef: nullableFactText, analyteAsWritten: nullableFactText, specimenAsWritten: nullableFactText, referenceAsWritten: nullableFactText, referenceBasis: choices('reference_standard', 'comparison_method', 'not_established'), cutoffAsWritten: nullableFactText, populationAsWritten: nullableFactText, denominatorAsWritten: nullableFactText }, { instrumentAsWritten: factText, reagentVersionAsWritten: factText, softwareVersionAsWritten: factText }),
  structure({ kind: literal('ivd_analytical'), property: choices('lob', 'lod', 'loq', 'repeatability_sd', 'repeatability_cv', 'within_lab_sd', 'within_lab_cv'), assayRef: nullableFactText, analyteAsWritten: nullableFactText, specimenAsWritten: nullableFactText, methodAsWritten: nullableFactText, designAsWritten: nullableFactText }, { concentrationAsWritten: factText, lotAsWritten: factText, siteAsWritten: factText }),
] };
const valueSchema: Schema = { anyOf: [
  structure({ kind: choices('scalar', 'range', 'approximate'), asWritten: factText, unitAsWritten: nullableFactText }),
  structure({ kind: literal('bound'), asWritten: factText, relation: choices('<', '<=', '>', '>='), unitAsWritten: nullableFactText }),
  structure({ kind: choices('identifier', 'date', 'text'), asWritten: factText }),
] };
const anchorSchema = structure({
  documentId: { type: 'string', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' },
  contentHash: { type: 'string', pattern: '^[0-9a-f]{64}$' }, extractedTextSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
  range: structure({ start: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER }, end: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER } }), exactQuote: factText,
});
export const CATALOG_FACT_CANDIDATE_JSON_SCHEMA: Schema = structure({
  schemaVersion: literal(1), meaning: meaningSchema, value: valueSchema,
  origin: structure({ kind: literal('source_statement'), valueAnchor: anchorSchema, witnesses: { type: 'array', maxItems: 20, items: structure({ path: factText, anchor: anchorSchema }) } }),
}, { legacyPath: factText });
