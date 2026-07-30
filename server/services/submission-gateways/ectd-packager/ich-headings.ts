/**
 * ICH eCTD v3.2.2 backbone heading hierarchy (Modules 2–5).
 *
 * The ICH eCTD backbone (index.xml, root `ectd:ectd`) is NOT a flat list of
 * `<m2>..<m5>` blocks — it is a nested tree of named heading elements, and each
 * leaf attaches under the deepest heading whose CTD section it belongs to. A
 * flat `<m3>` element is not a valid `ectd:ectd` child; the DTD element is
 * `m3-quality`, containing `m3-2-body-of-data`, containing `m3-2-s-drug-substance`,
 * and the leaves live there.
 *
 * This module encodes the authoritative heading names + nesting from the ICH
 * eCTD Specification v3.2.2 (the same structure the `ich-ectd-3-2.dtd` defines),
 * and places leaves into it. It is the single source of truth for both backbone
 * generators (the regional packager's `buildIndexXml` and the DB-driven
 * `ectdExportService.generateIndexXml`) and for the structural validator, so the
 * repo emits and checks ONE authoritative convention.
 *
 * Module 1 is region-specific and lives in the regional backbone
 * (us-regional.xml, …), not here.
 *
 * Verification note: the emitted tree is pinned by unit tests
 * (`ich-headings.test.ts`). Final DTD-validity is asserted by the qualification
 * harness's `xmllint --dtdvalid` step the moment `ich-ectd-3-2.dtd` is present in
 * the package's `util/dtd/` (see server/services/ectd/qualification). Production
 * submission is gated on that DTD being present (`ECTD_REQUIRE_DTD`).
 *
 * @module server/services/submission-gateways/ectd-packager/ich-headings
 */

/**
 * The minimal shape a leaf needs for heading placement. Structurally satisfied
 * by EctdLeaf and by any generator's granule record — no cast required.
 */
export interface SectionedLeaf {
  /** CTD section code, e.g. '3.2.S.1', '5.3.5.1'. Case-insensitive. */
  ctdSection: string;
}

/** One heading element in the ICH backbone tree. */
export interface IchHeading {
  /** The DTD element name, e.g. 'm3-2-s-drug-substance'. */
  element: string;
  /** The CTD section this heading covers, e.g. '3.2.S'. Case-insensitive. */
  section: string;
  /** Nested sub-headings, deepest-last placement wins. */
  children?: IchHeading[];
}

/**
 * ICH eCTD v3.2.2 Module 2–5 heading tree (top-level module elements + their
 * defined sub-headings). Leaves attach under the DEEPEST heading whose section
 * is a segment-prefix of the leaf's CTD section; deeper CTD sub-sections (e.g.
 * 3.2.S.1, 5.3.5.1) attach as leaves under their nearest defined heading
 * (m3-2-s-drug-substance, m5-3-5-reports-of-efficacy-and-safety-studies).
 */
export const ICH_BACKBONE: IchHeading[] = [
  {
    element: 'm2-common-technical-document-summaries',
    section: '2',
    children: [
      { element: 'm2-2-introduction', section: '2.2' },
      { element: 'm2-3-quality-overall-summary', section: '2.3' },
      { element: 'm2-4-nonclinical-overview', section: '2.4' },
      { element: 'm2-5-clinical-overview', section: '2.5' },
      { element: 'm2-6-nonclinical-written-and-tabulated-summaries', section: '2.6' },
      { element: 'm2-7-clinical-summary', section: '2.7' },
    ],
  },
  {
    element: 'm3-quality',
    section: '3',
    children: [
      {
        element: 'm3-2-body-of-data',
        section: '3.2',
        children: [
          { element: 'm3-2-s-drug-substance', section: '3.2.S' },
          { element: 'm3-2-p-drug-product', section: '3.2.P' },
          { element: 'm3-2-a-appendices', section: '3.2.A' },
          { element: 'm3-2-r-regional-information', section: '3.2.R' },
        ],
      },
      { element: 'm3-3-literature-references', section: '3.3' },
    ],
  },
  {
    element: 'm4-nonclinical-study-reports',
    section: '4',
    children: [
      {
        element: 'm4-2-study-reports',
        section: '4.2',
        children: [
          { element: 'm4-2-1-pharmacology', section: '4.2.1' },
          { element: 'm4-2-2-pharmacokinetics', section: '4.2.2' },
          { element: 'm4-2-3-toxicology', section: '4.2.3' },
        ],
      },
      { element: 'm4-3-literature-references', section: '4.3' },
    ],
  },
  {
    element: 'm5-clinical-study-reports',
    section: '5',
    children: [
      { element: 'm5-2-tabular-listing-of-all-clinical-studies', section: '5.2' },
      {
        element: 'm5-3-clinical-study-reports',
        section: '5.3',
        children: [
          { element: 'm5-3-1-reports-of-biopharmaceutic-studies', section: '5.3.1' },
          {
            element: 'm5-3-2-reports-of-studies-pertinent-to-pharmacokinetics-using-human-biomaterials',
            section: '5.3.2',
          },
          { element: 'm5-3-3-reports-of-human-pharmacokinetic-pk-studies', section: '5.3.3' },
          { element: 'm5-3-4-reports-of-human-pharmacodynamic-pd-studies', section: '5.3.4' },
          { element: 'm5-3-5-reports-of-efficacy-and-safety-studies', section: '5.3.5' },
          { element: 'm5-3-6-reports-of-post-marketing-experience', section: '5.3.6' },
          { element: 'm5-3-7-case-report-forms-and-individual-patient-listings', section: '5.3.7' },
        ],
      },
      { element: 'm5-4-literature-references', section: '5.4' },
    ],
  },
];

