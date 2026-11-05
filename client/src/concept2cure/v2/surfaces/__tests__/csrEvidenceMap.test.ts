/**
 * The CSR scientific-review map the review screen builds (surfaces/csrEvidenceMap.ts),
 * held against the server's own verifier (server/services/authoring/csr-scientific-review-core.ts
 * prepareScientificReviewReceipt): a map the screen builds from confirmed
 * choices is one the server accepts, and the screen never offers a figure the
 * server would refuse.
 */
import { describe, expect, it } from 'vitest';

import { prepareScientificReviewReceipt, scientificSha256, scientificTablesSha256 } from '../../../../../../server/services/authoring/csr-scientific-review-core';
import { studyDesignNumberAt, type RetainedScientificRun } from '@shared/authoring/csr-scientific-review';
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

/**
 * F8 of the CSR demo walk (2026-11-02): a section that still holds a data placeholder ("[DATA TO BE INSERTED …]")
 * is named before the reviewer tries to approve. The server refuses it (CSR_EVIDENCE_SECTION_PLACEHOLDER), so the
 * screen says so first, by the same shared rule.
 */
describe('a section still holding a data placeholder is named', () => {
  const cells = claimableCells(runs);
  const held = { id: '6e7f8a9b-0c1d-4e2f-8a3b-4c5d6e7f8a9b', code: '10.1', title: 'Disposition of patients',
    content: '<p>Twelve were randomized to LMN-201. [DATA TO BE INSERTED FROM SOURCE RECORDS]</p>' };
  const withHeld = [...sections, held];
  const occurrences = withHeld.flatMap((s) => figureOccurrences(s, cells));
  const map: ReviewerMap = { runIds: [RUN], tablesSha256: 'c'.repeat(64), sections: withHeld, choices: new Map(),
    rationale: new Map(withHeld.map((s) => [s.id, 'Checked against the retained tables.'])),
    allQuantitativeResultsMapped: true, populationsMethodsUnitsReviewed: true };

  it('names the section and the placeholder, and the map cannot be submitted', async () => {
    const gaps = mapGaps(map, occurrences);
    expect(gaps.join(' ')).toMatch(/10\.1 Disposition of patients still holds a data placeholder, \[DATA TO BE INSERTED FROM SOURCE RECORDS\]/);
    await expect(buildSubmission(map, occurrences)).rejects.toThrow();
  });

  it('a section without one is not named', () => {
    expect(mapGaps(map, occurrences).join(' ')).not.toMatch(/11\.4 Efficacy results still holds/);
  });
});

/* B6 (demo walk 2026-11-05): the review offered "Phase 2", "Weeks 8 and 16", "Week 4 to Week 24" and "(11)", as in
   "ADAS-Cog (11)", as figures to map, each with unrelated table cells (a disposition count for "Phase 2"). A design
   phase, a visit schedule and an instrument's item count are not results. Real results beside them still are. */
describe('figureOccurrences: study design is not a result (B6)', () => {
  const designRuns: RetainedScientificRun[] = [{
    runId: RUN, programId: PROGRAM, releaseEligibilityVerified: true,
    studies: [{
      source: { documentId: '9c3d4e5f-6a7b-4c8d-8e9f-1a2b3c4d5e6f', sha256: 'a'.repeat(64), version: '1',
        studyId: 'CDISCPILOT01', protocolNumber: 'H2Q-MC-LZZT', clinicalVerification: 'not-established', sourceApproval: 'canonical-lifecycle' },
      tables: {
        disposition: { title: 'Disposition', headers: ['Arm', 'Randomized', 'Discontinued', 'Completed (%)', 'Phase', 'Week', 'Items', 'Visits', 'Weeks'],
          rows: [['Placebo', '86', '12', '33.9', '2', '24', '11', '8', '16'], ['Total', '254', '4', '2', '2', '4', '11', '8', '16']] },
        primaryEfficacy: { title: 'ADAS-Cog (11) change from baseline at Week 24', headers: ['Comparison', 'Difference', 'p'],
          rows: [['High dose vs placebo', '-2.5', '0.001']] },
      },
    }],
  }];
  const text = '<p>In this Phase 2 study, the ADAS-Cog (11) was assessed at Weeks 8 and 16 and from Week 4 to Week 24. '
    + 'Of 254 randomized, 86 (33.9%) received placebo and 12 discontinued; Placebo (86) is the arm count. '
    + 'At Week 24 the difference was -2.5 (p=0.001).</p>';
  const section: SavedSection = { id: S_EFF, code: '11.4', title: 'Efficacy results', content: text };
  const found = figureOccurrences(section, claimableCells(designRuns));
  const at = (o: { start: number; end: number }) => text.slice(Math.max(0, o.start - 12), o.end + 1);

  it('offers no trial phase, scheduled week or instrument item count', () => {
    const design = found.filter((o) => /Phase $|Weeks? (\d+ and )?$|Week \d+ to Week $|ADAS-Cog \($/.test(text.slice(Math.max(0, o.start - 20), o.start)));
    expect(design.map(at)).toEqual([]);
  });

  it('still offers every result: counts, a percentage, a difference and a p-value, including a count after an arm name', () => {
    const displays = found.map((o) => o.display);
    expect(displays).toEqual(expect.arrayContaining(['254', '86', '33.9', '12', '-2.5', '0.001']));
    expect(found.filter((o) => o.display === '86')).toHaveLength(2);
  });

  it('reads only the word before the number: a count in brackets after an arm or a population is a result', () => {
    const design = (s: string, n: string) => studyDesignNumberAt(s, s.indexOf(n), s.indexOf(n) + n.length);
    expect(design('Non-completers (12) left early.', '12')).toBe(false);
    expect(design('Placebo (86) and Xanomeline (84).', '86')).toBe(false);
    expect(design('8 weeks of treatment', '8')).toBe(false);
    expect(design('the HAM-D (17) total', '17')).toBe(true);
    expect(design('Phase 2/3 enrolment', '3')).toBe(true);
    expect(design('on Days 1-14 only', '14')).toBe(true);
    expect(design('at Week 24 -2.5 was seen', '2.5')).toBe(false);
  });
});
