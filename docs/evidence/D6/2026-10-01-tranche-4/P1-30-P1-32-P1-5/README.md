# P1-30, P1-32, P1-5 remainder (DP-33, DP-35, IAM-14): Authoring delete, signed freeze, upload guards

Row **D6**. Plan items P1-30, P1-32 and the P1-5 remainder
(`docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md`). Date 2026-10-01.
HEAD when red was taken: `a94488a3` (`red/HEAD.txt`).

This item was interrupted at about 03:50 UTC by a usage limit and resumed at
about 05:55 UTC. The earlier attempt had written most of the code and its red
runs. The resume kept that code, added one refusal to the delete (a signed
draft), re-took red against the HEAD router, and took every green run.

## What was wrong

**DP-33.** `DELETE /api/authoring/docs/:docId` had four defects:
- It was authorised by a static `x-admin-token` header compared with
  `process.env.ADMIN_TOKEN`. The session was not the authority.
- The read and the `DELETE` had no `tenant_id` predicate.
- The record was `auditService.logAction`, which is best-effort and writes no
  actor and no organisation. It ran on the pool before the `DELETE`, so it
  could not roll back with it.
- The only gate was a `UAT-` product code.

**DP-35.** `POST /docs/:docId/freeze` sets a document to `FROZEN`. A frozen
document counts as `finalized` for eCTD leaf completeness
(`coauthor-snapshot.ts snapshotStatusFor`, `leaf-source-resolver.ts`) and as
COMPLETE on the IND checklist. The freeze asked for no signing authority and no
re-authentication, and there is no unfreeze. So one session (a stolen one
included) could permanently put any document its holder could edit into a state
that satisfies those checks.

**IAM-14 (P1-5 remainder).** `ci:upload-guards` at HEAD listed 4 sites in 3
files (`red/ci-upload-guards.at-HEAD.txt`):

| Site | Defect |
|---|---|
| `authoring.router.ts` `POST /images` | Hand-rolled signature check plus a scan that read only `scan.clean`, which the scanner reports `true` when it did not run. A production deployment with no scanner stored every figure unscanned. The name was not bound to the type: `figure.gif` with PNG bytes declared `image/png` was stored as is. |
| `authoring.router.ts` `POST /import/docx` | No byte check and no scan before mammoth parsed the file. |
| `chat.ts` `POST /upload` | The handler (`chat/upload.ts`) ran its own signature check and a fail-OPEN scan. It did not bind the name: `report.pdf` declared `text/html` with HTML bytes was stored as evidence. |
| `vault-ingest.ts` | A gate limit, not a defect; see below. |

## What is true now

### DP-33: the governed delete (`server/routes/authoring.router.ts`)

The `x-admin-token` path is removed, and `ADMIN_TOKEN` with it: nothing in
`server/` reads it, and `.env.example` records why it went. The delete now runs
these steps in order:

1. **Session.** The router's own JWT gate, then 401 if there is no actor id or
   email.
