#!/usr/bin/env node
/**
 * Seed Stability Fixtures
 *
 * Creates/updates a Stability study with LT+ACC, timepoints, tests and results.
 * Optionally inserts P.8 tokens into a Document Authoring section (3.2.P.8).
 *
 * Usage (example):
 *   BASE_URL="http://localhost:5000" \
 *   PRODUCT_CODE="UAT-PROD" \
 *   STUDY_CODE="SS-UAT-001" \
 *   STUDY_NAME="UAT Stability 24M" \
 *   DOC_ID="<optional-authoring-doc-uuid>" \
 *   node scripts/seed-stability.mjs
 */

const BASE_URL     = process.env.BASE_URL || "http://localhost:5000";
const PRODUCT_CODE = process.env.PRODUCT_CODE || "UAT-PROD";
const STUDY_CODE   = process.env.STUDY_CODE   || "SS-UAT-001";
const STUDY_NAME   = process.env.STUDY_NAME   || "UAT Stability 24M";
const DOC_ID       = process.env.DOC_ID || null;

const SECTION_P8   = "3.2.P.8";
const TOKEN_P8     = "P8.TABLES";
const TOKEN_P8C    = "P8.CONCLUSIONS";

const LT = { kind: "LT",  temp: 25, rh: 60 };
const ACC= { kind: "ACC", temp: 40, rh: 75 };

const TP_MONTHS = [0, 3, 6, 9, 12];
const TESTS = [
  { name: "Assay",       unit: "%",    spec_low: 98,   spec_high: 102, is_cqa: true },
  { name: "Dissolution", unit: "%Q",   spec_low: 80,   spec_high: 120, is_cqa: true },
  { name: "Impurities",  unit: "%",    spec_low: 0,    spec_high: 2.0, is_cqa: true },
  { name: "Appearance",  unit: "—",    spec_low: null, spec_high: null, is_cqa: false }
];

async function j(url, opts = {}) {
  const r = await fetch(url, opts);
  const ct = r.headers.get("content-type") || "";
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const e = await r.json(); msg += ` ${e.error || ""}`; } catch {}
    throw new Error(`${opts.method || "GET"} ${url} → ${msg}`);
  }
  if (ct.includes("application/json")) return r.json();
  if (ct.includes("application/pdf") || ct.includes("officedocument")) return r.arrayBuffer();
  if (!ct || ct.includes("text/plain")) return null; // some POSTs may return no body
  throw new Error(`${url} → Unexpected content-type: ${ct}`);
}

async function findStudyByCode() {
  const rows = await j(`${BASE_URL}/api/stability/studies`).catch(()=>[]);
  return (rows || []).find(s => (s.code || s.study_code) === STUDY_CODE);
}

async function createStudyAI() {
  // Prefer AI-powered creation if your API supports it
  const body = {
    code: STUDY_CODE,
    name: STUDY_NAME,
    product_code: PRODUCT_CODE,
    zone: "II",
    duration_months: 24,
    dosage_form: "Tablet",
    use_ai: true
  };
  return j(`${BASE_URL}/api/stability/studies`, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(body)
  });
}

async function ensureStudy() {
  let s = await findStudyByCode();
  if (s) return s;
  try {
    s = await createStudyAI();
    logger.info(`- Created AI study: ${s.study_id || s.id}`);
    return s;
  } catch (e) {
    logger.warn("- AI study creation not available; falling back to manual creation…");
    const body = { code: STUDY_CODE, name: STUDY_NAME, product_code: PRODUCT_CODE, zone: "II", duration_months: 24 };
    s = await j(`${BASE_URL}/api/stability/studies`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(body)
    });
    logger.info(`- Created study: ${s.study_id || s.id}`);
    return s;
  }
}

async function ensureCondition(studyId, cond) {
  const detail = await j(`${BASE_URL}/api/stability/studies/${studyId}`).catch(()=>null);
  const has = (detail?.conditions || []).find(c => (c.kind||"").toUpperCase() === cond.kind);
  if (has) return has;
  return j(`${BASE_URL}/api/stability/studies/${studyId}/conditions`, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(cond)
  });
}

async function ensureTimepoints(studyId, months) {
  const detail = await j(`${BASE_URL}/api/stability/studies/${studyId}`).catch(()=>null);
  const have = new Set((detail?.timepoints || []).map(t => t.m || t.month || 0));
  for (const m of months) {
    if (have.has(m)) continue;
    await j(`${BASE_URL}/api/stability/studies/${studyId}/timepoints`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ label: `${m}M`, m })
    }).catch(()=>{});
  }
  return j(`${BASE_URL}/api/stability/studies/${studyId}`);
}

