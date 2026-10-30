/** Reach existing medicinal source records as blank working documents, never original regulated records. */
import { getPLRAuthoringSections, type PLRSectionDescriptor } from '../labeling/labeling-intelligence-knowledge';
import { PLR_FORMAT_RULES } from '../ind/ctd/fda-technical-rules';
import { NONCLINICAL_STUDY_REPORT_STRUCTURE } from '../authoring/nonclinical-study-report-structure';
import { flattenModule1, REGIONAL_MODULE1 } from '../../../shared/regulatory/regional-module1';
import { basisLabel } from '../../../shared/regulatory/regulatory-basis';
import { ctdComponentTemplate } from './ctd-component-outlines';
import type { CatalogTemplateEntry } from '../regulatory/templateCatalog';
import type { DocumentTemplateStructure, TemplateSection } from './document-template-library';

const SOURCE_ONLY = 'Prepare source-supported working narrative only. Preserve the exact original/version and state missing or unconfirmed facts; no approval, no finding and no absence of risk can be inferred from a blank outline.';
const ORIGINAL = 'Manual/source preparation. Retain the actual original, validated output or generated record; this working copy cannot produce signatures, GLP findings, approved labeling or technical SPL.';
const pi = getPLRAuthoringSections();
const contents = PLR_FORMAT_RULES.find(rule => rule.id === 'plr-contents');
if (!contents) throw new Error('The existing PLR contents source is unavailable.');
const piSection = (section: PLRSectionDescriptor): TemplateSection => ({
  number: section.sectionNumber, heading: section.sectionTitle,
  purpose: [section.contentGuidance,
    ...(section.subsections?.length ? [`Source subsection instructions, not a product-specific requirement decision: ${section.subsections.join('; ')}`] : []),
    section.sectionNumber === 'H.1' ? `Boxed-warning applicability is unconfirmed. ${ORIGINAL}` : SOURCE_ONLY].join('\n\n'),
  required: section.sectionNumber === 'H.1' ? false : section.required === true,
  drafting_mode: section.sectionNumber === 'H.1' ? 'manual' : 'narrative',
});

const USPI: DocumentTemplateStructure = {
  id: 'us_prescribing_information', title: 'US prescribing information working document', families: ['ectd'],
  regulatoryBasis: 'Existing PLR source descriptors and format records; 21 CFR 201.56–201.57. Confirm current FDA requirements and actual product applicability.',
  outlineSource: { kind: 'source-component', record: 'labeling/labeling-intelligence-knowledge.ts:HIGHLIGHTS_SECTIONS+FPI_SECTIONS+BOXED_WARNING_FORMAT' },
  outlineLimitations: [
    'US/FDA working-label structure, not an EU SmPC, current FDA-approved label, complete product-specific labeling assessment or technical SPL validation.',
    'Product/application type, approved versus proposed baseline, approved indications, dose, labeling status and boxed-warning applicability remain unconfirmed until supported by actual sources and accountable review.',
    'The PI store is organization-wide; this template does not establish project/product binding, read or update that store, or import an existing approved label or SPL.',
    'Source subsection examples remain guidance; they do not determine every applicable subsection. Confirm current client/FDA layout, fonts, placement, complete headings and product-specific labeling before filing.',
  ],
  sections: [
    { number: 'source_records', heading: 'Source records and labeling applicability', purpose: `Identify the actual approved/proposed baseline and original labeling/SPL records. ${ORIGINAL}`, required: false, drafting_mode: 'manual' },
    ...pi.highlightsStructure.map(piSection),
    { number: 'contents', heading: 'Full Prescribing Information: Contents', purpose: `${contents.rule} ${ORIGINAL}`, required: true, drafting_mode: 'manual' },
    { number: 'BW', heading: 'Full prescribing information boxed warning (applicability unconfirmed)',
      purpose: `${pi.boxedWarningFormat.placement.join('; ')} ${pi.boxedWarningFormat.headerText} Boxed-warning applicability is unconfirmed; do not select, create or imply one without the actual source and regulatory review. ${ORIGINAL}`,
      required: false, drafting_mode: 'manual' },
    ...pi.fullPIStructure.map(piSection),
  ],
};

