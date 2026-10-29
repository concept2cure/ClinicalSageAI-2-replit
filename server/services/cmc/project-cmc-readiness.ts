/**
 * A project's CMC readiness, read from the one place a project's CMC data
 * lives: the CMC / Module 3 register (decision P-62).
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Two readers took CMC readiness from `projects.metadata` (cmcDrugSubstance,
 * cmcDrugProduct and the rest): the task assessment (routes/c2c/tasks.ts) and
 * the project context (routes/c2c/program-twin.ts). Only
 * PUT /api/concept2cure/projects/:projectId/cmc wrote those keys, and no
 * screen called it. The CMC surface records a drug substance in the register
 * (server/api/cmc, written through into cmc_source_objects). So the assessment
 * told every project to enter drug substance data, including a device's, a
 * diagnostic's and one whose register already held a drug substance. The
 * metadata routes are retired. Both readers now read the register through its
 * one per-project reader, getModule3BuildStatus. The build board, AnA and the
 * final-export gate read that same reader.
 *
 * ── Which id ─────────────────────────────────────────────────────────────────
 * The register keys `project_id` as free TEXT (resolve-cmc-artifact-project.ts).
 * The v2 CMC surface files records under the open program's
 * `regulatory_programs` UUID (cmcProjectUuid(),
 * client/src/concept2cure/v2/surfaces/cmcShared.tsx), and its build board
 * reads under the same id. A concept2cure project names its program through
 * `projects.regulatory_program_id`, the anchor intake writes
 * (services/c2c/program-project-anchor.ts). So the register is read under that
 * UUID. A project anchored to no program is read under its own id, which is
 * what a legacy caller files under. The boundary then gives its own settled
 * answer for it, CMC_PROGRAM_NOT_RECORDED, as the board does.
 *
 * ── Three answers ────────────────────────────────────────────────────────────
 *  - `read`: the register was read. For the drug substance (§3.2.S) and the
 *    drug product (§3.2.P) it gives whether a record composes into it, and
 *    which sections the composer scores incomplete;
 *  - `outside_composition_scope`: the boundary (decision P-28,
 *    composition-scope.ts) refuses the program. That covers a device, an IVD,
 *    a biologic, a marketing or non-US application, and no program recorded.
 *    No CMC action is due, and the refusal is given by its code and in its own
 *    words;
 *  - `unreadable`: the read failed, or the boundary could not establish the
 *    application. It is never reported as complete, and never as missing.
 * Deterministic: every fact is the composer's. No model is asked.
 *
 * @module server/services/cmc/project-cmc-readiness
 */
import { getModule3BuildStatus, type Module3SectionBuildStatus } from '../module3-convergence-service';
import { compositionRefusalStatus, isCompositionOutOfScope, type CompositionRefusal } from './composition-scope';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('project-cmc-readiness');

/** The two halves of Module 3 a sponsor records first, and the register record each is composed from. */
const FAMILIES = [
  { key: 'drugSubstance', family: '3.2.S', subject: 'drug substance', heading: 'Drug Substance', sourceType: 'drug_substance' },
  { key: 'drugProduct', family: '3.2.P', subject: 'drug product', heading: 'Drug Product', sourceType: 'drug_product' },
] as const;

export interface CmcFamilyReadiness {
  family: '3.2.S' | '3.2.P';
  /** A live (not retired) drug substance, or drug product, record composes into the family. */
  recorded: boolean;
  /** The family's sections some register record composes into, and all of them. */
  sectionsWithSources: number;
  sections: number;
  /** The family's sections the composer scores incomplete, with the inputs it names. */
  incomplete: Array<{ sectionKey: string; sectionLabel: string; missingInputs: string[] }>;
}

export type ProjectCmcReadiness =
  | { state: 'read'; cmcProjectId: string; drugSubstance: CmcFamilyReadiness; drugProduct: CmcFamilyReadiness }
  | { state: 'outside_composition_scope'; cmcProjectId: string; code: CompositionRefusal['code']; reason: string }
  | { state: 'unreadable'; cmcProjectId: string; reason: string };

export const CMC_READINESS_UNREADABLE =
  'CMC / Module 3 readiness could not be read, so it is reported neither as complete nor as missing. ' +
  'Try again; if it persists, the failure is in the server log.';

/** The project as the register keys it: its program's UUID, or its own id when it anchors none. */
export function cmcRegisterProjectId(project: { id: number; regulatoryProgramId?: string | null }): string {
  const program = typeof project.regulatoryProgramId === 'string' ? project.regulatoryProgramId.trim() : '';
  return program || String(project.id);
}

function familyReadiness(
  sections: readonly Module3SectionBuildStatus[],
  family: (typeof FAMILIES)[number],
): CmcFamilyReadiness {
  const own = sections.filter((s) => s.sectionKey.startsWith(`${family.family}.`));
  return {
    family: family.family,
    recorded: own.some((s) => s.sourceTypes.includes(family.sourceType)),
    sectionsWithSources: own.filter((s) => s.sourceObjectCount > 0).length,
    sections: own.length,
    incomplete: own
      .filter((s) => s.missingInputs.length > 0)
      .map((s) => ({ sectionKey: s.sectionKey, sectionLabel: s.sectionLabel, missingInputs: [...s.missingInputs] })),
  };
}

/** The project's CMC readiness, as the register states it. Never throws. */
export async function readProjectCmcReadiness(
  organizationId: number,
  project: { id: number; regulatoryProgramId?: string | null },
): Promise<ProjectCmcReadiness> {
  const cmcProjectId = cmcRegisterProjectId(project);
  try {
    const { sections } = await getModule3BuildStatus(organizationId, cmcProjectId);
    return {
      state: 'read',
      cmcProjectId,
      drugSubstance: familyReadiness(sections, FAMILIES[0]),
      drugProduct: familyReadiness(sections, FAMILIES[1]),
    };
  } catch (err) {
    /* A refusal answered 503 (the application could not be read) is a failed
       read, not a verdict about the program. */
    if (isCompositionOutOfScope(err) && compositionRefusalStatus(err.refusal) !== 503) {
      return { state: 'outside_composition_scope', cmcProjectId, code: err.refusal.code, reason: err.refusal.message };
    }
    logger.warn('CMC readiness could not be read from the register', {
      organizationId,
      projectId: project.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { state: 'unreadable', cmcProjectId, reason: CMC_READINESS_UNREADABLE };
  }
}

/** The CMC next actions readiness calls for: one per half no record composes into, and none otherwise. */
export function cmcNextActions(readiness: ProjectCmcReadiness): Array<{ action: string; priority: string; reason: string }> {
  if (readiness.state !== 'read') return [];
  return FAMILIES.filter((f) => !readiness[f.key].recorded).map((f) => ({
    action: `Record the ${f.subject} in the CMC / Module 3 register`,
    priority: 'medium',
    reason: `No ${f.subject} record in this project's CMC / Module 3 register composes into §${f.family} (${f.heading}).`,
  }));
}
