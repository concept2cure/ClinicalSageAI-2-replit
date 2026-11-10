/**
 * @fileoverview Async CSR Build Job Runner
 * @module server/services/csr/csr-job-runner
 *
 * Wraps the synchronous in-process csr-builder.generateCSRSections loop with
 * persistent job state so a long ICH-E3 build can run out-of-band, be
 * resumed after a section-level failure, and surface progress to the caller
 * without blocking an HTTP request.
 *
 * Consumed by csr-builder.launchCSRBuildAsync, the one build path (the
 * synchronous launchCSRBuild was deleted 2026-10-30; this runner's completion
 * gate is the fail-closed status rule).
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
import { and, eq, isNull } from 'drizzle-orm';

import { db } from '../../db';
import { CsrScopeError, resolveCsrBuildContext, resolveCsrScope } from './project-scope';
import { verifySavedCsrSectionIntegrity } from './csr-output-integrity';

import {
  csrBuildJobs,
  csrSectionOutputs,
  type CsrSectionOutput,
} from '@shared/schema';
import {
  csrSectionSelectionRefusal,
  draftCSRSectionWithProvenance,
  hasUnresolvedPlaceholders,
  resolveCSRDraftTargets,
  type CSRBuildRequest,
  type CSRSection,
} from '../csr-builder';
import { csrSectionTableKeys, parseCsrEvidenceSelection,
  type CsrAuthoringEvidence } from './cortex-authoring-context';
import { RECOVERY_MESSAGES, assertCsrJobEvidenceUnchanged, assertSavedCsrJobEvidence, readCsrJobEvidence,
  verifyCsrJobWriteScope, type CsrJobEvidenceScope } from './csr-job-evidence';

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
  /** The retained run whose engine tables ground the results sections. */
  evidenceSource?: CSRBuildRequest['evidenceSource'];
}

type EvidenceSource = NonNullable<CSRBuildRequest['evidenceSource']>;

/** A retained-run binding, normalised; throws CSR_EVIDENCE_SELECTION_INVALID. */
function parseEvidenceSource(value: unknown): EvidenceSource {
  const { programId, runId, studyId } = parseCsrEvidenceSelection({ ...(value as object), sectionNumber: '1' });
  return { programId, runId, studyId };
}

