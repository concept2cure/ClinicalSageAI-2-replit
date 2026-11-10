/**
 * The server verifies a mapped figure where it stands in the saved text, not
 * only inside the span a map claims (D5, 2026-10-30, the CSR path sweep).
 *
 * A scientific-review claim names a span of a saved CSR section and the
 * retained table cell it reports. The server sliced the span and asked whether
 * the cell's value stood whole inside the slice. The screen sends spans exactly
 * the width of the figure, so the slice had no neighbours to test, and the
 * server's boundary rule did no work. A map sent straight to the review route
 * could bind the cell "190" to the "190" inside "1190", "12" inside "12.5",
 * a count before "%" in a column that is not a percentage, or digits inside
 * HTML markup. The screen refuses all of these, and the stored receipt said
 * the server had verified them. One rule now decides both: the shared
 * reportedDisplayAt, over the whole saved section.
 */
import { describe, expect, it } from 'vitest';
import { prepareScientificReviewReceipt, scientificSha256, scientificTablesSha256 } from '../csr-scientific-review-core';
import type { RetainedScientificRun, ScientificReviewSubmission } from '../../../../shared/authoring/csr-scientific-review';

const RUN = '0b6f2f5e-8a1c-4d3e-9f20-1a2b3c4d5e6f';
const PROGRAM = '6f1c2a7e-9c41-4b6a-8d3e-2f0a1b2c3d4e';
const DOC = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const SECTION = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

const runs: RetainedScientificRun[] = [{
  runId: RUN, programId: PROGRAM, releaseEligibilityVerified: true,
  studies: [{
    source: { documentId: '9c3d4e5f-6a7b-4c8d-8e9f-1a2b3c4d5e6f', sha256: 'a'.repeat(64), version: '1',
      studyId: 'CDI02', protocolNumber: 'LMN-201-CDI02', clinicalVerification: 'not-established', sourceApproval: 'canonical-lifecycle' },
    tables: {
      disposition: { title: 'Disposition', headers: ['Arm', 'Screened', 'Randomized', 'Completed (%)', 'Phase'],
        rows: [['All', '190', '36', '83.3', '2']] },
      primaryEfficacy: { title: 'Global cure (Part B)', headers: ['Arm', 'Mean'], rows: [['LMN-201', '12']] },
    },
  }],
}];

/** A claim on the first `display` found from `from`, exactly its width, as the screen would build it. */
function receiptFor(content: string, display: string, from: number, cell: { table: 'disposition' | 'primaryEfficacy'; row: number; column: number }, rawDisplay = display) {
  const start = content.indexOf(rawDisplay, from);
  if (start < 0) throw new Error(`fixture: "${display}" not found`);
  const end = start + rawDisplay.length;
  const submission: ScientificReviewSubmission = {
    format: 'c2c.csr-scientific-review.v1', runIds: [RUN], expectedTablesSha256: scientificTablesSha256(runs),
    allQuantitativeResultsMapped: true, populationsMethodsUnitsReviewed: true,
    sections: [{ sectionId: SECTION, contentSha256: scientificSha256(content), assessment: 'mapped-results',
      rationale: 'Each figure compared with the retained disposition table.',
      claims: [{ id: `${SECTION}:${start}`, start, end, quoteSha256: scientificSha256(content.slice(start, end)),
        runId: RUN, studyId: 'CDI02', expectedValue: display, ...cell }] }],
  } as ScientificReviewSubmission;
  return () => prepareScientificReviewReceipt({
    organizationId: 3, programId: PROGRAM, documentId: DOC, snapshotHash: 'b'.repeat(64),
    reviewId: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', reviewerId: '9',
    snapshot: { id: DOC, sections: [{ id: SECTION, content }] }, submission, runs,
  });
}

