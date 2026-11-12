# P-92 C1: a held FDA send is settled by a named person's signed act, either way (row D7, 2026-11-09)

## The decision, and the rulings that bind this commit

- **P-92** (founder, 2026-11-02, `docs/LAUNCH_DEFINITION_OF_DONE.md`): "Allow both." A held send may be settled by one
  of two signed acts, each with re-authentication and the agency's document retained in Vault and linked to the act:
  - **recorded as received**, on Ack2 or Ack3 evidence from FDA;
  - **released as not received**, only on FDA's written confirmation of non-receipt. The act states the
    duplicate-filing risk to the signer before they sign.

  Not decided: no settlement without the agency document, no settlement by an unsigned action, and the removed
  rollback route stays removed.
- **P-108** (founder, 2026-11-08, "Accept all three"):
  - **1(a):** once an Ack3 has arrived, "received" needs it to accept. A failed Ack3 after an Ack2 is a technical
    rejection (design C4, not this commit).
  - **1(b) amends P-92:** for a send the platform's own record proves never left, a signed release cites that proof,
    not FDA's written confirmation.
  - **1(c):** FDA's later verified answer wins over a settlement, through a second signed act that re-opens it (design
    C3, not this commit). Both records are kept, and resends are refused meanwhile.
  - **2(a):** a production attempt released as not received is not a "bound production send", so P-86's act can
    retire the sequence.
  - **2(c):** no settlement path for a legacy hold older than the per-attempt binding.
- **The coordinating session's answers:** §10.1 of the design (C3 to C9). B1 (2026-11-09) is answered yes under four
  conditions (§10.4). The C1 file list was approved on 2026-11-09, red first. One file was added and reported before
  it was touched (`sequence-validated-honesty.pglite.test.ts`). Two cases for the resend hold were reported just after
  their edit. They first went into `refused-step-voids-signature.pglite.test.ts`, which they pushed past the 500-line
  rule, so they live in a suite of their own (`released-send-resend-hold.pglite.test.ts`). That file is unchanged.
- **The design:** `docs/evidence/RIM/2026-11-08-designs/p92-settle-held-fda-send.design.md`. §10.3 and §10.4 bind where
  §0 to §9 differ. Its citation re-check is `p92-settle-held-fda-send.citations-2026-11-09.md`.

## What already exists (RULE 3)

The design's §1 sets this out by path. Each item was re-read on today's trunk before the first edit.

- **The claim that holds a send.** `claimTransmitSlot` (`submission-service.ts`) moves a sequence to `'transmitting'`
  and stamps the transmit signature S and attempt A. `releaseTransmitSlot` releases it only before the wire. Its
  comment says the claim is otherwise "deliberately left standing for a human to resolve". **P-92 is that human
  resolution.**
- **The one way out until now: FDA's signed MDN.** `ingestFdaAs2Receipt` (`fda-esg-receipts.ts`), reached by "Record
  agency MDN" on Gateway transmittals (`POST /api/mdx/gateways/transmittals/:id/as2-receipt`). It verifies the MDN's
  signature, Message-ID and MIC, locks the transmittal and then the sequence, spends S with `ECTD_TRANSMITTED`, and
  moves `'transmitting'` on (S, A). It cannot settle a send whose MDN never came, or a 4xx refusal.
