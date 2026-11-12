#!/usr/bin/env node
/**
 * MR-03 Stage 6 step 2: how long do compile and sequence assemble take,
 * on the production image, for an FDA IND sequence of 50 and of 200 leaves?
 *
 * Run INSIDE the production image, as ci.yml's production-image-boot job runs
 * scripts/ci/image-boot-signin.mjs (whose enrolment and sign-in this copies):
 *
 *   docker run --rm --network host -w /app -v "$PWD/<this file>:/app/measure.mjs:ro" \
 *     -e DATABASE_URL=<owner url> -e BASE_URL=http://127.0.0.1:5199 \
 *     -e SIGNIN_ORIGIN=<an ALLOWED_ORIGINS entry> -e MFA_ENCRYPTION_KEY=<the server's> \
 *     -e SIZES=50,200 -e RUNS=5 <image> node measure.mjs
 *
 * Everything is seeded through the API a person uses: a project, an IND
 * submission and its sequence 0000, N PDFs uploaded to the Vault through the
 * virus scanner, and N leaves placed across Modules 1 to 5 with a reason. Then
 * each endpoint is called RUNS times, one after another, and timed from
 * request to last byte. A 429 is waited out (Retry-After) and not timed.
 * Prints one JSON line per call and a summary per size and endpoint.
 */
import crypto from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5199';
const KEY = process.env.MFA_ENCRYPTION_KEY;
const ORIGIN = process.env.SIGNIN_ORIGIN;
const EMAIL = 'edge-timing@example.invalid';
const PASSWORD = `Edge-Timing-${crypto.randomBytes(9).toString('base64url')}!7`;
const SIZES = (process.env.SIZES ?? '50,200').split(',').map(Number);
const RUNS = Number(process.env.RUNS ?? 5);
const PAGES = Number(process.env.PAGES ?? 8);

function fail(step, detail) {
  console.error(`measure FAILED at ${step}: ${detail}`);
  process.exit(1);
}

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function encryptSecret(plaintext) {
  const key = crypto.createHash('sha256').update(KEY).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = cipher.update(plaintext, 'utf8', 'hex') + cipher.final('hex');
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ct}`;
}

function totp(secret, offsetSteps = 0) {
  const counter = Math.floor(Date.now() / 1000 / 30) + offsetSteps;
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', secret).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}


const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One request, waiting out a 429; returns status, parsed body and elapsed ms of the final attempt. */
async function call(method, path, body, token, { form } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    const started = performance.now();
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(form ? {} : { 'content-type': 'application/json' }),
        origin: ORIGIN,
        'x-forwarded-proto': 'https',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: form ?? (body ? JSON.stringify(body) : undefined),
      redirect: 'manual',
    });
    const text = await res.text();
    const ms = performance.now() - started;
    if (res.status === 429 && attempt < 30) {
      const wait = Number(res.headers.get('retry-after') ?? 5);
      await sleep((Number.isFinite(wait) && wait > 0 ? wait : 5) * 1000 + 250);
      continue;
    }
    let json = null;
    try { json = JSON.parse(text); } catch { /* text */ }
    return { status: res.status, json, text: text.slice(0, 400), ms, bytes: text.length };
  }
}

async function enrol() {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const org = await db.query(
      `INSERT INTO organizations (name, slug) VALUES ('Edge timing sponsor', 'edge-timing-sponsor')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    );
    const secret = crypto.randomBytes(20);
    const user = await db.query(
      `INSERT INTO users (email, name, password_hash, status, mfa_enabled, mfa_method, mfa_secret)
       VALUES ($1, 'Edge Timing', $2, 'active', true, 'totp', $3)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, status = 'active',
         mfa_enabled = true, mfa_method = 'totp', mfa_secret = EXCLUDED.mfa_secret,
         failed_login_attempts = 0, locked_until = NULL
       RETURNING id`,
      [EMAIL, await bcrypt.hash(PASSWORD, 10), encryptSecret(base32(secret))],
    );
    await db.query(
      `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'member')
       ON CONFLICT (user_id, organization_id) DO UPDATE SET role = 'member'`,
      [org.rows[0].id, user.rows[0].id],
    );
    // The organisation's own workspace, marked as signup marks it
    // (organization-default-workspace.ts), so a program can anchor its project.
    await db.query(
      `INSERT INTO client_workspaces (organization_id, name, slug, description, status, metadata)
       VALUES ($1, 'Edge timing sponsor', 'edge-timing-sponsor', 'The organisation''s own workspace.', 'active',
               '{"defaultForOrganization":true}'::json)
       ON CONFLICT (organization_id, slug) DO NOTHING`,
      [org.rows[0].id],
    );
    return { secret, orgId: Number(org.rows[0].id), userId: Number(user.rows[0].id) };
  } finally {
    await db.end();
  }
}


