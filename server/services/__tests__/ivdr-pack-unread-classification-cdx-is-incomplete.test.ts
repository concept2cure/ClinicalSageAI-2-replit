/**
 * An IVDR pack must not say a device has no classification, or no CDx workflow,
 * when the read of that section FAILED.
 *
 * ── WHAT THE CODE USED TO DO (before 2026-10-15) ─────────────────────────────
 * ivdrPackContent.ts records a failed section read in `readFailures`, and both
 * renderers already routed §2 and §3 through sectionEmptyText, so a failed read
 * there prints "…could not be read… INCOMPLETE". §1 and §4 were missed:
 *
 *   ivdrPackHtml.ts:90     "No classification record found."
 *   ivdrPackHtml.ts:143    "No CDx workflow record."
 *   docxGenerator.ts:183   "No classification record found."
 *   docxGenerator.ts:283   "No CDx workflow record."
 *
 * were printed whether the table was empty or the query threw. In the technical
 * documentation a manufacturer files with a notified body, that is a statement
 * that the device has no IVDR classification and no companion-diagnostic
 * workflow — made on the manufacturer's behalf by a failed query.
 */
import { describe, it, expect } from 'vitest';
import { extractRawText } from 'mammoth';

import type { IvdrPackContent } from '../ivdrPackContent';
import { renderIvdrPackHtml } from '../ivdrPackHtml';
import { generateIvdrDocx } from '../docxGenerator';

/** A pack whose §1 and §4 came back empty, for whatever reason `readFailures` gives. */
function packWith(readFailures: IvdrPackContent['readFailures']): IvdrPackContent {
  return {
    meta: {
      packId: 'pack-1',
      packType: 'IVDR_TECHDOC',
      packVersion: 1,
      organizationId: 7,
      projectId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      generatedAt: '2026-10-15T00:00:00.000Z',
    },
    classification: null,
    analyticalValidations: [],
    clinicalEvidence: [],
    cdx: null,
    readFailures,
    binderEvidence: { totalClaims: 0, requiredClaims: 0, approvedClaims: 0, claims: [] },
    provenanceChain: { retrievalRunIds: [], generationRunIds: [], snapshotHashes: [] },
    hashes: { snapshotHashSha256: 'a'.repeat(64), manifestHashSha256: 'b'.repeat(64) },
  };
}

const FAILED = packWith([
  { section: 'classification', error: 'permission denied for table ivdr_classifications' },
  { section: 'cdx', error: 'relation "ivdr_cdx_workflows" does not exist' },
]);
const EMPTY = packWith([]);

async function docxText(content: IvdrPackContent): Promise<string> {
  const buffer = await generateIvdrDocx(content);
  return (await extractRawText({ buffer })).value;
}

/** What every renderer must say, and must not say, for the FAILED pack. */
function expectIncomplete(text: string): void {
  // The load-bearing assertions: the old sentences must not appear.
  expect(text).not.toContain('No classification record found.');
  expect(text).not.toContain('No CDx workflow record.');

  expect(text).toContain(
    'The classification records could not be read (permission denied for table ivdr_classifications).',
  );
  expect(text).toContain('it is not a statement that no classification records exist.');
  expect(text).toContain('The CDx workflow records could not be read');
  expect(text).toContain('it is not a statement that no CDx workflow records exist.');
}

describe('IVDR pack §1 classification and §4 CDx — unread is not "none"', () => {
  it('HTML: a failed read says INCOMPLETE, never "no record"', () => {
    const html = renderIvdrPackHtml(FAILED);
    expectIncomplete(html.replace(/&quot;/g, '"'));
  });

  it('DOCX: a failed read says INCOMPLETE, never "no record"', async () => {
    expectIncomplete(await docxText(FAILED));
  });

  it('HTML and DOCX: a genuinely empty section still says so, in the shared wording', async () => {
    for (const text of [renderIvdrPackHtml(EMPTY), await docxText(EMPTY)]) {
      expect(text).toContain('No classification records.');
      expect(text).toContain('No CDx workflow records.');
      expect(text).not.toContain('INCOMPLETE');
    }
  });

  // 2026-10-15: §6 printed "AI provenance chain not available." whether the
  // provenance read failed or no AI run touched the project.
  it('§6: an unread provenance chain is INCOMPLETE in both renderers, never "not available"', async () => {
    const unread = { ...packWith([{ section: 'provenanceChain', error: 'statement timeout' }]), provenanceChain: null } as unknown as IvdrPackContent;
    for (const text of [renderIvdrPackHtml(unread), await docxText(unread)]) {
      expect(text).not.toContain('AI provenance chain not available.');
      expect(text).toContain('The AI provenance records could not be read (statement timeout).');
    }
    const none = { ...packWith([]), provenanceChain: null } as unknown as IvdrPackContent;
    for (const text of [renderIvdrPackHtml(none), await docxText(none)]) {
      expect(text).toContain('No AI provenance records.');
    }
  });

  it('one failed section does not change the wording of the other', async () => {
    const onlyCdx = packWith([{ section: 'cdx', error: 'timeout' }]);
    for (const text of [renderIvdrPackHtml(onlyCdx), await docxText(onlyCdx)]) {
      expect(text).toContain('No classification records.');
      expect(text).toContain('The CDx workflow records could not be read (timeout).');
    }
  });
});
