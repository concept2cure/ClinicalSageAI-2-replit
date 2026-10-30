# D5: the Vault carry-over judges independence against every author of the document (2026-10-30)

Session `…01E8btkB`, D5 CSR-path lane (approval and release). Found by the
CSR path sweep's approval finder and verified by hand. The sweep's verifiers
did not run: they failed on a billing error.

## What already exists

| Exists | Path | What it does | What was wrong |
|---|---|---|---|
| The carry-over | `server/services/regulatory/authoring-approval-carryover.ts` `carryAuthoringApproval`, `independentSigners` (FD5 (c), `5ff08b21d`) | When an approved Authoring document is filed, its review and approval signatures become the Vault version's sign-offs. Transmit then accepts the version for those bytes | Independence (FD4 (a)) compared the reviewer and approver only with `authoring_documents.created_by` |
| The author set | `server/services/governance/separation-of-duties.ts` `resolveTargetAuthors('authoring-document:<id>')` | Returns the creator, every `doc_revisions` author and every visible section change on the audit trail | — |
| The signing check | `authoring.router.ts` `signingRefused` → `assertSignerIsNotAuthor` (`7091309ab`, 2026-10-29) | Refuses a review or approval signature from anyone in that author set | It only covers signatures made since 2026-10-29. Every earlier REVIEWER or APPROVER signature was never checked against co-authors |

**What it allowed.** A member who wrote a section of the LMN-201 CSR could
sign its review. The carry-over saw a reviewer who was not the creator and
carried that review to the Vault as independent. The Vault version became
approved, and transmit accepted it. Since 2026-10-29 the signing route refuses
such a signature. Signatures made before then are still checked only at the
carry-over, and the carry-over used the narrower rule.

## What changed

- `independentSigners` now also asks the one author resolver the signing
  route uses (`resolveTargetAuthors`). If the reviewer or approver is in the
  author set, nothing carries. The reason given is: "Someone who wrote part of
  this document (sources) signed its review or approval, and the Vault requires
  someone other than its authors."
- If the authors cannot be established, nothing carries and the reason says
  so. This covers an author id that cannot be read, which is the resolver's
  own refusal, and an empty or partial author set.
- If the lookup fails outright, it throws. The carry-over rolls back whole
  and the caller reports that the approval did not carry, as before.
- The earlier checks run first, in the same order and with the same messages.
  So a creator who signed still reads "The document's author signed…".
- The author set is not copied into the carry-over. Both gates read
  `resolveTargetAuthors`.

**A consequence, stated.** The resolver accepts only numeric user ids. Both
writers store numeric ids: `createRevision` (`authoring-evidence.ts`) and `insertDocumentTx` (`authoring-documents.ts`)
store the actor's id. The old creator check also accepted an email. A document
whose creator was recorded by email, if one exists, now does not carry. The
reason says independence is unresolved. The signing route has refused the
same document since 2026-10-29.

## Evidence: seen failing first

| Check | Red (`red.txt`, the committed carry-over) | Green (`green.txt`) |
|---|---|---|
| `authoringFileToVaultApprovalCarry.pglite.integration.test.ts`, new case: the reviewer wrote a `doc_revisions` revision of one section | fails: the review carries (`carried: true`) | passes: not carried, the reason names the revision ledger, and the version stays `not reviewed` for transmit |
| The same suite's 10 existing cases, including two other members carrying (control) | pass | pass |
| The 9 suites that reach the carry-over or file-to-vault | — | 158 passed. 9 failed in `founder-path-lineage`, and the same 9 fail on the committed carry-over (hop 6 `INGEST_FAILED`, before the carry-over runs) |
| ESLint, both files | 0 errors, 0 warnings | 0 errors, 0 warnings |

## Disclosed

- No other lane changed `authoring-approval-carryover.ts` or the integration
  test in the last 24 hours. The review-route lane last changed the test on
  2026-10-29 at 05:51 (`3ecb4cda4`).
- `separation-of-duties.ts` is imported, not changed.
- This change adds a row to `docs/work-orders/README.md`. Other lanes change
  that board too.
