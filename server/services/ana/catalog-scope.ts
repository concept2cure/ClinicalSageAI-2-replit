/** Canonical current-actor source admission for existing AnA document tools. */
import type { ToolContext } from './AnaToolExecutor.js';
import type { AdmittedAnaSourceReadScope, AnaSourceReadScopeInput } from './source-read-scope.js';

export type CatalogScope =
  | { programId: string | null; admittedScope: AdmittedAnaSourceReadScope }
  | { error: string; code: string };

/** Actor and open-project identity are taken only from the serving context. */
export function sourceReadInput(ctx: ToolContext | undefined, orgId: number, requested: string | null = null): AnaSourceReadScopeInput {
  return { organizationId: orgId, userId: ctx?.userId ?? 0,
    projectId: ctx?.projectId ?? null, projectRef: ctx?.projectRef ?? null,
    requestedProgramId: requested };
}

export async function catalogScope(ctx: ToolContext | undefined, orgId: number, requested: string | null,
  purpose: 'read' | 'file'): Promise<CatalogScope> {
  if (!Number.isSafeInteger(ctx?.userId) || !ctx?.userId || ctx.userId <= 0) {
    return { code: 'SOURCE_ACTOR_REQUIRED', error: 'An identified current organization member is required.' };
  }
  if (purpose === 'file' && !(ctx.projectId || ctx.projectRef)) {
    return { code: 'NO_PROJECT', error: 'No project is open, so there is no project to file this into. Open the project and use "Add to this project" in its Data Room.' };
  }
  const actor = sourceReadInput(ctx, orgId, requested);
  try {
    const { withAnaSourceReadScope } = await import('../vault/document-catalog.service.js');
    const admittedScope = await withAnaSourceReadScope(actor, async (_q, scope) => scope);
    if (purpose === 'file' && !admittedScope.programId) {
      return { code: 'NO_PROJECT', error: 'The open project has no program to file this into. Use "Add to this project" in its Data Room.' };
    }
    return { programId: admittedScope.programId, admittedScope };
  } catch (error) {
    const { AnaProjectScopeError } = await import('./project-scope-admission.js');
    if (error instanceof AnaProjectScopeError) return { code: error.code, error: error.message };
    return { code: 'SOURCE_ACCESS_UNAVAILABLE', error: 'Current project source access could not be verified. No source listing or content was returned.' };
  }
}

/** Existing by-ID callers retain this helper, now checked against actor access. */
export async function documentScopeRefusal(ctx: ToolContext | undefined, orgId: number,
  documentProgramId: string | null | undefined): Promise<string | null> {
  const scope = await catalogScope(ctx, orgId, null, 'read');
  if ('error' in scope) return JSON.stringify({ ok: false, error: scope.error, code: scope.code });
  const { assertAnaSourceProgramAllowed } = await import('./source-read-scope.js');
  const { AnaProjectScopeError } = await import('./project-scope-admission.js');
  try { assertAnaSourceProgramAllowed(scope.admittedScope, documentProgramId ?? ''); }
  catch (error) {
    if (error instanceof AnaProjectScopeError) return JSON.stringify({ ok: false, code: error.code, error: error.message });
    return JSON.stringify({ ok: false, code: 'SOURCE_ACCESS_UNAVAILABLE', error: 'Current project source access could not be verified.' });
  }
  return null;
}
