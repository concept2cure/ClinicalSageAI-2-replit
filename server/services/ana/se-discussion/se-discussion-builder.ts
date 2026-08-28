/**
 * E6 — 510(k) Substantial Equivalence narrative + comparison table builder.
 *
 * Pure, deterministic functions that turn an ANALYZED SE matrix
 * (`SEMatrixPayload`, the Phase 6.6.C canonical shape produced by the predicate-
 * intelligence pipeline) into:
 *
 *   1. a defensible SE discussion narrative (markdown),
 *   2. a side-by-side comparison table (markdown, pipe-delimited so
 *      author_docx_native renders it as a real Word table), and
 *   3. the `required_strings` set that verify_docx_against_source uses to PROVE
 *      the authored .docx reproduced every predicate fact and every equivalence
 *      verdict verbatim — no fact dropped, no verdict altered or invented.
 *
 * The central regulatory guarantee (21 CFR Part 11 honesty contract): the
 * narrative asserts NOTHING about equivalence beyond what the matrix already
 * determined. Every equivalence claim in the prose is the matrix's own
 * `equivalence_status` for that characteristic, surfaced verbatim — and the
 * overall-conclusion sentence is gated on the matrix actually containing no
 * unresolved (NOT_EQUIVALENT / TOXIC / PENDING) rows. If the matrix has not
 * cleared every characteristic, the builder refuses to assert overall
 * substantial equivalence and instead states what remains open.
 *
 * No I/O here — this module is fully unit-testable from a typed matrix input.
 * The orchestrator (se-discussion-author.ts) drives author_docx_native +
 * verify_docx_against_source with the outputs of these functions.
 */

import type {
  SEMatrixPayload,
  SEMatrixComparisonRow,
  EquivalenceStatus,
} from '../../../../shared/types/predicate-intelligence';

// ─────────────────────────────────────────────────────────────────────────────
// Provenance / honesty contract
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Provenance of the matrix the SE document is built from. A `sample` or
 * `not_assessed` matrix is fixture/placeholder data — it may be previewed but
 * is NEVER sealable or exportable (Part 11 honesty contract). Only an
 * `analyzed` matrix (produced by the live predicate-intelligence pipeline) may
 * be sealed/exported.
 */
export type SEMatrixProvenance = 'analyzed' | 'sample' | 'not_assessed';

export interface SEDiscussionInput {
  matrix: SEMatrixPayload;
  /**
   * Subject device name. Falls back to matrix.device_name. Used in the
   * narrative + table header.
   */
  subjectDeviceName?: string;
  /**
   * Where this matrix came from. Drives the honesty gate — only 'analyzed'
   * matrices yield a sealable/exportable document. Omitted provenance fails
   * closed to 'not_assessed' (never sealable); pass 'analyzed' explicitly.
   */
  provenance?: SEMatrixProvenance;
}

/** The set of equivalence verdicts that leave a characteristic UNRESOLVED. */
const UNRESOLVED_STATUSES: ReadonlySet<EquivalenceStatus> = new Set<EquivalenceStatus>([
  'NOT_EQUIVALENT',
  'TOXIC',
  'PENDING',
]);

/** Human-readable, reviewer-grade labels for each equivalence verdict. */
export const EQUIVALENCE_VERDICT_LABEL: Record<EquivalenceStatus, string> = {
  EQUIVALENT: 'Equivalent',
  DISCUSSION_REQUIRED: 'Discussion required',
  NOT_EQUIVALENT: 'Not equivalent',
  TOXIC: 'Predicate safety signal',
  PENDING: 'Pending assessment',
};

// ─────────────────────────────────────────────────────────────────────────────
// Honesty guard
// ─────────────────────────────────────────────────────────────────────────────

export interface HonestyGuardResult {
  /** True only when the matrix may be sealed/exported (analyzed provenance). */
  sealable: boolean;
  /** Same gate, named for the export path. */
  exportable: boolean;
  /** Reasons the document is NOT sealable/exportable (empty when sealable). */
  blockingReasons: string[];
  /**
   * Whether the matrix supports an overall "substantial equivalence" assertion
   * (no unresolved rows). Independent of provenance — a sample matrix can be
   * internally clean but still not exportable.
   */
  supportsOverallEquivalence: boolean;
  /** Characteristics with an unresolved verdict (block overall SE assertion). */
  unresolvedCharacteristics: string[];
}

/**
 * Evaluate the Part 11 honesty contract for a matrix. This is the single
 * authority on (a) whether the document may leave the building, and (b) whether
 * the narrative is allowed to assert overall substantial equivalence. Pure.
 */
