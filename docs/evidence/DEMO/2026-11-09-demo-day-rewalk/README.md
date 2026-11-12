# The demo-day re-walk of 2026-11-09, and where each finding stands on 2026-11-12

Launch row D2, workstream W1, ledger package L1. Written by the CSR lane (`017CFk…`) for the founder's client demo of
2026-11-09, and finished on 2026-11-12.

- **Walked:** trunk `51c52751e`, between 18:45 and 20:30 UTC on 2026-11-09, in the running app. Nothing was changed.
- **Re-checked:** trunk `a9b5af187`, on 2026-11-12, by reading the code and its history. Only the reviewer's path
  (finding CSR-1) was walked again in the app that day.

## What already exists (RULE 3)

Three records cover the same days. This one repeats none of them; it adds what they do not hold.

| Path | What it holds | What it does not |
|---|---|---|
| `../2026-11-09-rehearsal/README.md` and `deep-walk/` | Another lane's dress rehearsal with a second signer on `da7c24ddc9`, and its deep walk: 36 confirmed findings | A database seeded as the Codespace seeds it; AnA with a key; the CSR runbook; the sign-in limit |
| `../2026-11-09-platform-tour/README.md` | The coordinator's 16 tour stops on `2b5361e4c7` | The same stops three hours and 60 commits later |
| `../2026-11-10-sales-rehearsal/README.md` | The whole platform as a buyer sees it, production posture, findings B1–B11 and E1–E44 | — |
| `../../GA-READINESS/2026-11-10/ledger.json` | 246 GA items with holders | Findings ANA-02, ANA-05, T2-F9, T2-F10, T2-F14 and CSR-1 below |
| `../../D2-CSR/2026-11-02-phase2-demo-walk/README.md` | The CSR demo runbook | Corrected by this change (below) |

## What was done

1. **The demo data was seeded as the Codespace seeds it**: `npm run demo:seed -- --pack all` through the app's API,
   with no second signer, on a migrated local database.
2. **Six areas were walked in a real browser (Chromium, 1440 wide), read-only**, each by its own agent: AnA with a
   key in, the CSR fallback, the biotech tour, the second half of the tour, CMC / Module 3 and the device tour.
   The local server held a refused Anthropic key, so a turn that reaches the provider ends "refused this
   deployment's API key". That is the sign that the gateway let it through.
3. **Each finding a client would see fail was walked again by a second agent**, with its own script.
4. **On 2026-11-12 every finding was checked against trunk** by a third set of agents: fixed (by which commit),
   partly fixed, or still there (at which line), and who holds the file.

`findings-status.json` holds all 79 findings (24 a client would see fail, 31 that look unfinished, 24 notes) with
the result of step 4. Screenshots were not kept: 94 MB, and the screens have changed.

## What this record adds

### 1. The tour's 16 stops pass on `51c52751e`

`tour-16-stops.json`: the coordinator's `tour-b.cjs`, unchanged but for its address and sign-in. 16 stops, 0 errors,
0 API responses of 400 or above, no error wording, no sideways scroll. A fresh seed of all packs took 7 minutes
30 seconds, with waits on the rate limit. C2C-201 seeded: an organisation with one client workspace does not meet
`AMBIGUOUS_CLIENT_WORKSPACE`.

### 2. A Codespace that never finished its preparation reaches "CSR study ready"

GitHub's own check of the Codespace (CI job 129338216387) was still queued at the demo, so the path was run here
with post-start's own commands on an empty database:

| Step | Result | Time |
|---|---|---|
| `npm run db:provision` | provisioned | 23 s |
| `scripts/seed-admin.mjs` for the author, the reviewer and the approver | ready | 1 s |
| The app, with `ALLOWED_ORIGINS` naming its own address | up | 15 s |
| `npm run demo:seed -- --pack all` | exit 0; 20 two-person steps "not executed" (no second signer) | 7 min |
| `walk.cjs … prepare` with `DEMO_PREPARE_UNTIL=freeze` | exit 0; six of six steps pass | 4 min 10 s |

The six steps: the project through New project; the Vault uploads; review and approval of the seven files by three
people; New document → M5 lists the CSR once; the CSR shows "Build from the study's data"; the study data is
frozen in the document. One click on the first file's approval timed out once and passed on the walk's own retry.
Not covered: installing playwright inside the Codespace image.

*Since then:* post-start gives the seed its second signer (`11aa49118`, `ff49ebed7`), so the 20 steps are executed
in a Codespace today (findings BT-F1 and MDX-3, fixed).

### 3. A sixth sign-in signs the oldest session out, and the person is not told why (SES-1)

