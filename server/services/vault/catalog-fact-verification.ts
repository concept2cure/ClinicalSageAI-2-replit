/** Deterministic, read-only source-binding preview. No persistence or approval. */
import { createHash } from 'node:crypto';
import { extractClaims, readNumber } from '../truth-engine/clinical-claims.js';
import type { ClaimFrame } from '../truth-engine/clinical-claims.js';
import { verifyKeyDataAgainstText } from './document-catalog-core.js';
import type {
  CatalogFactAnchor, CatalogFactBatchValidation, CatalogFactCandidate, CatalogFactCheck,
  CatalogFactMeaning, CatalogFactReason, CatalogFactSource, CatalogFactVerification, CatalogWrittenValue,
} from '../../../shared/ana/catalog-facts.js';

export const CATALOG_FACT_CHECKER_REVISION = 'catalog-source-fact-preview:v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/;
const MAX_TEXT_FIELD = 2_000;
const reason = (code: string, path: string, explanation: string): CatalogFactReason => ({ code, path, explanation });
const check = (state: CatalogFactCheck['state'], reasons: CatalogFactReason[] = []): CatalogFactCheck => ({ state, reasons });
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= MAX_TEXT_FIELD;
const hash = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (plain(v)) return `{${Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

type Rule = (v: unknown) => boolean;
const oneOf = (...values: string[]): Rule => v => typeof v === 'string' && values.includes(v);
const nullableText: Rule = v => v === null || text(v);
const strings: Rule = v => Array.isArray(v) && v.length <= 50 && v.every(text);
function object(v: unknown, required: Record<string, Rule>, optional: Record<string, Rule> = {}): boolean {
  return plain(v) && Object.keys(v).every(k => Object.hasOwn(required, k) || Object.hasOwn(optional, k)) &&
    Object.entries(required).every(([k, rule]) => Object.hasOwn(v, k) && rule(v[k])) &&
    Object.entries(optional).every(([k, rule]) => !Object.hasOwn(v, k) || rule(v[k]));
}
const boolean: Rule = v => typeof v === 'boolean';
const arm: Rule = v => {
  if (!plain(v)) return false;
  switch (v.kind) {
    case 'arm': return object(v, { kind: oneOf('arm'), drug: text, label: text }, { dose: text });
    case 'total': return object(v, { kind: oneOf('total') });
    case 'combined': return object(v, { kind: oneOf('combined'), drug: text, doses: text, label: text });
    case 'ole': return object(v, { kind: oneOf('ole'), key: text, label: text });
    case 'role': return object(v, { kind: oneOf('role'), role: oneOf('test', 'control') });
    default: return false;
  }
};
const study: Rule = v => plain(v) && (v.kind === 'study'
  ? object(v, { kind: oneOf('study'), aliases: v => strings(v) && (v as string[]).length > 0 })
  : object(v, { kind: oneOf('pool'), members: v => v === null || (Array.isArray(v) && v.length <= 50 && v.every(strings)) }, { cutoff: text, name: text, scope: text }));
const measure: Rule = v => object(v, {
  family: oneOf('n', 'completed_study', 'discontinued_study', 'deaths', 'incidence', 'eair', 'lab', 'responder', 'effect', 'median', 'arm_change', 'baseline_mean', 'exposure', 'demographic'),
  key: v => plain(v) && Object.keys(v).length <= 20 && Object.entries(v).every(([k, val]) => text(k) && text(val)),
});
const frameRules: Record<string, Rule> = {
  study, arm, measure,
  population: v => object(v, { set: oneOf('randomized', 'treated', 'itt', 'fas', 'mitt', 'pp', 'efficacy_evaluable', 'pk', 'screened', 'enrolled'), stated: boolean }, { allRandomized: v => v === true }),
  contrast: v => object(v, { stated: boolean }, { test: arm, control: arm }),
  scope: v => object(v, { subgroups: strings }, { period: text, softPeriod: text, timepoint: text, part: text }),
  analysis: v => object(v, {}, { role: oneOf('primary', 'final', 'primary_or_final', 'interim', 'updated', 'sensitivity', 'supportive', 'supplementary', 'exploratory', 'non_primary'), occasion: text, cutoff: text, model: text, estimand: text, imputation: text, assessor: oneOf('bicr', 'investigator'), method: text }),
  endpoint: v => object(v, {}, { id: text, role: text }),
  ci: v => object(v, { level: text, sided: oneOf('one', 'two'), sidedStated: boolean, kind: oneOf('confidence', 'credible') }, { method: text }),
  scale: text, unit: text, basis: oneOf('adverse_event', 'adverse_reaction'), causality: oneOf('all', 'related', 'unstated'),
};
const clinicalSlots = ['study', 'population', 'arm', 'contrast', 'measure', 'endpoint', 'timepoint', 'period', 'subgroup', 'part', 'analysis', 'model', 'estimand', 'imputation', 'assessor', 'ci', 'scale', 'unit', 'value'];
const frame = (partial: boolean): Rule => v => {
  const optional = { ...frameRules };
  if (partial) return object(v, {}, optional);
  delete optional.measure; delete optional.scope; delete optional.analysis;
  return object(v, { measure, scope: frameRules.scope, analysis: frameRules.analysis }, optional);
};
interface FamilyRules { required: Record<string, Rule>; optional: Record<string, Rule>; labels: Record<string, string[]> }
const families: Record<string, FamilyRules> = {
  cmc_result: {
    required: { property: oneOf('assay', 'impurity', 'particle_size', 'storage_condition', 'retest_period'), productRef: nullableText, batchAsWritten: nullableText, materialAsWritten: nullableText, methodAsWritten: nullableText, resultRole: oneOf('measured_result', 'specification_limit') },
    optional: { conditionAsWritten: text },
    labels: { productRef: ['product'], batchAsWritten: ['batch', 'lot'], materialAsWritten: ['material'], methodAsWritten: ['method'], resultRole: ['result role', 'role'], conditionAsWritten: ['condition'] },
  },
  device_test: {
    required: { property: oneOf('bench_result', 'acceptance_criterion'), deviceRef: nullableText, configurationAsWritten: nullableText, testMethodAsWritten: nullableText, endpointAsWritten: nullableText, resultRole: oneOf('measured_result', 'acceptance_criterion') },
    optional: { softwareVersionAsWritten: text, testConditionAsWritten: text },
    labels: { deviceRef: ['device'], configurationAsWritten: ['configuration'], testMethodAsWritten: ['method', 'test method'], endpointAsWritten: ['endpoint'], resultRole: ['result role', 'role'], softwareVersionAsWritten: ['software version', 'firmware'], testConditionAsWritten: ['test condition', 'condition'] },
  },
  ivd_diagnostic: {
    required: { property: oneOf('sensitivity', 'specificity', 'positive_agreement', 'negative_agreement'), assayRef: nullableText, analyteAsWritten: nullableText, specimenAsWritten: nullableText, referenceAsWritten: nullableText, referenceBasis: oneOf('reference_standard', 'comparison_method', 'not_established'), cutoffAsWritten: nullableText, populationAsWritten: nullableText, denominatorAsWritten: nullableText },
    optional: { instrumentAsWritten: text, reagentVersionAsWritten: text, softwareVersionAsWritten: text },
    labels: { assayRef: ['assay'], analyteAsWritten: ['analyte'], specimenAsWritten: ['specimen', 'matrix'], referenceAsWritten: ['reference'], referenceBasis: ['reference basis'], cutoffAsWritten: ['cutoff'], populationAsWritten: ['population'], denominatorAsWritten: ['denominator'], instrumentAsWritten: ['instrument'], reagentVersionAsWritten: ['reagent version'], softwareVersionAsWritten: ['software version'] },
  },
  ivd_analytical: {
    required: { property: oneOf('lob', 'lod', 'loq', 'repeatability_sd', 'repeatability_cv', 'within_lab_sd', 'within_lab_cv'), assayRef: nullableText, analyteAsWritten: nullableText, specimenAsWritten: nullableText, methodAsWritten: nullableText, designAsWritten: nullableText },
    optional: { concentrationAsWritten: text, lotAsWritten: text, siteAsWritten: text },
    labels: { assayRef: ['assay'], analyteAsWritten: ['analyte'], specimenAsWritten: ['specimen', 'matrix'], methodAsWritten: ['method'], designAsWritten: ['design'], concentrationAsWritten: ['concentration'], lotAsWritten: ['lot'], siteAsWritten: ['site'] },
  },
};
function validMeaning(v: unknown): v is CatalogFactMeaning {
  if (!plain(v)) return false;
  if (v.kind === 'pharma_clinical') {
    const common = { kind: oneOf('pharma_clinical'), component: oneOf('count', 'percent', 'denominator', 'estimate', 'lower', 'upper', 'p') };
    return v.frameState === 'complete'
      ? object(v, { ...common, frameState: oneOf('complete'), frame: frame(false) }, { productRef: text })
      : object(v, { ...common, frameState: oneOf('incomplete'), partialFrame: frame(true), missing: v => Array.isArray(v) && v.length > 0 && v.length <= clinicalSlots.length && v.every(oneOf(...clinicalSlots)) }, { productRef: text });
  }
  if (typeof v.kind !== 'string' || !Object.hasOwn(families, v.kind)) return false;
  const rules = families[v.kind];
  return !!rules && object(v, { kind: oneOf(String(v.kind)), ...rules.required }, rules.optional);
}
function validAnchor(v: unknown): v is CatalogFactAnchor {
  return object(v, {
    documentId: v => typeof v === 'string' && UUID.test(v),
    contentHash: v => typeof v === 'string' && SHA.test(v),
    extractedTextSha256: v => typeof v === 'string' && SHA.test(v),
    range: v => object(v, { start: v => Number.isSafeInteger(v) && (v as number) >= 0, end: v => Number.isSafeInteger(v) && (v as number) >= 0 }) && (v as { end: number; start: number }).end > (v as { start: number }).start,
    exactQuote: text,
  });
}
function validValue(v: unknown): boolean {
  if (!plain(v)) return false;
  if (['identifier', 'date', 'text'].includes(String(v.kind))) return object(v, { kind: oneOf('identifier', 'date', 'text'), asWritten: text });
  if (v.kind === 'bound') return object(v, { kind: oneOf('bound'), asWritten: text, relation: oneOf('<', '<=', '>', '>='), unitAsWritten: nullableText });
  return object(v, { kind: oneOf('scalar', 'range', 'approximate'), asWritten: text, unitAsWritten: nullableText });
}
function witnessPaths(meaning: CatalogFactMeaning): string[] {
  if (meaning.kind === 'pharma_clinical') return ['meaning.productRef', ...Object.keys(frameRules).map(k => `meaning.${meaning.frameState === 'complete' ? 'frame' : 'partialFrame'}.${k}`)];
  const rules = families[meaning.kind];
  return [...Object.keys(rules.required), ...Object.keys(rules.optional)].map(k => `meaning.${k}`);
}
function validateCandidate(v: unknown, path: string): CatalogFactReason[] {
  if (!plain(v)) return [reason('INVALID_FACT_SCHEMA', path, 'A fact candidate must be a plain JSON object.')];
  if (plain(v.origin) && v.origin.kind === 'deterministic_computation') return [reason('COMPUTATION_METHOD_UNAVAILABLE', `${path}.origin`, 'Computation-backed facts are not supported by this preview.')];
  if (!object(v, { schemaVersion: v => v === 1, meaning: validMeaning, value: validValue, origin: v => object(v, {
    kind: oneOf('source_statement'), valueAnchor: validAnchor,
    witnesses: v => Array.isArray(v) && v.length <= 20 && v.every(w => object(w, { path: text, anchor: validAnchor })),
  }) }, { legacyPath: text })) return [reason('INVALID_FACT_SCHEMA', path, 'The candidate contains an unsupported field, type, discriminant or limit.')];
  const c = v as unknown as CatalogFactCandidate;
  const allowed = witnessPaths(c.meaning);
  const seen = new Set<string>();
  for (const w of c.origin.witnesses) {
    if (!allowed.includes(w.path) || seen.has(w.path)) return [reason('INVALID_WITNESS_PATH', `${path}.origin.witnesses`, 'Witness paths must identify distinct supported semantic fields.')];
    seen.add(w.path);
  }
  return [];
}

export function validateSourceFactBatch(input: unknown): CatalogFactBatchValidation {
  if (!Array.isArray(input) || input.length < 1 || input.length > 50) return { ok: false, code: 'INVALID_FACT_SCHEMA', reasons: [reason('FACT_BATCH_LIMIT', 'fact_candidates', 'Provide between 1 and 50 candidates.')] };
  try {
    if (JSON.stringify(input).length > 100_000) return { ok: false, code: 'INVALID_FACT_SCHEMA', reasons: [reason('FACT_BATCH_LIMIT', 'fact_candidates', 'The serialized batch exceeds 100,000 characters.')] };
  } catch {
    return { ok: false, code: 'INVALID_FACT_SCHEMA', reasons: [reason('INVALID_FACT_SCHEMA', 'fact_candidates', 'The batch must be serializable JSON.')] };
  }
  const reasons = input.flatMap((v, i) => validateCandidate(v, `fact_candidates[${i}]`));
  if (reasons.length) return { ok: false, code: reasons.some(r => r.code === 'COMPUTATION_METHOD_UNAVAILABLE') ? 'COMPUTATION_METHOD_UNAVAILABLE' : 'INVALID_FACT_SCHEMA', reasons };
  // Private JSON copy: a caller cannot mutate the candidate after validation.
  return { ok: true, candidates: JSON.parse(JSON.stringify(input)) as CatalogFactCandidate[] };
}

function anchorProblems(anchor: CatalogFactAnchor, source: CatalogFactSource, path: string): CatalogFactReason[] {
  if (anchor.documentId.toLowerCase() !== source.documentId.toLowerCase() || anchor.contentHash !== source.contentHash || anchor.extractedTextSha256 !== source.extractedTextSha256)
    return [reason('SOURCE_IDENTITY_MISMATCH', path, 'The anchor does not identify this exact source and extraction.')];
  if (anchor.range.end > (source.extractedText?.length ?? 0)) return [reason('ANCHOR_OUT_OF_RANGE', path, 'The anchor exceeds the exact stored text.')];
  if (source.extractedText?.slice(anchor.range.start, anchor.range.end) !== anchor.exactQuote) return [reason('ANCHOR_QUOTE_MISMATCH', path, 'The exact quote does not match the stored text at these offsets.')];
  return [];
}
const norm = (v: string): string => v.normalize('NFKC').replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
const semantic = (v: string): string => norm(v).replace(/_/g, ' ');
type NumericValue = Exclude<CatalogWrittenValue, { kind: 'identifier' | 'date' | 'text' }>;
function numericText(v: NumericValue): string {
  return v.unitAsWritten && norm(v.asWritten).endsWith(norm(v.unitAsWritten))
    ? v.asWritten.slice(0, v.asWritten.length - v.unitAsWritten.length).trim() : v.asWritten;
}
function boundProblem(v: Extract<NumericValue, { kind: 'bound' }>, parsed: ReturnType<typeof readNumber>): CatalogFactReason[] {
  const parsedOp = parsed?.op === '≤' ? '<=' : parsed?.op === '≥' ? '>=' : parsed?.op;
  return parsed?.kind === 'bound' && parsedOp === v.relation ? [] : [reason('VALUE_KIND_MISMATCH', 'value.relation', 'The bound relation must be preserved as written.')];
}
function scalarOccurrenceProblem(before: string, after: string): CatalogFactReason[] {
  // Inspect the stated result itself, including the qualifier before the digits.
  // The lexical legacy check intentionally permits a figure inside a bound.
  const boundedPrefix = /(?:(?:<=|>=|[<>≤≥])\s*|(?:less than|more than|at least|at most|up to|under|over|below|above)\s*)$/i.test(before);
  const approximatePrefix = /(?:[~≈]\s*|(?:approximately|about|around|nearly|ca\.)\s*)$/i.test(before);
  if (boundedPrefix || approximatePrefix)
    return [reason('VALUE_KIND_MISMATCH', 'value.kind', 'A bound or approximation cannot be reported as an exact scalar.')];
  if (/^\s*(?:-|to\b)\s*[-+]?\d/i.test(after) || /\d\s*(?:-|to)\s*$/i.test(before))
    return [reason('VALUE_KIND_MISMATCH', 'value.kind', 'A range endpoint cannot be reported as an exact scalar.')];
  return [];
}
function scalarResultAnchor(c: CatalogFactCandidate): Pick<CatalogFactAnchor, 'exactQuote' | 'range'> {
  const a = c.origin.valueAnchor;
  if (c.meaning.kind === 'pharma_clinical' || !sourceRow(c)) return a;
  const property = semantic(c.meaning.property);
  const selected: Array<Pick<CatalogFactAnchor, 'exactQuote' | 'range'>> = [];
  let start = a.range.start;
  for (const part of a.exactQuote.split(';')) {
    const match = /^\s*([A-Za-z][A-Za-z _-]*):/.exec(part);
    if (match && [property, 'value', 'result'].includes(semantic(match[1]))) selected.push({ exactQuote: part, range: { start, end: start + part.length } });
    start += part.length + 1;
  }
  return selected.length === 1 ? selected[0] : a;
}
function scalarProblems(v: NumericValue, c: CatalogFactCandidate, source: CatalogFactSource, parsed: ReturnType<typeof readNumber>): CatalogFactReason[] {
  if (!parsed) return [reason('UNSUPPORTED_SCALAR_VALUE', 'value.asWritten', 'An exact scalar requires a supported source-written numeric form.')];
  if (parsed.kind !== 'exact') return [reason('VALUE_KIND_MISMATCH', 'value.kind', 'A bound or approximation cannot be reported as an exact scalar.')];
  const a = scalarResultAnchor(c);
  const comparable = norm(a.exactQuote), needle = norm(v.asWritten);
  const prefix = norm(source.extractedText!.slice(Math.max(0, a.range.start - 40), a.range.start));
  const suffix = norm(source.extractedText!.slice(a.range.end, a.range.end + 40));
  for (let at = comparable.indexOf(needle); at >= 0; at = comparable.indexOf(needle, at + 1)) {
    // Check the named result's occurrences. An unrelated cutoff cannot
    // establish or invalidate its kind; source adjacency still catches clips.
    const before = prefix + comparable.slice(0, at);
    const after = comparable.slice(at + needle.length) + suffix;
    const problems = scalarOccurrenceProblem(before, after);
    if (problems.length) return problems;
  }
  return [];
}
function numericProblems(v: NumericValue, c: CatalogFactCandidate, source: CatalogFactSource): CatalogFactReason[] {
  const asWritten = numericText(v);
  const parsed = readNumber(asWritten);
  if (v.kind === 'scalar') return scalarProblems(v, c, source, parsed);
  if (v.kind === 'bound') return boundProblem(v, parsed);
  if (v.kind === 'approximate' && parsed?.kind !== 'approximate') return [reason('VALUE_KIND_MISMATCH', 'value.kind', 'The source value does not establish an approximation.')];
  if (v.kind === 'range' && !/^[-+]?\d+(?:\.\d+)?\s*(?:[-–—]|to)\s*[-+]?\d+(?:\.\d+)?$/i.test(asWritten)) return [reason('VALUE_KIND_MISMATCH', 'value.kind', 'The source value does not establish a supported numeric range.')];
  return [];
}
function writtenProblems(c: CatalogFactCandidate, source: CatalogFactSource): CatalogFactReason[] {
  const v = c.value;
  const quote = c.origin.valueAnchor.exactQuote;
  // Adjacent CJK particles permit literal numeric transcription only when
  // an explicit caveat ensures no contextual pass can follow.
  const numericCjkText = source.extractionCaveat === 'unsupported_language_or_layout' && 'unitAsWritten' in v
    ? quote.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu, ' ') : quote;
  if (!verifyKeyDataAgainstText({ value: v.asWritten }, numericCjkText).verified) return [reason('VALUE_NOT_IN_ANCHOR', 'value.asWritten', 'The source-written value is absent from its exact value anchor.')];
  if (!('unitAsWritten' in v)) return [];
  if (v.unitAsWritten !== null && !verifyKeyDataAgainstText({ unit: v.unitAsWritten }, quote).verified)
    return [reason('UNIT_NOT_IN_ANCHOR', 'value.unitAsWritten', 'The unit is absent from the same value anchor.')];
  return numericProblems(v, c, source);
}

function sourceRow(c: CatalogFactCandidate): Map<string, string> | null {
  const quote = c.origin.valueAnchor.exactQuote;
  if (/[\r\n|\t]/.test(quote)) return null;
  const entries = quote.split(';').map(part => /^\s*([A-Za-z][A-Za-z _-]*):\s*(\S(?:.*\S)?)\s*$/.exec(part));
  if (entries.some(e => !e) || entries.length < 2) return null;
  const row = new Map<string, string>();
  for (const entry of entries) {
    const key = semantic(entry![1]);
    if (row.has(key)) return null;
    row.set(key, entry![2]);
  }
  return row;
}
interface ContextProblems { pending: CatalogFactReason[]; failures: CatalogFactReason[] }
function rowAdmissionProblems(meaning: CatalogFactMeaning, rules: FamilyRules, row: Map<string, string>): CatalogFactReason[] {
  const m = meaning as unknown as Record<string, unknown>;
  const property = semantic(String(m.property));
  const allowedLabels = new Set(['property', 'value', 'result', property, ...Object.values(rules.labels).flat()]);
  if ([...row.keys()].some(k => !allowedLabels.has(k))) return [reason('UNSUPPORTED_CONTEXT_QUALIFIER', 'origin.valueAnchor', 'An additional source qualifier is outside the admitted row grammar and cannot be ignored.')];
  const subjectField = meaning.kind === 'cmc_result' ? 'productRef' : meaning.kind === 'device_test' ? 'deviceRef' : 'assayRef';
  if (typeof m[subjectField] === 'string' && /\band\b|\bor\b|[,;+]/i.test(String(m[subjectField]))) return [reason('AMBIGUOUS_SOURCE_SUBJECT', `meaning.${subjectField}`, 'A compound source subject does not identify one unambiguous result relation.')];
  return [];
}
function compositeValue(c: CatalogFactCandidate): string {
  const v = c.value;
  return v.asWritten + ('unitAsWritten' in v && v.unitAsWritten && !norm(v.asWritten).endsWith(norm(v.unitAsWritten)) ? ` ${v.unitAsWritten}` : '');
}
function resultBindingProblems(c: CatalogFactCandidate, row: Map<string, string>): CatalogFactReason[] {
  const failures: CatalogFactReason[] = [];
  const property = semantic(String((c.meaning as unknown as Record<string, unknown>).property));
  const statedProperty = row.get('property');
  const results = [property, 'value', 'result'].filter(k => row.has(k));
  const statedValue = row.get(results[0]);
  if (results.length !== 1) failures.push(reason('AMBIGUOUS_RESULT_BINDING', 'value', 'The supported row must identify exactly one property result.'));
  if (statedProperty ? semantic(statedProperty) !== property : !row.has(property)) failures.push(reason('PROPERTY_MISMATCH', 'meaning.property', 'The row states a different property, or does not identify this property.'));
  if (!statedValue || norm(statedValue) !== norm(compositeValue(c)))
    failures.push(reason('RESULT_BINDING_MISMATCH', 'value', 'The named property result does not preserve the complete written value and unit.'));
  return failures;
}
function fieldContextProblems(c: CatalogFactCandidate, row: Map<string, string>, field: string, labels: string[]): ContextProblems {
  const pending: CatalogFactReason[] = [], failures: CatalogFactReason[] = [];
  const expected = (c.meaning as unknown as Record<string, unknown>)[field];
  const actuals = labels.filter(label => row.has(label)).map(label => row.get(label)!);
  if (expected === undefined) {
    if (actuals.length) pending.push(reason('SOURCE_QUALIFIER_NOT_BOUND', `meaning.${field}`, 'A source-stated contextual qualifier must not be omitted from the candidate.'));
    return { pending, failures };
  }
  if (expected === null || expected === 'not_established') return { pending: [reason('MISSING_CONTEXT', `meaning.${field}`, 'A required source context is not stated.')], failures };
  if (actuals.length !== 1) return { pending: [reason('MISSING_CONTEXT', `meaning.${field}`, 'The supported row does not identify this context unambiguously.')], failures };
  if (semantic(actuals[0]) !== semantic(String(expected))) failures.push(reason('CONTEXT_VALUE_MISMATCH', `meaning.${field}`, 'The source row identifies a different contextual value.'));
  const witness = c.origin.witnesses.find(w => w.path === `meaning.${field}`);
  if (!witness) return { pending: [reason('CONTEXT_WITNESS_REQUIRED', `meaning.${field}`, 'This context requires a source witness.')], failures };
  const a = witness.anchor, valueAnchor = c.origin.valueAnchor;
  if (a.range.start < valueAnchor.range.start || a.range.end > valueAnchor.range.end) failures.push(reason('REMOTE_CONTEXT_WITNESS', `meaning.${field}`, 'A remote witness cannot establish this row relation.'));
  if (!verifyKeyDataAgainstText({ context: semantic(String(expected)) }, semantic(a.exactQuote)).verified) failures.push(reason('CONTEXT_NOT_IN_WITNESS', `meaning.${field}`, 'The contextual value is absent from its source witness.'));
  return { pending, failures };
}
function meaningRelationProblems(meaning: CatalogFactMeaning): ContextProblems {
  const pending: CatalogFactReason[] = [], failures: CatalogFactReason[] = [];
  if (meaning.kind === 'ivd_diagnostic') {
    if (['sensitivity', 'specificity'].includes(meaning.property) && meaning.referenceBasis === 'comparison_method') failures.push(reason('REFERENCE_MEANING_MISMATCH', 'meaning.referenceBasis', 'Agreement against a comparison method does not establish reference-standard sensitivity or specificity.'));
    if (['positive_agreement', 'negative_agreement'].includes(meaning.property) && meaning.referenceBasis !== 'comparison_method') pending.push(reason('REFERENCE_MEANING_NOT_ESTABLISHED', 'meaning.referenceBasis', 'This preview does not establish comparator agreement without an explicit comparison method.'));
  }
  if (meaning.kind === 'device_test' && ((meaning.property === 'bench_result' && meaning.resultRole !== 'measured_result') || (meaning.property === 'acceptance_criterion' && meaning.resultRole !== 'acceptance_criterion')))
    failures.push(reason('RESULT_ROLE_MISMATCH', 'meaning.resultRole', 'The bench result and acceptance criterion roles are distinct.'));
  return { pending, failures };
}
function nonClinicalContext(c: CatalogFactCandidate): CatalogFactCheck {
  if (c.meaning.kind === 'pharma_clinical') return check('not_established');
  const rules = families[c.meaning.kind], row = sourceRow(c);
  if (!row) return check('not_established', [reason('UNSUPPORTED_CONTEXT_FORM', 'origin.valueAnchor', 'Only an unambiguous single labelled, semicolon-separated source row is supported for this family.')]);
  const admission = rowAdmissionProblems(c.meaning, rules, row);
  if (admission.length) return check('not_established', admission);
  const issues = [meaningRelationProblems(c.meaning), ...Object.entries(rules.labels).map(([field, labels]) => fieldContextProblems(c, row, field, labels))];
  const failures = [...resultBindingProblems(c, row), ...issues.flatMap(i => i.failures)], pending = issues.flatMap(i => i.pending);
  return failures.length ? check('failed', [...failures, ...pending]) : pending.length ? check('not_established', pending) : check('passed');
}

function clinicalContext(c: CatalogFactCandidate, source: CatalogFactSource): CatalogFactCheck {
  const meaning = c.meaning;
  if (meaning.kind !== 'pharma_clinical') return check('not_established');
  if (meaning.frameState === 'incomplete') return check('not_established', meaning.missing.map(path => reason('CLINICAL_FRAME_INCOMPLETE', `meaning.partialFrame.${path}`, 'The clinical frame is incomplete.')));
  const anchor = c.origin.valueAnchor;
  // Parse only the exact bounded context. Whole-document inherited headers
  // cannot establish a relationship outside the candidate's delivered quote.
  const parsed = extractClaims({ id: source.documentId, role: 'other', text: anchor.exactQuote });
  const candidates = parsed.claims.filter(claim => !!claim.value[meaning.component]);
  if (!candidates.length) return check('not_established', [reason('CLINICAL_FORM_NOT_ESTABLISHED', 'meaning.frame', 'The existing clinical engine did not establish a complete anchored claim for this component.')]);
  const matching = candidates.filter(claim => canonical(claim.frame) === canonical(meaning.frame as ClaimFrame) && norm(claim.value[meaning.component]!.raw) === norm(c.value.asWritten));
  if (matching.length !== 1) return check(matching.length > 1 ? 'not_established' : 'failed', [reason(matching.length > 1 ? 'AMBIGUOUS_CLINICAL_CONTEXT' : 'CLINICAL_FRAME_MISMATCH', 'meaning.frame', 'The existing clinical engine does not identify one exact matching frame and written component.')]);
  const required = Object.keys(meaning.frame).filter(k => !['scope', 'analysis'].includes(k) || Object.keys((meaning.frame as unknown as Record<string, object>)[k]).some(key => key !== 'subgroups' || (meaning.frame.scope.subgroups.length > 0)));
  const missing = required.filter(k => !c.origin.witnesses.some(w => w.path === `meaning.frame.${k}`));
  if (missing.length) return check('not_established', missing.map(k => reason('CONTEXT_WITNESS_REQUIRED', `meaning.frame.${k}`, 'The parsed clinical frame slot requires a source witness.')));
  if (meaning.productRef && !c.origin.witnesses.some(w => w.path === 'meaning.productRef' && verifyKeyDataAgainstText({ product: meaning.productRef }, w.anchor.exactQuote).verified))
    return check('not_established', [reason('CONTEXT_WITNESS_REQUIRED', 'meaning.productRef', 'The product context requires its own source witness.')]);
  // A witness must cover the parser's recorded contextual clause. A remote
  // occurrence of a frame label does not attest to the parsed relationship.
  if (c.origin.witnesses.some(w => w.anchor.range.start !== anchor.range.start || w.anchor.range.end !== anchor.range.end))
    return check('not_established', [reason('CLINICAL_CONTEXT_WITNESS_INCOMPLETE', 'origin.witnesses', 'Each clinical slot witness must cover the complete bounded context parsed by the existing engine; a bare figure or remote label is insufficient.')]);
  if (matching[0].loc.start !== 0 || matching[0].loc.end !== anchor.exactQuote.length || Object.values(matching[0].loc.slotFrom).some(from => !['form', 'clause', 'sentence'].includes(from)))
    return check('not_established', [reason('CLINICAL_CONTEXT_NOT_LOCAL', 'meaning.frame', 'This preview requires one exact local claim context; remote headings, tables, defaults, records and larger containing quotes cannot establish it.')]);
  return check('passed');
}

export function verifySourceFactCandidate(candidate: unknown, source: CatalogFactSource): CatalogFactVerification {
  const sourceView = { documentId: source.documentId, contentHash: source.contentHash, extractedTextSha256: source.extractedTextSha256 };
  const out: CatalogFactVerification = { ok: false, checkerRevision: CATALOG_FACT_CHECKER_REVISION, candidateSha256: null, source: sourceView, transcription: check('failed'), context: check('not_established'), scientificQualification: 'unassessed', reviewState: 'not_recorded', persisted: false };
  const validation = validateSourceFactBatch([candidate]);
  if (!validation.ok) { out.transcription.reasons = validation.reasons; return out; }
  const c = validation.candidates[0];
  out.candidateSha256 = hash(canonical(c));
  if (!UUID.test(source.documentId) || !SHA.test(source.contentHash) || !SHA.test(source.extractedTextSha256) || typeof source.extractedText !== 'string' || !source.extractedText.trim() || hash(source.extractedText) !== source.extractedTextSha256) {
    out.transcription.reasons = [reason('SOURCE_TEXT_IDENTITY_INVALID', 'source', 'The server source must identify nonempty exact stored text and its actual SHA-256.')]; return out;
  }
  const problems = [...anchorProblems(c.origin.valueAnchor, source, 'origin.valueAnchor'), ...c.origin.witnesses.flatMap((w, i) => anchorProblems(w.anchor, source, `origin.witnesses[${i}].anchor`)), ...writtenProblems(c, source)];
  if (problems.length) { out.transcription.reasons = problems; return out; }
  out.ok = true;
  out.transcription = check('passed');
  out.context = source.extractionCaveat ? check('not_established', [reason('EXTRACTION_CAVEAT', 'source.extractionCaveat', 'Extraction caveats require original or layout review beyond this preview.')]) : c.meaning.kind === 'pharma_clinical' ? clinicalContext(c, source) : nonClinicalContext(c);
  return out;
}
