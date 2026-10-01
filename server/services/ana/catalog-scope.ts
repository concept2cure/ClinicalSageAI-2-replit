/**
 * The scope rule for AnA's document catalog tools (PF-10 S7): one open
 * project, its program only.
 */
import type { ToolContext } from './AnaToolExecutor.js';
import { programInOrganization, resolveOpenProgram } from '../c2c/program-access.js';

/**
 * The program a catalog tool acts in (PF-10 S7). A conversation belongs to one
 * project, and a cross-project reference is refused by default (PF-11):
 *
 *   - a project open: its program is the scope; naming another is refused
 *     CROSS_PROJECT. A legacy project with no program behaves as no program.
 *   - no project open: a read is the organization, or the program named if it
 *     is the organization's; a filing is refused NO_PROJECT, because a chat
 *     file becomes a project's only through the Data Room's audited adopt
 *     (PF-07).
 *
 * The model's program_id was taken as given, and the ingest checks only the
 * organization: AnA could list or file into any project of it.
 */
type CatalogScope =
  | { programId: string | null }
  | { error: string; code: 'CROSS_PROJECT' | 'NO_PROJECT' | 'PROGRAM_NOT_FOUND' };

export async function catalogScope(
  ctx: ToolContext | undefined,
  orgId: number,
  requested: string | null,
  purpose: 'read' | 'file',
): Promise<CatalogScope> {
  const { pool } = await import('../../db.js');
  const named = requested ? requested.trim().toLowerCase() : null;
  const projectOpen = Boolean(ctx?.projectRef || ctx?.projectId);
  const open = projectOpen
    ? await resolveOpenProgram(pool, { organizationId: orgId, projectId: ctx?.projectId ?? null, projectRef: ctx?.projectRef ?? null })
    : null;
  if (open) return openProjectScope(open, named, purpose);
  return noProgramScope(pool, orgId, named, projectOpen, purpose);
}

/** A project is open and has a program: that program, and no other. */
function openProjectScope(open: string, named: string | null, purpose: 'read' | 'file'): CatalogScope {
  if (named && named !== open.toLowerCase()) {
    return {
      code: 'CROSS_PROJECT',
      error:
        'This conversation is held in its own project, and documents of another project are not ' +
        (purpose === 'file' ? 'filed' : 'listed') + ' from it. Open that project to work with its documents.',
    };
  }
  return { programId: open };
}

/** No program open: a read is the organization or a named program of it; a filing is refused. */
async function noProgramScope(
  pool: Parameters<typeof programInOrganization>[0],
  orgId: number,
  named: string | null,
  projectOpen: boolean,
  purpose: 'read' | 'file',
): Promise<CatalogScope> {
  if (purpose === 'file') {
    return {
      code: 'NO_PROJECT',
      error:
        (projectOpen
          ? 'The open project has no program to file this into. '
          : 'No project is open, so there is no project to file this into. ') +
        'A chat file becomes a project\u2019s document through the project\u2019s Data Room: open the project and ' +
        'use "Add to this project".',
    };
  }
  if (projectOpen) {
    // Not the organization either: that would be every project's documents
    // from a conversation that belongs to one (review wf_0b1c1dfc-069).
    return {
      code: 'NO_PROJECT',
      error: 'The open project has no program, so it has no Vault documents, and another project\u2019s are not read from it.',
    };
  }
  if (!named) return { programId: null };
  return (await programInOrganization(pool, named, orgId))
    ? { programId: named }
    : { code: 'PROGRAM_NOT_FOUND', error: 'That program is not one of your organization\u2019s projects.' };
}

/**
 * For a tool that acts on one document by id (read, catalog, place): the
 * document must be the open project's. The JSON refusal to return, or null.
 *
 * search_project_documents is organization-wide by nature, so the model can
 * hold another project's document id; every by-id tool loaded the document
 * org-checked only, so a conversation held in project A read, cataloged and
 * placed project B's documents (review wf_0b1c1dfc-069). No project open: any
 * document of the organization, as today (F5).
 */
export async function documentScopeRefusal(
  ctx: ToolContext | undefined,
  orgId: number,
  documentProgramId: string | null | undefined,
): Promise<string | null> {
  const scope = await catalogScope(ctx, orgId, null, 'read');
  if ('error' in scope) return JSON.stringify({ ok: false, error: scope.error, code: scope.code });
  if (scope.programId && String(documentProgramId ?? '').toLowerCase() !== scope.programId.toLowerCase()) {
    return JSON.stringify({
      ok: false,
      code: 'CROSS_PROJECT',
      error:
        'That document belongs to another project. This conversation is held in its own project; open the ' +
        'document\u2019s project to work with it.',
    });
  }
  return null;
}
