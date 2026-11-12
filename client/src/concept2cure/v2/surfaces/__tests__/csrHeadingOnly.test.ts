/**
 * A CSR heading that holds only its subsections needs no text of its own, and a heading with no subsections must
 * hold text a reader sees (founder decision P-126, 2026-11-12, under delegation; it reads P-115 item 5, "Every
 * heading holds text", for the headings ICH E3 uses only to organise: "5 Ethics" over 5.1 to 5.3).
 *
 * Before: the review refused any section whose content was the empty string, so each of the 19 organising headings
 * of an ICH E3 report needed filler typed under it before the report could be reviewed. And a section holding only
 * markup ("<p></p>", what the editor saves for a cleared section) passed as written.
 *
 * One rule, shared by the screen that builds the map and the server that verifies it
 * (shared/authoring/csr-scientific-review.ts). Evidence: docs/evidence/D2-CSR/2026-11-12-heading-only-sections/.
 */
import { describe, expect, it } from 'vitest';

import { prepareScientificReviewReceipt, scientificSha256, scientificTablesSha256 } from '../../../../../../server/services/authoring/csr-scientific-review-core';
import {
  CSR_HEADING_ONLY_STATEMENT, csrHeadingOnlySectionIds, csrSectionHoldsText,
  type RetainedScientificRun, type ScientificReviewSubmission,
} from '@shared/authoring/csr-scientific-review';
import { buildSubmission, claimableCells, figureOccurrences, mapGaps, type ReviewerMap, type SavedSection } from '../csrEvidenceMap';

const RUN = '0b6f2f5e-8a1c-4d3e-9f20-1a2b3c4d5e6f';
const PROGRAM = '6f1c2a7e-9c41-4b6a-8d3e-2f0a1b2c3d4e';
const DOC = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const S_ETH = '8b2c3d4e-5f6a-4b7c-9d8e-0f1a2b3c4d5e';
const S_IRB = '8b2c3d4e-5f6a-4b7c-9d8e-0f1a2b3c4d51';
const S_DISP = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const S_AUDIT = '5d6e7f8a-9b0c-4d1e-8f2a-3b4c5d6e7f8a';

const runs: RetainedScientificRun[] = [{
  runId: RUN, programId: PROGRAM, releaseEligibilityVerified: true,
  studies: [{
    source: { documentId: '9c3d4e5f-6a7b-4c8d-8e9f-1a2b3c4d5e6f', sha256: 'a'.repeat(64), version: '1',
      studyId: 'SYN-201', protocolNumber: 'SYN-201', clinicalVerification: 'not-established', sourceApproval: 'canonical-lifecycle' },
    tables: { disposition: { title: 'Disposition', headers: ['Arm', 'Randomized'], rows: [['All', '254']] } },
  }],
}];

const ethics: SavedSection = { id: S_ETH, code: '5', title: 'Ethics', content: '' };
const irb: SavedSection = { id: S_IRB, code: '5.1', title: 'Independent ethics committee', content: '<p>The protocol was approved by each IRB.</p>' };
const disposition: SavedSection = { id: S_DISP, code: '10.1', title: 'Disposition of patients', content: '<p>In total, 254 patients were randomized.</p>' };
const report = [ethics, irb, disposition];

/** The reviewer's finished map over `sections`: the one figure mapped, and a statement for each section that needs one. */
function confirmed(sections: readonly SavedSection[]) {
  const occurrences = sections.flatMap((s) => figureOccurrences(s, claimableCells(runs)));
  const headingOnly = csrHeadingOnlySectionIds(sections);
  const map: ReviewerMap = {
    runIds: [RUN], tablesSha256: scientificTablesSha256(runs), sections,
    choices: new Map(occurrences.map((o) => [o.key, o.candidates[0]] as const)),
    rationale: new Map(sections.filter((s) => !headingOnly.has(s.id)).map((s) => [s.id, 'Read against the retained disposition table.'] as const)),
    allQuantitativeResultsMapped: true, populationsMethodsUnitsReviewed: true,
  };
  return { map, occurrences };
}
const verify = (sections: readonly SavedSection[], submission: ScientificReviewSubmission) => () => prepareScientificReviewReceipt({
  organizationId: 3, programId: PROGRAM, documentId: DOC, snapshotHash: 'b'.repeat(64),
  reviewId: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', reviewerId: '9', snapshot: { id: DOC, sections }, submission, runs,
});
/** A review written by hand, as a caller other than the screen could send it: every section hash-bound and stated. */
function byHand(sections: readonly SavedSection[]): ScientificReviewSubmission {
  const text = disposition.content as string;
  const start = text.indexOf('254');
  return {
    format: 'c2c.csr-scientific-review.v1', runIds: [RUN], expectedTablesSha256: scientificTablesSha256(runs),
    allQuantitativeResultsMapped: true, populationsMethodsUnitsReviewed: true,
    sections: sections.map((s) => (s.id === S_DISP
      ? { sectionId: s.id, contentSha256: scientificSha256(text), assessment: 'mapped-results' as const, rationale: 'Compared with the table.',
        claims: [{ id: `${s.id}:${start}`, start, end: start + 3, quoteSha256: scientificSha256('254'), runId: RUN, studyId: 'SYN-201',
          expectedValue: '254', table: 'disposition' as const, row: 0, column: 1 }] }
      : { sectionId: s.id, contentSha256: scientificSha256(s.content ?? ''), assessment: 'no-quantitative-results' as const,
        rationale: 'This section reports no quantitative results.', claims: [] })),
  };
}

