/**
 * Regulatory Precedent Engine
 *
 * Transforms CSR intelligence, FDA clearance data, and adversarial precedents
 * into actionable regulatory strategy during document authoring.
 *
 * Architecture:
 *   CSR Intelligence → Precedent Extractor → Knowledge Graph → Similarity Engine
 *                                                                    ↓
 *                                              Authoring Assistant (claim → precedent → guidance)
 *
 * Capabilities:
 *   1. precedent.search     — Find closest regulatory precedents by submission context
 *   2. precedent.compare    — Compare user's submission against a specific precedent
 *   3. precedent.risk       — Analyze regulatory risks based on historical objections
 *   4. precedent.strategy   — Recommend submission strategy based on precedent patterns
 *   5. authoring.check      — Real-time claim checking during document editing
 *   6. precedent.crlTriggers — CRL trigger pattern analysis with confidence calibration
 *   7. precedent.rtfTriggers — RTF (Refuse to File) trigger pattern analysis
 *   8. precedent.emaPatterns — EMA Day 120/180 question pattern analysis
 *   9. precedent.advisoryRisk — Advisory Committee risk factor analysis
 *
 * Data sources:
 *   - predicate.fda_510k_clearances      — 510(k) clearance decisions
 *   - predicate.fda_510k_embeddings      — Semantic vectors
 *   - predicate.predicate_lineage        — Predicate device graph
 *   - predicate.predicate_safety_signals — Recalls, MDR, warnings
 *   - adversarial.regulatory_adversarial_precedents — Historical FDA questions
 *   - precedent.regulatory_precedents    — Unified precedent records
 *   - csr_reports / csr_details          — CSR structured data
 *
 * @module server/services/precedent-engine
 */

import { pool } from '../db.js';
import { createScopedLogger } from '../utils/logger';
import { search510kClearances as openFda510k } from './integrations/openfda-device-client';
import { buildPrecedentOrgIsolation, precedentOrgId } from './precedent-isolation.js';
import { resolveToRegistryEntry, getSubmissionTypeContext } from '../../shared/regulatory/submission-type-bridge.js';

const log = createScopedLogger('precedent-engine');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PrecedentSearchInput {
  /** Type of submission: 510(k), PMA, NDA, BLA, IND, CER */
  submissionType: string;
  /** Target indication or intended use */
  indication?: string;
  /** Device class (1, 2, 3) */
  deviceClass?: string;
  /** Product type: Device, Drug, Biologic */
  productType?: string;
  /** Therapeutic area: Oncology, CNS, etc. */
  therapeuticArea?: string;
  /** Free-text query for semantic search */
  query?: string;
  /** Device or product name */
  deviceName?: string;
  /** Product code */
  productCode?: string;
  /** Maximum results */
  limit?: number;
}

export interface PrecedentRecord {
  id: string;
  submissionType: string;
  productType: string | null;
  deviceClass: string | null;
  therapeuticArea: string | null;
  indication: string | null;
  clearanceNumber: string | null;
  deviceName: string | null;
  applicant: string | null;
  decisionDate: string | null;
  decisionOutcome: string;
  clearanceType: string | null;
  predicateDevice: string | null;
  predicateKNumber: string | null;
  strategySummary: string | null;
  testingApproach: string | null;
  trialDesign: string | null;
  sampleSize: number | null;
  primaryEndpoint: string | null;
  endpointMet: boolean | null;
  fdaComments: string | null;
  fdaQuestions: string[];
  riskFactors: string[];
  similarityScore?: number;
  sourceType: string | null;
  /** As recorded; null when the stored precedent records none. */
  confidenceScore: number | null;
}

/**
 * Whether an external registry was consulted for a search, and what came back.
 *
 * Returned rather than logged so a surface can distinguish "the FDA registry
 * holds no match for this product code" from "the FDA registry did not answer".
 * Rendering the second as the first is the failure this type exists to prevent.
 */
export interface RegistryStatus {
  /** False when the query had no terms the registry could be searched by. */
  consulted: boolean;
  available: boolean;
  /** Set when available=false — what to tell the reader. */
  reason?: string;
  resultCount?: number;
}

