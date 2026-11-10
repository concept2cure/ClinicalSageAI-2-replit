# Inventory: Quality, Reporting & analytics, Device & IVD, Biostatistics, RBM and AnA

**Scope:** what QA and RA users could do or see at the baselines that is gone or harder to reach at HEAD.
**HEAD:** `8c7664b35` (concept2cure-v2, 2026-11-10).
**Baselines:**
- for deletions, the tree just before each deleting commit (`<commit>^`);
- for the minimal-style reshaping, `bd1338c25` (2026-10-30);
- for the rail and launch scope, `4b7234944` (the last commit before 2026-10-15).

This was a read-only investigation. Nothing in the repository was changed.

## How I worked, and its limits

- The clone is shallow: its history starts on 2026-06-30, which covers the whole window.
- Every fold commit was read in full, along with `.design/client-journey/FUNCTION_PARITY.md`. That file is the folding sessions' own ledger of what each fold carried and what it dropped. Each fold's target was read to check that it delivers the outcome the fold claims.
- To find routes with no client caller, a script did the following:
  - mapped each route file to its mount from `server/bootstrap/register-*.ts`;
  - extracted the `router.<verb>('<path>')` definitions;
  - searched the non-test files under `client/src` at three strictness levels: the full path, the path without its mount, and the mount plus the route's last segment.

  The heuristic misses callers that build paths entirely at run time. I checked by hand every route I name in §3. The raw list is in the Appendix.
- To test whether a commit is safe to revert whole, I used `git merge-tree --write-tree --merge-base=<c> HEAD <c>^`. It ran in a `--shared` clone in the scratchpad, never in the repository.
- **Production enforces launch scope.** A surface outside `shared/constants/launch-scope.ts` shows as locked. An API path that no launch surface claims is refused (`server/services/entitlements/launch-scope-api.ts`). So in production, "the route exists and is mounted" does not mean "the route answers". The tables say which is the case.

## Headline (what a QA/RA buyer would notice)

1. **Quality looks empty once a project is open.** `e39cc0d59` (2026-11-10, 08:42 UTC, the day of the demo) changed what Quality reads.
   - With a project open, the SOP register, the change log, CAPA and nonconformances read only that project's records by default.
   - Controlled documents are usually organisation-level, and the shell remembers the open project for the session (`shellProject.ts`, sessionStorage plus a last-project restore). So the SOP register shows only that project's documents.
   - Getting the organisation's SOPs back takes a "Show the whole organisation" click.
2. **Quality's actions and figures were folded out of sight in the 2026-11-06 to 2026-11-10 restyle** (`a65f886a7`, then C6 to C18):
   - the KPI tiles became sentences;
   - the nine document-type cards became a dropdown;
   - each register row shows one next step, with every other action (Approve, Revise, Retire, Controlled copy, Record review, Ask AnA and so on) behind "More";
   - the change-control pipeline became a segmented filter.

   Nothing was deleted from the server. Quality actually gained six registers on 2026-10-29. But the screen now looks like a sparse list.
3. **The device organisation-level screens are gone** (`303f49012`, `041880cbd`, `970bc3637`):
   - Risk management (ISO 14971), Design controls/DHF and IVD completeness exist only inside a device project's Engineering or IVDR evidence. With no project open, the host shows "Open a project to continue" (`mdx/MdxSurfaceHost.tsx:479`).
   - Hazards and design inputs recorded without a project now show nowhere.
   - The cross-portfolio device blocker list and the device analytics screen are gone. Their server facets remain, but production refuses them.
4. **Post-market surveillance panels have been hidden since 2026-10-26** (`10bbeeeea`). Signals, the CAPA board, vigilance trends and PMS plan execution show "Shown once this screen reads this project's records". This is because `SURVEILLANCE_KEYED_TO_PROJECT = false` (`mdx/surfaces/PostmarketSurface.tsx:53`) and `GET /api/mdx/postmarket` still reads the whole organisation.
5. **Built but never reached by any screen** (none of it was lost in this window):
   - Complaint intake and MDR events / vigilance (`/api/capa-mdr`);
   - the IVDR evidence binder and pack builder (`/api/ivdr/binder`, `/api/ivdr/packs`, with a running worker);
   - 45 IVD lifecycle engines;
   - LDT, PER, IVD analytical/clinical performance and CDx concordance;
   - the Biostatistics SAP continuum, estimands and external controls;
   - Reporting's program groups and deliveries;
   - AnA's guidance-change, consistency and citation-health alerts.
6. **No loss found in Biostatistics, RBM or AnA's Summary:**
   - Biostatistics merged two surfaces into one (`3baa7fb79`) and its ledger checks out: 11 document types, 29 calculators and the defensibility assessment are all present.
   - RBM joined the rail (`b602ecad9`, 2026-10-30).
   - AnA's Summary (`AnaWorkPanel` "Summary", `TurnSummarySheet`) is intact and grew a team or worker view. The dock is shown by default (`workDock.ts`).
   - AnA's memory screen was reduced to a read-only drawer (`78877084f`).

Context that was not removed in this window but adds to "10% visible":
- Biostatistics, RBM and CMC are admitted by surface only, at the **professional** tier (`db/migrations/20260823_module_catalog_commercial_packaging.sql:336,347`). A demo organisation on a lower tier sees them **locked** on the rail.
- Training, Quality plans (`qmp`), Report governance, Report engine, AnA Command and Mission control have been outside launch scope since the CPO decision of 2026-10-08. They are locked in production.

---

## 1. Timeline: commits that removed or hid user-visible capability in these areas

Dates are author dates. "Restored" rows are included where a hide was later undone, so the net state is clear.

