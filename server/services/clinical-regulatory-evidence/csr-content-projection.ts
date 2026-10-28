/**
 * Deterministic CSR-content projection onto the EXISTING clinical-regulatory
 * evidence atom spine. These are source extracts, never model-generated claims,
 * calculations, validation decisions or cross-tenant training examples.
 */
import { createHash } from 'node:crypto';
import type { AtomDraft, CreAtomType } from './retrieval-atoms.service';

type CsrDomain = {
  atomType: CreAtomType;
  keys: readonly string[];
  label: string;
};

const DOMAINS: readonly CsrDomain[] = [
  { atomType: 'csr_result_observation', label: 'efficacy', keys: [
    'efficacy', 'efficacy_results', 'clinical_efficacy', 'primary_endpoint_results',
    'secondary_endpoint_results', 'endpoint_results', 'treatment_effects',
    'subgroup_analyses', 'sensitivity_analyses', 'exploratory_results',
  ] },
  { atomType: 'csr_result_observation', label: 'biostatistics', keys: [
    'statistical_analysis', 'statistical_analyses', 'biostatistics',
    'statistical_methods', 'estimands', 'analysis_populations',
    'hypothesis_tests', 'confidence_intervals', 'p_values',
    'multiplicity', 'missing_data', 'missing_data_methods',
  ] },
  { atomType: 'csr_safety_signal', label: 'safety', keys: [
    'safety', 'safety_results', 'adverse_events', 'serious_adverse_events',
    'adverse_events_of_special_interest', 'deaths', 'laboratory_results',
    'vital_signs', 'ecg_results', 'exposure', 'tolerability',
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
    'objectives', 'methodology', 'discussion', 'conclusions',
    'references', 'appendices', 'tables', 'figures', 'listings',
  ] },
];

export interface CsrContentProjectionInput {
  reportId: string;
  sourceId: number;
  studyId: number;
  content: unknown;
  detailResults?: unknown;
  detailEndpoints?: unknown;
  reportMetadata?: unknown;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function safeText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);
  return null;
}

/** Unverified evidence must never be promoted into a verified statistical conclusion. */
export function projectCsrContentEvidence(input: CsrContentProjectionInput): AtomDraft[] {
  const drafts: AtomDraft[] = [];
  const sources: Array<{ location: string; body: unknown }> = [
    { location: 'csr_reports.content', body: input.content },
    { location: 'csr_details.results', body: input.detailResults },
    { location: 'csr_details.endpoints', body: input.detailEndpoints },
    { location: 'csr_reports.metadata', body: input.reportMetadata },
  ];
  for (const { location, body } of sources) {
    const obj = record(body);
    if (!obj) continue;
    for (const domain of DOMAINS) {
      for (const key of domain.keys) {
        if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
        const raw = obj[key];
        if (raw !== null && typeof raw === 'object') continue;
        const text = safeText(raw);
        if (!text) continue;
        // Never index a full, possibly participant-level CSR payload as a
        // retrieval snippet. Oversized source data stays in the governed source.
        if (text.length > 12000) continue;
        // Free-text values can still include subject identifiers. Only explicitly
        // screened aggregate text may be indexed; otherwise keep source in Vault.
        if (/(?:subject|patient|participant)[ _-]?(?:id|identifier|number)\\s*[:=#]/i.test(text)) continue;
        // A summary atom must not become a surrogate for raw subject listings.
        if (/\\b(?:date of birth|medical record number|social security number)\\s*[:=#]/i.test(text)) continue;
        const sourceLocation = location + '.' + key;
        const fingerprint = createHash('sha256').update(text).digest('hex');
        drafts.push({
          atomType: domain.atomType,
          sourceRef: `csr_content:${input.reportId}:${sourceLocation}`,
          title: `CSR ${domain.label}: ${key}`,
          content: `CSR report: ${input.reportId}\nDomain: ${domain.label}\nSource: ${sourceLocation}\nRecorded source value: ${text}`,
          tags: ['csr', domain.label, key, 'source_unverified'],
          structuredData: {
            csrReportId: input.reportId,
            studyId: input.studyId,
            sourceId: input.sourceId,
            sourceLocation,
            valueHash: fingerprint,
            extractionMethod: 'deterministic_source_field',
            explicitOrInferred: 'explicit',
            verificationStatus: 'unverified',
            statisticalValidation: 'not_performed',
            medicalReview: 'required',
          },
          confidence: 0.6, // source extraction only; NOT clinical confidence
        });
      }
    }
  }
  return drafts;
}
