# P-92 C3: a settlement FDA's verified answer contradicts is re-opened on that answer, by a named person's signed act

P-108 1(c) (founder, 2026-11-08): "If FDA's verified answer later contradicts a signed settlement, FDA's answer wins,
through a second signed act that re-opens it; both records are kept, and resends are refused meanwhile." C1 kept that
answer and refused the resends; C3 is the second signed act. The design is §10.5 E (i) of
`docs/evidence/RIM/2026-11-08-designs/p92-settle-held-fda-send.design.md` (on trunk at `621a046eb4`), with the
coordinating session's ruling 2 of 2026-11-09: the contradicted-"received" arm applies FDA's negative MDN as the
receipt path would, so "technical rejection" stays FDA's Ack3 only (C4), and C3 needs nothing from C4.

## What already exists (RULE 3)

- **FDA's contradicting answer, kept** (C1, `fda-esg-receipts.ts`): `keepContradictingReceipt` appends a verified
  entry with `contradicts` to `as2ReceiptHistory` and leaves the status, `as2Receipt`, `mdn_raw` and the settlement
  untouched; `contradictionRefusal` says it in words; `releasedSendReceivedRefusal` refuses a resend of a release FDA
  received.
- **The answer told** (C2, `gatewayLabels.ts` `heldSendSettlementWords`): both transmission lists say the settlement
  and FDA's answer against it.
- **The release kept from retirement** (§10.5 B, `6e44f18e47`): P-86's checks keep a release that FDA's verified
  receipt contradicts.
- **The receipt path** (`ingestFdaAs2Receipt`, `dispatchBindingOf`): how a verified MDN is written on the transmittal
  (status, `as2Receipt`, `mdn_raw`, `ack_received_at`) and on the sequence (`toDispatchStatus`), and the send's
  binding (sequence, attempt, signature).
- **The signing chain** (C1, `submission-service.ts`): Gate 1 and its payload refusal, the word-for-word comparison
  under the transmittal's and the sequence's locks, `voidingSignatureOnRefusal`, `applySequenceChangeWithAudit`, the
  spent list (`signatureSpentBy`); the door pattern (C2, C4): a closed `.pj-more` disclosure, the server's statement,
  Submission Center's one signature (`STATED_SIGNING`).

Nothing re-opened a settlement: no intent, act, route or door. C3 completes `fda-esg-receipts.ts` and reuses all of
the above; it adds no table, mount or route file.

## The change

**Server.**
- `fda-esg-receipts.ts`: `readReopenFacts` (the sequence's settled transmittal carrying FDA's verified answer against
  it, by the binding, locked under the act; two such rows are "could not be checked"), `reopenBlocker` (nothing to
  re-open; already re-opened; the sequence no longer where the settlement left it, which is for a person and FDA,
  with the runbook's escalation), `reopenStatement` (by arm) and `markHeldSendReopened` (FDA's answer applied to the
  transmittal as the receipt path writes it, and `heldSendSettlement.reopenedBy`, set once).
- `submission-service.ts`: intent `held-send-reopen` (responsibility only, an independent signer),
  `precheckHeldSendReopen`, `recordHeldSendReopen` (voided on refusal), Gate 1's payload check (the settlement's
  signature and FDA's answer's SHA-256), the chained `ECTD_HELD_SEND_REOPENED` row, which spends the signature.
  - Arm (a), a release FDA's signed receipt contradicts: the sequence `pending` to `sent`, its claim restored from
    the send's binding (`transmit_signature_action_id`, `transmit_attempt_id`); the transmittal `received`.
  - Arm (b), "received" FDA's signed answer refuses: the sequence to `rejected` (it can be sent again under a new
    signature); the transmittal `rejected`.
  - Each arm's UPDATE is guarded by where the settlement left the sequence, and everything is judged again under the
    locks.
- `server/routes/submissions.ts`: `POST /sequences/:seqId/held-send/reopen`, and the precheck step answered at the
  route by its own function.

**Client.**
- `SubmissionSeqWorkspaces.tsx`: under the Dispatch tab's transmissions, where a settlement FDA's verified answer
  contradicts is told and not yet re-opened, a closed door "Re-open the settlement on FDA's answer…": the server's
  statement and a quiet sign button; the creator is told why not; a refusal is said in the server's words.
