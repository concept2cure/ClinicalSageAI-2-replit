/**
 * @fileoverview Tenant-scoped wrapper: ctd_nonclinical_studies → orchestrator NonclinicalStudy[].
 * @module server/services/preclinical/load-nonclinical-studies-for-project
 *
 * Path-to-GA Turn 1, Step 2 (post-Move-6). The submission-package-orchestrator
 * consumes Module 2.4 inputs as `NonclinicalStudy[]` (the
 * `m2-summary-builders` shape). The DB layer already returns the tenant-scoped
 * rows via `loadNonclinicalProgram`, but they come back in the loader-internal
 * `NonclinicalStudyInput` shape. The mapper that converts to the builder shape
 * (`toBuilderStudy`) was module-private until Path-to-GA Turn 1 promoted it.
 *
 * This wrapper composes the two: org-scoped read + per-row mapping. Returning
 * `NonclinicalStudy[]` ready to splice into `OrchestratorInputs.nonclinicalStudies`.
 *
 * Tenant-scope is inherited from `loadNonclinicalProgram` (which joins
 * `ctd_programs.organization_id` and returns `undefined` for cross-org
 * `ctdProgramId`). Org positivity is asserted at entry; we throw before any
 * DB I/O.
 */

import { loadNonclinicalProgram } from './nonclinical-program-loader';
import { toBuilderStudy } from './nonclinical-m24-adapter';
import type { NonclinicalStudy } from '../m2-summary-builders';

/**
 * Read all nonclinical studies for a (organization, ctdProgram) pair and
 * return them in the shape consumed by the orchestrator's `m2.4.nonclinical`
 * step.
 *
 * @param orgId         Positive integer organization id.
 * @param ctdProgramId  Positive integer ctd_programs.id matching
 *                      `ctd_nonclinical_studies.ctd_program_id`.
 * @returns NonclinicalStudy[] — empty when the program has no studies OR is
 *          not visible to the org (loader returns undefined → []).
 * @throws Error when orgId or ctdProgramId is missing or non-positive.
 */
export async function loadNonclinicalStudiesForProject(
  orgId: number,
  ctdProgramId: number,
): Promise<NonclinicalStudy[]> {
  if (!Number.isInteger(orgId) || orgId <= 0) {
    throw new Error(
      `[loadNonclinicalStudiesForProject] organizationId must be a positive integer; got ${String(orgId)}`,
    );
  }
  if (!Number.isInteger(ctdProgramId) || ctdProgramId <= 0) {
    throw new Error(
      `[loadNonclinicalStudiesForProject] ctdProgramId must be a positive integer; got ${String(ctdProgramId)}`,
    );
  }

  const program = await loadNonclinicalProgram(ctdProgramId, orgId);
  if (!program) return [];

  return program.studies.map((input, index) => toBuilderStudy(input, index));
}