The first run of the tour lost stops 11 to 16: six walkers had signed in as the same account, and the tour's tab
landed on the plain sign-in page. An account keeps five sessions (`shared/auth/session-policy.ts`), and a later
sign-in supersedes the oldest. The sign-in page has a notice for this ("signedOut.superseded",
`Concept2CureLogin.tsx`) and it was not shown. The 2026-11-12 check found why:

- The server names the reason once. The first refusal revokes the token, and every later answer for it is the
  general `SESSION_ENDED` (`server/middleware/auth.ts`, `server/services/token-revocation.ts`).
- The check the client makes on load, `GET /api/v1/auth/session`, answers `SESSION_ENDED` even the first time
  (`server/routes/auth.ts`), so the client keeps no reason and the notice has nothing to show.
- Post-start signs in as the demo person up to three times and signs out of none of them
  (`.devcontainer/post-start.sh`, `scripts/demo/launch-demo/lib.mjs`, the CSR walk).

This is GA ledger item GA-DEMO-20, open and unheld. It is not fixed here. Inside the app the idle sign-out is
announced by the client's own timer (`IdleSessionGuard.tsx`), so what a person misses is the notice after a reload
or a return to a closed tab, and after the session limit.

### 4. What AnA can read when a key is in

A turn starts at tier 1. A frontier provider is sent tier 0 and 1 only
(`server/services/ai-gateway/sensitive-placement-policy.ts`, `decideInputTierPlacement`).

| What AnA does | Tier it adds | With a Claude key |
|---|---|---|
| Lists and searches: project documents, Vault documents, passages, project knowledge | none | answers |
| Plan, tasks, briefing, dispatch readiness, CSR study data, project memory | none | answers |
| Reads a document in the editor (`read_governed_document`) | none | answers |
| Reads a Vault document (`read_project_document`) | the document's own: Public 0, Internal 1, Confidential 2, anything else 3 | answers for Public and Internal; a Confidential one is refused at the read, and AnA says so (`45dbe6a69`) |
| Reads a conversation artifact (`read_vault_document`) | 3 | the next model call is refused |
| A Quality record picked in the composer | 3 | refused |
| Module 2.4 and 2.6 nonclinical inputs | 3 | refused |
| The person's private rules or saved personal profile | 3, on every turn | every turn is refused (ANA-02) |

Every Vault upload is stored Confidential unless the upload says otherwise
(`server/services/vault/vault-ingest.service.ts`), and the demo packs say nothing. So with a Claude key AnA can read
no uploaded source document until a person classifies it Internal. Whether a Confidential source may go to a
first-party model under a zero-retention agreement is P-115 item 6, the buyer's election; its mechanism is S4's
and is not built (GA-S4-05).

### 5. The CSR runbook, corrected by this change

- Demo-day step 4 said "steps 11–13" and left out step 14, Send for review. A reviewer then finds nothing to
  review (CSR-2). It now says 11–14.
- Live step 5 said "the project's Review tab → the CSR → Record review decision". That row opens the editor, which
  has no review decision (CSR-1). The path that works was walked again on `a9b5af187` as the reviewer: Review tab →
  "Review documents on the review board" → the card "… Awaiting your review" → "Record review decision". The
  dialog opens with Approve, Request changes and Decline.

## Where each finding stands on `a9b5af187`

A star marks a finding a client would have seen fail. The full text of each is in `findings-status.json`.

**AnA with keys in**

| Id | Seen on 2026-11-09 | Now | Where it still is | Holder |
|---|---|---|---|---|
| ANA-01 * | On C2C-101, any AnA turn that opens a Vault document's text is refused at its next model call | partly fixed | The fix refuses earlier, not less (its own words: no change to classifications or to the tier wall). Unreviewed Vault uploads are stored CONFIDENTIAL (server/services/vault/vault-ingest.service.ts:587), and the commit says the seeded demo documents are too. CONFIDENTIAL is tier 2, and tier 2 is… | Unheld. No row dated 2026-11-10 to 2026-11-12 holds document-catalog-tools.ts or catalog-scope.ts. The AnA… |
| ANA-02 * | If the founder's account has any personal AnA preferences or private standing rules, every AnA turn is refused | open | Nothing on this path changed since 51c52751e: git log 51c52751e..HEAD is empty for ana-context-router.ts and model-call-scope.ts. stream.ts had 7 commits, none touching the owner-private lines. No commit since 2026-11-09T20:00 mentions owner-private context, private rules or preferences. The chain… | server/services/ai-gateway/gateway.ts is held by 01T2woo… (Client administration and screen work, Wave B… |
| ANA-05 | Reopening a conversation whose turn failed shows the question with no answer, and Progress says AnA never started | open | The server saves a turn's answer to the conversation only when the turn was stopped: server/routes/ana-ri/stream.ts:4445-4451 calls persistStoppedAnswer, the only call. A failed turn writes the type:error frame (stream.ts:4485-4491) and saves no assistant message, though it files a 'failed' turn… | Unheld. No row dated 2026-11-10 to 2026-11-12 holds server/routes/ana-ri/stream.ts, post-processing.ts… |

