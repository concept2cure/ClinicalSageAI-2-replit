# D5: an approval asks whether the document is settled, as Freeze does (2026-10-30)

Session `…01E8btkB`, D5 CSR-path lane (approval). Found by the CSR path
sweep's release finder and verified by hand. The sweep's verifiers did not
run: they failed on a billing error.

## What already exists

| Exists | Path | What it does | What was wrong |
|---|---|---|---|
| The settle census | `authoring.router.ts` `freezeCensus`, `notSettledRefusal` (URS-AUTH-009) | Freeze refuses (409 `DOCUMENT_NOT_SETTLED`) while review comments are open or tracked changes are undecided, unless the user acknowledges sealing it as it stands, which is recorded | — |
| The editor's Freeze | `AuthoringFilingBar.tsx` | Asks "Go back and resolve them / Seal it as it stands", then re-signs with the acknowledgement | — |
| The approval | `/e-sign` APPROVER | Approves and freezes in one act ("An Approval signature approves and freezes the document"); separation of duties is checked before the credential | It never ran the census. An approved CSR could carry open review comments and unaccepted tracked changes inside the signed text, and the controlled export prints them as redline |

**What it allowed.** The LMN-201 CSR has an open reviewer comment ("§11.4
posterior does not match Table 14.2.1") and two undecided tracked changes in
§12.
- Freeze refuses.
- The approver uses E-sign, then Approval, and the CSR is sealed for good,
  with the question unanswered and the proposed edits in the approved text.

## What changed

- **Server.** `approvalRefused` runs separation of duties, then the census,
  for an APPROVER signature, before re-authentication. While work is
  outstanding it refuses with 409 `DOCUMENT_NOT_SETTLED`: "Not approved —
  this document still has … Nothing was signed." The exception is an
  approver who sends `acknowledgeUnresolved`. Then
  `APPROVAL_UNRESOLVED_ACKNOWLEDGED` is recorded on the signing transaction,
  naming the counts and the approver.
- **Screen.** On that refusal, E-sign asks "Go back and resolve them /
  Approve it as it stands", as Freeze does. Only the deliberate choice reopens
  the signature, and only the re-signed approval carries the acknowledgement.

## Evidence: seen failing first

| Check | Red (`red.txt`) | Green (`green.txt`) |
|---|---|---|
| Server: an approval with open comments is refused before the credential, nothing signed | fails: 200, signed and sealed | passes |
| Server: approving as it stands is recorded | fails: no record | passes |
| Server: a settled approval, and a review signature, as before (controls) | pass | pass |
| Client: re-asks, and sends the acknowledgement only on a re-signed approval | fails: no question | passes |
| Client: choosing to resolve sends nothing | fails | passes |
| 52 files reaching `/e-sign`, the census or the filing bar | — | 803 passed, 13 failed. All 13 fail identically on the committed router and filing bar: `founder-path-lineage`, `node-status-follows-work`, `authoringConversationScopeLive` |

## Not done

- `POST /docs/:id/sign` (API only, which RR6 deletes) seals on an APPROVER
  signature at the last workflow step without this question.
- Comments resolved on a frozen document (one sealed with an acknowledgement)
  are not re-checked here. The question is asked at approval time.

## Disclosed

- `server/routes/authoring.router.ts`, `AuthoringFilingBar.tsx` and their two
  test files: no other lane has changed them in the last 24 hours. The
  router's `/e-sign` handler gains no lines; its APPROVER line calls
  `approvalRefused`.
