/**
 * Where AnA's Module 2 tools get their clinical figures (CLAUDE.md Rule 2).
 *
 * draft_clinical_summary_m2_7 and draft_clinical_overview_m2_5 compose Module
 * 2.7 / 2.5 with the deterministic builders in m2-summary-builders.ts. Until
 * 2026-10-05 they composed from a `csrs` array in the tool input — which the
 * model writes — so every primary result, N, SAE count and adverse-event rate
 * in the draft was a figure the model supplied. The builders were
 * deterministic; their inputs were not.
 *
 * Now the figures come from the program's completed CSR build jobs, read by
 * the loader the submission orchestrator uses (csr/load-csr-inputs-for-
 * project.ts). Figures in the tool input are not used, and the answer says so.
 *
 * Read as the person asking, in the open project (3b Slice 1, 2026-10-26). The
 * loader's CSR scope refuses a read it cannot attribute, and this module passed
 * no actor, so every real project threw 403; it also read only the integer
 * `ctx.projectId`, which the v2 shell leaves null (the open project arrives as
 * a regulatory_programs uuid in `ctx.projectRef`). Now the open project is
 * resolved through the CSR scope (resolveCsrScope) with the actor, a project
 * named in the input is read only when none is open, another project named
 * while one is open is refused (P-14), and a refusal is answered as one.
 */
import type { CSRSummaryInput } from '../m2-summary-builders.js';
import { looksLikeProgramUuid } from '../../lib/project-id.js';

export type Module2CsrInputs =
  | { ok: true; projectId: number; csrs: CSRSummaryInput[]; ignoredSuppliedFigures: boolean }
  | {
      ok: false;
      status: 'needs_project' | 'needs_data' | 'cross_project' | 'access_denied';
      message: string;
      ignoredSuppliedFigures: boolean;
      projectId?: number;
      code?: string;
    };

interface Module2Context {
  organizationId?: number | null;
  userId?: number | null;
  projectId?: number | null;
  /** The open project as the client sent it: a regulatory_programs uuid under the v2 shell. */
  projectRef?: string | null;
}

function integerId(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
}

/** The open project, as the CSR scope takes it; else the one the input names; else none. */
function scopeInputOf(input: Record<string, unknown>, ctx: Module2Context | undefined): { open: boolean; scope: { projectId?: number; programId?: string } } | null {
  const ref = typeof ctx?.projectRef === 'string' ? ctx.projectRef.trim() : '';
  if (looksLikeProgramUuid(ref)) return { open: true, scope: { programId: ref } };
  const open = integerId(ctx?.projectId) ?? integerId(ref);
  if (open) return { open: true, scope: { projectId: open } };
  const named = integerId(input.project_id);
  return named ? { open: false, scope: { projectId: named } } : null;
}

type Refusal = Extract<Module2CsrInputs, { ok: false }>;

/**
 * An answer the 2.5 tool returns as it is, before its outline mode: supplied
 * figures it will not use, or a project it may not read (the outline would read
 * that project's artifacts).
 */
export function answersBeforeOutline(s: Module2CsrInputs): boolean {
  return !s.ok && (s.ignoredSuppliedFigures || s.status === 'access_denied' || s.status === 'cross_project');
}

/** The open (or named) project's completed CSRs, read as the actor through the CSR scope; or why not. */
async function readScopedCsrs(
  organizationId: number,
  target: NonNullable<ReturnType<typeof scopeInputOf>>,
  named: number | null,
  actorUserId: number | undefined,
  module: '2.5' | '2.7',
): Promise<{ projectId: number; csrs: CSRSummaryInput[] } | Omit<Refusal, 'ignoredSuppliedFigures'>> {
  const [{ db }, { resolveCsrScope, CsrScopeError }, { loadCsrInputsForProject }] = await Promise.all([
    import('../../db.js'),
    import('../csr/project-scope.js'),
    import('../csr/load-csr-inputs-for-project.js'),
  ]);
  try {
    if (!db) throw new Error('The database is not initialized.');
    const scope = await resolveCsrScope(db, organizationId, target.scope, { forWrite: false, actorUserId });
    if (!scope.projectId) throw new CsrScopeError('CSR_PROJECT_NOT_FOUND', 404, 'The project could not be resolved.');
    if (target.open && named && named !== scope.projectId) {
      return {
        ok: false,
        status: 'cross_project',
        code: 'CROSS_PROJECT',
        projectId: scope.projectId,
        message:
          `Module ${module} is composed from the open project's own clinical study reports. Project ${named} is not the open project, ` +
          "so its reports are not read here: a project's Module 2 is written from its own records.",
      };
    }
    return { projectId: scope.projectId, csrs: await loadCsrInputsForProject(organizationId, scope.projectId, { actorUserId }) };
  } catch (err) {
    if (!(err instanceof CsrScopeError)) throw err;
    return {
      ok: false,
      status: err.status === 403 ? 'access_denied' : 'needs_project',
      code: err.code,
      message: `The project's clinical study reports could not be read for this request: ${err.message} Nothing was composed.`,
    };
  }
}

export async function loadModule2CsrInputs(
  input: Record<string, unknown>,
  ctx: Module2Context | undefined,
  module: '2.5' | '2.7',
): Promise<Module2CsrInputs> {
  const ignoredSuppliedFigures = Array.isArray(input.csrs) && input.csrs.length > 0;
  const organizationId = integerId(ctx?.organizationId);
  const target = scopeInputOf(input, ctx);
  if (!organizationId || !target) {
    return {
      ok: false,
      status: 'needs_project',
      ignoredSuppliedFigures,
      message:
        `Module ${module} is composed from the project's completed clinical study reports. ` +
        'Open the project, or name it, and draft again. Figures given in the conversation are not used.',
    };
  }
  const read = await readScopedCsrs(organizationId, target, integerId(input.project_id), integerId(ctx?.userId) ?? undefined, module);
  if ('ok' in read) return { ...read, ignoredSuppliedFigures };
  if (read.csrs.length === 0) {
    return {
      ok: false,
      status: 'needs_data',
      projectId: read.projectId,
      ignoredSuppliedFigures,
      message:
        `This project has no completed clinical study report, so there is nothing to compose Module ${module} from. ` +
        'A CSR build that still has unresolved data placeholders is not complete.',
    };
  }
  return { ok: true, projectId: read.projectId, csrs: read.csrs, ignoredSuppliedFigures };
}
