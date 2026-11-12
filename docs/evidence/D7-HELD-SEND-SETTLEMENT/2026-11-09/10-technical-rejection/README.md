# P-92 C4: FDA's failed Ack3 is recorded on the sequence by a named person's signed act

P-108 1(a) (founder, 2026-11-08): once an Ack3 has arrived, "received" needs the Ack3 to accept, and a failed Ack3 after
an Ack2 is recorded as a technical rejection, completing `filed-sequence-rejection.ts` for the sequence spine, under F1.
The design is §10.5 C and D of `docs/evidence/RIM/2026-11-08-designs/p92-settle-held-fda-send.design.md` (on trunk at
`621a046eb4`), with the coordinating session's rulings of 2026-11-09:
1. the package-spine technical rejection stays: it serves only package transmittals written before 2026-10-17;
2. C3's contradicted-"received" arm applies FDA's negative MDN as the receipt path would, so "technical rejection" means
   FDA's Ack3 only, and C3 does not depend on C4;
3. FDA's text: C4 lands with §10.5 D's fail-closed number rule, the statement naming FDA's notice as deciding the
   number; the number rule stays open until the specification is quoted with version and section (owed, below);
4. §10.5 B's repair went first, alone (`09-retire-contradicted/`).

## What already exists (RULE 3)

§10.5 A records it by path at `f71ca16bb4`. In short:
- the sequence's `rejected` dispatch status (`filed-dispatch.ts`, `toDispatchStatus`), written today only by the receipt
  path for a verified negative MDN; it can be sent again under its number, and P-86 keeps it;
- no Ack2 or Ack3 is parsed or stored; C1's settlement is the one writer of `ack2_received`/`ack3_received` for FDA;
- `filed-sequence-rejection.ts`: the package spine's signed rejection, reached from Gateway transmittals for a row with a
  `package_id`; nothing on the sequence spine reads it;
- C1's signing chain (Gate 1, the payload refusal, the word-for-word comparison under the transmittal's and the
  sequence's locks, `voidingSignatureOnRefusal`, `applySequenceChangeWithAudit`), and C2's door pattern (a closed
  `.pj-more` disclosure, the Vault picker, Submission Center's one signature).

C4 completes `filed-sequence-rejection.ts` and reuses all of these; it adds no table, mount or route file.

## The change

**Server.**
- `filed-sequence-rejection.ts`: the sequence spine's rules beside the package spine's, sharing its status sets:
  `readSequenceRejectionFacts` (the one bound transmittal through C1's `readHeldSend`, the later sequence, FDA's kept
  refusal), `sequenceRejectionBlocker` (R1 to R4, R7), `sequenceRejectionStatement`, `rejectedTransmittalStatus` and
  `markSequenceTechnicalRejection` (set once). The header says the package half serves only rows before 2026-10-17
  (ruling 1).
- `submission-service.ts`: intent `technical-rejection` (responsibility only), `precheckTechnicalRejection`,
  `recordTechnicalRejection` (voided on refusal), R5's Ack3 judgment (this project's Vault, read `FOR SHARE`, not older
  than the send, not another settlement's or rejection's evidence), and the chained `ECTD_TECHNICAL_REJECTION_RECORDED`
  row, which spends the signature. The sequence goes `sent` to `rejected`; the transmittal to `validation_failed` with
  `metadata.technicalRejection`.
- `server/routes/submissions.ts`: `POST /sequences/:seqId/technical-rejection`, and the precheck step answered at the
  route.
- `filed-sequence-baseline.ts`: P-86's sentence for a sequence the agency rejected, in words (§10.5 D); the rule is
  unchanged (check 3 already keeps it).

**Client.**
- `SubmissionSeqWorkspaces.tsx`: where a send recorded as received by FDA is told, a closed door "Record FDA's technical
  rejection…": the send, FDA's Ack3 chosen in this project's Vault, the server's statement, and a quiet sign button;
  the creator is told why; a refusal is said in the server's words. The Dispatch row says the rejection in words.
- `SubmissionCenter.tsx`: the one signature, Responsibility only, the statement word for word, asked again before the
  dialog and before signing; a target line with no record key; FDA's Ack3 in the signed rows; the act's answer taken as
  a success only when it names this sequence.
- `gatewayLabels.ts`: `technicalRejectionWords`, one source for both lists.
- `GatewayTransmittals.tsx`: the package form's text says it serves only package transmittals written before 2026-10-17
  and names the Dispatch tab for every send since (ruling 1).

## Departures, each found by the tests, the gates or a ruling

