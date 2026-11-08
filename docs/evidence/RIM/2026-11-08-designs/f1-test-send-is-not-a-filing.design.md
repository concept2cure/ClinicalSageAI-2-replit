# F1 repair: a send to the agency's test environment is not a filing

Package **F1**, row **D7**. Written 2026-11-01 against trunk `609ef94c7` from the re-plan mapper (`wf_ddd066d8-7a9`,
item "test-sends"). It replaces the older `designs/test-environment-send.design.md` (written at 73005b856). That
design's new endpoint, its new token and its move of `filed-dispatch.ts` are all dropped, under RULE 6.

It builds on F1 slice 1 ("what the agency holds is what was sent"), which lands first. After slice 1, the filed fold
reads, for each sequence whose `dispatch_status` is sent or acknowledged, the transmittal its `transmit_attempt_id`
binds. So a staging send that leaves the sequence 'sent' would be read as filed. This slice closes that.

## The defect

The Dispatch tab's TransmitPanel (`SubmissionSeqWorkspaces.tsx`) defaults to **staging** ("Staging (agency test)").
After a successful staging send:

- `toDispatchStatus` (`submission-service.ts` ~:2331) maps the gateway status to 'sent' or 'acknowledged'. It has no
  environment parameter. Its one caller (~:2947) writes that value under the claim CAS. The sequence is now **filed**
  to every reader: the filed fold, `filingOrderRefusal`, the commitment-evidence trigger, `documents.ts`,
  `EctdFiledState`, `CommitmentRow` and `VaultVersions`.
