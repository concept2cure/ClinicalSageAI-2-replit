/**
 * FDA us-regional Module-1 section heading element names.
 *
 * The FDA `us-regional.xml` backbone nests content leaves under section heading
 * elements whose names encode the CTD section, e.g. section 1.2 → element
 * `<m1-2-cover-letters>`, section 1.6.1 → `<m1-6-1-meeting-request>`. These
 * names are exactly the FDA context-of-use descriptions (`m1.2 cover letters`,
 * `m1.6.1 meeting request`) with dots/spaces collapsed to hyphens — so we
 * derive them from the v4.0 CoU code list (CL2) rather than hard-coding 124
 * element names. This keeps the v3.2.2 heading names and the v4.0 CoU codes in
 * lockstep from a single FDA-published source.
 *
 * @module server/services/ectd/controlled-vocab/fda-regional-sections
 */

import { CV_CONTEXT_OF_USE } from './cv-v4-data';

/** Normalize a CoU description ('m1.6.1 meeting request') to an element name. */
function toElementName(description: string): string {
  return description
    .trim()
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')          // drop parentheticals
    .replace(/[.\s]+/g, '-')           // dots + whitespace → hyphen
    .replace(/[^a-z0-9-]/g, '')        // strip anything else
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** section number ('1.6.1') → heading element name ('m1-6-1-meeting-request'). */
const SECTION_ELEMENT = new Map<string, string>();
for (const row of CV_CONTEXT_OF_USE.codes) {
  // code is 'us_1.6.1'; description is 'm1.6.1 meeting request'
  const section = row.code.replace(/^us_/, '');
  SECTION_ELEMENT.set(section, toElementName(row.description));
}

/**
 * The nearest FDA heading a section files under: the section itself when it is
 * a published heading, else its closest published ancestor ('1.1.1' → '1.1',
 * '1.3.4.2' → '1.3.4'). Returns null when neither exists (a heading that is an
 * ancestor of published leaves — '1.3.1' over 1.3.1.1…1.3.1.5 — or a code
 * outside the list).
 */
export function nearestUsRegionalHeading(ctdSection: string): string | null {
  let section = ctdSection.replace(/^m/i, '');
  while (section) {
    if (SECTION_ELEMENT.has(section)) return section;
    const cut = section.lastIndexOf('.');
    if (cut < 0) return null;
    section = section.slice(0, cut);
  }
  return null;
}

/** Where a Module 1 leaf files in us-regional.xml, and whether this code can stand behind it. */
export interface UsRegionalHeadingPlacement {
  /** The heading section the leaf files under ('1.1.1' → '1.1'); the leaf's own section when none is published. */
  heading: string;
  /** The element written for that heading. */
  element: string;
  /** Why this placement is not one the backbone builder can stand behind; absent when it is. */
  gap?: string;
}

/** True when a heading element's name encodes its own section ('1.3.4' → 'm1-3-4-…'). */
function encodesSection(element: string, section: string): boolean {
  return /^m(\d+(?:-\d+)*)(?=-[a-z]|$)/.exec(element)?.[1] === section.replace(/\./g, '-');
}

/** The headings between <m1-regional> and a heading: '1.14.4.1' → ['1.14', '1.14.4']. */
function parentHeadings(heading: string): string[] {
  const parts = heading.split('.');
  return parts.slice(2).map((_, i) => parts.slice(0, i + 2).join('.'));
}

/**
 * Where a Module 1 section's leaf is written, and what about that placement the
 * backbone builder cannot stand behind.
 *
 * 2026-10-01 (package-spine sweep F06): the builder writes every heading
 * directly under `<m1-regional>`. That is right only for a top-level heading
 * (1.1, 1.2, 1.19, 1.20). A deeper one belongs inside its parent heading, and
 * the parent's element name is not recorded here: this table is the v4.0
 * context-of-use list, which names only the headings leaves file under. 1.18 is
 * the one parent the list carries, and its description reads 'm1.18.1 naming',
 * so the name derived for it encodes 1.18.1, not 1.18. Nesting is therefore not
 * built (the names would be invented), and the gap says so, so that
 * regionConformant cannot be read off the region alone
 * (ectd/regional-backbone-readiness.ts).
 */
export function usRegionalHeadingPlacement(ctdSection: string): UsRegionalHeadingPlacement {
  const section = ctdSection.replace(/^m/i, '');
  const heading = nearestUsRegionalHeading(section);
  if (!heading) {
    const element = `m${section.replace(/\./g, '-')}`;
    return { heading: section, element, gap: `${section} has no published FDA heading, so <${element}> is not an FDA heading element` };
  }
  const element = SECTION_ELEMENT.get(heading)!;
  if (!encodesSection(element, heading)) {
    return { heading, element, gap: `${heading} is written as <${element}>, a recorded name that does not encode ${heading}` };
  }
  const parents = parentHeadings(heading);
  if (!parents.length) return { heading, element };
  const unusable = parents.filter((p) => !encodesSection(SECTION_ELEMENT.get(p) ?? '', p));
  const named = parents.map((p) => (SECTION_ELEMENT.has(p) ? `${p} (recorded as <${SECTION_ELEMENT.get(p)}>)` : p));
  return {
    heading,
    element,
    gap:
      `${heading} is written directly under <m1-regional>, not inside its parent heading ${named.join(', ')}: ` +
      (unusable.length
        ? `no element name this code can stand behind is recorded for ${unusable.join(', ')}`
        : 'this builder does not nest headings'),
  };
}

/**
 * Resolve the FDA us-regional heading element name for a CTD section.
 *
 * A leaf whose code is a DESCENDANT of a published heading nests under that
 * heading: the forms 1.1.1 / 1.1.2 / 1.1.3 file under `<m1-1-forms>`, a
 * 1.3.4.x financial-disclosure leaf under 1.3.4. FDA's heading list is the
 * leaf level of the regional hierarchy — there is no `<m1-1-1>` element, and
 * emitting one produced a backbone that validated locally (no DTD vendored)
 * and would fail the agency validator. Pinned by
 * __tests__/fda-regional-sections.test.ts.
 *
 * Falls back to `m<section-dashed>` only when no published ancestor exists
 * (so an unknown section still nests under a syntactically valid element).
 */
export function usRegionalSectionElement(ctdSection: string): string {
  return usRegionalHeadingPlacement(ctdSection).element;
}

/** True when the section is a recognized FDA Module-1 US regional section. */
export function isKnownUsRegionalSection(ctdSection: string): boolean {
  return SECTION_ELEMENT.has(ctdSection.replace(/^m/i, ''));
}