| Date | Commit | Area | What left or was hidden | Claimed replacement | Net at HEAD |
|---|---|---|---|---|---|
| 2026-10-12 | `d1a742b5d` | Biostatistics | The browser's own statistics engine was deleted. *Before the window; not a loss.* | Server engine (`/api/ana-biostats/compute`, `/document`) | All 11 document types and 9 endpoint types are present. A gain. |
| 2026-10-26 | `10bbeeeea` | Device | Panels that read other projects' records were hidden behind "Shown once this screen reads this project's records". Hidden were:<ul><li>Engineering's 5 panels and 2 cards;</li><li>Post-market signals, CAPA board, trends and PMS plan execution;</li><li>Human factors' file panels;</li><li>Labeling's first document;</li><li>Pre-Sub's dossier jump.</li></ul>The "Mine" filter was removed. | Panels return once their route reads the project | Engineering came back with `230b6dfa0` (P-60, 10-29). Human factors came back with `8658aa74e` (10-29). Labeling reads `?program_id=`. **Post-market is still hidden.** |
| 2026-10-26 | `0fc2fc294` | Device | MDX `TemplatesSurface.tsx` deleted (nothing reached it) | Authoring › New document › Start from (`AuthoringTemplatePicker.tsx`) | Delivered |
| 2026-10-29 | `2168fd569` | Device | `device-tasks` (kit task workbench) folded | Tasks (`TaskBoard.tsx`), with a "Blocking the submission" flag | Delivered. `/api/submission-ops/workload` and `/unified-work` are left with no caller. |
| 2026-10-29 | `b9de04c62` | Device | `device-vault` and Artifacts center folded; `server/routes/mdx-vault.ts` deleted | Vault, including Governed artifacts and `VaultOrganizationArtifacts.tsx` | Delivered. The device "framework" filter, size and retention tiles were dropped. |
| 2026-10-29 | `e3a2d0475` | Device | Device Correspondence tab's `AnaDrafter.tsx` deleted | "Respond in Communication" (`AgencyResponses.tsx`) | Delivered |
| 2026-10-29 | `66efa6179` | Quality/compliance | `part11-console` (Part 11 console) folded | Audit trail chain banner (`AuditEventChain.tsx`) | Delivered (its only live content was the second chain verdict) |
| 2026-10-29 | `78877084f` | AnA | `ana-memory` screen (`AnaMemory.tsx`) deleted, with 6 routes: `GET /api/mdx/ana/memory`, `POST …/:id/verify`, `POST …/:id/supersede`, `GET /api/mdx/ana/threads`, `GET …/:id`, `POST …/:id/pin` | "What AnA remembers" drawer (`WhatAnaRemembers.tsx`), from the conversation header and the account menu (`Shell.tsx:478`) | Partial: read-only. Atom list, filter, verify, supersede and pin are gone. |
| 2026-10-29 | `303f49012` | Device | `Risk.tsx` (ISO 14971 register, organisation-wide with no project open), `DesignControls.tsx` (DHF, organisation-wide with no project open) and `IvdCompleteness.tsx` (IVDR technical-file board, organisation-wide with no project open) deleted | `device-engineering` mounts `RiskRegister` and `DesignControlsTrace` **only `{program && …}`** (`EngineeringSurface.tsx:509,523`); `device-diagnostics` mounts the IVDR board for the open project | Partial: per-project only. The organisation-wide registers and records with no project are lost. |
| 2026-10-30 | `041880cbd` | Device/eSTAR | `device-validation`: the organisation-wide blocker list (`c2c_blockers`) with severity filter, KPI cards, CSV export and "Ask AnA to triage" | Each filing's `EstarFilingPanel` readiness; the id now aliases Submission Center | Partial. Nothing lists blockers across filings. `GET /api/submission-ops/blockers` has no claimant, so production refuses it. |
| 2026-10-30 | `776d9da46` | Device/eSTAR | `device-submission` packages screen (`mdx/workbench/Workbench.tsx`, `useSubmissions.ts`) | Submission Center › device filings (`DeviceFilings.tsx`): status filter, per-row readiness gate, history | Delivered. Pipeline counts across seven stages were dropped. `/api/submission-ops/packages*` is left with no caller. |
| 2026-10-30 | `a2a295962` | AnA | AnA command `correspondence.ingest` retired (it never worked: unverified service token) | A person logs the letter in Communication | No real loss |
| 2026-10-31 | `970bc3637` | Reporting/Device | **F4:** device analytics screen (`AnalyticsSurface.tsx`, `useAnalytics.ts`, `AnalyticsReportLibrary.tsx`) and the `GET /api/mdx/analytics` aggregate deleted. **F6:** device portfolio (`mdx/surfaces/Overview.tsx`) deleted. | **F4:** device section of Reporting (`InsightsDevicePortfolio.tsx`, `report-os/device-portfolio.ts`). **F6:** Projects with the MDX filter; Client Review Room on the device project's Review step. | Partial. Lost: blockers by root cause, the saved-reports list on the device screen, average readiness, "Blockers open" and "In flight" figures, and the organisation-wide Client Review Room. `/api/mdx/analytics/*` facets are refused in production. |
| 2026-11-01 | `8684f0bcb` | AnA tools | `plan_ind_module_authoring` retired (it wrote model-supplied figures) | `draft_clinical_overview_m2_5`, `draft_clinical_summary_m2_7` | Delivered |
| 2026-11-02 | `f58089a33`, `209a8964b`, `002ab41e1`, `fc9dbb57a`, `7ce21a6c8` | Reporting | D7-D restyle: <ul><li>the "Where to start" opener deleted;</li><li>the guardrail moved into a closed "How reports are computed" disclosure;</li><li>"Not computed in this release" moved into a closed disclosure;</li><li>the plan-preview switch moved into the Catalog tab;</li><li>tab icons removed;</li><li>Export PDF is now ghost.</li></ul> | Facts under the title; suggestions as starters | Cosmetic. No function lost. |
| 2026-11-02 | `cac363bfb`, `e0534a80f`, `2505ca402` | Biostatistics | D5 restyle: <ul><li>the ResultLead banner deleted;</li><li>the inputs hash and gate codes (`PWR-003`…) moved to hover text;</li><li>the standards note moved into a disclosure;</li><li>cards became sections.</li></ul> | Same content | Cosmetic |
| 2026-11-06 | `a65f886a7` | Quality | <ul><li>Quality's topbar (crumbs, "Ask AnA") deleted;</li><li>**four KPI tiles** (Effective documents, Under review, Review overdue, Acknowledgement coverage %) deleted and `Kpi.tsx` removed;</li><li>**nine "Quality system library" cards** deleted: Quality manual QM-, Policy POL-, SOP SOP-, Work instruction WI-, Form FORM-, Validation protocol VP-, Change-control procedure SOP-CC-, Change-request form CC-, Training curriculum TC-;</li><li>each record tab's h1, tiles and "Ask AnA" deleted.</li></ul> | <ul><li>Figures as one sentence per section;</li><li>the types as the template dropdown in "New controlled document";</li><li>three AnA starter chips.</li></ul> | Functions kept. Glanceable figures and discoverability lost. |
| 2026-11-08 | `b4c57f5a2` (and `b7eec7bf3`) | AnA tools | Import chains cut so 7 engine tools never reach a model | The same tools | No loss |
| 2026-11-09 | `3baa7fb79` | Biostatistics | `biostat-workbench` surface retired into `biostatistics` | `DefensibilitySection` and `DesignCalculatorsSection` (`Biostatistics.tsx:1286-1287`) | Delivered |
| 2026-11-09 | `7ec502cea` | AnA tools | `assess_benefit_risk` retired | `assess_benefit_risk_balance` | Delivered (inputs differ) |
| 2026-11-10 | `606a9a302` | Quality | SOP register row: ten stacked actions became **one next step plus "More"** (`SopRegisterRow.tsx`) | Same buttons behind "More" | Hidden one click deeper |
| 2026-11-10 | `6f651cc23` | Quality | Change-control lifecycle flowchart (six count tiles with arrows, the rejected and cancelled off-ramps, "Explain the pipeline"); the "How to raise a change" panel | Stage `.seg` filter; a closed "How a change is raised" disclosure | Cosmetic and discoverability |
| 2026-11-10 | `0561109d1` | Quality | Coverage bar coloured at 80% and 95%; the method paragraph; two-up boxes | "2 of 3 acknowledged"; closed disclosure | Cosmetic |
| 2026-11-10 | `ea1d59957`, `33682ac65`, `72178e7a2` | Quality | Change log and the six record registers: action chips and the per-row sparkle "Ask AnA" became **one next step plus "More"**; `registerGrid.ts` deleted | Shared `RegisterTable` | Hidden one click deeper |
| 2026-11-10 | `b61c5b088` | Quality | Change-control template buttons ("Change-control procedure", "Change-request form") | One "New controlled document" door | Discoverability |
| 2026-11-10 | **`e39cc0d59`** | Quality | **The default scope changed**: with a project open, documents, changes, CAPA and nonconformances read **only that project's** records | "Show the whole organisation" (`?quality=organisation`, `quality/registerContext.ts`) | **Organisation register hidden by default** |

---

## 2. Capability table: present at baseline, absent or harder to reach at HEAD

The route column states whether the server route still exists, is mounted and is admitted in production.

