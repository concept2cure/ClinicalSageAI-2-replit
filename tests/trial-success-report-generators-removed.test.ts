/**
 * The three orphan "trial success" PDF generators are deleted. 2026-10-15.
 *
 * scripts/generate_intelligence_report.py, generate_success_pdf.py and
 * generate_usecase_report.py printed what their input did not carry as a
 * prediction: a missing success_rate became "Predicted Trial Success 50.0%"
 * and "50.0% — Assessment: Moderate probability of success"; a missing
 * prediction probability, "Success Probability: 65.0% (Moderate Risk)"; a
 * missing dropout rate, 0.0%; missing risk flags, "No major risk flags
 * identified". Nothing ran them — no npm script, workflow, Makefile target,
 * server spawn, document or other script names them — and their `fpdf` import
 * is not in requirements.txt, so they could not start from the repository's
 * own dependencies. Fixing figures nobody reads was not worth keeping them.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const NAMES = ['generate_intelligence_report', 'generate_success_pdf', 'generate_usecase_report'];
const SKIP = new Set(['node_modules', 'dist', 'evidence', '.git']);
const TEXT = /\.(ts|tsx|js|mjs|cjs|py|sh|json|ya?ml|md)$|^Makefile$|^Dockerfile/;

function* files(at: string): Generator<string> {
  if (!existsSync(at)) return;
  if (statSync(at).isFile()) {
    yield at;
    return;
  }
  for (const e of readdirSync(at, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const full = path.join(at, e.name);
    if (e.isDirectory()) yield* files(full);
    else if (TEXT.test(e.name)) yield full;
  }
}

describe('trial-success report generators', () => {
  it.each(NAMES)('scripts/%s.py is gone', (name) => {
    expect(existsSync(path.join(ROOT, 'scripts', `${name}.py`))).toBe(false);
  });

  it('nothing in the tree runs or names them', () => {
    const roots = ['package.json', 'Makefile', '.github', 'scripts', 'server', 'shared', 'docs', 'tests/python'];
    const named: string[] = [];
    for (const r of roots) {
      for (const f of files(path.join(ROOT, r))) {
        const src = readFileSync(f, 'utf8');
        for (const n of NAMES) if (src.includes(n)) named.push(`${path.relative(ROOT, f)}: ${n}`);
      }
    }
    expect(named, named.join('\n')).toEqual([]);
  }, 60_000);
});
