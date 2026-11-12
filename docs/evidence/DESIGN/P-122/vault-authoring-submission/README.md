# P-122 — Vault, Authoring and Submission: what was built is findable and usable

Founder decision P-122 (2026-11-10), item 6: "then Vault, Submission Center, Quality and Reporting, from theirs". The
inventory is `docs/evidence/DESIGN/P-122/inventory/vault-authoring-submission.md`; its §4 ranks the work as a paying
regulatory team would. This lane did §4 #1 (findable), #2 (approvable in a demo), #8 (the document card), #5
(sequence QC) and #4 (itemizing an agency letter), in that order.

Instance for every screenshot and live check: `c2c_rr5_phone_instance`, organisation 5, port 5265, NODE_ENV
development, signed in as the rr5 author (the features menu as the rr5 member). Project C2C-101.

## What already exists (RULE 3)

Every item completes, reaches or corrects something that existed. Nothing is built beside an existing one.

| Item | What already existed, by path | What it did not do |
|---|---|---|
| 1a. Features catalog | `surfaces/WorkflowCatalog.tsx` (`apps`, "Subscription & features"); `Shell.tsx` AccountMenu and `ADMIN_AUDIENCE`; `surfaceAvailable.ts` (the rail's per-viewer rule) | Offered to organisation administrators only since `d97388005`; a member had no list of their features |
| 1b. Submission Center doors | `DispatchReadiness.tsx` (`dispatch-readiness`), `GatewayTransmittals.tsx`, the header's Forms and letters and Compile & export | No button anywhere led to either screen; only ⌘K and AnA |
| 1c. Dossier door | `ProjectDossier.tsx` (`DossierReadinessCard`, `ModuleCompletion`) on the Author step since `8b192f1e7`; `projectDoors.ts` (the step doors' names) | Nothing on the step said the dossier was there, below the document list |
| 1d. Editor controls | `editor/DocumentWorkbench.tsx` rails (history, tasks, signatures, audit) and the Send for review / File to vault dialogs, all in More since `b6a46499f` | Two clicks; in a demo they looked gone |
| 2. Demo review | `scripts/demo/launch-demo/lib.mjs` `connectSigner`; `packs/biotech-authoring.mjs` `ensureReview`; `POST /api/tenant-users`; `POST /api/auth/reset-password`; the RR5 review route and REVIEWER e-sign | With no second signer the seed requested no review, so P-95 refused every approval |
| 3. Document card | `editor/DocumentCanvas.tsx` before `5008143ab` (outline, per-section ask, Open full editor, File to vault, Send for review) | Collapsed to a chip by `5008143ab` |
| 4. Sequence QC | `server/routes/ind-lifecycle/sequence.routes.ts` (`/diff`, `/manifest`, their PDFs), `ind-sequence-diff.ts`, `ind-package-manifest.ts`; `submission-request-read.ts` `readSubmissionSequenceForRequest` (the canonical project admission); `EctdCompile.tsx` | No caller; unclaimed (refused in production); org-scoped reads with no project check |
| 5. Letter itemization | `server/services/regulatory-correspondence/issue-parser.ts` `runGovernedIssueParser`; `server/services/agency-responses/letter-question-proposals.ts` and `LetterQuestionProposals.tsx` (numbered questions, G3); `AgencyResponses.tsx` record form | The parser had no caller since `e3a2d0475`; the inbox split numbers only and a person classified every question by hand |

Searches run beyond the inventory: every caller of `/api/ind-lifecycle/sequence`, `question-proposals`,
`runGovernedIssueParser`, `connectSigner`, `ADMIN_AUDIENCE`, `ed-more-narrow`; `git log -S` on `DossierMap`,
`ArtifactsCenter`; the launch-scope matcher (`api-prefix-map.ts`) for parameter support (none).

## The commits

| # | Commit | Package | What |
|---|---|---|---|
| 1a | `3120f01d6` | R1 | Every member can open Subscription & features, and sees only the features they may open; administrators' view unchanged |
| 1b | `eadab4b84` | D7 | Submission Center's header opens Submission readiness and Gateway transmittals (doors moved to `SubmissionCenterDoors.tsx`; the 116 kB file shrinks) |
| 1c | `eb94263b2` | R1 | The Author step's doors include "See readiness and completion by CTD module", which moves to Module completion |
| 2 | `e69ffd861` | DATA | The seed adds `demo-reviewer@example.test` through the product and completes a real review round |
| 1d | `4197ede3a` | D4 | Versions, Review tasks, Signatures, Audit trail, Send for review and File to vault back on the editor bar (More keeps them at phone width; `DocumentWorkbench.tsx` shrinks) |
| 4 | `599dc97d1` | R1 | The eCTD view shows the sequence QC; a claim can name a `:param` segment; the QC routes admit the project first |
| 3 | `a180a0b34` | D4 | Revert of `5008143ab`: the card under an AnA answer is back, keeping what later commits built on the chip |
| 4 | `01eaa6669` | D7 | The QC's words say what the engine decides ("Only in sequence 0000", not "Deleted") |
| 5 | `8d58b8bef` | R1 | The letter's proposals carry the deficiency parser's reading; a letter with no numbered question is itemized |

## Red and green, per item

| Item | Red (before the change) | Green |
|---|---|---|
| 1a | `1-findable/red-features-catalog.txt` (4 failed) | `green-features-catalog.txt` (13 files, 167) |
| 1b | `red-submission-center-doors.txt` (3 of 3) | `green-submission-center-doors.txt`, plus every Submission Center suite (16 files, 166) |
| 1c | `red-dossier-door.txt` (1 of 1) | `green-dossier-door.txt` (82), every project page suite (37 files, 356) |
| 1d | `red-editor-bar.txt` (3 of 3) | `green-editor-bar.txt` (21 suites, 303; after the split 10, 155) |
| 2 | `2-demo-review/red.txt`, `red-review-round-at-head.txt` (2 of 4 with the helper alone) | `green-unit.txt` (148 of 148); `seed-run-1.txt` (rounds complete on two documents); `seed-run-2-rerun.txt` (nothing created); `live-approval.txt` (approved 200 after the round; 409 REVIEW_REQUIRED without one) |
| 3 | `3-document-card/red-at-head.txt` (26 of 71 against HEAD's chip) | `green.txt` (9 files, 137); `green-canvas-path.txt` |
| 4 | `4-sequence-qc/red-claim.txt` (7 of 15); `red-db-at-head.txt` (6 of 10, 403 LAUNCH_SCOPE); `red-db-claim-only.txt` (2 of 10: a private project's diff read by a colleague, 200); `red-panel-at-head.txt`; `red-panel-not-mounted.txt`; `red-wording.txt` | `green-claim.txt`; `green-db.txt` (10 of 10, RLS on, production gate); `green-unit.txt` (258); `green-panel.txt` (129); `green-launch-scope-api.txt`; `live-instance.txt` |
| 5 | `5-letter-itemize/red-parser-at-head.txt` (4 of 7); `red-letter-view.txt` (3 of 3) | `green-parser.txt` (7 of 7); `green-letter-view.txt` (10 of 10); `live-instance.txt` |

The DB test (`tests/db/p122-sequence-qc.dbtest.ts`) runs as app_service with RLS enforcing (asserted), through the
production auth boundary and the launch-scope gate in production mode: a member reads both (200), another
organisation is refused (404), a colleague off a private project is refused (403 PROJECT_PERMISSION_DENIED, the
refusal every Submission Center sequence read gives), a diff across submissions is refused (400), and validate, the
dispatch gate, its snapshot and the snapshot list stay 403 LAUNCH_SCOPE.

## Screenshots (`screenshots/`, 1440×900 and 390×844, light and dark)

`before-*` were taken at `b6c2a6e4a`, before any change; `after-*` after `8d58b8bef`. `after-author-step-dossier-*` is
after the door is pressed: Module completion, scrolled to and focused.

| Item | Before | After |
|---|---|---|
| 1a | `features-menu-member-*` (no Subscription & features) | `features-menu-member-*`, `features-catalog-member-*` |
| 1b | `submission-center-header-*` | `submission-center-header-*` |
| 1c | `author-step-*` | `author-step-*`, `author-step-dossier-*` (after the door) |
| 1d | `editor-bar-*`, `editor-more-*` | `editor-bar-*`, `editor-more-*` |
| 3 | `ana-document-card-*` (the chip) | `ana-document-card-*` (the card) |
| 4 | `ectd-compile-*` | `ectd-compile-*` (the QC on sequence 0001) |
| 5 | `agency-letter-*` | `agency-letter-*` (each question's reading) |

The conversation in item 3 is a synthetic thread seeded into the instance only (an assistant turn whose tool trace
names the C2C-101 Module 2.5 document), because AnA cannot answer without a model key here. Sequence 0001 of C2C-101
was made through the product API on the instance for the item 4 screenshots. Neither is in the repository.

## What changed on the instance (not in the repository)

- The seed run added `demo-reviewer@example.test` (role reviewer) to organisation 5 and completed the review rounds of
  the C2C-101 Protocol Synopsis and Module 2.5 Clinical Overview; the Synopsis was then approved by
  `rr5-reviewer2@example.test` after the author gave them the Approver role on it (`live-approval.txt`).
- `rr5-member` and `rr5-reviewer2` were given the author's local password, so the member's menu and the second
  person's approval could be shown. No password is in any file here.
- C2C-101's IND has sequence 0001 (three leaves), made through the product API for the QC screenshots.
- A synthetic conversation (`vas122-demo-thread`) names the Module 2.5 document in its tool trace, for the card.
- The seed's manifests were written outside the repository (`DEMO_MANIFEST_ROOT`); `docs/evidence/DEMO/` is untouched.

## Gates

- `node scripts/ci/check-one-design-plan.mjs`: OK.
- `npm run -s ci:launch-scope-api`: 657 paths, none refused.
- `npm run -s ci:sql-interpolation`: OK on the final tree. Mid-work it failed on
  `server/services/project-rollup-service.ts` ("now 0, baseline 2"), the other lane's uncommitted change, since
  committed (43920b3e7).
- Typecheck: the full run was killed for memory in the shared container (exit 137, `typecheck-focused.txt` is the
  focused run instead): no error in a changed file; the 49 lines are the focused config's missing ambient
  augmentations (`Request.dbClient`, the svg module), present at HEAD too.
- Lint: every changed file as HEAD or better.

## Found, not fixed

- `launch-scope-api-gate.test.ts` "judges a path ... whatever its letter case" (`/api/mdx/qms/Readiness`) fails as on
  HEAD.
- `foundationsReadmeClaims` small type reads 1186 against a baseline of 1185 with HEAD's stylesheets; no stylesheet's
  count changes here.
- The author of a document cannot approve it (separation of duties), and a colleague needs the Approver role on the
  document (the editor's Access) before approving. A live demo approves as a second person; `live-approval.txt` shows
  the grant and the approval.
- `/api/regulatory-correspondence/*` still has no caller. Its parser is reached from the inbox; the routes and their
  second letter store are left for a converge-or-retire decision (Rule 3).
- §4 #6 (the IND registers) was not done. The `:param` claim now allows exact claims for
  `/api/ind-lifecycle/submission/:id/cross-references` and the others without admitting the safety registers beside
  them, which P-32 keeps shut.
