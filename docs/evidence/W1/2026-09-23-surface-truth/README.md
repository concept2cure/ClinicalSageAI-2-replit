# D2 — the launch boundary on a fresh organisation, surface by surface

**Date:** 2026-09-23 · **Row:** D2 (Launch catalog) · **Workstream:** W1
**Status of this folder:** interim. The boundary sweep and the gate rule below
are complete. Fixes for the in-scope findings are in progress; this README is
updated with their dispositions when they land.

## What was run

Every routable surface (all 122 `SURFACE_VIEWS` keys) was opened by deep link
in headless Chromium as the organisation's admin, on an installation
provisioned from empty by `npm run up` at `d2f1c4fd3`:

| Setting | Value |
|---|---|
| `LAUNCH_SCOPE_ENFORCE` | `on` (the production default when unset) |
| `RLS_ENFORCE` | `on` |
| Runtime role | `app_service`, non-superuser, `NOBYPASSRLS` |
| Organisation | fresh org 1, no programs, no documents |

Per-surface result: `surface-gate-check.json` (what rendered, crashes,
exceptions, failed API calls).

## Result

- **122 / 122** captured; **0** crashed; **0** uncaught exceptions.
- **83 of 84** surfaces outside the launch scope render the
  *"not in this release"* panel on a deep link
  (`deep-link-pv-cockpit-enforced.png`).
- The 84th, `task-board`, is not a leak: `DEEP_LINK_ALIASES` resolves it to the
  in-scope `tasks` surface before the gate (`routing.ts`
  `surfaceIdFromLocation`). Same component, same verdict.

## The gap this found, and the gate that now closes it

The boundary held by construction, not because anything enforced it. The
server can lock only ids it knows (catalog rows and `UI_SURFACES`);
`LaunchScopeGate` renders a surface with no verdict. `ci:launch-scope` checked
that the scope is routable, never that the routable set is gated. A new
`SURFACE_VIEWS` key without a registry row would have rendered in production.

Rule 2c in `scripts/ci/check-launch-scope.mjs` now requires every routable key
outside the scope (after alias resolution) to be registered. Shown failing
first: `ci-launch-scope-selftest.txt` — the selftest routes an unregistered key
in a copy of `surfaceViews.ts` and requires exit 1 naming it and only it.

## Findings

An earlier sweep of the same kind (enforcement off, older commit) produced 141
findings. They split by what production can reach:

- **55 on launch or shell surfaces** — reachable by a customer. Being verified
  and fixed; dispositions to follow here.
- **86 on out-of-scope surfaces** (5 critical, 27 high, 36 medium, 18 low) —
  not reachable in production with enforcement on. They are **not** fixed
  here: Rule 2 gives those surfaces no sessions. They are listed below so that
  any surface later admitted to the catalog arrives with its known defects.
  **All five critical findings are in this group.**

### Out-of-scope findings (must be resolved before that surface joins the catalog)

