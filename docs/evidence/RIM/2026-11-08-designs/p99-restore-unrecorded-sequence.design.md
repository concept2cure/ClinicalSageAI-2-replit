# P-99: an unrecorded sent sequence is put back on record

- **Designer:** `p99-restore-unrecorded-sequence`, read-only, 2026-11-02.
- **Tree read:** `origin/concept2cure-v2` at `a6d74b6d0`, fetched for this design. Every `path:line` below is on that
  tree unless it says otherwise. The working tree holds F1 slice 2's uncommitted edits (`submission-service.ts`,
  `fda-esg-receipts.ts`, `filed-dispatch.ts`, tests, the runbook). They are designed against and never cited as shipped.
  Nothing in the repository was edited, staged, stashed or checked out.
- **Inputs:** the P-99 record (`47da81fca`); F1 slice 1 (`090f62af1`) and its evidence README; the P-92 design
  (`designs/p92-settle-held-fda-send.design.md`, §3-§5); the P-86 design and its coordinator rulings of 2026-11-02 01:19;
  the slice 2 design (`designs/f1-test-send-is-not-a-filing.design.md`); MR-10 Stage 9's reader design
  (`docs/design/FILED_SEQUENCE_READER_2026-11-01.md`).
- **Scope.** The two ways a sent sequence is put back on record, where each is written, how the fold reads it, the one
  door on the Dispatch tab, and the one side door that restores a sequence silently today. Nothing else. §9 lists what
  was rejected.

---

## 0. The founder's decision, and what it requires

The record, `docs/LAUNCH_DEFINITION_OF_DONE.md:1919-1931` on origin, quoted whole:

> ### P-99 — An unrecorded sent sequence is re-derived from its bytes, or restored by a signed statement
>
> The founder, 2026-11-02, answering "RIM's slice 1 found that a sequence could be marked sent or acknowledged with no
> record of what was transmitted. The next sequence of such a submission is now refused, and the screen names the gap.
> How should a sequence like that be put back on record?": **"Re-derive, else signed statement."** Raised by RIM's F1
> slice 1 (`090f62af1`, its evidence README, "Owed, not built here").
>
> - **What is decided.** Where the exact sent bytes were kept (sends since `3cab286e1`, 2026-10-29), the transmit record
>   is re-derived from them deterministically, with its derivation recorded. For an older send, the record is restored by
>   a signed statement of what the sequence carried, with re-authentication and the agency's acknowledgement kept in
>   Vault and linked to the act. Neither path invents a leaf the bytes or the statement do not name.
> - **What is not decided.** A re-filing is not required. Nothing restores a sequence silently.
> - **Owner.** RIM, under F1, after slice 2.

The caller's summary agrees with it. The record's own words are slightly stronger in one place: "neither path **invents**
a leaf", where the summary says "names". This design holds to both.

| Clause | What it requires here |
|---|---|
| "Re-derive, else signed statement" | One order. Where the kept bytes can be read, re-derivation is the only path offered. The statement is offered only where no bytes were kept. A copy that was kept and cannot be read is not "no bytes" (Q4). |
| "a sequence … marked sent or acknowledged with no record of what was transmitted" | The class is defined by "no record of what was transmitted". That covers the fold's basis `'none'` (no transmit record, no compile) **and** basis `'compiles'` (no transmit record; its compiles are a record of what was compiled, as slice 1's own card says). §0.1 decides it. |
| "the transmit record is re-derived from them deterministically" | The record the fold reads for a send is the transmittal row's `metadata.leafManifest`. Re-derivation completes **that** row, from **those** bytes, through one pure function with a version. The same bytes always give the same record. |
| "with its derivation recorded" | On the row (`metadata.leafManifestDerivation`) and on the chained audit trail (`ECTD_SENT_RECORD_REDERIVED`): the source bytes' SHA-256 and storage version, the method and its version, the manifest's own SHA-256, who ran it, when, and their reason. |
| "a signed statement of what the sequence carried" | A Part 11 act, the sequence's own two-step chain, the same shape as P-92's acts (§3.2). The statement names each leaf, and the signer may only confirm or leave out a listed leaf, never add or edit one. |
| "with re-authentication" | The signature is collected by `POST /api/c2c/actions/sign` (`'sign'` is a high-risk command; `verifyReauth`). |
| "the agency's acknowledgement kept in Vault and linked to the act" | A live `vault.documents` row of this organization and this submission's project, named by id and `content_hash` in the signed payload, re-read `FOR SHARE` under the lock, and repeated in the chained row and on the transmittal: P-92's E6, through one shared check (§3.2.4). |
| "Neither path invents a leaf the bytes or the statement do not name" | Re-derivation records only leaves read from the bytes. The statement records exactly the leaves it names. The fold reads each record **exclusively**: no compile is mixed into a re-derived or stated sequence (§3.3). |
| "A re-filing is not required" | Neither path sends anything. Every screen and statement says "Nothing is sent to the agency". |
| "Nothing restores a sequence silently" | Neither path runs by itself: no backfill, no migration, no job. A person starts each from the Dispatch tab after reading what it will record. **And one silent restore that exists today is closed** (C1): compiling a sent sequence after its send lifts slice 1's refusal with nobody saying so (§1.6). |
| "after slice 2" | Every commit here needs slice 2 pushed. P-99 refuses a test-environment send in both paths (§3.1 R5, §3.2 T5), which only means something once slice 2 makes a test send not a filing. |

### 0.1 Can a sequence read from its compiles be restored, and to which basis?

Decided from the record's words, and flagged (Q2), because its question names one consequence ("the next sequence … is
now refused") that is true only of basis `'none'`:

- **Re-derivation: yes, to basis `'transmit'`.** A window send (bytes kept, no `leafManifest`) that also has a compile
  reads basis `'compiles'` today. The record says that where the bytes were kept "the transmit record is re-derived from
  them". Completing its transmittal from its own bytes makes it a transmit record, so the fold reads it as `'transmit'`
  and drops its compiles. That removes the phantom leaf slice 1 could only label.
- **Statement: yes, but to basis `'statement'`, never `'transmit'`.** A statement is a person's attestation over a
  platform record of what was compiled. It is not the send's record. The fold names it as a statement wherever it is
  shown.
- The founder is asked to confirm the statement for a `'compiles'` sequence (Q2). Such a sequence does not block the next
  one, so restoring it is a fidelity gain, not an unblock. Until the answer, the statement is offered for both, because
  the record's class ("no record of what was transmitted") includes both.

---

## 1. What already exists (RULE 3), by path

### 1.1 The filed-state fold and its basis

- **`server/services/ectd/prior-sequence-loader.ts`** (slice 1, `090f62af1`; the RIM hold is released, `3879fc7e0`):
  - `readFiledManifestRows` (`:303-369`) reads, for each sent or acknowledged sequence (`:316`), every transmittal of the
    organization whose `metadata.dispatchBinding` names its `transmit_attempt_id`, id and `transmit_signature_action_id`
    (`:327-331`), kept only when its region is the sequence's agency (`sameAgency`, `:352`, `:372-375`). Exactly one with
    a `leafManifest` array: basis `'transmit'` (`:363`). More than one: it throws (`:356-361`). Otherwise every
    non-rehearsal compile (`:333-340`, `:365`): basis `'compiles'`. Neither: one row, basis `'none'` (`:366`).
  - `loadLatestPriorManifestBySubmission` (`:169-231`) refuses any `'none'` sequence below its bound with
    `unrecordedRefusal` (`:227-243`): "Sequence 0000 was sent to the agency, but nothing on record says what it carried:
    no record of the send, and no compile. What is on file cannot be read, so nothing was bound against it." That
    refusal reaches compile, freeze, dispatch, transmit and AnA's named prior.
  - `loadFiledStateBySubmission` (`:400-432`) gives each sequence `basis: 'transmit' | 'compiles' | null`
    (`FiledRecordBasis`, `:250`).
  - `foldManifestRows` (`:454-483`) and `MODIFIED_FILE` (`:435`) bind a replace or delete by sequence, backbone and ID.
- **The card** `client/src/concept2cure/v2/surfaces/EctdFiledState.tsx`: `notFoldedReason` (`:86-91`), `compilesLine`
  (`:118-128`), which treats every basis that is not `'transmit'` as compiles (`:119`), `leadLine` (`:147-165`).
- **What the fold does not read:** `audit_logs`. The statement must not be read from there either (§9 A2): the nightly
  archive job moves audit rows older than the 24-month hot window out of `audit_logs` and deletes them
  (`server/services/audit/audit-archive.service.ts:1-36`).

### 1.2 Where a send is recorded, and when each key began

| Key or column | Writer | Since | Where |
|---|---|---|---|
| `submission_transmittals` row, `bundle_sha256` NOT NULL, `submitted_at` default `now()` | every gateway, `'pending'` before any connection | 2026-05-09 | `migrations/20260509_submission_gateways.sql:39`; `fda-esg.ts:360-381`; `rest-gateway-helpers.ts:85-114`; `ema-cesp.ts:255-275` |
| `ectd_sequences.transmit_signature_action_id` (S), `transmit_attempt_id` (A) | `claimTransmitSlot` | 2026-10-14 | `migrations/20261014_ectd_transmit_attempt_binding.sql` ("Nullable for legacy rows; never infer a binding"); `submission-service.ts:2439-2487` |
| `metadata.dispatchBinding` | **FDA ESG only**, `createTransmittalRow` (`fda-esg.ts:378`); since slice 1, the guard for every bound transmit (`index.ts:345`) | FDA: 2026-10-17 (`e1f3fd425`, P-92 §1.1); all gateways: 2026-11-02 | `transmitSequence` passes the binding as a top-level field (`submission-service.ts:2922`), not in `metadata` (`:2919-2920`). So before slice 1 the REST helpers and EMA CESP, which store `req.metadata` verbatim (`rest-gateway-helpers.ts:110`, `ema-cesp.ts:271`), wrote **no** binding for a sequence send. |
| `metadata.sentPackage` (the kept bytes) | the guard, after `archiveSentPackage` | 2026-10-29 (`3cab286e1`) | `index.ts:328`, `:344`; `sent-package-archive.ts:45-83` |
| `metadata.leafManifest` | the guard, `sentLeafManifest` → `buildLeafManifest(req.bundle.leafManifest)` | 2026-11-02 (`090f62af1`) | `index.ts:154-164`, `:346` |
| `ECTD_TRANSMITTED` chained row on `ectd_sequence:<id>`: `transmittalId`, `packageSha256`, `signatureActionId`, `environment`, `sentPackage` | `transmitSequence`, in the transaction that writes `'sent'` (`submission-service.ts:2952-2992`); the receipt reconciliation (`fda-esg-receipts.ts:116-123`) | before the shallow clone's horizon | in `audit_logs`, so archived after 24 months (§1.1) |

**So the windows are:**

| Send made | Kept bytes | Bound row the fold reads | Path |
|---|---|---|---|
| after slice 1 | yes | yes, with `leafManifest` | none needed (basis `'transmit'`) |
| 2026-10-29 to slice 1, FDA ESG | yes | yes, no `leafManifest` | **re-derive** |
| 2026-10-29 to slice 1, any other gateway | yes | **no** (no `dispatchBinding`) | **re-derive**, binding the row through its `ECTD_TRANSMITTED` (§3.0, Q3) |
| 2026-10-17 to 2026-10-29, FDA ESG | no | yes | statement |
| 2026-10-14 to 2026-10-17 FDA, or 2026-10-14 to 2026-10-29 other | no | no; S and A set | statement, row bound through `ECTD_TRANSMITTED` (§3.0) |
| before 2026-10-14 | no | no; S and A null | statement, row bound through `ECTD_TRANSMITTED` (§3.0) |
| a sequence marked sent with no transmittal row at all | no | no | **refused** (Q1) |

The dates are commit dates. A deployed database got each change when it was deployed, so nothing here reads a date: each
path reads the row's own keys.

### 1.3 The kept bytes, and how they are read back

- `archiveSentPackage` (`server/services/submission-gateways/sent-package-archive.ts:45-83`) stores the package through
  `readVerifiedBundle` in the `sent-packages` namespace and returns `SentPackageRecord { storageVersionId, provider,
  sha256, sizeBytes, filename }` (`:27-33`), which the guard stamps as `metadata.sentPackage`.
