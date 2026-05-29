/**
 * Computation provenance for statistical results.
 *
 * Every simulation or stochastic computation the engine returns should carry a
 * provenance record so the result can be reproduced and audited: which method
 * produced it, at which engine version, with which seed, and a hash of the
 * inputs. This is the reproducibility contract a regulator expects from a
 * biostatistics tool.
 */

import { createHash } from 'crypto';
import { stableStringify } from './rng';

export const STATS_ENGINE = 'c2c-stats';
export const STATS_ENGINE_VERSION = '1.0.0';

export interface StatsProvenance {
  engine: string;
  engineVersion: string;
  method: string;
  methodVersion: string;
  /** The seed that produced this result. Re-running with this seed reproduces it. */
  seed: number;
  /** SHA-256 of the canonical (key-sorted) JSON of the inputs. */
  inputsSha256: string;
  reproducible: boolean;
  /** Wall-clock time the record was generated. Metadata only; not part of the result. */
  generatedAt: string;
  note: string;
}

/** SHA-256 of the canonical JSON of an inputs object. */
export function hashInputs(inputs: unknown): string {
  return createHash('sha256').update(stableStringify(inputs)).digest('hex');
}

export function buildProvenance(args: {
  method: string;
  methodVersion?: string;
  seed: number;
  inputs: unknown;
  note?: string;
}): StatsProvenance {
  return {
    engine: STATS_ENGINE,
    engineVersion: STATS_ENGINE_VERSION,
    method: args.method,
    methodVersion: args.methodVersion ?? '1.0.0',
    seed: args.seed,
    inputsSha256: hashInputs(args.inputs),
    reproducible: true,
    generatedAt: new Date().toISOString(),
    note: args.note ?? 'Deterministic given the same seed and inputs.',
  };
}
