# W5 / D7 — the IND reference lane (BX-512), finished at head

**Dates:** 2026-10-21/22. **Branch:** `concept2cure-v2`. **Session:** `…session_014DhFkpvJw8G8WhJpJW8Cpy`.

**Row and evidence.** This moves **D7, one real sequence** (workstream W5). It is
JM's *"WO-09 Biotech IND eCTD Sequence Demo"*: BX-512, Vorelinib, KIT-mutant GIST,
IND 000512, Clicks 1–6. The previous click-through is
`docs/evidence/W5/2026-09-29-ind-ectd/` (lane record §20). This folder is the
re-walk at head, with the open decision closed. The proof report is
`docs/reports/wo9-demo-proof-2026-10-21.md`, and the lane record is §21 of
`docs/reports/wo9-phase1-ectd-unblock-2026-09-03.md`.

D7 stays **not green** (§ "Blocked — outside code").

## What already exists

This lane completes and fixes; it builds nothing beside an existing piece
(CLAUDE.md, Rule 3).

| Piece | Path | What it did | What it did not do |
|---|---|---|---|
| Lifecycle diff | `server/services/ectd/lifecycle-operator.ts` (`computeLifecycleOperations`) | Computes new / replace / append / delete against the prior state. Matches by `leafKey`, else section plus file name. Consumes each prior leaf once. | Matched a Vault version only on its own file name, which carries its own uuid, so version 2 never met version 1's filed leaf. |
| Packager input from the canonical core | `server/services/ectd/package-from-core.ts` (`packageSequenceFromCore`, `bindWithdrawalToFiledLeaf`, `recordDeclaredAct`) | Reads `submission_leaves`. Binds each declared delete to the one filed leaf carrying the row's source key. Reports whatever it cannot bind in `skipped`, which blocks transmit. | **Declared replace:** a later version was left out ("no filed leaf named … to supersede"). **Placed as new:** it shipped beside the filed version. **Withdrawal naming the current version:** found nothing when an earlier version was the one on file. |
| Leaf naming | `server/services/ectd/leaf-source-resolver.ts` (`leafSourceKey`, `leafFileName`, `leafFileCarriesKey`) | The staged file name carries the source key (`vault-documents-<uuid>`). | — (reused as is) |
| Vault version lineage | `vault.documents.supersedes_id`, guarded by `migrations/20260930_vault_documents_version_lineage.sql`. Check-in: `server/services/vault/vault-version-checkin.ts`. Family reader: `server/services/vault/vault-version-family.ts` (`readPredecessorIds`). | Records each version's predecessor. The database admits the link only within one document (same program, document code and organization, one live successor). `Vault.tsx` (716–744) offers the check-in when an upload's name is already taken: the 409 on `/api/vault/ingest` in Click 6c is that offer. | No eCTD code read it. A search of history finds `supersedes_id` in eCTD paths only as a test-fixture column (`assemble-from-core.vault-uuid.pglite.test.ts`). |
| Folded prior state | `server/services/ectd/prior-sequence-loader.ts` (`foldManifestRows`), `server/services/ectd/sequence-manifest.ts` (`manifestToPriorLeaves`) | Folds every recorded compile into what is on file. A delete takes its leaf off. | A replace filed under a new name left the superseded leaf on file, so the next sequence still held it. |
| IND checklist inventory | `server/services/ind-lifecycle/ind-checklist-view-assembler.ts` (`currentLeaves`) | The IND screen's "what is on file", per code. | Counted a later version and its predecessor as two current documents. |
| Compile screen | `client/src/concept2cure/v2/surfaces/EctdCompile.tsx` and `server/routes/ectd-compile.ts` | Already stated the region as "recorded on sequence N". Records `rehearsal ? 'rehearsal' : submissionType` as `compilation_type`. | The type was a free selector, defaulting to `initial` on every sequence. |
| IND screen | `client/src/concept2cure/v2/surfaces/IndLifecycle.tsx` | Subtitle and cover. | Said "eCTD v4.0 (FDA)". The packager builds v3.2.2 (`ich-ectd-3-2.dtd`, `us-regional-v3-3.dtd`), and `server/services/regulatory/market-support.ts:202` says so. |

