# H2: the dossier consistency check no longer says "clean" when nothing was compared

**Row:** 74 in `docs/work-orders/README.md` (founder-directed 2026-09-27; it
moves no D-row and is recorded as the founder's exception to RULE 2).
**Track:** H, the follow-through of S3's review objections [3]/[8]/[16]
(`../S3-primitives/README.md`, "Declined for S3, handed on"). It adds no
capability, no surface, no model and no migration. **Session:** `…019ZvHmh`.
**Recorded:** 2026-09-28, against HEAD `c82c056be` plus the track H working tree
(uncommitted when filed; `tree.sha256` gives every file's hash, and
`sha256sum -c tree.sha256` checks it).

## Status

The track H gates are red against HEAD, red against the build before the review
fixes, and green with track H. Every behaviour's gate was also seen to fail under
mutation, including four overcorrections (24 of 24 killed). Three things are
**not** shown here:

- **No live capture.** This container has no database and no model key. The
  database read is mocked at `db.select` in the tests, so the SQL the engine sends
  is proven by type and by reading it, not by a live query.
- **The client still turns an unknown verdict into "clean".** `client/` is S4's
  lane, and S4 was building in this same tree during this track. The server now
  exports one vocabulary the client can import (below), and the client change is
  handed on. Today nothing in `client/src` renders the consistency result, so
  nothing shows a false "clean" yet.
- **A saved copy is recognised only by its text.** A copy in another format
  (HTML against Markdown), or an earlier version whose text differs, is still
  compared as another document. `exclude_artifact_id` remains the way to set one
  aside, and its description now says so.

## What was wrong

`checkDossierConsistency` compares the labelled figures of a draft (N =, a dose,
a NOAEL, a p-value …) with the same labels in the project's other documents, and
checks the draft's section cross-references. The `check_dossier_consistency` tool
turns the report into a verdict for the model. At HEAD, every path that compared
nothing still returned verdict `'clean'`, and the tool told the model *"No
consistency issues detected against the existing dossier"*:

1. a project id that is not a positive number (early return);
2. a draft under 100 characters (early return);
3. a draft with no labelled figures and no CTD section (early return);
4. a project with no other documents;
5. documents that state none of the draft's figures under the same label;
6. a project whose only document is the draft itself, saved. The draft was
   compared with its own copy, so every shared label agreed by construction.
   The S5 harness calls the tool with no `exclude_artifact_id`, so a verify
   sub-agent checking a saved document would record this as a deterministic pass.

In a regulated dossier each of these is a false negative presented as a finding.
S3 had already fixed the seventh path, a database error, which now returns an
error (`unavailable: 'artifacts_unreadable'`).

## The change

**Vocabulary, one copy for server and client:** `shared/ana/dossier-consistency.ts`
(new).

- `DOSSIER_CONSISTENCY_VERDICTS`: `clean | minor_issues | needs_review | blocker
  | not_assessed`. `DossierConsistencyVerdict` is derived from this list.
- `DOSSIER_NOT_ASSESSED_REASONS`: `no_project | draft_too_short |
  no_figures_in_draft | no_related_artifacts | only_draft_copies |
  no_shared_figures`. `DossierNotAssessedReason` is derived from this list.
- `DivergenceSeverity` and `DOSSIER_CHECK_MIN_DRAFT_LENGTH` (100).

The term is `'not_assessed'`, the codebase's existing word for "nothing was
checked" (`etmf-logic.ts`, `market-formatting-validator.ts`,
`shared/types/submission-api.ts`). `'not_applicable'` was rejected: here it means
"the requirement does not apply", and `submission-readiness-twin-service.ts`
counts it as compliant. That is the conversion to a pass this track exists to
prevent.

**Engine:** `server/services/intelligence/cross-artifact-consistency.ts`, with a
dated header note.

- Every early return, and a read that leaves nothing to compare, reports
  `verdict: 'not_assessed'` with `notAssessedReason`.
