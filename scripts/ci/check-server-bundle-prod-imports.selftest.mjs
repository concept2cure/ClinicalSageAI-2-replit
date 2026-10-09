#!/usr/bin/env node
/**
 * Self-test for ci:server-bundle-prod-imports — shows the gate FAILING on each
 * way a bundle can import something the production image does not ship, per
 * CLAUDE.md ("a gate that has only ever been seen to pass has not been
 * tested"), then passing on an intact bundle.
 *
 * Synthetic bundles and a synthetic lockfile, not the real ones: the real
 * bundle's verdict is the gate's own job in CI, and a self-test that depended
 * on it would be red for reasons that have nothing to do with the gate.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(HERE, 'check-server-bundle-prod-imports.mjs');

// What `npm ci --omit=dev` would install from this lockfile: prodpkg and
// @scope/prodpkg at top level. devpkg is dev-only; nested is installed only
// beneath prodpkg, so it cannot be resolved from dist/. phantom and
// citation-js are absent. citation-js is a written RUNTIME_EXCEPTION.
const LOCK = {
  lockfileVersion: 3,
  packages: {
    '': { name: 'fixture' },
    'node_modules/prodpkg': { version: '1.0.0' },
    'node_modules/@scope/prodpkg': { version: '1.0.0' },
    'node_modules/devpkg': { version: '1.0.0', dev: true },
    'node_modules/prodpkg/node_modules/nested': { version: '1.0.0' },
  },
};

const INTACT = [
  'import fs from "node:fs";',
  'import path from "path";',
  'import a from "prodpkg";',
  'import b from "@scope/prodpkg/sub/path";',
  'export async function later() { return import("citation-js"); }',
  'console.log(fs, path, a, b);',
].join('\n');

/** Each case: the bundle, and a string the single finding must contain. */
const CASES = [
  {
    name: 'a devDependency imported at load time (the vite defect)',
    bundle: `${INTACT}\nimport v from "devpkg";\nconsole.log(v);`,
    expect: 'devpkg — imported at LOAD time',
  },
  {
    name: 'a devDependency imported at run time, with no written exception',
    bundle: `${INTACT}\nexport async function dev() { return import("devpkg"); }`,
    expect: 'devpkg — imported at RUN time',
  },
  {
    name: 'a phantom package the lockfile does not know',
    bundle: `${INTACT}\nimport p from "phantom";\nconsole.log(p);`,
    expect: 'phantom — imported at LOAD time',
  },
  {
    name: 'a package installed only nested, unresolvable from dist/',
    bundle: `${INTACT}\nimport n from "nested";\nconsole.log(n);`,
    expect: 'nested — imported at LOAD time',
  },
  {
    name: 'a written RUN-time exception imported at LOAD time',
    bundle: `${INTACT}\nimport c from "citation-js";\nconsole.log(c);`,
    expect: 'citation-js — imported at LOAD time',
  },
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-prod-imports-selftest-'));
const lockfile = path.join(tmp, 'package-lock.json');
fs.writeFileSync(lockfile, JSON.stringify(LOCK));

function runGate(bundleSource, label) {
  const file = path.join(tmp, `${label}.js`);
  fs.writeFileSync(file, bundleSource);
  const r = spawnSync(process.execPath, [GATE, '--bundle', file, '--lockfile', lockfile], { encoding: 'utf8' });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} — ${msg}`);
  if (!ok) failures += 1;
};

try {
  const intact = runGate(INTACT, 'intact');
  check(intact.status === 0, `intact bundle passes (exit ${intact.status})`);
  if (intact.status !== 0) console.log(intact.out);

  CASES.forEach((c, i) => {
    const r = runGate(c.bundle, `case-${i}`);
    const findings = r.out.split('\n').filter((l) => / — imported at (LOAD|RUN) time/.test(l));
    const named = findings.length === 1 && findings[0].includes(c.expect);
    check(r.status === 1 && named, `${c.name}: exit ${r.status}, ${findings.length} finding(s)${named ? '' : ` — expected exactly one containing "${c.expect}"`}`);
    if (!(r.status === 1 && named)) console.log(r.out);
  });
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures) {
  console.error(`\n[server-bundle-prod-imports:selftest] ${failures} case(s) wrong.`);
  process.exit(1);
}
console.log(`\n[server-bundle-prod-imports:selftest] the gate fails on all ${CASES.length} cuts and passes the intact bundle.`);
