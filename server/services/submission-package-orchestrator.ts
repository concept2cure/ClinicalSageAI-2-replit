/**
 * @fileoverview Submission-Package Orchestrator
 * @module server/services/submission-package-orchestrator
 *
 * The meta-service that sequences artifacts → sections → modules → ZIP for an
 * IND/NDA/BLA/510(k) submission. Closes the gap identified in the audit:
 * services exist (csr-builder, module3Composer, m2-summary-builders, ectdExportService)
 * but no single coordinator runs them in dependency order, regenerates downstream when
 * upstream changes, or records an audit log of inputs to the package.
 *
 * Pipeline:
 *
 *   ┌──────────────┐   ┌──────────────────┐   ┌──────────────────┐
 *   │ Source data  │──▶│ Module 3 (S/P/   │──▶│ M2.3 Quality OS  │──┐
 *   │ ingestion    │   │ A/R) composition │   │                  │  │
 *   └──────────────┘   └──────────────────┘   └──────────────────┘  │
 *   ┌──────────────┐   ┌──────────────────┐   ┌──────────────────┐  │
 *   │ Nonclinical  │──▶│ Module 4 stubs   │──▶│ M2.4 Nonclin OV  │──┤   ┌────────────┐
 *   │ studies      │   │                  │   │                  │  ├──▶│ M1 admin   │
 *   └──────────────┘   └──────────────────┘   └──────────────────┘  │   └────────────┘
 *   ┌──────────────┐   ┌──────────────────┐   ┌──────────────────┐  │         │
 *   │ Study DB     │──▶│ CSR §10–§12      │──▶│ M2.7 Clinical Sm │──┤         ▼
 *   │ (CDISC)      │   │ tabulations      │   │                  │  │   ┌────────────┐
 *   └──────────────┘   └──────────────────┘   └──────────────────┘  └──▶│ Validator  │
 *                                                                       │ + ZIP +    │
 *                                                                       │ Audit log  │
 *                                                                       └────────────┘
 *
 * Each step is idempotent. When an upstream artifact changes, downstream steps
 * are marked `stale` and can be re-run by `regenerateAffected()`.
 */

import { pool } from '../db.js';
import crypto from 'crypto';
import {
  composeFullModule3,
  type RegionCode,
} from './module3-extensions.js';
import {
  buildM23QualityOverallSummary,
  buildM24NonclinicalOverview,
  buildM25ClinicalOverview,
  buildM27ClinicalSummary,
  type M2Summary,
  type NonclinicalStudy,
  type CSRSummaryInput,
} from './m2-summary-builders.js';
import {
  buildCSRTables,
  type StudyData,
  type CSRTables,
} from './csr-tabulation-builders.js';
import type { CanonicalSource, ComposedSection } from './module3Composer.js';
import {
  buildModule3WithNarrative,
  type SectionRefinementMeta,
} from './cmc/module3-narrative-builder.js';
import {
  validateEctdPackageHardened,
  type HardenedValidationResult,
  type HardenedValidationContext,
} from './ectd/ectd-validator-hardening.js';
import type { ECTDLeaf } from './ectd/ectd4-validator.js';
import { launchCSRBuildAsync } from './csr-builder.js';
import { getCSRBuildJobStatus } from './csr/csr-job-runner.js';

// ── Types ───────────────────────────────────────────────────────────────────

export type StepKey =
  | 'm3.compose'
  | 'm3.refine'
  | 'm3.appendices'
  | 'm3.regional'
  | 'csr.tabulate'
  | 'csr.draft-narrative'
  | 'm2.3.qos'
  | 'm2.4.nonclinical'
  | 'm2.5.clinical'
  | 'm2.7.clinical'
  | 'm1.admin'
  | 'package.assemble'
  | 'package.validate';

/**
 * Per-step status values.
 *
 * `awaiting-async` is the Move-6 addition: a step has kicked off external
 * async work (csr-job-runner has a jobId) and is waiting for the worker to
 * finish before the orchestrator can move on. It is NOT a terminal status —
 * the run sits in `awaiting-async` until a caller (or a background poller)
 * invokes runOrchestrator(inputs, { resumeRunId }) to drive the step to
 * `complete` (or `failed`) and run the downstream steps.
 *
 * Lifecycle:
 *   pending → running → (awaiting-async →) complete | failed
 *                      \─ skipped (no inputs)
 *                      \─ stale  (regenerate marker)
 *
 * `awaiting-async` is persisted into the steps JSONB column without a CHECK
 * constraint (see migration 0018 line 47: `status TEXT NOT NULL`), so no
 * step-table migration is needed. The run-level status column DOES carry a
 * CHECK constraint and is widened in
 * migrations/20260629_orchestrator_awaiting_async_status.sql.
 */
export type StepStatus =
  | 'pending'
  | 'running'
  | 'awaiting-async'
  | 'complete'
  | 'failed'
  | 'stale'
  | 'skipped';

export interface OrchestratorRun {
  runId: string;
  /** Tenant scope — pinned at run creation; every persistence call carries this. */
  organizationId: number;
  submissionId: string;
  applicationNumber: string;
  region: RegionCode;
  submissionType: string;
  startedAt: string;
  completedAt?: string;
  /**
   * Run-level status. `awaiting-async` mirrors the per-step status of the
   * same name — the run is sitting on an external worker (csr-job-runner)
   * and will resume when the caller invokes
   * runOrchestrator(inputs, { resumeRunId }) or
   * getRunResumeReadiness(runId, orgId) returns { ready: true }. The DB
   * CHECK constraint on this column is widened in
   * migrations/20260629_orchestrator_awaiting_async_status.sql.
   */
  status: 'running' | 'awaiting-async' | 'complete' | 'failed' | 'partial';
  steps: StepRecord[];
}

export interface StepRecord {
  key: StepKey;
  status: StepStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  inputHash: string;
  outputHash?: string;
  /** Step-specific output reference (e.g. composed section keys, summary id) */
  outputRef?: string;
  /** Error message if failed */
  error?: string;
  /** Upstream step keys this depended on */
  dependsOn: StepKey[];
}

export interface OrchestratorInputs {
  /**
   * Tenant scope. Required. Every persisted run + audit row is filtered by this.
   * Must be a positive finite integer; runOrchestrator throws otherwise.
   */
  organizationId: number;
  submissionId: string;
  applicationNumber: string;
  /**
   * 4-digit zero-padded eCTD sequence number. Required by the hardened
   * validator's sequence-gap detection (`SEQ_*` finding codes). Defaults
   * to '0000' (initial submission) when not supplied so existing callers
   * that never set this don't suddenly fail Move 3 wiring.
   */
  sequenceNumber?: string;
  region: RegionCode;
  submissionType: 'IND' | 'NDA' | 'BLA' | '510k' | 'PMA' | 'JNDA' | 'MAA';
  /** Module 3 source-of-truth records */
  cmcSources: CanonicalSource[];
  /** Module 4 nonclinical study summaries */
  nonclinicalStudies: NonclinicalStudy[];
  /** Per-study CSR raw data (for §10–§12 tabulation) */
  clinicalStudyData: StudyData[];
  /** Per-study CSR summary inputs (for M2.7) */
  csrInputs: CSRSummaryInput[];
  /** Project metadata */
  drugSubstanceName?: string;
  drugProductName?: string;
  indication?: string;
  /** Optional: skip validation step */
  skipValidation?: boolean;
  /**
   * When true, run the m3.refine step which calls
   * `buildModule3WithNarrative` with `useAI: true` to refine each composed
   * Module 3 section's narrative through the AI gateway (with hallucination
   * guard, Part-11 prompt-version capture, and per-section fallback meta).
   *
   * Default is `false` — the deterministic `composeFullModule3` path stays
   * the default for production runs. Opt-in only.
   */
  useAI?: boolean;
  /**
   * Required when `useAI=true`: the actor id is captured by the gateway for
   * Part-11 / audit-trail attribution on every refinement call. Ignored
   * when `useAI` is false.
   *
   * Also used by the `csr.draft-narrative` step (Move 6) as the
   * `requestedBy` actor on the enqueued csr_build_jobs row when that step
   * is enabled — required for Part-11 attribution on the async narrative
   * draft. Optional only because the step itself is opt-in via
   * `enableCSRNarrative`.
   */
  userId?: number;
  /**
   * Optional project id. Threaded through to csr-job-runner as
   * `ctx.projectId` so the enqueued job's audit / billing / row-level
   * scoping align with the project the submission belongs to. When
   * unset, the job is org-scoped only — which is acceptable for legacy
   * callers but loses the per-project attribution.
   */
  projectId?: number;
  /**
   * When true, run the `csr.draft-narrative` step (Move 6). The step calls
   * `launchCSRBuildAsync` for each entry in `csrInputs`, persists the
   * resulting jobId(s) on the step output, and transitions the run to the
   * `awaiting-async` state. The caller (or a background poller) then
   * resumes via `runOrchestrator(inputs, { resumeRunId })` once
   * `getRunResumeReadiness(runId, orgId)` reports the jobs complete.
   *
   * Defaults to `false`: the existing deterministic `csr.tabulate` path
   * (synchronous, ms) stays the production default. Opt-in only — the
   * narrative draft is a multi-minute, per-token-billed AI call.
   */
  enableCSRNarrative?: boolean;
}

