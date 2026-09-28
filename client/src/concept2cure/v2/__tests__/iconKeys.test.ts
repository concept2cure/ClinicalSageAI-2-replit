/**
 * Every static `I.<key>` names a key the registry has.
 *
 * `I` is typed `Record<string, ReactElement>`, so a key that does not exist
 * type-checks and renders `undefined`: nothing at all, or whatever an
 * `||` fallback supplies. The 2026-09-22 review found the Vault's folder caret
 * printing a text '›' and its Upload button a '+' this way (D3). The
 * 2026-09-24 re-check found the same defect in 21 files, 25 keys. Among them:
 * the eCTD Co-author focus toggle turned into a blank, unlabelled button;
 * its failed compliance checks lost their marker; and the Filings catalog's
 * "Track the FDA loop" link showed no icon. The authors had guessed at names
 * and chained guesses (`I.sidebar || I.menu || I.layers`).
 *
 * The type cannot be narrowed to the registry's own keys without breaking
 * ~20 dynamic lookups (`I[meta.icon]`), so this reads the source instead.
 * Each module that imports `I` from `v2/icons` has its static member accesses
 * checked against the real object. Dynamic lookups are out of scope; they
 * carry their own fallbacks.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { I } from '../icons';

const ROOT = path.resolve(__dirname, '..', '..');
const ICONS = path.resolve(__dirname, '..', 'icons.tsx');

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : sources(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

/** True when `file` imports `I` from the v2 icon registry. */
function importsRegistry(file: string, text: string): boolean {
  const m = /import\s*\{[^}]*\bI\b[^}]*\}\s*from\s*'([^']+)'/.exec(text);
  if (!m || !m[1].startsWith('.')) return false;
  const base = path.resolve(path.dirname(file), m[1]);
  return [base, `${base}.tsx`, `${base}.ts`].includes(ICONS);
}

/** `I.key` references to keys the registry lacks, as `file:line key`. */
function missingIconKeys(files: string[], keys: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    if (!importsRegistry(file, text)) continue;
    text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/\bI\.([A-Za-z_$][\w$]*)/g)) {
        if (!keys.has(m[1])) out.push(`${path.relative(ROOT, file)}:${i + 1} ${m[1]}`);
      }
    });
  }
  return out;
}

describe('icon registry keys', () => {
  const keys = new Set(Object.keys(I));
  const files = sources(ROOT);

  it('finds the modules that use the registry', () => {
    // Guards the scan itself: a broken import matcher would find nothing and pass.
    const users = files.filter((f) => importsRegistry(f, fs.readFileSync(f, 'utf8')));
    expect(users.length).toBeGreaterThan(50);
    expect(users.some((f) => f.endsWith(path.join('surfaces', 'Vault.tsx')))).toBe(true);
  });

  it('every static I.<key> exists in the registry', () => {
    expect(missingIconKeys(files, keys)).toEqual([]);
  });

  it('reports a key the registry lacks', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'icon-probe-'));
    const probe = path.join(dir, 'Probe.tsx');
    const spec = path.relative(dir, ICONS).replace(/\.tsx$/, '');
    fs.writeFileSync(probe, `import { I } from '${spec}';\nexport const a = I.chevRight;\nexport const b = I.chevronRight;\n`);
    try {
      const found = missingIconKeys([probe], keys);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatch(/Probe\.tsx:3 chevronRight$/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
