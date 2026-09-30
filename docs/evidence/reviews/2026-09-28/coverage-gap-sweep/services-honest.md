# GS-H services-honest audit -- Projects/Vault/QMS server services

Scope: server/services/project-rollup-service.ts, vault-ingest.service.ts, vault-filing.service.ts, server/routes/c2c/project-intake.ts, the QMS service layer, and the week's Vault/QMS commits (e24a56dff, ae7b52486, P1-28/P1-29 e-signature commits). Read-only; no files edited; git used read-only; reference Postgres used only inside BEGIN...ROLLBACK, no data left.

## Findings

### GS-H-1 (high) -- Project rollup silently drops grandchildren, reports partial totals as complete
server/services/project-rollup-service.ts:97-109 (getTree pathPrefix bug, already documented but not fixed in the same file's own comment at lines 396-400). Reproduced against the reference DB: a 3-level chain (root->child->grandchild) loses the grandchild from the descendants query entirely. rollup.totalTasks, totalBudget, completedTasks, moduleCount, maxDepth on GET /api/project-hierarchy/:projectId/rollup are computed only over the root + direct children whenever the hierarchy exceeds two levels, with no error or truncation flag. Route is live; no current client surface consumes it, but any consumer would read a materially wrong 'total across all descendants.' Fix: correct the prefix to root.path; add a 3+-level regression test asserting grandchild inclusion.

### GS-H-2 (high) -- QMS compliance summary's healthy:true doesn't distinguish never-assessed from assessed-and-clear
server/services/qms/qms.service.ts:251-295. healthy: blockers.length === 0 (line 293) never checks whether internal audits or supplier qualifications have ever been recorded at all, only whether known thresholds were crossed. Reproduced against the reference DB: an org with 1 effective document, 1 management review, and zero rows ever in qms_internal_audits and qms_suppliers returns blockers: [], healthy: true from the live GET /api/qms/summary route. This is the NDA-cockpit-class defect the working agreement names, on a QMS surface whose job is compliance risk. The newer /api/mdx/qms/readiness endpoint explicitly avoids this pattern -- the lesson wasn't carried back here. Fix: add zero-assessment blockers or an assessed flag per category.

## Areas read and found honest (no findings)
- server/services/vault/vault-ingest.service.ts (all 745 lines): fail-closed on ownership, upload safety, storage write, transaction atomicity, and the discard-unrecorded-bytes wrapper; extraction/chunking failures are recorded as failures, never silently swallowed into a false success. Verified chunkDocumentForIngest (document-chunking.service.ts:325-346) fully catches its own errors so a post-commit indexing failure can never flip a successful ingest into a false 'could not be recorded' response.
- server/services/vault/vault-filing.service.ts: classifier is honestly fail-closed (needsReview:true, no guessed folder). Minor, not reported as a finding (too low-confidence/low-impact): resolveVaultView's catch-all degrade to the 'service' view on any DB error (not just the documented missing-table fresh-env case) is broader than its comment claims, but the classifier still fails closed to 'unfiled' on a mismatch so no false claim reaches a user.
- server/services/vault/vault-metadata-edit.service.ts, vault-reupload.ts, vault-write-authority.ts: careful before/after auditing, write-once semantics, fail-closed role checks -- no honesty defects found.
- server/routes/c2c/project-intake.ts: pure domain helpers, propagates errors (no swallowing), no fabricated identifiers.
- server/services/qms/governed-qms-write.ts: exemplary -- distinguishes write failure / ledger failure / COMMIT-outcome-unknown with different, honest messages (OUTCOME_UNKNOWN rather than claiming success or failure when COMMIT itself fails).
- client/src/concept2cure/quality/qmsApproval.ts and the e-signature approve/retire routes in server/routes/mdx-qms.ts: traced the full status-code path through apiRequest (client/src/lib/queryClient.ts:398-407, throws ApiRequestError with the real server message for every non-2xx status except 401) and confirmed the client's manual 401 branch also surfaces the real server message via serverMessage(json). Initially suspected a defect here (a generic 'reload to check' message masking a specific refusal) but verified it does NOT occur on production paths -- that generic message only fires on a genuinely malformed 200 response. No finding.
- server/services/qms/changeControl.service.ts's changeControlSummary: an honest by-status count with no invented health verdict.
- The week's Vault commits (e24a56dff, ae7b52486): VaultEditDetails.tsx claims success only on the server's answer; the reupload/edit-details split correctly prevents a retry from silently overwriting recorded metadata, and reports `differs` rather than applying unrequested changes.

See the covered / not_covered fields for the itemized list of what was read line-by-line versus touched only at call sites or via commit diffs, and the ci gates not run this pass.

---

**Covered.** Read line-by-line: server/services/project-rollup-service.ts (all 507 lines) plus its route server/routes/project-hierarchy.ts; server/services/vault/vault-ingest.service.ts (all 745 lines) and its helpers vault-ingest-discard.ts (referenced), vault-reupload.ts, vault-metadata-edit.service.ts, vault-write-authority.ts; server/services/vault/vault-filing.service.ts (all 386 lines); server/routes/c2c/project-intake.ts (all 173 lines); the QMS service layer: server/services/qms/qms.service.ts (all 296 lines), governed-qms-write.ts (all 173 lines), changeControl.service.ts's changeControlSummary; server/routes/qms.ts (summary route) and the readiness/change-control sections of server/routes/mdx-qms.ts (lines ~180-340, ~1250-1340, ~530-745). Read the week's Vault/QMS commits in full: git show e24a56dff (VaultEditDetails.tsx, useVaultUpload.ts, vault-metadata-edit path) and git show ae7b52486 (Vault download/history audit chain); read the QMS e-signature commits' current-HEAD files client/src/concept2cure/quality/qmsApproval.ts, SopRegister.tsx (approval wiring) and EsignModal.tsx's error surfacing, and traced client/src/lib/queryClient.ts's apiRequest throw/no-throw behavior for every HTTP status to confirm how a QMS approval refusal reaches the screen. Confirmed both route-mounting tables (register-document-routes.ts, register-project-routes.ts via mountAll) so /api/qms and /api/project-hierarchy are verified live, not assumed. Reproduced the rollup defect (GS-H-1) against the reference Postgres inside BEGIN...ROLLBACK with a 3-level materialized-path fixture, and reproduced the qms healthy-flag defect (GS-H-2) against the reference Postgres inside BEGIN...ROLLBACK with a real org/document/management-review fixture and zero audits/suppliers ever recorded; both transactions were rolled back, no data left.

**Not covered.** Not read line-by-line: server/services/document-catalog.service.ts and document-chunking.service.ts internals beyond the two call sites used by vault-ingest (confirmed chunkDocumentForIngest never throws past its own catch, but did not audit recordExtractionOutcome/buildExtractionOutcome internals). server/services/qms/change-approval-signature.ts, document-approval-signature.ts and sopTemplates.ts were not read line-by-line (only their call sites and the P1-28/P1-29 commit diff stat summaries). server/routes/mdx-qms.ts's remaining ~1200 lines outside the readiness/change-control/approve/retire sections (labeling analytics, search, rest of document CRUD) were not read. ChangeControl.tsx and ChangeFlow.tsx client rendering were not read beyond confirming they call postQmsApproval. No browser/live-server run; all claims are from static reading plus isolated SQL reproduction in the reference Postgres. Did not run npm run ci:internals-in-copy / check:microcopy / the hostile-payload probe against these specific files (time went to line-by-line reading and DB reproduction instead).

## Independent verification

Each finding went to three agents, each told to refute it through one lens: reachability, reproduction or intent. A finding is confirmed when two of the three could not. Low findings had one reproduction verifier.

### GS-H-1 — **confirmed** (2 of 3)

- **reach** — not real: Refuted on reachability, and the general claim is also wrong. Read at HEAD 494b4fc14; the task named 232ecae9c, so HEAD has moved since.

1) The failure only shows up with data in the format recomputePaths writes. The finding's repro rows ('1', '1/2', '1/2/3') use recomputePaths' format: root = own id, child = parentPath/id. No user-reachable creator writes that format.
   - Top-level projects have path NULL. See server/services/c2c/program-project-anchor.ts:229-232, which leaves path NULL deliberately. projects-management.ts never sets path.
   - The create-child route (server/routes/project-hierarchy.ts:227, :290) writes `${parent.path}/${parentId}` then `/${newId}`, so the parent id appears twice. The rules-engine creator (server/services/rules-engine/actions/index.ts:585) does the same.
   - That is exactly the convention getTree's prefix `${root.path}/${root.id}` expects (project-rollup-service.ts:100).

