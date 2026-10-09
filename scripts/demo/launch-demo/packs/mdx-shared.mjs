/**
 * packs/mdx-shared.mjs — the few helpers the MDX pack's modules share
 * (mdx.mjs, mdx-qms.mjs). Nothing here talks to the server on its own.
 */
import { demoTitle } from '../lib.mjs';

export const PACK = 'mdx';
export const T = (name) => demoTitle(PACK, name);
export const SIGNER_ABSENT =
  'not executed — signer credential not supplied (set OQ_SIGNER_EMAIL / OQ_SIGNER_PASSWORD to a second identity that holds signing authority)';
export const CHANGE_NUMBER = 'MDX-CC-2026-001';

/** Rows from a list route whichever envelope it uses. */
export const rowsOf = (res) => (Array.isArray(res.json) ? res.json : res.json?.data ?? res.json?.leaves ?? []);
/** The PDF writer encodes Latin-1; map the few typographic characters the prose uses. */
export const latin1 = (s) => String(s).replace(/—|–/g, '-').replace(/’/g, "'").replace(/“|”/g, '"').replace(/≥/g, '>=').replace(/≤/g, '<=');
/** A probe: the product's answer, recorded verbatim, never a failed step. */
export function probe(run, key, res, what) {
  run.record(key, { what, status: res.status, body: res.json ?? String(res.text ?? '').slice(0, 600) });
  return res;
}
/** A product finding, recorded once per run (a re-run of the same step never duplicates it). */
export const finding = (run, text) => {
  const note = `FINDING: ${text}`;
  if (!run.manifest.notes.some((n) => n.slice(0, 80) === note.slice(0, 80))) run.note(note);
};
