# A change's approval signs the content the approver read (F1, 2026-11-10)

Package **F1** (a defect in shipped behaviour). This is the repair named under "Next" in
`../2026-11-10-change-record/README.md`. The design lens of the review of the change-content fix found it first
(`../2026-11-10-change-content-fixed/review.json`).

## The defect

Since C9 the approver reads a change's record inside the signature ceremony: "What you approve". The signed route then
computed the approval's content digest (`computeQmsChangeContentDigest`, the content the signature binds) from
whatever the row held at signing. The dialog sent nothing that named what it had shown.

So an edit landing while the dialog was open was signed unseen. A change under assessment is editable, so another
editor's `PATCH` between the approver reading and the approver signing changed what the signature bound. 21 CFR 11.50
and 11.70 require that a signature carry the meaning of what the signer signed.

## What already exists

- `server/services/qms/change-approval-signature.ts`:
  - `computeQmsChangeContentDigest`, the digest the signature binds and that the reviewed-learning library re-derives;
  - `approveQmsChangeSigned`, which locks the row (`FOR UPDATE`) and refuses before any write;
  - `QmsApprovalRefusedError` and its codes, which live in `document-approval-signature.ts`.
- `server/routes/mdx-qms.ts`:
  - the register read, `GET /qms/changes`;
  - the signed route `POST /qms/changes/:id/approve`, with its body schema `changeApproveBody`;
  - the refusal mapping `approvalRefusal`.
- The client:
  - `qmsApproval.ts postQmsApproval`, the one sender of a QMS approval;
  - `ChangeControl.tsx`, the dialog and its `commitRefusal`;
  - `changeHooks.ts` and `changeData.ts`, the register row.

Nothing new: no route, table or screen. One body field, one register field and one refusal code.

## The fix

1. **The register carries what an approval would sign.** Each change in `GET /api/mdx/qms/changes` has a
   `content_digest`, computed by the approval's own `computeQmsChangeContentDigest`.
2. **The dialog sends the digest of the row it showed.** `postQmsApproval` posts `expectedContentDigest` for a change.
   A row that carries no digest is not signed: the ceremony says "This change's content could not be read for
   signing. Reload the change log, then approve." and the sign button is disabled.
3. **The signed route signs only that content.** `expectedContentDigest` is required: a body without it is a 400,
   refused before the password is checked. Under the row lock, before any write, the service compares it with the
   digest of the locked row (`contentAsRead`). On a mismatch it answers **409 `QMS_CHANGED_SINCE_READ`**: "This change
   was edited after you opened it, so it is not what you read. Nothing was signed. Read it again, then approve." The
   transaction rolls back, and no ledger row, signature or approval is written.

The digest covers exactly the fields the signature binds. A link added between reading and signing changes
`updated_at`, but not the digest, so it does not refuse a signature.

## Tests

| Suite | What it pins |
|---|---|
| `qms-change-approval-signature.test.ts` | Signing a digest of different content: 409 `QMS_CHANGED_SINCE_READ`, rolled back, no signature, ledger row or approval. A body without the digest: 400, refused before the password or any transaction. Every existing case now signs with the digest of what it read. |
| `qms-changes.test.ts` | The register returns each change's `content_digest`, which equals `computeQmsChangeContentDigest` of the row and changes when the plan does. |
| `ChangeControlApproval.test.tsx` | The approval posts the dialog row's digest. A row without one is not signed (the refusal shows, the button is disabled, nothing is posted). |
| `tests/db/qms-current-signing-and-training-admission.dbtest.ts` | Against the local PostgreSQL server, every change approval reads its digest from the register as its signer does (`readDigest`) and signs with it. 16 of 16 pass. So the digest from the register equals the one recomputed under the lock, for real column types: dates and JSON metadata. |

`red.txt`: these five cases fail against the code before the fix. `green.txt`: the route, PGlite and client
suites (21 files, 267 tests) and the real-database file (16 tests).

## Walked through the running app

`w16-sign-what-read.cjs` (log: `shots/w16-sign-what-read.log.json`) ran on the app server restarted on this code, with
`RLS_ENFORCE=on`, signer mode `dev` and real logins.

1. The author raises a change, with an impact assessment "As first assessed.", and opens its assessment.
2. The approver opens Approve. The ceremony shows "Impact assessment: As first assessed."
3. While the dialog is open, the author edits the impact assessment, which a change under assessment allows (200).
4. The approver gives a reason and a password and signs. The ceremony shows **"This change was edited after you opened
   it, so it is not what you read. Nothing was signed. Read it again, then approve."** (`shots/w16-refused-1440.png`).
   The change is still under assessment.
5. The approver closes the dialog and reloads. Approve now shows "Edited while the approver was reading." The approver
   signs, and the change is approved, with the edited assessment as its signed content (`shots/w16-signed-1440.png`).

Run the walk from this folder with `NODE_PATH=$(npm root -g) node w16-sign-what-read.cjs`. It needs `WALK_PASSWORD`
and a running server.
