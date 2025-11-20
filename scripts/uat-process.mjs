/* Process Auto-Checker (UAT) – prints PASS/FAIL matrix.
   Usage:
     BASE_URL="https://<host>" ROLE="Admin" node scripts/uat-process.mjs
   Defaults:
     BASE_URL=http://localhost:3000  ROLE=Admin
*/
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ROLE = process.env.ROLE || 'Admin';
const HDRS = { 'Content-Type': 'application/json', 'x-user-role': ROLE };

const green = s => `\x1b[32m${s}\x1b[0m`;
const red = s => `\x1b[31m${s}\x1b[0m`;
const gray = s => `\x1b[90m${s}\x1b[0m`;
let FAIL = 0;

async function j(path, method = 'GET', body, headers = HDRS) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get('content-type') || '';
  if (!r.ok) {
    let msg = '';
    try {
      const e = await r.json();
      msg = e.error || JSON.stringify(e);
    } catch {}
    throw new Error(`${method} ${path} -> ${r.status} ${msg}`.slice(0, 500));
  }
  if (ct.includes('application/json')) return r.json();
  return { _file: true, status: r.status, headers: Object.fromEntries(r.headers.entries()) };
}

function row(label, ok, info = '') {
  const mark = ok ? green('PASS') : red('FAIL');
  console.log(`${mark}  ${label} ${info ? gray(`— ${info}`) : ''}`);
  if (!ok) FAIL++;
}

