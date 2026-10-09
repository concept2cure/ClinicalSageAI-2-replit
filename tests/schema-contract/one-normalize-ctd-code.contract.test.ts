/**
 * There is one `normalizeCtdCode`, and it is the one that refuses.
 *
 * `shared/regulatory/section-code.ts` normalizes an eCTD section code or
 * returns null. The `upsertLeaf` placement gate relies on that null to refuse
 * a code like `m1/us/1.2`. `server/services/ind/ctd/index.ts` exported a
 * same-named function with a different contract: it strips a leading `m` and
 * returns a string for anything, `m1/us/1.2` included. It was re-exported from
 * `ind-section-registry.ts`, so an import completed by an editor could pick it
 * and silently reopen the gate. Found by the IND eCTD demo lane
 * (docs/work-orders/README.md).
 *
 * Every definition of the name outside the shared module is refused. A
 * re-export must come from the shared module.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CANONICAL = 'shared/regulatory/section-code.ts';

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '__tests__') continue;
      out.push(...sourceFiles(rel));
    } else if (/\.(ts|tsx|mjs|js)$/.test(e.name) && !/\.test\./.test(e.name)) {
      out.push(rel);
    }
  }
  return out;
}

const files = ['server', 'shared', 'client/src'].flatMap(sourceFiles);

describe('normalizeCtdCode has one definition', () => {
  it('is defined only in the shared section-code module', () => {
    const definers = files.filter((f) =>
      /(?:function|const|let)\s+normalizeCtdCode\b/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')),
    );
    expect(definers).toEqual([CANONICAL]);
  });

  it('is re-exported only where it was imported from the shared module', () => {
    for (const f of files) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const reexports = /export\s*\{[^}]*\bnormalizeCtdCode\b[^}]*\}(\s*from\s*['"]([^'"]+)['"])?/.exec(src);
      if (!reexports || f === CANONICAL) continue;
      const fromShared = reexports[2]
        ? /shared\/regulatory\/section-code/.test(reexports[2])
        : /import\s*\{[^}]*\bnormalizeCtdCode\b[^}]*\}\s*from\s*['"][^'"]*shared\/regulatory\/section-code['"]/.test(src);
      expect(fromShared, `${f} re-exports a normalizeCtdCode that is not the shared one`).toBe(true);
    }
  });
});
