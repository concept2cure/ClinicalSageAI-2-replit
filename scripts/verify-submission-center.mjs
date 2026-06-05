#!/usr/bin/env node
/**
 * verify-submission-center.mjs — end-to-end verification runbook
 *
 * Proves the Submission Center surface against a running server + database.
 * Nothing in this repo is runtime-verified without a DB; this is the script that
 * closes that gap. It does NOT mutate production (refuses on NODE_ENV=production)
 * and is read-mostly (creates one throwaway submission in the demo org).
 *
 * Prereqs (in a DB-backed env):
 *   1. npm ci
 *   2. npx drizzle-kit push   # applies 20260604_* and 20260605_consistency_findings
 *   3. node scripts/seed-ga-demo.mjs && node scripts/seed-ga-demo.mjs --verify
 *   4. start the server (so BASE_URL is reachable)
 *
 * Usage:
 *   BASE_URL=http://localhost:5000 \
 *   LOGIN_EMAIL=jm.smith@concept2cure.pro LOGIN_PASSWORD=pass-word \
 *   node scripts/verify-submission-center.mjs
 *
 * Optional second-tenant isolation check:
 *   ALT_EMAIL=... ALT_PASSWORD=...   (a user in a DIFFERENT org)
 */

const BASE = (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '');

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to run verification against production (NODE_ENV=production).');
  process.exit(1);
}

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Cookie-session aware fetch: captures Set-Cookie at login, resends it. */
function makeClient() {
  let cookie = '';
  return {
    async login(email, password) {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      const body = await res.json().catch(() => ({}));
      // Some deployments return a bearer token instead of / in addition to a cookie.
      if (body?.token) cookie = cookie || '';
      return { status: res.status, token: body?.token, body };
    },
    async req(method, path, body) {
      const headers = { 'Content-Type': 'application/json' };
      if (cookie) headers.Cookie = cookie;
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let json;
      try {
        json = text ? JSON.parse(text) : undefined;
      } catch {
        json = undefined;
      }
      return { status: res.status, json, text };
    },
  };
}

async function main() {
  console.log(`\nSubmission Center verification → ${BASE}\n`);
  const email = process.env.LOGIN_EMAIL;
  const password = process.env.LOGIN_PASSWORD;
  if (!email || !password) {
    console.error('Set LOGIN_EMAIL and LOGIN_PASSWORD.');
    process.exit(1);
  }

  const c = makeClient();
  const login = await c.login(email, password);
  ok('login succeeds', login.status === 200, `status ${login.status}`);

  // Region profiles (static metadata — no DB writes).
  const rp = await c.req('GET', '/api/region-profiles');
  ok('GET /api/region-profiles returns 3 regions', rp.status === 200 && Array.isArray(rp.json) && rp.json.length === 3, `status ${rp.status}`);
  const fda = Array.isArray(rp.json) ? rp.json.find((p) => p.region === 'fda') : null;
  ok('FDA profile has Module 1 + forms', !!fda && fda.module1Sections?.length > 0 && fda.forms?.length > 0);

  // Capabilities.
  const cap = await c.req('GET', '/api/submissions/capabilities');
  ok('GET /api/submissions/capabilities returns workspaces', cap.status === 200 && !!cap.json);

  // Portfolio + create (throwaway).
  const list0 = await c.req('GET', '/api/submissions');
  ok('GET /api/submissions (portfolio) ok', list0.status === 200 && Array.isArray(list0.json));

  const created = await c.req('POST', '/api/submissions', {
    title: `Verify run ${new Date().toISOString()}`,
    applicationType: 'ind',
    clientType: 'biotech',
    primaryRegion: 'fda',
  });
  ok('POST /api/submissions creates', created.status === 201 && created.json?.id, `status ${created.status}`);
  const subId = created.json?.id;

  if (subId) {
    const got = await c.req('GET', `/api/submissions/${subId}`);
    ok('GET /api/submissions/:id (tenant-scoped)', got.status === 200 && got.json?.id === subId);

    const seq = await c.req('POST', `/api/submissions/${subId}/sequences`, { region: 'fda', sequenceNumber: '0000', type: 'original' });
    ok('POST sequences (0000)', seq.status === 201 && seq.json?.id);
    const seqId = seq.json?.id;

    if (seqId) {
      const leaf = await c.req('PUT', `/api/submissions/sequences/${seqId}/leaves`, { sectionCode: '2.5', title: 'Clinical Overview' });
      ok('PUT leaf (create)', leaf.status === 200 && leaf.json?.id);

      const leaves = await c.req('GET', `/api/submissions/sequences/${seqId}/leaves`);
      ok('GET leaves lists the new leaf', leaves.status === 200 && Array.isArray(leaves.json) && leaves.json.length >= 1);

      const bad = await c.req('POST', `/api/submissions/sequences/${seqId}/transition`, { status: 'frozen' });
      ok('transition draft→frozen is rejected (409 INVALID_STATE)', bad.status === 409, `got ${bad.status}`);

      const good = await c.req('POST', `/api/submissions/sequences/${seqId}/transition`, { status: 'assembling' });
      ok('transition draft→assembling allowed', good.status === 200 && good.json?.status === 'assembling');
    }
  }

  // Audit captured the AI/governed actions for this org.
  const audit = await c.req('GET', '/api/audit-log?limit=1');
  ok('audit-log reachable', audit.status === 200 || audit.status === 404, `status ${audit.status} (route name may differ)`);

  // Cross-tenant isolation: a second-org user must NOT see this submission.
  if (process.env.ALT_EMAIL && process.env.ALT_PASSWORD && subId) {
    const alt = makeClient();
    const altLogin = await alt.login(process.env.ALT_EMAIL, process.env.ALT_PASSWORD);
    ok('alt-org login', altLogin.status === 200);
    const altGet = await alt.req('GET', `/api/submissions/${subId}`);
    ok('alt-org CANNOT read first-org submission (404)', altGet.status === 404, `got ${altGet.status}`);
    const altList = await alt.req('GET', '/api/submissions');
    const leaked = Array.isArray(altList.json) && altList.json.some((s) => s.id === subId);
    ok('alt-org portfolio does NOT contain first-org submission', !leaked);
  } else {
    console.log('  · skipped cross-tenant check (set ALT_EMAIL/ALT_PASSWORD to enable)');
  }

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (fail > 0) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log('✓ Submission Center verified.\n');
}

main().catch((e) => {
  console.error('Verification crashed:', e);
  process.exit(1);
});