2) Checked against the reference Postgres inside BEGIN/ROLLBACK, using a temp table only.
   - Create-route format, 4 levels: 1:NULL, 2:'1/2', 3:'1/2/2/3', 4:'1/2/2/3/3/4'. The getTree descendant predicate returns 2,3,4 for root 1 and 3,4 for node 2. Grandchildren and great-grandchildren are all included.
   - Only the recomputePaths-format rows reproduce the drop (returns only 2).

3) recomputePaths is called from one place only: PATCH /api/project-hierarchy/:projectId/move (project-hierarchy.ts:~345/418). A grep of client/src for 'project-hierarchy' finds nothing. No launch-catalog surface (v2 or quality) calls the move, tree or rollup endpoints. The finding itself concedes that no client reads /rollup. The router is mounted (register-project-routes.ts:41), but reaching the bad state takes a hand-crafted API PATCH /move followed by a hand-crafted GET /tree or /rollup on the moved node. No launch-catalog user can do that.

4) Nothing reads the persisted metadata.rollup that getTree writes. Grepping server and client for metadata.rollup / 'rollup' outside the service finds no consumer, so a wrong value does not spread to any surface.

5) The proposed fix would itself cause the failure it describes. Switching the prefix to root.path would match root.path='1/2' against '1/2/%'. That still works for create-format rows, but for a NULL-path root the predicate becomes `LIKE NULL || '/%'`, which is NULL, so every descendant below direct children is dropped. That is the common case for anchors.