**Searches run:** replace, supersede, version lineage, `supersedes_id`,
`readPredecessorIds`, check-in, `modified-file`, `leafKey`, "eCTD v4.0",
`submissionType`, "recorded on sequence", across `server/`, `client/src/`,
`shared/`, `migrations/` and `docs/`. Deleted history was searched with
`git log --all --diff-filter=D -- '*lineage*' '*supersed*' '*version-bind*' '*versionBind*' '*replace-bind*' '*revision*' '*Revise*'`
(nothing) and with `git log --all -S'version-lineage'` and `-S'supersedes_id'` on
eCTD paths (only the fixture column above). Nothing in the repository answers
§20's question. The only mentions are §20 itself and this lane's claim row.

## How it was clicked

- **Database:** `c2c_ind_ref` on Postgres 16 with pgvector 0.6.0, built from empty
  the way a first deploy builds one:
  1. `install-fresh`;
  2. `deploy-migrate`, with **418/418** migration files applied at `ebad98fb`;
  3. **one** `npm run db:seed`.

  It was snapshotted as `c2c_ind_ref_base`. When the lane merged the day's trunk
  (`892739bb7`), the snapshot was brought forward the way every later deploy is:
  `deploy-migrate` again, **421/421** files, exit 0, "safe to roll services".
  Every walk starts from the snapshot (`driver/reset-and-boot.sh`).
- **Server:** `npx tsx server/index.ts` with `NODE_ENV=development`,
  `RLS_ENFORCE=on`, `LAUNCH_SCOPE_ENFORCE=on`, `ALLOW_DEV_AUTH=1`,
  `AUDIT_TRAIL_ENABLED=true` and `CONCEPT2CURE_SIGNER_MODE=dev`. The env file is not
  committed because it carries session secrets.
- **Driver:** headless Chromium (playwright-core) running `driver/walk.mjs`,
  signed in as the demo admin. It drives only the product's own controls and
  reads back what the screens say.
- **Packages:** both ZIPs were opened by `driver/inspect_packages.py`, a stdlib
  reader that shares no code with the product. For each ZIP it:
  - re-verifies `util/index-md5.txt` against the zipped bytes;
  - lists every leaf;
  - resolves every `modified-file` against the earlier package's own backbone IDs.

**The 1571 is a stand-in.** It is the platform's own render plus one appended
comment line. That line keeps FDA's encryption intact and lets the attach
accept it as completed. It is not sponsor-completed and not signed.
`driver/complete-form.mjs` makes it. JM's recording uses his own completed form.

### What the product did

The final walk ran on the tree this lane pushes: trunk `892739bb7` plus this
change (`clicks-1-6-transcript.txt`; the screenshots are named by click).
"Video" is the time into the recording.

