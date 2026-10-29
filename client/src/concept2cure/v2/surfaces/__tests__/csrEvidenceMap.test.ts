/**
 * The CSR scientific-review map the review screen builds (surfaces/csrEvidenceMap.ts),
 * held against the server's own verifier (server/services/authoring/csr-scientific-review-core.ts
 * prepareScientificReviewReceipt): a map the screen builds from confirmed
 * choices is one the server accepts, and the screen never offers a figure the
 * server would refuse.
 */
import { describe, expect, it } from 'vitest';

import { prepareScientificReviewReceipt, scientificSha256, scientificTablesSha256 } from '../../../../../../server/services/authoring/csr-scientific-review-core';
import type { RetainedScientificRun } from '@shared/authoring/csr-scientific-review';
import {
  browserSha256, buildSubmission, claimableCells, figureOccurrences, mapGaps,
  type CellRef, type ReviewerMap, type SavedSection,
} from '../csrEvidenceMap';

const RUN = '0b6f2f5e-8a1c-4d3e-9f20-1a2b3c4d5e6f';
const PROGRAM = '6f1c2a7e-9c41-4b6a-8d3e-2f0a1b2c3d4e';
const DOC = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const S_EFF = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const S_ETH = '8b2c3d4e-5f6a-4b7c-9d8e-0f1a2b3c4d5e';

/** RePreve Part B as the press reported it: global cure 10/12 vs 4/11. */
const runs: RetainedScientificRun[] = [{
  runId: RUN, programId: PROGRAM, releaseEligibilityVerified: true,
  studies: [{
    source: { documentId: '9c3d4e5f-6a7b-4c8d-8e9f-1a2b3c4d5e6f', sha256: 'a'.repeat(64), version: '1',
      studyId: 'CDI02', protocolNumber: 'LMN-201-CDI02', clinicalVerification: 'not-established', sourceApproval: 'canonical-lifecycle' },
    tables: {
      primaryEfficacy: { title: 'Global cure (Part B)', headers: ['Arm', 'n/N', '%'],
        rows: [['LMN-201', '10/12', '83.3'], ['Placebo', '4/11', '36.4']] },
      disposition: { title: 'Disposition', headers: ['Arm', 'Randomized'], rows: [['LMN-201', '12'], ['Placebo', '11']] },
    },
  }],
}];

const sections: SavedSection[] = [
  { id: S_EFF, code: '11.4', title: 'Efficacy results', content:
    '<p style="width:100">Global cure occurred in 10/12 (83.3%) LMN-201 participants and 4/11 (36.4%) on placebo; 12 were randomized to LMN-201 and 1190 screened.</p>' },
  { id: S_ETH, code: '5', title: 'Ethics', content: '<p>The protocol was approved by each IRB.</p>' },
];

describe('figureOccurrences', () => {
  const cells = claimableCells(runs);
  const found = figureOccurrences(sections[0], cells);
  const displays = found.map((o) => o.display);

  it('finds each reported figure that is exactly a retained cell, with every cell it could be', () => {
    expect(displays).toEqual(expect.arrayContaining(['10/12', '83.3', '4/11', '36.4', '12']));
    // An arm label is not a reported result, though it has a digit.
    expect(displays).not.toContain('LMN-201');
    // "83.3%" reports the cell of a % column; a count is never matched to "12%".
    expect(found.find((o) => o.display === '83.3')!.candidates.every((c: CellRef) => c.header.includes('%'))).toBe(true);
    const twelve = found.find((o) => o.display === '12' && sections[0].content!.slice(o.end, o.end + 5) === ' were')!;
    expect(twelve.candidates.map((c: CellRef) => c.table)).toEqual(['disposition']);
  });

  it('never offers markup, or a figure inside a longer number ("12" in "10/12", "190" in "1190", "100" in a style)', () => {
    for (const o of found) {
      const content = sections[0].content!;
      expect(content.slice(o.start, o.end)).toBe(o.display);
      expect(/[0-9.,%/]/.test(content[o.start - 1] ?? '') && /^[0-9.,%/]/.test(o.display)).toBe(false);
    }
    expect(found.some((o) => o.display === '12' && sections[0].content![o.start - 1] === '/')).toBe(false);
    expect(found.some((o) => o.start < sections[0].content!.indexOf('>'))).toBe(false);
  });

  it('a section with no matching figure offers none', () => {
    expect(figureOccurrences(sections[1], cells)).toEqual([]);
  });
});