- `SubmissionCenter.tsx`: the one signature, Responsibility only, the statement word for word and asked again before
  signing; a target line with no record key; the act's answer taken as a success only when it names this sequence;
  the notice says each arm in words.
- `gatewayLabels.ts`: `awaitsReopen` (the door's one rule), and "re-opened on FDA's answer, by signature, DAY" after
  FDA's answer, one source for both lists.

## Departures, each found by the tests, the gates, the mutations or the walk

1. **The spent signature was not tested through its one observable effect** (found by mutation C3M08, which
   survived). After a re-open, Gate 1's payload check refuses a reuse first (the settlement is no longer open), so the
   spent list is never reached through the act. It is read by `voidRefusedStepSignature`, which never voids a spent
   signature. Without the re-open in the list, a later refused reuse would void a signature that had already re-opened
   a settlement. The first case now also asserts the signature is not voided after the refused reuse; C3M08 is red.
   The first run is kept as `mutation-C3M08-signature-not-spent.first-case.txt`.
2. **The re-opened row's words were tested after their code.** The case "a settlement re-opened on FDA's answer says
   so on its row" (`dossierTransmissions.test.tsx`) was written with the implementation, so it has no red-first run;
   mutation C3M19 shows it red with the words dropped. The C4 row case moved with it into its own describe, unchanged,
   for the function-length limit.
3. **The act suite's audit-row check** is one `toMatchObject` on the array (which also matches its length) instead of
   a length check and an element check, to stay inside the function-length limit after departure 1. Same assertion.
4. **Submission Center's doc comments**: the C3 insertion had separated `STATED_SIGNING`'s comment from the map, and
   the statement re-check's comment named two of the three kinds. Both corrected; comment-only.
5. **The sign button was cut off at 390** (found by the walk). "Sign: re-open sequence 0001's settlement on FDA's
   answer" is wider than the column at 390, and the tab's container clips it (the page itself does not scroll, so the
   overflow probe read clean). The label is now "Sign: re-open sequence 0001's settlement", the length of C4's; the
   door's summary already says "on FDA's answer". The client test, the walk script and the client mutations (C3M13
   to C3M18) were run again on the new label.
6. **Arm (b) did not keep FDA's refusal in `mdn_raw`** (found by the walk, in the database after the act). The receipt
   path writes the MDN body to `mdn_raw` for a receipt and a refusal alike; `markHeldSendReopened` decoded it only for
   a receipt. §10.5 E (i) says the re-open writes `as2Receipt` and `mdn_raw` from the kept entry, as the receipt path
   would. Red first (`red-mdn-raw.txt`: the arm (b) case now asserts `mdn_raw` and `as2Receipt`), then the fix;
   mutation C3M20 puts the old condition back and is red. Sequence 0004 keeps the empty `mdn_raw` the first walk
   wrote; the second walk, on 0005 (`seed-0005.sql`), shows the fix. Every server mutation was run again on the
   fixed code.

## Proof

- **Red first:** `red.txt` (the act, 12 of 12 before any C3 code, at `b149f7e267`), `red-route.txt` (4 of 4),
  `red-client.txt` (6 red; the three "no door" guards green; the sign button then carried departure 5's longer
  label), `red-mdn-raw.txt` (departure 6).
- **Green** (`green.txt`): 12 files, 205 of 205, on the final code: the act, its route, AnA's no-door pin, C1's
  settlement, the receipt path, C4's act, P-86's retirement, and the five client files.
- **Broad runs:** every submission-service suite, the submissions routes, the package spine, the receipt path and
  AnA's no-door pins (`broad-server.txt`, 817 passed, 4 skipped, on the final server code); every client test file
  importing a C3-changed client file, with C4's broad set (`broad-client.txt`, 54 files, 605 of 605, on the final
  client code).
