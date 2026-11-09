# P-99 C2 + C4a: a sent sequence's record is read back from the package it sent, from its Dispatch tab

P-99 (founder, F1): an unrecorded sent sequence is put back on record. For a send whose bytes the platform kept, its
record of what it carried is re-derived deterministically from those bytes and the derivation is recorded; nothing is
re-filed, nothing is silent, and no leaf is recorded that the bytes do not name. The design is
`docs/evidence/RIM/2026-11-08-designs/p99-restore-unrecorded-sequence.design.md` §3.1–§3.3 and §4–§5 (C2, and C4's
read-back half, C4a), with its "Re-cut for C2, against `dbeb901b17`" (items 1–9) and the citations re-check beside it
(`p99-restore-unrecorded-sequence.citations-c2-2026-11-09.md`: 121 citations, 65 same, 35 moved, 21 changed, none
gone). The coordinating session's ruling of 2026-11-09: C2 and C4a are two commits pushed in one window, after
`dbeb901b17` and `8608bcd4a9`. The signed statement for a send whose bytes were not kept is C3 + C4b, next.

Row D7. Plan F1.

## What already exists (RULE 3)

- **The kept package and its reader** (`server/services/submission-gateways/sent-package-read.ts`, P-86): since
  `3cab286e1` the transmit guard keeps the exact bytes it sends (`sent-package-archive.ts`, `metadata.sentPackage` on
  the transmittal row), and `readSentPackage` produces them under the project's access, refusing a copy that is not the
  package the row records as sent (`SENT_PACKAGE_MISMATCH`), a damaged or missing copy (`SENT_PACKAGE_INTEGRITY`,
  `SENT_PACKAGE_MISSING`) and an unkept one.
- **The filed-sequence reader** (`server/services/legacy-importer/filed-sequence-pointers.ts` and its archive reader):
  reads a sequence's backbone from a package, its leaves, headings, hrefs, checksums and lifecycle pointers. It did not
  bind what points outside the package against what is on file.
- **The stored record's shape** (`server/services/ectd/sequence-manifest.ts` `buildLeafManifest`): what the transmit
  guard stamps as `leafManifest` on the send's row (F1 slice 1).
- **The fold** (`server/services/ectd/prior-sequence-loader.ts`): each filed sequence read from the transmittal its
  attempt binds, else its compiles (`'compiles'`), else nothing (`'none'`), and the refusal that stops a lifecycle read
  against a sent sequence nothing describes (slice 1, P-99 C1 `dbeb901b17`).
- **The guard's server-owned keys** (`server/services/submission-gateways/index.ts`): `dispatchBinding`, `leafManifest`
  and, since `8608bcd4a9`, P-92's four record keys are stamped undefined after a caller's metadata.
- **The act's machinery** (`server/services/submission-service/submission-service.ts`):
  `applySequenceChangeWithAudit` with `underLock`, `afterUpdate` and `reason` (P-86, P-92); each act's own precheck
  dispatched by step at the route (`server/routes/submissions.ts`); readiness's verdict (`sequenceTransmitReadiness`).
- **The Dispatch tab's doors** (`client/src/concept2cure/v2/surfaces/SubmissionSeqWorkspaces.tsx` `TransmitPanel`,
  P-92 C1–C4): a closed `.pj-more` disclosure that asks the server on each open and keeps nothing across a close.
- **"On file at the agency"** (`client/src/concept2cure/v2/surfaces/EctdFiledState.tsx`, on eCTD Compile): the fold, as
  one card.

Nothing read a send's record back from its bytes, bound it against the filed state, or put it on the send's row: no
function, act, route or door. The full-history deletion search for every name C2 adds finds none in code, ever (design
re-cut item 7). C2 completes the files above; it adds no table, mount, route file, screen or AnA tool.

## The change

