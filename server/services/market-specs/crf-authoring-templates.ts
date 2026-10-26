/** Working authoring outlines, not a second CRF projection or collection engine. */
import type { DocumentTemplateStructure, TemplateSection } from './document-template-library';

const LIMITS = [
  'Blank CRF design and specification only. Completed patient CRFs, signed records and collected data remain original source records; never invent participant values or signatures.',
  'Internal working headings, not an official agency form, certified CDASH implementation, validated SDTM mapping or deployable EDC configuration. Confirm current sponsor, standards and regional requirements.',
  'The existing saved-study CRF projection supplies study-specific forms and items. Reconcile these working specifications with its source design, protocol, amendments and Schedule of Activities.',
];
const section = (number: string, heading: string, purpose: string): TemplateSection => ({ number, heading, purpose, required: number.endsWith('.scope') });
const template = (id: string, title: string, sections: TemplateSection[]): DocumentTemplateStructure => ({
  id, title, families: ['ectd', 'ctis', 'estar', 'eu_mdr', 'eu_ivdr'],
  regulatoryBasis: 'Platform working outline for blank CRF authoring; current protocol, sponsor data-management standards and applicable regional requirements govern.',
  outlineLimitations: LIMITS, sections,
});

export const CRF_AUTHORING_TEMPLATES: DocumentTemplateStructure[] = [
  template('blank_crf', 'Blank case report forms (CRFs) and design specification', [
    section('crf.scope', 'Study identification and form-set scope', 'Record study/protocol identifiers and version, product or device/assay, sponsor, intended use, languages, countries, form-set version and accountable authors. Distinguish blank design from completed subject records.'),
    section('crf.sources', 'Protocol and source traceability', 'Identify the current approved protocol and amendments, endpoints, estimands, SAP and source design versions. Link each planned field to a collection purpose; identify absent or conflicting requirements.'),
    section('crf.inventory', 'Form inventory and visit schedule', 'Define each form/page identifier, visit and unscheduled collection, timing/window, conditional applicability and repeat rules. Reconcile with every relevant Schedule of Activities assessment and endpoint. Use the saved-study CRF projection for its actual forms and items.'),
    section('crf.fields', 'Blank pages and field specifications', 'Draft each blank form and its instructions. Specify stable item identifiers, prompt, data type, response format/precision, units, codelist and coded/display values, requiredness, missing/not-done options, repeat groups and source traceability. Leave patient values blank. Unconfirmed options remain unresolved.'),
    section('crf.eligibility', 'Participant identification and eligibility', 'Specify pseudonymous participant/site identifiers, demographics, consent-verification and inclusion/exclusion collection where supported by the protocol. Distinguish verification from an executed consent or signature; minimize personal information.'),
    section('crf.intervention', 'Intervention, exposure and device use', 'Specify protocol-supported treatment, dose, route, timing, adherence, accountability and device/assay/version/operator-use fields as applicable. Separate planned instructions from observed administration and exposure.'),
    section('crf.efficacy', 'Efficacy, clinical and patient-reported assessments', 'Draft endpoint assessment pages with source instrument/version, timepoint, scoring source, units and collection instructions. Identify instrument licensing, validated-language and copyright needs; do not invent an instrument or scoring algorithm.'),
    section('crf.safety', 'Safety and concomitant therapy', 'Draft adverse event, serious event, death, withdrawal, exposure, concomitant medication and relevant history pages with protocol-supported timing, seriousness and assessment fields. Identify medical review and safety-system reconciliation; no invented cases or judgments.'),
    section('crf.specimens', 'Laboratory, diagnostics and specimen handling', 'Specify specimen identity, collection/processing/storage/transport times and conditions, chain of custody, assay/device version, result units/reference ranges, repeat testing and quality-control flags where applicable. Distinguish clinical results from research-only measurements and missing collection instructions.'),
    section('crf.disposition', 'Disposition and deviations', 'Specify visit completion, discontinuation, withdrawal, end-of-study and protocol deviation pages and reasons with dates and relevant follow-up. Preserve the distinction between proposed codes and actual study events.'),
    section('crf.logic', 'Edit checks, branching and derivations', 'Specify each edit check identifier, input fields, trigger, range/cross-field/time rule, severity, query message, skip/branch behavior and test cases. Identify source and review owner for derivations; do not calculate observed results or infer unprovided ranges.'),
    section('crf.instructions', 'Completion and query guidance', 'Draft site completion instructions for dates/partial dates, corrections, missing/not-applicable/not-done states, repeat pages, queries and source-document references. State escalation and reconciliation responsibilities using confirmed procedures.'),
    section('crf.review', 'Review, testing and version control', 'Record medical, data-management, statistical, privacy and regulatory review needs, unresolved items, change history, protocol impact, EDC build/UAT references and approval records. Drafting is separate from execution, testing, approval and EDC release.'),
  ]),
  template('crf_annotation_worksheet', 'CRF annotation and data mapping worksheet', [
    section('annotation.scope', 'Source form set and mapping scope', 'Identify exact blank CRF version, protocol and amendments, source page/item identifiers, intended dataset deliverable, standards/version and reviewer. This worksheet is not a completed patient CRF or validated annotated CRF.'),
    section('annotation.standards', 'Standards and controlled terminology', 'Record supplied CDASH/SDTM implementation guide and terminology versions, sponsor conventions, extensions and unresolved choices. A CDASH variable hint from the projection does not establish a valid SDTM mapping.'),
    section('annotation.fields', 'Item annotation mapping', 'For every source page/item, record proposed SDTM domain, variable, role, origin, units, codelist, value-level qualifiers and source traceability. Mark unknown mappings for review; never infer validated mapping from a similar label.'),
    section('annotation.repeats', 'Repeating and conditional collections', 'Document visit/timepoint, repeat-group keys, multiple-record behavior, conditional pages and not-collected fields. Reconcile source identifiers and expected record relationships without inventing collected observations.'),
    section('annotation.transforms', 'Transformations and derivations', 'Describe source-to-target mapping, coding and unit-conversion rules, derivation specifications, supplemental qualifiers and nonstandard decisions with justification and test references. Distinguish collected and derived data.'),
    section('annotation.layout', 'Annotated-page and reviewer references', 'Record exact blank page/version, annotation placement, explanation of not-submitted fields and links to the retained annotated source. This text worksheet does not certify graphical page annotations or reproduce signatures.'),
    section('annotation.review', 'Reconciliation, validation and approval', 'Reconcile every page/item against specifications, datasets and metadata, list gaps and validation findings, and identify accountable review and controlled versions. Preserve actual validation and signed approval records; drafting alone establishes neither.'),
  ]),
];