- **The sequence's signed-act chain**, all in `submission-service.ts`:
  - the sign step (`POST /api/c2c/actions/sign`, with re-authentication and the signer's reason);
  - Gate 1 (`governedSignatureVerdict`) with its `payloadRefusal` hook;
  - `INTENT_MEANING_REFUSAL` and `independentSignerRefusal`;
  - `recheckUnderSequenceLock`;
  - `voidingSignatureOnRefusal` (P-23);
  - `applySequenceChangeWithAudit`.

  These are the templates P-34, P-35 and P-86 use on the same target. P-86 C2 is the template for a precheck
  answered at the route.
- **An agency document in Vault linked to a signed act.** `filed-sequence-rejection.ts` (package spine only) reads
  `readVaultSource` (`server/services/regulatory/lifecycle-signature.ts`) and binds `content_hash`. P-92 reuses
  `readVaultSource`.
- **What P-86 keeps.** `filed-sequence-baseline.ts`: check 3 (`boundProductionSend`) and check 4 (a recorded
  production `ECTD_TRANSMITTED`). Its code note already named this step: "When P-92's 'released as not received' is
  built, checks 3 and 4 exclude a released attempt too."
- **The resend refusal.** `resendRefusal` in `sequenceTransmitReadiness`.
- **The manual, unsigned settlements.** `docs/runbooks/fda-esg-production-uat.md` §5.4 (patching statuses to
  `ack*_received` after reading WebTrader, retired April 2025) and §7 (a manual "rollback" to `'rejected'`). P-92's
  record forbids each as a settlement.
- **The removed rollback route.** Tombstone in `server/routes/mdx-submission-gateway.ts`. It was removed by
  `6ef0ef121` (2026-10-17) and created by `102706671` (2026-06-29). It never touched `ectd_sequences`, so it never
  released a held sequence. It stays removed, and P-92 neither uses nor deletes `rollbackTransmittal`.
- **Ack2 and Ack3.** No parser and no inbound endpoint. No code writes `ack2_received` or `ack3_received` (re-checked:
  `00-searches/searches.txt`). That is why the evidence is a document kept in Vault and judged by a person, and the
  statement says "The platform did not verify this acknowledgement".

### Searches run (`00-searches/`)

- **The clone:** not shallow, 19,240 commits on `origin/concept2cure-v2` back to 2025-11-20 (`3e1dcf8f01`). It was
  unshallowed for the B1 search (`git fetch --unshallow`).
- **Code on trunk** (`git grep -i`, `server/`, `client/`, `shared/`):
  - `non-receipt`, `held-send`, `heldSend`, `settleHeld` → 0 files;
  - `held send` → 2 files, both test comments ("nothing … is a held send");
  - writers of `ack2_received` or `ack3_received` → 0.
- **History** (`git log -S` on trunk):
  - `settleHeldSend`, `HELD_SEND`, `heldSend`, `held-send` and `non-receipt` → documentation commits only. Limited
    to `server/`, `client/`, `shared/`, `scripts/` and `migrations/`, each finds 0 commits.
  - "released as not received" → one code commit, `2b79ca12ed` (P-86 C1). It is the note in `filed-sequence-baseline.ts`
    that this commit completes.
- **Deletions** (full history, `--full-history --diff-filter=D`, filtered case-insensitively for ack, poller,
  webtrader, esg, rollback, receipt, mdn, retract, transmittal, settle, held). The relevant hits:

  | Deleted | Commit | What it was | Bearing on P-92 |
  |---|---|---|---|
  | `server/utils/esg_ack_poller.py`, `server/routes/acks.py`, `server/tasks/esg_tasks.py`, `server/utils/esg_submitter.py` | `87d13d7cd4` (2026-03-25) | An unsigned poller that set a Python model's status from ACK files over SFTP | An automated, unsigned update in a deleted language. Not a signed settlement. Nothing to restore. |
  | `server/services/esgPush.js`, `server/services/esgService.js`, `server/routes/esgSubmission.js` | `b6e991501c`, `e1dca6e3de` (2026-04-04), `f355be1daa` (2026-04-01) | Earlier ESG submitters | No settlement or acknowledgement act. |
  | `server/routes/esgSubmissionRoutes.ts` | `c6d7295a8d` (2026-08-13) | A simulated transmit with an `acknowledgmentNumber` field | Converged onto `submission-gateways/`. No settlement act. |
  | `server/services/submission-gateways/__tests__/fda-esg-sftp-ack.test.ts` | `edd225c027` (2026-11-09) | The SFTP branch's test, retired with the branch (P-93) | The branch E9′ reads the history of. Its retirement is why no new SFTP hold can occur. |

  And the rollback route's removal, `6ef0ef121`, a handler inside a kept file.
- **B1's search, re-run at this commit** (`00-searches/b1-sftp-search.txt`): `ssh2-sftp-client`, `ssh2-sftp` and
  `"ssh2"` in any manifest or lockfile, at any depth and every tag → 0 commits each. The positive control finds
  `node_modules/express`. No Dockerfile, CI or deploy script mentions `ssh2`. The result is the same as at design
  time.
- **Conclusion.** No signed settlement of a held send has ever existed. Every part P-92 needs exists. This commit
  **completes** the sequence's signed acts (`submission-service.ts`) and FDA's receipt reconciliation
  (`fda-esg-receipts.ts`), and completes P-86's checks (`filed-sequence-baseline.ts`).

## The change

### The act: `settleHeldSend` (`submission-service.ts`)

- **One intent, `held-send-settlement`, meaning responsibility only.** The decision is in the signed payload: the
  outcome, the transmittal and attempt, the evidence, and the statement. The signer's reason is the signature's own.
- **Three evidence kinds**, checked by E7 (`evidenceKindRefusal`):
  - `ack2` or `ack3` for **received**;
  - `fda-non-receipt-confirmation` or `platform-proof` for **released**.
- **The order of the act:**
  1. Gate 1, with `heldSendPayloadRefusal`: the payload names this attempt, this outcome and a kind it fits. For
     platform proof, it also names the proof this row's transport takes.
  2. The judged choice, which must match what was signed, character for character (`signedHeldSendMismatch`).
  3. Under the transmittal's lock, then the sequence's (the receipt path's order), everything is read again.
  4. One transaction:
     - the sequence's UPDATE, a compare-and-set on (`'transmitting'`, S, A);
     - the transmittal's `heldSendSettlement`, set once;
     - S spent with `ECTD_TRANSMITTED` (`source 'held-send-settlement'`);
     - the `ECTD_HELD_SEND_SETTLED` audit row, with the reason and the statement.

  A refused act voids its signature (P-23). A repeated act after success does not void the signature that
  performed it.
- **What each outcome does:**
  - Received: dispatch status `'sent'` on an Ack2, `'acknowledged'` on an Ack3, through
    `toDispatchStatus(…, 'production')`. A stays as the attempt of record.
  - Released: `'pending'`, with S and A cleared (`RELEASE_TRANSMIT_CLAIM_SQL`, shared with `releaseTransmitSlot`).
    The transmittal becomes `'rejected'`, never `rolled_back`.
- **`applySequenceChangeWithAudit` gains `afterUpdate`**: the transmittal mark and the spend run inside the same
  transaction, after the UPDATE succeeds.
- **`signatureSpentBy`'s list** gains `ECTD_HELD_SEND_SETTLED`. So does the receipt path's spend, which now uses
  Gate 1's own list (`spendTransmitSignature`).

### The rules: `fda-esg-receipts.ts`

- **`readHeldSend`, E2:** the one transmittal bound to (S, A). Two such rows fail closed.
- **`heldSendBlocker`, E1 to E5:**
  - E1: nothing held, or a legacy claim with no binding (P-108 2(c));
  - E2: no bound FDA transmission;
  - E3: a send to FDA's test environment, or an unrecorded environment;
  - E4: FDA's signed answer already kept. This points at "Record agency MDN";
  - E5: a send that may still be in progress, until a finishing write or 24 hours of quiet.
- **`receivedRefusal`, E5b:** "received" needs an AS2 send that left, and that FDA's endpoint did not refuse (4xx).
- **`platformProofOf`, E9 and E9′:**
  - an AS2 row with no AS2 message identity is proof (`no-as2-message`);
  - an SFTP row with nothing that came back, in `pending`, `in_transit` or `rejected`, is proof
    (`sftp-client-never-shipped`, under §10.4's conditions);
  - nothing else is proof.
- **`heldSendStatement`:** the one source of the words, for each of the four kinds and both proofs. The precheck
  answers it, the payload binds it, and the act repeats it. A release states the duplicate-filing risk. A release of
  a legacy send over the launch ceiling also says the sequence "cannot be sent as it is", quoting
  `launchSequenceSizeRefusal` (§10.3 A.2).
- **E6, the document** (`heldSendDocument` in `submission-service.ts`):
  - a live Vault document of this organization and this project;
  - recorded after the send was made;
  - not one that already settled another send of the sequence (by id or hash).
- **A late FDA receipt after a settlement** (§3.3, P-108 1(c)):
  - `ingestFdaAs2Receipt` keeps a verified MDN that contradicts the settlement in `as2ReceiptHistory`, with
    `contradicts`, and records the governed action;
  - it then answers 409 `AS2_RECEIPT_CONTRADICTS_SETTLEMENT`;
  - an MDN that agrees takes today's path.

  While FDA's receipt contradicts a release, `releasedSendReceivedRefusal` refuses a resend. It does so in readiness
  (`resendOrReleasedHold`) and again in the claim, under the sequence lock (`releasedSendHold`, `DISPATCH_BLOCKED`).

### The door and the precheck (`server/routes/submissions.ts`)

- `POST /api/submissions/sequences/:seqId/held-send/settle` takes `{ signatureActionId, outcome }` only. The signature
  carries the evidence, the statement and the reason.
- `governed-precheck` with `step: 'held-send-settlement'` is answered at the route by `precheckHeldSendSettlement`,
  as P-86 C2 does for `retire`.
  - With no outcome, it gives the overview: which outcomes are offered, and why not.
  - With an outcome, a kind and (for a document) a Vault id, it gives the refusal or the statement and the evidence
    to sign.
  - It refuses a document without an outcome, received without a kind, an unknown kind, and an id that is not a
    UUID.
- `HELD_SEND_NOT_SETTLEABLE` is 409.

### P-86's checks (`filed-sequence-baseline.ts`, P-108 2(a))

- Check 3 excludes a transmittal whose `heldSendSettlement.outcome` is `'not-received'`.
- Check 4 excludes the `ECTD_TRANSMITTED` row that spent S with `source 'held-send-settlement'` and
  `status 'not-received'`. Both sides are COALESCE'd, so a legacy row with no `source` still keeps the sequence.
- Check 2b's sentence names the new way out: "Record the agency's receipt, settle the held send from the Dispatch tab,
  or wait for the send to settle, then look again." (§10.3 A.5; red first, `01d-red-check-2b.txt`).

### No AnA door

`ana-cannot-settle-held-send.test.ts` pins two things. No AnA tool is declared to settle or release a held send. And
no source file AnA or the MCP server loads names the act, its route, its intent or its audit action. The scan reads
more than 50 files, and its pattern is shown to match the act and nothing near it.

### The runbooks

- **`docs/runbooks/fda-esg-production-uat.md`:** §5.4's and §7's manual SQL are retired. A held send is settled by
  FDA's MDN or the signed act. §9's acceptance no longer admits a manual patch.
- **`docs/runbooks/ectd-transmit-path.md` §3a:** the ways out, in order, and four read-only queries:
  - held sends on the sequence spine;
  - legacy holds with no binding (expected zero);
  - package-spine production sends with no answer (expected zero, coordinator C5);
  - releases that FDA's receipt contradicts.

### Tests and fixtures

- `server/services/submission-service/__tests__/held-send-settlement.pglite.test.ts`, 31 cases:
  - T1 to T3;
  - E9 and E9′, with §10.4's cases in both directions;
  - §10.3 A.2;
  - E1 to E8 (T4);
  - T5 and T9;
  - P-108 2(a) with P-86.
- `server/routes/__tests__/submissions-held-send-settlement.test.ts`, 13 cases: the door and the precheck.
- `server/services/ana/__tests__/ana-cannot-settle-held-send.test.ts`, 3 cases.
- `server/services/submission-gateways/__tests__/fda-esg-receipts.pglite.test.ts`, 4 new T7 cases: a late receipt
  after a settlement.
- `server/services/submission-service/__tests__/released-send-resend-hold.pglite.test.ts`, 2 cases, over the real
  transmit (launch-sequence-size's pattern: real PGlite and assembler, the gate cleared, the gateway configured):
  - after FDA's receipt contradicts a release, the transmit precheck refuses before anyone signs, and a release FDA
    has not contradicted is not held;
  - a transmit signed anyway is refused `DISPATCH_BLOCKED` at the claim, under the sequence lock. Nothing is claimed
    or sent, and its signature is void.

  The claim is the only place the transmit itself checks this. Before these cases, no test reached either call.
- `server/services/submission-service/__tests__/transmit-refusals.test.ts`: one case, that the held and filed lines say
  no stored status (departure 6).
- `server/services/submission-service/__tests__/sequence-validated-honesty.pglite.test.ts`: its fixture gains the
  `submission_transmittals` table every deployed database has. Transmit readiness now reads it (§3.3).

## Departures from the design, each found by the tests or the gates

1. **A.5's retirement cases are in `held-send-settlement.pglite.test.ts`,** not `sequence-retirement.pglite.test.ts`.
   They need a settled send, which is that file's fixture. P-86's own legacy case in `sequence-retirement` is what
   caught departure 2.
2. **Check 4's exclusion was not NULL-safe as first written.** `NOT (source = … AND status = …)` is NULL for a legacy
   row with no `source`, so the row was dropped and the sequence became retirable. The broad run caught it
   (`sequence-retirement.pglite.test.ts`, "refuses a sequence recorded as transmitted to production before sends
   carried a binding"). Both sides are now COALESCE'd.
3. **The resend hold reads no `gateway` column.** The first read filtered on `gateway = 'esg'`, which two older test
   fixtures lack. The filter was redundant, because only `markHeldSendSettled` writes `heldSendSettlement`, and only
   on an FDA ESG row. The record's outcome is also checked in code, so a read that returns an unrelated row refuses
   nothing. The broad run caught it.
4. **§10.4's "received status" case passes through E4.** An SFTP row in `received` is refused before the proof rule
   is reached. The case pins the outcome. The proof rule's own status check is a second guard that no test can reach
   alone.
5. **E5b's case covered only its 4xx arm.** M07 (received allowed for a send that never left) survived on the E5b
   filter: only E9's case reached that arm. The E5b case now also checks a send whose row never left `pending`, and
   M07 goes red on both cases (`mutation-M07-…txt`; the first run is kept as `…first-filter.txt`).
6. **The held and filed lines are said in words** (`resendRefusal`). Design S0 shows "C1's sentence after 'Transmit is
   not available:'", and it printed `(dispatch status 'transmitting')`; the filed line after a received settlement
   (S8) printed `(dispatch status 'sent')`. Only the parenthesis goes, so every caller and its meaning stay the same.
   Red first (`01c-red-words.txt`). P-86's own retirement sentence had the same pattern. At the coordinating session's
   ruling it now says "Sequence NNNN is on file with the agency[, which acknowledged it], so it cannot be retired."
   (`filed-sequence-baseline.ts`; red first, `01e-red-p86-sentence.txt`, on `sequence-retirement.pglite.test.ts`).
7. **The hand-kept `EctdSequence`** (`shared/types/database.d.ts`) does not name the transmit claim's two columns,
   though `getSequence` returns them (it selects every column of `ectdSequences`). The typecheck gate found it. A
   local `ClaimedSequence` type in `submission-service.ts` names them; the shared file is not changed.
8. **§10.3 A.2's size sentence** says "Sequence NNNN cannot be sent as it is: …", quoting `launchSequenceSizeRefusal`.
   The design's §4 wording ("larger than FDA's documented channel takes") is superseded by P-108 2(b): 1 GiB is never
   called FDA's limit.
9. **The held send's read built its lock into the SQL text.** `readHeldSend` appended `FOR UPDATE` with
   `${opts.lock ? ' FOR UPDATE' : ''}`. That is a constant, not a value, but `ci:sql-interpolation` counts any expression
   in SQL text, and the pre-push hook refused the first push on it. It is now two literal statements that differ only
   by `FOR UPDATE` (checked), with no baseline raised. Red, then green, and the nine suites again at 140 of 140:
   `08-sql-interpolation.txt`. It is its own commit after C1 and C2, because they were already merged when the hook
   found it.

## Proof

- **Red** (`01-red.txt`), before any server code: 39 failing (26 in the main file, 9 at the route, 4 receipt cases);
  the guards that must hold either way pass. **A.2** (`01b-red-a2.txt`): its two cases fail on the missing sentence.
  §10.4's two further cases already pass, because they pin behaviour that exists.

- **Mutations** (`03-mutations/`, driver `p92-mutations.py` beside them): each mutation is applied alone, its own case
  is run, and the file is restored, checked by SHA-256. Every one goes red on its own case:

  | Mutation | Red on |
  |---|---|
  | M01 a settlement does not spend S | T1 and T3 |
  | M02 to M06 drop E1, E2's two-row refusal, E3, E4 or E5 | each rule's own case |
  | M07 "received" allowed for a send that never left (E5b) | E9's "received is refused", and E5b's never-left arm (see departure 5) |
  | M08 "received" allowed after FDA's 4xx (E5b) | E5b |
  | M09 to M11 E6 accepts another project's document, one older than the send, or one that settled another send | each E6 case |
  | M12 E7 accepts any kind for any outcome | E7 |
  | M13 the creator is not told before signing; M14 any meaning signs | the two E8 cases |
  | M15 the signed statement is not compared; M17 another attempt's signature is accepted | the two T5 cases |
  | M16 the signed evidence is not compared, so a proof that does not fit the row's transport settles it | both "never takes" cases |
  | M18 the settlement does not spend its own signature | T9 |
  | M19, M20 check 3 or check 4 keeps a released send | both 2(a) retirement cases |
  | M21 check 4's exclusion without COALESCE | P-86's legacy case in `sequence-retirement.pglite.test.ts` |
  | M22 a contradicting receipt is refused without being kept; M23 a repeat is written again | T7, the release case |
  | M24 an agreeing refusal is treated as a contradiction | T7, "agrees with it" |
  | M25 the resend hold never says anything | T7, "holds the resend" |
  | M26 readiness drops the hold; M27 the claim drops it | the two new transmit cases |
  | M28 the route sends the step to `precheckGovernedStep`; M29 the door takes any outcome | the route cases |
  | M30 A.2's size sentence dropped | both A.2 cases |
  | M31 E9 ignores an AS2 identity; M32 E9′ ignores a gateway message id | the two "not proven never sent" cases |
  | M33 a release writes `rolled_back` | T3 |
  | M34 an Ack3 records the send as `ack2_received` | T2 |
  | M35 an AnA source names the act | the AnA scan |

  Not mutated, with the reason: the act's `setTenantContextTx` (PGlite enforces no RLS; C2's walk runs with
  `RLS_ENFORCE=on`); `markHeldSendSettled`'s set-once guard and the proof rule's own status check (each sits behind
  an earlier refusal no request can pass, so no test can reach it alone).
- **Green** (`02-green.txt`), on the final C1 code: the nine suites the act and its neighbours live in, 140 of 140.
- **The broad server suites** (`04-broad.txt`): `submission-service`, `submission-gateways`, `ectd`, `mcp`,
  `shared/navigation`, the submissions routes and every `ana-cannot` pin, 270 files, 3,318 tests, all pass (8
  skipped, as on trunk). The first run, before departures 2 and 3 were fixed, is kept beside it: 41 failures in 5
  files, all from those two defects.
- **Typecheck** (`05-typecheck.txt`): the pre-push gate (`typecheck-no-regression.mjs --incremental`, 12 GB), 0
  errors. Its first run found the `EctdSequence` type gap; the record is in "Departures".
- **ESLint** (`06-lint.txt`): every changed file at or under trunk's count.

## Owed, and named (not done here)

- **C2:** the held send told in the Dispatch tab (one quiet line), and its door: the precheck's statement,
  Responsibility only, a Vault picker for FDA's documents, and the platform-proof ground as the server's sentence. The
  line on Gateway transmittals. The walk in the running app. Check 2b's sentence then adds "or settle it from the
  Dispatch tab" (A.5). C1 and C2 are pushed together.
- **C3:** the re-open act (P-108 1(c)). Until it lands, §3.3's sentences stand.
- **C4:** a failed Ack3 after an Ack2 as a technical rejection (P-108 1(a)). Until it lands, the Ack2 statement says
  "No Ack3 for this send is on the platform. If one arrives and does not accept sequence NNNN, it is recorded as a
  technical rejection."
- **The coordinating session's C4 repair:** H3's 4xx arm with a pinned peer. It is F1's, not P-92's.
- **Design §7:** each item stands as written there, as amended by §10.3 C.13.
- **The shared `EctdSequence` type** (`shared/types/database.d.ts`), owed to its holder: it should name the transmit
  claim's two columns (`transmitSignatureActionId`, `transmitAttemptId`), which `getSequence` already returns. Until
  then `submission-service.ts` names them in a local `ClaimedSequence` (departure 7), at the coordinating session's
  ruling of 2026-11-09.

## C2: the door, in the Dispatch tab, and the record on both lists (`06-c2/`, `07-screen/`)

### What already exists (RULE 3)

- **Where the held send is told.** `TransmitPanel` (`SubmissionSeqWorkspaces.tsx`) reads
  `governed-precheck { step: 'transmit' }`. For a held send it says "Transmit is not available: …" with the
  server's `resendRefusal` sentence, which until C1 named the stored status.
- **The template for a door beside the one verdict.** P-86 C3's `RetireSequence`: a closed `.pj-more` disclosure that
  asks the server on every open and keeps no answer across a close. Its signing branch in `SubmissionCenter.tsx`
  (`retirementSigning`, `runRetire`) offers Responsibility only, signs the server's statement word for word, and puts
  no record key on the target line.
- **The one signing dialog** (`EsignModal`, through `requestGoverned` and `runGoverned`). It takes
  `renderMeaningDetails` and `signedRows`.
- **The Vault picker** (`VaultVersionPicker`, `VaultLibraryResults.tsx`). It searches one project's Vault and returns
  the chosen version's id, title, version and hash. It is used by `CommitmentFulfilment.tsx` and
  `OfficialEstarAttachments.tsx`.
- **The two lists.** The Dispatch tab's `DossierTransmissions`, and Gateway transmittals' read-only log with its
  `technicalRejectionNote` under the status. Both read a transmittal's `metadata`.
- **The shared gateway words**, `client/src/concept2cure/v2/gatewayLabels.ts`, which both lists already import.
- **FiledElsewhereBaseline.tsx**: "Declare sequences filed before this platform" was a bare `sc-btn`.
- **Searches** (`git grep` on the client, and the deletion search of C1 above): no held-send or settlement control,
  no Ack2 or Ack3 control, and no client caller of `/held-send/settle` existed in any form.

### The change

- **The door** (`HeldSendSettlement`, with `HeldSendWays`, `HeldSendWay`, `HeldSendChoice` and `HeldSendJudged`, all in
  `SubmissionSeqWorkspaces.tsx`):
  - It appears only while the send is held (`dispatchStatus === 'transmitting'`), directly under the held line, as
    `<details class="pj-more">` "Settle the held send…".
  - Each open asks `governed-precheck { step: 'held-send-settlement' }`.
  - **Offered:** "Sequence NNNN's send of DATE is held: the platform holds no verified answer from FDA to it."
    Gateway transmittals' "Record agency MDN" is named only when an MDN could come (`receiptUpload`). Then one quiet
    button per way, each with what it does:
    - "Record as received", on FDA's Ack2 or Ack3;
    - "Release as not received", on FDA's written confirmation or, where the record proves nothing left, on the
      platform's own record.
  - A way the server refuses shows the server's sentence in its place. A blocked send (FDA's answer already kept, or
    a send still in progress) shows only the server's sentence. The sequence's creator is told why they cannot sign
    it, and offered no way.
  - **A way chosen.** FDA's document comes from this project's Vault, through the existing picker. To record it
    received, the signer also says which acknowledgement it is (Ack2 or Ack3). A release on the platform's own proof
    asks for no document.
  - The server's answer for that choice is shown as "By signing, you would state:" and its statement, quoted. The
    sign button hands the choice to Submission Center.
- **The signature** (`SubmissionCenter.tsx`):
  - The 'held-send-settlement' branch asks again before the dialog opens.
  - The dialog offers Responsibility only.
  - The target line is "FDA (US) · settles the held send of DATE; nothing is sent to FDA", with no record key.
  - The statement is quoted word for word. The signed rows name the FDA document and the statement.
  - Before signing, it asks again. A statement that changed since the dialog opened is not signed.
  - The sign payload is §3.1's: the outcome, the transmittal and attempt, the evidence and the statement, as the
    server answered them.
  - The act posts `{ signatureActionId, outcome }`. Only an answer that says this sequence's held send was settled,
    the way it was signed, is a success.
  - The notice names the ground and the signer, never a signature id.
  - `requestGoverned` and `precheckAnswer` now take one request object in place of four positional extras. The
    sixth would have broken the `max-params` ratchet.
- **The lists.** `heldSendSettlementWords` (`gatewayLabels.ts`) says how a send was settled, and FDA's verified answer
  kept against it. The Dispatch tab's transmissions add it after the row. Gateway transmittals adds it as a note
  under the status, beside the technical rejection's; still no control.
- **The declaration control** (`FiledElsewhereBaseline.tsx`), at the coordinating session's rulings of 2026-11-09:
  - "Declare sequences filed before this platform" is `btn ghost`;
  - in the open form, "Sign declaration" is D0's `btn primary` (the form's one primary while it is open), replacing
    the legacy `sp-primary`;
  - Cancel is `btn ghost`.

  Red first on each class (`06-c2/red-declaration-form.txt` for the open form).
- **The refusal line says a record key in words** (`blockerForDisplay`). The walk found it (below).

### Departures, each found by the tests, the gates or the walk

1. **No "no signing authority" state (design S4b).** The Dispatch tab has no read of signing authority; only Gateway
   transmittals' list carries `meta.signing`. The sign route refuses without authority, and the dialog shows its
   sentence inline (S7).
2. **The opening line says the send "is held"**, not "was sent to FDA": for a send the platform's own record proves
   never left, "was sent" would be false.
3. **The release on the platform's own proof asks for no document** and shows no picker (§10.3 D). When the proof
   holds, it is the ground offered.
4. **The door's text inherits the door's type.** The first walk showed the lines under each button, the chosen
   document and the statement at body size: `.pj-more > :not(summary)` styles only direct children. They are now
   `div`s inside the door's blocks. The two acknowledgement radios use the existing `company-check` row
   (`company-documents.css`, loaded with the Dispatch tab); at first they ran together on one line.
5. **The transmit refusal line showed a record key.** After the release, the panel's refusal is the dispatch gate's,
   which named `ectd-sequence:31`. The line now passes it through `blockerForDisplay`, as every blocker on the page
   does (D7-A2 step 10). Red first (`06-c2/red-record-key.txt`).
6. **The Gateway transmittals note uses `--text-300`.** It first used the technical rejection note's
   `var(--muted, inherit)`. `--muted` is not defined in v2, and the note was near-invisible.
7. **The signing dialog shows the action only once signed.** `EsignModal` prints `action` in the signed manifest, so
   the red test that looked for it before signing was corrected to look after.

### Proof

- **Red** (`06-c2/red.txt`): 31 failing on the missing door, notes and class; the guards that must hold (no door
  unless held, the resend hold through the readiness line) pass.
- **Green** (`06-c2/green.txt`): the four C2 test files, 58 of 58.
- **The client suites** (`06-c2/client-broad.txt`): every client test file that imports a file C2 changed, 53 files,
  584 tests, all pass.
- **Mutations** (`06-c2/mutations/`, driver beside them): 11, each red on its own case.
  - The design's six:
    - the client signs its own copy of the statement;
    - approval is offered;
    - a record key is on the target line;
    - any 200 counts as settled;
    - the statement is not asked again before signing;
    - the door shows for any dispatch status.
  - And five more:
    - the refusal line keeps a record key;
    - "Declare…" reads as text;
    - FDA's contradicting answer is not said;
    - the platform's proof asks for a document;
    - the creator is offered a way.
- **Gates** (`06-c2/gates.txt`): ana-surface-context, css-selector-shadowing, phantom-tokens, shell-css-collisions,
  design-system, empty-state-honesty, internals-in-copy, one-product, surface-text-ramp, token-cascade and
  undefined-css-classes, all OK.
- **Typecheck** (`06-c2/typecheck.txt`): the pre-push gate on C1 and C2 together, 0 errors.
- **ESLint** (`06-c2/lint.txt`): every changed file at or under trunk's count.
- **The running app** (`07-screen/`). This was a throwaway local database (`seed.sql`: two held production sends,
  shaped as the gateway leaves them), never FDA.
  - The server connected as the non-superuser `app_service` with `RLS_ENFORCE=on`, so row-level security was
    enforced. The earlier walks ran as the superuser, which bypasses it.
  - The project's author added a clearly labelled stand-in for FDA's Ack2 through the Vault's own upload
    (`POST /api/vault/ingest`, 201).
  - An independent signer signed both settlements:
    - **0001** released on the platform's own proof;
    - **0002** recorded as received on the Ack2 stand-in.
  - Screens at 1440 and 390, light and dark: S0, S2 (both sends), S2a, S4 (the creator), S6, S8 and S9 (both lists),
    and the declaration control closed and open (`declare-*`, the classes read in `probes-declare.json`).
    `probes-*.json` measures each: every button hit at its centre, no record key, no signature id, no horizontal
    overflow, no script error.
  - What the two acts left (`db-after.txt`):
    - 0001 is `pending`, with S and A cleared, and its transmittal is `rejected` on `platform-proof`;
    - 0002 is `sent`, with A kept, and its transmittal is `ack2_received`, citing the Vault document;
    - each spent S (`ECTD_TRANSMITTED`, source `held-send-settlement`);
    - each recorded `ECTD_HELD_SEND_SETTLED` with the meaning responsibility and the signer's reason.

### Seen, not changed here (reported to the coordinating session)

- **Gateway transmittals:** four other uses of `var(--muted, inherit)` render near-invisible, among them the technical
  rejection note and the row's "sequence NNNN". Its Actions column also runs past the card at 1440.
  - *Closed for the technical rejection note* by P-92 C4's commit ("F1: FDA's failed Ack3 is recorded on the sequence
    by a named person's signed act", `10-technical-rejection/`), at the coordinating session's ruling of 2026-11-09:
    the note is how C4's record shows, now in `--text-300` and in words. The other three uses stand as seen.
- **The Dispatch tab's transmit button** ("Send sequence NNNN to the agency's test environment") runs past its
  container at 390.
- **Raw statuses on screen:** the transmissions list and Gateway transmittals print the stored status as a chip
  (`In_transit`, `Ack2_received`). P-86's retirement sentence, seen with them, is now in words (departure 6).
- **FiledElsewhereBaseline's open form:** the agency acknowledgment is typed as a Vault id, not chosen in the Vault.