- The report gains `figuresCompared`, `crossReferencesChecked` and
  `draftCopiesSetAside`, so `'clean'` is defined by what was actually compared:
  at least one labelled figure, compared under the same label in another
  document, with no difference.
- A project document whose text is the draft's own, ignoring whitespace, is set
  aside and counted, not compared. With nothing else left, the reason is
  `only_draft_copies`. A reference that only such a copy covers is the draft
  pointing at itself. It is neither flagged nor counted, as a reference to
  `draftCtdSection` already was.
- A divergence that is found is always reported, whatever else was not
  compared. For example, a missing cross-reference with no figures is
  `minor_issues`, not `not_assessed`.
- The project id must now be a positive integer (`no_project` otherwise).
- `checkDossierConsistency` is split into helpers (`loadRelatedArtifacts`,
  `setAsideDraftCopies`, `compareFigures`, `checkCrossReferences`,
  `reasonNotToRead`). This also cleared three of its lint warnings.
- `DivergenceSeverity` is re-exported from the shared module, so
  `dossier-number-reconciler.ts` keeps importing it from the engine.

**Verdict and copy:** `server/services/intelligence/consistency-verdict.ts` (new).

- `verdictFor` decides the verdict from the counts.
- `recommendationFor` gives the one-line copy, with one factual sentence per
  reason.
- When references resolved but no figure was compared, the copy says so, and
  limits "not assessed" to figure consistency.
- `'clean'` copy counts what was compared, and says that figures with no matching
  label were not compared.
- The module imports only from `shared/`. There is no cycle with the engine.

**Tool:** the `check_dossier_consistency` handler in `AnaToolExecutor.ts`.

- It returns `notAssessedReason`, `figuresCompared`, `crossReferencesChecked` and
  `draftCopiesSetAside`, and `recommendation: recommendationFor(report)`. The
  inline ternary it replaces sent any verdict it did not know to the BLOCKER copy.
- A `project_id` that is not a positive integer (0, −3, 1.5, `null`) is now an
  input error, not a verdict.
- The stale comment that called the unavailable report `'clean'` is corrected.

**The model's view.** Changed so that the model hears the same thing:

- `CHECK_DOSSIER_CONSISTENCY` names `not_assessed` (964 characters, under the
  1024 trim at `gateway.ts:872`), and `exclude_artifact_id` says what is set
  aside without it;
- one sentence in `base-system-prompt.ts`: if the verdict is `not_assessed`, say
  nothing was compared and why, and never call the draft consistent.

**One helper, not two:** `shared/utils/plural.ts` (new). `regulatory-workspace-routes.ts`
and the verdict module both import it. The route's private copy, which was
character-for-character the same, is deleted.

**Behaviour changes a caller can see:**

| Case | HEAD | Now |
|---|---|---|
| Any of paths 1–6 above | `clean`, "No consistency issues detected" | `not_assessed` with the reason; copy says nothing was compared and why |
| No figures, one or more references resolved, nothing missing | `clean` | `not_assessed` (`no_figures_in_draft`). The copy states the resolved references and that figure consistency was not assessed |
| `project_id` 0, negative, fractional or `null` at the tool | `clean` (0, negative), or a read of a non-project (1.5) | error: "requires a positive integer project_id" |
| Database error (S3) | error | error. The report's own verdict is now `not_assessed`, not `clean` |
| Figures compared, none differ | `clean` | `clean`. The copy now counts documents, comparisons and resolved references |
| A figure or a reference differs | `blocker` / `needs_review` / `minor_issues` | unchanged. The copy adds "No labelled figures were compared." when none was |

## Proof

