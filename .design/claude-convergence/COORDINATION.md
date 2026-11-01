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
session (`943b78cb7`, `94f24dba0`). Wave 0 is done: S1 (`505449d7a`), S11 (`805a6f0ee`), F1 (`95dbf007c`). Wave 1a (D0-5, D4-1, D2-1) is running, and so is Wave 1b's L1; the other lanes follow (its §3).

| Files | Held by | For | Until |
|---|---|---|---|
| `design-system/**` (except `design-system/CLAUDE.md`, a plan file) | the coordinating session | D0-5, the design-system docs | its commit |
| `styles/authoring-v2.css`, `styles/rich-section-editor.css` | the coordinating session | L2, D4-1 (CSS only) | its commit |
| `styles/project-home-v2.css` (the `.pj-index` block, lines 11–51), `styles/surfaces-v2.css` 146–148, `Projects.tsx`, `ProjectPortfolioFilters.tsx`, `ProjectClientFilter.tsx` | the coordinating session | L3, D2-1 | its commit |
| `styles/app-v2.css` | **one holder at a time**. Now: the coordinating session, L1 (D1-4, D1-1, D1-2, D1-3, in turn). Ask for a turn, keep the change a small CSS-only commit, and say when you release it | BUILD_ORDER §2.1 | each step's commit |
| `Shell.tsx`, `V2App.tsx`, `TaskTray.tsx`, `OpenWork.tsx`, `NotificationOpenButton.tsx`, `surfaces/surfaceViews.ts` | the coordinating session | L1, the shell (D1-4, D1-1, D1-2, D1-3) | the lane's last commit |
| `client/src/concept2cure/v2/AnswerLead.tsx`, `icons.tsx`, `C2CForm.tsx`, `dataConnect.tsx` | the coordinating session | D0 (use them; change them only through D0) | D0 closes |

### Holds on other files (one session per file, plan §4.6)

