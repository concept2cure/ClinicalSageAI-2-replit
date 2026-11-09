# P-95 Q2: two reviewers where the contract says so — designed, ruled and landed (2026-11-09)

**The decision (P-107, 2026-11-09, `docs/LAUNCH_DEFINITION_OF_DONE.md`).** "Where the document's contract names
`regulated_dual_review` (`shared/types/document-contract.ts`), at least two named reviewers must complete review. That
is the type raising the floor through data, as NEW-4 allows. It lands as its own slice after the one-reviewer refusal."

The one-reviewer refusal landed in `72232bdbc0` (`../p95/`, "Landed").

**Why this is not built yet.** For a Concept2Cure artifact, "the document's contract" is not a stored fact. It is
recomputed on every request, from fields the request supplies. Any project writer can lower it, with no version bump,
so earlier review decisions still count. A two-reviewer floor read from it would be lowered by the people it binds.
This record says what exists and asks which source of truth the floor should read.

## What already exists (RULE 3)

These findings were read at HEAD `79f4e38a58` by one read-only agent across the artifact writers. This session
re-checked the decisive claims in the code (marked ✓).

| Path | What it does | What it does not do |
|---|---|---|
| `server/services/concept2cure/governedDocumentContractService.ts` `resolveGovernedContext`, `resolveDocumentClass` (316–340), `resolveApprovalPathType` (446–460) | Resolves a contract per request. **The class** comes from `context.documentClass`, else `req.body.metadata.documentClass` or `req.body.documentClass`, else keywords in `artifacts.type` and the CTD section ✓. **The approval path** comes from an explicit value, else a persona overlay (persona from the body or `req.userRole`), else `inspection_ready` (which gives `qa_lock`), else the class default | It reads nothing stored on the artifact |
| `server/services/concept2cure/authority/documentClassSemantics.ts` | 12 classes and their default approval paths. **Dual:** `section_draft`, `module3_output`, `submission_component`, `risk_benefit`, `protocol_rationale`, `regional_differences`, `safety_evidence_brief`, `endpoint_justification`. **Single:** `strategy_memo`, `evidence_memo`, `comparator_summary`. **`qa_lock`:** `audit_report` | — |
| `server/routes/c2c/artifacts.ts` POST create (495–600) | Stores the resolved class in `metadata.harness.documentClass` ✓. `documentClass` and `approvalPathType` are optional client enums in `createArtifactSchema` | Does not store `approvalPathType`. No writer ever has |
| `server/routes/c2c/artifacts.ts` PUT `…/artifacts/:id` (896–972) | Re-resolves with no class passed and **overwrites `harness.documentClass`** from the body or `type` keywords ✓. The version increments **only when content changed** ✓ | Has no author check and no review reset. Locked artifacts are the only ones refused |
| The same re-resolution in placement (1201), ctd-section (2965), the signed status act (2604), rollback (3208), and the `ai-actions` promote, attach and refine routes, plus `authoring-actions.ts` | Each rewrites `harness.documentClass` from that request. `promote-artifact.ts` forces `submission_component` | None reads the stored class back, so it drifts. Example: AnA's `section_draft` becomes `strategy_memo` on its first edit |
| AnA's own writers: `ana/artifactVersionStore.ts:144`, `ana/verifiedSealService.ts:320`, `ana-biostats/workflow-integrator.ts:141`, and the compute and export writers | Insert artifacts of type `regulatory_document`, `statistical_summary` and others | Store **no harness**, so no class at all |
| `server/services/module3-convergence-service.ts:688` (Module 3 compile) | Updates the section's artifact | **Replaces the whole metadata, deleting the harness** (and see "A separate defect" below) |
| `server/services/artifact-approval-act.ts` `reviewQuorumVerdict` | The one reviewer counter: at least one active reviewer, all completed, approving this version, and independent (Q1) | Ignores class. Nothing anywhere counts reviewers by class |
| `shared/schema.ts` `accountSkillBundles.reviewerRequirements.requiredReviewers` | Declared | No server code reads it |

**Searched for** `git log --all -S 'regulated_dual_review'` (38 commits), `minReviewers`, `requiredReviewerCount`,
`reviewersRequired` and `REVIEWER_FLOOR`. No reviewer-count rule was ever written, so none was deleted.

## The options

Each option extends `reviewQuorumVerdict` (one rule, both doors, the signing transaction). None adds a file, route or
table.

**A. Read the floor only from fields no request can lower (recommended).** `artifacts.type` is never updated.
`ctd_section` changes only through placement and ctd-section.
- Dual review where the CTD section is Module 2 or 3 (`2.*` or `3.*`, the `section_draft` and `module3_output`
  classes), or where `type` is `section`.
