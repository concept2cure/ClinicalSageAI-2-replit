/**
 * `DesignGap` — why the adapter could not take a value from the design, and
 * what it did instead.
 *
 * Its own module since 2026-10-11 so `design-adapter.ts` and
 * `structural-design.ts` can both produce gaps without an import cycle.
 * `design-adapter.ts` re-exports it, so every existing importer is unchanged.
 */
import type { EndpointType as EngineEndpointType, StatisticalInput } from '../ana-biostats/types';

export type { EngineEndpointType };

/** Why the adapter could not take a value from the design, and what it did instead. */
export interface DesignGap {
  /**
   * The engine input this concerns (e.g. "effectSize"), or one of the three
   * design-level concerns that are not a single engine input:
   * `primaryEndpoint`, `estimand`, and `carryover` (the crossover design's
   * no-carryover assumption, which the sizing takes and does not verify).
   */
  field: keyof StatisticalInput | 'primaryEndpoint' | 'estimand' | 'carryover';
  /** Sentence for a person: what was missing and what was assumed, if anything. */
  message: string;
  /**
   * `blocking` — no defensible default exists; the computation must not run.
   * `defaulted` — the engine's documented default was applied; the person
   *               should confirm it before anything is filed.
   * `note` — a lossy translation the reader should know about.
   */
  severity: 'blocking' | 'defaulted' | 'note';
  /** Where in the design object the value belongs, for the fix-it link. */
  designPath: string;
}