function readStudyInfoSnapshot(raw: unknown): CSRStudyInfoSnapshot {
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    // New shape: { studyInfo, deepResearchJobId, evidenceSource? }
    if (obj.studyInfo && typeof obj.studyInfo === 'object') {
      return {
        studyInfo: obj.studyInfo as CSRBuildRequest['studyInfo'],
        deepResearchJobId:
          typeof obj.deepResearchJobId === 'number'
            ? obj.deepResearchJobId
            : undefined,
        ...(obj.evidenceSource !== undefined ? { evidenceSource: obj.evidenceSource as EvidenceSource } : {}),
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

/**
 * The headings a retained job drafts (ICH_E3_GUIDANCE's draftable headings, or
 * those under its selection), or null when the retained selection is unusable:
 * unknown, duplicated in a way the builder refuses, or naming a manual heading.
 * Null or [] is the whole report.
 */
function retainedDraftTargets(persisted: unknown): CSRSection[] | null {
  if (persisted != null && !Array.isArray(persisted)) return null;
  const selection = Array.isArray(persisted) && persisted.length > 0 ? [...new Set(persisted as string[])] : undefined;
  try {
    const targets = resolveCSRDraftTargets(selection);
    return targets.length ? targets : null;
  } catch {
    return null;
  }
}

/**
 * The retained evidence pack for one results section of a run-bound job, or
 * undefined for a section no engine table supports (§9.7, §10.2, §12.5).
 * Loaded through the canonical project-authorized, receipt-verified reader
 * as the job's requester, re-checked per section. A revoked or withdrawn
 * source, a missing requester or a pack for another protocol throws, and the
 * job fails closed rather than drafting the section from metadata.
 */
async function loadSectionEvidence(
  source: EvidenceSource, sectionNumber: string,
  job: CsrJobEvidenceScope,
): Promise<CsrAuthoringEvidence | undefined> {
  if (!csrSectionTableKeys(sectionNumber).length) return undefined;
  return readCsrJobEvidence(job, source, sectionNumber);
}

/** A restarted job may be drafting again while its earlier model call is
 * still alive. Status alone is not ownership. started_at is the existing
 * immutable-per-attempt token; updated_at remains the recovery heartbeat. */
function draftingAttempt(jobId: number, organizationId: number, startedAt: Date) {
  return and(eq(csrBuildJobs.id, jobId), eq(csrBuildJobs.organizationId, organizationId),
    eq(csrBuildJobs.status, 'drafting'), eq(csrBuildJobs.startedAt, startedAt));
}

async function isJobDrafting(
  d: NonNullable<typeof db>, jobId: number, organizationId: number, startedAt: Date,
): Promise<boolean> {
  const rows = await d.select({ id: csrBuildJobs.id }).from(csrBuildJobs)
    .where(draftingAttempt(jobId, organizationId, startedAt))
    .limit(1);
  return rows.length === 1;
}

async function verifySavedTargetEvidence(
  source: EvidenceSource, job: CsrJobEvidenceScope,
  rows: Array<{ sectionNumber: string; lineage: unknown }>, targets: ReadonlySet<string>,
): Promise<void> {
  for (const row of rows) {
    if (!targets.has(row.sectionNumber)) continue;
    const evidence = await loadSectionEvidence(source, row.sectionNumber, job);
    if (evidence) assertSavedCsrJobEvidence(row.lineage, evidence);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

/** Existing CSR worker's error-receipt boundary. Raw SDK, SQL and upload
 * errors may contain sensitive observations or credentials, so a persisted
 * job receipt or log may report ONLY a bounded typed CSR code, with, for the
 * evidence refusals that name a next step, that code's fixed sentence from
 * csr-job-evidence.ts (never the error's own text). Kept here in the
 * established worker, not in a new service or parallel pipeline. */
const CSR_JOB_SAFE_CODE = /^CSR_[A-Z0-9_]{3,80}$/;
function safeCsrJobFailure(error: unknown): { message: string; code?: string } {
  const value = error && typeof error === 'object'
    ? error as { code?: unknown; message?: unknown } : null;
  const code = typeof value?.code === 'string' && CSR_JOB_SAFE_CODE.test(value.code)
    ? value.code
    : typeof value?.message === 'string' && CSR_JOB_SAFE_CODE.test(value.message)
      ? value.message : null;
  if (!code) return { message: 'CSR_BUILD_STEP_FAILED' };
  return { message: recoveryMessage(code) ?? code, code };
}

const recoveryMessage = (code: string): string | null => (Object.prototype.hasOwnProperty.call(RECOVERY_MESSAGES, code)
  ? RECOVERY_MESSAGES[code as keyof typeof RECOVERY_MESSAGES] : null);

/** A failed build's receipt, as the build list states it (F10 of the 2026-11-02 demo walk): fixed sentences chosen
 * by the receipt's typed `reason` or `code` and its section numbers. The stored `message` is never read, because a
 * receipt written before the 2026-11-03 redaction can hold a raw driver or provider error. */
const FAILURE_BY_CODE: Readonly<Record<string, string>> = {
  CSR_BUILD_REQUESTER_MISSING: 'The person who started this build can no longer be identified, so it was not run as anyone else. Start a new build.',
  CSR_PROJECT_ARCHIVED: 'The project was archived, so this build was not resumed. Its saved sections can still be read.',
  CSR_PROJECT_ACCESS_UNAVAILABLE: 'Access to this project could not be checked when the build started, so nothing was drafted. Build again.',
  CSR_TENANT_SCOPE_UNAVAILABLE: 'This organization has no tenant key, so its Vault sources cannot be read. The build was not resumed; its saved sections can still be read.',
};
const FAILURE_BY_REASON: Readonly<Record<string, string>> = {
  project_anchor_missing: 'This build is not tied to a project, so nothing was drafted. Start a new build from the CSR document.',
  requester_missing: FAILURE_BY_CODE.CSR_BUILD_REQUESTER_MISSING,
  project_access_refused: 'The person who started this build no longer has access to this project, so nothing more was drafted.',
  project_access_verification_failed: FAILURE_BY_CODE.CSR_PROJECT_ACCESS_UNAVAILABLE,
  tenant_scope_unavailable: FAILURE_BY_CODE.CSR_TENANT_SCOPE_UNAVAILABLE,
  study_identity_mismatch: 'The study recorded on this build no longer matches its study data, so nothing more was drafted.',
  invalid_section_selection: 'The build’s section selection does not name ICH E3 report sections, so nothing was drafted.',
};
/**
 * A build the provider or the gateway would not draft for (csr-builder.ts CsrDraftingUnavailableError): what stopped
 * it and who can change that. Fixed sentences by typed code; the provider's own text is never stored or shown.
 */
const DRAFTING_STOPPED: Readonly<Record<string, string>> = {
  CSR_DRAFTING_KEY_REFUSED: 'The AI provider refused this deployment’s API key, so nothing more was drafted. An administrator must set a valid key.',
  CSR_DRAFTING_ACCOUNT_REFUSED: 'The AI provider would not serve this deployment’s account: it has no credit left, or no access to the drafting model. An administrator must add credit or model access.',
  CSR_DRAFTING_RATE_LIMITED: 'Drafting was refused by a rate limit for several minutes running, so the build stopped rather than save headings with no text.',
  CSR_DRAFTING_PROVIDER_UNAVAILABLE: 'The AI provider did not answer, or no AI provider is configured for drafting, so nothing more was drafted.',
  CSR_DRAFTING_MODEL_NOT_QUALIFIED: 'No model approved for regulatory drafting is configured on this deployment, so nothing was sent to a model that is not.',
  CSR_DRAFTING_PLACEMENT_REFUSED: 'This organization’s AI placement policy excludes every model that could draft this report, so nothing was sent.',
};
const SECTION_CODE = /^\d+(?:\.\d+)*$/;

/**
 * Why a model's draft of a heading was not saved, in words: the builder's typed refusal reasons (csr-builder.ts
 * acceptSectionReply, unsupplied-statistics.ts). A heading with no template then has no text at all, and until
 * 2026-11-10 its build read "has no saved text" whether the provider never answered or a figure check refused the
 * draft. A reason not listed here is not stated.
 */
const DRAFT_REFUSED: Readonly<Record<string, string>> = {
  unreconciled_figures: 'stated a figure that is not a cell of its study tables',
  unsupplied_statistics: 'stated a figure the study information does not carry',
  synopsis_observed_figures_unclaimed: 'reported a result without naming the table cell it came from',
  unreconciled_claims: 'named a table cell that does not hold the value it stated',
  claims_invalid: 'listed its table cells in a form that could not be checked',
  unsubstantiated_outcome_conclusion: 'stated a conclusion the tables alone cannot support',
  outcome_cell_mismatch: 'attributed a death count to a row that does not report deaths',
  unsupported_conduct_claim: 'stated how the study was conducted with no record to support it',
  draft_truncated: 'was cut off before its end',
  gateway_policy_refused: 'was refused by the AI gateway’s data policy before it reached a model',
  gateway_input_too_large: 'was too large to send to a model in one request',
  no_model_provider: 'was not written, because no AI model is configured',
  csr_evidence_unavailable: 'was not written, because its study tables hold no results',
};

function draftRefusalReason(lineage: unknown): string | null {
  const rejected = lineage && typeof lineage === 'object' ? (lineage as { rejectedModelDraft?: { reason?: unknown } }).rejectedModelDraft : null;
  const reason = rejected && typeof rejected.reason === 'string' ? rejected.reason : '';
  return Object.prototype.hasOwnProperty.call(DRAFT_REFUSED, reason) ? reason : null;
}

/** The `refused` field of a receipt: the reason of each missing heading that has one. */
function refusedAmong(sections: string[], reasons: Record<string, string>): { refused?: Record<string, string> } {
  const refused = Object.fromEntries(sections.filter(number => reasons[number]).map(number => [number, reasons[number]]));
  return Object.keys(refused).length ? { refused } : {};
}

/** " The draft of §11.1 and §11.2 stated a figure …, so it was not saved." for each reason, at most three reasons. */
function refusedDraftsText(value: unknown, named: Set<string>): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const byReason = new Map<string, string[]>();
  for (const [number, reason] of Object.entries(value as Record<string, unknown>)) {
    if (!SECTION_CODE.test(number) || !named.has(number) || typeof reason !== 'string' ||
      !Object.prototype.hasOwnProperty.call(DRAFT_REFUSED, reason)) continue;
    byReason.set(reason, [...(byReason.get(reason) ?? []), number]);
  }
  return [...byReason].slice(0, 3).map(([reason, numbers]) => {
    const list = sectionList(numbers)!;
    return ` The ${list.one ? 'draft' : 'drafts'} of ${list.text} ${DRAFT_REFUSED[reason]}, so ${list.one ? 'it was' : 'they were'} not saved.`;
  }).join('');
}

/** "§2, §5.1 and §9.8" (at most 12 named), and whether it names one section or several; null when none is valid. */
function sectionList(value: unknown): { text: string; one: boolean } | null {
  const codes = Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && SECTION_CODE.test(v)) : [];
  if (!codes.length) return null;
  const named = codes.slice(0, 12).map(code => `§${code}`);
  const rest = codes.length - named.length;
  const text = rest > 0 ? `${named.join(', ')} and ${rest} more`
    : named.length === 1 ? named[0] : `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;
  return { text, one: codes.length === 1 };
}

/** The reasons that name the sections they concern. */
function sectionFailure(reason: string, sections: ReturnType<typeof sectionList>, refused = ''): string | null {
  if (reason === 'saved_section_integrity_failed') {
    return sections
      ? `The saved text of ${sections.text} no longer matches its recorded checksum. Nothing was overwritten; review ${sections.one ? 'it' : 'them'} before building again.`
      : 'Saved sections no longer match their recorded checksums. Nothing was overwritten; review them before building again.';
  }
  if (!sections) return null;
  if (reason === 'unresolved_placeholders') {
    return `Not complete: ${sections.text} still ${sections.one ? 'holds' : 'hold'} a data placeholder (“[…]”) where the study’s data is missing.`;
  }
  if (reason === 'missing_section_outputs') {
    return `Not complete: ${sections.text} ${sections.one ? 'has' : 'have'} no saved text. The sections already saved are kept.${refused}`;
  }
  return null;
}

/** The typed fields of a receipt; anything malformed reads as absent. */
function receiptOf(error: unknown) {
  const receipt = error && typeof error === 'object' && !Array.isArray(error) ? error as Record<string, unknown> : {};
  return {
    reason: typeof receipt.reason === 'string' ? receipt.reason : '',
    code: typeof receipt.code === 'string' && CSR_JOB_SAFE_CODE.test(receipt.code) ? receipt.code : '',
    section: typeof receipt.section === 'string' && SECTION_CODE.test(receipt.section) ? receipt.section : '',
    sections: sectionList(receipt.sections),
    refused: refusedDraftsText(receipt.refused, new Set(Array.isArray(receipt.sections) ? receipt.sections.filter((v): v is string => typeof v === 'string') : [])),
  };
}

/** Why a failed build stopped, in plain words, from its recorded receipt (csr_build_jobs.error). */
export function csrBuildFailureText(error: unknown): string {
  const { reason, code, section, sections, refused } = receiptOf(error);
  const stopped = code ? DRAFTING_STOPPED[code] : undefined;
  if (stopped) return `${stopped} ${section ? `The build stopped at §${section}. ` : ''}The sections already saved are kept.`;
  const known = sectionFailure(reason, sections, refused) ?? (code ? recoveryMessage(code) ?? FAILURE_BY_CODE[code] : undefined)
    ?? FAILURE_BY_REASON[reason];
  if (known) return known;
  const where = section ? ` while drafting §${section}` : '';
  const reference = code && code !== 'CSR_BUILD_STEP_FAILED' ? ` (refusal ${code})` : '';
  return `The build stopped${where}${reference}. The sections already saved are kept.`;
}

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
  // Reject malformed section selections before creating a persistent job.
  // Undefined or [] retains the established whole-report behavior.
  const requestedSections = req.sectionsToGenerate;
  if (requestedSections !== undefined && requestedSections.length > 0) {
    const refusal = csrSectionSelectionRefusal(requestedSections);
    if (refusal) throw new CsrScopeError(refusal.code, 400, `${refusal.message} No job was created.`);
  } else if (requestedSections !== undefined && !Array.isArray(requestedSections)) {
    throw new CsrScopeError('CSR_SECTION_SELECTION_INVALID', 400,
      'Choose unique ICH E3 section numbers from the CSR template. No job was created.');
  }
  let evidenceSource: EvidenceSource | undefined;
  if (req.evidenceSource !== undefined) {
    try { evidenceSource = parseEvidenceSource(req.evidenceSource); } catch {
      throw new CsrScopeError('CSR_EVIDENCE_SELECTION_INVALID', 400, 'The retained run binding is invalid. No job was created.');
    }
  }
  // A CSR build must belong to an explicit project, rather than silently
  // creating an organization-wide job with no study dossier anchor.
  if (req.projectId === undefined && ctx.projectId === undefined && ctx.programId === undefined) {
    throw new CsrScopeError('CSR_PROJECT_REQUIRED', 400,
      'Select a project before starting CSR drafting. No job was created.');
  }
  const d = requireDb();
  const scope = await resolveCsrBuildContext(d, req, ctx);
  if (scope.projectId === undefined) {
    throw new CsrScopeError('CSR_PROJECT_REQUIRED', 400,
      'The selected CSR project could not be resolved. No job was created.');
  }

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
    ...(evidenceSource ? { evidenceSource } : {}),
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

  // Bind pre-claim refusals and the claim to the exact runnable generation
  // read above. queued/failed may recur after another attempt (the ABA race).
  const previousStartedAt = job.startedAt ?? null;
  const runnable = and(eq(csrBuildJobs.id, jobId),
    eq(csrBuildJobs.organizationId, job.organizationId), eq(csrBuildJobs.status, job.status),
    previousStartedAt === null ? isNull(csrBuildJobs.startedAt) : eq(csrBuildJobs.startedAt, previousStartedAt));

  // Legacy unanchored jobs cannot resume into a regulated dossier.
  // Refuse before any source reads or model calls.
  if (job.projectId == null) {
    await d.update(csrBuildJobs).set({
      status: 'failed',
      updatedAt: new Date(),
      error: {
        reason: 'project_anchor_missing',
        message: 'This CSR job has no project anchor. Select a project and start a new build.',
      },
    }).where(runnable);
    return;
  }

  // A queued legacy job can have requested_by=NULL. Without an actor,
  // resolveCsrScope's optional-actor branch could treat a job as system work
  // and allow metadata-only drafting without the user who commissioned it.
  // CSR authoring is user-governed; never substitute a service or default user.
  if (!Number.isSafeInteger(job.requestedBy) || Number(job.requestedBy) <= 0) {
    await d.update(csrBuildJobs).set({
      status: 'failed',
      updatedAt: new Date(),
      error: {
        reason: 'requester_missing',
        code: 'CSR_BUILD_REQUESTER_MISSING',
        message: 'The saved CSR job has no currently identifiable requester. Nothing was drafted; existing sections were preserved.',
      },
    }).where(runnable);
    return;
  }

  // Permission is checked again when work starts, not retained from enqueue.
  // Refuse before section/source reads or AI calls; preserve prior outputs.
  try {
    await resolveCsrScope(d, job.organizationId, { projectId: job.projectId }, { actorUserId: job.requestedBy ?? undefined });
  } catch (error) {
    await d.update(csrBuildJobs).set({ status: 'failed', updatedAt: new Date(), error: {
      reason: error instanceof CsrScopeError ? 'project_access_refused' : 'project_access_verification_failed',
      code: error instanceof CsrScopeError ? error.code : 'CSR_PROJECT_ACCESS_UNAVAILABLE',
    } }).where(runnable);
    return;
  }

  // 3. Rebuild the CSRBuildRequest from the persisted snapshot
  const { studyInfo, deepResearchJobId, evidenceSource } = readStudyInfoSnapshot(
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
    }).where(runnable);
    return;
  }

  // Strictly increase the existing attempt timestamp, even if a retry starts
  // within the same millisecond or the process clock moves backwards. The
  // conditional claim prevents two contenders from sharing this token.
  const attemptStartedAt = new Date(Math.max(Date.now(), (previousStartedAt?.getTime() ?? 0) + 1));
  const [claimed] = await d.update(csrBuildJobs).set({
    status: 'drafting',
    startedAt: attemptStartedAt,
    updatedAt: new Date(),
    completedAt: null,
    error: null,
  }).where(runnable).returning({ id: csrBuildJobs.id });
  if (!claimed) return;
  const ownsAttempt = draftingAttempt(jobId, job.organizationId, attemptStartedAt);

  const currentSection = { number: '' as string };
  try {
    const persistedSubset = job.sectionsToGenerate ?? null;
    // Empty arrays retain the existing full-build meaning. An unusable retained
    // selection must never become a vacuously complete job or discard unknown slots.
    const allTargets = retainedDraftTargets(persistedSubset);
    if (!allTargets) {
      await d.update(csrBuildJobs).set({ status: 'failed', progress: 0, updatedAt: new Date(),
        error: { reason: 'invalid_section_selection', message: 'The retained CSR selection does not identify supported report sections.' },
      }).where(ownsAttempt);
      return;
    }
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
    const targetNumbers = new Set(allTargets.map(section => section.number));

    const alreadyPersisted = await d
      .select({ sectionNumber: csrSectionOutputs.sectionNumber, content: csrSectionOutputs.content,
        contentHash: csrSectionOutputs.contentHash, lineage: csrSectionOutputs.lineage })
      .from(csrSectionOutputs)
      .where(and(eq(csrSectionOutputs.jobId, job.id), eq(csrSectionOutputs.organizationId, job.organizationId)));
    // Resume only verified, non-placeholder content. A damaged or incomplete
    // output must not be treated as finished merely because its row exists.
    const persistedSet = new Set(alreadyPersisted.filter(row =>
      targetNumbers.has(row.sectionNumber) &&
      typeof row.content === 'string' &&
      Boolean(row.content.trim()) &&
      !hasUnresolvedPlaceholders(row.content) &&
      typeof row.contentHash === 'string' &&
      row.contentHash === sha256Hex(row.content)
    ).map(row => row.sectionNumber));

    // A stored hash mismatch is evidence of changed or damaged source output.
    // Never overwrite that record during a resume: preserve it for investigation
    // and require a governed correction rather than silently regenerating it.
    const damaged = alreadyPersisted.filter(row =>
      targetNumbers.has(row.sectionNumber) &&
      (typeof row.content !== 'string' ||
        typeof row.contentHash !== 'string' ||
        row.contentHash !== sha256Hex(row.content))
    );
    if (damaged.length > 0) {
      await d.update(csrBuildJobs).set({
        status: 'failed',
        updatedAt: new Date(),
        error: {
          reason: 'saved_section_integrity_failed',
          sections: damaged.map(row => row.sectionNumber),
          message: 'Saved CSR section integrity verification failed. Existing content was preserved; review the affected sections before restarting.',
        },
      }).where(ownsAttempt);
      return;
    }

    const totalSections = allTargets.length;
    let sectionsCompleted = persistedSet.size;
    // Why a heading's draft was not saved, by heading: the typed reason only, never the draft or its figures.
    const refusedDrafts: Record<string, string> = {};

    // Seed initial progress so a resumed run reports the right number
    if (totalSections > 0) {
      const initialProgress = Math.floor(
        (sectionsCompleted / totalSections) * 100
      );
      await d
        .update(csrBuildJobs)
        .set({ progress: initialProgress, updatedAt: new Date() })
        .where(ownsAttempt);
    }

    const source = evidenceSource !== undefined ? parseEvidenceSource(evidenceSource) : undefined;
    let admission: CsrAuthoringEvidence | undefined;
    if (source) {
      await verifyCsrJobWriteScope(d, job, source);
      admission = await readCsrJobEvidence(job, source, '2');
      // Even an entirely populated resume must verify the current source and
      // the exact evidence each saved results section actually names.
      await verifySavedTargetEvidence(source, job, alreadyPersisted, persistedSet);
    }
    // Per-section drafting + upsert. Each section is persisted IMMEDIATELY
    // after its AI call returns so a mid-job crash leaves prior sections on
    // disk and a resume picks up exactly where we left off (and re-bills
    // only the un-persisted remainder).
    for (const section of allTargets) {
      if (persistedSet.has(section.number)) continue;

      currentSection.number = section.number;

      // A job bound to a retained run drafts each results section over that
      // section's engine tables; a refused or revoked source fails the job.
      const evidence = source
        ? await loadSectionEvidence(source, section.number, job)
        : undefined;
      // Source reads can themselves outlive cancellation. Do not start a
      // billable model call when the job became terminal during that await.
      if (!await isJobDrafting(d, jobId, job.organizationId, attemptStartedAt)) return;
      const drafted = await draftCSRSectionWithProvenance(
        section,
        request,
        aiCtx,
        evidence
      );

      // A model response must target the section being drafted. An unexpected
      // section identifier must not overwrite another section via the upsert.
      if (drafted.number !== section.number) {
        throw new Error('CSR_DRAFT_SECTION_MISMATCH: Generated section identifier differs from the requested ICH E3 section.');
      }

      // Model calls are long-running. A cancelled or superseded job cannot
      // save a late model result into its previously governed section set.
      if (!await isJobDrafting(d, jobId, job.organizationId, attemptStartedAt)) return;

      // A model call can outlive project membership or source availability.
      // Recheck current write permission and the same pack before any upsert.
      await verifyCsrJobWriteScope(d, job, source);
      if (source && admission) {
        const current = await readCsrJobEvidence(job, source, evidence ? section.number : '2');
        assertCsrJobEvidenceUnchanged(evidence ?? admission, current);
        if (evidence && typeof drafted.content === 'string' && drafted.content.trim() && !hasUnresolvedPlaceholders(drafted.content)) {
          assertSavedCsrJobEvidence(drafted.lineage, evidence);
        }
      }
      // Cancellation while those asynchronous checks run is still terminal.
      if (!await isJobDrafting(d, jobId, job.organizationId, attemptStartedAt)) return;

      // Missing output remains retryable work; never persist whitespace as a draft.
      if (typeof drafted.content !== 'string' || !drafted.content.trim()) {
        const why = draftRefusalReason(drafted.lineage);
        if (why) refusedDrafts[section.number] = why;
        continue;
      }

      const contentHash = sha256Hex(drafted.content);
      const isAI = drafted.source === 'ai';

      const progress = Math.floor(((sectionsCompleted + 1) / totalSections) * 100);
      // The conditional UPDATE takes a row lock on the parent job until the
      // same transaction commits its section. Cancellation/recovery cannot
      // slip between the ownership check and the output write. No model call
      // or evidence fetch runs under this lock. An insert failure rolls back
      // progress too; a lost attempt makes no output write at all.
      const saved = await d.transaction(async tx => {
        const owner = await tx.update(csrBuildJobs)
          .set({ progress, updatedAt: new Date() })
          .where(ownsAttempt).returning({ id: csrBuildJobs.id });
        if (owner.length !== 1) return false;
        await tx
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
        return true;
      });
      if (!saved) return;
      sectionsCompleted += 1;
    }

    // 6. Re-read saved target coverage, including prior attempts. Missing rows
    // cannot pass a placeholder-only check; unrelated rows do not cover targets.
    const persistedOutputs = await d
      .select({
        sectionNumber: csrSectionOutputs.sectionNumber,
        content: csrSectionOutputs.content,
        contentHash: csrSectionOutputs.contentHash,
        lineage: csrSectionOutputs.lineage,
      })
      .from(csrSectionOutputs)
      .where(and(eq(csrSectionOutputs.jobId, job.id), eq(csrSectionOutputs.organizationId, job.organizationId)));
    const integrity = verifySavedCsrSectionIntegrity([...targetNumbers], persistedOutputs);
    const savedTargets = persistedOutputs.filter(row => targetNumbers.has(row.sectionNumber) && typeof row.content === 'string' && row.content.trim());
    const missingSections = integrity.missing;
    const finalProgress = Math.floor((integrity.covered.length / totalSections) * 100);
    if (integrity.mismatched.length) {
      await d.update(csrBuildJobs).set({ status: 'failed', progress: finalProgress, updatedAt: new Date(),
        error: { reason: 'saved_section_integrity_failed', sections: integrity.mismatched,
          message: 'A saved CSR section changed or failed checksum verification. No completed report was issued.' },
      }).where(ownsAttempt);
      return;
    }
    if (missingSections.length) {
      await d.update(csrBuildJobs).set({ status: 'failed', progress: finalProgress, updatedAt: new Date(),
        error: { reason: 'missing_section_outputs', sections: missingSections,
          ...refusedAmong(missingSections, refusedDrafts),
          message: 'Requested CSR sections have no nonblank saved output; retained sections are preserved for resume.' },
      }).where(ownsAttempt);
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
        .where(ownsAttempt);
      return;
    }

    await verifyCsrJobWriteScope(d, job, source);
    if (source && admission) {
      assertCsrJobEvidenceUnchanged(admission, await readCsrJobEvidence(job, source, '2'));
      await verifySavedTargetEvidence(source, job, savedTargets, targetNumbers);
    }

    // 6b. Success — only the actively claimed drafting job may transition
    // to complete. A revoked, cancelled, or superseded job must not be
    // resurrected by a late section-drafting worker.
    const completed = await d
      .update(csrBuildJobs)
      .set({
        status: 'complete',
        progress: 100,
        error: null,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(ownsAttempt)
      .returning({ id: csrBuildJobs.id });
    if (completed.length !== 1) return;
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
    // 7. Failure: SDK/DB errors can include study observations, prompt text or
    // credential-bearing connection strings. Neither logs nor the persisted
    // job error (returned to the client) may include raw Error.message.
    // Preserve only a stable, bounded CSR_* machine code.
    const refusal = safeCsrJobFailure(err);
    const failed = await d
      .update(csrBuildJobs)
      .set({
        status: 'failed',
        updatedAt: new Date(),
        error: {
          ...refusal,
          section: currentSection.number || null,
          at: new Date().toISOString(),
        },
      })
      .where(ownsAttempt).returning({ id: csrBuildJobs.id });
    if (failed.length === 1) {
      console.error(
        `[csr-job-runner] Job ${jobId} failed on section '${
          currentSection.number || '<setup>'
        }': ${refusal.message}`
      );
    }
  }
}