**The CSR fallback**

| Id | Seen on 2026-11-09 | Now | Where it still is | Holder |
|---|---|---|---|---|
| CSR-1 * | Live step 5's path dead-ends: the project's Review tab offers only 'Open document', and the editor has no 'Record review decision' | partly fixed | The project's Review tab still offers only "Open document" on a row that says "Awaiting your review" (ProjectHome.tsx:1163-1164), and the editor has no review decision. | ProjectHome.tsx: the project page session (01FTWcmX…, D3). |
| CSR-3 * | Vault sometimes fails to load the project: 'Couldn't load the project vault · The document store didn't respond' (500, a Quality-evidence check) | partly fixed | One path still turns into a whole-Vault 500. A SourceReadAccessError from the data-room list after a successful refresh is rethrown: listClientDocuments at project-vault.ts:2102, `if (!isMissingStore(err)) throw err;` at :2171, then 500 "Failed to build project vault" at :2236. The client shows… | unheld. record-source.ts: the Quality lane (01GyGhjg…) released it after df1a57ef1 (COORDINATION.md:989)… |
| CSR-7 | Timestamps: the review dialog shows the request time twice, and the freeze time is in local time in one place and UTC in another | open | The request time: ReviewDecisionDialog.tsx:83 renders `Review requested <GovernedTimestamp value={requestedAt} />` with the default stacked layout. That prints the time twice, as UTC (GovernedTimestamp.tsx:104) and again as local with the zone (:106); in a UTC Codespace both lines read the same.… | ReviewDecisionDialog.tsx: Wave B lane W1, 01T2woo…, from 2026-11-12 (COORDINATION.md:122).… |

**Biotech tour (C2C-101)**

