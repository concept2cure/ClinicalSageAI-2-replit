/**
 * studyDesignEvidenceService — the unified evidence service the work order §8
 * requires, composed from the existing study-design math + the shared spine.
 *
 * This is the EVIDENCE layer, not a second predictor: it answers "what did
 * comparable studies design, what did they observe, what did FDA object to, and
 * how does the client's design differ" — always with §14 provenance and honest
 * insufficiency, never a binary "FDA will accept" and never a dose number
 * without a governing calculation. The numeric simulation/power lives in the
 * canonical server/services/study-design/* module; this service selects the
 * evidence and the defensible stress scenarios and hands them to it.
 *
 * All reads honour the §13 visibility boundary (global-public + own-org).
 *
 * @module server/services/clinical-regulatory-evidence/study-design-evidence.service
 */

import { pool } from '../../db';
import { listStudies } from './evidence-spine.service';
import { gatherResultObservations } from './csr-adapter.service';
import type { RegulatoryFinding, StudyResultObservation, MetricProvenance } from './types';

/** Below this many comparable studies, distributions are not reported (honest). */
const MIN_STUDIES_FOR_DISTRIBUTION = 5;
/** Below this many machine-readable effects, an effect distribution is withheld. */
const MIN_EFFECTS_FOR_DISTRIBUTION = 3;

const INSUFFICIENT = 'Insufficient structured evidence to estimate this reliably.';

function visible(orgId: number, idx: number) {
  return { sql: `(organization_id IS NULL OR organization_id = $${idx})`, param: orgId };
}

