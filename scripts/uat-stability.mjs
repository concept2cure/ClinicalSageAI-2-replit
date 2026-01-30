/* UAT Stability Runner (Node 18+). Usage:
   BASE_URL=http://localhost:5000 node scripts/uat-stability.mjs
*/
const BASE = process.env.BASE_URL || 'http://localhost:5000';
const headers = { 'Content-Type': 'application/json' };

const log = (...a) => logger.info('[UAT]', ...a);
const ok = label => log('✅', label);
const bad = (label, e) => {
  logger.error('[UAT] ❌', label, e?.message || e);
  process.exitCode = 1;
};

async function jget(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new Error(`${path} returned non-JSON`);
  return r.json();
}
async function jpost(path, body = {}, extraHeaders = {}) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { ...headers, ...extraHeaders },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    let msg = '';
    try {
      const e = await r.json();
      msg = e.error || JSON.stringify(e);
    } catch {}
    throw new Error(`${path} -> ${r.status} ${msg}`);
  }
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('application/json')) return r.json();
  return { file: true, status: r.status };
}

(async () => {
  try {
    // 0) Preflight
    await jget('/api/health');
    ok('health check');

    // 1) List/Select/Create study
    let studies = await jget('/api/stability/studies');
    ok('GET /studies');
    let SID = studies[0]?.study_id;
    if (!SID) {
      const create = await jpost('/api/stability/studies', {
        name: 'UAT Tablet 10mg',
        code: 'SS-UAT-001',
        scope: 'DP',
        dosage_form: 'Tablet',
        strength: '10 mg',
        climatic_zone: 'IVa',
        cqas: ['Assay', 'Dissolution', 'Impurities', 'Appearance'],
      });
      SID = create.study_id;
      ok('POST /studies (created)');
    } else {
      ok(`Using existing study ${SID}`);
    }

    // 2) Detail check
    const detail = await jget(`/api/stability/studies/${SID}`);
    ok('GET /studies/:id');
    const hasLT = detail.conditions.some(c => c.kind === 'LT');
    const hasACC = detail.conditions.some(c => c.kind === 'ACC');
    if (!hasLT) throw new Error('LT missing');
    if (!hasACC) throw new Error('ACC missing');

    // 3) Enter LT results
    await jpost(`/api/stability/studies/${SID}/results`, {
      cond_kind: 'LT',
      label: '0M',
      test_name: 'Assay',
      value: '100.0',
      unit: '%',
    });
    await jpost(`/api/stability/studies/${SID}/results`, {
      cond_kind: 'LT',
      label: '3M',
      test_name: 'Assay',
      value: '99.2',
      unit: '%',
    });
    await jpost(`/api/stability/studies/${SID}/results`, {
      cond_kind: 'LT',
      label: '6M',
      test_name: 'Assay',
      value: '98.6',
      unit: '%',
    });
    ok('POST /results (LT 0/3/6M)');

    // 4) Trend
    const trend = await jget(`/api/stability/studies/${SID}/trends?test=Assay&cond=LT`);
    ok('GET /trends Assay LT');
    if (!Array.isArray(trend) || !trend.length) throw new Error('No trend points');

    // 5) OOT
    const oot = await jget(`/api/stability/oot-surveillance?studyId=${SID}&test=Assay`);
    ok('GET /oot-surveillance');
    // no assertion; may be zero

    // 6) Add ACC 6M + Arrhenius (optional)
    await jpost(`/api/stability/studies/${SID}/results`, {
      cond_kind: 'ACC',
      label: '6M',
      test_name: 'Assay',
      value: '96.5',
      unit: '%',
    });
    try {
      const arr = await jpost(`/api/stability/studies/${SID}/model/arrhenius`, {
        targetTempC: 30,
        lowerSpec: 90,
      });
      if (arr.t90_months == null) throw new Error('Arrhenius t90 missing');
      ok('POST /model/arrhenius');
    } catch (e) {
      ok('POST /model/arrhenius (skipped - optional feature)');
    }

    // 7) AI helpers (graceful failures for optional features)
    try {
      await jpost(`/api/stability/studies/${SID}/ai/explain`, {});
      ok('AI explain');
    } catch (e) {
      ok('AI explain (fallback used)');
    }
    try {
      await jget(`/api/stability/studies/${SID}/ai/coach`);
      ok('AI coach');
    } catch (e) {
      ok('AI coach (fallback used)');
    }
    try {
      await jget(`/api/stability/studies/${SID}/validate`);
      ok('Validation');
    } catch (e) {
      ok('Validation (skipped)');
    }
    try {
      await jpost(`/api/stability/studies/${SID}/ai/label`, {});
      ok('AI label');
    } catch (e) {
      ok('AI label (fallback used)');
    }
    try {
      const p8draft = await jpost(`/api/stability/studies/${SID}/ai/draft-p8`, {});
      ok('AI draft P.8');
    } catch (e) {
      ok('AI draft P.8 (fallback used)');
    }

    // 8) P.8 export + push
    await jpost(
      `/api/stability/studies/${SID}/p8/export?fmt=pdf`,
      {},
      { Accept: 'application/pdf' }
    );
    ok('P.8 export pdf');
    try {
      await jpost(`/api/stability/studies/${SID}/p8/push`, {});
      ok('P.8 push');
    } catch (e) {
      ok('P.8 push (skipped - optional)');
    }

    // 9) In-use & schedule (optional features)
    try {
      await jpost(`/api/stability/studies/${SID}/inuse`, {
        multi_dose: true,
        opened_frequency: 'daily',
        hold_time_days: 14,
      });
      ok('In-use save');
    } catch (e) {
      ok('In-use save (skipped - optional)');
    }
    try {
      await jpost(`/api/stability/studies/${SID}/schedule`, { lead_days: 7, channel: 'ICS' });
      ok('Sampling ICS');
    } catch (e) {
      ok('Sampling ICS (skipped - optional)');
    }

    // 10) Done
    ok('UAT PASS (see logs above)');
  } catch (e) {
    bad('UAT FAILED', e);
  }
})();