describe('a mapped figure is verified where it stands in the saved text', () => {
  it('refuses "190" claimed inside "1190"', () => {
    const content = '<p>In total, 1190 people were screened.</p>';
    expect(receiptFor(content, '190', 0, { table: 'disposition', row: 0, column: 1 })).toThrow(expect.objectContaining({ code: 'CSR_EVIDENCE_CLAIM_CHANGED' }));
  });

  it('refuses "12" claimed inside "12.5"', () => {
    const content = '<p>The mean change was 12.5 on LMN-201.</p>';
    expect(receiptFor(content, '12', 0, { table: 'primaryEfficacy', row: 0, column: 1 })).toThrow(expect.objectContaining({ code: 'CSR_EVIDENCE_CLAIM_CHANGED' }));
  });

  it('refuses digits inside markup', () => {
    const content = '<p style="width:190px">190 were screened.</p>';
    expect(receiptFor(content, '190', 0, { table: 'disposition', row: 0, column: 1 })).toThrow(expect.objectContaining({ code: 'CSR_EVIDENCE_CLAIM_CHANGED' }));
  });

  it('refuses a count followed by "%" when its column is not a percentage', () => {
    const content = '<p>Of those randomized, 36% completed.</p>';
    expect(receiptFor(content, '36', 0, { table: 'disposition', row: 0, column: 2 })).toThrow(expect.objectContaining({ code: 'CSR_EVIDENCE_CLAIM_CHANGED' }));
  });

  it('accepts a whole figure, and a percentage-column value reported with its unit (controls)', () => {
    const content = '<p>In total, 190 people were screened, 36 were randomized and 83.3% completed.</p>';
    expect(receiptFor(content, '190', 0, { table: 'disposition', row: 0, column: 1 })().checkedClaims).toBe(1);
    // The new receipt encloses the unit too; old clipped quotes are not rewritten.
    expect(receiptFor(content, '83.3', 0, { table: 'disposition', row: 0, column: 3 }, '83.3%')().checkedClaims).toBe(1);
  });
});

/* B6 (demo walk 2026-11-05): the screen offered a trial phase, a scheduled week and an instrument's item count as
   figures. The one rule both use now says they are not results, so the server refuses a claim on one as it would
   any figure that is not reported where it stands, and still verifies a real result in the same sentence. */
describe('a design number is not a reported result (B6)', () => {
  const content = '<p>In this Phase 2 study, the ADAS-Cog (11) total at Week 12 was 36, and 190 were screened.</p>';

  it('refuses the "2" of "Phase 2" and the "12" of "Week 12", and verifies the "36" reported after them', () => {
    expect(receiptFor(content, '2', content.indexOf('Phase'), { table: 'disposition', row: 0, column: 4 }))
      .toThrow(expect.objectContaining({ code: 'CSR_EVIDENCE_CLAIM_CHANGED' }));
    expect(receiptFor(content, '12', content.indexOf('Week'), { table: 'primaryEfficacy', row: 0, column: 1 }))
      .toThrow(expect.objectContaining({ code: 'CSR_EVIDENCE_CLAIM_CHANGED' }));
    expect(receiptFor(content, '36', content.indexOf('Week'), { table: 'disposition', row: 0, column: 2 })().checkedClaims).toBe(1);
  });

  it('still verifies a real result beside them (control)', () => {
    expect(receiptFor(content, '190', 0, { table: 'disposition', row: 0, column: 1 })().checkedClaims).toBe(1);
  });
});

