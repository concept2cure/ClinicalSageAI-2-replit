# H4: nothing checked is never "clean", in the numerical integrity check and the figure reconcilers

**Row:** 74 in `docs/work-orders/README.md` (founder-directed 2026-09-27; it
moves no D-row and is recorded as the founder's exception to RULE 2).
**Decision:** ADR-0014 §7, *"Nothing was checked" is never "clean"*
(`docs/adr/0014-ana-autonomy-sub-agents-and-model-governance.md`), server half.
**Track:** NC, H2's rule applied to the two other deterministic figure checks.
It adds no capability, no surface, no model and no migration.
**Session:** `…019ZvHmh`.
**Recorded:** 2026-09-28, against HEAD `eb62b566c` plus the track NC working tree
(uncommitted when filed; `tree.sha256` gives every file's hash, and
`sha256sum -c tree.sha256` checks it).

## Status

The track NC gates are red against HEAD, red against the build before the review
fixes, and green with track NC. Every behaviour's gate was also seen to fail under
mutation, including eight overcorrections (50 of 50 killed).
Four things are **not** shown here:

- **No live capture.** This container has no database and no model key. The
  database reads are mocked at `db.select` in the tests, so the SQL the device
  reconciler sends (it now selects `status` and `previous_document_id`) is proven
  by type and by reading it, not by a live query.
- **The client is untouched.** `client/` is S4's lane. No client file reads either
  verdict (below), so nothing on screen shows a false "clean" from these checks.
- **The prose reconciler is not fixed.** `reconcile_dossier_numbers` has the same
  defect and no verdict. It is handed on as an open ADR-0014 §7 item (Handed on).
- **The capability manifest is not regenerated.** Regenerating it also rewrites
  eight other lanes' tools (Handed on).

## What was wrong

ADR-0014 §7 names two checks that answered "clean" when they had compared nothing.

**`checkInternalNumericalIntegrity`** (behind `check_numerical_integrity`) looks
for one labelled quantity (N =, a dose, a NOAEL, a p-value …) stated with two
values in the same draft. At HEAD it returned verdict `'clean'`, and the tool told
the model *"No numerical inconsistencies detected."*, when:

1. the draft states no labelled figure (`factsExtracted` 0);
2. every labelled quantity is stated once, so no figure was compared with another.

**`reconcileDeviceDocuments`** (behind `reconcile_device_documents` and
`POST /api/change-propagation/programs/:programId/reconcile-device-documents`)
reads a device programme's post-market documents and reconciles their labelled
figures through the structured engine `reconcileDossierNumbers`. At HEAD:

3. documents that state no labelled figure short-circuited to a hand-built
   `'clean'` report with `figuresReconciled` 0. Its own doc comment said it did
   this *"when fewer than two documents carry comparable figures"*;
4. figures that all sit in one document went through the engine and also came
   back `'clean'`. `reconcile_extracted_figures` uses the same engine, so the same
   was true of any figure set with no quantity stated in two places.

The review then found four ways the build's own `'clean'` still overstated what
was compared (review [1], [3], [4]/[6], [5]):

5. a superseded post-market document and its verbatim successor were two
   documents, so a programme whose only PSUR had been superseded once came back
   `'clean'`, "1 quantity compared across documents";
6. a confidence interval or an age range was compared on its lower bound only;
7. one document's figure, emitted with its module and without it, was two places;
8. counts agreed within a 0.5% spread, so N = 1000 against N = 1004 agreed.

In a regulated dossier each of these is a false negative presented as a finding.

## The change

**Vocabulary:** `shared/ana/dossier-consistency.ts` (H2's module, broadened).

- Its module doc now names the three families it holds: the dossier check, the
  cross-document reconciliation, and the within-document integrity check. It keeps
  its path because readers already import it (review [10]).
- `RECONCILIATION_NOT_ASSESSED_REASONS`: `no_current_documents | no_figures |
  no_shared_quantities`. The reconciler's verdicts are H2's
  `DOSSIER_CONSISTENCY_VERDICTS`; no second verdict list was added.
- `NUMERICAL_INTEGRITY_VERDICTS`: `clean | review_candidates | likely_inconsistency
  | not_assessed`. The integrity check reports candidates for a person to
  adjudicate, not divergences, so mapping its verdicts onto `blocker` /
  `minor_issues` would change what its existing readers are told.
- `NUMERICAL_INTEGRITY_NOT_ASSESSED_REASONS`: `content_too_short | no_figures |
  no_repeated_figures`.
- `FIGURE_AGREEMENT_SPREAD` (0.005) and `FIGURE_EXTRACTION_MIN_LENGTH` (20): the
  engine and the copy read the same constants (reviews [2], [7]).
- The header says why there are three reason lists, and why the dossier check
  keeps `no_figures_in_draft` (review [9]).

**Decisions and copy:** `server/services/intelligence/consistency-verdict.ts`.

- `findingVerdict` is the one severity ladder: critical → blocker, high →
  needs_review, other → minor_issues. The dossier check, the reconciler (whose
  private `computeVerdict` was the same ladder) and the integrity check
  (`likely_inconsistency` for critical, `review_candidates` otherwise; review [8])
  all call it.
- `integrityVerdictFor`, `reconciliationVerdictFor`: a finding is always
  reported; without one, `'clean'` needs at least one quantity actually compared.
- `integrityRecommendationFor`, `reconciliationInstructionFor`: one factual
  sentence per reason, each ending *"this is not a clean result."* The `'clean'`
  copy counts what was compared and states the agreement rule (`AGREEMENT_RULE`,
  from the shared spread), in both the integrity and the dossier copy.
- `DocumentScope`: a caller that read documents (the device reconciler) passes
  what it read, how many current documents, and how many versions it set aside, so
  the copy never speaks for text it did not read (reviews [1], [2]).

**Engines.**

- `cross-artifact-consistency.ts`: `checkInternalNumericalIntegrity` reports
  `quantitiesCompared` and `notAssessedReason`. One agreement rule, `figuresAgree`,
  replaces `valuesMatch` and the integrity check's inline spread. It compares both
  bounds of a range (`RANGE_LABELS`), counts and other whole numbers exactly
  (`EXACT_MATCH_LABELS`: sample size, batches, shelf life, weeks, age, RPN), and
  measured values within `FIGURE_AGREEMENT_SPREAD`. A dossier divergence on a
  range now reads "0.5 to 0.9", not "0.5 0.9".
- `dossier-number-reconciler.ts`: `quantitiesCompared` counts quantities stated in
  two places (two documents, or two modules of one document; a figure with no
  module is its document). `noFiguresReport(documentsRead)` replaces the device
  reconciler's hand-built report.
- `device-document-reconciler.ts`: `currentDocuments` sets aside any document that
  is superseded or withdrawn, or that another document names as its previous
  version, and counts it (`versionsSetAside`). `documentsScanned` counts the
  current documents read. `DEVICE_TEXT_READ` names the text read (the summary,
  risks-identified and benefit-risk narratives, not the structured content).

**Tools, route and the model's view.**

- The three handlers (`check_numerical_integrity`, `reconcile_extracted_figures`,
  `reconcile_device_documents`) take their copy from the shared functions. At
  HEAD the integrity copy was an inline ternary that sent any verdict it did not
  know to the "LIKELY INCONSISTENCY" copy, and both reconcilers sent one fixed
  instruction, "report these conflicts", whatever the verdict.
  `reconcile_device_documents` also returns `versionsSetAside` and passes its
  `DocumentScope`.
- The route returns the reconciler's result unchanged, now with `versionsSetAside`;
  a route test pins that `not_assessed` reaches the caller as `not_assessed`.
- The three tool descriptions name `not_assessed` within the 1024-character trim
  (`gateway.ts`): integrity 966 characters; device 1017 in full, including
  its grounding note; `reconcile_extracted_figures` states the engine's definition
  of a place about 650 characters in. One sentence was added to
  `base-system-prompt.ts` for `check_numerical_integrity`.

**Behaviour changes a caller can see:**

| Case | HEAD | Now |
|---|---|---|
| Integrity: content under 20 characters | `clean`, "No numerical inconsistencies detected." | `not_assessed` (`content_too_short`), "The content is under 20 characters, so it was not read for figures." |
| Integrity: no labelled figure, or each quantity stated once | `clean`, same copy | `not_assessed` (`no_figures`, `no_repeated_figures`), the copy says what was found and that nothing was compared |
| Integrity: a quantity stated twice, agreeing | `clean` | `clean`, the copy counts the quantities and states the agreement rule |
| Device: no current document states a figure | `clean`, `figuresReconciled` 0 | `not_assessed` (`no_figures`), the copy names the text read |
| Device: figures in one current document only | `clean` | `not_assessed` (`no_shared_quantities`) |
| Device: a superseded version and its successor | `clean` (compared with its own copy); a corrected value, a false conflict | the version is set aside and counted; `not_assessed` unless another current document states the quantity |
| Device: every document superseded or withdrawn | `clean` or a comparison of retired text | `not_assessed` (`no_current_documents`) |
| `reconcile_extracted_figures`: no quantity in two places | `clean` | `not_assessed` (`no_shared_quantities`); an empty `figures[]` is still `needs_parameters` |
| One document's figure with and without its module | `clean` | `not_assessed` |
| A range whose upper bound differs (integrity and dossier check) | `clean` | a candidate / a divergence |
| N = 1000 against N = 1004 (integrity and dossier check) | `clean` | `likely_inconsistency` / `blocker` |
| A conflict or candidate | `blocker` / `needs_review` / `minor_issues` / `likely_inconsistency` / `review_candidates` | unchanged, and still reported wherever found, including inside one document |

## Proof

| Stage | File | Result |
|---|---|---|
| Part A: the final test files against HEAD `eb62b566c` source for all 11 track NC source files | `red.txt` | 59 failed / 18 passed (77). Every failure is an assertion on the missing behaviour, or a read of a shared list or constant that does not exist at HEAD (a `TypeError` inside the test, never an import failure). The 18 passes are guards: agreement stays clean, a disagreement stays flagged, an empty figure list is still a parameter error, no documents is still `not_found` / 404, a conflict keeps its instruction |
| Part B: the final test files against the track NC build before the review fixes | `red.txt` | 31 failed / 46 passed. Each failure is a review objection: [1] ×10, [2] ×6, [3] ×3, [4]/[6] ×6, [5]/[7] ×6 |
| Part 0: the review tests as first written, against the pre-review build, before any fix | `red.txt` | 30 failed / 45 passed (75). Tests first, red first. One later review test (the dossier copy states the same rule) was run red alone before its fix; its red against the build is in Part B |
| Part C: the build's own red, HEAD `39b3027cc`, the first three NC test files | `red.txt` | 33 failed / 12 passed (45), as recorded by the build pass |
| With track NC: the four NC files plus 12 neighbours (every test that imports the engines, the tools, the tool definitions, the base prompt, the extractor, or H2's dossier check) | `green.txt` | 16 files, 237/237. NC files: integrity 20, agreement 14, reconciliation 39, route 4. H2: `not-assessed` 39, `unreadable` 4 |
| Tool classification gates: `tool-authorization`, `ana-launch-scope`, `tool-registry-consistency` | `green.txt` | 3 files, 825/825 |
| Mutations of the final tree | `mutations.txt` | 50/50 red. N1–N9, R1–R10 and S1–S2 re-aim the build's own mutations at the final code; V1–V29 cover the review fixes. Eight are overcorrections (R4, R5, V4, V5, V9, V15, V20, V23). Each file was restored and its sha256 checked |
| `npx tsc --noEmit` (full project) | `green.txt` | exit 0, 0 errors, on the final tree. The sibling track's in-progress files also typechecked clean at that moment |
| eslint, each touched file against its HEAD content (via `--stdin`), and the four new test files | `green.txt` | No file gained a warning. `cross-artifact-consistency.ts` went from 1 to 0. `dossier-number-reconciler.ts` keeps HEAD's one complexity warning (no branch added). `AnaToolExecutor.ts` 101 → 101. New test files 0/0, none ignored |
| `ci:check-unrun-tests`, `ci:internals-in-copy`, `ci:unreferenced-modules`, `ci:unverified-verdicts` | `green.txt` | exit 0 each |
| `ci:duplicate-exported-types` | `green.txt` | exit 1 on the two collisions recorded at HEAD by the build pass (`DocumentProvenance`, `EligibilityAssessment`), in files nobody in this lane touched. None of this track's names is flagged |

## Review follow-through

| # | Objection | Disposition |
|---|---|---|
| 1 (major) | The device reconciler read a superseded document and its verbatim successor as two documents, so a programme whose only PSUR had been superseded once came back `'clean'`, "1 quantity compared across documents" | **Fixed.** `currentDocuments` (`device-document-reconciler.ts`) sets aside a document that is `superseded` or `withdrawn`, or that another document names as its `previousDocumentId`. The second rule holds even when the old row's status was never updated: `supersedeDocument` inserts the successor and then updates the old row in a separate statement. Set-aside versions are counted (`versionsSetAside`), never compared; `documentsScanned` counts current documents. With none current, the reason is `no_current_documents`. The tool's copy says how many versions were set aside. Tests: v1 superseded and v2 identical is `not_assessed` (engine, tool and route); a predecessor with a stale status is still set aside; a value corrected in v2 is not a conflict with v1; a withdrawn document is set aside; two current documents beside a superseded third still compare, and a real conflict is still a blocker; every document retired is `no_current_documents`. Mutations V1–V13 (V4 and V5 are overcorrections) |
| 2 | The `no_figures` copy claimed something about content that was never read: text under the extractor's 20-character minimum, and the device documents' structured content | **Fixed.** (a) `FIGURE_EXTRACTION_MIN_LENGTH` is a shared constant the extractor and the verdict read. Content under it is `content_too_short`, "The content is under 20 characters, so it was not read for figures." The test that pinned `no_figures` for `'N = 240.'` now asserts `content_too_short`, and `'N=648 vs N=641.'` is a test case. (b) Both `no_figures` copies now say what the check found, not what the content states: "No labelled figure … was found in the content" and "No labelled numeric figure was found in the text read". The device tool adds "Read: the summary, risks-identified and benefit-risk narratives (not the structured content) of N current documents." Mutations V14–V18 (V15 is an overcorrection) |
| 3 | A range was compared on its lower bound only, so a CI whose upper bound differs came back `'clean'` under copy that claimed a checked agreement | **Fixed in both prose checks.** The dossier check's `valuesMatch` had the same lower-bound-only comparison, so the fix is one rule, `figuresAgree`, for both. A `RANGE_LABELS` statement (confidence interval, age range) is its two bounds, and two statements agree only when both bounds do. A candidate's `distinctValues` and a divergence's text read "0.5 to 0.9". Tests: the same lower CI bound with a different upper bound is a candidate (integrity) and a divergence (dossier); an age range likewise; a range stated twice with both bounds equal is still clean (the overcorrection guard). Mutations V19–V21 (V20 is an overcorrection) |
| 4, 6 | A figure's module split one document into places, so one document's figure with and without its module was "compared across documents"; the copy and the tool descriptions said "two different documents" while the engine counted places | **Fixed.** A place is a document, or a module of one document when figures name their modules. A figure with no module is its document and adds no place of its own. Every copy and doc string now uses the one definition: "two places (two documents, or two modules of one document)" and "compared across documents (or modules of one document)". The `reconcile_extracted_figures` description says the same; the device description says "two current documents", because device figures carry no module. Tests: `{csr}` with `{csr, 5.3.5.1}` is `not_assessed`; a module-less figure in one document and a moduled one in another is still clean (the overcorrection guard); two modules of one file are still two places (the build's R4). Mutations R3, R4 (overcorrection), V27, V28 |
| 5 | Product decision: critical counts must match exactly | **Decided and implemented** (the founder delegated the product decision; ADR-0014, Deciders). Counts and other whole-number labels (`EXACT_MATCH_LABELS`: sample size, batches, shelf life in months, weeks, age in years, RPN) agree only when equal. The 0.5% rounding spread stays for measured values (means, CIs, p-values, doses, performance percentages). It applies to both prose checks, because they share `figuresAgree`. The structured engine is unchanged: it takes the caller's tolerance, which defaults to exact. Tests: N = 1000 against N = 1004 is `likely_inconsistency` (integrity) and `blocker` (dossier); the same N with a thousands separator is still clean; a measured value inside the spread still agrees (both checks). Mutations V22, V23 (overcorrection: every label exact) |
| 7 | The 0.5% spread was a bare literal twice in the engine and hard-coded in the copy | **Fixed.** `FIGURE_AGREEMENT_SPREAD` in the shared module is read by `figuresAgree` and by the copy (`AGREEMENT_RULE`). Tests: the constant is 0.005; a measured value at 0.8× the spread agrees and one at 2× does not; the copy contains the constant's percentage and not the old hard-coded sentence. Mutations V24–V26 |
| 8 | `integrityVerdictFor` kept a second severity ladder | **Fixed.** It calls `findingVerdict` and renames the result: `blocker` → `likely_inconsistency`, anything else → `review_candidates`. That is the old ladder exactly, since the old one had no high/medium distinction. Mutation V29 |
| 9 | The example list of labelled figures was written twice; three reason lists with overlapping semantics | **Fixed (the constant); explained (the lists).** `FIGURE_EXAMPLES` is one constant used by the dossier and integrity copy. The shared header now states why there are three reason lists (each check returns only reasons it can produce, so a reader switching on one list is exhaustive for that check) and why the dossier check keeps `no_figures_in_draft` (track H's committed wire value; the check reads two sides, and the name says which side had none). The two single-sided checks both use `no_figures`. No behaviour changed, so there is no red test |
| 10 | The shared module's name misdescribes the integrity list | **Fixed (the doc).** The module doc now names the three families it holds and says why it keeps its path (readers import it by that path; the client hand-off names it). The integrity list stays shared: the S5 harness reader and any later client renderer must read it |
| 11 | The prose engine `reconcile_dossier_numbers` keeps the "found consistent over nothing" defect, and exports a function with the same name as the structured engine | **Declined here, handed on as an open ADR-0014 §7 item.** Fixing it is a third engine in this track, and the objection's own fix keeps the hand-off. This track may not edit the work-order board, so the item is recorded in Handed on below for the lane to put on row 74. The plan is there: reuse `RECONCILIATION_NOT_ASSESSED_REASONS` and `reconciliationInstructionFor`, and rename one of the two `reconcileDossierNumbers` exports |
| 12 | The capability manifest carries the old descriptions, and no gate catches it | **Declined here, handed on.** `npm run manifest:ana` was run and its output inspected (then the file was restored byte-for-byte, sha256 `4e719808…` checked). The regenerated file changes 11 tools and adds one. Four are this lane's (`check_numerical_integrity`, both `reconcile_*` and H2's `check_dossier_consistency`). The other eight are committed changes from other lanes that nobody regenerated: `catalog_project_document`, `list_vault_documents`, `place_project_document`, `read_spreadsheet`, `read_vault_document`, `qms_change_transition`, `retire_qms_document` and the new `update_plan`, including three `governed` flags. Hand-patching only this lane's four entries would leave a file no generator run produces. The regeneration, and a freshness gate, are handed on to one commit that owns the whole file |

## Every consumer of the verdicts

Nothing turns `not_assessed` into a pass, a percentage or "consistent" on the server:

- **The three tool handlers** are the only server callers of the two engines
  besides the route. They were updated, and their copy comes from the shared
  functions.
- **The route** (`change-propagation.ts`) passes the result through unchanged; a
  route test and mutation R10 pin it.
- **The model** reads three tool descriptions and one sentence of the base system
  prompt. All were updated.
- **No readiness figure reads either verdict.** No score computation, lineage or
  turn-record reader, MCP catalog or eval fixture reads them.
  `agentic-loop.ts:708`, `tool-selection.ts` and `governed-write-tools.ts:85`
  reference the tool name only.
- **`extractNumericalFacts` has other readers** (`living-record/document-binder.ts`,
  `document-citations.ts`). Its output shape is unchanged; only its length
  threshold became the shared constant, with the same value.
- **Client (listed, not edited):** the only client reference to either tool is the
  progress label at `client/src/concept2cure/components/ana/useAnaChat.ts:295`.
  `mapConsistencyResult` (`useAnaChat.ts:223-231`) runs only for
  `check_dossier_consistency`. Nothing in `client/src` calls the
  reconcile-device-documents route or parses a `reconcile_*` result. The dossier
  divergence's `draftValue` / `existingValue` for a range now read "0.5 to 0.9";
  the client reads them as strings (`useAnaChat.ts:254-255`).

## Handed on

- **Open ADR-0014 §7 item, for row 74 (review [11]).** The prose reconciler
  `reconcile_dossier_numbers` (`server/services/ana/dossierReconciliation.ts:143`,
  handler at `AnaToolExecutor.ts:17836`) has the same "clean over nothing"
  defect and no verdict field. Its `consistentLabels` lists labels found only once
  ("consistent everywhere they appeared (for assurance)"). With zero facts its
  instruction still says *"No cross-document numerical conflicts were found … State
  which labels were checked and found consistent."* The `reconcile_extracted_figures`
  description points the model at it as the alternative. The fix:
  - add `quantitiesCompared` (labels found in two or more documents) and a verdict
    from `reconciliationVerdictFor`;
  - reuse `RECONCILIATION_NOT_ASSESSED_REASONS` and `reconciliationInstructionFor`;
  - list only compared labels as consistent;
  - rename one of the two `reconcileDossierNumbers` exports (the structured one is
    `dossier-number-reconciler.ts:302`), so one name means one engine.
  This track may not edit the board; the lane should record the item on row 74.
- **Capability manifest (review [12]).** Run `npm run manifest:ana` in one commit
  that owns the whole file. It changes this lane's four tool descriptions and
  eight other lanes' committed entries (list in the review table), including three
  `governed` flags. A freshness gate (regenerate to a temporary file and compare)
  would stop the drift; it would fail on the eight stale entries until then.
- **The structured engine's caller tolerance.** `reconcile_extracted_figures` and
  the device route accept a caller `tolerance` that applies to every quantity key,
  counts included. The default is exact. Whether counts should ignore a caller's
  relative tolerance is a separate product question from review [5], which
  concerned the fixed spread of the prose checks.
- **Device figures for a range.** `documentToFigures` maps a CI's upper bound to
  the figure's `unit`, so a CI whose upper bound differs across device documents is
  reported as a "UNIT MISMATCH". It is flagged, not missed, but under the wrong
  words. Carrying the bound as a second figure (or a `range` field) is the fix.
- **The device reconciler reads three narrative columns only.** The structured
  `content` JSON is not read. The copy now says so; reading it is a scope change.
- **S5 harness reader:** map `check_numerical_integrity` and `reconcile_*` verdict
  `not_assessed` to `not_applicable`, with the statement taken from
  `notAssessedReason` (including `content_too_short` and `no_current_documents`).
  Map an unrecognised verdict to `error`. The spec file is not in the tree.
- **Client (S4's lane, not edited).** `SubmissionCenter.tsx:267` can import
  `plural(n, one, many)` from `shared/utils/plural.ts`, which has the same
  signature. `EctdCompile.tsx:513` and `mapConsistencyResult`'s
  unknown-verdict → `'clean'` fallback (`useAnaChat.ts:223-231`) are still H2's
  hand-offs; neither touches these verdicts.
- **Commit together.** The 11 changed source files and the 4 new test files.
  `consistency-verdict.ts`, `cross-artifact-consistency.ts`,
  `dossier-number-reconciler.ts` and `device-document-reconciler.ts` import names
  that exist only in the working-tree `shared/ana/dossier-consistency.ts`.

## Lane disclosure

**S4 (the Manual/Auto builder and its review fixer) was working in this same tree
while this track was built and reviewed, and a sibling track (the gateway model
governance and PQ work: `server/services/ai-gateway/`, `ai-governance/`,
`server/eval/`) ran in parallel.** S4 committed `eb62b566c` during the review; that
commit touches no track NC file (checked with `git show --stat`). This track did
not edit, check out, stash, restore or reformat any file of either:

- S4: `client/`, `server/routes/ana-ri/`, `server/services/ana/run-*.ts`,
  `turn-run-policy.ts`, `tool-trace.ts`, `shared/ana/run-policy.ts`,
  `shared/ana/run-control-limits.ts`, lineage and turn-record files;
- the sibling track: every file modified or untracked at this pass's start that is
  not a track NC file (`status-at-start` is in `green.txt`);
- the work-order board, the lane index README and `docs/adr/`.

Only this track's own test files and their neighbours were run, never a broad
suite, with `--maxWorkers=2`. The mutation and red re-record scripts:

- swapped only this track's files, plus `server/routes/change-propagation.ts` for
  mutations R10 and V12 (a cold file, last changed 2026-09-05, that track NC does
  not otherwise change);
- checked each file's sha256 before restoring it, and refused to restore over a
  change made by another writer;
- verified every restore.

`docs/ana-capability-manifest.json` was regenerated once to inspect the diff
(review [12]) and restored from a copy; its sha256 (`4e719808…`) matches HEAD's
and `git status` shows it clean. No `git stash`, `checkout -- .`, `reset` or
`clean` was run, and nothing was committed.

The track NC files:

- **changed source:** `shared/ana/dossier-consistency.ts`, `shared/utils/plural.ts`,
  `server/services/intelligence/consistency-verdict.ts`,
  `cross-artifact-consistency.ts`, `dossier-number-reconciler.ts`,
  `device-document-reconciler.ts`, `AnaToolExecutor.ts` (three handlers only),
  `document-intake-tool-defs.ts` (one string), `changePropagationTools.ts` (one
  string), `reconciliationTools.ts` (one string), `base-system-prompt.ts` (one
  sentence);
- **new tests:** `numerical-integrity-not-assessed.test.ts`,
  `figure-agreement.test.ts`, `figure-reconciliation-not-assessed.test.ts`,
  `server/routes/__tests__/reconcile-device-documents-not-assessed.test.ts`.

Checked with `git log -5` and `git blame` at each edit point:

- **`AnaToolExecutor.ts`** is inside other lanes' 24h window (`9d2134b52`,
  `0ed213fec`, and this lane's `eeedc6231` and `eea56da2c`). All eleven NC hunks
  (`git diff -U0`) are inside the `check_numerical_integrity`,
  `reconcile_extracted_figures` and `reconcile_device_documents` handlers, which
  blamed only to `^17da357f6` (2026-09-05) before this track.
- **`shared/ana/dossier-consistency.ts`, `consistency-verdict.ts`,
  `shared/utils/plural.ts`, `cross-artifact-consistency.ts`,
  `document-intake-tool-defs.ts`, `base-system-prompt.ts`** were changed in the
  window only by this lane (H2 `eea56da2c`, S3 `eeedc6231`). The dossier check's
  copy and agreement rule (H2's code) changed here on purpose: reviews [3], [5] and
  [7] are one rule for both prose checks, and H2's 43 tests stay green.
- **`dossier-number-reconciler.ts`, `device-document-reconciler.ts`,
  `changePropagationTools.ts`, `reconciliationTools.ts`** are cold (last change
  `462a6ca7a`, 2026-09-05).
