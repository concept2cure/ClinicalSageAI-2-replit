# OQ-001 — Operational Qualification protocol: Projects

| Field | Value |
|---|---|
| Document ID | OQ-001 |
| Version | 0.7 |
| Status | **DRAFT — UNSIGNED** |
| Parent | VMP-001 §5; requirements URS-001 |
| Runner (the executable protocol) | `tests/validation/oq/projects/run.mjs` — `npm run validation:oq -- projects` |
| Record | `docs/evidence/W3/<date>/OQ-PROJECTS/OQ-001-execution-record.md`, `result.json`, `steps/*` (generated; never edited) |

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-09-21 | W3a | First protocol; executed locally (see record). |
| 0.2 | 2026-09-22 | W3 | OQ-PROJ-06b checks what its expected result says: at least one entry carries record/previous hashes, and the server's chain verdict (`meta.chain`) is `ok = true`. v0.1 counted entries only, so an unchained entry or a broken chain passed. Shown on a deliberately tampered local chain: v0.1 passed OQ-PROJ-06b while OQ-PROJ-06 failed; v0.2 fails it (VSR-001 §12). §5 records the 2026-09-22 execution under the production posture (RLS enforcing, non-owner runtime role, credentialed second signer); earlier results are kept below it as superseded. No step changed. |
| 0.3 | 2026-09-23 | W3 | OQ-PROJ-02 signs in through the form with email, password and the authenticator code when the run is credentialed. The Demo Access path it had used exists only on a development server with ALLOW_DEV_AUTH=1, which production must refuse (IQ-10), so the step could not execute on staging. The harness authenticates every protocol the same way (tests/validation/lib/harness.mjs passwordLogin; VSR-001 §13). §1 now describes that session method; it named dev-login only, which OQ-002…006 inherit through "As OQ-001 §1". |
| 0.4 | 2026-09-23 | W3 | OQ-PROJ-16 (URS-PROJ-010): the step makes a wrong-password attempt, a wrong-code attempt and a sign-in, then reads them back on the audit ledger, in order and hash-chained. Only entries the step itself added count: an earlier run leaves the same five sentences, and the first draft of the step, which compared the newest five, passed against the unfixed code on those. Under RLS these events had never reached the trail (VSR-001 §13, F-19). On the code before that fix the step fails; after it the step passes (`docs/evidence/W3/2026-09-23/OQ-001-v0.4/`). |
| 0.5 | 2026-09-23 | W3 | OQ-PROJ-17 (URS-PROJ-011): the step opens a session of its own, signs it out, and uses the same token again. Logout had answered "Tokens invalidated." while the token went on opening the API and the session check, and no step used a token after signing it out (VSR-001 §13.9, F-21). The step signs out its own session, not the run's, so the steps after it keep theirs. On the code before that fix the step fails; after it the step passes (`docs/evidence/W3/2026-09-23/OQ-001-v0.5/`). |
| 0.6 | 2026-09-23 | W3 | §1: each step's record carries the kind this protocol gives it. No runner declared a kind and the harness defaults to scripted, so the records of all six protocols presented 17 unscripted and ad-hoc steps, and the 5 prerequisites, as scripted (VSR-001 §14). The runners now declare them, and the traceability gate compares every runner step with its protocol. OQ-002…006 inherit this through "As OQ-001 §1". No step changed. |
| 0.7 | 2026-09-23 | W3 | OQ-PROJ-18 (URS-PROJ-012): a platform administrator suspends a dedicated account through the product's own route; the account's session is then refused by the API and the session check, its sign-in is refused after the password with no challenge issued, the refusal is read back on the ledger, and the account is restored in every outcome. Credentialed (`OQ_PLATFORM_ADMIN_*`, `OQ_STANDING_*`, §1); not executed without them. Until F-28 and F-29 nothing read `users.status` but the release signature (VSR-001 §16). |

## 1. Method