- **The existing reader of those bytes:** `readSentPackage` (`server/services/submission-gateways/sent-package-read.ts:42-91`).
  It reads the row by id and organization, requires its project (`requireCurrentProgramAccess`, `:58`), shape-checks the
  record (`sentPackageRecordOf`, `:29-38`), refuses a record whose SHA-256 is not the row's `bundle_sha256` (`:64-67`), a
  copy over `getMaxGovernedExportBytes()` (`:68-71`), a missing copy (`:84-86`) and a copy whose bytes do not hash to the
  record (`:87-89`). Every refusal says nothing was downloaded. Its only caller today is the download route
  (`server/routes/mdx-sent-package.ts:26-51`). **Re-derivation reads the bytes through this function and no other.**

### 1.4 The existing reader of a sequence's leaves from its bytes

The search for one found it. **No parser is proposed.**

- **`server/services/legacy-importer/filed-sequence-reader.ts`** (MR-10 Stage 9 slice 1, `90f1c7478`, reviewed
  `7e7fae33a`, `24694d13c`; its lane, `01Gx2fiw…`, holds no file, `COORDINATION.md:48`).
  `readFiledSequenceArchive(buffer)` (`:705-708`) bounds the archive (`assertZipWithinLimits`) and reads every sequence
  in it (`readFiledSequences`, `:657-678`) into `SequenceLeafManifestEntry` rows (`FiledSequenceLeaf`, `:121-129`):
  - index.xml against index-md5.txt (`:456-465`), the regional backbone against its pointer's checksum (`:509-537`);
  - each leaf's href resolved against its backbone and contained, its MD5 **verified against the file's bytes**
    (`leafFile`, `:374-399`), its ID and operation (`leafHead`, `:326-343`), its `modified-file` re-expressed from the
    sequence root (`leafAct`, `:356-371`);
  - 20 refusal codes; a refused leaf is never in `leaves`; `isComplete` (`:168-170`).
- **`server/services/legacy-importer/filed-sequence-pointers.ts`**: `bindPointers` (`:62-82`) binds a pointer into another
  sequence **of the archive**. A pointer into a sequence the archive does not hold is listed in `outsideArchive`
  (`:119-122`) "for the recorded filed state to bind", and a withdrawal then keeps `fileName: ''`, `md5: ''`
  (`filed-sequence-reader.ts:420-424`), because only the filed state knows the withdrawn leaf.
- **What it does not do, by its own design** (`FILED_SEQUENCE_READER_2026-11-01.md:119-146`, and the round-trip test's
  header, `__tests__/filed-sequence-reader-round-trip.test.ts:12-17`):
  - **A leaf's section is its heading.** A `3.2.S.4.2` leaf reads back as `3.2.S`; a Module 1 leaf the platform records
    as `m1.2` reads back as `1.2`.
  - `sourceMd5`, `originalPdfProof` and `leafKey` are not in a backbone.
  - **Binding `outsideArchive` against the recorded filed state was handed to RIM** (`:163-164`): "converge the three
    pointer parsers onto one exported rule, and have this reader use it for `outsideArchive` pointers."
- **Why the first limit matters here.** The guard's stamp records the section as the leaf row spells it
  (`regional-packager.ts:1500`, `p.leaf.ctdSection`; `submission_leaves.section_code` holds both `3.2.S.4.2` and
  `m1.1`, `regional-packager.ts:130-142`). The lifecycle diff matches a prior leaf by `leafKey`, else
  `ctdSection/fileName` (`lifecycle-operator.ts:135-138`, `:237-250`), and the stored manifest carries no `leafKey`
  (`buildLeafManifest`, `sequence-manifest.ts:98-116`). A heading-level section would therefore make the next sequence
  file an unchanged-path document as `new` with no `modified-file`, while the old one stays on file. **Read alone, the
  reader does not give the guard's record.**
- **What the bytes do carry of the precise section, by the packager's own rules** (the packager wrote every platform
  send):
  - the leaf's backbone ID is `baseLeafId({ ctdSection, fileName })` plus an optional `-N` collision suffix, built from
    the row's **raw** section (`ectd-packager/leaf-id.ts:39-41`, `:54-64`; called with the raw leaf at
    `regional-packager.ts:896`);
  - its folder is `ctdFolderSlug(normalizeCtdCode(ctdSection))`, at full depth: "`3.2.S.4.2` files at
    `m3/3-2-s-4-2/`, never at its heading" (`regional-packager.ts:143-149`, `:201-219`;
    `shared/regulatory/section-code.ts:95`, `:115`);
  - the file name in the href is the leaf's `fileName` (`regional-packager.ts:213`, `:219`).

  So the raw section is recoverable from the bytes, by the packager's exported functions (`baseLeafId`,
  `regional-packager.ts:107`), and checkable against a second encoding (the folder). §3.1.2 uses exactly that.

### 1.5 The signed-act machinery, and P-92's shape

All in `server/services/submission-service/submission-service.ts` unless named:

- **Sign:** `POST /api/c2c/actions/sign` (`server/routes/c2c/actions.ts`, `makeHandler('sign')`): reason, meaning,
  `checkSigningAuthority`, `verifyReauth`, the `ectd-sequence:<id>` resolver, `assertSignerIsNotAuthor`; the ledger pair
  and `persistGovernedSignSignature` (`server/services/part11/signature-persistence.ts`), whose binding is the sequence
  content digest (`server/services/part11/ectd-sequence-binding.ts:50-69`, over `submission_leaves`, `:12-25`).
- **Act:** Gate 1, `governedSignatureVerdict` (`:979+`), with `SequenceSignatureIntent` (`:927-930`), `INTENT_LABEL`
  (`:933-939`), `INTENT_MEANING_REFUSAL` (`:949-955`), the `payloadRefusal` hook (`:957`), `signatureSpentBy`
  (`:1124-1139`, a literal action list at `:1131-1132`), P-23's `voidingSignatureOnRefusal` (`:1247+`),
  `applySequenceChangeWithAudit` (`:1276-1323`, no `reason`, no `afterUpdate`, no tenant context),
  `independentSignerRefusal` (`:2007`), `recheckUnderSequenceLock` (`:2028`), `precheckGovernedStep` (`:1712-1744`),
  `SubmissionErrorCode` (`:123`) and `SUBMISSION_ERROR_STATUS` (`:162`).
- **Doors:** `server/routes/submissions.ts`: `governedPrecheckSchema` (`:2053`), `POST /sequences/:seqId/governed-precheck`
  (`:2072`), the P-34 and P-35 handlers (`:1486`, `:1517`), all `requireRole(AUTHOR)`.
- **`writeChainedAuditRow`** (`server/services/auditService.ts:269-330`) writes `audit_logs.reason` when given (`:300-327`).
- **The governed-write gate an unsigned agency-evidence act uses:** `ingestFdaAs2Receipt`'s `requireReceiptActor`
  (`fda-esg-receipts.ts:42-50`): `GOVERNED_WRITE_ROLES` (`server/middleware/orgMembership`) on current membership. It is
  not a Part 11 signature: "the cryptography is the proof" (P-92 §1.2).
- **P-92's pieces this design reuses by name** (`designs/p92-settle-held-fda-send.design.md` §3.1-§3.7): one intent with
  the decision in the payload (P-35's pattern); meaning `responsibility` only, through `INTENT_MEANING_REFUSAL`; the
  server-held statement compared exactly at the act; the evidence check E6 (live, this organization, this project,
  `content_hash` bound, re-read `FOR SHARE`, `created_at` not earlier than the send's `submitted_at`, not reused within
  the same sequence); `independentSignerRefusal`; `applySequenceChangeWithAudit`'s new `audit.reason` and
  `update.afterUpdate(client)`; `setTenantContextTx` first in `underLock`; **transmittal lock first, then the sequence**;
  the record on `submission_transmittals.metadata` merged with `||`; the precheck step and its answer object; the
  `EsignModal` branch with `meanings: ['responsibility']`, `renderMeaningDetails`, `signedRows`, and no `ectd-sequence:`
  key on screen; a source-scan AnA refusal test.
- **P-86's planned shared helpers** (`designs/p86-retire-unfiled-sequence.design.md` D4, D5, §9.1 finding 3, and its
  coordinator ruling 1): `applySequenceChangeWithAudit`'s optional `audit.reason` and an optional `occurredAt`;
  `signatureSpentBy`'s list gaining the act's action; no new service file. P-99 adds to the same three places;
  whichever of P-86, P-92 and P-99 lands first adds each optional field, and the others rebase (§6).

### 1.6 A silent restore that exists today

`POST /api/ectd-compile/:projectIdent/compile` compiles a **named** sequence (`spineForRequest`,
`server/routes/ectd-compile.ts:350-371`) or the program's spine, and records a non-rehearsal compile with a leaf
manifest (`:1309-1336`). It is the only writer of `ectd_compilations.leaf_manifest` in `server/` (`git grep "INSERT INTO
ectd_compilations"`: `:858`, which writes no manifest, and `:1314`). **Nothing refuses a sequence that is already sent:**
`git grep` of `dispatch_status`/`dispatchStatus` in `ectd-compile.ts`, `assemble-from-core.ts`, `package-from-core.ts` and
`cmc/submission-spine.ts` finds 0 lines. So a compile of a sent sequence with basis `'none'`, made after its send, makes
the fold read it as `'compiles'`, slice 1's refusal lifts, and the card calls that compile "recorded before the platform
kept what each send carried", which is false. No act says the sequence was put back on record. **That is the silent
restore P-99 forbids.** C1's first red test proves it before anything changes (C1 T1).

### 1.7 The client today

- **Dispatch tab:** `DispatchWorkspace` (`SubmissionSeqWorkspaces.tsx:2032+`) → `PackageAndTransmit` (`:2015`) →
  `TransmitPanel` (`:1946-2013`), which reads `governed-precheck { step: 'transmit' }` and, for a filed sequence, says
  "Transmit is not available: …" from `resendRefusal` (`submission-service.ts:2321`). `DossierTransmissions` (`:1874`)
  lists the region's transmittals.
- `SubmissionCenter.tsx`: `GovernedFlow`, `GOVERNED_LABEL`/`GOVERNED_PAST`, `precheckRefusal`, `requestGoverned`,
  `runGoverned` (sign, then `ownAct`), and the one `EsignModal` mount (P-92 §1.6 has the lines).
- `VaultVersionPicker` (`VaultLibraryResults.tsx`) returns `{ id, title, version, contentHash, programId }`.
- **Layout:** D7-A1 and D7-A2 have not landed. P-92 proposes its door on today's layout, inside `TransmitPanel`, and asks
  the coordinator to rule it (P-92 §4).

### 1.8 Searches run

- **Code** (`git grep` on origin): `rederive`, `re-derive`, `rederived`, `sentRecord`, `sent-record`, `restoredBinding`,
  `leafManifestDerivation`, `recordStatement`, `stated manifest` → 0 files each. `readSentPackage` → 2 files (its module,
  its route). `readFiledSequences`/`readFiledSequenceArchive` → the reader, the detector, and an unrelated
  package-model function of the same name (`package-sequence-lifecycle.ts:187`, which reads `metadata`, not a zip).
- **History:** `git log --all -S'rederive'`, `-S'sentRecord'`, `-S'leafManifestDerivation'` → 0 commits.
  `git log --all --diff-filter=D` on `*rederiv*`, `*sent-record*`, `*sent-manifest*`, `*filed-record*`,
  `*statement*` → 0 paths. **This clone is shallow** (15 roots, the oldest 2026-10-05; P-92 §1.7). The deletion
  searches must be re-run in a full-history clone before C2's evidence cites them (C2 "Needs"). P-92 made one at
  `scratchpad/decided2/p92-fullclone.git`.
- **Conclusion.** No restoration of a send's record has ever existed in the searched history. Every part P-99 needs
  exists: the kept bytes and their reader (§1.3), the leaf reader (§1.4), the packager's ID and folder rules (§1.4), the
  fold (§1.1), and the sequence's signed-act chain with P-92's shape (§1.5). The work completes them.

---

## 2. The rules this design is held to

- **RULE 0.** `concept2cure-v2` only.
- **RULE 1.** **No migration.** Both records are jsonb keys on an existing column, `submission_transmittals.metadata`.
  Nothing in `migrations/`, `db/`, `shared/schema*` or `scripts/db/migration-set.mjs`. Nothing is backfilled: a backfill
  would restore silently.
- **RULE 3.** §1 is the "What already exists" section. The evidence READMEs repeat it, with the full-clone deletion
  searches.
- **RULE 4.** No card, panel, screen or tab. One quiet `<details>` inside the existing `TransmitPanel`, words on the
  existing card and lists.
