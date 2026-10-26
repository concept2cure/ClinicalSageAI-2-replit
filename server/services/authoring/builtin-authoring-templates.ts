/** Existing source outlines projected into the one editor's template contract. */
import { createHash } from 'node:crypto';
import type { RecordedTemplateFilingContext } from '../../../shared/authoring/recorded-template-source';
import type { IndAuthoringTemplateRef } from '../../../shared/authoring/ind-document-catalog';
import { GLOBAL_REGISTRY, isDeviceRegistryEntry, isSharedPlanningRegistryEntry } from '../../../shared/regulatory/global-document-registry';
import type { RegulatoryApplicationType } from '../../../shared/regulatory/document-taxonomy';
import {
  DOCUMENT_TEMPLATES, componentTemplateIdForRegistry, getDocumentTemplate, getRegistryDocumentTemplate,
  type DocumentTemplateStructure,
} from '../market-specs/document-template-library';
import { documentComponentContext, documentComponentRegion } from '../market-specs/document-preparation';
import { searchTemplates, type CatalogTemplateEntry } from '../regulatory/templateCatalog';
import {
  getIndAuthoringTemplate, getIndAuthoringTemplates, indTemplateReference, indTemplateSnapshot,
} from './ind-authoring-templates';
import type { IndAuthoringTemplate, IndTemplateOutlineSection } from './ind-template-types';

export interface BuiltinAuthoringTemplate extends IndAuthoringTemplate {
  filingContext?: RecordedTemplateFilingContext;
  families?: DocumentTemplateStructure['families'];
}
export interface BuiltinAuthoringTemplateRef extends IndAuthoringTemplateRef {
  entryId?: string;
  filingContext?: RecordedTemplateFilingContext;
  families?: DocumentTemplateStructure['families'];
}

// UUIDv5 namespace e23d2019-7236-58b6-b956-efa884f6210b; distinct from IND v1.
// Input is biotech-authoring:v1:<exact registry:ID or component:ID source key>.
const NAMESPACE = 'e23d2019723658b6b956efa884f6210b';
const REGIONS = ['US', 'CA', 'EU', 'JP', 'GLOBAL'] as const;
const LIMITATIONS = [
  'Working scaffold, not an approval, verified evidence or a filing-readiness decision.',
  'Confirm the product, application, procedure, stage, region, language and current agency/client requirements before using this outline.',
  'Retain original forms, datasets, certificates, executed consents, signed records, technical messages and restricted master-file parts; this worksheet does not replace them.',
  'Drafting and review do not qualify CMC composition, safety-message creation, package validation, approval or transmission.',
];

