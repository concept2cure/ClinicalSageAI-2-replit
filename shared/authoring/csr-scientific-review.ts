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
/** Every table the CSR engine builds, by key: the one list. The server's CSR
 * evidence (server/services/csr/cortex-authoring-context.ts) re-exports it. The
 * last two are built only when the source supplies them (CSR slice 6: ADVS/ADEG,
 * ADCM). Until 2026-10-29 the server kept its own copy with them and this one
 * had neither, so the review screen offered no vital-sign or con-med cell and
 * the verifier refused a claim naming either table. Order matters: the tables
 * hash (scientificTablesSha256) walks the keys in this order. */
export const CSR_TABLE_KEYS = ['disposition', 'analysisPopulations', 'demographics',
  'primaryEfficacy', 'secondaryEfficacy', 'exposure', 'aeOverallSummary', 'aeBySOC',
  'aeTopPT', 'deathsSAEsDiscontinuations', 'labShifts', 'vitalSigns', 'concomitantMedications'] as const;
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
 * code or title names a clinical study report ("CSR", "CSRs", "Clinical Study
 * Report(s)"). The server also treats the built-in CSR templates, a retained CSR
 * origin or an earlier receipt as a CSR
 * (server/services/authoring/csr-scientific-review.ts requiresCsrScientificReview),
 * and returns its answer in the review context, which the screen follows.
 * 2026-10-30: the plural was refused, so the IND library's "5.3.5.1 · Clinical
 * Study Reports of Controlled Studies" was not a CSR.
 */
export const labelledCsr = (value: unknown): boolean =>
  typeof value === 'string' && /(?:^|[^a-z0-9])(?:csrs?|clinical[ _-]+study[ _-]+reports?)(?:$|[^a-z0-9])/i.test(value);

/**
 * The built-in templates a CSR is authored from, by their stored template id
 * (2026-10-30): the IND library's 5.3.5.1 and 5.3.5.2 sections
 * (indTemplateId('section:m5.3.5.1' | 'section:m5.3.5.2')), the registry's ICH
 * CSR and the E3 component (builtinAuthoringTemplateId('registry:ICH_CSR' |
 * 'component:clinical_study_report')). Written out so the release gate does not
 * load the template library; csr-template-identity.pglite.test.ts proves each is
 * the id getBuiltinAuthoringTemplate resolves to that entry. A document made
 * from one of them is a CSR whatever its title says, and a template id is not
 * editable. Before this, only labels counted, so a CSR drafted from the IND
 * 5.3.5.1 template was approved, signed and filed without a review map.
 */
export const CSR_TEMPLATE_IDS: readonly string[] = [
  'f7e72f59-71ed-5cf6-96bf-d8edea20cb84', // section:m5.3.5.1
  'ba5f51bc-7257-50c9-a79f-66fc30e53d68', // section:m5.3.5.2
  '5d888ae5-4216-594e-bc5e-9c8bc22f9527', // registry:ICH_CSR
  '4331e7e3-7777-5c21-8c9b-0e2f56194e7e', // component:clinical_study_report
];

/** Whether a stored template id is one of the built-in CSR templates. */
export const isCsrTemplateId = (value: unknown): boolean =>
  typeof value === 'string' && CSR_TEMPLATE_IDS.includes(value.toLowerCase());

/**
 * Whether `display` stands as a whole number at `offset` in `text`: the
 * characters either side do not continue it ("190" is not at offset 1 of
 * "1190", and "12" is not inside "12.5").
 */
export function isExactNumericalDisplayAt(text: string, offset: number, display: string): boolean {
  if (text.slice(offset, offset + display.length) !== display) return false;
  const left = offset > 0 ? text[offset - 1] : '';
  const right = text[offset + display.length] ?? '';
  // 2026-10-30: a decimal point or thousands separator followed by a digit
  // continues the number ("12" is not inside "12.5", "1" not inside "1,190");
  // one that ends a sentence or a clause does not ("was 12.").
  const continuesRight = /[0-9%/]/.test(right) || (/[.,]/.test(right) && /[0-9]/.test(text[offset + display.length + 1] ?? ''));
  const startsNumerically = /^[0-9.,%/]/.test(display);
  const endsNumerically = /[0-9.,%/]$/.test(display);
  return !(startsNumerically && /[0-9.,%/]/.test(left)) && !(endsNumerically && continuesRight);
}

/** Character ranges inside HTML tags and entities: a digit there is markup, not a reported result. */
export function markupRanges(content: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const m of content.matchAll(/<[^>]*>|&#?[a-zA-Z0-9]+;/g)) ranges.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  return ranges;
}

/**
 * Whether a retained cell's value `display` is reported at `at` in a saved
 * section's `content`: outside markup and on the number boundaries above, so
 * "190" is not inside "1190" and "12" is not inside "12.5". A following "%"
 * continues a number ("12" is not "12%"), except for a cell in a percentage
 * column (`header` names "%"), whose value the text reports with its unit
 * ("83.3%"). The one rule by which the screen offers an occurrence
 * (csrEvidenceMap.ts figureOccurrences) and the server verifies a claim against
 * the whole saved section (csr-scientific-review-core.ts, 2026-10-30; it checked
 * only inside the claimed span, which has no neighbours).
 */
export function reportedDisplayAt(content: string, at: number, display: string, header: string,
  markup: ReadonlyArray<[number, number]> = markupRanges(content)): boolean {
  const end = at + display.length;
  if (content.slice(at, end) !== display || markup.some(([a, b]) => at < b && end > a)) return false;
  if (isExactNumericalDisplayAt(content, at, display)) return true;
  return content[end] === '%' && header.includes('%') && isExactNumericalDisplayAt(content.slice(0, end), at, display);
}

/** Do not accept a source cell of "190" merely because the draft says "1190".
 * This is exact display matching, not an NLP claim/estimand assessment. */
export function containsExactNumericalDisplay(quote: string, display: string): boolean {
  for (let offset = quote.indexOf(display); offset !== -1; offset = quote.indexOf(display, offset + 1)) {
    if (isExactNumericalDisplayAt(quote, offset, display)) return true;
  }
  return false;
}
