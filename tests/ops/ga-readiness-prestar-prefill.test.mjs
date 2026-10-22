import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('current official form and populated map presence cannot qualify PreSTAR administrative prefills as complete requests', () => {
  const run = spawnSync(process.execPath, [path.join(root, 'scripts/ops/ga-readiness-report.mjs'), '--all', '--json'], { cwd: root, encoding: 'utf8', env: process.env });
  assert.equal(run.status, 1);
  const result = JSON.parse(run.stdout);
  assert.equal(result.rows.find(row => row.id === 'estar-templates').status, 'ready');
  assert.equal(result.rows.find(row => row.id === 'estar-field-maps').status, 'ready');
  const row = result.rows.find(row => row.id === 'prestar-request-automation');
  assert.equal(row.status, 'blocked');
  assert.match(row.observed, /four administrative prefill fields only/);
  assert.match(row.gate, /requestSpecificAutomationQualified/);
  assert.match(row.unblock, /No credential or environment setting clears this row/);
});
