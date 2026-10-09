/**
 * launch-demo/packs/biotech-shared.mjs — helpers shared by the biotech pack's
 * modules (idempotency tally, response-shape readers, signer constants).
 */
import fs from 'node:fs';
import path from 'node:path';
import { MANIFEST_ROOT } from '../lib.mjs';
import { PACK } from './biotech-content.mjs';

export const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const NOT_EXECUTED_NO_SIGNER = 'not executed — signer credential not supplied (OQ_SIGNER_EMAIL / OQ_SIGNER_PASSWORD)';

/** The array a list route answered with, whatever key it used. */
export const asArray = (j, ...keys) => {
  if (Array.isArray(j)) return j;
  for (const k of keys) if (Array.isArray(j?.[k])) return j[k];
  return [];
};

/** Read the previous manifest, if any, so ephemeral records (orchestration executions) are not re-run. */
export function previousManifest() {
  try {
    return JSON.parse(fs.readFileSync(path.join(MANIFEST_ROOT, PACK, 'manifest.json'), 'utf8'));
  } catch {
    return null;
  }
}

/** Counters for the second-run proof: what this run created vs found already present. */
export function makeTally(run) {
  const tally = { created: {}, found: {} };
  run.record('tally', tally);
  return {
    created(kind) {
      tally.created[kind] = (tally.created[kind] ?? 0) + 1;
    },
    found(kind) {
      tally.found[kind] = (tally.found[kind] ?? 0) + 1;
    },
    tally,
  };
}
