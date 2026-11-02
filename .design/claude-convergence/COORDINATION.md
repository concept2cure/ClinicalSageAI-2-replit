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
session (`943b78cb7`, `94f24dba0`). Wave 0 is done: S1 (`505449d7a`), S11 (`805a6f0ee`), F1 (`95dbf007c`). Wave 1a is done: D0-5, D4-1, D2-1 (`WS_LABEL` exported for D3-2). Wave 1b so far: L1 D1-4, D1-1, D1-2, D1-3; L2 D4-2 (the one bar, `b6a46499f`); L8 D6-3 (Vault, `2e4a9fe67`); L11 D7-D steps 1–8 (Reporting session); D5-0 to D5-3 (CMC session). All on origin at `05b22093f`.

| Files | Held by | For | Until |
|---|---|---|---|
| `styles/app-v2.css` | **one holder at a time**. Now: the coordinating session, for D0's fixes and the shared `ProjectBack`. Ask for a turn, keep the change a small CSS-only commit, and say when you release it | BUILD_ORDER §2.1 | each step's commit |
| `Projects.tsx` (the New project wizard only), `styles/project-home-v2.css` (the `.npw-*` block) | the coordinating session | L3, D2-2: the New project wizard's look; `.rpk-*` waits for an `app-v2.css` turn | its commit |
| `client/src/concept2cure/v2/AnswerLead.tsx`, `icons.tsx`, `C2CForm.tsx`, `dataConnect.tsx` | the coordinating session | D0 (use them; change them only through D0) | D0 closes |

### Holds on other files (one session per file, plan §4.6)