/** Stable versioned source identity; no database row or duplicate heading registry. */
export function builtinAuthoringTemplateId(entryId: string): string {
  const bytes = createHash('sha1').update(Buffer.from(NAMESPACE, 'hex')).update(`biotech-authoring:v1:${entryId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Search without a filing filter reads metadata only, never its unknown-ID CTD fallback. */
function exactComponentMetadata(componentId: string | undefined): CatalogTemplateEntry | undefined {
  return componentId ? searchTemplates('').find(metadata => getDocumentTemplate(metadata.id)?.id === componentId) : undefined;
}

function singleModule(outline: DocumentTemplateStructure): IndAuthoringTemplate['module'] {
  const match = /^([1-5])(?:\.|$)/.exec(outline.ctdSection ?? '');
  return match ? `M${match[1]}` as IndAuthoringTemplate['module'] : null;
}

function sourceReference(outline: DocumentTemplateStructure): string {
  const source = outline.outlineSource;
  if (!source) return `server/services/market-specs/document-template-library.ts:${outline.id}`;
  return 'blueprintId' in source
    ? `${source.kind}:${source.registryId}:${source.blueprintId}`
    : `${source.kind}:${source.registryId}:${source.record}`;
}

/**
 * Every section a template carries: front matter, then each section followed
 * by its subsections, in outline order. The picker's document holds the same
 * nodes as the governed pack minted from the same outline (review finding,
 * 2026-10-18: a PBRER's title page and 16.2, a PAS's 3.2.P, were in the pack
 * and not in the picker's document).
 */
function outlineSections(outline: DocumentTemplateStructure): IndTemplateOutlineSection[] {
  const flat: DocumentTemplateStructure['sections'] = [];
  const walk = (list: DocumentTemplateStructure['sections']) => { for (const s of list) { flat.push(s); if (s.subsections?.length) walk(s.subsections); } };
  walk([...(outline.frontMatter ?? []), ...outline.sections]);
  return flat.map((section, ordering) => ({
    code: section.number, title: section.heading, content: '', ordering,
    guidance: {
      ...(section.drafting_mode ? { drafting_mode: section.drafting_mode } : {}),
      guidance_text: `${section.purpose}\n\nExisting scaffold expectation: ${section.required ? 'marked required' : 'not marked required'}. This flag does not determine legal applicability or waive applicable content.`,
      regulatory_references: [outline.regulatoryBasis],
      compliance_checklist: [], common_pitfalls: [], source_reference: sourceReference(outline),
    },
  }));
}

function projectOutline(input: {
  entryId: string; outline: DocumentTemplateStructure; filingContext: RecordedTemplateFilingContext;
  metadata?: CatalogTemplateEntry; originalFormat: string; limitations: string[]; description?: string;
}): BuiltinAuthoringTemplate {
  const { entryId, outline, filingContext, metadata, originalFormat } = input;
  const aiDraftable = metadata?.aiDraftable === true;
  const title = `${filingContext.region} · ${outline.title}`;
  return {
    id: builtinAuthoringTemplateId(entryId), entryId,
    name: aiDraftable ? title : `${title} — preparation worksheet`,
    module: singleModule(outline), kind: aiDraftable ? 'narrative' : 'preparation', aiDraftable,
    authoringMode: aiDraftable ? 'ai_draft' : 'manual', originalFormat,
    description: input.description ?? `${outline.title}. ${filingContext.region} ${filingContext.agency} working outline.`,
    limitations: [...LIMITATIONS, ...(outline.outlineLimitations ?? []), ...input.limitations,
      ...(!outline.basis ? ['This existing outline supplies advisory citations; regulator-text verification and current currency are not recorded for this projection.'] : [])],
    version: 1, sections: outlineSections(outline), filingContext: { ...filingContext }, families: [...outline.families],
  };
}

async function registryTemplate(entry: RegulatoryApplicationType): Promise<BuiltinAuthoringTemplate> {
  const outline = await getRegistryDocumentTemplate(entry.id);
  if (!outline?.sections.length) throw new Error(`The exact ${entry.id} authoring outline could not be resolved.`);
  const sharedPlanning = isSharedPlanningRegistryEntry(entry);
  return projectOutline({
    entryId: `registry:${entry.id}`, outline,
    filingContext: { registryId: entry.id, region: entry.region as RecordedTemplateFilingContext['region'], agency: entry.agency },
    metadata: exactComponentMetadata(componentTemplateIdForRegistry(entry.id)),
    originalFormat: entry.submissionFormat ?? entry.dossierStandard,
    ...(sharedPlanning ? { description: `${outline.title}. Internal planning outline for device, diagnostics, biotech, pharma, laboratory and research work; confirm its actual purpose and sources.` } : {}),
    limitations: [
      `Registry applicability metadata: ${entry.productClass.join(', ')}. This does not establish this sponsor's product class or filing eligibility.`,
      ...(entry.moduleAuthority ? [`Recorded module authority: ${entry.moduleAuthority}`] : []),
      ...(sharedPlanning ? [
        'Internal planning work product, not an agency submission or filing authority. Select its actual purpose, audience, analysis date and source records; no product pathway is inferred.',
        'The ICH agency value is retained registry classification, not an ICH-prescribed template, endorsement, receiving authority or delivery destination.',
        'Distinguish source findings, analysis and proposed actions. Preserve actual meeting records and confirmed commitments; this outline does not establish that a meeting or agreement occurred.',
      ] : []),
    ],
  });
}

