# F1 repair: a send to the agency's test environment is not a filing (row D7)

Package **F1**, launch row **D7**. Design:
`docs/evidence/RIM/2026-11-08-designs/f1-test-send-is-not-a-filing.design.md` (written 2026-11-01 against `609ef94c7`).
This is a repair of shipped behaviour with no decision number. It reaches the package spine's rule, sweep F14
(`server/services/submission-gateways/governed-transmit.ts` `recordTransmittedSequence`: a non-production send records
nothing), onto the sequence spine. Nothing is added to `docs/LAUNCH_DEFINITION_OF_DONE.md`.

It builds on F1 slice 1 (`090f62af1`, evidence `docs/evidence/D7-ECTD-FILED-STATE-VIEW/2026-11-01-filed-is-what-was-sent/`).
After slice 1, the filed fold reads the transmittal bound by `transmit_attempt_id` for every sequence whose
`dispatch_status` is sent or acknowledged. A staging send that left the sequence 'sent' would therefore be read as
filed. This slice closes that.

## The defect

- The Dispatch tab's transmit panel defaults to the agency's test environment ('staging').
- After a successful staging send, `toDispatchStatus` wrote 'sent' or 'acknowledged'. Every filed reader then read the
  sequence as on file, and `resendRefusal` refused the production send of that same sequence ("already transmitted").
  The test send used up the sequence that must be filed in production.
- `resolveReceiptSequence` (`fda-esg-receipts.ts`) moved the sequence to 'sent' or 'rejected' on a test MDN, ignoring
  the environment it had just recorded.
- A staging send that failed after the wire left the sequence 'transmitting'. SFTP has no receipt path, so such a
  sequence could never be filed.

## What already exists (RULE 3)

- **The rule**, on the package spine: `governed-transmit.ts` `recordTransmittedSequence` (sweep F14). The runbook
  `docs/runbooks/ectd-transmit-path.md` already said "Filed means transmitted to production".
