/**
 * The canvas tree is derived from the filing type, not hardcoded.
 *
 * ── What was wrong ────────────────────────────────────────────────────────────
 * `DocumentAuthoring.tsx` navigated by `useState('M3')` — a Module (M1–M5) ×
 * status dropdown pair, identical for every filing type. A BLA, an IND, a
 * 510(k) and a CER all opened the same two selects defaulted to "M3", while the
 * correct tree for that exact filing already sat scaffolded in
 * `c2c_document_sections` and was already served by
 * `GET /api/c2c/documents/:id/outline`.
 *
 * The stated architecture is a canvas whose folders come from "the project
 * management module document type or regulatory filing file". These tests hold
 * that line: they use the real shapes the two rule packs produce, so a
 * regression to a fixed module list fails here rather than in front of a
 * customer opening the dossier they are betting the company on.
 */

import { describe, it, expect } from 'vitest';

import {
  buildOutlineTree,
  flattenOutline,
  findSectionForNode,
  nodeHasDraft,
  type FilingOutlineRow,
} from '../useFilingOutline';

const row = (
  key: string,
  parent_key: string | null,
  label: string,
  path_order: number,
  extra: Partial<FilingOutlineRow> = {},
): FilingOutlineRow => ({
  key, parent_key, label, path_order,
  mandatory: true, status: 'todo', draft_source: null,
  has_content: false, version: 1, ...extra,
});

/** The shape bla:fda produces — CTD modules with sections beneath them. */
const BLA_ROWS: FilingOutlineRow[] = [
  row('M1', null, 'Module 1 · Administrative (US)', 1),
  row('1.1', 'M1', 'Forms (FDA 356h)', 2),
  row('1.3', 'M1', 'Administrative information', 3),
  row('1.3.1', '1.3', 'Contact and agent information', 4),
  row('M2', null, 'Module 2 · Summaries', 5),
  row('2.5', 'M2', 'Clinical overview', 6),
];

/** The shape k510:fda produces — lettered parts, a different vocabulary. */
const K510_ROWS: FilingOutlineRow[] = [
  row('A', null, 'Administrative', 1),
  row('A1', 'A', 'FDA Form 3514', 2),
  row('B', null, 'Device description', 3),
  row('C', null, 'Substantial equivalence', 4),
  row('D', null, 'Performance testing', 5),
  row('E', null, 'Labeling', 6),
];

