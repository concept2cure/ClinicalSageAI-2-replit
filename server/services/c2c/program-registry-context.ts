/**
 * The registry context a program's project record carries — what the readiness
 * engine needs to know which filing it is judging.
 *
 * ── The defect (QA 2026-10-08, second walk, j8) ──────────────────────────────
 * The Executive Readiness Digest (services/report-os/orchestrator.ts) evaluates
 * a project's submission readiness against ONE registry entry, read from
 * `projects.metadata.registryId`, or `.submissionType` resolved through the
 * submission-type bridge. Nothing wrote either. Intake put the wizard's choice
 * on the PROGRAM (`regulatory_programs.metadata.submissionTypeId`) and wrote
 * the project record (`ensureProgramProjectAnchor`) with no metadata at all, so
 * every program in every organisation — one created that morning with
 * `submissionTypeId: 'us_ind'` included — read "the project records no registry
 * context" and readiness was never computed.
 *
 * ── Where the context comes from, in order ───────────────────────────────────
 *   1. The registry entry the person chose in the New Project wizard
 *      (`submissionTypeId`, e.g. 'us_ind'). Recorded as `submissionType`
 *      verbatim, and as `registryId` when the bridge resolves it.
 *   2. With no choice recorded (a program a seed or an older intake wrote), a
 *      filing type whose registry entry its agency fixes: an IND filed with the
 *      FDA is US_IND, an MAA with the EMA is EU_MAA. Only the pairs in
 *      PROGRAM_TYPE_REGISTRY. A filing type the bridge would misread is not
 *      listed — 'mdr' resolves to US_MDR_REPORT (a device adverse-event report),
 *      not to an EU MDR technical file — and neither is an IND filed with
 *      another agency ('kr_ind' is the registry's Korean IND).
 *   3. Otherwise none, and the digest goes on saying readiness was not computed
 *      and why. Nothing here picks an entry for a program that does not name one.
 *
 * The migration that gives existing project records the same context
 * (migrations/20261008c_projects_registry_context.sql) restates rule 2 in SQL.
 * Its test runs that SQL over every PROGRAM_TYPE_REGISTRY pair and compares the
 * result with this function, so the two cannot drift.
 *
 * @module server/services/c2c/program-registry-context
 */

import { resolveRegistryId } from '../regulatory/registry/legacySubmissionTypeMapper.js';

/** Filing types whose registry entry the program's agency fixes. */
export const PROGRAM_TYPE_REGISTRY: Readonly<Record<string, { agency: string; registryId: string }>> = {
  ind: { agency: 'FDA', registryId: 'US_IND' },
  nda: { agency: 'FDA', registryId: 'US_NDA' },
  bla: { agency: 'FDA', registryId: 'US_BLA' },
  anda: { agency: 'FDA', registryId: 'US_ANDA' },
  dmf: { agency: 'FDA', registryId: 'US_DMF' },
  '510k': { agency: 'FDA', registryId: 'US_510K' },
  de_novo: { agency: 'FDA', registryId: 'US_DE_NOVO' },
  pma: { agency: 'FDA', registryId: 'US_PMA' },
  ide: { agency: 'FDA', registryId: 'US_IDE' },
  hde: { agency: 'FDA', registryId: 'US_HDE' },
  maa: { agency: 'EMA', registryId: 'EU_MAA' },
  cta: { agency: 'EMA', registryId: 'EU_CTA' },
  jnda: { agency: 'PMDA', registryId: 'JP_MKT_APPROVAL' },
};

/** What `projects.metadata` records for the readiness engine. */
export type ProgramRegistryContext = {
  /** The canonical registry id, when one resolves. */
  registryId?: string;
  /** The submission type as chosen (or as rule 2 names it). */
  submissionType: string;
};

/** The registry context for a program's facts, or null when they name none. */
export function registryContextForProgram(program: {
  submissionTypeId?: string | null;
  programType: string | null | undefined;
  primaryAgency: string | null | undefined;
}): ProgramRegistryContext | null {
  const chosen = (program.submissionTypeId ?? '').trim();
  if (chosen) {
    const registryId = resolveRegistryId(chosen);
    return registryId ? { registryId, submissionType: chosen } : { submissionType: chosen };
  }
  const type = String(program.programType ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const fixed = Object.prototype.hasOwnProperty.call(PROGRAM_TYPE_REGISTRY, type)
    ? PROGRAM_TYPE_REGISTRY[type]
    : undefined;
  const agency = String(program.primaryAgency ?? '').trim().toUpperCase();
  if (fixed && agency === fixed.agency) {
    return { registryId: fixed.registryId, submissionType: fixed.registryId };
  }
  return null;
}