/** Every valid backbone heading element name (module roots + all descendants). */
export function allHeadingElements(): string[] {
  const out: string[] = [];
  const walk = (hs: IchHeading[]) => {
    for (const h of hs) {
      out.push(h.element);
      if (h.children) walk(h.children);
    }
  };
  walk(ICH_BACKBONE);
  return out;
}

/** Case-insensitive segment-aware prefix test: is `section` under `prefix`? */
function sectionIsUnder(section: string, prefix: string): boolean {
  const s = section.toLowerCase().split('.');
  const p = prefix.toLowerCase().split('.');
  if (p.length > s.length) return false;
  return p.every((seg, i) => seg === s[i]);
}

/**
 * Find the deepest heading path (root → … → deepest) for a leaf's CTD section.
 * Returns the chain of headings the leaf nests under, or null if the leaf's
 * module is not in the tree (Module 1 is regional and handled elsewhere).
 */
export function headingPathFor(ctdSection: string): IchHeading[] | null {
  const chain: IchHeading[] = [];
  let level = ICH_BACKBONE;
  let matched = true;
  while (matched) {
    matched = false;
    // Deepest-first among candidates at this level: pick the heading whose
    // section is the LONGEST segment-prefix of the leaf's section.
    let best: IchHeading | null = null;
    for (const h of level) {
      if (sectionIsUnder(ctdSection, h.section)) {
        if (!best || h.section.split('.').length > best.section.split('.').length) best = h;
      }
    }
    if (best) {
      chain.push(best);
      matched = true;
      level = best.children ?? [];
    }
  }
  return chain.length ? chain : null;
}

/** A leaf plus the rendered `<leaf>` XML string that represents it. */
export interface RenderedLeaf {
  leaf: SectionedLeaf;
  xml: string;
}

/**
 * Build the nested Module 2–5 heading XML for a set of rendered leaves.
 *
 * Leaves are grouped under the deepest matching ICH heading; empty headings are
 * omitted (only headings that contain a leaf, directly or transitively, are
 * emitted). Leaves whose module (2–5) has no deeper matching heading attach at
 * the module root. Leaves outside Modules 2–5 (e.g. Module 1) are ignored here.
 *
 * @param rendered  the leaves to place, each with its pre-rendered `<leaf>` XML
 * @param indent    the base indent (number of spaces) for the module elements
 */
export function buildIchModuleTree(rendered: RenderedLeaf[], indent = 2): string {
  // Group leaves by the element that owns them (deepest heading in their path).
  const ownerOf = new Map<SectionedLeaf, string>(); // leaf → owning element name
  for (const r of rendered) {
    const path = headingPathFor(r.leaf.ctdSection);
    if (!path) continue; // not an m2–m5 leaf
    ownerOf.set(r.leaf, path[path.length - 1].element);
  }
  const leavesByElement = new Map<string, RenderedLeaf[]>();
  for (const r of rendered) {
    const el = ownerOf.get(r.leaf);
    if (!el) continue;
    const list = leavesByElement.get(el) ?? [];
    list.push(r);
    leavesByElement.set(el, list);
  }

  // A heading is emitted if it (or any descendant) owns a leaf.
  const hasContent = (h: IchHeading): boolean =>
    (leavesByElement.get(h.element)?.length ?? 0) > 0 || (h.children?.some(hasContent) ?? false);

  const pad = (n: number) => ' '.repeat(n);

  const renderHeading = (h: IchHeading, depth: number): string => {
    if (!hasContent(h)) return '';
    const inner: string[] = [];
    // Direct leaves first, then child headings (spec reads content top-down).
    for (const r of leavesByElement.get(h.element) ?? []) {
      inner.push(r.xml.split('\n').map((l) => (l ? pad(depth + 2) + l : l)).join('\n'));
    }
    for (const child of h.children ?? []) {
      const childXml = renderHeading(child, depth + 2);
      if (childXml) inner.push(childXml);
    }
    return `${pad(depth)}<${h.element}>\n${inner.join('\n')}\n${pad(depth)}</${h.element}>`;
  };

  return ICH_BACKBONE.map((m) => renderHeading(m, indent))
    .filter(Boolean)
    .join('\n');
}
