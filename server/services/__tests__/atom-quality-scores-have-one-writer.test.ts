/**
 * Atom quality scores have one writer: server/services/atomQualityService.ts.
 * 2026-10-15.
 *
 * scripts/cortex-enhancer.ts was a second writer of lumen_atom_quality_scores
 * that scored from constants nobody sourced — FDA 0.95, scrape 0.5, a
 * "placeholder" citation score of 0.6 / 0.2 from whether a URL was present,
 * accuracy defaulting to 0.5 when an atom carried no confidence. No npm
 * script, workflow, document or module ran it, and it could not have run:
 * it called a `logger` it never imported. Deleted.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const SKIP = new Set(['node_modules', 'dist', '__tests__', '_archive', '_deprecated']);

function* sourceFiles(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* sourceFiles(full);
    else if (/\.(ts|tsx|mjs|cjs|js)$/.test(e.name)) yield full;
  }
}

describe('lumen_atom_quality_scores', () => {
  it('is written by atomQualityService alone', () => {
    const writers: string[] = [];
    for (const top of ['scripts', 'server', 'shared']) {
      for (const f of sourceFiles(path.join(ROOT, top))) {
        if (/INSERT\s+INTO\s+lumen_atom_quality_scores\b/i.test(readFileSync(f, 'utf8'))) {
          writers.push(path.relative(ROOT, f));
        }
      }
    }
    expect(writers).toEqual(['server/services/atomQualityService.ts']);
  }, 60_000);
});
