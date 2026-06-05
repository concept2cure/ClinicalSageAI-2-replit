/**
 * Submission Center — typed API contract (request/response shapes)
 *
 * The UI imports these so every call to /api/submissions and
 * /api/ectd-documents is fully typed end-to-end. Entity shapes come from
 * ./database; this file adds the request bodies and response envelopes.
 *
 * Routes are enumerated in SUBMISSION_CENTER_API.md (endpoint → workspace map).
 * Errors are uniform: `{ error: { code, message, details? } }`.
 */

import type {
  Submission,
  EctdSequence,
  SubmissionLeaf,
  SubmissionEvidenceLink,
  ConsistencyFinding,
} from './database';

export interface ApiError {
  error: { code: string; message?: string; details?: unknown };
}

// ── Submissions ──────────────────────────────────────────────────────────────
export interface CreateSubmissionRequest {
  title: string;
  productName?: string;
  applicationType: string;
  clientType: 'pharma' | 'biotech' | 'mdx' | 'ivd';
  primaryRegion: 'fda' | 'eu' | 'jp';
  lifecycleStage?: string;
}
export type SubmissionResponse = Submission;
export type SubmissionListResponse = Submission[];

// ── Sequences ────────────────────────────────────────────────────────────────
export interface CreateSequenceRequest {
  region: 'fda' | 'eu' | 'jp';
  sequenceNumber: string; // 4 digits, e.g. "0000"
  type?: 'original' | 'amendment' | 'response' | 'variation' | 'annual' | 'withdrawal';
}
export interface TransitionSequenceRequest {
  status: 'draft' | 'assembling' | 'validated' | 'frozen' | 'dispatched';
}
export type SequenceResponse = EctdSequence;
export type SequenceListResponse = EctdSequence[];

// ── Builder leaves ───────────────────────────────────────────────────────────
export interface UpsertLeafRequest {
  leafId?: number; // present → update; absent → create
  sectionCode: string;
  title: string;
  granularity?: string;
  lifecycleOp?: 'new' | 'replace' | 'append' | 'delete';
  documentTable?: string;
  documentId?: number;
  parentLeafId?: number;
}
export type LeafResponse = SubmissionLeaf;
export type LeafListResponse = SubmissionLeaf[];

// ── Ingestion (on /api/ectd-documents) ───────────────────────────────────────
export interface ClassifyRequest {
  sequenceId?: number;
}
export interface ClassifyResponse {
  sectionCode: string | null;
  ctdModule: number | null;
  granularity: string | null;
  documentType: string | null;
  confidence: number;
  rationale: string;
}
export interface ExtractRequest {
  sectionCode: string;
  submissionId: number;
}
export interface ExtractResponse {
  structure: Array<{ level: number; heading: string }>;
  extractedClaims: Array<{ text: string; locator: string | null }>;
  referencedSources: string[];
}

// ── Planner (AI) ─────────────────────────────────────────────────────────────
export interface PlanRequest {
  applicationType: string;
  clientType: 'pharma' | 'biotech' | 'mdx' | 'ivd';
  regions: Array<'fda' | 'eu' | 'jp'>;
  productProfile?: string;
}
export interface PlanResponse {
  moduleMap: Array<{ sectionCode: string; title: string; required: boolean }>;
  forms: Array<{ formId: string; region: string; required: boolean }>;
  timeline: Array<{ milestone: string; offsetDays: number }>;
  gaps: Array<{ sectionCode: string; description: string }>;
  dependencies: Array<{ before: string; after: string }>;
}

// ── Validation co-pilot (AI explain) ─────────────────────────────────────────
export interface ValidationExplainRequest {
  region: 'fda' | 'eu' | 'jp';
  findings: Array<{ ruleId?: string; severity: 'error' | 'warning' | 'info'; message: string; leaf?: string }>;
}
export interface ValidationExplainResponse {
  explained: Array<{ ruleId: string | null; severity: string; leaf: string | null; cause: string; fix: string }>;
  summary: string;
  blocking: boolean;
}

// ── Cross-region gap (AI) ────────────────────────────────────────────────────
export interface CrossRegionRequest {
  sourceRegion: 'fda' | 'eu' | 'jp';
  targetRegions: Array<'fda' | 'eu' | 'jp'>;
  applicationType: string;
  sectionsPresent?: string[];
}
export interface CrossRegionResponse {
  perRegion: Array<{
    region: string;
    module1Deltas: string[];
    bridgingNeeded: boolean;
    bridgingRationale: string | null;
    translationScope: string;
    formatConversion: string;
  }>;
}

// ── Dispatch QC gate (AI; does NOT transmit) ─────────────────────────────────
export interface DispatchQcRequest {
  region: 'fda' | 'eu' | 'jp';
  validationErrors: number;
  unresolvedShadowCriticals: number;
  leaves: Array<{ sectionCode: string; operation: string }>;
}
export interface DispatchQcResponse {
  clearedToDispatch: boolean;
  blockers: string[];
  warnings: string[];
  checklist: Array<{ item: string; pass: boolean }>;
}

// ── Truth Engine ─────────────────────────────────────────────────────────────
export interface ProvenanceResponse {
  submissionId: number;
  targetSectionCode: string;
  links: SubmissionEvidenceLink[];
}
export interface ConsistencyCheckRequest {
  dimension: string;
  left: { ref: string; text: string };
  right: Array<{ ref: string; text: string }>;
}
export type ConsistencyResponse = ConsistencyFinding[];

// ── Shadow Review (the moat) ─────────────────────────────────────────────────
export interface ShadowReviewRequest {
  lens?: 'fda_filing' | 'ema_d120' | 'pmda' | 'nb_mdr' | 'nb_ivdr';
}
export interface ShadowReviewRunResponse {
  runId: number;
  rtfRiskScore: number | null;
  crlRiskScore: number | null;
  summary: string;
  findingCount: number;
}
export interface ShadowFindingResponse {
  id: number;
  runId: number;
  dimension: string; // rtf | crl | format | nb
  severity: 'critical' | 'major' | 'minor' | 'info';
  title: string;
  detail: string | null;
  basis: string | null;
  recommendation: string | null;
  leafRef: string | null;
  status: 'open' | 'accepted' | 'fixed' | 'waived';
}
