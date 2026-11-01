# Coordination of the working sessions (ONE_DESIGN_PLAN §4.6)

Every session working on `concept2cure-v2` reads this after each fetch. It holds only who is working on which files
right now, so that no two sessions edit the same file at once. The rules are `CLAUDE.md` RULES 0, 5 and 6 and
`docs/design/ONE_DESIGN_PLAN.md`. Nothing here adds to them.

The coordinating session is `session_01JbQUvBxcGHdBgkgAydQKpx`, "UI and workflow redesign". It continues
`session_011Dpx…`'s plan (the D0–D7 specs, `18261a908`). Send it your package, step and file list before you
change a file that another package's spec also names.

## Locked now

The build order is `.design/claude-convergence/BUILD_ORDER.md`. D0-1 to D0-4 are pushed (D0-4 is `1dee898e9`, on origin at `29eb219f9`), so
the `styles/**` lock is released: each sheet now has one holder at a time, below. D5-0 and D5-1 landed from the CMC
session (`943b78cb7`, `94f24dba0`). Wave 0 is done: S1 (`505449d7a`), S11 (`805a6f0ee`), F1 (`95dbf007c`). Wave 1a is done: D0-5 (`87c6a1470`, `a1f29d67d`), D4-1 (`f23853723`), D2-1 (`78842ee08`; `WS_LABEL` is exported for D3-2). Wave 1b's L1, L8 and L11 are running; the other lanes follow (its §3).

| Files | Held by | For | Until |
|---|---|---|---|
| `styles/app-v2.css` | **one holder at a time**. Now: the coordinating session, L1 (D1-4, D1-1, D1-2, D1-3, in turn). Ask for a turn, keep the change a small CSS-only commit, and say when you release it | BUILD_ORDER §2.1 | each step's commit |
| `Shell.tsx`, `V2App.tsx`, `TaskTray.tsx`, `OpenWork.tsx`, `NotificationOpenButton.tsx`, `surfaces/surfaceViews.ts` | the coordinating session | L1, the shell (D1-4, D1-1, D1-2, D1-3) | the lane's last commit |
| `surfaces/Vault*.tsx`, `styles/misc-surfaces-v2.css` (the `.vd-*` block), one rule at `styles/coverage-v2.css:866` | the coordinating session | L8, D6-3 Vault | its commit |
| `editor/**` and `surfaces/Authoring*.tsx` (not `AuthoringFilingBar.tsx`), `DocumentAuthoring.tsx` | the coordinating session | L2: the five editor suites masked until `84b415e24` (a second Save, a missing section check) | its commit |
| `client/src/concept2cure/v2/AnswerLead.tsx`, `icons.tsx`, `C2CForm.tsx`, `dataConnect.tsx` | the coordinating session | D0 (use them; change them only through D0) | D0 closes |

### Holds on other files (one session per file, plan §4.6)

