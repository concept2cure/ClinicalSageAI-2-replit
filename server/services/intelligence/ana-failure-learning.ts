/**
 * AnA failure learning — repeated mistakes become cross-tenant memory.
 *
 * Captures every AnA interaction outcome (accept / edit / reject / regenerate
 * / abandon) and, when failures cluster on the same fingerprint, promotes
 * them to `intelligence.failure_patterns` with a suggested correction.
 * AnA consults these patterns on every future relevant turn so the model
 * self-corrects without code changes.
 *
 * Privacy controls:
 *   - Per-interaction rows are tenant-scoped and never leave the tenant.
 *   - The cross-tenant `failure_patterns` table only publishes a pattern once
 *     ≥ 3 distinct tenants have hit it (k-anonymity, same gate as the
 *     network risk priors).
 *   - The pattern_fingerprint is a deterministic SHA-256 over canonicalized
 *     dimensions; no raw text crosses tenant boundaries until the consensus
 *     correction is published.
 *
 * The fingerprint is intentionally coarse: agency + document_type +
 * intent_class + normalized prompt summary. Coarse fingerprints cluster
 * better; fine ones never promote.
 *
 * @module server/services/intelligence/ana-failure-learning
 */

import crypto from 'crypto';
import { pool } from '../../db/runtime.js';
import { createScopedLogger } from '../../utils/logger.js';

const log = createScopedLogger('ana-failure-learning');

export const FAILURE_LEARNING_VERSION = '1.0.0';

// k-anonymity threshold for promoting a pattern to cross-tenant memory.
export const MIN_TENANT_COUNT = 3;
// Minimum aggregate failures before promotion considered.
export const MIN_FAILURE_COUNT = 5;
// Fraction of failures that must agree on a single correction.
export const CORRECTION_QUORUM_THRESHOLD = 0.5;

// ─── Enums ───────────────────────────────────────────────────────────────────

export const OUTCOMES = ['accepted', 'edited', 'rejected', 'regenerated', 'abandoned'] as const;
export type Outcome = typeof OUTCOMES[number];

export const DOCUMENT_TYPES = [
  'protocol', 'ib', 'cmc', 'labeling', 'cer',
  'response_letter', 'meeting_minutes', 'section', 'briefing_package',
  'other',
] as const;
export type DocumentType = typeof DOCUMENT_TYPES[number];

export const INTENT_CLASSES = [
  'draft', 'review', 'explain', 'fix', 'compare', 'extract', 'plan', 'other',
] as const;
export type IntentClass = typeof INTENT_CLASSES[number];

export const AGENCIES = [
  'fda', 'ema', 'pmda', 'mhra', 'hc', 'swissmedic', 'other',
] as const;
export type Agency = typeof AGENCIES[number];

// ─── Pure helpers (unit-testable, no DB access) ──────────────────────────────

const SUMMARY_MAX = 500;

export function sanitizeSummary(text: string | null | undefined): string | null {
  if (!text) return null;
  // Strip control chars + collapse whitespace + truncate.
  const cleaned = text
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length === 0) return null;
  return cleaned.length > SUMMARY_MAX ? cleaned.slice(0, SUMMARY_MAX) : cleaned;
}

export function isFailure(outcome: Outcome): boolean {
  return outcome !== 'accepted';
}

export function binAgencyForInteraction(raw: string | null | undefined): Agency {
  if (!raw) return 'other';
  const s = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (s === 'fda') return 'fda';
  if (s === 'ema') return 'ema';
  if (s === 'pmda') return 'pmda';
  if (s === 'mhra') return 'mhra';
  if (s === 'hc' || s === 'healthcanada') return 'hc';
  if (s === 'swissmedic') return 'swissmedic';
  return 'other';
}