export interface OrchestratorOutputs {
  module3Sections: ComposedSection[];
  csrTables: CSRTables[];
  m23?: M2Summary;
  m24?: M2Summary;
  m25?: M2Summary;
  m27?: M2Summary;
  /**
   * Assembled leaf manifest from package.assemble. Becomes the input to
   * package.validate. Derived from `module3Sections` (one leaf per composed
   * section); each leaf's MD5 is computed over the rendered narrative + tables
   * JSON so the validator's `enforceMd5Checksums` and study-id audit can run
   * against deterministic content. Buffer-level checksums against actual
   * on-disk PDFs are out of scope until the ZIP builder is wired in.
   */
  assembly?: AssembledPackage;
  /** Aggregate validation result if package.validate ran */
  validation?: HardenedValidationResult;
  /**
   * Output of the m3.refine step. Populated only when `inputs.useAI=true`
   * AND the refine step ran. Each entry captures the per-section model,
   * token cost, fallback flag and reason (`empty_input` / `empty_response`
   * / `hallucination_guard` / `gateway_error`), and grounding-token count.
   *
   * `meta` is one row per refined section.
   * `totalTokenCost` is the sum across all refined sections in USD.
   * `gatewayErrorFallbackCount` is the number of sections that fell back
   *   for compliance/operational reasons (policy, residency, missing key)
   *   as distinct from quality fallbacks — surfaced so the UI can warn the
   *   user that AI refinement was governance-blocked, not just lower-quality.
   *
   * When the step is `skipped` (useAI=false) this field is omitted entirely
   * so route handlers can use its presence as a signal that AI ran.
   */
  refinementMeta?: {
    meta: SectionRefinementMeta[];
    totalTokenCost: number;
    gatewayErrorFallbackCount: number;
  };
  /**
   * Output of the `csr.draft-narrative` step. Populated only when
   * `inputs.enableCSRNarrative=true` AND the step ran (i.e. `csrInputs`
   * was non-empty).
   *
   * `jobs[i]` records the studyId, protocolNumber, jobId, and the
   * terminal status reported by `getCSRBuildJobStatus` at the time the
   * resume path observed it. Before completion the jobs[].status is
   * `queued | drafting`; after, `complete | failed`.
   *
   * `pendingJobIds` is the subset still queued/drafting — non-empty when
   * the run is in `awaiting-async`, empty when the step has transitioned
   * to `complete` or `failed`.
   *
   * The presence of this field signals to route handlers that the async
   * narrative draft ran (or is running); absence means it was skipped.
   */
  csrNarrativeJobs?: {
    jobs: Array<{
      studyId: string;
      protocolNumber: string;
      jobId: number;
      status: string;
      progress: number;
      sectionsComplete: number;
      error?: unknown;
    }>;
    pendingJobIds: number[];
  };
}

/**
 * The contract between package.assemble and package.validate. The validator
 * consumes `leaves` + the context fields below; nothing else flows between
 * the two steps. Persisted on `OrchestratorOutputs.assembly` so that a
 * resumed run can re-validate without re-assembling, and so the step's
 * outputHash deterministically reflects what was validated.
 */
export interface AssembledPackage {
  leaves: ECTDLeaf[];
  totalSizeBytes: number;
  applicationNumber: string;
  sequenceNumber: string;
  region: RegionCode;
  submissionType: string;
}

// ── Dependency graph ────────────────────────────────────────────────────────

const STEP_DEPENDENCIES: Record<StepKey, StepKey[]> = {
  'm3.compose': [],
  // m3.refine sits between m3.compose and m3.regional. When inputs.useAI is
  // false, the step is `skipped` — downstream consumers (m3.regional,
  // m2.3.qos) read from `outputs.module3Sections` which holds the
  // deterministic composer output, so a skipped refine is equivalent to a
  // complete one for dependency-graph purposes.
  'm3.refine': ['m3.compose'],
  'm3.appendices': ['m3.compose'],
  'm3.regional': ['m3.compose', 'm3.refine'],
  'csr.tabulate': [],
  // csr.draft-narrative (Move 6): async ICH-E3 §1-§9/§13-§16 AI narrative
  // drafting via csr-job-runner. Depends on csr.tabulate purely for graph
  // ordering — the table builder runs in ms; the narrative draft can take
  // minutes per study and is per-token billed. m2.7.clinical (Clinical
  // Summary) depends on this step because the integrated CSR narrative is
  // what M2.7 summarizes. When inputs.enableCSRNarrative is false the
  // step is `skipped` and m2.7.clinical proceeds against the tabulated
  // outputs only — skipped is functionally equivalent to complete for
  // dependency-graph purposes.
  'csr.draft-narrative': ['csr.tabulate'],
  'm2.3.qos': ['m3.compose', 'm3.refine', 'm3.appendices', 'm3.regional'],
  'm2.4.nonclinical': [],
  'm2.5.clinical': ['csr.tabulate'],
  'm2.7.clinical': ['csr.tabulate', 'csr.draft-narrative'],
  'm1.admin': [],
  'package.assemble': ['m2.3.qos', 'm2.4.nonclinical', 'm2.5.clinical', 'm2.7.clinical', 'm1.admin'],
  'package.validate': ['package.assemble'],
};

const ORDERED_STEPS: StepKey[] = [
  'm3.compose',
  'm3.refine',
  'm3.appendices',
  'm3.regional',
  'csr.tabulate',
  'm2.3.qos',
  'm2.4.nonclinical',
  'm2.5.clinical',
  // csr.draft-narrative is positioned between csr.tabulate and m2.7.clinical
  // (the only step that depends on it) — but PUSHED AS LATE AS POSSIBLE
  // within that window so that m2.3 / m2.4 / m2.5 (which do NOT depend on
  // it) finish synchronously before we transition the run to
  // `awaiting-async`. If we returned awaiting-async earlier in the
  // sequence we'd leave those independent steps `pending` until the resume
  // path picked them up, which wastes a polling cycle for no reason.
  'csr.draft-narrative',
  'm2.7.clinical',
  'm1.admin',
  'package.assemble',
  'package.validate',
];

// ── Hashing for incremental rebuilds ────────────────────────────────────────

function hashInputs(...inputs: unknown[]): string {
  const h = crypto.createHash('sha256');
  for (const input of inputs) {
    // JSON.stringify(undefined) returns undefined (not a string), which would
    // make crypto.Hash.update throw TypeError. Coerce undefined → "" so that
    // any caller passing an optional/undefined field cannot crash the run.
    const serialized = input === undefined ? '' : JSON.stringify(input);
    h.update(serialized ?? '');
  }
  return h.digest('hex');
}

function hashOutput(output: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(output)).digest('hex');
}

// ── Leaf-manifest derivation (package.assemble → package.validate hand-off) ──

/**
 * Map a Module 3 section key (e.g. "3.2.S.4.1") to the eCTD leaf section
 * code (e.g. "m3.2.S.4.1") expected by the hardened validator's
 * regional + study-id audits. Module 2 / Module 1 placeholder leaves use
 * the same shape.
 */
function sectionKeyToLeafCode(sectionKey: string): string {
  // sectionKey is "3.2.S.1" / "3.2.P.8" / "3.2.A.2" / "3.2.R.1.US" etc.
  // Validator expects "m3.2.S.1" / "m5.3.5" / "m4.2.3" style.
  return `m${sectionKey}`;
}

/**
 * Map a section key to a stable on-disk relative path. Validator + regional
 * rules key off filePath (FDA ESG ASCII filename rule, MD5 audit lookup,
 * EU/JP regional file presence checks) so the path has to be deterministic
 * given the same inputs.
 */
function sectionKeyToFilePath(sectionKey: string): string {
  // "3.2.S.1" → "m3/32-s-1/content.xml". Lowercase + dots-to-dashes keeps
  // the path ASCII-safe per FDA ESG Technical Conformance Guide §3.2.1.
  const slug = sectionKey.toLowerCase().replace(/\./g, '-');
  return `m3/${slug}/content.xml`;
}

/**
 * Build the leaf manifest that `package.validate` consumes. Each composed
 * Module 3 section becomes one leaf; the MD5 is computed over its rendered
 * payload so subsequent runs over identical inputs produce byte-identical
 * checksums (which the validator's `enforceMd5Checksums` then reads back).
 *
 * This is a "derived" manifest — it stands in for a real ZIP builder until
 * the export pipeline is wired into the orchestrator. The validator's leaf
 * checks (study-id tagging, MD5 format, regional path rules) all run
 * against this shape; only buffer-level checksum-mismatch detection is
 * deferred (the validator will skip MD5_MISMATCH when no buffers are
 * passed — by design).
 */
function buildLeafManifestFromSections(sections: ComposedSection[]): ECTDLeaf[] {
  return sections.map(s => {
    const payload = JSON.stringify({
      narrative: s.narrativeDraft,
      tables: s.tables,
      structured: s.structuredPayload,
    });
    const checksum = crypto.createHash('md5').update(payload).digest('hex');
    return {
      sectionCode: sectionKeyToLeafCode(s.sectionKey),
      title: s.sectionKey,
      checksum,
      checksumType: 'md5',
      operation: 'new',
      filePath: sectionKeyToFilePath(s.sectionKey),
      mimeType: 'text/xml',
      fileSize: Buffer.byteLength(payload, 'utf8'),
    };
  });
}

// ── Audit log persistence ───────────────────────────────────────────────────