- Everything else keeps one reviewer.
- *Gap:* moving an artifact out of Module 2 or 3 lowers the floor. So a placement or ctd-section change on an
  artifact with review decisions must void them, as an edit does. That is a change to two more routes in
  `artifacts.ts`.
- *Not covered:* classes that only a client enum could set (`risk_benefit`, `protocol_rationale`, …). They are not
  derivable from the row.

**B. Make the class write-once, then read it.** Store the class resolved at creation as a governed fact, which no update
route rewrites from a request. Change it only through a governed act that voids review decisions.
- This is the faithful reading of "the document's contract".
- *Cost:* it changes every re-resolution above (about ten routes across `artifacts.ts`, `ai-actions`, `authoring-actions`
  and the Module 3 compile). It also needs a class for AnA's writers that store none.

**C. Fail closed: two reviewers for every artifact.**
- *Simple:* it cannot be lowered.
- *Cost:* it doubles review for memos and summaries, and that is a product decision.

**Recommendation: A now, B as the convergence later.**
- A covers the regulated content that is filed: Module 2 and 3 sections, the eCTD leaves the D7 path transmits.
- A reads nothing a request can change, and it closes its one gap with the same rule an edit already follows.

## For the coordinating session (and the founder, if it is theirs)

1. Which source should the two-reviewer floor read? Option **A** (CTD Module 2 or 3, or type `section`), **B**
   (write-once class) or **C** (every artifact)?
2. If A: should moving an artifact with review decisions (placement, ctd-section) void them, as an edit does?

## A separate defect found here (F1, not Q2)

`bridgeCompileToArtifact` (`server/services/module3-convergence-service.ts:605–760`) updates the latest artifact for a
compiled Module 3 section in place, whatever its status. Re-checked ✓:
- It sets `status = 'draft'` and replaces the content, with no status check. A **signed, locked release is silently
  reverted to draft**, and `locked_at`, `approved_version_id` and `published_version_id` are left set.
- The trigger that would have stopped this, `prevent_locked_artifact_mutation`
  (`db/migrations/20260318_ga_immutability_hardening.sql`), is in a file no applier runs
  (`migrations/20261029k_artifact_versions_no_rewrite.sql` says so).
- It increments `version` but writes no `concept2cure_artifact_versions` row for the new text. A second compile
  overwrites it unrecorded.
- It replaces the whole `metadata`.
- It takes no row lock, so it can race a signature.

PUT `…/artifacts/:id` refuses a locked artifact; this path does not. The repair is this lane's next F1 item: refuse a
locked artifact, record the version row and keep the metadata.

## Ruled (2026-11-09, the coordinating session, `COORDINATION.md` row 38)

1. **Option A, widened.** Two independent reviewers when a CTD section is set **in any module**, or `type` is
   `section`. A placed artifact is a `submission_component`, which `documentClassSemantics.ts` makes dual. Every other
   artifact keeps one.
2. **A move voids review.** Any `ctd_section` change on an artifact with review decisions voids them, as an edit does.
3. **B is the later convergence.** It is owed (below).
4. **C is refused.**

## Landed: what changed

**One rule, in the one quorum** (`server/services/artifact-approval-act.ts`):
- `reviewFloor(artifact)` reads only `ctd_section` and `type`.
  - A section is set unless it is empty, or one of the two values AnA writes to mean "no section": `unassigned`
    (`ana-ri/command-executor.ts`) and `ana-ri.<action>` (`ana-ri/artifact-generator.ts`). Any other value counts as
    a placement, recognised or not (fail closed).
- `reviewQuorumVerdict` asks it last, after the version, the round and independence (Q1). So every earlier refusal
  keeps its words, and only independent approvals of this version count.
- The refusal is `REVIEW_REQUIRED` (409 on both doors, before the password on the status route) and names the count,
  for example: "this document needs 2 independent reviewers, because it is placed in CTD 2.5; 1 has approved this
  version."
- The signing transaction re-reads it under the row lock, as it does the rest of the quorum.

**A move voids review, as an edit does.**
- `moveVoidsReview` is one increment, a Drizzle template that binds the new section and quotes the columns, added to
  `version` by every writer that changes `ctd_section` without already moving the version on.
  `moveArtifactToSection` is the same move for the writers on a pg client: one statement, rendered through Drizzle's
  Postgres dialect to text and bound parameters. The first form spliced a SQL string into the query text, and
  `ci:sql-interpolation` refused it at push; nothing is spliced now, and that gate passes with its baseline
  unchanged.
- It adds 1 only when all three hold:
  - the section changes;
  - the artifact is not locked;
  - a review decision is recorded on its **current** version. Decisions on an earlier version are already void, so an
    edit and a move in one write move it once.