async function ensureTests(studyId) {
  const detail = await j(`${BASE_URL}/api/stability/studies/${studyId}`).catch(()=>null);
  const existing = new Set((detail?.tests || []).map(t => (t.name || "").toLowerCase()));
  for (const t of TESTS) {
    if (existing.has(t.name.toLowerCase())) continue;
    await j(`${BASE_URL}/api/stability/studies/${studyId}/tests`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(t)
    }).catch(()=>{});
  }
  return j(`${BASE_URL}/api/stability/studies/${studyId}`);
}

function pick(arr, pred) { return (arr || []).find(pred); }

function dateOffsetDays(days) {
  const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0,10);
}

async function collectSample(studyId, tpId) {
  // Set actual_date and create/return a sample; API behavior may vary; both forms handled.
  const r = await j(`${BASE_URL}/api/stability/studies/${studyId}/timepoints/${tpId}/sample`, {
    method: "POST", headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ actual_date: dateOffsetDays(3) })
  }).catch(()=>null);
  // If API returns full sample, great; otherwise fetch samples list.
  if (r && r.sample_id) return r;
  const list = await j(`${BASE_URL}/api/stability/studies/${studyId}/samples`).catch(()=>[]);
  // pick most recent by this tp id if your API links it; else return first
  return (list || [])[0] || null;
}

async function addResult(studyId, { testId, tpId, condKind, unit, value }) {
  const payload = { test_id: testId, tp_id: tpId, condition: condKind, unit, value };
  return j(`${BASE_URL}/api/stability/studies/${studyId}/results`, {
    method: "POST", headers: { "Content-Type":"application/json" },
    body: JSON.stringify(payload)
  });
}

async function maybeLinkSample(studyId, resultId, sampleCode) {
  // best-effort linking by code; some builds link on create
  if (!sampleCode) return;
  await j(`${BASE_URL}/api/stability/studies/${studyId}/results/link-by-code`, {
    method: "POST", headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ result_id: resultId, sample_code: sampleCode })
  }).catch(()=>{});
}

async function seedResults(studyId, detail) {
  const tests = detail.tests || [];
  const tAssay = pick(tests, t => (t.name||"").toLowerCase()==="assay");
  const tDiss  = pick(tests, t => (t.name||"").toLowerCase()==="dissolution");
  const tImp   = pick(tests, t => (t.name||"").toLowerCase()==="impurities");

  const lt = pick(detail.conditions, c=>c.kind==="LT");
  const acc= pick(detail.conditions, c=>c.kind==="ACC");
  const tps = detail.timepoints || [];
  const tp0 = pick(tps, tp => (tp.m||tp.month)===0);
  const tp3 = pick(tps, tp => (tp.m||tp.month)===3);
  const tp6 = pick(tps, tp => (tp.m||tp.month)===6);

  // Collect samples for LT at 0,3,6
  const s0 = tp0 ? await collectSample(studyId, tp0.tp_id || tp0.id) : null;
  const s3 = tp3 ? await collectSample(studyId, tp3.tp_id || tp3.id) : null;
  const s6 = tp6 ? await collectSample(studyId, tp6.tp_id || tp6.id) : null;

  const unitAssay = (tAssay && (tAssay.unit || "%")) || "%";
  const unitDisso = (tDiss  && (tDiss.unit || "%Q")) || "%Q";
  const unitImp   = (tImp   && (tImp.unit  || "%")) || "%";

  // Seed results near-perfect at LT; slightly lower at ACC to allow modeling/OOT
  const inserts = [];
  if (tAssay && tp0 && lt) inserts.push({ testId:tAssay.test_id||tAssay.id, tpId:tp0.tp_id||tp0.id, condKind:"LT",  unit:unitAssay, value:100.1, sample:s0 });
  if (tAssay && tp3 && lt) inserts.push({ testId:tAssay.test_id||tAssay.id, tpId:tp3.tp_id||tp3.id, condKind:"LT",  unit:unitAssay, value:100.0, sample:s3 });
  if (tAssay && tp6 && lt) inserts.push({ testId:tAssay.test_id||tAssay.id, tpId:tp6.tp_id||tp6.id, condKind:"LT",  unit:unitAssay, value:99.8,  sample:s6 });

  if (tAssay && tp3 && acc) inserts.push({ testId:tAssay.test_id||tAssay.id, tpId:tp3.tp_id||tp3.id, condKind:"ACC", unit:unitAssay, value:98.4 });
  if (tAssay && tp6 && acc) inserts.push({ testId:tAssay.test_id||tAssay.id, tpId:tp6.tp_id||tp6.id, condKind:"ACC", unit:unitAssay, value:97.9 });

  if (tDiss && tp0 && lt)  inserts.push({ testId:tDiss.test_id||tDiss.id, tpId:tp0.tp_id||tp0.id, condKind:"LT",  unit:unitDisso, value:92 });
  if (tDiss && tp6 && acc) inserts.push({ testId:tDiss.test_id||tDiss.id, tpId:tp6.tp_id||tp6.id, condKind:"ACC", unit:unitDisso, value:88 });

  if (tImp && tp6 && acc)  inserts.push({ testId:tImp.test_id||tImp.id,  tpId:tp6.tp_id||tp6.id,  condKind:"ACC", unit:unitImp,   value:1.2 });

  for (const ins of inserts) {
    const r = await addResult(studyId, ins);
    await maybeLinkSample(studyId, r.result_id || r.id, ins.sample?.sample_code);
  }
}