export function binDocumentType(raw: string | null | undefined): DocumentType {
  if (!raw) return 'other';
  const s = raw.toLowerCase();
  if (s.includes('protocol')) return 'protocol';
  if (s.includes('investigator') && s.includes('brochure')) return 'ib';
  if (s === 'ib') return 'ib';
  if (s.includes('cmc') || s.includes('module 3') || s.includes('m3')) return 'cmc';
  if (s.includes('label') || s.includes('package insert') || s.includes('uspi')) return 'labeling';
  if (s.includes('cer') || s.includes('clinical evaluation')) return 'cer';
  if (s.includes('response') && s.includes('letter')) return 'response_letter';
  if (s.includes('minutes') || s.includes('meeting')) return 'meeting_minutes';
  if (s.includes('briefing') || s.includes('pre-sub')) return 'briefing_package';
  if (s.includes('section')) return 'section';
  return 'other';
}

export function binIntent(raw: string | null | undefined): IntentClass {
  if (!raw) return 'other';
  const s = raw.toLowerCase();
  if (s.includes('draft') || s.includes('write') || s.includes('generate')) return 'draft';
  if (s.includes('review') || s.includes('check') || s.includes('audit')) return 'review';
  if (s.includes('explain') || s.includes('what is') || s.includes('describe')) return 'explain';
  if (s.includes('fix') || s.includes('correct') || s.includes('repair')) return 'fix';
  if (s.includes('compare') || s.includes('diff')) return 'compare';
  if (s.includes('extract') || s.includes('pull')) return 'extract';
  if (s.includes('plan') || s.includes('strategy') || s.includes('approach')) return 'plan';
  return 'other';
}

/**
 * Normalize a prompt summary into a token bag suitable for fingerprinting.
 * The fingerprint must be stable across paraphrases of the same intent,
 * which means: lowercase, drop fillers, sort tokens, dedupe.
 */
export function normalizeForFingerprint(summary: string | null | undefined): string {
  if (!summary) return '';
  const stop = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'with', 'to', 'of', 'in', 'on',
    'for', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'i', 'you', 'we', 'it', 'this', 'that', 'these', 'those',
    'please', 'can', 'could', 'would', 'should',
  ]);
  const tokens = summary
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0 && !stop.has(t) && t.length <= 20);
  // Dedupe + sort for paraphrase-stable hash.
  const dedup = Array.from(new Set(tokens)).sort();
  // Keep at most 20 tokens — long tails don't improve clustering and they
  // hurt cross-paraphrase stability.
  return dedup.slice(0, 20).join(' ');
}

/**
 * SHA-256 over the canonical tuple. Deterministic and tenant-independent.
 */