describe('a review quote must enclose the whole raw figure', () => {
  function review(content: string, start: number, end: number, value: string, header = 'Result') {
    const retained: RetainedScientificRun[] = [{ ...runs[0], studies: [{ ...runs[0].studies[0],
      tables: { primaryEfficacy: { title: 'Synthetic result', headers: ['Endpoint', header], rows: [['Synthetic', value]] } } }] }];
    return () => prepareScientificReviewReceipt({
      organizationId: 3, programId: PROGRAM, documentId: DOC, snapshotHash: 'b'.repeat(64),
      reviewId: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', reviewerId: '9',
      snapshot: { id: DOC, sections: [{ id: SECTION, content }] }, runs: retained,
      submission: { format: 'c2c.csr-scientific-review.v1', runIds: [RUN], expectedTablesSha256: scientificTablesSha256(retained),
        allQuantitativeResultsMapped: true, populationsMethodsUnitsReviewed: true,
        sections: [{ sectionId: SECTION, contentSha256: scientificSha256(content), assessment: 'mapped-results',
          rationale: 'Reviewed the full raw figure and its retained cell.', claims: [{ id: 'whole-figure', start, end,
            quoteSha256: scientificSha256(content.slice(start, end)), runId: RUN, studyId: 'CDI02',
            table: 'primaryEfficacy', row: 0, column: 1, expectedValue: value }] }] },
    });
  }

  it('accepts encoded signs/operators only when the quote includes their complete raw span', () => {
    for (const [raw, value] of [['&lt; 0.001', '<0.001'], ['&#8722;2.50', '-2.50']] as const) {
      const content = `<p>The result was ${raw}.</p>`;
      const start = content.indexOf(raw);
      expect(review(content, start, start + raw.length, value)().checkedClaims).toBe(1);
      expect(review(content, start + 1, start + raw.length, value)).toThrow(expect.objectContaining({ code: 'CSR_EVIDENCE_CLAIM_CHANGED' }));
    }
  });

  it('does not bind a scalar to digits after a comparator or sign outside the claimed quote', () => {
    for (const prefix of ['<', '&lt;', '&#60;', '-', '&#8722;']) {
      const content = `<p>Result: ${prefix}0.001.</p>`;
      const start = content.indexOf('0.001');
      expect(review(content, start, start + 5, '0.001')).toThrow(expect.objectContaining({ code: 'CSR_EVIDENCE_CLAIM_CHANGED' }));
    }
  });

  it('requires an implicit percentage unit to remain inside the raw quoted span', () => {
    const content = '<p>Completion: 83.3&#37;.</p>';
    const start = content.indexOf('83.3');
    expect(review(content, start, start + '83.3&#37;'.length, '83.3', 'Completed (%)')().checkedClaims).toBe(1);
    expect(review(content, start, start + 4, '83.3', 'Completed (%)'))
      .toThrow(expect.objectContaining({ code: 'CSR_EVIDENCE_CLAIM_CHANGED' }));
  });

  it.each(['95% CI', '95% confidence interval', 'n (%)', 'Count (%)'])('does not interpret %s as a percent-only column', header => {
    const content = '<p>Response: 83.3&#37;.</p>';
    const start = content.indexOf('83.3');
    expect(review(content, start, start + '83.3&#37;'.length, '83.3', header))
      .toThrow(expect.objectContaining({ code: 'CSR_EVIDENCE_CLAIM_CHANGED' }));
  });

  it.each(['<p>p &amp;lt;0.001.</p>', 'p &lt;0.001.'])('refuses threshold mapping for a visible literal entity: %s', content => {
    expect(review(content, 0, content.length, '<0.001', 'p-value'))
      .toThrow(expect.objectContaining({ code: 'CSR_EVIDENCE_CLAIM_CHANGED' }));
  });

  it.each(['ng/mL', 'µg/mL', 'pg/mL', 'copies/mL'])('verifies the entire %s source display and refuses its bare count', unit => {
    const value = `5 ${unit}`;
    const content = `<p>Concentration: ${value}.</p>`;
    const start = content.indexOf(value);
    expect(review(content, start, start + value.length, '5', 'Count'))
      .toThrow(expect.objectContaining({ code: 'CSR_EVIDENCE_CLAIM_CHANGED' }));
    expect(review(content, start, start + value.length, '5', `Concentration (${unit})`))
      .toThrow(expect.objectContaining({ code: 'CSR_EVIDENCE_CLAIM_CHANGED' }));
    expect(review(content, start, start + value.length, value, 'Concentration')().checkedClaims).toBe(1);
  });
});
