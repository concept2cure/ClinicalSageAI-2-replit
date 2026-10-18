/**
 * Which part of a filing a governed document holds (docs/design/FILING_SPINE.md
 * F22). A project's home filing holds the whole outline; a market added to the
 * project holds only that market's regional modules — Module 1 and 3.2.R — from
 * its own rule pack. One rule, shared by the server's scaffold, the outline
 * route, the commit to the filing and the editor's outline.
 */

/** Module 1 ('M1', '1.*') and 3.2.R ('3.2.R', '3.2.R.*'): a market's own sections. */
export function isRegionalSectionKey(key: string): boolean {
  return key === 'M1' || key.startsWith('1.') || key === '3.2.R' || key.startsWith('3.2.R.');
}

export interface PackSectionLike { key?: unknown; parent_key?: unknown; label?: unknown; mandatory?: unknown; path_order?: unknown }

const keyOf = (s: PackSectionLike) => (typeof s.key === 'string' ? s.key : '');

/**
 * A pack's regional sections plus every ancestor one of them names, so the
 * subtree has no dangling parent ('3.2.R' brings 'M3'). Order is the pack's.
 */
export function regionalSubtree<T extends PackSectionLike>(sections: unknown): T[] {
  const all = (Array.isArray(sections) ? sections : []) as T[];
  const byKey = new Map(all.map((s) => [keyOf(s), s]));
  const kept = new Set(all.map(keyOf).filter(isRegionalSectionKey));
  for (const k of [...kept]) {
    let parent = byKey.get(k)?.parent_key;
    while (typeof parent === 'string' && byKey.has(parent) && !kept.has(parent)) {
      kept.add(parent);
      parent = byKey.get(parent)?.parent_key;
    }
  }
  return all.filter((s) => kept.has(keyOf(s)));
}

/**
 * A market document's outline: its regional sections, and the gaps — the
 * market pack's mandatory sections outside its own part that the home filing's
 * outline does not hold. A gap is shown, never inserted (FILING_SPINE §3:
 * "It is never inserted silently").
 */
export function marketOutlineView<T extends PackSectionLike>(
  sections: unknown,
  homeKeys: ReadonlySet<string>,
): { rows: T[]; gaps: Array<{ key: string; label: string }> } {
  const rows = regionalSubtree<T>(sections);
  const own = new Set(rows.map(keyOf));
  const all = (Array.isArray(sections) ? sections : []) as T[];
  const gaps = all
    .filter((s) => s.mandatory === true && !own.has(keyOf(s)) && keyOf(s) !== '' && !homeKeys.has(keyOf(s)))
    .map((s) => ({ key: keyOf(s), label: typeof s.label === 'string' ? s.label : keyOf(s) }));
  return { rows, gaps };
}