- **RULE 5/6.** Every commit: `Plan: F1`, `Completes:` existing paths. No new route file, service file, table, mount,
  parser, engine or AnA tool. The new handlers sit in the mounted `server/routes/submissions.ts`, as P-34, P-35, P-86 and
  P-92 put theirs. New files are tests only (the coordinator's 2026-11-02 01:19 ruling for P-86, applied here).
- **Part 11.** The statement is a signed act: declared meaning (§11.50), re-authentication (§11.200), the reason on the
  chained row (§11.10(e)), the agency document bound by hash (§11.70 through the chain). Re-derivation is a governed,
  audited act with a reason, and no signature (§3.1.1 says why).
- **Fail closed; never fabricate.** A read that fails is never a pass or an empty record. A leaf the bytes or the
  statement do not name is never recorded. A binding is never guessed (§3.0).

---

## 3. The design

### 3.0 Which transmittal holds the restored record (one rule, both paths)

The record goes on **the send's own transmittal row**. The fold already reads that table, and it is where the guard has
stamped the record since slice 1 (§9 A1-A4 give the alternatives). The row is found by `sendTransmittal(q, org, seq)`,
in `prior-sequence-loader.ts` beside the fold:

1. **The bound row.** Exactly the fold's own read: org, `dispatchBinding` naming A, the sequence id and S, the sequence's
   agency (`sameAgency`). Two such rows refuse, as the fold does.
2. **Else the row the send's chained record names.** For a sequence whose gateway wrote no binding (other gateways
   before slice 1; FDA before 2026-10-17; every legacy claim), the platform's own §11.10(e) record of the send,
   `ECTD_TRANSMITTED` on `ectd_sequence:<id>` (`submission-service.ts:2966-2991`), names the transmittal by id. The rule:
   - exactly one `ECTD_TRANSMITTED` row for this sequence whose `details.signatureActionId` equals S (or, when S is
     null, whose `details.status` is not a refusal), and no other non-refused one;
   - its `details.transmittalId` names a row of this organization and agency whose `bundle_sha256` equals
     `details.packageSha256`;
   - that row carries no `dispatchBinding` for another sequence or attempt.

   Then the act writes, beside its record, `metadata.restoredBinding = { sequenceId, attemptId: A | null,
   signatureActionId: S | null, source: 'ECTD_TRANSMITTED', sourceOccurredAt, transmittalId }`. The fold reads a row
   bound either way (§3.3). **The binding is durable on the row**, so the fold never reads `audit_logs`, which is
   archived after 24 months (§1.1).
3. **Else the act is refused**, by name (R2, T4).

Why rule 2 is not "inferring a binding", which `migrations/20261014_ectd_transmit_attempt_binding.sql` forbids: the
migration's note is about a late receipt and "an inferred historical signature association" for rows with null columns.
Rule 2 reads no number, project or date. It reads the transmittal id the platform itself wrote into the chained record of
that send, in the same transaction that marked the sequence sent. It refuses on zero or more than one. And it records
its source on the row. The coordinator is asked to confirm this reading (Q3).

### 3.1 Re-derivation (bytes kept): a governed act, unsigned

#### 3.1.1 Who runs it, and why it is not signed

