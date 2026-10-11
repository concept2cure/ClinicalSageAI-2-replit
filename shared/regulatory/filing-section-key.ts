/**
 * Which node of a filing's outline an authored section belongs to — the one
 * rule the server's filing write (server/services/c2c/filing-section-target.ts)
 * and the editor's outline (client useFilingOutline findSectionForNode) share.
 *
 * QA 2026-10-08, walk 2 (j4): the 2.5 Clinical Overview's sections are
 * 2.5.1 … 2.5.7 and the IND outline files the Clinical Overview as one node,
 * 2.5. The match was exact, so nothing written there reached the filing and
 * the outline's 2.5 never opened the document's text.
 *
 *   - a section whose code IS an outline key belongs to that node;
 *   - otherwise to its nearest outline ancestor, when the outline does not
 *     subdivide that ancestor (no outline key under it) and it is below a bare
 *     module (two segments or more): that node is one document, and the
 *     section is part of it;
 *   - otherwise to no node. A node the outline subdivides (3.2.S → 3.2.S.1 …)
 *     is a container, and a section under it with no node of its own has no
 *     place in the filing.
 */
export function filingSectionKey(keys: ReadonlyArray<string>, code: string | null | undefined): string | null {
  if (typeof code !== 'string' || code === '') return null;
  if (keys.includes(code)) return code;
  const ancestors = keys.filter((k) => k !== '' && code.startsWith(`${k}.`));
  if (ancestors.length === 0) return null;
  const nearest = ancestors.reduce((a, b) => (b.length > a.length ? b : a));
  if (nearest.split('.').length < 2) return null;
  return keys.some((k) => k.startsWith(`${nearest}.`)) ? null : nearest;
}
