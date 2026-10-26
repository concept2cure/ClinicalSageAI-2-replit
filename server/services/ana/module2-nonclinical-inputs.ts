/**
 * Where AnA's Module 2.4 and 2.6 drafts get their nonclinical studies
 * (CLAUDE.md Rule 2; Rule 2 audit S2, 2026-10-26).
 *
 * draft_nonclinical_overview_m2_4 and draft_nonclinical_summaries_m2_6 composed
 * from a studies[] and findings[] array in the tool input, which the model
 * writes: every NOAEL, species, duration, GLP status and adversity class in the
 * draft was a figure the model supplied. This is the shape 2.5/2.7 had before
 * 2026-10-05 (module2-csr-inputs.ts).
 *
 * No record links nonclinical studies to a project yet. Which store will is a
 * founder decision (R-1: the governed `nonclinical_studies` register, or the CTD
 * program's `ctd_nonclinical_studies`). Until then this resolves the open
 * project, as the person asking, and answers that no studies are recorded
 * against it; figures supplied in the call are not used, and the answer says so.
 * Only the needs_data branch changes when a store is chosen.
 *
 * @module server/services/ana/module2-nonclinical-inputs
 */
import { answersBeforeOutline, resolveRecordSourceProject, suppliedAny, type RecordSourceContext, type RecordSourceRefusal } from './record-source-project.js';
import { nonclinicalOutline } from './ctd-component-outline.js';

/** The tool-input keys that carried model-written study figures. */
export const MODEL_SUPPLIED_NONCLINICAL_KEYS = ['studies', 'findings'] as const;

export async function loadModule2NonclinicalInputs(
  input: Record<string, unknown>,
  ctx: RecordSourceContext | undefined,
  module: '2.4' | '2.6',
): Promise<RecordSourceRefusal> {
  const ignoredSuppliedFigures = suppliedAny(input, MODEL_SUPPLIED_NONCLINICAL_KEYS);
  const project = await resolveRecordSourceProject(input, ctx, { module, source: 'recorded nonclinical studies' }, ignoredSuppliedFigures);
  if (!project.ok) return project;
  return {
    ok: false,
    status: 'needs_data',
    projectId: project.projectId,
    ignoredSuppliedFigures,
    message:
      `This platform does not yet record nonclinical studies against a project, so Module ${module} cannot be composed from records. ` +
      'Studies, NOAELs and findings given in the conversation are not used.',
  };
}

/**
 * The 2.4 / 2.6 tool answer. Figures supplied in the call, or a project the
 * person may not read, are answered as they are; otherwise the record's outline
 * for the module, with why it was not composed.
 */
export async function draftNonclinicalFromRecords(input: Record<string, unknown>, ctx: RecordSourceContext | undefined, module: '2.4' | '2.6'): Promise<string> {
  try {
    const sourced = await loadModule2NonclinicalInputs(input, ctx, module);
    if (answersBeforeOutline(sourced)) return JSON.stringify(sourced);
    const title = module === '2.4' ? 'Nonclinical Overview (Module 2.4)' : 'Nonclinical Written and Tabulated Summaries (Module 2.6)';
    return JSON.stringify({
      structure: { title, ich_reference: 'ICH M4S(R2)', ...(await nonclinicalOutline(module)) },
      nonclinical_data: { status: sourced.status, message: sourced.message, ...(sourced.projectId ? { projectId: sourced.projectId } : {}) },
      next_step:
        `No nonclinical study is recorded against this project, so Module ${module} is not composed and no study, dose, NOAEL or finding is stated. ` +
        'Use this outline to draft each section in the governed authoring flow from the versioned study reports the author cites; state a section with no data as such rather than filling it.',
    });
  } catch (err) {
    return JSON.stringify({ error: `Module ${module} drafting failed: ${err instanceof Error ? err.message : 'unknown error'}` });
  }
}
