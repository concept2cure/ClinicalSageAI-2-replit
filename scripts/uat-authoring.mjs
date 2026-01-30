#!/usr/bin/env node
/**
 * UAT – Document Authoring auto-checker
 * Prints a PASS/FAIL matrix across Authoring API capabilities.
 * 
 * Usage:
 *   BASE_URL="http://localhost:3000" DOC_ID="<uuid>" node scripts/uat-authoring.mjs
 * Optional:
 *   SECTION_CODE="3.2.P.5" TOKEN_KEY="QUALITY.SPECS.DP" LOCALE="en"
 * 
 * Notes:
 * - If list endpoints are unavailable in your build, provide DOC_ID and ensure 
 *   /api/authoring/docs/:docId/sections exists (from Steps 6–10).
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const DOC_ID   = process.env.DOC_ID || null;
const SECTION_CODE = process.env.SECTION_CODE || "3.2.P.5";
const TOKEN_KEY    = process.env.TOKEN_KEY || "QUALITY.SPECS.DP";
const LOCALE       = process.env.LOCALE || "en";

const fetchJson = async (url, opts={}) => {
  const r = await fetch(url, opts);
  const ct = r.headers.get("content-type") || "";
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); msg += ` ${j.error || ""}`; } catch {}
    throw new Error(`${url} → ${msg}`);
  }
  if (ct.includes("application/json")) return r.json();
  if (ct.includes("application/pdf") || ct.includes("officedocument")) return r.arrayBuffer();
  // HTML is a schema error for these APIs
  throw new Error(`${url} → Unexpected content-type: ${ct}`);
};

const line = () => logger.info("-".repeat(72));

const results = [];
function rec(name, ok, note="") { results.push({ name, ok, note }); }
function ok(name, note="")      { rec(name, true,  note); }
function fail(name, note="")    { rec(name, false, note); }

async function check(name, fn) {
  try { await fn(); ok(name); } catch (e) { fail(name, e.message || String(e)); }
}

async function main() {
  logger.info(`UAT: Document Authoring @ ${BASE_URL}`);
  line();

  // 0) Health – guidance/tokens endpoints should not return HTML
  await check("Tokens list endpoint responds JSON", async ()=>{
    const j = await fetchJson(`${BASE_URL}/api/authoring/tokens?section=${encodeURIComponent(SECTION_CODE)}`);
    if (!Array.isArray(j)) throw new Error("Expected JSON array");
  });

  // 1) Resolve DOC + sections
  let docId = DOC_ID;
  await check("Document is resolvable", async ()=>{
    if (!docId) throw new Error("DOC_ID env not provided; supply DOC_ID to target a document");
    const j = await fetchJson(`${BASE_URL}/api/authoring/docs/${docId}`);
    if (!j || !j.doc_id) throw new Error("Doc meta not returned");
  });

  let sections = [];
  await check("Sections list for doc", async ()=>{
    const j = await fetchJson(`${BASE_URL}/api/authoring/docs/${docId}/sections`);
    if (!Array.isArray(j) || !j.length) throw new Error("No sections returned");
    sections = j;
  });

  let section = sections.find(s => s.code === SECTION_CODE) || sections[0];
  const sectionId = section?.section_id;
  if (!sectionId) fail("Resolve sectionId", "No section found"); else ok("Resolve sectionId");

  // 2) Locale patch
  await check("Set locale on doc", async ()=>{
    const j = await fetchJson(`${BASE_URL}/api/authoring/docs/${docId}`, {
      method: "PATCH",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ locale: LOCALE })
    });
    if (j.locale !== LOCALE) throw new Error(`Locale not set to ${LOCALE}`);
  });

  // 3) Insert token → citation snapshot
  let citeId = null;
  await check(`Insert token ${TOKEN_KEY}`, async ()=>{
    const j = await fetchJson(`${BASE_URL}/api/authoring/sections/${sectionId}/insert-token`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ key: TOKEN_KEY })
    });
    if (!j.cite_id || !j.sha256) throw new Error("Missing cite_id/sha256");
    citeId = j.cite_id;
  });

  // 4) List tokens for section
  await check("List tokens in section", async ()=>{
    const j = await fetchJson(`${BASE_URL}/api/authoring/sections/${sectionId}/tokens`);
    if (!Array.isArray(j) || !j.find(x => x.cite_id === citeId)) throw new Error("Inserted citation not listed");
  });

  // 5) Validate section
  await check("Run validation", async ()=>{
    const j = await fetchJson(`${BASE_URL}/api/authoring/sections/${sectionId}/validate`, { method: "POST" });
    if (!j || typeof j !== "object") throw new Error("Expected JSON object");
    // findings may be empty; that's OK
  });

  // 6) Export DOCX & PDF
  await check("Export DOCX (file stream)", async ()=>{
    const ab = await fetchJson(`${BASE_URL}/api/authoring/docs/${docId}/export?fmt=docx`, { method: "POST" });
    if (!(ab instanceof ArrayBuffer) || ab.byteLength < 2000) throw new Error("DOCX too small");
  });
  await check("Export PDF (file stream)", async ()=>{
    const ab = await fetchJson(`${BASE_URL}/api/authoring/docs/${docId}/export?fmt=pdf`, { method: "POST" });
    if (!(ab instanceof ArrayBuffer) || ab.byteLength < 1000) throw new Error("PDF too small");
  });

  // 7) Submit → Sign (dual roles)
  await check("Submit doc", async ()=>{
    const j = await fetchJson(`${BASE_URL}/api/authoring/docs/${docId}/submit`, { method: "POST" });
    if (!j || (j.status !== "IN_REVIEW" && j.status !== "APPROVED")) throw new Error("Unexpected status after submit");
  });

  await check("Sign as QA (Part 11-lite)", async ()=>{
    const j = await fetchJson(`${BASE_URL}/api/authoring/docs/${docId}/sign`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ actor:"qa@uat", role:"QA", reason:"reviewed" })
    });
    if (!j.ok) throw new Error("QA sign failed");
  });

  await check("Sign as RA_CMC (Part 11-lite)", async ()=>{
    const j = await fetchJson(`${BASE_URL}/api/authoring/docs/${docId}/sign`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ actor:"ra@uat", role:"RA_CMC", reason:"approved" })
    });
    if (!j.ok) throw new Error("RA_CMC sign failed");
  });

  // 8) Diff since Export & Signoffs listing
  await check("Diff since export JSON", async ()=>{
    const j = await fetchJson(`${BASE_URL}/api/authoring/docs/${docId}/diff-since-export`);
    if (!j || typeof j.count !== "number") throw new Error("Missing count");
  });

  await check("Signoffs list JSON", async ()=>{
    const j = await fetchJson(`${BASE_URL}/api/authoring/docs/${docId}/signoffs`);
    if (!Array.isArray(j) || !j.length) throw new Error("No signoffs recorded");
  });

  // 9) Refresh‑all (doc)
  await check("Refresh-all tokens in doc", async ()=>{
    const j = await fetchJson(`${BASE_URL}/api/authoring/docs/${docId}/refresh-all`, { method: "POST" });
    if (!j.ok) throw new Error("Refresh-all failed");
  });

  // Print matrix
  line();
  const pad = (s,w) => (s.length >= w ? s.slice(0,w) : s + " ".repeat(w-s.length));
  logger.info(`${pad("CHECK", 40)}  RESULT  NOTE`);
  line();
  for (const r of results) {
    logger.info(`${pad(r.name, 40)}  ${r.ok ? "PASS  " : "FAIL  "}  ${r.note || ""}`);
  }
  line();

  // Exit code for CI
  const failed = results.filter(r => !r.ok).length;
  if (failed) {
    logger.error(`❌ ${failed} check(s) failed`);
    process.exit(1);
  } else {
    logger.info("✅ All checks passed");
  }
}

main().catch(e => { logger.error(e); process.exit(1); });