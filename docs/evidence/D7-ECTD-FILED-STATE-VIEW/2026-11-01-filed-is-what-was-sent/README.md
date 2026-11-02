# D7 / D2: what the agency holds is what was sent (F1 repair, 2026-11-01)

Package **F1** (repair of shipped behaviour), rows **D7** (eCTD filing) and **D2** (governed documents reach the agency
intact). Built on `concept2cure-v2` at HEAD `609ef94c7`, uncommitted; the orchestrator commits it with the trailers
`Plan: F1`, `Completes: server/services/ectd/prior-sequence-loader.ts` and
`Completes: server/services/submission-gateways/index.ts`. The commit, evaluated before it exists through the plan
gate's own `evaluateCommit`, has no finding (`confirm/plan-check.txt`). The build adds no migration, no column, no
table and no new non-test file (`confirm/change-set.txt`).

The transmit guard now records, on the transmittal row it already writes before the wire, the leaf manifest of the
package it hands the gateway and the dispatch binding. The filed-state fold reads each filed sequence from the
transmittal its transmit attempt binds. It falls back to the sequence's compiles, labelled as such, only for a
sequence sent before this change.

Where the evidence is:

| Folder | Who made it | What it holds |
|---|---|---|
| `1-server/` | the build, server part | red before the change, green after, the design's six mutations, the probes |
| `2-view-copy/` | the build, card copy part | red, green, five copy mutations, the copy gates, the card opened in the running app (`live-check.txt`, `live/`) |
| `review/` | the fixer, after review | the review fixes' mutations (1-23), green, gates, ESLint, the row-lock comparison, the pre-deploy query run locally |
| `confirm/` | the independent verifier, 2026-11-02 | every run below, re-done on the final tree, and each failure compared with a clean export of HEAD |

## What already exists

Every piece below was extended. None was rebuilt. Each line is anchored at HEAD `609ef94c7` in
`confirm/what-already-exists.txt`.

- **`server/services/ectd/prior-sequence-loader.ts`.**
  - `readFiledManifestRows` (:204 at HEAD) is the one query behind the filed state. Both
    `loadLatestPriorManifestBySubmission` (:153) and `loadFiledStateBySubmission` (:249) read it. It read every
    non-rehearsal `ectd_compilations` row of a sent or acknowledged sequence, and nothing else.
  - `foldManifestRows` (:296) holds the per-leaf history and the supersession by modified-file. Only its parameter's
    type changed.
  - `loadRehearsalPriorManifestBySubmission` (:381) is unchanged byte for byte.
  - `loadPriorSequenceManifest` (:62), AnA's named prior, finds the submission through a compile and then calls
    `loadLatestPriorManifestBySubmission`.
- **The transmit guard, `getGateway` in `server/services/submission-gateways/index.ts`.**
  - `assertDispatchBinding` (:127) binds a transmit to the organization, the verified signature and the bundle SHA.
  - `archiveSentPackage` (:302) keeps the exact bytes before the wire.
  - `markRefusedBeforeWire` (:145) marks a refusal as nothing transmitted.
  - `gatewayAccount` and `sentPackage` were already stamped server-side, after the caller's metadata.
- **The transmittal row, written 'pending' before any connection.**
  - FDA ESG's `createTransmittalRow` (`fda-esg.ts:360`) already wrote `dispatchBinding` (:378).
  - The REST helpers (`rest-gateway-helpers.ts:92`) and EMA CESP (`ema-cesp.ts:261`) stored the request's metadata
    verbatim (:110, :271).
  - Every later writer of the row's `metadata` merges into it, so the record survives:
    - `fda-esg.ts:670` (`jsonb_set`, keys `as2`/`as2Receipt` only);
    - `fda-esg-receipts.ts:82` (spread of `current.metadata`);
    - `filed-sequence-rejection.ts:341` and `governed-transmit.ts:842` (`||`).
  - No trigger guards that column.
- **`ectd_sequences.transmit_attempt_id` and `transmit_signature_action_id`.**
  - Added by `migrations/20261014_ectd_transmit_attempt_binding.sql`.
  - Claimed at `submission-service.ts:2469`, and nulled at :2496 when a pre-wire refusal releases the claim.
- **`transmitSequence`** is the only production caller that sets `dispatchBinding`
  (`submission-service.ts:2922`). It passes `bundle: assembled.bundle` (:2916).
- **`buildLeafManifest`** (`server/services/ectd/sequence-manifest.ts:98`) is the stored shape every compile row uses
  (`server/routes/ectd-compile.ts:1190`).
- **Every assembled bundle carries a leaf manifest.**
  - `packageEctdSubmission` (`submission-gateways/regional-packager.ts:1004`) builds one (:1476) and returns it (:1512-1516).
  - `package-from-core.ts` returns that bundle (:598, :617).
  - `assemble-from-core.ts` spreads it (:449-450).
