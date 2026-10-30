/** CSR review receipts over the existing saved-document and retained-TLF records.
 * This verifies exact source cells and saved spans; it does not infer clinical
 * meaning, validate a statistical method, or certify that a model found every
 * claim. The assigned human reviewer explicitly attests coverage and meaning.
 */
import { createHash } from 'node:crypto';

/* The format, the table keys, the shapes and the exact numerical-display rule
   are shared with the review screen that builds a map
   (shared/authoring/csr-scientific-review.ts), so the screen never offers a
   figure this verifier would refuse. Re-exported for this module's importers. */
import {
  CSR_SCIENTIFIC_REVIEW_FORMAT, CSR_TABLE_KEYS, containsExactNumericalDisplay, markupRanges, reportedDisplayAt,
  type CsrTableKey, type RetainedScientificRun, type RetainedScientificTable,
  type ScientificCellClaim, type ScientificReviewSubmission, type ScientificSectionReview,
} from '../../../shared/authoring/csr-scientific-review.js';
export { CSR_SCIENTIFIC_REVIEW_FORMAT, CSR_TABLE_KEYS };
export type {
  CsrTableKey, RetainedScientificRun, RetainedScientificTable,
  ScientificCellClaim, ScientificReviewSubmission, ScientificSectionReview,
};
export interface ScientificReviewSnapshot {
  id: string;
  sections: ReadonlyArray<{ id: string; content: string | null }>;
}
export interface ScientificReviewReceipt {
  format: typeof CSR_SCIENTIFIC_REVIEW_FORMAT;
  organizationId: number; programId: string; documentId: string;
  snapshotHash: string; reviewId: string; reviewerId: string;
  scope: 'human-reviewed-mapped-tlf-cells';
  independentClinicalValidationEstablished: false;
  submission: ScientificReviewSubmission;
  sources: Array<{ runId: string; studyId: string; documentId: string; sha256: string; version: string }>;
  tablesSha256: string;
  checkedSections: number; checkedClaims: number;
}
export class CsrScientificReviewError extends Error {
  readonly status = 409;
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.name = 'CsrScientificReviewError'; this.code = code; }
}
const fail = (code: string, message: string): never => { throw new CsrScientificReviewError(code, message); };
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const nonblank = (v: unknown, max = 4000): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exactKeys = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && Object.keys(v).every(k => keys.includes(k));
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
export const scientificSha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');



/** Canonical JSON for JSONB round trips. Undefined object properties are omitted. */
export function canonicalScientificJson(value: unknown): string {
  const normalize = (v: unknown): unknown => {
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (Array.isArray(v)) return v.map(normalize);
    if (object(v)) return Object.fromEntries(Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => [k, normalize(v[k])]));
    return fail('CSR_EVIDENCE_INVALID', 'Evidence contains a non-JSON or non-finite value.');
  };
  return JSON.stringify(normalize(value));
}

export function parseScientificReviewSubmission(raw: unknown): ScientificReviewSubmission {
  if (!object(raw) || !exactKeys(raw, ['format', 'runIds', 'expectedTablesSha256',
    'allQuantitativeResultsMapped', 'populationsMethodsUnitsReviewed', 'sections']) ||
    raw.format !== CSR_SCIENTIFIC_REVIEW_FORMAT || raw.allQuantitativeResultsMapped !== true ||
    raw.populationsMethodsUnitsReviewed !== true || typeof raw.expectedTablesSha256 !== 'string' ||
    !HASH.test(raw.expectedTablesSha256) || !Array.isArray(raw.runIds) || raw.runIds.length < 1 || raw.runIds.length > 10 ||
    raw.runIds.some(id => typeof id !== 'string' || !UUID.test(id)) || new Set(raw.runIds).size !== raw.runIds.length ||
    !Array.isArray(raw.sections) || raw.sections.length < 1 || raw.sections.length > 512) {
    return fail('CSR_EVIDENCE_INPUT_INVALID', 'Provide a complete CSR scientific-review map and reviewed table digest.');
  }
  let claimCount = 0;
  const sectionIds = new Set<string>();
  const claimIds = new Set<string>();
  for (const s of raw.sections) {
    if (!object(s) || !exactKeys(s, ['sectionId', 'contentSha256', 'assessment', 'rationale', 'claims']) ||
      typeof s.sectionId !== 'string' || !UUID.test(s.sectionId) || sectionIds.has(s.sectionId) ||
      typeof s.contentSha256 !== 'string' || !HASH.test(s.contentSha256) || !nonblank(s.rationale) ||
      !['mapped-results', 'no-quantitative-results'].includes(String(s.assessment)) || !Array.isArray(s.claims) ||
      (s.assessment === 'mapped-results' ? s.claims.length === 0 : s.claims.length !== 0)) {
      return fail('CSR_EVIDENCE_SECTION_INVALID', 'Every saved section needs a unique version-bound review and explicit coverage decision.');
    }
    sectionIds.add(s.sectionId);
    for (const c of s.claims) {
      if (!object(c) || !exactKeys(c, ['id', 'start', 'end', 'quoteSha256', 'runId', 'studyId', 'table', 'row', 'column', 'expectedValue']) ||
        !nonblank(c.id, 200) || claimIds.has(c.id) || !integer(c.start) || !integer(c.end) || c.end <= c.start ||
        typeof c.quoteSha256 !== 'string' || !HASH.test(c.quoteSha256) || !raw.runIds.includes(c.runId) ||
        !nonblank(c.studyId, 120) || !(CSR_TABLE_KEYS as readonly unknown[]).includes(c.table) ||
        !integer(c.row) || !integer(c.column) || !nonblank(c.expectedValue, 2000)) {
        return fail('CSR_EVIDENCE_CLAIM_INVALID', 'Claim IDs, saved-text ranges and exact source-cell references must be complete and unique.');
      }
      claimIds.add(c.id);
      if (++claimCount > 5000) return fail('CSR_EVIDENCE_LIMIT', 'This review exceeds the bounded claim-review limit.');
    }
    // Overlapping receipts can be legitimate for one sentence citing several
    // source cells; exact source and text checks below still apply to each.
  }
  if (!claimCount) return fail('CSR_EVIDENCE_EMPTY', 'A CSR evidence review cannot be established from an entirely empty claim map.');
  return JSON.parse(JSON.stringify(raw)) as ScientificReviewSubmission;
}

