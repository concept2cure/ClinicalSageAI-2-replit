/** Current actor admission composes the exact-source pin with the existing
 * request-scoped program authority. Neither grant widens the other. */
import type { ToolContext } from './AnaToolExecutor.js';
import { switchPinTerms } from '../../db/sessionScope.js';
import { AnaProjectScopeError } from './project-scope-admission.js';
import type { AdmittedAnaSourceReadScope, AnaSourceReadScopeInput } from './source-read-scope.js';
import {
  getCurrentAccessibleProgramScope, requireCurrentProgramAccess,
  ProgramReadAccessError, type CurrentAccessibleProgramScope, type ProgramAccessExecutor,
} from '../c2c/current-program-access.js';

export type CatalogScope =
  | { programId: string | null; admittedScope: AdmittedAnaSourceReadScope;
      accessibleScope: CurrentAccessibleProgramScope; executor: ProgramAccessExecutor }
  | { error: string; code: string };

/** Actor and open-project identity are taken only from the serving context. */
export function sourceReadInput(ctx: ToolContext | undefined, orgId: number, requested: string | null = null): AnaSourceReadScopeInput {
  return { organizationId: orgId, userId: ctx?.userId ?? 0,
    projectId: ctx?.projectId ?? null, projectRef: ctx?.projectRef ?? null,
    requestedProgramId: requested };
}

function accessRefusal(error: unknown): Extract<CatalogScope, { error: string }> {
  if (error instanceof AnaProjectScopeError || error instanceof ProgramReadAccessError) {
    return { code: error.code, error: error.message };
  }
  return { code: 'SOURCE_ACCESS_UNAVAILABLE', error: 'Current project source access could not be verified. No source listing or content was returned.' };
}

function hasIdentifiedActor(ctx: ToolContext | undefined): ctx is ToolContext & { userId: number } {
  return Boolean(Number.isSafeInteger(ctx?.userId) && ctx?.userId && ctx.userId > 0);
}
function hasOpenProject(ctx: ToolContext): boolean {
  return ctx.projectId !== undefined && ctx.projectId !== null || ctx.projectRef !== undefined && ctx.projectRef !== null;
}

export async function catalogScope(ctx: ToolContext | undefined, orgId: number, requested: string | null,
  purpose: 'read' | 'file', executor?: ProgramAccessExecutor): Promise<CatalogScope> {
  if (!hasIdentifiedActor(ctx)) {
    return { code: 'SOURCE_ACTOR_REQUIRED', error: 'An identified current organization member is required.' };
  }
  const q = executor ?? ctx.sqlClient;
  if (!q) return { code: 'REQUEST_DB_CONTEXT_REQUIRED', error: 'Request-scoped project access could not be verified. No project data was supplied.' };
  const projectOpen = hasOpenProject(ctx);
  if (purpose === 'file' && !projectOpen) {
    return { code: 'NO_PROJECT', error: 'No project is open, so there is no project to file this into. Open the project and use "Add to this project" in its Data Room.' };
  }
  // An explicit malformed or blank program remains explicit; it cannot turn
  // into an accessible-library query merely because parsing failed.
  const actor = sourceReadInput(ctx, orgId, requested);
  try {
    const { withAnaSourceReadScope } = await import('../vault/document-catalog.service.js');
    const admittedScope = await withAnaSourceReadScope(actor, async (_sourceQ, scope) => scope);
    if (projectOpen && !admittedScope.programId) {
      return { code: 'NO_PROJECT', error: 'The open project has no program. Open a project with a verified program relationship; use "Add to this project" in its Data Room to file a document.' };
    }
    // This connection belongs to the request. Its existing release clears
    // session variables; a cached request role cannot authorize this read.
    await q.query("SELECT set_config('app.current_tenant_id', $1, false), set_config('app.current_user_role', $2, false), " + switchPinTerms(false), [String(orgId), admittedScope.role]);
    const accessibleScope = await getCurrentAccessibleProgramScope(q, {
      organizationId: orgId, userId: ctx.userId, programId: admittedScope.programId,
    });
    if (accessibleScope.actor.userId !== admittedScope.userId || accessibleScope.actor.role !== admittedScope.role) {
      throw new AnaProjectScopeError(403, 'ANA_SOURCE_SCOPE_CHANGED', 'Current organization membership changed during source admission. No source data was supplied.');
    }
    return { programId: admittedScope.programId, admittedScope, accessibleScope, executor: q };
  } catch (error) { return accessRefusal(error); }
}

/** Existing by-ID callers retain a source grant separate from the open
 * conversation boundary. Request scope alone does not grant another source. */
export async function documentScopeRefusal(ctx: ToolContext | undefined, orgId: number,
  documentProgramId: string | null | undefined, executor?: ProgramAccessExecutor): Promise<string | null> {
  const scope = await catalogScope(ctx, orgId, null, 'read', executor);
  if ('error' in scope) return JSON.stringify({ ok: false, error: scope.error, code: scope.code });
  const target = typeof documentProgramId === 'string' ? documentProgramId.trim().toLowerCase() : '';
  const boundary = catalogDocumentBoundary(scope, target);
  if (boundary) return boundary;
  if (!target) return JSON.stringify({ ok: false, code: 'PROJECT_ANCHOR_UNRESOLVED', error: 'This document needs one verified project relationship before its records can be supplied.' });
  const { assertAnaSourceProgramAllowed } = await import('./source-read-scope.js');
  try {
    assertAnaSourceProgramAllowed(scope.admittedScope, target);
    await requireCurrentProgramAccess(scope.executor, { organizationId: orgId, userId: scope.admittedScope.userId, programId: target });
    return null;
  } catch (error) { return JSON.stringify({ ok: false, ...accessRefusal(error) }); }
}

export function catalogDocumentBoundary(scope: { programId: string | null }, target: string): string | null {
  if (scope.programId && target.toLowerCase() !== scope.programId.toLowerCase()) {
    return JSON.stringify({ ok: false, code: 'CROSS_PROJECT', error: 'That document belongs to another project. This conversation is held in its own project; open the document’s project to work with it.' });
  }
  return null;
}