The runner authenticates as the client does. Staging and production must refuse dev-login (IQ-10). On any such server, the runner signs in with the run identity's password (`VALIDATION_USER_PASSWORD`) and completes the TOTP challenge with the current code of the identity's enrolled factor (`VALIDATION_USER_TOTP_SECRET`). It never presents a code twice (`tests/validation/lib/harness.mjs` `passwordLogin`, `lib/totp.mjs`, RFC 6238). Only on a development server that provides dev-login (`NODE_ENV=development`, `ALLOW_DEV_AUTH=1`), and with no credential supplied, does it use dev-login. `npm run validation:oq` opens each identity's session once per run and hands it to every protocol, which re-validates it before use. The session's tokens are seeded into the four `trialsage_*` storage keys (`tests/e2e/dev-auth-helper.ts` pattern). Each record names the method in `environment.authentication`, and no factor (password, code, secret or token) is written to a record. The runner calls the product's public API for every prerequisite and assertion, drives Chromium (`playwright-core`, `CHROMIUM_PATH`) for every surface check with a full-page screenshot, and records each step's API traffic and verdict (VMP-001 §7). Steps marked *scripted* carry a pass criterion; *unscripted* and *ad-hoc* steps record what was observed and require a reviewer's judgement. Each step's record carries the kind its protocol gives it; `npm run ci:validation-traceability` refuses a runner that records a different one (v0.6).

OQ-PROJ-18 (v0.7) needs two further identities, supplied only through the environment like every credential: a platform administrator, `OQ_PLATFORM_ADMIN_EMAIL` / `_PASSWORD` / `_TOTP_SECRET` (an active `platform_role_grants` row), and the account it takes out of use, `OQ_STANDING_EMAIL` / `_PASSWORD` / `_TOTP_SECRET`, a member of the run identity's organisation that no other step uses. Without them the step is recorded *not executed — credential not supplied*. The step restores the account whatever its outcome. Every sign-in counts against the server's per-address sign-in limit of ten in fifteen minutes; with this step the OQ run makes ten, so the IQ, which makes one more, runs on its own server process or more than fifteen minutes before the OQ run.

## 2. Pre-conditions

IQ-001 executed on the same installation; `LAUNCH_SCOPE_ENFORCE=on`; a fresh or existing organisation for the test identity. No fixtures are seeded — every record is created through the API during the run.

## 3. Steps

