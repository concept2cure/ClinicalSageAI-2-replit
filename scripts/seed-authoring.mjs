#!/usr/bin/env node
/**
 * Seed Authoring Fixtures
 *
 * Creates a new Authoring document, applies M3 templates (if present),
 * ensures sections 3.2.P.5 and 3.2.P.8 exist, inserts core tokens,
 * exports DOCX/PDF, submits, and dual-signs (QA + RA_CMC).
 *
 * Usage:
 *   BASE_URL="http://localhost:3000" \
 *   PRODUCT_CODE="UAT-PROD" \
 *   TITLE="UAT Module 3" \
 *   LOCALE="en" \
 *   node scripts/seed-authoring.mjs
 *
 * Output:
 *   Prints DOC_ID, SECTION_CODE, TOKEN_KEY and one-liner to run UAT.
 */

const BASE_URL    = process.env.BASE_URL || "http://localhost:5000";
const PRODUCT_CODE= process.env.PRODUCT_CODE || "UAT-PROD";
const TITLE       = process.env.TITLE || "UAT Module 3";
const LOCALE      = process.env.LOCALE || "en";

const SECTION_P5  = "3.2.P.5";
const SECTION_P8  = "3.2.P.8";
const TOKEN_P5    = "QUALITY.SPECS.DP";
const TOKEN_P8    = "P8.TABLES";

async function j(url, opts={}) {
  const r = await fetch(url, opts);
  const ct = r.headers.get("content-type") || "";
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const e = await r.json(); msg += ` ${e.error||""}`; } catch {}
    throw new Error(`${opts.method||"GET"} ${url} → ${msg}`);
  }
  if (ct.includes("application/json")) return r.json();
  if (ct.includes("application/pdf") || ct.includes("officedocument")) return r.arrayBuffer();
  return null; // some endpoints stream files; we don't need body
}

async function createDoc() {
  const body = { product_code: PRODUCT_CODE, title: TITLE, locale: LOCALE };
  const response = await j(`${BASE_URL}/api/authoring/docs`, {
    method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body)
  });
  return response.document; // Extract document from response
}

async function applyTemplates(docId) {
  const list = await j(`${BASE_URL}/api/authoring/templates?locale=${encodeURIComponent(LOCALE)}`).catch(()=>[]);
  const keys = (list||[]).map(t=>t.templateKey);
  const wants = [
    "m3/p-5/specs-dp",
    "m3/p-8/stability"
  ].filter(k => keys.includes(k));

  let upserts = 0;
  for (const key of wants) {
    const x = await j(`${BASE_URL}/api/authoring/docs/${docId}/apply-template`, {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ templateKey:key, mode:"merge" })
    });
    upserts += x?.upserts || 0;
  }
  return upserts;
}

async function ensureSection(docId, code, title) {
  const response = await j(`${BASE_URL}/api/authoring/docs/${docId}/sections`);
  const secs = response.sections || []; // Extract sections array from response
  let s = secs.find(x => x.code === code);
  if (s) return s;

  // create minimal section if template missing
  const content = {
    type:"doc",
    content: [
      { type:"heading", attrs:{ level:2 }, content:[{ type:"text", text:`${code} — ${title}` }] },
      { type:"paragraph", content:[{ type:"text", text:"(Seeded section)"}] }
    ]
  };
  const createResponse = await j(`${BASE_URL}/api/authoring/sections`, {
    method:"POST", headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ doc_id: docId, code, title, order_index: 500, content: JSON.stringify(content) })
  });
  return createResponse.section; // Extract section from response
}

async function insertToken(sectionId, tokenKey) {
  const ins = await j(`${BASE_URL}/api/authoring/sections/${sectionId}/insert-token`, {
    method:"POST", headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ key: tokenKey })
  });
  return ins?.cite_id;
}

async function exportDoc(docId) {
  // DOCX
  await j(`${BASE_URL}/api/authoring/docs/${docId}/export?fmt=docx`, { method:"POST" });
  // PDF
  await j(`${BASE_URL}/api/authoring/docs/${docId}/export?fmt=pdf`, { method:"POST" });
}

async function submitAndSign(docId) {
  await j(`${BASE_URL}/api/authoring/docs/${docId}/submit`, { method:"POST" });
  await j(`${BASE_URL}/api/authoring/docs/${docId}/sign`, {
    method:"POST", headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ actor:"qa@seed", role:"QA", reason:"reviewed" })
  });
  await j(`${BASE_URL}/api/authoring/docs/${docId}/sign`, {
    method:"POST", headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ actor:"ra@seed", role:"RA_CMC", reason:"approved" })
  });
}

(async function main(){
  logger.info(`Seeding Authoring @ ${BASE_URL}`);
  // 1) Create doc
  const doc = await createDoc();
  const DOC_ID = doc.id; // Use correct field name
  logger.info(`- Created doc: ${DOC_ID} (${doc.title}) locale=${doc.locale}`);

  // 2) Apply templates (if present)
  const upserts = await applyTemplates(DOC_ID).catch(()=>0);
  logger.info(`- Applied templates: ${upserts} section(s) updated via templates`);

  // 3) Ensure P.5 and P.8 exist
  const sP5 = await ensureSection(DOC_ID, SECTION_P5, "Control of Drug Product");
  const sP8 = await ensureSection(DOC_ID, SECTION_P8, "Stability");
  logger.info(`- Sections ready: ${sP5.id} (P.5), ${sP8.id} (P.8)`);

  // 4) Insert tokens
  const c1 = await insertToken(sP5.id, TOKEN_P5).catch(e=>{ logger.warn("Insert P.5 token failed:", e.message); return null; });
  const c2 = await insertToken(sP8.id, TOKEN_P8).catch(e=>{ logger.warn("Insert P.8 token failed:", e.message); return null; });
  logger.info(`- Inserted tokens: P.5=${c1? "OK":"skip"} P.8=${c2? "OK":"skip"}`);

  // 5) Export DOCX/PDF
  await exportDoc(DOC_ID).catch(e=>logger.warn("Export warning:", e.message));
  logger.info(`- Exported DOCX/PDF`);

  // 6) Submit & dual-sign
  await submitAndSign(DOC_ID).catch(e=>logger.warn("Sign warning:", e.message));
  logger.info(`- Submitted and signed (QA + RA_CMC)`);

  // 7) Print env for UAT and CI
  logger.info("\nENV for UAT / CI:");
  logger.info(`BASE_URL="${BASE_URL}" DOC_ID="${DOC_ID}" SECTION_CODE="${SECTION_P5}" TOKEN_KEY="${TOKEN_P5}"`);
  logger.info(`\nRun UAT now:\n  BASE_URL="${BASE_URL}" DOC_ID="${DOC_ID}" npm run uat:authoring`);
})().catch(err => {
  logger.error("Seeder failed:", err.message);
  process.exit(1);
});