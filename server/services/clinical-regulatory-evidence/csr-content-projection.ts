/** Source-field projection into the existing CRE corpus, not model training or
 * clinical validation. Unknown, patient-level and oversized input is accounted
 * for in the receipt; the original remains in its governed source. */
import { createHash } from 'node:crypto';
import type { AtomDraft, CreAtomType } from './retrieval-atoms.service';

type Domain = { atomType: CreAtomType; label: string; keys: readonly string[] };
const DOMAINS: readonly Domain[] = [
  { atomType: 'csr_result_observation', label: 'efficacy', keys: [
    'efficacy', 'efficacy_results', 'clinical_efficacy', 'primary_endpoint_results',
    'secondary_endpoint_results', 'endpoint_results', 'treatment_effects',
    'subgroup_analyses', 'sensitivity_analyses', 'exploratory_results',
    'patient_reported_outcomes', 'quality_of_life',
  ] },
  { atomType: 'csr_result_observation', label: 'biostatistics', keys: [
    'statistical_analysis', 'statistical_analyses', 'biostatistics', 'statistical_methods',
    'estimands', 'analysis_populations', 'hypothesis_tests', 'confidence_intervals',
    'p_values', 'multiplicity', 'missing_data', 'missing_data_methods',
  ] },
  { atomType: 'csr_safety_signal', label: 'safety', keys: [
    'safety', 'safety_results', 'adverse_events', 'serious_adverse_events',
    'adverse_events_of_special_interest', 'deaths', 'laboratory_results',
    'lab_values', 'vital_signs', 'ecg_results', 'exposure', 'tolerability',
  ] },
  { atomType: 'csr_result_observation', label: 'clinical_pharmacology', keys: [
    'pharmacokinetics', 'pharmacodynamics', 'pk_results', 'pd_results',
    'bioanalytical_results', 'immunogenicity', 'biomarkers',
  ] },
  { atomType: 'csr_design_feature', label: 'study_conduct', keys: [
    'study_design', 'eligibility', 'inclusion_criteria', 'exclusion_criteria',
    'randomization', 'blinding', 'treatments', 'dose', 'study_population',
    'participant_disposition', 'disposition', 'protocol_deviations',
    'baseline_characteristics', 'demographics', 'enrollment',
    'concomitant_medications', 'study_amendments',
  ] },
  { atomType: 'csr_execution_limitation', label: 'limitations', keys: [
    'limitations', 'deviations', 'missingness', 'bias', 'data_quality',
    'analysis_limitations', 'interpretation_limitations',
  ] },
  { atomType: 'csr_design_feature', label: 'report_context', keys: [
    'objectives', 'methodology', 'discussion', 'conclusions', 'ethics',
    'references', 'appendices', 'tables', 'figures', 'listings',
  ] },
];
const normalize = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[ -]+/g, '_').toLowerCase();
const domainByKey = new Map(DOMAINS.flatMap(d => d.keys.map(k => [k, d] as const)));
const MAX_TEXT = 12000;
const MAX_RECORDS = 200;
const MAX_ATOMS = 500;
const MAX_TOTAL_CHARS = 200000;

export interface CsrContentProjectionInput {
  reportId: string; sourceId: number; studyId: number; content: unknown;
  detailResults?: unknown; detailEndpoints?: unknown; reportMetadata?: unknown;
}
export type CsrProjectionIssue = 'empty' | 'unsupported_shape' | 'unmapped_field' |
  'identifier_marker' | 'oversized' | 'invalid_statistic' | 'capacity_exceeded';
export interface CsrContentCoverage {
  status: 'empty' | 'partial' | 'projected';
  /** Counts extraction candidates, NOT ICH E3 completeness or scientific validity. */
  examined: number; projected: number; structured: number;
  excluded: Record<CsrProjectionIssue, number>;
  byDomain: Record<string, number>;
  clinicalVerification: 'not-established';
}
export interface CsrContentProjection { atoms: AtomDraft[]; coverage: CsrContentCoverage }
const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const scalar = (v: unknown): v is string | number | boolean =>
  typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));

