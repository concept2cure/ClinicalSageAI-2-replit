/**
 * @fileoverview Submission-Package Orchestrator
 * @module server/services/submission-package-orchestrator
 *
 * The meta-service that sequences artifacts → sections → modules → ZIP for an
 * IND/NDA/BLA/510(k) submission. Closes the gap identified in the audit:
 * services exist (csr-builder, module3Composer, m2-summary-builders, the canonical
 * ectd/assemble-from-core packager)
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
import { assembleRealPackage, isPackagerBuildableRegion } from './ectd/orchestrator-real-package.js';
import { isSignSealConfigured, sealSignPayloadDigest, verifySignPayloadSeal } from './ectd/sign-payload-seal.js';
import { launchCSRBuildAsync } from './csr-builder.js';
import { getCSRBuildJobStatus } from './csr/csr-job-runner.js';
import {
  recordOrchestratorRunStarted,
  recordOrchestratorStepCompleted,
  recordOrchestratorStepFailed,
  recordOrchestratorRunCompleted,
  recordOrchestratorGatewayReady,
  recordOrchestratorSequenceQueryFailed,
} from './submission-orchestrator-metrics.js';

/**
 * Bucket a thrown error message into one of the closed error_code labels in
 * submission-orchestrator-metrics. Closed enum so label cardinality stays
 * bounded. Anything we can't classify maps to 'unknown' rather than the raw
 * exception message (which would be unbounded and could carry PHI).
 */
function classifyStepError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // Typed packager failures carry name/errorClass but messages that dodge the
  // /validation/ regex below (e.g. the unplaceable-leaf ValidationError, "not
  // submission-grade", "not DTD self-contained", "N broken cross-reference(s)").
  // Classify by the typed marker first so these are not mislabeled 'unknown'.
  if (
    err !== null &&
    typeof err === 'object' &&
    ((err as { name?: unknown }).name === 'ValidationError' ||
      (err as { errorClass?: unknown }).errorClass === 'validation')
  ) {
    return 'validation_failed';
  }
  if (/tenant|organization_id|organizationId.+required/i.test(msg)) return 'tenant_isolation_violation';
  if (/SEQ_QUERY_FAILED|sequence history|sequence query/i.test(msg)) return 'sequence_query_failed';
  if (/gatewayReady|gateway not ready|hardenedScore/i.test(msg)) return 'gateway_not_ready';
  if (/hallucination|prompt-injection/i.test(msg)) return 'ai_hallucination_guard';
  if (/AI gateway|getGateway|provider|completion/i.test(msg)) return 'ai_gateway_error';
  if (/db|pool|query|postgres|connection/i.test(msg)) return 'db_query_failed';
  if (/validation|Zod|invalid input/i.test(msg)) return 'validation_failed';
  return 'unknown';
}

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
  | 'package.validate'
  // Path-to-GA §C.11 — e-sig gate before transmit. Sits AFTER package.validate
  // (we sign the gateway-ready package) and BEFORE any future package.transmit
  // (signature must bind to the as-transmitted record per 21 CFR Part 11 §11.70).
  // See docs/reports/E_SIG_GATE_DESIGN_2026-06-29.md.
  | 'package.sign';

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
  // Path-to-GA §C.11: orchestrator computed the bound payload digest and is
  // waiting for a human signer to invoke POST /api/submissions/:id/sign-release.
  // Lifecycle parallels `awaiting-async`: non-terminal; resume path looks up
  // the matching electronic_signatures row and drives to `complete`. Kept as
  // a distinct status from `awaiting-async` because the actor (human credential
  // re-verification) and the alert SLA are operationally distinct from a
  // background-worker wait (see design doc §B.3).
  | 'awaiting-signature'
  | 'complete'
  | 'failed'
  | 'stale'
  | 'skipped';