/** A PDF of `pages` pages with real xref offsets; `marker` makes its bytes unique. */
function pdf(marker, pages) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids = [];
  for (let p = 0; p < pages; p += 1) {
    const lines = Array.from({ length: 40 }, (_, i) => `(${marker} page ${p + 1} line ${i + 1}: the study report text this leaf would carry.) Tj T*`).join(' ');
    const stream = `BT /F1 10 Tf 12 TL 72 740 Td ${lines} ET`;
    objects.push(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    const contents = objects.length;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contents} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`);
    kids.push(`${objects.length} 0 R`);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages} >>`;
  let body = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(body, 'latin1')); body += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

/** Sections across Modules 1-5 an IND carries; leaves are dealt round-robin, as study reports pile into m5. */
const SECTIONS = [
  'm1.1.1', 'm1.1.2', 'm1.2', 'm1.3.1.1', 'm1.4.4', 'm1.12.4', 'm1.14.1',
  'm2.2', 'm2.3.s', 'm2.3.p', 'm2.4', 'm2.5', 'm2.6.2', 'm2.6.4', 'm2.6.6', 'm2.7.1', 'm2.7.3',
  'm3.2.s.1.1', 'm3.2.s.2.2', 'm3.2.s.4.1', 'm3.2.s.7.1', 'm3.2.p.1', 'm3.2.p.3.3', 'm3.2.p.5.1', 'm3.2.p.8.1',
  'm4.2.1.1', 'm4.2.2.2', 'm4.2.3.1', 'm4.2.3.2', 'm4.2.3.3.1', 'm4.2.3.4.1',
  'm5.2', 'm5.3.1.1', 'm5.3.3.1', 'm5.3.5.1', 'm5.3.5.1', 'm5.3.5.1', 'm5.3.5.3', 'm5.3.7', 'm5.4',
];

const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};

if (!KEY || KEY.length < 32) fail('setup', 'MFA_ENCRYPTION_KEY (>= 32 chars, the one the server runs with) is required.');
if (!ORIGIN) fail('setup', 'SIGNIN_ORIGIN (an origin in the server\'s ALLOWED_ORIGINS) is required.');

const { secret } = await enrol();
const login = await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
if (login.status !== 200 || !login.json?.challengeId) fail('login', `${login.status} ${login.text}`);
const verify = await call('POST', '/api/auth/mfa/verify', { challengeId: login.json.challengeId, code: totp(secret), method: 'totp' });
if (verify.status !== 200 || !verify.json?.accessToken) fail('second factor', `${verify.status} ${verify.text}`);
const token = verify.json.accessToken;
console.info(JSON.stringify({ event: 'signed-in', email: EMAIL }));