| # | Capability, as a QA/RA user would put it | Where it was (path@commit) | What is there now (fold checked against its target) | Server route exists and mounted? | Value | Restore effort |
|---|---|---|---|---|---|---|
| Q1 | "Open Quality and see **our** controlled documents, changes, CAPAs and nonconformances" | `quality/SopRegister.tsx`, `ChangeControl.tsx`, `QmsRecords.tsx` @`e39cc0d59^`: read the whole organisation | `quality/registerContext.ts` `useQualityScope`: when a project is open the registers read `?program_id=`. Widening needs a click; the empty state says "authored in {project}". The open project persists in session and local storage (`v2/shellProject.ts`). | Yes. `/api/mdx/qms/documents`, `/changes` and `/api/capa-mdr/capa` take `program_id` optionally. Mounted and in launch scope. | **HIGH**: an empty SOP register in front of a QA buyer reads as "nothing works" | **S**: default to the organisation; keep "Show {project} only" |
| Q2 | "Act on a document from its row": Approve, Revise, Record review, Retire, Controlled copy, Training, Review route, History, Ask AnA | Stacked in the row @`606a9a302^` (`SopRegister.tsx`) | `quality/SopRegisterRow.tsx`: one next step plus "More". Same handlers. | Yes, `/api/mdx/qms/documents/:id/{approve,revise,retire,periodic-review,controlled-copy,…}` | MED: functions present but hidden; in a demo, buttons that are not visible read as missing | **S**: show 2–3 state-relevant actions inline |
| Q3 | "Act on a change, CAPA, deviation, nonconformance, supplier, audit or review from its row" | Action chips and per-row Ask AnA @`ea1d59957^` (change log) and `33682ac65^` (records) | `RegisterTable`/`RegisterBody`: one next step plus "More" | Yes, `/api/mdx/qms/*`, `/api/capa-mdr/capa*` | MED | **S** |
| Q4 | "QMS health at a glance": effective, under review, overdue for review, acknowledgement coverage % (coloured) | `quality/SopRegister.tsx` and `Kpi.tsx` @`a65f886a7^`; CAPA and other record tiles in `QmsRecords.tsx` @`a65f886a7^` | One sentence per section (`registerSentence`, `qms-register-figures`). `646b855fe` restored the facts the tiles held (counts in brackets, read caps). | Yes. Reads `/api/mdx/qms/documents`, `/documents/review-due`, `/training/compliance` | MED: inspection-readiness at a glance sells QMS. **Founder decision**: on 2026-11-06 he said "no separate apps or cards". | **S**: re-add a figures row from `a65f886a7^` without cards |
| Q5 | "See what the QMS can author and start one in a click": nine document types, each with prefix and description | Template gallery @`a65f886a7^` (`SopRegister.tsx`, "Build from the Quality system library") | The "Template" field inside "New controlled document" (`ControlledDocumentDialogs.tsx`); the description shows after a type is chosen | Yes, `GET /api/mdx/qms/templates` (`server/services/qms/sopTemplates.ts`) | MED: discoverability of the authoring capability | **S** (founder decision, as Q4) |
| Q6 | "See the change-control pipeline", with counts per stage and the off-ramps | `quality/ChangeFlow.tsx` @`6f651cc23^` (six tiles and arrows) | `ChangeFlow.tsx` is a `.seg` filter with counts per stage. The procedure is a closed disclosure. | Yes, `GET /api/mdx/qms/changes/summary` | LOW | S |
| Q7 | "Start a change-control procedure or change-request form from the change log" | Two template buttons @`b61c5b088^` | One "New controlled document" door, pre-filtered to the two templates | Yes | LOW | **S**: `b61c5b088` reverts cleanly |
| Q8 | "AnA, give me a pre-inspection check / a read-out of this register", one button per tab | Topbar "Ask AnA" and per-tab buttons @`a65f886a7^` | Three starter chips under the header (`quality/App.tsx` `qualityStarters`) | n/a (AnA) | — (delivered) | — |
| Q9 | "The Part 11 console" | `v2/surfaces/Part11Console.tsx` @`66efa6179^` | Audit trail banner shows both chain verdicts (`AuditEventChain.tsx`) | `/api/part11/audit-trail/chain-integrity` is called. `/api/part11/compliance-status`, `/validation`, `/health`, `/signatures/*` have no caller (§3). | LOW | — |
| D1 | "Risk management (ISO 14971)" as a place: the organisation's hazard register when no project is open, with New hazard and Ask AnA | `v2/surfaces/Risk.tsx` @`303f49012^` (`programId ? project : organisation`) | `device-engineering` › "Risk management · ISO 14971" (`EngineeringSurface.tsx:509`), **only with a device project open**. Old links alias to `device-engineering`. Hazards recorded with no project show nowhere (FUNCTION_PARITY "risk": not carried). | Yes. `/api/mdx/risk-items*` (`mdx-risk-management.ts`) mounted and claimed by device-engineering. `GET /api/mdx/risk-summary/:programId` has no caller. | **HIGH** for device QA/RA: the risk file is the centre of their QMS and they expect a "Risk management" destination | **M**: re-add the 51-line wrapper from `303f49012^`, let `useRiskRegister` run without `requireProject`, and restore the registry, launch-scope and catalogue rows. Rule 1 requires amending `db/migrations/20260810…` and `20260823…` in place. **S** alternative: a rail or ⌘K door that opens Engineering scrolled to the panel (`engineeringPanelTarget.ts`), plus an organisation mode. |
| D2 | "Design controls / DHF trace" as a place, organisation-wide when no project is open | `v2/surfaces/DesignControls.tsx` @`303f49012^` | `device-engineering` › "Design controls · DHF" (`EngineeringSurface.tsx:523`), project only. Unscoped design inputs show nowhere. | Yes. `/api/design-controls` mounted, called by `DesignControlsTrace.tsx`. | **HIGH/MED** (21 CFR 820.30, ISO 13485 §7.3) | **M**, as D1 |
| D3 | "IVDR technical-file completeness board", organisation-wide with no project open | `v2/surfaces/IvdCompleteness.tsx` @`303f49012^` | `device-diagnostics` readiness panel (`IvdReadinessBoard.tsx`, `IvdAssessmentWorkbench.tsx`) for the open project. Not carried: the per-study analytical and clinical items, and a PER panel. | Yes. `/api/ivd-completeness/completeness` (its no-project branch remains) and `/api/ivd-assessments` | MED | S (organisation mode) to M (per-study panels) |
| D4 | "Every open blocker across our device submissions", with severity filter, KPI cards, CSV export and "Ask AnA to triage" | `mdx/workbench/Workbench.tsx` (ValidationSurface) and `hooks/useWorkbench.ts` @`041880cbd^` | Per filing only: `EstarFilingPanel` on the 510(k), PMA and IVD screens; Submission Center's device table shows each draft's gate. No cross-filing list (decision P-61 item 2). | Mounted: `GET /api/submission-ops/blockers` and `PATCH …/:blockerId`. **Refused in production** (no claimant: `ui-surface-registry.ui-v2.ts:507`). | MED: an RA manager's "what is blocking us" view. The readiness engine already computes per filing. | **M**: an aggregate over `assessEstarFilingReadiness` per filing, not `c2c_blockers`. Founder decision (P-61). |
| D5 | "Device submission packages pipeline", with counts across seven stages | `mdx/workbench/Workbench.tsx` @`776d9da46^` | `DeviceFilings.tsx` in Submission Center: status filter, readiness gate, history (`TrackedFilingHistory.tsx`). Checked. | `/api/510k/estar/submissions*` used. `/api/submission-ops/packages*` mounted, claimed by vault/tasks, no caller. | LOW (delivered apart from stage counts) | — |
| D6 | "Device portfolio": average readiness, blockers open, in flight; pathway and status filters; grid or list; organisation-wide Client Review Room | `mdx/surfaces/Overview.tsx` @`970bc3637^` | Projects with the MDX filter (`ProjectPortfolioFilters.tsx`: workstream, pathway and status filters with server counts). "Blockers open", "In flight" and status counts were dropped as not engine-computed. The Client Review Room is per device project (`ProjectClientReview.tsx`). | Yes. `/api/c2c/projects`; `/api/mdx/client-review` claimed by project-home | LOW | — |
| D7 | "Device analytics": KPI strip, 24-month pace, AnA draft acceptance, **top blockers by root cause** with Ask AnA, saved reports ("Reports and dossiers") | `mdx/surfaces/AnalyticsSurface.tsx` and `components/AnalyticsReportLibrary.tsx` @`970bc3637^` | `InsightsDevicePortfolio.tsx`: status counts, pace and acceptance rate, over the device projects the reader can open. Shown only on the Reports view with no report open and only if the reader has a device project. Blockers by root cause were dropped. Saved reports are in Reporting › Run history. Peer cycle time, reviewer velocity and per-tool usage were always "unavailable". | Aggregate `GET /api/mdx/analytics` **deleted**. Facets `/api/mdx/analytics/{portfolio,submissions,cycle-times,blockers,clinical,ana-usage}` mounted but **refused in production** (unclaimed: `server/routes/mdx-analytics.ts:15-20`). | LOW/MED | M (project-scoped facets) |
| D8 | "Post-market surveillance": vigilance signals, CAPA board, vigilance trends, PMS plan execution, on the device Post-market screen | `mdx/surfaces/PostmarketSurface.tsx` @`10bbeeeea^` | Same screen. Four panels show "Shown once this screen reads this project's records" (`PostmarketSurface.tsx:53,392,460,511,562`; the constant at :53). The CAPA register itself is reachable in Quality (P-48). The MDR triage queue (`useTriageQueue` → `/api/capa-mdr/triage`) still shows. | Yes. `GET /api/mdx/postmarket` mounted and claimed by device-postmarket, but **organisation-wide**: there is no `program_id` (`server/routes/mdx-postmarket.ts`). | **HIGH** for device customers (EU MDR Art. 83-86 and QMSR post-market obligations) | **M**: add a `program_id` filter and report `meta.scope`, then gate on the scope as Engineering does (P-60 pattern, `230b6dfa0`) |
| D9 | "Assess one of our risk controls / reopen a hazard / risk summary" | (No screen had it; listed for completeness) | — | `PATCH /api/mdx/risk-controls/:controlId`, `POST /api/mdx/risk-items/:id/reopen` and `GET /api/mdx/risk-summary/:programId`: no caller | LOW | S |
| A1 | "See and govern what AnA has learned (memory atoms): filter, verify, supersede, see superseded" | `v2/surfaces/AnaMemory.tsx` @`78877084f^` | `WhatAnaRemembers.tsx`: read-only notes and the "things I got wrong" ledger, personal and per project | `GET /api/mdx/ana/memory/profile` remains. List, verify, supersede, threads and pin were **deleted** (`mdx-ana-memory.ts`). | LOW (FUNCTION_PARITY: "not real today", no writer). A regulated buyer may still ask for memory governance. | M |
| A2 | AnA's Summary for each turn and AnA's work panel | `AnaWorkPanel.tsx`, `TurnSummary.tsx` @`bd1338c25` | Present and extended (team and worker view, `ProjectTeamPanel`). The dock is shown by default (`workDock.ts`). | `/api/ana-ri/*` stream and turn records | — (no loss) | — |
| B1 | Biostatistics: 11 statistical documents, 29 calculators, defensibility assessment | `Biostatistics.tsx` and `BiostatWorkbench.tsx` @`bd1338c25` | All present in one surface (`Biostatistics.tsx:1286-1287`). The inputs hash and gate codes are hover text only. | `/api/ana-biostats`, `/api/biostat`, `/api/statistical-defensibility` | — (no loss). The professional tier locks the rail entry for lower tiers. | — |
| R1 | Risk-based monitoring | `Rbm*.tsx` @`bd1338c25` | Same capabilities; joined the rail on 2026-10-30; method names now in words | `/api/mdx/rbm*`, `/api/mdx-rbm` | — (gain). Professional tier, as B1. | — |
| P1 | Reporting & analytics: catalog, run history, schedules, bundles, packs, legal package, compliance reports | `Insights.tsx` @`bd1338c25` | All present (`insightsLibraryShared.tsx` LIBRARY_VIEWS unchanged apart from names). The guardrail and not-computed list are closed disclosures. | `/api/insights-canvas`, `/api/report-os/{runs,bundles,…}` | — (cosmetic) | — |

