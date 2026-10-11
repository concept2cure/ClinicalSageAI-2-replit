# QA 2026-10-08 — QMS controlled documents and change control (J8 findings)

Source: the J8 browser QA walk (`j8-qms-reporting.json`). Reproduced on
http://localhost:5078 (QA database `c2c_qa`, read-only queries) as
michael.brown (member) and raj.patel (manager), signed in through the real form.
No passwords or tokens are in this folder.

## Reproduced before the fix

`repro-before.json` (script `repro-before.mjs`, harness `h.mjs`), screenshots in `screens/`:

| Finding | Observed |
|---|---|
| New controlled document only sends an AnA prompt | `newDoc.url` = `/concept2cure/conversation-thread` |
| Document number hands a prompt to AnA, no document view | `openDoc.composer` = "Open SOP-820-100 … Walk me through its sections" |
| No control routes a draft to review | `draftRowActions` for WI-014 (draft) = `["Approve", ""]` |
| Approve offers a draft straight to effective | `draftApproveDialog`: "v1.2 becomes effective when you sign" |
| Record training only sends a prompt | `recordTraining.url` = conversation-thread |
| Overdue tile understates | `overdueKpi` = "OVERDUE 2 Past target date" |
| Row flags use a fixed date | only CC-2026-012 flagged; CC-2026-014/-006/-001 past target, unflagged |
| Linked records invisible | every LINKS cell 0; CC-2026-014 panel "No linked records yet" (DB: 9 link rows) |
| Advance only sends a prompt | `advance.url` = conversation-thread |
| No account can make a document effective | raj.patel (manager): "Your role does not permit approving a controlled document (21 CFR Part 11 §11.10(g))." |
| Generic sign endpoint has no authority check | `db-manager-signatures-before.txt`: two `approval` signatures on `ectd-sequence:6`, both by managers |
| Change approvals with no signature | `db-change-approvals-without-signature.txt`: four changes with `approved_by` set and 0 signature rows |

## Fixed in this change (red, then green)

| Finding | Fix | Red | Green |
|---|---|---|---|
| Generic governed sign has no signing-authority check | `server/routes/c2c/actions.ts` `signingAuthorityRefusal`: `sign` and `revoke-signature` resolve the signer's org role from the membership row and apply `isSigningAuthorized` before the credential (403 `ESIGNATURE_NO_AUTHORITY`, nothing read or written) | `red-sign-authority.txt` (6 of 8 fail) | `governed-sign-authority.test.ts` 8/8 |
| Approve offers a draft straight to effective | `server/services/qms/document-approval-signature.ts`: approvable state is `in_review` only (check and UPDATE guard) | `qms-document-approval-signature.test.ts` "refuses a draft…" failed | 14/14 |
| No control routes a draft to review | `SopRegister.tsx`: a draft row offers **Send for review** (existing `PATCH /api/mdx/qms/documents/:id {status:'in_review'}` via `qmsApproval.ts sendQmsDocumentForReview`); Approve only on `in_review` rows; the server's refusal shown as worded | `red-client.txt` (4 SopRegister cases) | `SopRegisterApproval.test.tsx` 21/21 |
| Overdue tile understates | `changeControl.service.ts`: one predicate, `IMPLEMENTATION_OVERDUE_SQL` (proposed, under assessment, approved, in implementation, target < `CURRENT_DATE`), used by the summary and the register | `red-changes.txt` | `changeControl.pglite.integration.test.ts` (real SQL over the GA seed: 4) |
| Row flags use a hard-coded date | register rows carry `implementation_overdue` from the database; `changeData.isImplementationOverdue` reads it | `red-client.txt` (4 cases) | `changeOverdueFlag.test.ts` 4/4 |
| Linked records invisible | `GET /api/mdx/qms/changes` returns each change's `links` (`listLinksForChanges`, one org-scoped query) | `red-changes.txt` | `qms-changes.test.ts`, pglite (9 links) |
| Change lifecycle (server side only) | register rows carry `next_states` (`CHANGE_TRANSITIONS`); `POST …/transition` requires a reason (`governedReason`) and records `{from,to}` and the reason on the audit row | `red-changes.txt` | `qms-changes.test.ts` |

After (browser, `check-after.json`, client served by Vite from this tree):
WI-014 (draft) offers `Send for review`, no Approve; POL-002 (in review) offers `Approve`.
Not clicked: it would change shared QA data. The 5078 server process predates
the server edits, so links, flags and the new overdue count appear there only
after it restarts.

## Not verified

- `tests/db/qms-document-signature-required.dbtest.ts` was updated (approvals
  now go through `in_review`) but not run: it needs a writable test database.
- The server changes in a running instance (5078 was not restarted).
