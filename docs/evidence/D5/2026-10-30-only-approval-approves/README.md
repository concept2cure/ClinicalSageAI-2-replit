# D5: on POST /docs/:id/sign, only an APPROVER signature approves (2026-10-30)

Session `…01E8btkB`, D5 CSR-path lane. Found by the CSR path sweep's release
finder and verified by hand. The sweep's verifiers did not run: they failed
on a billing error.

## What already exists

| Exists | Path | What it does | What was wrong |
|---|---|---|---|
| `/sign` | `authoring.router.ts` | Records a signature. At the last step of a `/submit` workflow, `advanceWorkflowForSignature` → `approveAndFreezeDocument` approves the document and freezes it | It sealed whatever the signature meant |
| Separation of duties | `signingRefused` → `assertSignerIsNotAuthor` (`2026-10-29-csr-approval-independence`) | Refuses an author for every meaning but AUTHOR | So an author signing AUTHOR was never checked |
| The step | `authoring_workflow_steps`, written only by `/submit` | Cleared by a signer whose token holds the meaning, QA or RA_CMC | An AUTHOR signature could clear one |
| `/e-sign` | the same router | Approves only on APPROVER | — |

**What it allowed.** A CSR's author with the QA role names themselves on a
`/submit` step, then signs `/sign` with meaning AUTHOR. Their step clears,
the workflow is complete, and the CSR is APPROVED and frozen. Its only
signature reads "Authorship". A REVIEWER signature at the last step did the
same, with "Review".

Reach: API only. No client calls `/submit` or `/sign`, but both are served
under `/api/authoring`. Review-routing slice RR6 plans to delete them; until
then the rule must hold.

## What changed

- An AUTHOR signature decides no workflow step.
- The last cleared step approves and freezes only on an APPROVER signature,
  which separation of duties already holds to independence. A REVIEWER
  signature that clears the last step records the review and leaves the
  document unapproved, as `/e-sign` does.

## Evidence: seen failing first

| Check | Red (`red.txt`, the committed router) | Green |
|---|---|---|
| The author signing AUTHOR at the last step: signed, nothing approved | fails: approved and frozen | passes |
| A REVIEWER at the last step: nothing approved | fails: approved and frozen | passes |
| An independent APPROVER at the last step approves and freezes (control) | passes | passes |
| `authoring-approval-independence.test.ts` | 2 failed, 8 passed | 10/10 |
| `authoring-atomic-mutations`, `authoringSignFreezeAndExportGate` | They pinned the REVIEWER seal and now sign APPROVER | 11/11 |
| 68 files reaching `/sign`, the workflow steps and the review context (`green.txt`) | — | 1,293/1,293 |

## Disclosed

- `server/routes/authoring.router.ts`: no other lane has changed it in the
  last 24 hours. Two guarded lines in `advanceWorkflowForSignature`.
- The two route suites above: one call each, from REVIEWER to APPROVER, with
  the reason in a comment.
