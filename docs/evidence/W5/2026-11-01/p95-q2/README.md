# P-95 Q2: two reviewers where the contract says so — design, blocked on a decision (2026-11-09)

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