**Server (commit 1, C2).**
- `sent-package-read.ts`: `deriveSentLeafManifest(bytes, {sequenceNumber, region}, priorLeaves)`, pure over its inputs:
  1. the archive holds exactly this sequence of this agency, and nothing in it was refused;
  2. each leaf's precise section is read back from its backbone ID, and kept only when three encodings agree: the ID
     the packager would give, the folder for that section (a study report's subfolder allowed in m4/m5), and the
     heading it sits under; otherwise the leaf is refused by name, never guessed;
  3. what points outside the package is bound against the filed state (`bindToFiledState`);
  4. the stored shape is `buildLeafManifest`'s, in backbone and ID order, with `manifestSha256` over it.
  `SENT_RECORD_METHOD` `'sent-package-read'`, version 1; `SENT_RECORD_NOT_RECOVERABLE` names what a package cannot hold
  (`sourceMd5`, `originalPdfProof`); `SentRecordNotDerivable` carries the reader's reasons.
- `filed-sequence-pointers.ts`: `bindToFiledState`: a modified-file pointer must name exactly one filed leaf (sequence,
  backbone, leaf ID); a delete takes that leaf's section, file name and checksum; a reused file must name a filed leaf
  with that href and checksum. It uses the loader's `MODIFIED_FILE`, now exported.
- `prior-sequence-loader.ts`: the transmittal arm also admits `restoredBinding` (`IS NOT DISTINCT FROM` on attempt and
  signature, both null on a legacy claim); `restored: {how: 'read-back', on}` on a sequence read back; the unrecorded
  refusal names its door ("Put it on record from its Dispatch tab in Submission Center."); `unrecordedSequencesBefore`;
  `sendTransmittal`: rule 1, the row `dispatchBinding` binds; rule 2, where the gateway wrote none, the send's own
  chained `ECTD_TRANSMITTED` row (one carrying `transmittalId` and `packageSha256`, not a test send, of signature S;
  exactly one; the row's `bundle_sha256` equal to `packageSha256`; no other send's binding on the row).
- `index.ts` (the guard): `leafManifestDerivation`, `sentRecordStatement` and `restoredBinding` are server-owned too.
- `submission-service.ts`: `precheckSentRecord` (path `read-back`, or `statement` refused for now in words) and
  `rederiveSentRecord(seqId, ctx, {reason, manifestSha256})`, unsigned (design §3.1.3 R8: a governed writer):
  R1–R6 refusals in words; the bytes read under the project's access (R7); derived outside the lock; what is recorded
  must be what the person read (`manifestSha256`); under the lock, tenant context, the transmittal then the sequence
  `FOR UPDATE`, R1–R6 judged again and the filed state compared; a CAS on the sequence and on the row (`NOT (metadata ?
  'leafManifest')`, no statement, the kept copy's SHA-256 unchanged); `leafManifest`, `leafManifestDerivation` and,
  under rule 2, `restoredBinding` written on the send's own row; `ECTD_SENT_RECORD_REDERIVED` chained on the sequence
  with the reason and the derivation's facts. `sequenceTransmitReadiness.sentRecord.basis` tells the screen what is on
  record. `SENT_RECORD_NOT_RESTORABLE` answers 409.
- `server/routes/submissions.ts`: `POST /sequences/:seqId/sent-record/rederive` (`reason` 1–2000, `manifestSha256` 64
  hex), and `'sent-record'` answered at the governed precheck by its own function.
- `docs/runbooks/ectd-transmit-path.md` §3b, with the pre-deploy queries below.

**Client (commit 2, C4a).**
- `SubmissionSeqWorkspaces.tsx`, under "Transmit is not available" on a filed sequence read from nothing or only its
  compiles: one line saying which ("Nothing on record says what sequence N carried, so the next sequence of this
  submission cannot be built against it." / "Sequence N is read from its compiles, which may differ from what it
  sent."), and a closed door **Put sequence N's send on record…**. Opened, it asks the server: the read-back offered in
  words (what was kept, when, to which agency; every document as "section · file · act" under "What would be
  recorded"; what a package cannot hold), "Why you are recording this", and a quiet **Record what sequence N sent**.
  The act's answer is a success only when it says `recorded: true` for this sequence; the notice says what was recorded
  and when, and the panel reads again (the door goes). A refusal is said in the server's words; an unreadable answer is
  said, never "nothing to restore". No ID, checksum, href or record key is on screen.
- `EctdFiledState.tsx`: a sequence read back says so on the card: "Sequence N is read from what it sent (read back from
  the package it sent, on D Month YYYY)." (the design's S10 wording).

## Departures from the design, each with its reason

1. **Leaves in backbone and ID order.** The package keeps no input order, so the derived record is sorted by
   `backbone#leafId`; T1 compares the guard's stamp sorted the same way.
2. **T10's race is injected after the derivation** (an `afterDerive` hook in the harness): PGlite has one connection, so
   a second transaction cannot run beside the act.
3. **R8 (role) and the project access are stubbed in the PGlite harness**, and proven unstubbed on PostgreSQL by T11.
4. **T11 runs on real PostgreSQL** (`tests/db/ectd-filed-state-view.dbtest.ts`), as `app_service` with
   `RLS_ENFORCE=on`, through the real routes and with real kept bytes; PGlite has no RLS.
5. **No `SubmissionCenter.tsx` change.** The read-back is unsigned, so it needs no signature dialog: the door, the act
   and the notice live in `TransmitPanel` (`SentRecordPlace`), beside P-92's doors.
6. **The statement path is not here yet** (C3): the precheck says "…can be restored only by a signed statement of what
   it carried, which is not available here yet. Nothing was changed."
7. **One test case added to make the design's mutation 5 meaningful.** Dropping the `sentPackage.sha256 =
   bundle_sha256` check (in `readSentPackage`) survives the design's "T8 corrupt copy": that copy is also refused by the
   byte check behind it, in the same words. T8 now also refuses "an intact copy of another package" (the kept bytes
   match their record, but the row records other bytes as sent), which only that check catches.
8. **The P-92 C3 pin's comment** (`ana-cannot-reopen-held-send.test.ts`) reads "re-open's"; a one-word fix.
9. **The pin of the unrecorded refusal** (`lifecycle-declared-acts.pglite.test.ts`) includes the door sentence the
   refusal now carries.

Left as the coordinating session ruled, by path: the other pointer parsers, `regional-packager.ts:907-908`
(`MODIFIED_FILE_NAMES_A_LEAF`), `ectd/qualification/qualify.ts:200` (`unresolvedModifiedFiles`) and the reader's own
`split('#')` with `intoSibling` (`filed-sequence-pointers.ts:140-143`).

## Evidence

**Red first** (each saved before the code it proves):
`red-derivation.txt` (T1–T5), `red-t9-guard.txt` (P-99's keys reach the row), `red-act.txt` (T6–T10),
`red-route.txt` (the door and the precheck at the route), `red-client.txt` (C4a's eight), `red-card.txt` (S10).
The AnA pin (`ana-cannot-restore-sent-record.test.ts`) is a guard, green from the start; its red is mutation C2M14.
T11 was written after the act (the gap was found when C2M12 had no killer); its red is mutation C2M22.

**Green** (`green.txt`): 10 files, 78 tests, on the final code and tests.

**Broad** (`broad-server.txt`, `broad-client.txt`), on the final code and tests: server 256 files, 3,205 passed and 8
skipped, none failed; client 49 files, 563 passed. (The first broad run, before the final edits, failed one test: the
pin of the unrecorded refusal's exact words, now carrying its door sentence; departure 9.)

**Real PostgreSQL** (`real-postgres/`): `tests/db/ectd-filed-state-view.dbtest.ts` 11/11 on PostgreSQL 16, as
`app_service` with `RLS_ENFORCE=on`, on a throwaway deploy-shaped database: the read-back row read `'transmit'` and
dated; another organisation's `restoredBinding` naming the same sequence id never read; T11, the act through its routes.

**Mutations** (`mutations/`, driver `p99-c2-mutations.py`, each applied alone on the final code and tests, its test
run, the file restored by SHA-256):

| Mutation | Where | Goes red |
|---|---|---|
| C2M01 record the heading's section (skip the read-back) | `sent-package-read.ts` | T1 (both sequences), T3 |
| C2M02 accept the ID without the folder check | `sent-package-read.ts` | T3 (ID changed by one byte) |
| C2M03 skip `bindToFiledState` | `sent-package-read.ts` | T1 (0001), T4 |
| C2M04 skip `buildLeafManifest` | `sent-package-read.ts` | T1, T5 |
| C2M05 drop the kept copy's `sha256 = bundle_sha256` check | `readSentPackage` | T8 "an intact copy of another package" |
| C2M06 allow a staging row | `submission-service.ts` | T8 "a test send" |
| C2M07 write without the CAS on the row | `submission-service.ts` | **survives**: see below |
| C2M08 read compiles beside a re-derived record | `prior-sequence-loader.ts` | T6 (the phantom) |
| C2M09 rule 2 takes the first of two transmit rows | `prior-sequence-loader.ts` | T7 |
| C2M10 the guard keeps a caller's `restoredBinding` | `index.ts` | T9 |
| C2M11 ignore the request's `manifestSha256` | `submission-service.ts` | T10 |
| C2M12 drop `setTenantContextTx` | `submission-service.ts` | **survives** (T11, real PostgreSQL): see below |
| C2M13 not judged again under the lock | `submission-service.ts` | T10 race (the CAS answers in other words) |
| C2M14 an AnA source reaches the act | `AnaToolDefinitions.ts` | the AnA pin |
| C2M15 the `restoredBinding` join with `=` (null-unsafe) | `prior-sequence-loader.ts` | dbtest, real PostgreSQL (legacy claim) |
| C2M16 the precheck step left to the generic precheck | `routes/submissions.ts` | the route's dispatch case |
| C2M17 the door shown for `'transmit'` | `SubmissionSeqWorkspaces.tsx` | "there is no door already read from what it sent" |
| C2M18 any 200 is a success | `SubmissionSeqWorkspaces.tsx` | "a 200 that is not this sequence's record is not a success" |
| C2M19 the payload without what was read | `SubmissionSeqWorkspaces.tsx` | "records what the person read" |
| C2M20 the card's read-back line dropped | `EctdFiledState.tsx` | S10's case |
| C2M21 C2M07 and C2M13 together | `submission-service.ts` | T10 race: the send is recorded twice |
| C2M22 the kept send's row written in another organisation | T11's fixture | T11, real PostgreSQL: under RLS the act, scoped to its own tenant, does not find the row |

Two survive, and neither is a missing test:
- **C2M07.** The act judges R1–R6 again under the transmittal's `FOR UPDATE` lock before it writes, so a send put on
  record between the read and the lock is refused there, and the row CAS is never reached. C2M13 (the judgment
  dropped) is red because the CAS then refuses in its own words; C2M21 (both dropped) records the send twice. The CAS
  is the second of two layers, kept.
- **C2M12.** Through the route, the instrumented pool (`server/db/poolInstrumentation.ts`) applies the request's tenant
  scope to every statement while `RLS_ENFORCE=on`, so T11 still finds the row and the bytes without the act's own
  `setTenantContextTx`; a caller with no scope fails closed at the pool. It is equivalent on every path the act has.
  It stays, as the design (re-cut item 4) and P-92's acts set it.

**In the running app** (`screen/`, RULE 4): the walk's throwaway database (`seed.sql`; the package is a real one from
the canonical packager, kept in the app's own store by `keep-package.ts`; its documents are labelled walk stand-ins),
never an agency. `capture.cjs` at 1440×900 and 390×844, light and dark; `probes-c2-*.json` holds what each screen
measured.
- **Before** (`c2-closed-*`, `c2-opened-*`): sequence 0000 of submission 20 (bytes kept, read from a preview compile
  that carried `phantom-draft.pdf`, which the send did not) says it is read from its compiles; opened, the read-back
  lists the package's three documents, the reason field, and the button disabled until a reason is given. Sequence
  0001 of submission 18 (no bytes kept) says nothing is on record; opened, the statement path's refusal in words.
  Every screen: the summary is hit-testable, no record key or 64-hex checksum on screen, no horizontal overflow, no
  page error.
- **Act** (`c2-reason-*`, `c2-recorded-*`): the reason typed, recorded; the notice "Sequence 0000's record was read
  back from the package it sent, on 9 November 2026. The next sequence can now be built against it."; the door gone.
- **After** (`c2-dispatch-after-*`, `c2-card-*`): no door on the Dispatch tab; eCTD Compile's "On file at the agency"
  holds the three documents, not the phantom, and says "Sequence 0000 is read from what it sent (read back from the
  package it sent, on 9 November 2026)."
- **The database** (`db-check.sql`, `db-before-act.txt`, `db-after-act.txt`): before, no record on the row and no
  chained row; after, `leafManifest` of exactly the package's three documents, `leafManifestDerivation` (method
  `sent-package-read`, version 1, the `manifestSha256` the screen read, `derivedBy` 16, `notRecoverable`), and one
  `ECTD_SENT_RECORD_REDERIVED` row with the reason, chained. `db-before-act.txt` was taken with the query's first
  revision, whose `method_version` column read a key the record does not carry (the record's key is `version`, as
  designed; the audit row's is `methodVersion`); every derivation column was empty either way. `hmac_seal` is null on
  every audit row of the walk's server, which runs with no audit HMAC secret; the chain is written.
- Seen, not C2's, for the UI pass: at 390 the existing "Send sequence…" button is clipped at the right edge, and the
  card's table clips its last column; S10's sentence repeats the lead line's "read from what each sequence sent" (it is
  the design's wording).

**Gates** (`gates.txt`): the eleven design gates, `ci:sql-interpolation` and `check-db-test-isolation`, each 0.
**Lint** (`lint.txt`): every new file at 0; the ratchet: no changed file gained a warning (two describes this slice
lengthened past 100 lines were split, with no change of behaviour). **Typecheck** (`typecheck.txt`): 0 errors, at its baseline of 0.

## Before C2 deploys: read-only queries for each deployed database

In `docs/runbooks/ectd-transmit-path.md` §3b, run read-only on a throwaway copy here (`screen/` is the walk's; the
queries' shapes were checked there): (a) sent sequences the lifecycle read refuses today, and whether each has a kept
copy; (b) sent sequences with no transmittal row naming them at all; (c) rows carrying a key only P-99's acts may
write, expected none. Their results on each deployed database go to the release record; any row in (c) is a founder
decision, not an edit. Owed: run them on each deployed database before C2 deploys.
