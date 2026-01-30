#!/usr/bin/env node
// Regulatory IR Auto-Checker — creates a temp IR, drafts, saves, packages, cleans up.

import Table from 'cli-table3';
import { blue, green, red, yellow } from 'kleur/colors';
import fetch_ from 'node-fetch';

const fetch = (...args) => fetch_(...args); // Node 20 compatible

const BASE = (process.env.REPLIT_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
const SUB = process.env.REPLIT_SUBMISSION_ID;

if (!SUB) {
  logger.error(red('Missing env REPLIT_SUBMISSION_ID'));
  process.exit(2);
}

function row(ok, status, path) {
  return { ok, status, path };
}
async function getJson(path) {
  const r = await fetch(BASE + path);
  const json = await (async () => {
    try {
      return await r.json();
    } catch {
      return null;
    }
  })();
  return { ok: r.ok && !!json, status: r.status, json };
}

async function postJson(path, body = {}, headers = {}) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const ct = r.headers.get('content-type') || '';
  let json = null;
  if (ct.includes('application/json')) {
    try {
      json = await r.json();
    } catch {}
  }
  return { ok: r.ok, status: r.status, json, headers: Object.fromEntries(r.headers) };
}

async function patchJson(path, body = {}) {
  const r = await fetch(BASE + path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await r.json();
  } catch {}
  return { ok: r.ok, status: r.status, json };
}

async function del(path, headers = {}) {
  const r = await fetch(BASE + path, { method: 'DELETE', headers });
  let json = null;
  try {
    json = await r.json();
  } catch {}
  return { ok: r.ok, status: r.status, json };
}

async function run() {
  const t = new Table({ head: ['Check', 'Status', 'HTTP', 'Endpoint / Note'] });
  const m = []; // matrix rows
  let createdQ = null;

  // 1) List questions
  const list = await getJson(`/api/cmc/blueprint/regulatory/submissions/${SUB}/questions`);
  m.push([
    'List questions',
    list.ok,
    list.status,
    `/api/cmc/blueprint/regulatory/submissions/${SUB}/questions`,
  ]);

  // 2) Create temp question
  const create = await postJson(`/api/cmc/blueprint/regulatory/submissions/${SUB}/questions`, {
    title: '[AUTO-CHECK] Clarify assay validation',
    sec_code: '3.2.P.5',
    question_text: 'Provide validation details for assay method.',
    due_date: new Date(Date.now() + 30 * 86400e3).toISOString().slice(0, 10),
  });
  createdQ = create.json?.q_id || create.json?.q?.q_id || null;
  m.push([
    'Create temp IR',
    create.ok && !!createdQ,
    create.status,
    `/api/cmc/blueprint/regulatory/submissions/${SUB}/questions`,
  ]);

  // 3) AI draft
  let draft = { ok: false, status: 0, json: null };
  if (createdQ) {
    draft = await postJson(`/api/cmc/blueprint/regulatory/questions/${createdQ}/ai-draft`);
  }
  const hasDraft = !!draft.json?.ai_draft_md || !!draft.json?.question?.ai_draft_md;
  m.push([
    'AI draft',
    draft.ok && hasDraft,
    draft.status,
    `/api/cmc/blueprint/regulatory/questions/${createdQ}/ai-draft`,
  ]);

  // 4) Save final (IN_REVIEW)
  let save = { ok: false, status: 0 };
  if (createdQ) {
    save = await patchJson(`/api/cmc/blueprint/regulatory/questions/${createdQ}`, {
      final_md: '**Response**: Method validated per ICH Q2(R2); system suitability within limits.',
      status: 'IN_REVIEW',
    });
  }
  m.push([
    'Save final',
    save.ok,
    save.status,
    `/api/cmc/blueprint/regulatory/questions/${createdQ}`,
  ]);

  // 5) Package ZIP
  const packRes = await fetch(
    BASE + `/api/cmc/blueprint/regulatory/submissions/${SUB}/questions/pack`,
    { method: 'POST' }
  );
  const isZip = (packRes.headers.get('content-type') || '').includes('zip');
  const hasBody = (await packRes.arrayBuffer()).byteLength > 0;
  m.push([
    'Package ZIP',
    packRes.ok && isZip && hasBody,
    packRes.status,
    `/api/cmc/blueprint/regulatory/submissions/${SUB}/questions/pack`,
  ]);

  // 6) Cleanup (delete temp)
  let cleanup = { ok: false, status: 0 };
  if (createdQ) {
    cleanup = await del(`/api/cmc/blueprint/regulatory/questions/${createdQ}`, {
      'x-auto-check': 'true',
    });
  }
  m.push([
    'Cleanup temp',
    cleanup.ok,
    cleanup.status,
    `/api/cmc/blueprint/regulatory/questions/${createdQ}`,
  ]);

  // Print results
  let passCount = 0,
    failCount = 0;
  for (const [label, ok, status, path] of m) {
    if (ok) {
      t.push([label, green('PASS'), status, path]);
      passCount++;
    } else {
      t.push([label, red('FAIL'), status, path]);
      failCount++;
    }
  }
  logger.info(blue(`\nIR Auto‑Check — Submission ${SUB}\n`));
  logger.info(t.toString());
  logger.info(
    `\nSummary: ${green(`${passCount} PASS`)} / ${failCount ? red(`${failCount} FAIL`) : '0 FAIL'}\n`
  );
  process.exit(failCount ? 1 : 0);
}

run().catch(e => {
  logger.error(red(e?.stack || e));
  process.exit(2);
});
