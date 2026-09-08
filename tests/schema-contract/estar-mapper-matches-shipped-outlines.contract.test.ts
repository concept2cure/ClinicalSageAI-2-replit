/**
 * Schema contract: the eSTAR slot registry and the rule packs the product
 * actually scaffolds must agree about what a finished 510(k) contains.
 *
 * These are two halves of one fact kept in two files, and they drifted:
 *
 *   - migrations/20260901b_estar_510k_denovo_outlines.sql struck the "CDRH
 *     Premarket Review Submission Cover Sheet (FDA 3514)" section from both
 *     outlines, because FDA retired that paper form when eSTAR became mandatory
 *     (510(k) 2023-10-01, De Novo 2025-10-01). estar-mapper.ts went on requiring
 *     it — so the readiness surface told a paying customer to produce a form FDA
 *     no longer accepts, and scored their dossier short for not having it.
 *
 *   - The statute says "truthful and accurate"; both packs title the section
 *     "Truthful and accuracy statement". The matcher looked only for the former,
 *     so the section the filer authored and approved scored as absent.
 *
 * Together those made a fully authored governed 510(k) unable to reach
 * content-complete: the filer saw a percentage and a to-do list they could never
 * clear by authoring anything.
 *
 * A unit test over hand-written leaves cannot see this — both sides were
 * internally consistent. This test scores the REAL shipped outlines through the
 * REAL mapper, which is the only place the disagreement is visible.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { mapToEstar } from '../../server/services/pathway-engines/estar/estar-mapper';
import {
  governedSectionsToDeviceSections,
  sectionsToLeaves,
} from '../../server/services/pathway-engines/estar/estar-content-leaves';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTLINES = path.join(REPO_ROOT, 'migrations/20260901b_estar_510k_denovo_outlines.sql');

/** Every node of a shipped rule pack, flattened in outline order. */
function packNodes(pack: unknown): Array<{ key?: string; label?: string }> {
  const roots: any[] = Array.isArray(pack) ? pack : ((pack as any)?.sections ?? (pack as any)?.nodes ?? []);
  const out: any[] = [];
  const walk = (ns: any[]) => { for (const n of ns) { out.push(n); if (n.children) walk(n.children); } };
  walk(roots);
  return out;
}

/** The shipped packs, in file order: [0] k510, [1] denovo. */
function shippedPacks() {
  const sql = fs.readFileSync(OUTLINES, 'utf8');
  const blobs = [...sql.matchAll(/\$pack\$([\s\S]*?)\$pack\$/g)].map((m) => JSON.parse(m[1]));
  expect(blobs, 'the outlines migration no longer carries two $pack$ blobs').toHaveLength(2);
  return blobs;
}

/** Score ONE node, alone and fully authored — which slots does it light up? */
function scoreNode(node: { key?: string; label?: string }, type: '510k' | 'de_novo'): string[] {
  const leaves = sectionsToLeaves(
    governedSectionsToDeviceSections([
      {
        id: 1,
        section_key: node.key ?? 'S',
        label: node.label ?? '',
        status: 'approved',
        content: 'Authored body for this section. '.repeat(40),
      },
    ] as never) as never,
  );
  return mapToEstar({ type, leaves, flags: {} } as never)
    .sections.filter((s) => s.present)
    .map((s) => s.id)
    .sort();
}

/** Score a pack as if every one of its sections were authored and approved. */
function scoreFullyAuthored(pack: unknown, type: '510k' | 'de_novo') {
  const rows = packNodes(pack).map((n, i) => ({
    id: i + 1,
    section_key: n.key ?? `S${i}`,
    label: n.label ?? '',
    status: 'approved',
    content: 'Authored body for this section. '.repeat(40),
  }));
  const leaves = sectionsToLeaves(governedSectionsToDeviceSections(rows as never) as never);
  return { result: mapToEstar({ type, leaves, flags: {} } as never), sectionCount: rows.length };
}

