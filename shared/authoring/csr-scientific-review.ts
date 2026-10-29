/**
 * The CSR scientific-review contract shared by the server, which verifies a
 * review map (server/services/authoring/csr-scientific-review-core.ts), and the
 * review screen, which builds one (client/src/concept2cure/v2/surfaces/csrEvidenceMap.ts).
 *
 * One definition of the format, the table keys, the shapes and the exact
 * numerical-display rule, so a figure the screen offers for a cell is one the
 * server will accept, and a review map is never refused for a reason the
 * screen could have known. No hashing here: the server hashes with
 * node:crypto and the browser with WebCrypto, over the same UTF-8 text.
 */

export const CSR_SCIENTIFIC_REVIEW_FORMAT = 'c2c.csr-scientific-review.v1' as const;
export const CSR_TABLE_KEYS = ['disposition', 'analysisPopulations', 'demographics',
  'primaryEfficacy', 'secondaryEfficacy', 'exposure', 'aeOverallSummary', 'aeBySOC',
  'aeTopPT', 'deathsSAEsDiscontinuations', 'labShifts'] as const;
export type CsrTableKey = typeof CSR_TABLE_KEYS[number];

export interface ScientificCellClaim {
  id: string; start: number; end: number; quoteSha256: string;
  runId: string; studyId: string; table: CsrTableKey; row: number; column: number;
  expectedValue: string;
}
export interface ScientificSectionReview {
  sectionId: string; contentSha256: string;
  assessment: 'mapped-results' | 'no-quantitative-results';
  rationale: string; claims: ScientificCellClaim[];
}
export interface ScientificReviewSubmission {
  format: typeof CSR_SCIENTIFIC_REVIEW_FORMAT;
  runIds: string[];
  expectedTablesSha256: string;
  allQuantitativeResultsMapped: true;
  populationsMethodsUnitsReviewed: true;
  sections: ScientificSectionReview[];
}
export interface RetainedScientificTable {
  title: string; headers: string[]; rows: string[][];
}
export interface RetainedScientificRun {
  runId: string; programId: string; releaseEligibilityVerified: boolean;
  studies: Array<{
    source: { documentId: string; sha256: string; version: string; studyId: string;
      protocolNumber: string; clinicalVerification: 'not-established'; sourceApproval: 'canonical-lifecycle' };
    tables: Partial<Record<CsrTableKey, RetainedScientificTable>>;
  }>;
}

/**
 * Whether a document's stored label marks it as a CSR: its module, product
 * code, title or template names a clinical study report. The server also
 * treats a retained CSR origin or an earlier receipt as a CSR
 * (server/services/authoring/csr-scientific-review.ts requiresCsrScientificReview);
 * the screen reads only the label, and the server's refusal covers the rest.
 */
export const labelledCsr = (value: unknown): boolean =>
  typeof value === 'string' && /(?:^|[^a-z0-9])(?:csr|clinical[ _-]+study[ _-]+report)(?:$|[^a-z0-9])/i.test(value);

/**
 * Whether `display` stands as a whole number at `offset` in `text`: the
 * characters either side do not continue it ("190" is not at offset 1 of
 * "1190", and "12" is not inside "12.5").
 */
export function isExactNumericalDisplayAt(text: string, offset: number, display: string): boolean {
  if (text.slice(offset, offset + display.length) !== display) return false;
  const left = offset > 0 ? text[offset - 1] : '';
  const right = text[offset + display.length] ?? '';
  const startsNumerically = /^[0-9.,%/]/.test(display);
  const endsNumerically = /[0-9.,%/]$/.test(display);
  return !(startsNumerically && /[0-9.,%/]/.test(left)) && !(endsNumerically && /[0-9%/]/.test(right));
}

/** Do not accept a source cell of "190" merely because the draft says "1190".
 * This is exact display matching, not an NLP claim/estimand assessment. */
export function containsExactNumericalDisplay(quote: string, display: string): boolean {
  for (let offset = quote.indexOf(display); offset !== -1; offset = quote.indexOf(display, offset + 1)) {
    if (isExactNumericalDisplayAt(quote, offset, display)) return true;
  }
  return false;
}
