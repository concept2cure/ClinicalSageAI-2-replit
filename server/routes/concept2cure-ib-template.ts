/**
 * The legacy /api/concept2cure/templates IND Investigator's Brochure, rendered
 * from the platform's one IB outline (market-specs document-template-library
 * 'investigators_brochure', basis ICH E6(R3) Appendix A) — D2, 2026-10-15.
 *
 * It was a hand-written copy that headed section 6 "Guidance for
 * Investigators", dropped "and Formulation", added a "References" chapter E6
 * does not define, and filed the IB at CTD 5.3; a US IND files it at
 * Module 1 1.14.4.1 (the registry's ICH_IB placement).
 */
import { getDocumentTemplate } from '../services/market-specs/document-template-library.js';

export function legacyIbTemplate() {
  const outline = getDocumentTemplate('investigators_brochure');
  if (!outline) throw new Error("The Investigator's Brochure outline is unavailable.");
  const body = outline.sections.map((s) => `## ${s.number}. ${s.heading}\n${s.purpose}`).join('\n\n');
  return {
    id: 'tpl_ind_investigator_brochure',
    name: "Investigator's Brochure (IB)",
    description: `IND investigator's brochure structure — ${outline.regulatoryBasis}`,
    submissionTypes: ['IND'],
    category: 'document',
    ctdSection: '1.14.4.1',
    content: `# Investigator's Brochure\n\n${body}`,
  };
}
