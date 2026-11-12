# GA-D4-12: the core journeys walked under `NODE_ENV=production`, as Author, Reviewer and Approver, with MFA (2026-11-12)

Plan package F1. Ledger item GA-D4-12 (`docs/evidence/GA-READINESS/2026-11-10/ledger.json`): *"Every human test ran in
development mode with dev-login and all-administrator accounts; no narrower-role, MFA or production-mode walk."* It
closes when *"J1–J5 core paths [are] walked under NODE_ENV=production as Reviewer, Approver and Author with MFA
challenged."* This walk does that. The journeys are the five of `docs/evidence/HUMAN-TEST/` (J1 to J5).

## How it ran

- **The production build** (`npm run build`, then `node dist/index.js`) with `NODE_ENV=production`, behind a local TLS
  terminator that sets `X-Forwarded-Proto: https` (`TRUST_PROXY_HOPS=1`). The production posture's own checks passed
  at boot: PostgreSQL over TLS, the runtime role `app_service` (neither superuser nor `BYPASSRLS`, no owner URL), row
  security enforced, clamd answering, SMTP configured, the AI placement settings, the audit chain verified. `/readyz`
  answered 200 throughout.
- **No dev-login.** Every person signed in through the sign-in page with a password, then a second factor: the emailed
  six-digit code (read from a local SMTP sink), or, once enrolled, the authenticator app's code.
- **Narrow roles, set through the product.** The Lumen account (all synthetic) had three administrators. As its
  administrator, Lumen Lead used **Admin and access** to make Lumen Reviewer a *Reviewer* and Lumen Approver an
  *Approver*, each with a recorded reason, and **invited** a fourth person, *Lumen Author (fictional)*, as a *Member*.
  The author redeemed the emailed setup link, set a password and signed in with the emailed code. The lead stayed the
  organisation's administrator and owner.
- Driven with Playwright at 1440×900; every screenshot was looked at. Shots are in `shots/`.

### Where this differs from a release, said plainly

| Here | In a release |
|---|---|
| clamd loaded one local signature (EICAR) | The official signatures |
| Audit-chain secret: the development value that sealed this database's existing chain | A managed key (D5) |
| A local SMTP sink | The deployment's mail relay |
| No model key: AnA in its deterministic mode | Qualified models per placement |
| A self-signed certificate on 127.0.0.1 | The deployment's domain and certificate |

None of these changes what a person may do; each is a dependency the production checks require, supplied locally.

## What a person did, in the running app

**J1: sign-in, members and projects.** The administrator changed two roles and invited the author (`j1-change-role-reviewer`,
`j1-after-invite`). Both role changes are in Admin's audit list. The invitation email arrived with a setup link
(`j1-setup-link`). The author saw Lumen's four projects (`j1-author-projects`) with view access only. The administrator
then gave the author *Edit* on LMN-201 from the project's **Team → Manage → Project sharing** (`j1-project-shared`).

**J3: the one editor, review, two signatures, freeze.**
1. The author created a document in LMN-201 from the editor's **More → New document** (`j3-new-document-created`).
   The editor explained that an Author cannot e-sign: *"Applying an electronic signature needs a signing role in this
   organization (admin, approver, reviewer). Your role: member."*
2. The author wrote section 1, saved it, and sent the document for review to Lumen Reviewer (`j3-sent`). The dialog
   does not offer the author as a reviewer. The request granted the reviewer the Reviewer role on the document and put
   a task in their Tasks.
3. The reviewer opened the task, then **E-sign**. The first time: *"Enrol an authenticator in Account to sign."* The
   reviewer enrolled an authenticator app from **Account** (key shown, code confirmed, recovery codes shown once; not
   kept here). They signed in again with the app's code, then signed **Review** with password and authenticator code
   (`j3-reviewer-signed`). A code already used to sign in was refused at signing (*"Each code works once"*), which is
   right.
4. The author, as the document's owner, granted Lumen Approver the Approver role on it (More → Access). The approver
   enrolled an authenticator, signed in with it, and signed **Approval** with password and code. The document became
   *approved and frozen*, and further edits are refused (`j3-approver-signed`).

Stored: two rows in `authoring_signatures`, `REVIEWER` and `APPROVER`, both `method = password+mfa`, the same content
hash, distinct signature digests.

**J2: the Vault.** In LMN-201's Vault the author added two files (`j2-uploaded`). A clean text note was recorded as
v1.0. The EICAR test file was refused: *"Not filed: eicar-test-file.txt — File rejected by content scan. Nothing
partial was recorded for those."* clamd logged `Eicar-Test-Signature-LocalWalk.UNOFFICIAL FOUND`. The server logged
`[upload-safety] Upload rejected by virus scanner`. The author sent the note for review, naming Lumen Reviewer to review
and Lumen Approver to approve. The reviewer signed the review and the approver approved, each with password and code.
The note reads *Approved* (`j2-final-state`).

**J4: Submission Center.** As the approver, sequence 0000's validation read 7 errors computed server-side, each with its
rule and regulation (`j4-lumen.approver-validation`). Dispatch was blocked for three reasons, in words
(`j4-lumen.approver-dispatch`): the open errors, no Shadow Review, and no Part 11 release signature.

**J5: the rail.** As each of Author, Reviewer and Approver, every rail destination was opened: Home, Projects, Tasks,
Communication, Vault, Submission Center, CMC / Module 3, Biostatistics, Risk-based monitoring, Quality, Reporting &
analytics. That is 33 screens with no failed request and no page error. Each screen showed its records, not an access
refusal or an empty state (`j5-lumen.reviewer-quality`, `j5-lumen.author-submission-center`).

