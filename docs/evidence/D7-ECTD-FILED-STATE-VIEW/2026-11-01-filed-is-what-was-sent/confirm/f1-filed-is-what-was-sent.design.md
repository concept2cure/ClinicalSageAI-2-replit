<!-- Copy, filed by the verifier, of the binding design this build was made against (workflow scratchpad designs/f1-filed-is-what-was-sent.design.md, sha256 e265512a9ffa1770f08095cc74394cabfc2308dbb753ee346906d607272d5f30). Not edited. -->
# F1 repair — what the agency holds is what was sent

Package **F1** (repair of shipped behaviour). Rows **D7** (eCTD filing) and **D2** (governed documents reach the agency intact).
Written 2026-11-01 against trunk `609ef94c7`, from the RULE 3 re-plan mapper (workflow `wf_ddd066d8-7a9`, item
"phantom-leaf"). It replaces, for this defect only, the larger `designs/ectd-complete.design.md` D-1, which added
columns to `ectd_compilations`. That approach was built once and stopped. Its diff is kept at
`scratchpad/f1-slice1-attempt1/` for its test scenarios only. Do not apply it.

## The defect (reproduced at trunk d914c2618; the probes are in `scratchpad/ectd-probe/`)

(a) **Phantom leaf.** `readFiledManifestRows` (`server/services/ectd/prior-sequence-loader.ts:204`) folds EVERY
non-rehearsal `ectd_compilations` row of a sequence whose `dispatch_status` is sent or acknowledged. It includes the
compile previews made while the sequence was still a draft, so a leaf that only an earlier preview carried reads as on
file (`phantom-leaf.probe.mts` prints `["draft-only.pdf","general.pdf"]`).

(b) **Sent without a compile.** A sequence that was sent with no compile row is missing from the record. The view calls
it not filed, and the next sequence binds against an empty prior state (`sent-without-compile.probe.mts`).

Both feed the NEXT sequence's lifecycle acts, through `loadLatestPriorManifestBySubmission` →
`package-from-core.ts:449-466`, for compile, freeze, dispatch and transmit, and through AnA's
`compute_lifecycle_operations`. This is a filing defect, not only a view defect.

## What already exists (by path; complete it, never rebuild it)

- `server/services/ectd/prior-sequence-loader.ts`
  - `readFiledManifestRows` (:204-228) is the one query behind the filed state. Both `loadLatestPriorManifestBySubmission`
    (:153) and `loadFiledStateBySubmission` (:249) read it.
  - `foldManifestRows` keeps per-leaf history (cd5fd2281) and supersession by modified-file (P-42). Keep its contract
    and its tests.
  - `loadRehearsalPriorManifestBySubmission` (:381+) is rehearsal-only. Unchanged.
- `server/services/submission-gateways/index.ts`, the transmit guard (`getGateway`):
  - `assertDispatchBinding` proves the binding matches the organization, the verified signature and the bundle SHA.
  - `archiveSentPackage` keeps the exact bytes before the wire (3cab286e1).
  - The guard stamps `metadata.gatewayAccount` and `metadata.sentPackage` server-side, after the caller's metadata, so
    a caller cannot supply them.
- `server/services/submission-gateways/fda-esg.ts:361-385` `createTransmittalRow` inserts the `submission_transmittals`
  row ('pending', before any connection), with the guard's metadata plus `dispatchBinding`. The REST helpers
  (`rest-gateway-helpers.ts:85-112`) and CESP (`ema-cesp.ts:255-275`) insert the guard's metadata but no
  `dispatchBinding`.
  - Every later writer of that row's `metadata` MERGES into it:
    - `fda-esg.ts:670` uses `jsonb_set`;
    - `fda-esg-receipts.ts:79-86` spreads `current.metadata`;
    - `filed-sequence-rejection.ts:337` uses `||`;
    - `governed-transmit.ts:842` uses `||`.
  - Re-verify this; it is what makes the record survive.