function scientificTableBundle(runs: readonly RetainedScientificRun[]) {
  if (!Array.isArray(runs) || !runs.length || runs.length > 10 || new Set(runs.map(r => r.runId)).size !== runs.length) {
    return fail('CSR_EVIDENCE_RUN_INVALID', 'Retained analysis runs are missing or ambiguous.');
  }
  return runs.map((run: RetainedScientificRun) => {
    if (run.releaseEligibilityVerified !== true || !UUID.test(run.runId) || !UUID.test(run.programId) || !Array.isArray(run.studies) || !run.studies.length || run.studies.length > 100) {
      return fail('CSR_EVIDENCE_RUN_INVALID', 'A retained run has no verified study evidence.');
    }
    const studies = run.studies.map((study: RetainedScientificRun['studies'][number]) => {
      const s = study.source;
      if (!s || !UUID.test(s.documentId) || !HASH.test(s.sha256) || typeof s.version !== 'string' ||
        !nonblank(s.studyId, 120) || !nonblank(s.protocolNumber, 120) || s.sourceApproval !== 'canonical-lifecycle' ||
        s.clinicalVerification !== 'not-established' || !object(study.tables)) {
        return fail('CSR_EVIDENCE_SOURCE_INVALID', 'Retained source identity and platform approval must be verified.');
      }
      const tables: Partial<Record<CsrTableKey, RetainedScientificTable>> = {};
      for (const key of CSR_TABLE_KEYS) {
        const table = study.tables[key];
        if (table === undefined) continue;
        if (!table || !nonblank(table.title) || !Array.isArray(table.headers) || !table.headers.length ||
          table.headers.some((h: unknown) => typeof h !== 'string') || !Array.isArray(table.rows) ||
          table.rows.some((row: unknown) => !Array.isArray(row) || row.length !== table.headers.length || row.some((v: unknown) => typeof v !== 'string'))) {
          return fail('CSR_EVIDENCE_TABLE_INVALID', 'A retained table has malformed headings or cells.');
        }
        tables[key] = { title: table.title, headers: [...table.headers], rows: table.rows.map((row: string[]) => [...row]) };
      }
      return { source: { documentId: s.documentId, sha256: s.sha256, version: s.version,
        studyId: s.studyId, protocolNumber: s.protocolNumber }, tables };
    }).sort((a, b) => a.source.studyId.localeCompare(b.source.studyId));
    if (new Set(studies.map(s => s.source.studyId)).size !== studies.length) {
      return fail('CSR_EVIDENCE_SOURCE_INVALID', 'A study has more than one source in the selected run.');
    }
    return { runId: run.runId, programId: run.programId, studies };
  }).sort((a, b) => a.runId.localeCompare(b.runId));
}
/** The cell's value is reported somewhere inside the claimed span, judged against the whole section. */
function reportedInSpan(content: string, claim: { start: number; end: number; expectedValue: string }, header: string): boolean {
  const markup = markupRanges(content);
  for (let at = claim.start; at + claim.expectedValue.length <= claim.end; at++) {
    if (reportedDisplayAt(content, at, claim.expectedValue, header, markup)) return true;
  }
  return false;
}

