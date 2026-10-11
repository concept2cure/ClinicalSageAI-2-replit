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
 */
import type { CSRSummaryInput } from '../m2-summary-builders.js';

export type Module2CsrInputs =
  | { ok: true; projectId: number; csrs: CSRSummaryInput[]; ignoredSuppliedFigures: boolean }
  | { ok: false; status: 'needs_project' | 'needs_data'; message: string; ignoredSuppliedFigures: boolean };

interface Module2Context {
  organizationId?: number | null;
  projectId?: number | null;
}

function integerId(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
}

export async function loadModule2CsrInputs(
  input: Record<string, unknown>,
  ctx: Module2Context | undefined,
  module: '2.5' | '2.7',
): Promise<Module2CsrInputs> {
  const ignoredSuppliedFigures = Array.isArray(input.csrs) && input.csrs.length > 0;
  const organizationId = integerId(ctx?.organizationId);
  const projectId = integerId(input.project_id) ?? integerId(ctx?.projectId);
  if (!organizationId || !projectId) {
    return {
      ok: false,
      status: 'needs_project',
      ignoredSuppliedFigures,
      message:
        `Module ${module} is composed from the program's completed clinical study reports. ` +
        'Open the program, or name it, and draft again. Figures given in the conversation are not used.',
    };
  }
  const { loadCsrInputsForProject } = await import('../csr/load-csr-inputs-for-project.js');
  const csrs = await loadCsrInputsForProject(organizationId, projectId);
  if (csrs.length === 0) {
    return {
      ok: false,
      status: 'needs_data',
      ignoredSuppliedFigures,
      message:
        `This program has no completed clinical study report, so there is nothing to compose Module ${module} from. ` +
        'A CSR build that still has unresolved data placeholders is not complete.',
    };
  }
  return { ok: true, projectId, csrs, ignoredSuppliedFigures };
}
