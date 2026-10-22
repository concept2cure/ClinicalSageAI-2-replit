/**
 * A computed figure names the stored, reproducible run that produced it (D2,
 * Data Room catalog S5b, 2026-10-08;
 * docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md).
 *
 * The statistics engine has always stamped a result with its provenance
 * (computation-provenance.ts: engine, version, inputs SHA-256, seed), and
 * nothing kept it: the stamp went back to the caller and the design kept a
 * label. A planned N in a study design and its SAP could not be reproduced
 * from any record, because the inputs it was computed from were not stored.
 *
 * Now a run whose figure is used is a row of public.stats_computation_runs
 * (migrations/20261008f): the inputs as computed, the outputs, a SHA-256 of
 * each over the engine's own stable serialization, the method, engine,
 * version and seed. It is written in the transaction that uses the figure and
 * never updated. reproduceComputationRun recomputes the stored inputs and
 * compares: the record is a claim that can be checked, not a label.
 */
import { hashInputs, STATS_ENGINE, STATS_ENGINE_VERSION } from './computation-provenance';

type Exec = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> };

/** The methods a stored run can be recomputed with, by the name it is stored under. */
export const SAMPLE_SIZE_METHOD = 'ana-biostats:compute';

export interface ComputationRunInput {
  organizationId: number;
  programId: string | null;
  /** cdisc_prm_studies.id of the design the figure is for. */
  studyRef: number | null;
  method: string;
  methodVersion?: string | null;
  seed?: number | null;
  inputs: unknown;
  outputs: unknown;
  /** What the figure is used for, e.g. 'study-design:planned-sample-size'. */
  purpose: string;
  userId: number | null;
}

export interface RecordedRun {
  runId: number;
  inputsSha256: string;
  outputsSha256: string;
}

/**
 * The value as the row stores it: JSON drops an undefined field and writes a
 * NaN as null, so both hashes are taken over the stored form, and a recompute
 * is compared in the same form.
 */
const canonical = (v: unknown): unknown => JSON.parse(JSON.stringify(v ?? null));

/** Store the run, on the caller's transaction. */
export async function recordComputationRun(client: Exec, r: ComputationRunInput): Promise<RecordedRun> {
  const inputs = canonical(r.inputs);
  const outputs = canonical(r.outputs);
  const inputsSha256 = hashInputs(inputs);
  const outputsSha256 = hashInputs(outputs);
  const { rows } = await client.query(
    `INSERT INTO public.stats_computation_runs
       (organization_id, program_id, study_ref, method, method_version, engine, engine_version, seed,
        inputs, inputs_sha256, outputs, outputs_sha256, purpose, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11::jsonb, $12, $13, $14)
     RETURNING id`,
    [r.organizationId, r.programId, r.studyRef, r.method, r.methodVersion ?? null, STATS_ENGINE, STATS_ENGINE_VERSION,
      r.seed ?? null, JSON.stringify(inputs), inputsSha256, JSON.stringify(outputs), outputsSha256, r.purpose, r.userId],
  );
  return { runId: Number(rows[0].id), inputsSha256, outputsSha256 };
}

export type ReproductionResult =
  | { found: false }
  | {
      found: true;
      runId: number;
      method: string;
      /** The stored inputs still hash to what was recorded. */
      inputsIntact: boolean;
      /** The stored outputs still hash to what was recorded: an edited output is caught here. */
      outputsIntact: boolean;
      /** Recomputing the stored inputs gives the stored outputs. */
      reproduced: boolean;
      storedOutputsSha256: string;
      recomputedOutputsSha256: string | null;
      /** The engine that recomputed is the version that computed. A difference is said, not hidden. */
      engineVersionMatches: boolean;
      /** Why the run could not be recomputed, when it could not. */
      note?: string;
    };

/** Recompute a stored run of this organization from its stored inputs, and compare. */
export async function reproduceComputationRun(exec: Exec, organizationId: number, runId: number): Promise<ReproductionResult> {
  const { rows } = await exec.query(
    `SELECT id, method, engine_version, inputs, inputs_sha256, outputs, outputs_sha256
       FROM public.stats_computation_runs WHERE id = $1 AND organization_id = $2`,
    [runId, organizationId],
  );
  const run = rows[0];
  if (!run) return { found: false };
  const base = {
    found: true as const,
    runId: Number(run.id),
    method: String(run.method),
    inputsIntact: hashInputs(run.inputs) === run.inputs_sha256,
    outputsIntact: hashInputs(run.outputs) === run.outputs_sha256,
    storedOutputsSha256: String(run.outputs_sha256),
    engineVersionMatches: run.engine_version === STATS_ENGINE_VERSION,
  };
  if (run.method !== SAMPLE_SIZE_METHOD) {
    return { ...base, reproduced: false, recomputedOutputsSha256: null, note: `No recompute is registered for method ${run.method}.` };
  }
  const { computationEngine } = await import('../ana-biostats/computation-engine');
  const recomputed = hashInputs(canonical(computationEngine.compute(run.inputs)));
  return { ...base, reproduced: recomputed === run.outputs_sha256, recomputedOutputsSha256: recomputed };
}
