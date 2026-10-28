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
import { CsrScopeError, resolveCsrBuildContext, resolveCsrScope } from './project-scope';
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
  programId?: string;
  clientWorkspaceId?: number;
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
  // Validate identity before opening a database transaction or creating a job.
  const protocolNumber = req.studyInfo?.protocolNumber;
  if (typeof protocolNumber !== 'string' || !protocolNumber.trim()) {
    throw new Error('CSR_STUDY_IDENTIFIER_REQUIRED: Record the study protocol number before starting CSR drafting. No job was created.');
  }
  const d = requireDb();
  const scope = await resolveCsrBuildContext(d, req, ctx);

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
    studyInfo: { ...req.studyInfo, protocolNumber: protocolNumber.trim() },
    deepResearchJobId: req.deepResearchJobId,
  };

  const [row] = await d
    .insert(csrBuildJobs)
    .values({
      organizationId: ctx.organizationId,
      projectId: scope.projectId ?? null,
      // Preserve the recorded study protocol number without inventing an identifier.
      studyId: protocolNumber.trim(),
      status: 'queued',
      progress: 0,
      sectionsToGenerate,
      studyInfoSnapshot: snapshot as unknown as Record<string, unknown>,
      requestedBy: scope.requestedBy ?? null,
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

  // Permission is checked again when work starts, not retained from enqueue.
  // Refuse before section/source reads or AI calls; preserve prior outputs.
  if (job.projectId != null) {
    try {
      await resolveCsrScope(d, job.organizationId, { projectId: job.projectId }, { actorUserId: job.requestedBy ?? undefined });
    } catch (error) {
      await d.update(csrBuildJobs).set({ status: 'failed', updatedAt: new Date(), error: {
        reason: error instanceof CsrScopeError ? 'project_access_refused' : 'project_access_verification_failed',
        code: error instanceof CsrScopeError ? error.code : 'CSR_PROJECT_ACCESS_UNAVAILABLE',
      } }).where(and(eq(csrBuildJobs.id, job.id), eq(csrBuildJobs.organizationId, job.organizationId)));
      return;
    }
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
  // Resume must use the study identity recorded on the job, not an edited,
  // missing, or legacy snapshot value. Refuse a mismatch rather than drafting
  // sections for a different protocol under the original job identifier.
  if (typeof studyInfo.protocolNumber !== 'string' ||
      studyInfo.protocolNumber.trim() !== job.studyId) {
    await d.update(csrBuildJobs).set({
      status: 'failed',
      updatedAt: new Date(),
      error: {
        reason: 'study_identity_mismatch',
        message: 'The saved CSR study identity does not match this job. No additional sections were drafted.',
      },
    }).where(and(eq(csrBuildJobs.id, job.id), eq(csrBuildJobs.organizationId, job.organizationId)));
    return;
  }

  const persistedSubset = job.sectionsToGenerate ?? null;
  const fresh = JSON.parse(JSON.stringify(ICH_E3_STRUCTURE)) as CSRSection[];
  const canonicalSections = flattenICHE3Sections(fresh);
  const canonicalNumbers = new Set(canonicalSections.map(section => section.number));
  // Empty arrays retain the existing full-build meaning. An unusable retained
  // selection must never become a vacuously complete job or discard unknown slots.
  if (!canonicalSections.length || (persistedSubset != null && (!Array.isArray(persistedSubset)
    || persistedSubset.some(number => !canonicalNumbers.has(number))))) {
    await d.update(csrBuildJobs).set({ status: 'failed', progress: 0, updatedAt: new Date(),
      error: { reason: 'invalid_section_selection', message: 'The retained CSR selection does not identify supported report sections.' },
    }).where(eq(csrBuildJobs.id, jobId));
    return;
  }
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

  // 5. Resume only missing/blank targets; preserve every nonblank saved target.
  const allTargets = canonicalSections.filter(s =>
    subsetFilter ? subsetFilter.has(s.number) : true
  );
  const targetNumbers = new Set(allTargets.map(section => section.number));

  const alreadyPersisted = await d
    .select({ sectionNumber: csrSectionOutputs.sectionNumber, content: csrSectionOutputs.content })
    .from(csrSectionOutputs)
    .where(eq(csrSectionOutputs.jobId, job.id));
  const persistedSet = new Set(alreadyPersisted.filter(row => targetNumbers.has(row.sectionNumber)
    && row.content.trim()).map(row => row.sectionNumber));

  const totalSections = allTargets.length;
  let sectionsCompleted = persistedSet.size;
  const currentSection = { number: '' as string };

  // Seed initial progress so a resumed run reports the right number
  if (totalSections > 0) {
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

      // Missing output remains retryable work; never persist whitespace as a draft.
      if (!drafted.content?.trim()) {
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

    // 6. Re-read saved target coverage, including prior attempts. Missing rows
    // cannot pass a placeholder-only check; unrelated rows do not cover targets.
    const persistedOutputs = await d
      .select({
        sectionNumber: csrSectionOutputs.sectionNumber,
        content: csrSectionOutputs.content,
      })
      .from(csrSectionOutputs)
      .where(eq(csrSectionOutputs.jobId, job.id));
    const savedTargets = persistedOutputs.filter(row => targetNumbers.has(row.sectionNumber) && row.content.trim());
    const savedNumbers = new Set(savedTargets.map(row => row.sectionNumber));
    const missingSections = allTargets.filter(section => !savedNumbers.has(section.number)).map(section => section.number);
    const finalProgress = Math.floor((savedNumbers.size / totalSections) * 100);
    if (missingSections.length) {
      await d.update(csrBuildJobs).set({ status: 'failed', progress: finalProgress, updatedAt: new Date(),
        error: { reason: 'missing_section_outputs', sections: missingSections,
          message: 'Requested CSR sections have no nonblank saved output; retained sections are preserved for resume.' },
      }).where(eq(csrBuildJobs.id, jobId));
      return;
    }
    const placeholderSections = savedTargets
      .filter(r => hasUnresolvedPlaceholders(r.content))
      .map(r => r.sectionNumber)
      .sort();

    if (placeholderSections.length > 0) {
      // Retain the existing placeholder refusal and its exact target codes.
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

    // 6b. Success — every requested section is saved, nonblank and placeholder-free.
    await d
      .update(csrBuildJobs)
      .set({
        status: 'complete',
        progress: 100,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(csrBuildJobs.id, jobId));
    // Continue dependent submission work only after the CSR completion is durable.
    // This callback has its own failure boundary: a release/readiness refusal
    // must never relabel successfully generated CSR sections as a failed job.
    try {
      const { continueOrchestratorRunsForCsrJob } = await import('../submission-orchestrator-continuation.js');
      const outcomes = await continueOrchestratorRunsForCsrJob(jobId, job.organizationId);
      for (const outcome of outcomes) {
        if (outcome.continuation === 'retry-required') console.warn('[csr-job-runner] Submission continuation needs retry', { jobId, organizationId: job.organizationId, ...outcome });
      }
    } catch {
      console.warn('[csr-job-runner] CSR completed; submission continuation is temporarily unavailable', { jobId, organizationId: job.organizationId });
    }
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