export interface OrchestratorRun {
  runId: string;
  /** Tenant scope — pinned at run creation; every persistence call carries this. */
  organizationId: number;
  submissionId: string;
  /**
   * Optional canonical FK back to public.submissions(id) — the joinable
   * lineage column added by Path-to-GA §C.4 (Path B). When the caller
   * supplies `OrchestratorInputs.submissionFk`, this round-trips through
   * persistRun / getRun and is dual-written alongside the legacy
   * `submissionId` TEXT. When absent, the column stays NULL until a
   * backfill resolves the row — see
   * docs/reports/SUBMISSION_ID_PROVENANCE_DESIGN_2026-06-29.md and
   * migrations/20260629_orchestrator_submission_id_fk.sql.
   */
  submissionFk?: number | null;
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
  status:
    | 'running'
    | 'awaiting-async'
    // Path-to-GA §C.11: run-level mirror of the per-step `awaiting-signature`.
    // CHECK constraint widened in
    // migrations/20260629_orchestrator_awaiting_signature_status.sql.
    | 'awaiting-signature'
    // Gateway-validated and, for IND/NDA/BLA/MAA, signed — see finalRunStatus.
    | 'complete'
    | 'failed'
    // A step failed, OR a gate (package.validate / a required package.sign)
    // was skipped, so the package is not established as gateway-ready.
    | 'partial';
  steps: StepRecord[];
  /**
   * Workflow-definition provenance (auth/e-sig audit 2026-07-30). The steps
   * array snapshots per-step dependsOn edges, but nothing recorded WHICH
   * definition produced the run — so a code change to STEP_DEPENDENCIES
   * silently changed what a historical run meant. Stamped at run creation,
   * write-once in persistRun (COALESCE keeps the original on resume-writes).
   * Nullable: rows created before the hardening migration carry NULL.
   */
  workflowVersion?: string | null;
  /** sha256 over the canonical dependency graph + step order at creation. */
  dependencyGraphDigest?: string | null;
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
  /**
   * Optional canonical FK back to public.submissions(id). When supplied,
   * persistRun dual-writes both `submission_id TEXT` (legacy) and
   * `submission_id_fk INTEGER` (the joinable FK). When absent, only the
   * TEXT column is written and submission_id_fk stays NULL — the row will
   * remain in the "unresolved lineage" bucket until backfill (per the
   * Path B transition design in
   * docs/reports/SUBMISSION_ID_PROVENANCE_DESIGN_2026-06-29.md).
   *
   * Callers that have only the TEXT submissionId can resolve it via the
   * exported `loadSubmissionFkBySubmissionIdText` helper before invoking
   * runOrchestrator — that helper is tenant-scoped and returns null on
   * miss or cross-org rather than guessing.
   */
  submissionFk?: number;
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
 * the two steps.
 *
 * NOT DB-persisted. It lives on `OrchestratorOutputs.assembly` in memory for the
 * duration of a run; the run record stores only step metadata + a short outputRef
 * label (`package.assemble:N-leaves`). A resumed run RE-DERIVES this by calling
 * assembleForValidation again — safe ONLY because assembleRealPackage is
 * byte-deterministic (epoch PDF timestamps + skipPdfaConversion + deterministic
 * leaf IDs / index.xml). Do not delete the re-derivation on the assumption a
 * persisted copy exists — there is none, and resume would then validate nothing.
 */
export interface AssembledPackage {
  leaves: ECTDLeaf[];
  totalSizeBytes: number;
  applicationNumber: string;
  sequenceNumber: string;
  region: RegionCode;
  submissionType: string;
  /**
   * The generated ICH backbone (index.xml) text for this assembly. Passed to the
   * hardened validator as backboneXml so DTD conformance actually runs (the
   * stand-in path left it undefined). Held in memory on the in-flight assembly
   * (re-derived on resume, like the rest of this shape); the per-leaf byte
   * buffers used for MD5 recompute are likewise in-memory only and are not part
   * of this JSON shape.
   */
  backboneXml?: string;
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
  // Path-to-GA §C.11 — e-sig gate. Single edge to package.validate; the
  // payload digest binds the validated leaf manifest + the validator's
  // gateway-ready call, so signing only makes sense after validate. A future
  // package.transmit step will carry ['package.sign']. We deliberately do NOT
  // add a redundant edge to package.assemble — transitive closure covers it
  // (package.validate already depends on package.assemble). See design doc §B.2.
  'package.sign': ['package.validate'],
};

/**
 * Human-meaningful version of the workflow definition (the dependency graph +
 * step order above). BUMP THIS whenever STEP_DEPENDENCIES or ORDERED_STEPS
 * changes shape — the digest below catches an unbumped edit, but the version
 * string is what an auditor reads off a run row.
 */
export const WORKFLOW_DEFINITION_VERSION = 'wdv-2026.07.30-1';

/**
 * Deterministic digest of the workflow definition. Recorded on every run at
 * creation; the resume path compares it against the live definition and logs
 * loudly on drift (the stored per-step dependsOn edges — not the live
 * constant — govern how that run's history is interpreted, see
 * markDownstreamStale).
 */
export function computeDependencyGraphDigest(): string {
  const canonical = JSON.stringify({
    dependencies: STEP_DEPENDENCIES,
    order: ORDERED_STEPS,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

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
  // Path-to-GA §C.11 — e-sig gate before any future package.transmit. Always
  // sits last in ORDERED_STEPS today; when transmit lands, it will be inserted
  // after this.
  'package.sign',
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

// ── Real package assembly (package.assemble → package.validate hand-off) ──

/**
 * Assemble a REAL eCTD package from the composed Module 3 sections and derive
 * the validator inputs. Replaces the former derived stand-in manifest: it renders
 * each ComposedSection to a leaf PDF, runs the canonical packager (deterministic:
 * PDF/A conversion skipped), and returns the AssembledPackage (leaves with real
 * package hrefs + real MD5s + the generated index.xml backbone) plus the per-leaf
 * byte buffers keyed by filePath. package.validate then runs DTD conformance
 * against the real backbone and recomputes MD5 against the real bytes.
 *
 * Deterministic across re-renders (renderLeafPdf is deterministic and PDF/A
 * normalization is skipped), so the sign-path drift check — which re-derives and
 * compares sha256(assembly.leaves) — stays stable.
 */
async function assembleForValidation(
  sections: ComposedSection[],
  inputs: OrchestratorInputs,
  sequenceNumber: string,
): Promise<{ assembled: AssembledPackage; leafBuffers: Record<string, Buffer> }> {
  // Region widening (Move-7) accepts regions beyond the four the canonical
  // packager has a backbone builder for. For a region the packager cannot build,
  // fall back to a derived manifest so the run still assembles + validates
  // structurally (no real backbone/buffers) rather than throwing. Every region
  // with a builder gets the real package.
  if (!isPackagerBuildableRegion(inputs.region)) {
    const leaves = buildDerivedManifest(sections);
    return {
      assembled: {
        leaves,
        totalSizeBytes: leaves.reduce((sum, l) => sum + (l.fileSize || 0), 0),
        applicationNumber: inputs.applicationNumber,
        sequenceNumber,
        region: inputs.region,
        submissionType: inputs.submissionType,
      },
      leafBuffers: {},
    };
  }

  const real = await assembleRealPackage(sections, {
    region: inputs.region,
    applicationNumber: inputs.applicationNumber,
    sequenceNumber,
    submissionType: inputs.submissionType,
    productName: inputs.drugProductName ?? inputs.drugSubstanceName,
  });
  return {
    assembled: {
      leaves: real.leaves,
      totalSizeBytes: real.totalSizeBytes,
      applicationNumber: inputs.applicationNumber,
      sequenceNumber,
      region: inputs.region,
      submissionType: inputs.submissionType,
      backboneXml: real.backboneXml,
    },
    leafBuffers: real.leafBuffers,
  };
}

/**
 * Derived stand-in leaf manifest — the fallback for regions the canonical
 * packager cannot build a backbone for (Move-7 widened regions without a
 * dedicated builder). One leaf per composed section, MD5 over its rendered
 * payload so the checksum is deterministic; no real files, so the validator's
 * DTD + buffer-MD5 checks are skipped (structural/regional/sequence rules still
 * run). Buildable regions use the real package instead.
 */
function buildDerivedManifest(sections: ComposedSection[]): ECTDLeaf[] {
  return sections.map(s => {
    const payload = JSON.stringify({ narrative: s.narrativeDraft, tables: s.tables, structured: s.structuredPayload });
    return {
      sectionCode: `m${s.sectionKey}`,
      title: s.sectionKey,
      checksum: crypto.createHash('md5').update(payload).digest('hex'),
      checksumType: 'md5' as const,
      operation: 'new' as const,
      filePath: `m3/${s.sectionKey.toLowerCase().replace(/\./g, '-')}/content.xml`,
      mimeType: 'text/xml',
      fileSize: Buffer.byteLength(payload, 'utf8'),
    };
  });
}

// ── Path-to-GA §C.11 — e-sig gate helpers ───────────────────────────────────

/**
 * OQ-1 decision: REQUIRED-vs-OPTIONAL is encoded as a closed allowlist of
 * submission types. Per the design doc:
 *   REQUIRED  — IND, NDA, BLA, MAA (every FDA-bound and EMA-bound submission
 *               that goes through ESG / CESP — the §11.70 boundary).
 *   OPTIONAL  — 510k (Letter-to-File is exempt; the §C.11 design doc flags
 *               this as customer-policy override, future v2).
 *               PMA, JNDA — fall to OPTIONAL today; future work can promote
 *               them to REQUIRED per regional policy.
 *
 * Per-customer overrides (`organizations.require_release_signature`) are
 * explicitly out of scope for v1 (OQ-1 §G — "future" item). The closed
 * allowlist below is the v1 decision and the call site comments it.
 *
 * Non-REQUIRED types take the SKIPPED branch — the orchestrator emits a
 * `skipped` step with a 'not-required' marker and proceeds. Downstream
 * package.transmit (when added) is the only point that re-checks; this gate
 * never falsely blocks a non-regulated type.
 */
const SIGNATURE_REQUIRED_SUBMISSION_TYPES = new Set<OrchestratorInputs['submissionType']>([
  'IND',
  'NDA',
  'BLA',
  'MAA',
]);

/**
 * OQ-8 decision: signatureMeaning for the release gate. Per 21 CFR Part 11
 * §11.50(b) every signature manifestation must declare the meaning. The
 * release gate uses 'approval' (the value already documented in the
 * existing electronic_signatures row's `signature_type` column for the
 * standard approval workflow). Other meanings (review, witness,
 * acknowledgment) remain available for document-level signatures via the
 * existing service, but the orchestrator gate only accepts 'approval'.
 */
export const PACKAGE_SIGN_SIGNATURE_MEANING = 'approval' as const;

/**
 * OQ-5 decision (revised for OUR file scope): backbone XML digest is
 * INCLUDED in the bound payload digest from day 1 when present. Today the
 * backbone XML is not yet produced by the orchestrator (the ZIP builder is
 * out-of-scope for §C.11), so the helper accepts an optional buffer and
 * omits it from the concatenation when absent — the digest still binds to
 * the leaf manifest + validator outcome + identity, which is what §11.70
 * needs. When the ZIP builder lands, callers pass the backbone XML and the
 * digest naturally extends. Pre-extension signatures referencing the
 * shorter digest remain valid for already-transmitted submissions (the
 * `superseded_by` chain catches anything still in flight).
 *
 * Components (canonical concatenation, in this order — order is load-bearing):
 *   1. leafManifestDigest      — sha256(JSON.stringify(outputs.assembly.leaves))
 *   2. validatorOutcomeDigest  — sha256(JSON.stringify({gatewayReady, hardenedScore, summary}))
 *   3. submissionIdentityCanonical — `${submissionId}|${applicationNumber}|${region}|${submissionType}|${organizationId}`
 *
 * Any change to ANY input flips the digest, which forces re-signing — the
 * "regenerate after sign" invariant (OQ-2).
 */
/** The validator-outcome components the bound digest binds to. Exactly the
 *  three fields fed into validatorOutcomeDigest — nothing more — so a resumed
 *  run can recompute the digest from a persisted snapshot without a full
 *  HardenedValidationResult (and, critically, without re-querying the DB, whose
 *  live sequence state could otherwise shift the outcome between sign and
 *  resume). */
export interface BoundDigestValidatorOutcome {
  gatewayReady: boolean;
  hardenedScore: number;
  summary: HardenedValidationResult['summary'];
}

/**
 * Lower-level digest over the raw components. Both the fresh sign path (via the
 * AssembledPackage/HardenedValidationResult wrapper below) and the resume path
 * (via the persisted SignedPackageSnapshot) funnel through this ONE function, so
 * the digest is computed identically in both — the invariant the drift check
 * depends on. The concatenation order is load-bearing; do not reorder.
 */
export function computeBoundPayloadDigestFromComponents(params: {
  leaves: ECTDLeaf[];
  validatorOutcome: BoundDigestValidatorOutcome;
  submissionId: string;
  applicationNumber: string;
  region: RegionCode;
  submissionType: string;
  organizationId: number;
  backboneXml?: Buffer | string;
}): string {
  const leafManifestDigest = crypto
    .createHash('sha256')
    .update(JSON.stringify(params.leaves))
    .digest('hex');

  const validatorOutcomeDigest = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        gatewayReady: params.validatorOutcome.gatewayReady,
        hardenedScore: params.validatorOutcome.hardenedScore,
        summary: params.validatorOutcome.summary,
      }),
    )
    .digest('hex');

  // Tenant-scoped identity tuple — includes organizationId so a replay of a
  // signature row from Org A onto Org B's identical submission identity would
  // produce a different digest (defense beyond the WHERE organization_id
  // tenant filter on the lookup query).
  const submissionIdentityCanonical = [
    params.submissionId,
    params.applicationNumber,
    params.region,
    params.submissionType,
    String(params.organizationId),
  ].join('|');

  const h = crypto.createHash('sha256');
  h.update(leafManifestDigest);
  h.update(validatorOutcomeDigest);
  h.update(submissionIdentityCanonical);
  if (params.backboneXml) {
    h.update(
      typeof params.backboneXml === 'string'
        ? Buffer.from(params.backboneXml, 'utf8')
        : params.backboneXml,
    );
  }
  return h.digest('hex');
}

export function computeBoundPayloadDigest(params: {
  assembly: AssembledPackage;
  validation: HardenedValidationResult;
  submissionId: string;
  applicationNumber: string;
  region: RegionCode;
  submissionType: string;
  organizationId: number;
  backboneXml?: Buffer | string;
}): string {
  return computeBoundPayloadDigestFromComponents({
    leaves: params.assembly.leaves,
    validatorOutcome: {
      gatewayReady: params.validation.gatewayReady,
      hardenedScore: params.validation.hardenedScore,
      summary: params.validation.summary,
    },
    submissionId: params.submissionId,
    applicationNumber: params.applicationNumber,
    region: params.region,
    submissionType: params.submissionType,
    organizationId: params.organizationId,
    backboneXml: params.backboneXml,
  });
}

/**
 * Immutable snapshot of the assembled + validated package that a release
 * signature binds to — the §11.70 "record" the signer approved.
 *
 * WHY IT EXISTS: the resume path used to RE-DERIVE the package from source and
 * recompute the digest to drift-check. That is non-reproducible under useAI
 * (the AI-refined narratives cannot be regenerated byte-for-byte) and fragile
 * to input key-order, so a legitimately-signed run would fail on resume with a
 * false `signature_payload_drift`. Persisting the exact signed package here and
 * HYDRATING it on resume makes the signature bind to a frozen record instead of
 * a re-derivation — the correct Part-11 semantics (you release what was signed).
 *
 * WHAT IT DOES NOT STORE: the leaf BYTES (real PDFs — potentially large). The
 * leaf manifest's per-leaf md5 checksums ARE the signed content fingerprint;
 * byte-level persistence for the eventual transmit step is a separate concern
 * (blob storage), tracked with the transmit work — see the deploy-boundary
 * runbook. For deterministically-rendered leaves the bytes can be reproduced;
 * for useAI leaves the rendered PDFs must be persisted before transmit lands.
 */
interface SignedPackageSnapshot {
  leaves: ECTDLeaf[];
  backboneXml: string;
  validatorOutcome: BoundDigestValidatorOutcome;
  /** Full identity tuple of the signed record — stored so the resume integrity
   *  recompute is SELF-CONTAINED (computed from the snapshot, not the resume
   *  call's inputs). submissionId + organizationId complete the tuple that
   *  applicationNumber/region/submissionType alone did not. */
  submissionId: string;
  organizationId: number;
  applicationNumber: string;
  sequenceNumber: string;
  region: RegionCode;
  submissionType: string;
  totalSizeBytes: number;
}

/**
 * Storage shape persisted onto the package.sign step's outputRef so the
 * resume path can re-discover the payload digest and the (eventual)
 * signature id without re-deriving them from inputs.
 */
interface PackageSignStepPayload {
  payloadDigest: string;
  /** Server-keyed HMAC seal over payloadDigest (AUDIT_HMAC_KEY). Present when
   *  sealing is configured (always in production). Binds the digest to server
   *  authority so a mutable-steps-column tamper cannot forge a self-consistent
   *  snapshot+digest — see sign-payload-seal.ts. Absent when unsealed (dev). */
  payloadSeal?: string;
  /** When complete, the electronic_signatures.id that satisfied the gate. */
  signatureId?: number;
  /** ISO timestamp when the step first transitioned to awaiting-signature. */
  awaitingSince: string;
  /**
   * The frozen package this digest binds to. Present on runs suspended on/after
   * the snapshot-persistence change (2026-07): resume HYDRATES it instead of
   * re-deriving. Absent on runs suspended before it — those fall back to the
   * legacy re-derive + drift path (see the deploy-boundary runbook; such
   * in-flight runs are expected to be re-signed after the deploy anyway).
   */
  signedSnapshot?: SignedPackageSnapshot;
}

/** A leaf carries an optional `buffer?: Buffer` of raw file bytes. No current
 *  assembly path sets it (bytes live in a separate leafBuffers map), but strip
 *  it defensively: a future path that populated it would otherwise serialize
 *  whole PDFs into the steps JSONB (bloat) and, worse, change JSON.stringify's
 *  output for the same manifest. The signed fingerprint is the md5 checksum, not
 *  the inline bytes. */
function stripLeafBytes(leaves: ECTDLeaf[]): ECTDLeaf[] {
  return leaves.map((leaf) => {
    if (!('buffer' in leaf) || (leaf as { buffer?: unknown }).buffer === undefined) return leaf;
    const { buffer: _drop, ...rest } = leaf as ECTDLeaf & { buffer?: unknown };
    return rest as ECTDLeaf;
  });
}

/** Freeze the assembled + validated package into the signable snapshot. Called
 *  at sign-prep, when outputs.assembly and outputs.validation are both known.
 *  submissionId + organizationId come from the run identity, not the assembly,
 *  so the snapshot carries the FULL digest identity tuple and resume can verify
 *  it without trusting the resume call's inputs. */
function buildSignedSnapshot(
  assembly: AssembledPackage,
  validation: HardenedValidationResult,
  submissionId: string,
  organizationId: number,
): SignedPackageSnapshot {
  return {
    // Fallback regions (buildDerivedManifest) have no backbone; store '' so the
    // snapshot shape is total (and the digest omits it — '' is falsy).
    leaves: stripLeafBytes(assembly.leaves),
    backboneXml: assembly.backboneXml ?? '',
    validatorOutcome: {
      gatewayReady: validation.gatewayReady,
      hardenedScore: validation.hardenedScore,
      summary: validation.summary,
    },
    submissionId,
    organizationId,
    applicationNumber: assembly.applicationNumber,
    sequenceNumber: assembly.sequenceNumber,
    region: assembly.region,
    submissionType: assembly.submissionType,
    totalSizeBytes: assembly.totalSizeBytes,
  };
}

function tryParseSignPayload(raw: string | undefined): PackageSignStepPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as PackageSignStepPayload).payloadDigest === 'string'
    ) {
      return parsed as PackageSignStepPayload;
    }
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * Look up an active release signature for the given (orgId, payloadDigest).
 *
 * OQ-7 mandate: WHERE organization_id = $1 is the tenant guard. The
 * superseded_by IS NULL clause enforces OQ-4 (§11.70 append-only) — only the
 * current, non-rolled-back signature is returned. ORDER BY created_at DESC
 * is defense-in-depth; in practice at most one row matches because every
 * resign produces a NEW row whose digest is different (any change to inputs
 * changes the digest).
 *
 * Returns the signature id on hit, null on miss-or-cross-org (collapsed
 * semantics — caller cannot distinguish).
 */
