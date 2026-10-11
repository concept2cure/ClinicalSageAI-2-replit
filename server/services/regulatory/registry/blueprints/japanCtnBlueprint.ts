/**
 * Japan CTN Blueprint — Clinical Trial Notification (治験届, PMDA)
 *
 * Company-sponsored drug notification fields and conditional attachments,
 * based on the current MHLW handling notice as amended 20 August 2024.
 * Notification category, product and study determine timing and attachments.
 * This authoring organization is not the formal XML/PDF notification schema.
 *
 * @module server/services/regulatory/registry/blueprints/japanCtnBlueprint
 */

import type { SectionBlueprint, TaskBlueprint, MilestoneDefinition } from '../../../../../shared/regulatory/document-taxonomy.js';
import type { RegulatoryBasis } from '../../../../../shared/regulatory/regulatory-basis.js';

const CTN_NOTICE = 'https://www.pmda.go.jp/files/000270151.pdf';
export const outlineBasis: RegulatoryBasis = {
  ref: 'Platform authoring groups based on MHLW drug CTN handling notice 0831-10, amended by 0820-1 (20 August 2024)',
  url: CTN_NOTICE, confidence: 'platform-convention', checked: '2026-10-07',
  note: 'The English headings group notification fields and applicable attachments; they are not prescribed agency form headings.',
};
export const outlineLimitations = [
  'Required flags are platform scaffold expectations, not a determination that every field or attachment is legally required for every notification.',
  'This scaffold follows company-sponsored drug notification handling; confirm a different sponsor pathway, product modality or lifecycle category against its current notice.',
  'The module field is a compatibility grouping, not a Japan CTD Module 1 designation. CTN is not a full marketing CTD.',
  'Timing depends on the notification category and whether the 30-day review applies; verify the applicable clock and planned site contract, rather than assigning every trial a 30-day start rule.',
  'Confirm document-level language acceptance and Japanese/foreign evidence needs with the client and PMDA; neither additional Japanese studies nor a language exemption is automatic.',
  'Generate and validate the current official XML/PDF notification through its technical workflow; an authored outline does not generate that schema, submit it or establish readiness.',
];

export const JP_CTN_SECTION_BLUEPRINT: SectionBlueprint = {
  id: 'jp_ctn_sections',
  name: 'Japan Drug Clinical Trial Notification — Fields and Applicable Attachments',
  sections: [
    { code: 'ctn.notification', title: 'Notification Classification and References', module: 1, required: true, contentType: 'form', guidance: 'Prepare the selected notification category, date, identifiers and prior notification references using the current notice and form. Distinguish trial plan (including initial and subsequent notifications), change, trial discontinuation, completion and development discontinuation. MHLW notice §1 and Attachment 1.' },
    { code: 'ctn.parties', title: 'Notifier, Sponsor and Responsible Parties', module: 1, required: true, contentType: 'form', guidance: 'Prepare applicable notifier, foreign-sponsor, responsible contact, coordination and outsourcing information from verified records; confirm the domestic representative arrangements for the actual sponsor pathway. Attachment 1.' },
    { code: 'ctn.products', title: 'Study Products and Regulatory Attributes', module: 1, required: true, contentType: 'mixed', guidance: 'Identify main and other study products and applicable formulation, manufacture, indication and dosage information. Confirm relevant biologic, Cartagena, combination-product and companion-diagnostic fields rather than assuming applicability. Attachment 1.' },
    { code: 'ctn.trial', title: 'Trial Plan and Protocol Identification', module: 1, required: true, contentType: 'mixed', guidance: 'Reconcile the trial purpose, phase, design, participants, treatment, planned duration and current protocol identification with the notification fields and source versions. Attachment 1.' },
    { code: 'ctn.sites', title: 'Sites, Investigators and Review Committees', module: 1, required: true, contentType: 'list', guidance: 'Prepare applicable site, investigator and review-committee information from current records; distinguish planned arrangements from completed review. Attachment 1.' },
    { code: 'ctn.accountability', title: 'Study-Product Quantities and Subject Counts', module: 1, required: true, contentType: 'table', guidance: 'Use planned quantities and participant counts for the applicable plan; use actual participant and supplied, used, returned or disposed product information for completion or discontinuation, as specified for that category. Attachment 1 §5.' },
    { code: 'ctn.supporting', title: 'Supporting Clinical and Scientific Attachments', module: 1, required: false, contentType: 'mixed', guidance: 'Select attachments by notification type and applicability: scientific justification, protocol, participant explanation/consent, sample CRF where needed, current IB or permitted substitute, and relevant other study-drug information. A CRF may be unnecessary when its items are sufficiently clear from the protocol. Notice §1(7).' },
    { code: 'ctn.quality', title: 'Applicable Quality and Modality-Specific Supporting Material', module: 1, required: false, contentType: 'mixed', guidance: 'Include applicable impurity and biotechnology quality information. The PMDA 3 July 2026 Early Consideration checklist specifically addresses human/animal cell-line biotechnology test drugs subject to 30-day review; it is reference guidance, not a universal attachment mandate. https://www.pmda.go.jp/files/000281590.pdf' },
    { code: 'ctn.change', title: 'Change, Discontinuation or Completion Details', module: 1, required: false, contentType: 'mixed', guidance: 'For the selected lifecycle category, identify changed items, dates, reasons, affected versions and applicable attachments, or reconcile completion/discontinuation and accountability information. Do not invent a separate suspension category for a temporary pause. Notice §1(6)–(7) and Attachment 1.' },
    { code: 'ctn.submission', title: 'Notification Files, Attachment Index and Receipt Records', module: 1, required: true, contentType: 'list', guidance: 'Record current official form and XML schema versions, the notification PDF/XML and applicable attachments, prior references and the receipt when issued. Follow the accepted electronic or media delivery instructions; an outline is not a validated notification file. Notice §1(4)–(5).' },
  ],
};
export { JP_CTN_SECTION_BLUEPRINT as sectionBlueprint };

