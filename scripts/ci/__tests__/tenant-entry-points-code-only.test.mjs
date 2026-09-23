/**
 * check-tenant-entry-points reads a router's shape and its entitlement
 * vocabulary from CODE, not comments.
 *
 * On 2026-09-23 two routers whose comments named X-API-Key and SCIM were
 * reported as new API-key entry points (F-31 admin-security.ts, F-32
 * misc-inline-routes.ts). The reverse mistake is worse: a comment naming
 * getTenantAccessPosture would pass a router that never calls it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'check-tenant-entry-points.mjs');

function run(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tenant-entry-'));
  try {
    for (const [rel, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), body);
    }
    const r = spawnSync(process.execPath, [GATE], {
      env: { ...process.env, TENANT_ENTRY_POINTS_ROOT: root },
      encoding: 'utf8',
    });
    return { code: r.status, out: r.stdout + r.stderr };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('a router that names X-API-Key and SCIM only in comments is not an entry point', () => {
  const r = run({
    'server/routes/admin.ts':
      "// the SCIM consoles and the X-API-Key public API are guarded elsewhere\n" +
      "/* req.get('x-api-key') */\nrouter.get('/x', (req, res) => res.json({}));\n",
  });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /0 entry point\(s\)/);
});

test('a router that reads X-API-Key in code, with no entitlement check, fails', () => {
  const r = run({ 'server/routes/keyed.ts': "const key = req.get('x-api-key');\n" });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /server\/routes\/keyed\.ts/);
});

test('entitlement named only in a comment does not count as considered', () => {
  const r = run({
    'server/routes/keyed.ts':
      "// TODO: call getTenantAccessPosture here\nconst key = req.get('x-api-key');\n",
  });
  assert.equal(r.code, 1, r.out);
});

test('a keyed router that calls getTenantAccessPosture passes', () => {
  const r = run({
    'server/routes/keyed.ts':
      "const key = req.get('x-api-key');\nconst posture = await getTenantAccessPosture(orgId);\n",
  });
  assert.equal(r.code, 0, r.out);
});

test('an API-key read after a string holding /* is still seen', () => {
  const r = run({
    'server/routes/keyed.ts': "const glob = '/api/v1/*';\nconst key = req.get('x-api-key');\nconst end = 'a */ b';\n",
  });
  assert.equal(r.code, 1, r.out);
});