function componentTemplate(outline: DocumentTemplateStructure): BuiltinAuthoringTemplate {
  const { region, agency } = documentComponentContext(outline.id);
  const metadata = exactComponentMetadata(outline.id);
  return projectOutline({
    entryId: `component:${outline.id}`, outline,
    filingContext: { registryId: null, region, agency },
    metadata, originalFormat: metadata?.format ?? 'source-dependent',
    limitations: [region === 'GLOBAL'
      ? 'Shared document structure only. Confirm the target jurisdiction and regional placement; harmonization does not establish identical regional requirements.'
      : region === 'EU' && agency === 'EMA'
        ? 'EU document structure. Confirm the current applicable European procedure and client template.'
        : `${region} device document structure. Confirm the current applicable procedure, device/assay/version and client template.`],
  });
}

/** Metadata with no indexed leaflet outline remains an explicitly limited worksheet. */
function leafletPreparation(): BuiltinAuthoringTemplate {
  const metadata = searchTemplates('').find(row => row.id === 'pil');
  if (!metadata) throw new Error('The exact package-leaflet preparation metadata could not be resolved.');
  const outline: DocumentTemplateStructure = {
    id: metadata.id, title: metadata.title, families: ['ectd'],
    regulatoryBasis: 'Existing EU package-leaflet metadata; no indexed canonical leaflet outline.',
    outlineLimitations: ['No indexed canonical PIL outline is available. Obtain the current agency/client leaflet template and retain the source original; this is not a QRD leaflet or an SmPC copy.'],
    sections: [{ number: 'preparation', heading: 'Current agency/client leaflet source and preparation',
      purpose: 'Identify the current applicable leaflet template, product information, language, source versions, unresolved requirements and accountable reviewers before authoring the leaflet.', required: false }],
  };
  return projectOutline({
    entryId: 'component:pil', outline,
    filingContext: { registryId: null, region: documentComponentRegion('pil'), agency: 'EMA' },
    originalFormat: metadata.format, limitations: [],
  });
}

function regionalEntries(): RegulatoryApplicationType[] {
  return GLOBAL_REGISTRY.filter(entry => entry.active && (entry.segment === 'pharma_biotech' || isDeviceRegistryEntry(entry) || isSharedPlanningRegistryEntry(entry))
    && REGIONS.includes(entry.region as typeof REGIONS[number]));
}

function authoringComponents(): DocumentTemplateStructure[] {
  return DOCUMENT_TEMPLATES.filter(outline => outline.families.length > 0);
}

export async function getBuiltinAuthoringTemplates(): Promise<BuiltinAuthoringTemplate[]> {
  return [...getIndAuthoringTemplates(), ...await Promise.all(regionalEntries().map(registryTemplate)),
    ...authoringComponents().map(componentTemplate), leafletPreparation()];
}

export async function getBuiltinAuthoringTemplate(id: string): Promise<BuiltinAuthoringTemplate | undefined> {
  const ind = getIndAuthoringTemplate(id);
  if (ind) return ind;
  const normalized = id.toLowerCase();
  const entry = regionalEntries().find(row => builtinAuthoringTemplateId(`registry:${row.id}`) === normalized);
  if (entry) return registryTemplate(entry);
  const component = authoringComponents().find(row => builtinAuthoringTemplateId(`component:${row.id}`) === normalized);
  if (component) return componentTemplate(component);
  return builtinAuthoringTemplateId('component:pil') === normalized ? leafletPreparation() : undefined;
}

export function builtinTemplateReference(template: BuiltinAuthoringTemplate): BuiltinAuthoringTemplateRef {
  return { ...indTemplateReference(template), ...(template.filingContext ? {
    entryId: template.entryId, filingContext: { ...template.filingContext }, families: [...(template.families ?? [])],
  } : {}) };
}

/** IND objects are returned untouched, so their existing canonical hash stays identical. */
export function builtinTemplateSnapshot(template: BuiltinAuthoringTemplate): string {
  return indTemplateSnapshot(template);
}