- **`GET /api/ectd-compile/:projectIdent/filed-state`** (`server/routes/ectd-compile.ts:1529` at HEAD) returns
  `loadFiledStateBySubmission` and answers 503 when the fold cannot be read (:1548 on the tree).
- **The card** `client/src/concept2cure/v2/surfaces/EctdFiledState.tsx` ("On file at the agency") is rendered inside
  `EctdCompile.tsx` (:1603).
- **The shared words for a dispatch status**, `dispatchWords` in `client/src/concept2cure/v2/surfaces/CommitmentRow.tsx`
  (:114), are already used by `CommitmentFulfilment.tsx`. The card imports them; no second map was written.
- **The one region resolver**, `canonicalRegionOf` (`shared/regulatory/region-identity.ts:163`), is imported by the fold.
- **Not touched:** the package path's own fold, `foldFiledState` in `package-sequence-lifecycle.ts:231` (VEEVA gap 6.3,
  S5's).
- **Searches that found no existing record of what was sent:**
  - by name: `sentManifest`, `transmittedManifest`, `sent_manifest`, `transmittedLeaves`, `filedManifest`,
    `whatWasSent` (0 files each);
  - in history: `git log --all --diff-filter=D` on `*transmitted*`, `*sent-manifest*`, `*filed-state*`,
    `*prior-sequence*`, `*leaf-manifest*`, `*FiledState*` (0 deleted paths each).

## The defect

Both defects reproduce at HEAD `609ef94c7`, with the orchestrator's probes unchanged except for their import path
(`confirm/probes.txt` §0).

- **(a) Phantom leaf.** Every non-rehearsal compile of a sent sequence was folded, including previews compiled while it
  was a draft. So a leaf only a preview carried read as on file: `["draft-only.pdf","general.pdf"]`.
- **(b) Sent without a compile.** A sequence sent with no compile row was missing. The view called it not filed, and the
  next sequence bound against an empty prior: `{"priorSequenceNumber":"","leaves":[]}`.

Both reach the next sequence's compile, freeze, dispatch and transmit through `loadLatestPriorManifestBySubmission`
(`package-from-core.ts:462`), and AnA's named prior through `loadPriorSequenceManifest` (`AnaToolExecutor.ts:9732`).
So this is a filing defect, not only a view defect (`confirm/what-already-exists.txt`).

## Decisions

1. **The record of what was sent is the transmittal row the guard already writes.**
   - There is no migration, no column, and no second record beside it. The design's "Critique and resolution" rejects
     columns on `ectd_compilations` (`confirm/f1-filed-is-what-was-sent.design.md`, the binding design, copied).
   - No file under `migrations/`, `db/`, `scripts/db/` or `shared/` changed (`confirm/change-set.txt`).
2. **The guard stamps both keys server-side, after the caller's metadata** (`submission-gateways/index.ts`; the source
   diff is in `confirm/change-set.txt`).
   - For a bound transmit, `dispatchBinding = req.dispatchBinding` and `leafManifest = buildLeafManifest(req.bundle.leafManifest)`.
   - For an unbound transmit, both keys are `undefined`, which JSON drops. A caller's own keys of those names never reach
     a row written after this change.
   - A bound transmit whose bundle has no leaf manifest is refused before anything is archived or sent, through
     `markRefusedBeforeWire` with `NOTHING_TRANSMITTED`.
   - It cannot block a real sequence transmit: every assembled bundle carries a leaf manifest (What already exists).
3. **The fold reads the sequence's own send.** A transmittal row counts for a sent or acknowledged sequence only if all
   four hold:
   - it belongs to the same organization;
   - its `metadata.dispatchBinding` names the sequence's `transmit_attempt_id`, its id and its
     `transmit_signature_action_id`;
   - its gateway's region is the sequence's own agency, compared through `canonicalRegionOf`;
   - (and, for the outcome below) whether it carries a `leafManifest` array.

   The outcomes:
   - Exactly one counting row, with a manifest: that is the sequence's record (`basis: 'transmit'`), and none of its
     compiles are read.
   - More than one counting row, with or without a manifest: the read throws, naming the sequence and the rows. Choosing
     one would be guessing what the agency holds.
   - None, or one without a manifest (a send made before this change): the sequence keeps the earlier read of its
     non-rehearsal compiles (`basis: 'compiles'`).
   - No compile either: one row `basis: 'none'`, with no leaves. The lifecycle read refuses any such sequence below its
     bound, naming it. That covers compile, freeze, dispatch, transmit and AnA's named prior. The view lists it as not
     included.
4. **The view's data names each sequence's basis.** `loadFiledStateBySubmission` gives each sequence
   `basis: 'transmit' | 'compiles' | null` and `filed = basis !== null`. The route passes it through; its diff is a
   comment only (`confirm/change-set.txt`).
5. **The card says it in words, as a copy change only.** No className, style or JSX element changed
   (`confirm/change-set.txt`). The layout waits for D0-2 (the design), and this build moves nothing about where the card
   lives.
