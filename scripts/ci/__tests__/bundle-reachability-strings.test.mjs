/**
 * check-bundle-reachability decides whether a module is type-only (so esbuild
 * erasing it is correct) from its code, with comments blanked by the shared,
 * string-aware stripper (scripts/ci/lib/strip-comments.mjs).
 *
 * The gate used to delete /\/\*[\s\S]*?\*\//g from raw text. A literal such as
 * '/api/advisory/*' opened a phantom comment that ran to the next real comment
 * closer and took every line in between with it. A router module whose runtime
 * export sat in that span, with an `export interface` after it, read as a pure
 * type file: the gate skipped it, and a router that had left the production
 * bundle passed as an erased interface.
 *
 * Its `//` regex was anchored to whole lines, so a URL could not hide an export
 * from it; the URL case below is a guard on the new stripper, not a
 * demonstration against the old one.
 *
 * How: the gate resolves its root from the working directory, so each case
 * runs the gate where it is (esbuild and the lib resolve from there) with a
 * temp tree as cwd. The registrar imports the router and never uses it, so
 * esbuild elides the import and the router is absent from the bundle, which
 * is the state the gate exists to catch.
 *
 * BUNDLE_REACHABILITY_GATE_PATH runs the same cases against another copy of
 * the gate, which is how they were shown to fail on the old stripper.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GATE = process.env.BUNDLE_REACHABILITY_GATE_PATH
  ? path.resolve(process.env.BUNDLE_REACHABILITY_GATE_PATH)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'check-bundle-reachability.mjs');

/** The registrar and catalogs the gate reads, around one router module. */
function tree(router, importedName = 'advisoryRouter') {
  return {
    'server/index.ts': "import { registerAll } from './bootstrap/register';\nregisterAll();\n",
    'server/bootstrap/register.ts':
      `import { ${importedName} } from '../routes/advisory';\n` +
      'export function registerAll(): number {\n  return 0;\n}\n',
    'server/services/regulatory/taskBlueprintCatalog.ts': 'export const TASK_BLUEPRINTS = [];\n',
    'server/services/regulatory/sectionBlueprintCatalog.ts': 'export const SECTION_BLUEPRINTS = [];\n',
    'server/routes/advisory.ts': router,
  };
}

function run(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-reachability-strings-'));
  try {
    for (const [rel, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), body);
    }
    const r = spawnSync(process.execPath, [GATE], { cwd: root, encoding: 'utf8', timeout: 60_000 });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const ABSENT = "→ '../routes/advisory': resolved to server/routes/advisory.ts, absent from the bundle";

test("a router exported below an '/api/advisory/*' string, above a JSDoc, is not mistaken for a type file", () => {
  const r = run(
    tree(
      "const ADVISORY_GLOB = '/api/advisory/*';\n" +
        'export const advisoryRouter = makeRouter(ADVISORY_GLOB);\n' +
        '/** What the advisory router accepts. */\n' +
        'export interface AdvisoryOptions { glob: string }\n',
    ),
  );
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes(ABSENT), r.out);
  assert.match(r.out, /\(0 type-only skipped\)/);
});

test("a router exported on the line after an 'https://…' string is not mistaken for a type file", () => {
  const r = run(
    tree(
      "const ADVISORY_DOCS = 'https://docs.example/advisory'; // the runbook\n" +
        'export const advisoryRouter = makeRouter(ADVISORY_DOCS);\n' +
        '/** What the advisory router accepts. */\n' +
        'export interface AdvisoryOptions { docs: string }\n',
    ),
  );
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes(ABSENT), r.out);
});

test('control: runtime exports only inside real comments, beside the same glob and URL, leave a type file', () => {
  const r = run(
    tree(
      "const ADVISORY_GLOB = '/api/advisory/*';\n" +
        "const ADVISORY_DOCS = 'https://docs.example/advisory';\n" +
        '// export const advisoryRouter = makeRouter(ADVISORY_GLOB);\n' +
        '/* export function mountAdvisory() {} */\n' +
        '/** What the advisory router accepts. */\n' +
        'export interface AdvisoryOptions { glob: string; docs: string }\n',
      'AdvisoryOptions',
    ),
  );
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /\(1 type-only skipped\)/);
  assert.match(r.out, /every registered module reaches the production bundle/);
});