| Stage | File | Result |
|---|---|---|
| Part A: the final test files against HEAD's source for every track H source file. The three new modules are absent | `red.txt` | 37 failed / 6 passed (43). Every failure is an assertion on the missing behaviour, except the two review [6] tests, whose dynamic import of the absent shared module fails inside the test. The 6 passes are guards: a disagreement is a blocker, the S3 error path, a numeric-string project id runs |
| Part B: the final test files against the track H build before the review fixes | `red.txt` | 16 failed / 27 passed. Each failure is a review objection: [1] ×7, [3]/[7] ×1, [4] ×5 plus the engine's 1.5 row, [6] ×2 |
| Part 0: the review tests as first written, against the pre-review build, before any fix | `red.txt` | 15 failed / 23 passed (38). Tests first, red first |
| With track H: the two track H files plus 6 neighbours (every test that imports the engine, the tool, the definitions, the base prompt, or the reconciler that re-exports `DivergenceSeverity`) | `green.txt` | 8 files, 125/125. Track H files: `not-assessed` 39, `unreadable` 4 |
| Tool classification gates: `tool-authorization`, `ana-launch-scope`, `tool-registry-consistency` | `green.txt` | 3 files, 825/825 |
| Mutations of the final tree | `mutations.txt` | 24/24 red. M1–M9 re-aim the build's own mutations at the final code; R1–R15 cover the review fixes. Four are overcorrections (M8, R3, R7, R12). Each file was restored and its sha256 checked |
| `npx tsc --noEmit` (full project, final tree) | `green.txt` | exit 0, 0 errors. S4's in-progress files also typechecked clean at that moment |
| eslint, each touched file against its HEAD content (via `--stdin`) | `green.txt` | No file gained a warning. `cross-artifact-consistency.ts` went from 4 to 1 (the remaining one is the untouched `checkInternalNumericalIntegrity`). The four new files: 0/0, none ignored |
| `ci:unreferenced-modules`, `ci:check-unrun-tests`, `ci:internals-in-copy` | `green.txt` | exit 0 each |
| `ci:duplicate-exported-types` | `green.txt` | exit 1 on the two collisions recorded at HEAD by the build pass (`DocumentProvenance`, `EligibilityAssessment`), in files nobody touched. None of this track's names is flagged |

## Review follow-through

| # | Objection | Disposition |
|---|---|---|
| 1 (major) | A draft already saved in the project, checked without `exclude_artifact_id`, was compared with its own copy and came out `'clean'`. The copy then called that copy an "other project document" | **Fixed.** The engine sets aside any document whose text is the draft's own (whitespace ignored) and counts it (`draftCopiesSetAside`). If nothing else remains, the result is `not_assessed` / `only_draft_copies`. A reference only the copy covers is not flagged and not counted. `artifactsCompared` no longer counts copies, so the "other project document" copy is true. Tests: the draft alone, a re-flowed copy, a copy beside an agreeing document (clean, 1 compared) and beside a disagreeing one (blocker), and a document that holds the draft plus more, which is still compared (the overcorrection guard). Also the self-reference case and the tool copy both ways. Mutations R1–R8 (R3 and R7 are overcorrections) |
| 2, 5 | A stale comment in the handler said the unavailable report's verdict is `'clean'` | **Fixed** (comment only): "Its report is verdict 'not_assessed' with `unavailable` set; answer with an error, not a verdict" |
| 3, 7 | With no figures and every reference resolved, the result was `not_assessed` with copy that denied the reference check had run | **Fixed.** The verdict stays `not_assessed` (no figure was compared). The copy now reads "N cross-references resolved against the other project documents. Figure consistency was not assessed; this is not a clean result." The verdict change from HEAD's `clean` for this case is in the table above. Tests: engine and tool for one resolved reference, and the copy with no reference checked. Mutations R9, R10 |
| 4 | `project_id` 0 or negative reached the engine and came back as a verdict | **Fixed.** The handler returns an error for any `project_id` that is not a positive integer. The engine keeps `no_project` for direct callers, now on `Number.isInteger`. Tests: 0, −3, 1.5, `null` and `'0'` are errors, nothing is read, and there is no verdict. A numeric string `'12'` still runs (the overcorrection guard). Mutations R11–R13 (R12 is an overcorrection) |
| 6 | Two verdict unions, one in `server/` that the client cannot import, and they had already drifted | **Fixed on the server; the client is handed on.** `shared/ana/dossier-consistency.ts` holds the verdict list, the reason list, `DivergenceSeverity` and the minimum length, and the server imports them. Tests: the list is exactly the five verdicts; every reason has its own copy; every verdict the engine returns is in the list. Mutations R14, R15. The client should import these, not add a member to its own union (Handed on) |
| 8 | The new `plural` helper copied `regulatory-workspace-routes.ts:104` character for character | **Fixed.** It now exists once, in `shared/utils/plural.ts`, and both files import it. The route file was cold (last change `^462a6ca7a`, 2026-09-05). Two client copies are handed on: `EctdCompile.tsx:513` has the same helper, and `SubmissionCenter.tsx:267` has a variant with a different signature |
| 9 | Module cycle: the verdict module imported `DivergenceSeverity` from the engine; input gating lived in the verdict module | **Fixed.** `DivergenceSeverity` lives in the shared module and the engine re-exports it. `consistency-verdict.ts` imports only from `shared/`. `reasonNotToRead` is back beside `checkDossierConsistency` as a private function. Evidence: `grep` shows the verdict module's only imports are the two shared modules |
| 10 | A double blank line was left where `computeVerdict` was removed | **Fixed.** No consecutive blank lines remain in the engine |