6. **AnA's named-prior refusal says what its lookup found.** It no longer says "not on file", which the card may
   contradict. The code `PRIOR_SEQUENCE_NOT_FOUND` is unchanged.
7. **What was kept as it was:**
   - `foldManifestRows`' logic and the rehearsal read (`confirm/what-already-exists.txt`);
   - `submission-service.ts`, the schema and the migration set (`confirm/change-set.txt`);
   - `CommitmentRow.tsx` and every file locked by D0 (`confirm/change-set.txt`).

## What a user sees

The card "On file at the agency" sits inside Compile & export. Sentences are quoted from
`client/src/concept2cure/v2/surfaces/EctdFiledState.tsx`. Each state is pinned by a case of
`client/src/concept2cure/v2/__tests__/ectdFiledState.test.tsx` (`confirm/slice-tests.txt`). Two were seen in the
running app (`2-view-copy/live-check.txt`, `2-view-copy/live/card-mixed.png`, `2-view-copy/live/card-unrecorded.png`).

| State | Header | What the card says |
|---|---|---|
| Every filed sequence read from what it sent | through sequence N | "2 documents are on file, read from what each sequence sent. Includes 0000 (acknowledged by the agency), 0001 (sent to the agency)." |
| Some read from what they sent, some from their compiles | through sequence N | "Sequence 0001 is read from what it sent; sequence 0000 is read from its compiles, recorded before the platform kept what each send carried, so what is listed for it may differ from what it sent: a document may be listed that it did not carry, or be missing that it did." |
| Every filed sequence read from its compiles (or a server without `basis`) | through sequence N | "Sequences 0000 and 0001 are read from their compiles, recorded before the platform kept what each send carried, …" |
| A sent or acknowledged sequence with neither record | "not fully known" when nothing is folded | "No document is shown as on file, but that is not known in full: nothing on record says what sequence 0000 carried, so the agency may hold documents, or versions of them, that are not shown. Not included: 0000 (acknowledged by the agency, but nothing on record says what it carried)." (live: project 'unrecorded') |
| A send claimed and never settled ('transmitting') | through sequence N, or "not fully known" | "… whether the agency received sequence 0002 is not yet known … Not included: 0002 (a send of it is unresolved, so whether the agency holds it is not known; confirm at the agency)." (live: project 'mixed') |
| Not sent, pending or rejected | unchanged | the status in `dispatchWords`: "not on file at the agency", "rejected by the agency"; no stored value such as "(pending, not filed)" |
| Nothing on file and nothing unknown | "nothing on file" | "Nothing is on file: no sequence of this submission has been sent or acknowledged with a record of what it carried." or "Nothing is on file: every document the included sequences filed has been withdrawn." |
| The fold cannot be read (two rows bind one send) | "not loaded" | The route answers 503 `FILED_STATE_UNAVAILABLE`, "What is on file at the agency could not be read. It is not shown as empty." (`confirm/what-already-exists.txt`) |

On the filing path:

- **A later sequence of a submission that holds an unrecorded sent sequence** is refused at compile, freeze, dispatch,
  transmit and AnA's named prior. The refusal reads: "Sequence 0000 was sent to the agency, but nothing on record says
  what it carried: no record of the send, and no compile. What is on file cannot be read, so nothing was bound against
  it." This is shown in `confirm/probes.txt` §4 and pinned in `filed-state-what-was-sent.pglite.test.ts` and
  `lifecycle-declared-acts.pglite.test.ts` (`confirm/slice-tests.txt`).
- **A bound transmit with no leaf manifest** is refused: "This sequence transmit carries no leaf manifest: nothing
  records what it would carry, so it is not sent. Nothing was transmitted." This is pinned in
  `transmit-records-what-was-sent.test.ts`.

## The change

