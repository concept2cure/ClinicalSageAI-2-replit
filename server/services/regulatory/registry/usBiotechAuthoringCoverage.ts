/** Actual editor catalogue facts, distinct from blueprint and release qualification. */
import { GLOBAL_REGISTRY } from '../../../../shared/regulatory/global-document-registry';
import type { RegulatoryApplicationType } from '../../../../shared/regulatory/document-taxonomy';
import { getBuiltinAuthoringTemplates } from '../../authoring/builtin-authoring-templates';
import type { DocumentCoverage } from './registryCoverage';
import { registryTemplateUnavailabilityReason } from '../../market-specs/document-template-library';

type EditorTemplate = Awaited<ReturnType<typeof getBuiltinAuthoringTemplates>>[number];
const CROSS_SEGMENT = new Set(['US_EUA', 'US_RFD']);
const SCOPE_CONCERNS: Readonly<Record<string, string[]>> = {
  US_EUA: ['The existing outline is device/assay oriented; a drug or biologic EUA request is the separate US_EUA_THERAPEUTIC identity.'],
  US_RFD: ['The existing generic pre-submission outline does not provide a dedicated jurisdiction/primary-mode-of-action rationale.'],
  US_NDA_ANNUAL: ['This source models 21 CFR 314.81 NDA annual-report parts. A licensed biologic reports under US_BLA_ANNUAL (601.12(d)), US_BLA_PMR_ANNUAL (601.70), US_BLA_PEDIATRIC_ANNUAL (601.28) and US_BLA_DISTRIBUTION (600.81).'],
  US_CBE: ['The existing CBE records describe NDA/ANDA parts under 21 CFR 314.70; a licensed biologic files US_BLA_CBE30 or US_BLA_CBE0 under 601.12(c).'],
  // 2026-10-29: the new identities' own records are recall-only (eCFR/fda.gov unreachable here).
  US_EXPANDED_ACCESS_INDIVIDUAL: ['Form FDA 3926 has no FDAFormsRegistry entry, official asset or field map; its part is manual. Every citation in the record is recall, not re-read on eCFR.'],
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
      // 2026-10-29: the three expanded-access identities and Type D/INTERACT now
      // have exact registry identities, records and project packs. What is still
      // not represented is the official 3926 form path, and re-read regulator text.
      { need: 'Official Form FDA 3926 asset, field map and reviewed fill path (the expanded-access 3926 part is manual until then)',
        existingOwners: ['server/config/FDAFormsRegistry.ts', 'server/services/ind-forms', 'server/services/forms/fill-official-pdf.ts'] },
      { need: 'Regulator-text re-read (eCFR, fda.gov) of the 2026-10-29 Type D/INTERACT, expanded-access, BLA report/change and CBER/EUA records; every basis is recall',
        existingOwners: ['server/services/ind/ctd/us-biotech-meetings-sources.ts', 'server/services/ind/ctd/us-biotech-expanded-access-sources.ts', 'server/services/ind/ctd/us-biotech-bla-reports-sources.ts', 'server/services/ind/ctd/us-biotech-bla-changes-cber-sources.ts'] },
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