The real latent inconsistency is a different defect: recomputePaths (service:403-405) and its own comment describe a single-count format that does not match the create route's double-count format. It sits on an unreachable move route. It is not new here: the review's honest-state.md:48 lists project-rollup-service.ts as not read, and no open finding records it.

Covered: getTree, recomputePaths, the create-child route, the rules-engine child creator, the anchor root creator, the route mount, a client grep for callers, and consumers of persisted rollup. The DB repro used both path formats. Not covered: the body of validateMove and computeRelativeDepth, and whether any seed or migration writes projects.path directly. A migrations grep for path triggers found none.

- **repro** — real: The defect is real, but it only appears after a move. The auditor's premise needs one correction: the two path formats live side by side in the code at head.

The file is unchanged between 232ecae9c and HEAD 59b0d8f9a (empty git diff).

**Two writers, two formats**
- POST /:id/children (server/routes/project-hierarchy.ts:227, 290-291) and the rules engine (server/services/rules-engine/actions/index.ts:585, 611) write `parentPath/parentId/newId`. For example: R has path NULL, C is '1/2', G is '1/2/2/3'.
- getTree's prefix `${root.path}/${root.id}` (server/services/project-rollup-service.ts:100) matches that format. A tree built only through POST children rolls up correctly.
- PATCH /:id/move (project-hierarchy.ts:381-383, 407-418) together with recomputePaths (project-rollup-service.ts:421-445) writes `parentPath/id`, and a root's path is its own id. After any move, getTree on any node whose path is non-null keeps its direct children (matched only through `parent_project_id = $3`). Everything at depth 2 or more below that node is dropped.

**Reproduction** (reference c2c_full, one BEGIN…ROLLBACK, running the route and recomputePaths SQL verbatim, org 2 / workspace 1; script at scratchpad/repro.sql):
1. Built R → C → G → GG through the create-child SQL.
2. Before the move, getTree(C) returned descendants {G, GG}. Correct.
3. Ran PATCH move C to root (newParentId null) and then recomputePaths. Paths became C='2', G='2/3', GG='2/3/4'.
4. getTree(C) now builds prefix '2/2', and the descendants query returned only G. GG was dropped silently.
5. With the prefix set to root.path ('2'), the query returned {G, GG}.

**Why the totals are wrong**
- computeRollupFromCache (lines 228-307) sums totalTasks, completedTasks, budget and maxDepth only over node.children. So GET /:id/rollup (line 490) and GET /:id/tree (line 115) return partial totals with no truncation signal.
- persistRollups (lines 329-358) then writes that partial rollup into projects.metadata.rollup for every node it reached. The wrong figure is stored, not only returned.
- The same failure happens after moving C under a non-root parent P. getTree(P) uses prefix 'R/P/P' and misses C's children, whose paths are now 'R/P/C/x'.

**Severity**
The auditor rated this high; I would rate it medium. `grep project-hierarchy client/src` finds no client caller. The router is mounted (server/bootstrap/register-project-routes.ts:41), so any API caller can hit it, and the rollup endpoint writes the wrong totals into project metadata.

**Separate thing seen during the reproduction, not investigated further**
The move does not update descendants' depth. G kept depth 2 after C became a root at depth 0.

**Coverage**
- Traced: getTree, computeRollupFromCache, persistRollups, recomputePaths, validateMove, the create-child/move/rollup/tree routes, and the rules-engine child create.
- Not covered: other writers of projects.path outside server/ (only the migration schema was grepped), and a live HTTP run.

