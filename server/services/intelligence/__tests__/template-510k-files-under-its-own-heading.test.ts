/**
 * The seeded 510(k) template files each section under the eSTAR heading that
 * means the same thing (MDX journey M5, `.design/client-journey/MDX_JOURNEY_2026-11-01.md`).
 *
 * `fda_510k_se` (template-seeds.ts) was coded D1, SE1, SE2, B1, B2, S1, L1, C1.
 * The shipped outline `fda-estar-510k-v1.1`
 * (migrations/20261005c_k510_denovo_estar_outline_v1_1.sql) is keyed
 * A…G, and `filingSectionKey` matches a section to a node by code alone. So,
 * verified 2026-10-18 (docs/evidence/ANA-REASONING/2026-10-05/r16/template-outline-code-collision/):
 * biocompatibility (B2) was filed as the Indications for use statement, bench
 * testing (B1) as the Device description, clinical performance (C1) as the
 * predicates, the device description (D1) as Design and manufacturing; and the
 * predicate identification, the SE comparison, software and labeling reached no
 * node at all. Step 1 (b18001667e) made a corrected seed re-apply; this is the
 * correction.
 *
 * Read from the migration that ships the outline, so the test fails the day
 * either side moves without the other.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SEED_TEMPLATES } from '../template-seeds';
import { filingSectionKey } from '../../../../shared/regulatory/filing-section-key';
import { sectionStructureIssues } from '../../../../shared/regulatory/section-code';

const ROOT = path.resolve(__dirname, '../../../..');
const OUTLINE_SQL = path.join(ROOT, 'migrations/20261005c_k510_denovo_estar_outline_v1_1.sql');

/** The k510 v1.1 tree, key → label, as the migration seeds it. */
function k510Outline(): Map<string, string> {
  const sql = fs.readFileSync(OUTLINE_SQL, 'utf8');
  const m = sql.match(/k510_tree\s+jsonb\s*:=\s*\$pack\$(\[.*?\])\$pack\$/s);
  if (!m) throw new Error('k510_tree not found in the outline migration');
  const nodes = JSON.parse(m[1]) as Array<{ key: string; label: string }>;
  return new Map(nodes.map((n) => [n.key, n.label]));
}

const template = SEED_TEMPLATES.find((t) => t.templateCode === 'fda_510k_se');

/** Each template section by its meaning, and the outline node that means the same. */
const SAME_MEANING: Array<[RegExp, string, RegExp]> = [
  [/^Device description/, 'B1', /^Device description and principles of operation/],
  [/^Predicate device identification/, 'C1', /^Predicate and reference devices/],
  [/^Substantial equivalence comparison/, 'C2', /^Substantial equivalence discussion/],
  [/^Bench testing/, 'E5', /^Bench performance testing/],
  [/^Biocompatibility/, 'E1', /^Biocompatibility/],
  [/^Software documentation/, 'E2', /^Software and firmware/],
  [/^Labeling/, 'D2', /^Proposed labeling/],
  [/^Clinical performance/, 'E7', /^Clinical performance testing/],
];

describe('the seeded 510(k) template files under the eSTAR outline it is scaffolded against', () => {
  const outline = k510Outline();
  const keys = [...outline.keys()];

  it('exists, with one section for each meaning', () => {
    expect(template, 'fda_510k_se is gone from the seeds').toBeTruthy();
    expect(template!.sections).toHaveLength(SAME_MEANING.length);
  });

  it.each(SAME_MEANING.map(([title, key, label]) => [title.source, key, label] as const))(
    '%s files under %s',
    (titleSource, key, label) => {
      const section = template!.sections.find((s) => new RegExp(titleSource).test(s.sectionTitle));
      expect(section, `no template section matches ${titleSource}`).toBeTruthy();
      const node = filingSectionKey(keys, section!.sectionCode);
      expect(node, `"${section!.sectionTitle}" (${section!.sectionCode}) reaches no outline node`).not.toBeNull();
      expect(
        outline.get(node!),
        `"${section!.sectionTitle}" (${section!.sectionCode}) files under "${outline.get(node!)}"`,
      ).toMatch(label);
      expect(node).toBe(key);
    },
  );

  it('no two sections file under the same heading', () => {
    const nodes = template!.sections.map((s) => filingSectionKey(keys, s.sectionCode));
    expect(new Set(nodes).size).toBe(nodes.length);
  });

  /* Walking the journey in the running app, 2026-11-02: a document made from
     this template warned "These sections are stored in an order that differs
     from their section codes, and they assemble and export in the stored
     order". The codes became the outline's keys (M5) but kept the old reading
     order (bench before biocompatibility, labeling near the end), so every new
     510(k) document carried the warning and exported out of the eSTAR's order.
     This is the editor's own rule (shared/regulatory/section-code.ts). */
  it('is stored in the order its codes belong in, which is the outline\'s order', () => {
    const stored = [...template!.sections].sort((a, b) => a.ordering - b.ordering).map((s) => s.sectionCode);
    const issues = sectionStructureIssues(stored);
    expect(issues.outOfOrder, `stored ${stored.join(', ')}; belongs ${issues.suggestedOrder.join(', ')}`).toBe(false);
    const outlineOrder = keys.filter((k) => stored.includes(k));
    expect(stored).toEqual(outlineOrder);
  });
});
