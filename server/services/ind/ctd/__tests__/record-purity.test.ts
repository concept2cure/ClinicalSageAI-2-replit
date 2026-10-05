/**
 * Record purity — the shared regulatory record stays client- and server-safe.
 *
 * `shared/regulatory/regional-module1.ts` and `shared/regulatory/regulatory-basis.ts`
 * are pure data plus pure helpers. `shared/regulatory/project-bootstrap.ts`
 * (re-exported by `@shared/regulatory`, so it reaches the client bundle) is due
 * to read the Module 1 record, so one runtime import of server code from the
 * record would drag the server into the browser build. The rule
 * (docs/design/ANA_REGULATORY_RECORD.md §2.2): runtime imports resolve inside
 * `shared/**` only; `import type` / `export type … from` are erased and allowed.
 *
 * The walk follows runtime imports transitively, so a shared file the record
 * imports cannot itself reach out of `shared/`. The checker is shown catching a
 * planted server import, a bare package import, a dynamic import and a
 * require(), and letting type-only imports through.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../../..');
const SHARED = path.join(ROOT, 'shared');

const RECORD_FILES = ['shared/regulatory/regional-module1.ts', 'shared/regulatory/regulatory-basis.ts'];

/** Runtime module specifiers in a TypeScript source (type-only forms excluded). */
function runtimeSpecifiers(source: string): string[] {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const out: string[] = [];
  // import … from 'x' | export … from 'x' (statement may span lines)
  const fromRe = /^\s*(import|export)\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/gm;
  for (const m of text.matchAll(fromRe)) {
    const clause = m[2].trim();
    if (/^type\b/.test(clause)) continue; // import type … / export type …
    // import { type A, type B } — every named binding type-only and no default
    const braces = /^\{([\s\S]*)\}$/.exec(clause);
    if (braces) {
      const names = braces[1].split(',').map((s) => s.trim()).filter(Boolean);
      if (names.length > 0 && names.every((n) => /^type\s/.test(n))) continue;
    }
    out.push(m[3]);
  }
  // side-effect import 'x'
  for (const m of text.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) out.push(m[1]);
  // dynamic import('x') and require('x')
  for (const m of text.matchAll(/\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
  return out;
}

/** Resolve a specifier from `fromFile` to an absolute path, or null for a bare package. */
function resolveSpecifier(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else if (spec.startsWith('@shared/')) base = path.join(SHARED, spec.slice('@shared/'.length));
  else if (spec.startsWith('shared/')) base = path.join(ROOT, spec);
  else return null;
  const stem = base.replace(/\.(js|ts)$/, '');
  for (const cand of [`${stem}.ts`, `${stem}.tsx`, path.join(stem, 'index.ts'), base]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
  }
  return `${stem}.ts`; // unresolved: still judged by where it points
}

/** Every runtime import reachable from `entry` that leaves shared/. */
function purityViolations(entry: string, readSource: (abs: string) => string = (p) => fs.readFileSync(p, 'utf8')): string[] {
  const violations: string[] = [];
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of runtimeSpecifiers(readSource(file))) {
      const target = resolveSpecifier(file, spec);
      const rel = path.relative(ROOT, file);
      if (target === null) {
        violations.push(`${rel}: runtime import of package "${spec}"`);
      } else if (!target.startsWith(SHARED + path.sep)) {
        violations.push(`${rel}: runtime import "${spec}" resolves outside shared/ (${path.relative(ROOT, target)})`);
      } else if (fs.existsSync(target)) {
        queue.push(target);
      }
    }
  }
  return violations;
}

describe('record purity', () => {
  for (const rel of RECORD_FILES) {
    it(`${rel} imports at runtime only from shared/**`, () => {
      const abs = path.join(ROOT, rel);
      expect(fs.existsSync(abs), `${rel} does not exist`).toBe(true);
      expect(purityViolations(abs)).toEqual([]);
    });
  }

  it('catches a planted server import, a package import, a dynamic import and a require()', () => {
    const entry = path.join(ROOT, 'shared/regulatory/regional-module1.ts');
    const plant = (extra: string) => (abs: string) =>
      abs === entry ? `${extra}\n${fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : ''}` : fs.readFileSync(abs, 'utf8');
    expect(purityViolations(entry, plant(`import { CV_CONTEXT_OF_USE } from '../../server/services/ectd/controlled-vocab/cv-v4-data';`)).join('\n'))
      .toMatch(/outside shared\/ \(server\/services\/ectd\/controlled-vocab\/cv-v4-data\.ts\)/);
    expect(purityViolations(entry, plant(`import { z } from 'zod';`)).join('\n')).toMatch(/package "zod"/);
    expect(purityViolations(entry, plant(`const m = () => import('../../server/db');`)).join('\n')).toMatch(/server\/db/);
    expect(purityViolations(entry, plant(`const m = require('../../server/db');`)).join('\n')).toMatch(/server\/db/);
    expect(purityViolations(entry, plant(`import {\n  thing,\n} from '../../server/services/x';`)).join('\n')).toMatch(/server\/services\/x/);
  });

  it('lets type-only imports through', () => {
    expect(runtimeSpecifiers(`import type { A } from '../../server/a';`)).toEqual([]);
    expect(runtimeSpecifiers(`export type { A } from '../../server/a';`)).toEqual([]);
    expect(runtimeSpecifiers(`import { type A, type B } from '../../server/a';`)).toEqual([]);
    expect(runtimeSpecifiers(`import { type A, b } from '../../server/a';`)).toEqual(['../../server/a']);
  });
});
