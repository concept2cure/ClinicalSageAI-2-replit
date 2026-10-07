/** Only CTD 2.6: project the existing canonical nonclinical authoring records.
 * ICH M4S governs format; it does not determine which studies are required.
 */
import type { SectionBlueprint } from '../../../../../shared/regulatory/document-taxonomy.js';
import type { RegulatoryBasis } from '../../../../../shared/regulatory/regulatory-basis.js';
import { compareSectionCode } from '../../../../../shared/regulatory/section-code.js';
import { CTD_AUTHORING_GUIDANCE } from '../../../ind/ctd/authoring-guidance.js';

export const outlineBasis: RegulatoryBasis = {
  ref: 'ICH M4S / FDA M4S: The CTD — Safety, §§2.6.1–2.6.7',
  url: 'https://www.fda.gov/media/71628/download',
  confidence: 'regulator-text', checked: '2026-10-07',
  note: 'Heading codes, organization and written/tabulated summary distinction verified against the current FDA-hosted guidance; purpose notes are the existing canonical platform authoring guidance.',
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
  sections: Object.values(CTD_AUTHORING_GUIDANCE)
    .filter(s => s.code === '2.6' || s.code.startsWith('2.6.'))
    .sort((a, b) => compareSectionCode(a.code, b.code))
    .map(s => ({
      code: s.code, title: s.title, module: s.module, contentType: s.contentType,
      // The legacy CtdSection.required flag is initial-IND-specific. Do not
      // turn it into a universal legal determination for this global record.
      required: true,
      guidance: `${s.authoringGuidance} ICH M4S defines summary organization, not which studies are required; confirm product and regional applicability.`,
    })),
};
export { NONCLINICAL_SUMMARY_SECTION_BLUEPRINT as sectionBlueprint };