describe('what "holds text" means: text a reader sees', () => {
  it('nothing, white space, empty markup and a lone entity hold none', () => {
    for (const content of [null, undefined, '', '   ', '<p></p>', '<p> </p>', '<p>&nbsp;</p>', '<h2></h2><p><br></p>', '<!-- to write -->']) {
      expect(csrSectionHoldsText(content), JSON.stringify(content)).toBe(false);
    }
  });
  it('a sentence, a table cell and a figure do', () => {
    for (const content of ['Not applicable to this study: no audit was performed.', '<p>x</p>', '<table><tr><td>12</td></tr></table>', '<p><img src="design.png" alt="Study design"></p>']) {
      expect(csrSectionHoldsText(content), content).toBe(true);
    }
  });
});

describe('which headings hold only their subsections', () => {
  it('a blank heading with a subsection in the same document, by number', () => {
    const audit: SavedSection = { id: S_AUDIT, code: '16.1.8', title: 'Audit certificates', content: '' };
    expect([...csrHeadingOnlySectionIds([...report, audit])]).toEqual([S_ETH]);
  });
  it('not a heading that holds text, not a blank heading with none, and "5" is no parent of "50.1"', () => {
    expect(csrHeadingOnlySectionIds([{ ...ethics, content: '<p>Overview of ethics.</p>' }, irb]).size).toBe(0);
    expect(csrHeadingOnlySectionIds([ethics, disposition]).size).toBe(0);
    expect(csrHeadingOnlySectionIds([ethics, { ...irb, code: '50.1' }]).size).toBe(0);
  });
  it('a heading whose own text is empty markup, or null, is one too', () => {
    expect([...csrHeadingOnlySectionIds([{ ...ethics, content: '<p></p>' }, irb])]).toEqual([S_ETH]);
    expect([...csrHeadingOnlySectionIds([{ ...ethics, content: null }, irb])]).toEqual([S_ETH]);
  });
});

describe('the screen: a heading that holds only subsections is not a gap, and a blank heading with none still is', () => {
  it('asks nothing for the organising heading and builds a map the server accepts', async () => {
    const { map, occurrences } = confirmed(report);
    expect(mapGaps(map, occurrences)).toEqual([]);
    const submission = await buildSubmission(map, occurrences);
    const heading = submission.sections.find((s) => s.sectionId === S_ETH)!;
    expect(heading).toEqual({ sectionId: S_ETH, contentSha256: scientificSha256(''), assessment: 'no-quantitative-results', rationale: CSR_HEADING_ONLY_STATEMENT, claims: [] });
    expect(verify(report, submission)().checkedSections).toBe(3);
  });
  it('the same when the heading was never saved (null)', async () => {
    const sections = [{ ...ethics, content: null }, irb, disposition];
    const { map, occurrences } = confirmed(sections);
    expect(verify(sections, await buildSubmission(map, occurrences))).not.toThrow();
  });
  it('names a heading with no subsections that holds no text, also when it holds only markup', () => {
    for (const content of ['', '<p></p>', '<p>&nbsp;</p>']) {
      const sections = [...report, { id: S_AUDIT, code: '16.1.8', title: 'Audit certificates', content }];
      const { map, occurrences } = confirmed(sections);
      expect(mapGaps(map, occurrences).join(' '), JSON.stringify(content)).toMatch(/16\.1\.8 Audit certificates has no saved text/);
    }
  });
});

describe('the server: the same rule, whoever built the map', () => {
  it('accepts a blank heading over its subsections', () => {
    expect(verify(report, byHand(report))).not.toThrow();
  });
  it('refuses a heading with no subsections that holds no text, though its review is bound to that exact content', () => {
    for (const content of ['', '<p></p>', '<p>&nbsp;</p>']) {
      const sections = [...report, { id: S_AUDIT, code: '16.1.8', title: 'Audit certificates', content }];
      expect(verify(sections, byHand(sections)), JSON.stringify(content)).toThrow(expect.objectContaining({ code: 'CSR_EVIDENCE_SECTION_CHANGED' }));
    }
  });
  it('refuses a section of empty markup in a report with no organising heading at all (it passed as written before)', () => {
    const sections = [irb, disposition, { id: S_AUDIT, code: '16.1.8', title: 'Audit certificates', content: '<p></p>' }];
    expect(verify(sections, byHand(sections))).toThrow(expect.objectContaining({ code: 'CSR_EVIDENCE_SECTION_CHANGED' }));
  });
  it('refuses a blank heading once its only subsection is gone, and one whose text changed after the review', () => {
    const alone = [ethics, disposition];
    expect(verify(alone, byHand(alone))).toThrow(expect.objectContaining({ code: 'CSR_EVIDENCE_SECTION_CHANGED' }));
    const written = [{ ...ethics, content: '<p>Added after the review.</p>' }, irb, disposition];
    expect(verify(written, byHand(report))).toThrow(expect.objectContaining({ code: 'CSR_EVIDENCE_SECTION_CHANGED' }));
  });
  it('refuses a claim mapped into a heading that holds no text', () => {
    const submission = byHand(report);
    const claim = submission.sections.find((s) => s.sectionId === S_DISP)!.claims[0];
    const forged = { ...submission, sections: submission.sections.map((s) => (s.sectionId === S_ETH
      ? { ...s, assessment: 'mapped-results' as const, claims: [{ ...claim, id: 'forged', start: 0, end: 3 }] } : s)) };
    expect(verify(report, forged)).toThrow(expect.objectContaining({ code: 'CSR_EVIDENCE_SECTION_CHANGED' }));
  });
});