---

## 3. Server capabilities with no client caller today

These are routes that are mounted, have a handler, and that no non-test `client/src` file calls (checked by hand). The "Production" column says whether launch scope would serve the route if a screen called it. "AnA" says whether an AnA tool reaches the same service in-process.

### Quality / QMS

| Route(s) | Handler | What it does | AnA | Production |
|---|---|---|---|---|
| `POST /api/capa-mdr/complaints`, `POST /complaints/:id/transition`, `GET /complaints/:id` | `server/routes/capa-mdr.ts` → `capaMdr.service` | **Complaint intake and lifecycle** (21 CFR 820.198). Only the list read is used, by the CER PMS tab (`useCerPmsFeeds.ts`). | `create_complaint` (`server/services/ana/capaMdrTools.ts`) | Claimed by device-postmarket (`ui-surface-registry.ui-v2.ts:476`) |
| `GET/POST /api/capa-mdr/mdr-events`, `GET /mdr-events/:id`, `POST /mdr-events/:id/transition` | same | **MDR / vigilance event records** with reporting clocks (21 CFR 803, EU MDR Art. 87) | `assess_mdr_reportability`, `triage_capa_mdr_queue` | Claimed |
| `GET /api/capa-mdr/vigilance` | same | Vigilance timeline per program or entity | `read_vigilance_timeline` | Claimed |
| `POST /api/audit/reviews/:id/sign` (probable; built from a constant) | `audit-compliance-reviews.ts` | Sign a periodic compliance review | — | in scope |
| `POST /api/citi-training/personnel/:id/import` | `citi-training.ts` | Import CITI training records for a person | — | check |
| `POST /api/quality/batch-validate`, `GET /api/quality/metrics/:cerProjectId` | `quality-management-api.ts` | CTQ and section-gating validation and CER quality metrics (FUNCTION_PARITY: "501 by design") | — | out of scope (`qmp`) |
| `GET /api/part11/validation`, `/health`, `/audit-trail/seal-integrity`, `/signatures/:documentId`, `/signatures/:signatureId/manifest`, `/signatures/by-target`, `POST /authority-check` | `part11-compliance.ts` | Part 11 validation status, seal integrity, signature manifests | — | `/api/part11` is claimed by audit-trail |

### Device & IVD (largest gap: 160 of 278 extracted routes have no caller)

| Route(s) | Handler | What it does | AnA | Production |
|---|---|---|---|---|
| `GET/POST /api/ivdr/binder*` (6) and `GET/POST /api/ivdr/packs*` (6, including `/packs/build`, `/packs/:id/download`) | `server/routes/ivdr-binder-routes.ts` (mounted in `register-regulatory-routes.ts:261`; worker `workers/ivdr-pack-worker` started every 2 s) | **IVDR evidence binder** (claims, evidence links, approval and revoke) and **technical-documentation pack builder** (job queue, readiness, download) | none found | `/api/ivdr` claimed by device-diagnostics |
| 45 × `POST /api/ivd-lifecycle/*` (stability real-time and accelerated, carryover, hook effect, recovery, cutoff, lot release, traceability, scientific validity, IEC 62304 class, SDLC, SBOM, cybersecurity, 510(k) or EU significant-change, eMDR, MIR, FSN authoring, FDA and EU registration, Declaration of Conformity, go/no-go, EMV, EVPI, portfolio simulation…) | `server/routes/ivd-lifecycle.ts` | Deterministic IVD lifecycle engines | Yes (`server/services/ana/ivdLifecycleTools.ts`, `AnaToolExecutor.ts` e.g. `generate_declaration_of_conformity`) | Claimed by device-diagnostics (`ui-surface-registry.ts:948-951`) |
| `GET/POST/PATCH /api/mdx/ivd/analytical*`, `/api/mdx/ivd/clinical*`, `GET /api/mdx/ivd/performance-summary/:programId` (9) | `mdx-ivd-performance.ts` | IVD analytical and clinical performance study records | `record_analytical_performance_study` | Claimed |
| `GET/POST/PATCH /api/mdx/ivdr/per*` (4) | `mdx-ivdr.ts` | Performance Evaluation Report records | `create_per_document` | Claimed |
| `GET/POST/PATCH /api/mdx/ldt*`, milestones, `/ldt-phase-summary` (7) | `mdx-ldt.ts` | Laboratory-developed test inventory and phase history | `register_ldt` | check |
| `POST /api/mdx/cdx/pairings/:id/concordance`, `GET/PATCH /api/mdx/cdx/concordance/:id`; `POST /api/mdx/clia/:id/{apply,grant}-waiver` | `mdx-cdx.ts`, `mdx-clia.ts` | CDx concordance; CLIA waiver steps | `categorize_clia_complexity` | Claimed |
| `POST /api/ivdr/cdx-workflows`, `PUT …/:id/status`, `/history`; `PUT /api/ivdr/validations/:id/parameters`, `/history`; `PUT /clinical-evidence/:id/results`, `/history`; `PUT /gspr-checklist/:projectId/requirements/:reqId`; `POST /submission-package/:projectId`, `/status`; `GET /eudamed-export/:projectId`; `GET /classify/:id/report` (13) | `ivdr-routes.ts` | IVDR workflow writes: GSPR item updates, submission package, **EUDAMED export**, classification report | partial | Claimed |
| `POST /api/udi-ivdr/udi/validate-di`, `/udi/gudid-completeness`, `/ivdr/performance-evaluation`; `POST /api/mdx/udi/:id/submit-gudid` | `udi-ivdr.ts`, `mdx-udi.ts` | UDI-DI check digit, GUDID completeness, GUDID submit | — | check |
| `POST /api/device-classification/samd-risk`, `/iec62304-class` | `device-classification.ts` | IMDRF SaMD category, IEC 62304 class | — | check |
| `POST /api/human-factors/hfe-completeness`, `/use-related-risk` | `human-factors.ts` | HFE/UE completeness and use-related risk engines | — | Claimed |
| `GET /api/postmarket-surveillance/maude`, `/recalls`; `POST …/maude/aggregate`, `/recalls/summarize` | `postmarket-surveillance.ts` | **openFDA MAUDE and recall signal aggregation** | — | check |
| `PATCH /api/mdx/clinical-sites/:siteId`, `/clinical-deviations/:devId`, `/clinical-endpoints/:epId`, `/clinical-aes/:aeId`; `GET/POST /api/mdx/clinical-studies/:id/aes` | `mdx-clinical-studies.ts` | Device clinical-study site, deviation, endpoint and AE edits | — | Claimed |
| `GET /api/mdx/analytics/{portfolio,submissions,cycle-times,blockers,clinical,ana-usage}` | `mdx-analytics.ts` | Organisation-wide device analytics facets (orphaned by `970bc3637`) | — | **Refused** (unclaimed) |
| 35 × `/api/submission-ops/*`: blockers, workload, hotspots, approval bottlenecks, due-soon, digests, **command-center**, automation runs, policies, packages, sections, milestones, readiness history, publish, assemble, preflight | `server/routes/submission-ops.ts` | Submission operations command centre. Orphaned by `041880cbd`, `776d9da46` and `2168fd569`; `packages`, `assemble` and `preflight` were also dropped by Gateway transmittals before 10-30. | partial | `blockers`: **refused**. `packages` and `artifact-section-map`: claimed. The rest: check. |
| `POST /api/510k/estar/scaffold-field-map`, `/registration/assess` | `510k-estar-routes.ts` | eSTAR field-map scaffold; establishment-registration check | — | Claimed |
| `GET /api/ivd-knowledge*` (6) | `ivd-knowledge.ts` | IVD knowledge base | — | check |
| `/api/gspr/programs/:id/documents*`, `/documents/:id/{validate,approve,supersede}` | `gspr-postmarket.ts` | A **duplicate** of `/api/post-market/programs/:id/documents`, which is called | — | — |

