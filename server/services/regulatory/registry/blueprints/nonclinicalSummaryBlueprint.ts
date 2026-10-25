/** Only CTD 2.6: project the canonical ICH M2–M5 record's 2.6 subtree.
 * ICH M4S governs format; it does not determine which studies are required.
 *
 * Both halves of the record (2026-10-20, D2 increment 3): the guidance half's
 * briefed codes, and the structural half's 2.6.4.1–10 and 2.6.6.1–10, the M4S
 * leaves of the pharmacokinetics and toxicology written summaries. Until then
 * this read the guidance half only, so those two summaries had no leaves.
 */
import type { SectionBlueprint } from '../../../../../shared/regulatory/document-taxonomy.js';
import type { RegulatoryBasis } from '../../../../../shared/regulatory/regulatory-basis.js';
import { ctdRecordSubtree } from '../../../market-specs/ctd-component-outlines.js';
import { CTD_AUTHORING_GUIDANCE } from '../../../ind/ctd/authoring-guidance.js';

export const outlineBasis: RegulatoryBasis = {
  ref: 'ICH M4S / FDA M4S: The CTD — Safety, §§2.6.1–2.6.7',
  url: 'https://www.fda.gov/media/71628/download',
  // 2026-10-20: recall, not regulator-text. The 2.6.1–2.6.7 headings were checked
  // on 2026-10-07; the 2.6.4.x and 2.6.6.x leaves added since rest on a search
  // extract (ich-m4-headings.ts), and an outline is only as checked as its rows.
  confidence: 'recall',
  // 2026-10-25 (3a review): the note said all twenty leaves were matched against a
  // search extract; the record's facts file says three were (g-ich-m4-headings-facts.md).
  note: "Heading codes 2.6.1–2.6.7, their organization and the written/tabulated summary distinction were checked against the FDA-hosted guidance on 2026-10-07. Of the 2.6.4.1–10 and 2.6.6.1–10 leaves (the ICH M4 heading record), 2.6.4.2, 2.6.6.2 and 2.6.6.10 were matched against a search extract on 2026-10-05; the other seventeen are recall, numbered by the guideline's pattern. A briefed code's purpose is the canonical authoring guidance; a leaf the record holds no brief for points to its written summary's brief.",
};
export const outlineLimitations = [
  'This record covers only the existing CTD 2.6.1–2.6.7 authoring summaries, not all of Module 2, the interpretive Nonclinical Overview (2.4), or the Module 4 study reports.',
  'ICH M4S supplies an organization for acquired nonclinical data; it does not determine the studies a specific product must conduct.',
  'Required flags describe the selected platform summary scaffold. Confirm applicability and justify unavailable or inapplicable data using current product-specific guidance and the receiving agency/client template.',
  'Keep written and tabulated values consistent with their actual versioned study reports. Deterministic analyses, source review, scientific approval and technical package validation remain separate.',
];

/**
 * The content type the record gives the same heading in a sibling written
 * summary: 2.6.4.10 and 2.6.6.10 Tables and Figures are what 2.6.2.7 is
 * ('mixed'), never the prose type of their parent (3a review, 2026-10-25).
 */
function sameHeadingType(title: string): SectionBlueprint['sections'][number]['contentType'] | undefined {
  return Object.values(CTD_AUTHORING_GUIDANCE).find((s) => s.code.startsWith('2.6.') && s.title === title)?.contentType;
}

export const NONCLINICAL_SUMMARY_SECTION_BLUEPRINT: SectionBlueprint = {
  id: 'ich_nonclin_summary_sections',
  name: 'Nonclinical Written and Tabulated Summaries — CTD 2.6',
  sections: ctdRecordSubtree('2.6').map(({ code, title, brief }) => {
    // A structural leaf (2.6.4.3 Absorption) is written to its written summary's brief (2.6.4).
    const owner = brief ?? CTD_AUTHORING_GUIDANCE[code.slice(0, code.lastIndexOf('.'))];
    return {
      code, title, module: 2, contentType: brief?.contentType ?? sameHeadingType(title) ?? owner?.contentType ?? 'narrative',
      // The legacy CtdSection.required flag is initial-IND-specific. Do not
      // turn it into a universal legal determination for this global record.
      required: true,
      guidance: brief
        ? `${brief.authoringGuidance} ICH M4S defines summary organization, not which studies are required; confirm product and regional applicability.`
        : `The ICH M4S heading ${code} within ${owner ? `${owner.code} ${owner.title}` : '2.6'}; the record holds no brief of its own for it. Draft it to the ${owner?.code ?? '2.6'} brief. ICH M4S defines summary organization, not which studies are required; confirm product and regional applicability.`,
    };
  }),
};
export { NONCLINICAL_SUMMARY_SECTION_BLUEPRINT as sectionBlueprint };