/**
 * Postgres error codes that indicate the running service code is incompatible
 * with the live DB schema — NOT transient connectivity issues. Swallowing
 * these turns every run into a permanently-orphaned in-memory object
 * (route returns 200 + runId, subsequent getRun returns 404). Re-throw so
 * the route handler returns 500 and the operator sees the real failure
 * instead of a silent data-loss path.
 *
 * Codes:
 *   42703 undefined_column        — e.g. organization_id missing pre-migration
 *   42P01 undefined_table         — orchestrator tables not created
 *   23502 not_null_violation      — column tightened to NOT NULL after write paths assumed nullable
 *   23503 foreign_key_violation   — organizations row deleted under us, or wrong FK target
 *   23514 check_violation         — value rejected by a CHECK we should have validated first
 *
 * Connection-level / transient codes (08*, 57*) and ON CONFLICT race
 * losers stay on the swallow path because retrying or running in-memory is
 * the safe default for those.
 */
const SCHEMA_SHAPE_ERROR_CODES = new Set(['42703', '42P01', '23502', '23503', '23514']);

function isSchemaShapeError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' && SCHEMA_SHAPE_ERROR_CODES.has(code);
}

async function persistRun(run: OrchestratorRun): Promise<void> {
  // Defense-in-depth: callers (runOrchestrator) already guard, but persistRun
  // is the last hop before the row hits the DB. Refuse to write a row that
  // would coerce to NULL organization_id under Path B (nullable column),
  // because such a row goes DARK to every tenant-scoped read.
  if (!Number.isFinite(run.organizationId) || run.organizationId <= 0) {
    throw new Error(
      `[Orchestrator] persistRun: organizationId must be a positive integer (got: ${String(run.organizationId)})`
    );
  }
  try {
    await pool.query(
      `INSERT INTO submission_orchestrator_runs
        (run_id, organization_id, submission_id, application_number, region, submission_type, started_at, completed_at, status, steps)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (run_id) DO UPDATE SET
         completed_at = EXCLUDED.completed_at,
         status = EXCLUDED.status,
         steps = EXCLUDED.steps`,
      [
        run.runId,
        run.organizationId,
        run.submissionId,
        run.applicationNumber,
        run.region,
        run.submissionType,
        run.startedAt,
        run.completedAt || null,
        run.status,
        JSON.stringify(run.steps),
      ]
    );
  } catch (err) {
    // Schema-shape mismatches are NOT non-fatal — they mean every run will
    // be permanently invisible to subsequent reads. Surface to the route.
    if (isSchemaShapeError(err)) {
      const code = (err as { code?: string }).code;
      console.error(
        `[Orchestrator] persistRun: schema-shape error ${code} — re-throwing to avoid silent dark-row creation:`,
        err instanceof Error ? err.message : err
      );
      throw err;
    }
    console.warn('[Orchestrator] persistRun failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}

async function persistStepEvent(
  runId: string,
  organizationId: number,
  step: StepRecord,
  eventType: 'start' | 'complete' | 'fail' | 'stale'
): Promise<void> {
  // Defense-in-depth: same rationale as persistRun.
  if (!Number.isFinite(organizationId) || organizationId <= 0) {
    throw new Error(
      `[Orchestrator] persistStepEvent: organizationId must be a positive integer (got: ${String(organizationId)})`
    );
  }
  try {
    await pool.query(
      `INSERT INTO submission_orchestrator_steps
        (run_id, organization_id, step_key, event_type, status, input_hash, output_hash, output_ref, error, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        runId,
        organizationId,
        step.key,
        eventType,
        step.status,
        step.inputHash,
        step.outputHash || null,
        step.outputRef || null,
        step.error || null,
      ]
    );
  } catch (err) {
    if (isSchemaShapeError(err)) {
      const code = (err as { code?: string }).code;
      console.error(
        `[Orchestrator] persistStepEvent: schema-shape error ${code} — re-throwing to avoid silent dark-audit-row creation:`,
        err instanceof Error ? err.message : err
      );
      throw err;
    }
    console.warn('[Orchestrator] persistStepEvent failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}

// ── Top-level orchestration ─────────────────────────────────────────────────

/**
 * Per-call options for runOrchestrator.
 *
 * `resumeRunId` switches the orchestrator out of fresh-run mode and into
 * resume mode. When set, runOrchestrator:
 *   1. Loads the previous run via getRun(resumeRunId, inputs.organizationId)
 *      and refuses to proceed on tenant mismatch (cross-tenant resume probes
 *      collapse to a thrown error).
 *   2. Finds the first awaiting-async step on that run (today: only
 *      csr.draft-narrative qualifies).
 *   3. Polls the persisted jobId(s) via getCSRBuildJobStatus.
 *   4. If still queued/drafting: returns the run unchanged so the caller
 *      can poll again later.
 *   5. If complete: transitions the step to `complete` and runs every
 *      downstream step (the ones that were `pending` at the
 *      awaiting-async return).
 *   6. If failed: marks the step `failed`, run status follows. csr-job-runner's
 *      possible statuses today are `queued | drafting | complete | failed` — any
 *      unrecognized terminal state (e.g. a future `cancelled`) is treated as
 *      failed by getRunResumeReadiness rather than left pending forever.
 *
 * In v2, a webhook from csr-job-runner would call this with the same
 * resumeRunId; v1's contract is poll-driven via
 * `getRunResumeReadiness(runId, organizationId)`.
 */
export interface RunOrchestratorOptions {
  resumeRunId?: string;
}

/**
 * Storage shape persisted onto the csr.draft-narrative step's
 * `outputRef`/output payload so the resume path can re-discover the
 * background jobs without re-deriving them from inputs. Each entry is the
 * tuple (studyId, protocolNumber, jobId).
 *
 * Persisted as JSON in the steps JSONB column, retrieved by the resume
 * path via `JSON.parse(step.outputRef)` (the orchestrator's outputRef is
 * a free-form string field on StepRecord; we serialize to JSON for the
 * narrative step because the structured jobId list is what the resume
 * path needs).
 */
interface CSRNarrativeStepPayload {
  jobs: Array<{ studyId: string; protocolNumber: string; jobId: number }>;
}

function tryParseNarrativePayload(
  raw: string | undefined
): CSRNarrativeStepPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as CSRNarrativeStepPayload).jobs)
    ) {
      return parsed as CSRNarrativeStepPayload;
    }
  } catch {
    /* fall through */
  }
  return null;
}

export async function runOrchestrator(
  inputs: OrchestratorInputs,
  opts?: RunOrchestratorOptions
): Promise<{ run: OrchestratorRun; outputs: OrchestratorOutputs }> {
  // Tenant gate — fail fast before any DB write so we never persist an unscoped row.
  if (!Number.isFinite(inputs.organizationId) || inputs.organizationId <= 0) {
    throw new Error(
      `[Orchestrator] organizationId is required and must be a positive integer (got: ${String(inputs.organizationId)})`
    );
  }

  // ── Resume branch ────────────────────────────────────────────────────────
  // When opts.resumeRunId is set, we are picking up a previously-suspended
  // run that returned in `awaiting-async` state. Delegate to the resume
  // helper which loads + tenant-checks + polls + drives the run forward.
  if (opts?.resumeRunId) {
    return resumeOrchestratorRun(inputs, opts.resumeRunId);
  }

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  const run: OrchestratorRun = {
    runId,
    organizationId: inputs.organizationId,
    submissionId: inputs.submissionId,
    applicationNumber: inputs.applicationNumber,
    region: inputs.region,
    submissionType: inputs.submissionType,
    startedAt,
    status: 'running',
    steps: ORDERED_STEPS.map(key => ({
      key,
      status: 'pending',
      inputHash: '',
      dependsOn: STEP_DEPENDENCIES[key],
    })),
  };

  await persistRun(run);

  const outputs: OrchestratorOutputs = {
    module3Sections: [],
    csrTables: [],
  };

  // Helper: locate a step record
  const stepOf = (key: StepKey): StepRecord => run.steps.find(s => s.key === key)!;

  // Helper: run a step, with start/complete tracking
  const runStep = async (
    key: StepKey,
    inputHash: string,
    fn: () => Promise<{ outputRef: string; output: unknown } | null>
  ): Promise<void> => {
    const step = stepOf(key);
    step.inputHash = inputHash;
    step.status = 'running';
    step.startedAt = new Date().toISOString();
    await persistStepEvent(runId, run.organizationId, step, 'start');

    const t0 = Date.now();
    try {
      const result = await fn();
      step.completedAt = new Date().toISOString();
      step.durationMs = Date.now() - t0;
      if (result === null) {
        step.status = 'skipped';
        step.outputHash = undefined;
        step.outputRef = 'skipped (no inputs)';
      } else {
        step.status = 'complete';
        step.outputHash = hashOutput(result.output);
        step.outputRef = result.outputRef;
      }
      await persistStepEvent(runId, run.organizationId, step, 'complete');
    } catch (err) {
      step.completedAt = new Date().toISOString();
      step.durationMs = Date.now() - t0;
      step.status = 'failed';
      step.error = err instanceof Error ? err.message : String(err);
      await persistStepEvent(runId, run.organizationId, step, 'fail');
      throw err;
    }
  };

  try {
    // Step: m3.compose (core S/P sections)
    const m3Hash = hashInputs(inputs.cmcSources, inputs.region);
    await runStep('m3.compose', m3Hash, async () => {
      if (inputs.cmcSources.length === 0) return null;
      const fullM3 = composeFullModule3(inputs.cmcSources, inputs.region);
      // Split: S/P core go to m3.compose; A/R get split into their own steps for traceability
      const core = fullM3.filter(s => /^3\.[123]|^3\.2\.[SP]/.test(s.sectionKey));
      outputs.module3Sections = fullM3;
      return { outputRef: `m3.compose:${core.length}-core-sections`, output: core };
    });

    // m3.refine — optional AI-grounded narrative refinement on top of the
    // deterministic m3.compose output. When inputs.useAI is false this step
    // is `skipped` and downstream steps (m3.regional, m2.3.qos) read the
    // unchanged deterministic narratives from outputs.module3Sections —
    // skipped is functionally equivalent to complete for dependency
    // purposes. When useAI is true:
    //   - re-runs the deterministic composer inside buildModule3WithNarrative
    //     (it's the same composeModule3FromCanonicalSources call), then
    //     refines each section via the gateway (hallucination guard,
    //     prompt-version capture, per-section fallback meta).
    //   - swaps outputs.module3Sections to the refined sections so
    //     downstream consumers see the AI-improved narrative.
    //   - persists refinementMeta on outputs so the route can return it.
    //   - any internal error fails the step (which fails the run), with
    //     the deterministic outputs.module3Sections from m3.compose
    //     remaining intact for inspection.
    const refineHash = hashInputs(
      inputs.useAI ?? false,
      // Hash the inputs that actually drive AI: source content + tenant scope.
      // Skipping this when useAI=false keeps the hash stable across runs that
      // never invoke AI, which is the common production case.
      inputs.useAI ? inputs.cmcSources : null,
      inputs.useAI ? inputs.organizationId : null,
      inputs.useAI ? inputs.userId ?? null : null,
    );
    await runStep('m3.refine', refineHash, async () => {
      if (!inputs.useAI) {
        // Skipped — downstream proceeds with the deterministic m3.compose
        // output. Returning null is the existing convention for `skipped`.
        return null;
      }
      if (outputs.module3Sections.length === 0) {
        // Nothing to refine if m3.compose produced no sections.
        return null;
      }
      // userId is required by buildModule3WithNarrative when useAI=true so
      // the gateway can attribute the call for Part-11 / audit trail. We
      // mandate it at the orchestrator boundary rather than silently using
      // a sentinel value — silent attribution would be a Part-11 violation.
      if (inputs.userId === undefined || inputs.userId === null) {
        throw new Error(
          '[Orchestrator] m3.refine: inputs.userId is required when inputs.useAI=true (Part-11 audit-trail attribution)',
        );
      }
      // buildModule3WithNarrative expects a positive-integer projectId so
      // its narrative-builder tenant boundary check (compares
      // source.projectId !== projectId) admits the AI call's sources.
      //
      // Prefer the discrete `inputs.projectId` field — that is the value
      // csr.draft-narrative threads through to launchCSRBuildAsync, so
      // attributing m3.refine under the same projectId keeps audit/Part-11
      // records consistent across the two AI-touching steps.
      //
      // Only fall back to coercing `submissionId` when projectId is absent.
      // Many callers pass a non-numeric submissionId (e.g. 'SUB-2026-001',
      // a UUID) and the coercion path would throw even when a perfectly
      // valid inputs.projectId was supplied.
      const refineProjectId =
        inputs.projectId !== undefined && inputs.projectId !== null
          ? inputs.projectId
          : (() => {
              const pid = Number(inputs.submissionId);
              if (!Number.isInteger(pid) || pid <= 0) {
                throw new Error(
                  `[Orchestrator] m3.refine: inputs.projectId is required (and inputs.submissionId=${inputs.submissionId} ` +
                    `cannot be coerced to a positive integer); narrative-builder requires a projectId for tenant scoping.`,
                );
              }
              return pid;
            })();
      const result = await buildModule3WithNarrative(
        inputs.organizationId,
        refineProjectId,
        inputs.userId,
        inputs.cmcSources,
        { useAI: true },
      );

      // Swap the refined sections in so downstream steps (m3.regional,
      // m2.3.qos, package.assemble) consume the AI-refined narratives.
      // buildModule3WithNarrative preserves the section ordering and the
      // deterministic structuredPayload/tables — only narrativeDraft changes.
      outputs.module3Sections = result.sections;

      outputs.refinementMeta = {
        meta: result.refinementMeta,
        totalTokenCost: result.totalTokenCost,
        gatewayErrorFallbackCount: result.gatewayErrorFallbackCount,
      };

      return {
        outputRef:
          `m3.refine:${result.refinementMeta.length}-sections ` +
          `fallbacks=${result.refinementMeta.filter(m => m.fallback).length} ` +
          `gateway_errors=${result.gatewayErrorFallbackCount} ` +
          `cost=$${result.totalTokenCost.toFixed(4)}`,
        output: outputs.refinementMeta,
      };
    });

    // m3.appendices (already composed inside composeFullModule3, but tracked separately)
    const appendicesPresent = outputs.module3Sections.filter(s => s.sectionKey.startsWith('3.2.A'));
    await runStep('m3.appendices', hashOutput(appendicesPresent), async () => {
      if (appendicesPresent.length === 0) return null;
      return { outputRef: `m3.appendices:${appendicesPresent.length}`, output: appendicesPresent };
    });

    // m3.regional
    const regionalPresent = outputs.module3Sections.filter(s => s.sectionKey.startsWith('3.2.R'));
    await runStep('m3.regional', hashOutput(regionalPresent), async () => {
      if (regionalPresent.length === 0) return null;
      return { outputRef: `m3.regional:${regionalPresent.length}`, output: regionalPresent };
    });

    // csr.tabulate (one set of tables per study)
    const csrHash = hashInputs(inputs.clinicalStudyData);
    await runStep('csr.tabulate', csrHash, async () => {
      if (inputs.clinicalStudyData.length === 0) return null;
      outputs.csrTables = inputs.clinicalStudyData.map(buildCSRTables);
      return {
        outputRef: `csr.tabulate:${outputs.csrTables.length}-studies`,
        output: outputs.csrTables,
      };
    });

    // m2.3.qos
    const m23Hash = hashInputs(outputs.module3Sections, inputs.drugSubstanceName ?? '', inputs.drugProductName ?? '');
    await runStep('m2.3.qos', m23Hash, async () => {
      if (outputs.module3Sections.length === 0) return null;
      outputs.m23 = buildM23QualityOverallSummary({
        module3Sections: outputs.module3Sections,
        drugSubstanceName: inputs.drugSubstanceName,
        drugProductName: inputs.drugProductName,
      });
      return { outputRef: `m2.3.qos:completeness=${outputs.m23.completeness}`, output: outputs.m23 };
    });

    // m2.4.nonclinical
    const m24Hash = hashInputs(inputs.nonclinicalStudies, inputs.drugSubstanceName ?? '', inputs.indication ?? '');
    await runStep('m2.4.nonclinical', m24Hash, async () => {
      if (inputs.nonclinicalStudies.length === 0) return null;
      outputs.m24 = buildM24NonclinicalOverview({
        nonclinicalStudies: inputs.nonclinicalStudies,
        drugSubstanceName: inputs.drugSubstanceName,
        indication: inputs.indication,
      });
      return { outputRef: `m2.4.nonclinical:completeness=${outputs.m24.completeness}`, output: outputs.m24 };
    });

    // m2.5.clinical-overview
    const m25Hash = hashInputs(inputs.csrInputs, inputs.indication ?? '', inputs.drugProductName ?? '');
    await runStep('m2.5.clinical', m25Hash, async () => {
      if (inputs.csrInputs.length === 0) return null;
      outputs.m25 = buildM25ClinicalOverview({
        csrs: inputs.csrInputs,
        indication: inputs.indication || '[indication not specified]',
        investigationalProduct: inputs.drugProductName || inputs.drugSubstanceName || '[product]',
      });
      return { outputRef: `m2.5.clinical:completeness=${outputs.m25.completeness}`, output: outputs.m25 };
    });

    // csr.draft-narrative (Move 6) — async ICH-E3 §1-§9/§13-§16 AI narrative
    // drafting via csr-job-runner.launchCSRBuildAsync. The step:
    //   - is a no-op `skipped` when inputs.enableCSRNarrative !== true
    //     (the production default; csr.tabulate alone is the deterministic
    //     CSR path).
    //   - is `skipped` when csrInputs is empty (no studies to draft for).
    //   - enqueues one csr_build_jobs row PER csrInput study (the job
    //     runner handles per-section drafting + per-section persistence),
    //     persists the (studyId, protocolNumber, jobId) tuples on the
    //     step's outputRef as JSON, transitions the step to
    //     `awaiting-async`, marks the run `awaiting-async`, and returns
    //     control to the caller. The caller (or a background poller) is
    //     expected to invoke runOrchestrator(inputs, { resumeRunId }) once
    //     getRunResumeReadiness reports ready.
    //   - is `failed` when launchCSRBuildAsync throws at enqueue time
    //     (quota exhaustion, billing failure, DB outage on the
    //     csr_build_jobs insert). A failed enqueue does NOT advance to
    //     awaiting-async — the run.status follows the failed step via the
    //     existing failed-step count logic.
    const narrativeHash = hashInputs(
      inputs.enableCSRNarrative ?? false,
      inputs.enableCSRNarrative ? inputs.csrInputs : null,
      inputs.enableCSRNarrative ? inputs.organizationId : null,
      inputs.enableCSRNarrative ? inputs.projectId ?? null : null,
      inputs.enableCSRNarrative ? inputs.userId ?? null : null,
    );

    if (inputs.enableCSRNarrative && inputs.csrInputs.length > 0) {
      // Manually drive the step (not via runStep) because the success path
      // here is `awaiting-async` (a non-terminal status), which the
      // generic runStep helper cannot express — it only knows
      // complete/skipped/failed.
      const narrativeStep = stepOf('csr.draft-narrative');
      narrativeStep.inputHash = narrativeHash;
      narrativeStep.status = 'running';
      narrativeStep.startedAt = new Date().toISOString();
      await persistStepEvent(runId, run.organizationId, narrativeStep, 'start');

      // userId is required for Part-11 attribution on the enqueued
      // csr_build_jobs row. Mandate at the orchestrator boundary rather
      // than silently substituting user-id-0 (which would create
      // unattributable audit rows). Mirrors the m3.refine defense above.
      if (inputs.userId === undefined || inputs.userId === null) {
        const err = new Error(
          '[Orchestrator] csr.draft-narrative: inputs.userId is required when inputs.enableCSRNarrative=true (Part-11 audit-trail attribution)',
        );
        narrativeStep.completedAt = new Date().toISOString();
        narrativeStep.durationMs = 0;
        narrativeStep.status = 'failed';
        narrativeStep.error = err.message;
        await persistStepEvent(runId, run.organizationId, narrativeStep, 'fail');
        throw err;
      }

      const tNarrative = Date.now();
      try {
        // ICH-E3 §1-§9 + §13-§16 are the AI-draftable sections (§10-§12
        // are the tabulation steps handled by csr.tabulate). Pass the
        // exact subset the task design specifies so we never trigger a
        // "full build of every leaf" by accident.
        const sectionsToGenerate = [
          '1', '2', '3', '4', '5', '6', '7', '8', '9',
          '13', '14', '15', '16',
        ];

        const enqueuedJobs: Array<{
          studyId: string;
          protocolNumber: string;
          jobId: number;
        }> = [];

        for (const csr of inputs.csrInputs) {
          // Map the orchestrator's CSRSummaryInput onto the csr-builder's
          // studyInfo shape. The runner persists protocolNumber as
          // studyId (see enqueueCSRBuildJob:156) so both ids are
          // preserved on the job row.
          const enqueued = await launchCSRBuildAsync(
            {
              organizationId: inputs.organizationId,
              // userId is asserted non-null at step entry above; the `!`
              // tells TS we already enforced the Part-11 attribution gate.
              userId: inputs.userId!,
              projectId: inputs.projectId,
              studyInfo: {
                // CSRBuildRequest.studyInfo is the AI-prompt shape; we map
                // every field present on CSRSummaryInput that the AI uses.
                // treatmentArms on CSRSummaryInput is a string[] (arm
                // labels), while CSRBuildRequest.studyInfo has no
                // treatment-arms slot — the arm narrative is folded into
                // the studyDesign / primaryEndpoint prose. Don't pass it.
                title: `${csr.protocolNumber} — ${inputs.indication ?? 'indication not specified'}`,
                protocolNumber: csr.protocolNumber,
                phase: csr.phase,
                indication: inputs.indication ?? '[indication not specified]',
                sponsor: '[sponsor]',
                investigationalProduct:
                  inputs.drugProductName ||
                  inputs.drugSubstanceName ||
                  '[product]',
                studyDesign: csr.studyDesign,
                primaryEndpoint: csr.primaryEndpoint,
                sampleSize: csr.sampleSize,
              },
              sectionsToGenerate,
            },
            {
              organizationId: inputs.organizationId,
              projectId: inputs.projectId,
              requestedBy: inputs.userId,
            },
          );

          enqueuedJobs.push({
            studyId: csr.studyId,
            protocolNumber: csr.protocolNumber,
            jobId: enqueued.jobId,
          });
        }

        const payload: CSRNarrativeStepPayload = { jobs: enqueuedJobs };
        narrativeStep.completedAt = undefined; // not yet complete
        narrativeStep.durationMs = Date.now() - tNarrative;
        narrativeStep.status = 'awaiting-async';
        narrativeStep.outputRef = JSON.stringify(payload);
        narrativeStep.outputHash = hashOutput(payload);

        // Expose to the caller via outputs (route handlers can return it).
        outputs.csrNarrativeJobs = {
          jobs: enqueuedJobs.map(j => ({
            studyId: j.studyId,
            protocolNumber: j.protocolNumber,
            jobId: j.jobId,
            status: 'queued',
            progress: 0,
            sectionsComplete: 0,
          })),
          pendingJobIds: enqueuedJobs.map(j => j.jobId),
        };

        // Persist a `complete` step event — the orchestrator considers
        // this step's "active" phase done; the actual draft work is now
        // owned by csr-job-runner. The audit row uses status=
        // 'awaiting-async' so a reader can distinguish this from a true
        // synchronous complete.
        await persistStepEvent(
          runId,
          run.organizationId,
          narrativeStep,
          'complete',
        );

        // Halt the synchronous pipeline. The run is suspended; the
        // remaining steps (m2.7.clinical, m1.admin, package.assemble,
        // package.validate) stay `pending` until the resume path drives
        // them.
        run.status = 'awaiting-async';
        run.completedAt = undefined;
        await persistRun(run);
        return { run, outputs };
      } catch (err) {
        narrativeStep.completedAt = new Date().toISOString();
        narrativeStep.durationMs = Date.now() - tNarrative;
        narrativeStep.status = 'failed';
        narrativeStep.error = err instanceof Error ? err.message : String(err);
        await persistStepEvent(
          runId,
          run.organizationId,
          narrativeStep,
          'fail',
        );
        // Re-throw so the outer catch sets run.status = 'failed' and
        // persists the run. This matches the failure semantics of every
        // other step run via runStep().
        throw err;
      }
    } else {
      // Skipped — narrative drafting is opt-in OR no studies were
      // provided. Use runStep's existing `null` convention via a manual
      // hand-rolled `skipped` transition so the audit row is consistent
      // with other skipped steps.
      const narrativeStep = stepOf('csr.draft-narrative');
      narrativeStep.inputHash = narrativeHash;
      narrativeStep.status = 'running';
      narrativeStep.startedAt = new Date().toISOString();
      await persistStepEvent(runId, run.organizationId, narrativeStep, 'start');
      narrativeStep.status = 'skipped';
      narrativeStep.completedAt = new Date().toISOString();
      narrativeStep.durationMs = 0;
      narrativeStep.outputRef = inputs.enableCSRNarrative
        ? 'skipped (no csrInputs)'
        : 'skipped (enableCSRNarrative=false)';
      await persistStepEvent(
        runId,
        run.organizationId,
        narrativeStep,
        'complete',
      );
    }

    // m2.7.clinical
    const m27Hash = hashInputs(inputs.csrInputs, inputs.indication ?? '');
    await runStep('m2.7.clinical', m27Hash, async () => {
      if (inputs.csrInputs.length === 0) return null;
      outputs.m27 = buildM27ClinicalSummary({
        csrs: inputs.csrInputs,
        indication: inputs.indication || '[indication not specified]',
        investigationalProduct: inputs.drugProductName || inputs.drugSubstanceName || '[product]',
      });
      return { outputRef: `m2.7.clinical:completeness=${outputs.m27.completeness}`, output: outputs.m27 };
    });

    // m1.admin — delegated to existing services (placeholder step record)
    await runStep('m1.admin', hashInputs(inputs.applicationNumber, inputs.region), async () => {
      return {
        outputRef: `m1.admin:delegated-to-${inputs.region.toLowerCase()}-regional-template`,
        output: { region: inputs.region, applicationNumber: inputs.applicationNumber },
      };
    });

    // package.assemble — emit the leaf manifest + validator context that
    // package.validate consumes downstream. Output shape was widened in
    // Move 3 (was an opaque section-count summary). The manifest is the
    // load-bearing contract between assemble and validate.
    const sequenceNumber = inputs.sequenceNumber ?? '0000';
    await runStep('package.assemble', hashOutput(outputs), async () => {
      const leaves = buildLeafManifestFromSections(outputs.module3Sections);
      const totalSizeBytes = leaves.reduce((sum, l) => sum + (l.fileSize || 0), 0);
      const assembled: AssembledPackage = {
        leaves,
        totalSizeBytes,
        applicationNumber: inputs.applicationNumber,
        sequenceNumber,
        region: inputs.region,
        submissionType: inputs.submissionType,
      };
      outputs.assembly = assembled;
      return {
        outputRef: `package.assemble:${leaves.length}-leaves`,
        output: assembled,
      };
    });

    // package.validate — Move 3: replace the deferred stub with a real call
    // to the hardened validator. The orchestrator now drives the same
    // gateway-readiness check that the standalone /validate/hardened route
    // exposes, so a `run.status === 'complete'` result actually means the
    // package would clear the FDA ESG / EMA CESP / PMDA gateway.
    //
    // gatewayReady === false makes the step fail (and therefore the run
    // status follows, via the existing failed-step count logic below). We
    // intentionally do NOT silently downgrade a non-gateway-ready package
    // to a "complete" run — that was the pre-Move-3 footgun.
    if (!inputs.skipValidation) {
      const assembly = outputs.assembly;
      if (!assembly) {
        // Defensive: package.assemble runs unconditionally above, so
        // outputs.assembly is always populated here. If a future refactor
        // re-orders the steps, fail loud rather than silently skipping
        // validation.
        throw new Error(
          '[Orchestrator] package.validate: no assembled package available — package.assemble must run first'
        );
      }
      await runStep('package.validate', hashOutput(assembly), async () => {
        const context: HardenedValidationContext = {
          submissionId: inputs.submissionId,
          // RegionCode ⊂ RegulatoryRegion (US/EU/JP/CA are members of both).
          // Cast is safe because OrchestratorInputs.region is the narrower
          // union; the validator accepts the wider union.
          region: assembly.region as HardenedValidationContext['region'],
          applicationNumber: assembly.applicationNumber,
          sequenceNumber: assembly.sequenceNumber,
          submissionType: assembly.submissionType,
          totalSizeBytes: assembly.totalSizeBytes,
          // leafBuffers intentionally omitted: this orchestrator path
          // derives leaf checksums from the composed-section payload (see
          // buildLeafManifestFromSections), so re-hashing the same payload
          // would always match. Real on-disk buffer comparison happens
          // when the ZIP builder is wired in.
        };
        const result = await validateEctdPackageHardened(
          assembly.leaves,
          context,
          /* backboneXml */ undefined
        );
        outputs.validation = result;

        // Surface gateway-readiness as a step failure so the run's final
        // status (computed below) reflects the validator's go/no-go call.
        // The thrown error is the existing failure path inside runStep —
        // it captures error message + persists a 'fail' step event with
        // the orchestrator-bound organizationId, so the audit row is
        // tenant-scoped (Move 1 invariant).
        if (!result.gatewayReady) {
          const errCount = result.summary.errors;
          const regionalErrCount = result.regional.filter(f => f.severity === 'error').length;
          const seqErrCount = result.sequence.filter(f => f.severity === 'error').length;
          throw new Error(
            `package not gateway-ready: ${errCount} structural error(s), ${regionalErrCount} regional error(s), ${seqErrCount} sequence error(s); hardenedScore=${result.hardenedScore}`
          );
        }

        return {
          outputRef: `package.validate:gateway-ready score=${result.hardenedScore}`,
          output: {
            gatewayReady: result.gatewayReady,
            hardenedScore: result.hardenedScore,
            summary: result.summary,
          },
        };
      });
    } else {
      stepOf('package.validate').status = 'skipped';
    }

    // Compute final run status
    const failedSteps = run.steps.filter(s => s.status === 'failed');
    const skippedSteps = run.steps.filter(s => s.status === 'skipped');
    run.status = failedSteps.length > 0
      ? 'partial'
      : skippedSteps.length === run.steps.length
        ? 'failed'
        : 'complete';
  } catch (err) {
    run.status = 'failed';
    console.error('[Orchestrator] run failed:', err);
  }

  run.completedAt = new Date().toISOString();
  await persistRun(run);

  return { run, outputs };
}

// ── Resume path (Move 6: awaiting-async support) ────────────────────────────

/**
 * Re-derive the orchestrator's in-memory `outputs` from inputs by re-running
 * the pure synchronous steps that produce them (m3.compose,
 * csr.tabulate). Used by the resume path so the downstream steps
 * (m2.7.clinical, m1.admin, package.assemble, package.validate) have the
 * artifact references they expect without us having to persist large
 * intermediate blobs to the DB.
 *
 * IMPORTANT: this does NOT re-execute AI-billed steps (m3.refine). If the
 * original run had m3.refine complete with `useAI=true`, the
 * outputs.module3Sections on resume will be the deterministic composer
 * output, not the AI-refined version. This is a v1 limitation — the
 * narrative draft is preserved on disk per study via the csr-job-runner's
 * per-section persistence, but the m3.refine output is in-memory-only on
 * the original run. v2 should persist m3.refine output to a side table
 * if a use case emerges where the assembled package needs the refined
 * narrative on a resumed pass.
 */
function rederiveSyncOutputsForResume(
  inputs: OrchestratorInputs,
): OrchestratorOutputs {
  const outputs: OrchestratorOutputs = {
    module3Sections: [],
    csrTables: [],
  };

  if (inputs.cmcSources.length > 0) {
    outputs.module3Sections = composeFullModule3(inputs.cmcSources, inputs.region);
  }
  if (inputs.clinicalStudyData.length > 0) {
    outputs.csrTables = inputs.clinicalStudyData.map(buildCSRTables);
  }

  return outputs;
}

/**
 * Drive a previously-suspended run forward.
 *
 * Loads previousRun (tenant-scoped), finds the awaiting-async step,
 * polls its persisted jobIds, and either:
 *   - returns the run unchanged if any job is still queued/drafting
 *   - transitions the step to `complete` and runs the remaining downstream
 *     steps if all jobs are complete
 *   - marks the step `failed` if any job failed/cancelled
 *
 * This is invoked from runOrchestrator when opts.resumeRunId is set.
 */
async function resumeOrchestratorRun(
  inputs: OrchestratorInputs,
  resumeRunId: string,
): Promise<{ run: OrchestratorRun; outputs: OrchestratorOutputs }> {
  const previousRun = await getRun(resumeRunId, inputs.organizationId);
  if (!previousRun) {
    throw new Error(
      `[Orchestrator] resume: run ${resumeRunId} not found or org mismatch`,
    );
  }
  if (previousRun.organizationId !== inputs.organizationId) {
    // Defensive: getRun already tenant-filters. This is belt + suspenders so
    // a future change to getRun semantics can't silently leak a cross-tenant
    // resume.
    throw new Error(
      `[Orchestrator] resume: tenant mismatch — previousRun.organizationId=${previousRun.organizationId} but inputs.organizationId=${inputs.organizationId}`,
    );
  }

  const awaitingStep = previousRun.steps.find(s => s.status === 'awaiting-async');
  if (!awaitingStep) {
    // No awaiting-async step → nothing to resume. Return the run unchanged.
    // The caller is expected to have used getRunResumeReadiness to gate this
    // call, so reaching here is unusual but not an error.
    const outputs = rederiveSyncOutputsForResume(inputs);
    return { run: previousRun, outputs };
  }

  // Today only csr.draft-narrative produces awaiting-async. Defensive guard
  // for future steps that adopt the pattern.
  if (awaitingStep.key !== 'csr.draft-narrative') {
    throw new Error(
      `[Orchestrator] resume: unexpected awaiting-async step '${awaitingStep.key}' — only csr.draft-narrative is supported today`,
    );
  }

  const payload = tryParseNarrativePayload(awaitingStep.outputRef);
  if (!payload) {
    throw new Error(
      `[Orchestrator] resume: csr.draft-narrative step has no parseable jobs payload (outputRef='${awaitingStep.outputRef ?? ''}')`,
    );
  }

  // Poll every enqueued job. We collapse the set of (status, progress,
  // sectionsComplete, error) reads into a single composite outcome:
  //   - any 'failed' → step failed
  //   - any not 'complete' (and none failed) → still awaiting
  //   - all 'complete' → step done, proceed
  const jobStatuses: Array<{
    studyId: string;
    protocolNumber: string;
    jobId: number;
    status: string;
    progress: number;
    sectionsComplete: number;
    error?: unknown;
  }> = [];

  for (const job of payload.jobs) {
    const status = await getCSRBuildJobStatus(job.jobId, inputs.organizationId);
    if (!status) {
      // Job vanished (or org mismatch). Treat as failure — we cannot tell
      // the difference between "deleted" and "cross-tenant" so the safe
      // default is to fail the step rather than hang awaiting forever.
      jobStatuses.push({
        studyId: job.studyId,
        protocolNumber: job.protocolNumber,
        jobId: job.jobId,
        status: 'missing',
        progress: 0,
        sectionsComplete: 0,
        error: 'job not found or org mismatch',
      });
      continue;
    }
    jobStatuses.push({
      studyId: job.studyId,
      protocolNumber: job.protocolNumber,
      jobId: job.jobId,
      status: status.status,
      progress: status.progress,
      sectionsComplete: status.sectionsComplete,
      error: status.error,
    });
  }

  // 'missing' is set above when getCSRBuildJobStatus returns null.
  // 'failed' is csr-job-runner's terminal failure status.
  // 'queued' and 'drafting' are the known pending statuses; any other
  // string (including a future 'cancelled') is treated as terminal-failure
  // here so a status the orchestrator wasn't taught about cannot leave the
  // resume path spinning forever.
  const PENDING_STATUSES = new Set(['queued', 'drafting']);
  const anyFailed = jobStatuses.some(
    j =>
      j.status === 'failed' ||
      j.status === 'missing' ||
      (j.status !== 'complete' && !PENDING_STATUSES.has(j.status)),
  );
  const allComplete = jobStatuses.every(j => j.status === 'complete');

  // Rebuild the in-memory outputs so downstream steps (and the
  // outputs.csrNarrativeJobs surfaced to the caller) are populated even on
  // a "still awaiting" return.
  const outputs = rederiveSyncOutputsForResume(inputs);
  outputs.csrNarrativeJobs = {
    jobs: jobStatuses,
    pendingJobIds: jobStatuses
      .filter(j => j.status !== 'complete' && j.status !== 'failed' && j.status !== 'missing')
      .map(j => j.jobId),
  };

  // ── Failure: mark the step `failed` and the run `failed` ─────────────────
  if (anyFailed) {
    const stepRef = previousRun.steps.find(s => s.key === 'csr.draft-narrative');
    if (stepRef) {
      stepRef.status = 'failed';
      stepRef.completedAt = new Date().toISOString();
      stepRef.error = jobStatuses
        .filter(j => j.status === 'failed' || j.status === 'missing')
        .map(j => `${j.protocolNumber}/${j.jobId}: ${typeof j.error === 'string' ? j.error : JSON.stringify(j.error)}`)
        .join('; ');
      await persistStepEvent(
        previousRun.runId,
        previousRun.organizationId,
        stepRef,
        'fail',
      );
    }
    previousRun.status = 'failed';
    previousRun.completedAt = new Date().toISOString();
    await persistRun(previousRun);
    return { run: previousRun, outputs };
  }

  // ── Still awaiting: return run unchanged for next poll ───────────────────
  if (!allComplete) {
    return { run: previousRun, outputs };
  }

  // ── All complete: transition step, drive downstream pipeline ─────────────
  const narrativeStepRef = previousRun.steps.find(
    s => s.key === 'csr.draft-narrative',
  );
  if (narrativeStepRef) {
    narrativeStepRef.status = 'complete';
    narrativeStepRef.completedAt = new Date().toISOString();
    // Persist the final job-status snapshot as the step's output for
    // auditability (sections-complete totals, per-study costs are tracked
    // on csr_build_jobs / csr_section_outputs rows themselves).
    const completePayload = { jobs: jobStatuses };
    narrativeStepRef.outputRef = JSON.stringify(completePayload);
    narrativeStepRef.outputHash = hashOutput(completePayload);
    await persistStepEvent(
      previousRun.runId,
      previousRun.organizationId,
      narrativeStepRef,
      'complete',
    );
  }

  // Run the remaining pending steps inline. We re-use the same per-step
  // helpers (runStep + outputs builders) by inlining only the steps that
  // are still `pending` from the previous run. m2.3 / m2.4 / m2.5 ran
  // before the awaiting-async return (they come earlier in ORDERED_STEPS
  // and don't depend on csr.draft-narrative) so they will already be
  // `complete` or `skipped` on previousRun.
  //
  // The downstream steps that need to run here are: m2.7.clinical,
  // m1.admin, package.assemble, package.validate. We build a small
  // runStep helper bound to `previousRun.runId` and reuse the same
  // logic as the fresh-run path.
  const runId = previousRun.runId;
  const stepOf = (key: StepKey): StepRecord =>
    previousRun.steps.find(s => s.key === key)!;

  const runStep = async (
    key: StepKey,
    inputHash: string,
    fn: () => Promise<{ outputRef: string; output: unknown } | null>,
  ): Promise<void> => {
    const step = stepOf(key);
    // Whitelist resumable statuses rather than blacklist non-resumable
    // ones. The fresh-run pipeline always starts a step at `pending`; the
    // resume path only legitimately drives a step that was left `pending`
    // (downstream of the awaiting-async step on the original run) or
    // `stale` (marked by markDownstreamStale). Anything else — `complete`,
    // `skipped`, `failed`, `running`, `awaiting-async` — is left alone:
    //   - complete/skipped/failed: already terminal, don't re-execute.
    //   - running: a previous process died mid-step; re-executing here
    //     would double-write the start/complete audit pair. Leave alone
    //     and let an operator intervene.
    //   - awaiting-async: this step is owned by a background worker; the
    //     resume path picks it up via the csr-job-runner status check
    //     above, not by re-invoking the step body.
    if (step.status !== 'pending' && step.status !== 'stale') {
      return;
    }
    step.inputHash = inputHash;
    step.status = 'running';
    step.startedAt = new Date().toISOString();
    await persistStepEvent(runId, previousRun.organizationId, step, 'start');
    const t0 = Date.now();
    try {
      const result = await fn();
      step.completedAt = new Date().toISOString();
      step.durationMs = Date.now() - t0;
      if (result === null) {
        step.status = 'skipped';
        step.outputHash = undefined;
        step.outputRef = 'skipped (no inputs)';
      } else {
        step.status = 'complete';
        step.outputHash = hashOutput(result.output);
        step.outputRef = result.outputRef;
      }
      await persistStepEvent(runId, previousRun.organizationId, step, 'complete');
    } catch (err) {
      step.completedAt = new Date().toISOString();
      step.durationMs = Date.now() - t0;
      step.status = 'failed';
      step.error = err instanceof Error ? err.message : String(err);
      await persistStepEvent(runId, previousRun.organizationId, step, 'fail');
      throw err;
    }
  };

  try {
    // m2.7.clinical
    const m27Hash = hashInputs(inputs.csrInputs, inputs.indication ?? '');
    await runStep('m2.7.clinical', m27Hash, async () => {
      if (inputs.csrInputs.length === 0) return null;
      outputs.m27 = buildM27ClinicalSummary({
        csrs: inputs.csrInputs,
        indication: inputs.indication || '[indication not specified]',
        investigationalProduct: inputs.drugProductName || inputs.drugSubstanceName || '[product]',
      });
      return { outputRef: `m2.7.clinical:completeness=${outputs.m27.completeness}`, output: outputs.m27 };
    });

    // m1.admin
    await runStep('m1.admin', hashInputs(inputs.applicationNumber, inputs.region), async () => {
      return {
        outputRef: `m1.admin:delegated-to-${inputs.region.toLowerCase()}-regional-template`,
        output: { region: inputs.region, applicationNumber: inputs.applicationNumber },
      };
    });

    // package.assemble
    const sequenceNumber = inputs.sequenceNumber ?? '0000';
    await runStep('package.assemble', hashOutput(outputs), async () => {
      const leaves = buildLeafManifestFromSections(outputs.module3Sections);
      const totalSizeBytes = leaves.reduce((sum, l) => sum + (l.fileSize || 0), 0);
      const assembled: AssembledPackage = {
        leaves,
        totalSizeBytes,
        applicationNumber: inputs.applicationNumber,
        sequenceNumber,
        region: inputs.region,
        submissionType: inputs.submissionType,
      };
      outputs.assembly = assembled;
      return { outputRef: `package.assemble:${leaves.length}-leaves`, output: assembled };
    });

    // package.validate
    if (!inputs.skipValidation) {
      const assembly = outputs.assembly;
      if (!assembly) {
        throw new Error(
          '[Orchestrator] resume: package.validate has no assembled package — package.assemble must run first',
        );
      }
      await runStep('package.validate', hashOutput(assembly), async () => {
        const context: HardenedValidationContext = {
          submissionId: inputs.submissionId,
          region: assembly.region as HardenedValidationContext['region'],
          applicationNumber: assembly.applicationNumber,
          sequenceNumber: assembly.sequenceNumber,
          submissionType: assembly.submissionType,
          totalSizeBytes: assembly.totalSizeBytes,
        };
        const result = await validateEctdPackageHardened(
          assembly.leaves,
          context,
          /* backboneXml */ undefined,
        );
        outputs.validation = result;
        if (!result.gatewayReady) {
          const errCount = result.summary.errors;
          const regionalErrCount = result.regional.filter(f => f.severity === 'error').length;
          const seqErrCount = result.sequence.filter(f => f.severity === 'error').length;
          throw new Error(
            `package not gateway-ready: ${errCount} structural error(s), ${regionalErrCount} regional error(s), ${seqErrCount} sequence error(s); hardenedScore=${result.hardenedScore}`,
          );
        }
        return {
          outputRef: `package.validate:gateway-ready score=${result.hardenedScore}`,
          output: {
            gatewayReady: result.gatewayReady,
            hardenedScore: result.hardenedScore,
            summary: result.summary,
          },
        };
      });
    } else {
      const pv = stepOf('package.validate');
      if (pv.status === 'pending') pv.status = 'skipped';
    }

    // Final run status — same logic as the fresh-run path.
    const failedSteps = previousRun.steps.filter(s => s.status === 'failed');
    const skippedSteps = previousRun.steps.filter(s => s.status === 'skipped');
    previousRun.status =
      failedSteps.length > 0
        ? 'partial'
        : skippedSteps.length === previousRun.steps.length
          ? 'failed'
          : 'complete';
  } catch (err) {
    previousRun.status = 'failed';
    console.error('[Orchestrator] resume failed:', err);
  }

  previousRun.completedAt = new Date().toISOString();
  await persistRun(previousRun);
  return { run: previousRun, outputs };
}

/**
 * Cheap readiness probe for a background poller. Returns whether the
 * suspended run is ready to be resumed (all underlying csr_build_jobs
 * complete or failed) without driving the orchestrator forward.
 *
 * Mirrors the org-scoping pattern of `getRun` (returns
 * `{ ready: false }` on missing-or-cross-tenant rather than throwing,
 * keeping the call cheap and safe to fire from a tight polling loop).
 *
 * Resolution semantics:
 *   - run not found / org mismatch / no awaiting-async step → { ready: false }
 *   - any underlying job 'failed' or 'missing' → { ready: true, jobStatus: 'failed' }
 *     (caller should invoke runOrchestrator(_, { resumeRunId }) to drive the
 *      step to its failed terminal state)
 *   - any underlying job still queued/drafting → { ready: false, jobStatus: 'awaiting' }
 *   - all underlying jobs 'complete' → { ready: true, jobStatus: 'complete' }
 *
 * Note: this performs N read queries (one per enqueued study) but each is
 * a single-row index lookup on (id, organization_id). The cost is O(N)
 * round-trips, dominated by the underlying job count, not the
 * orchestrator's step count.
 */
export async function getRunResumeReadiness(
  runId: string,
  organizationId: number,
): Promise<{ ready: boolean; jobStatus?: string }> {
  if (!Number.isFinite(organizationId) || organizationId <= 0) {
    return { ready: false };
  }

  const run = await getRun(runId, organizationId);
  if (!run) return { ready: false };

  const awaitingStep = run.steps.find(s => s.status === 'awaiting-async');
  if (!awaitingStep) return { ready: false };

  const payload = tryParseNarrativePayload(awaitingStep.outputRef);
  if (!payload || payload.jobs.length === 0) {
    // Malformed payload — surface as not-ready so the poller doesn't spin.
    // The next runOrchestrator(_, { resumeRunId }) call will surface the
    // real error.
    return { ready: false };
  }

  // csr-job-runner's known statuses are: queued | drafting | complete |
  // failed. Anything else — including a future `cancelled` — is treated
  // as a terminal failure rather than as `awaiting`, so the poller never
  // spins forever on a status the orchestrator wasn't taught about.
  const PENDING_STATUSES = new Set(['queued', 'drafting']);
  let anyFailed = false;
  let anyPending = false;
  for (const job of payload.jobs) {
    const status = await getCSRBuildJobStatus(job.jobId, organizationId);
    if (!status) {
      // Treat missing as failure (same as resumeOrchestratorRun).
      anyFailed = true;
      continue;
    }
    if (status.status === 'complete') {
      continue;
    }
    if (PENDING_STATUSES.has(status.status)) {
      anyPending = true;
    } else {
      // 'failed' or any unrecognized status (defense-in-depth for future
      // csr-job-runner statuses like 'cancelled').
      anyFailed = true;
    }
  }

  if (anyFailed) return { ready: true, jobStatus: 'failed' };
  if (anyPending) return { ready: false, jobStatus: 'awaiting' };
  return { ready: true, jobStatus: 'complete' };
}

// ── Incremental regeneration ────────────────────────────────────────────────

/**
 * Mark all steps downstream of `changedStep` as stale. The next runOrchestrator
 * call (or regenerateAffected) will rebuild them.
 */
export function markDownstreamStale(steps: StepRecord[], changedStep: StepKey): StepKey[] {
  const stale = new Set<StepKey>();
  const queue: StepKey[] = [changedStep];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const [key, deps] of Object.entries(STEP_DEPENDENCIES) as [StepKey, StepKey[]][]) {
      if (deps.includes(current) && !stale.has(key)) {
        stale.add(key);
        queue.push(key);
      }
    }
  }

  for (const step of steps) {
    if (!stale.has(step.key)) continue;
    // Mark any in-flight or already-settled step as stale so the next
    // orchestrator pass will re-run it. `complete` is the common case
    // (input changed beneath a finished step). `awaiting-async` and
    // `running` are the in-flight cases: a regenerateAffected call
    // upstream of csr.draft-narrative while that step is awaiting-async
    // would otherwise leave the underlying csr_build_jobs orphaned
    // (running, writing rows, costing money — but no orchestrator run
    // will consume their output). Marking the step `stale` so the next
    // pass restarts it does NOT cancel the abandoned background job;
    // callers should cancel those out-of-band before regenerating.
    if (
      step.status === 'complete' ||
      step.status === 'awaiting-async' ||
      step.status === 'running'
    ) {
      step.status = 'stale';
    }
  }

  return Array.from(stale);
}

/**
 * Regenerate only the steps whose status is `stale` or whose inputs have changed.
 * Returns the updated run + outputs.
 */
export async function regenerateAffected(
  previousRun: OrchestratorRun,
  inputs: OrchestratorInputs,
  changedStep?: StepKey
): Promise<{ run: OrchestratorRun; outputs: OrchestratorOutputs; regenerated: StepKey[] }> {
  // Tenant gates — refuse to regenerate without a scope, AND refuse to splice a
  // previous run from one tenant into a regenerate call carrying a different one.
  // The second check is the load-bearing one: without it a route handler with a
  // stale/forged previousRun could drive a regeneration under the wrong tenant.
  if (!Number.isFinite(inputs.organizationId) || inputs.organizationId <= 0) {
    throw new Error(
      `[Orchestrator] regenerateAffected: inputs.organizationId is required and must be a positive integer (got: ${String(inputs.organizationId)})`
    );
  }
  if (previousRun.organizationId !== inputs.organizationId) {
    throw new Error(
      `[Orchestrator] regenerateAffected: tenant mismatch — previousRun.organizationId=${previousRun.organizationId} but inputs.organizationId=${inputs.organizationId}`
    );
  }

  if (changedStep) {
    markDownstreamStale(previousRun.steps, changedStep);
  }

  // Detect input-hash changes for terminal-source steps
  const m3Hash = hashInputs(inputs.cmcSources, inputs.region);
  const csrHash = hashInputs(inputs.clinicalStudyData);
  const m24Hash = hashInputs(inputs.nonclinicalStudies, inputs.drugSubstanceName ?? '', inputs.indication ?? '');

  const m3Step = previousRun.steps.find(s => s.key === 'm3.compose');
  const csrStep = previousRun.steps.find(s => s.key === 'csr.tabulate');
  const m24Step = previousRun.steps.find(s => s.key === 'm2.4.nonclinical');

  if (m3Step && m3Step.inputHash !== m3Hash) markDownstreamStale(previousRun.steps, 'm3.compose');
  if (csrStep && csrStep.inputHash !== csrHash) markDownstreamStale(previousRun.steps, 'csr.tabulate');
  if (m24Step && m24Step.inputHash !== m24Hash) markDownstreamStale(previousRun.steps, 'm2.4.nonclinical');

  const stale = previousRun.steps.filter(s => s.status === 'stale').map(s => s.key);

  // Run a fresh orchestrator pass — the earlier run record is preserved in audit log
  const fresh = await runOrchestrator(inputs);

  return { run: fresh.run, outputs: fresh.outputs, regenerated: stale };
}

// ── Status query ────────────────────────────────────────────────────────────

export async function getRun(
  runId: string,
  organizationId: number
): Promise<OrchestratorRun | null> {
  // Tenant gate — refuse to query without a positive tenant scope.
  // Returning null instead of throwing keeps callers' null-check semantics intact
  // while ensuring an unscoped call never matches a row.
  if (!Number.isFinite(organizationId) || organizationId <= 0) {
    console.warn('[Orchestrator] getRun called with invalid organizationId:', organizationId);
    return null;
  }
  try {
    const result = await pool.query(
      `SELECT run_id, organization_id, submission_id, application_number, region, submission_type,
              started_at, completed_at, status, steps
       FROM submission_orchestrator_runs
       WHERE run_id = $1 AND organization_id = $2`,
      [runId, organizationId]
    );
    // Collapsed result: not-found and org-mismatch both return null so the caller
    // cannot distinguish a missing run from a cross-tenant probe.
    if (result.rows.length === 0) return null;
    const row = result.rows[0] as Record<string, unknown>;
    return {
      runId: String(row.run_id),
      organizationId: Number(row.organization_id),
      submissionId: String(row.submission_id),
      applicationNumber: String(row.application_number),
      region: String(row.region) as RegionCode,
      submissionType: String(row.submission_type),
      startedAt: String(row.started_at),
      completedAt: row.completed_at ? String(row.completed_at) : undefined,
      status: String(row.status) as OrchestratorRun['status'],
      steps: typeof row.steps === 'string' ? JSON.parse(row.steps) : (row.steps as StepRecord[]),
    };
  } catch (err) {
    console.warn('[Orchestrator] getRun failed:', err);
    return null;
  }
}

export async function getRunAudit(
  runId: string,
  organizationId: number
): Promise<Array<{
  stepKey: string;
  eventType: string;
  status: string;
  inputHash: string;
  outputHash: string | null;
  outputRef: string | null;
  error: string | null;
  occurredAt: string;
}>> {
  // Tenant gate — refuse to query without a positive tenant scope.
  if (!Number.isFinite(organizationId) || organizationId <= 0) {
    console.warn('[Orchestrator] getRunAudit called with invalid organizationId:', organizationId);
    return [];
  }
  try {
    // Filter on organization_id directly. If the parent run is not visible to this
    // org, no step rows match either (effectively the same as a JOIN-side filter,
    // since every step row was inserted with its parent run's organization_id).
    const result = await pool.query(
      `SELECT step_key, event_type, status, input_hash, output_hash, output_ref, error, occurred_at
       FROM submission_orchestrator_steps
       WHERE run_id = $1 AND organization_id = $2
       ORDER BY occurred_at ASC`,
      [runId, organizationId]
    );
    return (result.rows as Array<Record<string, unknown>>).map(r => ({
      stepKey: String(r.step_key),
      eventType: String(r.event_type),
      status: String(r.status),
      inputHash: String(r.input_hash),
      outputHash: r.output_hash ? String(r.output_hash) : null,
      outputRef: r.output_ref ? String(r.output_ref) : null,
      error: r.error ? String(r.error) : null,
      occurredAt: String(r.occurred_at),
    }));
  } catch (err) {
    console.warn('[Orchestrator] getRunAudit failed:', err);
    return [];
  }
}
