/**
 * @fileoverview Async CSR Build Job Runner
 * @module server/services/csr/csr-job-runner
 *
 * Wraps the synchronous in-process csr-builder.generateCSRSections loop with
 * persistent job state so a long ICH-E3 build can run out-of-band, be
 * resumed after a section-level failure, and surface progress to the caller
 * without blocking an HTTP request.
 *
 * Phase 3b: NO new routes, NO UI. This module is consumed by
 * csr-builder.launchCSRBuildAsync (back-compat alongside the legacy
 * synchronous launchCSRBuild).
 *
 * State machine for csr_build_jobs.status:
 *   queued -> drafting -> complete
 *                      \-> failed (resumable: re-run leaves prior sections intact)
 *
 * Tenant scoping rules:
 *   - Every read query MUST filter by organizationId.
 *   - The single exception is runCSRBuildJob(jobId), which is invoked by the
 *     background worker and uses jobId as the only key. Status/section reads
 *     remain org-scoped because they are caller-facing.
 */

import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { db } from '../../db';
import {
  csrBuildJobs,
  csrSectionOutputs,
  type CsrSectionOutput,
} from '@shared/schema';
import {
  ICH_E3_STRUCTURE,
  draftCSRSectionWithProvenance,
  flattenICHE3Sections,
  hasUnresolvedPlaceholders,
  type CSRBuildRequest,
  type CSRSection,
} from '../csr-builder';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CSRBuildJobContext {
  organizationId: number;
  projectId?: number;
  requestedBy?: number;
}

export interface EnqueueResult {
  jobId: number;
  status: 'queued';
}

