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
  documentType?: string;
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
  /** When set, the gate inputs below are recomputed SERVER-SIDE from this
   *  sequence's canonical core and the client-supplied numbers are ignored. */
  sequenceId?: number;
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

// ── Authoring (section-generation, SSE) ──────────────────────────────────────
export interface GenerateSectionRequest {
  sectionCode: string;
  evidence: Array<{ id: string; source: string; text: string }>;
  productContext?: string;
}
/**
 * SSE stream from POST /api/submissions/:id/sections/generate:
 *   event: chunk  data: { text }            // repeated, as tokens arrive
 *   event: done   data: GenerateSectionResult
 *   event: error  data: { code, message }
 */
export interface GenerateSectionChunk {
  text: string;
}
export interface GenerateSectionResult {
  documentId: number; // the persisted governed draft (coauthor_documents)
  sectionCode: string;
  body: string;
  citations: Array<{ claim: string; evidenceId: string }>;
  ungrounded: string[];
}

// ── Region profiles (GET /api/region-profiles[/:region]) ─────────────────────
export interface RegionProfileResponse {
  region: 'fda' | 'eu' | 'jp';
  agency: string; // FDA | EMA | PMDA
  language: string;
  currency: string;
  pathways: string[];
  module1Sections: Array<{
    number: string;
    title: string;
    titleLocal?: string;
    required: boolean;
    description: string;
    childSections?: RegionProfileResponse['module1Sections'];
  }>;
  forms: Array<{ name: string; formId?: string; required: boolean; description: string; url?: string }>;
  specificRequirements: string[];
  validationRuleCount: number;
}

// ── Capabilities (GET /api/submissions/capabilities) ─────────────────────────
export interface CapabilitiesResponse {
  environment: 'staging' | 'production';
  gateways: Array<{ configured: boolean; [k: string]: unknown }>;
  gatewaysConfigured: number;
  // Keyed by the canonical workspace ids in submission-ui.ts (SUBMISSION_WORKSPACES).
  workspaces: {
    portfolio: boolean;
    planner: boolean;
    builder: boolean;
    sequences: boolean;
    validation: boolean;
    'shadow-review': boolean;
    'cross-region': boolean;
    dispatch: boolean;
  };
  // Capability flags that are not workspaces.
  features: {
    publishTransmit: boolean;
  };
}

// ── Pathway readiness (GET /api/submissions/sequences/:seqId/pathway-readiness) ─
export type Pathway = 'ctis' | 'mdr' | 'ivdr' | 'estar_510k' | 'estar_de_novo' | 'pmda_shonin';
export interface PathwayReadinessResponse {
  pathway: Pathway;
  ready: boolean;
  /** Missing required slot ids (CTIS uses 'I:<id>' / 'II:<state>:<id>' prefixes). */
  missingRequired: string[];
  /** Full engine result (section/slot breakdown) — shape varies by pathway. */
  detail: unknown;
}

// ── Device technical file (GET /sequences/:seqId/technical-file?regulation=mdr|ivdr) ─
// The assembled EU MDR/IVDR technical-documentation table-of-contents (device
// equivalent of the eCTD index). Deterministic; maps + reports gaps.
export interface TechnicalFileEntry {
  path: string;
  id: string;
  label: string;
  annex: string;
  required: boolean;
  status: 'present' | 'missing' | 'optional-absent';
  sources: string[];
}
export interface TechnicalFileResponse {
  regulation: 'mdr' | 'ivdr';
  framework: string;
  productName?: string;
  manufacturer?: string;
  generatedFrom: 'canonical-core';
  ready: boolean;
  totals: { sections: number; requiredPresent: number; requiredMissing: number };
  entries: TechnicalFileEntry[];
}

// ── Device technical-file ASSEMBLE (POST .../technical-file/assemble) ─────────
// Materializes the MDR/IVDR technical-file ZIP from the canonical core. Sanitized
// descriptor — no server paths. Does NOT transmit.
export interface TechnicalFileAssembleRequest {
  regulation: 'mdr' | 'ivdr';
  applicationId?: string;
  productName?: string;
  manufacturer?: string;
}
export interface TechnicalFileAssembleResponse {
  ok: true;
  regulation: 'mdr' | 'ivdr';
  ready: boolean;
  sha256: string;
  sizeBytes: number;
  fileCount: number;
  materialized: number;
  skipped: Array<{ sectionId: string; source: string; reason: string }>;
}

// ── Dispatch readiness (GET /api/submissions/sequences/:seqId/dispatch-readiness) ─
// Deterministic, SERVER-COMPUTED gate inputs — the tamper-proof counterpart to
// the AI dispatch-qc advisory.
export interface DispatchReadinessFinding {
  severity: 'error' | 'warning' | 'info';
  code: string;
  sectionCode: string | null;
  message: string;
}
export interface DispatchReadinessResponse {
  sequenceId: number;
  region: 'fda' | 'eu' | 'jp';
  sequenceStatus: string;
  /** Authoritative error count computed from the canonical leaves. */
  validationErrors: number;
  /** Open critical Shadow Review findings counted from the database. */
  unacknowledgedShadowCriticals: number;
  /** Completed Shadow Review runs for this sequence. */
  shadowReviewRunCount: number;
  /** Gate clear but no Shadow Review has run — dispatch allowed, never reviewed. */
  shadowReviewMissing: boolean;
  /** Hard gate verdict over the server-computed inputs. */
  gate: { cleared: boolean; blockers: string[] };
  readiness: {
    errors: number;
    warnings: number;
    infos: number;
    findings: DispatchReadinessFinding[];
  };
  leafCount: number;
}

// ── Governed freeze / dispatch (POST /sequences/:seqId/{freeze,dispatch}) ─────
// The SUBMIT step. Obtain the signatureActionId first from
// POST /api/c2c/actions/sign with target "ectd-sequence:<seqId>". The server
// enforces the e-signature AND the deterministic dispatch gate atomically; a
// blocked gate returns 422 DISPATCH_BLOCKED. Response is the updated sequence.
export interface GovernedTransitionRequest {
  /** actionId returned by POST /api/c2c/actions/sign for this sequence target. */
  signatureActionId: string;
}
export type GovernedTransitionResponse = EctdSequence;

// ── Transmit (POST /sequences/:seqId/transmit) ────────────────────────────────
// The final step. Requires the sequence to be dispatched + a signatureActionId
// (from /api/c2c/actions/sign on "ectd-sequence:<seqId>") + a clear dispatch gate.
// Real transmission only occurs when the org has gateway credentials; otherwise
// `transmitted` is false with `reason: "gateway_not_configured"`.
export interface TransmitRequest {
  signatureActionId: string;
  environment?: 'staging' | 'production';
  applicationId?: string;
  sponsorId?: string;
  sponsorName?: string;
}
export interface TransmitResponse {
  transmitted: boolean;
  reason?: string;
  region: string;
  gateway: string;
  transmittalId?: number;
  transmissionId?: string | null;
  status?: string;
  dispatchStatus: string;
}

// ── Assemble (POST /api/submissions/sequences/:seqId/assemble) ────────────────
export interface AssembleRequest {
  applicationId?: string;
  sponsorId?: string;
  sponsorName?: string;
}
export interface AssembleResponse {
  ok: true;
  sha256: string;
  format: string;
  sizeBytes: number;
  /** Number of canonical leaves materialized into the package. */
  materialized: number;
  /** Leaves with no resolvable source file, excluded from the package. */
  skipped: Array<{ sectionCode: string; reason: string }>;
}