### Reporting & analytics

| Route(s) | Handler | What it does | Production |
|---|---|---|---|
| `GET/POST/PATCH /api/report-os/program-groups*`, `GET/POST …/:id/snapshots` | `server/routes/report-os.ts` | **Portfolio groups**: cross-project roll-ups with snapshots | unmapped, so refused (`ui-surface-registry.ui-v2.ts:776-784`) |
| `GET/POST /api/report-os/deliveries` | same | Report delivery (distribution) records | refused |
| `GET /api/report-os/taxonomy`, `/health` | same | Report taxonomy; health | refused |
| `GET /api/insights/quality`, `POST /api/insights/predictions` | `report-os-insights.ts` | Quality insights; predictions (forbidden under Rule 2 if it is a model figure) | check |
| `GET /api/intelligent-reports/catalog/*`, `/:id/seal-events`, `/:id/supersede`, `/:id/drift-check`, `/:id/compliance-validation` | `intelligent-reports.ts` | The report-governance register (sealed reports). FUNCTION_PARITY notes that drift-check and compliance-validation skip the ownership check. | `report-governance`: out of scope, so refused |
| `GET /api/csr-real-data/all`, `/stats`; `POST /api/analytics/upload-protocol` | `csr-analytics.ts`, `analytics-routes.ts` | CSR corpus statistics; protocol upload analysis | check |

### Biostatistics

| Route(s) | Handler | What it does | AnA |
|---|---|---|---|
| `/api/biostat/continuum/*` (8): initialize, threads, SAP, analysis specs, **TLF shells**, results, **CSR sections** | `server/routes/biostatPlatform.ts` | The protocol-to-SAP-to-TLF-to-CSR statistical thread | partial |
| `/api/biostat/sap/*` (7): create, comment, resolve, **amendment**, **lock**, versions, audit trail | same | A governed SAP with review comments and lock | — |
| `/api/biostat/estimand/*` (4) | same | ICH E9(R1) estimand definition and validation | statistical-design tools |
| `/api/biostat/external-control/*` (5) | same | External or synthetic control arm search, synthesis and regulatory package | — |
| `/api/biostat/design-optimizer/*` (2), `/api/biostat/judgment/*` (3), `GET /api/biostat/region-rules/catalog` | `biostatPlatform.ts`, `biostat-design-stats.ts` | Design optimiser, judgment artefacts, regional rules | — |
| `POST /api/ana-biostats/{judge,compute-enhanced,multiplicity,missing-data-impact,sme-route}`, `GET /sme-agents` | `ana-biostats.ts` | Multiplicity, missing-data impact, SME routing | `analyze_missing_data_impact` and others |
| `POST /api/statistical-defensibility/{endpoint-quality,multiplicity,reviewer-risks}` | `statistical-defensibility.ts` | Defensibility sub-assessments (only `/assess` is called) | `assess_statistical_defensibility` |

### Risk-based monitoring

| Route(s) | Handler | What it does |
|---|---|---|
| `GET /api/mdx/rbm-data-runs` | `mdx-rbm-data.ts` | History of RBM data import runs |
| `GET /api/protocol-risks/documents/:id/register` | `protocol-risks.ts` | A protocol's risk register |

RBM is otherwise fully wired: none of the 38 `mdx-rbm.ts` routes is without a caller.

### AnA

| Route(s) | Handler | What it does |
|---|---|---|
| `/api/ana/guidance/*` (10): scan, alerts, acknowledge, resolve, bulk, catalog, webhook | `server/routes/ana-features.ts` | **Guidance-change watch**: alerts when FDA, EMA or ICH guidance changes affect a project |
| `/api/ana/consistency/*` (4) | same | Cross-document consistency scan and alerts |
| `/api/ana/citations/*` (19): health, trends, graph, gaps-by-rule, section coverage, snapshot, diff, readiness impact, DOCX export | same | Citation health and readiness impact per project |
| `/api/ana/authoring-plan*` (5), `/api/ana/submission-chat*` (6) | same | AnA authoring plans (execute and reject); submission-chat rewrite proposals |
| `GET /api/ana/projects/readiness-overview`, `/:id/readiness-aggregate`, `/:id/therapeutic-context` | same | Readiness roll-ups |
| `GET /api/ana-ri/kernel/{metrics,decisions}`, `/observability*`, `/since-last-visit`, `/commands`, `/deficiencies`, `/rubric`; `POST /validate-draft`, `/evaluate`, `/seal-verified-version`; `/plan/:id/{advance,execute-next,protocol}`; `/documents/:id/lineage-dossier(.xml)` | `server/routes/ana-ri/*.ts` | Kernel metrics, "since your last visit", draft validation, plan stepping, lineage dossier export |
| `GET /api/ana/platform/{capabilities,entitlements}`, `PATCH /ai-config`; `GET/PUT /api/ana-tool-policy` | `ana-platform-control.ts`, `ana-tool-policy.ts` | Organisation AI configuration and tool policy |
| `/api/ana-cortex/*` and `/api/ana-1-0-ri-cortex/*` (20); `/api/claude/{draft/stream,gap-analysis,vision,quick,agent,tools,models}` | `ana-cortex.ts`, `ana-intelligence.ts` | Legacy AnA endpoints (duplicate mounts) |
| `GET /api/mdx/ana-drafts`, `/rollup` | `mdx-ana-drafts.ts` | AnA draft register and acceptance roll-up (the device portfolio reads the same data on the server) |

---

## 4. Recommendation: restore order, as a paying QA/RA customer would rank it, and how

**Method: re-add or re-wire, do not revert.**
- Of the 38 commits simulated, 34 conflict with HEAD:
  - the fold commits by 7 to 41 files each;
  - `a65f886a7` by 14;
  - `e39cc0d59` by 3;
  - the Quality restyle by 2 to 12.
- The fold commits also amended catalogue migrations in place (Rule 1) and the grant-carry table (`server/services/entitlements/folded-module-successors.ts`). A whole revert would re-seed deprecated modules and break the grant carry.
- **Safe to revert whole: `b61c5b088` only** (Q7: the change-control template buttons; 0 conflicts).
- `91baf7d96`, `df4e7013a` and `e3131458b` also revert cleanly, but they removed nothing a user needs. Do not revert them.

| Rank | Restore | Why a customer ranks it here | How | Effort |
|---|---|---|---|---|
| 1 | **Q1**: Quality reads the organisation by default | The first screen a QA buyer opens. Empty SOP and CAPA registers make the product look broken. | In `quality/registerContext.ts`, invert the default: read the organisation unless the person narrowed it (`?quality=project`), keep "Show {project} only", and keep the scoped empty-state wording for the narrowed case. Adjust `qualityScope.test.tsx` and `QualityWorkArea.test.tsx`. | S |
| 2 | **Q2/Q3**: governed actions visible in the row | "Approve", "Revise", "Record review", "Retire" and "Controlled copy" are the QMS workflow. Hidden behind "More", they read as missing. | In `SopRegisterRow.tsx` and `RegisterBody`, render the 2–3 actions valid for the state inline and keep "More" for the rest. Handlers are unchanged. | S |
| 3 | **D8**: post-market panels visible | Post-market surveillance is a regulatory obligation every device customer must show. Four "Shown once…" placeholders read as unfinished. | Have `GET /api/mdx/postmarket` take `program_id` (it already joins `regulatory_programs`) and report `meta.scope`. Replace the constant `SURVEILLANCE_KEYED_TO_PROJECT` with a check of the scope, as Engineering does since `230b6dfa0`. | M |
| 4 | **Complaints and MDR register** (§3, never reached; not a regression) | Complaint handling and MDR reporting are core to a device QMS. Today they exist only through AnA and the CER's read-only list. | Add a "Complaints" tab to Quality using the existing register kit (`qmsRegisterKit.tsx`, as CAPA did in `f9f0dee12`) over `/api/capa-mdr/complaints` and `/mdr-events`. Claim `/api/capa-mdr/complaints` and `/mdr-events` on `quality`. | M |
| 5 | **D1/D2**: "Risk management" and "Design controls" reachable by name, with an organisation view | The risk file and the DHF are what notified bodies and FDA inspect. Users look for them by name, not under "Engineering", and existing records with no project are stranded. | Cheapest: ⌘K and project doors that open `device-engineering` focused on the panel (`engineeringPanelTarget.ts`), plus `requireProject: false` when no project is open, so unscoped rows show. Fuller: re-add the 51-line `Risk.tsx` and `DesignControls.tsx` wrappers from `303f49012^`; remove the `risk` and `design-controls` aliases in `registryModel.ts`; restore the registry and launch-scope rows; amend the catalogue rows in place (Rule 1, `db/migrations/20260810…`, `20260823…`, `migrations/20260814j…`). Re-adding is a product decision: the folds followed P-61. | S–M |
| 6 | **Q4/Q5**: QMS figures and the authoring library visible at a glance | Sells the QMS in a demo, and shows what can be authored | Re-add a figures row (no cards) above the register from the `Kpi` code at `a65f886a7^`, and list the nine types as a quiet link list. **Founder decision**: this conflicts with his 2026-11-06 "no separate apps or cards". | S |
| 7 | **D4**: blockers across all device filings | An RA manager's weekly view | Aggregate `assessEstarFilingReadiness` over the tracked filings the reader can open, not `c2c_blockers`. Show it in Submission Center or the device section of Reporting. Reverses part of P-61 item 2, so it needs a founder decision. | M |
| 8 | **IVDR binder and pack builder** (§3) | Notified Body technical-documentation packs, already built server-side with a worker | A panel on `device-diagnostics` over `/api/ivdr/binder` and `/packs` | L |
| 9 | **D3** IVD per-study items and organisation board; **D7** project-scoped analytics facets | Nice to have | Organisation mode on `useIvdReadiness`; claim and project-scope `/api/mdx/analytics/*` under `insights` | S–M |
| 10 | **A1**: AnA memory governance (verify and supersede) | Low until something writes memory atoms | Rebuild on the profile store if wanted | M |

