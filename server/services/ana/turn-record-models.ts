/**
 * Which models wrote a turn, as its record names them (AnA reasoning round 10,
 * GRD-missed, 2026-10-05).
 *
 * A turn record names the model of every call (`model.calls`, where the door
 * records them) and, separately, one model for the turn (`model.model`), which
 * is the FIRST call's: a later round may be served by another model after a
 * fallback. The claim verifier (authoring/machine-claim-verify.ts) read
 * `model.model`, so text a fallback model wrote was filed under the first.
 * This is now the one reader of "which model wrote this turn".
 *
 * @module server/services/ana/turn-record-models
 */

import type { TurnRecordBody } from './turn-record.js';

/** A model that served one or more of a turn's calls. */
export interface ServedModel {
  provider: string | null;
  model: string | null;
}

/**
 * Every model that served the turn, once each, in the order it first served:
 * from its calls where the door records them, otherwise the one model the
 * turn names. Empty when the record names none. A call whose model the
 * gateway did not report stays in, as an unknown author.
 */
export function servedModelsOf(model: TurnRecordBody['model'] | null | undefined): ServedModel[] {
  if (!model) return [];
  const calls = model.calls ?? [];
  const named = calls.length > 0 ? calls : model.model || model.provider ? [model] : [];
  const seen = new Set<string>();
  const out: ServedModel[] = [];
  for (const c of named) {
    const served = { provider: c.provider ?? null, model: c.model ?? null };
    const key = JSON.stringify([served.provider, served.model]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(served);
  }
  return out;
}
