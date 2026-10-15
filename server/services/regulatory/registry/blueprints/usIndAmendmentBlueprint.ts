/** US IND amendment authoring scaffold. Reuses existing lifecycle components;
 * clinical, investigator, information and CMC branches apply by subtype.
 * No full CTD is mandated for an amendment by this platform outline.
 */
import type { SectionBlueprint, SectionDefinition } from '../../../../../shared/regulatory/document-taxonomy.js';
import type { RegulatoryBasis } from '../../../../../shared/regulatory/regulatory-basis.js';
import { LIFECYCLE_DOCUMENT_TYPES } from '../../../ind/ctd/lifecycle-document-types.js';

export const outlineBasis: RegulatoryBasis = {
  ref: 'Existing IND lifecycle components, scoped against 21 CFR 312.30 and 312.31',
  url: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D/part-312/subpart-B',
  confidence: 'platform-convention', checked: '2026-10-07',
  note: 'The grouping and scaffold flags are platform conventions; the cited rules determine subtype-specific content.',
};
export const outlineLimitations = [
  'Confirm whether this is a new protocol, protocol change, new investigator, or information amendment before selecting evidence branches.',
  'Required flags are platform scaffold expectations, not a conclusion that every branch or CTD section applies to every amendment.',
  'The module field groups authoring components for compatibility; substantive data must be placed in the affected current regional CTD location, not inferred from this grouping.',
  'Protocol amendments, information amendments, IND safety reports and annual reports are distinct pathways; this record does not replace safety reporting or a response-to-hold review.',
  'Verify category-specific implementation and notification timing, IRB requirements, immediate-hazard exceptions and current delivery specifications separately; an outline is not an approval or filing-readiness decision.',
];

function lifecycleSection(code: string, lifecycleId: string, componentCode: string, required: boolean, guidance: string): SectionDefinition {
  const record = LIFECYCLE_DOCUMENT_TYPES.find(d => d.id === lifecycleId);
  const component = record?.components.find(c => c.code === componentCode);
  if (!component) throw new Error(`Missing canonical amendment component ${lifecycleId}:${componentCode}`);
  return { code, title: component.title, contentType: component.contentType, module: 1, required, guidance };
}

export const US_IND_AMENDMENT_SECTION_BLUEPRINT: SectionBlueprint = {
  id: 'us_ind_amendment_sections',
  name: 'US IND Amendment — Subtype-Specific Components',
  sections: [
    lifecycleSection('amendment.cover_letter', 'ind_information_amendment', 'COVER-LETTER', true,
      'Identify the IND, submission and selected subtype prominently. A protocol amendment falls under 21 CFR 312.30; an information amendment under 312.31 states its nature and purpose. Keep prior source versions and submission references traceable.'),
    lifecycleSection('amendment.form_1571', 'ind_information_amendment', 'FORM-FDA-1571', true,
      'Prepare the existing lifecycle administrative cover-form component using current FDA instructions and actual sponsor, IND and serial identifiers. This platform flag does not determine every form needed for a particular amendment.'),
    lifecycleSection('amendment.protocol', 'ind_protocol_amendment', 'PROTOCOL-OR-CHANGE', false,
      'For a new protocol, supply the protocol and clinically significant differences from previous protocols. For a protocol change, describe the change and identify the prior submission by date and number. Apply 21 CFR 312.30(a), (b), (d)(1)(i)–(ii); this branch is not a requirement for a new-investigator-only or information amendment.'),
    { code: 'amendment.new_investigator', title: 'New Investigator Information', module: 1, required: false, contentType: 'mixed', guidance: 'For the new-investigator subtype only, provide identity, qualifications, the previously submitted protocol reference and applicable additional study information under 21 CFR 312.30(c), (d)(1)(iii) and 312.23(a)(6)(iii)(b). Do not replace this with an automatically required new protocol or CMC package.' },
    lifecycleSection('amendment.protocol_support', 'ind_protocol_amendment', 'SUPPORTING-INFO', false,
      'When necessary to support a clinically significant new or changed protocol, reference specific technical information already in the IND or in a concurrent information amendment, with precise locations. 21 CFR 312.30(d)(2). Select clinical, nonclinical or quality evidence by the actual change.'),
    lifecycleSection('amendment.information', 'ind_information_amendment', 'INFO-SUMMARY', false,
      'For an information amendment, state the nature and purpose of essential new IND information outside protocol amendments, safety reports and annual reports. Include applicable technical information or a study-discontinuation report; do not assume every scientific domain applies. 21 CFR 312.31(a)–(b).'),
    lifecycleSection('amendment.technical_data', 'ind_information_amendment', 'TECHNICAL-DATA', false,
      'For the selected information-amendment topic, organize the actual relevant data for scientific review under 21 CFR 312.31(b)(2). Reuse and cross-reference affected canonical CTD content where applicable; a complete new clinical, nonclinical and CMC dossier is not automatically required.'),
    lifecycleSection('amendment.cmc_summary', 'ind_cmc_amendment', 'CMC-CHANGE-SUMMARY', false,
      'For a CMC information amendment, describe the affected manufacturing or control change and its quality/safety significance using source-linked evidence. This is the existing lifecycle CMC authoring component, not an additional universal amendment requirement.'),
    lifecycleSection('amendment.cmc_update', 'ind_cmc_amendment', 'MODULE3-UPDATE', false,
      'For a CMC amendment only, revise affected quality sections and supporting records in their proper current CTD locations. Select drug-substance, drug-product and comparability/stability information according to the actual change; preserve unchanged records by reference.'),
    { code: 'amendment.fda_questions', title: 'Requested FDA Comments and Specific Questions', module: 1, required: false, contentType: 'list', guidance: 'If FDA comment is desired, include the request and, for protocol amendments, specific questions to be addressed. 21 CFR 312.30(d)(3) and 312.31(b)(3). A request does not imply FDA approval or a response commitment.' },
  ],
};
export { US_IND_AMENDMENT_SECTION_BLUEPRINT as sectionBlueprint };
