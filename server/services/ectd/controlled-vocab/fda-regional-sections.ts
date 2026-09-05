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
  const section = ctdSection.replace(/^m/i, '');
  const heading = nearestUsRegionalHeading(section);
  if (heading) return SECTION_ELEMENT.get(heading)!;
  return `m${section.replace(/\./g, '-')}`;
}

/** True when the section is a recognized FDA Module-1 US regional section. */
export function isKnownUsRegionalSection(ctdSection: string): boolean {
  return SECTION_ELEMENT.has(ctdSection.replace(/^m/i, ''));
}
