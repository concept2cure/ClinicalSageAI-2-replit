/**
 * @fileoverview Tenant-scoped reader: completed CSR jobs → orchestrator CSRSummaryInput[].
 * @module server/services/csr/load-csr-inputs-for-project
 *
 * Path-to-GA Turn 1, Step 2 (post-Move-6). The submission-package-orchestrator
 * consumes Module 2.5 / 2.7 clinical inputs as `CSRSummaryInput[]` (see
 * `OrchestratorInputs.csrInputs` and `m2-summary-builders.CSRSummaryInput`).
 * Write-through is wired (`csr-job-runner` persists every drafted ICH-E3
 * section into `csr_section_outputs` keyed to a `csr_build_jobs` row), but
 * there is no READER that returns the orchestrator-shaped inputs from
 * (orgId, projectId). Without this reader the orchestrator's CSR path is
 * unreachable from any UI: it requires hand-built server-internal payloads.
 *
 * This module closes that gap. For each completed CSR build job belonging
 * to the (org, project) pair, it produces one `CSRSummaryInput` row by:
 *   (1) reading the persisted `studyInfoSnapshot` JSON (the original
 *       CSRBuildRequest.studyInfo) for the deterministic header fields
 *       (protocolNumber, phase, studyDesign, primaryEndpoint, sampleSize), and
 *   (2) loading the per-section content from `csr_section_outputs` so M2.5
 *       / 2.7 builders can carry the generated ICH-E3 narratives forward.
 *
 * Design notes:
 *   - Uses Drizzle ORM (no raw SQL). Tables defined in `shared/schema.ts`
 *     as `csrBuildJobs` and `csrSectionOutputs`.
 *   - Tenant-scope is non-negotiable: every read filters on
 *     `organization_id` AND `project_id`. Org positivity asserted at
 *     entry; we throw before any DB I/O.
 *   - Studies without a completed CSR job are intentionally absent from
 *     the result (Phase 1 IND has no CSR yet). Returning an empty array
 *     is the correct steady-state for the IND path; the orchestrator's
 *     `m2.5` and `m2.7` steps already short-circuit when `csrInputs` is
 *     empty.
 *   - We only surface jobs in the `complete` status. Failed / cancelled /
 *     in-progress jobs are excluded so the orchestrator never composes a
 *     summary over half-built sections.
 *   - `studyId` on the returned CSRSummaryInput is `csr_build_jobs.studyId`
 *     (a free-text study identifier, not a numeric row id) so the M2.5 /
 *     2.7 input cross-references the same study identifier ANA uses.
 */

import { and, asc, eq } from 'drizzle-orm';

import { db } from '../../db';
import {
  csrBuildJobs,
  csrSectionOutputs,
  type CsrSectionOutput,
} from '@shared/schema';
import type { CSRSummaryInput } from '../m2-summary-builders';
import type { CSRSection } from '../csr-builder';

/**
 * Shape of the `studyInfoSnapshot` JSONB column on `csr_build_jobs`. Mirrors
 * the snapshot envelope written by csr-job-runner.enqueueCSRBuildJob — we do
 * NOT re-import the private type because csr-job-runner declares it locally.
 */
interface StudyInfoSnapshot {
  studyInfo?: {
    title?: string;
    protocolNumber?: string;
    phase?: string;
    indication?: string;
    sponsor?: string;
    investigationalProduct?: string;
    comparator?: string;
    studyDesign?: string;
    primaryEndpoint?: string;
    secondaryEndpoints?: string[];
    sampleSize?: number;
    treatmentDuration?: string;
    targetAgencies?: string[];
  };
  deepResearchJobId?: number;
}

/**
 * Pull a stable header object from the raw snapshot — defaults supplied so
 * we always have non-undefined strings for the M2.5 / 2.7 narrative.
 */
function readStudyInfo(raw: unknown): Required<Pick<NonNullable<StudyInfoSnapshot['studyInfo']>,
  'protocolNumber' | 'phase' | 'studyDesign' | 'primaryEndpoint'
>> & { sampleSize?: number } {
  const snap = (raw && typeof raw === 'object' ? raw : {}) as StudyInfoSnapshot;
  const info = snap.studyInfo ?? {};
  return {
    protocolNumber: info.protocolNumber ?? '',
    phase: info.phase ?? '',
    studyDesign: info.studyDesign ?? '',
    primaryEndpoint: info.primaryEndpoint ?? '',
    sampleSize: typeof info.sampleSize === 'number' ? info.sampleSize : undefined,
  };
}