async function ensureOotRules(studyId) {
  await j(`${BASE_URL}/api/stability/studies/${studyId}/oot/rules`, {
    method: "POST", headers: { "Content-Type":"application/json" },
    body: JSON.stringify({
      rules: { WE1:true, WE2:true, WE3:true, WE4:true },
      tests: ["Assay","Dissolution"]
    })
  }).catch(()=>{});
}

async function runSurveillance(studyId) {
  const a = await j(`${BASE_URL}/api/stability/studies/${studyId}/oot/surveillance?test=Assay`).catch(()=>({}));
  const d = await j(`${BASE_URL}/api/stability/studies/${studyId}/oot/surveillance?test=Dissolution`).catch(()=>({}));
  return { assay:a, disso:d };
}

async function ensureP8Tokens(docId) {
  // Ensure section 3.2.P.8 exists
  let secs = await j(`${BASE_URL}/api/authoring/docs/${docId}/sections`);
  const sections = secs.sections || secs || [];
  let sec = sections.find(s => s.code === SECTION_P8);
  if (!sec) {
    const response = await j(`${BASE_URL}/api/authoring/sections`, {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        doc_id: docId,
        code: SECTION_P8,
        title: "Stability",
        order_index: 800,
        content: JSON.stringify({ type:"doc", content:[
          { type:"heading", attrs:{ level:2 }, content:[{ type:"text", text:"3.2.P.8 — Stability"}] },
          { type:"paragraph", content:[{ type:"text", text:"Seeded P.8 section"}] }
        ]})
      })
    });
    sec = response.section || response;
  }
  // Insert P8 tokens
  const sectionId = sec.section_id || sec.id;
  await j(`${BASE_URL}/api/authoring/sections/${sectionId}/insert-token`, {
    method:"POST", headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ key: TOKEN_P8 })
  }).catch(()=>{});
  await j(`${BASE_URL}/api/authoring/sections/${sectionId}/insert-token`, {
    method:"POST", headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ key: TOKEN_P8C })
  }).catch(()=>{});
}

(async function main(){
  logger.info(`Seeding Stability @ ${BASE_URL}`);
  try {
    // 1) Ensure study
    const s = await ensureStudy();
    const studyId = s.study_id || s.id;
    logger.info(`- Study: ${studyId} (${s.name || STUDY_NAME})`);

    // 2) Conditions, timepoints, tests
    await ensureCondition(studyId, LT);
    await ensureCondition(studyId, ACC);
    let detail = await ensureTimepoints(studyId, TP_MONTHS);
    detail = await ensureTests(studyId);
    logger.info(`- Configured: ${detail.conditions?.length || 0} conditions, ${detail.timepoints?.length || 0} timepoints, ${detail.tests?.length || 0} tests`);

    // 3) Seed results
    await seedResults(studyId, detail);
    logger.info(`- Seeded stability results`);

    // 4) OOT rules and surveillance
    await ensureOotRules(studyId);
    const surv = await runSurveillance(studyId);
    logger.info(`- OOT surveillance: Assay=${surv.assay.findings?.length || 0} findings, Dissolution=${surv.disso.findings?.length || 0} findings`);

    // 5) Optionally insert P.8 tokens into authoring doc
    if (DOC_ID) {
      await ensureP8Tokens(DOC_ID);
      logger.info(`- Inserted P.8 tokens into doc: ${DOC_ID}`);
    }

    logger.info(`✅ Stability seeding complete!`);
    logger.info(`\nEnvironment variables for UAT testing:`);
    logger.info(`BASE_URL="${BASE_URL}" STUDY_CODE="${STUDY_CODE}" PRODUCT_CODE="${PRODUCT_CODE}" ${DOC_ID ? `DOC_ID="${DOC_ID}"` : ''}`);
    
  } catch (error) {
    logger.error(`❌ Seeder failed:`, error.message);
    process.exit(1);
  }
})();