**Do not restore:**
- Kit fixtures and browser-derived figures: Overview's "Blockers open" and "In flight" figures, and analytics peer, velocity and usage data. These were honestly dropped.
- The browser statistics engine (`d1a742b5d`).
- `plan_ind_module_authoring` and `assess_benefit_risk`: they produced model-supplied figures, which Rule 2 forbids.

---

## Appendix A: rail and registry history (these areas)

**`RAIL_CORE`** (`client/src/concept2cure/v2/registryModel.ts`):

| Date | Commit | Rail entries |
|---|---|---|
| 2026-10-15 | `4b7234944` | New conversation, Projects, Vault, Submission Center, **Quality**, **Reporting & analytics**, My work, Conversation |
| 2026-10-30 | `bd1338c25` | Home, Projects, Tasks, Communication, Vault, then under "Work areas": CMC, **RBM**, **Quality**, **Reporting** (Submission Center left on 10-25) |
| HEAD | `8c7664b35` | As 2026-10-30, plus Submission Center back and **Biostatistics** added (2026-11-06) |

No destination in these areas left the rail. There was never a device rail in v2: device screens are reached from a device project (`ProjectMdxWorkflow.tsx`) or ⌘K, and show "Open a project to continue" without one.

**Surface ids removed from the registry** (`ui-surface-registry.ts` and `.ui-v2.ts`; 126 at 2026-10-15, 109 at 2026-10-30, 106 at HEAD):
- in these areas: `risk`, `design-controls`, `ivd-completeness`, `device-analytics`, `device-workstream`, `device-submission`, `device-validation`, `device-tasks`, `device-vault`, `ana-memory`, `part11-console`, `biostat-workbench`;
- elsewhere: `agency-meetings`, `artifacts-center`, `billing`, `dossier`, `dossier-map`, `ectd-publishing`, `filings-catalog`, `setup`.

All of them are `DEEP_LINK_ALIASES` now (`registryModel.ts`).

**Launch scope** (production): 32 surfaces at 2026-10-15, 44 at 2026-10-30, 43 at HEAD.
- The device screens joined on 2026-10-23 (`62a8d5e7f`). Before that every device screen was locked in production.
- Risk and design-controls were in launch scope only from 2026-10-23 to 2026-10-29.

## Appendix B: raw heuristic list of routes with no client caller (§3 is the checked subset)

Totals by area: Device & IVD 160 of 278 extracted routes; AnA 102 of 170; Biostatistics 41 of 89; Reporting 26 of 58; Quality 15 of 120; RBM 2 of 51. Some entries may be false positives where a client builds the path at run time from variables. The loosest level can also credit a caller wrongly: it counts `POST /api/capa-mdr/complaints` and the complaint and MDR transitions as called (through the generic `capaWrite` helper), but §3 shows by hand that they are not.

### Device & IVD: 160 of 278 routes with no caller found