| Files | Held by | For |
|---|---|---|
| `client/src/concept2cure/mdx/MdxSurfaceHost.tsx`, `mdx/surfaces/{Engineering,Udi,Postmarket}Surface.tsx`, `mdx/components/DocumentsPanel.tsx`, `mdx/surfaces/DeviceFilings.tsx`; the title line only in `v2/surfaces/ProjectMdxWorkflow.tsx` (D3's glob; confirmed by the coordinator for the title line only, 2026-11-01); the device-cer note in `shared/constants/ui-surface-registry.ts` and the device-engineering note in `ui-surface-registry.ui-v2.ts` | MDX journey (`01P6GW…`) | F1 slice 1: the device screens keep their promises (`MDX_JOURNEY_2026-11-01.md` M1, M2, M4, M10, M11). Behaviour and copy, no layout |
| `server/services/ectd/prior-sequence-loader.ts`, `server/services/submission-gateways/index.ts`, the filed-state route in `server/routes/ectd-compile.ts`, `client/src/concept2cure/v2/surfaces/EctdFiledState.tsx` (copy only) | RIM (`011e42…`) | F1 slice 1: what the agency holds is what was sent (no migration) |
| `server/services/submission-service/submission-service.ts`, `filed-dispatch.ts`, `server/services/submission-gateways/fda-esg-receipts.ts`; copy only in `SubmissionSeqWorkspaces.tsx`, `SubmissionCenter.tsx`, `As2ReceiptUpload.tsx` | RIM | F1 slice 2 (after slice 1): a test-environment send is not a filing |
| S10's G3 files: `shared/agency/**`, `server/services/agency-responses/**` | RIM | S10 (after slices 1 and 2): the letter splitter keeps its verbatim contract (no footers, control characters, signature blocks or duplicate numbers in a question) |
| In `server/services/ana/AnaToolExecutor.ts`, only the handlers being changed: `generate_document` (landed), `plan_ind_module_authoring` and its import (S6, deleting them), `start_war_game` (S4: load the stored session, never score model-supplied answers), and the pharmacovigilance, dose-optimisation and RWE handlers if S5a touches them; `server/services/ana/intelligence-questions/engine.ts` | filing types (`011Fyq…`) | Rule 2 S4, S6 and S5a. `intelligence-questions/flows/**` is released (2026-11-01). |
| `server/services/ana/tool-authorization.register.json` (the 20 RBM tools' `present` blocks only) | the coordinating session | F1: risk-based monitoring's AnA steps read "Ran a step" (`ci:step-presentation`). Filing types released the register and the inventory with S6 (`ffdfed428`). |
| `server/services/{pharmacovigilance,dose-optimization,rwe}/*-knowledge.ts` and their `ana/*Tools.ts` | filing types | Rule 2 S5a (F1): an unstated fact is unknown, never a default |
| `surfaces/Insights.tsx`, `InsightsCatalogPanel.tsx`, `InsightsRunsPanel.tsx`, `InsightsSchedulesPanel.tsx`, `InsightsBundlesPanel.tsx`, `ComplianceReports.tsx` and their tests, `styles/insights-v2.css` | Reporting analytics (`011HLkY…`) | L11, D7-D (Reporting & analytics' layout), from 2026-11-01. The find field is `.c2c-input`, not a composer (BUILD_ORDER §5.2 item 20). |
| `server/services/ana/intelligence-questions/flows/**` (not `engine.ts`), `server/services/ana/intelligence-questions/programme-facts.ts` | session `019ZvHmh…` (relayed by the founder) | S4, "asks the right questions": the founder's 2026-10-12 positions-with-Other directive, by extending the existing flows (designation, paediatric plan, comparability already appear in them). Starts with a "What already exists" README; no new file under `server/` (RULE 6); `shared/regulatory/*-positions.ts` is outside S4's paths. |
| `server/services/ectd/assess-dispatch-readiness.ts` (the sequence read answers only for a live sequence) | RIM | F1 repair B, after slice 2 |
| `server/routes/ind-lifecycle/shared.ts` (`fail()` maps through `SUBMISSION_ERROR_STATUS`) and its contract test | RIM | F1 repair C, after slice 2 |

## Who works where

| Session | Packages | Now | Layout work |
|---|---|---|---|
| UI and workflow redesign (`01JbQU…`) | D0, then the D1–D7 build order | D0-5, D4-1, D2-1, L1, L8, the editor's masked suites | L1–L4, L7, L8, L10 |
| CMC Module UI and data integration (`01GJidg5…`) | S7 behaviour, D5 layout | D5-2, then L6 (D5-3, D5-4) | D5-0 and D5-1 landed |
| RIM system build-out (`011e42…`) | S5 behaviour, F1 repairs, S10, S9, D7 layout (Submission Center) | F1 slices 1–2, repairs A–C, then P-86, P-87, S10, S9 with P-88 | L9 (D7-A1, D7-A2) |
| Regulatory document AI architecture (`017CFk…`) | L1 (AI-gateway placement, zero retention), S6 or S2 (Vault chunking) | P-89 (`ae3681cb9`) and P-90 (`7d96a4b3f`, flag-off identity `5cde42780`) landed; no holds | D6 (Vault) layout through the coordinator |
| Biotech FDA filing types build-out (`011Fyq…`) | F1, S4 or S3 (the Rule 2 audit slices) | F1 | through the coordinator |
| R1 inventory and protocol (`01QoxbL…`) | ended (not reachable, 2026-11-01); R1 passes to the coordinator | — | — |
| Codebase market readiness (`01Gx2fiw…`) | asked for its package and file list, 2026-11-01 | reading; RIM holds the filed-state loader | through the coordinator |
| MDX client journey (`01P6GW…`), the device and diagnostics client's path, owned by the founder's direction of 2026-11-01 | F1 (repairs on the device screens and routes); R1 (now the coordinator's: `01QoxbL…` has ended) for unreached device capability; L1 for the journey walked in the running app. Study and order of work: `.design/client-journey/MDX_JOURNEY_2026-11-01.md` | slice 1, the device screens keep their promises (M1, M2, M4, M10, M11). **The Part 11 audit's open fixes are not taken here: handed on** with their plans, `docs/evidence/D5/2026-10-18-part11-audit-three-dimensions/` | none: the device screens are in no D package (the study's founder question 1) |
| Reporting analytics (`011HLkY…`) | D7 (L11), F1 | L11, D7-D | Insights and Compliance reports |
| `019ZvHmh…` (cannot receive messages; the founder relays) | F1 (`7be209e9c`, one war-game report shape), S4 | S4 questions, above | none |

S10 (the agency's communications back into the project) is held by RIM since 2026-11-01; its earlier holder (`011Dpx…`) has ended.

## Known caveats

- **R1's inventory can report a false "no caller"** (`docs/evidence/DESIGN/R1/2026-11-01-inventory/inventory.json`):
  it does not resolve a path constant in a template URL (`${REVIEWS_PATH}/${id}/sign`). Found case: `POST
  /api/audit/reviews/:id/sign` is listed `caller: null` but `ComplianceReviewRecords.tsx:212` calls it. Before retiring
  any `caller: null` route, search the client for its path segments and record the search. The coordinator is
  fixing the analyser under R1.
- **A shallow clone hides deletions.** `git log --all --diff-filter=D` (RULE 3, the working agreement) finds nothing
  that predates the clone's depth. Check `git rev-parse --is-shallow-repository`; if it says `true`, run
  `git fetch --unshallow origin concept2cure-v2` before any deletion search.
- **R1 rows found by sessions:** the war-game report has had no renderer since `WarGameReport.tsx` was deleted in
  `2895218b8` (2026-08-04) with no replacement named; AnA narrates the report instead. Reach it in the conversation
  and canvas, or retire it by founder decision.

## What every session does

1. Fetch, read this file, and stay off the locked rows.
2. Every commit names one package (`Plan: <ID>`) and the existing path it finishes (`Completes: <path>`), and stays
   inside that package's ledger paths.
3. An S package changes behaviour on a screen, never its layout (plan §3). Layout follows the screen's D spec in
   `.design/claude-convergence/` and uses D0's primitives once they land.
4. Add none of the retired patterns (plan §2).
5. If the plan is wrong, ask the founder. No session amends it.
6. Push well. The pre-push hook takes minutes and trunk moves faster, so a ref race is normal:
   - **batch**: push once per slice, not once per commit;
   - **retry at once** after a ref-race rejection: fetch, merge (never rebase), push again; `tsc --incremental` makes
     the second run much faster;
   - **push from a quiet tree**: the ESLint ratchet and the typecheck read the working tree, so an unfinished edit
     fails the push even when every commit is sound;
   - **commit only your paths**: `git commit -m … -- <paths>`. A bare `git commit` takes whatever another process
     has staged in the shared index (it happened once on 2026-11-01, `87c6a1470`);
   - check the push's own exit status; a pipe through `tail` hides a failure;
   - **after two lost ref races**, ask the coordinating session for a push window: it asks every other session to
     hold its pushes for 15 minutes and says when the window closes (the first, 22:50, landed P-89 and P-90 at 22:52).