/** openFDA dates are YYYYMMDD. Anything else becomes null rather than a guess. */
function toIsoDate(raw: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(raw?.trim() ?? '');
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export interface PrecedentComparison {
  precedent: PrecedentRecord;
  similarities: ComparisonItem[];
  differences: ComparisonItem[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  overallScore: number;
  recommendations: string[];
}

interface ComparisonItem {
  dimension: string;
  userValue: string;
  precedentValue: string;
  match: boolean;
  impact: 'low' | 'medium' | 'high';
  note?: string;
}

export interface RiskAnalysisResult {
  /**
   * 'not_assessed' when none of the three sources could be read. Each read
   * swallowed its failure and answered "none found", so an analysis that read
   * nothing reported 'low', score 0, "No risk factors identified" (2026-10-15).
   */
  overallRisk: 'low' | 'medium' | 'high' | 'critical' | 'not_assessed';
  riskScore: number | null;
  factors: RiskFactor[];
  historicalObjections: HistoricalObjection[];
  mitigationStrategies: string[];
  safetySignals: SafetySignalSummary[];
  /** What each source answered: read, or why it was not. */
  sources: Record<'adversarialPrecedents' | 'safetySignals' | 'toxicPredicates', SourceStatus>;
}

/** 'read', or why a source was not: it failed, or it does not apply. */
export type SourceStatus = 'read' | { notRead: string };

/** A source's answer, or the reason there is none. */
type SourceRead<T> = { ran: true; value: T } | { ran: false; reason: string };

const statusOf = (r: SourceRead<unknown>): SourceStatus => (r.ran ? 'read' : { notRead: r.reason });

/** Risk factors from the safety signals and toxic predicates found. */
function signalFactors(safetySignals: SafetySignalSummary[], toxicCount: number): RiskFactor[] {
  const factors: RiskFactor[] = [];
  if (safetySignals.length > 0) {
    factors.push({
      category: 'Safety Signal History',
      description: `${safetySignals.length} safety signal(s) found in similar devices (recalls, MDR reports, warnings)`,
      severity: safetySignals.some(s => s.severity > 0.7) ? 'critical' : 'high',
      precedentCount: safetySignals.length,
      mitigation:
        'Include comprehensive safety data addressing known signal patterns in your submission',
    });
  }
  if (toxicCount > 0) {
    factors.push({
      category: 'Toxic Predicate Risk',
      description: `${toxicCount} predicate(s) in this product code have safety concerns`,
      severity: 'high',
      precedentCount: toxicCount,
      mitigation: 'Avoid toxic predicates. Select predicates with clean safety history.',
    });
  }
  return factors;
}

/** Overall risk from the factors' severities. */
function scoreFactors(factors: RiskFactor[]): {
  riskScore: number;
  overallRisk: Exclude<RiskAnalysisResult['overallRisk'], 'not_assessed'>;
} {
  const severityWeights = { low: 1, medium: 2, high: 3, critical: 4 };
  const totalWeight = factors.reduce((sum, f) => sum + severityWeights[f.severity], 0);
  const avgWeight = factors.length > 0 ? totalWeight / factors.length : 0;
  const riskScore = Math.min(avgWeight / 4, 1);
  const overallRisk =
    riskScore >= 0.75 ? 'critical' : riskScore >= 0.5 ? 'high' : riskScore >= 0.25 ? 'medium' : 'low';
  return { riskScore, overallRisk };
}

interface RiskFactor {
  category: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  precedentCount: number;
  mitigation: string;
}

interface HistoricalObjection {
  question: string;
  agency: string;
  failureMode: string;
  therapeuticArea: string;
  submissionType: string;
}

interface SafetySignalSummary {
  kNumber: string;
  deviceName: string;
  signalType: string;
  severity: number;
  description: string;
}

export interface StrategyRecommendation {
  /**
   * 'no-precedents' when no approved precedent that records a strategy
   * matched: nothing is recommended, and strategy, confidence and timeline
   * are null. It answered 'Standard submission approach' at confidence 0.3
   * with a '6-12 months (standard)' timeline — a recommendation no precedent
   * made (2026-10-15).
   */
  basis: 'precedents' | 'no-precedents';
  recommendedStrategy: string | null;
  confidence: number | null;
  supportingPrecedents: PrecedentRecord[];
  alternativeStrategies: AlternativeStrategy[];
  testingRequirements: string[];
  /** From the top precedent's clearance type; null when it maps to none. */
  estimatedTimeline: string | null;
  keyRisks: string[];
}

interface AlternativeStrategy {
  strategy: string;
  precedentCount: number;
  /**
   * The share of the approved precedents that used this strategy. It was
   * called successRate and printed as "% success rate"; it is not one — every
   * precedent counted was an approved one.
   */
  shareOfApprovedPrecedents: number;
  description: string;
}

export interface ClaimCheckResult {
  claim: string;
  supported: boolean;
  precedents: PrecedentRecord[];
  warnings: ClaimWarning[];
  suggestedCitations: string[];
  recommendation: string;
  /**
   * Whether there was anything to check the claim AGAINST.
   *
   * `supported: false` carried two unrelated meanings: "precedents were
   * consulted and they do not support this" and "nothing was consulted". The
   * surface rendered both as "Needs support", so a claim checked against an
   * empty corpus came back looking adjudicated. Only 'checked' may be read as
   * a judgement about the claim (MDX_WORK_ORDER W2-8).
   */
  basis: 'checked' | 'no-precedents';
  /** Whether the FDA registry was consulted for the precedents, and what came back. */
  registry: RegistryStatus;
}

interface ClaimWarning {
  type: 'rejection_risk' | 'missing_evidence' | 'contradicted_by_precedent' | 'fda_objection';
  message: string;
  severity: 'low' | 'medium' | 'high';
  precedentId?: string;
}

// ─── Precedent Engine ────────────────────────────────────────────────────────


/** The reserved owner of platform-provided precedent knowledge. See migrations/20260814m. */
const PLATFORM_ORG = '00000000-0000-0000-0000-000000000000';

/** `resolution_difficulty` back to the severity vocabulary this file speaks. */
const DIFFICULTY_TO_SEVERITY: Record<string, CRLPattern['severity']> = {
  very_high: 'critical', high: 'high', moderate: 'medium', low: 'low',
};

/**
 * CRL trigger patterns from `regulatory_intel`, or null if that store cannot
 * answer.
 *
 * ── Why this returns null instead of an empty array ─────────────────────────
 * The whole reason ADR 0013 made this file authoritative is that the table
 * shipped with zero rows, and an empty answer from a regulatory risk tool reads
 * as "low risk" — the most dangerous direction to be wrong in. So "the table
 * said nothing" and "the table is not there" must both fall back to the inline
 * knowledge below, and only a table with actual rows may override it. An empty
 * result here is indistinguishable from an unseeded environment, so it is
 * treated as one.
 *
 * Reads platform rows and this organisation's own rows together: a tenant that
 * has recorded its own patterns sees them alongside the shipped ones, which is
 * the point of the tier.
 */
async function loadPatternRows(
  table: string,
  columns: string,
  organizationId?: string,
): Promise<Record<string, any>[] | null> {
  if (!pool) return null;
  try {
    const { rows } = await pool.query(
      `SELECT ${columns} FROM regulatory_intel.${table} WHERE organization_id = ANY($1::uuid[])`,
      [organizationId ? [PLATFORM_ORG, organizationId] : [PLATFORM_ORG]],
    );
    return Array.isArray(rows) && rows.length > 0 ? rows : null;
  } catch {
    return null;
  }
}

/** A row is cited when it carries the regulatory language it was derived from. */
function basisOf(row: Record<string, any>): 'curated' | 'cited' {
  const lang = row.typical_fda_language;
  return Array.isArray(lang) && lang.length > 0 ? 'cited' : 'curated';
}

async function loadCrlPatternsFromStore(organizationId?: string): Promise<CRLPattern[] | null> {
  if (!pool) return null;
  try {
    const { rows } = await pool.query(
      `SELECT pattern_name, category, trigger_description, frequency_rate,
              resolution_difficulty, submission_types, typical_fda_language
         FROM regulatory_intel.crl_trigger_patterns
        WHERE organization_id = ANY($1::uuid[])`,
      [organizationId ? [PLATFORM_ORG, organizationId] : [PLATFORM_ORG]],
    );
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows.map(r => ({
      evidenceBasis: basisOf(r),
      category: String(r.pattern_name),
      submissionTypes: Array.isArray(r.submission_types) ? r.submission_types : [],
      severity: DIFFICULTY_TO_SEVERITY[String(r.resolution_difficulty)] ?? 'medium',
      // frequency_rate is not served: the platform rows copied it from the
      // inline arrays, and neither cites a source (2026-10-15).
      description: String(r.trigger_description),
      mitigation: '',
    }));
  } catch {
    // 42P01 and anything else: the store cannot answer, so the inline knowledge
    // stands. This path is why seeding can never make the product worse.
    return null;
  }
}

/** RTF trigger patterns from the store, or null so the curated list stands. */
async function loadRtfTriggersFromStore(organizationId?: string): Promise<RTFTriggerPattern[] | null> {
  const rows = await loadPatternRows(
    'rtf_trigger_patterns',
    'pattern_name, trigger_description, frequency_rate, typical_fda_language',
    organizationId,
  );
  /* The table has no severity column. The platform rows carry the curated
     severity encoded in frequency_rate (>= 0.2 critical, >= 0.1 high), which
     is read for that and not served as a frequency: no source is cited for it
     (2026-10-15). */
  return rows?.map(r => ({
    evidenceBasis: basisOf(r),
    trigger: String(r.pattern_name),
    severity: (Number(r.frequency_rate) >= 0.2 ? 'critical' : Number(r.frequency_rate) >= 0.1 ? 'high' : 'medium') as RTFTriggerPattern['severity'],
    description: String(r.trigger_description),
  })) ?? null;
}

/* Advisory-committee triggers are NOT read from the store (removed 2026-10-15).

   regulatory_intel.advisory_committee_patterns records no submission-type or
   therapeutic-area applicability, so a stored trigger was mapped with
   `submissionTypes: []` — and the matcher below keeps only triggers whose
   submission types include the one assessed. Once the platform tier was
   seeded (migrations/20260814n), every assessment matched nothing and read
   "overall AdComm risk: low, 0 triggers": a first-in-class NDA scored low.
   That is the failure ADR 0013 was written to prevent, produced by the store
   path that note says "can never make the product worse". A store that
   cannot say which submissions a trigger applies to cannot answer this
   question, so the curated list below answers it until the table can. */

export class PrecedentEngine {
  // ── 1. SEARCH: Find closest regulatory precedents ──────────────────────

  /**
   * Precedent search, with the provenance of what was consulted.
   *
   * `search()` below is the records-only wrapper the eight existing callers
   * use. This form exists because the FDA registry can be UNREACHABLE, and a
   * caller that only receives an array cannot tell that apart from "the
   * registry holds no match" — which is how a device search for a heavily
   * cleared product code came to report zero precedents with no explanation.
   */
  async searchWithSources(
    input: PrecedentSearchInput,
    organizationId?: number,
  ): Promise<{ records: PrecedentRecord[]; registry: RegistryStatus }> {
    const limit = Math.min(input.limit || 10, 50);

    // Resolve international / aliased submission types (e.g. 'EU_MAA', 'CA_NDS') to
    // their canonical applicationType string. Falls through unchanged when unrecognized.
    const bridgeEntry = resolveToRegistryEntry(input.submissionType);
    if (bridgeEntry) {
      const ctx = getSubmissionTypeContext(input.submissionType);
      log.info(`Resolved submission type "${input.submissionType}" → "${bridgeEntry.applicationType}" (region: ${ctx?.region ?? 'unknown'}, agency: ${ctx?.agency ?? 'unknown'})`);
      input = { ...input, submissionType: bridgeEntry.applicationType };
    }

    log.info(`Searching precedents: ${input.submissionType}, query="${input.query || ''}"`, {
      submissionType: input.submissionType,
      indication: input.indication,
      deviceClass: input.deviceClass,
    });

    const precedents: PrecedentRecord[] = [];

    // Strategy 1: Search unified precedent table with filters. Tenant-scoped:
    // returns public precedents (organization_id IS NULL) plus this org's own
    // private precedents, never another tenant's.
    const unifiedResults = await this.searchUnifiedPrecedents(input, limit, organizationId);
    precedents.push(...unifiedResults);

    // Strategy 2: the FDA 510(k) registry (device submissions only).
    let registry: RegistryStatus = {
      consulted: false,
      available: false,
      reason: 'The FDA 510(k) registry covers device submissions; it was not consulted for this submission type.',
    };
    if (['510(k)', '510k', 'PMA', 'De_Novo', 'De Novo'].includes(input.submissionType)) {
      const clearance = await this.search510kClearances(input, limit);
      precedents.push(...clearance.records);
      registry = clearance.registry;
    }

    // Strategy 3: Search adversarial precedents for FDA objection patterns
    const adversarialResults = await this.searchAdversarialPrecedents(input, Math.ceil(limit / 2));
    // Merge adversarial data as risk context into existing precedents
    this.enrichWithAdversarialData(precedents, adversarialResults);

    // Deduplicate by clearance number
    const seen = new Set<string>();
    const deduped = precedents.filter(p => {
      const key = p.clearanceNumber || p.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by similarity score descending
    deduped.sort((a, b) => (b.similarityScore || 0) - (a.similarityScore || 0));

    log.info(`Found ${deduped.length} precedents`);
    return { records: deduped.slice(0, limit), registry };
  }

  /**
   * Records-only precedent search — the long-standing signature, kept so the
   * eight existing callers are untouched. A caller that needs to tell a reader
   * WHY a device search came back thin should use searchWithSources().
   */
  async search(input: PrecedentSearchInput, organizationId?: number): Promise<PrecedentRecord[]> {
    return (await this.searchWithSources(input, organizationId)).records;
  }

  private async searchUnifiedPrecedents(
    input: PrecedentSearchInput,
    limit: number,
    organizationId?: number
  ): Promise<PrecedentRecord[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    // Tenant isolation by construction: a caller sees public precedents
    // (organization_id IS NULL) plus its own org's private precedents, and
    // never another tenant's. With no org in context, only public precedents
    // are returned. Existing rows are all NULL (public), so this is a no-op for
    // today's corpus and a hard boundary the moment private precedents exist.
    const isolation = buildPrecedentOrgIsolation(organizationId, paramIdx);
    conditions.push(isolation.condition);
    params.push(...isolation.params);
    paramIdx = isolation.nextParamIdx;

    // Always filter by submission type
    conditions.push(`submission_type = $${paramIdx++}`);
    params.push(input.submissionType);

    if (input.productType) {
      conditions.push(`product_type = $${paramIdx++}`);
      params.push(input.productType);
    }
    if (input.deviceClass) {
      conditions.push(`device_class = $${paramIdx++}`);
      params.push(input.deviceClass);
    }
    if (input.therapeuticArea) {
      conditions.push(`therapeutic_area = $${paramIdx++}`);
      params.push(input.therapeuticArea);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT *
      FROM precedent.regulatory_precedents
      ${whereClause}
      ORDER BY decision_date DESC NULLS LAST, confidence_score DESC NULLS LAST
      LIMIT $${paramIdx}
    `;
    params.push(limit);

    // No catch. The table and its organization_id are created by the migration
    // set, so a failure here is a real failure — and it used to be swallowed to
    // [] (42703 on every database until 2026-09-22), which the board then
    // rendered as "your organization's corpus has none". A search that did not
    // run must say so; the routes and tools above already surface a rejection.
    const result = await pool.query(query, params);
    return result.rows.map(this.mapPrecedentRow);
  }

  /**
   * Strategy 2 — the cleared-510(k) universe.
   *
   * ── What this used to do, and why it could only ever return nothing ─────────
   * It ran a SELECT against `predicate.fda_510k_clearances` LEFT JOINed to
   * `predicate.fda_product_codes`. Neither relation is created by any migration
   * in this repository, and nothing anywhere writes to either — the only other
   * mentions of the name are in CI scripts that parse SQL. So the query raised
   * `relation "predicate.fda_510k_clearances" does not exist` on every call, the
   * catch below turned that into `[]`, and the surface reported "no precedents".
   *
   * Searching product code BZH — one of the most cleared Class II codes in CDRH
   * history — therefore returned zero, structurally, and would have gone on
   * returning zero however much real data existed, because the failure was
   * rendered as an empty result (MDX_WORK_ORDER W2-8).
   *
   * ── Where the data actually is ──────────────────────────────────────────────
   * openFDA's device/510k dataset, reached through
   * services/integrations/openfda-device-client — the client this repo already
   * owns, already uses from routes/510k-device-routes.ts, and which is honest by
   * construction: a network or API failure comes back as
   * { available: false, unavailableReason } and never as a fabricated clearance.
   * Building an ingest pipeline for a table nobody writes would be a second
   * implementation of a capability that already has one.
   *
   * The registry status is RETURNED rather than logged, so the caller can tell a
   * reader "the FDA registry was unreachable" instead of showing them an empty
   * result set. That distinction is the whole defect.
   */
  private async search510kClearances(
    input: PrecedentSearchInput,
    limit: number,
  ): Promise<{ records: PrecedentRecord[]; registry: RegistryStatus }> {
    if (!input.productCode && !input.deviceName) {
      return {
        records: [],
        registry: {
          consulted: false,
          available: false,
          reason: 'A product code or device name is needed to search the FDA 510(k) registry.',
        },
      };
    }

    const out = await openFda510k({
      productCode: input.productCode,
      deviceName: input.deviceName,
      limit,
    });

    if (!out.available) {
      log.warn(`FDA 510(k) registry unavailable: ${out.unavailableReason ?? 'unknown reason'}`);
      return {
        records: [],
        registry: {
          consulted: true,
          available: false,
          reason: out.unavailableReason ?? 'The FDA 510(k) registry did not respond.',
        },
      };
    }

    const records: PrecedentRecord[] = out.results.map((r) => ({
      id: r.kNumber,
      submissionType: '510(k)',
      productType: 'Device',
      deviceClass: null,
      therapeuticArea: null,
      indication: null,
      clearanceNumber: r.kNumber,
      deviceName: r.deviceName || null,
      applicant: r.applicant || null,
      // openFDA decision_date is YYYYMMDD; ISO-8601 or null, never a guess.
      decisionDate: toIsoDate(r.decisionDate),
      decisionOutcome: r.decisionCode === 'SE' ? 'CLEARED' : r.decisionCode || 'UNKNOWN',
      clearanceType: r.clearanceType || null,
      predicateDevice: null,
      predicateKNumber: null,
      /* The registry record carries no summary text, no testing approach and no
         endpoints. They stay null: a clearance we have not read is not a
         clearance we can characterise. */
      strategySummary: null,
      testingApproach: null,
      trialDesign: null,
      sampleSize: null,
      primaryEndpoint: null,
      endpointMet: null,
      fdaComments: null,
      fdaQuestions: [],
      riskFactors: [],
      // A structured match on product code / device name has no similarity
      // to report; it was 0.5, which the board showed as a 50% match.
      similarityScore: undefined,
      sourceType: 'FDA_510k',
      confidenceScore: 1.0,
    }));

    return { records, registry: { consulted: true, available: true, resultCount: records.length } };
  }

  /** Objections for the corpus search, where a failed read adds none. */
  private async searchAdversarialPrecedents(
    input: PrecedentSearchInput,
    limit: number
  ): Promise<HistoricalObjection[]> {
    const read = await this.readAdversarialPrecedents(input, limit);
    return read.ran ? read.value : [];
  }

  private async readAdversarialPrecedents(
    input: PrecedentSearchInput,
    limit: number
  ): Promise<SourceRead<HistoricalObjection[]>> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (input.submissionType) {
      conditions.push(`submission_type = $${paramIdx++}`);
      params.push(input.submissionType);
    }
    if (input.therapeuticArea) {
      conditions.push(`therapeutic_area = $${paramIdx++}`);
      params.push(input.therapeuticArea);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    try {
      const result = await pool.query(
        `SELECT id, agency_code, failure_mode, historical_question, therapeutic_area, submission_type
         FROM adversarial.regulatory_adversarial_precedents
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramIdx}`,
        [...params, limit]
      );

      return {
        ran: true,
        value: result.rows.map(row => ({
          question: row.historical_question,
          agency: row.agency_code,
          failureMode: row.failure_mode,
          therapeuticArea: row.therapeutic_area || '',
          submissionType: row.submission_type || '',
        })),
      };
    } catch (err: any) {
      log.warn(`Adversarial precedent search failed: ${err.message}`);
      return { ran: false, reason: 'the historical-objection store could not be read' };
    }
  }

  private enrichWithAdversarialData(
    precedents: PrecedentRecord[],
    objections: HistoricalObjection[]
  ): void {
    if (objections.length === 0) return;
    // Attach adversarial questions as risk factors to matching precedents
    for (const p of precedents) {
      const relevant = objections.filter(
        o => o.submissionType === p.submissionType || o.therapeuticArea === p.therapeuticArea
      );
      if (relevant.length > 0) {
        p.fdaQuestions = [...p.fdaQuestions, ...relevant.map(o => o.question)];
        p.riskFactors = [
          ...p.riskFactors,
          ...relevant.map(o => `[${o.failureMode}] ${o.question.substring(0, 200)}`),
        ];
      }
    }
  }

  // ── 2. COMPARE: User submission vs specific precedent ──────────────────

  async compare(
    userContext: {
      submissionType: string;
      deviceName?: string;
      indication?: string;
      trialDesign?: string;
      sampleSize?: number;
      primaryEndpoint?: string;
      testingApproach?: string;
      predicateDevice?: string;
    },
    precedentId: string,
    organizationId?: number
  ): Promise<PrecedentComparison> {
    const bridgeEntry = resolveToRegistryEntry(userContext.submissionType);
    if (bridgeEntry) userContext = { ...userContext, submissionType: bridgeEntry.applicationType };

    log.info(`Comparing submission against precedent ${precedentId}`);

    // Load the precedent record
    const precedent = await this.getPrecedentById(precedentId, organizationId);
    if (!precedent) {
      throw new Error(`Precedent ${precedentId} not found`);
    }

    const similarities: ComparisonItem[] = [];
    const differences: ComparisonItem[] = [];

    // Compare each dimension
    const comparisons: {
      dim: string;
      user: string | undefined;
      prec: string | null;
      impact: 'low' | 'medium' | 'high';
    }[] = [
      {
        dim: 'Submission Type',
        user: userContext.submissionType,
        prec: precedent.submissionType,
        impact: 'high',
      },
      {
        dim: 'Device/Product Name',
        user: userContext.deviceName,
        prec: precedent.deviceName,
        impact: 'medium',
      },
      {
        dim: 'Indication',
        user: userContext.indication,
        prec: precedent.indication,
        impact: 'high',
      },
      {
        dim: 'Trial Design',
        user: userContext.trialDesign,
        prec: precedent.trialDesign,
        impact: 'high',
      },
      {
        dim: 'Sample Size',
        user: userContext.sampleSize?.toString(),
        prec: precedent.sampleSize?.toString() ?? null,
        impact: 'medium',
      },
      {
        dim: 'Primary Endpoint',
        user: userContext.primaryEndpoint,
        prec: precedent.primaryEndpoint,
        impact: 'high',
      },
      {
        dim: 'Testing Approach',
        user: userContext.testingApproach,
        prec: precedent.testingApproach,
        impact: 'medium',
      },
      {
        dim: 'Predicate Device',
        user: userContext.predicateDevice,
        prec: precedent.predicateDevice,
        impact: 'high',
      },
    ];

    for (const c of comparisons) {
      if (!c.user && !c.prec) continue;
      const userVal = c.user || '(not specified)';
      const precVal = c.prec || '(not specified)';
      const match =
        c.user !== undefined &&
        c.prec !== null &&
        c.user.toLowerCase().trim() === c.prec.toLowerCase().trim();

      const item: ComparisonItem = {
        dimension: c.dim,
        userValue: userVal,
        precedentValue: precVal,
        match,
        impact: c.impact,
      };

      if (match) {
        similarities.push(item);
      } else if (c.user || c.prec) {
        differences.push(item);
      }
    }

    // Calculate risk level
    const highImpactDiffs = differences.filter(d => d.impact === 'high').length;
    const riskLevel =
      highImpactDiffs >= 3
        ? 'critical'
        : highImpactDiffs >= 2
          ? 'high'
          : highImpactDiffs >= 1
            ? 'medium'
            : 'low';

    const totalDims = similarities.length + differences.length;
    const overallScore = totalDims > 0 ? similarities.length / totalDims : 0;

    // Generate recommendations
    const recommendations: string[] = [];
    if (precedent.decisionOutcome === 'CLEARED' || precedent.decisionOutcome === 'APPROVED') {
      if (overallScore >= 0.7) {
        recommendations.push(
          `Strong alignment with cleared precedent ${precedent.clearanceNumber}. Use this as primary comparator.`
        );
      }
      if (precedent.testingApproach) {
        recommendations.push(`Consider replicating testing approach: ${precedent.testingApproach}`);
      }
      if (precedent.strategySummary) {
        recommendations.push(`Reference strategy: ${precedent.strategySummary.substring(0, 200)}`);
      }
    }

    for (const d of differences) {
      if (d.impact === 'high') {
        recommendations.push(
          `Address difference in ${d.dimension}: your "${d.userValue}" vs precedent "${d.precedentValue}"`
        );
      }
    }

    if (precedent.fdaComments) {
      recommendations.push(`FDA reviewer noted: ${precedent.fdaComments.substring(0, 200)}`);
    }

    return {
      precedent,
      similarities,
      differences,
      riskLevel,
      overallScore,
      recommendations,
    };
  }

  // ── 3. RISK ANALYSIS: Regulatory risk from historical objections ───────

  async analyzeRisk(input: PrecedentSearchInput): Promise<RiskAnalysisResult> {
    const bridgeEntry = resolveToRegistryEntry(input.submissionType);
    if (bridgeEntry) input = { ...input, submissionType: bridgeEntry.applicationType };

    log.info(`Analyzing regulatory risk for ${input.submissionType}`);

    const factors: RiskFactor[] = [];

    // 1. Check adversarial precedents for historical FDA objections
    const adversarial = await this.readAdversarialPrecedents(input, 20);
    const objections = adversarial.ran ? adversarial.value : [];
    const objectionGroups = new Map<string, HistoricalObjection[]>();
    for (const o of objections) {
      const group = objectionGroups.get(o.failureMode) || [];
      group.push(o);
      objectionGroups.set(o.failureMode, group);
    }

    for (const [mode, group] of objectionGroups) {
      const severityMap: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
        'Clinical Gap': 'high',
        'CMC Inconsistency': 'medium',
        'Safety Signal': 'critical',
        'Bioequivalence Failure': 'high',
        'Manufacturing Deficiency': 'medium',
      };
      factors.push({
        category: mode,
        description: `${group.length} historical objection(s) in this failure mode for ${input.submissionType} submissions`,
        severity: severityMap[mode] || 'medium',
        precedentCount: group.length,
        mitigation: this.getMitigationForFailureMode(mode),
      });
    }

    // 2. Check safety signals for related devices
    const safety = await this.readSafetySignals(input);
    const safetySignals = safety.ran ? safety.value : [];
    // 3. Check predicate lineage for toxic predicates
    const toxic = await this.readToxicPredicatesFor(input);
    factors.push(...signalFactors(safetySignals, toxic.ran ? toxic.value : 0));

    const sources = {
      adversarialPrecedents: statusOf(adversarial),
      safetySignals: statusOf(safety),
      toxicPredicates: statusOf(toxic),
    };
    // Nothing read is not "low risk": it is no assessment.
    if (!adversarial.ran && !safety.ran && !toxic.ran) {
      return {
        overallRisk: 'not_assessed',
        riskScore: null,
        factors: [],
        historicalObjections: [],
        mitigationStrategies: [],
        safetySignals: [],
        sources,
      };
    }

    // Calculate overall risk over the sources that were read
    const { riskScore, overallRisk } = scoreFactors(factors);

    // Generate mitigation strategies
    const mitigationStrategies = factors
      .filter(f => f.severity !== 'low')
      .map(f => f.mitigation)
      .filter((v, i, a) => a.indexOf(v) === i); // unique

    return {
      overallRisk,
      riskScore,
      factors,
      historicalObjections: objections.slice(0, 10),
      mitigationStrategies,
      safetySignals,
      sources,
    };
  }

  // ── 4. STRATEGY: Recommend submission strategy from precedents ─────────

  async recommendStrategy(input: PrecedentSearchInput, organizationId?: number): Promise<StrategyRecommendation> {
    const bridgeEntry = resolveToRegistryEntry(input.submissionType);
    if (bridgeEntry) input = { ...input, submissionType: bridgeEntry.applicationType };

    log.info(`Recommending strategy for ${input.submissionType}`);

    // Get successful precedents
    const precedents = await this.search({ ...input, limit: 20 }, organizationId);
    const approved = precedents.filter(p => ['CLEARED', 'APPROVED'].includes(p.decisionOutcome));
    const rejected = precedents.filter(p =>
      ['REJECTED', 'CRL', 'REFUSE_TO_FILE'].includes(p.decisionOutcome)
    );

    // Analyze patterns in successful submissions
    const strategyPatterns = new Map<string, { count: number; precedents: PrecedentRecord[] }>();

    for (const p of approved) {
      // A precedent that records no strategy supports none; it was counted as 'Standard'.
      const strategy = p.strategySummary || p.testingApproach || p.clearanceType;
      if (!strategy) continue;
      const existing = strategyPatterns.get(strategy) || { count: 0, precedents: [] };
      existing.count++;
      existing.precedents.push(p);
      strategyPatterns.set(strategy, existing);
    }

    // The most common strategy among approved precedents, or none.
    let recommendedStrategy: string | null = null;
    let maxCount = 0;
    for (const [strategy, data] of strategyPatterns) {
      if (data.count > maxCount) {
        maxCount = data.count;
        recommendedStrategy = strategy;
      }
    }

    // Build alternative strategies
    const alternativeStrategies: AlternativeStrategy[] = [];
    for (const [strategy, data] of strategyPatterns) {
      if (strategy === recommendedStrategy) continue;
      alternativeStrategies.push({
        strategy,
        precedentCount: data.count,
        shareOfApprovedPrecedents: data.count / approved.length,
        description: `Used in ${data.count} approved precedent(s)`,
      });
    }

    // Extract common testing requirements from successful precedents
    const testingSet = new Set<string>();
    for (const p of approved) {
      if (p.testingApproach) {
        p.testingApproach.split(/[,;]/).forEach(t => testingSet.add(t.trim()));
      }
    }

    // Key risks from rejected submissions
    const keyRisks: string[] = [];
    for (const r of rejected.slice(0, 5)) {
      if (r.fdaComments) {
        keyRisks.push(r.fdaComments.substring(0, 200));
      }
      for (const q of r.fdaQuestions.slice(0, 2)) {
        keyRisks.push(q);
      }
    }

    const confidence =
      recommendedStrategy === null
        ? null
        : Math.min(approved.length / (approved.length + rejected.length + 1), 0.95);

    // Estimate timeline based on clearance type
    const timelineMap: Record<string, string> = {
      Traditional: '90-120 days (traditional 510(k))',
      Special: '30-60 days (special 510(k))',
      Abbreviated: '60-90 days (abbreviated 510(k))',
      De_Novo: '150+ days (De Novo classification)',
      Priority: '6-8 months (priority review)',
    };

    return {
      basis: recommendedStrategy === null ? 'no-precedents' : 'precedents',
      recommendedStrategy,
      confidence,
      supportingPrecedents: approved.slice(0, 5),
      alternativeStrategies: alternativeStrategies.slice(0, 3),
      testingRequirements: Array.from(testingSet).slice(0, 10),
      estimatedTimeline: timelineMap[approved[0]?.clearanceType || ''] ?? null,
      keyRisks: keyRisks.slice(0, 5),
    };
  }

  // ── 5. AUTHORING ASSISTANT: Real-time claim checking ───────────────────

  async checkClaim(
    claim: string,
    /* productCode / deviceName are what the FDA 510(k) registry can be searched
       by. Without them a device claim check could reach the corpus but never
       the registry, so it answered "no precedent" for claims about product
       codes with hundreds of clearances. */
    context: {
      submissionType: string;
      therapeuticArea?: string;
      indication?: string;
      productCode?: string;
      deviceName?: string;
    },
    organizationId?: number
  ): Promise<ClaimCheckResult> {
    const bridgeEntry = resolveToRegistryEntry(context.submissionType);
    if (bridgeEntry) context = { ...context, submissionType: bridgeEntry.applicationType };

    log.info(`Checking claim: "${claim.substring(0, 80)}..."`);

    const warnings: ClaimWarning[] = [];
    const suggestedCitations: string[] = [];

    // Search for relevant precedents based on the claim text. The provenance
    // comes back with them: a claim checked against nothing must be able to say
    // so, and must be able to say WHY when the reason is an unreachable registry.
    const { records: precedents, registry } = await this.searchWithSources({
      submissionType: context.submissionType,
      therapeuticArea: context.therapeuticArea,
      indication: context.indication,
      productCode: context.productCode,
      deviceName: context.deviceName,
      query: claim,
      limit: 5,
    }, organizationId);

    // Search adversarial precedents for contradictions
    const objections = await this.searchAdversarialPrecedents(
      {
        submissionType: context.submissionType,
        therapeuticArea: context.therapeuticArea,
        query: claim,
      },
      5
    );

    // Analyze claim patterns
    const claimLower = claim.toLowerCase();

    // Check for unsupported efficacy claims
    if (claimLower.includes('statistically significant') || claimLower.includes('p <')) {
      const rejected = precedents.filter(
        p => p.decisionOutcome === 'REJECTED' || p.decisionOutcome === 'CRL'
      );
      if (rejected.length > 0) {
        warnings.push({
          type: 'rejection_risk',
          message: `FDA rejected ${rejected.length} similar submission(s) with comparable efficacy claims. Ensure proper multiplicity correction.`,
          severity: 'high',
          precedentId: rejected[0].id,
        });
      }
    }

    // Check for substantial equivalence claims
    if (claimLower.includes('substantial equivalence') || claimLower.includes('predicate')) {
      const cleared = precedents.filter(p => p.decisionOutcome === 'CLEARED' && p.predicateDevice);
      if (cleared.length > 0) {
        for (const c of cleared.slice(0, 3)) {
          suggestedCitations.push(
            `${c.clearanceNumber}: ${c.deviceName} — cleared ${c.decisionDate} via ${c.clearanceType || 'Traditional'} 510(k)`
          );
        }
      }
    }

    // Check for safety claims
    if (
      claimLower.includes('safe') ||
      claimLower.includes('biocompatible') ||
      claimLower.includes('well-tolerated')
    ) {
      for (const o of objections) {
        if (o.failureMode === 'Safety Signal') {
          warnings.push({
            type: 'fda_objection',
            message: `Historical FDA concern: "${o.question.substring(0, 150)}"`,
            severity: 'high',
          });
        }
      }
    }

    // Check for endpoint claims
    if (claimLower.includes('primary endpoint') || claimLower.includes('endpoint met')) {
      for (const o of objections) {
        if (o.failureMode === 'Clinical Gap') {
          warnings.push({
            type: 'fda_objection',
            message: `FDA previously questioned similar endpoint claims: "${o.question.substring(0, 150)}"`,
            severity: 'medium',
          });
        }
      }
    }

    // Add citations from approved precedents
    for (const p of precedents.filter(p => ['CLEARED', 'APPROVED'].includes(p.decisionOutcome))) {
      if (p.clearanceNumber) {
        suggestedCitations.push(
          `${p.clearanceNumber}: ${p.deviceName || p.indication || 'Unknown'} — ${p.decisionOutcome} ${p.decisionDate || ''}`
        );
      }
    }

    const supported =
      warnings.filter(w => w.severity === 'high').length === 0 &&
      precedents.filter(p => ['CLEARED', 'APPROVED'].includes(p.decisionOutcome)).length > 0;

    /* Nothing was consulted, so nothing was judged. Saying "needs support" here
       would be a finding about the claim drawn from the absence of a corpus. */
    const basis: 'checked' | 'no-precedents' =
      precedents.length === 0 && warnings.length === 0 ? 'no-precedents' : 'checked';

    const approved = precedents.filter(p => ['CLEARED', 'APPROVED'].includes(p.decisionOutcome));
    const recommendation =
      basis === 'no-precedents'
        ? registry.consulted && !registry.available
          ? `No precedent was checked against this claim — ${registry.reason ?? 'the FDA registry did not respond'}. Nothing here says the claim is unsupported; it says it is unchecked.`
          : 'No precedent was found to check this claim against, so it has not been assessed either way. Widen the search criteria, ingest a precedent, or add literature references.'
        : supported
          ? `Claim is supported by ${approved.length} approved precedent(s). Include referenced citations.`
          : warnings.length > 0
            ? `Claim requires additional supporting evidence. ${warnings.length} warning(s) identified from historical FDA precedents.`
            : `Checked against ${precedents.length} precedent(s); none of them approved, so the claim is not yet supported by this corpus.`;

    return {
      claim,
      supported,
      precedents: precedents.slice(0, 3),
      warnings,
      suggestedCitations: [...new Set(suggestedCitations)].slice(0, 5),
      recommendation,
      basis,
      registry,
    };
  }

  // ── 6. INGEST: Store a new precedent from CSR or manual entry ──────────

  async ingestPrecedent(
    data: Omit<PrecedentRecord, 'id' | 'similarityScore'>,
    organizationId: number,
    /** Who ingested it. Every ingest was recorded as created_by 'system'. */
    createdBy: string
  ): Promise<string> {
    if (!createdBy) throw new Error('ingestPrecedent requires the person who ingested the precedent');
    // A precedent a tenant ingests is that tenant's: it is written private to
    // its organization, never into the shared public corpus. Refused, not
    // defaulted, when there is no organization to attribute it to.
    const org = precedentOrgId(organizationId);
    if (org === undefined) {
      throw new Error('ingestPrecedent requires the ingesting organization id');
    }
    log.info(`Ingesting precedent: ${data.clearanceNumber || data.deviceName || 'unknown'}`);

    const result = await pool.query(
      `INSERT INTO precedent.regulatory_precedents (
        submission_type, product_type, device_class, therapeutic_area, indication,
        clearance_number, device_name, applicant, decision_date, decision_outcome,
        clearance_type, predicate_device, predicate_k_number, strategy_summary,
        testing_approach, trial_design, sample_size, primary_endpoint, endpoint_met,
        fda_comments, fda_questions, risk_factors, source_documents, source_type,
        confidence_score, created_by, organization_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19,
        $20, $21, $22, $23, $24, $25, $26, $27
      ) RETURNING id`,
      [
        data.submissionType,
        data.productType,
        data.deviceClass,
        data.therapeuticArea,
        data.indication,
        data.clearanceNumber,
        data.deviceName,
        data.applicant,
        data.decisionDate,
        data.decisionOutcome,
        data.clearanceType,
        data.predicateDevice,
        data.predicateKNumber,
        data.strategySummary,
        data.testingApproach,
        data.trialDesign,
        data.sampleSize,
        data.primaryEndpoint,
        data.endpointMet,
        data.fdaComments,
        JSON.stringify(data.fdaQuestions || []),
        JSON.stringify(data.riskFactors || []),
        (data as any).sourceDocuments || [],
        data.sourceType,
        data.confidenceScore,
        createdBy,
        org,
      ]
    );

    return result.rows[0].id;
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private async getPrecedentById(id: string, organizationId?: number): Promise<PrecedentRecord | null> {
    // The unified corpus is keyed by uuid; a K-number is not one. Querying it by
    // id with a K-number raised 22P02, which a catch used to read as "table
    // might not exist". Route by shape instead, apply tenant isolation to every
    // corpus read (compare-by-id used to bypass it), and let real errors surface.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const isolation = buildPrecedentOrgIsolation(organizationId, 2);
    const unified = await pool.query(
      `SELECT * FROM precedent.regulatory_precedents
        WHERE ${isUuid ? 'id = $1' : 'clearance_number = $1'} AND ${isolation.condition}
        LIMIT 1`,
      [id, ...isolation.params]
    );
    if (unified.rows.length > 0) {
      return this.mapPrecedentRow(unified.rows[0]);
    }
    if (isUuid) return null;

    // The public FDA 510(k) clearance universe (created by the set; no tenant key).
    {
      const result = await pool.query(
        `SELECT c.*, p.device_class, p.review_panel
         FROM predicate.fda_510k_clearances c
         LEFT JOIN predicate.fda_product_codes p ON c.product_code = p.code
         WHERE c.k_number = $1`,
        [id]
      );
      if (result.rows.length > 0) {
        const row = result.rows[0];
        return {
          id: row.k_number,
          submissionType: '510(k)',
          productType: 'Device',
          deviceClass: row.device_class || null,
          therapeuticArea: row.review_panel || null,
          indication: null,
          clearanceNumber: row.k_number,
          deviceName: row.device_name,
          applicant: row.applicant,
          decisionDate: row.decision_date?.toISOString?.() || null,
          decisionOutcome: row.decision_code === 'SE' ? 'CLEARED' : row.decision_code || 'UNKNOWN',
          clearanceType: row.clearance_type,
          predicateDevice: null,
          predicateKNumber: null,
          strategySummary: row.txt_content?.substring(0, 500) || null,
          testingApproach: null,
          trialDesign: null,
          sampleSize: null,
          primaryEndpoint: null,
          endpointMet: null,
          fdaComments: null,
          fdaQuestions: [],
          riskFactors: [],
          sourceType: 'FDA_510k',
          confidenceScore: 1.0,
        };
      }
    }

    return null;
  }

  private async readSafetySignals(input: PrecedentSearchInput): Promise<SourceRead<SafetySignalSummary[]>> {
    try {
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIdx = 1;

      if (input.productCode) {
        conditions.push(`c.product_code = $${paramIdx++}`);
        params.push(input.productCode);
      }
      if (input.deviceName) {
        conditions.push(`c.device_name ILIKE $${paramIdx++}`);
        params.push(`%${input.deviceName}%`);
      }

      if (conditions.length === 0) return { ran: false, reason: 'no product code or device name to match on' };

      const result = await pool.query(
        `SELECT s.*, c.device_name
         FROM predicate.predicate_safety_signals s
         JOIN predicate.fda_510k_clearances c ON s.k_number = c.k_number
         WHERE ${conditions.join(' AND ')}
         ORDER BY s.severity_score DESC
         LIMIT 10`,
        params
      );

      return {
        ran: true,
        value: result.rows.map(row => ({
          kNumber: row.k_number,
          deviceName: row.device_name,
          signalType: row.signal_type,
          severity: row.severity_score,
          description: row.description || '',
        })),
      };
    } catch (err: any) {
      log.warn(`Safety signal query failed: ${err.message}`);
      return { ran: false, reason: 'the predicate safety-signal store could not be read' };
    }
  }

  /** Toxic predicates, for a 510(k) with a product code; not applicable otherwise. */
  private async readToxicPredicatesFor(input: PrecedentSearchInput): Promise<SourceRead<number>> {
    if (!['510(k)', '510k'].includes(input.submissionType) || !input.productCode) {
      return { ran: false, reason: 'applies to a 510(k) with a product code' };
    }
    return this.readToxicPredicates(input.productCode);
  }

  private async readToxicPredicates(productCode: string): Promise<SourceRead<number>> {
    try {
      const result = await pool.query(
        `SELECT COUNT(*) as count FROM predicate.toxic_predicates WHERE product_code = $1`,
        [productCode]
      );
      return { ran: true, value: parseInt(result.rows[0]?.count || '0', 10) };
    } catch (err: any) {
      log.warn(`Toxic predicate query failed: ${err.message}`);
      return { ran: false, reason: 'the toxic-predicate store could not be read' };
    }
  }

  private getMitigationForFailureMode(mode: string): string {
    const mitigations: Record<string, string> = {
      'Clinical Gap':
        'Provide comprehensive clinical data. Consider conducting additional clinical studies or systematic literature review.',
      'CMC Inconsistency':
        'Ensure manufacturing consistency. Address all CMC sections per ICH Q-series guidelines.',
      'Safety Signal':
        'Include comprehensive safety analysis. Address known adverse events with risk mitigation measures.',
      'Bioequivalence Failure':
        'Strengthen bioequivalence study design. Consider alternative statistical approaches.',
      'Manufacturing Deficiency':
        'Provide detailed manufacturing process descriptions. Include process validation data.',
    };
    return (
      mitigations[mode] ||
      'Address identified concerns with supporting evidence in your submission.'
    );
  }

  private mapPrecedentRow(row: any): PrecedentRecord {
    return {
      id: row.id,
      submissionType: row.submission_type,
      productType: row.product_type || null,
      deviceClass: row.device_class || null,
      therapeuticArea: row.therapeutic_area || null,
      indication: row.indication || null,
      clearanceNumber: row.clearance_number || null,
      deviceName: row.device_name || null,
      applicant: row.applicant || null,
      decisionDate: row.decision_date?.toISOString?.() || null,
      decisionOutcome: row.decision_outcome,
      clearanceType: row.clearance_type || null,
      predicateDevice: row.predicate_device || null,
      predicateKNumber: row.predicate_k_number || null,
      strategySummary: row.strategy_summary || null,
      testingApproach: row.testing_approach || null,
      trialDesign: row.trial_design || null,
      sampleSize: row.sample_size || null,
      primaryEndpoint: row.primary_endpoint || null,
      endpointMet: row.endpoint_met ?? null,
      fdaComments: row.fda_comments || null,
      fdaQuestions: row.fda_questions || [],
      riskFactors: row.risk_factors || [],
      sourceType: row.source_type || null,
      // A stored precedent that records no confidence has none; it read as
      // full confidence (2026-10-15).
      confidenceScore: row.confidence_score ?? null,
    };
  }

  // ── 7. CRL TRIGGER PATTERNS ─────────────────────────────────────────────

  async analyzeCRLTriggers(input: PrecedentSearchInput): Promise<CRLTriggerResult> {
    const bridgeEntry = resolveToRegistryEntry(input.submissionType);
    if (bridgeEntry) input = { ...input, submissionType: bridgeEntry.applicationType };

    log.info(`Analyzing CRL trigger patterns for ${input.submissionType}`);

    const triggers: CRLTrigger[] = [];

    /* Stored patterns win when the store has any; otherwise the curated arrays
       below stand. See loadCrlPatternsFromStore for why "empty" falls back
       rather than overriding — an unseeded table must never be able to report
       "no CRL risk". */
    const stored = await loadCrlPatternsFromStore((input as { organizationId?: string }).organizationId);
    const crlPatterns: CRLPattern[] = stored ?? [
      // NDA/BLA CRL triggers
      {
        evidenceBasis: 'curated',
        category: 'Efficacy Endpoint Failure',
        submissionTypes: ['NDA', 'BLA', 'MAA'],
        severity: 'critical',
        description: 'Primary endpoint did not meet statistical significance (p > 0.05)',
        mitigation:
          'Consider hierarchical testing, pre-specified subgroup analysis, or adaptive design',
      },
      {
        evidenceBasis: 'curated',
        category: 'Safety Signal — Hepatotoxicity',
        submissionTypes: ['NDA', 'BLA', 'ANDA', '505(b)(2)'],
        severity: 'critical',
        description: 'Drug-induced liver injury (DILI) signals detected in pivotal trials',
        mitigation: "Include Hy's Law analysis, proactive REMS proposal, hepatic monitoring plan",
      },
      {
        evidenceBasis: 'curated',
        category: 'Cardiovascular Risk Signal',
        submissionTypes: ['NDA', 'BLA', 'ANDA'],
        severity: 'high',
        description: 'CV event imbalance (MACE) or QTc prolongation concerns',
        mitigation: 'Pre-submission CV safety meta-analysis, thorough QT study, DSMB charter',
      },
      {
        evidenceBasis: 'curated',
        category: 'Manufacturing Deficiency (CMC)',
        submissionTypes: ['NDA', 'BLA', 'ANDA', '505(b)(2)', 'MAA'],
        severity: 'high',
        description:
          'Incomplete or inadequate CMC data — process validation, stability, specifications',
        mitigation:
          'Complete ICH Q8-Q12 compliance, pre-submission CMC meeting, process validation protocol',
      },
      {
        evidenceBasis: 'curated',
        category: 'Inadequate Clinical Pharmacology',
        submissionTypes: ['NDA', '505(b)(2)', 'ANDA'],
        severity: 'medium',
        description:
          'Missing PK/PD data, drug-drug interaction studies, or special population studies',
        mitigation:
          'Complete PBPK modeling, DDI risk assessment per FDA guidance, renal/hepatic impairment studies',
      },
      {
        evidenceBasis: 'curated',
        category: 'Labeling Deficiency',
        submissionTypes: ['NDA', 'BLA', 'ANDA', '505(b)(2)'],
        severity: 'medium',
        description:
          'Proposed labeling not supported by submitted data or inconsistent with clinical findings',
        mitigation:
          'Align labeling claims with pivotal trial endpoints, FDA structured labeling template',
      },
      {
        evidenceBasis: 'curated',
        category: 'Bioequivalence Failure',
        submissionTypes: ['ANDA', '505(b)(2)'],
        severity: 'critical',
        description: 'Failed to demonstrate bioequivalence to reference listed drug (RLD)',
        mitigation:
          'Review dissolution methodology, consider fed/fasted crossover, consult OGD pre-submission',
      },
      // Device CRL triggers
      {
        evidenceBasis: 'curated',
        category: 'Predicate Device Mismatch',
        submissionTypes: ['510(k)', 'PMA', 'De Novo'],
        severity: 'high',
        description:
          'Substantial equivalence argument not supported — different intended use or technology',
        mitigation:
          'Re-evaluate predicate selection, consider De Novo if no valid predicate exists',
      },
      {
        evidenceBasis: 'curated',
        category: 'Insufficient Clinical Data (Device)',
        submissionTypes: ['PMA', 'De Novo'],
        severity: 'critical',
        description: 'Clinical evidence insufficient to demonstrate safety and effectiveness',
        mitigation: 'Power analysis review, consider supplemental clinical study or registry data',
      },
    ];

    /* A curated checklist, not an assessment of the submission (2026-10-15).
       Each pattern carried a "historical rate" (0.34, 0.41 ...) and a
       confidence (0.92 ...) with no cited source, nudged up 0.05 per objection
       the precedent search returned; and the overall risk was 'high' whenever
       two 'critical' categories applied — which depends on the submission
       type alone: every NDA, BLA, ANDA and 505(b)(2) read "high CRL risk" and
       every 510(k) and IND "low", with nothing of the submission consulted.
       The categories, their curated severity and the objections the
       precedent search actually found remain; the figures and the verdict
       do not. */
    for (const pattern of crlPatterns) {
      if (!pattern.submissionTypes.includes(input.submissionType)) continue;
      const objections = await this.searchAdversarialPrecedents({ ...input, query: pattern.category }, 5);
      triggers.push({
        evidenceBasis: pattern.evidenceBasis,
        category: pattern.category,
        description: pattern.description,
        severity: pattern.severity,
        mitigation: pattern.mitigation,
        supportingObjections: objections.slice(0, 3).map(o => o.question),
      });
    }

    // Grouped by curated severity; the curated order within each.
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    triggers.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return {
      submissionType: input.submissionType,
      triggers,
      totalPatterns: triggers.length,
      criticalCount: triggers.filter(t => t.severity === 'critical').length,
    };
  }

  // ── 8. RTF (REFUSE TO FILE) TRIGGER PATTERNS ─────────────────────────

  async analyzeRTFTriggers(input: PrecedentSearchInput): Promise<RTFTriggerResult> {
    const bridgeEntry = resolveToRegistryEntry(input.submissionType);
    if (bridgeEntry) input = { ...input, submissionType: bridgeEntry.applicationType };

    log.info(`Analyzing RTF trigger patterns for ${input.submissionType}`);

    const rtfChecklist: RTFCheckItem[] = [
      // FDA RTF criteria per 21 CFR 314.101
      {
        section: 'Module 1',
        item: 'Form FDA 356h — Application Form',
        required: true,
        category: 'administrative',
        description: 'Complete and signed FDA form 356h with all required fields',
      },
      {
        section: 'Module 1',
        item: 'Cover Letter with Cross-References',
        required: true,
        category: 'administrative',
        description: 'Cover letter citing prior submissions, DMFs, and cross-references',
      },
      {
        section: 'Module 1',
        item: 'Patent Certification (Para I–IV)',
        required: true,
        category: 'administrative',
        description: 'Patent certifications for listed patents in Orange Book (ANDA/505(b)(2))',
      },
      {
        section: 'Module 2.5',
        item: 'Clinical Overview',
        required: true,
        category: 'clinical',
        description: 'Integrated clinical overview per ICH E1/CTD format',
      },
      {
        section: 'Module 2.7',
        item: 'Clinical Summary',
        required: true,
        category: 'clinical',
        description: 'Summary of clinical pharmacology, efficacy, and safety',
      },
      {
        section: 'Module 3',
        item: 'Quality Overall Summary',
        required: true,
        category: 'cmc',
        description: 'CMC quality data per ICH Q-series and Module 3 requirements',
      },
      {
        section: 'Module 3',
        item: 'Drug Substance Specifications',
        required: true,
        category: 'cmc',
        description: 'Complete API characterization, specifications, and stability data',
      },
      {
        section: 'Module 3',
        item: 'Drug Product Specifications',
        required: true,
        category: 'cmc',
        description: 'Finished product formulation, manufacturing process, and dissolution',
      },
      {
        section: 'Module 4',
        item: 'Nonclinical Study Reports',
        required: true,
        category: 'nonclinical',
        description: 'Toxicology, pharmacology, and ADME study reports',
      },
      {
        section: 'Module 5',
        item: 'Clinical Study Reports',
        required: true,
        category: 'clinical',
        description: 'Full CSRs for pivotal and supportive clinical studies',
      },
      {
        section: 'Module 5',
        item: 'Datasets (CDISC SDTM/ADaM)',
        required: true,
        category: 'clinical',
        description: 'Study datasets in CDISC-compliant format per FDA Technical Conformance Guide',
      },
      {
        section: 'Module 1',
        item: 'Environmental Assessment or Exclusion',
        required: true,
        category: 'administrative',
        description: 'EA or categorical exclusion per 21 CFR 25',
      },
      {
        section: 'Module 1',
        item: 'Pediatric Study Plan or Waiver',
        required: true,
        category: 'clinical',
        description: 'PSP, extrapolation plan, or waiver/deferral documentation (PREA/BPCA)',
      },
      {
        section: 'Module 2.4',
        item: 'Nonclinical Overview',
        required: true,
        category: 'nonclinical',
        description: 'Integrated overview of nonclinical data supporting safety',
      },
      {
        section: 'Module 1',
        item: 'REMS (if applicable)',
        required: false,
        category: 'safety',
        description: 'Risk Evaluation and Mitigation Strategy with ETASU elements',
      },
    ];

    // RTF historical triggers from FDA statistics
    /* Store wins when it has rows; otherwise the curated list stands. Empty,
       missing and throwing all fall back — see loadCrlPatternsFromStore. */
    const storedRtf = await loadRtfTriggersFromStore((input as { organizationId?: string }).organizationId);
    const rtfTriggers: RTFTriggerPattern[] = storedRtf ?? [
      {
        evidenceBasis: 'curated',
        trigger: 'Missing or Incomplete Module 3 (CMC)',
        severity: 'critical',
        description: 'CMC deficiencies are the #1 cause of RTF actions across NDA/BLA/ANDA',
      },
      {
        evidenceBasis: 'curated',
        trigger: 'Absent Pivotal Study CSR',
        severity: 'critical',
        description: 'Pivotal clinical study report not included or grossly incomplete',
      },
      {
        evidenceBasis: 'curated',
        trigger: 'Non-CDISC Datasets',
        severity: 'high',
        description: 'Clinical datasets not submitted in SDTM/ADaM format per FDA binding guidance',
      },
      {
        evidenceBasis: 'curated',
        trigger: 'Incomplete Labeling Package',
        severity: 'high',
        description: 'Draft prescribing information not provided or inconsistent with data',
      },
      {
        evidenceBasis: 'curated',
        trigger: 'Missing Environmental Assessment',
        severity: 'medium',
        description: 'Neither EA nor categorical exclusion provided',
      },
      {
        evidenceBasis: 'curated',
        trigger: 'Incorrect Patent Certifications',
        severity: 'high',
        description:
          'Para IV certification without required notification or incorrect patent listing (ANDA)',
      },
      {
        evidenceBasis: 'curated',
        trigger: 'Missing Pre-submission Meeting Minutes',
        severity: 'medium',
        description: 'No reference to Type A/B/C meeting agreements in cover letter',
      },
    ];

    // Filter to relevant submission types
    const applicableTriggers = rtfTriggers.filter(t => {
      if (input.submissionType === 'ANDA' && t.trigger.includes('Patent')) return true;
      if (['NDA', 'BLA', '505(b)(2)'].includes(input.submissionType)) return true;
      if (input.submissionType === 'MAA') return true;
      return !t.trigger.includes('Patent');
    });

    return {
      submissionType: input.submissionType,
      checklist: rtfChecklist,
      triggers: applicableTriggers,
      totalChecklistItems: rtfChecklist.length,
      requiredItems: rtfChecklist.filter(c => c.required).length,
    };
  }

  // ── 9. EMA DAY 120/180 QUESTION PATTERNS ─────────────────────────────

  async analyzeEMAPatterns(input: PrecedentSearchInput): Promise<EMAPatternResult> {
    const bridgeEntry = resolveToRegistryEntry(input.submissionType);
    if (bridgeEntry) input = { ...input, submissionType: bridgeEntry.applicationType };

    log.info(`Analyzing EMA Day 120/180 question patterns for ${input.submissionType}`);

    // EMA Major Objection patterns by therapeutic area
    const emaPatterns: EMAQuestionPattern[] = [
      // Day 120 (List of Questions)
      {
        phase: 'Day 120',
        category: 'Efficacy — Primary Endpoint',
        severity: 'major_objection',
        pattern:
          'The primary endpoint {endpoint} has not been validated in {therapeutic_area}. Justify the clinical relevance.',
        therapeuticAreas: ['Oncology', 'CNS', 'Cardiovascular', 'Immunology', 'Rare Disease'],
      },
      {
        phase: 'Day 120',
        category: 'Efficacy — Comparator Choice',
        severity: 'major_objection',
        pattern:
          'The chosen comparator ({comparator}) does not represent current standard of care in the EU.',
        therapeuticAreas: ['Oncology', 'Cardiovascular', 'Immunology'],
      },
      {
        phase: 'Day 120',
        category: 'Safety — Long-term Data',
        severity: 'major_objection',
        pattern:
          'Long-term safety data beyond {duration} months is insufficient for a chronic condition.',
        therapeuticAreas: ['CNS', 'Cardiovascular', 'Metabolic', 'Immunology'],
      },
      {
        phase: 'Day 120',
        category: 'Quality — Process Validation',
        severity: 'major_objection',
        pattern:
          'Process validation at commercial scale has not been demonstrated. Provide PPQ data.',
        therapeuticAreas: ['all'],
      },
      {
        phase: 'Day 120',
        category: 'Clinical Pharmacology — DDI',
        severity: 'other_concern',
        pattern:
          'The DDI potential with {interacting_drug_class} has not been adequately characterized.',
        therapeuticAreas: ['Oncology', 'CNS', 'Cardiovascular'],
      },
      // Day 180 (List of Outstanding Issues)
      {
        phase: 'Day 180',
        category: 'Benefit-Risk — Subpopulations',
        severity: 'major_objection',
        pattern: 'The benefit-risk balance in {subpopulation} has not been established.',
        therapeuticAreas: ['Oncology', 'Rare Disease', 'Pediatrics'],
      },
      {
        phase: 'Day 180',
        category: 'Pharmacovigilance — RMP',
        severity: 'other_concern',
        pattern:
          'The Risk Management Plan requires additional risk minimisation measures for {risk}.',
        therapeuticAreas: ['all'],
      },
      {
        phase: 'Day 180',
        category: 'Labelling — SmPC',
        severity: 'other_concern',
        pattern: 'Section 4.{section} of the SmPC is not aligned with the clinical data presented.',
        therapeuticAreas: ['all'],
      },
      {
        phase: 'Day 180',
        category: 'GMP Compliance',
        severity: 'major_objection',
        pattern:
          'GMP compliance at {site} has not been confirmed. Provide GMP certificate or schedule inspection.',
        therapeuticAreas: ['all'],
      },
      {
        phase: 'Day 180',
        category: 'Conditional Approval — Commitments',
        severity: 'other_concern',
        pattern:
          'If conditional MA is sought, the applicant must commit to {study_type} with results by {date}.',
        therapeuticAreas: ['Oncology', 'Rare Disease', 'Infectious Disease'],
      },
    ];

    // Filter by therapeutic area
    const matched = emaPatterns.filter(p => {
      if (p.therapeuticAreas.includes('all')) return true;
      if (!input.therapeuticArea) return true;
      return p.therapeuticAreas.includes(input.therapeuticArea);
    });

    const day120 = matched.filter(p => p.phase === 'Day 120');
    const day180 = matched.filter(p => p.phase === 'Day 180');

    return {
      submissionType: input.submissionType,
      // Curated question patterns. Each carried a frequency (0.45 ...) and a
      // confidence (0.88 ...) with no cited source; neither is served
      // (2026-10-15).
      evidenceBasis: 'curated',
      therapeuticArea: input.therapeuticArea || 'General',
      day120Questions: day120,
      day180Questions: day180,
      majorObjectionCount: matched.filter(p => p.severity === 'major_objection').length,
      otherConcernCount: matched.filter(p => p.severity === 'other_concern').length,
    };
  }

  // ── 10. ADVISORY COMMITTEE RISK FACTORS ───────────────────────────────

  async analyzeAdvisoryCommitteeRisk(
    input: PrecedentSearchInput
  ): Promise<AdvisoryCommitteeResult> {
    const bridgeEntry = resolveToRegistryEntry(input.submissionType);
    if (bridgeEntry) input = { ...input, submissionType: bridgeEntry.applicationType };

    log.info(`Analyzing Advisory Committee risk for ${input.submissionType}`);

    // Advisory Committee triggers — submissions likely to get AdCom. Curated,
    // and labelled so: the store has no applicability to match on (see above).
    const adcomTriggers: AdvisoryCommitteeTrigger[] = [
      {
        evidenceBasis: 'curated',
        trigger: 'First-in-class mechanism of action',
        severity: 'high',
        description: 'Novel MOA with limited clinical experience increases AdCom likelihood',
        submissionTypes: ['NDA', 'BLA'],
        therapeuticAreas: ['Oncology', 'CNS', 'Cardiovascular'],
      },
      {
        evidenceBasis: 'curated',
        trigger: 'Accelerated Approval with surrogate endpoint',
        severity: 'high',
        description: 'Surrogate endpoint-based approvals frequently reviewed by AdCom',
        submissionTypes: ['NDA', 'BLA'],
        therapeuticAreas: ['Oncology', 'Rare Disease'],
      },
      {
        evidenceBasis: 'curated',
        trigger: 'Significant safety signal in pivotal trial',
        severity: 'critical',
        description: 'Identified safety concern that affects benefit-risk assessment',
        submissionTypes: ['NDA', 'BLA', 'PMA'],
        therapeuticAreas: ['all'],
      },
      {
        evidenceBasis: 'curated',
        trigger: 'Pediatric indication with extrapolated efficacy',
        severity: 'medium',
        description: 'Efficacy extrapolation from adult data without dedicated pediatric trial',
        submissionTypes: ['NDA', 'BLA'],
        therapeuticAreas: ['Oncology', 'CNS', 'Rare Disease'],
      },
      {
        evidenceBasis: 'curated',
        trigger: 'REMS with ETASU elements',
        severity: 'medium',
        description: 'REMS involving elements to assure safe use (restricted distribution, etc.)',
        submissionTypes: ['NDA', 'BLA'],
        therapeuticAreas: ['all'],
      },
      {
        evidenceBasis: 'curated',
        trigger: 'Controversial benefit-risk profile',
        severity: 'high',
        description: 'Marginal efficacy with notable side effect burden',
        submissionTypes: ['NDA', 'BLA', 'PMA'],
        therapeuticAreas: ['all'],
      },
      {
        evidenceBasis: 'curated',
        trigger: 'Novel device with no predicate (De Novo)',
        severity: 'medium',
        description: 'First-of-kind device classification requires panel review',
        submissionTypes: ['De Novo', 'PMA'],
        therapeuticAreas: ['all'],
      },
      {
        evidenceBasis: 'curated',
        trigger: 'PMA with novel AI/ML algorithm',
        severity: 'high',
        description: 'AI/ML-based SaMD requiring clinical validation and algorithmic transparency',
        submissionTypes: ['PMA', 'De Novo', '510(k)'],
        therapeuticAreas: ['all'],
      },
    ];

    const matched = adcomTriggers.filter(t => {
      if (!t.submissionTypes.includes(input.submissionType)) return false;
      if (t.therapeuticAreas.includes('all')) return true;
      if (!input.therapeuticArea) return true;
      return t.therapeuticAreas.includes(input.therapeuticArea);
    });

    /* The curated triggers that apply (2026-10-15). Each carried a
       probability (0.85 ...) with no cited source; an overall risk was derived
       from those; and four "historical voting patterns" were uncited
       generalisations served as findings. None is served. */
    return {
      submissionType: input.submissionType,
      triggers: matched,
      totalTriggers: matched.length,
    };
  }
}

// ─── New Types ──────────────────────────────────────────────────────────────

interface CRLPattern {
  /**
   * Where this pattern's authority comes from. `curated` means institutional
   * judgement with no citation attached; `cited` means the row carries the
   * regulatory language it was derived from. A reviewer asking "on what basis?"
   * gets an answer either way — which is the point. An uncited pattern is still
   * useful; an uncited pattern that LOOKS cited is not.
   */
  evidenceBasis: 'curated' | 'cited';
  category: string;
  submissionTypes: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  mitigation: string;
}

export interface CRLTrigger {
  /**
   * Whether this trigger is backed by cited regulatory language or is
   * institutional judgement. Carried onto the OUTPUT deliberately: a basis that
   * exists only on the internal pattern answers nobody's question. "On what
   * basis?" is what a reviewer asks, and an uncited pattern that looks cited is
   * the answer that gets a sponsor into trouble.
   */
  evidenceBasis: 'curated' | 'cited';
  category: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  mitigation: string;
  /** Objections the precedent search found for this category. */
  supportingObjections: string[];
}

export interface CRLTriggerResult {
  submissionType: string;
  triggers: CRLTrigger[];
  totalPatterns: number;
  criticalCount: number;
}

export interface RTFCheckItem {
  section: string;
  item: string;
  required: boolean;
  category: string;
  description: string;
}

interface RTFTriggerPattern {
  /**
   * Where this pattern's authority comes from. `curated` means institutional
   * judgement with no citation attached; `cited` means the row carries the
   * regulatory language it was derived from. A reviewer asking "on what basis?"
   * gets an answer either way — which is the point. An uncited pattern is still
   * useful; an uncited pattern that LOOKS cited is not.
   */
  evidenceBasis: 'curated' | 'cited';
  trigger: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

export interface RTFTriggerResult {
  submissionType: string;
  checklist: RTFCheckItem[];
  triggers: RTFTriggerPattern[];
  totalChecklistItems: number;
  requiredItems: number;
}

export interface EMAQuestionPattern {
  phase: 'Day 120' | 'Day 180';
  category: string;
  severity: 'major_objection' | 'other_concern';
  pattern: string;
  therapeuticAreas: string[];
}

export interface EMAPatternResult {
  submissionType: string;
  evidenceBasis: 'curated';
  therapeuticArea: string;
  day120Questions: EMAQuestionPattern[];
  day180Questions: EMAQuestionPattern[];
  majorObjectionCount: number;
  otherConcernCount: number;
}

export interface AdvisoryCommitteeTrigger {
  /**
   * Where this pattern's authority comes from. `curated` means institutional
   * judgement with no citation attached; `cited` means the row carries the
   * regulatory language it was derived from. A reviewer asking "on what basis?"
   * gets an answer either way — which is the point. An uncited pattern is still
   * useful; an uncited pattern that LOOKS cited is not.
   */
  evidenceBasis: 'curated' | 'cited';
  trigger: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  submissionTypes: string[];
  therapeuticAreas: string[];
}

export interface AdvisoryCommitteeResult {
  submissionType: string;
  triggers: AdvisoryCommitteeTrigger[];
  totalTriggers: number;
}

// Singleton instance
export const precedentEngine = new PrecedentEngine();
