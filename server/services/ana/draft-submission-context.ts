/** Resolve an omitted batch filing identity from the open project's recorded facts. */
import { resolveOpenProgram, type OpenProjectContext } from '../c2c/program-access.js';
import { registryContextForProgram } from '../c2c/program-registry-context.js';

type Queryable = { query(sql: string, args?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> };

function hasOpenProject(ctx: OpenProjectContext | undefined): ctx is OpenProjectContext {
  return Boolean(ctx && Number.isSafeInteger(ctx.organizationId) && Number(ctx.organizationId) > 0 &&
    (ctx.projectRef || ctx.projectId));
}

export const UNASSESSED_DRAFT_SUBMISSION_NOTE =
  '\n\nSUBMISSION REQUIREMENTS STATUS: UNASSESSED. No canonical filing type could be resolved from the open project records. ' +
  'Confirm the receiving jurisdiction and submission type before applying section requirements. ' +
  'Do not infer a regional filing from a CTD section number or a generic framework label.';

/** A recorded but invalid selection is unresolved, never permission to use a legacy default. */
function chosenSubmissionType(raw: unknown): { valid: boolean; value?: string } {
  let metadata = raw;
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch { return { valid: false }; }
  }
  if (metadata == null) return { valid: true };
  if (typeof metadata !== 'object' || Array.isArray(metadata)) return { valid: false };
  const chosen = (metadata as Record<string, unknown>).submissionTypeId;
  if (chosen == null) return { valid: true };
  return typeof chosen === 'string' && chosen.trim()
    ? { valid: true, value: chosen }
    : { valid: false };
}

/** Database failures propagate so the caller refuses inference before any model call. */
export async function resolveDraftSubmissionType(
  pool: Queryable, ctx: OpenProjectContext | undefined,
): Promise<string | undefined> {
  if (!hasOpenProject(ctx)) return undefined;
  const programId = await resolveOpenProgram(pool, ctx);
  if (!programId) return undefined;
  const result = await pool.query(
    `SELECT program_type, primary_agency, metadata FROM regulatory_programs
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [programId, ctx.organizationId],
  );
  const row = result.rows[0];
  if (!row) return undefined;
  const chosen = chosenSubmissionType(row.metadata);
  if (!chosen.valid) return undefined;
  return registryContextForProgram({
    submissionTypeId: chosen.value,
    programType: typeof row.program_type === 'string' ? row.program_type : null,
    primaryAgency: typeof row.primary_agency === 'string' ? row.primary_agency : null,
  })?.registryId;
}

/** Explicit caller identity is unchanged; only an omitted identity consults the open project. */
export async function applyRecordedDraftSubmissionContext(
  requests: Array<{ submissionType?: string; instructions: string }>,
  explicitType: string | undefined,
  ctx: OpenProjectContext | undefined,
): Promise<void> {
  if (explicitType?.trim()) return;
  const recordedType = hasOpenProject(ctx)
    ? await resolveDraftSubmissionType((await import('../../db.js')).getPool(), ctx)
    : undefined;
  for (const request of requests) {
    request.submissionType = recordedType;
    if (!recordedType) request.instructions += UNASSESSED_DRAFT_SUBMISSION_NOTE;
  }
}
