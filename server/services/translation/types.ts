/**
 * Translation service — internal interfaces.
 *
 * Server-only types backing the LLM-assisted translation workflow:
 *  - TranslationProvider: the pluggable DRAFT engine (the AI-gateway-backed
 *    provider implements this). The DRAFT step is a machine accelerator only;
 *    its output lands in 'mt_draft' / method 'machine' and is never approvable
 *    without human post-edit + back-translation evidence (enforced in the
 *    workflow state machine; the shared contract pins the rule in
 *    shared/types/translation.ts).
 *  - Glossary masking: DNT identifiers are masked before translation and
 *    restored after (mirrors server/services/ana-ri/locale-overlays.ts —
 *    "translate meaning, not identifiers").
 *  - Translation-memory lookup and the workflow guardrail config.
 *
 * @module server/services/translation/types
 */

import type {
  ApiError,
  BackTranslationResult,
  GlossaryCategory,
  GlossaryTerm,
  LanguageCode,
  SegmentProvenance,
  SourceLanguage,
  TargetLanguage,
  TranslationMethod,
  TranslationProject,
  TranslationSegment,
  TranslationStatus,
} from '@shared/types/translation';

// Re-export the shared contract so service modules have one import surface.
export type {
  ApiError,
  BackTranslationResult,
  GlossaryCategory,
  GlossaryTerm,
  LanguageCode,
  SegmentProvenance,
  SourceLanguage,
  TargetLanguage,
  TranslationMethod,
  TranslationProject,
  TranslationSegment,
  TranslationStatus,
};

// ── Translation provider (the pluggable DRAFT engine) ────────────────────────
/** Input to a provider's translate() call. Source text is already DNT-masked. */
export interface ProviderTranslateInput {
  /** Source text with DNT tokens replaced by placeholders (see MaskResult). */
  maskedSourceText: string;
  sourceLang: SourceLanguage;
  targetLang: TargetLanguage;
  /** Tenant id — threaded to the AI gateway for placement/audit. */
  organizationId: number;
  /** Optional user id for the gateway audit trail. */
  userId?: number;
  /** Glossary preferred-term hints (non-DNT) to bias the draft. */
  glossaryHints?: Array<{ source: string; target: string }>;
  /** Hard residency constraint passed straight through to the gateway. */
  dataResidency?: 'any' | 'us' | 'eu' | 'apac' | 'on_prem';
  /** Require zero-data-retention routing at the provider. */
  zeroDataRetention?: boolean;
}

/** What a provider returns from a DRAFT translate() call. */
export interface ProviderTranslateOutput {
  /** Translated text, still containing the mask placeholders (caller restores). */
  targetText: string;
  /** Engine identifier + version, e.g. "anthropic:claude-opus-4-8". Recorded as provenance. */
  engine: string;
  /**
   * True if the underlying gateway returned deterministic/demo content (no API
   * key). Such output must never be promoted past 'mt_draft'.
   */
  deterministic?: boolean;
}

/**
 * Pluggable DRAFT translation engine. The reference implementation wraps the
 * AI gateway (server/services/ai-gateway/gateway.ts); alternative providers
 * (TM-only, on-prem MT) can implement the same surface.
 */
export interface TranslationProvider {
  /** Stable provider id for audit/provenance, e.g. 'gateway-mt'. */
  id: string;
  translate(input: ProviderTranslateInput): Promise<{ targetText: string; engine: string }>;
}

// ── Glossary masking (DNT identifiers) ───────────────────────────────────────
/** One masked span: a DNT token replaced by a placeholder before translation. */
export interface MaskToken {
  /** Placeholder injected into the text, e.g. "DNT0". */
  placeholder: string;
  /** Original verbatim identifier to restore after translation. */
  original: string;
  /** Why this span is DNT (drives audit + which glossary rule matched). */
  category: GlossaryCategory;
}

/** Result of masking a source string before handing it to a provider. */
export interface MaskResult {
  /** Source text with every DNT identifier replaced by its placeholder. */
  maskedText: string;
  /** Ordered tokens needed to restore the original identifiers. */
  tokens: MaskToken[];
}

/** A compiled glossary ready for masking: DNT matchers + preferred-term hints. */
export interface CompiledGlossary {
  organizationId: number;
  targetLang: TargetLanguage;
  /** DNT entries (doNotTranslate === true) used to build masks. */
  dnt: GlossaryTerm[];
  /** Non-DNT mandated translations, surfaced to the provider as hints. */
  preferred: GlossaryTerm[];
}

// ── Translation memory ───────────────────────────────────────────────────────
/** A TM lookup key — an exact (or fuzzy) source segment for a language pair. */
export interface TmLookupQuery {
  organizationId: number;
  sourceLang: SourceLanguage;
  targetLang: TargetLanguage;
  /** Canonical source text (post-mask or raw, per matchKind). */
  sourceText: string;
  /** SHA-256 (hex) of sourceText for exact-match indexing. */
  sourceHash: string;
}

/** A TM hit — a previously approved human/post-edited translation to reuse. */
export interface TmMatch {
  targetText: string;
  /** 1.0 for an exact hash match; <1.0 for fuzzy. */
  score: number;
  matchKind: 'exact' | 'fuzzy';
  /** Method of the matched prior translation; 'machine' is never a TM source. */
  method: Extract<TranslationMethod, 'human' | 'mt_postedited'>;
  /** Provenance of the source segment the match came from. */
  provenance: SegmentProvenance;
}

// ── Workflow guardrail config ────────────────────────────────────────────────
/**
 * Configuration for the workflow state machine that gates segment transitions.
 * These are the enforcement knobs behind the contract-level invariants.
 */
export interface WorkflowGuardrailConfig {
  /** Methods permitted to reach 'approved'. Machine is intentionally excluded. */
  approvableMethods: ReadonlyArray<Extract<TranslationMethod, 'human' | 'mt_postedited'>>;
  /** Approval is blocked unless a passing BackTranslationResult exists. */
  requireBackTranslation: boolean;
  /** Minimum back-translation similarity (0..1) to consider 'verified'. */
  backTranslationThreshold: number;
  /** Block approval when the draft engine returned deterministic/demo content. */
  rejectDeterministicDrafts: boolean;
}

/** Default guardrail config — the strict regulated posture. */
export const DEFAULT_GUARDRAILS: WorkflowGuardrailConfig = {
  approvableMethods: ['human', 'mt_postedited'],
  requireBackTranslation: true,
  backTranslationThreshold: 0.85,
  rejectDeterministicDrafts: true,
};

/** Outcome of a guardrail check — either an allowed transition or an ApiError. */
export interface GuardrailDecision {
  allowed: boolean;
  /** Target status if allowed. */
  nextStatus?: TranslationStatus;
  /** Populated when allowed === false, using the shared error envelope. */
  error?: ApiError;
}

const __probe: number = "x";