- **intent** — real: This is not a deliberate design choice. The repository's own comment describes it as a bug. In /home/user/ClinicalSageAI-2-replit/server/services/project-rollup-service.ts:396-400, inside recomputePaths, the comment says: "Note getTree builds its prefix as `${root.path}/${root.id}`, which double-counts the root's own id under this format and already misses grandchildren — a pre-existing bug this change neither causes nor fixes; validateMove uses the format correctly." So the author found the defect, called it a bug, and left it unfixed. Nothing records a decision to keep it.

Line 100 still reads `const pathPrefix = root.path ? `${root.path}/${root.id}` : `${root.id}`;`. recomputePaths sets a root's path to its own id and every other path to `<parentPath>/<id>`. For root 1 the prefix is therefore '1/1'.

The descendants query at lines 102-109 is `path LIKE $2 || '/%' OR path = $2 OR parent_project_id = $3`. The child '1/2' matches only through the parent_project_id fallback. The grandchild '1/2/3' does not match at all. I checked the predicate against the reference Postgres inside BEGIN/ROLLBACK, using inline VALUES and no table writes. With rows (2,'1/2',parent 1) and (3,'1/2/3',parent 2) it returned only id 2.

The same defect applies to a non-root subtree: root 2 with path '1/2' gets prefix '1/2/2' and also misses its grandchildren.

Both live routes, GET /api/project-hierarchy/:projectId/tree (server/routes/project-hierarchy.ts:105-122) and GET /:projectId/rollup (lines 481-500), call getTree. They are mounted at /api/project-hierarchy in server/bootstrap/register-project-routes.ts:41-42. So every rollup total covers only the root and its direct children, and nothing in the response says it is incomplete. That breaks CLAUDE.md's "fail closed, never fabricate" rule: a partial sum is presented as the subtree total.

git log shows the file's only commit is 4876e2829. The review logs for 2026-09-24/26/28 do not record this as open. honest-state.md:48 for 2026-09-28 lists project-rollup-service.ts as not read line by line.

Scope checked: getTree, recomputePaths, the /tree and /rollup routes, the route mount, and the prior review logs. Not checked: computeRelativeDepth, which also uses the path prefix, and whether any client calls these routes (a grep of client/src found no hits).

### GS-H-2 — **confirmed** (2 of 3)

- **reach** — not real: I checked this at HEAD 59b0d8f9a, not at the 232ecae9c the task names. The code itself reads as the auditor describes it. At server/services/qms/qms.service.ts:279-294, qmsComplianceSummary sets healthy to blockers.length === 0. No blocker fires when qms_internal_audits or qms_suppliers has zero rows. The route is also mounted: server/routes/qms.ts:222-225 is behind /api/qms (server/bootstrap/register-document-routes.ts:271). The finding fails the reachability lens anyway.

(1) Nothing in the launch catalog calls this endpoint. A grep of client/src (which includes v2/ and quality/) finds no reference to '/api/qms' outside tests. The only QMS summary the client calls is '/api/mdx/qms/changes/summary' (quality/changeHooks.ts:114). The server has no caller either: qmsComplianceSummary appears only at its definition and in the route handler. It is not used by AnaToolExecutor, AnA tools or MCP. A healthy:true value from this endpoint therefore never appears on any Projects, Vault, Authoring, Submission Center, Submission Readiness or QMS controlled-documents surface. The repo's own orphan report lists this endpoint as orphaned: docs/reports/orphan-endpoints-latest.json:9584 has GET /api/qms/summary, qms.ts line 222.

