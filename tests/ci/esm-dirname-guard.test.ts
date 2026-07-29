/**
 * ESM module-scope __dirname / __filename guard.
 *
 * The server is an ES module ("type": "module"). In ESM there is no
 * module-scope `__dirname` or `__filename`. A *top-level* reference to
 * either therefore throws `ReferenceError: __dirname is not defined in ES
 * module scope` the instant the module is evaluated — i.e. on import,
 * before the server can even finish booting.
 *
 * This exact bug shipped in five prompt-loading services
 * (`const PROMPTS_DIR = path.join(__dirname, ...)` at module scope) and
 * made the platform impossible to boot in every mode, while `npm run
 * build` and the unit suites stayed green: esbuild and the vitest/tsx
 * loaders all provide a `__dirname` shim, so nothing that runs the code
 * through a bundler or test loader reproduces the failure. Only real
 * `node dist/index.js` / `tsx` evaluation does.
 *
 * This guard closes that hole with static analysis (matching the repo's
 * other CI guardrails): it forbids a *module-scope* use of __dirname /
 * __filename in server ESM source unless the file first re-creates it
 * from `import.meta.url`. Function-scope uses are a separate, lazier
 * class (they throw only when that code path runs, not on import) and are
 * intentionally out of scope here.
 *
 * Static analysis only — reads source, runs nothing.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SERVER_DIR = path.resolve(__dirname, '../../server');

/** Recursively collect .ts files under server/, skipping tests + type decls. */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'test' || entry.name === 'tests') continue;
      out.push(...collectSourceFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') && !entry.name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** A file "defines" __dirname/__filename if it re-creates it at any indentation. */
function defines(source: string): boolean {
  return /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+__(?:dirname|filename)\s*=/.test(source);
}

/**
 * Find module-scope (column-0, non-comment) uses of __dirname/__filename
 * that are NOT the definition itself. Column-0 is the load-bearing signal:
 * top-level statements sit at column 0; function/method bodies are indented.
 */
function moduleScopeUses(source: string): { line: number; text: string }[] {
  const hits: { line: number; text: string }[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s/.test(line)) continue; // indented → function/block scope
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue; // comment
    if (!/\b__(?:dirname|filename)\b/.test(line)) continue;
    if (/^\s*(?:export\s+)?(?:const|let|var)\s+__(?:dirname|filename)\s*=/.test(line)) continue; // the definition
    hits.push({ line: i + 1, text: line.trim() });
  }
  return hits;
}

describe('ESM module-scope __dirname / __filename guard', () => {
  it('no server ESM file uses __dirname/__filename at module scope without recreating it', () => {
    const offenders: string[] = [];
    for (const file of collectSourceFiles(SERVER_DIR)) {
      const source = fs.readFileSync(file, 'utf8');
      const uses = moduleScopeUses(source);
      if (uses.length === 0) continue;
      if (defines(source)) continue; // recreated from import.meta.url → safe
      const rel = path.relative(path.resolve(__dirname, '../..'), file);
      for (const u of uses) {
        offenders.push(`${rel}:${u.line}  ${u.text}`);
      }
    }

    expect(
      offenders,
      offenders.length
        ? `Module-scope __dirname/__filename in ESM crashes the server on import.\n` +
            `Recreate it in the file:\n` +
            `  import { fileURLToPath } from 'node:url';\n` +
            `  const __dirname = path.dirname(fileURLToPath(import.meta.url));\n\n` +
            `Offending sites:\n  ${offenders.join('\n  ')}`
        : undefined,
    ).toEqual([]);
  });
});