const CTN_MILESTONES: MilestoneDefinition[] = [
  {
    id: 'ms_consultation', title: 'PMDA Consultation and Local Evidence Strategy', description: 'Confirm the notification category, applicable timing and Japanese/foreign evidence needs', phase: 'pre_submission', order: 0,
    tasks: [
      { id: 't_pmda_consult', title: 'PMDA Consultation (対面助言)', description: 'Request PMDA face-to-face consultation on the development plan', assigneeRole: 'regulatory_lead', estimatedDays: 30 },
      { id: 't_bridging', title: 'Japanese and Foreign Evidence Assessment', description: 'Assess ethnic factors and available safety evidence with PMDA advice; for overseas-led multinational development, additional Japanese phase I studies are not automatic (MHLW 1225-2, 25 December 2023)', assigneeRole: 'clinical_lead', estimatedDays: 10 },
    ],
  },
  {
    id: 'ms_protocol', title: 'Applicable Protocol, IB and Supporting Records', description: 'Select attachments and confirm current Japanese GCP and document-level language requirements', phase: 'authoring', order: 1,
    tasks: [
      { id: 't_protocol', title: 'Clinical Protocol (治験実施計画書)', description: 'Prepare the applicable current protocol and confirm its accepted language and Japanese GCP requirements', assigneeRole: 'clinical_lead', estimatedDays: 20 },
      { id: 't_ib', title: 'Investigator Brochure (治験薬概要書)', description: 'Prepare the current IB or permitted substitute where applicable; confirm document-level language acceptance', assigneeRole: 'clinical_lead', estimatedDays: 15 },
      { id: 't_quality', title: 'Applicable Quality (CMC) Information', description: 'Prepare product-specific quality information supporting the notification, including scoped biotechnology records where applicable', assigneeRole: 'cmc_lead', estimatedDays: 20 },
    ],
  },
  {
    id: 'ms_ctn', title: 'CTN Preparation', description: 'Assemble the Clinical Trial Notification (治験届)', phase: 'authoring', order: 2,
    tasks: [
      { id: 't_ctn_form', title: 'Clinical Trial Notification Form (治験届書)', description: 'Complete the PMDA CTN form', assigneeRole: 'regulatory_lead', estimatedDays: 5 },
      { id: 't_caretaker', title: 'Domestic Representative Arrangements (国内管理人)', description: 'Confirm applicable foreign-sponsor and domestic representative information for the selected notification pathway', assigneeRole: 'regulatory_lead', estimatedDays: 3 },
      { id: 't_irb', title: 'IRB Review', description: 'Arrange Institutional Review Board review covering each participating site', assigneeRole: 'clinical_lead', estimatedDays: 15 },
    ],
  },
  {
    id: 'ms_submit', title: 'Notification Submission', description: 'Apply category-dependent notification timing and verify receipt; task durations are planning estimates, not agency clocks', phase: 'finalization', order: 3,
    tasks: [
      { id: 't_submit', title: 'PMDA Submission', description: 'Submit the Clinical Trial Notification to PMDA', assigneeRole: 'regulatory_lead', estimatedDays: 2 },
    ],
  },
];

export const taskBlueprint: TaskBlueprint = {
  id: 'jp_ctn_tasks',
  name: 'Japan CTN Task Blueprint',
  milestones: CTN_MILESTONES,
};