/** A conservative marker screen, NOT a certification of de-identification. */
export function hasCsrIdentifierMarker(text: string): boolean {
  return /\b(?:subject|patient|participant)[ _-]?(?:id|identifier|number)\s*[:=#]/i.test(text) ||
    /\b(?:date of birth|medical record number|social security number)\s*[:=#]/i.test(text) ||
    /(?:^|[\n;])\s*(?:subject|patient|participant)\s*[-#:]?\s*[a-z]*\d{2,}\b/i.test(text);
}
const PRIVATE_KEY = /^(?:(?:subject|patient|participant)_(?:id|identifier|number|name)|usubjid|subjid|birth_date|date_of_birth|dob|medical_record_number|mrn|social_security_number|ssn|email|phone|address|patient_name|full_name)$/;
const TEXT_FIELDS = new Set([
  'endpoint', 'endpoint_name', 'endpoint_type', 'endpoint_role', 'parameter', 'preferred_term', 'pt', 'soc',
  'analysis_population', 'population', 'estimand', 'effect_measure', 'method', 'statistical_method',
  'arm_id', 'arm_name', 'treatment_arm', 'comparator_arm_id', 'comparator', 'timepoint',
  'subgroup', 'multiplicity_status', 'missing_data_method', 'unit', 'units', 'display',
  'interval_type', 'direction_of_benefit', 'table_id', 'section', 'source_location',
]);
const NUMBER_FIELDS = new Set([
  'value', 'estimate', 'effect_value', 'mean', 'median', 'standard_error', 'standard_deviation',
  'sd', 'se', 'ci_lower', 'ci_upper', 'ci_level', 'p_value', 'n', 'sample_size', 'denominator',
  'numerator', 'count', 'event_count', 'missing_count', 'percentage',
]);
const COUNT_FIELDS = new Set(['n', 'sample_size', 'denominator', 'numerator', 'count', 'event_count', 'missing_count']);

function aggregate(raw: Record<string, unknown>): { value?: Record<string, unknown>; reason?: CsrProjectionIssue; ignored: number } {
  // Inspect keys/strings, including unknown fields, without returning any of
  // their contents. Cyclic/non-JSON/oversized input fails closed.
  let encoded: string;
  try { encoded = JSON.stringify(raw); } catch { return { reason: 'unsupported_shape', ignored: 0 }; }
  if (encoded.length > MAX_TEXT) return { reason: 'oversized', ignored: 0 };
  const inspect = (v: unknown, depth: number): boolean => {
    if (depth > 8) return true;
    if (typeof v === 'string') return hasCsrIdentifierMarker(v);
    if (Array.isArray(v)) return v.some(x => inspect(x, depth + 1));
    return record(v) && Object.entries(v).some(([k, x]) => PRIVATE_KEY.test(normalize(k)) || inspect(x, depth + 1));
  };
  if (inspect(raw, 0)) return { reason: 'identifier_marker', ignored: 0 };
  const out: Record<string, unknown> = {};
  let ignored = 0;
  for (const [originalKey, v] of Object.entries(raw)) {
    const k = normalize(originalKey);
    if (v === null || v === undefined) continue; // unknown is never zero
    let kept: unknown;
    if (TEXT_FIELDS.has(k) && typeof v === 'string' && v.trim()) kept = v;
    else if (NUMBER_FIELDS.has(k) && typeof v === 'number' && Number.isFinite(v)) kept = v;
    else if (k === 'p_value' && typeof v === 'string' && /^(?:[<>]=?|=)?\s*(?:0(?:\.\d+)?|1(?:\.0+)?)(?:e-\d+)?$/i.test(v.trim())) kept = v;
    else if ((k === 'ci' || k === 'confidence_interval') && record(v)) {
      if (Object.keys(v).some(key => !['lower', 'upper', 'level', 'type'].includes(key)) ||
        typeof v.lower !== 'number' || !Number.isFinite(v.lower) ||
        typeof v.upper !== 'number' || !Number.isFinite(v.upper) || v.lower > v.upper ||
        (v.level != null && !(typeof v.level === 'string' || typeof v.level === 'number')) ||
        (v.type != null && typeof v.type !== 'string')) return { reason: 'invalid_statistic', ignored };
      kept = { lower: v.lower, upper: v.upper, ...(v.level != null ? { level: v.level } : {}), ...(v.type != null ? { type: v.type } : {}) };
    } else if (NUMBER_FIELDS.has(k) || k === 'ci' || k === 'confidence_interval') {
      return { reason: 'invalid_statistic', ignored };
    } else { ignored++; continue; }
    if (Object.prototype.hasOwnProperty.call(out, k) && JSON.stringify(out[k]) !== JSON.stringify(kept))
      return { reason: 'invalid_statistic', ignored };
    out[k] = kept;
  }
  const identity = ['endpoint', 'endpoint_name', 'parameter', 'preferred_term', 'pt', 'soc', 'analysis_population', 'population', 'arm_id', 'arm_name', 'treatment_arm'];
  if (!identity.some(k => out[k] !== undefined) || !Object.keys(out).some(k => NUMBER_FIELDS.has(k) || ['method', 'statistical_method', 'display'].includes(k)))
    return { reason: 'unsupported_shape', ignored };
  for (const k of COUNT_FIELDS) {
    if (out[k] !== undefined && (!Number.isSafeInteger(out[k]) || (out[k] as number) < 0))
      return { reason: 'invalid_statistic', ignored };
  }
  if (typeof out.p_value === 'number' && (out.p_value < 0 || out.p_value > 1)) return { reason: 'invalid_statistic', ignored };
  if (typeof out.percentage === 'number' && (out.percentage < 0 || out.percentage > 100)) return { reason: 'invalid_statistic', ignored };
  if (typeof out.numerator === 'number' && typeof out.denominator === 'number' && out.numerator > out.denominator)
    return { reason: 'invalid_statistic', ignored };
  if (typeof out.ci_lower === 'number' && typeof out.ci_upper === 'number' && out.ci_lower > out.ci_upper)
    return { reason: 'invalid_statistic', ignored };
  for (const k of ['standard_error', 'standard_deviation', 'se', 'sd'])
    if (typeof out[k] === 'number' && (out[k] as number) < 0) return { reason: 'invalid_statistic', ignored };
  return { value: out, ignored };
}

export function projectCsrContentEvidenceWithCoverage(input: CsrContentProjectionInput): CsrContentProjection {
  if (!Number.isSafeInteger(input.sourceId) || input.sourceId < 1 || !Number.isSafeInteger(input.studyId) || input.studyId < 1 ||
    typeof input.reportId !== 'string' || !input.reportId.trim() || input.reportId.length > 256 || hasCsrIdentifierMarker(input.reportId))
    throw new Error('A bounded CSR source identity is required');
  const atoms: AtomDraft[] = [];
  const coverage: CsrContentCoverage = { status: 'empty', examined: 0, projected: 0, structured: 0,
    excluded: { empty: 0, unsupported_shape: 0, unmapped_field: 0, identifier_marker: 0, oversized: 0, invalid_statistic: 0, capacity_exceeded: 0 },
    byDomain: {}, clinicalVerification: 'not-established' };
  let chars = 0;
  const emit = (domain: Domain, key: string, raw: unknown, location: string): void => {
    coverage.examined++;
    if (raw == null || (typeof raw === 'string' && !raw.trim())) { coverage.excluded.empty++; return; }
    if (atoms.length >= MAX_ATOMS || chars >= MAX_TOTAL_CHARS) { coverage.excluded.capacity_exceeded++; return; }
    let value: unknown = raw;
    let structured = false;
    if (record(raw)) {
      const selected = aggregate(raw);
      coverage.excluded.unmapped_field += selected.ignored;
      if (selected.reason) { coverage.excluded[selected.reason]++; return; }
      value = selected.value; structured = true;
    } else if (!scalar(raw)) { coverage.excluded.unsupported_shape++; return; }
    const text = typeof value === 'string' ? value.trim() : JSON.stringify(value);
    if (text.length > MAX_TEXT) { coverage.excluded.oversized++; return; }
    if (hasCsrIdentifierMarker(text)) { coverage.excluded.identifier_marker++; return; }
    if (chars + text.length > MAX_TOTAL_CHARS) { coverage.excluded.capacity_exceeded++; return; }
    const sourceRef = `csr_content:${input.reportId}:${location}`;
    atoms.push({ atomType: domain.atomType, sourceRef, title: `CSR ${domain.label}: ${key}`,
      content: `CSR report: ${input.reportId}\nDomain: ${domain.label}\nSource: ${location}\nUnverified recorded source value: ${text}`,
      tags: ['csr', domain.label, key, 'source_unverified'],
      structuredData: { csrReportId: input.reportId, studyId: input.studyId, sourceId: input.sourceId,
        sourceLocation: location, valueHash: createHash('sha256').update(text).digest('hex'),
        extractionMethod: structured ? 'deterministic_aggregate_fields' : 'deterministic_source_field',
        ...(structured ? { recordedAggregate: value } : {}), explicitOrInferred: 'explicit',
        verificationStatus: 'unverified', statisticalValidation: 'not_performed', medicalReview: 'required',
        confidenceBasis: 'unscored', privacyAssessment: 'marker_screen_only', trainingApproved: false },
      confidence: 0 }); // the persistence column requires a number; zero is explicitly unscored
    chars += text.length; coverage.projected++; if (structured) coverage.structured++;
    coverage.byDomain[domain.label] = (coverage.byDomain[domain.label] ?? 0) + 1;
  };
  const field = (domain: Domain, key: string, value: unknown, location: string) => {
    if (Array.isArray(value)) {
      for (let i = 0; i < Math.min(value.length, MAX_RECORDS); i++) emit(domain, key, value[i], `${location}[${i}]`);
      if (value.length > MAX_RECORDS) coverage.excluded.capacity_exceeded += value.length - MAX_RECORDS;
      if (!value.length) coverage.excluded.empty++;
    } else emit(domain, key, value, location);
  };
  const sources = [
    { location: 'csr_reports.content', body: input.content, direct: false },
    { location: 'csr_details.results', body: input.detailResults, direct: true },
    { location: 'csr_details.endpoints', body: input.detailEndpoints, direct: true },
    { location: 'csr_reports.metadata', body: input.reportMetadata, direct: false },
  ];
  for (const { location, body, direct } of sources) {
    if (body == null) continue;
    if (direct && (Array.isArray(body) || (record(body) && Object.keys(body).some(k => ['endpoint', 'endpoint_name'].includes(normalize(k)))))) {
      field(DOMAINS[0], 'endpoint_results', body, location); continue;
    }
    if (!record(body)) { coverage.excluded.unsupported_shape++; continue; }
    // Preserve domain order for the existing projection consumers.
    const entries = Object.entries(body);
    for (const domain of DOMAINS) for (const [key, value] of entries) {
      const normalized = normalize(key);
      if (domainByKey.get(normalized) === domain) field(domain, normalized, value, `${location}.${key}`);
    }
    coverage.excluded.unmapped_field += entries.filter(([key]) => !domainByKey.has(normalize(key))).length;
  }
  const missed = Object.values(coverage.excluded).some(n => n > 0);
  coverage.status = missed ? 'partial' : atoms.length ? 'projected' : 'empty';
  return { atoms, coverage };
}

/** Backward-compatible entry point used by the existing adapter and CRE writer. */
export function projectCsrContentEvidence(input: CsrContentProjectionInput): AtomDraft[] {
  return projectCsrContentEvidenceWithCoverage(input).atoms;
}