| Step | URS | Kind | Action | Expected result |
|---|---|---|---|---|
| OQ-PROJ-01 | URS-PROJ-001 | scripted | `GET /api/c2c/projects` without Authorization | 401/403, no data |
| OQ-PROJ-02 | URS-PROJ-001, 005 | scripted (browser) | Open `/concept2cure/login`. Credentialed run (`VALIDATION_USER_PASSWORD`): enter email and password, then the current authenticator code when the server asks for it (v0.3). Development run: click *Demo Access*. Observe the redirect | Login page renders; the shell renders after sign-in |
| OQ-PROJ-03 | URS-PROJ-002 | scripted | `POST /api/c2c/projects` without `name`; with `programType:"not-a-type"` | Both 400 naming the field |
| OQ-PROJ-04 | URS-PROJ-002, 003 | scripted | Create an IND program | 201; UUID id; name echoed; intake reports scaffolded document and canonical submission |
| OQ-PROJ-05 | URS-PROJ-003 | scripted | List programs; read by id | Listed; detail matches |
| OQ-PROJ-06 | URS-PROJ-004 | scripted | `GET /:id/activity`; `GET /api/c2c/actions/verify-chain` | ≥1 attributable entry; chain `ok:true` |
| OQ-PROJ-06b | URS-PROJ-004 | scripted | `GET /api/audit-trail/ledger` | ≥1 entry carrying record/previous hashes on the ledger surface's read model, and the server's chain verdict `meta.chain.ok = true` (v0.2) |
| OQ-PROJ-07 | URS-PROJ-005 | unscripted (browser) | Open `/concept2cure/projects` | Program name visible; screenshot |
| OQ-PROJ-08 | URS-PROJ-005 | unscripted (browser) | Open `/concept2cure/project-home` with the program selected | Program name visible; screenshot |
| OQ-PROJ-09 | URS-PROJ-006 | scripted | `POST /api/tasks/tasks`; `GET /api/task-management/board` | 2xx; task on the board |
| OQ-PROJ-10 | URS-PROJ-006 | unscripted (browser) | Open `/concept2cure/tasks` | Task title visible; screenshot |
| OQ-PROJ-11 | URS-PROJ-007 | ad-hoc | `GET /api/program-journey` | 200 with `data[]` |
| OQ-PROJ-12 | URS-PROJ-007 | ad-hoc (browser) | Open `/concept2cure/filings-catalog` | Renders; screenshot |
| OQ-PROJ-13 | URS-PROJ-008 | scripted | `GET /api/module-subscriptions/navigation` | `launchScope.enforced=true`; `rbm` locked by `launch-scope`; six launch surfaces entitled |
| OQ-PROJ-14 | URS-PROJ-008 | scripted (browser) | Open `/concept2cure/rbm` | "Not in this release" gate; screenshot |
| OQ-PROJ-15 | URS-PROJ-009 | scripted | `GET /api/c2c/projects/<random uuid>` | 404 |
| OQ-PROJ-16 | URS-PROJ-010 | scripted | Credentialed run only (a dev-login run is a deviation). `POST /api/auth/login` with a wrong password. `POST /api/auth/login` with the password, then `POST /api/auth/mfa/verify` with a wrong code. `POST /api/auth/login` with the password, then `/mfa/verify` with the current code. The sign-in calls bypass the recorded API client, so no factor reaches the record. The ledger is read before and after (`GET /api/audit-trail/ledger?limit=50`) (v0.4) | 401; 200 then 401; 200 then 200 with a session. The ledger then holds exactly five entries for the run identity that it did not hold before the step. Newest first they read "Signed in: password and second factor verified", "Password verified: authenticator code requested", "Second factor refused: wrong code", "Password verified: authenticator code requested", "Sign-in refused: wrong password"; each is hash-chained, and the chain verdict is ok |
| OQ-PROJ-17 | URS-PROJ-011 | scripted | Open a session of the step's own for the run identity: password and authenticator code on a credentialed run, dev-login on a development run. With it: `GET /api/c2c/projects`; `POST /api/auth/logout`; then, with the same token, `GET /api/c2c/projects` and `GET /api/auth/session`. The ledger is read with the run session before and after (`GET /api/audit-trail/ledger?limit=50`) (v0.5) | Projects 200 before; logout 200. Afterwards the projects API answers 401 and the session check reports `authenticated: false`. The newest ledger entry the step added for the run identity reads "Signed out" and is hash-chained |
| OQ-PROJ-18 | URS-PROJ-012 | scripted | Credentialed. Sign in as the standing subject (`OQ_STANDING_EMAIL`: password and authenticator code) and read projects with its session. As the platform administrator (`OQ_PLATFORM_ADMIN_EMAIL`), `PATCH /api/admin/master/users/:subjectId/status {status:"suspended", reason}`. With the subject's session: `GET /api/c2c/projects`, `GET /api/auth/session`; then `POST /api/auth/login` as the subject. The ledger is read with the run session before and after. Then `PATCH … {status:"active", reason}` and read projects with the subject's session again (v0.7) | Projects 200 before. Suspended: projects 401 `ACCOUNT_INACTIVE`; the session check `authenticated: false` with `AUTH_ACCOUNT_INACTIVE`; the password step 403 `AUTH_ACCOUNT_INACTIVE` with no challenge issued; the newest ledger entry the step added for the subject reads "Sign-in refused: the account is not active (suspended or deprovisioned)", hash-chained. Restored: the same session reads projects 200 |

## 4. Acceptance

All scripted steps pass; unscripted/ad-hoc observations reviewed and accepted by the reviewer; no `fail` without a change request (VMP-001 §6).

## 5. Result of the local execution (2026-09-23b, one commit carrying every fix — VSR-001 §14)

**18 pass, 0 fail, 0 deviation, 0 not-executed** (record `docs/evidence/W3/2026-09-23b/OQ-PROJECTS/`, executed 2026-09-23T05:18:00.578Z UTC at `0d7b85e50`). Same installation, posture and identities as the 2026-09-23 execution below: database `c2c_oq_w3_20260922b` with the migration set re-applied by `deploy-migrate` first, `RLS_ENFORCE=on`, runtime role `app_service`, dev-login refused, and every session opened by password and authenticator code. Each step is recorded with the kind this protocol gives it (OQ-001 §1, v0.6). OQ-PROJ-16 made its five attempts and found exactly five new ledger entries, in order and hash-chained. OQ-PROJ-17 (v0.5) opened a session of its own, read projects, signed it out, and was then refused (401) and reported signed out; the newest entry it added reads "Signed out", chained. OQ-PROJ-06b: the server chain verdict is ok over 417 rows.

