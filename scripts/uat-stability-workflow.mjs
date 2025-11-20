/* UAT Stability Workflow Runner. Usage:
   BASE_URL=https://<host> node scripts/uat-stability-workflow.mjs
*/
const BASE = process.env.BASE_URL || 'http://localhost:5000';
const H = { 'Content-Type': 'application/json' };
const ok = m => console.log('✅', m);
const fail = (m, e) => {
  console.error('❌', m, e?.message || e);
  process.exitCode = 1;
};

async function j(path, method = 'GET', body) {
  const r = await fetch(BASE + path, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const ct = r.headers.get('content-type') || '';
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  if (ct.includes('application/json')) return r.json();
  return { file: true, status: r.status };
}

(async () => {
  try {
    await j('/api/health');
    ok('healthz');

    // choose or create study
    let list = await j('/api/stability/studies');
    let SID = list[0]?.study_id;
    if (!SID) {
      const c = await j('/api/stability/studies', 'POST', {
        name: 'UAT Workflow',
        code: 'SS-WF-001',
        scope: 'DP',
        dosage_form: 'Tablet',
        strength: '10 mg',
        climatic_zone: 'IVa',
        cqas: ['Assay', 'Dissolution', 'Impurities', 'Appearance'],
      });
      SID = c.study_id;
      ok('created study');
    } else ok(`using study ${SID}`);

    // add results
    await j(`/api/stability/studies/${SID}/results`, 'POST', {
      cond_kind: 'LT',
      label: '0M',
      test_name: 'Assay',
      value: '100.0',
      unit: '%',
    });
    await j(`/api/stability/studies/${SID}/results`, 'POST', {
      cond_kind: 'LT',
      label: '3M',
      test_name: 'Assay',
      value: '99.3',
      unit: '%',
    });
    await j(`/api/stability/studies/${SID}/results`, 'POST', {
      cond_kind: 'LT',
      label: '6M',
      test_name: 'Assay',
      value: '98.7',
      unit: '%',
    });
    ok('posted results');

    // review
    const pend = await j(`/api/stability/studies/${SID}/results/pending`);
    const rid = pend[0]?.result_id;
    if (rid) {
      await j(`/api/stability/results/${rid}/review`, 'POST', { status: 'REVIEWED' });
      ok('reviewed 1');
    }

    // CAPA
    const capa = await j(`/api/stability/studies/${SID}/capa`, 'POST', {
      title: 'OOT investigation',
      owner: 'QA Lead',
    });
    await j(`/api/stability/capa/${capa.capa_id}`, 'PATCH', { status: 'IN_PROGRESS' });
    await j(`/api/stability/capa/${capa.capa_id}`, 'PATCH', { status: 'DONE' });
    ok('capa done');

    // excursions import not automated here (file), but endpoint exists
    await j(`/api/stability/studies/${SID}/protocol/draft`, 'POST');
    ok('protocol draft');
    await j(`/api/stability/studies/${SID}/score`);
    ok('score computed');
    await j(`/api/stability/oot-surveillance?studyId=${SID}&test=Assay`);
    ok('OOT JSON');

    console.log('\nUAT Workflow PASS');
  } catch (e) {
    fail('UAT Workflow FAILED', e);
  }
})();