- **Mutations** (`mutations/`, driver `p92-c3-mutations.py` with `cmut2.py`; the re-runs on the final code by
  `p92-c3-server-rerun.py`, C3M01 to C3M11 and C3M20 after departure 6, and `p92-c3-client-rerun.py`, C3M13 to C3M18
  after departure 5): 20, each applied alone and restored by SHA-256, each red on its own case on the final code:

  | Mutation | Red on |
  |---|---|
  | C3M01 a release re-opened whatever the sequence's state | the sent-again case and the under-lock case |
  | C3M02 a settlement re-opened twice | "nothing to re-open" (already re-opened) |
  | C3M03 the statement not compared | the one-character case |
  | C3M04 any settlement; C3M05 any FDA answer; C3M06 any meaning | Gate 1's three cases |
  | C3M07 not judged again under the lock | the under-lock case |
  | C3M08 the signature not spent | the first case (after departure 1) |
  | C3M09 the claim not restored | the first case |
  | C3M10 FDA's receipt not applied | the first case |
  | C3M11 the settlement not marked re-opened | the "received" FDA refused case |
  | C3M12 the precheck sent to the generic step | the route's precheck case |
  | C3M13 the door after a re-open; C3M14 the door for another sequence | the client's no-door cases |
  | C3M15 the creator offered a sign button | the creator case |
  | C3M16 the statement not asked again; C3M17 any 200 a success; C3M18 the payload without what it names | the client's R2 cases |
  | C3M19 the re-opened words dropped | the row case (departure 2) |
  | C3M20 FDA's refusal not kept in `mdn_raw` | the "received" FDA refused case (departure 6) |

- **Gates** (`gates.txt`): the eleven design gates exit 0. **Typecheck** (`typecheck.txt`): 0, as the baseline, on
  the final code. **ESLint:** no changed file gained a warning, and the new files (four test files and the walk
  script) have none.
- **In the running app** (`screen/`), on the walk's throwaway database as the non-superuser role with RLS enforced,
  never against FDA; every answer of FDA's is a stand-in whose body says it is not an FDA document. Signer Dana (17);
  the sequences' creator Ana (16).
  - Seeds: `seed.sql` (0001, released as not received in C2's walk, with a positive MDN stand-in kept against it;
    0004, recorded as received on an Ack2, with a negative MDN stand-in kept against it), and `seed-0005.sql` for
    the second walk.
  - First walk (`c3-*`): 0001's door closed, opened (the server's statement and the quiet sign button), the dialog
    unsigned (Responsibility only, the statement, a target line with no record key) and the creator told, at 1440
    and 390, light and dark; then 0001 and 0004 re-opened once each by one signature; then both rows and Gateway
    transmittals at every size and theme. It found departures 5 (the "before" screens were taken again on the new
    label) and 6.
  - Second walk (`c3b-*`), on the fixed code: 0005 re-opened once, then the rows and Gateway transmittals at every
    size and theme.
  - Every probe: no record key on screen, no signature id in the page, no horizontal overflow of the page, no page
    error; after each act, no door left on the row.
  - The database (`db-after-act.txt`, `db-after-second-walk.txt`): 0001 `sent` with its claim restored, its
    transmittal `received` with FDA's receipt, `mdn_raw` and the acknowledgement time; 0004 and 0005 `rejected`,
    their transmittals `rejected` with FDA's answer (0005's `mdn_raw` kept, 0004's empty from before the fix); each
    settlement kept with `reopenedBy`; one chained `ECTD_HELD_SEND_REOPENED` row per act, with the meaning
    responsibility and the signer's reason.
  - Seen, not changed here:
    - at 390, the transmissions grid's second column is clipped where a value is one long unbroken token (a
      gateway reference such as `<reply-0002@intermediary.example>`); the grid predates C3, and C4's screens show
      the same;
    - on 0001's row, the gateway's own report ("The AS2 message could not be prepared for this send; nothing was
      transmitted.") keeps its error tone above FDA's receipt and the re-opening. Both records are kept (P-108
      1(c)), and the gateway's error columns are left as they were, as C4 left them. Whether a list should mute that
      report once FDA's answer has been applied is for the UI pass;
    - the transmit button at 390 and the raw status chips (already listed in C4's README).

## Owed, and named

- **FDA's text on the rejected sequence's number** (§10.5 D) applies to arm (b) as to C4: the sequence can be sent
  again under its own number (today's rule for `rejected`), and P-86 keeps refusing to retire it, until the eCTD
  validation specification is quoted with version and section.
- **A walk against FDA**: none. Every answer of FDA's in the walk is a labelled stand-in on the walk's throwaway
  database.
- **The two "seen" items above** go to the UI pass on RIM and eCTD screens: the clipping is the shared spec grid's
  styling, not this door's, and muting the gateway's report once FDA's answer is applied is a decision for both lists,
  not for one act.
