/**
 * Translation Platform — typed API contract (request/response shapes + DTOs)
 *
 * Shared, runtime-free type module: safe to import from server, client,
 * scripts, and tests. The UI imports these so every call to /api/translation
 * is typed end-to-end; the server imports them so service functions and route
 * handlers agree on the wire shape.
 *
 * REGULATED-PLATFORM INVARIANTS encoded here (enforced in the workflow state
 * machine in server/services/translation/*):
 *  - Machine translation is a DRAFT ACCELERATOR ONLY. A segment whose method
 *    is 'machine' can NEVER reach 'approved'. The only approvable terminal
 *    states require human post-edit ('mt_postedited' or 'human') plus
 *    back-translation evidence. See TranslationSegment.status / .provenance.
 *  - Identifiers in the do-not-translate (DNT) set — regulatory citations
 *    (21 CFR, ICH E6(R2)), eCTD module labels (M1..M5), agency names
 *    (FDA/EMA/PMDA), INN / drug names, MedDRA terms, codes, JSON keys, slash
 *    commands — are never machine-translated. They are masked before
 *    translation and restored after (mirrors the principle in
 *    server/services/ana-ri/locale-overlays.ts: "translate meaning, not
 *    identifiers"). The GlossaryTerm.doNotTranslate flag carries that intent.
 *  - Every segment carries full Part-11 provenance (source hash, engine/version,
 *    post-editor, reviewer, back-translation result, timestamps) and is
 *    tenant-isolated via organizationId.
 *
 * Errors are uniform: `{ error: { code, message?, details? } }`.
 *
 * @module shared/types/translation
 */

// ── Error envelope (identical shape to shared/types/submission-api.ts) ───────
export interface ApiError {
  error: { code: string; message?: string; details?: unknown };
}

// ── Languages ────────────────────────────────────────────────────────────────
/**
 * BCP-47 primary subtags. Mirrors the canonical registry in
 * client/src/i18n/languages.ts (en + 17 target locales = the 18-code set the
 * app supports). Kept as a standalone union so this contract has no runtime
 * dependency on the client registry.
 */
export type LanguageCode =
  | 'en' | 'fr' | 'de' | 'ja' | 'zh' | 'ko' | 'es' | 'pt' | 'it' | 'nl' | 'pl' | 'sv' | 'da'
  | 'fi' | 'cs' | 'el' | 'hu' | 'ro';

/** English is the canonical source; the remaining codes are valid targets. */
export type SourceLanguage = LanguageCode;
export type TargetLanguage = Exclude<LanguageCode, 'en'>;

// ── Method & status vocabularies ─────────────────────────────────────────────
/**
 * How a segment's target text was produced. Reuses the canonical labeling
 * vocabulary (LabelingTransMethod in client/src/concept2cure/services/
 * labelingService.ts and server/routes/mdx-labeling.ts). Do NOT contradict it.
 */
export type TranslationMethod = 'human' | 'mt_postedited' | 'machine';

/**
 * Workflow state of a segment/project. Extends the labeling status vocabulary
 * (LabelingTransStatus = pending|in_progress|review|approved|rejected) with the
 * two machine-assisted intermediate states this platform adds:
 *  - 'mt_draft'         — raw machine output, NOT yet human-reviewed
 *  - 'back_translation' — undergoing/awaiting back-translation verification
 *
 * Guardrail (see isApprovable / TERMINAL_APPROVED below): a segment may only
 * enter 'approved' from a human-touched path with back-translation evidence.
 */
export type TranslationStatus =
  | 'pending'
  | 'mt_draft'
  | 'in_progress'
  | 'back_translation'
  | 'review'
  | 'approved'
  | 'rejected';

/** Methods that are eligible for the 'approved' terminal state. */
export const APPROVABLE_METHODS: readonly TranslationMethod[] = ['human', 'mt_postedited'];

/**
 * Pure guardrail predicate shared by client and server: a 'machine' segment can
 * never be approvable. (The authoritative enforcement is the server workflow
 * state machine; this is the same rule expressed for UI affordances.)
 */