## Every consumer of the verdict

Nothing turns `not_assessed` into a pass or a percentage on the server:

- **`checkDossierConsistency` has one server caller:** the
  `check_dossier_consistency` handler, which was updated.
- **The model** reads the tool definition and one sentence of the base system
  prompt. Both were updated.
- **The readiness figures are a different engine.** `scores.consistency` and the
  consistency alerts in `project-readiness-aggregator.ts` and
  `authoring-plan-generator.ts` come from `cross-artifact-consistency-scanner.ts`,
  which does not import this one.
- **Other `ConsistencyReport` types are different types with the same name:** the
  ones in `intelligence-engine/types.ts` and
  `statistical-defensibility-service.ts`.
- **Readers outside the server are handed on:** the client's
  `mapConsistencyResult`, and the S5 spec's harness reader. Neither is in this
  lane.
- **No other reader:** no route, lineage or turn-record reader, MCP catalog or
  eval fixture reads this verdict.

## Handed on

- **Client (S4's lane; `client/` was off-limits here).**
  - The problem: `mapConsistencyResult` (`useAnaChat.ts:223-231`) maps any verdict
    it does not know, which now includes `not_assessed`, to `'clean'`.
    `consistency-parse.test.ts:126` pins that behaviour.
  - The fix:
    - delete the local `ConsistencyVerdict` and `ConsistencyDivergenceSeverity`
      (`useAnaChat.types.ts:236-239`);
    - import `DossierConsistencyVerdict`, `DivergenceSeverity` and
      `DOSSIER_CONSISTENCY_VERDICTS` from `@shared/ana/dossier-consistency`,
      and use the list as `allowedVerdicts`;
    - carry `notAssessedReason`, `figuresCompared`, `crossReferencesChecked` and
      `draftCopiesSetAside`;
    - map an unknown verdict to `null` (fail closed), not to `'clean'`, and flip
      that test.
  - Why it is latent: `message.consistency` is set, but nothing in `client/src`
    renders it.
- **S5 harness reader** (`final-spec.json` `subAgents.childLoop`,
  `HARNESS_OUTCOME.check_dossier_consistency`):
  - Read the verdict before the counters:
    - `not_assessed` gives `not_applicable`, with the statement taken from
      `notAssessedReason` (`only_draft_copies` included);
    - an unrecognised verdict gives `error`.
  - Move the counter rule after the verdict check, or drop it, since the engine
    now decides `not_assessed`. The rule "`draftFactsExtracted` 0 gives
    `not_applicable`" would discard a real `minor_issues` finding that has no
    figures.
  - The `clean` statement should cite `figuresCompared` and `artifactsCompared`,
    which no longer counts copies of the draft.
  - The harness passes no `exclude_artifact_id`. Exact copies are now handled,
    but an earlier version with different text would still be compared.
- **The same "clean when nothing was compared" class outside track H.** Not
  fixed here:
  - `checkInternalNumericalIntegrity` returns `'clean'` with `factsExtracted` 0
    (`cross-artifact-consistency.ts`, the within-document section), and
    `check_numerical_integrity` (`AnaToolExecutor.ts:4932-4933`) then says "No
    numerical inconsistencies detected";
  - `reconcileDeviceDocuments` (`device-document-reconciler.ts:103-119`)
    returns `'clean'` with `figuresReconciled` 0.
- **Client `plural` copies:** `EctdCompile.tsx:513` (identical) and
  `SubmissionCenter.tsx:267` (a variant) can import `shared/utils/plural.ts`.
- **Commit together.** The three new modules must be committed with the files
  that import them: `consistency-verdict.ts`, `shared/ana/dossier-consistency.ts`
  and `shared/utils/plural.ts`. `ci:untracked-imports` reads commits, not the
  working tree, so it did not check this.

## Lane disclosure

**S4 (the Manual/Auto builder) was building in this same working tree while this
track ran.** This track did not edit, check out, stash, restore or reformat any
S4 file:

- `server/routes/ana-ri/stream.ts` and `post-processing.ts`;
- `server/services/ana/run-control.ts`, `run-hold.ts`, `agentic-loop.ts`,
  `agentic-tool-dispatch.ts`, `run-status.ts` and `tool-trace.ts`;
- `shared/ana/run-control-limits.ts`;
- anything under `client/`, lineage or turn-record files;
- the work-order board and the lane's index README.

Only this track's own test files were run, never a broad suite. The mutation and
red re-record scripts:

- swapped only this track's files;
- checked each file's sha256 before restoring it, and refused to restore over a
  change made by another writer;
- verified the restore.

No `git stash`, `checkout -- .`, `reset` or `clean` was run, and nothing was
committed.

The track H files:

- **new source:** `server/services/intelligence/consistency-verdict.ts`,
  `shared/ana/dossier-consistency.ts`, `shared/utils/plural.ts`;
- **changed source:** `cross-artifact-consistency.ts`, `AnaToolExecutor.ts` (the
  handler only), `document-intake-tool-defs.ts` (two strings),
  `base-system-prompt.ts` (one sentence), `regulatory-workspace-routes.ts` (the
  helper import);
- **tests:** `cross-artifact-consistency-not-assessed.test.ts` (new) and
  `cross-artifact-consistency-unreadable.test.ts` (two S3 assertions that pinned
  `'clean'` for a project with no other documents).

Checked with `git log -5` and `git blame` at each edit point:

- **`AnaToolExecutor.ts`** is inside other lanes' 24h window (`9d2134b52`,
  `0ed213fec`, `41e7c539f`, and `eeedc6231`, which is this lane's S3). All four
  hunks are inside the `check_dossier_consistency` handler (now lines
  5803–5888). Before this track, that region blamed only to `^17da357f6`
  (2026-09-05) and `eeedc6231` (S3). No other lane's hunk is touched.
- **`cross-artifact-consistency.ts`** and
  **`cross-artifact-consistency-unreadable.test.ts`** were changed in the window
  only by this lane's S3 (`eeedc6231`).
- **`document-intake-tool-defs.ts`** (last changed 2026-09-24),
  **`base-system-prompt.ts`** (2026-09-21) and
  **`regulatory-workspace-routes.ts`** (2026-09-05) are cold.
- **`shared/ana/`** also holds S4's `run-control-limits.ts`. This track added a
  sibling file and did not open that one.