- `ectd_sequences.transmit_attempt_id` (`migrations/20261014_ectd_transmit_attempt_binding.sql`;
  `shared/schema/submissions.ts:122`) binds the sequence to the attempt that settled it. It is claimed at
  `submission-service.ts` ~:2469, kept on success, and nulled only when a pre-wire refusal releases the claim. A resend
  after rejection takes a new attempt id. Both writers of 'sent' (the transmit path, and the receipt reconciliation
  `fda-esg-receipts.ts resolveReceiptSequence`) keep it.
- `server/services/ectd/sequence-manifest.ts:98` `buildLeafManifest(leaves)` is the stored-manifest shape every compile
  row uses (`server/routes/ectd-compile.ts:1190`). `GatewayTransmitRequest.bundle.leafManifest`
  (`submission-gateways/types.ts:105-135`) is the raw shape fed through it before persisting.
- `server/routes/ectd-compile.ts:1521-1560` GET `/:projectIdent/filed-state` returns `loadFiledStateBySubmission`.
- `client/src/concept2cure/v2/surfaces/EctdFiledState.tsx` ("On file at the agency", inside `EctdCompile.tsx`) renders
  it. Its copy:
  - `notFoldedReason` :58-60;
  - the summary :65-66;
  - the lead :132-133.
- Tests:
  - `server/services/ectd/__tests__/prior-sequence-fold.test.ts`, `prior-sequence-transmitted-only.test.ts`,
    `named-prior-sequence-is-the-filed-state.pglite.test.ts`, `filed-state-history.test.ts`;
  - `tests/db/ectd-filed-state-view.dbtest.ts` (real Postgres);
  - `server/services/submission-gateways/__tests__/sent-package-kept.test.ts`, `fda-esg-receipts.pglite.test.ts`;
  - `server/services/submission-service/__tests__/transmit-recorded-identity.test.ts`.
  - None covers more than one compile of a sent sequence, or a sent sequence with no compile.
- Not touched: the package path's own store, `package-sequence-lifecycle.ts:231 foldFiledState` with
  `metadata.filedSequences`. It is a second fold, VEEVA gap 6.3, and S5's.

## The rule to build

1. **The guard records what it sends.** Do this in `submission-gateways/index.ts`, right where `sentPackage` is stamped,
   server-side and after the caller's metadata:
   - `metadata.dispatchBinding = req.dispatchBinding` (only when present);
   - `metadata.leafManifest = buildLeafManifest(req.bundle.leafManifest)` (only when `req.dispatchBinding` is present).

   For a request without a binding, both keys are forced absent (`undefined`, which JSON drops). A caller-supplied
   `metadata.leafManifest` or `metadata.dispatchBinding` is never stored. This closes a forged record that the fold
   could otherwise read. A bound transmit whose bundle has no `leafManifest` (not an array) is refused before the wire,
   with a sentence ("…nothing records what it would carry, so it is not sent. Nothing was transmitted."), through the
   existing `markRefusedBeforeWire` path. First verify that `assembleSequence` always sets it, so this refusal cannot
   block every sequence transmit; prove that with a test of the real assembly or a citation. FDA ESG's
   `createTransmittalRow` already writes `dispatchBinding`; keep both consistent (same value).