- The version moves on, so the quorum refuses the old decisions ("recorded against version N; the artifact is now
  version N+1. Route it for review again"), and the round repair (`0f7706e637`) opens the next round. An approval no
  longer covers the version, as after an edit.

| Writer | Change |
|---|---|
| `server/routes/c2c/artifacts.ts` PUT `…/artifacts/:id` (the editor's save) | The increment when content did not change. An edit already moves the version |
| `server/routes/c2c/artifacts.ts` PUT `…/placement` | The increment |
| `server/routes/c2c/artifacts.ts` PUT `…/ctd-section` | The increment |
| `server/services/ana/document-spine.ts` `setPlacementTx` | `moveArtifactToSection` |
| `server/services/ana-ri/command-executor.ts` `placeInDossier` (signed) | `moveArtifactToSection`, by the row its locked read now names by `id`. The signature binds the version the artifact has at its new place |
| `server/services/artifact-tagger.ts` | Unchanged: every write already moves the version on |

**Readiness is the quorum's own answer.**
- `GET …/reviews/status` answered `readyForApproval` from its own count. That count ignored the version reviewed,
  independence and the floor, so the artifact card could say "every named reviewer approved" while approval was
  refused.
- It now reads `reviewQuorumVerdict`, with no signer: ready means ready for an approver who did not review it. When it
  is not ready, it adds `notReadyReason`, the quorum's sentence.
- The client (`ConversationArtifactReview.tsx`, S4's) is unchanged. It already reads `readyForApproval`.

## Owed: B, the write-once class (the convergence the ruling records)

The floor reads only fields no request can lower. That is safe, but coarser than the contract. B would make the
class resolved at creation a governed, write-once fact, changed only by an act that voids review. These sites
re-resolve `harness.documentClass` from the request today, and each must stop doing so:

1. `server/routes/c2c/artifacts.ts` PUT `…/artifacts/:id` (`updateGovernedResolution`)
2. `server/routes/c2c/artifacts.ts` PUT `…/placement` (`placementGovernedResolution`)
3. `server/routes/c2c/artifacts.ts` PUT `…/ctd-section` (`ctdSectionGovernedResolution`)
4. `server/routes/c2c/artifacts.ts` PUT `…/status`, on a signed approve or lock (`statusGovernedResolution`, written
   through `artifact-signed-act.ts`)
5. `server/routes/c2c/artifacts.ts` POST `…/rollback`
6. `server/routes/authoring-actions.ts` promote-to-review
7. `server/routes/authoring-actions.ts` mark-submission-ready
8. `ai-actions` `promote-artifact.ts` (forces `submission_component`)
9. `ai-actions` `attach-sources.ts`
10. `ai-actions` `refine-with-validation.ts`

Writers that record **no class** need one at creation for B:
- `ana/artifactVersionStore.ts:144` (AnA drafts);
- `ana/verifiedSealService.ts:320`;
- `ana-biostats/workflow-integrator.ts:141`;
- the compute and export writers (`compute/artifactWriteback.ts`, `compute/exportGovernance.ts`);
- `figureGenerationService.ts`, `ind-forms.routes.ts`, `mdx-imports.ts`.

The Module 3 bridge now merges its metadata (`c3240962e7`), so it no longer deletes the class.

## Runs

| Run | File | Result |
|---|---|---|
| Red first: the Q2 cases against HEAD `6556caae64`'s four sources | `red-first.txt` | **11 red.** Placed with one reviewer; any module; type `section`; review readiness; a move through placement, through the ctd-section route and through the editor's save; an approved document moved; the shared increment; AnA's signed placement; the spine's placement step. **7 pass at HEAD** and pin that the floor does not over-refuse: unplaced; AnA's two "none" markers; a move with no decisions or to the same section; an edit and a move counted once; the bridged section's two-reviewer approval; decisions only on an earlier version |
| 13 mutants, one per branch, rerun on the final code | `mutant-*.txt` | each killed (1–7 red) |
| Green: the seven suites this change touches | — | 925/925 |
| Downstream: 176 suites that load the router, the review tables, the act or the two AnA writers | `downstream.txt` | 3 failures were this change's: document-spine's fixture had no review tables. It was given them, and is 6/6. The other 60 failures, in 5 files, fail identically at HEAD |
| Lint | `eslint-changed-files.txt` | 0 errors; warnings unchanged on every file |
| Scoped tsc on every changed file | — | 0 errors in them; only TS7016 in unrelated imports |

**Tests changed on purpose.**
- The bridged Module 3 section is placed (3.2.S.4), so it is approved after **two** reviews (`reviewedBy`).
- The quorum integrity suite's artifact table gains `type` and `ctd_section`.
- The lock-coverage mock answers the quorum's widened artifact read.

**Split, not added (RULE 6).** `ana-governed-command-signature.pglite.integration.test.ts` was at exactly the 500-line
limit. Its schema constants moved, unchanged, into `ana-governed-command-signature.fixture.ts` in the same folder,
where the folder's other fixtures are.