1. **Gateway transmittals' rejection note.** The clearance for `GatewayTransmittals.tsx` was the package form's text
   only. But a sequence's record is written in the package spine's shape, so it shows through the existing note, which
   used the undefined `var(--muted, inherit)` and was near-invisible (C2's README listed it as seen). The note now uses
   `--text-300` and says a sequence's rejection in words. Kept at the coordinating session's ruling of 2026-11-09; C2's
   README closes its "seen" item for this note by naming this commit.
2. **The route test's caller.** The route passes `ipAddress` with the organization and user, as every route here does;
   the test matches the caller with `objectContaining`.
3. **The signing dialog names the act once signed,** as C2's settlement does; the client test reads it after signing.
4. **The Gateway test's form mock** rendered only the title; it now renders the form's text too, so the package form's
   new sentence is read. Its red was a missing element, not the old text; mutation C4M23 shows the case red on the old
   text.
5. **The under-lock case did not test the lock** (found by mutation C4M13, which survived). It changed the sequence
   before the act's first read, so the first read refused it. It now changes the sequence after the act's first read and
   before the read under the lock, through a hook on `readSequenceRejectionFacts`, as P-86's T7 does; C4M13 is red. The
   first run is kept as `mutation-C4M13-not-rejudged-under-lock.first-case.txt`.
6. **The record also wrote the transmission's error message** (found by the walk). Both lists then said the rejection
   twice: "Technical rejection recorded: FDA's center did not accept sequence 0002." from the error column, and the
   record's words. The sequence spine now leaves the gateway's error columns as they were, and the lists say it once.
   Red first (`red-error-message.txt`, T1 now asserts the error message is untouched); mutation C4M25. Sequence 0002 keeps
   the doubled text the first walk wrote; the second walk, on 0003, shows the fix.

## Proof

- **Red first:** `red.txt` (the act, 26 of 26 before any C4 code), `red-route.txt`, `red-retirement-sentence.txt`,
  `red-client.txt` (11 red; the five "no door" guards green), `red-lists.txt`.
- **Green** (`green.txt`): 11 files, 211 of 211, on the final code: the act, its route, AnA's no-door pin, P-86's
  sentence, the package spine's own suite, C1's settlement, the receipt path, and the four client files.
- **Broad runs:** every submission-service suite, the submissions routes, the package spine and the receipt path
  (`broad-server.txt`, 798 passed, 4 skipped); every client test file importing a C4-changed client file
  (`broad-client.txt`, 53 files, 595 of 595).
- **Mutations** (`mutations/`, driver `p92-c4-mutations.py` with `cmut2.py`): 25, each applied alone and restored by
  SHA-256, each red on its own case:

  | Mutation | Red on |
  |---|---|
  | C4M01 R1 any status | R1-R3: acknowledged, already rejected, not received |
  | C4M02 to C4M05 drop R2 (unbound claim), R3 (acceptance), R4 (later sequence), R7 (FDA's refusal pending) | each rule's own case |
  | C4M06 to C4M08 R5 takes another project's Ack3, one older than the send, one already used | each R5 case |
  | C4M09 changed bytes not said as such | the bytes-changed case |
  | C4M10 the statement not compared | the one-character case |
  | C4M11 the evidence kind not checked; C4M12 any meaning | Gate 1's two cases |
  | C4M13 not judged again under the lock | the under-lock case (after departure 5) |
  | C4M14 the signature not spent | T1 |
  | C4M15 the precheck sent to the generic step | the route's precheck case |
  | C4M16 P-86's rejected sentence dropped | P-86's case |
  | C4M17 the door in any region; C4M18 the creator offered a document | the client's no-door (EMA) and creator cases |
  | C4M19 the statement not asked again; C4M20 any 200 a success; C4M21 the payload without the Ack3 | the client's D2 cases |
  | C4M22 the Gateway note unreadable; C4M23 the package form unscoped | the two Gateway cases |
  | C4M24 the row's words dropped | the Dispatch row case |
  | C4M25 the error message written again | T1 (after departure 6) |

- **Gates** (`gates.txt`): the eleven design gates exit 0. **Typecheck** (`typecheck.txt`): 0, as the baseline.
  **ESLint:** no changed file gained a warning, and the new files (three test files, the client test and the walk
  script) have none.
- **In the running app** (`screen/`), on the walk's throwaway database as the non-superuser role with RLS enforced,
  never against FDA. Signer Dana (17); the sequences' creator Ana (16).
  - First walk, sequence 0002 (recorded as received on C2's labelled Ack2 stand-in): a labelled Ack3 stand-in uploaded
    through the Vault; the door closed, opened, the stand-in chosen and the server's statement, the dialog unsigned
    (Responsibility only) and the creator told, at 1440 and 390, light and dark; signed once; then the Dispatch row,
    P-86's refusal in words and Gateway transmittals' note, at every size and theme. It found departure 6.
  - Second walk, sequence 0003 (`seed-0003.sql`: a send recorded as received on FDA's verified MDN), after the fix: a
    new stand-in, signed once, and the same after-screens; the row says the rejection once.
  - Every probe: no record key on screen, no signature id in the page, no horizontal overflow, no page error. The
    database after each act: the sequence `rejected`; the transmittal `validation_failed` with its record; the chained
    `ECTD_TECHNICAL_REJECTION_RECORDED` row with the meaning responsibility and the signer's reason.
  - Seen, not changed here: the transmit button at 390 and the raw status chips (C2's README already lists both).

## Owed, and named

- **FDA's text on the rejected sequence's number** (§10.5 D): until the eCTD validation specification is quoted with
  version and section, the sequence can be sent again under its own number (today's rule for `rejected`), P-86 keeps
  refusing to retire it, and the statement names FDA's notice as deciding. `www.fda.gov` was outside this session's
  network policy.
- **C3**, the re-open act, is next and independent of C4 (ruling 2).