| File | Change | Lines (+/-) |
|---|---|---|
| `server/services/submission-gateways/index.ts` | `sentLeafManifest`; the guard stamps `dispatchBinding` and `leafManifest` after the caller's metadata; it refuses a bound transmit with no leaf manifest before the wire | +34/-3 |
| `server/services/submission-gateways/types.ts` | comments only: the bundle's `leafManifest` is recorded on the transmittal; four metadata keys a caller cannot supply | +10/-6 |
| `server/services/ectd/prior-sequence-loader.ts` | `readFiledManifestRows` reads the bound transmittal, with compiles as the labelled fallback and `basis: 'none'`; `loadLatestPriorManifestBySubmission` refuses an unrecorded sent sequence; `loadFiledStateBySubmission` returns `basis`; the named-prior sentence | +194/-36 |
| `server/routes/ectd-compile.ts` | the filed-state route's comment | +4/-2 |
| `client/src/concept2cure/v2/surfaces/EctdFiledState.tsx` | copy: `leadLine`, `compilesLine`, `unknownClause`, `notFoldedReason` in `dispatchWords`, "Includes", the header's "not fully known" | +113/-15 |
| `server/services/ectd/__tests__/filed-state-what-was-sent.pglite.test.ts` (new) | 15 cases: phantom leaf, sent without compile, resend, legacy, cross-org, unrecorded, agency, signature, sequence id, ambiguity, history both ways | new, 304 |
| `server/services/submission-gateways/__tests__/transmit-records-what-was-sent.test.ts` (new) | 5 cases: stamps, caller overwritten, unbound removed, refusal, the FDA ESG row | new, 166 |
| `tests/db/ectd-filed-state-view.dbtest.ts` | real PostgreSQL under RLS: phantom leaf, sent without compile, a forged CESP row not read, `basis` | +83/-5 |
| `client/src/concept2cure/v2/__tests__/ectdFiledState.test.tsx`, `ectdCompile.test.tsx` | the card's states | +143/-11, +2/-2 |
| 15 other server tests and `_freeze-gate-fixture.ts` | PGlite schemas gain `submission_transmittals`; three cases that bound silently against an unrecorded sent sequence now expect the refusal or give it a compile; stub pools name their rows | +2/-1 to +30/-3 each |

The counts are from `confirm/change-set.txt` (`git diff HEAD --numstat`).

## Deletion record

No file, surface, component, route or tool is deleted (`confirm/deletions.txt`). Two test cases were replaced in place,
and the copy they pinned was replaced:

| Removed | Replacement on the tree | Gate that proves it reachable |
|---|---|---|
| `ectdFiledState.test.tsx` "names the sequences it folds and the ones it does not, with the reason" (it pinned "Folds 0000 (acknowledged)" and "(sent, but no filed compile with a leaf manifest is on record)") | "names the sequences it includes and the ones it does not, with the reason in words, never a stored status" (:96) | the case itself, passing (`confirm/slice-tests.txt`) |
| `lifecycle-declared-acts.pglite.test.ts` "refuses a declared replace when no filed prior is on record, instead of shipping a replace of nothing" (it asserted a silent bind against an unrecorded sent 0000) | "refuses to assemble against a sent prior that nothing on record describes…" (:148). The skip-with-reason of a declared replace with no filed prior at all stays pinned by `lifecycle-rehearsal.pglite.test.ts:185` | both, passing (`confirm/slice-tests.txt`) |
| The card's sentences "read from the leaf manifests of the filed sequences", "with a filed compile on record", "Folds", and raw statuses | `leadLine`, `notFoldedReason`, `sequencesLine` in the same file | `ectdFiledState.test.tsx` and `review/mutation-15..19-*.txt` |
| `PRIOR_SEQUENCE_NOT_FOUND`'s sentence "is not on file for this organization…" | "could not be found by its number: that lookup goes through a compile…" (same code) | `named-prior-sequence-is-the-filed-state.pglite.test.ts`, `review/mutation-6-named-prior-says-not-on-file.txt` |

The history search for earlier versions found 0 deleted paths (`confirm/what-already-exists.txt`).

## Proof

### Before the change, and the defect

| What | Result | File |
|---|---|---|
| The defects at HEAD, with the orchestrator's probes unchanged except for their import path | both reproduce | `confirm/probes.txt` §0 |
| The server tests, on HEAD's code with the new tests | 13 unit/PGlite cases red (8 fold, 5 guard) and 3 real-PostgreSQL cases red. The refusal case, reworded to fail on an expect, is red again on a clean HEAD export | `1-server/red.txt` |
| The card's tests, on HEAD's card | 6 red, 31 green; the final test files give the same 6 red against a clean HEAD export | `2-view-copy/red.txt` |

### After the change: the verifier's runs (final tree)