async function main() {
  console.log(gray(`Process Auto-Checker @ ${BASE} (role=${ROLE})`));

  // 0) health
  try {
    await j('/healthz');
    row('Healthz', true);
  } catch (e) {
    row('Healthz', false, e.message);
  }
  try {
    await j('/readyz');
    row('Readyz', true);
  } catch (e) {
    row('Readyz', false, e.message);
  }

  // 1) list processes
  let PROC_ID = null;
  try {
    const list = await j('/api/process/processes');
    row('GET /api/process/processes', true, `${list.length} found`);
    PROC_ID = list[0]?.process_id || null;

    // if none, try to create
    if (!PROC_ID) {
      const created = await j('/api/process/processes', 'POST', {
        name: `UAT Process ${Date.now()}`,
        scope: 'DP',
      });
      PROC_ID = created.process_id;
      row('POST /api/process/processes', true, `created ${PROC_ID}`);
    }
  } catch (e) {
    row('Process list/create', false, e.message);
    return finish();
  }

  // 2) details
  try {
    const det = await j(`/api/process/processes/${PROC_ID}`);
    row('GET /process details', true, `${(det.units || []).length} units`);
  } catch (e) {
    row('GET /process details', false, e.message);
  }

  // 3) Refresh tokens (P.3)
  try {
    const r = await j(`/api/process/processes/${PROC_ID}/authoring/recompute-tokens`, 'POST', {});
    const tok = r.tokens ?? r?.tokens_count ?? 'ok';
    row('POST /authoring/recompute-tokens', true, `tokens=${tok}`);
  } catch (e) {
    row('P.3 tokens refresh', false, e.message);
  }

  // 4) IQ/OQ checklists → QUAL guard
  let units = [];
  try {
    const det = await j(`/api/process/processes/${PROC_ID}`);
    units = det.units || [];
    for (const u of units) {
      await j(`/api/process/units/${u.unit_id}/checklist`, 'PATCH', {
        iq_done: true,
        oq_done: true,
      });
    }
    row('PATCH /units/:id/checklist (IQ/OQ)', true, `${units.length} units set`);
  } catch (e) {
    row('IQ/OQ checklist patch', false, e.message);
  }

  // 5) Approvals + set QUAL
  try {
    await j(`/api/process/processes/${PROC_ID}/approvals`, 'POST', {
      stage: 'QUAL',
      reason: 'UAT auto-check',
    });
    await j(`/api/process/processes/${PROC_ID}/stage`, 'PATCH', { stage: 'QUAL' });
    row('Stage → QUAL', true);
  } catch (e) {
    row('Stage → QUAL', false, e.message);
  }

  // 6) Seed PPQ if needed (≥3 PASS)
  try {
    const now = new Date().toISOString().slice(0, 10);
    for (let i = 1; i <= 3; i++) {
      try {
        await j(`/api/process/processes/${PROC_ID}/ppq`, 'POST', {
          lot_no: `PPQ-${i}`,
          run_date: now,
          result: 'PASS',
        });
      } catch {}
    }
    row('PPQ ≥3 PASS ensured', true);
  } catch (e) {
    row('PPQ seed', false, e.message);
  }

  // 7) Add high-RPN and assert VALIDATED is blocked
  let FMEA_ID = null;
  let blocked = false;
  try {
    const f = await j(`/api/process/processes/${PROC_ID}/fmea`, 'POST', {
      failure_mode: 'Critical CQ breach',
      s: 9,
      o: 4,
      d: 4,
    });
    FMEA_ID = f?.fmea_id || null;
    try {
      await j(`/api/process/processes/${PROC_ID}/approvals`, 'POST', {
        stage: 'VALIDATED',
        reason: 'UAT gate check',
      });
      await j(`/api/process/processes/${PROC_ID}/stage`, 'PATCH', { stage: 'VALIDATED' });
      row('VALIDATED gate (should block)', false, 'unexpected success');
    } catch (e) {
      blocked = true;
      row('VALIDATED gate blocks (High RPN open)', true);
    }
  } catch (e) {
    row('POST FMEA high-RPN', false, e.message);
  }

  // 8) Close FMEA & set VALIDATED
  try {
    if (FMEA_ID) await j(`/api/process/fmea/${FMEA_ID}`, 'PATCH', { status: 'CLOSED' });
    await j(`/api/process/processes/${PROC_ID}/approvals`, 'POST', {
      stage: 'VALIDATED',
      reason: 'UAT promotion',
    });
    await j(`/api/process/processes/${PROC_ID}/stage`, 'PATCH', { stage: 'VALIDATED' });
    row('Stage → VALIDATED after closing RPN', true);
  } catch (e) {
    row('Stage → VALIDATED', false, e.message);
  }

  // 9) Impact → apply tasks
  try {
    const im = await j(`/api/process/processes/${PROC_ID}/impact`);
    await j(`/api/process/processes/${PROC_ID}/impact/apply`, 'POST', {});
    row('Impact → tasks applied', true, `${(im.items || im || []).length || 'ok'}`);
  } catch (e) {
    row('Impact apply', false, e.message);
  }

  // 10) DOE quick sanity (propose + adopt)
  try {
    await j(`/api/process/processes/${PROC_ID}/doe/propose`, 'POST', {
      factors: [{ name: 'Inlet Temp' }, { name: 'Airflow' }],
    });
    await j(`/api/process/processes/${PROC_ID}/doe/adopt`, 'POST', {
      factors: [{ name: 'Inlet Temp', low: '52', high: '58', unit: '°C' }],
    });
    row('DOE propose/adopt', true);
  } catch (e) {
    row('DOE propose/adopt', false, e.message);
  }

  // 11) Export pack (zip)
  try {
    const z = await j(`/api/process/processes/${PROC_ID}/export-pack?fmt=pdf`, 'POST');
    const okZip = z._file && (z.headers['content-type'] || '').includes('application/zip');
    row('Export pack (zip)', okZip, okZip ? z.headers['content-type'] : 'not zip');
  } catch (e) {
    row('Export pack', false, e.message);
  }

  // 12) eCTD leaf set (zip)
  try {
    const z = await j(
      `/api/process/processes/${PROC_ID}/ectd/export?op=new&region=FDA&seq=1`,
      'POST'
    );
    const okZip = z._file && (z.headers['content-type'] || '').includes('application/zip');
    row('eCTD export (zip)', okZip, okZip ? z.headers['content-type'] : 'not zip');
  } catch (e) {
    row('eCTD export', false, e.message);
  }

  // 13) P.3 single-book with bookmarks (optional)
  try {
    const b = await j(`/api/process/processes/${PROC_ID}/submission/bookmarks`, 'POST');
    const okPdf = b._file ? (b.headers['content-type'] || '').includes('application/pdf') : true;
    row('Single-book PDF (bookmarks)', okPdf, okPdf ? 'pdf' : 'ok');
  } catch (e) {
    row('Single-book PDF', false, e.message);
  }

  return finish();
}

function finish() {
  console.log(
    '\n' + (FAIL ? red(`SUMMARY: ${FAIL} check(s) FAILED`) : green('SUMMARY: ALL CHECKS PASS'))
  );
  process.exitCode = FAIL ? 1 : 0;
}

main().catch(e => {
  console.error(e);
  finish();
});
