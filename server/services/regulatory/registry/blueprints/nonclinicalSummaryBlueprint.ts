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
  note: 'Heading codes 2.6.1–2.6.7, their organization and the written/tabulated summary distinction were checked against the FDA-hosted guidance on 2026-10-07. The 2.6.4.1–10 and 2.6.6.1–10 leaves are from the ICH M4 heading record, matched against a search extract, not re-read. Purpose notes are the existing canonical platform authoring guidance.',
};
export const outlineLimitations = [
  'This record covers only the existing CTD 2.6.1–2.6.7 authoring summaries, not all of Module 2, the interpretive Nonclinical Overview (2.4), or the Module 4 study reports.',
  'ICH M4S supplies an organization for acquired nonclinical data; it does not determine the studies a specific product must conduct.',
  'Required flags describe the selected platform summary scaffold. Confirm applicability and justify unavailable or inapplicable data using current product-specific guidance and the receiving agency/client template.',
  'Keep written and tabulated values consistent with their actual versioned study reports. Deterministic analyses, source review, scientific approval and technical package validation remain separate.',
];

export const NONCLINICAL_SUMMARY_SECTION_BLUEPRINT: SectionBlueprint = {
  id: 'ich_nonclin_summary_sections',
  name: 'Nonclinical Written and Tabulated Summaries — CTD 2.6',
  sections: ctdRecordSubtree('2.6').map(({ code, title, brief }) => {
    // A structural leaf (2.6.4.3 Absorption) is written to its written summary's brief (2.6.4).
    const owner = brief ?? CTD_AUTHORING_GUIDANCE[code.slice(0, code.lastIndexOf('.'))];
    return {
      code, title, module: 2, contentType: owner?.contentType ?? 'narrative',
      // The legacy CtdSection.required flag is initial-IND-specific. Do not
      // turn it into a universal legal determination for this global record.
      required: true,
      guidance: brief
        ? `${brief.authoringGuidance} ICH M4S defines summary organization, not which studies are required; confirm product and regional applicability.`
        : `The ICH M4S heading ${code} of ${owner ? `${owner.code} ${owner.title}; that brief states its content` : '2.6'}. ICH M4S defines summary organization, not which studies are required; confirm product and regional applicability.`,
    };
  }),
};
export { NONCLINICAL_SUMMARY_SECTION_BLUEPRINT as sectionBlueprint };