2. **The fold reads what was sent.** Change `readFiledManifestRows`:
   - For each sequence of the submission with `deleted_at IS NULL`, `dispatch_status IN ('sent','acknowledged')`, and
     `sequence_number < $before` when `before` is given, read the `submission_transmittals` rows of the same
     organization where:
     - `metadata->'dispatchBinding'->>'attemptId' = s.transmit_attempt_id::text`;
     - `(metadata->'dispatchBinding'->>'sequenceId')` equals `s.id`;
     - `jsonb_typeof(metadata->'leafManifest') = 'array'`.
   - Exactly one match: that sequence contributes ONE row `{ sequence_number, leaf_manifest, basis: 'transmit' }`, and
     none of its compiles.
   - More than one match: throw, as an unreadable stored manifest throws today ("a partial current view is not the
     current view"). Fail closed, with a sentence naming the sequence.
   - No match (sent before this change, or `transmit_attempt_id` null): that sequence keeps today's read of its
     non-rehearsal compiles, each row `basis: 'compiles'`.
   - The order stays oldest sequence first, then `compiled_at`, then id for compile rows.
   - The query passes the repo's `ci:json-operator-types` and `ci:sql-interpolation` gates. Use parameters, never
     interpolation.
   - `foldManifestRows` is unchanged.

3. **The view's data says where each sequence's record came from.** In `loadFiledStateBySubmission`:
   - each sequence gains `basis: 'transmit' | 'compiles' | null`;
   - `filed` is true when the sequence contributed rows, so a sequence sent with no compile but with a transmit record
     is filed.
   
   `server/routes/ectd-compile.ts` passes it through (about one line, if the route maps fields).

4. **The view says it, in words.** `EctdFiledState.tsx`, copy only, with no class, markup structure or layout change.
   D7's layout waits for D0-2.
   - The lead no longer claims "read from the leaf manifests of the filed sequences". It says what the record is read
     from: what was sent, and, for sequences sent before the platform kept that, their compiles. Example: "N documents
     are on file, read from what each sequence sent." When any sequence is 'compiles': "Sequence 0000 is read from its
     compiles, recorded before the platform kept what each send carried."
   - `notFoldedReason` stops printing raw enum values; use plain words for each `dispatchStatus`. Search for an
     existing shared label map first (RULE 3).
   - A sent sequence with neither record says so plainly ("sent, but nothing on record says what it carried").
   - Calm, factual. No eyebrows, guidance boxes, chips or ids on screen.
   - The client test asserts the three states.

## Tests (failing first; red saved before the change)

- PGlite, `server/services/ectd/__tests__/filed-state-what-was-sent.pglite.test.ts`. Model it on
  `named-prior-sequence-is-the-filed-state.pglite.test.ts`:
  1. **Phantom leaf.** Preview compile A carries `draft-only.pdf` + `general.pdf`. The bound transmittal's manifest
     carries `general.pdf`. On file: `general.pdf` only. This is red today.
  2. **Sent without a compile.** No compile row, one bound transmittal. The sequence is filed and its leaves are on
     file, and the next sequence's prior state (`loadLatestPriorManifestBySubmission`) is not empty. Red today.
  3. **Rejected, then resent.** The sequence has two transmittals with different attempt ids, and its
     `transmit_attempt_id` = the second. Only the second's leaves are read.
  4. **Legacy.** A sent sequence whose bound transmittal has no `leafManifest`, or which has no transmittal, keeps the
     compile read, with `basis: 'compiles'`.
  5. **Two transmittals bind the same attempt and sequence.** The read throws with the sentence. Nothing partial is
     returned.
  6. **Another organization** has a transmittal with the same attempt id, which is never read (the explicit org
     filter).
  7. cd5fd2281's per-leaf history still holds across a transmit-basis sequence followed by a compiles-basis one, in
     either order.
- Real Postgres under RLS as app_service, `tests/db/ectd-filed-state-view.dbtest.ts`: extend it with cases 1 and 2.
- The guard, in `server/services/submission-gateways/__tests__/` (extend `sent-package-kept.test.ts` or a sibling):
  - A bound transmit stamps `leafManifest` (equal to `buildLeafManifest` of the bundle's) and `dispatchBinding` on what
    reaches the gateway's metadata.
  - A caller-supplied `metadata.leafManifest` or `metadata.dispatchBinding` is overwritten (bound) or removed
    (unbound).
  - A bound transmit with no `bundle.leafManifest` is refused before the wire, and nothing reaches the gateway.
  - FDA ESG's inserted row (pglite or the existing receipt tests) carries `metadata.leafManifest`.
- A receipt that settles the sequence (`fda-esg-receipts.pglite.test.ts`) keeps `metadata.leafManifest` on the row.
- Client: `EctdFiledState` test asserts the lead for all-transmit, the compiles note, and the sent-with-no-record
  reason.

## Mutations (each removed, its test shown failing on its own assertion, restored byte for byte)

1. The fold ignores the transmittal (reads compiles only). Phantom leaf and sent-without-compile go red.
2. The fold drops the `transmit_attempt_id` match (reads any transmittal of the sequence). Resend goes red.
3. The fold drops the organization filter. Cross-org goes red.
4. The fold takes the first of two matches instead of throwing. The ambiguity test goes red.
5. The guard keeps a caller-supplied `leafManifest`. The forge test goes red.
6. The guard does not refuse a bound transmit with no leaf manifest. Its test goes red.

## Critique and resolution (why this shape)

- **Columns on `ectd_compilations`, plus a 'transmitted' row** (the old D-1 and attempt 1): rejected.
  - It adds a migration (RULE 1 replay surface), a second record of the send beside the transmittal row that already
    exists (RULE 3, zero duplication), a new writer file and a caller hook through `submission-service.ts`.
  - The transmittal row is already written before the wire, already keyed by the attempt (FDA ESG), and already
    carries `sentPackage`.
- **"The latest compile of each sent sequence"** (read side only): rejected. Transmit re-assembles and sends no compile,
  so nothing proves the latest compile is what went out.
- **Re-derive the manifest from the archived bytes at read time**: rejected for the read path (cost, and a parser in the
  fold). The manifest stamped is the assembly's, the same one whose bytes were archived and whose SHA the binding
  checks.
- **Integrity of the stored metadata.** No DB guard stops a later writer replacing `metadata.leafManifest`. Every writer
  today merges. A record guard (trigger refusing a change of `leafManifest`/`dispatchBinding` once set) is owed to S5,
  together with the `ectd_compilations` record guard. Name it in the README as owed. Do not build it here.
- **Test-environment sends** also set `dispatch_status` to sent, so a staging send's transmittal would be read as
  filed. That is slice 2 (decision P-86, `submission-service.ts` and `fda-esg-receipts.ts`). This slice does not touch
  it. Name it in the README as owed, with the slice.
- **The named-prior path** `loadPriorSequenceManifest` still finds the submission through a compile row. A sequence sent
  with no compile is refused there, which fails closed. Owed, named.
- **`leafKey`.** `buildLeafManifest` does not copy `leafKey`, although the bundle type carries it for "recognise it
  through a file-name change". Check whether `SequenceLeafManifestEntry` has it. If the compile rows drop it too, keep
  parity (same function) and report it under openIssues. Do not widen this slice.

## Plan and coordination

- Commit trailers:
  - `Plan: F1`
  - `Completes: server/services/ectd/prior-sequence-loader.ts`
  - `Completes: server/services/submission-gateways/index.ts`
- Files allowed:
  - the guard (`submission-gateways/index.ts`), plus `types.ts` only if a comment or type must change;
  - `prior-sequence-loader.ts`;
  - `routes/ectd-compile.ts` (filed-state only);
  - `EctdFiledState.tsx` (copy);
  - tests;
  - evidence `docs/evidence/D7-ECTD-FILED-STATE-VIEW/2026-11-01-filed-is-what-was-sent/`.
- Forbidden:
  - a migration, `shared/schema*`, `scripts/db/migration-set.mjs` (released to the coordinator);
  - `submission-service.ts` (slice 2's);
  - any new non-test file;
  - `design-system/**`, `client/src/concept2cure/v2/styles/**`, `AnswerLead.tsx`, `icons.tsx`, `C2CForm.tsx`,
    `dataConnect.tsx` (locked by D0);
  - any layout or class change.