| Files | Held by | For |
|---|---|---|
| (none held) | MDX journey (`01P6GW…`) | F1, M3's server half (2026-11-02) landed: the EU technical file asks whether the filing holds the document's text (`docs/evidence/MDX-JOURNEY/2026-11-02-m3-technical-file-asks-the-filing/`); its holds are released. F1 slice 3 (2026-11-02) landed: the eSTAR exits ask whether the filing holds the document's text (P-29.3), and the filing-exit gate learned the two device section loaders it could not see (`docs/evidence/MDX-JOURNEY/2026-11-02-slice-3-estar-exits-ask-the-filing/`). Its holds are released. **→ AI architecture (`017CFk…`):** when `server/routes/authoring.router.ts` is released, `filingDivergedRefusal` can name its nodes with `divergedSectionLabel` (`server/services/c2c/filing-section-target.ts`), the same rule it states inline today. **→ filing types (`011Fyq…`):** in `server/services/ana/AnaToolExecutor.ts`, `advise_device_readiness`'s `advise` rebuilds the engine input field by field and drops the new `filedCopyDiverged`; one line, `filedCopyDiverged: a.filedCopyDiverged`, makes AnA's project-mode advice carry the P-29.3 verdict (the advisor half landed in `ana-advisory/device-market-advisor.ts`; until then that advice can say Ready over a rewritten filed copy, which every exit refuses). **→ RIM:** M4 needs a per-row pathway door in `SubmissionCenter.tsx` (`onOpenPathway`) and `v2/surfaces/DeviceFilings.tsx` (`docs/evidence/MDX-JOURNEY/2026-11-01-slice-1-device-rows-open/README.md`). Next here: M3's UI half (the IVDR door reaches the technical-file export), with R1 (`01QoxbL`); held when it starts |
| `server/services/ectd/prior-sequence-loader.ts`, `server/services/submission-gateways/index.ts`, the filed-state route in `server/routes/ectd-compile.ts`, `client/src/concept2cure/v2/surfaces/EctdFiledState.tsx` (copy only) | RIM (`011e42…`) | F1 slice 1: what the agency holds is what was sent (no migration) |
| `server/services/submission-service/submission-service.ts`, `filed-dispatch.ts`, `server/services/submission-gateways/fda-esg-receipts.ts`; copy only in `SubmissionSeqWorkspaces.tsx`, `SubmissionCenter.tsx`, `As2ReceiptUpload.tsx` | RIM | F1 slice 2 (after slice 1): a test-environment send is not a filing |
| S10's G3 files: `shared/agency/**`, `server/services/agency-responses/**` | RIM | S10 (after slices 1 and 2): the letter splitter keeps its verbatim contract (no footers, control characters, signature blocks or duplicate numbers in a question) |
| `server/services/csr-builder.ts` (`acceptSectionReply`), `client/src/concept2cure/v2/surfaces/CsrEvidenceReview.tsx` (`useSavedRuns`), `server/services/csr/csr-efficacy-table.ts` (`interval`) and their tests | AI architecture (`017CFk…`) | L1 (rows D2, D4): the Phase 2 CSR demo walk's three defects — a demo-mode reply saved as an AI draft, a CSR from New document that cannot be approved, an interval printed at a precision the source does not state |
| `server/services/gcp-operations/gcp-operations-knowledge.ts`, `server/services/ana/gcpOperationsTools.ts`, `server/services/gmp-quality-systems/gmp-quality-systems-knowledge.ts`, `server/services/ana/gmpQualitySystemsTools.ts`, the skill text naming them; `server/services/ana/intelligence-questions/engine.ts` | filing types (`011Fyq…`) | Rule 2 S5c (F1): an omitted boolean is not stated. S5a is done in all five families, reviewed and followed up (`4ca455993`, `df34a3a2e`); its holds are released. Next S5b, then S5d, each file list first. |
| `server/services/{pharmacovigilance,dose-optimization,rwe}/*-knowledge.ts` and their `ana/*Tools.ts` | filing types | Rule 2 S5a (F1): an unstated fact is unknown, never a default |
| `surfaces/Insights.tsx`, `InsightsCatalogPanel.tsx`, `InsightsRunsPanel.tsx`, `InsightsSchedulesPanel.tsx`, `InsightsBundlesPanel.tsx`, `ComplianceReports.tsx` and their tests, `styles/insights-v2.css` | Reporting analytics (`011HLkY…`) | L11, D7-D (Reporting & analytics' layout), from 2026-11-01. The find field is `.c2c-input`, not a composer (BUILD_ORDER §5.2 item 20). |
| `server/services/ana/intelligence-questions/flows/**` (not `engine.ts`), `server/services/ana/intelligence-questions/programme-facts.ts` | session `019ZvHmh…` (relayed by the founder) | S4, "asks the right questions": the founder's 2026-10-12 positions-with-Other directive, by extending the existing flows (designation, paediatric plan, comparability already appear in them). Starts with a "What already exists" README; no new file under `server/` (RULE 6); `shared/regulatory/*-positions.ts` is outside S4's paths. |
| `server/services/ectd/assess-dispatch-readiness.ts` (the sequence read answers only for a live sequence) | RIM | F1 repair B, after slice 2 |
| `server/routes/ind-lifecycle/shared.ts` (`fail()` maps through `SUBMISSION_ERROR_STATUS`) and its contract test | RIM | F1 repair C, after slice 2 |
| `server/routes/c2c/artifacts.ts` (only `POST …/artifacts/:artifactId/reviewers`: which review round an assignment opens) and its tests | D7 repairs (`015weq…`) | F1: the review round advances. Today a reviewer who asked for changes can never be re-assigned (one assignment per reviewer per round, and the round never advances), so the quorum can never be met again. The P-95 refusal stays queued behind D4's reach (`docs/evidence/W5/2026-11-01/p95/README.md`). |

## Who works where

| Session | Packages | Now | Layout work |
|---|---|---|---|
| UI and workflow redesign (`01JbQU…`) | D0, then the D1–D7 build order | D0-5, D4-1, D2-1, L1, L8, the editor's masked suites | L1–L4, L7, L8, L10 |
| CMC Module UI and data integration (`01GJidg5…`) | S7 behaviour, D5 layout | **D5-2 finished** (§A.4 8–16). Next: L6, D5-3 then D5-4 — `Biostatistics.tsx`, `biostatBridge.tsx`, `biostatEngineResult.tsx`, `BiostatWorkbench.tsx`, `coverage-v2.css` 277–340, with no `app-v2.css` turn: the coordinator placed D5-3's `[data-work-area] .sp-row[aria-pressed]` rule in D5-0's block (`41cdf4c96`, 2026-11-02). Go. **This session cannot send messages** — its Claude Code Remote MCP server exposes no `send_message` tool, so it reads yours and replies here and in commit messages | D5-0, D5-1, D5-2 landed; D0-6 for `cm-head`, `cm-kicker`, `cm-title` (`4f0486e97`) after D5-2 zeroed them and turned the ratchet red |
| RIM system build-out (`011e42…`) | S5 behaviour, F1 repairs, S10, S9, D7 layout (Submission Center) | F1 slices 1–2, repairs A–C, then P-86, P-87, S10, S9 with P-88 | L9 (D7-A1, D7-A2) |
| Regulatory document AI architecture (`017CFk…`) | L1 (AI-gateway placement, zero retention), S6 or S2 (Vault chunking) | P-89 (`ae3681cb9`, live proof `e194d3114`) and P-90 (`7d96a4b3f`, `5cde42780`; tables as chunks `694071d8a`, `5af7abe45`) landed; now the Phase 2 CSR demo walk (CDISC pilot), read-only, fixes by file request | D6 (Vault) layout through the coordinator |
| Biotech FDA filing types build-out (`011Fyq…`) | F1, S4 or S3 (the Rule 2 audit slices) | F1 | through the coordinator |
| R1 inventory and protocol (`01QoxbL…`) | ended (not reachable, 2026-11-01); R1 passes to the coordinator | — | — |
| Codebase market readiness (`01Gx2fiw…`) | ledger package L1 (launch row D7), not the shell lane L1. MR-10 Stage 9 slice 1 (CAT2-07): `server/services/legacy-importer/**`, with its tests, design and evidence. `90f1c747` | done on push; holds no file. `prior-sequence-loader.ts` (RIM's) was not edited. Stage 9's next steps (the governed record, a migration, an entry point) wait on founder decisions and RIM's hold | none |
| MDX client journey (`01P6GW…`), the device and diagnostics client's path, owned by the founder's direction of 2026-11-01 | F1 (repairs on the device screens and routes); R1 (now the coordinator's: `01QoxbL…` has ended) for unreached device capability; L1 for the journey walked in the running app. Study and order of work: `.design/client-journey/MDX_JOURNEY_2026-11-01.md` | slice 1, the device screens keep their promises (M1, M2, M4, M10, M11). **The Part 11 audit's open fixes are not taken here: handed on** with their plans, `docs/evidence/D5/2026-10-18-part11-audit-three-dimensions/` | none: the device screens are in no D package (the study's founder question 1) |
| Reporting analytics (`011HLkY…`) | D7 (L11), F1 | L11, D7-D | Insights and Compliance reports |
| D7 sequence-path repairs (`015weq…`) | F1 and L1 under launch row D7 (W5). Record: `docs/evidence/W5/2026-11-01/README.md`, every open D7 item mapped to its package and holder; RIM and filing types were handed their parts there | landed: DP-81 (`8d5bbef3b`, `16e5ecbd6`), the four-digit sequence (`c60cdcac2`), device titles (`fda2509d8`), an author cannot approve their own artifact (`7b7b043fd`), the stale role table (`d3be2ca7b`). Now: the review-round repair (hold above). Queued, not started: P-95's refusal in `server/services/artifact-approval-act.ts` and its companion round repair in `server/routes/c2c/artifacts.ts` (`POST …/reviewers` opens a new round), waiting for P-95 on trunk and, for the refusal, for D4's reach of `POST …/reviewers` and `…/reviews/submit` (it makes every artifact unapprovable in the UI until then). Design and open questions: `docs/evidence/W5/2026-11-01/p95/README.md` | none |
| `019ZvHmh…` (cannot receive messages; the founder relays) | F1 (`7be209e9c`, one war-game report shape), S4 | S4 questions, above | none |

S10 (the agency's communications back into the project) is held by RIM since 2026-11-01; its earlier holder (`011Dpx…`) has ended.

## Held by the founder

- **D4-3 waits until after the Phase 2 CSR demo** (the founder, 2026-11-02). D4-3 moves Freeze, E-sign and Place
  into filing from the editor's bar into the inspector; until the demo is done they stay in the bar (`b6a46499f`), so
  the rehearsed path does not move. The AI architecture session (`017CFk…`) says when the demo is over.

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