(2) The router is already on record as a known duplicate with no client. DP-34 in docs/evidence/reviews/2026-09-24/lenses.md calls /api/qms/* "a second QMS write API" and says "No client calls this router." It also notes the router is already known as a duplicate (docs/work-orders/README.md item 4). docs/evidence/reviews/2026-09-28/honest-state.md:20 refers the qms.ts duplicate-router issues back to DP-34. The canonical QMS readiness surface is /api/mdx/qms/readiness, and the auditor concedes it already handles this case with per-category available:false. The only way to reach the problem is a hand-made authenticated GET to an orphaned duplicate router that is already slated to be migrated and deleted. The right remedy there is DP-34 or the duplicate's retirement, not a new finding.

(3) The claim about meaning is also weak. An organisation with no suppliers is a valid state, so a missing supplier row is not clearly the same as "not assessed".

Coverage: I did this read-only. I read qms.service.ts:230-295 and qms.ts:210-225. I grepped client/src, server, shared and scripts for callers, checked AnaToolExecutor for /api/qms and /qms/ references, and read the orphan-endpoint report and the DP-34 and honest-state review records. I did not run the Postgres reproduction; the auditor's arithmetic follows from the code and was not in dispute.

- **repro** — real: Reproduced at head 59b0d8f9a. The prompt said 232ecae9c, but the working tree is at 59b0d8f9a.

Code: server/services/qms/qms.service.ts:251-295. The suppliers query (:260-265) and the audits query (:266-269) never count rows. The blocker list (:278-284) checks only reapproval_overdue > 0 (:281) and major_findings_total > 0 (:282). `healthy` is `blockers.length === 0` (:293). The same function already treats an empty category as a blocker for documents (`effective === 0`, :279) and management review (`!r.last_review`, :283), but not for suppliers or audits. That inconsistency confirms the defect.

Route: GET /summary at server/routes/qms.ts:222-225, behind authenticateToken only. It is mounted at /api/qms by server/bootstrap/register-document-routes.ts:271.

DB reproduction on the local reference Postgres (c2c_full), inside BEGIN ... ROLLBACK, leaving no data:
- Inserted org 990001 with one effective qms_documents row and one qms_management_reviews row dated CURRENT_DATE.
- Ran the function's own five queries verbatim, plus COUNT(*) totals.
- Results: effective=1, overdue_review=0; qms_suppliers total=0, reapproval_overdue=0; qms_internal_audits total=0, open=0, major_findings_total=0; last_review=2026-09-28; open_dispositions=0.
- Every condition at :279-284 is false, so blockers=[] and the endpoint returns healthy:true for an org that has never recorded an audit or a supplier.

The JS function itself was not executed, because it uses the shared pool and cannot be wrapped in ROLLBACK. Its blocker logic is six plain comparisons over these exact values.

Not previously filed: DP-34 (2026-09-24/lenses.md:134) covers this router's missing role gate and audit rows, not the summary verdict. The 2026-09-28 honest-state.md:48 lists qms.service.ts as not read.

Severity is lower than claimed. No client calls /api/qms/summary: a grep of client/src finds no caller, docs/reports/orphan-endpoints-latest.json:9584 lists it as orphaned/needs-review, and DP-34 records "No client calls this router". No AnA tool calls qmsComplianceSummary either. Only a direct API caller sees the wrong verdict; no launch-catalog UI shows it.

- **intent** — real: I could not refute this under the INTENT lens.

1. **The function's own logic says "no records" should be a blocker.** At server/services/qms/qms.service.ts:279 it pushes 'No effective controlled documents.' when effective===0. At :283 it pushes 'No management review on record (ISO 13485 §5.6).' when last_review is null. So the author already counts "nothing on record" as a blocker for two categories, but not for internal audits (:282 only checks major_findings_total>0) or suppliers (:281 only checks reapproval_overdue>0). That looks like an omission against the function's own pattern, not a deliberate choice.

2. **Nothing documents a deliberate choice.** There is no comment at the site defending it. The route header (server/routes/qms.ts:1-17) just lists 'Summary GET /summary'. The function arrived in a bulk commit (bb61231c5, 2026-08-23, 'feat(admin): licensing control…'), and I found no design note.

3. **A caller cannot tell "never audited" from "audited and clear".** The audits query (:265-267) returns only open (not closed/cancelled) and the sum of major_findings. It returns no total row count. So zero audits ever and 'every audit closed, no major findings' produce identical output: {open:0, major_findings_total:0}, blockers:[], healthy:true.

4. **This breaks the repository's own rules.** CLAUDE.md says 'Fail closed, never fabricate, honest empty states'. The repo's newer /api/mdx/qms/readiness (server/routes/mdx-qms.ts) was built with per-category available:false precisely to avoid a blanket verdict. ISO 13485 §8.2.4 / 21 CFR 820.22 require internal audits, so an organization with no audits is not 'healthy'.

5. **It is not a duplicate.** I grepped docs/evidence/reviews/2026-09-2{4,6,8}/ for qms/summary, qmsComplianceSummary and healthy. No QMS-related hit is recorded.

**What I did not do:** I did not re-run the reporter's Postgres reproduction. The SQL is simple enough that the outcome follows directly from reading it.

**Coverage:** qms.service.ts:251-295, the qms.ts route and its header, the route mount, client-side callers (none found), the commit that introduced the function, and prior review folders. I did not review the other /api/qms endpoints.

