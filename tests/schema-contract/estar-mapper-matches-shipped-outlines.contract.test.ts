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
});