### 5.1 Result of the local execution (2026-09-23, production posture with production authentication — VSR-001 §13; superseded by the 2026-09-23b execution)

*v0.5 (OQ-PROJ-17) was executed on its own with the runner at `d3556910a`. On a server with the F-21 logout fix reverse-applied: 17 pass, 1 fail (OQ-PROJ-17: after signing out, the token still read projects and the session check still reported it signed in). On HEAD: 18 pass, 0 fail. Records: `docs/evidence/W3/2026-09-23/OQ-001-v0.5/`; VSR-001 §13.10.*

*v0.4 (OQ-PROJ-16) was executed on its own at `5a53d2db2`, after the full set below. On a server still running the pre-F-19 authentication code: 16 pass, 1 fail (OQ-PROJ-16, 0 entries added). On the fixed code: 17 pass, 0 fail. Records: `docs/evidence/W3/2026-09-23/OQ-001-v0.4/`; VSR-001 §13.8.*

**16 pass, 0 fail, 0 deviation, 0 not-executed** (record `docs/evidence/W3/2026-09-23/OQ-PROJECTS/`, executed 2026-09-23T02:49:00Z UTC at `0e2b3a971`). Same installation and RLS posture as the 2026-09-22 execution below: database `c2c_oq_w3_20260922b`, `RLS_ENFORCE=on`, runtime role `app_service`, no AI provider configured. It adds the authentication production requires. The server refuses dev-login (`ALLOW_DEV_AUTH=0`; IQ-10 pass, `docs/evidence/W3/2026-09-23/IQ/`). Every session was opened by a password sign-in that completed the TOTP challenge of the identity's enrolled factor, once per identity per run (OQ-001 §1; VSR-001 §13). Run identity: user 17 `oq-runner@validation.local`. Second signer: user 11 `oq-signer@validation.local`. Both enrolled their authenticator through the product's own enrolment endpoints. OQ-PROJ-02 (v0.3) signed in through the form with password and authenticator code, and landed on `/concept2cure`. OQ-PROJ-06: `verify-chain` ok over 213 rows. OQ-PROJ-06b: 50 ledger entries, all hash-chained; the server chain verdict is ok=true over 213 rows.

### 5.2 Result of the local execution (2026-09-22, production posture — VSR-001 §12; superseded by the 2026-09-23 execution)

**16 pass, 0 fail, 0 deviation, 0 not-executed** (record `docs/evidence/W3/2026-09-22/OQ-PROJECTS/`, executed 2026-09-22T22:35:06Z UTC at `e2d910d6f`). Installation: a database provisioned from empty by `npm run up`; the server booted from the checkout with `RLS_ENFORCE=on` as runtime role `app_service` (not superuser, no BYPASSRLS, owns no table — IQ-07 and IQ-08 pass, `docs/evidence/W3/2026-09-22/IQ/`); no AI provider configured. This is the first execution with RLS enforcing and as a role that owns no table. The executions filed before it record `RLS_ENFORCE=off` (IQ-DEV-003), under which the tenant-isolation policies are inert, and runtime role `c2c` on `clinicalsage`, which owns 61 RLS-enabled tables without FORCE — `vault.documents` among them — whose policies therefore never applied to it (VSR-001 §12). OQ-PROJ-06: `verify-chain` answered ok. OQ-PROJ-06b (v0.2): 42 ledger entries, all hash-chained, server chain verdict ok=true over 42 rows. The failures and the deviation recorded in §5.2 (F-1, F-2, IQ-DEV-001) were closed by WA and WD before the 2026-09-21 re-executions (VSR-001 §8, §10).

### 5.3 Result of the first local execution (2026-09-21, W3a — superseded; later executions: VSR-001 §8.2, §10.2)

See the record. Summary: 13 pass, 2 fail, 1 deviation. Fails: OQ-PROJ-06 (audit chain verifier answered 409 `ok:false`, broken at an audit_logs row — VSR-001 finding F-1) and OQ-PROJ-06b (audit ledger surface read model `audit_events` empty — finding F-2). Deviation: OQ-PROJ-11 (IQ-DEV-001).

## Signature block

| Role | Name | Signature | Date |
|---|---|---|---|
| Executed by (automation owner) | | *unsigned* | |
| Reviewed by (qualified validation contractor) | | *unsigned* | |
| Approved by (founder / system owner) | | *unsigned* | |
