#!/usr/bin/env node
/**
 * Cleanup Fixtures (UAT reset)
 *
 * Deletes a UAT-scoped Authoring document (product_code must start with UAT-)
 * and prunes a Stability study (results -> timepoints -> conditions -> tests),
 * then attempts to archive the study if hard delete is unavailable.
 *
 * Usage examples:
 *   BASE_URL="http://localhost:5000" ADMIN_TOKEN="secret" DOC_ID="<uuid>" node scripts/cleanup-fixtures.mjs
 *   BASE_URL="http://localhost:5000" STUDY_ID="<uuid>" node scripts/cleanup-fixtures.mjs
 *   BASE_URL="http://localhost:5000" ADMIN_TOKEN="secret" DOC_ID="<uuid>" STUDY_ID="<uuid>" node scripts/cleanup-fixtures.mjs
 */

const BASE_URL    = process.env.BASE_URL || "http://localhost:5000";
const DOC_ID      = process.env.DOC_ID || null;
const STUDY_ID    = process.env.STUDY_ID || null;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || null;

async function j(url, opts = {}) {
  const r = await fetch(url, opts);
  const ct = r.headers.get("content-type") || "";
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const e = await r.json(); msg += ` ${e.error || ""}`; } catch {}
    throw new Error(`${opts.method||"GET"} ${url} → ${msg}`);
  }
  if (ct.includes("application/json")) return r.json();
  if (ct.includes("application/pdf") || ct.includes("officedocument")) return r.arrayBuffer();
  return null;
}

async function deleteAuthoringDoc() {
  if (!DOC_ID) return;
  if (!ADMIN_TOKEN) throw new Error("ADMIN_TOKEN required to delete Authoring docs");
  console.log(`- Deleting Authoring doc ${DOC_ID} (requires UAT product_code + admin token)…`);
  const res = await fetch(`${BASE_URL}/api/authoring/docs/${DOC_ID}`, {
    method: "DELETE",
    headers: { "x-admin-token": ADMIN_TOKEN }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Authoring delete failed: ${res.status} ${text}`);
  }
  const js = await res.json();
  console.log(`  Deleted:`, js.deleted);
}

async function pruneStabilityStudy() {
  if (!STUDY_ID) return;
  console.log(`- Pruning Stability study ${STUDY_ID}…`);
  // 1) Fetch detail
  const detail = await j(`${BASE_URL}/api/stability/studies/${STUDY_ID}`).catch(()=>null);
  if (!detail) { console.log("  Study not found; skip."); return; }

  // 2) Delete results (if endpoint exists)
  const results = detail.results || [];
  let delResults = 0;
  for (const r of results) {
    const id = r.result_id || r.id;
    if (!id) continue;
    try {
      await j(`${BASE_URL}/api/stability/results/${id}`, { method: "DELETE" });
      delResults++;
    } catch { /* not all builds expose delete; skip */ }
  }
  console.log(`  Deleted results: ${delResults}`);

  // 3) Delete timepoints
  const tps = detail.timepoints || [];
  let delTp = 0;
  for (const tp of tps) {
    const id = tp.tp_id || tp.id;
    if (!id) continue;
    try {
      await j(`${BASE_URL}/api/stability/timepoints/${id}`, { method: "DELETE" });
      delTp++;
    } catch { /* skip */ }
  }
  console.log(`  Deleted timepoints: ${delTp}`);

  // 4) Delete conditions
  const conds = detail.conditions || [];
  let delCond = 0;
  for (const c of conds) {
    const id = c.cond_id || c.id;
    if (!id) continue;
    try {
      await j(`${BASE_URL}/api/stability/conditions/${id}`, { method: "DELETE" });
      delCond++;
    } catch { /* skip */ }
  }
  console.log(`  Deleted conditions: ${delCond}`);

  // 5) Delete tests
  const tests = detail.tests || [];
  let delTests = 0;
  for (const t of tests) {
    const id = t.test_id || t.id;
    if (!id) continue;
    try {
      await j(`${BASE_URL}/api/stability/tests/${id}`, { method: "DELETE" });
      delTests++;
    } catch { /* skip */ }
  }
  console.log(`  Deleted tests: ${delTests}`);

  // 6) Archive the study if update endpoint exists
  try {
    const upd = await j(`${BASE_URL}/api/stability/studies/${STUDY_ID}`, {
      method: "PATCH",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ status: "ARCHIVED" })
    });
    console.log(`  Archived study status: ${upd?.status || "unknown"}`);
  } catch {
    console.log("  Archive not supported; child artifacts pruned.");
  }
}

(async function main(){
  console.log(`Cleanup @ ${BASE_URL}`);
  if (!DOC_ID && !STUDY_ID) {
    console.log("Nothing to do (provide DOC_ID and/or STUDY_ID).");
    return;
  }
  if (DOC_ID) {
    try { await deleteAuthoringDoc(); } 
    catch (e) { console.error("Authoring delete error:", e.message); process.exitCode = 1; }
  }
  if (STUDY_ID) {
    try { await pruneStabilityStudy(); } 
    catch (e) { console.error("Stability prune error:", e.message); process.exitCode = 1; }
  }
  console.log("Done.");
})();