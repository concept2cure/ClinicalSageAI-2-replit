/**
 * The composition boundary for stability studies (decision P-28:
 * small-molecule Module 3 for a US IND): each study is judged on the program
 * it is filed under, and a study filed under none is not established.
 *
 * One decision for every caller that states an ICH Q1E figure for a recorded
 * study: the stability routes (api/cmc/routes.ts) and AnA's
 * estimate_recorded_shelf_life and assess_recorded_batch_poolability. A
 * separate module from module3-compile.ts so the program decision it asks is
 * the module's export, which a caller's test can stand in for.
 */
import { studyFiledUnderNoProgram, type CompositionRefusal } from './composition-scope';
import { assessProgramCompositionScope } from './module3-compile';

export async function studiesCompositionRefusal(
  organizationId: number,
  studies: ReadonlyArray<{ id: number; projectId: string | null }>,
): Promise<CompositionRefusal | null> {
  const unfiled = studies.filter((s) => !s.projectId).map((s) => s.id);
  if (unfiled.length) return studyFiledUnderNoProgram(unfiled);
  for (const projectId of new Set(studies.map((s) => s.projectId as string))) {
    const refusal = await assessProgramCompositionScope(organizationId, projectId);
    if (refusal) return refusal;
  }
  return null;
}