export function isApprovableMethod(method: TranslationMethod | null | undefined): boolean {
  return method === 'human' || method === 'mt_postedited';
}

// ── Provenance (Part-11 auditable) ───────────────────────────────────────────
/**
 * Result of a back-translation check: the target text is re-translated to the
 * source language and compared against the original source.
 */
export interface BackTranslationResult {
  /** Target language that was back-translated (round-trip origin). */
  targetLang: TargetLanguage;
  /** The machine/human back-translation rendered in the source language. */
  backText: string;
  /** Engine/version that produced the back-translation, e.g. "anthropic:claude-..". */
  engine: string;
  /** 0..1 similarity between source and back-translation (semantic or lexical). */
  similarity: number;
  /** Whether the check passed the configured threshold. */
  verified: boolean;
  /** Free-text reviewer note on discrepancies, if any. */
  notes?: string;
  /** ISO-8601 timestamp the back-translation was produced. */
  performedAt: string;
}

/**
 * Full provenance chain for a single segment. Every field that captures a human
 * action is nullable until that action occurs — an unapproved draft has nulls.
 */
export interface SegmentProvenance {
  /** SHA-256 (hex) of the canonical source text the translation was made from. */
  sourceHash: string;
  /** Engine/version that produced the current target text (null for pure human). */
  engine: string | null;
  /** Prompt/template version when the draft was machine-generated. */
  promptVersion?: string | null;
  /** User id of the human post-editor (null until post-edited). */
  postEditedBy: number | null;
  /** ISO-8601 timestamp of the post-edit. */
  postEditedAt: string | null;
  /** User id of the reviewer who signed off (null until reviewed/approved). */
  reviewedBy: number | null;
  /** ISO-8601 timestamp of the review. */
  reviewedAt: string | null;
  /** User id of the approver (null until 'approved'). */
  approvedBy: number | null;
  /** ISO-8601 timestamp of approval. */
  approvedAt: string | null;
  /** Back-translation evidence; required before a segment may be approved. */
  backTranslation: BackTranslationResult | null;
}

// ── Core entities ────────────────────────────────────────────────────────────
/**
 * A single translatable unit (sentence/paragraph/cell). Source-of-truth for the
 * workflow: method + status + provenance together gate approval.
 */
