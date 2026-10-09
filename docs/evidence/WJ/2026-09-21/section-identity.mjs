/**
 * Section-level identity proof: for each edited prompt file, split the
 * ORIGINAL and the CURRENT file into `## ` sections and report which are
 * byte-identical, which changed, which were removed and which were added.
 *
 * Usage: node docs/evidence/WJ/2026-09-21/section-identity.mjs <origDir>
 *   origDir holds pre-edit copies named like the current files.
 */
import fs from 'node:fs';
import path from 'node:path';

const origDir = process.argv[2];
if (!origDir) throw new Error('origDir required');

const FILES = [
  ['server/services/ana-ri/persona.ts', 'persona.ts'],
  ['server/services/lumen-context/base-system-prompt.ts', 'base-system-prompt.ts'],
  ['server/services/ana-personality.ts', 'ana-personality.ts'],
  ['server/services/ana-ri/personality-core.ts', 'personality-core.ts'],
];

function sections(text) {
  const out = new Map();
  const parts = text.split(/\n(?=## )/);
  out.set('(preamble before first ## section)', parts[0]);
  for (const p of parts.slice(1)) {
    const title = p.split('\n')[0].replace(/^## /, '').trim();
    out.set(title, p);
  }
  return out;
}

for (const [cur, origName] of FILES) {
  const a = sections(fs.readFileSync(path.join(origDir, origName), 'utf8'));
  const b = sections(fs.readFileSync(cur, 'utf8'));
  console.info(`\n### ${cur}`);
  const identical = [], changed = [], removed = [], added = [];
  for (const [t, body] of a) {
    if (!b.has(t)) removed.push(t);
    else if (b.get(t) === body) identical.push(t);
    else changed.push(t);
  }
  for (const t of b.keys()) if (!a.has(t)) added.push(t);
  console.info(`byte-identical (${identical.length}):`);
  for (const t of identical) console.info(`  = ${t}`);
  console.info(`changed (${changed.length}):`);
  for (const t of changed) console.info(`  ~ ${t}`);
  console.info(`removed (${removed.length}):`);
  for (const t of removed) console.info(`  - ${t}`);
  console.info(`added (${added.length}):`);
  for (const t of added) console.info(`  + ${t}`);
}