| Files | Held by | For |
|---|---|---|
| `client/src/concept2cure/mdx/MdxSurfaceHost.tsx`, `mdx/surfaces/{Engineering,Udi,Postmarket}Surface.tsx`, `mdx/components/DocumentsPanel.tsx`; the title line only in `v2/surfaces/ProjectMdxWorkflow.tsx` (D3's glob: coordinator, please confirm) | MDX journey (`01P6GW…`) | F1 slice 1: the device screens keep their promises. M1 and M2 landed (`docs/evidence/MDX-JOURNEY/2026-11-01-slice-1-device-rows-open/`); M10 waits on the coordinator. **→ RIM:** M4 needs a per-row pathway door in `SubmissionCenter.tsx` (`onOpenPathway`) and `v2/surfaces/DeviceFilings.tsx`; the fix is in that evidence README. Behaviour and copy, no layout |
| `server/services/ectd/prior-sequence-loader.ts`, `server/services/submission-gateways/index.ts`, the filed-state route in `server/routes/ectd-compile.ts`, `client/src/concept2cure/v2/surfaces/EctdFiledState.tsx` (copy only) | RIM (`011e42…`) | F1 slice 1: what the agency holds is what was sent (no migration) |
| `server/services/submission-service/submission-service.ts`, `filed-dispatch.ts`, `server/services/submission-gateways/fda-esg-receipts.ts`; copy only in `SubmissionSeqWorkspaces.tsx`, `SubmissionCenter.tsx`, `As2ReceiptUpload.tsx` | RIM | F1 slice 2 (after slice 1): a test-environment send is not a filing |
| S10's G3 files: `shared/agency/**`, `server/services/agency-responses/**` | RIM | S10 (after slices 1 and 2): the letter splitter keeps its verbatim contract (no footers, control characters, signature blocks or duplicate numbers in a question) |
| `server/services/ana/AnaToolExecutor.ts` (the `generate_document` handler), `server/services/ana/intelligence-questions/engine.ts` | filing types (`011Fyq…`) | Rule 2 S6b, under S4 |
| `server/services/ana/ana-launch-scope.inventory.json`, `tool-authorization.register.json`, `evidence-literature-tool-defs.ts`, `skills/library/{submissions,medical-writing}.ts`, `ind-module-authoring.ts` (deleted, replacement named) | filing types | Rule 2 S6 (S4): `plan_ind_module_authoring` converges onto the Module 2.5 and 2.7 drafting tools |
| `server/services/{pharmacovigilance,dose-optimization,rwe}/*-knowledge.ts` and their `ana/*Tools.ts` | filing types | Rule 2 S5a (F1): an unstated fact is unknown, never a default |
| `server/services/ectd/assess-dispatch-readiness.ts` (the sequence read answers only for a live sequence) | RIM | F1 repair B, after slice 2 |
| `server/routes/ind-lifecycle/shared.ts` (`fail()` maps through `SUBMISSION_ERROR_STATUS`) and its contract test | RIM | F1 repair C, after slice 2 |
| `server/routes/authoring.router.ts` (the approval, freeze and sign gate), `server/services/authoring/draft-figure-check.ts`, `draft-source-references.ts`, `client/src/concept2cure/v2/surfaces/AuthoringFilingBar.tsx` (behaviour only: the 409 asked in the existing C2CForm step) | AI architecture (`017CFk…`) | L1: an unverified figure blocks an approval or a seal until the signer acknowledges it (founder decision, numbered P-89 when recorded). Before L2 reaches D4-3, which moves the bar's mount. |

## Who works where

| Session | Packages | Now | Layout work |
|---|---|---|---|
| UI and workflow redesign (`01JbQU…`) | D0, then the D1–D7 build order | D0-5, D4-1, D2-1, L1 | L1–L4, L7, L8, L10, L11 |
| CMC Module UI and data integration (`01GJidg5…`) | S7 behaviour, D5 layout | D5-2, then L6 (D5-3, D5-4) | D5-0 and D5-1 landed |
| RIM system build-out (`011e42…`) | S5 behaviour, F1 repairs, S10, S9, D7 layout (Submission Center) | F1 slices 1–2, repairs A–C, then P-86, P-87, S10, S9 with P-88 | L9 (D7-A1, D7-A2) |
| Regulatory document AI architecture (`017CFk…`) | L1 (AI-gateway placement, zero retention), S6 or S2 (Vault chunking) | L1, S6 | D6 (Vault) layout through the coordinator |
| Biotech FDA filing types build-out (`011Fyq…`) | F1, S4 or S3 (the Rule 2 audit slices) | F1 | through the coordinator |
| R1 inventory and protocol (`01QoxbL…`) | R1, S3 | R1 | through the coordinator |
| Codebase market readiness (`01Gx2fiw…`) | asked for its package and file list, 2026-11-01 | reading; RIM holds the filed-state loader | through the coordinator |
| MDX client journey (`01P6GW…`), the device and diagnostics client's path, owned by the founder's direction of 2026-11-01 | F1 (repairs on the device screens and routes); R1 with `01QoxbL…` for unreached device capability; L1 for the journey walked in the running app. Study and order of work: `.design/client-journey/MDX_JOURNEY_2026-11-01.md` | slice 1, the device screens keep their promises (M1, M2, M4, M10, M11). **The Part 11 audit's open fixes are not taken here: handed on** with their plans, `docs/evidence/D5/2026-10-18-part11-audit-three-dimensions/` | none: the device screens are in no D package (the study's founder question 1) |
| Reporting analytics (`011HLkY…`) | behaviour under an open S or F package; L11's layout (D7-D) is the coordinator's | — | through the coordinator |

S10 (the agency's communications back into the project) is held by RIM since 2026-11-01; its earlier holder (`011Dpx…`) has ended.

## What every session does

1. Fetch, read this file, and stay off the locked rows.
2. Every commit names one package (`Plan: <ID>`) and the existing path it finishes (`Completes: <path>`), and stays
   inside that package's ledger paths.
3. An S package changes behaviour on a screen, never its layout (plan §3). Layout follows the screen's D spec in
   `.design/claude-convergence/` and uses D0's primitives once they land.
4. Add none of the retired patterns (plan §2).
5. If the plan is wrong, ask the founder. No session amends it.