/**
 * Section number → CSRSection skeleton (no childSections; the orchestrator
 * builders don't recurse). We materialize one CSRSection per persisted
 * `csr_section_outputs` row so downstream summarizers can quote the actual
 * drafted content.
 */
function rowToCSRSection(row: CsrSectionOutput): CSRSection {
  return {
    number: row.sectionNumber,
    title: '', // Title is intentionally not denormalized in csr_section_outputs; downstream uses sectionNumber.
    required: true,
    description: '',
    content: row.content,
    status: 'drafted',
  };
}

/**
 * Read all completed CSR jobs for a (organization, project) pair and return
 * them in the shape consumed by the orchestrator's `m2.5` and `m2.7` steps.
 *
 * @param orgId      Positive integer organization id.
 * @param projectId  Concept2cure numeric `projects.id` matching
 *                   `csr_build_jobs.project_id`.
 * @returns CSRSummaryInput[] — empty when no completed CSR job exists.
 * @throws Error when orgId is missing or non-positive.
 */
export async function loadCsrInputsForProject(
  orgId: number,
  projectId: number,
): Promise<CSRSummaryInput[]> {
  // ── Tenant-scope precondition (non-negotiable) ──────────────────────────
  if (!Number.isInteger(orgId) || orgId <= 0) {
    throw new Error(
      `[loadCsrInputsForProject] organizationId must be a positive integer; got ${String(orgId)}`,
    );
  }
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new Error(
      `[loadCsrInputsForProject] projectId must be a positive integer; got ${String(projectId)}`,
    );
  }
  if (!db) {
    throw new Error('[loadCsrInputsForProject] Drizzle db is not initialized');
  }

  // ── Step 1: find all completed CSR jobs in scope ────────────────────────
  // We do not join here — section reads are issued per-job below so we can
  // group sections cleanly without a multi-row cross-product per job.
  const jobs = await db
    .select({
      id: csrBuildJobs.id,
      studyId: csrBuildJobs.studyId,
      studyInfoSnapshot: csrBuildJobs.studyInfoSnapshot,
    })
    .from(csrBuildJobs)
    .where(
      and(
        eq(csrBuildJobs.organizationId, orgId),
        eq(csrBuildJobs.projectId, projectId),
        eq(csrBuildJobs.status, 'complete'),
      ),
    );

  if (jobs.length === 0) {
    // Phase 1 IND or no CSR yet — perfectly valid; orchestrator skips m2.5/m2.7.
    return [];
  }

  // ── Step 2: load per-job sections (tenant-scoped at the row level too) ──
  const inputs: CSRSummaryInput[] = [];
  for (const job of jobs) {
    const sectionRows = await db
      .select()
      .from(csrSectionOutputs)
      .where(
        and(
          eq(csrSectionOutputs.organizationId, orgId),
          eq(csrSectionOutputs.projectId, projectId),
          eq(csrSectionOutputs.jobId, job.id),
        ),
      )
      .orderBy(asc(csrSectionOutputs.sectionNumber));

    const sections = sectionRows.map(rowToCSRSection);
    const info = readStudyInfo(job.studyInfoSnapshot);

    // M2.5 / 2.7 narratives quote primaryResult; when the §11.4 section
    // ("Efficacy Results and Tabulations") has been drafted, surface its
    // content so the summary is grounded. Otherwise emit a stable
    // see-also pointer rather than fabricating a result.
    const efficacy = sectionRows.find(s => s.sectionNumber === '11.4');
    const primaryResult = efficacy?.content?.trim()
      ? efficacy.content
      : 'See §11.4 (Efficacy Results) of the CSR for tabulated results.';

    inputs.push({
      studyId: job.studyId,
      protocolNumber: info.protocolNumber,
      phase: info.phase,
      studyDesign: info.studyDesign,
      primaryEndpoint: info.primaryEndpoint,
      primaryResult,
      // Unknown stays unknown: `?? 0` printed "n=0" into the Clinical Overview
      // for a study whose size was simply never recorded.
      sampleSize: info.sampleSize ?? null,
      csrSections: sections,
    });
  }

  return inputs;
}