describe('eSTAR slot registry vs the shipped rule packs', () => {
  it.each([
    ['510k', 0],
    ['de_novo', 1],
  ] as const)('a fully authored %s outline is not missing a slot the outline cannot supply', (type, idx) => {
    const { result, sectionCount } = scoreFullyAuthored(shippedPacks()[idx], type);
    expect(sectionCount).toBeGreaterThan(20);

    /* The two that drifted. Neither may reappear: the first is a form FDA no
       longer accepts, the second is a section the pack really does carry. */
    expect(result.summary.missingRequired).not.toContain('cdrh-cover-sheet');
    expect(result.summary.missingRequired).not.toContain('truthful-accurate-statement');
  });

  /* Not an aspiration — a ledger. Two required slots still have no section in
     the shipped k510 outline, so a finished dossier cannot yet score complete.
     Closing that needs a NEW rule-pack version (the packs are seeded
     ON CONFLICT DO NOTHING and cannot be corrected in place — CLAUDE.md RULE 1),
     not a change here. This asserts the CURRENT gap exactly, so it fails the
     moment that lands and this file is updated with it. */
  it('records exactly which required slots the shipped outlines still cannot supply', () => {
    const k510 = scoreFullyAuthored(shippedPacks()[0], '510k').result;
    const denovo = scoreFullyAuthored(shippedPacks()[1], 'de_novo').result;
    expect(k510.summary.missingRequired.sort()).toEqual(['risk-management', 'user-fee-cover-sheet']);
    expect(denovo.summary.missingRequired.sort()).toEqual(['user-fee-cover-sheet']);
  });

  /**
   * A section that merely MENTIONS a phrase does not satisfy the slot that
   * phrase names.
   *
   * Both shipped outlines title their financial-disclosure node "Financial
   * certification or disclosure (21 CFR Part 54), where clinical data are
   * relied on". The performance-testing slot matched the title substring
   * "clinical data", so a sponsor who had authored ONLY that section was told
   * performance testing was present — and it dropped out of missingRequired
   * entirely. A governed readiness verdict claimed a required section was
   * satisfied when nothing addressed it.
   *
   * This file's own biocompatibility note states the rule this breaks:
   * over-asking costs a reader a moment, under-asking costs a refusal to
   * accept. A false "present" is the direction this mapper may not be wrong in.
   */
  it.each([
    ['510k', 0, 'A8'],
    ['de_novo', 1, 'A5'],
  ] as const)(
    'the %s financial-disclosure section does not satisfy performance testing',
    (type, idx, key) => {
      const node = packNodes(shippedPacks()[idx]).find((n) => n.key === key);
      expect(node, `${key} is no longer in the ${type} pack`).toBeTruthy();
      expect(node!.label).toMatch(/clinical data/i);

      const slots = scoreNode(node!, type);
      expect(slots).toContain('clinical-financial-disclosure');
      expect(slots).not.toContain('performance-testing');
    },
  );

  /**
   * The whole node→slot map, measured. Not an aspiration and not a design — a
   * LEDGER of what the shipped matchers actually do to the shipped outlines, so
   * that any edit to a matcher shows its blast radius here instead of moving a
   * readiness percentage nobody traced.
   *
   * An empty array is a real answer: eleven k510 nodes match no slot at all
   * (containers like "A"/"E", and sections the 23-slot registry does not model).
   */
  it.each([
    [
      '510k',
      0,
      {
        A: [], A1: ['cover-letter'], A2: [], A3: [], A4: ['standards-conformance'],
        A5: ['510k-summary-or-statement'], A6: ['truthful-accurate-statement'],
        A7: ['class-iii-certification'], A8: ['clinical-financial-disclosure'],
        B: ['device-description'], B1: ['device-description'], B2: ['indications-for-use'], B3: [],
        C: ['substantial-equivalence'], C1: ['substantial-equivalence'], C2: ['substantial-equivalence'],
        D: ['proposed-labeling'], D1: [], D2: ['proposed-labeling'], D3: ['reprocessing'],
        D4: ['sterilization'], D5: ['sterilization'],
        E: [], E1: ['biocompatibility'], E2: ['software'], E3: ['cybersecurity'],
        E4: ['emc-electrical'], E5: ['performance-testing'], E6: ['performance-testing'],
        E7: ['performance-testing'], E8: ['human-factors'],
        F: [], F1: [], G: [], G1: [], G2: [],
      } as Record<string, string[]>,
    ],
    [
      'de_novo',
      1,
      {
        A: [], A1: ['cover-letter'], A2: ['indications-for-use'], A3: [],
        A4: ['truthful-accurate-statement'], A5: ['clinical-financial-disclosure'],
        A6: ['standards-conformance'],
        B: ['device-description'], B1: ['device-description'], B2: [], B3: [],
        C: [], C1: ['classification-request'], C2: [], C3: ['special-controls'], C4: [],
        D: ['performance-testing'], D1: ['performance-testing'], D2: ['biocompatibility'],
        D3: ['sterilization'], D4: ['software'], D5: ['cybersecurity'], D6: ['emc-electrical'],
        D7: [], D8: [], D9: ['human-factors'],
        E: ['proposed-labeling'], E1: ['proposed-labeling'], E2: ['proposed-labeling'],
        F: ['risk-management'], G: [], G1: [],
      } as Record<string, string[]>,
    ],
  ] as const)('the %s node-to-slot map is exactly this', (type, idx, expected) => {
    const measured: Record<string, string[]> = {};
    for (const node of packNodes(shippedPacks()[idx])) {
      measured[node.key ?? '?'] = scoreNode(node, type);
    }
    expect(measured).toEqual(expected);
  });
});
