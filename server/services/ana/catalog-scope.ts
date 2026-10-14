/** The scope rule for AnA's catalog: one open project, or a library whose
 * program set was verified for this actor. A missing actor never means tenant
 * access, and a permitted target never grants access to another source. */
import type { ToolContext } from './AnaToolExecutor.js';
import { resolveOpenProgram } from '../c2c/program-access.js';
import {
  getCurrentAccessibleProgramScope,
  requireCurrentProgramAccess,
  ProgramReadAccessError,
  type CurrentAccessibleProgramScope,
  type ProgramAccessExecutor,
} from '../c2c/current-program-access.js';

type CatalogScope =
  | { programId: string | null; accessibleScope: CurrentAccessibleProgramScope; executor: ProgramAccessExecutor }
  | { error: string; code: string };

function accessRefusal(error: unknown): Extract<CatalogScope, { error: string }> {
  if (error instanceof ProgramReadAccessError) return { error: error.message, code: error.code };
  return { code: 'PROJECT_ACCESS_UNAVAILABLE', error: 'Current project access could not be verified. No project data was supplied.' };
}

export async function catalogScope(
  ctx: ToolContext | undefined,
  orgId: number,
  requested: string | null,
  purpose: 'read' | 'file',
  executor?: ProgramAccessExecutor,
): Promise<CatalogScope> {
  const q = executor ?? ctx?.sqlClient;
  if (!q) return { code: 'REQUEST_DB_CONTEXT_REQUIRED', error: 'Request-scoped project access could not be verified. No project data was supplied.' };
  // An explicitly blank/malformed program remains an explicit request.
  const named = requested === null ? null : requested.trim().toLowerCase();
  try {
    const selected = await catalogProgramSelection(q, { ctx, orgId, named, purpose });
    if ('error' in selected) return selected;
    const accessibleScope = await getCurrentAccessibleProgramScope(q, {
      organizationId: orgId, userId: ctx?.userId ?? undefined, programId: selected.programId,
    });
    return { ...selected, accessibleScope, executor: q };
  } catch (error) { return accessRefusal(error); }
}

async function catalogProgramSelection(q: ProgramAccessExecutor, input: {
  ctx: ToolContext | undefined; orgId: number; named: string | null; purpose: 'read' | 'file';
}): Promise<{ programId: string | null } | Extract<CatalogScope, { error: string }>> {
  const { ctx, orgId, named, purpose } = input;
  const projectOpen = (ctx?.projectRef !== undefined && ctx.projectRef !== null) ||
    (ctx?.projectId !== undefined && ctx.projectId !== null);
  const open = projectOpen
    ? await resolveOpenProgram(q, { organizationId: orgId, projectId: ctx?.projectId ?? null, projectRef: ctx?.projectRef ?? null })
    : null;
  const boundary = open ? openProjectBoundary(open, named, purpose) : noProjectBoundary(projectOpen, purpose);
  return boundary ?? { programId: open ?? named };
}

function openProjectBoundary(open: string, named: string | null, purpose: 'read' | 'file'): Extract<CatalogScope, { error: string }> | null {
  if (named === null || named === open.toLowerCase()) return null;
  return { code: 'CROSS_PROJECT', error:
    'This conversation is held in its own project, and documents of another project are not ' +
    (purpose === 'file' ? 'filed' : 'listed') + ' from it. Open that project to work with its documents.' };
}

function noProjectBoundary(projectOpen: boolean, purpose: 'read' | 'file'): Extract<CatalogScope, { error: string }> | null {
  if (purpose === 'file') return { code: 'NO_PROJECT', error:
    (projectOpen ? 'The open project has no program to file this into. ' : 'No project is open, so there is no project to file this into. ') +
    'A chat file becomes a project’s document through the project’s Data Room: open the project and use "Add to this project".' };
  if (projectOpen) return { code: 'NO_PROJECT', error:
    'The open project has no program, so it has no Vault documents, and another project’s are not read from it.' };
  return null;
}

/** By-id tools still require the source document's actual current parent.
 * A no-project library is an evaluated accessible scope, not an org-wide grant. */
export async function documentScopeRefusal(
  ctx: ToolContext | undefined,
  orgId: number,
  documentProgramId: string | null | undefined,
  executor?: ProgramAccessExecutor,
): Promise<string | null> {
  const scope = await catalogScope(ctx, orgId, null, 'read', executor);
  if ('error' in scope) return JSON.stringify({ ok: false, ...scope });
  const target = typeof documentProgramId === 'string' ? documentProgramId.trim().toLowerCase() : '';
  const boundary = catalogDocumentBoundary(scope, target);
  if (boundary) return boundary;
  if (!target) return JSON.stringify({ ok: false, code: 'PROJECT_ANCHOR_UNRESOLVED', error:
    'This document needs one verified project relationship before its records can be supplied.' });
  try {
    await requireCurrentProgramAccess(scope.executor, { organizationId: orgId, userId: scope.accessibleScope.actor.userId, programId: target });
    return null;
  } catch (error) { return JSON.stringify({ ok: false, ...accessRefusal(error) }); }
}

/** The open conversation boundary remains a refusal even if a by-id adapter
 * unexpectedly supplies a different programme. It never grants source access. */
export function catalogDocumentBoundary(scope: { programId: string | null }, target: string): string | null {
  if (scope.programId && target.toLowerCase() !== scope.programId.toLowerCase()) {
    return JSON.stringify({ ok: false, code: 'CROSS_PROJECT', error:
      'That document belongs to another project. This conversation is held in its own project; open the document’s project to work with it.' });
  }
  return null;
}
