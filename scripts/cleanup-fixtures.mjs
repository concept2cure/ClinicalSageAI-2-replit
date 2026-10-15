#!/usr/bin/env node
/**
 * Cleanup Fixtures (UAT reset)
 *
 * Deletes an Authoring document and prunes a Stability study (results ->
 * timepoints -> conditions -> tests), then attempts to archive the study if
 * hard delete is unavailable.
 *
 * The Authoring delete is the governed one (DP-33, 2026-10-01): the signed-in
 * session of an owner, admin or manager of the document's organisation, and a
 * stated reason, recorded with the actor on the audit chain. The static
 * x-admin-token / ADMIN_TOKEN door it used is removed. AUTH_TOKEN is that
 * person's access token; REASON is required and is recorded as given.
 *
 * Usage examples:
 *   BASE_URL="http://localhost:5000" AUTH_TOKEN="<access token>" REASON="UAT run 12 fixture removed" DOC_ID="<uuid>" node scripts/cleanup-fixtures.mjs
 *   BASE_URL="http://localhost:5000" STUDY_ID="<uuid>" node scripts/cleanup-fixtures.mjs
 */

const BASE_URL    = process.env.BASE_URL || "http://localhost:5000";
const DOC_ID      = process.env.DOC_ID || null;
const STUDY_ID    = process.env.STUDY_ID || null;
const AUTH_TOKEN  = process.env.AUTH_TOKEN || null;
const REASON      = process.env.REASON || null;
// This script never defined the logger it calls; the console is what it meant.
const logger = console;

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
  if (!AUTH_TOKEN) throw new Error("AUTH_TOKEN (an owner, admin or manager's access token) is required to delete an Authoring document");
  if (!REASON) throw new Error("REASON is required to delete an Authoring document; it is recorded on the audit chain as given");
  logger.info(`- Deleting Authoring doc ${DOC_ID} (governed delete: session role + reason, audited)…`);
  const res = await fetch(`${BASE_URL}/api/authoring/docs/${DOC_ID}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${AUTH_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ reason: REASON })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Authoring delete failed: ${res.status} ${text}`);
  }
  const js = await res.json();
  logger.info(`  Deleted:`, js.deleted);
}

async function pruneStabilityStudy() {
  if (!STUDY_ID) return;
  logger.info(`- Pruning Stability study ${STUDY_ID}…`);
  // 1) Fetch detail
  const detail = await j(`${BASE_URL}/api/stability/studies/${STUDY_ID}`).catch(()=>null);
  if (!detail) { logger.info("  Study not found; skip."); return; }

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
  logger.info(`  Deleted results: ${delResults}`);

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
  logger.info(`  Deleted timepoints: ${delTp}`);

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
  logger.info(`  Deleted conditions: ${delCond}`);

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
  logger.info(`  Deleted tests: ${delTests}`);

  // 6) Archive the study if update endpoint exists
  try {
    const upd = await j(`${BASE_URL}/api/stability/studies/${STUDY_ID}`, {
      method: "PATCH",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ status: "ARCHIVED" })
    });
    logger.info(`  Archived study status: ${upd?.status || "unknown"}`);
  } catch {
    logger.info("  Archive not supported; child artifacts pruned.");
  }
}

(async function main(){
  logger.info(`Cleanup @ ${BASE_URL}`);
  if (!DOC_ID && !STUDY_ID) {
    logger.info("Nothing to do (provide DOC_ID and/or STUDY_ID).");
    return;
  }
  if (DOC_ID) {
    try { await deleteAuthoringDoc(); } 
    catch (e) { logger.error("Authoring delete error:", e.message); process.exitCode = 1; }
  }
  if (STUDY_ID) {
    try { await pruneStabilityStudy(); } 
    catch (e) { logger.error("Stability prune error:", e.message); process.exitCode = 1; }
  }
  logger.info("Done.");
})();