const summary = [];
for (const n of SIZES) {
  const tag = `${n}-${crypto.randomBytes(3).toString('hex')}`;
  const project = await call('POST', '/api/c2c/projects', { name: `Edge timing IND ${tag}`, programType: 'ind', productType: 'drug', primaryAgency: 'FDA' }, token);
  const programId = project.json?.data?.id ?? project.json?.program?.id;
  if (project.status !== 201 || !programId) fail(`project ${n}`, `${project.status} ${project.text}`);
  // The package's recorded identity, which compile requires (package-identity.ts): the agency's application
  // number, a bound applicant with a D-U-N-S number, and a regulatory contact. Recorded here as the database
  // owner, not through Submission Center's Forms and letters screens: it is metadata the assembly reads once,
  // and it does not change what is compiled or how long that takes.
  {
    const owner = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await owner.connect();
    try {
      const orgRow = await owner.query('SELECT organization_id FROM regulatory_programs WHERE id = $1', [programId]);
      const sponsor = await owner.query(
        `INSERT INTO ind_sponsors (organization_id, name, duns, contact_name, contact_phone, contact_email)
         VALUES ($1, 'Edge Timing Therapeutics', '123456789', 'Edge Timing', '+1 555 010 0100', 'edge-timing@example.invalid') RETURNING id`,
        [orgRow.rows[0].organization_id],
      );
      await owner.query('UPDATE regulatory_programs SET application_number = $2, applicant_sponsor_id = $3 WHERE id = $1',
        [programId, String(100000 + Math.floor(Math.random() * 899999)), sponsor.rows[0].id]);
    } finally {
      await owner.end();
    }
  }
  const sub = await call('POST', '/api/submissions', { programId, title: `Edge timing IND ${tag}`, productName: `Edge timing ${tag}`, applicationType: 'IND', clientType: 'biotech', primaryRegion: 'fda' }, token);
  if (sub.status !== 201) fail(`submission ${n}`, `${sub.status} ${sub.text}`);
  const seq = await call('POST', `/api/submissions/${sub.json.id}/sequences`, { region: 'fda', sequenceNumber: '0000', type: 'original' }, token);
  if (seq.status !== 201) fail(`sequence ${n}`, `${seq.status} ${seq.text}`);

  const seedStarted = performance.now();
  let uploadedBytes = 0;
  for (let i = 0; i < n; i += 1) {
    const bytes = pdf(`${tag}-${i}`, PAGES);
    uploadedBytes += bytes.length;
    const form = new FormData();
    form.append('programId', String(programId));
    form.append('documentCode', `EDGE-${tag}-${i}`);
    form.append('documentTitle', `Edge timing leaf ${i + 1}`);
    form.append('documentType', 'OTHER');
    form.append('file', new Blob([bytes], { type: 'application/pdf' }), `leaf-${i + 1}.pdf`);
    const up = await call('POST', '/api/vault/ingest', null, token, { form });
    if (up.status !== 201) fail(`upload ${n}/${i}`, `${up.status} ${up.text}`);
    const section = SECTIONS[i % SECTIONS.length];
    // A Module 4/5 study report belongs to a study: FDA rejects one no Study Tagging File references (validation 1789).
    // The ICH STF tag for the report body: a nonclinical report is "pre-clinical-study-report", a clinical one
    // "study-report-body" (ICH eCTD STF Specification v2.6.1).
    const study = /^m4\.2\./.test(section) ? { studyId: `EDGE-NC-${Math.floor(i / 5) + 1}`, stfFileTag: 'pre-clinical-study-report' }
      : /^m5\.3\./.test(section) ? { studyId: `EDGE-CL-${Math.floor(i / 5) + 1}`, stfFileTag: 'study-report-body' } : {};
    const place = await call('PUT', `/api/submissions/sequences/${seq.json.id}/leaves`, {
      sectionCode: section, title: `Edge timing leaf ${i + 1} (${section})`, documentTable: 'vault_documents',
      documentUuid: up.json.document.id, lifecycleOp: 'new', reason: 'Placed by the edge-timing measurement (MR-03 Stage 6 step 2)',
      ...study,
    }, token);
    if (place.status !== 200) fail(`place ${n}/${i}`, `${place.status} ${place.text}`);
  }
  console.info(JSON.stringify({ event: 'seeded', leaves: n, programId, submissionId: sub.json.id, sequenceId: seq.json.id, pagesPerLeaf: PAGES, uploadedBytes, seedSeconds: Math.round((performance.now() - seedStarted) / 1000) }));

  const endpoints = [
    ['compile', 'POST', `/api/ectd-compile/${programId}/compile`, { region: 'FDA', submissionType: 'initial' }],
    ['sequence-assemble', 'POST', `/api/submissions/sequences/${seq.json.id}/assemble`, {}],
  ];
  for (const [name, method, path, body] of endpoints) {
    const times = [];
    const statuses = [];
    for (let r = 0; r < RUNS; r += 1) {
      const out = await call(method, path, body, token);
      times.push(out.ms);
      statuses.push(out.status);
      console.info(JSON.stringify({ event: 'call', leaves: n, endpoint: name, run: r + 1, status: out.status, ms: Math.round(out.ms), bytes: out.bytes, ...(out.status >= 400 ? { body: out.text } : {}), ...(r === 0 && out.json && typeof out.json === 'object' ? { outcome: { status: out.json.status ?? null, leafFilesRendered: out.json.leafFilesRendered ?? out.json.materialized ?? null, blockers: (out.json.submissionBlockers ?? []).slice(0, 3), errors: (out.json.errors ?? []).slice(0, 3) } } : {}) }));
    }
    summary.push({ leaves: n, endpoint: name, runs: RUNS, statuses: [...new Set(statuses)], p50_s: +(pct(times, 50) / 1000).toFixed(2), p95_s: +(pct(times, 95) / 1000).toFixed(2), max_s: +(Math.max(...times) / 1000).toFixed(2) });
  }
}
for (const row of summary) console.info(`summary ${row.leaves} leaves, ${row.endpoint}: p50 ${row.p50_s} s, p95 ${row.p95_s} s, max ${row.max_s} s (HTTP ${row.statuses.join('/')})`);
console.info(JSON.stringify({ event: 'summary', rows: summary }));
