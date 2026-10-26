/**
 * The project an AnA composer reads its record source from (CLAUDE.md Rule 2).
 *
 * A Module 2 composer's figures come from the project's own records, never from
 * the tool input the model writes. This resolves which project that is, as the
 * person asking: the open project (a regulatory_programs uuid in `projectRef`
 * under the v2 shell, else the integer `projectId`), or the one the input names
 * when none is open; another project named while one is open is refused (P-14);
 * the read goes through the CSR scope's project-access check with the actor, and
 * a refusal is answered as one, never thrown.
 *
 * Moved out of module2-csr-inputs.ts (3b Slice 1) when 2.4/2.6 needed the same
 * boundary (Rule 2 audit S2, 2026-10-26): one implementation, two consumers.
 *
 * @module server/services/ana/record-source-project
 */
import { looksLikeProgramUuid } from '../../lib/project-id.js';

export interface RecordSourceRefusal {
  ok: false;
  status: 'needs_project' | 'needs_data' | 'cross_project' | 'access_denied';
  message: string;
  /** True when the call carried figures the composer does not use. */
  ignoredSuppliedFigures: boolean;
  projectId?: number;
  code?: string;
}

export interface RecordSourceContext {
  organizationId?: number | null;
  userId?: number | null;
  projectId?: number | null;
  /** The open project as the client sent it: a regulatory_programs uuid under the v2 shell. */
  projectRef?: string | null;
}

/** What a composer reads and for which module, for the messages: "Module 2.5 is composed from the project's …". */
export interface RecordSourceSubject {
  module: string;
  source: string;
}

export function integerId(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
}

/** Whether the call carries any of these keys as a non-empty array: figures the model supplied. */
export function suppliedAny(input: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.some((k) => Array.isArray(input[k]) && (input[k] as unknown[]).length > 0);
}

/**
 * An answer a composer returns as it is, before any outline mode: supplied
 * figures it will not use, or a project it may not read (an outline mode may
 * read that project's artifacts).
 */
export function answersBeforeOutline(s: { ok: boolean; ignoredSuppliedFigures?: boolean; status?: string }): boolean {
  return !s.ok && (s.ignoredSuppliedFigures === true || s.status === 'access_denied' || s.status === 'cross_project');
}

/** The open project, as the CSR scope takes it; else the one the input names; else none. */
function scopeInputOf(input: Record<string, unknown>, ctx: RecordSourceContext | undefined): { open: boolean; scope: { projectId?: number; programId?: string } } | null {
  const ref = typeof ctx?.projectRef === 'string' ? ctx.projectRef.trim() : '';
  if (looksLikeProgramUuid(ref)) return { open: true, scope: { programId: ref } };
  const open = integerId(ctx?.projectId) ?? integerId(ref);
  if (open) return { open: true, scope: { projectId: open } };
  const named = integerId(input.project_id);
  return named ? { open: false, scope: { projectId: named } } : null;
}

/** A CSR-scope refusal as an answer; any other error is rethrown. */
export async function scopeRefusal(err: unknown, subject: RecordSourceSubject, ignoredSuppliedFigures: boolean): Promise<RecordSourceRefusal> {
  const { CsrScopeError } = await import('../csr/project-scope.js');
  if (!(err instanceof CsrScopeError)) throw err;
  return {
    ok: false,
    status: err.status === 403 ? 'access_denied' : 'needs_project',
    code: err.code,
    ignoredSuppliedFigures,
    message: `The project's ${subject.source} could not be read for this request: ${err.message} Nothing was composed.`,
  };
}

/** The project a composer reads, resolved as the actor; or why not. */
export async function resolveRecordSourceProject(
  input: Record<string, unknown>,
  ctx: RecordSourceContext | undefined,
  subject: RecordSourceSubject,
  ignoredSuppliedFigures: boolean,
): Promise<{ ok: true; organizationId: number; projectId: number; actorUserId?: number } | RecordSourceRefusal> {
  const organizationId = integerId(ctx?.organizationId);
  const target = scopeInputOf(input, ctx);
  if (!organizationId || !target) {
    return {
      ok: false,
      status: 'needs_project',
      ignoredSuppliedFigures,
      message:
        `Module ${subject.module} is composed from the project's ${subject.source}. ` +
        'Open the project, or name it, and draft again. Figures given in the conversation are not used.',
    };
  }
  const actorUserId = integerId(ctx?.userId) ?? undefined;
  const [{ db }, { resolveCsrScope, CsrScopeError }] = await Promise.all([import('../../db.js'), import('../csr/project-scope.js')]);
  try {
    if (!db) throw new Error('The database is not initialized.');
    const scope = await resolveCsrScope(db, organizationId, target.scope, { forWrite: false, actorUserId });
    if (!scope.projectId) throw new CsrScopeError('CSR_PROJECT_NOT_FOUND', 404, 'The project could not be resolved.');
    const named = integerId(input.project_id);
    if (target.open && named && named !== scope.projectId) {
      return {
        ok: false,
        status: 'cross_project',
        code: 'CROSS_PROJECT',
        projectId: scope.projectId,
        ignoredSuppliedFigures,
        message:
          `Module ${subject.module} is composed from the open project's own ${subject.source}. Project ${named} is not the open project, ` +
          `so its ${subject.source} are not read here: a project's Module 2 is written from its own records.`,
      };
    }
    return { ok: true, organizationId, projectId: scope.projectId, ...(actorUserId ? { actorUserId } : {}) };
  } catch (err) {
    return scopeRefusal(err, subject, ignoredSuppliedFigures);
  }
}
