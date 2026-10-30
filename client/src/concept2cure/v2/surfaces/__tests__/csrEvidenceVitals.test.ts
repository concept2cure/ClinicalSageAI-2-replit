/**
 * A CSR's vital-signs and concomitant-medication figures can be reviewed
 * against their source cells (D5, 2026-10-29; hand-on from the CSR end-to-end
 * lane).
 *
 * CSR slice 6 builds §12.5 vital-signs and §11.2 concomitant-medication tables
 * from the ADaM source, under the server's table keys
 * (csr/cortex-authoring-context.ts). The scientific review keeps its own copy
 * of the keys (shared/authoring/csr-scientific-review.ts) without them. So the
 * review screen offered no cell for those figures, and the server refused any
 * claim naming those tables (CSR_EVIDENCE_CLAIM_INVALID). A CSR that reports
 * vital signs could not be reviewed figure by figure. There is now one list.
 */
import { describe, expect, it } from 'vitest';
import { prepareScientificReviewReceipt, scientificTablesSha256 } from '../../../../../../server/services/authoring/csr-scientific-review-core';
import { CSR_TABLE_KEYS as SERVER_KEYS } from '../../../../../../server/services/csr/cortex-authoring-context';
import { CSR_TABLE_KEYS, type RetainedScientificRun } from '@shared/authoring/csr-scientific-review';
import { buildSubmission, claimableCells, figureOccurrences, type ReviewerMap, type SavedSection } from '../csrEvidenceMap';

const RUN = '0b6f2f5e-8a1c-4d3e-9f20-1a2b3c4d5e6f';
const PROGRAM = '6f1c2a7e-9c41-4b6a-8d3e-2f0a1b2c3d4e';
const DOC = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const S_VS = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

const runs: RetainedScientificRun[] = [{
  runId: RUN, programId: PROGRAM, releaseEligibilityVerified: true,
  studies: [{
    source: { documentId: '9c3d4e5f-6a7b-4c8d-8e9f-1a2b3c4d5e6f', sha256: 'a'.repeat(64), version: '1',
      studyId: 'CDI02', protocolNumber: 'LMN-201-CDI02', clinicalVerification: 'not-established', sourceApproval: 'canonical-lifecycle' },
    tables: {
      vitalSigns: { title: 'Systolic blood pressure, change from baseline', headers: ['Arm', 'Mean change (mmHg)'],
        rows: [['LMN-201', '-2.4'], ['Placebo', '1.7']] },
      concomitantMedications: { title: 'Concomitant medications', headers: ['Arm', 'n (%)'],
        rows: [['LMN-201', '7 (58.3)'], ['Placebo', '5 (45.5)']] },
    },
  }],
}];
const sections: SavedSection[] = [{ id: S_VS, code: '12.5', title: 'Vital signs', content:
  '<p>Mean systolic pressure changed by -2.4 mmHg on LMN-201 and 1.7 mmHg on placebo; 7 (58.3) and 5 (45.5) participants took a concomitant medication.</p>' }];

describe('the vital-signs and concomitant-medication tables are reviewable', () => {
  it('one list of table keys, the server’s and the review’s', () => {
    expect([...CSR_TABLE_KEYS]).toEqual([...SERVER_KEYS]);
    expect(CSR_TABLE_KEYS).toEqual(expect.arrayContaining(['vitalSigns', 'concomitantMedications']));
  });

  it('the tables hash covers them, and is unchanged for a run with neither', () => {
    const disposition = { title: 'Disposition', headers: ['Arm', 'Randomized'], rows: [['LMN-201', '12'], ['Placebo', '11']] };
    const runOf = (tables: RetainedScientificRun['studies'][number]['tables']): RetainedScientificRun[] =>
      [{ ...runs[0], studies: [{ ...runs[0].studies[0], tables }] }];
    // The value the earlier list gave too: a receipt over a run with neither table still verifies.
    expect(scientificTablesSha256(runOf({ disposition }))).toBe('4bfc20788f66120b676766de5ada1ce25a9b056dcfe7ea364a047b9ffedff278');
    // The earlier list hashed a run with vital signs as if it had none, so a
    // change to those figures did not invalidate a receipt.
    expect(scientificTablesSha256(runOf({ disposition, vitalSigns: runs[0].studies[0].tables.vitalSigns })))
      .not.toBe(scientificTablesSha256(runOf({ disposition })));
  });

  it('the screen offers their cells, and the server accepts a map onto them', async () => {
    const cells = claimableCells(runs);
    const occurrences = sections.flatMap((s) => figureOccurrences(s, cells));
    expect(occurrences.length).toBeGreaterThanOrEqual(4);
    const map: ReviewerMap = {
      runIds: [RUN], tablesSha256: scientificTablesSha256(runs), sections,
      choices: new Map(occurrences.map((o) => [o.key, o.candidates.length === 1 ? o.candidates[0] : null] as const)),
      rationale: new Map([[S_VS, 'Each figure compared with the retained vital-signs and con-med tables.']]),
      allQuantitativeResultsMapped: true, populationsMethodsUnitsReviewed: true,
    };
    const submission = await buildSubmission(map, occurrences);
    const receipt = prepareScientificReviewReceipt({
      organizationId: 3, programId: PROGRAM, documentId: DOC, snapshotHash: 'b'.repeat(64),
      reviewId: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', reviewerId: '9',
      snapshot: { id: DOC, sections }, submission, runs,
    });
    expect(receipt.checkedClaims).toBeGreaterThanOrEqual(4);
    const tables = new Set(submission.sections.flatMap((s) => s.claims.map((c) => c.table)));
    expect([...tables].sort()).toEqual(['concomitantMedications', 'vitalSigns']);
  });
});
