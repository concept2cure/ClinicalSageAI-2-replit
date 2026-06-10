/**
 * Per-document-type extraction/generation quality metrics.
 *
 * Pure, dependency-free scorers so they can be unit-tested without a database,
 * network, or LLM. The runner (run-eval.ts) wires these to captured or live
 * model outputs and produces a per-document-type scorecard; these functions
 * only do the maths. Mirrors the shape of server/eval/rag.
 *
 * Two task families:
 *  - extraction: did the model pull the expected fields out of a source doc?
 *    Scored with precision / recall / F1 over expected field values.
 *  - generation: did the drafted section cover the required headings and avoid
 *    forbidden (overclaim) phrasing? Scored with section coverage + a hard fail
 *    on any forbidden hit.
 */

export type DocQualityTaskType = 'extraction' | 'generation';

export interface GoldDocTask {
  id: string;
  /** Document type, e.g. '510k' | 'cer' | 'ind'. Used to slice the scorecard. */
  docType: string;
  taskType: DocQualityTaskType;
  /** Source input for live runs (the document/context the model works from). */
  input?: string;
  /** Generation: section headings that must appear in the output. */
  requiredSections?: string[];
  /** Generation: phrases that must NOT appear (overclaims, absolutes). */
  forbiddenPatterns?: string[];
  /** Extraction: expected field name → expected value (case-insensitive substring match). */
  expectedFields?: Record<string, string>;
  /** Offline scoring: a captured generation output, scored without a live call. */
  candidateContent?: string;
  /** Offline scoring: a captured extraction result, scored without a live call. */
  candidateExtraction?: Record<string, unknown>;
  tags?: string[];
}

/** Mean of a list of numbers; 0 for an empty list. */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Harmonic mean of precision and recall; 0 when either is 0. */
export function f1(precision: number, recall: number): number {
  if (precision <= 0 || recall <= 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

function norm(v: unknown): string {
  return String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// ── Generation: section coverage ──────────────────────────────────────────────

export interface SectionCoverage {
  coverage: number; // 0..1
  present: string[];
  missing: string[];
}

/** Fraction of required section headings present in the content (case-insensitive). */
export function sectionCoverageScore(content: string, requiredSections: string[]): SectionCoverage {
  const haystack = norm(content);
  const present: string[] = [];
  const missing: string[] = [];
  for (const section of requiredSections) {
    if (haystack.includes(norm(section))) present.push(section);
    else missing.push(section);
  }
  const coverage = requiredSections.length === 0 ? 1 : present.length / requiredSections.length;
  return { coverage, present, missing };
}

// ── Generation: forbidden patterns ────────────────────────────────────────────

export interface ForbiddenResult {
  count: number;
  hits: string[];
}

/** Count forbidden phrases present in the content (case-insensitive). */
export function forbiddenPatternHits(content: string, patterns: string[]): ForbiddenResult {
  const haystack = norm(content);
  const hits = patterns.filter(p => haystack.includes(norm(p)));
  return { count: hits.length, hits };
}

// ── Extraction: field precision / recall / F1 ─────────────────────────────────

export interface FieldExtractionScore {
  precision: number;
  recall: number;
  f1: number;
  matched: string[];
  missed: string[];
  spurious: string[];
}

/**
 * Score extracted fields against an expected map. A field is matched when the
 * extracted value contains the expected value (normalized substring). Recall is
 * over expected fields; precision is over the expected fields the model
 * attempted (present-but-wrong counts against precision), plus spurious extra
 * keys are reported.
 */
export function fieldExtractionScore(
  extracted: Record<string, unknown>,
  expected: Record<string, string>
): FieldExtractionScore {
  const expectedKeys = Object.keys(expected);
  const matched: string[] = [];
  const missed: string[] = [];
  let attempted = 0; // expected keys the model produced a non-empty value for

  for (const key of expectedKeys) {
    const got = norm(extracted[key]);
    const want = norm(expected[key]);
    if (got.length > 0) attempted += 1;
    if (want.length > 0 && got.includes(want)) matched.push(key);
    else missed.push(key);
  }

  const spurious = Object.keys(extracted).filter(
    k => !(k in expected) && norm(extracted[k]).length > 0
  );

  const recall = expectedKeys.length === 0 ? 1 : matched.length / expectedKeys.length;
  const precisionDenom = attempted + spurious.length;
  const precision = precisionDenom === 0 ? 0 : matched.length / precisionDenom;

  return { precision, recall, f1: f1(precision, recall), matched, missed, spurious };
}

// ── Composite per-task scoring ────────────────────────────────────────────────

export interface GenerationScore {
  taskId: string;
  docType: string;
  sectionCoverage: number;
  forbiddenHits: number;
  /** Pass requires coverage >= minCoverage AND zero forbidden hits. */
  pass: boolean;
  coverageDetail: SectionCoverage;
  forbiddenDetail: ForbiddenResult;
}

export function scoreGenerationTask(
  task: GoldDocTask,
  content: string,
  minCoverage = 0.85
): GenerationScore {
  const coverageDetail = sectionCoverageScore(content, task.requiredSections ?? []);
  const forbiddenDetail = forbiddenPatternHits(content, task.forbiddenPatterns ?? []);
  return {
    taskId: task.id,
    docType: task.docType,
    sectionCoverage: coverageDetail.coverage,
    forbiddenHits: forbiddenDetail.count,
    pass: coverageDetail.coverage >= minCoverage && forbiddenDetail.count === 0,
    coverageDetail,
    forbiddenDetail,
  };
}

export interface ExtractionScore extends FieldExtractionScore {
  taskId: string;
  docType: string;
  pass: boolean;
}

export function scoreExtractionTask(
  task: GoldDocTask,
  extracted: Record<string, unknown>,
  minF1 = 0.8
): ExtractionScore {
  const score = fieldExtractionScore(extracted, task.expectedFields ?? {});
  return { ...score, taskId: task.id, docType: task.docType, pass: score.f1 >= minF1 };
}