- **Who:** a signed-in person with governed write membership of the organization (`GOVERNED_WRITE_ROLES`, the receipt
  path's gate, `fda-esg-receipts.ts:42-50`) who can read the submission's project (`readSentPackage` enforces it,
  `sent-package-read.ts:58`), through `requireRole(AUTHOR)` on the route. **Not AnA** (C2 T10). Not a job.
- **Not signed.** The record does not ask for a signature here, and the act attests nothing. The content is decided by
  bytes whose SHA-256 the platform recorded before they left. A signature would put a person's attestation over
  checksums and backbone IDs they cannot verify, which the P-92 design avoids for the same reason (FDA's verified MDN is
  recorded unsigned). The precedent: `ingestFdaAs2Receipt`, a governed unsigned act on cryptographic evidence.
- **Why it is not silent.**
  - A person starts it, after reading what it will record: every leaf, its count, and what the bytes cannot say.
  - The act binds what they read: the request carries the precheck's `manifestSha256`, and the act refuses if its own
    derivation differs ("What would be recorded changed since you read it. Nothing was recorded; open it again.").
  - The person gives a reason, which is written to `audit_logs.reason` and to the chained details.
  - The derivation is on the row and on the chain, and named on the card ("read back from the package it sent, on
    DATE") and on the Dispatch tab.

#### 3.1.2 The derivation: one pure function, versioned

`deriveSentLeafManifest(bytes, facts, prior)`, method `'sent-package-read'`, **version 1**, in
`server/services/submission-gateways/sent-package-read.ts` (beside `readSentPackage`, which reads the bytes):

1. **Read the leaves.** `readFiledSequenceArchive(bytes)` (`filed-sequence-reader.ts:705`). It must find **exactly one**
   sequence, numbered as this sequence, whose regional backbone names this sequence's agency (`canonicalRegionOf`), with
   no archive refusal and no sequence refusal. The only open items allowed are the sequence's own `outsideArchive`
   entries, which step 3 binds. Anything else refuses, with the reader's own refusal messages listed
   (`SENT_RECORD_NOT_DERIVABLE`).
2. **Recover each leaf's raw section from its backbone ID** (§1.4). For a non-delete leaf with ID `I` and file name `F`
   (the href's base name, which is the packager's `fileName`, `regional-packager.ts:213`, `:219`):
   - strip `leaf-` and the suffix `-${leafIdSlug(F)}` (optionally followed by `-<n>`); turn the remaining `-` into `.`:
     that is the candidate `C`;
   - accept `C` only if **all three** hold: `baseLeafId({ ctdSection: C, fileName: F })` is `I` or `I` without its
     `-<n>`; `ctdFolderSlug(normalizeCtdCode(C))` is the href's section folder (the folder after `m1/<region>/` or
     `m<N>/`); and the heading section the reader read is `normalizeCtdCode(C)` or an ancestor of it;
   - the candidates are tried with the exact slug suffix and with a `-<n>` after it (a file named `report-2.pdf` has
     the slug `report-2`); **exactly one** candidate must pass all three checks;
   - otherwise refuse that leaf, by file name ("its section could not be read back from the package"). Two
     independent encodings must agree, or nothing is recorded.
   - Study Tagging Files are covered: the packager gives them IDs from the same assigner, with the study leaf's section
     and the STF's file name, and files them under the study's section folder (`regional-packager.ts:1304-1324`,
     `assignBackboneIds` `:883-899`).
3. **Bind what points outside the package against the filed state.** `bindToFiledState(sequence, priorLeaves)`, the
   item handed to RIM (§1.4), in `filed-sequence-pointers.ts`, with `MODIFIED_FILE` exported from
   `prior-sequence-loader.ts` as the one pointer rule (the "converge the three pointer parsers" hand-off; the packager's
   and the qualification harness's spellings move onto it in the same change, or are named as left, by path).
   `priorLeaves` is `loadLatestPriorManifestBySubmission(org, submission, currentSequence = this number).leaves` with
   their sequence numbers. Each `outsideArchive` pointer `../NNNN/<backbone>#<ID>` must name exactly one prior leaf on
   file (sequence, backbone and ID). A withdrawal then takes that leaf's section, file name and MD5, as `bindPointers`
   does within an archive (`filed-sequence-pointers.ts:98-101`). A reused file must name a prior leaf with that href
   and that MD5. Anything unbound refuses.
4. **Build the stored shape** with `buildLeafManifest` (`sequence-manifest.ts:98`), the function the guard runs
   (`index.ts:163`).
5. **Describe it:** `manifestSha256` (canonical JSON), `leafCount`, and `notRecoverable: ['sourceMd5',
   'originalPdfProof']`. Those two describe what the packager was handed before PDF/A conversion and the proof kept for a
   signed original; neither is in a package.

The function is pure over (bytes, the sequence's number and agency, the prior leaves). The same bytes and the same prior
state always give the same manifest and the same `manifestSha256`.

**What it equals.** On a send made after slice 1, the derivation from its kept bytes equals the guard's stamped
`metadata.leafManifest` on every field `buildLeafManifest` emits (`ctdSection` as the row spells it, `fileName`, `href`,
`md5`, `operation`, `modifiedFile`, `title`, `leafId`, `backbone`), and lacks only `sourceMd5` and `originalPdfProof`,
where the stamp had them. C2 T1 proves it. Where the host converted nothing to PDF/A, as in the test environment, the two
are deeply equal.

#### 3.1.3 Eligibility (precheck, act, and again under the lock)

`readSentRecordFacts(q, org, seq)` reads the facts. `sentRecordRefusal(facts, path)` judges them, as a pure function. A
read failure is `INVALID_STATE`: "Whether sequence NNNN's send can be put on record could not be checked, so nothing was
changed. Try again." Every refusal is `SENT_RECORD_NOT_RESTORABLE` (409) unless noted.

| # | Check | Refusal |
|---|---|---|
| R1 | Live; `dispatch_status` sent or acknowledged. | "Sequence NNNN is not on file at the agency, so there is no send to put on record. Nothing was changed." |
| R2 | §3.0 finds the send's transmittal. | "No transmission of sequence NNNN is on record that names it, so what it sent cannot be read here. Nothing was changed." |
| R3 | That row has no `leafManifest` and no `sentRecordStatement`. | "Sequence NNNN's send is already on record (DATE). Nothing was changed." |
| R4 | It names kept bytes: `sentPackageRecordOf(metadata.sentPackage)` non-null and its SHA-256 equal to `bundle_sha256`. | Not a refusal: the statement path applies (§3.2). |
| R5 | `metadata.environment === 'production'`. | "Sequence NNNN was sent to the agency's test environment, which is not a filing, so it is not put on record as filed. Nothing was changed." (Q5) |
| R6 | Every earlier sequence of the submission is on record: the lifecycle read below this number does not throw. | "Sequence MMMM, before it, is not on record either. Put sequence MMMM on record first. Nothing was changed." |
| R7 | `readSentPackage` returns the bytes, then §3.1.2 derives. | `readSentPackage`'s own sentence, ending "Nothing was recorded" instead of "Nothing was downloaded"; for a lost or corrupt copy, "The package the platform kept for this send cannot be read back. That is not a send it did not keep, so it is not stated by signature here. Nothing was changed." (Q4). Derivation refusals list the reader's or the binding's reasons by file name. |
| R8 | The actor holds a governed write role and project read access. | `FORBIDDEN` (403): "Recording what a sequence sent needs write access to this project." |

#### 3.1.4 Effects (one transaction)

`rederiveSentRecord(seqId, ctx, { reason, manifestSha256 })`:

1. **Outside the transaction:** R1-R8 on the pool, then the derivation (reading bytes and hashing is not done under a
   lock). The derived `manifestSha256` must equal the request's.
2. `applySequenceChangeWithAudit`:
   - `underLock`: `setTenantContextTx`; the transmittal `FOR UPDATE` (**transmittal first**, P-92's order); the sequence
     `FOR UPDATE`; R1-R6 re-read on the client. Then `priorLeaves` is re-read and step 3 of §3.1.2 is re-run (cheap, no
     bytes). If its result differs: "The filed record changed while this was read. Nothing was recorded; open it again."
   - UPDATE `ectd_sequences SET updated_at = NOW() WHERE id, org, deleted_at IS NULL, dispatch_status IN ('sent',
     'acknowledged')`, the CAS anchor.
   - `afterUpdate`: the transmittal CAS: `metadata = metadata || jsonb_build_object('leafManifest', $m,
     'leafManifestDerivation', $d [, 'restoredBinding', $b])` `WHERE id AND org AND NOT (metadata ? 'leafManifest') AND
     NOT (metadata ? 'sentRecordStatement') AND metadata->'sentPackage'->>'sha256' = $sha`. Zero rows throw
     `INVALID_STATE` ("the send's record changed while this was recorded").
   - The chained row `ECTD_SENT_RECORD_REDERIVED` on `ectd_sequence:<id>`, with `audit_logs.reason`. Details:
     `transmittalId`, `sourceSha256`, `storageVersionId`, `method`, `methodVersion`, `manifestSha256`, `leafCount`,
     `notRecoverable`, `restoredBinding` (when written), `environment`, `reason`.
3. `metadata.leafManifestDerivation = { method: 'sent-package-read', version: 1, sourceSha256, storageVersionId,
   manifestSha256, leafCount, notRecoverable, derivedAt, derivedBy, reason }`.

Nothing else on the row changes: `dispatchBinding`, `sentPackage`, `as2`, receipts and status stay as they are. **No
signature is spent or voided**: none is used.

### 3.2 The signed statement (no bytes kept)

#### 3.2.1 What the statement names, and where its list comes from

A statement must name the leaves, and a person cannot type backbone IDs or checksums they never saw. So the list comes
from **a record the platform already holds of what this sequence was compiled to carry: a non-rehearsal compile of this
submission and sequence number with a leaf manifest** (`ectd_compilations`, the rows the fold reads as `'compiles'`).

- The person chooses one compile. Each is shown with its date and whether it was made before or after the send's
  `submitted_at`.
- They confirm each of its leaves, or leave it out ("the send did not carry it"). **Nothing can be added and no field
  edited.**
- The stated manifest is `buildLeafManifest(entries of that compile, minus those left out)`, copied verbatim.
- Each stated pointer must bind against the filed state (`bindToFiledState`, the same rule as §3.1.2 step 3), so a
  statement never asserts an act on a leaf that is not on file.
- The statement's words say the list is a compile's, not the package's (§3.2.5).

**A sequence with no compile on record and no kept bytes has no list to name.** The statement path is then not offered,
and the precheck says why. That is the founder's question (Q1), because the obvious remedy, compiling the sequence now,
binds its lifecycle against today's filed state and not the one it was sent against (§9 A8).

#### 3.2.2 The ceremony: P-92's shape, the sequence's own two-step chain

1. **Sign.** `POST /api/c2c/actions/sign` on `ectd-sequence:<id>`, meaning `responsibility`, the signer's reason, and:
   ```
   { intent: 'sent-record-statement', meaning: 'responsibility',
     transmittalId, compilationId, leftOut: number[],          // indexes into that compile's manifest
     leavesSha256,                                             // of the stated manifest, canonical JSON
     evidence: { vaultDocumentId, sha256, kind: 'agency-acknowledgement' },
     statement }
   ```
   Every field comes from the precheck answer, never from client code.
2. **Act.** `POST /api/submissions/sequences/:seqId/sent-record/state { signatureActionId }`, through Gate 1 with intent
   `sent-record-statement` and a `payloadRefusal` (§3.2.6), inside `voidingSignatureOnRefusal` (P-23).

- **One intent, its decision in the payload**, as P-35 and P-92 do.
- **Meaning `responsibility` only:** `INTENT_MEANING_REFUSAL['sent-record-statement']`: "stating what a sequence carried
  is signed with the meaning responsibility". The signer answers for a record of what the agency holds. They approve no
  content and release nothing.
- **Independence:** `independentSignerRefusal` (the sequence's creator does not sign it) and the sign route's
  `assertSignerIsNotAuthor`, as P-92's E8.
- **The document is linked in four places**, as in P-92: the signed payload, `ECTD_SENT_RECORD_STATED`'s details, the
  transmittal's `metadata.sentRecordStatement`, and the stated manifest's own row.

#### 3.2.3 Eligibility

| # | Check | Refusal |
|---|---|---|
| T1 | R1. | as R1 |
| T2 | Not on record by transmit or statement (R3). | as R3 |
| T3 | **No kept bytes** on the send's transmittal (R4 false). | "The platform kept the package sequence NNNN sent, so its record is read back from it, not stated. Nothing was signed." (The precheck offers re-derivation instead; Q4 for a copy that cannot be read.) |
| T4 | §3.0 finds the send's transmittal. | "No transmission of sequence NNNN is on record, so the send a statement would describe cannot be named. Nothing was signed." (Q1) |
| T5 | Not a test send: the row's `metadata.environment`, and the `ECTD_TRANSMITTED` row's `environment` when the row has none, is `'production'`. Where neither records one, the statement says so (§3.2.5). | as R5 |
| T6 | R6. | as R6 |
| T7 | The material: `compilationId` is a non-rehearsal compile of this organization, submission and number, with a manifest. Every leaf not left out binds (§3.2.1). At least one entry is stated. `leftOut` indexes exist. | "That compile does not list what sequence NNNN could have carried: LEAF names a document that is not on file. Nothing was signed." No compile at all: "Nothing on record lists what sequence NNNN carried: it was sent with no compile, before the platform kept the packages it sends. A statement names only documents a record lists, so it cannot be made here. Nothing was signed." |
| T8 | The evidence, through **`readAgencyDocument`** (§3.2.4): live, this organization, `program_id` equal to the submission's, 64-hex `content_hash` equal to the payload's, `created_at` not earlier than the transmittal's `submitted_at`, and not cited by the `sentRecordStatement` of a transmittal bound to another sequence of the same submission (by id or by `content_hash`). | P-92's E6 sentences, with "the agency's acknowledgement" for "FDA's document". |
| T9 | Meaning, independence, signing authority. | `FORBIDDEN`, or the sign route's 403 |

At the precheck, T9 is advice (`signerRefusal`), so the screen says it before anyone signs.

#### 3.2.4 One Vault-document check for P-92 and P-99

P-92's E6 and P-99's T8 are one rule: an agency document in this project's Vault, bound by hash, added after the send,
not reused for the same thing. It is written once, as `readAgencyDocument(q, org, documentId, { lock, programId,
notBefore })` beside `readVaultSource` in `server/services/regulatory/lifecycle-signature.ts` (`:73`). It returns the row
or a refusal reason. The reuse test stays each act's own, because they cite different keys. **Whichever of P-92 and P-99
lands first adds it; the other imports it.** Both are RIM's, in one session, so this is a sequencing note, not a
coordination risk.

#### 3.2.5 The statement (one source, server-held)

`sentRecordStatement(facts)` in `prior-sequence-loader.ts` is the only place the words exist. The precheck returns it,
the disclosure and dialog show it word for word, the payload binds it, and the chained row repeats it. `DATE` is the
transmittal's `submitted_at`, "3 November 2026 at 14:05 UTC"; `AGENCY` is the agency's name.

> "Sequence NNNN was sent to AGENCY on DATE. The agency's acknowledgement of it is the document chosen from this
> project's Vault. What it carried is the K entries listed (documents it filed, and documents it withdrew), and nothing
> else, as compiled by the platform on CDATE, BEFORE_OR_AFTER it was sent. [L entries in that compile are left out: the
> send did not carry them.] The
> platform did not keep the package it sent, so this record rests on that compile and this signature, not on the package
> itself. A document rendered or converted again when it was sent may differ, byte for byte, from the compiled one.
> Nothing is sent to the agency."

`BEFORE_OR_AFTER` is "before" or "after". When no record names the send's environment (T5): "… was sent to AGENCY's
production system on DATE …", which is then part of what is signed.

#### 3.2.6 Gate 1's `payloadRefusal` and the comparison under the lock

The `payloadRefusal` refuses unless `payload.transmittalId` is §3.0's row, `payload.compilationId` and `leftOut` are
well formed, `payload.evidence.kind` is `'agency-acknowledgement'`, and `payload.statement` is a non-empty string. After
Gate 1, and again under the lock, the act recomputes the stated manifest from (`compilationId`, `leftOut`) and the
statement from the locked facts, and compares `leavesSha256` and `statement` **exactly**. Evidence id and hash must equal
T8's live row. Each mismatch is `GOVERNED_REQUIRED`: "The signature does not state this record: what it names has
changed since it was signed. Sign the statement again from the Dispatch tab."

#### 3.2.7 Effects (one transaction)

`stateSentRecord = voidingSignatureOnRefusal(applySentRecordStatement)`:

- `underLock`: `setTenantContextTx`; the transmittal `FOR UPDATE`; `recheckUnderSequenceLock` (submission, sequence, program,
  and the leaf digest), whose recheck re-reads T1-T9 and the Vault row `FOR SHARE`, recomputes the manifest and the
  statement, and compares them.
- UPDATE `ectd_sequences SET updated_at = NOW()` on the filed CAS (as §3.1.4).
- `afterUpdate`: `metadata = metadata || jsonb_build_object('sentRecordStatement', $s [, 'restoredBinding', $b])` `WHERE
  id AND org AND NOT (metadata ? 'leafManifest') AND NOT (metadata ? 'sentRecordStatement') AND NOT (metadata ?
  'sentPackage')`. Zero rows: `INVALID_STATE`.
- `metadata.sentRecordStatement = { leafManifest, statedAt, statedBy, signatureActionId: T, compilationId,
  compiledAt, leftOut, evidence: { vaultDocumentId, sha256, kind, verified: false }, statementSha256 }`. **The stated
  manifest is under its own key, never `leafManifest`**, so no reader can take it for the guard's record.
- The chained row `ECTD_SENT_RECORD_STATED` on `ectd_sequence:<id>`, `audit_logs.reason` = the signature's own reason
  (`dispositionSignatureReason`, `shadow-finding-disposition.ts:302`; none refuses `GOVERNED_REQUIRED`). Details:
  `signatureActionId: T`, `signatureId`, `meaning`, `reason`, `statement`, the stated `leafManifest`, `leavesSha256`,
  `compilationId`, `leftOut`, `evidence`, `transmittalId`, `transmitAttemptId`, `transmitSignatureActionId`,
  `restoredBinding`, `boundDigest`.
- `signatureSpentBy`'s literal list (`:1131-1132`) gains `ECTD_SENT_RECORD_STATED`. Without it, a repeated POST after
  success is refused and P-23 then voids T, a signature that did perform its act (P-86 D5's trap).

### 3.3 How the fold reads both records (`readFiledManifestRows`)

The transmittal arm (`prior-sequence-loader.ts:323-331`) changes in three ways:

1. **The join** admits a row bound by `dispatchBinding` (today's three conditions), **or** by `restoredBinding` naming the
   sequence id, with `attemptId` and `signatureActionId` equal to the sequence's (both null on a legacy claim, compared
   with `IS NOT DISTINCT FROM`). `sameAgency` applies to both.
2. **It selects** `leafManifest` when it is an array (basis `'transmit'`); else `sentRecordStatement.leafManifest` when
   that is an array (basis `'statement'`); and `leafManifestDerivation.derivedAt` and `sentRecordStatement.statedAt` for
   the view.
3. **Counting is unchanged.** Every row that binds the sequence, either way, counts. More than one throws, naming them.
   Exactly one with a record wins **exclusively**: none of the sequence's compiles are read, so a stated sequence cannot
   pick up a leaf from another compile. A bound row with no record falls back to compiles, then `'none'`, as today.

`FiledRecordBasis` becomes `'transmit' | 'statement' | 'compiles'`. A re-derived record is basis `'transmit'`: it is
read from the bytes sent. `loadFiledStateBySubmission`'s `sequences[]` gains `restored: { how: 'read-back' |
'statement', on: string } | null`. The lifecycle read, compile, freeze, dispatch, transmit and AnA's named prior read
both records exactly as a transmit record. `unrecordedRefusal` gains one sentence naming the door: "Put it on record from
its Dispatch tab in Submission Center."

**Both keys are server-owned.** The guard stamps `leafManifestDerivation`, `sentRecordStatement` and `restoredBinding` as
`undefined` after the caller's metadata (`index.ts:341-347`), as it does `dispatchBinding` and `leafManifest`. Otherwise
`POST /api/mdx/gateways/:region/:gateway/transmit`, which takes any metadata, could write a statement nobody signed onto
a new row, and rule 2's `restoredBinding` would let it bind (C2 T9). `types.ts`'s comment lists the server-owned keys.

### 3.4 Where the code goes (existing files only)

| File | Change |
|---|---|
| `server/routes/ectd-compile.ts` (C1) | The compile route refuses a non-rehearsal compile of a sequence whose `dispatch_status` is `sent`, `acknowledged` or `transmitting`. `ECTD_SEQUENCE_ON_FILE` (409): "Sequence NNNN is on file at the agency, so a compile of it now is not recorded: it would not be what it sent. Its sent package is on Gateway transmittals when the platform kept it. Start the next sequence to compile again." For `transmitting`: "A send of sequence NNNN is unresolved, so a compile of it now is not recorded. Nothing was assembled." The default spine is the submission's latest sequence by number, whatever its status (`cmc/submission-spine.ts:129-175`), so a project whose latest sequence is filed meets this on its first Compile. |
| `server/services/submission-gateways/sent-package-read.ts` | `deriveSentLeafManifest` (§3.1.2) and its constants; `readSentPackage` unchanged. |
| `server/services/legacy-importer/filed-sequence-pointers.ts` | `bindToFiledState(sequence, priorLeaves)`, the hand-off item, on `MODIFIED_FILE`. |
| `server/services/ectd/prior-sequence-loader.ts` | `MODIFIED_FILE` exported; the fold's arm (§3.3); `FiledRecordBasis`; `restored`; `sendTransmittal` (§3.0); `sentRecordStatement` words; `unrecordedRefusal`'s door sentence. |
| `server/services/submission-gateways/index.ts`, `types.ts` | The three server-owned keys (§3.3). |
| `server/services/regulatory/lifecycle-signature.ts` | `readAgencyDocument` (§3.2.4), shared with P-92. |
| `server/services/submission-service/submission-service.ts` | `SENT_RECORD_STATEMENT_INTENT`, `ECTD_SENT_RECORD_STATED_ACTION`, `ECTD_SENT_RECORD_REDERIVED_ACTION`; the intent in `SequenceSignatureIntent`, `INTENT_LABEL` ("statement of what the sequence carried"), `INTENT_MEANING_REFUSAL`; `SENT_RECORD_NOT_RESTORABLE: 409`; `signatureSpentBy`'s list; `readSentRecordFacts`, `sentRecordRefusal` (pure); `rederiveSentRecord`; `stateSentRecord`; `precheckGovernedStep`'s step `'sent-record'`, whose answer covers both paths (§3.5); `sequenceTransmitReadiness` gains `sentRecord: { basis } \| null` for a filed sequence. `applySequenceChangeWithAudit`'s optional `audit.reason` and `update.afterUpdate`, shared with P-86 and P-92. |
| `server/routes/submissions.ts` | `governedPrecheckSchema` step enum + `'sent-record'`, with optional `compilationId`, `leftOut`, `evidenceDocumentId`; two handlers beside `:1486`/`:1517`: `POST /sequences/:seqId/sent-record/rederive { reason, manifestSha256 }` and `POST /sequences/:seqId/sent-record/state { signatureActionId }`, `limiter`, `requireRole(AUTHOR)`. |

The coordinator's ruling for P-86 (no new service file) is honoured: every rule sits in an existing file beside what it
completes.

### 3.5 The precheck answer, `governed-precheck { step: 'sent-record' }`

```
{ step: 'sent-record', cleared, refusal, sentRecord: {
    sequenceNumber, sentAt, agency, basis: 'none' | 'compiles',
    path: 'read-back' | 'statement' | null,
    readBack?: { leaves: Leaf[], leafCount, manifestSha256, notRecoverable, convertedPdfCount: null },
    statement?: { compiles: [{ compilationId, compiledAt, before: boolean, leaves: Leaf[] }],
                  signerRefusal: string | null,
                  // only with compilationId (+ leftOut) and evidenceDocumentId, when cleared:
                  text?: string, leavesSha256?: string, evidence?: { vaultDocumentId, sha256 } } } }
Leaf = { ctdSection, fileName, operation, title? }     // words on screen; no hrefs, ids or checksums
```

`cleared` means "a path is offered" when no choice is given, and "this choice would be accepted" when one is.

---

## 4. Where the person does it

**On today's layout, inside `TransmitPanel` on the Dispatch tab, as words and one quiet `<details>`, under `Plan: F1`,
before D7-A2: the same choice P-92 makes (P-92 §4), and it needs the same recorded coordinator ruling** (Q8). If the
coordinator declines for P-92, P-99 follows it: C4 goes under `Plan: L1` after D7-A2, and C2 and C3 wait with it, so no
act is on trunk without its door. C1 does not wait. It is a repair with no door.

Why the panel: it is where a filed sequence already says "Transmit is not available: …", and where P-92's held-send
disclosure sits, for the `'transmitting'` state. P-99's disclosure is for the sent and acknowledged states, so the two
never show together. It is shown only when `TransmitReadiness.sentRecord.basis` is `'none'` or `'compiles'`.

**AnA may not perform it.** `server/services/ana/__tests__/ana-cannot-restore-sent-record.test.ts` (new test) scans
`server/services/ana` and `server/mcp` for the two routes, `rederiveSentRecord`, `stateSentRecord` and the intent, as
`ana-cannot-disposition-shadow-finding.test.ts` does for P-35. A chat turn cannot collect a password, and a read-back is a
person's governed act.

---

## 5. The commits, in order

Each carries `Plan: F1`, cites P-99 and launch rows D7 and D2 in its body, and ends with the session's attribution lines.
**C1 lands first, alone.** **C2, C3 and C4 are pushed together**, so no act is on trunk without its door.

### 5.0 Files, holders, and the holds to ask for (send before each commit's first edit)

| File | Holder now (origin `a6d74b6d0`) | Commit | Action |
|---|---|---|---|
| `server/routes/ectd-compile.ts` | unheld; P-97's refusal (RIM, F1) is queued in it | C1 | Ask the coordinator; sequence with P-97 in RIM's one session. |
| `server/services/ectd/prior-sequence-loader.ts` | released by RIM (`3879fc7e0`) | C2, C3 | Same session. |
| `server/services/submission-gateways/sent-package-read.ts`, `index.ts`, `types.ts` | unheld; `index.ts` was slice 1's | C2 | Tell the coordinator. |
| `server/services/legacy-importer/filed-sequence-pointers.ts` | unheld; Stage 9's lane (`01Gx2fiw…`) "holds no file" and handed this item to RIM | C2 | Tell the coordinator and that lane. |
| `server/services/submission-service/submission-service.ts` | RIM (slice 2 now; repair A, P-86, P-92, P-93 queue in it) | C2, C3 | After slice 2 and whichever of those land first; rebase on a fresh fetch. |
| `server/routes/submissions.ts` | granted to P-86 C1; asked for P-92 C1 | C2, C3 | Ask the coordinator; sequence after P-86's and P-92's handlers. |
| `server/services/regulatory/lifecycle-signature.ts` | unheld | C3 | Shared with P-92 (§3.2.4); one session. |
| `client/…/SubmissionSeqWorkspaces.tsx`, `SubmissionCenter.tsx` | RIM, copy only (slice 2); D7-A2's Dispatch section; MDX M4 and P-86 C3 in `SubmissionCenter.tsx` | C4 | P-92's widening and ruling (P-92 §5.0, Q9), extended to P-99. |
| `client/…/EctdFiledState.tsx` | released by slice 1 | C4 | Same session. |
| new tests (listed per commit) | — | all | New test files only. |

### C1: a compile of a sequence already sent is not recorded as what it sent

- **Title:** "F1: a compile of a sequence already sent is not recorded as what it sent (P-99)"
- **Trailers:** `Plan: F1`; `Completes: server/routes/ectd-compile.ts`.
- **Files:** `server/routes/ectd-compile.ts`; tests; `docs/evidence/D7-ECTD-FILED-STATE-VIEW/2026-11-0x-no-silent-restore/README.md`.
- **Needs:** slice 2 pushed (the record's "after slice 2"); the hold.
- **Migration:** none.
- **Red tests (saved red before the change):**
  - `server/routes/__tests__/ectd-compile-sent-sequence.pglite.test.ts` (new):
    - **T1, the silent restore:** a sequence sent with no compile reads `'none'`, and the next sequence's lifecycle read
      refuses. A compile of it now answers 200, writes a non-rehearsal row, flips the basis to `'compiles'`, and lifts
      the refusal. Red today on the last three; green after: 409 `ECTD_SEQUENCE_ON_FILE`, no row, basis `'none'`,
      refusal stands.
    - **T2:** the same for `'acknowledged'`, and for `'transmitting'` with its own sentence.
    - **T3:** a compile of a sequence that is `pending` or `rejected`, and a rehearsal compile, are unchanged.
    - **T4:** a compile of the program's default spine whose latest sequence is sent answers the same 409 (the
      screen's default path, not only a named sequence).
  - `tests/db/ectd-filed-state-view.dbtest.ts`: one case, real PostgreSQL as `app_service`, `RLS_ENFORCE=on`: the route's
    refusal leaves `ectd_compilations` without the row and the fold at `'none'`.
- **Mutations:** drop the refusal → T1 and the dbtest go red; refuse `pending` too → T3 goes red; refuse rehearsals →
  T3 goes red.
- **What a person sees:** on Compile & export, the existing refusal toast (`EctdCompile.tsx:1114-1120`) reads "Compile
  refused (HTTP 409) — Sequence 0000 is on file at the agency, so a compile of it now is not recorded: it would not be
  what it sent. Its sent package is on Gateway transmittals when the platform kept it. Start the next sequence to
  compile again." No compile is added to the history. The toast's "(HTTP 409)" is that screen's existing pattern, not
  C1's; the client is not changed. `ectdCompile.test.tsx` gains one case that the toast carries the server's sentence.
- **Pre-deploy, read-only, on each deployed database** (in the evidence README): sent or acknowledged sequences whose only
  compiles were made after their `ECTD_TRANSMITTED` row. Each such row was already restored silently before C1, and the
  founder is told (§7 item 2).

### C2: a sent sequence's record is read back from the package it sent

- **Title:** "F1: a sent sequence's record is read back from the package it sent (P-99)"
- **Trailers:** `Plan: F1`; `Completes: server/services/submission-gateways/sent-package-read.ts`;
  `Completes: server/services/legacy-importer/filed-sequence-pointers.ts`;
  `Completes: server/services/ectd/prior-sequence-loader.ts`;
  `Completes: server/services/submission-service/submission-service.ts`; `Completes: server/routes/submissions.ts`;
  `Completes: server/services/submission-gateways/index.ts`.
- **Files:** those, `types.ts` (comments), tests, `docs/runbooks/ectd-transmit-path.md` ("A sent sequence with no record
  of what it carried": the two paths in order, and the read-only queries below), and the evidence README
  `docs/evidence/D7-SENT-RECORD-RESTORED/2026-11-0x/README.md`, whose "What already exists" repeats §1 with the
  **full-history** deletion searches.
- **Needs:** C1; slice 2; the holds; the full-history clone for RULE 3.
- **Migration:** none.
- **Red tests:**
  - `server/services/submission-gateways/__tests__/sent-record-rederive.test.ts` (new), on
    `transmit-records-what-was-sent.test.ts`'s harness and `sent-package-storage-stub.ts`:
    - **T1, the equality the record needs.** Two sequences built by `packageEctdSubmission` and sent through the real
      guard (`getGateway('fda','esg').transmit`, FDA ESG's transport stubbed at the wire as that suite does). 0000:
      `m1.2` (the Module 1 spelling), `2.5`, `3.2.S`, `3.2.S.4.2`, `5.3.5` with a study tag. 0001: a replace and an
      append into 0000, a Module 1 replace into the regional backbone, and a withdrawal. Each package is read back from
      the stub's store and derived (0001 against the fold, where 0000 is read from its stamp). **Each derivation deep
      equals the guard's stamped `metadata.leafManifest`.** The test environment converts nothing to PDF/A, so neither
      side carries `sourceMd5`. It also asserts that `buildLeafManifest` was the last step on both sides.
    - **T2:** a fixture manifest with `sourceMd5` and `originalPdfProof` and the package for it: the derivation lacks
      both, equals it on every other field, and `notRecoverable` names both.
    - **T3, the section recovery:** the reader alone gives `3.2.S` and `1.2` for those leaves, and the derivation gives
      `3.2.S.4.2` and `m1.2`. A package whose leaf ID and folder disagree (one byte changed in the ID) refuses that leaf
      by name. So does a leaf ID with a collision suffix whose base is not `baseLeafId`.
    - **T4:** a pointer outside the package that names no leaf on file refuses; a withdrawal takes the withdrawn leaf's
      section, name and MD5 from the filed state; a reused file with the wrong MD5 refuses.
    - **T5:** the same bytes derived twice give the same `manifestSha256`.
  - `server/services/submission-service/__tests__/sent-record-rederive.pglite.test.ts` (new), on `_freeze-gate-fixture.ts`:
    - **T6:** a window FDA row (binding, `sentPackage`, no `leafManifest`): the act writes `leafManifest` and
      `leafManifestDerivation` on the row and one `ECTD_SENT_RECORD_REDERIVED` row with `audit_logs.reason`. The fold
      reads `'transmit'` and none of its compiles (a phantom-carrying compile is present and not read). The next
      sequence's lifecycle read binds against it. `dispatchBinding`, `sentPackage` and the status are unchanged.
    - **T7:** a window row of another gateway, unbound: §3.0 rule 2 binds it through `ECTD_TRANSMITTED`, writes
      `restoredBinding`, and the fold reads it. Two `ECTD_TRANSMITTED` rows for S refuse; one naming another row's id
      refuses; one whose `packageSha256` differs refuses.
    - **T8:** each of R1-R8 refused with its sentence, the row unchanged: not filed; no transmittal; already on record;
      staging; an earlier sequence unrecorded ("put sequence 0000 on record first"); a copy missing, corrupt, or over the
      size limit; a reader refusal; no write role.
    - **T9:** a row made through the governed HTTP transmit with caller metadata `{ sentRecordStatement, restoredBinding,
      leafManifestDerivation }` stores none of them, and the fold does not read it.
    - **T10:** `manifestSha256` differs from the request → refused, nothing written. Two concurrent acts: one writes,
      the other answers "already on record". The audit write fails → the row is unchanged.
    - **T11:** with `app.rls_enforce = 'on'` in the harness, the act finds its row and the bytes.
  - `server/routes/__tests__/submissions-sent-record.test.ts` (new): the precheck enum, both bodies' schemas,
    `SENT_RECORD_NOT_RESTORABLE` → 409, an uncoded error → 500.
  - `tests/db/ectd-filed-state-view.dbtest.ts`: real PostgreSQL as `app_service`, `RLS_ENFORCE=on`: a re-derived row is
    read `'transmit'`; a `restoredBinding` row of another organization is not read; a forged key is stripped.
  - `server/services/ana/__tests__/ana-cannot-restore-sent-record.test.ts` (new): the source scan (§4).
  - `filed-state-what-was-sent.pglite.test.ts` and `transmit-records-what-was-sent.test.ts` stay green, unchanged.
- **Mutations (each shown red on its own assertion, then restored byte for byte):**

  | Mutation | Goes red |
  |---|---|
  | Record the reader's heading section (skip step 2) | T1, T3 |
  | Accept the ID decode without the folder check | T3 (ID changed by one byte) |
  | Skip `bindToFiledState` | T1 (0001), T4 |
  | Skip `buildLeafManifest` | T1 |
  | Drop the `sentPackage.sha256 = bundle_sha256` check | T8 corrupt copy |
  | Allow a staging row | T8 staging |
  | Write without the CAS on `NOT (metadata ? 'leafManifest')` | T10 race |
  | Read compiles beside a re-derived record | T6 phantom |
  | Rule 2 accepts two `ECTD_TRANSMITTED` rows (take the first) | T7 |
  | The guard keeps a caller's `restoredBinding` | T9, dbtest |
  | Ignore the request's `manifestSha256` | T10 |
  | Drop `setTenantContextTx` | T11 |

- **Read-only queries, in the runbook and the README, for each deployed database before C2 deploys:** (a) slice 1's
  count of `'none'` sequences, split by which path §1.2 gives each row; (b) sent sequences with no transmittal row at all
  (Q1); (c) rows `metadata ? 'sentRecordStatement' OR metadata ? 'restoredBinding' OR metadata ? 'leafManifestDerivation'`:
  expected none, and any row is a founder decision, not an edit.

### C3: a sent sequence with no kept package is restored by a signed statement

- **Title:** "F1: a sent sequence with no kept package is restored by a signed statement of what it carried (P-99)"
- **Trailers:** `Plan: F1`; `Completes: server/services/submission-service/submission-service.ts`;
  `Completes: server/services/ectd/prior-sequence-loader.ts`; `Completes: server/routes/submissions.ts`;
  `Completes: server/services/regulatory/lifecycle-signature.ts`.
- **Files:** those, tests, the runbook section and the README (extended).
- **Needs:** C2. If P-92 has landed, `readAgencyDocument` exists and is imported; otherwise C3 adds it.
- **Migration:** none.
- **Red tests:**
  - `server/services/submission-service/__tests__/sent-record-statement.pglite.test.ts` (new):
    - **T1:** a legacy claim (S and A null), its transmittal named by one `ECTD_TRANSMITTED` row, two compiles (a preview
      with a draft-only leaf, and one after freeze). The signer chooses the second and leaves nothing out. The row
      carries `sentRecordStatement` and `restoredBinding`, and one `ECTD_SENT_RECORD_STATED` row carries the manifest,
      the reason and the evidence. The fold reads `'statement'`, **exactly the stated leaves, never the preview's leaf**.
      The next sequence binds against it. A repeated POST is refused and T is not voided.
    - **T2:** the same with the preview chosen and the draft-only leaf left out: the fold has every leaf but that one.
    - **T3:** a window-era bound FDA row without bytes (2026-10-17 to 2026-10-29): the statement goes on the bound row
      and no `restoredBinding` is written.
    - **T4:** each of T1-T9 refused with its sentence: not filed; already on record; **bytes kept (re-derive instead)**;
      no transmittal; staging; an earlier sequence unrecorded; **no compile at all** (the Q1 sentence); a compile whose
      pointer names a leaf not on file; a rehearsal compile; a deleted, other-organization, other-project, changed-hash,
      earlier-than-send or reused Vault document; the creator signs; meaning `approval`.
    - **T5:** payload tampering. Another transmittal, another compile, another `leftOut`, a statement changed by one
      character, another document: each refused, and T voided.
    - **T6:** a statement row's leaves and a stated sequence's compiles: the fold reads the statement alone (exclusivity);
      two rows binding one sequence throw.
    - **T7:** the audit write fails → nothing written. RLS on → the act finds its rows.
  - `tests/db/ectd-filed-state-view.dbtest.ts`: a stated sequence read `'statement'` as `app_service` under RLS; a
    statement on another organization's row not read.
  - `submissions-sent-record.test.ts` and `ana-cannot-restore-sent-record.test.ts` extended.
- **Mutations:**

  | Mutation | Goes red |
  |---|---|
  | The fold unions the statement with the sequence's compiles | T1 (preview's leaf), T6 |
  | Ignore `leftOut` | T2 |
  | Write the stated manifest as `leafManifest` | T1 basis, T3 |
  | Offer the statement when bytes were kept | T4 |
  | Compare the statement loosely (trimmed) | T5 |
  | Skip the pointer binding of a stated leaf | T4 |
  | Drop `ECTD_SENT_RECORD_STATED` from the spent list | T1 repeat |
  | Drop the Vault `created_at` check | T4 earlier document |
  | Accept `approval` | T4 meaning |

### C4: the door, on the Dispatch tab, and the words on the card

- **Title:** "F1: put a sent sequence's send on record from the Dispatch tab (P-99)"
- **Trailers:** `Plan: F1`; `Completes: client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx`;
  `Completes: client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx`;
  `Completes: client/src/concept2cure/v2/surfaces/EctdFiledState.tsx`.
- **Files:** those three and client tests. No new component file, stylesheet, class or D0-locked file.
- **Needs:** C2, C3; P-92's ruling (§4).
- **`SubmissionSeqWorkspaces.tsx`:** `GovernedKind` + `'sent-record-statement'`; `TransmitReadiness.sentRecord`; in
  `TransmitPanel`, under the "Transmit is not available" line, when `sentRecord.basis` is `'none'` or `'compiles'`: one
  line, then `<details className="pj-more" data-testid="sent-record">`, whose function `SentRecord` (same file) holds the
  states and asks `governed-precheck { step: 'sent-record' }` on each open, keeping nothing across a close. It reuses
  `VaultVersionPicker` and `btn ghost small`.
- **`SubmissionCenter.tsx`:** `GOVERNED_LABEL['sent-record-statement'] = 'Stating what a sequence carried'`,
  `GOVERNED_PAST = 'stated'`; `precheckRefusal` returns `sentRecord`; `runGoverned` re-asks the precheck and refuses when
  the statement or `leavesSha256` changed ("What you would state changed since this dialog opened. Nothing was signed;
  close it and open it again."); `ownAct['sent-record-statement']` posts `{ signatureActionId }` and accepts only
  `stated === true && sequenceId === f.seq.id`. The read-back posts directly (no signature dialog). The `EsignModal`
  branch: `action` "State what sequence 0000 carried"; `targetMeta` "`${regL(region)}` · restores the record of a send of
  DATE; nothing is sent to the agency", without the `ectd-sequence:` key; `meanings: ['responsibility']`;
  `renderMeaningDetails`: "By signing, you state:" and the statement; `signedRows`: the agency document (title, version),
  and "Documents stated: K (listed in the Dispatch tab)".
- **`EctdFiledState.tsx`:** `compilesLine` reads `'compiles'` only (today every non-`'transmit'` basis), and a
  `statementLine` names stated sequences; the lead's "read from what each sequence sent" holds only for `'transmit'`.
- **Words on screen, by state** (calm, factual; no ids, enum values, hrefs or checksums):

  | State | What the person sees |
  |---|---|
  | S0 closed, `'none'` | "Transmit is not available: …" (unchanged), then "Nothing on record says what sequence 0000 carried, so the next sequence of this submission cannot be built against it." and the closed disclosure "Put sequence 0000's send on record…" |
  | S0′ closed, `'compiles'` | "Sequence 0000 is read from its compiles, which may differ from what it sent." and the same disclosure. |
  | S1 reading | "Checking how sequence 0000's send can be put on record…" (`role="status"`) |
  | S2 read-back offered | "The platform kept the exact package sequence 0000 sent to FDA on 3 November 2026 at 14:05 UTC. Its record can be read back from that package: 12 documents, listed below. Nothing is sent to the agency." The list (section · file · act). "Two things a package does not hold are not recorded: a file's checksum before it was converted to PDF/A, and the proof kept for a signed original. If such a document is filed again unchanged, the next sequence replaces it." A reason field, "Why you are recording this", and the button "Record what sequence 0000 sent". |
  | S3 statement offered | "The platform did not keep the package sequence 0000 sent to FDA on DATE. Its record can be restored by a signed statement of what it carried, on the agency's acknowledgement kept in this project's Vault. Nothing is sent to the agency." Then "Which compile lists what it carried?" (one radio per compile: "Compiled 2 October 2026, before it was sent: 14 documents"); the chosen compile's documents, each with a "Carried" checkbox, checked; `VaultVersionPicker`, "Find the agency's acknowledgement in this project's Vault"; on a choice, "Checking this…", then "By signing, you would state:" and the server's statement, quoted; the button "Sign: state what sequence 0000 carried". |
  | S4 not offered | The server's sentence as `role="note"`, no button (R1-R8, T1-T8, including the Q1 sentence). |
  | S4′ an earlier sequence first | "Sequence MMMM, before it, is not on record either. Put sequence MMMM on record first." with no button. |
  | S5 the creator | "You created sequence 0000, so you cannot sign this. Another person with signing authority signs it." |
  | S6 read failed | "How this send can be put on record could not be checked. Close this and open it again to retry." Never "nothing to restore". |
  | S7 signing | The one signature dialog with the props above. |
  | S8 refused at the act | The server's sentence inline; for the statement, ending "The signature given for this statement is now void; sign again." |
  | S9 done, read back | Page notice: "Sequence 0000's record was read back from the package it sent, on 4 November 2026. The next sequence can now be built against it." The panel re-reads; the disclosure is gone. |
  | S9′ done, stated | "Sequence 0000's record is restored by a signed statement of what it carried, on the agency's acknowledgement kept in the Vault, signed by A. Signer (responsibility)." |
  | S10 the card | Read back: "Sequence 0000 is read from what it sent (read back from the package it sent, on 4 November 2026)." Stated: "Sequence 0000 is read from a signed statement of what it carried (4 November 2026), not from the package it sent." |

  Keyboard: the `<summary>` is focusable, Enter opens it, and a refusal shown at the click takes focus. No motion is added.
- **Red tests:**
  - `client/src/concept2cure/v2/__tests__/dispatchSentRecord.test.tsx` (new, on `dispatchWorkspaceFreezeGate.test.tsx`'s
    pattern): S0-S9′ render; the disclosure only for sent or acknowledged with basis `'none'`/`'compiles'`, never with
    P-92's; the statement is one string from the precheck through `renderMeaningDetails`, `signedRows` and the payload;
    a changed statement or `leavesSha256` at sign time signs nothing; unchecking a document changes `leftOut` and asks
    the precheck again; no `/\b[a-z-]+:\d+\b/`, signature id, checksum or href on screen; a 200 that is not the act is not
    a success.
  - `ectdFiledState.test.tsx`: the two S10 sentences; a `'statement'` sequence is never called "read from its compiles".
- **Mutations:** the client renders its own statement copy; offer `approval`; keep the `ectd-sequence:` key; treat any
  200 as done; show the disclosure for `'transmit'`; call a stated sequence "read from its compiles". Each red on its own
  assertion.
- **Done** only when opened and used in the running app (RULE 4), on a local database seeded with a window row (kept
  bytes in the local store) and a legacy row with two compiles, never against an agency: both paths run, then the panel,
  the card and the next sequence's compile read. The evidence carries screenshots of S0, S2, S3, S7, S9, S9′ and S10.

---

## 6. How P-99 composes with the work that lands first

| Work | Composition |
|---|---|
| **F1 slice 1** | P-99 completes its "Owed" item. The fold keeps its counting rule. Compiles stay the fallback for a sequence with no record. |
| **F1 slice 2** | Needed first (the record). A staging send is refused by both paths (R5, T5). Sequences a staging send marked `'sent'` before slice 2 stay `'sent'`; slice 2 leaves their correction to "a person decides". P-99 does not decide it (Q5). |
| **P-92** | Disjoint states: P-92 acts on `'transmitting'`, P-99 on sent or acknowledged. A P-92 "recorded as received" keeps A, so the fold reads A's row, and a pre-slice-1 one needs P-99 like any send. `readAgencyDocument`, `afterUpdate`, `audit.reason`, `signatureSpentBy`, `precheckGovernedStep`, `governedPrecheckSchema`, `GovernedKind`, `ownAct` and the `EsignModal` branches are shared: whichever lands first adds, and the second rebases. P-92's `heldSendSettlement` is not stripped by the guard. P-99's C2 adds its three keys to the stripped list, and the P-92 lane is told it can add its own key in the same place. |
| **P-86** | P-86 retires an unfiled sequence; P-99 acts only on filed ones. Shared: `audit.reason`, `occurredAt`, `signatureSpentBy`, `submissions.ts`. |
| **P-97** | Its compile refusal (filing-class and regional device projects) and C1's live in the same route. C1's refusal comes first for a filed sequence, and the filed-state view stays readable (P-97's own words). |
| **MR-10 Stage 9** | P-99 completes the reader's hand-off (`bindToFiledState`, the one pointer rule). It does **not** decide Stage 9's step 5 (where an imported sequence's record lives): an import has no transmittal row, so §3.0 does not apply to it (Q7). |
| **S5's owed record guard on transmittal metadata** | Owed by slice 1. P-99's two keys join `leafManifest` and `dispatchBinding` as keys the guard must protect (§7 item 3). |

---

## 7. Owed, and named (not fixed by P-99)

1. **A sent sequence with no kept package and no compile has no restoration** (T7's Q1 sentence). Expected to be the
   larger part of the blocked population. The founder's question (Q1).
2. **Sequences already restored silently by a post-send compile, before C1.** C1's pre-deploy query lists them. They read
   `'compiles'` from a compile made after the send. They are not re-opened: the founder is told the count.
3. **No record guard protects `metadata.leafManifest`, `sentRecordStatement` or `restoredBinding`** against a later
   writer. Every writer merges, and no trigger guards the column (slice 1's "Owed"). Owed to S5, with the
   `ectd_compilations` guard. The chained rows keep a tamper-evident copy for the 24-month hot window.
4. **`sourceMd5` is not recoverable from a package.** A document the packager converted to PDF/A, filed again unchanged,
   is proposed as a replace of itself by the next sequence. That is the visible direction, but it is a needless replace.
   The precheck cannot count converted leaves, because whether a leaf was converted is not in the package.
5. **The Vault side of the link.** `vault-where-used.ts` does not list a document a signed act cites, and nothing stops a
   later soft delete of it (P-92 §7 item 7, the same owed item).
6. **A statement cannot be corrected** once signed (Q6).
7. **Packages over `GOVERNED_EXPORT_MAX_BYTES`** cannot be read back (R7). Raising the limit is an operator setting
   (`sent-package-read.ts:68-71`). Reading in memory is bounded by `assertZipWithinLimits`. The precheck reads the whole
   package on each open of the disclosure, and the act reads it again. That is a one-off per sequence, and it is not
   cached.
8. **What a later sequence already sent stays as it was sent.** If 0000 had no record when 0001 was sent before slice 1,
   0001 was bound against an empty prior, so it filed its documents as `new` (slice 1's defect (b)). Putting 0000 on record
   now does not change what 0001 filed. The fold folds both, and the agency holds what each sent. A correction is a new
   sequence.

---

## 8. Questions back (only where the record does not settle it)

- **Q1 (founder).** A sequence sent with no compile, before the platform kept packages, has nothing on record that lists
  its documents. A statement then has no list to name, and a person cannot know the backbone IDs or checksums. How should
  it be put back on record? Options:
  - (a) **The sponsor's own copy of the package, accepted only if its SHA-256 equals the one the platform recorded for
    that send** (`submission_transmittals.bundle_sha256`, NOT NULL since 2026-05-09). It is then read back by C2's
    derivation, which is the strongest record. This needs a way to bring a `.zip` in, and Vault's admission of `.zip` is
    MR-08's open founder decision. Such a copy is rare: the sequence spine deleted the staged package after each send.
  - (b) A compile of the sequence made now, recorded as statement material only. Rejected as the default (§9 A8): its
    lifecycle is bound against today's filed state, not the state the send was bound against, and its backbone IDs are
    today's packager's.
  - (c) A re-filing, which the record does not require but does not forbid.

  Recommended: (a) where a copy exists, else (c). The count is in C2's query (b).
- **Q2 (founder).** Confirm that a sequence read from its compiles may be restored by a statement (§0.1). Re-derivation
  of such a sequence is clear from the words.
- **Q3 (coordinator).** Confirm §3.0 rule 2. It binds a transmittal the gateway did not bind, through the one
  `ECTD_TRANSMITTED` row that names it, and records `restoredBinding` with its source. Is that within
  `20261014_ectd_transmit_attempt_binding.sql`'s "never infer a binding"? This design reads that note as forbidding
  inference by number, project or time, which rule 2 never does.
- **Q4 (founder).** A package the platform kept that can no longer be read (missing from storage, or failing its hash). The
  record's "else" is for a send whose bytes were not kept. This design does not let a statement stand in for a lost copy,
  because that would be an integrity incident written over by a signature. Is that right?
- **Q5 (coordinator).** Sequences a staging send marked `'sent'` before slice 2. Both P-99 paths refuse them. Slice 2
  leaves their correction to "a person decides" and names no act. Which act corrects them, so they stop blocking a
  production send?
- **Q6 (founder).** May a signed statement later be superseded by a second statement, or by a package found later
  (Q1 (a))? This design refuses both.
- **Q7 (coordinator, with MR-10 Stage 9's lane).** Stage 9 step 5 (where an imported sequence's record lives) stays open.
  P-99's statement record keys on a transmittal row, which an import does not have, so the two do not converge here.
- **Q8 (coordinator).** The holds of §5.0, and the ruling P-92 asks for (its door on today's layout under F1 before
  D7-A2), extended to P-99's door in the same panel. If it is declined, C4 goes under L1 after D7-A2, and C2 and C3 wait
  with it.

---

## 9. Critique and resolution

### 9.1 The alternatives rejected

| # | Alternative | Resolution |
|---|---|---|
| A1 | **The statement on the act's chained audit row**, with the fold reading `audit_logs` | Rejected. `audit_logs` is append-only, which is good, but the nightly job archives rows older than 24 months and deletes them from the hot table (`audit-archive.service.ts:1-36`). After that, a stated sequence would fall back to `'none'` and block its submission again. The chained row keeps a copy; the record the fold reads lives on the transmittal. The same fact rules out reading `ECTD_TRANSMITTED` in the fold: rule 2 reads it once, at the act, and writes `restoredBinding` on the row. |
| A2 | **A new `submission_transmittals` row for the statement** | Rejected. It would claim a transmission the platform never made, and every reader of the table (Gateway transmittals, `DossierTransmissions`, the receipt path, analytics) would read it as a send. |
| A3 | **An `ectd_compilations` row of a new type for the statement** | Rejected. A compile is a record of what was compiled. The row would show in the compile history and feed `detectSequenceGaps`. And Stage 9 left "ectd_compilations with an imported origin" to a founder decision (`FILED_SEQUENCE_READER_2026-11-01.md:181`). |
| A4 | **A column on `ectd_sequences`** (`filed_record`) | Rejected (RULE 1, RULE 5): a migration that changes the ledger, where an existing column holds it. |
| A5 | **Write the stated manifest as `metadata.leafManifest`**, read `'transmit'` | Rejected. The record requires a basis that says it came from a statement. Under the guard's key, every reader would take a person's attestation for the send's own record. |
| A6 | **Re-derive with the reader alone** (heading-level sections) | Rejected. It does not give the guard's record (§1.4). The next sequence would file a document as `new` beside its own earlier version, which is the filing defect slice 1 exists to prevent. |
| A7 | **Recover the precise section from the sequence's `submission_leaves`** instead of the leaf ID | Rejected as the source. It is not the bytes, and the join from a package leaf to a placed leaf needs the source resolver's file names (`leaf-source-resolver.ts:579`, `:714`, `:750`), which is re-assembly. The leaf ID and folder are in the bytes. |
| A8 | **Re-assemble the frozen sequence now**, as the statement's material or as the re-derivation | Rejected. A re-assembly gives a different zip (`3cab286e1`). Its lifecycle is bound against **today's** filed state. If an earlier sequence was put on record after this one was sent (the slice 1 defect (b) case: 0001 sent against an empty prior), the rebuilt 0001 would claim replaces it never sent. A statement over it would assert acts the agency never received. It is Q1 (b), not the default. |
| A9 | **Sign the re-derivation** | Rejected (§3.1.1). The person attests nothing; the bytes decide. The act is not silent, because a person starts it after reading what it records, binds it by `manifestSha256`, and gives a reason on the chain. |
| A10 | **Backfill every window row by a migration or a job** | Rejected. "Nothing restores a sequence silently." It would also need data written through `C2C_MIGRATION_FILES` (RULE 1) to read storage, which no migration can do. |
| A11 | **Let the statement add a leaf no compile lists** | Rejected. "Neither path invents a leaf the bytes or the statement do not name": a leaf a person types has no checksum or ID the platform can vouch for, and the record's words are about not inventing. Q1 (a) is the honest way to add one. |
| A12 | **Refuse the compile route's silent restore in the fold** (ignore compiles made after `ECTD_TRANSMITTED`) | Rejected. It would read `audit_logs` (archived after 24 months), so the fold's answer would change two years later. C1 refuses at the one writer instead. |
| A13 | **Record a post-send compile as a `'rehearsal'`** instead of refusing it, so it stays available as statement material | Rejected. The history prints "rehearsal — prior not filed" for that type (`EctdCompile.tsx:657`), which would be false. And as statement material it has A8's defect. |
| A14 | **A new service file** (`sent-record.ts`) | Rejected: the coordinator's 01:19 ruling. Each rule sits beside what it completes (§3.4). |
| A15 | **Two precheck steps**, one per path | Rejected. The person does not choose the path; the record does ("re-derive, else statement"). One answer says which applies. |
| A16 | **The door on Gateway transmittals** | Rejected, as P-92's A6: that screen is the organization's read-only log, and this act is the sequence's. |
| A17 | **AnA proposes or performs either act** | Rejected: pinned out by the source scan (§4). |

### 9.2 The skeptic's pass, and what changed

The draft was attacked through two lenses. Each finding that held up was folded in; the row says where.

**Lens 1: Part 11 and filing integrity. Could it name a leaf the agency does not hold, or restore silently?**

| # | Attack | Held? | Resolution |
|---|---|---|---|
| K1 | The derivation's raw-section decode could produce a section the packager did not write, for instance if the packager's ID rule changed between the send and the read-back, or a section held a `-`. | Held | Two independent encodings must agree (ID and folder), plus the heading. Otherwise the leaf is refused, never guessed (§3.1.2 step 2; C2 T3, mutation 2). The method is versioned, so a later packager rule is a version 2, never a silent change. Named as risk 1. |
| K2 | A window send's pointers name earlier sequences, so the reader leaves them unbound, and a withdrawal would record `md5: ''`. | Held | `bindToFiledState` binds them against the filed state. R6 requires every earlier sequence on record first (§3.1.2 step 3; C2 T4). |
| K3 | A compile of the sent sequence made after the send restores it today with no act (§1.6). | Held | C1, first and alone, with a probe test before the change (C1 T1) and a pre-deploy count of rows already restored that way (§7 item 2). |
| K4 | A caller could write `sentRecordStatement` or `restoredBinding` through the public transmit route, and rule 2's binding would let the fold read it. | Held | The guard strips all three keys (§3.3; C2 T9, the dbtest). |
| K5 | A statement drawn from a preview compile names a draft-only leaf the agency never got. | Held | The person leaves it out, and the words say which compile it is and whether it came before or after the send (§3.2.1, §3.2.5; C3 T2). The residual is the attestation's, and the record says so ("rests on that compile and this signature"). |
| K6 | A compile's backbone IDs can differ from the send's: the packager changed (2026-09-29 added backbone IDs), or the transmit re-rendered. A later replace would then point at an ID the agency does not hold, and the agency would reject that later sequence. | Held, **not closed** | Pointers must bind against the filed state, and the words name the compile's date. The ID mismatch itself cannot be detected without the bytes. Named as risk 2, and the reason Q1 (a) is the recommended answer. |
| K7 | Reading the statement from `audit_logs` would lose it after 24 months. | Held | The record moved to the transmittal row (A1). This finding changed the design: the first draft read the chained row. |
| K8 | Re-derivation without a signature is a "silent" restore. | Not held | A person starts it after reading every leaf, binds what they read (`manifestSha256`), gives a reason on the chain, and the card names it. "Silent" is about an unannounced restore, and the record asks for a signature only on the statement path (§3.1.1). |
| K9 | A test send could be put on record as filed. | Held | R5 and T5. A legacy row with no recorded environment makes the signer state "production" in the signed words (§3.2.5). |
| K10 | A lost kept copy could be papered over by a statement. | Held | T3 refuses the statement wherever `sentPackage` is on the row; Q4 asks the founder. |

**Lens 2: RULES 3-6. Is anything rebuilt or new that should not be?**

| # | Attack | Held? | Resolution |
|---|---|---|---|
| K11 | The draft proposed reading leaves from the zip with new code. | Held | Replaced by `readFiledSequenceArchive` (§1.4). The only new logic is the section recovery, by the packager's own exported `baseLeafId` and `ctdFolderSlug`, and the filed-state binding the reader's design handed to RIM. |
| K12 | `bindToFiledState` is a fourth pointer parser. | Held | It uses `MODIFIED_FILE`, exported from the fold as the one rule. The convergence of the other two spellings is done in C2 or named by path (§3.1.2 step 3). |
| K13 | `readAgencyDocument` duplicates P-92's E6. | Held | One function, beside `readVaultSource`, used by both (§3.2.4). |
| K14 | Two route handlers and a precheck step are new. | Not held | They are handlers in the mounted router, with no new route file or mount, as P-34, P-35, P-86 and P-92 do. `ci:one-design-plan` refuses new route files and services, not handlers. |
| K15 | `restoredBinding` is a second binding beside `dispatchBinding`. | Partly held | It is needed for rows the gateway never bound (§1.2). It is recorded only by the two acts, stripped from callers, and read by the same counting rule. Asked of the coordinator (Q3). |
| K16 | The Dispatch-tab disclosure is a per-state panel. | Not held | It is words and one `<details>` inside the existing panel, P-92's pattern, shown in states where that panel already says why it cannot transmit (RULE 4). |
| K17 | C1 touches a route P-97 is about to change. | Held | Sequenced in RIM's one session, with a hold (§5.0). |

**A second round, on the revised draft:**

| # | Attack | Held? | Resolution |
|---|---|---|---|
| K18 | C1 breaks Compile & export for every project whose latest sequence is filed, because the default spine picks the latest sequence whatever its status. | Held, as a consequence, not a defect | Checked: `resolveSubmissionSpine` orders by sequence number only (`cmc/submission-spine.ts:129-175`), and compile is a button, not a load-time call (`EctdCompile.tsx:1102-1120`). The refusal now says what to do ("Start the next sequence to compile again"), and C1 T4 pins it. Viewing and downloading are unaffected: the export route records nothing, and the sent package is on Gateway transmittals. |
| K19 | The section recovery breaks on Study Tagging Files, whose IDs might follow another rule, so every window send with a study would be refused. | Not held | Checked: the packager gives STF leaves IDs from the same assigner, with the study leaf's section (`regional-packager.ts:1304-1324`, `:883-899`). C2 T1 includes a study leaf. |
| K20 | A file name whose slug ends in `-<digits>` makes the decode ambiguous with the collision suffix. | Held | Both readings are tried, and exactly one must pass all three checks, or the leaf is refused (§3.1.2 step 2). |
| K21 | The statement says "these K documents", but a withdrawal is not a document carried. | Held | The words say "entries (documents it filed, and documents it withdrew)" (§3.2.5). |
| K22 | The Vault reuse check spoke of "a transmittal of the same submission"; transmittals carry no submission id. | Held | It reads transmittals bound (either way) to another sequence of the same submission (T8). |
| K23 | Restoring 0000 after 0001 was filed against an empty prior makes the fold show 0001's duplicate `new` filings as the record. | Held, out of scope | It is what the agency holds. Named, not fixed (§7 item 8). |

### 9.3 The three riskiest points

1. **The re-derivation's section recovery (K1).** The package records a leaf's section only at its heading. The guard's
   record holds the row's raw spelling (`3.2.S.4.2`, `m1.2`), and the next sequence matches on it. The design recovers
   it from the packager's own ID rule and refuses unless the folder and the heading agree. If the packager's rules
   change, or a spelling escapes both checks, the next sequence files a document as new beside its earlier version. The
   equality test against the guard's stamp (C2 T1) is the proof, and it must keep passing on every packager change.
2. **The statement rests on a compile, not on the package (K5, K6).** Its leaves, lifecycle and backbone IDs are what a
   compile listed. They may differ from what was sent: a draft-only leaf, a re-rendered checksum, an ID from another
   packager version. The design keeps it from inventing a leaf and binds every pointer to the filed state. It cannot
   prove an ID is the agency's. A wrong ID surfaces only when the agency rejects a later sequence. Q1 (a) is the way to
   close it.
3. **The record's integrity after it is written (K3, K4, §7 item 3).** C1 closes today's silent restore, and C2 strips
   callers' keys. But `submission_transmittals.metadata` still has no record guard, and the chained copies are archived
   after 24 months. A later writer that replaced the key instead of merging it would change what is on file without a
   trace in the fold. S5's owed guard is what closes it.

---

## Answers since this design (appended 2026-11-09)

The coordinator's answers are coordination, not founder decisions; the founder's are recorded in
`docs/LAUNCH_DEFINITION_OF_DONE.md` under P-108, item 4. Where an answer changes this design, the re-cut that applies it
says so, with the tree it was checked against.

### The coordinating session's answers, 2026-11-08

- **C1 (restoredBinding): not the forbidden "inferred binding"**, if three conditions hold:
  - exactly one `ECTD_TRANSMITTED` audit row names both that transmittal row and that sequence; zero, or more than one,
    is refused by name;
  - the signed act cites that audit row's id, and a person signs it;
  - it is written only as `metadata.restoredBinding` on the act, never into the attempt-binding columns.

  This reads `audit_logs`, which the design said neither path does. The read happens at act time, within the audit
  retention window; after archival the statement path is the only one left. (The window's length is stated, with its
  source, in the re-cut.)
- **C2: yes.** Pre-slice-2 staging-"sent" sequences stay with slice 2's runbook rule.
- **C3: as P-92's C6.** A quiet disclosure on today's Dispatch tab, under F1.
- **C4: holds granted when P-99 starts,** recorded in `COORDINATION.md` then. `ectd-compile.ts` was not held, so C1
  (refuse compiling a sequence already on file, 409) landed first, alone, after slice 2.

### The founder's answers: P-108 item 4, 2026-11-08 ("Accept all four")

- **(a)** If a sequence was sent with no compile and no kept bytes, the sponsor's own copy of the package is accepted
  when its SHA-256 matches the one recorded for that send; otherwise it needs a re-filing. This depends on MR-08's open
  question about admitting `.zip` files to Vault, which stays open.
- **(b)** A sequence known only from its compiles counts as unrecorded: re-derived from bytes it becomes `transmit`, and a
  statement restores it only as `statement`.
- **(c)** A kept package that can no longer be read is an integrity incident, never covered by a statement.
- **(d)** A signed statement cannot be superseded for now; a correction is a later sequence.

## Re-cut for C2, against `dbeb901b17` (appended 2026-11-09, before any C2 code)

C2's citations were re-checked against the tree C2 is built on: local `concept2cure-v2` at `dbeb901b17`. Origin's 46
newer commits touch none of the files C2 edits. The table, the method and the evidence are in
`p99-restore-unrecorded-sequence.citations-c2-2026-11-09.md`, beside this file: 121 citations, 65 same, 35 moved,
21 changed, none gone. What the changes mean for C2, and the coordinating session's rulings of 2026-11-09:

1. **The precheck is its own function, not a step of `precheckGovernedStep`.** Each act since P-86 has its own precheck,
   which the route dispatches by step (`server/routes/submissions.ts:2214-2226`). C2 adds `precheckSentRecord(seqId,
   ctx)` beside them, and `'sent-record'` to `governedPrecheckSchema`'s enum (`:2165`). The read-back takes no extra
   body field. §3.5's `compilationId`, `leftOut` and `evidenceDocumentId` belong to the statement (C3). The schema's
   refine at `:2198-2201` admits `evidenceDocumentId` only beside `outcome` or for `'technical-rejection'`, so C3
   widens it then.
2. **Rule 2 (§3.0) reads only the transmit's own `ECTD_TRANSMITTED` rows.** Since P-92, `spendTransmitSignature`
   (`fda-esg-receipts.ts:160-171`) also writes that action: the receipt path writes one, and the settlement writes
   one with `source: 'held-send-settlement'`. Neither carries `packageSha256`. Rule 2 counts only rows whose details
   carry both `transmittalId` and `packageSha256` (the transmit writes both, `submission-service.ts:4343-4345`), and
   no test send (`testSend` true, or `environment` staging). Zero or more than one such row still refuses.
3. **The guard's server-owned keys (§3.3), with one addition.** Today the guard stamps only `dispatchBinding` and
   `leafManifest` as undefined after the caller's metadata (`index.ts:348-354`). C2 adds P-99's three keys, as
   designed. The re-check also found P-92's record keys unstamped: `heldSendSettlement`, `technicalRejection`,
   `as2Receipt` and `as2ReceiptHistory`. The governed HTTP transmit (`POST /api/mdx/gateways/:region/:gateway/transmit`)
   passes caller metadata through, so a person with transmit authority could put "released as not received … by
   signature" or "rejected by FDA on its Ack3, by signature" on their own package row's line in both lists, with no
   signature behind it. The acts are not reachable that way (each reads only a row bound by `dispatchBinding`, which
   is stamped), but the words are. C2 stamps those four keys too, in the same lines, with T9's case extended. This
   addition was put to the coordinating session with this re-cut.
4. **`applySequenceChangeWithAudit` already takes `audit.reason` and `update.afterUpdate`** (P-86 `2b79ca12e`, P-92
   `950e0dca97`; `submission-service.ts:1495-1527`). It sets no tenant context, so C2's `underLock` sets it, as P-92's
   acts do.
5. **`MODIFIED_FILE` is not exported** (`prior-sequence-loader.ts:435`, used once at `:514`). C2 exports it, and
   `bindToFiledState` uses it. The other pointer parsers are named as left, by path, as the coordinating session ruled:
   `regional-packager.ts:907-908` (`MODIFIED_FILE_NAMES_A_LEAF`), `ectd/qualification/qualify.ts:200` (an inline regex
   in `unresolvedModifiedFiles`) and the reader's own `split('#')` with `intoSibling`
   (`filed-sequence-pointers.ts:140-143`).
6. **The fold (§3.3), as it stands.** The transmittal arm (`prior-sequence-loader.ts:323-331`) joins on
   `dispatchBinding`'s attempt, sequence and signature. It keeps `sameAgency` rows (`:352`) and throws on more than
   one (`:356-361`). Today `FiledRecordBasis` is `'transmit' | 'compiles'` (`:250`), with `'none'` internal (`:258`).
   C2 widens the join to `restoredBinding` and adds `restored`. The `'statement'` basis comes with C3.
7. **What the re-check found false in §1, now:**
   - §1.6: C1 landed (`27b901c491`, `refuseCompileOfSequenceOnFile`, `ectd-compile.ts:303-323`, called at `:713`);
   - §1.7: D7-A1 and D7-A2 landed (`c023b17ae0`, `f52cc3be22`, `a66c04fa56`). P-92's held-send and rejection doors
     now sit in `TransmitPanel`, beside where C4a's door goes;
   - §1.8: the clone is no longer shallow (19,354 commits). The full-history deletion search for every name C2 adds
     finds none in code, ever: each appears only in design-doc commits (`b0bb8dccc3`, `bc7ffda39`).
   - §1.3 and §1.4, wrong at the design's own tree too: two of `readSentPackage`'s refusals do not say "nothing was
     downloaded" (§1.3), so C2's R7 rewords its sentences by code, not by suffix; and the reader has 21 literal
     refusal codes, not 20 (§1.4).
8. **Not a defect, named for the record.** `spendTransmitSignature`'s own list (`fda-esg-receipts.ts:156-157`) lacks
   P-92 C4's and C3's actions, which Gate 1's list has. It asks whether the transmit signature S was spent, and those
   rows carry their own signer's signature, of another intent, never S. Only its comment ("every act") is wider than
   its use.
9. **Order and pushing (the coordinating session, 2026-11-09):** C2 and C4's read-back half (C4a) are two commits
   pushed in one window, after `dbeb901b17`. C3 and C4's statement half (C4b) follow in the next. Stage 9's lane was
   told before `filed-sequence-pointers.ts` was edited.