describe('the map the screen builds is the map the server accepts', () => {
  const cells = claimableCells(runs);
  const occurrences = sections.flatMap((s) => figureOccurrences(s, cells));
  const confirmed = (): ReviewerMap => ({
    runIds: [RUN], tablesSha256: scientificTablesSha256(runs), sections,
    choices: new Map(occurrences.map((o) => [o.key, o.candidates.length === 1 ? o.candidates[0] : null] as const)),
    rationale: new Map([[S_EFF, 'Each figure compared with the retained Part B tables.'], [S_ETH, 'This section reports no quantitative results.']]),
    allQuantitativeResultsMapped: true, populationsMethodsUnitsReviewed: true,
  });

  it('WebCrypto and node:crypto agree on the same text', async () => {
    for (const text of ['10/12', sections[0].content!, 'µ ≥ 95% — naïve']) expect(await browserSha256(text)).toBe(scientificSha256(text));
  });

  it('a confirmed map passes the server verifier, which checks every claim', async () => {
    const submission = await buildSubmission(confirmed(), occurrences);
    const receipt = prepareScientificReviewReceipt({
      organizationId: 3, programId: PROGRAM, documentId: DOC, snapshotHash: 'b'.repeat(64),
      reviewId: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', reviewerId: '9',
      snapshot: { id: DOC, sections }, submission, runs,
    });
    expect(receipt.checkedSections).toBe(2);
    expect(receipt.checkedClaims).toBe(submission.sections.flatMap((s) => s.claims).length);
    expect(receipt.checkedClaims).toBeGreaterThanOrEqual(5);
    expect(submission.sections.find((s) => s.sectionId === S_ETH)!.assessment).toBe('no-quantitative-results');
  });

  it('an edited section after mapping is refused by the server, so a stale map cannot approve', async () => {
    const submission = await buildSubmission(confirmed(), occurrences);
    const edited = sections.map((s) => s.id === S_EFF ? { ...s, content: s.content!.replace('83.3', '85.0') } : s);
    expect(() => prepareScientificReviewReceipt({
      organizationId: 3, programId: PROGRAM, documentId: DOC, snapshotHash: 'b'.repeat(64),
      reviewId: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', reviewerId: '9',
      snapshot: { id: DOC, sections: edited }, submission, runs,
    })).toThrow(/no longer matches/);
  });
});

describe('mapGaps says what still stops approval, and buildSubmission refuses while any remains', () => {
  const cells = claimableCells(runs);
  const occurrences = sections.flatMap((s) => figureOccurrences(s, cells));
  const empty: ReviewerMap = { runIds: [RUN], tablesSha256: 'c'.repeat(64), sections, choices: new Map(), rationale: new Map(),
    allQuantitativeResultsMapped: false, populationsMethodsUnitsReviewed: false };

  it('undecided figures, missing statements, no mapped result and both attestations', async () => {
    const gaps = mapGaps(empty, occurrences);
    expect(gaps.join(' ')).toMatch(/no decision yet/);
    expect(gaps.join(' ')).toMatch(/needs your statement/);
    expect(gaps.join(' ')).toMatch(/at least one mapped result/);
    expect(gaps.join(' ')).toMatch(/every quantitative result/);
    expect(gaps.join(' ')).toMatch(/populations, methods and units/);
    await expect(buildSubmission(empty, occurrences)).rejects.toThrow();
  });

  it('a blank section is named: the server approves a CSR only when every section is written', () => {
    const withBlank = { ...empty, sections: [...sections, { id: '5d6e7f8a-9b0c-4d1e-8f2a-3b4c5d6e7f8a', code: '16.1.5', title: 'Signatures', content: '' }] };
    expect(mapGaps(withBlank, occurrences).join(' ')).toMatch(/16\.1\.5 Signatures has no saved text/);
  });
});