| What | Result | File |
|---|---|---|
| Every test file the build adds or changes (20), plus the five PGlite files that import the changed `_freeze-gate-fixture.ts` | 24 files, 236 tests, all pass | `confirm/slice-tests.txt` |
| `tests/db/ectd-filed-state-view.dbtest.ts`, real PostgreSQL, `app_service`, `RLS_ENFORCE=on` | 5/5 pass, including the phantom leaf, sent without a compile, and a forged CESP row not read | `confirm/dbtest-ectd-filed-state-view.txt` |
| Every dbtest within two imports of a changed file, or naming the sequences, transmittals, the fold or the guard (18) | 109 pass. The 2 failing cases and 8 files that refuse this database by their own guard have the same 12 names on a clean HEAD export (107 pass there: the 2 new cases) | `confirm/dbtests.txt` |
| The suites of every changed file: every test within two imports of a changed source file, plus all of `ectd`, `submission-gateways` and `submission-service` `__tests__` | 621 files: 9,230 pass, 15 fail in 8 files. Then 99 more client files, three imports from the card: 1,418 pass, 1 fails. All 16 failing cases fail identically, by name and by the first line of the message, on a clean HEAD export, and none is in a file this build changes | `confirm/wide-tests.txt` |
| `freeze-gate-row-lock.pg.test.ts` (its fixture changed), real PostgreSQL | 1 of 2 fails "the freeze did not wait", identically in 2 runs on the tree and 2 on a clean HEAD export | `confirm/row-lock-tree-and-head.txt` |
| `clientCopyNoProgram.test.ts` | 1 of 5 fails on AnA's `biostatistics.load-design` description, identically on a clean HEAD export | `confirm/clientCopyNoProgram.txt` |
| `npm run -s typecheck` | exit 0, 0 `error TS` lines | `confirm/typecheck.txt` |
| ESLint on every changed or new `.ts`/`.tsx` (26 files) | 0 errors; 8 warnings, all in `server/routes/ectd-compile.ts`, whose warning count is unchanged since HEAD (`ci:pushed-lint-warnings`) | `confirm/eslint.txt`, `confirm/gates.txt` |
| Migration replay | Not applicable: no file under `migrations/`, `db/`, `scripts/db/` or `shared/` changed. One `deploy-migrate` was applied so the DB tests ran on HEAD's migration set (461/461 files, exit 0) | `confirm/change-set.txt`, `confirm/deploy-migrate.once.txt` |
| The orchestrator's two probes | see "The probes" below | `confirm/probes.txt` |
| The card's final copy through the repo's section-9 word list (`notInClientCopy`) and the no-stored-value rule | every combination of status, basis and filed over two sequences: 657 renders, 138 distinct texts, 0 findings; one forbidden sentence added makes it fail | `confirm/copy-words.txt` |
| The fold's agency check against the real router (`transmitRouteFor`) | every routed sequence region's own gateway row is read: 0 mismatches | `confirm/region-pairs.txt` |
| The card in the running app (RULE 4) | both seeded projects: filed-state 200, no page error, the header and lead as in the table above | `2-view-copy/live-check.txt`, `2-view-copy/live/` |

The build's own green runs are `1-server/green.txt`, `2-view-copy/green.txt` (every client test under
`client/src/concept2cure/v2/__tests__`, 891 files) and `review/green.txt`.

### The probes