/**
 * Counts the verifiable, non-placeholder saved sections of a job, and says
 * whether a job recorded as complete fails its saved-output integrity check.
 */
function savedSectionsVerdict(
  row: { status: string; sectionsToGenerate: string[] | null },
  sectionRows: Array<{ sectionNumber: string; content: string; contentHash: string | null }>,
): { sectionsComplete: number; integrityFailure: boolean } {
  const resolvedTargets = retainedDraftTargets(row.sectionsToGenerate ?? null);
  const targetCodes = resolvedTargets?.map(section => section.number) ?? row.sectionsToGenerate ?? [];
  const validTargets = !!resolvedTargets && targetCodes.length > 0;
  const integrity = validTargets
    ? verifySavedCsrSectionIntegrity(targetCodes, sectionRows)
    : { covered: [], missing: targetCodes, mismatched: [] };
  const verified = new Set(integrity.covered);
  const sectionsComplete = sectionRows.filter(section =>
    verified.has(section.sectionNumber) && !hasUnresolvedPlaceholders(section.content)
  ).length;
  const integrityFailure = row.status === 'complete' &&
    (sectionRows.length === 0 || integrity.mismatched.length > 0 || integrity.missing.length > 0 ||
      sectionsComplete !== targetCodes.length);
  return { sectionsComplete, integrityFailure };
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
      sectionsToGenerate: csrBuildJobs.sectionsToGenerate,
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

  // Only count verifiable, non-placeholder sections. A persisted row alone
  // does not mean its content is complete or safe to reuse.
  const sectionRows = await d
    .select({
      sectionNumber: csrSectionOutputs.sectionNumber,
      content: csrSectionOutputs.content,
      contentHash: csrSectionOutputs.contentHash,
    })
    .from(csrSectionOutputs)
    .where(
      and(
        eq(csrSectionOutputs.jobId, jobId),
        eq(csrSectionOutputs.organizationId, organizationId)
      )
    );
  const { sectionsComplete, integrityFailure } = savedSectionsVerdict(row, sectionRows);

  return {
    status: integrityFailure ? 'failed' : row.status,
    progress: integrityFailure ? 0 : row.progress,
    sectionsComplete,
    error: integrityFailure
      ? { reason: 'saved_section_integrity_failed', message: 'Saved CSR outputs require integrity review.' }
      : row.error ?? null,
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
