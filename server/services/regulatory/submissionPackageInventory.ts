/** Read the active project's existing canonical lifecycle projection.
 * Does not infer documents from titles, model claims or nearby filing types.
 * The projection is a scoped progress snapshot, not a complete source-store
 * inventory or a technical package validation.
 */
import { resolveOpenProgram, type OpenProjectContext } from '../c2c/program-access.js';
import { loadProjectionInput, type CanonicalStoreHandle } from './canonicalDocumentStore.js';
import { projectCanonicalDocument, type ProjectionInput } from './documentLifecycleOrchestrator.js';
import { componentTemplateIdForRegistry } from '../market-specs/document-template-library.js';
import type { ProjectArtifactData, ProjectSectionData } from './submissionPackageBuilder.js';

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
export class SubmissionInventoryScopeLimit extends Error {
  constructor() {
    super('The active project has more than 200 canonical projections. Use the governed Submission Center inventory for this larger package; this tool has not assessed it.');
    this.name = 'SubmissionInventoryScopeLimit';
  }
}
const ARTIFACT_NAMES: Readonly<Record<string, string>> = {
  clinical_study_report: 'csr', investigators_brochure: 'investigator_brochure',
  risk_management_plan: 'rmp', statistical_analysis_plan: 'sap',
  summary_of_product_characteristics: 'smpc',
};

function progressStatus(input: ProjectionInput): string {
  if (['superseded', 'withdrawn'].includes(input.stage)) return input.stage;
  if (!input.hasContent || !input.contentHash.trim()) return 'missing';
  if (['approved', 'placed', 'packaged', 'submitted'].includes(input.stage)) {
    const signature = input.approvalSignature;
    const signatureComplete = signature?.meaning === 'approved'
      && [signature.actor, signature.role, signature.signatureRef, signature.signedAt]
        .every(value => typeof value === 'string' && value.trim().length > 0)
      && Number.isFinite(Date.parse(signature.signedAt))
      && signature.boundContentHash === input.contentHash;
    return signatureComplete && projectCanonicalDocument(input).violations.length === 0 ? 'approved' : 'review';
  }
  return input.stage === 'in_review' ? 'review' : input.stage === 'authoring' ? 'draft' : 'missing';
}

export async function loadSavedSubmissionInventory(input: {
  pool: Queryable;
  db: CanonicalStoreHandle;
  context: OpenProjectContext;
  registryId: string;
}): Promise<{ programId: string; sections: ProjectSectionData[]; artifacts: ProjectArtifactData[]; notices: string[] } | null> {
  const orgId = Number(input.context.organizationId);
  const programId = await resolveOpenProgram(input.pool, input.context);
  if (!programId) return null;
  const { rows } = await input.pool.query(
    `SELECT canonical_id FROM canonical_documents
      WHERE organization_id = $1 AND project_id = $2
      ORDER BY canonical_id LIMIT 201`,
    [orgId, programId],
  );
  if (rows.length > 200) throw new SubmissionInventoryScopeLimit();
  const sections: ProjectSectionData[] = [];
  const artifacts: ProjectArtifactData[] = [];
  for (const row of rows) {
    const projection = await loadProjectionInput(input.db, row.canonical_id, orgId);
    if (!projection || projection.projectId !== programId || projection.organizationId !== orgId) {
      throw new Error('Project projection changed during assessment; retry the saved-record read.');
    }
    // A document already placed in another filing cannot vouch for this one.
    if (projection.placement && projection.placement.registryId !== input.registryId) continue;
    const status = progressStatus(projection);
    const component = componentTemplateIdForRegistry(projection.documentType) ?? projection.documentType.toLowerCase();
    artifacts.push({ type: ARTIFACT_NAMES[component] ?? component, status, documentId: projection.canonicalId });
    if (projection.placement?.registryId === input.registryId && projection.placement.sectionCode) {
      sections.push({ code: projection.placement.sectionCode, status, documentIds: status === 'missing' ? [] : [projection.canonicalId] });
    }
  }
  return {
    programId, sections, artifacts,
    notices: [
      'This snapshot reads saved canonical lifecycle projections. Unlinked working documents and external sources are not inventoried; absence from the projection does not prove absence from the project.',
      'Only explicit saved filing placements satisfy section rows. No title, nearby filing type or model-supplied approval is used.',
      'Scientific applicability, source-store reconciliation, signature verification, datasets, regional technical validation and transmission readiness require their governed checks.',
    ],
  };
}
