/** Actual editor catalogue facts, distinct from blueprint and release qualification. */
import { GLOBAL_REGISTRY } from '../../../../shared/regulatory/global-document-registry';
import type { RegulatoryApplicationType } from '../../../../shared/regulatory/document-taxonomy';
import { getBuiltinAuthoringTemplates } from '../../authoring/builtin-authoring-templates';
import type { DocumentCoverage } from './registryCoverage';
import { registryTemplateUnavailabilityReason } from '../../market-specs/document-template-library';

type EditorTemplate = Awaited<ReturnType<typeof getBuiltinAuthoringTemplates>>[number];
const CROSS_SEGMENT = new Set(['US_EUA', 'US_RFD']);
const SCOPE_CONCERNS: Readonly<Record<string, string[]>> = {
  US_EUA: ['The existing outline is device/assay oriented; its availability does not establish therapeutic or vaccine EUA content coverage.'],
  US_RFD: ['The existing generic pre-submission outline does not provide a dedicated jurisdiction/primary-mode-of-action rationale.'],
  US_NDA_ANNUAL: ['This source primarily models 21 CFR 314.81 NDA annual-report parts. Its name does not establish all biologics reports under Parts 600/601.'],
  US_CBE: ['The existing CBE records describe NDA/ANDA parts; confirm the applicable biologics change classification and records under 21 CFR 601.12.'],
};

function templateFacts(template: EditorTemplate | undefined) {
  if (!template) return { editorTemplateId: null, entryId: null, outlineSections: 0, templateKind: null,
    narrativeSections: 0, manualSections: 0, workingBodiesEmpty: null, sourceLimitations: [], assessment: 'catalogue-inventory' as const };
  return {
    editorTemplateId: template.id,
    entryId: template.entryId,
    outlineSections: template.sections.length,
    templateKind: template.kind,
    narrativeSections: template.aiDraftable
      ? template.sections.filter(section => section.guidance.drafting_mode !== 'manual').length : 0,
    manualSections: template.sections.filter(section => !template.aiDraftable || section.guidance.drafting_mode === 'manual').length,
    workingBodiesEmpty: template.sections.every(section => !section.content.trim()),
    sourceLimitations: template.limitations,
    assessment: 'catalogue-inventory' as const,
  };
}

function filingFacts(entry: RegulatoryApplicationType, template: EditorTemplate | undefined,
  coverage: DocumentCoverage | undefined) {
  return {
    registryId: entry.id, title: entry.displayName, region: entry.region,
    productClasses: [...entry.productClass], family: entry.applicationFamily,
    ...templateFacts(template),
    availabilityReason: template ? null : registryTemplateUnavailabilityReason(entry.id) ?? 'No exact registry editor template is exposed; inspect separately named source templates.',
    staticBacking: coverage ? { sectionBlueprint: coverage.sectionBlueprint, taskBlueprint: coverage.taskBlueprint,
      governedClass: coverage.governedAuthoring, forms: coverage.requiredForms } : null,
    scopeConcerns: SCOPE_CONCERNS[entry.id] ?? [],
  };
}

/** Derived from existing owners. This function never creates documents or qualifies a workflow. */
export async function buildUsBiotechAuthoringCoverage(coverage: readonly DocumentCoverage[]) {
  const templates = await getBuiltinAuthoringTemplates();
  const byEntry = new Map(templates.map(template => [template.entryId, template]));
  const byRegistry = new Map(coverage.map(row => [row.id, row]));
  const entries = GLOBAL_REGISTRY.filter(entry => entry.active && entry.region === 'US'
    && (entry.segment === 'pharma_biotech' || CROSS_SEGMENT.has(entry.id)));
  const filings = entries.map(entry => filingFacts(entry, byEntry.get(`registry:${entry.id}`), byRegistry.get(entry.id)));
  const shared = GLOBAL_REGISTRY.filter(entry => entry.active &&
    ((entry.region === 'GLOBAL' && (entry.segment === 'pharma_biotech' || entry.category === 'ctd_ectd')) || entry.id === 'US_CTD_M1_REGIONAL'));
  const reusableDocuments = templates.filter(template => template.entryId.startsWith('component:')
    && template.filingContext && ['GLOBAL', 'US'].includes(template.filingContext.region)
    && template.families?.some(family => family === 'ectd' || family === 'ctis'))
    .map(template => ({ ...templateFacts(template), entryId: template.entryId, title: template.name,
      filingContext: template.filingContext }));
  return {
    format: 'concept2cure.us-biotech-authoring-coverage.v1',
    qualification: 'inventory-only; workflow and human acceptance require separate evidence',
    scope: 'Active US medicinal registry entries, cross-segment EUA/RFD, and GLOBAL/shared reusable medicinal documents. Not an exhaustive legal universe.',
    filings, reusableDocuments,
    sharedRegistryDocuments: shared.map(entry => filingFacts(entry, byEntry.get(`registry:${entry.id}`), byRegistry.get(entry.id))),
    summary: { filings: filings.length, editorLoadableDefinitions: filings.filter(row => row.editorTemplateId).length,
      reusableDocuments: reusableDocuments.length, scopedConcerns: filings.filter(row => row.scopeConcerns.length).length },
    unrepresentedNeeds: [
      { need: 'Exact expanded access working-document/Form FDA 3926 source path, distinguished by individual/group and application-specific scope',
        existingOwners: ['shared/regulatory/global-document-registry.ts', 'server/config/FDAFormsRegistry.ts', 'server/services/authoring/authoring-source-import.ts'] },
      { need: 'Separately retained Type D/INTERACT editor starts and their applicable meeting-program context',
        existingOwners: ['server/services/ind/ctd/lifecycle-document-types.ts', 'server/services/ana-ri/document-templates.ts'] },
      { need: 'Sponsor document-template formatting and retained Word layout beyond the current structured-text import/export',
        existingOwners: ['server/services/authoring/authoring-export.ts', 'shared/templates/template-spec.ts'] },
    ],
    evidenceRules: [
      'Registered, outlined, editor-loadable, narrative-eligible, source-grounded, reviewed, exportable and submittable are separate observations.',
      'Static governed-class/form/backbone/channel configuration does not establish current permissions, original asset review, credentials, live-provider competence, regulatory correctness or agency acceptance.',
      'Use actual HTTP/SQL/editor/source/review/export/response receipts for workflow evidence. No keyword count or metadata flag marks a document VERIFIED.',
    ],
  };
}
