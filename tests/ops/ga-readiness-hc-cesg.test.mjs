/**
 * The GA readiness report's Health Canada CESG row reads no credentials
 * (F19b, 2026-10-08). health-canada-gateway.ts no longer has a transport: its
 * REST/mTLS/HMAC protocol was written from no Health Canada source, and
 * transmit refuses before the wire. A row that turned 'ready' once five
 * HC_CESG_* variables were set would report a channel that does not exist.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function hcRow(env) {
  // The report exits non-zero while any row is blocked; its JSON is on stdout either way.
  const run = spawnSync(process.execPath, [path.join(root, 'scripts/ops/ga-readiness-report.mjs'), '--json'], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  return JSON.parse(run.stdout).rows.find((r) => r.id === 'gateway:ca:hc_cesg');
}

test('ca:hc_cesg is blocked as unverified with every HC_CESG_* variable set', () => {
  const row = hcRow({
    HC_CESG_URL: 'https://cesg.hc-sc.gc.ca',
    HC_CESG_COMPANY_ID: 'C-1',
    HC_CESG_CERT_PATH: '/etc/hostname',
    HC_CESG_KEY_PATH: '/etc/hostname',
    HC_CESG_HMAC_SECRET: 's3cret',
  });
  assert.ok(row, 'the report has a ca:hc_cesg row');
  assert.equal(row.status, 'blocked');
  assert.match(row.observed, /^channel unverified/);
  assert.match(row.unblock, /health-canada-gateway\.ts; no credential setting unblocks this row/);
});