export function buildFingerprint(params: {
  agency: Agency;
  documentType: DocumentType;
  intentClass: IntentClass;
  promptSummary: string | null | undefined;
}): string {
  const canonical = [
    params.agency,
    params.documentType,
    params.intentClass,
    normalizeForFingerprint(params.promptSummary),
  ].join('|');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

// ─── Recording (DB-backed) ───────────────────────────────────────────────────

export interface RecordInteractionInput {
  readonly organizationId: number;
  readonly projectId?: number;
  readonly userId?: number;
  readonly sessionId?: string;
  readonly artifactId?: string;
  readonly agency: string;
  readonly documentType: string;
  readonly submissionType?: string;
  readonly intent: string;
  readonly outcome: Outcome;
  readonly anaConfidence?: number;
  readonly userCorrected?: boolean;
  readonly promptSummary?: string;
  readonly responseSummary?: string;
  readonly correctionText?: string;
}

export interface RecordInteractionResult {
  readonly interactionId: string;
  readonly fingerprint: string;
  readonly isFailure: boolean;
}

export async function recordInteraction(input: RecordInteractionInput): Promise<RecordInteractionResult> {
  const agency = binAgencyForInteraction(input.agency);
  const documentType = binDocumentType(input.documentType);
  const intent = binIntent(input.intent);
  const promptSummary = sanitizeSummary(input.promptSummary);
  const responseSummary = sanitizeSummary(input.responseSummary);
  const correctionText = sanitizeSummary(input.correctionText);
  const fingerprint = buildFingerprint({ agency, documentType, intentClass: intent, promptSummary });
  const failure = isFailure(input.outcome);

  const result = await pool.query<{ id: string }>(
    `INSERT INTO intelligence.ana_interactions (
       organization_id, project_id, user_id, session_id, artifact_id,
       agency, document_type, submission_type, intent_class,
       outcome, ana_confidence, user_corrected,
       prompt_summary, response_summary, correction_text,
       pattern_fingerprint
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING id`,
    [
      input.organizationId,
      input.projectId ?? null,
      input.userId ?? null,
      input.sessionId ?? null,
      input.artifactId ?? null,
      agency,
      documentType,
      input.submissionType ?? null,
      intent,
      input.outcome,
      input.anaConfidence ?? null,
      input.userCorrected ?? !!correctionText,
      promptSummary,
      responseSummary,
      correctionText,
      fingerprint,
    ],
  );

  return {
    interactionId: result.rows[0].id,
    fingerprint,
    isFailure: failure,
  };
}

// ─── Pattern extraction (cross-tenant, with k-anonymity gate) ────────────────

interface RawClusterRow {
  pattern_fingerprint: string;
  agency: Agency;
  document_type: DocumentType;
  intent_class: IntentClass;
  failure_count: number;
  tenant_count: number;
  corrections: Array<{ text: string; count: number }>;
  last_seen_at: string;
}

/**
 * Aggregate the most common correction text for a fingerprint cluster.
 *
 * We tokenize and bag-of-words match instead of exact-string matching, so
 * "Add PIP statement to §1.6" and "Add a PIP statement in 1.6" cluster
 * together. Returns the highest-frequency canonical correction and the
 * fraction of failures that matched it.
 */
function pickConsensusCorrection(corrections: Array<{ text: string; count: number }>): {
  text: string;
  quorum: number;
} | null {
  if (corrections.length === 0) return null;

  const buckets = new Map<string, { repr: string; count: number }>();
  for (const c of corrections) {
    const key = normalizeForFingerprint(c.text);
    if (!key) continue;
    const existing = buckets.get(key);
    if (existing) existing.count += c.count;
    else buckets.set(key, { repr: c.text, count: c.count });
  }

  let best: { repr: string; count: number } | null = null;
  let total = 0;
  for (const b of buckets.values()) {
    total += b.count;
    if (!best || b.count > best.count) best = b;
  }
  if (!best || total === 0) return null;
  return { text: best.repr, quorum: best.count / total };
}

export interface ExtractPatternsOptions {
  readonly minTenantCount?: number;
  readonly minFailureCount?: number;
  readonly correctionQuorum?: number;
  readonly lookbackDays?: number;
}

export interface ExtractPatternsResult {
  readonly evaluated: number;
  readonly promoted: number;
  readonly suppressed: number;
}

export async function extractFailurePatterns(opts: ExtractPatternsOptions = {}): Promise<ExtractPatternsResult> {
  const minTenants = opts.minTenantCount ?? MIN_TENANT_COUNT;
  const minFailures = opts.minFailureCount ?? MIN_FAILURE_COUNT;
  const quorumThreshold = opts.correctionQuorum ?? CORRECTION_QUORUM_THRESHOLD;
  const lookbackDays = opts.lookbackDays ?? 90;

  // Cluster by fingerprint over the lookback window. We pre-aggregate the
  // candidate corrections per fingerprint so we don't pull raw rows back
  // through application memory.
  const raw = await pool.query<RawClusterRow>(
    `WITH failures AS (
       SELECT pattern_fingerprint, agency, document_type, intent_class,
              organization_id, correction_text, recorded_at
         FROM intelligence.ana_interactions
        WHERE outcome <> 'accepted'
          AND recorded_at > NOW() - ($1 || ' days')::interval
     ),
     correction_counts AS (
       SELECT pattern_fingerprint,
              correction_text,
              COUNT(*)::int AS cnt
         FROM failures
        WHERE correction_text IS NOT NULL AND length(correction_text) > 0
        GROUP BY pattern_fingerprint, correction_text
     ),
     fingerprint_correction_json AS (
       SELECT pattern_fingerprint,
              jsonb_agg(jsonb_build_object('text', correction_text, 'count', cnt)
                        ORDER BY cnt DESC) AS corrections
         FROM correction_counts
        GROUP BY pattern_fingerprint
     )
     SELECT f.pattern_fingerprint,
            MIN(f.agency)        AS agency,
            MIN(f.document_type) AS document_type,
            MIN(f.intent_class)  AS intent_class,
            COUNT(*)::int                       AS failure_count,
            COUNT(DISTINCT f.organization_id)::int AS tenant_count,
            COALESCE(fc.corrections, '[]'::jsonb) AS corrections,
            MAX(f.recorded_at)::text            AS last_seen_at
       FROM failures f
       LEFT JOIN fingerprint_correction_json fc USING (pattern_fingerprint)
      GROUP BY f.pattern_fingerprint, fc.corrections`,
    [String(lookbackDays)],
  );

  let evaluated = 0;
  let promoted = 0;
  let suppressed = 0;

  for (const row of raw.rows) {
    evaluated += 1;
    if (row.tenant_count < minTenants || row.failure_count < minFailures) {
      suppressed += 1;
      continue;
    }
    const consensus = pickConsensusCorrection(row.corrections ?? []);
    if (!consensus || consensus.quorum < quorumThreshold) {
      suppressed += 1;
      continue;
    }

    const confidence = Math.min(
      1,
      0.4 * consensus.quorum
        + 0.4 * Math.min(1, row.tenant_count / 10)
        + 0.2 * Math.min(1, row.failure_count / 30),
    );

    await pool.query(
      `INSERT INTO intelligence.failure_patterns (
         pattern_fingerprint, agency, document_type, intent_class,
         suggested_correction, correction_source,
         failure_count, tenant_count, correction_quorum, confidence,
         last_seen_at, extracted_at, extractor_version, status
       ) VALUES ($1, $2, $3, $4, $5, 'aggregated_consensus',
                 $6, $7, $8, $9, $10::timestamptz, NOW(), $11, 'active')
       ON CONFLICT (pattern_fingerprint) DO UPDATE SET
         suggested_correction = EXCLUDED.suggested_correction,
         failure_count = EXCLUDED.failure_count,
         tenant_count = EXCLUDED.tenant_count,
         correction_quorum = EXCLUDED.correction_quorum,
         confidence = EXCLUDED.confidence,
         last_seen_at = EXCLUDED.last_seen_at,
         extracted_at = NOW(),
         extractor_version = EXCLUDED.extractor_version,
         status = CASE WHEN intelligence.failure_patterns.status = 'curator_disabled'
                       THEN 'curator_disabled' ELSE 'active' END`,
      [
        row.pattern_fingerprint,
        row.agency,
        row.document_type,
        row.intent_class,
        consensus.text,
        row.failure_count,
        row.tenant_count,
        consensus.quorum,
        confidence,
        row.last_seen_at,
        `failure-learning@${FAILURE_LEARNING_VERSION}`,
      ],
    );
    promoted += 1;
  }

  if (promoted > 0 || evaluated > 0) {
    log.info(`Failure patterns extracted: evaluated=${evaluated} promoted=${promoted} suppressed=${suppressed}`);
  }
  return { evaluated, promoted, suppressed };
}

// ─── Read path (called by AnA on every relevant turn) ────────────────────────

export interface SuggestedCorrection {
  readonly id: string;
  readonly suggestedCorrection: string;
  readonly confidence: number;
  readonly tenantCount: number;
  readonly failureCount: number;
  readonly correctionQuorum: number;
  readonly lastSeenAt: string;
}

/**
 * Return any active corrections relevant to the current AnA turn, ranked by
 * confidence. AnA's generation path should prepend the top-K corrections to
 * its system prompt so the response self-corrects against known failures.
 */
export async function getSuggestedCorrections(query: {
  agency: string;
  documentType: string;
  intent: string;
  limit?: number;
}): Promise<SuggestedCorrection[]> {
  const agency = binAgencyForInteraction(query.agency);
  const documentType = binDocumentType(query.documentType);
  const intent = binIntent(query.intent);
  const limit = Math.min(50, Math.max(1, query.limit ?? 5));

  const result = await pool.query(
    `SELECT id, suggested_correction, confidence,
            tenant_count, failure_count, correction_quorum, last_seen_at::text
       FROM intelligence.failure_patterns
      WHERE status = 'active'
        AND agency = $1
        AND document_type = $2
        AND intent_class = $3
      ORDER BY confidence DESC, failure_count DESC
      LIMIT $4`,
    [agency, documentType, intent, limit],
  );

  return result.rows.map(r => ({
    id: r.id,
    suggestedCorrection: r.suggested_correction,
    confidence: parseFloat(r.confidence),
    tenantCount: r.tenant_count,
    failureCount: r.failure_count,
    correctionQuorum: parseFloat(r.correction_quorum),
    lastSeenAt: r.last_seen_at,
  }));
}

// ─── Agency-requirement discovery ────────────────────────────────────────────

export interface AgencyRequirement {
  readonly id: string;
  readonly agency: Agency;
  readonly documentType: DocumentType;
  readonly submissionType: string | null;
  readonly requirementSummary: string;
  readonly requirementDetail: string | null;
  readonly tenantCount: number;
  readonly occurrenceCount: number;
  readonly confidence: number;
  readonly validationStatus: 'unvalidated' | 'validated' | 'rejected';
  readonly discoveredAt: string;
  readonly lastSeenAt: string;
}

/**
 * Surface agency-specific requirements discovered from interaction patterns.
 * Includes both validated rules (canonical) and unvalidated suggestions
 * (lower confidence) — the UI filters by validation status as needed.
 */
export async function getAgencyRequirements(query: {
  agency: string;
  documentType?: string;
  includeUnvalidated?: boolean;
}): Promise<AgencyRequirement[]> {
  const agency = binAgencyForInteraction(query.agency);
  const documentType = query.documentType ? binDocumentType(query.documentType) : null;
  const include = query.includeUnvalidated ?? true;

  const result = await pool.query(
    `SELECT id, agency, document_type, submission_type,
            requirement_summary, requirement_detail,
            tenant_count, occurrence_count, confidence,
            validation_status, discovered_at::text, last_seen_at::text
       FROM intelligence.agency_requirements
      WHERE agency = $1
        AND ($2::text IS NULL OR document_type = $2)
        AND ($3::boolean OR validation_status = 'validated')
        AND validation_status <> 'rejected'
      ORDER BY confidence DESC, occurrence_count DESC`,
    [agency, documentType, include],
  );

  return result.rows.map(r => ({
    id: r.id,
    agency: r.agency,
    documentType: r.document_type,
    submissionType: r.submission_type,
    requirementSummary: r.requirement_summary,
    requirementDetail: r.requirement_detail,
    tenantCount: r.tenant_count,
    occurrenceCount: r.occurrence_count,
    confidence: parseFloat(r.confidence),
    validationStatus: r.validation_status,
    discoveredAt: r.discovered_at,
    lastSeenAt: r.last_seen_at,
  }));
}

/**
 * Promote a failure pattern into a structured agency requirement. Called
 * either automatically (high-confidence patterns where the correction reads
 * as a declarative rule) or by curator action.
 */
export async function promotePatternToRequirement(params: {
  patternId: string;
  requirementSummary: string;
  requirementDetail?: string;
  submissionType?: string;
  validateImmediately?: boolean;
  validatedBy?: string;
}): Promise<{ requirementId: string }> {
  const pattern = await pool.query(
    `SELECT id, agency, document_type, tenant_count, failure_count, confidence
       FROM intelligence.failure_patterns WHERE id = $1 AND status = 'active'`,
    [params.patternId],
  );
  if (pattern.rows.length === 0) {
    throw new Error(`Pattern ${params.patternId} not found or not active`);
  }
  const p = pattern.rows[0];
  const result = await pool.query<{ id: string }>(
    `INSERT INTO intelligence.agency_requirements (
       agency, document_type, submission_type,
       requirement_summary, requirement_detail,
       source_pattern_id, tenant_count, occurrence_count, confidence,
       validation_status, validated_by, validated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
               $10, $11, CASE WHEN $10 = 'validated' THEN NOW() ELSE NULL END)
     RETURNING id`,
    [
      p.agency,
      p.document_type,
      params.submissionType ?? null,
      params.requirementSummary,
      params.requirementDetail ?? null,
      p.id,
      p.tenant_count,
      p.failure_count,
      parseFloat(p.confidence),
      params.validateImmediately ? 'validated' : 'unvalidated',
      params.validatedBy ?? null,
    ],
  );
  return { requirementId: result.rows[0].id };
}