export async function findActiveReleaseSignature(params: {
  organizationId: number;
  boundPayloadDigest: string;
}): Promise<{ id: number } | null> {
  if (!Number.isFinite(params.organizationId) || params.organizationId <= 0) {
    return null;
  }
  if (!params.boundPayloadDigest) return null;
  try {
    const result = await pool.query(
      `SELECT id FROM electronic_signatures
        WHERE organization_id = $1
          AND bound_payload_digest = $2
          AND superseded_by IS NULL
        ORDER BY created_at DESC
        LIMIT 1`,
      [params.organizationId, params.boundPayloadDigest],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0] as Record<string, unknown>;
    const id = Number(row.id);
    if (!Number.isFinite(id) || id <= 0) return null;
    return { id };
  } catch (err) {
    console.warn(
      '[Orchestrator] findActiveReleaseSignature failed (non-fatal):',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
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
    // Path-to-GA §C.4 (Path B): dual-write `submission_id` (legacy TEXT,
    // still NOT NULL) and `submission_id_fk` (nullable canonical FK back to
    // public.submissions(id)). The ON CONFLICT branch uses COALESCE on the
    // FK so a resume-write (which may carry submissionFk=null because the
    // resume path only knows what the previous run row carried) cannot
    // clear a previously-populated FK back to NULL.
    const submissionFkParam =
      typeof run.submissionFk === 'number' && Number.isFinite(run.submissionFk) && run.submissionFk > 0
        ? run.submissionFk
        : null;
    await pool.query(
      `INSERT INTO submission_orchestrator_runs
        (run_id, organization_id, submission_id, submission_id_fk, application_number, region, submission_type, started_at, completed_at, status, steps, workflow_version, dependency_graph_digest)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (run_id) DO UPDATE SET
         completed_at = EXCLUDED.completed_at,
         status = EXCLUDED.status,
         steps = EXCLUDED.steps,
         submission_id_fk = COALESCE(EXCLUDED.submission_id_fk, submission_orchestrator_runs.submission_id_fk),
         -- Write-once provenance: the ORIGINAL definition version survives every
         -- resume-write; a resume under a newer deploy must not relabel history.
         workflow_version = COALESCE(submission_orchestrator_runs.workflow_version, EXCLUDED.workflow_version),
         dependency_graph_digest = COALESCE(submission_orchestrator_runs.dependency_graph_digest, EXCLUDED.dependency_graph_digest)`,
      [
        run.runId,
        run.organizationId,
        run.submissionId,
        submissionFkParam,
        run.applicationNumber,
        run.region,
        run.submissionType,
        run.startedAt,
        run.completedAt || null,
        run.status,
        JSON.stringify(run.steps),
        run.workflowVersion ?? null,
        run.dependencyGraphDigest ?? null,
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
  eventType: 'start' | 'complete' | 'fail' | 'stale',
  submissionFk?: number | null
): Promise<void> {
  // Defense-in-depth: same rationale as persistRun.
  if (!Number.isFinite(organizationId) || organizationId <= 0) {
    throw new Error(
      `[Orchestrator] persistStepEvent: organizationId must be a positive integer (got: ${String(organizationId)})`
    );
  }
  try {
    // Path-to-GA §C.4 (Path B): mirror the parent run's submission_id_fk
    // onto every step audit row when the caller supplied it. Stays NULL
    // when the parent run row doesn't have it either — backward
    // compatibility with legacy callers.
    const submissionFkParam =
      typeof submissionFk === 'number' && Number.isFinite(submissionFk) && submissionFk > 0
        ? submissionFk
        : null;
    await pool.query(
      `INSERT INTO submission_orchestrator_steps
        (run_id, organization_id, submission_id_fk, step_key, event_type, status, input_hash, output_hash, output_ref, error, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
      [
        runId,
        organizationId,
        submissionFkParam,
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
    // Path-to-GA §C.4 (Path B): thread the optional canonical FK from the
    // caller's inputs straight into the in-memory run shape so persistRun
    // can dual-write it. Stays undefined when the caller didn't supply it,
    // matching legacy behavior.
    submissionFk: inputs.submissionFk,
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
    workflowVersion: WORKFLOW_DEFINITION_VERSION,
    dependencyGraphDigest: computeDependencyGraphDigest(),
  };

  await persistRun(run);

  // Prometheus run-started counter (bounded labels — submission_type and
  // region; orgId deliberately NOT a label per cardinality policy).
  recordOrchestratorRunStarted({
    submissionType: run.submissionType,
    region: run.region,
  });

  const outputs: OrchestratorOutputs = {
    module3Sections: [],
    csrTables: [],
  };

  // Track t0 for the overall-run duration histogram.
  const runT0 = Date.now();

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
    await persistStepEvent(runId, run.organizationId, step, 'start', run.submissionFk);

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
        // Prometheus step-duration histogram — skipped steps don't observe
        // (their duration is meaningless; would skew p95). Only 'complete'.
        recordOrchestratorStepCompleted({
          step: key,
          durationMs: step.durationMs,
        });
      }
      await persistStepEvent(runId, run.organizationId, step, 'complete', run.submissionFk);
    } catch (err) {
      step.completedAt = new Date().toISOString();
      step.durationMs = Date.now() - t0;
      step.status = 'failed';
      step.error = err instanceof Error ? err.message : String(err);
      // Prometheus step-failed counter — error_code bucketed via classifyStepError
      // into the closed KNOWN_ERROR_CODES set so label cardinality stays bounded.
      recordOrchestratorStepFailed({
        step: key,
        errorCode: classifyStepError(err),
      });
      await persistStepEvent(runId, run.organizationId, step, 'fail', run.submissionFk);
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
      await persistStepEvent(runId, run.organizationId, narrativeStep, 'start', run.submissionFk);

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
        await persistStepEvent(runId, run.organizationId, narrativeStep, 'fail', run.submissionFk);
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
                sampleSize: csr.sampleSize ?? undefined,
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
          run.submissionFk,
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
          run.submissionFk,
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
      await persistStepEvent(runId, run.organizationId, narrativeStep, 'start', run.submissionFk);
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
        run.submissionFk,
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
        outputRef: `m1.admin:not-generated (delegated to the ${inputs.region.toLowerCase()} regional template; no Module 1 content is in this package)`,
        output: { region: inputs.region, applicationNumber: inputs.applicationNumber },
      };
    });

    // package.assemble — emit the leaf manifest + validator context that
    // package.validate consumes downstream. Output shape was widened in
    // Move 3 (was an opaque section-count summary). The manifest is the
    // load-bearing contract between assemble and validate.
    const sequenceNumber = inputs.sequenceNumber ?? '0000';
    // Per-leaf bytes from the real assembly, kept in memory for the immediately
    // following validate (the AssembledPackage carries only the backbone string,
    // not binary buffers, and neither is DB-persisted). A resumed run re-runs
    // package.assemble and so repopulates this; it is only empty for the
    // derived-manifest fallback used by regions the packager cannot build (no
    // real files → MD5 recompute is a no-op there, and the DTD check is skipped
    // for the same reason).
    let assembledLeafBuffers: Record<string, Buffer> | undefined;
    await runStep('package.assemble', hashOutput(outputs), async () => {
      const { assembled, leafBuffers } = await assembleForValidation(
        outputs.module3Sections,
        inputs,
        sequenceNumber,
      );
      outputs.assembly = assembled;
      assembledLeafBuffers = leafBuffers;
      return {
        outputRef: `package.assemble:${assembled.leaves.length}-leaves (Module 3 only; M1/M2/CSR outputs are reported on the run but are not in this package)`,
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
          // Real per-leaf bytes (keyed by filePath) so enforceMd5Checksums
          // recomputes + compares against the actual packaged bytes.
          leafBuffers: assembledLeafBuffers,
        };
        const result = await validateEctdPackageHardened(
          assembly.leaves,
          context,
          assembly.backboneXml,
        );
        outputs.validation = result;

        // Surface gateway-readiness as a step failure so the run's final
        // status (computed below) reflects the validator's go/no-go call.
        // The thrown error is the existing failure path inside runStep —
        // it captures error message + persists a 'fail' step event with
        // the orchestrator-bound organizationId, so the audit row is
        // tenant-scoped (Move 1 invariant).
        // Prometheus gateway-ready counter (every validation contributes).
        recordOrchestratorGatewayReady({ ready: result.gatewayReady });

        // Dedicated SEQ_QUERY_FAILED counter — surfaced so Alertmanager can
        // page on DB-outage rate independently of other gateway-not-ready
        // causes. The hardened validator emits SEQ_QUERY_FAILED at severity
        // 'error' (Move 13 fix); we count its presence regardless of the
        // overall gatewayReady outcome.
        const seqQueryFailed = result.sequence.some(f => f.code === 'SEQ_QUERY_FAILED');
        if (seqQueryFailed) {
          recordOrchestratorSequenceQueryFailed();
        }

        if (!result.gatewayReady) {
          const errCount = result.summary.errors;
          const regionalErrCount = result.regional.filter(f => f.severity === 'error').length;
          const seqErrCount = result.sequence.filter(f => f.severity === 'error').length;
          throw new Error(
            `package not gateway-ready: ${errCount} structural error(s), ${regionalErrCount} regional error(s), ${seqErrCount} sequence error(s); hardenedScore=${result.hardenedScore}`
          );
        }

        return {
          outputRef: `package.validate:gateway-ready (Module 3 only) score=${result.hardenedScore}`,
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

    // ── package.sign (Path-to-GA §C.11) — see runPackageSignGate ──────────
    if ((await runPackageSignGate({ run, inputs, outputs, stepOf })) === 'suspended') {
      return { run, outputs };
    }

    run.status = finalRunStatus(run.steps, inputs);
  } catch (err) {
    run.status = 'failed';
    console.error('[Orchestrator] run failed:', err);
  }

  run.completedAt = new Date().toISOString();
  await persistRun(run);

  // Prometheus run-completed counter + overall-duration histogram. Status is
  // bucketed into success/failure on the recorder side. awaiting-async runs
  // do NOT fire this — they return from the early-exit branch above without
  // setting completedAt, and the resume path will fire this on its eventual
  // terminal transition.
  recordOrchestratorRunCompleted({
    submissionType: run.submissionType,
    region: run.region,
    status: run.status as 'complete' | 'failed' | 'partial',
    durationMs: Date.now() - runT0,
  });

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
 * Run-level terminal status from the step records — ONE rule for the three
 * drivers (fresh, awaiting-async resume, awaiting-signature resume).
 *
 * `complete` is reserved for a run whose package was gateway-validated and,
 * for a signature-required submission type, signed. A run that skipped
 * package.validate (skipValidation) or whose required signature was skipped
 * because the package never became gateway-ready is `partial`: the same word
 * used for a package that cleared the structural gate must not describe one
 * that was never checked.
 */
function finalRunStatus(
  steps: StepRecord[],
  inputs: Pick<OrchestratorInputs, 'submissionType' | 'skipValidation'>,
): 'complete' | 'failed' | 'partial' {
  if (steps.some(s => s.status === 'failed')) return 'partial';
  if (steps.every(s => s.status === 'skipped')) return 'failed';
  const validate = steps.find(s => s.key === 'package.validate');
  if (validate?.status === 'skipped') return 'partial';
  const sign = steps.find(s => s.key === 'package.sign');
  if (sign?.status === 'skipped' && SIGNATURE_REQUIRED_SUBMISSION_TYPES.has(inputs.submissionType)) {
    return 'partial';
  }
  return 'complete';
}

/**
 * The package.sign input hash. Recorded even on the skipped path, so a future
 * auditor can see the exact inputs that were not required to be signed.
 */
function signStepInputHash(inputs: OrchestratorInputs, outputs: OrchestratorOutputs): string {
  return hashInputs(
    inputs.submissionId,
    inputs.applicationNumber,
    inputs.region,
    inputs.submissionType,
    inputs.organizationId,
    outputs.assembly?.leaves ?? null,
    outputs.validation
      ? {
          gatewayReady: outputs.validation.gatewayReady,
          hardenedScore: outputs.validation.hardenedScore,
          summary: outputs.validation.summary,
        }
      : null,
  );
}

/** Record package.sign as skipped, with the reason, on the run's audit trail. */
async function recordSignStepSkipped(
  run: OrchestratorRun,
  signStep: StepRecord,
  signInputHash: string,
  outputRef: string,
): Promise<void> {
  const now = new Date().toISOString();
  signStep.inputHash = signInputHash;
  signStep.startedAt = now;
  signStep.status = 'skipped';
  signStep.completedAt = now;
  signStep.durationMs = 0;
  signStep.outputRef = outputRef;
  await persistStepEvent(run.runId, run.organizationId, signStep, 'complete', run.submissionFk);
}

/**
 * The package.sign gate (Path-to-GA §C.11), shared by the fresh-run driver
 * and the awaiting-async resume driver. It lived inline in the fresh-run
 * path only, so a run that suspended on csr.draft-narrative and resumed
 * later drove m2.7 / m1 / assemble / validate and then reported `complete`
 * with package.sign still `pending` — an IND/NDA/BLA/MAA "completed" with no
 * §11.70 release signature ever computed, requested or recorded.
 *
 * Returns 'suspended' when the run is now awaiting a human signature (the
 * run is persisted as awaiting-signature; the caller returns it unchanged),
 * or 'settled' when the step is complete or skipped. Throws when the gate
 * itself failed (the step is recorded failed first).
 */
async function runPackageSignGate(args: {
  run: OrchestratorRun;
  inputs: OrchestratorInputs;
  outputs: OrchestratorOutputs;
  stepOf: (key: StepKey) => StepRecord;
}): Promise<'suspended' | 'settled'> {
  const { run, inputs, outputs, stepOf } = args;
  const signStep = stepOf('package.sign');
  const validateStep = stepOf('package.validate');

  const signInputHash = signStepInputHash(inputs, outputs);

  // OQ-1 skip path: non-REQUIRED submission types bypass the gate.
  if (!SIGNATURE_REQUIRED_SUBMISSION_TYPES.has(inputs.submissionType)) {
    await recordSignStepSkipped(run, signStep, signInputHash,
      `skipped (submissionType=${inputs.submissionType} not in REQUIRED allowlist)`);
  } else if (validateStep.status !== 'complete' || !outputs.assembly || !outputs.validation) {
    // The gate is required, but upstream isn't gateway-ready. Mark skipped
    // (rather than failed) — the validate-failed step already owns the failure
    // signal. finalRunStatus reads this skip and refuses to call the run
    // `complete`, so the skip is recorded without being read as clearance.
    await recordSignStepSkipped(run, signStep, signInputHash,
      `skipped (package.validate status=${validateStep.status}; cannot sign a non-gateway-ready package)`);
  } else {
    // REQUIRED + gateway-ready: compute the bound payload digest and
    // look up an existing signature. If found → complete; else →
    // awaiting-signature (run is suspended).
    signStep.inputHash = signInputHash;
    signStep.status = 'running';
    signStep.startedAt = new Date().toISOString();
    await persistStepEvent(run.runId, run.organizationId, signStep, 'start', run.submissionFk);

    const tSign = Date.now();
    try {
      const sequenceNumberForDigest = outputs.assembly.sequenceNumber;
      const payloadDigest = computeBoundPayloadDigest({
        assembly: outputs.assembly,
        validation: outputs.validation,
        submissionId: inputs.submissionId,
        applicationNumber: inputs.applicationNumber,
        region: inputs.region,
        submissionType: inputs.submissionType,
        organizationId: inputs.organizationId,
        // OQ-5 (resolved for the real-packager path): the backbone IS now
        // produced at package.assemble, so bind it — the eCTD index.xml
        // (navigation backbone) is part of the §11.70 record. Fallback
        // regions have no backbone (undefined) and the helper omits it, so
        // this is a no-op there and stays consistent with the snapshot ('').
        backboneXml: outputs.assembly.backboneXml,
      });

      // Freeze the exact signed package so resume HYDRATES it instead of
      // re-deriving (which is non-reproducible under useAI). Carries the full
      // identity tuple so the resume integrity recompute is self-contained.
      const signedSnapshot = buildSignedSnapshot(
        outputs.assembly,
        outputs.validation,
        inputs.submissionId,
        inputs.organizationId,
      );

      // Seal the digest with the server-held key so a mutable-steps-column
      // tamper cannot forge a self-consistent snapshot+digest (null when
      // unsealed — dev/staging without AUDIT_HMAC_KEY). See sign-payload-seal.
      const payloadSeal = sealSignPayloadDigest(payloadDigest, inputs.organizationId) ?? undefined;

      // OQ-7: tenant-scoped lookup — WHERE organization_id = $1.
      const existing = await findActiveReleaseSignature({
        organizationId: inputs.organizationId,
        boundPayloadDigest: payloadDigest,
      });

      if (existing) {
        // OQ-2: an existing matching signature satisfies the gate. Any
        // change to inputs would change the digest and produce no match,
        // forcing a re-sign — that's the regenerate-after-sign invariant.
        const completePayload: PackageSignStepPayload = {
          payloadDigest,
          payloadSeal,
          signatureId: existing.id,
          awaitingSince: new Date().toISOString(),
          signedSnapshot,
        };
        signStep.status = 'complete';
        signStep.completedAt = new Date().toISOString();
        signStep.durationMs = Date.now() - tSign;
        signStep.outputRef = JSON.stringify(completePayload);
        signStep.outputHash = hashOutput(completePayload);
        await persistStepEvent(run.runId, run.organizationId, signStep, 'complete', run.submissionFk);
        recordOrchestratorStepCompleted({
          step: 'package.sign',
          durationMs: signStep.durationMs,
        });
        // Sequence number used for the digest — informational; reading
        // back later if a future probe needs it.
        void sequenceNumberForDigest;
      } else {
        // OQ-3: one signature per release (one electronic_signatures row,
        // sig_meaning='approval'). Until that row exists, the run hangs in
        // awaiting-signature.
        const awaitingPayload: PackageSignStepPayload = {
          payloadDigest,
          payloadSeal,
          awaitingSince: new Date().toISOString(),
          signedSnapshot,
        };
        signStep.status = 'awaiting-signature';
        // Leave completedAt unset; this step is non-terminal.
        signStep.completedAt = undefined;
        signStep.durationMs = Date.now() - tSign;
        signStep.outputRef = JSON.stringify(awaitingPayload);
        signStep.outputHash = hashOutput(awaitingPayload);
        // Persist the audit event as 'complete' for the start/complete
        // pairing convention (mirrors the csr.draft-narrative pattern);
        // the status column on the row records 'awaiting-signature' so an
        // auditor can distinguish.
        await persistStepEvent(run.runId, run.organizationId, signStep, 'complete', run.submissionFk);

        // Suspend the run — return unchanged. Caller (UI or background
        // poller) invokes the signing route, then re-invokes
        // runOrchestrator(inputs, { resumeRunId }) to advance.
        run.status = 'awaiting-signature';
        run.completedAt = undefined;
        await persistRun(run);
        return 'suspended';
      }
    } catch (err) {
      signStep.completedAt = new Date().toISOString();
      signStep.durationMs = Date.now() - tSign;
      signStep.status = 'failed';
      signStep.error = err instanceof Error ? err.message : String(err);
      recordOrchestratorStepFailed({
        step: 'package.sign',
        errorCode: classifyStepError(err),
      });
      await persistStepEvent(run.runId, run.organizationId, signStep, 'fail', run.submissionFk);
      throw err;
    }
  }
  return 'settled';
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

  // Workflow-definition drift check (auth/e-sig audit 2026-07-30): the run
  // recorded the definition it was created under; resuming under a different
  // one is legal (the run's own dependsOn snapshot governs its history — see
  // markDownstreamStale) but must be VISIBLE, not silent — an auditor reading
  // the run needs to know its execution spanned two workflow definitions.
  if (
    previousRun.dependencyGraphDigest &&
    previousRun.dependencyGraphDigest !== computeDependencyGraphDigest()
  ) {
    console.warn(
      `[Orchestrator] resume: workflow definition drift — run ${resumeRunId} was created under ` +
        `${previousRun.workflowVersion ?? 'unknown version'} (digest ${previousRun.dependencyGraphDigest.slice(0, 12)}…) ` +
        `but the live definition is ${WORKFLOW_DEFINITION_VERSION} (digest ${computeDependencyGraphDigest().slice(0, 12)}…). ` +
        'The run resumes under its own step snapshot; new steps use the live definition.',
    );
  }

  // Path-to-GA §C.11 resume support: check for an awaiting-signature step
  // BEFORE the awaiting-async check. The two suspend states are
  // mutually-exclusive on a single run today (csr.draft-narrative happens
  // long before package.sign), but if both ever co-occurred we'd want to
  // resolve the upstream awaiting-async first — so awaiting-async is
  // intentionally checked first.
  const awaitingAsyncStep = previousRun.steps.find(s => s.status === 'awaiting-async');
  const awaitingSignatureStep = previousRun.steps.find(s => s.status === 'awaiting-signature');

  if (!awaitingAsyncStep && !awaitingSignatureStep) {
    // No suspended step → nothing to resume. Return the run unchanged.
    // The caller is expected to have used getRunResumeReadiness to gate this
    // call, so reaching here is unusual but not an error.
    const outputs = rederiveSyncOutputsForResume(inputs);
    return { run: previousRun, outputs };
  }

  // ── awaiting-signature branch (Path-to-GA §C.11) ────────────────────────
  if (awaitingAsyncStep === undefined && awaitingSignatureStep) {
    return resumeAwaitingSignature(inputs, previousRun, awaitingSignatureStep);
  }

  const awaitingStep = awaitingAsyncStep!;

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
        previousRun.submissionFk,
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
      previousRun.submissionFk,
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
    await persistStepEvent(runId, previousRun.organizationId, step, 'start', previousRun.submissionFk);
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
      await persistStepEvent(runId, previousRun.organizationId, step, 'complete', previousRun.submissionFk);
    } catch (err) {
      step.completedAt = new Date().toISOString();
      step.durationMs = Date.now() - t0;
      step.status = 'failed';
      step.error = err instanceof Error ? err.message : String(err);
      await persistStepEvent(runId, previousRun.organizationId, step, 'fail', previousRun.submissionFk);
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
        outputRef: `m1.admin:not-generated (delegated to the ${inputs.region.toLowerCase()} regional template; no Module 1 content is in this package)`,
        output: { region: inputs.region, applicationNumber: inputs.applicationNumber },
      };
    });

    // package.assemble
    const sequenceNumber = inputs.sequenceNumber ?? '0000';
    let assembledLeafBuffers: Record<string, Buffer> | undefined;
    await runStep('package.assemble', hashOutput(outputs), async () => {
      const { assembled, leafBuffers } = await assembleForValidation(
        outputs.module3Sections,
        inputs,
        sequenceNumber,
      );
      outputs.assembly = assembled;
      assembledLeafBuffers = leafBuffers;
      return { outputRef: `package.assemble:${assembled.leaves.length}-leaves (Module 3 only; M1/M2/CSR outputs are reported on the run but are not in this package)`, output: assembled };
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
          leafBuffers: assembledLeafBuffers,
        };
        const result = await validateEctdPackageHardened(
          assembly.leaves,
          context,
          assembly.backboneXml,
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
          outputRef: `package.validate:gateway-ready (Module 3 only) score=${result.hardenedScore}`,
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

    // package.sign — the same gate as the fresh run (see runPackageSignGate).
    if (stepOf('package.sign').status === 'pending') {
      const gate = await runPackageSignGate({ run: previousRun, inputs, outputs, stepOf });
      if (gate === 'suspended') return { run: previousRun, outputs };
    }

    previousRun.status = finalRunStatus(previousRun.steps, inputs);
  } catch (err) {
    previousRun.status = 'failed';
    console.error('[Orchestrator] resume failed:', err);
  }

  previousRun.completedAt = new Date().toISOString();
  await persistRun(previousRun);
  return { run: previousRun, outputs };
}

// ── Resume path: awaiting-signature (Path-to-GA §C.11) ─────────────────────

/**
 * Drive a previously-suspended `package.sign` run forward.
 *
 * Steps:
 *   1. Re-derive the in-memory outputs (sync only — m3.compose, csr.tabulate,
 *      m2.* deterministic builders, package.assemble, package.validate).
 *      Mirrors the awaiting-async resume so downstream behavior is consistent.
 *   2. Re-compute the bound payload digest from the rederived outputs.
 *   3. If the recomputed digest does NOT match the persisted digest, the
 *      payload has drifted under us (regenerate-after-suspend). Per OQ-2 the
 *      step transitions to `failed` with `signature_payload_drift`; the
 *      caller must regenerate from the changed upstream step and re-sign.
 *   4. Otherwise: WHERE organization_id = $1 AND bound_payload_digest = $2
 *      AND superseded_by IS NULL (OQ-4 + OQ-7). If a row exists, transition
 *      the step to `complete`; if not, leave it in `awaiting-signature` and
 *      return.
 *
 * No transmit step yet; once package.sign is `complete`, the run rolls up to
 * `complete` (or `partial` if any other step failed).
 */
/** Fail the package.sign step closed on a resume terminal, persist the audit
 *  event + run row, and fire the run-completed metric (the fresh path fires it
 *  at run end; resume terminals must fire it too or the counter/histogram
 *  undercount every resume-finalized run). Duration is wall-clock from run
 *  start — it includes the human-signature wait, which is the honest
 *  time-to-finalize for a suspended run. */
async function failResumeSignStep(
  signStep: StepRecord,
  previousRun: OrchestratorRun,
  outputs: OrchestratorOutputs,
  error: string,
): Promise<{ run: OrchestratorRun; outputs: OrchestratorOutputs }> {
  signStep.status = 'failed';
  signStep.error = error;
  signStep.completedAt = new Date().toISOString();
  await persistStepEvent(
    previousRun.runId,
    previousRun.organizationId,
    signStep,
    'fail',
    previousRun.submissionFk,
  );
  previousRun.status = 'failed';
  previousRun.completedAt = new Date().toISOString();
  await persistRun(previousRun);
  recordOrchestratorRunCompleted({
    submissionType: previousRun.submissionType,
    region: previousRun.region,
    status: 'failed',
    durationMs: Math.max(0, Date.now() - new Date(previousRun.startedAt).getTime()),
  });
  return { run: previousRun, outputs };
}

async function resumeAwaitingSignature(
  inputs: OrchestratorInputs,
  previousRun: OrchestratorRun,
  signStep: StepRecord,
): Promise<{ run: OrchestratorRun; outputs: OrchestratorOutputs }> {
  const persistedPayload = tryParseSignPayload(signStep.outputRef);
  if (!persistedPayload) {
    throw new Error(
      `[Orchestrator] resume: package.sign step has no parseable payload (outputRef='${signStep.outputRef ?? ''}')`,
    );
  }

  // Resolve the digest to look up the signature by. Two paths:
  //
  //   (A) HYDRATE — runs signed on/after the snapshot-persistence change carry
  //       the exact signed package (persistedPayload.signedSnapshot). We
  //       recompute the digest FROM THAT SNAPSHOT, never re-deriving from
  //       source. This is the correct §11.70 semantics (release the record that
  //       was signed) and the fix for useAI (AI narratives cannot be
  //       reproduced byte-for-byte) and for input key-order fragility. The only
  //       failure mode is stored-snapshot corruption, which fails closed.
  //
  //   (B) LEGACY re-derive — runs suspended BEFORE the change have no snapshot;
  //       fall back to re-deriving assembly + validation and drift-checking.
  //       Such in-flight runs are expected to be re-signed post-deploy anyway
  //       (see docs/runbooks/ectd-signature-payload-deploy-boundary.md); a real
  //       source change still surfaces as signature_payload_drift.
  let outputs: OrchestratorOutputs;
  let recomputedDigest: string;

  if (persistedPayload.signedSnapshot) {
    const snap = persistedPayload.signedSnapshot;
    // module3Sections/csrTables are re-derived only for display continuity in
    // the returned outputs; they are NOT the signed record and never feed the
    // digest. Done first so a fail-closed exit still returns populated outputs.
    outputs = rederiveSyncOutputsForResume(inputs);

    // Fail CLOSED (not throw) on a structurally-malformed snapshot: a corrupted
    // persisted record must surface as signature_snapshot_integrity_failure, not
    // an uncaught error at digest recompute.
    const snapshotWellFormed =
      Array.isArray(snap.leaves) &&
      snap.validatorOutcome != null &&
      typeof snap.validatorOutcome === 'object' &&
      typeof snap.submissionId === 'string' &&
      typeof snap.organizationId === 'number' &&
      typeof snap.applicationNumber === 'string' &&
      typeof snap.region === 'string' &&
      typeof snap.submissionType === 'string';
    if (!snapshotWellFormed) {
      return failResumeSignStep(signStep, previousRun, outputs, 'signature_snapshot_integrity_failure');
    }

    // The frozen record must be for the submission/tenant being resumed. This is
    // a caller/run consistency check DISTINCT from snapshot corruption: getRun
    // already tenant-scopes the run and resumeOrchestratorRun re-checks the org,
    // but the snapshot carries its OWN full identity, so verify the whole tuple
    // and label a mismatch clearly (a resume for the wrong submission, not a
    // corrupted record).
    if (
      snap.submissionId !== inputs.submissionId ||
      snap.organizationId !== inputs.organizationId ||
      snap.applicationNumber !== inputs.applicationNumber ||
      snap.region !== inputs.region ||
      snap.submissionType !== inputs.submissionType
    ) {
      return failResumeSignStep(signStep, previousRun, outputs, 'signature_resume_identity_mismatch');
    }

    // Hydrate the FROZEN signed assembly.
    outputs.assembly = {
      leaves: snap.leaves,
      totalSizeBytes: snap.totalSizeBytes,
      applicationNumber: snap.applicationNumber,
      sequenceNumber: snap.sequenceNumber,
      region: snap.region,
      submissionType: snap.submissionType,
      backboneXml: snap.backboneXml,
    };

    // Integrity guard: recompute the digest ENTIRELY from the snapshot's own
    // fields — SELF-CONTAINED (identity from the snapshot, backbone included, so
    // all of the frozen record is covered, not just leaves+validatorOutcome) —
    // and require it to equal the signed digest. A mismatch means the persisted
    // record was corrupted/tampered; fail closed. ('' backbone is falsy → the
    // helper omits it, matching sign-prep for fallback regions.)
    recomputedDigest = computeBoundPayloadDigestFromComponents({
      leaves: snap.leaves,
      validatorOutcome: snap.validatorOutcome,
      submissionId: snap.submissionId,
      applicationNumber: snap.applicationNumber,
      region: snap.region,
      submissionType: snap.submissionType,
      organizationId: snap.organizationId,
      backboneXml: snap.backboneXml || undefined,
    });

    if (recomputedDigest !== persistedPayload.payloadDigest) {
      return failResumeSignStep(signStep, previousRun, outputs, 'signature_snapshot_integrity_failure');
    }

    // Authenticity guard: the integrity check above only proves the snapshot is
    // self-consistent with a digest stored in the SAME mutable steps column. The
    // server-keyed seal proves that digest was produced by the server (a
    // steps-column tamperer cannot forge the seal without AUDIT_HMAC_KEY).
    //   - 'failed'   → present but wrong (tamper), or key gone: fail closed.
    //   - 'unsealed' AND a key IS configured → a snapshot-bearing run under a
    //     sealed posture MUST carry a valid seal; its absence is a strip-the-seal
    //     downgrade attempt, so fail closed too.
    //   - 'unsealed' with no key (dev/staging) → skip; rely on the integrity guard.
    const sealVerdict = verifySignPayloadSeal(
      recomputedDigest,
      snap.organizationId,
      persistedPayload.payloadSeal,
    );
    if (sealVerdict === 'failed' || (sealVerdict === 'unsealed' && isSignSealConfigured())) {
      return failResumeSignStep(signStep, previousRun, outputs, 'signature_seal_verification_failed');
    }
  } else {
    // ── (B) LEGACY re-derive path (runs suspended before snapshot support) ──
    // Re-derive sync outputs. This includes module3Sections (composeFullModule3)
    // and csrTables; subsequent helpers below rebuild assembly + validation.
    outputs = rederiveSyncOutputsForResume(inputs);

    // Re-run the downstream synchronous side effects up to but NOT including
    // package.sign — we need outputs.assembly + outputs.validation to recompute
    // the digest. The m2.* / m1.admin / package.assemble / package.validate
    // steps on previousRun are already terminal (complete/failed/skipped); we
    // re-execute the validators in-memory to populate outputs without
    // re-persisting the step records (they retain their original terminal
    // status on previousRun.steps).
    //
    // Building outputs.m2.* etc. requires the original inputs the caller
    // supplies via OrchestratorInputs.
    outputs.m23 =
      outputs.module3Sections.length > 0
        ? buildM23QualityOverallSummary({
            module3Sections: outputs.module3Sections,
            drugSubstanceName: inputs.drugSubstanceName,
            drugProductName: inputs.drugProductName,
          })
        : undefined;
    outputs.m24 =
      inputs.nonclinicalStudies.length > 0
        ? buildM24NonclinicalOverview({
            nonclinicalStudies: inputs.nonclinicalStudies,
            drugSubstanceName: inputs.drugSubstanceName,
            indication: inputs.indication,
          })
        : undefined;
    outputs.m25 =
      inputs.csrInputs.length > 0
        ? buildM25ClinicalOverview({
            csrs: inputs.csrInputs,
            indication: inputs.indication || '[indication not specified]',
            investigationalProduct:
              inputs.drugProductName || inputs.drugSubstanceName || '[product]',
          })
        : undefined;
    outputs.m27 =
      inputs.csrInputs.length > 0
        ? buildM27ClinicalSummary({
            csrs: inputs.csrInputs,
            indication: inputs.indication || '[indication not specified]',
            investigationalProduct:
              inputs.drugProductName || inputs.drugSubstanceName || '[product]',
          })
        : undefined;

    // package.assemble + package.validate re-derivation. The re-derived assembly
    // is byte-deterministic (renderLeafPdf is deterministic + PDF/A conversion is
    // skipped), so the OQ-5 drift digest — sha256(assembly.leaves) — matches the
    // originally validated run.
    const sequenceNumber = inputs.sequenceNumber ?? '0000';
    const { assembled, leafBuffers } = await assembleForValidation(
      outputs.module3Sections,
      inputs,
      sequenceNumber,
    );
    outputs.assembly = assembled;

    if (!inputs.skipValidation) {
      const context: HardenedValidationContext = {
        submissionId: inputs.submissionId,
        region: outputs.assembly.region as HardenedValidationContext['region'],
        applicationNumber: outputs.assembly.applicationNumber,
        sequenceNumber: outputs.assembly.sequenceNumber,
        submissionType: outputs.assembly.submissionType,
        totalSizeBytes: outputs.assembly.totalSizeBytes,
        leafBuffers,
      };
      outputs.validation = await validateEctdPackageHardened(
        outputs.assembly.leaves,
        context,
        outputs.assembly.backboneXml,
      );
    }

    // OQ-5: drift-detect by recomputing the digest. If validation is missing
    // (skipValidation=true) we cannot bind to a validator outcome — fail the
    // step rather than sign a non-validated package.
    if (!outputs.validation) {
      return failResumeSignStep(
        signStep,
        previousRun,
        outputs,
        'package.sign cannot resume: validation outcome missing (skipValidation set?)',
      );
    }

    recomputedDigest = computeBoundPayloadDigest({
      assembly: outputs.assembly,
      validation: outputs.validation,
      submissionId: inputs.submissionId,
      applicationNumber: inputs.applicationNumber,
      region: inputs.region,
      submissionType: inputs.submissionType,
      organizationId: inputs.organizationId,
    });

    if (recomputedDigest !== persistedPayload.payloadDigest) {
      // Drift — the inputs to the signed payload have changed since the run
      // was suspended. Per OQ-2 the run cannot recover; the user must
      // regenerate from the changed upstream step (which produces a fresh
      // awaiting-signature with a new digest) and re-sign.
      return failResumeSignStep(signStep, previousRun, outputs, 'signature_payload_drift');
    }
  }

  // No drift — look up the active signature. OQ-7: WHERE organization_id = $1.
  // OQ-4: AND superseded_by IS NULL.
  const found = await findActiveReleaseSignature({
    organizationId: inputs.organizationId,
    boundPayloadDigest: recomputedDigest,
  });

  if (!found) {
    // Still no signature — leave the run in awaiting-signature, return
    // unchanged. The caller polls again later (after the signing route
    // creates the row).
    return { run: previousRun, outputs };
  }

  // Active signature found → transition step to complete, run rolls up.
  // Carry the signed snapshot forward so a subsequent resume still hydrates
  // the frozen record rather than falling back to re-derivation.
  const completePayload: PackageSignStepPayload = {
    payloadDigest: recomputedDigest,
    payloadSeal: persistedPayload.payloadSeal,
    signatureId: found.id,
    awaitingSince: persistedPayload.awaitingSince,
    signedSnapshot: persistedPayload.signedSnapshot,
  };
  signStep.status = 'complete';
  signStep.completedAt = new Date().toISOString();
  signStep.outputRef = JSON.stringify(completePayload);
  signStep.outputHash = hashOutput(completePayload);
  await persistStepEvent(
    previousRun.runId,
    previousRun.organizationId,
    signStep,
    'complete',
    previousRun.submissionFk,
  );

  previousRun.status = finalRunStatus(previousRun.steps, inputs);
  previousRun.completedAt = new Date().toISOString();
  await persistRun(previousRun);
  // Fire the run-completed metric on this resume terminal — the fresh path's
  // recorder does not run for a run finalized via signature resume.
  recordOrchestratorRunCompleted({
    submissionType: previousRun.submissionType,
    region: previousRun.region,
    status: previousRun.status as 'complete' | 'failed' | 'partial',
    durationMs: Math.max(0, Date.now() - new Date(previousRun.startedAt).getTime()),
  });
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

  // Honor the run's OWN dependency snapshot (each StepRecord carries the
  // dependsOn edges it was created with), not the live STEP_DEPENDENCIES
  // constant — otherwise a deploy that edits the graph silently reinterprets
  // which steps of an in-flight run are downstream of a change. The live
  // constant is only the fallback for legacy records persisted before
  // dependsOn was snapshotted.
  const edgesFor = (s: StepRecord): StepKey[] =>
    Array.isArray(s.dependsOn) ? s.dependsOn : (STEP_DEPENDENCIES[s.key] ?? []);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const step of steps) {
      if (edgesFor(step).includes(current) && !stale.has(step.key)) {
        stale.add(step.key);
        queue.push(step.key);
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
 * Mark the steps of `previousRun` that `changedStep` / changed inputs made
 * stale, PERSIST those markers on the previous run, then run a FRESH pass of
 * the whole pipeline under a new runId.
 *
 * Honest contract: every step re-runs on the new run — nothing is reused.
 * `regenerated` lists the steps that were stale on the superseded run (the
 * audit of WHY a re-run was needed), not a subset that was recomputed.
 * `supersededRunId` names the previous run, whose record now carries the
 * stale markers instead of silently showing its old `complete` statuses.
 */
export async function regenerateAffected(
  previousRun: OrchestratorRun,
  inputs: OrchestratorInputs,
  changedStep?: StepKey
): Promise<{
  run: OrchestratorRun;
  outputs: OrchestratorOutputs;
  regenerated: StepKey[];
  supersededRunId: string;
}> {
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

  // The staleness was computed in memory and never written, so the previous
  // run kept showing `complete` on steps whose inputs had changed.
  if (stale.length > 0) await persistRun(previousRun);

  // Run a fresh orchestrator pass — the earlier run record is preserved in audit log
  const fresh = await runOrchestrator(inputs);

  return { run: fresh.run, outputs: fresh.outputs, regenerated: stale, supersededRunId: previousRun.runId };
}

// ── Status query ────────────────────────────────────────────────────────────

/** A run/audit read that could not be completed (as opposed to a run that does not exist). */
export class OrchestratorReadError extends Error {
  readonly operation: 'getRun' | 'getRunAudit';
  readonly cause: unknown;
  constructor(operation: 'getRun' | 'getRunAudit', cause: unknown) {
    super(`[Orchestrator] ${operation} failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'OrchestratorReadError';
    this.operation = operation;
    this.cause = cause;
  }
}

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
      `SELECT run_id, organization_id, submission_id, submission_id_fk, application_number, region, submission_type,
              started_at, completed_at, status, steps, workflow_version, dependency_graph_digest
       FROM submission_orchestrator_runs
       WHERE run_id = $1 AND organization_id = $2`,
      [runId, organizationId]
    );
    // Collapsed result: not-found and org-mismatch both return null so the caller
    // cannot distinguish a missing run from a cross-tenant probe.
    if (result.rows.length === 0) return null;
    const row = result.rows[0] as Record<string, unknown>;
    // Path-to-GA §C.4 (Path B): submission_id_fk is nullable during the
    // transition window — we project it back as `null` when absent so the
    // resume / regenerate paths can faithfully round-trip a NULL FK without
    // accidentally overwriting it with `undefined` semantics. Numbers come
    // back as `number`; strings (PG driver quirk on some setups) are
    // coerced; anything else collapses to null.
    let submissionFkOut: number | null = null;
    const rawFk = row.submission_id_fk;
    if (typeof rawFk === 'number' && Number.isFinite(rawFk) && rawFk > 0) {
      submissionFkOut = rawFk;
    } else if (typeof rawFk === 'string') {
      const n = Number(rawFk);
      if (Number.isFinite(n) && n > 0) submissionFkOut = n;
    }
    return {
      runId: String(row.run_id),
      organizationId: Number(row.organization_id),
      submissionId: String(row.submission_id),
      submissionFk: submissionFkOut,
      applicationNumber: String(row.application_number),
      region: String(row.region) as RegionCode,
      submissionType: String(row.submission_type),
      startedAt: String(row.started_at),
      completedAt: row.completed_at ? String(row.completed_at) : undefined,
      status: String(row.status) as OrchestratorRun['status'],
      steps: typeof row.steps === 'string' ? JSON.parse(row.steps) : (row.steps as StepRecord[]),
      workflowVersion: typeof row.workflow_version === 'string' ? row.workflow_version : null,
      dependencyGraphDigest:
        typeof row.dependency_graph_digest === 'string' ? row.dependency_graph_digest : null,
    };
  } catch (err) {
    // A failed read is not a missing run. Returning null here rendered a
    // database outage as 404 run_not_found on every route built on getRun.
    throw new OrchestratorReadError('getRun', err);
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
    // An empty array is "this run has no recorded actions" — the audit trail
    // is the compliance record, so a failed read must never look like that.
    throw new OrchestratorReadError('getRunAudit', err);
  }
}

// ── Path-to-GA §C.4 helper: TEXT submissionId → canonical FK ───────────────
//
// Callers that historically hold only the free-form `submission_id TEXT` can
// use this helper to (best-effort, conservatively) resolve it to the
// canonical `public.submissions(id)` FK BEFORE invoking `runOrchestrator`,
// so the new orchestrator row carries a non-null `submission_id_fk` from
// day one.
//
// Resolution rule (Path B, intentionally conservative):
//   1. Trim whitespace.
//   2. The TEXT must coerce to a positive finite integer. Business-domain
//      codes like 'SUB-2026-001' or GUIDs return null — no schema-level
//      business-key column exists today (see design doc §B Path C), so any
//      string→id mapping would be a guess. We refuse to guess.
//   3. The resolved integer MUST match a row in `public.submissions(id)`
//      owned by the supplied `organizationId`. A submissions row owned by
//      a DIFFERENT org returns null (Risk #3 in the design doc — a
//      cross-tenant FK leak would be a Part 11 violation worse than the
//      original provenance gap).
//
// On any DB error: returns null (caller proceeds with FK undefined, row
// goes into the "unresolved lineage" bucket). The helper is best-effort;
// the orchestrator path never blocks on it.
//
// SECURITY: `organizationId` is REQUIRED. The SQL filter on
// organization_id is the load-bearing tenant guard; the helper refuses
// non-positive or non-finite values explicitly.
export async function loadSubmissionFkBySubmissionIdText(
  text: string,
  organizationId: number
): Promise<number | null> {
  // Tenant gate — same shape as runOrchestrator / getRun.
  if (!Number.isFinite(organizationId) || organizationId <= 0) {
    return null;
  }
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;

  // Path B: only integer-coercible TEXT resolves. Anything else (GUID,
  // 'SUB-2026-001', empty string) returns null — we will NOT guess.
  const candidate = Number(trimmed);
  if (!Number.isInteger(candidate) || candidate <= 0) {
    return null;
  }

  try {
    // Tenant-scoped probe against the canonical core. Filtering on
    // organization_id is the §11.10(e) defense; without it a caller in
    // org A could resolve a TEXT to a submission in org B and the
    // orchestrator row would cross-link tenants.
    const result = await pool.query(
      `SELECT id FROM submissions WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [candidate, organizationId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0] as Record<string, unknown>;
    const id = Number(row.id);
    if (!Number.isFinite(id) || id <= 0) return null;
    return id;
  } catch (err) {
    console.warn(
      '[Orchestrator] loadSubmissionFkBySubmissionIdText failed (non-fatal):',
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

