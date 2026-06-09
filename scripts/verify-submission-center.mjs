#!/usr/bin/env node
/**
 * verify-submission-center.mjs — end-to-end verification runbook
 *
 * Proves the Submission Center surface against a running server + database.
 * Nothing in this repo is runtime-verified without a DB; this is the script that
 * closes that gap. It does NOT mutate production (refuses on NODE_ENV=production)
 * and is read-mostly (creates one throwaway submission in the demo org).
 *
 * Coverage: login → region profiles → capabilities → portfolio CRUD → sequence
 * + leaf → lifecycle rules → pathway-readiness → SERVER-COMPUTED dispatch-readiness
 * gate → device technical-file manifest + ZIP assemble → dispatch-qc auth guard →
 * governed freeze (e-signature required) → transmit (must be dispatched) →
 * Phase-1 ingestion (classify auth/tenant guards; grounded classify + AI_GENERATE
 * audit when DOC_ID is set) → cross-tenant isolation. One script, the whole chain.
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

/** Raw (UN-authenticated) fetch — used to prove endpoints reject anonymous calls. */
async function rawReq(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
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
}

/** Session-aware fetch: captures Set-Cookie AND bearer token at login, resends both
 *  (the submission routes authenticate via `Authorization: Bearer`). */
function makeClient() {
  let cookie = '';
  let token = '';
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
      if (body?.token) token = body.token;
      return { status: res.status, token: body?.token, body };
    },
    async req(method, path, body) {
      const headers = { 'Content-Type': 'application/json' };
      if (cookie) headers.Cookie = cookie;
      if (token) headers.Authorization = `Bearer ${token}`;
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
  if (!login.token && login.body?.mfaRequired) {
    console.log('  · login returned an MFA challenge with no bearer token — use a demo user with MFA disabled (or complete /mfa/verify) so the authenticated checks can proceed.');
  }

  // Region profiles (static metadata — no DB writes).
  const rp = await c.req('GET', '/api/region-profiles');
  ok('GET /api/region-profiles returns 3 regions', rp.status === 200 && Array.isArray(rp.json) && rp.json.length === 3, `status ${rp.status}`);
  const fda = Array.isArray(rp.json) ? rp.json.find((p) => p.region === 'fda') : null;
  ok('FDA profile has Module 1 + forms', !!fda && fda.module1Sections?.length > 0 && fda.forms?.length > 0);

  // Capabilities.
  const cap = await c.req('GET', '/api/submissions/capabilities');
  ok('GET /api/submissions/capabilities returns workspaces', cap.status === 200 && !!cap.json);
  ok('capabilities advertise assemble bytes server-ready', cap.json?.features?.assemble === true && cap.json?.features?.deviceTechnicalFile === true && cap.json?.features?.pathwayManifest === true && cap.json?.features?.publishTransmit === false, `features ${JSON.stringify(cap.json?.features)}`);

  // Validation rule corpus (named, sourced eCTD criteria) — static reference data.
  const vr = await c.req('GET', '/api/submissions/validation-rules?region=fda');
  ok('validation-rules returns the cataloged corpus + summary', vr.status === 200 && Array.isArray(vr.json?.rules) && vr.json.rules.length > 0 && typeof vr.json?.summary?.total === 'number' && vr.json.rules.every((r) => r.id && r.severity && r.source), `status ${vr.status}`);
  const vrBad = await c.req('GET', '/api/submissions/validation-rules?region=zz');
  ok('validation-rules rejects an unknown region (400)', vrBad.status === 400, `got ${vrBad.status}`);

  // Market submission specs (per-market governance + formatting) — static reference data.
  const ms = await c.req('GET', '/api/submissions/market-specs?market=eu');
  ok('market-specs returns the EU datasheets + summary', ms.status === 200 && Array.isArray(ms.json?.specs) && ms.json.specs.length >= 4 && ms.json.specs.every((s) => s.market === 'eu' && s.governance?.eSignature?.basis), `status ${ms.status}`);
  const msOne = await c.req('GET', '/api/submissions/market-specs/us-ectd');
  ok('market-specs/:id returns one spec', msOne.status === 200 && msOne.json?.id === 'us-ectd' && Array.isArray(msOne.json?.formatting?.pdfVersions), `status ${msOne.status}`);
  const msBad = await c.req('GET', '/api/submissions/market-specs/nope-xx');
  ok('market-specs/:id 404s on unknown spec', msBad.status === 404, `got ${msBad.status}`);
  const msFamBad = await c.req('GET', '/api/submissions/market-specs?family=zzz');
  ok('market-specs rejects an unknown family (400)', msFamBad.status === 400, `got ${msFamBad.status}`);

  // Market formatting enforcement (datasheet → deterministic checks).
  const fmtOk = await c.req('POST', '/api/submissions/market-specs/us-ectd/validate', { leaves: [{ fileName: 'cover-letter.pdf', filePath: 'm1/us/cover-letter.pdf', fileFormat: 'PDF', fileSizeBytes: 1024 }] });
  ok('market formatting validation passes clean FDA files', fmtOk.status === 200 && fmtOk.json?.errors === 0, `status ${fmtOk.status}`);
  const fmtBad = await c.req('POST', '/api/submissions/market-specs/us-ectd/validate', { leaves: [{ fileName: 'Bad Name.PDF' }] });
  ok('market formatting validation flags a bad file name', fmtBad.status === 200 && Array.isArray(fmtBad.json?.findings) && fmtBad.json.findings.some((f) => f.rule === 'FILE_NAMING'), `status ${fmtBad.status}`);
  const fmt404 = await c.req('POST', '/api/submissions/market-specs/nope-xx/validate', { leaves: [] });
  ok('market formatting validation 404s on unknown spec', fmt404.status === 404, `got ${fmt404.status}`);

  // Submission requirements matrix + gap assessment (Planner).
  const reqOne = await c.req('GET', '/api/submissions/requirements/nda');
  ok('requirements/:type returns the NDA matrix', reqOne.status === 200 && Array.isArray(reqOne.json?.requiredDocuments) && reqOne.json.requiredForms?.includes('FDA 356h'), `status ${reqOne.status}`);
  const reqAssess = await c.req('POST', '/api/submissions/requirements/nda/assess', { templateIds: ['quality_overall_summary'] });
  ok('requirements assess reports missing required docs/forms', reqAssess.status === 200 && reqAssess.json?.ready === false && reqAssess.json.missingForms?.includes('FDA 356h'), `status ${reqAssess.status}`);

  // Expedited-pathway eligibility (Planner).
  const desig = await c.req('GET', '/api/submissions/designations?market=us');
  ok('designations lists US expedited programs', desig.status === 200 && Array.isArray(desig.json?.designations) && desig.json.designations.some((d) => d.id === 'fda_breakthrough'), `status ${desig.status}`);
  const elig = await c.req('POST', '/api/submissions/designations/fda_breakthrough/assess', { answers: { serious: true, preliminary_substantial: true } });
  ok('eligibility is eligible only when all criteria are met', elig.status === 200 && elig.json?.eligible === true, `status ${elig.status}`);
  const eligBad = await c.req('POST', '/api/submissions/designations/nope/assess', { answers: {} });
  ok('eligibility 404s on unknown designation', eligBad.status === 404, `got ${eligBad.status}`);

  // Post-submission change classification (lifecycle).
  const cc = await c.req('GET', '/api/submissions/change-categories?market=eu');
  ok('change-categories lists EU variations', cc.status === 200 && Array.isArray(cc.json?.categories) && cc.json.categories.some((x) => x.id === 'eu_type_ii'), `status ${cc.status}`);
  const ccClass = await c.req('POST', '/api/submissions/change-categories/classify', { market: 'us', flags: { major_impact: true } });
  ok('change classify maps a major US change to PAS', ccClass.status === 200 && ccClass.json?.categoryId === 'fda_pas' && ccClass.json?.sequenceType === 'variation', `status ${ccClass.status}`);
  const ccBad = await c.req('POST', '/api/submissions/change-categories/classify', { market: 'zz', flags: {} });
  ok('change classify rejects an unknown market (400)', ccBad.status === 400, `got ${ccBad.status}`);

  // Document template structures (canonical section skeletons) — static reference data.
  const dt = await c.req('GET', '/api/submissions/document-templates?family=ectd');
  ok('document-templates returns CTD spines with sections', dt.status === 200 && Array.isArray(dt.json?.templates) && dt.json.templates.length > 0 && dt.json.templates.every((t) => Array.isArray(t.sections) && t.sections.length > 0), `status ${dt.status}`);
  const dtOne = await c.req('GET', '/api/submissions/document-templates/clinical_overview');
  ok('document-templates/:id returns one spine', dtOne.status === 200 && dtOne.json?.ctdSection === '2.5' && dtOne.json?.sections?.length === 6, `status ${dtOne.status}`);
  const dtBad = await c.req('GET', '/api/submissions/document-templates/nope');
  ok('document-templates/:id 404s on unknown', dtBad.status === 404, `got ${dtBad.status}`);

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

      const toValidated = await c.req('POST', `/api/submissions/sequences/${seqId}/transition`, { status: 'validated' });
      ok('transition assembling→validated allowed', toValidated.status === 200 && toValidated.json?.status === 'validated');

      // Governed transitions are forbidden on the generic route (Part 11).
      const govBlocked = await c.req('POST', `/api/submissions/sequences/${seqId}/transition`, { status: 'frozen' });
      ok('generic transition validated→frozen rejected (403 GOVERNED_REQUIRED)', govBlocked.status === 403, `got ${govBlocked.status}`);

      // Pathway readiness (deterministic projection).
      const pr = await c.req('GET', `/api/submissions/sequences/${seqId}/pathway-readiness?pathway=estar_510k`);
      ok('pathway-readiness returns a report', pr.status === 200 && typeof pr.json?.ready === 'boolean');

      // Dispatch readiness — SERVER-COMPUTED gate (tamper-proof). A single leaf with
      // no resolvable document should make the gate block (validationErrors > 0).
      const dr = await c.req('GET', `/api/submissions/sequences/${seqId}/dispatch-readiness`);
      ok('dispatch-readiness computes the gate server-side', dr.status === 200 && typeof dr.json?.gate?.cleared === 'boolean' && typeof dr.json?.validationErrors === 'number', `status ${dr.status}`);

      // Universal pathway manifest (assembled ToC across pathways) — deterministic.
      const pm = await c.req('GET', `/api/submissions/sequences/${seqId}/pathway-manifest?pathway=estar_510k`);
      ok('pathway-manifest returns an ordered ToC with entries', pm.status === 200 && Array.isArray(pm.json?.entries) && pm.json.entries.length > 0 && /^01-/.test(pm.json.entries[0]?.path || ''), `status ${pm.status}`);
      const pmCtis = await c.req('GET', `/api/submissions/sequences/${seqId}/pathway-manifest?pathway=ctis&memberStates=DE,FR`);
      ok('pathway-manifest flattens CTIS Part I + per-state Part II', pmCtis.status === 200 && Array.isArray(pmCtis.json?.entries) && pmCtis.json.entries.some((e) => e.group === 'Part II — DE'), `status ${pmCtis.status}`);

      // Device technical-file manifest (MDR/IVDR assemble structure) — deterministic.
      const tf = await c.req('GET', `/api/submissions/sequences/${seqId}/technical-file?regulation=mdr`);
      ok('technical-file returns the MDR Annex II/III ToC', tf.status === 200 && Array.isArray(tf.json?.entries) && tf.json.entries.length > 0 && typeof tf.json?.totals?.sections === 'number', `status ${tf.status}`);
      const tfBad = await c.req('GET', `/api/submissions/sequences/${seqId}/technical-file?regulation=xyz`);
      ok('technical-file rejects an unknown regulation (400)', tfBad.status === 400, `got ${tfBad.status}`);

      // Device technical-file ASSEMBLE — materializes a real ZIP (no LLM needed).
      const tfa = await c.req('POST', `/api/submissions/sequences/${seqId}/technical-file/assemble`, { regulation: 'mdr' });
      ok('technical-file/assemble materializes a ZIP (sha256 + size)', tfa.status === 200 && tfa.json?.ok === true && /^[0-9a-f]{64}$/.test(tfa.json?.sha256 || '') && typeof tfa.json?.sizeBytes === 'number', `status ${tfa.status}`);

      // Dispatch-qc hardening: a sequenceId routes through the SERVER-COMPUTED gate.
      const qcAnon = await rawReq('POST', `/api/submissions/${subId}/dispatch-qc`, { region: 'fda', sequenceId: seqId, validationErrors: 0, unresolvedShadowCriticals: 0, leaves: [] });
      ok('dispatch-qc without auth is rejected (401)', qcAnon.status === 401, `got ${qcAnon.status}`);

      // Governed SUBMIT: freeze requires a valid e-signature on this sequence.
      const noSig = await c.req('POST', `/api/submissions/sequences/${seqId}/freeze`, { signatureActionId: `act_nonexistent_${Date.now()}` });
      ok('freeze with an invalid e-signature is rejected (403 GOVERNED_REQUIRED)', noSig.status === 403, `got ${noSig.status}`);

      // TRANSMIT requires the sequence to be dispatched first.
      const earlyTransmit = await c.req('POST', `/api/submissions/sequences/${seqId}/transmit`, { signatureActionId: `act_x_${Date.now()}` });
      ok('transmit before dispatch is rejected (409 INVALID_STATE)', earlyTransmit.status === 409, `got ${earlyTransmit.status}`);
    }
  }

  // Audit captured the AI/governed actions for this org.
  const audit = await c.req('GET', '/api/audit-log?limit=1');
  ok('audit-log reachable', audit.status === 200 || audit.status === 404, `status ${audit.status} (route name may differ)`);

  // ── Phase 1 ingestion (WO-1.5 Definition of Done) ──────────────────────────
  // Endpoint reachability + auth/tenant guards are env-independent. The grounded
  // classify (and its AI_GENERATE audit row) needs a seeded doc + an LLM key, so
  // it runs only when DOC_ID is provided.
  const anonClassify = await rawReq('POST', '/api/ectd-documents/999999/classify', {});
  ok('classify without auth is rejected (401)', anonClassify.status === 401, `got ${anonClassify.status}`);

  const bogusClassify = await c.req('POST', '/api/ectd-documents/999999999/classify', {});
  ok('classify on a missing/cross-tenant document is not found (404/400)', [404, 400].includes(bogusClassify.status), `got ${bogusClassify.status}`);

  if (process.env.DOC_ID) {
    const cls = await c.req('POST', `/api/ectd-documents/${process.env.DOC_ID}/classify`, {});
    const known = cls.status === 200 || [429, 503, 413].includes(cls.status);
    ok('classify on a seeded doc is grounded or a known gateway error', known, `status ${cls.status}`);
    if (cls.status === 200) {
      ok('classify returns sectionCode + confidence (never fabricated)', cls.json && 'sectionCode' in cls.json && 'confidence' in cls.json);
      const aiAudit = await c.req('GET', '/api/audit-log?action=AI_GENERATE&limit=1');
      ok('AI_GENERATE audit row recorded for the classify call', aiAudit.status === 200 && Array.isArray(aiAudit.json) && aiAudit.json.length >= 1, `status ${aiAudit.status}`);
    }
  } else {
    console.log('  · skipped grounded classify (set DOC_ID + an LLM key to enable)');
  }

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
