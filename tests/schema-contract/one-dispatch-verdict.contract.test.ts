/**
 * There is one dispatch verdict per sequence, and it is
 * `assessSequenceDispatchReadiness` (decision P-33,
 * docs/LAUNCH_DEFINITION_OF_DONE.md, 2026-10-15).
 *
 * `server/services/ind-lifecycle/ind-dispatch-gate.ts` defined a second
 * `evaluateDispatchGate` with a different contract — it blocked on a clinical
 * hold read from the request body, on "already dispatched" and on leaf
 * checksums the governed path never sets — and the IND lifecycle routes
 * answered with it. The same sequence could read "cleared" in Submit and
 * "blocked" on the IND screen. P-33 merged it into the assessor and deleted it.
 *
 * This refuses the way back: no module may import the IND gate, and no module
 * but the eCTD dispatch gate may define an `evaluateDispatchGate`. A copy
 * written under another name is a review matter; a same-named copy, which an
 * editor's autocomplete would pick, is refused here.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CANONICAL = 'server/services/ectd/dispatch-gate.ts';

function sourceFiles(dir: string, withTests: boolean): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || (!withTests && e.name === '__tests__')) continue;
      out.push(...sourceFiles(rel, withTests));
    } else if (/\.(ts|tsx|mjs|js)$/.test(e.name) && (withTests || !/\.test\./.test(e.name))) {
      out.push(rel);
    }
  }
  return out;
}

const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');

describe('one dispatch verdict per sequence (P-33)', () => {
  it('the IND dispatch gate is gone', () => {
    expect(fs.existsSync(path.join(ROOT, 'server/services/ind-lifecycle/ind-dispatch-gate.ts'))).toBe(false);
  });

  it('nothing imports the IND dispatch gate, source or test', () => {
    const importers = ['server', 'shared', 'client/src', 'tests']
      .flatMap((d) => sourceFiles(d, true))
      .filter((f) => !f.endsWith('one-dispatch-verdict.contract.test.ts'))
      .filter((f) => /from\s+['"][^'"]*ind-dispatch-gate['"]|import\(\s*['"][^'"]*ind-dispatch-gate['"]\s*\)/.test(read(f)));
    expect(importers).toEqual([]);
  });

  it('evaluateDispatchGate is defined only in the eCTD dispatch gate', () => {
    const definers = ['server', 'shared', 'client/src']
      .flatMap((d) => sourceFiles(d, false))
      .filter((f) => /(?:function|const|let)\s+evaluateDispatchGate\b/.test(read(f)));
    expect(definers).toEqual([CANONICAL]);
  });

  it('every import of evaluateDispatchGate is the eCTD dispatch gate', () => {
    for (const f of ['server', 'shared', 'client/src'].flatMap((d) => sourceFiles(d, false))) {
      const src = read(f);
      const re = /import\s*\{[^}]*\bevaluateDispatchGate\b[^}]*\}\s*from\s*['"]([^'"]+)['"]/g;
      for (const m of src.matchAll(re)) {
        expect(/(^|\/)ectd\/dispatch-gate(\.js)?$|^\.\/dispatch-gate(\.js)?$/.test(m[1]), `${f} imports evaluateDispatchGate from ${m[1]}`).toBe(true);
      }
    }
  });

  it('the IND lifecycle routes answer from the assessor', () => {
    for (const f of ['server/routes/ind-lifecycle/sequence.routes.ts', 'server/routes/ind-lifecycle/submission.routes.ts']) {
      expect(read(f), `${f} does not call the assessor`).toMatch(/assessSequenceDispatchReadiness/);
    }
  });
});