## What the walk found

### Fixed here (each test fails without its fix and passes with it)

| # | Defect | Fix | Test |
|---|---|---|---|
| 1 | An enrolled signer typed a password, pressed **Sign and commit**, and only then was shown the authenticator code field. The dialog already read the server's signing posture when it opened, including `authenticatorEnrolled`, but asked for a code only when the caller passed `requireMfa` or after the password check came back | `client/src/concept2cure/_shared/components/EsignModal.tsx`: `needCode` also follows `posture.authenticatorEnrolled` | `_shared/components/__tests__/esignModalSigningPosture.test.tsx`: "enrolled: the authenticator code is asked with the password, before any attempt" and "not enrolled: no code is asked for". Checked again in the rebuilt production app as the enrolled reviewer: code field shown before any attempt (`esign-code-asked-up-front`) |
| 2 | The signing receipt labelled the action's hash **Chain**. For the editor's signatures that value is the signed content hash, not an audit-chain link; the component's own type calls it an "integrity hash returned by the governed action" | Same file: the label reads **Integrity hash** | The 53 suites that render the dialog pass (678 tests) |
| 3 | A refused document start read *"…with your current access.. Nothing was created."* | `client/src/concept2cure/v2/editor/useAuthoringCreation.ts`: the server's sentence is ended once | `v2/__tests__/authoringCreationActorOwnership.test.tsx`: "ends the server's sentence once before 'Nothing was created.'" |

### Handed to the holder of the file (written in `.design/claude-convergence/COORDINATION.md`)

- **Project page (`ProjectHome.tsx`, held by D3).** A member with no grant on any of the project's documents reads
  *"No documents in this project yet. Ask AnA in the box above to draft one."* LMN-201 holds five documents. Access to
  each document is granted per document; only an administrator sees all of them
  (`server/services/authoring/authoring-read-scope.ts`, `authoring-permissions.ts`). So the sentence is untrue for
  every non-administrator, and it invites a duplicate draft. An honest empty state for a non-administrator would say
  the list shows the documents shared with them, and that a document's owner shares it from the editor's Access.
- **W1-filing-release (`workflow-import-governance.ts`; the router's `peerReviewFailure`).** Under a configured audit
  key, `GET /api/authoring/documents/:id/reviews` answers 503 *"The review could not be verified"* for any document
  whose chained ledger rows were written with no seal. The independent-check read treats a seal of `absent` as
  refused. The editor's Review tasks rail then fails on that document for good. Every document this walk created under
  production reads normally, because production seals every row. Only rows written before a key existed hit this:
  here the seeded ones, and in the field a database that ran without a key before its first keyed deploy. Whether
  pre-key rows are admitted is that lane's decision. The boot-time chain verification accepted the same database.
- **Smaller, for whoever holds them.**
  - The invitation's landing page says *"Set a new password. Choose a strong password you have not used before"* to a
    person who has never had one.
  - The view-only refusal at document start does not say who grants Edit (Team → Manage → Project sharing).
  - One browser console line during a Vault review signature, `net::ERR_TOO_MANY_RETRIES`. It did not repeat on the
    approver's run, and the signature recorded.

### Not defects

- Adding a member answered 503 *"no public address configured (APP_URL)"* until the walk set `APP_URL`. In production
  activation links are built only on `APP_URL`, never on the Host header. The deploy sets it
  (`terraform/stack/main.tf`, pinned by `terraform/stack/tests/boot_contract.tftest.hcl`).
- A member sees only the documents shared with them. That is the design (per-document grants), not a fault. The
  fault is the empty state's wording, above.
- An authenticator code that has already been used is refused. That is replay protection.

## What already exists (RULE 3)

Every step used an existing path; nothing was added.

| Path | What it did here |
|---|---|
| `client/src/concept2cure/auth/ZenLogin.tsx`, `server/routes/auth.ts` (`/login`, `/mfa/verify`) | Password, then the emailed code or the app's code |
| `client/src/concept2cure/v2/surfaces/AdminAccess.tsx`, `AdminMemberActions.tsx`, `server/routes/tenant-users.ts` | Role changes with reasons; the invitation and its setup link |
| `client/src/concept2cure/v2/AccountPanel.tsx` (`/mfa/setup`, `/mfa/enable`) | Authenticator enrolment |
| `client/src/concept2cure/v2/surfaces/ProjectTeamSharing.tsx` | The author's Edit share on LMN-201 |
| `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx`, `AuthoringCreateExport.tsx`, `SendForReviewDialog.tsx`, `DocumentPermissionsPanel.tsx` | Document start, review request, document grants |
| `client/src/concept2cure/_shared/components/EsignModal.tsx`, `_shared/signingPosture.ts` | The §11.50/§11.200 ceremony and the server's statement of what signing needs |
| `client/src/concept2cure/v2/surfaces/Vault.tsx`, `VaultUploadStaging.tsx`, `VaultLifecycle.tsx`; the upload safety scan | Upload, the clamd verdict, the Vault's review route |
| `client/src/concept2cure/v2/surfaces/SubmissionCenter.tsx` | Validation and the dispatch gate |

## Verified

| What | Result |
|---|---|
| The walk itself, above, in the production build | J1–J5 core paths done as Author (Member), Reviewer and Approver with MFA at sign-in and at every signature |
| `npx vitest run` on the two changed suites | 17 pass; with each fix reverted, its new test fails (2 fail) |
| Every suite that renders the e-sign dialog (53 files) | 678 pass |
| The rebuilt production bundle, as the enrolled reviewer | The code field is shown with the password before any attempt |

HawkScan did not run: no `HAWK_API_KEY` in this environment.