| Click | Video | What the product did |
|---|---|---|
| 1 | 0:00 | Opened BX-512 from Projects. The identity comes from the program record: Concept2Cure Therapeutics, Vorelinib · BX-512, KIT-mutant GIST 4L+, IND 000512. |
| 2a | 0:13 | Recorded the applicant identity. The sponsor record was saved, then bound to the program by saving its facts: D-U-N-S 000000512, the regulatory contact, the authorized representative. |
| 2b | 0:28 | Built and checked Form FDA 1571 ("required fields present") and rendered its PDF (2,922,079 bytes). |
| 2c | 1:01 | Filed the stand-in 1571 at m1.1 in 0000, with the attestation recorded. |
| 3 | 1:06 | Placed the approved authored 3.2.S.4 document in 0000, at the code the dialog proposed (server-confirmed leaf #54). |
| 3b | 1:20 | Uploaded analytical procedures v1.0 to the Vault, opened it, confirmed its filing (Module 3 · Quality), and placed it at 3.2.S.4.2 in 0000. The dialog says the leaf will not be transmitted until its version is approved (P-22; this one is not reviewed). |
| 4 | 1:40 | Compiled 0000 ("Type initial · recorded on sequence 0000"), recorded it, and exported `000512-0000-fda.zip` (2,937,397 bytes). Both converted leaves passed PDF/A, and the 1571 shipped as FDA issued. DTD validation reads "unverified" because the DTDs are not vendored. |
| 5 | 2:03 | Dispatch is blocked by four blockers: 7 error-severity validation findings, the unapproved Vault leaf (P-22), no Shadow Review, and no Part 11 release signature. Separation of duties is stated. |
| 6a | 2:16 | Started 0001 as an amendment (server-confirmed). |
| 6b | 2:27 | Withdrew 0000's 3.2.S.4 leaf in 0001 (server-confirmed leaf #56). |
| 6c | 2:41 | Uploaded the revised file under the same name. The Vault offered the check-in and recorded it as v2.0 of the same document. Opened it and placed it in 0001 as Replace. |
| 6d | 3:11 | Rehearsal compile of 0001 ("Type amendment · recorded on sequence 0001"): `replace` of 3.2.S.4.2 against version 1's filed leaf, and `delete` of 3.2.S.4. Exported `000512-0001-fda-rehearsal.zip` (11,441 bytes). |

**Read from the downloaded ZIPs** (`packages/package-inspection.txt`), not from
the request that built them:

- every line of `util/index-md5.txt` re-verifies against the zipped bytes: 5
  in 0000, 3 in 0001;
- 0001's `replace` and `delete` each name an ID present in 0000's own backbone;
- the replace carries its checksum, and the delete carries no `xlink:href` and
  no checksum;
- both `us-regional.xml` files carry `<application-number application-type="fdaat4">000512</application-number>`
  and the recorded applicant, D-U-N-S 000000512;
- the sub-type is `fdasst1` in 0000 and `fdasst4` in 0001.

## The replace, before and after (P-42)

Both walks used the same driver and the same clicks, each on its own tree's
snapshot. "Before" is `ebad98fb` without this change
(`before/clicks-1-6-transcript-at-head.txt`). "After" is the pushed tree.
Upstream's merge touched none of the binding's files (`package-from-core.ts`,
`lifecycle-operator.ts`, `leaf-source-resolver.ts`, `vault-version-family.ts`,
`ectd-compile.ts`), so the before shows what the code there does.

| | Before | After |
|---|---|---|
| The compile screen on 0001 | A "Submission" selector reading `initial` | "Type **amendment** · recorded on sequence 0001" |
| 3.2.S.4.2 in 0001 | **Left out:** "declared replace: no filed leaf named bx-512-vault-documents-a02e677f-….pdf in this section to supersede (filing it as new would leave the filed version current) — bind it to the filed file, or declare it new" | **`replace`**, `modified-file="../0000/index.xml#leaf-3-2-S-4-2-bx-512-vault-documents-6bef0a4d-…"`, shipping `…0febe444-….pdf` |
| 3.2.S.4 in 0001 | `delete` of 0000's leaf | `delete` of 0000's leaf (unchanged) |
| The 0001 package | 7 entries, 1,896 bytes; 2 checksums | 10 entries, 11,441 bytes; 3 checksums |
| Pointers the reader resolves | the delete | the replace and the delete |
| 0001's regional sub-type | `fdasst4` | `fdasst4` (D-2 never touched the package) |

`before/c6d-0001-rehearsal-compiled.png` and `c6d-0001-rehearsal-compiled.png`
show the two screens.

## Defects found by clicking, each fixed with its test failing first

### D-1. The IND screen said every package is eCTD v4.0

The IND screen's subtitle and its cover sheet both said "eCTD v4.0 (FDA)" for
BX-512. Every FDA package the platform builds is eCTD v3.2.2. The backbones
declare `ich-ectd-3-2.dtd` and `us-regional-v3-3.dtd` (`packages/0000-index.xml`),
and `market-support.ts:202` says so. Both now say "eCTD v3.2.2 (FDA)"
(`IndLifecycle.tsx`).

- Test: `client/src/concept2cure/v2/__tests__/indLifecycleEctdFormat.test.tsx`.
- Red: `before/ind-format-failing-first.txt`.

### D-2. The compile screen offered the type as a free choice, defaulting to `initial`

On sequence 0001, an amendment, the compile screen read "Submission: initial"
(`before/c6d-0001-rehearsal-compiled.png`; §20 had recorded it as an
observation).

**The package was never affected.** The regional backbone's sub-type comes from
the sequence record, and 0001 declares `fdasst4` (amendment) both before and
after (`before/packages/0001-m1_us_us-regional.xml`,
`packages/0001-m1_us_us-regional.xml`).

**The record was.** A compile against filed sequences records the selector's
value as the compilation's type, so a filed 0001 would have gone into the
history as `initial`. A rehearsal records `rehearsal` both before and after,
which is why the walk's history row reads "rehearsal — prior not filed" both
times. The walk therefore cannot show this half; the route test does.

**Fix.**

- The screen states the type recorded on the sequence, as it already did the
  region: "Type **amendment** · recorded on sequence 0001"
  (`c6d-0001-rehearsal-compiled.png`).
- The compile request carries no type when one is recorded.
- The route records the sequence's own type, and refuses a stated type that
  contradicts it (409 `SUBMISSION_TYPE_MISMATCH`).
- A sequence with no recorded type keeps the selector.

Tests:

- `tests/routes/ectd-compile-recorded-type.test.ts`;
- `client/src/concept2cure/v2/__tests__/ectdCompileRecordedType.test.tsx`;
- `tests/routes/ectd-compile-spine.test.ts`, which now expects `type` on the
  status sequence.

Red: `before/compile-type-failing-first.txt`.

### P-42. A later Vault version could not file as a `replace` of the version on file

This is §20's open decision, decided under the founder's delegation of
2026-10-18 and recorded in `docs/LAUNCH_DEFINITION_OF_DONE.md` (P-42). Five
places carried the gap, and each now binds through the recorded lineage
(`server/services/ectd/version-lineage-binding.ts`):

| Where | Before | Now |
|---|---|---|
| Declared `replace` / `append` of version 2 (`package-from-core.ts`) | Left out: "declared replace: no filed leaf named … to supersede" (`before/clicks-1-6-transcript-at-head.txt`, Click 6d) | `replace` (or `append`) whose `modified-file` names version 1's filed leaf |
| Version 2 placed as `new` | Shipped beside version 1; both current at the agency | The same `replace` |
| Withdrawal naming version 2 | Left out: "no filed leaf in … is this document — it was never filed …", when version 1 was the one on file | Withdraws version 1's filed leaf |
| Folded prior state (`prior-sequence-loader.ts`) | Kept version 1 on file after a replace under a new name | A `replace` or `delete` takes off file the leaf its `modified-file` names |
| IND checklist inventory (`ind-checklist-view-assembler.ts`) | "replace names no current document"; version 2 counted beside version 1 | Version 2 supersedes version 1; a withdrawal of version 2 removes version 1 |

These are never guessed, and each is named in `skipped`, which blocks transmit:

- two filed leaves carrying earlier versions;
- two versions of one document in one sequence;
- a version beside an act on its own filed predecessor;
- a link the database rules refuse.

A delete-and-new that the author declared is honoured in either placement
order.

Tests:

- `server/services/ectd/__tests__/vault-version-lifecycle-binding.pglite.test.ts`
  (11);
- `server/services/ind-lifecycle/__tests__/ind-checklist-version-lineage.pglite.integration.test.ts`
  (4);
- `server/services/ectd/__tests__/prior-sequence-fold.test.ts`.

`withdrawal-approval-binding.pglite.test.ts` gained the real VR-08 columns in its
fixture.

## Recorded, not changed

- **D-3. The ICH tree stops at `m3-2-s-drug-substance`.** Both leaves of 3.2.S
  attach to it directly (`packages/0000-index.xml`), with no `substance` or
  `manufacturer` attribute and no `m3-2-s-4-control-of-drug-substance` heading
  below it. This is CAT2-03. MR-10 Stage 5 closes it by generating the tree from
  the vendored DTD, and its acceptance names this nesting. It is blocked on the
  DTD, as Stage 5 is, and DTD validation will name it.
- **The dialogs' submit button moves by one pixel and never settles.** This was
  seen in Click 6c, the Vault placement dialog. Playwright's "element is not
  stable" check never passed, so the driver clicks with `force`, as a person can,
  and logs it in the transcript. Its scroll metrics were steady over 720 ms
  (706/706/519), so it is not a layout loop. Handed to the design-system owner.
- **An upload does not open the uploaded document.** On the merged trunk the
  Vault opens the first required-section row by default (here 1.1.1, Form FDA
  1571), so the confirm and place controls belong to that row until the person
  clicks the file. The upload's own notice and its "AUTO-FILED · CONFIRM" link
  say where it is. Before the merge the upload happened to be the row opened by
  default. The details pane names the document its controls act on. The driver
  now opens the upload explicitly, and refuses to act if the details pane names
  any other document. Recorded for the Vault lane.
- **The 409 on `/api/vault/ingest` in Click 6c is the design, not a fault.** An
  upload whose name is taken answers 409, and `Vault.tsx` offers the check-in
  (VR-08). It is the only failed request in the walk.
- **The rehearsal's history row reads "rehearsal — prior not filed" in the TYPE
  column.** That is `compilation_type = 'rehearsal'`, recorded on purpose so that
  a rehearsal never reads as a filing (§20).

## Failures met on the way that are not this lane's

The regression covered the eCTD, IND-lifecycle and submission-service suites,
the eCTD and submission routes, every golden journey, and the client suites of
the surfaces on the path. Run on the pushed tree it gives 3,014 tests passed and
26 failed in 7 files, plus 4 unhandled errors
(`not-ours/regression-on-pushed-tree.txt`). The same 7 files were run on the
base, `892739bb7`, with this change set aside: the same 26 tests fail with the
same messages, and the same 4 errors occur
(`not-ours/same-failures-on-base-892739bb7-without-this-change.txt`). None is in
a file this lane changes. Each is recorded here and handed to its own lane, not
fixed here (Rule 2: one workstream).

| Suite | Fails | What the failure says | For |
|---|---|---|---|
| `tests/golden-journeys/` `cer-eu-mdr`, `device-510k-estar`, `drug-nda-ectd` | 1 each | Project creation answers 500. The journey's PGlite `regulatory_programs` has no `eu_mdr_class` column (42703), which project creation writes since 2026-10-20 (`352ca5aa`, `29eae6e9`). The harness says to add the column "via the ALTER the real migration performs" (`20261012b_regulatory_programs_eu_device_classes.sql`). | The lane that added the device classes |
| `tests/golden-journeys/submission-export-package` | 1 | `PACKAGE_IDENTITY_MISSING` (`applicantSponsorId`, `applicantId`, `contact`). The journey's fixture records no applicant identity, which a package now requires. | MR-10 Stage 4 (applicant identity) |
| `server/services/ind-lifecycle/__tests__/icsr-delivery-outcome` | 16 | Every TLS case, the trusted-certificate control included, ends "self-signed certificate in certificate chain". Localhost is already exempt from this sandbox's proxy, and an explicit exemption changes nothing, so the proxy is not the cause. Not diagnosed further here. | The ICSR transport lane |
| `client/…/indLifecycleProgramScope` | 4, plus 4 unhandled errors | The test's mock of `@/services/portal/authService` has no `authService` export, which `IndFormsPanel` now reads, so the surface unmounts. | The applicant-identity lane |
| `client/…/submissionCenterOpensOnSequence` | 2 | The read the test expects, `GET /api/submissions/sequences/7/leaves`, is not made. | The Submission Center lane |

Two more failed on the earlier base, `ebad98fb`, and pass on this trunk: the
`submission-release-signature` journey, and `submission-gate-posture`'s two eSTAR
posture assertions. Another lane fixed them meanwhile.

## Red, then green

Each test below has been seen failing. Some failed on the code before the
change. The rest failed on this change's code, before it was merged onto
`892739bb7`, with the one guard each pins removed (a mutation). That merge
touched none of the guarded code. In `ind-checklist-view-assembler.ts` it
changed the forms half only. The mutations were reverted, and each file was
checked byte-identical afterwards. The suites were run again after the merge
(`green/lane-suites.txt`).

| Proves | Test | Red | Green |
|---|---|---|---|
| D-1 | `indLifecycleEctdFormat.test.tsx` | `before/ind-format-failing-first.txt` (1 of 1) | `green/lane-suites.txt` |
| D-2 | `ectd-compile-recorded-type.test.ts`, `ectdCompileRecordedType.test.tsx` | `before/compile-type-failing-first.txt` (4 of 7) | `green/lane-suites.txt` |
| P-42, the binding | `vault-version-lifecycle-binding.pglite.test.ts` | See the breakdown below | `green/lane-suites.txt` (11 of 11) |
| P-42, the fold | `prior-sequence-fold.test.ts` | `before/fold-failing-first.txt` (1 of 11) | `green/lane-suites.txt` |
| P-42, the checklist | `ind-checklist-version-lineage.pglite.integration.test.ts` | See the breakdown below | `green/lane-suites.txt` (4 of 4) |

**The binding's reds:**

- `before/replace-binding-failing-first.txt`: 5 of the first 6 failed on the
  code before the binding.
- `before/contested-versions-failing-first.txt`: two versions of one document
  had one picked by leaf order.
- `before/mutation-lineage-never-read.txt`: 8 of 11 fail.
- `before/mutation-unguarded-one-hop-link.txt`: 3 of 11 fail, among them the
  refused link.
- `before/mutation-delete-and-new-exclusion-removed.txt`: in the order where the
  version is placed first, "Cannot withdraw leaf …".
- `before/mutation-acts-itself-removed.txt`: 1 fails.

**The checklist's reds:**

- `before/checklist-lineage-failing-first.txt`: 3 failed on the code before,
  while the tests lived in the assembler's own suite.
- `before/mutation-checklist-lineage-never-read.txt`: 3 of 4 fail.
- `before/mutation-checklist-unguarded-one-hop-link.txt`: 1 of 4 fails.

`green/lane-suites.txt` is the nine suites this lane touches, run on the final
tree: **9 files, 116 tests, all passing.**

## Gates

All run on the pushed tree: trunk `892739bb7` plus this change.

| Gate | Result |
|---|---|
| `ci:typecheck:no-regression --incremental` | 0 errors (baseline 0) |
| ESLint warning ratchet (`--since 892739bb7 --gate`) | No changed file's warning count grew. The new files lint with 0 problems. |
| `audit:repo-health:ceiling` | Passes. 57 files over the byte threshold, as before; `ectd-compile.ts` is 99,796 bytes and `EctdCompile.tsx` 99,513. |
| The lane's nine suites | 9 files, 116 tests, all passing (`green/lane-suites.txt`) |
| Regression (eCTD, IND lifecycle, submission service, routes, golden journeys, the path's client suites) | 3,014 passed and 26 failed, in 7 files, plus 4 unhandled errors. Every failure and error occurs identically on `892739bb7` without this change ("Failures met on the way"). |
| `.husky/pre-push` | Runs on every push, and a push that fails a gate does not land. These commits are on `concept2cure-v2`, so every gate in it passed. |
| HawkScan (DAST) | **Not run.** This environment has no `HAWK_API_KEY`. |

## Blocked — outside code

- **FDA ESG test credentials and certificates.** The founder holds the accounts.
- **The ICH/FDA DTDs.** `util/dtd/` is empty, so DTD validation reads "unverified"
  on every package (the warnings in both transcripts). Egress to the agency
  hosts is refused here, and the vendoring runbook's counsel prerequisite is
  open (MR-10).
- **The eValidator run.** JM runs it on `packages/` and hands over the report.
- **JM's recording**, with his own completed and signed 1571.

## Not done

- **JM's recording.** It needs his own completed and signed 1571; this folder's
  recording uses a stand-in. JM also runs eValidator over `packages/`.
- **The rest of D7.** The DTDs vendored (B3), the external validator seam (B4),
  ESG (B16), and one test sequence accepted by FDA's test environment with the
  ack chain filed.
- **A revised authored document.** It cannot yet file as a `replace` (P-42,
  "Still open"). In this walk the authored 3.2.S.4 is withdrawn (6b), not
  revised.
- **The clinical-hold disagreement between the two dispatch gates.** It is JM's
  decision (`docs/work-orders/README.md`, "Found by the IND eCTD demo lane",
  item 1). BX-512 has no hold, so Click 5 does not exercise it.

## Files

| Path | What it is |
|---|---|
| `clicks-1-6-transcript.txt` | The final walk, written by the driver as it clicked, with each click's time into the recording. |
| `c1-…` to `c6d-…` `.png` | One screenshot per click of the final walk. |
| `packages/0000-*`, `packages/0001-*` | The backbones and checksum files extracted from both downloaded ZIPs. |
| `packages/000512-0001-fda-rehearsal.zip` | The 0001 rehearsal package as downloaded (11 KB). The 0000 ZIP (2.9 MB, nearly all of it the 1571) is described by its extracted files and its inspection, not committed. |
| `packages/package-inspection.txt` | The independent reader's account of both ZIPs. |
| `before/clicks-1-6-transcript-at-head.txt`, `before/c6c-…`, `before/c6d-…` | The same walk at `ebad98fb`. |
| `before/packages/` | 0001 as HEAD built it, with its inspection. |
| `before/*-failing-first.txt` | Each new test failing on the code before the change. |
| `before/mutation-*.txt` | Each guard removed from the final code, and the test that then fails. |
| `green/lane-suites.txt` | The nine suites this lane touches, on the final tree. |
| `not-ours/` | The regression's failures on the pushed tree, and the same failures on `892739bb7` without this change. |
| `what-already-exists-searches.txt` | The searches behind "What already exists". |
| `driver/` | The walk (`walk.mjs`, `lib.mjs`), the stand-in form (`complete-form.mjs`, `make-pdfs.mjs`), the reader (`inspect_packages.py`) and the reset script. |

**The recording itself is not committed**, since bulk artifacts stay out of the
repository. It was delivered to JM in the session as
`wo9-bx512-clicks-1-6-2026-10-22.webm`:

- 215.20 s, 1440×900, VP8;
- 18,133,194 bytes;
- SHA-256 `809ed5e88af4e71abe9e7adf2b41290d24906802515d38d5e8d018a4f2dea8a8`.