describe('the outline is derived from the filing type', () => {
  it('a BLA renders CTD modules with sections nested beneath them', () => {
    const tree = buildOutlineTree(BLA_ROWS);
    expect(tree.map((n) => n.key)).toEqual(['M1', 'M2']);
    expect(tree[0].children.map((n) => n.key)).toEqual(['1.1', '1.3']);
    // Three levels deep — the thing a flat module filter cannot express.
    expect(tree[0].children[1].children.map((n) => n.key)).toEqual(['1.3.1']);
    expect(tree[0].children[1].children[0].depth).toBe(2);
  });

  it('a 510(k) renders lettered parts, not modules', () => {
    const tree = buildOutlineTree(K510_ROWS);
    expect(tree.map((n) => n.key)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(tree[0].children.map((n) => n.key)).toEqual(['A1']);
  });

  it('THE FALSIFICATION — the two filings do not produce the same tree', () => {
    // If this ever passes as equal, the canvas has gone back to a fixed module
    // list and the filing type is no longer reaching it. That is the entire
    // defect this work exists to close, so it is asserted directly.
    const bla = flattenOutline(buildOutlineTree(BLA_ROWS)).map((n) => n.key);
    const k510 = flattenOutline(buildOutlineTree(K510_ROWS)).map((n) => n.key);
    expect(bla).not.toEqual(k510);
    expect(bla.some((k) => k.startsWith('M'))).toBe(true);
    expect(k510.some((k) => k.startsWith('M'))).toBe(false);
  });
});

describe('the tree walk preserves the pack', () => {
  it('orders by path_order regardless of the order rows arrive in', () => {
    const shuffled = [...BLA_ROWS].reverse();
    const flat = flattenOutline(buildOutlineTree(shuffled)).map((n) => n.key);
    expect(flat).toEqual(['M1', '1.1', '1.3', '1.3.1', 'M2', '2.5']);
  });

  it('loses no section — every row appears exactly once', () => {
    const flat = flattenOutline(buildOutlineTree(BLA_ROWS));
    expect(flat).toHaveLength(BLA_ROWS.length);
    expect(new Set(flat.map((n) => n.key)).size).toBe(BLA_ROWS.length);
  });

  it('promotes an unresolvable parent to a root rather than dropping the row', () => {
    // Rule packs are authored data. A typo in parent_key must not make a
    // mandatory section silently vanish from the editor — misplaced is
    // visible and fixable, absent is neither.
    const withTypo = [...BLA_ROWS, row('9.9', 'DOES-NOT-EXIST', 'Orphaned section', 99)];
    const flat = flattenOutline(buildOutlineTree(withTypo));
    expect(flat.map((n) => n.key)).toContain('9.9');
    expect(flat).toHaveLength(withTypo.length);
  });

  it('handles an empty pack without throwing', () => {
    expect(buildOutlineTree([])).toEqual([]);
    expect(flattenOutline([])).toEqual([]);
  });
});

describe('binding an outline node to the section that holds its text', () => {
  const sections = [
    { id: 's1', code: '2.5', title: 'Clinical overview' },
    { id: 's2', code: '1.1', title: 'Forms' },
    { id: 's3', code: null, title: 'Untitled draft' },
  ];

  it('matches by code', () => {
    expect(findSectionForNode(sections, '2.5')?.id).toBe('s1');
    expect(findSectionForNode(sections, '1.1')?.id).toBe('s2');
  });

  it('returns null for a node with no authored section yet', () => {
    expect(findSectionForNode(sections, '3.2.S')).toBeNull();
  });

  it('never matches a null code — the worst failure would be opening the wrong text', () => {
    // authoring_sections.code is nullable TEXT. Collapsing null onto a real
    // section key would show one section's content under another section's
    // heading, which is worse than showing nothing at all.
    expect(findSectionForNode(sections, '')).toBeNull();
    expect(findSectionForNode(sections, 'null')).toBeNull();
    expect(findSectionForNode(sections, undefined as unknown as string)).toBeNull();
  });
});


describe('the draft indicator is asked of BOTH stores', () => {
  // has_content is computed from the GOVERNED store (c2c_document_sections).
  // The editor that renders this tree writes the OTHER one (authoring_sections)
  // via PATCH /api/authoring/sections/:id. Reading only the node's flag meant
  // the dot could never light for anything drafted in that editor — a progress
  // indicator blind to the editor it sits inside.
  const node = (has_content: boolean) => ({ has_content });

  it('lights for text authored in THIS editor, which the governed flag cannot see', () => {
    expect(nodeHasDraft(node(false), { content: 'The investigational product…' })).toBe(true);
  });

  it('still lights for text written through the governed path', () => {
    // Drafted by the mdx dossier editor or AnA — no authored section here yet.
    expect(nodeHasDraft(node(true), null)).toBe(true);
  });

  it('stays dark when neither store has anything', () => {
    expect(nodeHasDraft(node(false), null)).toBe(false);
    expect(nodeHasDraft(node(false), { content: null })).toBe(false);
    expect(nodeHasDraft(node(false), { content: '' })).toBe(false);
  });

  it('does not count whitespace as a draft', () => {
    // Matches the server-side predicate the governed flag comes from
    // (server/services/c2c/section-content.ts), so the two sides of the OR
    // agree about what "written" means.
    expect(nodeHasDraft(node(false), { content: '   \n\t ' })).toBe(false);
  });
});