- `server/routes/510k-estar-routes.ts` (2): `POST /api/510k/estar/scaffold-field-map`; `POST /api/510k/estar/registration/assess`
- `server/routes/device-classification.ts` (2): `POST /api/device-classification/samd-risk`; `POST /api/device-classification/iec62304-class`
- `server/routes/device-projects.ts` (1): `GET /api/device-projects`
- `server/routes/human-factors.ts` (2): `POST /api/human-factors/hfe-completeness`; `POST /api/human-factors/use-related-risk`
- `server/routes/ivd-knowledge.ts` (6): `GET /api/ivd-knowledge`; `GET /api/ivd-knowledge/entries`; `GET /api/ivd-knowledge/entries/:id`; `GET /api/ivd-knowledge/entries/:id/related`; `GET /api/ivd-knowledge/domains`; `GET /api/ivd-knowledge/topics`
- `server/routes/ivd-lifecycle.ts` (45): `POST /api/ivd-lifecycle/classify/ivdr`; `POST /api/ivd-lifecycle/cdx/pair`; `POST /api/ivd-lifecycle/review-simulation`; `POST /api/ivd-lifecycle/review-simulation/distribution`; `POST /api/ivd-lifecycle/portfolio/simulate`; `POST /api/ivd-lifecycle/diagnostic-accuracy/montecarlo`; `POST /api/ivd-lifecycle/evidence/sensitivity`; `POST /api/ivd-lifecycle/time-to-market`; `POST /api/ivd-lifecycle/program-plan`; `GET /api/ivd-lifecycle/capabilities`; `POST /api/ivd-lifecycle/scenarios/compare`; `POST /api/ivd-lifecycle/program-plan/brief`; `POST /api/ivd-lifecycle/decision/emv`; `POST /api/ivd-lifecycle/decision/go-no-go`; `POST /api/ivd-lifecycle/benchmark`; `POST /api/ivd-lifecycle/decision/evpi`; `POST /api/ivd-lifecycle/risk-register/simulate`; `POST /api/ivd-lifecycle/portfolio/batch`; `POST /api/ivd-lifecycle/coverage/simulate`; `POST /api/ivd-lifecycle/calibration/backtest`; `POST /api/ivd-lifecycle/drift/detect`; `POST /api/ivd-lifecycle/stability/real-time`; `POST /api/ivd-lifecycle/stability/accelerated`; `POST /api/ivd-lifecycle/carryover`; `POST /api/ivd-lifecycle/hook-effect`; `POST /api/ivd-lifecycle/recovery`; `POST /api/ivd-lifecycle/cutoff`; `POST /api/ivd-lifecycle/traceability`; `POST /api/ivd-lifecycle/scientific-validity`; `POST /api/ivd-lifecycle/software/safety-class`; `POST /api/ivd-lifecycle/software/sdlc`; `POST /api/ivd-lifecycle/software/sbom`; `POST /api/ivd-lifecycle/software/cybersecurity`; `POST /api/ivd-lifecycle/change/fda-510k`; `POST /api/ivd-lifecycle/change/eu-significant`; `POST /api/ivd-lifecycle/lot-release`; `POST /api/ivd-lifecycle/signal/disproportionality`; `POST /api/ivd-lifecycle/authoring/emdr`; `POST /api/ivd-lifecycle/authoring/mir`; `POST /api/ivd-lifecycle/authoring/fsn`; `POST /api/ivd-lifecycle/registration/fda`; `POST /api/ivd-lifecycle/registration/eu`; `POST /api/ivd-lifecycle/declaration-of-conformity`; `GET /api/ivd-lifecycle/pathways`; `POST /api/ivd-lifecycle/pathways/readiness`
- `server/routes/ivdr-binder-routes.ts` (12): `GET /api/ivdr/binder`; `POST /api/ivdr/binder/claim`; `POST /api/ivdr/binder/claim/:claimId/evidence`; `POST /api/ivdr/binder/evidence/:evidenceId/remove`; `POST /api/ivdr/binder/claim/:claimId/approve`; `POST /api/ivdr/binder/claim/:claimId/revoke`; `GET /api/ivdr/packs/readiness`; `POST /api/ivdr/packs/build`; `GET /api/ivdr/packs/build/jobs/:jobId`; `GET /api/ivdr/packs`; `GET /api/ivdr/packs/:packId`; `GET /api/ivdr/packs/:packId/download`
- `server/routes/ivdr-routes.ts` (13): `GET /api/ivdr/classify/:id/report`; `PUT /api/ivdr/validations/:id/parameters`; `GET /api/ivdr/validations/:id/history`; `PUT /api/ivdr/clinical-evidence/:id/results`; `GET /api/ivdr/clinical-evidence/:id/history`; `POST /api/ivdr/cdx-workflows`; `GET /api/ivdr/cdx-workflows`; `PUT /api/ivdr/cdx-workflows/:id/status`; `GET /api/ivdr/cdx-workflows/:id/history`; `PUT /api/ivdr/gspr-checklist/:projectId/requirements/:reqId`; `POST /api/ivdr/submission-package/:projectId`; `GET /api/ivdr/submission-package/:projectId/status`; `GET /api/ivdr/eudamed-export/:projectId`
- `server/routes/mdx-cdx.ts` (3): `POST /api/mdx/cdx/pairings/:id/concordance`; `GET /api/mdx/cdx/concordance/:id`; `PATCH /api/mdx/cdx/concordance/:id`
- `server/routes/mdx-clia.ts` (2): `POST /api/mdx/clia/:id/apply-waiver`; `POST /api/mdx/clia/:id/grant-waiver`
- `server/routes/mdx-clinical-studies.ts` (6): `PATCH /api/mdx/clinical-sites/:siteId`; `PATCH /api/mdx/clinical-deviations/:devId`; `GET /api/mdx/clinical-studies/:id/aes`; `POST /api/mdx/clinical-studies/:id/aes`; `PATCH /api/mdx/clinical-aes/:aeId`; `PATCH /api/mdx/clinical-endpoints/:epId`
- `server/routes/mdx-ivd-performance.ts` (9): `GET /api/mdx/ivd/analytical`; `POST /api/mdx/ivd/analytical`; `GET /api/mdx/ivd/analytical/:id`; `PATCH /api/mdx/ivd/analytical/:id`; `GET /api/mdx/ivd/clinical`; `POST /api/mdx/ivd/clinical`; `GET /api/mdx/ivd/clinical/:id`; `PATCH /api/mdx/ivd/clinical/:id`; `GET /api/mdx/ivd/performance-summary/:programId`
- `server/routes/mdx-ivdr.ts` (4): `GET /api/mdx/ivdr/per`; `POST /api/mdx/ivdr/per`; `GET /api/mdx/ivdr/per/:id`; `PATCH /api/mdx/ivdr/per/:id`
- `server/routes/mdx-ldt.ts` (7): `GET /api/mdx/ldt`; `POST /api/mdx/ldt`; `GET /api/mdx/ldt/:id`; `PATCH /api/mdx/ldt/:id`; `POST /api/mdx/ldt/:id/milestones`; `PATCH /api/mdx/ldt/milestones/:msId`; `GET /api/mdx/ldt-phase-summary`
- `server/routes/mdx-risk-management.ts` (3): `POST /api/mdx/risk-items/:id/reopen`; `PATCH /api/mdx/risk-controls/:controlId`; `GET /api/mdx/risk-summary/:programId`
- `server/routes/mdx-udi.ts` (1): `POST /api/mdx/udi/:id/submit-gudid`
- `server/routes/postmarket-surveillance.ts` (4): `POST /api/postmarket-surveillance/maude/aggregate`; `POST /api/postmarket-surveillance/recalls/summarize`; `GET /api/postmarket-surveillance/maude`; `GET /api/postmarket-surveillance/recalls`
- `server/routes/submission-ops.ts` (35): `GET /api/submission-ops/packages`; `POST /api/submission-ops/packages`; `GET /api/submission-ops/packages/:packageId`; `GET /api/submission-ops/packages/:packageId/sections`; `POST /api/submission-ops/packages/:packageId/sections`; `PATCH /api/submission-ops/packages/:packageId/sections/:sectionId`; `DELETE /api/submission-ops/packages/:packageId/sections/:sectionId`; `POST /api/submission-ops/artifact-section-map`; `DELETE /api/submission-ops/artifact-section-map/:mappingId`; `GET /api/submission-ops/sections/:sectionDbId/artifacts`; `GET /api/submission-ops/packages/:packageId/milestones`; `POST /api/submission-ops/packages/:packageId/milestones`; `GET /api/submission-ops/policies`; `POST /api/submission-ops/policies`; `PUT /api/submission-ops/policies/:policyId`; `DELETE /api/submission-ops/policies/:policyId`; `POST /api/submission-ops/policies/resolve`; `GET /api/submission-ops/packages/:packageId/readiness`; `GET /api/submission-ops/packages/:packageId/readiness-history`; `GET /api/submission-ops/blockers`; `PATCH /api/submission-ops/blockers/:blockerId`; `GET /api/submission-ops/approval-bottlenecks`; `GET /api/submission-ops/workload`; `GET /api/submission-ops/hotspots`; `POST /api/submission-ops/automation/run`; `GET /api/submission-ops/automation/runs`; `GET /api/submission-ops/automation/runs/:runId/actions`; `GET /api/submission-ops/due-soon`; `GET /api/submission-ops/digests`; `POST /api/submission-ops/digests/:digestId/read`; `GET /api/submission-ops/command-center`; `POST /api/submission-ops/packages/:packageId/publish`; `PUT /api/submission-ops/packages/:packageId/regulatory-identifiers`; `POST /api/submission-ops/packages/:packageId/assemble`; `POST /api/submission-ops/packages/:packageId/preflight`
- `server/routes/udi-ivdr.ts` (3): `POST /api/udi-ivdr/udi/validate-di`; `POST /api/udi-ivdr/udi/gudid-completeness`; `POST /api/udi-ivdr/ivdr/performance-evaluation`

### Biostatistics: 41 of 89 routes with no caller found

- `server/routes/ana-biostats.ts` (6): `POST /api/ana-biostats/judge`; `POST /api/ana-biostats/compute-enhanced`; `POST /api/ana-biostats/multiplicity`; `POST /api/ana-biostats/missing-data-impact`; `POST /api/ana-biostats/sme-route`; `GET /api/ana-biostats/sme-agents`
- `server/routes/biostat-bridge.ts` (1): `GET /api/biostat-bridge/filing-placements`
- `server/routes/biostat-design-stats.ts` (1): `GET /api/biostat/region-rules/catalog`
- `server/routes/biostatPlatform.ts` (30): `POST /api/biostat/continuum/initialize`; `GET /api/biostat/continuum/threads`; `GET /api/biostat/continuum/:threadId`; `PUT /api/biostat/continuum/:threadId/sap`; `PUT /api/biostat/continuum/:threadId/analysis-specs`; `PUT /api/biostat/continuum/:threadId/tlf-shells`; `POST /api/biostat/continuum/:threadId/results`; `GET /api/biostat/continuum/:threadId/csr-sections`; `POST /api/biostat/design-optimizer/recommend`; `GET /api/biostat/design-optimizer/regulatory-precedents/:indication`; `POST /api/biostat/estimand/define`; `POST /api/biostat/estimand/:estimandId/methods`; `GET /api/biostat/estimand/regulatory-examples/:indication`; `POST /api/biostat/estimand/:estimandId/validate`; `POST /api/biostat/sap/create`; `POST /api/biostat/sap/:sapVersionId/comment`; `POST /api/biostat/sap/:sapVersionId/resolve-comment/:commentId`; `POST /api/biostat/sap/amendment`; `POST /api/biostat/sap/:sapVersionId/lock`; `GET /api/biostat/sap/:threadId/audit-trail`; `GET /api/biostat/sap/version/:sapVersionId`; `GET /api/biostat/sap/:threadId/versions`; `POST /api/biostat/external-control/search`; `POST /api/biostat/external-control/synthesize`; `POST /api/biostat/external-control/:controlId/validate`; `GET /api/biostat/external-control/:controlId/regulatory-package`; `POST /api/biostat/external-control/ingest-arm`; `POST /api/biostat/judgment/analyze`; `POST /api/biostat/judgment/role-interpretation`; `POST /api/biostat/judgment/generate-artifact`
- `server/routes/statistical-defensibility.ts` (3): `POST /api/statistical-defensibility/endpoint-quality`; `POST /api/statistical-defensibility/multiplicity`; `POST /api/statistical-defensibility/reviewer-risks`

### AnA: 102 of 170 routes with no caller found