const NONCLINICAL: DocumentTemplateStructure = {
  id: 'nonclinical_study_report', title: 'Nonclinical study report working document', families: ['ectd'],
  regulatoryBasis: 'Existing nonclinical working-report structure; ICH M4S and study-specific requirements require source and applicability review.',
  outlineSource: { kind: 'source-component', record: 'authoring/nonclinical-study-report-structure.ts:NONCLINICAL_STUDY_REPORT_STRUCTURE' },
  outlineLimitations: [
    'Working report from supplied study sources, not a signed original study report, verified GLP statement, raw dataset or certification.',
    'This start does not create a retained study/build job or normalized-source materializer. Current study identity, source versions and exact Module4 placement require explicit verification.',
    'Do not invent findings, dose groups, NOAEL/LOAEL, analytical outputs or GLP compliance; source gaps remain explicit. Human scientific review and original reports remain necessary.',
  ],
  sections: NONCLINICAL_STUDY_REPORT_STRUCTURE.map(section => ({
    number: section.number, heading: section.title, required: section.required,
    drafting_mode: ['1', '7'].includes(section.number) ? 'manual' : 'narrative',
    purpose: `${section.description}\n\n${['1', '7'].includes(section.number) ? ORIGINAL : SOURCE_ONLY}`,
  })),
};

export const MEDICINAL_WORKING_TEMPLATES: DocumentTemplateStructure[] = [USPI, NONCLINICAL];
export const MEDICINAL_WORKING_METADATA: CatalogTemplateEntry[] = MEDICINAL_WORKING_TEMPLATES.map(outline => ({
  id: outline.id, title: outline.title, description: 'Working narrative from verified sources; original records and technical outputs retain source preparation.',
  format: 'mixed', aiDraftable: true, category: outline.id === 'us_prescribing_information' ? 'labeling' : 'nonclinical',
}));
export const isUsMedicinalWorkingComponent = (id: string): boolean => id === USPI.id;

/** Only these existing registry identities have a canonical module record here. */
export const isCanonicalCtdModuleTemplate = (id: string): boolean => id === 'US_CTD_M1_REGIONAL' || /^ICH_CTD_M[2-5]$/.test(id);

export function canonicalCtdRegistryOutline(registryId: string): DocumentTemplateStructure | undefined {
  if (!isCanonicalCtdModuleTemplate(registryId)) return undefined;
  if (registryId !== 'US_CTD_M1_REGIONAL') {
    const root = registryId.slice(-1);
    return ctdComponentTemplate({ id: registryId, registryId, root, title: `CTD Module ${root} working workspace`,
      guideline: 'ICH M4 canonical Module 2–5 record', limitations: [
        'Whole-module preparation workspace, not a single narrative draft. Use the individual source-supported document starts for narrative work and retain original records.',
        'This does not widen CMC composition, validate datasets or construct a technically valid eCTD package.',
      ] });
  }
  const source = REGIONAL_MODULE1.US;
  return {
    id: registryId, title: 'CTD Module 1 — US regional working workspace', families: ['ectd'], ctdSection: '1',
    basis: source.spec, regulatoryBasis: basisLabel(source.spec),
    outlineSource: { kind: 'document-outline', registryId, record: 'shared/regulatory/regional-module1.ts:REGIONAL_MODULE1.US' },
    outlineLimitations: [
      'FDA regional headings from the existing canonical Module1 record, not a harmonized GLOBAL Module1 or a copy of the IND namespace.',
      'No application kind or conditional applicability is inferred. Every heading remains visible; unmarked required flags do not waive applicable forms or documents.',
      'Whole-module manual/source preparation. Retain original FDA forms, certificates, signatures, labeling and other source records; this workspace is not a package schema or filing-readiness verdict.',
    ],
    sections: flattenModule1('US').map(heading => ({ number: heading.number, heading: heading.title, required: false, drafting_mode: 'manual',
      purpose: `${heading.description}\n\nRecorded applicability: ${JSON.stringify(heading.applies)}. Confirm the actual application and facts before determining requirements.\n\n${heading.basis.map(basisLabel).join('; ')}\n\n${ORIGINAL}` })),
  };
}
