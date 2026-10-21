# Complete existing study placement inputs

Starting source: `4282257ac`. Contract:
[STUDY_PLACEMENT_COMPLETION_2026-10-20.md](../../../design/STUDY_PLACEMENT_COMPLETION_2026-10-20.md).
W5/D7, MR-10 Stage 1 input portion. Implementation: `07fbf47d4`;
canonical merge: `56176ddf0`; final placement layout anchor: `13cb23411`.
Later test-only typing correction: `2df9d29b4`; canonical integration/build anchor:
`359cc9f5e`.
The existing Vault, Authoring and Builder placement forms now record explicit
study metadata through the governed writer. Source published directly to `concept2cure-v2` at `359cc9f5e` after all normal
push gates passed, including the full compiler (**0 errors / exit 0 / baseline
0**). Production client, server and audit-chain-verifier builds passed at the
same anchor; `qualification.json` records their artifact hashes. No PR or hook
bypass was used.

## What already exists

- `shared/schema/submissions.ts`, existing migration and
  `shared/types/database.d.ts`: study fields already exist.
- `server/routes/submissions.ts` and canonical `submission-service.ts`: governed
  metadata persistence, locking, audit, source pins and signature-sensitive edits
  already work. No writer/store/migration is added.
- `server/services/ectd/{core-to-packager,stf-generator,ectd4-validator,ectd-regional-rules}.ts`:
  existing projection, filename and STF coverage/rendering rules; pure rules are
  reached by the browser with server re-exports preserved.
- `server/services/ana/{AnaToolDefinitions,AnaToolExecutor}.ts`: direct packaging
  accepts metadata but does not persist the human placement path.
- Existing `SubmissionSeqWorkspaces.tsx` Builder editor has controlled study
  fields; AddLeafForm does not. Existing `VaultPlaceIntoSubmission.tsx` and
  `AuthoringPlaceIntoFiling.tsx` lack metadata inputs. Extend these forms.
- Existing `filingTarget.tsx` field kit, reason/target controls and pointer receipt
  guard are reused/extended; existing viewer, history and scoped reads remain.

The contract records searches including deleted history, existing behavior and
explicit file ownership. DTD conformance, agency acceptance and human witnessing
remain open; this slice completes placement inputs, not all of CAT2-04/MR-10.

## Implemented behavior

The same coverage and filename rules now run in the browser through a pure
shared extraction with compatible server exports. The existing Builder input
pair and field styles are reused in all three placement forms and in the
existing-leaf editor. Study id and exact human-reviewed STF file-tag are required
for STF sections in FDA/unknown-region sequences, before any Authoring copy or
leaf PUT. Existing exclusions and other regions' advisory behavior remain.
A sourced tag vocabulary is still pending Stage 6; the recall list is not used
as an authoritative select.

The existing receipt guard verifies the source, sequence, section, operation and
any metadata sent. Missing/mismatched metadata or bodyless 2xx receipts hold the
form rather than claiming success. Authoring snapshot uncertainty uses the same
existing mutation rule. Its hold survives close/reopen of the mounted dialog;
no durable recovery store was added. Builder provides an explicit sequence-leaf
reread, without replaying the write. Users must inspect existing filing status
and history after an uncertain result, including when leaving/reloading a page.

Manual values clear on source, canonical section and target changes, including
the existing picker's singleton auto-selection. Dialog wrappers reuse the
canonical session guard to stop old read/copy/PUT chains and discard late
receipts after actor changes. No-op and leaf/sequence audit uncertainty are
reported separately.

## Verification and execution anchors

- At merged source `56176ddf0`, **297 tests / 21 UI files** and **100 tests / 7
  backend/shared files** passed after a clean install from the merged lockfile.
- Final source `13cb23411` only groups the Builder study pair on its own wrapping
  form row. **42 tests / 2 Builder files** passed after that layout adjustment.
- At integrated source `359cc9f5e`, after the test-only typing correction,
  **75 tests / 3 placement/editor files** passed.
- Fresh Chromium at `13cb23411`: **19 stages / 10 cases**, **33 unchanged source
  and dependency pins**, no page errors. Actual components used intercepted
  synthetic API/session responses. This is not a native end-to-end database
  execution or a witnessed human test.
- Scoped lint: **0 errors**, existing warnings **15 → 14**; no task baseline
  relaxation. The final Builder grouping adds no rule or suppression. The first full compiler
  found two unsupported `exact` options on new test `getByRole` calls; these
  were removed in `2df9d29b4`, preserving the zero-error baseline.
- Test cohorts overlap; counts must not be added as independent coverage.

`verification/` contains original failing-first logs (required metadata,
receipt/recovery, actor ownership and reopen hold), successful cohort logs/JSON,
and dependency-install output. The first broad run exposed a stale unscoped
source-read fixture and an incomplete no-op receipt fixture; both now match the
existing current route contract. The former was also fixed independently in
the merged canonical work, whose stronger scope assertion is preserved.

`execution-inputs-56176ddf0.json`, `execution-inputs.json` and
`integration-inputs.json` each bind 32 inputs
to their execution commit; all hashes were checked against those Git trees.
`browser/result/result.json` binds the final browser run to its 33 exact inputs.
Of the browser pins, 29 production/dependency inputs match source `13cb23411`;
the four harness files are added by this evidence commit and match their archived
execution hashes. Browser scripts and screenshots are retained in `browser/`. The owned fixture
server was stopped after qualification. The earlier browser run's JSON is kept
only in scratch; archived browser artifacts here describe the final run.

## Remaining qualification

[HUMAN_CHECK.md](HUMAN_CHECK.md) is ready for an authorized tester and is explicitly
unexecuted. DTD validation, sourced STF document-tag vocabulary, agency package
acceptance and FDA transport acknowledgment remain separate open MR-10 work.
This slice completes placement inputs; it does not close CAT2-04/MR-10 or
certify the product for regulated human use.

## Independent automated review

A separate agent reviewed source ownership, metadata resets, receipt matching,
unknown copy/placement outcomes and the final evidence. The actor-session,
singleton-reset and same-document reopen findings were fixed and rechecked.
Counts, anchors, all source hashes and all 19 screenshots agree. This review is
an automated engineering review, not a human QA witness or regulatory approval.
The secret scan used the unchanged repository configuration; no credential
exposure was found. Qualification logs are deliberately included despite the
repository-wide log-file ignore rule.