| # | Severity | Surface | Finding |
|---|---|---|---|
| 56 | critical | `biostatistics` | A worked-example preset is presented as 'your' drafted Sample Size Rationale, and the document says the example values were user-provided |
| 24 | critical | `device-diagnostics` | IVDR workbench shows 'Stage 4 of 7', with Intake, Classification and Analytical validation checked done, when no program exists |
| 23 | critical | `device-postmarket` | MDR-clock, CAPA and PSUR tiles and 'submissions in flight' are counted from a hard-coded empty array, not from any read |
| 93 | critical | `investigator-brochure` | IB reports 21% ready and marks Title Page, Confidentiality Statement and TOC READY for an org with no program, product or sponsor data |
| 73 | critical | `pv-cockpit` | PV cockpit reports 100% compliance and COMPLIANT for all five regulators on an org with no safety data |
| 57 | high | `biostatistics` | 'File it to the dossier' always says 'filed to the dossier', even with no project open and when the server reports the document is unbound |
| 33 | high | `device-510k` | eSTAR sections panel reads '0 sections · 0 blockers' whether the section read is idle, loading or failed |
| 34 | high | `device-510k` | Files tab files the tenant's live dossier under invented submission numbers (K-251401, P250048, IV-415, IVD-318) |
| 26 | high | `device-analytics` | 'Sample data — not your project' banner sits over the tenant's live KPIs, and no sample content is actually rendered |
| 32 | high | `device-cer` | CER safety-signal register shows '0 signals' when the read is idle or failed |
| 28 | high | `device-presub` | Pre-Sub 'Mine' filter matches only the demo program codes BX-204 and OR-801 |
| 29 | high | `device-presub` | Pre-Sub list blames filters for an empty org, and a failed /api/q-sub read looks the same |
| 31 | high | `device-submission` | Submission center ignores the package-list error; a failed read shows an all-zero pipeline |
| 27 | high | `device-tasks` | 'Mine' filter on the device task workbench is hard-wired to the fixture assignee 'JC' |
| 25 | high | `device-validation` | Green 'All programs filing-ready' with zero programs, beside a red 'Avg readiness 0%' |
| 30 | high | `device-vault` | Part 11 document vault never shows a failed read, and has no empty state |
| 94 | high | `etmf` | Any typed trial identifier gets a full TMF inspection verdict and readiness package, even when that trial does not exist |
| 60 | high | `filing-strategy` | Every filing-strategy read returns 500 (uuid column vs integer org id); the primary action 'Optimise sequence' fails |
| 97 | high | `global-ri` | 'Run capability' can never succeed for Regulatory pathway advisor or Cross-market strategy brief: the array input is sent as a string |
| 96 | high | `haq-manager` | No way to log the first agency round: 'Log question' is hidden until a round exists, and nothing in the codebase creates a round |
| 95 | high | `labeling-smpc` | Any user can mark an SmPC section 'final' with one click: no content, no signature, no reason for change, no audit; readiness counts that flag |
| 10 | high | `mission-control` | All 38 /api/mission-control endpoints are blocked by a 'static business data' flag, but the router only serves persisted data, and production cannot turn the flag on |
| 11 | high | `mission-control` | Hidden behind the gate: readiness returns fixed scores and false blockers, and it scores program ids that do not exist |
| 58 | high | `mission-control` | Mission Control's persisted, org-scoped API sits behind a 'static business data' flag that production refuses to enable, so the surface can never load in production |
| 59 | high | `mission-control` | Header states '0 in this organization' while the program read failed |
| 74 | high | `nda-cockpit` | NDA KPI strip shows "0% Application readiness" and "0 High RTF risk" directly under "Nothing has been assessed" |
| 75 | high | `nonclinical` | Module 2.6 builder marks "2.6.1 Introduction COMPLETE" on an org with no studies and no authored text |
| 76 | high | `nonclinical` | Live-derived "Today · your queue" carries a hard-coded SAMPLE badge |
| 77 | high | `nonclinical` | Starter chip asserts "the SEND LB dataset reject" exists on an org with zero studies |
| 4 | high | `orchestration` | Orchestration shows a failed program-discovery read as "No lead program is identified" and reports 0 of 0 runs it never read |
| 5 | high | `orchestration` | Program discovery goes through the enterprise-only portfolio rollup, so every non-enterprise org is told it has no lead program |
| 109 | high | `report-engine` | Analysis service returns 500, and the screen shows a finished 'evidence-based' protocol analysis instead of the error |
| 70 | medium | `biostatistics` | Page has no left gutter; content is flush against the nav rail |
| 21 | medium | `client-portal` | Client-portal access refusal (403) is shown as a temporary outage: 'temporarily unavailable. Please reload in a moment.' |
| 61 | medium | `client-portal` | A 403 permission refusal is shown as a transient outage ('Please reload in a moment') |
| 63 | medium | `clinical-ops` | Unconditional 'SAMPLE' badge on the 'Today · your queue' list, which now holds only live-derived items |
| 68 | medium | `cmc` | 'Advance the next section' with no sections sends AnA the malformed request 'Prepare §  for approval' |
| 67 | medium | `communication-center` | Primary action 'Review the inbox' does nothing: it switches to the tab that is already selected |
| 64 | medium | `coverage` | Customer-facing 'Codebase coverage' page exposes the internal API route map, branch name and repo paths, and claims 'Live · Backend link connected' from token presence alone |
| 0 | medium | `crl-library` | The CRL library says the evidence service 'didn't respond' and tells a signed-in user to 'sign in and retry', but the server answered with a 404 because the feature is switched off |
| 1 | medium | `crl-library` | With the feature flag off, only the nav rail hides crl-library; ⌘K, 'Browse all capabilities', the project workspace grid and the direct URL all still open it and land on the failure panel |
| 62 | medium | `crl-library` | A switched-off feature (404) is reported as 'service didn't respond — sign in and retry' to a signed-in user |
| 66 | medium | `csr-workflow` | ICH E3 board header columns do not line up with the rows |
| 65 | medium | `design-controls` | Page title breaks onto three lines ('Design controls' / '•' / 'DHF'), because inline dot icons render as block SVG |
| 35 | medium | `device-510k` | Predicate search panel says 'loading…' permanently when there is nothing to load |
| 36 | medium | `device-510k` | SE matrix header reads 'Subject device vs.' and '(PREDICATE)' with the names missing; both tables render headers with no body or empty state |
| 38 | medium | `device-analytics` | Every live blocker is shown with 'median age 0d'; the server hard-codes median 0 and trend 'flat' |
| 39 | medium | `device-engineering` | '0 hard blockers · 0 review-pending' is stated over a panel that says nothing was read |
| 40 | medium | `device-presub` | Pre-Sub KPIs over zero Q-Subs: red 'Commitments rolled 0%' beside green 'All integrated'; 'Avg days in feedback 0d' |
| 37 | medium | `device-validation` | 'Ask Claude to triage' sends 'Summarize the 3 blockers across my portfolio', a hard-coded count |
| 101 | medium | `human-factors` | HFE/UE surface cannot be started from the UI, and the page has no heading |
| 99 | medium | `inconsistency` | Disabled primary actions look fully enabled (Re-scan findings here; Validate on ectd-coauthor) |
| 102 | medium | `labeling` | Device labeling empty state says 'Create a device IFU...' with no create control |
| 98 | medium | `labeling-pi` | EU SmPC and SPL tabs do nothing while USPI is empty; the SmPC read that succeeded is never shown |
| 12 | medium | `mission-control` | Programs header says '0 in this organization' while the body says the programs could not be loaded |
| 13 | medium | `mission-control` | The refusal says 'Mission Control routes is temporarily unavailable', which is ungrammatical, uses an internal term, and is false about 'temporarily' |
| 14 | medium | `mission-control` | 'New program' still opens the full 13-field create form when the whole namespace is refused; it fails only on Create |
| 15 | medium | `mission-control` | Hidden behind the gate: the first program can never be created in an org with no projects (FK violation, 500) |
| 81 | medium | `nonclinical` | SEND readiness shows a green clearance chip over zero in-scope studies |
| 83 | medium | `nonclinical` | Dot separators render as block elements, breaking one-line headers into stacked fragments |
| 87 | medium | `orchestration` | A failed lead-program read would be shown as "No lead program is identified for this organization yet" |
| 80 | medium | `orphan` | Static AnA starter chips on the Biopharma specialty surfaces presuppose data the org does not have |
| 50 | medium | `pdev (also pdev-clinical, pdev-cmc, pdev-contradictions, pdev-fda-interactions, pdev-ind-assembly, pdev-nonclinical, pdev-regulatory)` | PDEV empty state sends the user to a 'regulatory programs surface' that does not exist, and gives no link |
| 79 | medium | `pharmacovigilance` | Active signals card claims a "FAERS + EudraVigilance · 90d" source; signals actually come from the org's own AE store |
| 86 | medium | `pv-cockpit` | Operator-precedence bug makes AnA's PV context drop the KPI state and report a failed matrix read as "0 row(s)" |
| 84 | medium | `rbm` | RBM surface has no page gutter and overflows the viewport horizontally |
| 121 | medium | `report-engine` | Report engine has no page gutter: content sits flush against the nav rail and header |
| 117 | medium | `shadow-review` | Empty state still offers 'Re-run this reviewer' and shows 'Model-assisted' / 'Registry' badges for a run that does not exist |
| 71 | low | `batch-draft` | Header shows snake_case 'batch_draft_sections'; drafting-phase copy contains a literal '{I.dot}' |
| 72 | low | `biostatistics` | The filed statistical document and the controls show snake_case enum keys |
| 2 | low | `crl-library` | GET /api/module-subscriptions/navigation reports crl-library as entitled:true while the deployment has its routes unmounted |
| 3 | low | `crl-library` | The failure panel tells the user to 'retry' but offers no retry control |
| 108 | low | `dossier` | Engineering copy in customer empty state: 'numeric project id', 'no backend serves that contract' |
| 106 | low | `etmf` | TMF punch-list shows internal snake_case artifact codes |
| 104 | low | `global-ri` | snake_case tool ids, API route paths, raw enum keys and API field names shown as visible copy |
| 105 | low | `intelligence-catalog` | All 142 tools are labeled only by snake_case function names |
| 88 | low | `maa-cockpit` | Module 1 rows show snake_case component keys; footnote names an internal function |
| 92 | low | `market-access` | Empty state points to a tool name in monospace instead of a control on the page |
| 16 | low | `mission-control` | Hidden behind the gate: the Part 11 audit record is written on a best-effort basis and failures are silently swallowed, while the header and catalog promise it 'on all mutations' |
| 17 | low | `mission-control` | AnA is told 'Retry the program list read' is available, but no retry exists on the surface or in its action handlers |
| 8 | low | `orchestration` | The disabled "New run" primary button looks like a live CTA |
| 89 | low | `orchestration` | Header copy and a KPI sub-label expose camelCase table names |
| 90 | low | `pyramid` | Submission-type cards lead with enum keys, and titles are truncated to the text after the em dash |
| 91 | low | `rbm` | AnA panel shows the snake_case tool id "get_rbm_attention" |
| 126 | low | `submission-twin` | The only way in is typing a numeric database id |
| 41 | low | `task-board` | New task / Start workflow dialogs show store names, a function name and camelCase enum keys |