| Run | Phantom leaf | Sent without a compile |
|---|---|---|
| HEAD `609ef94c7`, unchanged | reproduced | reproduced |
| Tree, unchanged | stops: `column s.transmit_attempt_id does not exist` (exit 1) | the same |
| Tree, schema only (the probes' own scenario: a send made before this change) | **still reproduced**, by design: such a sequence is read from its compiles, labelled | **refused**, naming the sequence; never bound against an empty prior |
| Tree, amended (a send made after this change, with the guard's bound transmittal) | not reproduced: on file `general.pdf` only, basis transmit | not reproduced: 0000 filed, 0001 binds against what 0000 sent (md5 `cccc`), not its compile |

The unchanged probes build their own schema, which lacks the columns of
`migrations/20261014_ectd_transmit_attempt_binding.sql`. The schema-only and amended copies are in `1-server/probes/`,
and each one's diff from the original is in `confirm/probes.txt`. **"Both defects gone" holds for sends made after this
change.** For a send made before it, the phantom leaf is labelled, not removed, and sent-without-compile is refused.

### Mutations: each protection removed, its test shown failing, the file restored byte for byte

| Protection | File |
|---|---|
| The design's six, on the final tree, re-run by the verifier: the fold ignores the transmittal; drops the attempt match; drops the organization filter; takes the first of two; the guard keeps a caller's `leafManifest`; the guard sends without a leaf manifest | `confirm/mutations.txt` |
| The same six, as first built | `1-server/mutation-1..6-*.txt` |
| The fold's four, re-run on the fold after review | `review/mutation-20..23-*.txt` |
| The card's five copy protections, as first built and re-run on the final copy | `2-view-copy/mutation-1..5-*.txt`, `review/mutation-15..19-*.txt` |

### Review fixes, each with its test shown failing without it

| Finding | Fix | Test | Failing without it |
|---|---|---|---|
| Defect (b) was still silent on the filing path for a sequence sent before this change with no compile | `basis: 'none'`; `loadLatestPriorManifestBySubmission` refuses it, naming it; the view lists it as not included | `filed-state-what-was-sent` (2 cases), `lifecycle-declared-acts`, `lifecycle-rehearsal`, `sequence-spine-fda-submission-id` | `review/mutation-1-*` (4 cases red) |
| The fold trusted rows written before the guard | it reads only a row of the sequence's own agency (`canonicalRegionOf`), under its own signature; every binding row counts toward "more than one" | `filed-state-what-was-sent` (4 cases); the dbtest's forged CESP row | `review/mutation-2-*`, `-3-*`, `-4-*` |
| No test failed if the sequence-id match was removed | a case: a row binding the attempt under another sequence's id is not read | `filed-state-what-was-sent` | `review/mutation-5-*` |
| AnA's named-prior refusal said "not on file" | the sentence says what the lookup found | `named-prior-sequence-is-the-filed-state` | `review/mutation-6-*` |
| The receipt's pin on `metadata.leafManifest` was never shown failing | no code change | `fda-esg-receipts.pglite` | `review/mutation-7-*` |
| The guard's FDA ESG case depended on the operator's `FDA_ESG_*` environment | the file clears and restores every `FDA_ESG_*` key; the rejection is pinned as `CredentialError` | `transmit-records-what-was-sent` | `review/mutation-8-*` |
| An unresolved send ('transmitting') was called "not on file at the agency" | its own reason, and the lead says delivery is not yet known | `ectdFiledState` | `review/mutation-9-*`, `-11-*` |
| "Nothing is on file", or a complete count, over a sent sequence with no record | the lead says the hold "is not known in full"; the header says "not fully known" | `ectdFiledState` | `review/mutation-10-*`, `-12-*` |
| The mixed case claimed "read from what each sequence sent" | "each sequence" only when every filed one was; otherwise both bases are named | `ectdFiledState` | `review/mutation-13-*` |
| The compiles note warned one way | it warns both ways | `ectdFiledState` | `review/mutation-14-*` |
| The changed card was never opened in the running app | opened, both cases | — | `2-view-copy/live-check.txt` |
| Probe evidence covered only a rewritten scenario | the probes' own scenario, schema only, run and filed | — | `1-server/probes/legacy-schema.after-change.out.txt`, `confirm/probes.txt` |

## Gates and exits

Every npm script `.husky/pre-push` invokes was run in the hook's order, plus the gates the task names. The output is in
`confirm/gates.txt`.

| Gate | Exit |
|---|---|
| `ci:ectd-stubs`, `ci:risk-codes`, `ci:migration-set-order`, `ci:migration-guard-order` (+ selftest), `ci:install-fresh-overlay-deps` (+ selftest) | 0 |
| `ci:one-design-plan` (+ selftest), `ci:migration-drop-safety` (+ selftest), `ci:one-product`, `ci:class-vocabulary`, `ci:migration-deploy-path` | 0 |
| `ci:column-reachability`, `ci:runtime-ddl`, `ci:json-operator-types`, `db:sync-manifest:check`, `ci:drizzle-tenant-scope`, `ci:undefined-css-classes` | 0 |
| `ci:unauthenticated-fetch`, `ci:session-scoped-rls-bypass`, `ci:sql-interpolation`, `scripts/ops/ledger-check.mjs`, `check:catalog-copy` | 0 |
| `ci:fixture-fallback`, `ci:no-mock-in-prod-routes`, `ci:fabricated-identity`, `ci:program-ownership-single-source` (+ selftest), `ci:project-creation-owners` (+ selftest) | 0 |
| `ci:discarded-audit-write`, `ci:client-ip-single-source`, `ci:filing-exit-agreement` (+ selftest), `ci:sign-ceremony`, `ci:upload-guards`, `ci:trivyignore-hygiene` | 0 |
| `audit:repo-health:ceiling`, `ci:server-error-leaks`, `ci:untracked-imports`, `ci:pushed-lint-errors`, `ci:pushed-lint-warnings`, `ci:pushed-typecheck --dry-run` | 0 |
| `ci:internals-in-copy` | 1, with one finding in `SubmissionSeqWorkspaces.tsx:745`, a file this build does not change; the same finding and exit on a clean HEAD export (`confirm/internals-in-copy.head-export.txt`) |
| `clientCopyNoProgram.test.ts` | 1, pre-existing and identical on HEAD (`confirm/clientCopyNoProgram.txt`) |
| The future commit through `ci:one-design-plan`'s `evaluateCommit` (`Plan: F1`, both `Completes:` trailers) | 0 findings; the same files with no trailer, or a `Completes:` path that did not exist, are refused (`confirm/plan-check.txt`) |
| `npm run -s typecheck` | 0 (`confirm/typecheck.txt`) |

What the push-scoped gates could check:

- HEAD is an ancestor of `origin/concept2cure-v2`, and this build is uncommitted.
- So `ci:one-design-plan`, `ci:untracked-imports`, `ci:pushed-lint-errors` and `ci:pushed-typecheck` found no commit or
  changed file of this build to check (`confirm/gates.txt`).
- Their substance is covered by `confirm/plan-check.txt`, `confirm/eslint.txt` and `confirm/typecheck.txt`.
- `.husky/pre-push` runs them again when the commit is pushed.
- `ci:pushed-lint-warnings` did read the 24 changed tracked files against `609ef94c7`: no warning count changed.

## Sequences sent before this change

- **With a compile: labelled, not fixed.** A sequence sent before the guard kept the record has no bound transmittal, so
  it is still read from every non-rehearsal compile, previews included.
  - For such a sequence the phantom leaf remains (`confirm/probes.txt` §3).
  - A document its send carried, or the version it carried, may be missing, because transmit re-assembles and writes no
    compile.
  - The card names each such sequence and warns both ways (What a user sees).
- **With no compile either: refused on the filing path, listed by the view.**
  - Compile, freeze, dispatch, transmit and AnA's named prior refuse with the sentence above (`confirm/probes.txt` §4).
    This blocks the next filed sequence of such a submission.
  - The same holds for a sent sequence whose only compile is a rehearsal (`lifecycle-rehearsal.pglite.test.ts`,
    `confirm/slice-tests.txt`).
  - How such a sequence is put back on record is owed to the founder (below).

## Owed, not built here

- **Slice 2: test-environment sends.** A staging send also sets `dispatch_status` 'sent', so its bound transmittal is
  read as filed.
  - The fix belongs to `submission-service.ts` and `fda-esg-receipts.ts`, which this build does not touch
    (`confirm/change-set.txt`).
  - This build's design names it as slice 2 (`confirm/f1-filed-is-what-was-sent.design.md`, "Critique and
    resolution"). There it is called "decision P-86", which is wrong. Slice 2 is an F1 repair with no decision number,
    because P-numbers are the founder's alone. P-86 is the founder's later decision on retiring an unfiled sequence,
    recorded in `docs/LAUNCH_DEFINITION_OF_DONE.md` after this build ran. `confirm/what-already-exists.txt` shows the
    state at build time, when no P-86 was recorded.
- **A record guard on transmittal metadata keys (S5).**
  - Nothing in the database stops a later writer replacing `metadata.leafManifest` or `metadata.dispatchBinding`.
  - Every writer today merges, and no trigger guards the column (`confirm/what-already-exists.txt`).
  - It is owed together with the `ectd_compilations` record guard.
- **The named-prior path through a compile row.**
  - `loadPriorSequenceManifest` still finds the submission through a compile of the named sequence.
  - So a sequence sent with no compile is refused there. That fails closed, and its sentence no longer says "not on file"
    (`confirm/what-already-exists.txt`).
- **`leafKey` parity.**
  - The packager emits `leafKey` (`regional-packager.ts:1488`, `:1506`).
  - `SequenceLeafManifestEntry` has no such field, and `buildLeafManifest` copies none.
  - The guard's record uses the same function, so compile rows and transmit records stay alike
    (`confirm/what-already-exists.txt`).
- **The pre-deploy check of rows already on record.**
  - Before this change, the EMA gateways stored a caller's metadata verbatim. So a row written then can carry a binding
    and a manifest nobody sent (`confirm/what-already-exists.txt`).
  - The agency and signature checks close another agency's row. For an EU sequence, though, a row an EMA gateway wrote
    before this change passes the agency check, so for those rows the query below is the proof.
  - Before this commit deploys, run this read-only on each deployed database:
    `SELECT t.id, t.region, t.gateway, t.submitted_at FROM submission_transmittals t WHERE t.metadata ? 'dispatchBinding' AND jsonb_typeof(t.metadata -> 'leafManifest') = 'array' ORDER BY t.id`.
  - Expected result: no rows. Any row is a founder decision, not an edit in place.
  - This session reaches no deployed database. On the local test database, every row returned was written by this
    build's own fixtures, after the change (`confirm/pre-deploy-check.local.txt`, `review/pre-deploy-check.local-c2c_test.txt`).
- **The pre-deploy count of sequences this change refuses.** A sequence sent or acknowledged before this change, with
  no compile either, blocks the next filed sequence of its submission. That is deliberate: until now the next sequence
  was silently bound against an empty prior state. Before this commit deploys, run this read-only on each deployed
  database:

  ```sql
  SELECT s.organization_id, s.submission_id, s.id AS sequence_id, s.sequence_number, s.dispatch_status
    FROM ectd_sequences s
   WHERE s.deleted_at IS NULL
     AND s.dispatch_status IN ('sent', 'acknowledged')
     AND NOT EXISTS (SELECT 1 FROM submission_transmittals t
                      WHERE t.organization_id = s.organization_id
                        AND lower(t.metadata -> 'dispatchBinding' ->> 'attemptId') = lower(s.transmit_attempt_id::text)
                        AND jsonb_typeof(t.metadata -> 'leafManifest') = 'array')
     AND NOT EXISTS (SELECT 1 FROM ectd_compilations c
                      WHERE c.organization_id = s.organization_id AND c.submission_id = s.submission_id
                        AND c.sequence_number = s.sequence_number AND c.leaf_manifest IS NOT NULL
                        AND c.compilation_type IS DISTINCT FROM 'rehearsal')
   ORDER BY s.organization_id, s.submission_id, s.sequence_number;
  ```

  - Each row is a submission whose next sequence will be refused until the row is put back on record (next item).
  - Per launch row D7, no sequence has yet reached FDA's production environment. So rows are expected to be staging and
    demo sends only.
  - The query was checked as valid SQL on the local test database. There it returns other suites' fixtures, so its count
    means nothing there.
- **Putting an unrecorded sent sequence back on record.** The choice is between re-deriving it from its archived bytes,
  a re-filing, or a signed statement of what it carried. That is a founder decision. Two facts bear on it:
  - Sends since 3cab286e1 (2026-10-29) kept the exact bytes they sent (`metadata.sentPackage`). Those can be re-derived
    deterministically by reading the archived package's leaves.
  - Older sends kept no bytes, so only a re-filing or a signed statement can restore them.
- **The named "filed" rule.** `FILED_DISPATCH_STATUSES` (`server/services/submission-service/filed-dispatch.ts`) is not
  imported by the loader, which still writes `('sent', 'acknowledged')` (`confirm/what-already-exists.txt`).
- **The commitment row's words.**
  - `dispatchWords` (`CommitmentRow.tsx`, outside this build's files) still says "not on file at the agency" for a
    'transmitting' sequence.
  - The card has its own words for it. The commitment row's belong in `dispatchWords`.
- **Recorded, not owed: the rehearsal reads differently from the filed state.**
  - `loadRehearsalPriorManifestBySubmission` is unchanged (`confirm/what-already-exists.txt`). It reads the latest
    compile of each earlier sequence, sent or not.
  - So a sequence sent with no compile is absent from a rehearsal, and a sent sequence's latest compile can differ from
    what it sent.
  - The rehearsal's rule is the founder's decision of 2026-09-23 (`docs/reports/wo9-phase1-ectd-unblock-2026-09-03.md:1653`,
    quoted in `confirm/what-already-exists.txt`); this build does not change it.

Noted, out of scope (`confirm/what-already-exists.txt`):

- The fold reads no transmittal status. A send rolled back by an FDA ESG operator (`fda-esg.ts:1102`) leaves its
  sequence 'sent', and it counts as filed, as the compile read did before.
- `GET /api/mdx/gateways/transmittals/:id` returns `SELECT *`, so `metadata.leafManifest` and `dispatchBinding` appear in
  that organization-scoped response.

## Pre-existing failures

Each is identical on a clean export of HEAD `609ef94c7`. None of these test files is changed by this build; the row-lock
test's fixture is, and gained only the transmittals table (`confirm/change-set.txt`):

| Test | Failing | File |
|---|---|---|
| `server/services/ectd/__tests__/assess-dispatch-readiness.external.test.ts` | 5 cases | `confirm/wide-tests.txt` |
| `server/services/submission-service/__tests__/gateway-selection.test.ts` | 2 | `confirm/wide-tests.txt` |
| `tests/routes/ectd-compile-dtd-evidence.test.ts` | 2 | `confirm/wide-tests.txt` |
| `server/routes/ind-lifecycle/__tests__/dispatch-verdict-parity.pglite.test.ts` | 2 | `confirm/wide-tests.txt` |
| `server/services/submission-service/__tests__/submission-program-anchor.pglite.test.ts` | 1 | `confirm/wide-tests.txt` |
| `server/routes/__tests__/submissions-request-current-access.pglite.test.ts` | 1 | `confirm/wide-tests.txt` |
| `server/services/ana/__tests__/submission-center-tools.test.ts` (`generate_stf`) | 1 | `confirm/wide-tests.txt` |
| `server/services/ana/__tests__/tool-record-scope.test.ts` | 1 | `confirm/wide-tests.txt` |
| `client/src/concept2cure/v2/__tests__/reportingContextIntegrity.test.tsx` | 1 | `confirm/wide-tests.txt` |
| `server/services/submission-service/__tests__/freeze-gate-row-lock.pg.test.ts` ("the freeze did not wait") | 1, in 2 of 2 runs on each tree | `confirm/row-lock-tree-and-head.txt` |
| `client/src/concept2cure/v2/__tests__/clientCopyNoProgram.test.ts` ("screen actions": AnA's `biostatistics.load-design`) | 1 | `confirm/clientCopyNoProgram.txt` |
| `tests/db/commitment-fulfilment-evidence.dbtest.ts` ("a project with no program") | 1 | `confirm/dbtests.txt` |
| `tests/db/estar-audit-admission.dbtest.ts` (tracked-filing concurrency) | 1 | `confirm/dbtests.txt` |
| 8 dbtest files (the six Vault-fixture files, `project-vault-secondary-access`, `submission-required-deliverables`) | refuse this database by their own guard | `confirm/dbtests.txt` |
| `ci:internals-in-copy` | `coauthor_documents` at `SubmissionSeqWorkspaces.tsx:745` | `confirm/gates.txt`, `confirm/internals-in-copy.head-export.txt` |

The build's earlier wide runs list the same kind of comparison for the 891 client test files
(`2-view-copy/green.txt` §3) and for 180 files that reach the fold (`review/green.txt` §3).