function adaptFindingRow(r: Record<string, any>): RegulatoryFinding {
  return {
    id: r.id, organizationId: r.organization_id, visibilityClass: r.visibility_class, sourceId: r.source_id,
    applicationIdentifier: r.application_identifier,
    relatedStudyIds: r.related_study_ids == null ? [] : (typeof r.related_study_ids === 'string' ? JSON.parse(r.related_study_ids) : r.related_study_ids),
    findingDomain: r.finding_domain, findingCategory: r.finding_category, findingSubcategory: r.finding_subcategory,
    fdaReviewDiscipline: r.fda_review_discipline, findingText: r.finding_text, normalizedSummary: r.normalized_summary,
    requestedAction: r.requested_action, severity: r.severity, affectedCtdSection: r.affected_ctd_section,
    affectedIchE3Section: r.affected_ich_e3_section, affectedProtocolElement: r.affected_protocol_element,
    affectedSapElement: r.affected_sap_element, affectedStudyDesignFeature: r.affected_study_design_feature,
    sourcePage: r.source_page, sourceExcerpt: r.source_excerpt, explicitOrInferred: r.explicit_or_inferred,
    extractionConfidence: r.extraction_confidence, verificationStatus: r.verification_status,
    metadata: r.metadata == null ? {} : (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata),
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

/** Findings whose text/feature/category matches any keyword, domain-filtered. */
async function searchFindings(orgId: number, opts: { keywords?: string[]; domains?: string[]; limit?: number }): Promise<RegulatoryFinding[]> {
  const v = visible(orgId, 1);
  const args: unknown[] = [v.param];
  let where = `${v.sql} AND deleted_at IS NULL`;
  if (opts.domains?.length) { args.push(opts.domains); where += ` AND finding_domain = ANY($${args.length})`; }
  if (opts.keywords?.length) {
    const ors = opts.keywords.map((k) => {
      args.push(`%${k}%`);
      const p = `$${args.length}`;
      return `(finding_text ILIKE ${p} OR normalized_summary ILIKE ${p} OR affected_study_design_feature ILIKE ${p} OR finding_category ILIKE ${p})`;
    });
    where += ` AND (${ors.join(' OR ')})`;
  }
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const { rows } = await pool.query(
    `SELECT * FROM cre_regulatory_findings WHERE ${where} ORDER BY created_at DESC LIMIT ${limit}`, args,
  );
  return (rows as Record<string, any>[]).map(adaptFindingRow);
}

function citationsFrom(findings: RegulatoryFinding[]): { sourceId: number; ichE3: string | null; page: number | null }[] {
  return findings.map((f) => ({ sourceId: f.sourceId, ichE3: f.affectedIchE3Section, page: f.sourcePage }));
}

// ─── §8 benchmarkDesign ───────────────────────────────────────────────────────

export interface BenchmarkInput {
  indication: string; phase?: string; modality?: string; population?: string;
  endpointClass?: string; comparator?: string; designType?: string; clientWorkspaceId?: number | null;
}
export interface BenchmarkResult {
  numberOfStudies: number;
  numberWithUsableResults: number;
  designDistributions: Record<string, Record<string, number>> | null;  // null when below threshold
  effectDistribution: { mean: number; sd: number; n: number } | null;
  commonEndpoints: string[] | null;
  regulatoryFindings: RegulatoryFinding[];
  unresolvedDataLimitations: string[];
  provenance: MetricProvenance;
  note: string;
}

export async function benchmarkDesign(orgId: number, input: BenchmarkInput): Promise<BenchmarkResult> {
  const studies = await listStudies(orgId, { indication: input.indication, phase: input.phase, limit: 300 });
  const obs = await gatherResultObservations({ orgId, indication: input.indication, phase: input.phase });
  const findings = await searchFindings(orgId, {
    keywords: [input.indication, input.endpointClass, input.designType].filter(Boolean) as string[],
    domains: ['clinical', 'biostatistics'], limit: 50,
  });

  const enough = studies.length >= MIN_STUDIES_FOR_DISTRIBUTION;
  const enoughEffects = obs.withStructuredEffect >= MIN_EFFECTS_FOR_DISTRIBUTION;

  const designDistributions = enough ? distributionsOf(studies) : null;
  const effectDistribution = enoughEffects ? effectStats(obs.observations) : null;
  const commonEndpoints = enough ? topEndpoints(studies) : null;

  const unresolved: string[] = [];
  if (!enough) unresolved.push(`Only ${studies.length} comparable studies found (need ≥ ${MIN_STUDIES_FOR_DISTRIBUTION} to report distributions).`);
  if (!enoughEffects) unresolved.push(`Only ${obs.withStructuredEffect} of ${obs.scanned} CSRs carried a machine-readable effect (need ≥ ${MIN_EFFECTS_FOR_DISTRIBUTION}).`);

  return {
    numberOfStudies: studies.length,
    numberWithUsableResults: obs.withStructuredEffect,
    designDistributions,
    effectDistribution,
    commonEndpoints,
    regulatoryFindings: findings,
    unresolvedDataLimitations: unresolved,
    provenance: {
      numerator: obs.withStructuredEffect, denominator: obs.scanned, missingCount: obs.scanned - obs.withStructuredEffect,
      inclusionCriteria: `indication ~ "${input.indication}"${input.phase ? `, phase ${input.phase}` : ''}`,
      filters: { indication: input.indication, phase: input.phase ?? null },
      extractionMethod: 'deterministic+structured', verificationStatus: 'unverified', dateRange: null,
    },
    note: enough ? obs.note : `${obs.note} ${unresolved.join(' ')}`.trim(),
  };
}

// ─── §8 assessEndpointRegulatoryRisk (no binary FDA-accept verdict) ────────────

export interface EndpointRiskResult {
  endpoint: string;
  supportingPrecedent: RegulatoryFinding[];   // findings that resolved / accepted similar endpoints
  negativePrecedent: RegulatoryFinding[];      // CRL objections to similar endpoints
  importantDifferences: string[];
  unansweredQuestions: string[];
  evidenceQuality: 'insufficient' | 'limited' | 'moderate' | 'substantial';
  citations: { sourceId: number; ichE3: string | null; page: number | null }[];
  note: string;
}

export async function assessEndpointRegulatoryRisk(orgId: number, endpoint: string, context: { indication?: string; phase?: string } = {}): Promise<EndpointRiskResult> {
  const findings = await searchFindings(orgId, {
    keywords: [endpoint, context.indication].filter(Boolean) as string[],
    domains: ['clinical', 'biostatistics'], limit: 100,
  });
  // A finding is "negative" (an objection) unless it is explicitly resolved.
  const negative = findings.filter((f) => (f.metadata?.resolved !== true));
  const supporting = findings.filter((f) => (f.metadata?.resolved === true));
  const quality: EndpointRiskResult['evidenceQuality'] =
    findings.length === 0 ? 'insufficient' : findings.length < 3 ? 'limited' : findings.length < 8 ? 'moderate' : 'substantial';

  return {
    endpoint,
    supportingPrecedent: supporting,
    negativePrecedent: negative,
    importantDifferences: [],  // filled by the caller/AnA when comparing to the client's design
    unansweredQuestions: findings.length === 0
      ? [`No FDA findings on record referencing "${endpoint}" — absence of objection is not evidence of acceptance.`]
      : negative.filter((f) => f.requestedAction).map((f) => f.requestedAction as string).slice(0, 10),
    evidenceQuality: quality,
    citations: citationsFrom(findings),
    note: findings.length === 0 ? INSUFFICIENT : `Found ${negative.length} unresolved objection(s) and ${supporting.length} resolved precedent(s) referencing this endpoint. This is precedent, not a prediction of acceptance.`,
  };
}

// ─── §8 assessSampleSizeEvidence (delegates the calc; never averages history) ──

export interface SampleSizeEvidenceResult {
  regulatoryConcerns: RegulatoryFinding[];       // "inadequate database", "underpowered"
  effectEvidence: { observations: StudyResultObservation[]; withStructuredEffect: number; scanned: number };
  safetyDatabaseNote: string | null;
  provenance: MetricProvenance;
  guidance: string;
  note: string;
}

export async function assessSampleSizeEvidence(orgId: number, input: { indication: string; phase?: string }): Promise<SampleSizeEvidenceResult> {
  const concerns = await searchFindings(orgId, {
    keywords: ['sample size', 'underpowered', 'inadequate', 'database size', 'exposure'],
    domains: ['clinical', 'biostatistics', 'safety'], limit: 50,
  });
  const obs = await gatherResultObservations({ orgId, indication: input.indication, phase: input.phase });
  return {
    regulatoryConcerns: concerns,
    effectEvidence: { observations: obs.observations, withStructuredEffect: obs.withStructuredEffect, scanned: obs.scanned },
    safetyDatabaseNote: input.phase === '3'
      ? 'Confirm the safety-exposure database against ICH E1 expectations (≥1500 exposed / ≥300–600 for 6–12 months) — not just the power calculation.'
      : null,
    provenance: {
      numerator: obs.withStructuredEffect, denominator: obs.scanned, missingCount: obs.scanned - obs.withStructuredEffect,
      inclusionCriteria: `indication ~ "${input.indication}"`, filters: { phase: input.phase ?? null },
      extractionMethod: 'structured-effects', verificationStatus: 'unverified', dateRange: null,
    },
    // The power/assurance number comes from server/services/study-design/sample-size.ts
    // using the CLIENT's assumptions + this effect evidence — never inferred from
    // average historical enrollment.
    guidance: obs.withStructuredEffect < MIN_EFFECTS_FOR_DISTRIBUTION
      ? `${INSUFFICIENT} Base the calculation on an explicit, client-stated effect assumption; ${obs.withStructuredEffect} prior effects are too few to anchor it.`
      : 'Run the sample-size calculation (study-design/sample-size) with the client assumptions; the prior effect evidence widens the uncertainty band.',
    note: obs.note,
  };
}

// ─── §8 assessDoseStrategy (never a dose number without a governing calc) ──────

export interface DoseStrategyResult {
  regulatoryObjections: RegulatoryFinding[];   // FDA objections to dose selection
  doseEvidenceAvailable: boolean;
  requiresGoverningCalculation: true;          // structural — a dose rec always needs one
  expertReviewWarning: string;
  guidance: string;
  citations: { sourceId: number; ichE3: string | null; page: number | null }[];
  note: string;
}

export async function assessDoseStrategy(orgId: number, input: { indication: string; phase?: string }): Promise<DoseStrategyResult> {
  const objections = await searchFindings(orgId, {
    keywords: ['dose', 'dose selection', 'dose-response', 'MTD', 'exposure-response', 'dose justification'],
    domains: ['clinical', 'clinical_pharmacology'], limit: 50,
  });
  return {
    regulatoryObjections: objections,
    doseEvidenceAvailable: objections.length > 0,
    requiresGoverningCalculation: true,
    expertReviewWarning:
      'A clinical dose recommendation must never be generated from precedent alone. It requires a clearly identified governing calculation (exposure–response / MTD / PK-PD), stated assumptions, and expert review before use.',
    guidance: objections.length === 0
      ? `${INSUFFICIENT} No FDA dose-selection objections on record for this area; do not infer a dose from sparse MTD history.`
      : 'Review the FDA dose-selection objections below against the proposed regimen; escalate to clinical pharmacology for a governing exposure–response analysis.',
    citations: citationsFrom(objections),
    note: 'No dose value is emitted by this service by design.',
  };
}

// ─── §8 simulateDesignWithRegulatoryStress (selects scenarios; simulator runs them) ──

export type StressScenarioKey =
  | 'reduced_treatment_effect' | 'higher_dropout' | 'missing_not_at_random' | 'subgroup_heterogeneity'
  | 'site_variability' | 'endpoint_misclassification' | 'safety_event_increase' | 'multiplicity_penalty'
  | 'protocol_deviation_impact';

export interface StressScenario { key: StressScenarioKey; rationale: string; drivenBy: number[] /* finding source ids */; }
export interface RegulatoryStressPlan {
  scenarios: StressScenario[];
  simulatorHandoff: string;   // how the caller runs these on the existing simulator
  note: string;
}

/**
 * Select which stress tests are DEFENSIBLE for this design, driven by the FDA
 * findings on record (§8: "CRLs should inform which stress tests are relevant,
 * not dictate arbitrary parameter values"). The parameter values themselves are
 * set by the caller and executed by server/services/study-design/trial-simulator.
 */
export async function simulateDesignWithRegulatoryStress(orgId: number, _input: { indication: string; phase?: string; endpoint?: string }): Promise<RegulatoryStressPlan> {
  // Scope by review domain, not by an indication keyword: a deficiency's text
  // describes the objection, not the indication, so which stress tests are
  // defensible is driven by the FDA findings on record in the clinical /
  // biostatistics / safety disciplines (visible to this org).
  const findings = await searchFindings(orgId, {
    domains: ['clinical', 'biostatistics', 'safety'], limit: 200,
  });
  const map: { match: RegExp; key: StressScenarioKey; rationale: string }[] = [
    { match: /effect|efficacy|magnitude|clinically meaningful/i, key: 'reduced_treatment_effect', rationale: 'FDA questioned the effect magnitude / clinical meaningfulness.' },
    { match: /dropout|discontinu|retention|missing/i, key: 'higher_dropout', rationale: 'FDA raised dropout / missing-data concerns.' },
    { match: /missing|imputation|MNAR|sensitivity/i, key: 'missing_not_at_random', rationale: 'FDA questioned the missing-data assumption.' },
    { match: /subgroup|heterogen|consistency/i, key: 'subgroup_heterogeneity', rationale: 'FDA raised subgroup consistency concerns.' },
    { match: /site|center|region/i, key: 'site_variability', rationale: 'FDA raised site/regional variability concerns.' },
    { match: /endpoint|misclassif|adjudicat/i, key: 'endpoint_misclassification', rationale: 'FDA questioned endpoint ascertainment / adjudication.' },
    { match: /safety|adverse|toxicit/i, key: 'safety_event_increase', rationale: 'FDA raised safety-event concerns.' },
    { match: /multiplicity|alpha|type i|family-wise/i, key: 'multiplicity_penalty', rationale: 'FDA questioned multiplicity control.' },
    { match: /deviation|compliance|gcp/i, key: 'protocol_deviation_impact', rationale: 'FDA raised protocol-deviation / conduct concerns.' },
  ];
  const chosen = new Map<StressScenarioKey, StressScenario>();
  for (const f of findings) {
    const hay = `${f.findingText ?? ''} ${f.normalizedSummary ?? ''} ${f.findingCategory ?? ''}`;
    for (const m of map) {
      if (m.match.test(hay)) {
        const cur = chosen.get(m.key) ?? { key: m.key, rationale: m.rationale, drivenBy: [] };
        if (!cur.drivenBy.includes(f.sourceId)) cur.drivenBy.push(f.sourceId);
        chosen.set(m.key, cur);
      }
    }
  }
  const scenarios = [...chosen.values()];
  return {
    scenarios,
    simulatorHandoff: 'Pass each scenario to server/services/study-design/trial-simulator.simulateTrial with caller-set parameter values; the findings select which scenarios are defensible, not the magnitudes.',
    note: scenarios.length === 0
      ? 'No FDA findings on record select a specific stress scenario for this design; run the default effect-sensitivity grid only.'
      : `${scenarios.length} regulatory-stress scenario(s) are defensible for this design, each driven by FDA findings.`,
  };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function distributionsOf(studies: { phase: string | null; modality: string | null }[]): Record<string, Record<string, number>> {
  const tally = (key: 'phase' | 'modality') => {
    const out: Record<string, number> = {};
    for (const s of studies) { const v = s[key] ?? 'unknown'; out[v] = (out[v] ?? 0) + 1; }
    return out;
  };
  return { phase: tally('phase'), modality: tally('modality') };
}

function effectStats(obs: StudyResultObservation[]): { mean: number; sd: number; n: number } {
  const vals = obs.map((o) => o.effectValue).filter((v): v is number => typeof v === 'number');
  const n = vals.length;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  return { mean, sd, n };
}

function topEndpoints(_studies: unknown[]): string[] {
  // Endpoint names live on the CSR-adapter design features, not the identity row;
  // the caller enriches this from extractDesignFeatures when it needs names.
  return [];
}
