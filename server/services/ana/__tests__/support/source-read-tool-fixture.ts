/** Synthetic read authority for existing handler unit fixtures. This is not policy/DB proof. */
import { createHash } from 'node:crypto';
import { AnaProjectScopeError } from '../../project-scope-admission.js';
import type { AdmittedAnaSourceReadScope, AnaSourceReadScopeInput } from '../../source-read-scope.js';
const defaultProgram = '90000000-0000-4000-8000-000000000001';
export async function syntheticReadWrapper<T>(input: AnaSourceReadScopeInput, fn: (q: any, scope: AdmittedAnaSourceReadScope) => Promise<T>): Promise<T> {
  const { pool } = await import('../../../../db.js');
  const { resolveOpenProgram, programInOrganization } = await import('../../../c2c/program-access.js');
  const open = await resolveOpenProgram(pool, input);
  const named = input.requestedProgramId?.toLowerCase() ?? null;
  if (open && named && open.toLowerCase() !== named) throw new AnaProjectScopeError(403, 'CROSS_PROJECT', 'Open the source’s project to work with it.');
  if (!open && (input.projectId || input.projectRef)) throw new AnaProjectScopeError(400, 'NO_PROJECT', 'The open project has no program.');
  if (!open && named && !await programInOrganization(pool, named, input.organizationId)) throw new AnaProjectScopeError(404, 'PROGRAM_NOT_FOUND', 'The source program is unavailable.');
  const programId = open ?? named;
  const scope = syntheticScopeFor(input, programId);
  return fn(pool, scope);
}
function syntheticScopeFor(input: AnaSourceReadScopeInput, programId: string | null): AdmittedAnaSourceReadScope {
  return { organizationId: input.organizationId, userId: input.userId, role: 'member', projectId: input.projectId ?? (programId ? 1 : null),
    programId, accessibleProgramIds: programId ? [programId] : [defaultProgram], actorFiltered: true };
}

export async function syntheticActorDocument(input: AnaSourceReadScopeInput & { documentId: string }, opts: any,
  load: (id: string, org: number, opts?: any) => Promise<any>) {
  return syntheticReadWrapper(input, async (_q, scope) => {
    const doc = await load(input.documentId, input.organizationId, opts);
    if (!doc) return null;
    if (scope.programId && doc.programId?.toLowerCase() !== scope.programId.toLowerCase()) throw new AnaProjectScopeError(403, 'CROSS_PROJECT', 'Open the source’s project to work with it.');
    const admittedScope = { ...scope, accessibleProgramIds: [doc.programId] };
    return { ...doc, admittedScope, isCurrent: true, extractedTextSha256: typeof doc.extractedText === 'string' ? createHash('sha256').update(doc.extractedText).digest('hex') : null,
      sourceAccess: { actorFiltered: true, currentVersion: true, retainedTextOnly: doc.disposition === 'keep_data', currentUseEligible: true,
        receiptEligible: true, scope: scope.programId ? 'open_project' : 'accessible_projects', notice: 'Synthetic admitted source.' } };
  });
}
export const syntheticInput = (ctx: any, organizationId: number, requestedProgramId: string | null = null) => ({
  organizationId, userId: ctx?.userId ?? 0, projectId: ctx?.projectId ?? null, projectRef: ctx?.projectRef ?? null, requestedProgramId,
});
