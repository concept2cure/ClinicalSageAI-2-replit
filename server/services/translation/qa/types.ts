/**
 * Translation service — QA LAYER contract (findings + report + check function).
 *
 * Pure, runtime-free type module backing the pre-review quality gate. QA runs on
 * a translated TranslationSegment BEFORE a human reviewer adjudicates it, turning
 * machine-translation failure modes (dropped/altered identifiers, empty target,
 * untranslated source bleed-through, back-translation drift, glossary violations)
 * into structured findings the workflow and the reviewer UI can act on.
 *
 * REGULATED-PLATFORM PRINCIPLE (mirrors server/services/translation/glossary.ts
 * and the invariants pinned in shared/types/translation.ts): "translate meaning,
 * never the identifiers." A dropped or altered DNT identifier — a 21 CFR / ICH
 * citation, an eCTD M1..M5 module label, an agency name, a gene symbol, a unit —
 * is an ERROR, because the target must carry it verbatim.
 *
 * SEVERITY SEMANTICS (the contract every check module relies on):
 *  - 'error'   — a hard failure mode that BLOCKS auto-advance. The human still
 *                adjudicates (QA never auto-rejects); it gates the machine, not
 *                the reviewer. QaReport.passed is false iff any error exists.
 *  - 'warning' — a likely problem worth surfacing but not auto-blocking.
 *  - 'info'    — an observation / hint with no gating effect.
 *
 * Each QaCheck is a PURE deterministic function: source/target/back-translation
 * in, findings out. No I/O, no LLM, no clock — so the whole QA layer is trivially
 * unit-testable and safe to call from the workflow state machine. The
 * BackTranslationResult a check may read is produced upstream (the LLM round-trip
 * already happened); QA only inspects its fields, it never calls an engine.
 *
 * This module REUSES the real DTOs (TranslationSegment, GlossaryTerm,
 * BackTranslationResult, GlossaryCategory) from the shared contract via the
 * service-local re-export surface (./types) — it does not redefine them.
 *
 * @module server/services/translation/qa/types
 */

import type {
  BackTranslationResult,
  GlossaryTerm,
  TranslationSegment,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Severity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Finding severity. Only 'error' gates auto-advance (see QaReport.passed); the
 * human reviewer always retains final adjudication regardless of severity.
 */
export type QaSeverity = 'error' | 'warning' | 'info';

// ─────────────────────────────────────────────────────────────────────────────
// Finding
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One QA finding: a single machine-translation failure mode surfaced by one
 * check. Excerpts are short, human-readable spans (NOT offsets) that let a
 * reviewer see exactly which identifier/phrase triggered the finding — e.g. the
 * dropped "21 CFR 312.23(a)(1)" lands in sourceExcerpt with an empty/absent
 * targetExcerpt. Both excerpts are optional because some findings are about the
 * segment as a whole (e.g. an empty target) rather than a located span.
 */
export interface QaFinding {
  /**
   * Stable identifier of the check that produced this finding, e.g.
   * 'dnt-identifier-preserved', 'empty-target', 'back-translation-drift'. Stable
   * across runs so the UI can dedupe/group and the audit trail can reference it.
   */
  checkId: string;
  severity: QaSeverity;
  /** Human-readable description of the problem (reviewer-facing). */
  message: string;
  /** Short source-side excerpt that triggered the finding, if span-located. */
  sourceExcerpt?: string;
  /** Short target-side excerpt that triggered the finding, if span-located. */
  targetExcerpt?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-severity counts over a report's findings. Mirrors the QaSeverity union so
 * the UI and the workflow can read totals without re-walking the findings array.
 */
export interface QaSeverityCounts {
  error: number;
  warning: number;
  info: number;
}

/**
 * The aggregated QA result for one translated segment: every finding across all
 * checks, plus the derived gate (`passed`) and per-severity summary counts.
 *
 * INVARIANT (enforced by the report builder, asserted by callers): `passed` is
 * true iff there are ZERO 'error' findings. Warnings and infos never flip the
 * gate — they inform the reviewer but do not block auto-advance.
 */
export interface QaReport {
  /**
   * The segment this report is for. Optional because QA can run on a bare
   * {source, target} pair (e.g. a preview or a unit test) before a segment row
   * exists. When present, it ties findings to TranslationSegment.id for audit.
   */
  segmentId?: TranslationSegment['id'];
  /** Every finding from every check, in check/registration order. */
  findings: QaFinding[];
  /** Derived gate: true iff `findings` contains no 'error' severity. */
  passed: boolean;
  /** Per-severity totals over `findings`, for at-a-glance summaries. */
  summary: QaSeverityCounts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Check function contract
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input to a single QaCheck. `source` and `target` are the only required fields
 * — the minimal pair every check needs. `backTranslation` is present once the
 * upstream round-trip has run (drift/round-trip checks read it; others ignore
 * it). `glossary` carries the tenant's locked DNT + preferred GlossaryTerms so
 * identifier-preservation and glossary-compliance checks can consult them.
 *
 * Mirrors the shared DTO surface: `source`/`target` are plain strings (the
 * TranslationSegment.sourceText / .targetText a check sees), keeping checks
 * usable on a bare pair as well as on a full segment.
 */
export interface QaCheckInput {
  /** Canonical source text (DNT identifiers still inline). */
  source: string;
  /** Translated target text to be QA'd before human review. */
  target: string;
  /** Upstream back-translation evidence, if it has been produced yet. */
  backTranslation?: BackTranslationResult;
  /** Tenant glossary terms (locked DNT + preferred) for compliance checks. */
  glossary?: GlossaryTerm[];
}

/**
 * A single QA check: a PURE deterministic function from a QaCheckInput to the
 * findings it produces. No I/O, no LLM, no clock — calling it twice with equal
 * input yields equal output. A check returns an empty array when it finds
 * nothing; it NEVER throws for ordinary "no problem" cases and NEVER mutates its
 * input. The QA runner composes many QaChecks and folds their findings into one
 * QaReport (deriving `passed`/`summary` there, not in the checks).
 *
 * Implement-phase check modules MUST conform to this signature exactly.
 */
export type QaCheck = (input: QaCheckInput) => QaFinding[];
