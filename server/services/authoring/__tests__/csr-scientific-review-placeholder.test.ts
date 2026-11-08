/**
 * A CSR section that still holds a data placeholder cannot pass the scientific review (F8 of the CSR demo walk,
 * 2026-11-02, docs/evidence/D2-CSR/2026-11-02-phase2-demo-walk/).
 *
 * The build leaves "[DATA TO BE INSERTED FROM SOURCE RECORDS]" (and "[N]", "[value]" …) wherever it had no data.
 * The assembly's placement refuses such a body (CSR_PLACEMENT_BODY_PLACEHOLDER), but a working copy imported into
 * Authoring could be approved, signed and placed as an approved CSR leaf with the placeholder still in it: the
 * scientific review refused only a blank section. It now refuses a section whose visible text holds a placeholder,
 * by the one rule the build and the placement use (csr-placeholders.ts). The scientific review gates the CSR's
 * approval and every release (freeze, signature, export), so none can pass.
 */
import { describe, expect, it } from 'vitest';
import { prepareScientificReviewReceipt, scientificSha256, scientificTablesSha256 } from '../csr-scientific-review-core';
import { hasUnresolvedPlaceholders } from '../../csr/csr-placeholders';
import { placeholderIn, quotedPlaceholder, type RetainedScientificRun, type ScientificReviewSubmission } from '../../../../shared/authoring/csr-scientific-review';

const RUN = '0b6f2f5e-8a1c-4d3e-9f20-1a2b3c4d5e6f';
const PROGRAM = '6f1c2a7e-9c41-4b6a-8d3e-2f0a1b2c3d4e';
const DOC = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const SECTION = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

const runs: RetainedScientificRun[] = [{
  runId: RUN, programId: PROGRAM, releaseEligibilityVerified: true,
  studies: [{
    source: { documentId: '9c3d4e5f-6a7b-4c8d-8e9f-1a2b3c4d5e6f', sha256: 'a'.repeat(64), version: '1',
      studyId: 'SYN-201', protocolNumber: 'SYN-201', clinicalVerification: 'not-established', sourceApproval: 'canonical-lifecycle' },
    tables: { disposition: { title: 'Disposition', headers: ['Arm', 'Randomized'], rows: [['All', '254']] } },
  }],
}];

/** A complete, correctly mapped review of one section reporting "254", as the screen would build it. */
function review(content: string) {
  const start = content.indexOf('254');
  const end = start + 3;
  const submission = {
    format: 'c2c.csr-scientific-review.v1', runIds: [RUN], expectedTablesSha256: scientificTablesSha256(runs),
    allQuantitativeResultsMapped: true, populationsMethodsUnitsReviewed: true,
    sections: [{ sectionId: SECTION, contentSha256: scientificSha256(content), assessment: 'mapped-results',
      rationale: 'The randomized count compared with the retained disposition table.',
      claims: [{ id: `${SECTION}:${start}`, start, end, quoteSha256: scientificSha256(content.slice(start, end)),
        runId: RUN, studyId: 'SYN-201', expectedValue: '254', table: 'disposition', row: 0, column: 1 }] }],
  } as ScientificReviewSubmission;
  return () => prepareScientificReviewReceipt({
    organizationId: 3, programId: PROGRAM, documentId: DOC, snapshotHash: 'b'.repeat(64),
    reviewId: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', reviewerId: '9',
    snapshot: { id: DOC, sections: [{ id: SECTION, content }] }, submission, runs,
  });
}

describe('a section still holding a data placeholder cannot pass the scientific review', () => {
  it('refuses the build\'s own placeholder, though the section\'s figure is correctly mapped', () => {
    const content = '<p>In total, 254 patients were randomized. [DATA TO BE INSERTED FROM SOURCE RECORDS]</p>';
    expect(review(content)).toThrow(expect.objectContaining({ code: 'CSR_EVIDENCE_SECTION_PLACEHOLDER' }));
  });

  it('refuses a short placeholder ("[N]") and one split by markup', () => {
    expect(review('<p>In total, 254 patients were randomized; [N] completed.</p>')).toThrow(expect.objectContaining({ code: 'CSR_EVIDENCE_SECTION_PLACEHOLDER' }));
    expect(review('<p>In total, 254 patients were randomized. [DATA TO BE</p><p>INSERTED]</p>')).toThrow(expect.objectContaining({ code: 'CSR_EVIDENCE_SECTION_PLACEHOLDER' }));
  });

  it('accepts a section with no placeholder, a numeric citation, or brackets inside markup only (controls)', () => {
    expect(review('<p>In total, 254 patients were randomized.</p>')).not.toThrow();
    expect(review('<p>In total, 254 patients were randomized [1].</p>')).not.toThrow();
    expect(review('<p data-ref="[source]">In total, 254 patients were randomized.</p>')).not.toThrow();
  });
});

describe('one placeholder rule', () => {
  it('the build and placement rule (csr-placeholders.ts) and the review\'s rule agree on plain text', () => {
    for (const text of ['[DATA TO BE INSERTED]', 'n = [N]', '[value] mg', 'see [1]', '[12.5]', 'no brackets', '[favorable/unfavorable]', '']) {
      expect(placeholderIn(text) !== null, text).toBe(hasUnresolvedPlaceholders(text));
    }
  });

  it('the review reads the visible text: brackets inside markup are not a placeholder, and the placeholder it names is the text\'s', () => {
    expect(placeholderIn('<p title="[x]">Done.</p>')).toBeNull();
    expect(placeholderIn('<p>Completed: [N] of 254.</p>')).toBe('[N]');
  });

  it('a message quotes a long placeholder cut and closed, never as if it ended mid-word', () => {
    const long = '[DATA TO BE INSERTED FROM SOURCE RECORDS: Describe the scientific background, external context and rationale]';
    expect(quotedPlaceholder(long)).toBe(`${long.slice(0, 78)}…]`);
    expect(quotedPlaceholder('[N]')).toBe('[N]');
    expect(review(`<p>In total, 254 patients were randomized. ${long}</p>`)).toThrow(expect.objectContaining({ message: expect.stringContaining('…]. A CSR is approved') }));
  });
});
