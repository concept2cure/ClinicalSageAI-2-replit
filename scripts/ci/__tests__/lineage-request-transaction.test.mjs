/** Real Protocol source mutations must not turn a wrapper name into a transaction exemption. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { requestScopedTransactionFindings } from '../lib/lineage-request-transaction.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OWNER = 'server/routes/protocol-development.ts';
const SERVICE = 'server/services/protocol-development/protocol-development-service.ts';
const ACTUAL = fs.readFileSync(path.join(ROOT, OWNER), 'utf8');
const GATE = process.env.LINEAGE_SAVE_GATE_UNDER_TEST || path.join(ROOT, 'scripts/ci/check-lineage-save-gate.mjs');

function mutate(from, to) {
  assert.ok(ACTUAL.includes(from), `source fixture changed: ${from}`);
  return ACTUAL.replace(from, to);
}

test('recognizes the actual request-pinned transaction and both awaited prose callbacks', () => {
  assert.deepEqual(requestScopedTransactionFindings(ACTUAL), []);
});

const MUTATIONS = [
  ['missing wrapper', 'async function governedScoped(', 'async function detachedScoped(', /wrapper is missing/],
  ['missing BEGIN', "client.query('BEGIN')", "client.query('SELECT 1')", /BEGIN transaction/],
  ['missing COMMIT', "client.query('COMMIT')", "client.query('SELECT 1')", /BEGIN and COMMIT/],
  ['missing ROLLBACK', "client.query('ROLLBACK')", "client.query('SELECT 1')", /ROLLBACK/],
  ['different callback client', 'await run(client, orgId, userId)', 'await run(otherClient, orgId, userId)', /same client/],
  ['different governance client', 'await recordGovernedAction(client,', 'await recordGovernedAction(otherClient,', /governance/],
  ['different section writer client', 'await updateSectionTx(client,', 'await updateSectionTx(otherClient,', /updateSectionTx/],
  ['different synopsis writer client', 'await updateSynopsisTx(client,', 'await updateSynopsisTx(otherClient,', /updateSynopsisTx/],
  ['unawaited callback', 'await run(client, orgId, userId)', 'run(client, orgId, userId)', /awaited callback/],
  ['unawaited writer', 'await updateSectionTx(client,', 'void updateSectionTx(client,', /updateSectionTx/],
  ['rebound writer client', 'await updateSectionTx(client,', 'client = otherClient; await updateSectionTx(client,', /updateSectionTx/],
  ['different request', 'client = requestPgClient(req)', 'client = requestPgClient(otherRequest)', /canonical requestPgClient/],
  ['noncanonical request helper', "from '../db/requestDb'", "from '../db/alternateDb'", /canonical requestPgClient/],
  ['missing forwarding function', 'async function governed(', 'async function unrelatedGoverned(', /forwarder/],
  ['substituted forwarded callback', 'reasonText, run);', 'reasonText, otherRun);', /forwarder/],
];

for (const [name, from, to, reason] of MUTATIONS) {
  test(`refuses ${name}`, () => assert.match(requestScopedTransactionFindings(mutate(from, to)).join('; '), reason));
}

test('a transaction elsewhere and BEGIN in a comment cannot replace this wrapper transaction', () => {
  const source = mutate("await client.query('BEGIN');", "// await client.query('BEGIN');")
    + "\nasync function unrelated() { const client = await pool.connect(); await client.query('BEGIN'); await client.query('COMMIT'); await client.query('ROLLBACK'); }";
  assert.match(requestScopedTransactionFindings(source).join('; '), /BEGIN transaction/);
});

test('request binding failure must return before transaction entry', () => {
  const source = mutate("return;\n  }\n  try {\n    await client.query('BEGIN');", "void 0;\n  }\n  try {\n    await client.query('BEGIN');");
  assert.match(requestScopedTransactionFindings(source).join('; '), /return on unavailable context/);
});

test('the actual service callback itself must await the governed transaction', () => {
  const source = mutate("await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {\n    await updateSynopsisTx",
    "governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {\n    await updateSynopsisTx");
  assert.match(requestScopedTransactionFindings(source).join('; '), /updateSynopsisTx/);
});

function runGuard(ownerSource) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lineage-request-owner-'));
  try {
    const sources = new Map([
      [OWNER, ownerSource],
      [SERVICE, fs.readFileSync(path.join(ROOT, SERVICE), 'utf8')],
      ['server/services/ana/AnaToolExecutor.ts', fs.readFileSync(path.join(ROOT, 'server/services/ana/AnaToolExecutor.ts'), 'utf8')],
      ['server/services/clinical-regulatory-evidence/lineage-gate.ts', fs.readFileSync(path.join(ROOT, 'server/services/clinical-regulatory-evidence/lineage-gate.ts'), 'utf8')],
    ]);
    for (const [name, body] of sources) {
      fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      fs.writeFileSync(path.join(root, name), body);
    }
    const result = spawnSync(process.execPath, [GATE], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 1, 'Other guarded files deliberately absent: inspect the exact Protocol verdict.');
    return `${result.stdout}${result.stderr}`;
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('the real guard accepts actual Protocol ownership without removing its guarded service', () => {
  const output = runGuard(ACTUAL);
  assert.ok(output.includes(`[ci:lineage-save-gate] ok  ${SERVICE}`), output);
  assert.ok(!output.includes(`[ci:lineage-save-gate] FAIL ${SERVICE}`), output);
});

test('the real guard rejects a different writer client even if an unrelated pooled transaction exists', () => {
  const source = mutate('await updateSectionTx(client,', 'await updateSectionTx(otherClient,')
    + "\nasync function unrelated() { const client = await pool.connect(); await client.query('BEGIN'); await client.query('COMMIT'); await client.query('ROLLBACK'); }";
  const output = runGuard(source);
  assert.ok(output.includes(`[ci:lineage-save-gate] FAIL ${SERVICE}`), output);
  assert.match(output, /transaction-owner:.*updateSectionTx/);
});
