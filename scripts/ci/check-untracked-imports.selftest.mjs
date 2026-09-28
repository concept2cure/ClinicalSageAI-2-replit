#!/usr/bin/env node
/**
 * Self-test for ci:untracked-imports — the gate is only trusted because this
 * shows it FAILING on the cases it exists for, and passing on the ones that
 * fooled its first version.
 *
 * Each case is a throwaway git repository in a temp dir, scanned with --all:
 *
 *   ignored-source   a tracked file imports a module that exists on disk but
 *                    is excluded by an unanchored .gitignore pattern — the
 *                    2026-09-19 defect that made trunk unbuildable      → FAIL
 *   missing-dynamic  `await import('./gone.js')` of a file that is nowhere → FAIL
 *   comment-string   a specifier quoted in a comment, a string and a
 *                    template-literal fixture — not imports at all       → OK
 *   clean            every import resolves to a tracked file              → OK
 *
 * Usage: node scripts/ci/check-untracked-imports.selftest.mjs
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GATE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-untracked-imports.mjs');
const TAG = '[ci:untracked-imports:selftest]';

function repo(files, gitignore = '') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'untracked-imports-'));
  const run = args => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  run(['init', '-q']);
  run(['config', 'user.email', 'selftest@example.test']);
  run(['config', 'user.name', 'selftest']);
  if (gitignore) fs.writeFileSync(path.join(dir, '.gitignore'), gitignore);
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  }
  run(['add', '-A']);
  run(['commit', '-q', '-m', 'fixture']);
  return dir;
}

function gate(dir) {
  const p = spawnSync(process.execPath, [GATE, '--all'], { cwd: dir, encoding: 'utf8' });
  return { status: p.status, out: `${p.stdout}${p.stderr}` };
}

const CASES = [
  {
    name: 'ignored-source',
    expect: 1,
    mustSay: 'on disk but NOT in git',
    gitignore: '# runtime artifacts\nuploads/\n',
    files: {
      'server/routes/upload.ts': "import { atom } from '../services/uploads/atom.js';\nexport const a = atom;\n",
      'server/services/uploads/atom.ts': 'export const atom = 1;\n',
    },
  },
  {
    name: 'missing-dynamic',
    expect: 1,
    mustSay: 'resolve to nothing',
    files: {
      'src/a.ts': "export async function load() { return import('./gone.js'); }\n",
    },
  },
  {
    name: 'comment-string',
    expect: 0,
    files: {
      'src/a.ts': [
        "// re-exported so existing `from '...lumen-context-builder.js'` imports keep working",
        "const s = \"import x from './nowhere'\";",
        'const fixture = `',
        "import { DocumentCanvas } from '../editor/DocumentCanvas';",
        '`;',
        'export { s, fixture };',
        '',
      ].join('\n'),
    },
  },
  {
    name: 'clean',
    expect: 0,
    files: {
      'src/a.ts': "import { b } from './b.js';\nimport type { T } from './types';\nexport const a: T = b;\n",
      'src/b.ts': 'export const b = 1;\n',
      'src/types/index.ts': 'export type T = number;\n',
    },
  },
];

let failed = 0;
for (const c of CASES) {
  const dir = repo(c.files, c.gitignore);
  const { status, out } = gate(dir);
  const ok = status === c.expect && (!c.mustSay || out.includes(c.mustSay));
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${c.name}: exit ${status} (expected ${c.expect})`);
  if (!ok) {
    failed += 1;
    console.log(out.split('\n').map(l => `       ${l}`).join('\n'));
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

if (failed) {
  console.error(`\n${TAG} FAIL — ${failed} of ${CASES.length} case(s) did not behave as the gate claims.`);
  process.exit(1);
}
console.log(`${TAG} OK — ${CASES.length} cases: the gate fails on an ignored or missing import, and not on text that only looks like one.`);