- **`server/services/submission-service/submission-service.ts`**: `toDispatchStatus`, `resendRefusal`,
  `claimTransmitSlot` (its compare-and-set allows NULL, 'pending' and 'rejected'), `releaseTransmitSlot`,
  `transmitSequence` and `transmitDispatchedSequence`, `voidRefusedStepSignature` and `voidingSignatureOnRefusal`
  (P-23), `recordBlockedSequenceTransmit` (trunk's 5c5b89836).
- **`server/services/submission-service/filed-dispatch.ts`**: `FILED_DISPATCH_STATUSES = ['sent','acknowledged']`, the
  one named filed rule. Unmoved; its header now says only a production send files.
- **`server/services/submission-gateways/fda-esg-receipts.ts`** `resolveReceiptSequence`, whose transmittal binding
  records the environment.
- **Client**: `TransmitPanel`, `TransmitFacts` and `DossierTransmissions` in `SubmissionSeqWorkspaces.tsx`;
  `notTransmittedSentence` and `transmittedSentence` in `SubmissionCenter.tsx`; `As2ReceiptUpload.tsx`;
  `dispatchWords` in `CommitmentRow.tsx` (reused, never copied). `ShadowRunCoverage` (3cacf2e15) is untouched.

### Every filed reader is an allow-list (verified 2026-11-08 by search, so none needed a change)

A test send now leaves the sequence 'pending', outside {'sent','acknowledged'}. Each reader below admits only those two
values, so none reads a test send as filed:

| Reader | Where |
|---|---|
| Filed fold, its basis, and the rehearsal's filter | `server/services/ectd/prior-sequence-loader.ts:103`, `:316`, `:565` |
| `filingOrderRefusal` | `submission-service.ts:1570` (`isFiledDispatchStatus`) |
| Commitment fulfilment | `server/services/ha-interactions/commitment-fulfilment.ts:160`, `:282`, `:520` |
| Commitment-evidence trigger | `migrations/20261019_commitment_fulfilment_evidence.sql:256` |
| Document submit | `server/routes/c2c/documents.ts:904` |
| IND overview count | `server/services/ind-lifecycle/ind-submission-overview.ts:55` |
| CSR placement and withdrawal | `server/services/csr/csr-assembly-placement.ts:78`, `:87`; `csr-placement-withdraw.ts:33` |
| Client | `EctdFiledState.tsx:81`, `VaultVersions.tsx:466`, `CommitmentRow.tsx` `dispatchWords` |

`ectd_sequences.dispatch_status` is TEXT with no CHECK, so no migration is needed.

## What changed

### Server (`submission-service.ts`, `fda-esg-receipts.ts`)

1. **A staging result never files.** `toDispatchStatus(status, environment)` returns 'pending' for any environment that
   is not production. The `ECTD_TRANSMITTED` row keeps the environment and gateway status as before. It gains
   `dispatchStatus` (what the send left the sequence at) and, for a test send, `testSend`: "Sent to the agency's test
   environment. A test send is not a filing: the sequence is still unfiled and can be filed with the agency." The row
   spends the signature (P-23 unchanged), so the production send takes a fresh one.
2. **A test receipt never files.** `resolveReceiptSequence` settles the bound attempt to 'pending' when the recorded
   environment is not production (`!==`, so an unknown value files nothing too). The result carries `environment`.
3. **A test attempt never holds the sequence.** A staging send that fails after it reaches the gateway, whether in the
   gateway or in recording its result, voids its signature and only then releases its claim (`releasedTestSend`). Its
   `GOVERNED_SIGNATURE_VOIDED` row names the environment, the attempt and that a test send files nothing. It writes no
   `TRANSMIT_BLOCKED`, which records a refusal before the wire. A production failure after the wire is unchanged: it
   voids nothing and stays 'transmitting'. Decision P-92 settles such a hold later; this slice does not pre-empt it.
4. **`resendRefusal` and the claim compare-and-set agree.** The only value this slice writes is 'pending', which both
   accept. Staging send, then a new production signature, then the production send files the sequence (tested).
5. **Fail-closed release (review, 2026-11-08).** The claim is released only when the void took effect where Gate 1
   reads it: the signature row taken out of force, or the chained `GOVERNED_SIGNATURE_VOIDED` row.
   - `voidRefusedStepSignature` used to call a void kept in the tamper-proof log alone 'voided'. Gate 1
     (`signatureSpentBy`) reads only the chained row, so that signature stayed in force. It now returns 'failed' in
     that case, as its own header already required. This also makes P-23's "is now void" sentence true for freeze and
     dispatch refusals.
   - A test send whose void fails keeps its claim, and the person is told that the sequence stays held until a person
     resolves it.
   - `releaseTransmitSlot` now returns whether it released. "Not held" is said only when it did.
6. **No new lint warning.** `voidRefusedStepSignature` takes the refused step's signature as one object
   (`RefusedStepSignature`, the shape `voidingSignatureOnRefusal` already passed) and is split into
   `unvoidableSignature` and `voidSignatureRecords` inside the same file; the refusal's sentence is added by
   `withVoidSentence`. Behaviour is unchanged (the same 15 cases pass). `submission-service.ts` carries the same 7
   ESLint warnings as at HEAD, so `ci:pushed-lint-warnings` sees no growth. For the same reason the test-send helpers and
   seed rows moved from `refused-step-voids-signature.pglite.test.ts` into `__tests__/_test-send-fixture.ts` (test
   support), and the long describe blocks in it and in `submissionCenterLifecycleQa.test.tsx` were split. No assertion
   changed; the mutations were run again on the final tests.

### Client (words only: no className, markup or layout change)

- The transmit button names where the package goes: "Send sequence N to the agency's test environment", or "File
  sequence N with the agency".
- The signing dialog's target line:
  - staging: "sends the package to the agency's test environment, application N; a test send is not a filing, and the
    sequence can still be filed with the agency";
  - production: "sends the package to the agency's production environment, application N; this files the sequence with
    the agency".
- After a test send, always: "A test send is not a filing; sequence N is not on file at the agency and can still be
  filed with the agency."
- After a production send, `dispatchWords` is used only for a status it names. Any other status reads "Whether the
  agency holds sequence N is not yet confirmed; check the transmittal list before sending again." It never reads "not
  on file" just after a send.
- **A failed production send adds nothing to the server's sentence** (review D1). The old "Nothing was sent." could
  contradict "FDA may hold it". A failed test send adds "A test send is not a filing, so nothing was filed."
- **Dispatch status is said in words** (review D2), through `dispatchWords`. A send in flight reads "a send is in flight
  and not yet confirmed; confirm at the agency before sending again"; an unknown or missing status reads "not
  recorded", never 'pending'.
- **Transmittal rows** (review D3):
  - A row with no recorded environment says "(environment not recorded)".
  - The unanchored note says test sends are not listed either.
- "Not transmitted" becomes "Not sent". A missing credential ends "Add the credentials, then send again."
- Test receipts: "Signed agency MDN verified and recorded. It came from the agency's test environment. ..." For an
  accepted receipt it adds "the sequence can still be filed with the agency".
- No stored environment value reaches the screen (`environmentWords`). Every test asserts that `staging` never appears.

### Docs

- `docs/runbooks/ectd-transmit-path.md`: the rule on the sequence spine, the fail-closed release, and the two queries a
  person runs to find sequences a test send marked filed before this change.
- `docs/work-orders/MR-10-ectd-conformance-and-transmission.md` step 8(iii): test ACKs never move `dispatch_status` into
  the filed set.
- `filed-dispatch.ts`: header only.

## Evidence

| File | What it shows |
|---|---|
| `1-server/red.txt` | the server tests, flipped and new, against the code before the change: 14 failures |
| `1-server/green.txt` | after: 148/148 across 11 files (2026-11-02, HEAD 72f2a942d) |
| `1-server/mutation-1…5` | design mutations 1–4, plus 5 (release without a void), each red on its own assertion |
| `1-server/runbook-query.txt` | both runbook queries on real PostgreSQL 16: they find the defect before the change and nothing after |
| `1-server/head-export-preexisting.txt` | the one DB failure ("a project with no program", 200 vs 404) also fails on a clean export of HEAD |
| `2-words/red.txt` | the client tests against the client before the change: 15 failures |
| `merge-2026-11-08/` | after merging trunk to `b0bb8dccc`: 13/13. Mutation 6: a post-wire test send written as `TRANSMIT_BLOCKED` is caught |
| `review-fixes-2026-11-08/mutation-7…10` | release whatever the void; tamper-proof-only counted as voided; no claim set after the wire; void row without its context. Each is red on its own test, run again on the final (refactored) code |
| `review-fixes-2026-11-08/mutation-c1…c4` | client: "Nothing was sent" on a production failure; unconfirmed said as "not on file"; status shown as stored; no environment said as nothing. Each is red |
| `review-fixes-2026-11-08/pre-existing-server-failures-on-clean-head.txt` | `placement-vault-leaf-parity` (INDEPENDENT_CHECK_REQUIRED) and `refused-before-wire` (a CredentialError site scan) fail identically on clean HEAD `b0bb8dccc`. Not this slice's |
| `review-fixes-2026-11-08/pre-existing-client-failures.txt` | eight client files outside this slice, none of which imports or asserts anything it changed: the same 33 tests fail on the final tree and on clean HEAD `b0bb8dccc` |
| `review-fixes-2026-11-08/final-server-tests.txt` | every test under `submission-service`, `submission-gateways` and `ectd` on the final tree: 2658 pass and 10 fail. Nine are pre-existing and identical on clean HEAD `b0bb8dccc`: 7 `placement-vault-leaf-parity`, 1 `refused-before-wire` and 1 `gateway-selection` (its pool mock refuses `connect`, which trunk's `5c5b89836` now uses to record `TRANSMIT_BLOCKED`). The tenth was this slice's own source-contract test, whose anchors are updated (`mutation-9b-source-contract.txt`); it passes on the final tree |
| `review-fixes-2026-11-08/final-db-tests.txt` | real PostgreSQL 16, `app_service` under RLS: 39/40. The one failure is the pre-existing "a project with no program" (above) |
| `review-fixes-2026-11-08/final-client-tests.txt` | the slice's three client files and `clientCopyNoProgram`: 53/53 |
| `review-fixes-2026-11-08/final-typecheck.txt` | `npm run typecheck`: 0 errors |
| `review-fixes-2026-11-08/final-named-gates.txt` | `ci:one-product`, `ci:json-operator-types`, `ci:sql-interpolation`, `ci:class-vocabulary`, `ci:undefined-css-classes`, `check:catalog-copy`, `ci:drizzle-tenant-scope`, `ci:session-scoped-rls-bypass`, `ci:discarded-audit-write`: all exit 0 |

Every mutation file records the restored file's sha256 against the original.

## Review (2026-11-08): four lenses

Four lenses read the change: filing correctness, Part 11 and security, honest state, and microcopy.

- **Fixed:**
  - a void that failed still released the claim, so a live test-send signature could file in production (security
    MEDIUM, filing MAJOR);
  - "not held" was said even when the release found nothing;
  - a staging send whose result could not be recorded stayed held;
  - the void row did not name the test environment or the attempt;
  - review D1–D3 and the microcopy items above.
- **Not built here; owed and named:**
  1. **Binding a transmit signature to its environment.** The sign payload carries `{intent, meaning}` only, so the
     same signer could use a signature given in the test-send dialog for a production transmit. This gap is older than
     this slice, which only makes the dialog's meaning explicit. Fixing it changes the client's sign payload and Gate
     1, which is outside this slice's words-only client scope. It is a later F1 repair.
  2. **A test send after a production rejection.** The staging claim, release or receipt writes 'pending' where the
     sequence read 'rejected'. Nothing is wrongly filed, and the rejection stays on its transmittal and audit row.
     `releaseTransmitSlot` already does the same on a pre-wire refusal of a rejected sequence. Restoring the prior status
     means carrying it on the claim and the dispatch binding: more code than this display fix is worth now. Named for
     S5.
  3. **Gate 1's wording for a void test-send signature.** It reads "given for a transmit the server refused". The void
     row now says what the attempt was.
  4. **Ids and enums on screen, older than this slice:** "transmittal #id", "user #id", the raw transmittal status chip,
     and `ectd-sequence:<id>` in the signing dialog.
  5. **`environmentWords` beside the server's `ENVIRONMENT_WORDS`.** The phrases are character-for-character equal; a
     shared constant would stop drift.

## Owed from the design

- **Deployed sequences a test send already marked 'sent'.** There is no automatic correction: a migration cannot tell
  a filing from a test send without the audit trail. The runbook's queries list them, and a person decides.
- **Retiring a sequence whose test send found a content defect.** This is founder decision P-86, a later L1 commit.
- **P-92** (settling a held production send) and **P-93** (over 1 GiB) are later and not built here.

## Plan

- `Plan: F1`, `Completes: server/services/submission-service/submission-service.ts`,
  `Completes: server/services/submission-gateways/fda-esg-receipts.ts`.
- No migration, no `shared/schema*`, no `migration-set.mjs`, no new non-test file, no new token or endpoint, no D0-locked
  file.
