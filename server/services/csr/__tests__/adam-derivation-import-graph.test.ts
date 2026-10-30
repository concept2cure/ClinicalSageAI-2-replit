/**
 * CDISC pilot defect D14: the pure ADaM derivation and narrative modules
 * opened a PostgreSQL pool on import (source-access -> authoring-program-access
 * -> db). Their runtime import closure must not reach server/db.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../../..');
const PURE = ['adam-dataset-reader', 'adam-rows', 'adam-source-derivation', 'adam-safety-domains', 'narrative-subject-selection',
  'narrative-subject-facts', 'narrative-compose'].map(f => path.join(ROOT, 'server/services/csr', `${f}.ts`));

/** Runtime (non-type) relative imports and re-exports of one module. */
function imports(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const found: string[] = [];
  for (const m of text.matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?['"](\.{1,2}\/[^'"]+)['"]/gm)) {
    const target = path.resolve(path.dirname(file), m[1].replace(/\.js$/, ''));
    found.push(`${target}.ts`);
  }
  return found;
}
function closure(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>([[entry, [entry]]]);
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift()!;
    for (const next of imports(file)) {
      if (seen.has(next)) continue;
      seen.set(next, [...seen.get(file)!, next]);
      try { readFileSync(next); queue.push(next); } catch { /* index or non-ts target: not followed */ }
    }
  }
  return seen;
}

describe('pure CSR derivation modules do not import the database', () => {
  it.each(PURE)('%s', entry => {
    const reach = [...closure(entry).entries()].filter(([f]) => f.includes(`${path.sep}server${path.sep}db${path.sep}`));
    expect(reach.map(([, chain]) => chain.map(f => path.relative(ROOT, f)).join(' -> '))).toEqual([]);
  });
});