- `resendRefusal` (~:2321) then refuses the PRODUCTION send of that same sequence ("already transmitted … a correction
  is a new sequence"). D7's test send uses up the very sequence that Week 16 must file on production.
- The second writer of 'sent', `resolveReceiptSequence` (`fda-esg-receipts.ts` ~:105-132, line ~:108
  `next = status === 'received' ? 'sent' : 'rejected'`), ignores the environment it has just recorded. So a staging
  MDN files the sequence too.
- A post-wire failure on staging leaves the sequence 'transmitting' (~:2933-2941). Only an AS2 receipt upload clears
  it, and SFTP has no such path. That sequence can then never be filed.

## What already exists (by path)

- **The rule, on the package spine:** `server/services/submission-gateways/governed-transmit.ts:422-429`
  `recordTransmittedSequence`, sweep F14:
  `if (input.environment !== 'production') return notRecorded('test-environment', 'not-applicable')`. The runbook
  `docs/runbooks/ectd-transmit-path.md:140-145` says "Filed means transmitted to production". This slice reaches that
  rule onto the sequence spine. It is not new.
- **`server/services/submission-service/submission-service.ts`:**
  - `toDispatchStatus` (~:2331-2335);
  - `resendRefusal` (~:2321-2329), with callers ~:223, ~:2637, ~:2715, ~:2799;
  - `claimTransmitSlot` (~:2439-2487), whose CAS allow-list is NULL, 'pending' and 'rejected';
  - `releaseTransmitSlot` (~:2494-2500);
  - `transmitSequence` / `transmitDispatchedSequence` (~:2668-3000). Environment is validated as staging|production
    before anything is read, and passed to `gw.isConfigured`, `gw.transmit` and the ECTD_TRANSMITTED audit details;
  - the post-wire write (~:2947).
- **`server/services/submission-service/filed-dispatch.ts`:** `FILED_DISPATCH_STATUSES = ['sent','acknowledged']`,
  `isFiledDispatchStatus`. It is the one named filed rule and stays in its folder.
- **`server/services/submission-gateways/fda-esg-receipts.ts` `resolveReceiptSequence`:** the ECTD_TRANSMITTED row
  carries the binding's `environment`.
- **Every filed reader is an allow-list** of 'sent'/'acknowledged':
  - `prior-sequence-loader.ts`;
  - `filingOrderRefusal` (submission-service.ts ~:1496);
  - `commitment-fulfilment.ts:160,282,520`;
  - `routes/c2c/documents.ts:837,916-918`;
  - `migrations/20261019_commitment_fulfilment_evidence.sql:256`;
  - the client's `EctdFiledState.tsx`, `CommitmentRow.tsx:114-115` and `VaultVersions.tsx:460`;
  - CSR `csr-assembly-placement.ts:78,87` and `csr-placement-withdraw.ts:33`.

  A test send that leaves the sequence outside {'sent','acknowledged'} needs **no change in any of them**.
  `ectd_sequences.dispatch_status` is TEXT with no CHECK, so no migration is needed.
- **Client** (fetch first: 3cacf2e15 added `ShadowRunCoverage.tsx`, rendered in two lines in
  `SubmissionSeqWorkspaces.tsx`; keep it, zero capability loss):
  - `SubmissionSeqWorkspaces.tsx`: TransmitPanel (~:1942-2010), `transmitBlockedBy` (~:1758-1770),
    DossierTransmissions (~:1870-1930; rows end " (staging)");
  - `SubmissionCenter.tsx`: `notTransmittedSentence` and `transmittedSentence` (~:309-321), which print the raw
    environment;
  - `As2ReceiptUpload.tsx`.
- **Tests that pin the defect (flip them red first):**
  - `server/services/submission-service/__tests__/refused-step-voids-signature.pglite.test.ts:218-219`;
  - `server/services/submission-gateways/__tests__/fda-esg-receipts.pglite.test.ts:33,48`;
  - `server/services/submission-service/__tests__/transmit-refusals.test.ts:60-68`;
  - `tests/db/commitment-fulfilment-evidence.dbtest.ts:78`.
- **Docs:** `docs/work-orders/MR-10-ectd-conformance-and-transmission.md:314` step 8(iii) plans to drive test ACKs into
  `dispatch_status`. Amend it.
- **Not touched:** the filed-elsewhere baseline (88229a87d, `filed-sequence-baseline.ts`). It is a different meaning of
  "filed".

## The rule to build (a repair of shipped behaviour; no decision number: P-numbers are the founder's alone, per the coordinator 2026-11-01)

1. **A non-production send never files the sequence.** At the post-wire write, a staging result writes
   `dispatch_status = 'pending'`, and never 'sent', 'acknowledged' or 'rejected'. The test outcome is already recorded
   in two places: the transmittal (status, `metadata.environment`) and the ECTD_TRANSMITTED audit row (`environment`,
   gateway status). Keep both exactly. The audit row's details gain the agency's test result in words if they do not
   carry it. The spent signature still forces a fresh signature for the production send (P-23 unchanged).
2. **A test receipt never files the sequence.** In `resolveReceiptSequence`, when the binding's recorded environment is
   not production, the sequence moves from 'transmitting' to 'pending' on (signature, attempt), and never to 'sent' or
   'rejected'. The receipt itself is recorded on the transmittal as today.
3. **A test attempt never holds the sequence.** A post-wire failure on a staging attempt releases the claim through the
   existing `releaseTransmitSlot` path, not left 'transmitting'. Nothing a test environment holds is a filing. A later
   staging MDN for that released attempt is recorded on its transmittal and moves no sequence (the (signature, attempt)
   match fails). Test it. Production post-wire failures are unchanged: they stay 'transmitting' until a receipt
   settles them.
4. **`resendRefusal` and the claim CAS agree.** A sequence that went to staging (now 'pending') is sendable to
   production with a fresh signature. Add the missing case: staging send → new production signature → production send
   succeeds and files. Confirm the CAS allow-list and `resendRefusal` do not disagree on any token this slice writes.
5. **The words** (copy only; no class, markup structure or layout change; D7's layout waits for D0-2):
   - TransmitPanel's button names the environment: e.g. "Send 0001 to the agency's test environment" or "File 0001
     with the agency". Keep the existing e-signature wording if the panel already shows it.
   - After a test send, the panel and `transmittedSentence` say it plainly: "Sent to the agency's test environment on
     <date>. A test send is not a filing; 0001 can still be filed."
   - `notTransmittedSentence` and `transmittedSentence` print the environment in words, never the raw value.
   - `As2ReceiptUpload.tsx`: a test receipt says it files nothing (optional; only if the component shows the outcome).
   - No ids, enums or snake_case on screen.
6. **Docs:**
   - `docs/runbooks/ectd-transmit-path.md`: extend :140-145 to the sequence spine, including the query a person runs
     to find sequences a staging send marked 'sent' before this change: ECTD_TRANSMITTED audit rows with environment
     staging whose sequence is sent or acknowledged.
   - `docs/work-orders/MR-10…md` step 8(iii): amended to say test ACKs never move `dispatch_status` into the filed
     set.
   - `filed-dispatch.ts`: header comment only, saying that only a production send files.

## Tests (red first, saved)

- Flip the pinned tests: a staging send or receipt leaves the sequence unfiled ('pending').
- **New.** Staging send → new production signature → production send succeeds, and the sequence is 'sent'. With slice
  1 landed, the filed fold reads the PRODUCTION transmittal's leaves, never the staging one's.
- **New.** Staging post-wire failure → the sequence is 'pending', the claim is released, and an audit row is written as
  today. A later staging MDN for that attempt changes no sequence.
- **New.** Production post-wire failure → still 'transmitting' (unchanged).
- **New.** A staging receipt (AS2 MDN 'received') → 'pending'. A production receipt → 'sent' (unchanged).
- **New.** After a staging send, `filingOrderRefusal` and the commitment-evidence trigger do not treat the sequence as
  filed. Use a DB test on real Postgres for the trigger (`tests/db/commitment-fulfilment-evidence.dbtest.ts`).
- **Client.** The button names the environment. The post-test-send sentence says it is not a filing.

## Mutations

1. Remove the environment branch at the post-wire write. The staging-stays-pending test goes red.
2. Remove it in `resolveReceiptSequence`. The staging-receipt test goes red.
3. Remove the staging release on post-wire failure. The released-claim test goes red.
4. Make the production branch also write 'pending'. The production-still-files test goes red.

## Critique and resolution

- **A new 'test-sent' token or a test-resolution route** (old design): rejected under RULE 6. 'pending' plus the
  transmittal and audit record already say everything, and every reader is an allow-list.
- **Correcting deployed sequences a staging send marked 'sent'**: no automatic correction. A migration cannot tell a
  real filing from a test one without reading audit rows. Per D7, no real sequence has reached FDA yet. The runbook
  gives the query, and a person decides. This is owed, and named in the README.
- **Plan:**
  - Trailers:
    - `Plan: F1`;
    - `Completes: server/services/submission-service/submission-service.ts`;
    - `Completes: server/services/submission-gateways/fda-esg-receipts.ts`.
  - Files allowed:
    - those two;
    - `filed-dispatch.ts` (header only);
    - `SubmissionSeqWorkspaces.tsx`, `SubmissionCenter.tsx` and `As2ReceiptUpload.tsx` (copy);
    - the runbook and MR-10;
    - tests;
    - evidence `docs/evidence/D7-TEST-ENVIRONMENT-SEND/2026-11-01/`.
  - Forbidden:
    - a migration, `shared/schema*` or `migration-set.mjs`;
    - any new non-test file;
    - D0-locked files;
    - any layout or class change.
  - No decision record: this is an F1 repair (the package spine's F14 rule reached onto the sequence spine).
    Nothing is added to `docs/LAUNCH_DEFINITION_OF_DONE.md`.
