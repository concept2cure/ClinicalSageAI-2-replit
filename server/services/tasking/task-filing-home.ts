import type { TaskFilingHome } from '../../../shared/types/task-filing-home';
import { isTrackedFilingId } from '../../../shared/types/task-filing-home';
import type { RequestDb, RequestSqlClient } from '../../db/requestDb';
import { readCsrProjectActor, CsrScopeError } from '../csr/project-scope';
import { canAccessReportProject } from '../report-os/project-access';
import { projectBelongsToTenant } from '../cmc/project-membership';
import { getEstarSubmission, EstarSubmissionError } from '../pathway-engines/estar/estar-submission-service';
import { loadTaskHomePrograms } from './task-home-programs';

export class TaskFilingHomeError extends Error {
  constructor(readonly code: string, readonly status: 400 | 403 | 404 | 503, message: string) {
    super(message); this.name = 'TaskFilingHomeError';
  }
}

async function requireTaskFilingProjectAccess(
  client: RequestSqlClient,
  organizationId: number,
  actor: Awaited<ReturnType<typeof readCsrProjectActor>>,
  projectId: number | null,
): Promise<void> {
  if (projectId !== null) {
    if (!Number.isSafeInteger(projectId) || projectId <= 0) throw new Error('Invalid recorded filing project');
    if (!await projectBelongsToTenant({ organizationId, projectId: String(projectId) }, client)) {
      throw new TaskFilingHomeError('FILING_NOT_FOUND', 404, 'This tracked filing is not available in this organization.');
    }
    if (!await canAccessReportProject(organizationId, actor, projectId, client)) {
      throw new TaskFilingHomeError('FILING_ACCESS_DENIED', 403, 'You do not have access to this tracked filing’s project.');
    }
  }
}

/** The owning native record and programme are verified on the request client.
 * No relationship to the separate canonical submissions store is inferred. */
export async function loadTaskFilingHome(
  database: Pick<RequestDb, 'select'>,
  client: RequestSqlClient,
  input: { organizationId: number; userId: number; filingId: string },
): Promise<TaskFilingHome> {
  if (!isTrackedFilingId(input.filingId)) {
    throw new TaskFilingHomeError('FILING_ID_INVALID', 400, 'The tracked filing identifier must be a UUID.');
  }
  try {
    const actor = await readCsrProjectActor(client, input.organizationId, input.userId, { allowReadOnlyTenant: true });
    const row = await getEstarSubmission(input.filingId, { organizationId: input.organizationId }, database);
    const projectId = row.projectId;
    await requireTaskFilingProjectAccess(client, input.organizationId, actor, projectId);
    const program = projectId !== null ? (await loadTaskHomePrograms(client, input.organizationId, [projectId])).get(projectId) : undefined;
    const iso = (date: Date | null) => date === null ? null : date.toISOString();
    return {
      filing: {
        id: row.id, catalogKey: row.catalogKey, programType: row.programType, variant: row.variant,
        title: row.title, status: row.status, decision: row.decision, fdaTrackingNumber: row.fdaTrackingNumber,
        filedAt: iso(row.filedAt), reviewGoalDays: row.reviewGoalDays, decisionDueAt: iso(row.decisionDueAt),
        filedArtifactDocumentId: row.filedArtifactDocumentId, filedArtifactSha256: row.filedArtifactSha256,
        notes: row.notes, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
      },
      home: { source: 'filing', nativeId: row.id, projectId, programId: program?.id ?? null, programTitle: program?.title ?? null },
    };
  } catch (error) {
    if (error instanceof TaskFilingHomeError) throw error;
    if (error instanceof EstarSubmissionError && error.code === 'NOT_FOUND') {
      throw new TaskFilingHomeError('FILING_NOT_FOUND', 404, 'This tracked filing is not available in this organization.');
    }
    if (error instanceof CsrScopeError && error.status === 403) {
      throw new TaskFilingHomeError('FILING_ACCESS_DENIED', 403, 'Current active organization membership is required to read this tracked filing.');
    }
    throw new TaskFilingHomeError('FILING_READ_UNAVAILABLE', 503, 'The tracked filing and its current access could not be verified. Retry this exact filing.');
  }
}
