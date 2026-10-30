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
 * while one is open is refused (P-14), and a refusal is answered as one. That
 * boundary is record-source-project.ts, shared with the 2.4/2.6 composers.
 */
import type { CSRSummaryInput } from '../m2-summary-builders.js';
import { resolveRecordSourceProject, scopeRefusal, suppliedAny, type RecordSourceContext, type RecordSourceRefusal } from './record-source-project.js';

export { answersBeforeOutline } from './record-source-project.js';

export type Module2CsrInputs =
  | { ok: true; projectId: number; csrs: CSRSummaryInput[]; ignoredSuppliedFigures: boolean }
  | RecordSourceRefusal;

export async function loadModule2CsrInputs(
  input: Record<string, unknown>,
  ctx: RecordSourceContext | undefined,
  module: '2.5' | '2.7',
): Promise<Module2CsrInputs> {
  const ignoredSuppliedFigures = suppliedAny(input, ['csrs']);
  const subject = { module, source: 'completed clinical study reports' };
  const project = await resolveRecordSourceProject(input, ctx, subject, ignoredSuppliedFigures);
  if (!project.ok) return project;
  const { loadCsrInputsForProject } = await import('../csr/load-csr-inputs-for-project.js');
  let csrs: CSRSummaryInput[];
  try {
    csrs = await loadCsrInputsForProject(project.organizationId, project.projectId, { actorUserId: project.actorUserId });
  } catch (err) {
    return scopeRefusal(err, subject, ignoredSuppliedFigures);
  }
  if (csrs.length === 0) {
    return {
      ok: false,
      status: 'needs_data',
      projectId: project.projectId,
      ignoredSuppliedFigures,
      message:
        `This project has no completed clinical study report, so there is nothing to compose Module ${module} from. ` +
        'A CSR build that still has unresolved data placeholders is not complete.',
    };
  }
  return { ok: true, projectId: project.projectId, csrs, ignoredSuppliedFigures };
}
