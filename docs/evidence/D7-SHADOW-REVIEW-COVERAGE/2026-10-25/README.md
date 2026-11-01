# Shadow Review reads the dossier, and covers only the leaves it read — 2026-10-25

Launch row **D7** (one real sequence), inside Submission Center's Submit step (P-33, P-34, P-35).
Gap analysis: `docs/design/AI_PLATFORM_BLUEPRINT_GAP_2026-10-25.md`, capability 8.

## What was wrong

1. **The reviewer read a table of contents.** `runShadowReview` sent each leaf as
   `{ sectionCode, title, lifecycleOp }` (`shadow-review-service.ts`, v1.1). A Clinical Overview that
   contradicted its CSR, or a Module 3 with no specification, read the same as a correct one.
2. **A review of earlier leaves cleared a changed dossier.** The dispatch assessor counted every
   completed run a sequence ever had (`countCompletedShadowRuns`). A run recorded nothing about
   what it reviewed. A signed waiver over the same sequence lapsed the moment its leaves changed.
3. **The PII classifier read a numeric table as a card number.** Its `credit_card` detector
   matched any 13–16 digits with spaces between them, so a CSR table row classified the whole
   document as PII, and production placement would refuse it.

## What changed

- **Coverage** (`server/services/shadow-review/shadow-review-coverage.ts`). Each run records the
  digest of the leaves it read (`shadow_review_runs.leaf_manifest_digest`). The digest is the
  content half of the sequence's leaf-manifest binding, read through one function,
  `readEctdSequenceContent` (extracted from `part11/ectd-sequence-binding.ts`, which now calls it
  too). The same recipe binds a release signature and a waiver, minus the package identity, which
  no reviewed document contains.
- **One counter.** `completedShadowReviewRuns` (waiver module) counts only runs over the current
  leaves. The assessor's own `countCompletedShadowRuns` is deleted, and the assessor reads
  `shadowReviewCurrency`. A stale run blocks with its own sentence (`staleShadowReviewBlocker`),
  and an underivable digest with another (`UNDETERMINED_SHADOW_COVERAGE_BLOCKER`). The assessment
  adds `shadowReviewStaleRunCount`. A run recorded before this change carries no digest, so it
  counts as stale.
- **Input** (`server/services/shadow-review/shadow-review-input.ts`, prompt `v1.2`).
  - Each leaf's text comes from the rendered leaf the package carries. It is read through the
    assembler's own `materializeLeafSources` and the platform's one text extractor; nothing reads
    a store directly.
  - Budgets: 12,000 characters per leaf and 150,000 per run. Each leaf says how much was sent.
  - Masked before sending, as carrying no review evidence: emails, SSNs and secrets (the governed
    redactor) and US phone numbers (the classifier's own exported pattern).
  - A leaf that still classifies as PII or PHI is withheld and named.
  - When the gateway refuses the text (`placement_refused`, `policy_blocked`), the run retries
    once with titles only and records why. Without the retry, a sequence whose text placement
    will not send could never be reviewed. A policy refusal is not waivable (P-34), so it could
    never be dispatched.
  - The run stores all of this in `shadow_review_runs.input_coverage`.
- **Screen.** Submit → Shadow review → a run now says what its reviewer read
  (`client/src/concept2cure/v2/surfaces/ShadowRunCoverage.tsx`). A run with no coverage record
  reads "sent section codes and titles only".
- **Classifier.** A card number is 13–16 digits run together, or four groups of four, and must pass
  the Luhn check (`heuristic-classifier.ts`).
- **Migration.** `migrations/20261025_shadow_review_run_coverage.sql` adds two nullable columns,
  `IF NOT EXISTS`, after the creator and above the final pair. It is mirrored in the Drizzle schema
  and `SHADOW_REVIEW_PGLITE_DDL`.

## Proof

- **Red:**
  - `red/classifier-card-on-table-rows.txt`: the two new classifier cases, failing on the old
    detector.
  - `red/journey-stale-review-clears-on-previous-gate.txt`: the golden journey's new step,
    "a review of earlier leaves does not clear the changed sequence", run against the previous
    service, waiver module and assessor. The stale review cleared.
- **Green:** `green-summary.txt`, 26 files and 259 tests. This covers:
  - the golden NDA journey, which now re-runs Shadow Review after the 2.7 leaf is placed and
    asserts the re-run read text;
  - `shadow-review-coverage.pglite.test.ts`: real materializer, extractor and classifier; only the
    gateway stubbed;
  - every suite that seeds Shadow Review runs.
- **Pre-existing failures:** `preexisting-failures.txt`, three suites with 24 failures, identical
  with and without this change.
- **Gates:** `ci:migration-drop-safety`, `ci:migration-set-order`, `ci:migration-deploy-path`,
  `db:sync-manifest:check`, `ci:column-reachability` and `ci:runtime-ddl` all pass.

## What was already there, and what this does not do

- **The rules it follows.** The waiver's lapse rule and the leaf-manifest binding were already
  there (P-34, §11.70). This makes a review follow the same rule.
- **What still holds.** Open critical findings still block whatever their run's coverage. A
  critical from an earlier review is not erased by a later one; P-35's signature closes it.
- **Production.** No zero-retention agreement exists yet (row D6). Text that classifies as PII or
  PHI is refused by placement, and the run falls back to titles and says so. Contact details are
  masked first, so most sequences' text reads as neither.
- **Not built.** A multi-persona review panel, drafted information requests or deficiency letters,
  and any accuracy evaluation of the reviewer remain new capability (Rule 2) and are not built.
