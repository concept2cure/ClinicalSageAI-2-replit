/**
 * AnA failure learning — tenant-local interaction and correction records.
 *
 * The former cohort aggregator copied a representative correction verbatim to
 * shared active patterns. Whitespace normalization, hashing and a tenant count
 * do not de-identify that text. Existing pattern records carry neither local
 * de-identification evidence nor a named human's approval of the exact shared
 * artifact. Under architecture spec v0.5 §§27–29, automatic extraction, shared
 * correction reads and replay therefore remain held. No configuration or
 * request-body threshold can substitute for that missing promotion evidence.
 *
 * Interaction capture and writer-scoped agency requirements remain available;
 * client corrections never become shared advice through these entry points.
 * @module server/services/intelligence/ana-failure-learning
 */

import crypto from 'crypto';
import { pool } from '../../db/runtime.js';

export const FAILURE_LEARNING_VERSION = '1.1.0';

/** A cohort alone cannot authorize sharing client-derived language. */
export const SHARED_LEARNING_HOLD = 'deidentification_and_human_promotion_required' as const;

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
  // Strip control chars + collapse whitespace + truncate. The control-char
  // range is exactly what we mean to match here; eslint's no-control-regex
  // rule is too conservative for this sanitizer.
  const cleaned = text
    // eslint-disable-next-line no-control-regex
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

// ─── Pattern extraction (held until reviewed de-identification exists) ───────

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
  readonly holdReason?: typeof SHARED_LEARNING_HOLD;
}

/**
 * Preserve the extraction contract without inspecting or publishing tenant text.
 * A future QMS-backed promotion path must attest de-identification, tenant
 * contribution permission, cohort support and a named human's exact-artifact
 * review. None exists on failure_patterns today; do not invent one from status.
 */
export async function extractFailurePatterns(_opts: ExtractPatternsOptions = {}): Promise<ExtractPatternsResult> {
  return { evaluated: 0, promoted: 0, suppressed: 0, holdReason: SHARED_LEARNING_HOLD };
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
 * Legacy active rows may contain a customer's original correction. Neither
 * status='active' nor correction_source establishes reviewed de-identification.
 * Keep them out of all generation paths until promotion evidence is available.
 */
export async function getSuggestedCorrections(_query: {
  agency: string;
  documentType: string;
  intent: string;
  limit?: number;
}): Promise<SuggestedCorrection[]> {
  return [];
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
 * Return only the writer organization's agency requirements. Curator validation
 * confirms a requirement; it does not attest de-identification for global reuse.
 * Ownerless legacy records have no safe tenant attribution and remain hidden.
 */
export async function getAgencyRequirements(query: {
  organizationId: number;
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
        AND organization_id = $4
        AND (validation_status = 'validated'
             OR ($3::boolean AND validation_status = 'unvalidated'))
      ORDER BY confidence DESC, occurrence_count DESC`,
    [agency, documentType, include, query.organizationId],
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
 * by curator action or recorded as a tenant-local unvalidated proposal. Neither
 * path authorizes cross-tenant reuse without a separate de-identification gate.
 *
 * The requirement is recorded 'validated' only when `curator` is given: a user
 * the caller has verified, from the authenticated session, holds platform
 * curator standing. Otherwise it is 'unvalidated' with no validator.
 * 2026-10-15: the route passed the request body's `validateImmediately` and
 * free-text `validatedBy`, so any member of any tenant could mint a 'validated'
 * rule under any name, served to every tenant.
 *
 * `organizationId` is the writer's organization, from the authenticated
 * session; all requirements remain in that organization pending shared promotion.
 */
export async function promotePatternToRequirement(params: {
  organizationId: number;
  patternId: string;
  requirementSummary: string;
  requirementDetail?: string;
  submissionType?: string;
  curator?: { readonly userId: number } | null;
}): Promise<{ requirementId: string; validationStatus: 'validated' | 'unvalidated' }> {
  const curatorId = params.curator && Number.isSafeInteger(params.curator.userId) && params.curator.userId > 0
    ? params.curator.userId
    : null;
  const validationStatus = curatorId === null ? 'unvalidated' : 'validated';
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
       validation_status, validated_by, validated_at, organization_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
               $10, $11, CASE WHEN $10 = 'validated' THEN NOW() ELSE NULL END, $12)
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
      validationStatus,
      curatorId === null ? null : String(curatorId),
      params.organizationId,
    ],
  );
  return { requirementId: result.rows[0].id, validationStatus };
}
