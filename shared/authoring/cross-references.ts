/**
 * Cross-references — the storage contract, and how one becomes text.
 *
 * ── The problem ─────────────────────────────────────────────────────────────
 * "See Section 2.7.4.2" and "as shown in Table 3" are plain, unmanaged prose in
 * an authored section. When a section is renumbered or moved, every reference
 * to it silently becomes wrong, and the only way to find them is by eye. The
 * platform's own shadow review already names this: cross-references point at
 * section NUMBERS rather than at the leaf they mean.
 *
 * ── The one design rule ─────────────────────────────────────────────────────
 * A cross-reference stores THE TARGET'S IDENTITY AND NEVER ITS PRINTED NUMBER.
 * "2.7.4.2" is a rendering of where a section currently sits, not a name for
 * it. Store the section id; resolve the display text at render time. Renumber
 * the target and every reference to it comes out right with nobody touching
 * the referring sections' stored content — that property is the whole feature,
 * and it is the assertion the tests are built around.
 *
 * It is the same principle as the footnote marker being derived from position
 * rather than stored (see server/export/authoring-blocks-to-html.ts).
 *
 * ── The stored form ─────────────────────────────────────────────────────────
 *     <a data-xref="<section id>" data-xref-display="code">2.7.4.2</a>
 *
 * The element's TEXT is a cache of the last-known rendering. It exists for two
 * narrow reasons and is authoritative for neither renderer:
 *   - the editor's round-trip fidelity gate compares stored text against parsed
 *     text, and a node contributing no text would drop every section holding a
 *     reference into raw source mode;
 *   - a consumer that knows nothing of cross-references (a plain-text
 *     extraction, a search index) still sees words rather than a gap.
 * Both governed renderers IGNORE it and resolve from the target directory. A
 * reference is never printed from its cache, because the cache is exactly the
 * stale number this feature exists to abolish.
 *
 * ── The failure state ───────────────────────────────────────────────────────
 * A reference whose target is not in the document resolves to
 * CROSS_REFERENCE_MISSING_TEXT — stated, in place, in the editor and in the
 * filed document. Never a plausible-looking wrong number, and never silence.
 * The text names no identifier: an internal id is not something a filed
 * document may carry.
 */

/** Carries the target's identity. Its presence is what makes an `a` a reference. */
export const CROSS_REF_TARGET_ATTR = 'data-xref';
/** Carries how much of the target to print. */
export const CROSS_REF_DISPLAY_ATTR = 'data-xref-display';

/** How much of the target a reference prints.
 *  `code` for the terse mid-sentence form ("see 2.7.4.2"), `code-title` for the
 *  form a reviewer can follow without turning back ("see 2.7.4.2 Efficacy
 *  Summary"). Both are resolved; neither is stored. */
export type CrossReferenceDisplay = 'code' | 'code-title';

export const CROSS_REFERENCE_DISPLAYS: readonly CrossReferenceDisplay[] = ['code', 'code-title'];

export function normalizeCrossReferenceDisplay(value: unknown): CrossReferenceDisplay {
  return value === 'code' ? 'code' : 'code-title';
}

/** What a target is, as far as a reference is concerned.
 *
 *  A SECTION is one: `code` is "2.7.4.2" and `title` is "Efficacy Summary". So
 *  is a captioned TABLE or FIGURE: `code` is "Table 3" — a rendering of where it
 *  currently sits, computed by the caller from position — and `title` is its
 *  caption. Nothing below this line knows the difference, which is the point:
 *  captions reuse this resolver rather than running a second one beside it. */
export interface CrossReferenceTarget {
  id: string;
  code?: string | null;
  title?: string | null;
}

/** Resolves a target id against the sections of the document being rendered.
 *  Returns null/undefined when the id names nothing in it — which is the
 *  dangling case, and must be reported rather than papered over. */
export type CrossReferenceLookup = (
  targetId: string,
) => CrossReferenceTarget | null | undefined;

/**
 * What a reference prints when its target is gone.
 *
 * It is deliberately not a number, not the reference's last-known text, and not
 * an identifier. A reviewer reading a filed page must be able to see that a
 * reference could not be resolved; a medical writer must be able to find it.
 *
 * It says "the target" and not "the target section" because a target is not
 * always a section: a captioned table or figure is a target too (see
 * ./captions.ts), and a reference to a deleted TABLE that reported a missing
 * section would be telling a reviewer to look for the wrong thing.
 */
export const CROSS_REFERENCE_MISSING_TEXT =
  '[Cross-reference unresolved — the target is not part of this document]';

export interface ResolvedCrossReference {
  /** True only when the target was found AND had something to print. */
  found: boolean;
  /** The text to render. Never the caller's cached text. */
  text: string;
  target: CrossReferenceTarget | null;
}

/** The printed form of a target. Empty when the target names nothing. */
export function crossReferenceText(
  target: CrossReferenceTarget,
  display: CrossReferenceDisplay,
): string {
  const code = (target.code ?? '').trim();
  const title = (target.title ?? '').trim();
  if (display === 'code') return code || title;
  return [code, title].filter(Boolean).join(' ');
}

/**
 * Resolve one reference. The single entry point every renderer uses, so the
 * editor, the DOCX branch and the HTML/PDF branch cannot disagree about what a
 * reference says or about when it is broken.
 *
 * A target that exists but has neither code nor title counts as UNRESOLVED: it
 * has no printable name, and inventing one is the fabrication this refuses.
 */
export function resolveCrossReference(
  targetId: string | null | undefined,
  display: CrossReferenceDisplay,
  lookup: CrossReferenceLookup | null | undefined,
): ResolvedCrossReference {
  const id = (targetId ?? '').trim();
  const target = id && lookup ? lookup(id) ?? null : null;
  if (!target) return { found: false, text: CROSS_REFERENCE_MISSING_TEXT, target: null };
  const text = crossReferenceText(target, display);
  if (!text) return { found: false, text: CROSS_REFERENCE_MISSING_TEXT, target };
  return { found: true, text, target };
}

/** Anchor id for a section in exported HTML, and the fragment a reference links to. */
export function crossReferenceAnchorId(targetId: string): string {
  return `xref-${String(targetId).replace(/[^A-Za-z0-9_-]/g, '')}`;
}

/**
 * Word bookmark name for a section.
 *
 * Word's rules: letters, digits and underscores only, must start with a letter,
 * at most 40 characters. Section ids are UUIDs, which sanitize to 32 characters
 * and fit — but a longer id must NOT be truncated into a name it could share
 * with another section, because two sections sharing a bookmark would send a
 * reviewer to the wrong part of a filed document. Anything that does not fit is
 * given a hashed suffix instead.
 */
export function crossReferenceBookmarkId(targetId: string): string {
  const clean = String(targetId).replace(/[^A-Za-z0-9]/g, '');
  if (clean.length > 0 && clean.length <= 36) return `Sec_${clean}`;
  // FNV-1a, 32-bit, hex — deterministic and export-reproducible.
  let h = 0x811c9dc5;
  const s = String(targetId);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `Sec_${clean.slice(0, 24)}_${h.toString(16).padStart(8, '0')}`;
}

/** Build a lookup over the sections of one document. */
export function crossReferenceLookupFor(
  sections: readonly CrossReferenceTarget[],
): CrossReferenceLookup {
  const byId = new Map<string, CrossReferenceTarget>();
  for (const s of sections) if (s && s.id) byId.set(String(s.id), s);
  return (targetId: string) => byId.get(String(targetId)) ?? null;
}
