import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const gatePath = 'scripts/ci/check-client-reachability.mjs';
const gate = fs.readFileSync(path.join(repo, gatePath), 'utf8');
const withheld = 'client/src/withheld.ts';
const reason = 'The recorded P-32 release decision withholds this capability; its original source remains available for qualification without shipping a refused action.';
const entry = { [withheld]: { decision: 'P-32', why: reason } };

function run({ catalog, files = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'client-withheld-gate-'));
  const declaration = /const WITHHELD = \{[\s\S]*?\};/;
  assert.match(gate, declaration);
  const source = catalog === undefined ? gate : gate.replace(declaration, `const WITHHELD = ${JSON.stringify(catalog)};`);
  const inputs = {
    [gatePath]: source,
    'client/src/main.tsx': 'export const app = true;',
    'client/src/setupTests.js': '',
    'scripts/ci/client-reachability-baseline.json': '{"count":0,"modules":[]}',
    'docs/LAUNCH_DEFINITION_OF_DONE.md': '### P-32\nRecorded release decision.\n',
    ...files,
  };
  try {
    for (const [name, content] of Object.entries(inputs)) {
      fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      fs.writeFileSync(path.join(root, name), content);
    }
    return spawnSync(process.execPath, [path.join(root, gatePath)], { encoding: 'utf8' });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function expectResult(options, status, diagnostic) {
  const result = run(options);
  assert.equal(result.status, status, result.stdout + result.stderr);
  if (diagnostic) assert.match(result.stdout + result.stderr, diagnostic);
}

test('the retired production path is not required after its source moves to a test fixture', () => {
  expectResult({ files: { 'tests/fixtures/withheld/indSafetyReportCard.ts': '// P-32 retained source' } }, 0);
});

test('a newly unreachable production module is still rejected with a zero baseline', () => {
  expectResult({ files: { 'client/src/orphan.ts': 'export const orphan = true;' } }, 1, /new client module\(s\) the browser cannot reach/);
});

test('recreating the former production path cannot reuse its retired exemption', () => {
  expectResult({ files: { 'client/src/concept2cure/v2/surfaces/indSafetyReportCard.ts': '// P-32\nexport const card = true;' } }, 1,
    /new client module\(s\) the browser cannot reach/);
});

test('a real recorded and cited unreachable module can still be withheld', () => {
  expectResult({ catalog: entry, files: { [withheld]: '// P-32\nexport const withheld = true;' } }, 0);
});

test('a nonexistent withheld path cannot pre-approve future source', () => {
  expectResult({ catalog: entry }, 1, /withheld entry names a file that no longer exists/);
});

test('an exemption without a recorded decision is rejected', () => {
  expectResult({ catalog: entry, files: { [withheld]: '// P-32', 'docs/LAUNCH_DEFINITION_OF_DONE.md': 'No decision heading.' } }, 1,
    /has no "### P-32" heading/);
});

test('an exemption without the source citation is rejected', () => {
  expectResult({ catalog: entry, files: { [withheld]: 'export const withheld = true;' } }, 1, /the file does not cite P-32/);
});

test('a module that becomes reachable cannot retain a withheld exemption', () => {
  expectResult({ catalog: entry, files: { [withheld]: '// P-32', 'client/src/main.tsx': "import './withheld';" } }, 1,
    /is reachable from the entry point now/);
});

test('an exemption without a substantive written reason is rejected', () => {
  expectResult({ catalog: { [withheld]: { decision: 'P-32', why: 'because' } }, files: { [withheld]: '// P-32' } }, 1,
    /withheld entry carries no written reason/);
});