export function evaluateHonesty(input: SEDiscussionInput): HonestyGuardResult {
  // Fail closed: an omitted provenance must NOT default to 'analyzed' (the one
  // value that unlocks sealable/exportable). This function is the single
  // authority on whether the document may leave the building; a future caller
  // that forgets to pass provenance must be treated as un-assessed, not fully
  // analyzed. The sole current caller passes provenance explicitly.
  const provenance = input.provenance ?? 'not_assessed';
  const rows = input.matrix?.comparison_rows ?? [];

  const unresolvedCharacteristics = rows
    .filter((r) => UNRESOLVED_STATUSES.has(r.equivalence_status))
    .map((r) => r.characteristic);

  const blockingReasons: string[] = [];
  if (provenance === 'sample') {
    blockingReasons.push('Matrix is sample data — not sealable or exportable.');
  } else if (provenance === 'not_assessed') {
    blockingReasons.push('Matrix has not been assessed — not sealable or exportable.');
  }
  if (rows.length === 0) {
    blockingReasons.push('Matrix has no comparison rows to substantiate the document.');
  }

  const sealable = blockingReasons.length === 0;

  return {
    sealable,
    exportable: sealable,
    blockingReasons,
    supportsOverallEquivalence: rows.length > 0 && unresolvedCharacteristics.length === 0,
    unresolvedCharacteristics,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// required_strings derivation — the verification contract
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Collapse internal whitespace and trim, so a verbatim substring check is
 * robust to the single-space normalisation author_docx_native applies when it
 * lays text into Word runs. Empty/whitespace-only values are dropped by the
 * caller.
 */
function normalizeFact(value: string): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Derive the exact strings that MUST appear verbatim in the authored .docx for
 * it to be proven faithful to the matrix. Every entry is a matrix fact:
 *
 *   - the predicate K-number and predicate device name (provenance anchors),
 *   - for each row: the characteristic, the subject value, the predicate value,
 *     and the equivalence verdict LABEL.
 *
 * If verify_docx_against_source reports any of these missing, the narrative or
 * table dropped/altered a matrix fact or a verdict — the verification fails and
 * the Document Studio trust-panel says so. De-duplicated, order-stable.
 */
export function deriveRequiredStrings(matrix: SEMatrixPayload): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const s = normalizeFact(raw);
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  };

  // Provenance anchors — the predicate identity the whole document hangs on.
  push(matrix.predicate_k_number);
  push(matrix.predicate_device_name);

  for (const row of matrix.comparison_rows ?? []) {
    push(row.characteristic);
    push(row.subject_value?.value ?? '');
    push(row.predicate_value?.value ?? '');
    // The verdict LABEL must survive into the document verbatim — this is what
    // proves no equivalence verdict was altered or invented.
    push(EQUIVALENCE_VERDICT_LABEL[row.equivalence_status]);
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparison table renderer — matrix → markdown pipe table
// ─────────────────────────────────────────────────────────────────────────────

export interface ComparisonTableRow {
  characteristic: string;
  subjectValue: string;
  predicateValue: string;
  verdict: string;
}

/** Escape pipe characters so a value cannot break the markdown table grid. */
function cell(value: string): string {
  return normalizeFact(value).replace(/\|/g, '\\|');
}

/**
 * Project the matrix into renderable table rows (matrix → rows). Pure; shared
 * by the markdown renderer here and the client-side table component, so the
 * preview and the authored .docx are driven by the SAME projection.
 */
export function toComparisonTableRows(matrix: SEMatrixPayload): ComparisonTableRow[] {
  return (matrix.comparison_rows ?? []).map((row: SEMatrixComparisonRow) => ({
    characteristic: normalizeFact(row.characteristic),
    subjectValue: normalizeFact(row.subject_value?.value ?? ''),
    predicateValue: normalizeFact(row.predicate_value?.value ?? ''),
    verdict: EQUIVALENCE_VERDICT_LABEL[row.equivalence_status],
  }));
}

/**
 * Render the side-by-side comparison table as a pipe-delimited markdown table
 * that author_docx_native turns into a native Word table. Columns:
 * Characteristic | Subject Device | Predicate Device | Equivalence.
 */
export function renderComparisonTableMarkdown(
  matrix: SEMatrixPayload,
  subjectDeviceName?: string,
): string {
  const subject = subjectDeviceName || matrix.device_name || 'Subject Device';
  const predicate = matrix.predicate_device_name || matrix.predicate_k_number || 'Predicate Device';
  const rows = toComparisonTableRows(matrix);

  const lines: string[] = [];
  lines.push(`| Characteristic | ${cell(subject)} | ${cell(predicate)} | Equivalence |`);
  lines.push('|---|---|---|---|');
  for (const r of rows) {
    lines.push(`| ${cell(r.characteristic)} | ${cell(r.subjectValue)} | ${cell(r.predicateValue)} | ${cell(r.verdict)} |`);
  }
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// SE discussion narrative — matrix → defensible prose
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the SE discussion narrative (markdown). The prose:
 *   - identifies the predicate (K-number + name) verbatim from the matrix,
 *   - walks each characteristic stating the matrix's OWN verdict for it,
 *   - groups the discussion-required and unresolved characteristics so the
 *     reviewer sees exactly where the matrix flagged a difference, and
 *   - asserts overall substantial equivalence ONLY when the matrix contains no
 *     unresolved rows. Otherwise it explicitly declines to assert SE and lists
 *     what remains open. Never invents a verdict beyond the matrix facts.
 */
export function renderSEDiscussionMarkdown(input: SEDiscussionInput): string {
  const matrix = input.matrix;
  const subject = input.subjectDeviceName || matrix.device_name || 'the subject device';
  const predicateName = matrix.predicate_device_name || 'the predicate device';
  const predicateK = matrix.predicate_k_number;
  const honesty = evaluateHonesty(input);
  const rows = matrix.comparison_rows ?? [];

  const byStatus = (s: EquivalenceStatus) =>
    rows.filter((r) => r.equivalence_status === s);

  const equivalent = byStatus('EQUIVALENT');
  const discussion = byStatus('DISCUSSION_REQUIRED');
  const unresolved = rows.filter((r) => UNRESOLVED_STATUSES.has(r.equivalence_status));

  const parts: string[] = [];

  parts.push('## Substantial Equivalence Discussion');
  parts.push(
    `This discussion compares ${subject} to the predicate device ${predicateName} ` +
      `(510(k) ${predicateK}). Every equivalence determination below is drawn directly ` +
      `from the analyzed substantial-equivalence matrix; no determination is asserted ` +
      `beyond the characteristics that matrix evaluated.`,
  );

  // Characteristics found equivalent.
  if (equivalent.length > 0) {
    parts.push('### Characteristics found equivalent');
    parts.push(
      `The matrix found ${subject} ${EQUIVALENCE_VERDICT_LABEL.EQUIVALENT.toLowerCase()} to ` +
        `${predicateName} for the following ${equivalent.length === 1 ? 'characteristic' : 'characteristics'}:`,
    );
    for (const r of equivalent) {
      parts.push(
        `- ${r.characteristic}: subject "${normalizeFact(r.subject_value?.value ?? '')}" ` +
          `versus predicate "${normalizeFact(r.predicate_value?.value ?? '')}" — ` +
          `${EQUIVALENCE_VERDICT_LABEL.EQUIVALENT}.`,
      );
    }
  }

  // Characteristics requiring discussion.
  if (discussion.length > 0) {
    parts.push('### Characteristics requiring discussion');
    parts.push(
      `The matrix flagged the following ${discussion.length === 1 ? 'characteristic' : 'characteristics'} as ` +
        `${EQUIVALENCE_VERDICT_LABEL.DISCUSSION_REQUIRED.toLowerCase()}. The difference is described, but no ` +
        `conclusion of equivalence is asserted for these beyond what the matrix recorded:`,
    );
    for (const r of discussion) {
      const note = normalizeFact(r.discussion_text);
      parts.push(
        `- ${r.characteristic}: subject "${normalizeFact(r.subject_value?.value ?? '')}" ` +
          `versus predicate "${normalizeFact(r.predicate_value?.value ?? '')}" — ` +
          `${EQUIVALENCE_VERDICT_LABEL.DISCUSSION_REQUIRED}.` +
          (note ? ` ${note}` : ''),
      );
    }
  }

  // Unresolved characteristics — block overall SE.
  if (unresolved.length > 0) {
    parts.push('### Unresolved characteristics');
    parts.push(
      `The matrix did not establish equivalence for the following ` +
        `${unresolved.length === 1 ? 'characteristic' : 'characteristics'}. ` +
        `Substantial equivalence cannot be concluded until ${unresolved.length === 1 ? 'it is' : 'these are'} resolved:`,
    );
    for (const r of unresolved) {
      parts.push(
        `- ${r.characteristic}: subject "${normalizeFact(r.subject_value?.value ?? '')}" ` +
          `versus predicate "${normalizeFact(r.predicate_value?.value ?? '')}" — ` +
          `${EQUIVALENCE_VERDICT_LABEL[r.equivalence_status]}.`,
      );
    }
  }

  // Overall conclusion — gated on the matrix actually being clean.
  parts.push('### Conclusion');
  if (honesty.supportsOverallEquivalence) {
    if (discussion.length > 0) {
      // DISCUSSION_REQUIRED rows are not hard-unresolved (they don't block the
      // overall SE position), but the matrix records NO equivalence verdict for
      // them and the "Characteristics requiring discussion" section above
      // explicitly asserts "no conclusion of equivalence is asserted for these".
      // The conclusion must not then sweep them into an unqualified "across all
      // N ... substantially equivalent" claim — that self-contradiction inside
      // the exhibit is exactly what draws an FDA Additional Information request.
      // Scope the equivalence finding to the characteristics the matrix actually
      // found equivalent, and state that the discussion-required characteristics
      // are addressed above and are not asserted as equivalent here.
      parts.push(
        `${subject} is found substantially equivalent to ${predicateName} (510(k) ${predicateK}) ` +
          `for the ${equivalent.length} characteristic${equivalent.length === 1 ? '' : 's'} the ` +
          `matrix evaluated as equivalent. The ${discussion.length} characteristic` +
          `${discussion.length === 1 ? '' : 's'} requiring discussion ` +
          `${discussion.length === 1 ? 'is' : 'are'} addressed in the section above and ` +
          `${discussion.length === 1 ? 'is' : 'are'} not asserted as equivalent here; the overall ` +
          `substantial-equivalence determination for ${discussion.length === 1 ? 'it' : 'them'} ` +
          `rests on the adequacy of that discussion. This conclusion reflects the matrix verdicts ` +
          `above and is not extended to any characteristic the matrix did not assess.`,
      );
    } else {
      parts.push(
        `Across all ${rows.length} characteristic${rows.length === 1 ? '' : 's'} the analyzed matrix ` +
          `evaluated, ${subject} is found substantially equivalent to ${predicateName} ` +
          `(510(k) ${predicateK}). This conclusion reflects the matrix verdicts above and is not ` +
          `extended to any characteristic the matrix did not assess.`,
      );
    }
  } else {
    const open = honesty.unresolvedCharacteristics.join(', ');
    parts.push(
      `Substantial equivalence is NOT asserted. The analyzed matrix leaves ` +
        `${honesty.unresolvedCharacteristics.length} characteristic` +
        `${honesty.unresolvedCharacteristics.length === 1 ? '' : 's'} unresolved` +
        `${open ? ` (${open})` : ''}. The conclusion of substantial equivalence is withheld ` +
        `until ${honesty.unresolvedCharacteristics.length === 1 ? 'this is' : 'these are'} resolved in the matrix.`,
    );
  }

  if (!honesty.sealable) {
    parts.push(
      `> Honesty notice: ${honesty.blockingReasons.join(' ')} This document may be previewed ` +
        `but cannot be sealed or exported.`,
    );
  }

  return parts.join('\n\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Full document assembly — narrative + table, ready for author_docx_native
// ─────────────────────────────────────────────────────────────────────────────

export interface SEDocumentPlan {
  /** Document title (author_docx_native `title`). */
  title: string;
  /** Markdown body: narrative followed by the comparison table. */
  content: string;
  /** required_strings for verify_docx_against_source. */
  requiredStrings: string[];
  /** Honesty verdict for the matrix. */
  honesty: HonestyGuardResult;
}

/**
 * Assemble the complete SE document plan: title + body (narrative + comparison
 * table) + the verification contract + the honesty verdict. This is the single
 * input the orchestrator hands to author_docx_native and verify_docx_against_
 * source, guaranteeing the narrative, the table, and the required_strings are
 * all derived from the SAME matrix.
 */
export function buildSEDocumentPlan(input: SEDiscussionInput): SEDocumentPlan {
  const matrix = input.matrix;
  const subject = input.subjectDeviceName || matrix.device_name || 'Subject Device';
  const title = `510(k) Substantial Equivalence — ${subject} vs ${matrix.predicate_k_number}`;

  const narrative = renderSEDiscussionMarkdown(input);
  const table = renderComparisonTableMarkdown(matrix, input.subjectDeviceName);

  const content = [
    `# ${title}`,
    narrative,
    '## Comparison Table',
    'The following side-by-side comparison reproduces every characteristic, value, and ' +
      'equivalence verdict from the analyzed matrix.',
    table,
  ].join('\n\n');

  return {
    title,
    content,
    requiredStrings: deriveRequiredStrings(matrix),
    honesty: evaluateHonesty(input),
  };
}