- `server/routes/ana-cortex.ts` (20): `GET /api/ana-1-0-ri-cortex/health`; `GET /api/ana-cortex/health`; `POST /api/ana-1-0-ri-cortex/regulatory-analysis`; `POST /api/ana-cortex/regulatory-analysis`; `POST /api/ana-1-0-ri-cortex/ich-e6r3-guidance`; `POST /api/ana-cortex/ich-e6r3-guidance`; `GET /api/ana-1-0-ri-cortex/capabilities`; `GET /api/ana-cortex/capabilities`; `POST /api/ana-1-0-ri-cortex/harvest/10k`; `POST /api/ana-cortex/harvest/10k`; `POST /api/ana-1-0-ri-cortex/csr/index`; `POST /api/ana-cortex/csr/index`; `POST /api/ana-1-0-ri-cortex/observation-terms/csr`; `POST /api/ana-cortex/observation-terms/csr`; `GET /api/ana-1-0-ri-cortex/observation-terms`; `GET /api/ana-cortex/observation-terms`; `POST /api/ana-1-0-ri-cortex/csr/evidence-context`; `POST /api/ana-cortex/csr/evidence-context`; `POST /api/ana-1-0-ri-cortex/chat`; `POST /api/ana-cortex/chat`
- `server/routes/ana-features.ts` (48): `GET /api/ana/intelligence-feed`; `POST /api/ana/gap-analysis`; `DELETE /api/ana/memory/:projectId/:memoryId`; `POST /api/ana/submission-chat/preview-rewrite`; `POST /api/ana/submission-chat/apply-rewrite`; `GET /api/ana/citations/gap-rules`; `GET /api/ana/citations/gap-rules/:sectionCode`; `GET /api/ana/citations/:artifactId`; `GET /api/ana/citations/projects/:projectId/rollup`; `POST /api/ana/citations/projects/:projectId/batch-run`; `GET /api/ana/projects/readiness-overview`; `GET /api/ana/projects/:projectId/readiness-aggregate`; `GET /api/ana/projects/:projectId/therapeutic-context`; `PATCH /api/ana/projects/:projectId/therapeutic-area`; `POST /api/ana/consistency/projects/:projectId/scan`; `GET /api/ana/consistency/alerts`; `POST /api/ana/consistency/alerts/:alertId/acknowledge`; `POST /api/ana/consistency/alerts/:alertId/resolve`; `POST /api/ana/guidance/upsert-version`; `POST /api/ana/guidance/scan`; `GET /api/ana/guidance/alerts`; `POST /api/ana/guidance/alerts/:alertId/acknowledge`; `POST /api/ana/guidance/alerts/:alertId/resolve`; `GET /api/ana/guidance/catalog`; `POST /api/ana/guidance/alerts/bulk-acknowledge`; `POST /api/ana/guidance/alerts/bulk-resolve`; `POST /api/ana/guidance/webhook`; `POST /api/ana/citations/:artifactId/export.docx`; `GET /api/ana/citations/health`; `GET /api/ana/citations/projects/:projectId/trends`; `GET /api/ana/citations/projects/:projectId/section-coverage`; `GET /api/ana/citations/projects/:projectId/graph`; `GET /api/ana/citations/:artifactId/expectations`; `POST /api/ana/citations/runs/prune`; `GET /api/ana/citations/projects/:projectId/gaps-by-rule`; `GET /api/ana/citations/projects/:projectId/snapshot`; `GET /api/ana/citations/projects/:projectId/diff`; `GET /api/ana/citations/runs/:runId/diff`; `GET /api/ana/citations/projects/:projectId/readiness-impact`; `GET /api/ana/submission-chat/proposals`; `GET /api/ana/submission-chat/proposals/:proposalId`; `POST /api/ana/submission-chat/proposals/sweep`; `POST /api/ana/submission-chat`; `POST /api/ana/authoring-plan`; `GET /api/ana/authoring-plan`; `GET /api/ana/authoring-plan/:planId`; `PATCH /api/ana/authoring-plan/:planId/reject`; `PATCH /api/ana/authoring-plan/:planId/execute`
- `server/routes/ana-intelligence.ts` (8): `POST /api/claude/draft/stream`; `POST /api/claude/gap-analysis`; `POST /api/claude/vision`; `POST /api/claude/quick`; `POST /api/claude/agent`; `GET /api/claude/tools`; `GET /api/claude/health`; `GET /api/claude/models`
- `server/routes/ana-mdx-context.ts` (1): `GET /api/ana/mdx-context-snapshot`
- `server/routes/ana-platform-control.ts` (3): `GET /api/ana/platform/capabilities`; `GET /api/ana/platform/entitlements`; `PATCH /api/ana/platform/ai-config`
- `server/routes/ana-tool-policy.ts` (2): `GET /api/ana-tool-policy`; `PUT /api/ana-tool-policy`
- `server/routes/mdx-ana-drafts.ts` (2): `GET /api/mdx/ana-drafts`; `GET /api/mdx/ana-drafts/rollup`
- `server/routes/ana-ri/kernel.ts` (2): `GET /api/ana-ri/kernel/metrics`; `GET /api/ana-ri/kernel/decisions`
- `server/routes/ana-ri/lineage.ts` (2): `GET /api/ana-ri/documents/:artifactId/lineage-dossier.xml`; `GET /api/ana-ri/documents/:artifactId/lineage-dossier`
- `server/routes/ana-ri/lookups.ts` (3): `POST /api/ana-ri/validate-draft`; `GET /api/ana-ri/deficiencies`; `GET /api/ana-ri/rubric`
- `server/routes/ana-ri/plan.ts` (4): `POST /api/ana-ri/plan/:planRunId/advance`; `POST /api/ana-ri/plan/:planRunId/execute-next`; `POST /api/ana-ri/plan/:planRunId/protocol`; `GET /api/ana-ri/plan/:planRunId/protocol`
- `server/routes/ana-ri/utility.ts` (7): `GET /api/ana-ri/health`; `POST /api/ana-ri/evaluate`; `GET /api/ana-ri/observability`; `GET /api/ana-ri/observability/log`; `GET /api/ana-ri/commands`; `GET /api/ana-ri/since-last-visit`; `POST /api/ana-ri/seal-verified-version`

### Reporting & analytics: 26 of 58 routes with no caller found

- `server/routes/analytics-routes.ts` (1): `POST /api/analytics/upload-protocol`
- `server/routes/csr-analytics.ts` (2): `GET /api/csr-real-data/all`; `GET /api/csr-real-data/stats`
- `server/routes/intelligent-reports.ts` (7): `GET /api/intelligent-reports/catalog/domains`; `GET /api/intelligent-reports/catalog/regulatory-bodies`; `GET /api/intelligent-reports/catalog/regulations/:domain`; `GET /api/intelligent-reports/:reportId/seal-events`; `POST /api/intelligent-reports/:reportId/supersede`; `GET /api/intelligent-reports/:reportId/drift-check`; `GET /api/intelligent-reports/:reportId/compliance-validation`
- `server/routes/mdx-analytics.ts` (5): `GET /api/mdx/analytics/portfolio`; `GET /api/mdx/analytics/cycle-times`; `GET /api/mdx/analytics/blockers`; `GET /api/mdx/analytics/clinical`; `GET /api/mdx/analytics/ana-usage`
- `server/routes/report-os-insights.ts` (2): `GET /api/insights/quality`; `POST /api/insights/predictions`
- `server/routes/report-os.ts` (9): `GET /api/report-os/taxonomy`; `GET /api/report-os/program-groups`; `POST /api/report-os/program-groups`; `PATCH /api/report-os/program-groups/:id`; `GET /api/report-os/program-groups/:id/snapshots`; `POST /api/report-os/program-groups/:id/snapshots`; `GET /api/report-os/deliveries`; `POST /api/report-os/deliveries`; `GET /api/report-os/health`

### Quality / QMS: 15 of 120 routes with no caller found

- `server/routes/audit-compliance-reviews.ts` (1): `POST /api/audit/reviews/:id/sign`
- `server/routes/capa-mdr.ts` (4): `GET /api/capa-mdr/mdr-events`; `POST /api/capa-mdr/mdr-events`; `GET /api/capa-mdr/mdr-events/:id`; `GET /api/capa-mdr/vigilance`
- `server/routes/citi-training.ts` (1): `POST /api/citi-training/personnel/:id/import`
- `server/routes/part11-compliance.ts` (7): `GET /api/part11/signatures/by-target`; `GET /api/part11/signatures/:documentId`; `GET /api/part11/signatures/:signatureId/manifest`; `POST /api/part11/authority-check`; `GET /api/part11/validation`; `GET /api/part11/health`; `GET /api/part11/audit-trail/seal-integrity`
- `server/routes/quality-management-api.ts` (2): `POST /api/quality/batch-validate`; `GET /api/quality/metrics/:cerProjectId`

### Risk-based monitoring: 2 of 51 routes with no caller found

- `server/routes/mdx-rbm-data.ts` (1): `GET /api/mdx/rbm-data-runs`
- `server/routes/protocol-risks.ts` (1): `GET /api/protocol-risks/documents/:id/register`
