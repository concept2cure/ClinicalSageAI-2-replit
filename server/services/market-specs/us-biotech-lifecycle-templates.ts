/** Exact working-document starts derived from the existing FDA lifecycle records. */
import { LIFECYCLE_DOCUMENT_TYPES } from '../ind/ctd/lifecycle-document-types';
import type { LifecycleComponent } from '../ind/ctd/types';
import { basisLabel, type RegulatoryBasis } from '../../../shared/regulatory/regulatory-basis';
import type { CatalogTemplateEntry } from '../regulatory/templateCatalog';
import type { DocumentTemplateStructure } from './document-template-library';

const RECORD_IDS = [
  'pre_ind_meeting', 'end_of_phase_2_meeting', 'pre_nda_meeting', 'pre_bla_meeting',
  'ind_protocol_amendment', 'ind_information_amendment', 'ind_cmc_amendment',
  'ind_response_to_clinical_hold', 'cbe_30', 'cbe_0', 'iss', 'ise',
] as const;
const PREFIX = 'us_lifecycle_';
const IDS = new Set<string>(RECORD_IDS.map(id => PREFIX + id));
const ORIGINAL_TYPES = new Set<LifecycleComponent['contentType']>(['form', 'data', 'table']);
// These mixed source parts attach controlled originals rather than narrating findings.
const ORIGINAL_MIXED: Readonly<Record<string, readonly string[]>> = {
  ind_information_amendment: ['TECHNICAL-DATA'],
  ind_response_to_clinical_hold: ['REVISED-DOCUMENTS'],
  cbe_30: ['CBE30-LABELING'],
  cbe_0: ['CBE0-LABELING'],
};
const ORIGINAL_LIMIT = 'Retain the original form, validated dataset, table, listing, signed record or approved source document. Prepare this part manually from those records; AnA does not generate or replace the original.';
const NARRATIVE_LIMIT = 'Prepare source-supported working narrative only. Cite the actual source/version and identify missing evidence. Do not compute or reconstruct statistical outputs, invent results or FDA decisions, replace original records, or claim approval or filing readiness.';

function manualPart(recordId: string, component: LifecycleComponent): boolean {
  return ORIGINAL_TYPES.has(component.contentType) || Boolean(ORIGINAL_MIXED[recordId]?.includes(component.code));
}

function projectRecord(recordId: typeof RECORD_IDS[number]): DocumentTemplateStructure {
  const source = LIFECYCLE_DOCUMENT_TYPES.find(record => record.id === recordId);
  if (!source || source.agency !== 'FDA' || !source.components.length) {
    throw new Error(`The exact FDA lifecycle record ${recordId} is unavailable.`);
  }
  const basis: RegulatoryBasis = { ref: source.regulatoryBasis.join('; '), confidence: 'recall',
    note: 'Existing advisory FDA lifecycle record. Current regulator text and application-specific applicability were not independently re-read for this projection.' };
  return {
    id: PREFIX + source.id, title: source.label, families: ['ectd'], basis, regulatoryBasis: basisLabel(basis),
    outlineSource: { kind: 'lifecycle-component', record: `LIFECYCLE_DOCUMENT_TYPES:${source.id}` },
    outlineLimitations: [
      'US/FDA type-specific working parts from the existing lifecycle record; not a new filing registry identity, current agency form, complete CTD dossier or legal applicability decision.',
      'Confirm the actual product, application, document subtype, current instructions and source versions. Do not infer an applicable FDA pathway or reporting mechanism from this template.',
      'AnA can narrate verified source findings and plans; validated analysis outputs, original forms, datasets, tables, listings, approvals and signatures require their existing controlled sources and review.',
      ...(source.category === 'meeting' ? ['These are the existing PDUFA-product meeting parts. Confirm the FDA center, program and meeting subtype; do not infer that PDUFA procedures or timelines govern a BsUFA or other meeting.'] : []),
      ...(source.category === 'supplement' ? ['These CBE parts read the existing NDA/ANDA record under 21 CFR 314.70. Licensed-biologic changes require the applicable 21 CFR 601.12 classification and biologics-specific source records; this projection does not independently model those obligations.'] : []),
      `Source description: ${source.description}`,
      ...(source.ctdSectionCodes?.length ? [`The source record also references CTD content: ${source.ctdSectionCodes.join(', ')}. These type-specific working parts do not replace those controlled sections.`] : []),
    ],
    sections: source.components.map(component => ({
      number: component.code, heading: component.title, required: component.required,
      drafting_mode: manualPart(source.id, component) ? 'manual' : 'narrative',
      purpose: [component.authoringGuidance, `Source guidance: ${component.guidance}`,
        ...(component.keyContentElements.length ? [`Source content elements:\n${component.keyContentElements.map(item => `- ${item}`).join('\n')}`] : []),
        manualPart(source.id, component) ? ORIGINAL_LIMIT : NARRATIVE_LIMIT].join('\n\n'),
      ...(component.formerTitles?.length ? { formerTitles: [...component.formerTitles] } : {}),
    })),
  };
}

/** No whole filing, annual report, DSUR or PAS copy is introduced beside its current owner. */
export const US_BIOTECH_LIFECYCLE_TEMPLATES: DocumentTemplateStructure[] = RECORD_IDS.map(projectRecord);

export const US_BIOTECH_LIFECYCLE_METADATA: CatalogTemplateEntry[] = US_BIOTECH_LIFECYCLE_TEMPLATES.map(outline => ({
  id: outline.id, title: outline.title,
  description: 'Source-supported US biotech working document; original forms, tables and attached records retain manual source preparation.',
  format: 'mixed', aiDraftable: outline.sections.some(section => section.drafting_mode === 'narrative'),
  category: outline.id === 'us_lifecycle_iss' || outline.id === 'us_lifecycle_ise' ? 'clinical' : 'administrative',
}));

/** Exact membership is the authority; a similar-looking arbitrary ID acquires no US scope. */
export function isUsBiotechLifecycleComponent(id: string): boolean {
  return IDS.has(id);
}