2. **Role.** The caller's role in this organisation is read from
   `organization_users` (`resolveSignerOrgRole`, the persisted membership, never
   the token's claim). It must be `owner`, `admin` or `manager`; otherwise 403
   `AUTHORING_DELETE_NOT_PERMITTED`. This is checked before the reason, so a
   caller who may not delete learns nothing.
3. **Reason.** `requireGovernedReason`; otherwise 400 `field: reason`.
4. **One transaction** (`inTransaction`):
   - The document is read `FOR UPDATE` with `tenant_id = $2`. A foreign or
     unknown id is 404 and says nothing about other organisations.
   - These are refused with 409 and nothing is deleted:

     | Refusal | Why |
     |---|---|
     | `FROZEN` / `APPROVED` → `AUTHORING_DOCUMENT_SEALED` | A sealed record is kept. |
     | Any revision history → `AUTHORING_DOCUMENT_HAS_HISTORY` | The revision ledger is append-only by trigger. Asking first turns what would have been the trigger's 500 into an honest 409. |
     | Any `authoring_signatures` row → `AUTHORING_DOCUMENT_SIGNED` | **Added on resume.** That table has no foreign key to the document, so the `DELETE` succeeded and left the signature naming nothing (§11.70). An AUTHOR or REVIEWER e-sign does not freeze, so a draft can carry one. |
   - `DELETE … WHERE id = $1 AND tenant_id = $2`, then `writeChainedAuditRow`
     on the same client. The row is `authoring.document.delete`, with the
     actor's user id, the tenant, the reason as given, the actor's email, the
     title, product code, status, version and section digest.
5. **5xx.** A server error goes through `serverError`, so no error text
   reaches the response.

`scripts/cleanup-fixtures.mjs`, the route's one caller, now sends a bearer
`AUTH_TOKEN` and a `REASON`. It also no longer calls an undefined `logger`.

**What can still be deleted.** In practice, only a document that never had a
section or a signature: a mistaken create, or a bare fixture. Nothing that
holds governed content can be deleted.

### DP-35: a freeze is a signature (`server/routes/authoring.router.ts`, `client/src/concept2cure/v2/surfaces/AuthoringFilingBar.tsx`)

The freeze now runs the same ceremony as `/e-sign` in this router, in the same
order:

1. `assertSigningAuthority`: §11.10(g), using `resolveSignerOrgRole` and
   `isSigningAuthorized`. Otherwise 403 `ESIGNATURE_NO_AUTHORITY`.
2. A §11.50 meaning: `AUTHOR` or `REVIEWER`, otherwise 400 `field: meaning`.
   `APPROVER` is refused because approval is `/e-sign`, which approves and
   freezes in one act; a second approval path would be two answers to one
   question.
3. Every existing refusal: 404, already frozen, and not settled (409).
4. `reverifyAuthoringSigner`, the platform's `reverifySigner`, LAST. That is
   the password, the second factor whenever one is enrolled, lockout and
   standing. A code is therefore spent only on a freeze that is otherwise
   ready.
5. One transaction holding:
   - the `frozen_documents` snapshot;
   - the `FROZEN` flip;
   - an `authoring_signatures` row bound to that snapshot
     (`covered_freeze_version` and `covered_content_hash` are the snapshot's),
     with `signature_digest` and the verified method;
   - the `authoring_audit_trail` row;
   - the chained `audit_logs` row, whose details carry `signatureId`,
     `meaning` and `signer`.

The `authoring_signatures` insert is one helper, `insertAuthoringSignature`,
which `/e-sign` now calls too.

**Why `authoring_signatures` and not `electronic_signatures`.** It is this
store's §11.50 signature table. `/e-sign` writes it, and the router documents
why (`electronic_signatures.document_id` is an integer FK to the legacy
`documents` table). Writing both would be two records of one act.

**Who may freeze.** The object-gate summary the editor reads (`access.freeze`)
now composes the approve grant with the same signing-role step as E-sign. A
member author is told in advance why Freeze is unavailable.

**The client.** Freeze opens the shared `EsignModal`, the same one E-sign and
`SopRegister.tsx` use:
- It offers only Authorship and Review (`meanings` prop), sends `meaning`,
  `reason`, `password` and `mfaToken`, and shows a 401 inside the dialog as
  "Not frozen … Nothing was sealed."
- A not-settled 409 still asks the resolve-or-seal question. Choosing "seal it
  as it stands" opens the signature dialog again, so the seal is re-signed
  rather than re-sent.

**Status codes against the plan.** P1-32's acceptance text said 428 for a
missing credential. The route answers the ceremony's own 400
`PASSWORD_REQUIRED`, exactly as `/e-sign` does; a second status for the same
refusal would be two answers.

### IAM-14: upload sites

- **`POST /images`.** The filter is `makeUploadFileFilter`
  (`middleware/uploadAllowlist.ts`), narrowed to png, jpg, jpeg and gif and
  their three types, with no `image/` prefix. Then
  `assertUploadSafe(buffer, declaredType, name)` runs before anything is
  stored.
- **`POST /import/docx`.** The filter is `makeUploadFileFilter` for `docx`.
  Then `assertUploadSafe` runs against the `.docx` type before mammoth opens
  the file.
- **Refusals.** Both routes answer with the helper's own status: 400
  `FILE_TYPE_MISMATCH` / `FILE_SIGNATURE_MISMATCH` / `FILE_SCAN_REJECTED`, or
  503 `FILE_SCAN_UNAVAILABLE` in production. Each refusal adds "Nothing was
  uploaded."
- **`POST /api/chat/upload`.** `assertEvidenceSafe` runs `assertUploadSafe`
  between multer and the handler, and the handler's own copy is deleted. It
  uses the route's existing `{ error: { code, message } }` envelope. A flagged
  file's signature name is not echoed.
- **`vault-ingest.ts`: not changed, and it is not a defect.** The route has a
  size limit and an extension filter. `assertUploadSafe` runs inside
  `ingestVaultDocument` (`services/vault/vault-ingest.service.ts:249`). That is
  the one admission into `vault.documents` for this route and for the AnA
  tool, authoring file-to-vault and eSTAR retention. Calling it in the route
  as well would scan every file twice. Moving it to the route would remove it
  from the other three callers. `vault-ingest-type-binding.test.ts` proves the
  route refuses HTML under a `.pdf` name with nothing stored
  (`green/vault-ingest-type-binding.existing-guard.txt`). The gate's known
  limit ("a multer instance … attributed to the file that builds it") is what
  counts it, and its baseline entry already says so.

`ci:upload-guards` now reports **1 unguarded site in 1 file** (vault-ingest;
the HEAD count was 4 sites in 3 files). The baseline entries for
`authoring.router.ts` and `chat.ts` are reported fixed ("drop the entry"). The
baseline was not written.

## Red / green

| Suite | Red | Green |
|---|---|---|
| `server/routes/__tests__/authoring-governed-delete-signed-freeze.test.ts` (unit, real router, real JWT, mocked pool) | **18 failed, 1 passed** against the HEAD router (`red/…unit.at-HEAD-router.txt`). The pass is the control case: a PNG named and declared PNG is stored. | **19 passed** (`green/…unit-and-chat-upload-safety.txt`) |
| Same suite, the signed-draft case added on resume, against the earlier attempt's delete | **1 failed**: 200, deleted (`red/delete-signed-draft.before-fix.txt`) | passes |
| `tests/db/authoring-governed-delete-signed-freeze.dbtest.ts` (PostgreSQL 16, `app_service` role, `RLS_ENFORCE=on`, real `reverifySigner` with bcrypt) | **8 failed** against the HEAD router (`red/…dbtest.at-HEAD-router.txt`) | **8 passed** (`green/…dbtest.txt`, 05:59). Re-run with the stability-table suite: **11 passed** (`green/authoring-dbtests.after-P0-4b-column.txt`) |
| `server/routes/__tests__/chat-upload-safety.test.ts` (real router, real multipart) | **3 failed, 1 passed** (`red/chat-upload-safety.0310.txt`; the pass is the control) | **4 passed** |
| `client/src/concept2cure/v2/__tests__/authoringFilingBar.test.tsx` (the real `EsignModal`) | **8 failed, 7 passed** (`red/authoringFilingBar.client.0322.txt`; the 7 are the E-sign and refusal cases, unchanged) | **15 passed** (`green/authoringFilingBar.client.txt`) |
| Neighbouring authoring server suites (15 files: atomic mutations, sign ceremony, signing authority, doc access, sign/freeze/export gate, printed name, snapshot seal/from-source, review board, figures, image export, regulatory honesty …) | n/a | **174 passed** (`green/neighbour-suites-authoring-server.txt`) |
| Schema contract, lineage, IND journey, four chat-upload route suites | n/a | **75 passed, 7 failed** (`green/neighbour-suites-contract-lineage-journey-chat.txt`). All 7 are in `founder-path-lineage.pglite.test.ts`, hop 6 onward. **Not this item:** vault ingest fails with `relation "organization_retention_settings" does not exist`, which is P1-22-org's uncommitted migration and is not in that test's DDL list. Hop 5 (seal, which is this item's signed freeze) passes. |

**Mutant (gate):** the proposed `ci:regulated-delete-audit` change still fails
when the delete's `writeChainedAuditRow` call is removed
(`red/ci-regulated-delete-audit.proposed-gate.mutant-without-chained-row.txt`).

**How red was taken against HEAD without touching anyone's file.** The HEAD
router was written to a temporary sibling,
`server/routes/zz-red-head-authoring.router.ts`, so its relative imports
resolved. Copies of the two suites, with only the import path changed, ran
against it. All three temporary files were then deleted, and `ls` confirmed
they were gone. No git command changed the index, tree or refs.

**The red runs of the earlier attempt** are kept as `red/earlier-attempt.*`.
They were taken before the last test cases were added and are superseded by the
`at-HEAD-router` runs.

**One green re-run failed for a reason outside this item, and it is kept.**
`green/…dbtest.rerun-during-P0-4b-account-standing-edit.txt` (06:02) shows 2
signing cases answering 401 `ACCOUNT_STATE_UNKNOWN`. P0-4b's uncommitted
`server/services/account-standing.ts` began reading `users.sessions_ended_at`
before its migration reached the shared test database, and the ceremony failed
closed. That is correct behaviour. After the lane applied the column (06:06),
the same suite passed 8/8.

## Gates

| Gate | Result |
|---|---|
| `npm run -s ci:upload-guards` | OK. 1 site in 1 file (HEAD: 4 in 3). The `authoring.router.ts` and `chat.ts` entries are reported for dropping. |
| `npm run -s ci:upload-guards:selftest` | 6/6 caught |
| `npm run -s ci:sign-ceremony` | OK. 3 baselined, exactly as baselined. |
| `npm run -s ci:server-error-leaks` | OK. No file gained a site. |
| `npm run -s ci:discarded-audit-write` | OK |
| `node scripts/ci/check-env-var-docs.mjs` | exit 0. `ADMIN_TOKEN` is no longer read or documented. |
| `npm run -s ci:regulated-delete-audit` | **FAILS on the new delete** (`green/ci-regulated-delete-audit.current-gate-fails-on-writeChainedAuditRow.txt`). See below. |
| `npm run -s ci:error-envelope` | FAIL, but not this item: a new read in `client/src/concept2cure/v2/surfaces/Insights.tsx:813`. |
| ESLint, the four source files (`green/eslint-compare.txt`) | See below. |

The `ci:regulated-delete-audit` regex accepts `auditService.` (the actor-less
logger this item removes) and does not know `writeChainedAuditRow`, the chained
writer on the caller's transaction. The control tower needs to add it to the
regex in `scripts/ci/check-regulated-delete-audit.mjs`. The one-token diff is
`green/ci-regulated-delete-audit.proposed-gate.diff`; ignore its `ROOT` line,
which is a scratch harness. With it the gate passes
(`green/ci-regulated-delete-audit.with-proposed-gate.txt`), and it still fails
on the mutant.

ESLint, HEAD → now:

| File | Warnings |
|---|---|
| `authoring.router.ts` | 25 → 24. Freeze handler complexity 31 → 27; e-sign 22 → 18. |
| `chat/upload.ts` | 4 → 4, with the handler smaller |
| `chat.ts` | 0 → 0 |
| `AuthoringFilingBar.tsx` | 1 → 0 |

## Commands

```
export TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:5432/c2c_testdb?sslmode=disable'
export APP_DATABASE_URL='postgresql://app_service:local-testdb-app-service-password@127.0.0.1:5432/c2c_testdb?sslmode=disable'
export RLS_ENFORCE=on NODE_OPTIONS=--max-old-space-size=2560
npx vitest run server/routes/__tests__/authoring-governed-delete-signed-freeze.test.ts server/routes/__tests__/chat-upload-safety.test.ts
npx vitest run client/src/concept2cure/v2/__tests__/authoringFilingBar.test.tsx
npx vitest run --config vitest.db.config.ts tests/db/authoring-governed-delete-signed-freeze.dbtest.ts tests/db/authoring-stability-table.dbtest.ts
npm run -s ci:upload-guards && npm run -s ci:upload-guards:selftest
npm run -s ci:regulated-delete-audit
```

## Fixtures

The db suite uses organisations `dbtest-p130-org-a` and `dbtest-p130-org-b`,
three `dbtest-p130-*@c2c.test` users, and documents titled
`dbtest-p130 <pid>-<run>`. Teardown deletes this run's documents that have no
section, signature or snapshot. The rest are kept by append-only ledgers
(`doc_revisions`, `authoring_signatures`, `audit_logs`), for the owner too, and
are retired by title. 19 such rows exist across all runs so far. A green run adds 3: a document with a section, a signed draft and a signed freeze. The red runs against HEAD added more, because HEAD froze the documents that the checks expected to be refused.

## Fix round (2026-10-01, after the adversarial verifier)

The verifier found three must-fix defects. All three are fixed. Each fix has a
red run and a green run in `red/fix-round/` and `green/fix-round/`. The red
runs were taken on the working tree before each fix, at HEAD `0e58e794`.

### 1. CI failed on this item's own delete (21 CFR 11.10(e))

**What was wrong.** `npm run ci:regulated-delete-audit` exited 1. It refused
the DELETE at `server/routes/authoring.router.ts:5544` because `AUDIT_RE` did
not include `writeChainedAuditRow`, the chained writer that the delete calls on
its own transaction. CI runs this gate (`.github/workflows/ci.yml:773`). The
earlier report left the fix to the control tower.

**What is true now.** `writeChainedAuditRow` is in the `AUDIT_RE` alternation
in `scripts/ci/check-regulated-delete-audit.mjs`, with a dated note naming the
writer and the dbtest that pins its row. Only the `AUDIT_RE` line of the
proposed diff was applied. Its scratch `ROOT` line was not. The gate passes. A
copy of the fixed gate, run on a copy of `server/routes/` with the chained row
removed, still fails on that line.

### 2. The upload-guards baseline was stale, so a regression would have been absorbed (IAM-14)

**What was wrong.** `scripts/ci/upload-guards-baseline.json` still allowed 2
unguarded sites in `server/routes/authoring.router.ts` and 1 in
`server/routes/chat.ts`, but neither file has any now.
`check-upload-guards.mjs` treats a count below the allowance as a notice, not a
failure. A new bare `multer({ storage })` added to either file therefore passed.

**What is true now.** Both entries were deleted by hand. This was not a
`--write-baseline` run. The `vault-ingest.ts` entry is kept with its written
reason. The same mutant now fails, naming both files.

### 3. `npm run demo:seed` aborted at the freeze (DP-35 callers)

**What was wrong.** `scripts/demo/launch-demo/packs/mdx.mjs` and
`biotech-authoring.mjs` posted `/freeze` with only `{reason, version}`, as the
author's session. The signed freeze answers that with 400 on `meaning`, and
`must()` threw, so each pack stopped partway. The packs' contract says that
without a signer credential "everything else seeds". Two purge notes
(`mdx.mjs`, `biotech.mjs`) also still said the authoring delete "needs
ADMIN_TOKEN".

**What is true now:**
- Both packs freeze through the second signer's session (`signer.api`), with
  `meaning: 'REVIEWER'` and `password: signer.password`. This is the same
  ceremony as the e-sign step in the same pack.
- Without a signer credential, the freeze is recorded as "not executed —
  signer credential not supplied", in a note and in the manifest record, and the
  pack goes on.
- Each e-sign step now looks for its own signature: `APPROVER` in mdx, and in
  biotech the `REVIEWER` signature with the step's own intent. The freeze's
  signature is therefore never mistaken for the e-signature, and a re-run signs
  nothing twice.
- The purge notes now describe the governed delete accurately: owner, admin or
  manager, with a reason, and a 409 on revision history, a signature or a seal,
  which every demo document has.
- `mdx.mjs` gained a `freezeSummary` function, extracted from
  `submitAndFreezeSummary`. It is exported along with `signSummary`, and
  biotech's `ensureFreeze` and `ensureSignature` are exported, so that the test
  can call the packs' own steps.

**Why REVIEWER, not AUTHOR as the verifier suggested.** A freeze meaning is an
attestation under §11.50(a)(3). In both packs the second signer is the
*requested reviewer*: `reviewerOf` and `reviewerFor` route the review request
and the QA workflow step to that identity. That identity did not author the
document; the seed identity did. An `AUTHOR` freeze by the signer would
therefore attest authorship the signer does not have. `REVIEWER`, "a reviewer
locking it for approval" in the router's own definition, is true. In mdx it is
followed by that reviewer's `APPROVER` e-sign. The primary seed identity cannot
freeze, because it has no password: it signs in with `DEMO_SEED_TOKEN` or
through dev-login.

**The test.** A new describe block in
`tests/db/authoring-governed-delete-signed-freeze.dbtest.ts` runs the packs'
own freeze and e-sign steps against the real router on PostgreSQL with RLS on.
It uses the packs' own API client (`tests/validation/lib/harness.mjs`
`createApiClient`), served over HTTP. The author is an organisation admin, as
the founder is in the demo tenant. The second signer is another admin
(`dbtest-p130-signer@c2c.test`).

### Red / green

| Check | Red (before) | Green (after) |
|---|---|---|
| `npm run -s ci:regulated-delete-audit` | exit 1 at `authoring.router.ts:5544` (`red/fix-round/ci-regulated-delete-audit.before-fix.txt`) | exit 0 (`green/fix-round/ci-regulated-delete-audit.after-fix.txt`) |
| Fixed gate on a copy with the chained row removed | — | exit 1 at the same line, so the gate still bites (`red/fix-round/ci-regulated-delete-audit.fixed-gate.mutant-without-chained-row.txt`) |
| `ci:upload-guards`, with a bare multer appended to `authoring.router.ts` and to `chat.ts` | exit 0: both absorbed by the stale allowances (`red/fix-round/ci-upload-guards.stale-baseline-absorbs-regression.txt`) | exit 1, naming both files. The working tree is OK at 1 site in 1 file; selftest 6/6 (`green/fix-round/ci-upload-guards.after-baseline-edit.txt`) |
| dbtest, 4 demo-pack cases | 4 failed: `freeze …: HTTP 400 {"error":"A freeze is signed: state its meaning…","field":"meaning"}` (`red/fix-round/demo-packs-freeze.dbtest.before-fix.txt`) | 12/12 (`green/fix-round/demo-packs-freeze.dbtest.after-fix.txt`) |
| dbtest, with the fixed packs' e-sign lookups reverted to "any signature by the signer" | 2 failed: biotech skipped its e-sign, and mdx never approved (`FROZEN`, expected `APPROVED`) (`red/fix-round/demo-packs-freeze.dbtest.mutant-lookup-mistakes-freeze-signature.txt`) | — (mutation restored) |

The red dbtest run was taken after the step functions were exported but before
any behaviour changed. `freezeSummary` was at first only extracted, with an
unchanged body, so the 400 in the red file is the packs' real failure.

### Commands (fix round)

```
npm run -s ci:regulated-delete-audit
npm run -s ci:upload-guards && npm run -s ci:upload-guards:selftest
export TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55433/c2c_testdb?sslmode=disable'
export APP_DATABASE_URL='postgresql://app_service:local-testdb-app-service-password@127.0.0.1:55433/c2c_testdb?sslmode=disable'
export RLS_ENFORCE=on NODE_OPTIONS=--max-old-space-size=2560
npx vitest run --config vitest.db.config.ts tests/db/authoring-governed-delete-signed-freeze.dbtest.ts
```

During the fix round, port 55433 was the shared local cluster
(`/var/lib/postgresql/c2c-local`); another lane was serving it there. The
5432 instance was down.

### Fixtures (fix round)

One more user, `dbtest-p130-signer@c2c.test`, an admin of
`dbtest-p130-org-a`. Each green run adds 4 documents. Three carry signatures or
a seal, and all four carry a section, so the existing teardown retires them by
title. After the fix-round runs, `dbtest-p130 %` documents total 57, all
retired.

## Follow-up (2026-10-01, evening): the delete gate requires an attributable actor (P1-30, second half)

**What was wrong.** P1-30's acceptance has two halves: the route (closed above) and
"`ci:regulated-delete-audit` extended to require an attributable actor on the audit call it accepts". The gate
accepted any audit call within 25 lines of a regulated delete, including `auditService.logAction({...})` with no
user: the very row DP-33 was about. A delete could come back with an audit row no inspector could attribute and the
gate would stay green.

**What changed** (`scripts/ci/check-regulated-delete-audit.mjs`). An audit call beside a regulated delete counts only
when its own argument list names an actor (`userId`, `actorId`, `actor`, `user_id`, …), and for a raw
`INSERT INTO audit_events` when its column list carries `user_id`. An actor written as `null` or `undefined` is no
actor; `auditService.` with no call after it is no call. A delete inside `governedQmsWrite(...)` stays covered by
construction: the helper's `opts.userId` is a required number. Each violation now says which: "no audit call within 25
lines" or "the audit call at line N names no actor".

**Red first** (`actor-gate/red/selftest-at-head-gate.txt`): four new selftest cases, run against the gate as it
stood, 4 of 23 failed: the authoring UAT delete as it was before `73153832` (`auditService.logAction` with no user),
a chained row with `userId: undefined`, an `audit_events` INSERT with no `user_id` column, and a `writeMutation` with
`null` in the actor's position. Each passed the old gate.

**Green** (`actor-gate/green/selftest.txt`): 23 passed. `actor-gate/green/gate-on-tree.txt`: the real tree passes;
its six regulated delete sites (authoring, c2c evidence, IND, coauthor, and the two inside `governedQmsWrite`) each
name their actor.

**The guard is load-bearing** (`actor-gate/red/mutant-no-null-guard.txt`): with the `null`/`undefined` guard taken
out of the actor pattern, the selftest fails 1 of 23 (`userId: undefined` passes as an actor).

ESLint: both scripts 1 warning, as at head.