| Id | Seen on 2026-11-09 | Now | Where it still is | Holder |
|---|---|---|---|---|
| BT-F2 * | Walkthrough §6 dispatch script contradicts the screen: the founder would admit a defect that no longer exists | open | docs/demo/biotech-walkthrough.md:128-135 still reads 'Dispatch blocked — 3 blockers … six error-severity structural findings' and blames 'leaves placed from the Vault by UUID'. The only commits to this file since 51c52751e (14f00b197, 0155d81c7) added the data-catalog paragraph and §6b and left §6… | docs/demo/biotech-walkthrough.md is named as GA-map lane L3 in the Client administration row (01T2woo…, from… |
| BT-F3 * | CMC 'Module 3 build' on C2C-101 is a dead end: it refuses the biologic with a 409, while Validation tells the user to place Module 3 from CMC | open | Unchanged in the path the finding names. client/src/concept2cure/v2/surfaces/CmcModule3Build.tsx:429-449 still renders the 409 composition refusal ('Module 3 is not composed here for this project'). server/services/ectd/dispatch-readiness.ts:439-449 (IND_MODULE3_REQUIRED, not changed since… | CmcModule3Build.tsx is held by the Client administration and screen work session (01T2woo…), Wave B lane… |
| BT-F4 | Validation tab prints raw rule codes, a stray '·' line and table-plus-UUID text | open | The Validation workspace was not changed since 51c52751e (the file's only commit is 114773a67, the Dispatch tab's test package). client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx:1362 prints f.code (the raw rule code) as the row title. :1366 prints an I.dot plus the section code.… | Unheld. No row dated 2026-11-10 to 2026-11-12 names SubmissionSeqWorkspaces.tsx; the 2026-11-06 P-104… |
| BT-F5 | Builder says the source of every leaf is 'not yet determined', although the Vault shows each one filed and placed; history row reads 'Ai Generate' | partly fixed | The tour's six leaves are uploaded Vault PDFs (IB, minutes, QOS, tox, protocol, SAP) with no Authoring filing receipt. They still take the non-text branch at server/services/ectd/submission-leaf-source-evidence.ts:264-267 and return SOURCE_BINARY_CONTENT_UNVERIFIED, so their status is… | Unheld. submission-leaf-source-evidence.ts was held by 01QoxbLcnW… for one commit and released with… |
| BT-F6 | Dispatch verdict copy: 'finding(s)' and internal jargon in brackets | open | server/services/ectd/dispatch-gate.ts:78 is still '${n} open error-severity validation finding(s) must be resolved before dispatch.' and :81 '…Shadow Review critical(s)…'. 7df1d292c changed only the notRequired note. The bracketed jargon is the release-signature suffix at dispatch-gate.ts:190 ('… | dispatch-gate.ts is named as GA-map lane L4 in the Client administration row (01T2woo…, from 2026-11-10… |
| BT-F7 | Audit trail shows raw targets and IDs, a confusing second-chain card, and an org-wide 200-row window dominated by sign-ins | partly fixed | The second-chain card is unchanged: AuditEventChain.tsx:155 and :191, rendered at AdminSurfaces.tsx:570 and :907. The list is still org-wide with sign-ins included, now up to 1,000 rows. A raw fallback target remains at server/routes/audit-trail-ledger.routes.ts:251-253 ('${table_name}… | AdminSurfaces.tsx is held by the security lane (01QoxbLZVw6z…), GA-map lane L5, from 2026-11-12 05:10 UTC… |
| BT-F8 | Vault Uploads tab: the Data room line says 'Filed to vault 0, 25 need review' directly above six Filed files | open | The data-room block is unchanged since 51c52751e apart from a line offset. client/src/concept2cure/v2/surfaces/Vault.tsx:597-602 still draws the 'Captured › Classified › Filed to vault N' strip from data-room sources only. :188 (RoomNotes) prints 'N need review — the classifier would not propose a… | Not named as a block. Vault.tsx is held by J2 (01QoxbLb…) for row copy only, and in part by Vault parity… |
| BT-F10 | Project page Module completion reads '0 drafted … No editing copy of this filing yet' under a list of 8 Draft documents; the Team card has odd copy | open | server/services/c2c/dossier-read.ts is unchanged since 51c52751e. It counts only c2c_documents sections. The project's Draft documents are Authoring documents in another store and are not bound to the filing. ProjectDossier.tsx changed only by eb94263b2 (a door to the section). It still prints… | D3's files (surfaces/Project*.tsx) are held by the Project page session (01FTWcmXm7At3ZXBE5VWn6oS), from… |
| BT-F11 | Raw identifiers and ISO dates on the tour screens | partly fixed | Quality dates are still ISO. formatDate is String(d).slice(0,10) at client/src/concept2cure/quality/data.ts:202-205, used by the SOP register and change control (ChangeControl.tsx:352). SopRegisterRow.tsx:294 prints effectiveDate.slice(0,10). Change control's linked records show linkedRef in mono… | client/src/concept2cure/quality/** is held by Quality and training (01GyGhjgjrNv…), from 2026-11-06, updated… |

**LMN-201, monitoring, Quality, Tasks, Reporting, Biostatistics**

| Id | Seen on 2026-11-09 | Now | Where it still is | Holder |
|---|---|---|---|---|
| T2-F2 * | RACT critical-to-quality register is clipped: the scores and status columns cannot be seen | partly fixed | No one has measured the RACT register at 1440 since the change. The evidence only measures 390. With AnA docked on arrival, the board is about 360px narrower (app-v2.css:4087 .wa-split), so the 9-column table at RbmSurfacesA.tsx:427 may still open with Residual/Status out of view behind a sideways… | Unheld. The RBM session (01QoxbLbUD…, 2026-11-12) holds nothing. The coordinating session's 2026-11-02… |
| T2-F9 * | Biostatistics design assessment contradicts itself on missing data and on sensitivity analysis | open | server/services/biostatistics-bridge/statistical-review.ts:97-106 is byte-identical to 51c52751e (empty git diff). No commit since 2026-11-09T20:00 touches statistical-review.ts, study-design/ or design-adapter.ts. The 'Missing data' row prints STANDARD_OK (:103, 'A pre-specified model- or… | Unheld. R1 (01QoxbLdKp…) held the ana-biostats missing-data figures on 2026-11-12, landed 03291d033 and… |
| T2-F12 * | An opened seeded report run says the project has no governed artifacts and prints raw provider codes | open | server/services/report-os/orchestrator.ts:113-114 and providers/db-providers.ts:98,104 still say 'No governed artifacts discovered for this scope'. Both are unchanged since 51c52751e and count only concept2cure_artifacts (orchestrator.ts:69-90). GA-DEMO-06 is still open: eaa0237fa says it 'needs… | Unheld. GA-DEMO-06 lists the server provider as unheld. render.ts and InsightsRunEvidence.tsx are not in… |
| T2-F10 | Design Assumption Note ends with an empty 'Key concerns:' list | open | server/services/ana-biostats/document-generator.ts:429-433 still prints 'Revision recommended before proceeding. Key concerns:' and then loops judgment.escalationReasons. deriveAction returns 'revise' for a marginal verdict or high risk (judgment-engine.ts:871-876). collectEscalationReasons only… | Unheld: no coordination row names server/services/ana-biostats/document-generator.ts or judgment-engine.ts |
| T2-F8 | Biostatistics copy: raw parameter names, a possessive headline, and three different phases | open | Raw parameter names are still printed at server/services/biostatistics-bridge/statistical-review.ts:149-150 ('sensitive to ' + p.parameter, e.g. effect_size, attrition_rate), along with raw '(${j.overallRisk} risk)' and computation.method at :141-154. The file is unchanged since 51c52751e. The… | Unheld. statistical-review.ts, Biostatistics.tsx and lumen-content.mjs are in no 2026-11-10 to 11-12 hold.… |
| T2-F5 | RBM's other five tabs still print raw ISO times and code names | partly fixed | The old B:541 is still raw. RbmSurfacesB.tsx:633 prints 'updated {plan.updated}' and :634 prints '{plan.approval.when}'. Both are ISO strings from server iso() (mdx-rbm-board.ts:182-186, 681, 689). Due dates are also printed raw: 'due {v.due}' (RbmSurfacesB.tsx:534) and 'due {a.due}' (:664). The… | Unheld. The RBM session (01QoxbLbUD…, 2026-11-12) holds nothing. The coordinating session's 2026-11-02 row… |
| T2-F6 | RBM Overview and Patient profiles: lowercase source codes, '(s)' plurals, raw dates, wrapping ids | open | DataFreshness is identical to 51c52751e (diff empty). client/src/concept2cure/v2/surfaces/RbmSurfacesA.tsx:145 prints <b>{s.source}</b>, the raw source code such as 'edc', while the KRI tab uses KRI_SOURCE_LABEL. :144 still says '${s.rowsAccepted} row(s) accepted' and 'cutoff ${s.dataCutoff}' as a… | Unheld. The RBM session (01QoxbLbUD…, 2026-11-12) holds nothing. The coordinating session's 2026-11-02 row… |
| T2-F11 | Reporting & analytics on a biotech IND shows device-project analytics and a wall of 24 zero months | open | client/src/concept2cure/v2/surfaces/Insights.tsx:2194 renders deviceSection whenever no report is open, whatever the open project's type, and :2482 places it under 'Reports not available for {p.code}'. insights-canvas-routes.ts:665 reads readDevicePortfolio over every accessible project.… | Insights.tsx is held by Reporting analytics (011HLkY…), but that row dates from 2026-11-01 and has no 11-10… |
| T2-F14 | LMN-201 shows two different overdue counts: '14 tasks past due' on its card, '2 tasks are overdue' on Tasks | open | portfolioWords moved in e5f35efe7 with its logic unchanged. client/src/concept2cure/v2/surfaces/PyramidPortfolio.tsx:77 still prints '${s.overdue} tasks past due' from the plan (pyramid) summary. Tasks counts board tasks whose due text includes 'overdue' (TaskBoard.tsx:1043) and prints 'N tasks… | PyramidPortfolio.tsx is unheld: the S11 session (01QoxbLdJq…) holds nothing after its 2026-11-12 second… |
| T2-F15 | Quality: uppercase labels, raw review dates, and every client's SOPs under the LMN-201 breadcrumb | partly fixed | Review dates are still raw. client/src/concept2cure/quality/data.ts:202-205 formatDate returns String(d).slice(0,10), i.e. YYYY-MM-DD, and it is used at SopRegisterRow.tsx:71 and PeriodicReview.tsx:131. By default, with LMN-201 open in the shell, the SOP register still lists the whole… | Quality and training (01GyGhjgjrNv…) holds client/src/concept2cure/quality/**. Its row was updated… |

**CMC / Module 3 (C2C-201)**

| Id | Seen on 2026-11-09 | Now | Where it still is | Holder |
|---|---|---|---|---|
| CMC-3 * | Approve on 'C2C-201 — solid form' opens a password e-signature form, not the refusal | open | client/src/concept2cure/v2/surfaces/CmcModule.tsx:1507: Approve calls setSign(r) and is disabled only when r.noMethod (no method name recorded). :1549 then always opens signForm, which asks for a password and an authenticator code. The server's METHOD_NOT_FIT refusal (approvalTargetRefusal… | Specifications region of CmcModule.tsx: row 121 (01T2woo…, lane L1, from 2026-11-10; no release recorded).… |
| CMC-4 * | Release on the 'ineligible' batch either does nothing or opens a password form, and choosing 'conditional' could actually release | partly fixed | CmcModule.tsx:2797: the button (now 'Disposition') is disabled for any batch with open deviations, with the reason only in a title tooltip, so clicking it on C2C201-DP-2601 (1 open deviation) does nothing. This also blocks the conditional release and the rejection the server allows for open… | CmcModule.tsx batch rows and cmcBatch.ts: 01QoxbLcnW… ('CMC screens'), from 2026-11-12, alongside the… |
| CMC-5 * | Eligible column says Yes for batches whose QC results are all unreviewed, contradicting its own header | open | CmcModule.tsx:2687 `const eligible = (r: CmcBatch) => r.dev === 0;` is rendered as Yes/No at :2792, under the header at :2771 'released over the batch’s recorded, reviewed QC results', so a batch with zero deviations and every result unreviewed reads 'yes'. The list read… | CmcModule.tsx batch rows: 01QoxbLcnW… ('CMC screens'), from 2026-11-12. batchRecordRoutes.ts: unheld.… |
| CMC-6 * | QC result 97.4 % against 98.0–102.0 % is shown as Pass | partly fixed | server/api/cmc/routes.ts:744-760: GET /api/cmc/qc-testing returns raw rows with no `conformance`, and nothing in server/ sets that field. So qcPassContradicted is never true, and DS-2502-R2 still shows 'Pass' and counts among the passes. 40cc8265b leaves this open ('GET /api/cmc/qc-testing must… | server/api/cmc/routes.ts: Wave B W4-cmc-truth-server (01T2woo…, row 122), from 2026-11-12, no commit yet.… |
| CMC-7 * | Quality by design derives 0 CQAs 'from 6 specifications' and shows a red gap banner | open | No commit since 51c52751e touches server/services/cmc/qbd-analyzer.ts, qbd-helpers.ts or CmcQuality.tsx. qbd-analyzer.ts:205-219 derives specification CQAs only from quality_specifications.test_parameters. Neither the spec form (cmcSpec.ts:176-191 specCreateBody: the attribute goes in… | Unheld (qbd-analyzer.ts, qbd-helpers.ts, CmcQuality.tsx are named in no hold). The GET /api/cmc/quality/qbd… |
| CMC-9 | Raw code identifiers and odd copy in the section completeness lists | partly fixed | The rehearsal's 'odd copy' is not specified. The internal-sounding phrase still in that list is CmcModule.tsx:1189 'not established — never scored by the compiler'. 307d82d2a itself records that AnA's Module 3 command handlers, the M2 summary builder and the composer's fallback narrative still… | CmcModule.tsx Overview approvals table: 01QoxbLcnW… ('CMC screens'), from 2026-11-12. |
| CMC-10 | Audit chain Actor shows '1', and spec History shows a raw ISO time and 'JM Smithuser:1' | open | CmcModule.tsx:3351 `<td>{e.createdBy // 'system'}</td>` prints the numeric user id. The id is fed raw by module3OperatingSystemRoutes.ts:552-557 (created_by as "createdBy", no name join). Spec History: cmcRecordHistory.tsx:168 prints `entry.at.replace('T',' ')…` as a raw ISO time.… | Approvals & audit region of CmcModule.tsx: row 121 (01T2woo…, lane L1, no release recorded); not in… |
| CMC-11 | Raw 'phase_2', contradictory scope labels and '1 gaps' | open | The substance table is CmDrugSubstances in cmcRegisters.tsx, not CmcModule.tsx. cmcRegisters.tsx:1111 `{ header: 'Phase', render: (r) => text(r.developmentPhase) }` prints the stored 'phase_2' (seeded at biotech-work-content.mjs:54/:198). Scope labels: REGISTER_SCOPE (cmcRegisters.tsx:130-142)… | cmcRegisters.tsx: row 121 (01T2woo…, lane L1, from 2026-11-10). CmcQuality.tsx: unheld. |

**Device tour (NeuroPanel-Dx)**

| Id | Seen on 2026-11-09 | Now | Where it still is | Holder |
|---|---|---|---|---|
| MDX-2 * | Vault › Uploads: Data room strip contradicts itself and the six Filed files below it | partly fixed | client/src/concept2cure/v2/surfaces/Vault.tsx:601 'Filed to vault 0' and :611 'Nothing captured for this project yet.' still render directly above the six Vault-page uploads marked 'Filed'. The sentence that reconciles them is only inside the closed <details> 'How files reach the Vault' (:564).… | server/services/vault/vault-data-room-filing.ts is unheld. Vault.tsx: held by J2 (01QoxbLb…, row :115, row… |
| MDX-4 * | 510(k) screen: Official eSTAR and eSTAR sections contradict the project's own device data | partly fixed | scripts/demo/launch-demo/packs/mdx.mjs:72 still seeds predicateName 'SepsiScreen Panel (demo predicate)', a sepsis predicate for a CNS pathogen panel. The Official eSTAR writes it as predicateDeviceTradeName (estar-administrative-data.ts:156). server/routes/k510-document-preview.ts:63 still sends… | K510Surface.tsx: on 01T2woo…'s 2026-11-10 fix-lane list (lane L8, COORDINATION.md:121). Its fix 114f943f1… |
| MDX-5 | 510(k) screen (changed today): 'not configured' state works but looks unfinished | open | client/src/concept2cure/mdx/surfaces/K510Surface.tsx:344 appends program.dueLabel, which useMdxPrograms.ts:109/112 builds as 'Overdue · <ISO date>' or 'Filing · <ISO date>'. Line :358 still reads 'Open §11 in editor'. Line :675 renders '{subjectName} vs. {selectedList[0]?.name}', which leaves a… | K510Surface.tsx: on 01T2woo…'s 2026-11-10 fix-lane list (lane L8, COORDINATION.md:121; landed 114f943f1, no… |
| MDX-6 | Submission Readiness: release signature 'Satisfied' on an unsigned sequence; raw codes and uuids | partly fixed | server/services/ectd/assess-dispatch-readiness.ts:240-252: dispatchGateViews carries only notAssessed, and its call site at :993-1006 gives releaseSignature none. notRequired appears only in dispatch-gate.ts. So client/src/concept2cure/v2/surfaces/DispatchReadiness.tsx:83 still prints… | dispatch-gate.ts was on 01T2woo…'s 2026-11-10 lane L4 list (landed 7df1d292c). The screen half was handed to… |
| MDX-7 | Builder: duplicate Device Description leaf, and every leaf reads 'not yet determined' | partly fixed | Every leaf is a seeded Vault PDF (mdx.mjs:120 uploads application/pdf; placed at :436-437). server/services/ectd/submission-leaf-source-evidence.ts:264-267 establishes text for a Vault file that is not text/plain only through a sealed-document filing receipt (added by f793981ea). Otherwise the… | mdx.mjs: unheld (011Dpx… released it 2026-11-12, COORDINATION.md:32). submission-leaf-source-evidence.ts… |
| MDX-8 | Audit trail opens on 'Signed in on a development server: second factor skipped' | open | server/services/audit/auth-event-audit.ts:72 maps 'user_login/success/dev_mfa_skipped' to 'Signed in on a development server: second factor skipped'. server/routes/auth.ts:655 writes that row on every dev login. A Codespace runs with ALLOW_DEV_AUTH=1 (.devcontainer/post-create.sh:176), and Demo… | auth-event-audit.ts is unheld. The audit trail screen files (surfaces/AuditTrail*.tsx… |
| MDX-9 | Raw code tokens across the device screens | open | client/src/concept2cure/v2/surfaces/ProjectHome.tsx:1486-1487 prints doc.module raw ('510k') when it is not a CTD module number. client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:4357/4371 does the same in the editor bar ('… · 510k') and :5120 in the document view masthead.… | ProjectHome.tsx: the D3 holder, Project page 01FTWcmX… (row :109, from 2026-11-08). DocumentWorkbench.tsx… |

**Sign-in**

| Id | Seen on 2026-11-09 | Now | Where it still is | Holder |
|---|---|---|---|---|
| SES-1 * | A sixth sign-in signs out the account's oldest session; the signed-out tab lands on the plain sign-in page | open | Nothing is fixed. Since 51c52751e the server session files changed in one commit only, 26e81b20d (/readyz). The client session-end files are unchanged: sessionEnd.ts, authService.tsx and queryClient.ts have no commits. Concept2CureLogin.tsx gained only the Demo access picker (eaff401b5). No commit… | unheld. No row in .design/claude-convergence/COORDINATION.md holds shared/auth/session-policy.ts… |

**Fixed since the walk**

| Id | Seen on 2026-11-09 | Fixed by |
|---|---|---|
| CSR-2 * | In the Codespace, the reviewer will have no CSR to review: Demo-day step 4 says 'do steps 11–13', but the review needs… | This change: the runbook's demo-day step 4 says steps 11–14, so the CSR is sent for review before the reviewer looks for it. |
| CSR-4 | The Vault's Data room contradicts itself: 'Captured 21 … 21 need review' and 'Nothing captured for this project yet.' | 912ec3cf35 "F1: the Vault's route suites follow its Quality refresh; its data room counts what it lists" (2026-11-10, after 51c52751e). countDataRoomStages now leaves out captured Quality records… |
| CSR-6 | The CSR files text shows raw code identifiers (finalizePdfA, ECTD_REQUIRE_PDFA=true) | 3045b0f0c "F1: the CSR assembly says when its files become PDF/A in words, not with a function and a setting name" (2026-11-10). CSR_ASSEMBLY_PDFA_STATEMENT is now plain words (csr-assembly.ts:142), and the identifiers remain… |
| BT-F1 * | Walkthrough §3, §7 and §8 promise signed, effective and frozen records that do not exist: the synopsis is not frozen… | 11aa49118 "L1: the Codespace's demo seed signs its two-person steps, with the approver" (post-start now passes OQ_SIGNER_*=DEMO_APPROVER_EMAIL to demo:seed; at 51c52751e it passed no signer); ff49ebed7 "L1: a fresh Codespace's… |
| BT-F9 | Opening a Vault document: the viewer is hidden behind 'Versions' and opens in a 320 px box below the fold | fd60d97c8 "fix(vault): a document is read from its record, in a wide reading drawer" (View beside Download opens a 1040 px drawer; was a 328 px frame behind the closed Versions section) and 90ec856d9 "fix(vault): a version is… |
| T2-F3 * | RBM shows no sites while its own signals, KRIs and tasks name sites 102/104/106/107 | e9fad2163 'R1: a study's sites are scored from its own site-level indicators, so Site risk and Site oversight show them (GA-S8-02)' and bcf2b595f 'DATA: the Lumen seed scores LMN-201's sites, and no longer stops on an indicator… |
| T2-F1 | Risk review report still prints code names: buildRiskReview, generate_rbm_report | 845a63b2b 'D7: AnA's conversation leads Risk-based monitoring, and its tabs show the readings the board already held'. git log -S 'generate_rbm_report' points to this commit. The note at RbmSurfacesA.tsx:253 now reads 'This is… |
| T2-F7 | Biostatistics prints an unrounded float: 'breakpoint 0.15000000000000002' | eaa0237fa 'F1: sensitivity breakpoints come from power the engine recomputes, and the document says below 80% only when it is' (GA-DEMO-05). The old line 591, Math.min(attritionRate*1.5, 0.50), is replaced by a recomputed point… |
| T2-F13 | Reporting Catalog prints jurisdiction codes and lowercase role and filing words | bdb639850 'Reporting names the reports that can be run on its landing, and its catalog speaks in words (P-122)'. regionWords turns 'USA_OLAW' into 'US · OLAW'. reportingRoleWords/reportingRoleLabel turn 'ra lead, qa' into… |
| CMC-1 * | Stability flags every result as out of specification, including assay 99.8 % against 98.0–102.0 % | aef73a9d1 'Demo stability results carry their condition and reading, so Q1E fits them' (2026-11-10: the C2C-201 pack records withinSpecification on every result, all true except total impurities 0.61 % at 6 months accelerated… |
| CMC-2 * | Estimate Q1E fails with a red 409 toast, and Trend assesses nothing | aef73a9d1 'Demo stability results carry their condition and reading, so Q1E fits them' (2026-11-10, Plan: DATA). The 409 and the empty Trend came from seeded results that carried no `condition` on a study registered as [code… |
| CMC-8 | Stability register is cut off at 1440 px: Shelf life is clipped and History is unreachable | 687d0af9d 'A wide CMC register scrolls inside its section, not the page' (2026-11-10, D5). journey-v2.css:423 `.c2c-v2 [data-work-area="cmc"] :is(.pj-sec, .pj-card-b) > .reg-tbl{display:block;overflow-x:auto;}` applies to the… |
| MDX-1 * | Orchestration shows another project (BX-301) while NeuroPanel is open | 4c6d882af "F1: the shell opens the right thing: route task to its version, Orchestration follows the open project, bell count beside the bell, notice and filing tabs" (2026-11-12, GA-UI-27). The new pure function pickOrchProgram… |
| MDX-3 * | The walkthrough's signed states are absent here: 510(k) Summary not frozen or signed, SOP-101/102 not Effective | At 51c52751e, post-start.sh:174-180 ran demo:seed with no OQ_SIGNER_*, so the freeze, the e-sign and the QMS approvals were recorded 'not executed'. Fixed by: 11aa49118 "L1: the Codespace's demo seed signs its two-person steps… |

## Handed to their holders

Written to `.design/claude-convergence/COORDINATION.md`, "Found by the demo-day re-walk (`017CFk…`)", with this
change: the open findings no later record carries, by holder. Those the GA ledger already holds keep its id:
BT-F2 (GA-DEMO-16), T2-F12 (GA-DEMO-06), T2-F14 (GA-S11-01), CMC-4 to CMC-6 (GA-DEMO-02), MDX-2 (GA-S2-05),
MDX-4 (GA-DEMO-10), MDX-6 (GA-D7-10, GA-D7-11), MDX-7 (GA-DEMO-12), SES-1 (GA-DEMO-20).

## Limits

- The 2026-11-12 check read code and history. Apart from CSR-1, no finding was walked again in the app, so "fixed"
  means the cause named on 2026-11-09 is gone from the code, not that the screen was seen right.
- The walk ran with a refused key. No model answer was seen; a refusal partway through a turn (a tier raised by a
  tool) was established from the code.
- "Holder" is the coordination file's row as read on 2026-11-12. Ask the holder before relying on it.

## Files

| File | What |
|---|---|
| `findings-status.json` | The 79 findings, and for 55 of them the state on `a9b5af187` |
| `tour-16-stops.json` | The 16 tour stops on `51c52751e` |
