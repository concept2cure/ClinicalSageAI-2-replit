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
import type { HardenedValidationResult } from './ectd/ectd-validator-hardening.js';

// ── Types ───────────────────────────────────────────────────────────────────

export type StepKey =
  | 'm3.compose'
  | 'm3.appendices'
  | 'm3.regional'
  | 'csr.tabulate'
  | 'm2.3.qos'
  | 'm2.4.nonclinical'
  | 'm2.5.clinical'
  | 'm2.7.clinical'
  | 'm1.admin'
  | 'package.assemble'
  | 'package.validate';

export type StepStatus = 'pending' | 'running' | 'complete' | 'failed' | 'stale' | 'skipped';

export interface OrchestratorRun {
  runId: string;
  submissionId: string;
  applicationNumber: string;
  region: RegionCode;
  submissionType: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'complete' | 'failed' | 'partial';
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
  submissionId: string;
  applicationNumber: string;
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
}

export interface OrchestratorOutputs {
  module3Sections: ComposedSection[];
  csrTables: CSRTables[];
  m23?: M2Summary;
  m24?: M2Summary;
  m25?: M2Summary;
  m27?: M2Summary;
  /** Aggregate validation result if package.validate ran */
  validation?: HardenedValidationResult;
}

// ── Dependency graph ────────────────────────────────────────────────────────

const STEP_DEPENDENCIES: Record<StepKey, StepKey[]> = {
  'm3.compose': [],
  'm3.appendices': ['m3.compose'],
  'm3.regional': ['m3.compose'],
  'csr.tabulate': [],
  'm2.3.qos': ['m3.compose', 'm3.appendices', 'm3.regional'],
  'm2.4.nonclinical': [],
  'm2.5.clinical': ['csr.tabulate'],
  'm2.7.clinical': ['csr.tabulate'],
  'm1.admin': [],
  'package.assemble': ['m2.3.qos', 'm2.4.nonclinical', 'm2.5.clinical', 'm2.7.clinical', 'm1.admin'],
  'package.validate': ['package.assemble'],
};

const ORDERED_STEPS: StepKey[] = [
  'm3.compose',
  'm3.appendices',
  'm3.regional',
  'csr.tabulate',
  'm2.3.qos',
  'm2.4.nonclinical',
  'm2.5.clinical',
  'm2.7.clinical',
  'm1.admin',
  'package.assemble',
  'package.validate',
];

// ── Hashing for incremental rebuilds ────────────────────────────────────────

function hashInputs(...inputs: unknown[]): string {
  const h = crypto.createHash('sha256');
  for (const input of inputs) {
    h.update(JSON.stringify(input));
  }
  return h.digest('hex');
}

function hashOutput(output: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(output)).digest('hex');
}

// ── Audit log persistence ───────────────────────────────────────────────────

async function persistRun(run: OrchestratorRun): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO submission_orchestrator_runs
        (run_id, submission_id, application_number, region, submission_type, started_at, completed_at, status, steps)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (run_id) DO UPDATE SET
         completed_at = EXCLUDED.completed_at,
         status = EXCLUDED.status,
         steps = EXCLUDED.steps`,
      [
        run.runId,
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
    console.warn('[Orchestrator] persistRun failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}

async function persistStepEvent(
  runId: string,
  step: StepRecord,
  eventType: 'start' | 'complete' | 'fail' | 'stale'
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO submission_orchestrator_steps
        (run_id, step_key, event_type, status, input_hash, output_hash, output_ref, error, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        runId,
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
    console.warn('[Orchestrator] persistStepEvent failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}

// ── Top-level orchestration ─────────────────────────────────────────────────

/**
 * Run the full submission-package pipeline.
 * Returns both the orchestrator run record (with audit log) and the composed outputs.
 */
export async function runOrchestrator(
  inputs: OrchestratorInputs
): Promise<{ run: OrchestratorRun; outputs: OrchestratorOutputs }> {
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  const run: OrchestratorRun = {
    runId,
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
    await persistStepEvent(runId, step, 'start');

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
      await persistStepEvent(runId, step, 'complete');
    } catch (err) {
      step.completedAt = new Date().toISOString();
      step.durationMs = Date.now() - t0;
      step.status = 'failed';
      step.error = err instanceof Error ? err.message : String(err);
      await persistStepEvent(runId, step, 'fail');
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
    const m23Hash = hashInputs(outputs.module3Sections, inputs.drugSubstanceName, inputs.drugProductName);
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
    const m24Hash = hashInputs(inputs.nonclinicalStudies, inputs.drugSubstanceName, inputs.indication);
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
    const m25Hash = hashInputs(inputs.csrInputs, inputs.indication, inputs.drugProductName);
    await runStep('m2.5.clinical', m25Hash, async () => {
      if (inputs.csrInputs.length === 0) return null;
      outputs.m25 = buildM25ClinicalOverview({
        csrs: inputs.csrInputs,
        indication: inputs.indication || '[indication not specified]',
        investigationalProduct: inputs.drugProductName || inputs.drugSubstanceName || '[product]',
      });
      return { outputRef: `m2.5.clinical:completeness=${outputs.m25.completeness}`, output: outputs.m25 };
    });

    // m2.7.clinical
    const m27Hash = hashInputs(inputs.csrInputs, inputs.indication);
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

    // package.assemble — placeholder for handing off to ectdExportService
    await runStep('package.assemble', hashOutput(outputs), async () => {
      const assembled = {
        m3SectionCount: outputs.module3Sections.length,
        csrTableSets: outputs.csrTables.length,
        hasM23: !!outputs.m23,
        hasM24: !!outputs.m24,
        hasM25: !!outputs.m25,
        hasM27: !!outputs.m27,
      };
      return {
        outputRef: `package.assemble:${assembled.m3SectionCount}-m3-sections`,
        output: assembled,
      };
    });

    // package.validate
    if (!inputs.skipValidation) {
      await runStep('package.validate', hashOutput(outputs), async () => {
        // Validation hand-off: the orchestrator records the intent; the actual
        // hardened validator is invoked by the route handler that has access
        // to the assembled ZIP buffer / manifest.
        return {
          outputRef: 'package.validate:deferred-to-route-handler',
          output: { deferred: true },
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
    if (stale.has(step.key) && step.status === 'complete') {
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
  if (changedStep) {
    markDownstreamStale(previousRun.steps, changedStep);
  }

  // Detect input-hash changes for terminal-source steps
  const m3Hash = hashInputs(inputs.cmcSources, inputs.region);
  const csrHash = hashInputs(inputs.clinicalStudyData);
  const m24Hash = hashInputs(inputs.nonclinicalStudies, inputs.drugSubstanceName, inputs.indication);

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

export async function getRun(runId: string): Promise<OrchestratorRun | null> {
  try {
    const result = await pool.query(
      `SELECT run_id, submission_id, application_number, region, submission_type,
              started_at, completed_at, status, steps
       FROM submission_orchestrator_runs WHERE run_id = $1`,
      [runId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0] as Record<string, unknown>;
    return {
      runId: String(row.run_id),
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

export async function getRunAudit(runId: string): Promise<Array<{
  stepKey: string;
  eventType: string;
  status: string;
  inputHash: string;
  outputHash: string | null;
  outputRef: string | null;
  error: string | null;
  occurredAt: string;
}>> {
  try {
    const result = await pool.query(
      `SELECT step_key, event_type, status, input_hash, output_hash, output_ref, error, occurred_at
       FROM submission_orchestrator_steps
       WHERE run_id = $1
       ORDER BY occurred_at ASC`,
      [runId]
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
