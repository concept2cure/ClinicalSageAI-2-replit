/**
 * An IVDR technical-documentation pack must not print "No records." for a
 * section it could not read.
 *
 * ── THE DEFECT THIS PINS ─────────────────────────────────────────────────────
 * ivdrPackContent.ts ran four section queries, each with
 * `.catch(() => ({ rows: [] }))`. A failed read produced an empty section, and
 * both renderers turned that into a printed assertion:
 *
 *   docxGenerator.ts:221      "No analytical validation records."
 *   docxGenerator.ts:261      "No clinical evidence records."
 *   ivdrPackHtml.ts:108,126   the same two, in HTML.
 *
 * Under IVDR (EU) 2017/746 Annex II, analytical performance and clinical
 * evidence are mandatory content. "No records." states that the manufacturer
 * holds none — which is a different document, and a different regulatory
 * position, from one whose query failed. A permissions change or a renamed
 * column produced the same sentence as a genuinely empty dataset.
 *
 * NOTE ON THE ORIGINAL FINDING: it cited the strings at ivdrPackContent.ts
 * :148/157/166/175. Those lines hold the swallowing catches; the strings are in
 * the two renderers. The defect spans both, which is why the fix does too — the
 * source records WHY a section is empty, and the renderers say so.
 */
import { describe, it, expect } from 'vitest';

import { sectionEmptyText, type IvdrPackContent } from '../ivdrPackContent';
import { renderIvdrPackHtml } from '../ivdrPackHtml';

describe('sectionEmptyText separates "none" from "could not read"', () => {
  it('says "No records." only when the read succeeded', () => {
    const text = sectionEmptyText({ readFailures: [] }, 'clinicalEvidence', 'clinical evidence');
    expect(text).toBe('No clinical evidence records.');
  });

  it('says the section is INCOMPLETE when the read failed', () => {
    const text = sectionEmptyText(
      { readFailures: [{ section: 'clinicalEvidence', error: 'permission denied' }] },
      'clinicalEvidence',
      'clinical evidence',
    );

    // The load-bearing assertion: the old sentence must not appear.
    expect(text).not.toBe('No clinical evidence records.');
    expect(text).toContain('could not be read');
    expect(text).toContain('permission denied');
    expect(text).toContain('INCOMPLETE');
    // And it must explicitly disclaim the reading a regulator would otherwise
    // take from an empty mandatory section.
    expect(text).toContain('not a statement that no clinical evidence records exist');
  });

  it('does not let one section failure change another section wording', () => {
    const failures = [{ section: 'analyticalValidations', error: 'relation does not exist' }];

    expect(sectionEmptyText({ readFailures: failures }, 'clinicalEvidence', 'clinical evidence')).toBe(
      'No clinical evidence records.',
    );
    expect(
      sectionEmptyText({ readFailures: failures }, 'analyticalValidations', 'analytical validation'),
    ).toContain('INCOMPLETE');
  });

  it('tolerates a manifest built before readFailures existed', () => {
    // Packs persisted under the old shape must still render rather than throw.
    const text = sectionEmptyText(
      { readFailures: undefined as never },
      'clinicalEvidence',
      'clinical evidence',
    );
    expect(text).toBe('No clinical evidence records.');
  });
});

/** A minimal pack whose two mandatory sections came back empty. */
function packWith(readFailures: IvdrPackContent['readFailures']): IvdrPackContent {
  return {
    meta: {
      packId: 'pack-1',
      packType: 'technical-documentation',
      packVersion: 1,
      organizationId: 7,
      projectId: 'proj-1',
      generatedAt: '2026-09-10T00:00:00.000Z',
    },
    classification: null,
    analyticalValidations: [],
    clinicalEvidence: [],
    cdx: null,
    readFailures,
    binderEvidence: {
      totalClaims: 0,
      requiredClaims: 0,
      approvedClaims: 0,
      claims: [],
    } as never,
    provenanceChain: {
      retrievalRunIds: [],
      generationRunIds: [],
      snapshotHashes: [],
    } as never,
    hashes: { snapshotHashSha256: 'a'.repeat(64), manifestHashSha256: 'b'.repeat(64) },
  };
}

describe('the rendered IVDR pack itself', () => {
  it('prints "No records." when the sections were genuinely empty', () => {
    const html = renderIvdrPackHtml(packWith([]));
    expect(html).toContain('No analytical validation records.');
    expect(html).toContain('No clinical evidence records.');
  });

  it('never prints "No records." for a section whose query failed', () => {
    // This is the behaviour the old renderer got wrong: identical output for
    // "the manufacturer holds none" and "the read threw".
    const html = renderIvdrPackHtml(
      packWith([
        { section: 'analyticalValidations', error: 'permission denied for relation' },
        { section: 'clinicalEvidence', error: 'relation does not exist' },
      ]),
    );

    expect(html).not.toContain('No analytical validation records.');
    expect(html).not.toContain('No clinical evidence records.');
    expect(html).toContain('INCOMPLETE');
    expect(html).toContain('permission denied for relation');
  });

  it('mixes the two correctly when only one section failed', () => {
    const html = renderIvdrPackHtml(
      packWith([{ section: 'clinicalEvidence', error: 'relation does not exist' }]),
    );

    // Analytical genuinely empty; clinical unread.
    expect(html).toContain('No analytical validation records.');
    expect(html).not.toContain('No clinical evidence records.');
    expect(html).toContain('relation does not exist');
  });
});