export interface TranslationSegment {
  id: number;
  /** Owning project. */
  projectId: number;
  /** Tenant key — every segment is tenant-isolated. */
  organizationId: number;
  /** Stable order within the project (for re-assembly). */
  ordinal: number;
  /** Canonical source text (DNT identifiers still inline; masked at translate time). */
  sourceText: string;
  /** Current target text (empty until drafted). */
  targetText: string;
  /** SHA-256 (hex) of sourceText; mirrors provenance.sourceHash. */
  sourceHash: string;
  sourceLang: SourceLanguage;
  targetLang: TargetLanguage;
  method: TranslationMethod | null;
  status: TranslationStatus;
  provenance: SegmentProvenance;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * A translation project: one source document/section rendered into one target
 * language. Linkage fields associate it with the originating regulatory
 * artifact so provenance traces back to the source-of-record.
 */
export interface TranslationProject {
  id: number;
  /** Tenant key. */
  organizationId: number;
  /** Human-readable project name. */
  name: string;
  /** Originating document id (e.g. labeling_documents.id), if any. */
  sourceDocumentId: number | null;
  /** Originating section/leaf identifier (e.g. eCTD section code), if any. */
  sourceSectionCode: string | null;
  sourceLang: SourceLanguage;
  targetLang: TargetLanguage;
  status: TranslationStatus;
  /** Count of segments by status, for progress UIs (optional, server-computed). */
  segmentCounts?: Record<TranslationStatus, number>;
  createdBy: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * A glossary entry. A term with doNotTranslate=true is a DNT identifier that
 * must be masked before MT and restored verbatim after; targetTerm is then
 * irrelevant. A term with doNotTranslate=false provides a preferred/mandated
 * translation enforced during post-edit and review.
 */
export interface GlossaryTerm {
  id: number;
  /** Tenant key (glossaries are tenant-scoped; a shared base may have org 0). */
  organizationId: number;
  sourceTerm: string;
  /** Mandated target rendering; omitted/null for pure DNT identifiers. */
  targetTerm?: string | null;
  /** True for the DNT set (citations, agency names, codes, JSON keys, etc.). */
  doNotTranslate: boolean;
  /** DNT category, mirrors the five categories in locale-overlays.ts. */
  category: GlossaryCategory;
  /** If set, the term only applies to this target language; null = all. */
  targetLang?: TargetLanguage | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * DNT / glossary categories. The first five mirror the strict do-not-translate
 * set in server/services/ana-ri/locale-overlays.ts; 'preferred_term' covers
 * non-DNT mandated translations (e.g. controlled clinical vocabulary).
 */
export type GlossaryCategory =
  | 'regulatory_citation' // 21 CFR, ICH E6(R2), eCTD, M1..M5
  | 'agency_name'         // FDA, EMA, PMDA, NMPA, MFDS, ...
  | 'evidence_label'      // [KNOWN] / [INFERRED] / [MISSING]
  | 'slash_command'       // /audit, /readiness, ...
  | 'json_block'          // ana-action / ana-grounding keys + structural values
  | 'inn_drug_name'       // INN / drug names
  | 'meddra_term'         // MedDRA terms
  | 'code'                // generic identifiers/codes
  | 'preferred_term';     // non-DNT mandated translation

// ── Request / Response DTOs ──────────────────────────────────────────────────

// Create project
export interface CreateProjectRequest {
  name: string;
  sourceDocumentId?: number;
  sourceSectionCode?: string;
  sourceLang: SourceLanguage;
  targetLang: TargetLanguage;
  /** Initial source segments to seed the project, in order. */
  segments: Array<{ ordinal: number; sourceText: string }>;
}
export type CreateProjectResponse = TranslationProject;

// Translate draft (machine DRAFT step — never approvable on its own)
export interface TranslateDraftRequest {
  projectId: number;
  /** Restrict to these segment ids; omit to draft all 'pending' segments. */
  segmentIds?: number[];
  /** Data-residency constraint to thread to the AI gateway, if the tenant requires it. */
  dataResidency?: 'any' | 'us' | 'eu' | 'apac' | 'on_prem';
}
export interface TranslateDraftResponse {
  projectId: number;
  /** Drafted segments, each left in 'mt_draft' with method 'machine'. */
  segments: TranslationSegment[];
  /** Engine/version that produced the drafts, for audit. */
  engine: string;
  /** True if the gateway returned deterministic/demo content (must not approve). */
  deterministic: boolean;
}

// Submit post-edit (human correction of a machine draft → 'in_progress'/'review')
export interface SubmitPostEditRequest {
  segmentId: number;
  /** Human-corrected target text. */
  targetText: string;
  /**
   * Method after post-edit. A draft that started as 'machine' becomes
   * 'mt_postedited'; a from-scratch human translation is 'human'.
   */
  method: Extract<TranslationMethod, 'mt_postedited' | 'human'>;
  /** Move straight to 'review' (true) or stay 'in_progress' (false/omit). */
  readyForReview?: boolean;
}
export type SubmitPostEditResponse = TranslationSegment;

// Run back-translation (produces the evidence required before approval)
export interface RunBackTranslationRequest {
  segmentId: number;
  dataResidency?: 'any' | 'us' | 'eu' | 'apac' | 'on_prem';
}
export interface RunBackTranslationResponse {
  segment: TranslationSegment;
  result: BackTranslationResult;
}

// Approve (terminal). Server rejects with ApiError code 'method_not_approvable'
// if method is 'machine', or 'back_translation_required' if evidence is missing.
export interface ApproveSegmentRequest {
  segmentId: number;
  /** Reviewer/approver acknowledgement note captured for the audit trail. */
  reviewNote?: string;
}
export type ApproveSegmentResponse = TranslationSegment;

// List helpers
export type ProjectListResponse = TranslationProject[];
export type SegmentListResponse = TranslationSegment[];
export type GlossaryListResponse = GlossaryTerm[];
