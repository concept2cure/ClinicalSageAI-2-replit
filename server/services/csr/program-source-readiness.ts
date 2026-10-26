import { looksLikeProgramUuid } from '../../lib/project-id.js';
import type { RequestSqlClient } from '../../db/requestDb.js';
import { readProgramAnchorRow } from '../c2c/program-project-anchor.js';
import { canAccessReportProject } from '../report-os/project-access.js';
import { CsrScopeError, readCsrProjectActor } from './project-scope.js';
import { programInOrganization } from '../c2c/program-access.js';

/** Completed narrative summaries are reusable inputs for Module 2, not the
 * clinical observations or full study metadata needed to draft a first CSR. */
export const CSR_NARRATIVE_INPUTS_REQUIRED = {
  code: 'CSR_NARRATIVE_INPUTS_REQUIRED',
  message: 'First-study CSR drafting is unavailable until verified study data and complete study information are linked to this project. Completed CSR summaries can be reused in a package; they do not supply those source inputs.',
} as const;

export interface ProgramCsrSourceReadiness {
  programId: string;
  projectLinked: boolean;
  completedSummaryCount: number | null;
  rawTabulation: { status: 'not-linked'; studyCount: null };
  deterministicSource: { format: 'concept2cure.csr-source.v1'; selection: 'explicit-per-run'; platformApprovalRequired: true; clinicalVerification: 'not-established' };
  narrative: { available: false; code: typeof CSR_NARRATIVE_INPUTS_REQUIRED.code; message: string };
  requiredInputs: {
    studyData: { required: readonly string[]; optional: readonly string[] };
    studyInfo: { required: readonly string[]; optional: readonly string[] };
  };
  recovery: Array<{ appId: 'vault' | 'authoring'; label: string; message: string }>;
}

/** Read facts only. Deterministic supporting-source selection is explicit per
 * run, never an inferred program-wide data binding. Unknown therefore stays
 * unknown even if a completed narrative job or an unparsed JSON file exists.
 * This endpoint never exposes study identifiers, text, participant cells or
 * internal CSR snapshots, and never grants a project share. */
export async function readProgramCsrSourceReadiness(
  database: RequestSqlClient,
  organizationId: number,
  programId: string,
  userId: number,
): Promise<ProgramCsrSourceReadiness> {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0 || !looksLikeProgramUuid(programId)) {
    throw new CsrScopeError('CSR_SCOPE_INVALID', 400, 'A valid organization and project UUID are required.');
  }
  const actor = await readCsrProjectActor(database, organizationId, userId);
  if (!await programInOrganization(database, programId, organizationId)) throw new CsrScopeError('CSR_PROGRAM_NOT_FOUND', 404, 'The selected project is not accessible.');
  // Adapt the generic SQL executor without asserting unknown rows are typed
  // anchors. The canonical reader still validates a positive integer id and
  // rejects missing or ambiguous anchors before any summary read.
  const project = await readProgramAnchorRow({
    query: async (text: string, params?: unknown[]) => {
      const result = await database.query(text, params);
      return { rows: result.rows.map(row => ({
        id: Number(row.id),
        clientWorkspaceId: row.clientWorkspaceId == null ? null : Number(row.clientWorkspaceId),
      })) };
    },
  }, {
    programId, orgId: organizationId, context: 'csr-source-readiness', requireUnique: true,
  });
  let completedSummaryCount: number | null = null;
  if (project) {
    if (!await canAccessReportProject(organizationId, actor, project.id, database)) {
      throw new CsrScopeError('CSR_PROJECT_ACCESS_DENIED', 403, 'Current project access is required to inspect CSR source readiness.');
    }
    // Matches the canonical loader's latest-completed-per-study denominator.
    // Failed, needs-data, in-progress and unfiled jobs cannot supply summaries.
    const counts = await database.query(`SELECT count(DISTINCT study_id)::integer AS summary_count
      FROM csr_build_jobs WHERE organization_id = $1 AND project_id = $2 AND status = 'complete'`, [organizationId, project.id]);
    const count = counts.rows[0]?.summary_count;
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) throw new Error('CSR completed summary count could not be established.');
    completedSummaryCount = count;
  }
  return {
    programId,
    projectLinked: project !== null,
    completedSummaryCount,
    rawTabulation: { status: 'not-linked', studyCount: null },
    deterministicSource: { format: 'concept2cure.csr-source.v1', selection: 'explicit-per-run', platformApprovalRequired: true, clinicalVerification: 'not-established' },
    narrative: { available: false, ...CSR_NARRATIVE_INPUTS_REQUIRED },
    // Fields from StudyData in csr-tabulation-builders.ts and
    // CSRBuildRequest['studyInfo'] in csr-builder.ts. Arrays require real
    // source values; an empty profile or protocol-design blob is not an adapter.
    requiredInputs: {
      studyData: {
        required: ['studyId', 'protocolNumber', 'treatmentArms', 'disposition', 'demographics', 'efficacy', 'adverseEvents'],
        optional: ['exposure', 'labShifts'],
      },
      studyInfo: {
        required: ['title', 'protocolNumber', 'phase', 'indication', 'sponsor', 'investigationalProduct', 'studyDesign', 'primaryEndpoint'],
        optional: ['comparator', 'secondaryEndpoints', 'sampleSize', 'treatmentDuration', 'targetAgencies'],
      },
    },
    recovery: [
      { appId: 'vault', label: 'Review study source records', message: 'Retain study source files and their provenance in this project\'s Vault. Select, validate and approve an exact supporting-source JSON version for deterministic tables in a run. Uploading alone does not connect observations or enable first-study AI narrative generation.' },
      { appId: 'authoring', label: 'Review or author the CSR', message: 'Use this project\'s Authoring workspace for a governed CSR document and source review. Authoring a document does not qualify a clinical-data adapter.' },
    ],
  };
}
