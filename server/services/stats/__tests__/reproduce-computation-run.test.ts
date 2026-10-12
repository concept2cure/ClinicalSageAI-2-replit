/**
 * A filed figure can be re-run and checked (2026-10-12).
 *
 * `recordComputationRun` has written each sizing run's inputs, outputs and a
 * SHA-256 of each to public.stats_computation_runs since 2026-10-08
 * (migrations/20261008f), so that a planned N in a study design and its SAP
 * could be reproduced from a record rather than taken on a label.
 * `reproduceComputationRun` is the half that checks it — and it was reachable
 * from nothing: no route, no AnA tool, no client code. The records existed and
 * could not be checked, which is the same as not having them when a reviewer
 * asks.
 *
 * The two questions it answers are the ones a sponsor gets under statistical
 * defence: *"reproduce the planned sample size in your SAP from the inputs you
 * filed"* and *"prove this N was not edited after it was computed"*.
 *
 * It reports four facts separately, because they fail for different reasons
 * and one verdict would hide which:
 *   inputsIntact          the stored inputs still hash to their stored digest
 *   outputsIntact         the stored outputs still hash to theirs
 *   reproduced            re-running the engine on the stored inputs gives
 *                         the stored outputs digest
 *   engineVersionMatches  the engine is the version that produced it
 *
 * A reproduction that fails because the engine moved on is a different event
 * from one that fails because a row was edited.
 *
 * The database is stubbed: these cases are about what the function CONCLUDES
 * from a given row, which needs no Postgres.
 */
import { describe, expect, it } from 'vitest';
import {
  reproduceComputationRun,
  SAMPLE_SIZE_METHOD,
} from '../computation-runs';
import { hashInputs, STATS_ENGINE_VERSION } from '../computation-provenance';
import { computationEngine } from '../../ana-biostats/computation-engine';

/** A design the engine sizes without refusing. */
const INPUTS = {
  clientTrack: 'biotech_pharma',
  studyType: 'superiority',
  objectiveType: 'efficacy',
  endpointType: 'continuous',
  alpha: 0.05,
  powerTarget: 0.8,
  effectSize: 0.5,
  attritionRate: 0.1,
  allocationRatio: 1,
  numberOfGroups: 2,
};

/** The engine's own stable serialization, as computation-runs.ts canonicalises it. */
const canonicalOutputs = () => JSON.parse(JSON.stringify(computationEngine.compute(INPUTS as never)));

/** One row of public.stats_computation_runs, as stored. */
function row(over: Record<string, unknown> = {}) {
  const outputs = canonicalOutputs();
  return {
    id: 41,
    method: SAMPLE_SIZE_METHOD,
    engine_version: STATS_ENGINE_VERSION,
    inputs: INPUTS,
    inputs_sha256: hashInputs(INPUTS),
    outputs,
    outputs_sha256: hashInputs(outputs),
    ...over,
  };
}

/** An exec that returns one row, and records the tenant scoping it was given. */
const execFor = (rows: unknown[]) => {
  const calls: unknown[][] = [];
  return {
    calls,
    exec: {
      query: async (_text: string, params?: unknown[]) => {
        calls.push(params ?? []);
        return { rows: rows as any[] };
      },
    },
  };
};

describe('a run that is intact and still reproduces', () => {
  it('reports all four facts true', async () => {
    const { exec } = execFor([row()]);
    const r = await reproduceComputationRun(exec, 1, 41);

    expect(r.found).toBe(true);
    if (!r.found) return;
    expect(r.inputsIntact).toBe(true);
    expect(r.outputsIntact).toBe(true);
    expect(r.reproduced).toBe(true);
    expect(r.engineVersionMatches).toBe(true);
    expect(r.recomputedOutputsSha256).toBe(r.storedOutputsSha256);
  });

  it('scopes the lookup to the caller’s organization', async () => {
    const { calls, exec } = execFor([row()]);
    await reproduceComputationRun(exec, 7, 41);
    // Both the run id and the org id reach the query, so a run in another
    // tenant reads as not found rather than as a failed reproduction.
    expect(calls[0]).toEqual([41, 7]);
  });
});

describe('a run that was edited after it was filed', () => {
  it('reports the OUTPUTS as not intact when the stored result was changed', async () => {
    const outputs = canonicalOutputs();
    const stored = hashInputs(outputs);
    // Someone raised the sample size in the row without recomputing.
    const tampered = { ...outputs, sampleSize: { ...outputs.sampleSize, total: 999 } };
    const { exec } = execFor([row({ outputs: tampered, outputs_sha256: stored })]);

    const r = await reproduceComputationRun(exec, 1, 41);
    if (!r.found) throw new Error('expected the run to be found');
    expect(r.outputsIntact, 'an edited outputs row passed its own hash').toBe(false);
    // And the engine still produces the original, so the two disagree.
    expect(r.reproduced).toBe(true);
  });

  it('reports the INPUTS as not intact when the stored inputs were changed', async () => {
    const { exec } = execFor([row({ inputs: { ...INPUTS, effectSize: 0.9 } })]);
    const r = await reproduceComputationRun(exec, 1, 41);
    if (!r.found) throw new Error('expected the run to be found');

    expect(r.inputsIntact).toBe(false);
    // Re-running the EDITED inputs gives a different figure, so this also
    // fails to reproduce — two distinct facts about one row.
    expect(r.reproduced).toBe(false);
  });

  it('distinguishes "the engine moved on" from "the row changed"', async () => {
    const { exec } = execFor([row({ engine_version: '0.9.0' })]);
    const r = await reproduceComputationRun(exec, 1, 41);
    if (!r.found) throw new Error('expected the run to be found');

    expect(r.engineVersionMatches).toBe(false);
    // Everything else still holds: the row is intact and the current engine
    // happens to agree. A submission must be able to say which it is.
    expect(r.inputsIntact).toBe(true);
    expect(r.outputsIntact).toBe(true);
  });
});

describe('what it will not claim', () => {
  it('reports not-found for a run the tenant cannot see', async () => {
    const { exec } = execFor([]);
    const r = await reproduceComputationRun(exec, 1, 41);
    expect(r.found).toBe(false);
  });

  it('says so rather than reproducing a method it has no recompute for', async () => {
    const { exec } = execFor([row({ method: 'externalControl:tippingPointBorrow' })]);
    const r = await reproduceComputationRun(exec, 1, 41);
    if (!r.found) throw new Error('expected the run to be found');

    expect(r.reproduced).toBe(false);
    expect(r.recomputedOutputsSha256).toBeNull();
    expect(r.note).toMatch(/No recompute is registered/);
    // The integrity facts still hold — they do not depend on a recompute.
    expect(r.inputsIntact).toBe(true);
    expect(r.outputsIntact).toBe(true);
  });
});