export interface CSRBuildJobStatus {
  status: string;
  progress: number;
  sectionsComplete: number;
  error: unknown;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/** SHA-256 lowercase hex (Node default casing). */
function sha256Hex(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function requireDb(): NonNullable<typeof db> {
  if (!db) {
    throw new Error('[csr-job-runner] Drizzle db is not initialized');
  }
  return db;
}

/**
 * Snapshot envelope stored on csr_build_jobs.study_info_snapshot. We persist
 * studyInfo plus deepResearchJobId so a resumed run can fully rebuild the
 * original CSRBuildRequest (including the citation source).
 */
interface CSRStudyInfoSnapshot {
  studyInfo: CSRBuildRequest['studyInfo'];
  deepResearchJobId?: number;
}

function readStudyInfoSnapshot(
  raw: unknown
): { studyInfo: CSRBuildRequest['studyInfo']; deepResearchJobId?: number } {
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    // New shape: { studyInfo, deepResearchJobId }
    if (obj.studyInfo && typeof obj.studyInfo === 'object') {
      return {
        studyInfo: obj.studyInfo as CSRBuildRequest['studyInfo'],
        deepResearchJobId:
          typeof obj.deepResearchJobId === 'number'
            ? obj.deepResearchJobId
            : undefined,
      };
    }
    // Back-compat: legacy rows stored the raw studyInfo directly
    return {
      studyInfo: raw as CSRBuildRequest['studyInfo'],
      deepResearchJobId: undefined,
    };
  }
  return {
    studyInfo: {} as CSRBuildRequest['studyInfo'],
    deepResearchJobId: undefined,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Enqueue a CSR build job for async execution. Returns immediately with the
 * jobId; the caller is responsible for kicking off runCSRBuildJob (see
 * launchCSRBuildAsync in csr-builder.ts for the standard setImmediate wiring).
 */
export async function enqueueCSRBuildJob(
  req: CSRBuildRequest,
  ctx: CSRBuildJobContext
): Promise<EnqueueResult> {
  const d = requireDb();

  // Preserve the caller's intent: NULL == "full build", a non-empty array
  // == "draft only these sections". We deliberately do NOT expand to
  // defaultSectionNumbers() here — that expansion happens at run time inside
  // the runner for progress accounting only. Expanding at enqueue would make
  // a full build indistinguishable from a partial-build-of-all-sections,
  // which used to silently disable AI in generateCSRSections.
  const sectionsToGenerate =
    req.sectionsToGenerate && req.sectionsToGenerate.length > 0
      ? req.sectionsToGenerate
      : null;

  const snapshot: CSRStudyInfoSnapshot = {
    studyInfo: req.studyInfo,
    deepResearchJobId: req.deepResearchJobId,
  };

  const [row] = await d
    .insert(csrBuildJobs)
    .values({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId ?? null,
      // studyId is non-null in the schema; protocolNumber is the natural key
      // we have in CSRBuildRequest. Fall back to a stable synthetic id if it
      // is missing so the insert never throws on the not-null constraint.
      studyId: req.studyInfo?.protocolNumber || `study-${Date.now()}`,
      status: 'queued',
      progress: 0,
      sectionsToGenerate,
      studyInfoSnapshot: snapshot as unknown as Record<string, unknown>,
      requestedBy: ctx.requestedBy ?? null,
    })
    .returning({ id: csrBuildJobs.id });

  if (!row?.id) {
    throw new Error('[csr-job-runner] Failed to insert csr_build_jobs row');
  }

  return { jobId: row.id, status: 'queued' };
}

/**
 * Execute a previously-enqueued CSR build job.
 *
 * Loaded by jobId only (no org scope) because this is the worker entry point
 * — the org scope was enforced at enqueue time and is persisted on the row.
 * Validates state, transitions queued|failed -> drafting, generates each
 * section via the existing csr-builder pipeline, persists each section with
 * a SHA-256 content hash, and finishes with complete or failed.
 *
 * Partial-failure policy (v1): any section failure marks the whole job
 * failed; sections persisted before the failure remain on disk so a future
 * resume run can skip them. The runner does not retry inside this call.
 */
export async function runCSRBuildJob(jobId: number): Promise<void> {
  const d = requireDb();

  // 1. Load job (no org scope — worker entry point)
  const [job] = await d
    .select()
    .from(csrBuildJobs)
    .where(eq(csrBuildJobs.id, jobId))
    .limit(1);

  if (!job) {
    throw new Error(`[csr-job-runner] Job ${jobId} not found`);
  }

  // 2. Validate state — only queued or failed (resume) are runnable
  if (job.status !== 'queued' && job.status !== 'failed') {
    console.warn(
      `[csr-job-runner] Job ${jobId} is in state '${job.status}', not runnable; skipping`
    );
    return;
  }

  // 3. Transition queued|failed -> drafting
  await d
    .update(csrBuildJobs)
    .set({
      status: 'drafting',
      startedAt: new Date(),
      updatedAt: new Date(),
      error: null,
    })
    .where(eq(csrBuildJobs.id, jobId));

  // 4. Rebuild the CSRBuildRequest from the persisted snapshot
  const { studyInfo, deepResearchJobId } = readStudyInfoSnapshot(
    job.studyInfoSnapshot
  );
  const persistedSubset = job.sectionsToGenerate ?? null;
  const subsetFilter =
    persistedSubset && persistedSubset.length > 0
      ? new Set(persistedSubset)
      : null;
  const request: CSRBuildRequest = {
    organizationId: job.organizationId,
    userId: job.requestedBy ?? 0,
    projectId: job.projectId ?? undefined,
    studyInfo,
    deepResearchJobId,
    sectionsToGenerate:
      persistedSubset && persistedSubset.length > 0
        ? persistedSubset
        : undefined,
  };
  const aiCtx = {
    organizationId: job.organizationId,
    projectId: job.projectId ?? undefined,
    userId: job.requestedBy ?? undefined,
  };

  // 5. Build the work list: flatten the ICH-E3 tree, apply subset filter,
  // then subtract sections that were already persisted on a previous attempt
  // (resume support — avoids re-billing the AI for sections already drafted).
  const fresh = JSON.parse(JSON.stringify(ICH_E3_STRUCTURE)) as CSRSection[];
  const allTargets = flattenICHE3Sections(fresh).filter(s =>
    subsetFilter ? subsetFilter.has(s.number) : true
  );

  const alreadyPersisted = await d
    .select({ sectionNumber: csrSectionOutputs.sectionNumber })
    .from(csrSectionOutputs)
    .where(eq(csrSectionOutputs.jobId, job.id));
  const persistedSet = new Set(alreadyPersisted.map(r => r.sectionNumber));

  const totalSections = allTargets.length;
  let sectionsCompleted = persistedSet.size;
  const currentSection = { number: '' as string };

  // Seed initial progress so a resumed run reports the right number
  if (totalSections > 0 && sectionsCompleted > 0) {
    const initialProgress = Math.floor(
      (sectionsCompleted / totalSections) * 100
    );
    await d
      .update(csrBuildJobs)
      .set({ progress: initialProgress, updatedAt: new Date() })
      .where(eq(csrBuildJobs.id, jobId));
  }

  try {
    // Per-section drafting + upsert. Each section is persisted IMMEDIATELY
    // after its AI call returns so a mid-job crash leaves prior sections on
    // disk and a resume picks up exactly where we left off (and re-bills
    // only the un-persisted remainder).
    for (const section of allTargets) {
      if (persistedSet.has(section.number)) continue;

      currentSection.number = section.number;

      const drafted = await draftCSRSectionWithProvenance(
        section,
        request,
        aiCtx
      );

      // Skip empty drafts (both AI and template returned nothing) rather
      // than write a NOT-NULL-violating row. This matches the prior
      // iterDraftedSections behavior which skipped empty leaves.
      if (!drafted.content || drafted.content.length === 0) {
        continue;
      }

      const contentHash = sha256Hex(drafted.content);
      const isAI = drafted.source === 'ai';

      await d
        .insert(csrSectionOutputs)
        .values({
          organizationId: job.organizationId,
          projectId: job.projectId ?? null,
          jobId: job.id,
          sectionNumber: drafted.number,
          content: drafted.content,
          contentHash,
          aiGenerated: isAI,
          model: drafted.model,
          tokenCost: drafted.tokenCost,
          lineage: drafted.lineage as Record<string, unknown> | null,
        })
        .onConflictDoUpdate({
          target: [csrSectionOutputs.jobId, csrSectionOutputs.sectionNumber],
          set: {
            content: drafted.content,
            contentHash,
            aiGenerated: isAI,
            model: drafted.model,
            tokenCost: drafted.tokenCost,
            lineage: drafted.lineage as Record<string, unknown> | null,
            generatedAt: new Date(),
          },
        });

      sectionsCompleted += 1;
      const progress =
        totalSections === 0
          ? 100
          : Math.floor((sectionsCompleted / totalSections) * 100);

      await d
        .update(csrBuildJobs)
        .set({ progress, updatedAt: new Date() })
        .where(eq(csrBuildJobs.id, jobId));
    }

    // 6. Placeholder gate (resume-safe). A section whose AI draft threw falls
    // back to bracketed template prose that still contains unresolved fields —
    // e.g. §13's "the benefit-risk profile … is considered [favorable/
    // unfavorable]". Marking the job 'complete' would let the submission
    // orchestrator assemble that literal placeholder into the filing package as
    // a finished CSR section. The legacy synchronous path already gates on this
    // via computeBuildCompleteness/hasUnresolvedPlaceholders; the async runner
    // (the path production actually uses) did not. Re-read EVERY persisted
    // section for this job — not just the ones drafted this attempt — so a
    // placeholder left by a prior run is caught on resume too.
    const persistedOutputs = await d
      .select({
        sectionNumber: csrSectionOutputs.sectionNumber,
        content: csrSectionOutputs.content,
      })
      .from(csrSectionOutputs)
      .where(eq(csrSectionOutputs.jobId, job.id));
    const placeholderSections = persistedOutputs
      .filter(r => hasUnresolvedPlaceholders(r.content))
      .map(r => r.sectionNumber)
      .sort();

    if (placeholderSections.length > 0) {
      // Fail closed — a CSR with unresolved template placeholders is NOT
      // submission-ready. Surface it as failed with the exact sections so the
      // orchestrator holds the package and a reviewer can re-draft them, rather
      // than shipping placeholder prose under a 'complete' status.
      console.warn(
        `[csr-job-runner] Job ${jobId} has unresolved placeholders in section(s) ${placeholderSections.join(
          ', ',
        )}; marking failed instead of complete`,
      );
      await d
        .update(csrBuildJobs)
        .set({
          status: 'failed',
          updatedAt: new Date(),
          error: {
            reason: 'unresolved_placeholders',
            sections: placeholderSections,
            message: `CSR section(s) ${placeholderSections.join(
              ', ',
            )} still contain unresolved template placeholders (AI drafting fell back to template text); these sections are not submission-ready.`,
            at: new Date().toISOString(),
          },
        })
        .where(eq(csrBuildJobs.id, jobId));
      return;
    }

    // 6b. Success — every persisted section is placeholder-free.
    await d
      .update(csrBuildJobs)
      .set({
        status: 'complete',
        progress: 100,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(csrBuildJobs.id, jobId));
  } catch (err) {
    // 7. Failure — record the failing section + message ONLY (never payload content)
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[csr-job-runner] Job ${jobId} failed on section '${
        currentSection.number || '<setup>'
      }': ${message}`
    );
    await d
      .update(csrBuildJobs)
      .set({
        status: 'failed',
        updatedAt: new Date(),
        error: {
          message,
          section: currentSection.number || null,
          at: new Date().toISOString(),
        },
      })
      .where(eq(csrBuildJobs.id, jobId));
  }
}

/**
 * Org-scoped read of a job's current state. Returns null when the job
 * either does not exist OR belongs to a different organization — the two
 * cases are deliberately collapsed to avoid leaking job existence across
 * tenants.
 */
export async function getCSRBuildJobStatus(
  jobId: number,
  organizationId: number
): Promise<CSRBuildJobStatus | null> {
  const d = requireDb();

  const [row] = await d
    .select({
      status: csrBuildJobs.status,
      progress: csrBuildJobs.progress,
      error: csrBuildJobs.error,
    })
    .from(csrBuildJobs)
    .where(
      and(
        eq(csrBuildJobs.id, jobId),
        eq(csrBuildJobs.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!row) return null;

  // sectionsComplete is derived from the section_outputs table so it
  // reflects what's actually persisted, not just the progress counter.
  const sectionRows = await d
    .select({ sectionNumber: csrSectionOutputs.sectionNumber })
    .from(csrSectionOutputs)
    .where(
      and(
        eq(csrSectionOutputs.jobId, jobId),
        eq(csrSectionOutputs.organizationId, organizationId)
      )
    );

  return {
    status: row.status,
    progress: row.progress,
    sectionsComplete: sectionRows.length,
    error: row.error ?? null,
  };
}

/**
 * Org-scoped read of all persisted sections for a job. Returns an empty
 * array if the job has no sections yet (or if the org mismatch hides
 * them — the org scope on the WHERE clause silently filters cross-tenant
 * reads).
 */
export async function getCSRSectionOutputs(
  jobId: number,
  organizationId: number
): Promise<CsrSectionOutput[]> {
  const d = requireDb();

  const rows = await d
    .select()
    .from(csrSectionOutputs)
    .where(
      and(
        eq(csrSectionOutputs.jobId, jobId),
        eq(csrSectionOutputs.organizationId, organizationId)
      )
    );

  return rows;
}