export function scientificTablesSha256(runs: readonly RetainedScientificRun[]): string {
  return scientificSha256(canonicalScientificJson(scientificTableBundle(runs)));
}

export function prepareScientificReviewReceipt(args: {
  organizationId: number; programId: string; documentId: string;
  snapshotHash: string; reviewId: string; reviewerId: string;
  snapshot: ScientificReviewSnapshot; submission: unknown; runs: readonly RetainedScientificRun[];
}): ScientificReviewReceipt {
  if (!Number.isSafeInteger(args.organizationId) || args.organizationId <= 0 || !UUID.test(args.programId) ||
    !UUID.test(args.documentId) || args.snapshot.id !== args.documentId || !HASH.test(args.snapshotHash) ||
    !UUID.test(args.reviewId) || !/^[1-9]\d*$/.test(args.reviewerId)) {
    return fail('CSR_EVIDENCE_SCOPE_INVALID', 'The scientific review requires the current authorized document, reviewer and saved snapshot.');
  }
  const submission = parseScientificReviewSubmission(args.submission);
  const bundle = scientificTableBundle(args.runs);
  if (bundle.some(run => run.programId !== args.programId) || bundle.length !== submission.runIds.length ||
    bundle.some(run => !submission.runIds.includes(run.runId))) {
    return fail('CSR_EVIDENCE_SCOPE_INVALID', 'Analysis evidence does not match the selected project and runs.');
  }
  const tablesSha256 = scientificSha256(canonicalScientificJson(bundle));
  if (tablesSha256 !== submission.expectedTablesSha256) {
    return fail('CSR_EVIDENCE_TABLES_CHANGED', 'The table cells, headings, source versions or selected runs changed after review.');
  }
  if (!Array.isArray(args.snapshot.sections) || !args.snapshot.sections.length ||
    new Set(args.snapshot.sections.map(s => s.id)).size !== args.snapshot.sections.length ||
    submission.sections.length !== args.snapshot.sections.length) {
    return fail('CSR_EVIDENCE_COVERAGE_INVALID', 'Scientific review must cover the complete saved section set.');
  }
  const bySection = new Map(submission.sections.map(s => [s.sectionId, s]));
  let checkedClaims = 0;
  for (const section of args.snapshot.sections) {
    const review = bySection.get(section.id);
    if (!review || typeof section.content !== 'string' || !section.content.trim() ||
      review.contentSha256 !== scientificSha256(section.content)) {
      return fail('CSR_EVIDENCE_SECTION_CHANGED', 'A saved section is missing, blank or no longer matches its reviewed content.');
    }
    for (const claim of review.claims) {
      const quote = section.content.slice(claim.start, claim.end);
      if (claim.end > section.content.length || scientificSha256(quote) !== claim.quoteSha256 || !containsExactNumericalDisplay(quote, claim.expectedValue)) {
        return fail('CSR_EVIDENCE_CLAIM_CHANGED', 'A mapped claim no longer contains the exact reviewed source value at its recorded location.');
      }
      const study = bundle.find(r => r.runId === claim.runId)?.studies.find(s => s.source.studyId === claim.studyId);
      const table = study?.tables[claim.table];
      if (!table || claim.row >= table.rows.length || claim.column >= table.headers.length ||
        table.rows[claim.row][claim.column] !== claim.expectedValue || !/[\d]/.test(claim.expectedValue)) {
        return fail('CSR_EVIDENCE_CELL_MISMATCH', 'A claim does not match the exact retained numerical table cell.');
      }
      // 2026-10-30: where the figure stands in the whole saved section, not only
      // inside the span, which has no neighbours ("190" claimed inside "1190").
      if (!reportedInSpan(section.content, claim, table.headers[claim.column] ?? '')) {
        return fail('CSR_EVIDENCE_CLAIM_CHANGED', 'A mapped claim no longer contains the exact reviewed source value at its recorded location.');
      }
      checkedClaims++;
    }
  }
  return {
    format: CSR_SCIENTIFIC_REVIEW_FORMAT, organizationId: args.organizationId,
    programId: args.programId, documentId: args.documentId, snapshotHash: args.snapshotHash,
    reviewId: args.reviewId, reviewerId: args.reviewerId, scope: 'human-reviewed-mapped-tlf-cells',
    independentClinicalValidationEstablished: false, submission,
    sources: bundle.flatMap(run => run.studies.map(s => ({ runId: run.runId, studyId: s.source.studyId,
      documentId: s.source.documentId, sha256: s.source.sha256, version: s.source.version }))),
    tablesSha256, checkedSections: args.snapshot.sections.length, checkedClaims,
  };
}
