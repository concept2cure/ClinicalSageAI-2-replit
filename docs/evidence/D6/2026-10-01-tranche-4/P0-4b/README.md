# P0-4b: ending a session ends it (IAM-04 (b))

Row **D6**. Plan **P0-4b**. Security audit 2026-09-24 **IAM-04 (b)**: "no per-user
`session_version`; `terminateAllSessions` ignored". 21 CFR 11.300(c), 11.10(d);
HIPAA 164.312(a)(2)(iii). Audited at HEAD `66e82a6d`, 2026-10-01.

## What was asked, and what HEAD did

All four checks below come from `tests/db/session-termination.dbtest.ts`. It runs the
real stack: production's `registerPlatformRoutes`, the global `/api` gate, a
router's own gate (`authenticateToken`), the `/api/auth/session` probe,
`POST /api/auth/refresh`, and `POST /api/auth/enterprise/refresh-token`. The
database is PostgreSQL 16, reached as a NOSUPERUSER NOBYPASSRLS runtime role,
with `RLS_ENFORCE=on`. Sign-in uses a password and TOTP.

| # | Ask | At HEAD | Now |
|---|---|---|---|
| 1 | A password change ends every other session, access and refresh, at every door including the enterprise one | **held** (P0-4a, `613c6e00`) | holds |
| 1 | A password reset by emailed token ends the account's sessions | **held** | holds |
| 1 | …including a session whose refresh token rotated in the same second as the change, before it | **FAILED**: the rotated session was admitted at every door and kept refreshing | ended |
| 2 | `POST /api/auth/logout {terminateAllSessions: true}` ends every session of the account | **FAILED**: the other session was admitted at every door. The flag was never read. | ended at every door, enterprise included |
| 2 | A sign-out everywhere sent with a session that has already ended does not report success | **FAILED**: it answered `200 "Tokens invalidated."` | `401`, and nothing is ended |
| 3 | A session held across a suspension stays ended after reactivation | **FAILED**: refused while suspended, then admitted again with the same token | ended |
| 3 | A session held across an IdP deprovisioning stays ended after reactivation | **FAILED**: same | ended |
| 3 | A member removed from the organisation is refused at the next request and mints nothing | **held** | holds (but see residual R1) |
| 4 | A role change takes effect on the next request (P1-4) | **held**: the gate serves the role from the database, and the refresh mints the new role | holds |

No server route lets an administrator end another person's sessions. The admin
tools that act on sessions are suspension (`PATCH /api/admin/users/:id/status`,
`routes/admin/master-admin.ts`) and IdP deprovisioning (`routes/scim.ts`); rows 3
cover both. The client's `getSessions`, `terminateSession` and
`terminateAllOtherSessions` (`client/src/services/portal/authService.tsx`) call
`/api/auth/sessions…` endpoints that do not exist on the server, and no UI calls
them (residual R4).

## The defects

1. **`terminateAllSessions` was never read.** The client sends it
   (`authService.logout(true)`). The route revoked the pair it was handed and
   answered "Tokens invalidated.", and every other session carried on.
2. **Suspension paused a session instead of ending it.** `users.status` is read on
   every request, so a suspended account's session was refused. Nothing recorded
   that the session had been ended, so reactivation admitted the same token again.
   The same was true of SCIM deprovisioning.
3. **A session could outlive a password change by rotating in the same second.**
   The check compared the token's `iat` with `password_changed_at`, both in whole
   seconds. A refresh at .2 s of the second the password changed at .7 s minted a
   pair whose `iat` equals that second, so it was "not before" the change. It
   refreshed for the rest of the session's 12-hour life.

## What is true now: one mechanism, extended

The schema already ended sessions with a stamp: `users.password_changed_at`,
compared with the token by every authenticator through `readAccountStanding`.
This change adds that stamp's sibling and does not build a second mechanism.

- **`users.sessions_ended_at`** (TIMESTAMPTZ),
  `migrations/20261001_users_sessions_ended_at.sql`. It is read in the same
  primary-key statement as `status` and `password_changed_at`
  (`server/services/account-standing.ts`). Together the two stamps are the
  per-user session version the plan asks for.
- **`sessionEndedByStanding(claims, standing)`** is the one check every door
  makes: the `/api` gate (`server/auth.ts`), a router's gate
  (`server/middleware/auth.ts`), `verifyLiveToken`
  (`server/services/token-revocation.ts`) and the refresh (`server/routes/auth.ts`).
  A session is over when it **began** (`sst`, which every rotation keeps; a
  token without one falls back to its `iat`) before the later of the two
  stamps. A rotation cannot move a session's start, which closes defect 3.
- **The refresh reads the canonical standing.** Before, it read the account
  row's own `status` and `password_changed_at`, a second reading that could not
  see the new stamp. That parallel reading is gone.
- **Sign-out everywhere** (`signOutEverywhere`, `server/routes/auth.ts`). The
  bearer must be a live access token (`verifyLiveToken`); otherwise the answer is
  401 and nothing is ended. It then stamps `sessions_ended_at` from the
  server's clock with `endEverySessionOf`, which never moves the stamp
  backwards. It also revokes the presented pair, frees the session's slot, and
  writes a `user_logout` audit row with the reason "signed out of every session".
- **Leaving `active` stamps it, whoever writes the status.** A `BEFORE UPDATE OF
  status` trigger fires when `OLD.status = 'active'` and the new status is
  anything else. It uses `GREATEST`, so the stamp never moves backwards. A
  sign-up confirmation (`pending_verification` → `active`) ends nothing.
- `terminateOtherSessions` on `POST /password/change` is not read and is not an
  opt-out. A password change ends every session that began before it, the
  changer's own included. That was already true since P0-4a; the route now says
  so.

## Red, then green

| | File | What it shows |
|---|---|---|
| red | `red/session-termination.dbtest.at-HEAD.txt` | 5 failed / 6 passed against the unfixed code: rows 1c, 2a, 2b, 3a and 3b above |
| red | `red/mutant-session-measured-from-iat.txt` | Fixed code with `sessionEndedByStanding` measuring from `iat`: only the same-second rotation case fails, as it should |
| red | `red/mutant-trigger-disabled.txt` | Fixed code with the trigger disabled on the database: the suspension, deprovisioning and stamp cases fail |
| red | `red/mutant-stamp-without-greatest.txt` | `endEverySessionOf` without `GREATEST`: "a sign-out everywhere moved the stamp backwards" |
| red (did not fail) | `red/gate-column-reachability-with-migration-unwired.did-not-fail.txt` | With the file removed from the set (in a scratch copy of the tree), `ci:column-reachability` still passes. A column of the push-created public `users` table counts as durable, the same blind spot IAM-18-8 recorded. The dbtest and the journey run below are what prove the migration. |
| green | `green/session-termination.dbtest.txt` | 12/12 |
| green | `green/db-tier-neighbours.txt` | 9 dbtest files, 114/114: account-standing, memberships, one-time-credentials, second-factor-binding, sign-in-audit-trail, sign-in-posture, signing-lockout, users-rls and this one |
| green | `green/unit-suites-changed.txt` | 8 files, 93/93: the unit and contract suites this change edited, plus both session-currency suites of the gates |
| green | `green/unit-neighbours-148-files.txt` | 148 files that import the standing, revocation, session or auth modules: 1508 passed, 11 failed. **None of the 11 is this change's.** estar-build-pma-package (5) and estar-export-governance (3) fail because a mock lacks `createAuditedUnplacedExport` (another lane's in-flight export change). predicate-intelligence-error-containment (1) and qms-legacy-api-retired (1) are other lanes' new untracked tests. ind-authoring.journey (1) needs the one line in "Proposed changes" below. |
| green | `green/ind-authoring-journey-with-proposed-line.txt` | A throwaway copy of the journey with the proposed line added passes. The copy was deleted after the run. |
| green | `green/gates-and-eslint.txt` | All exit 0: `ci:migration-drop-safety`, `ci:migration-set-order`, `ci:column-reachability`, `ci:model-migration-agreement`, `ci:migration-prefix-collisions`, `ci:migration-reachability`, `ci:insert-columns-declared` and `check:security-patterns` (0 violations). ESLint findings per changed file are unchanged from HEAD; the new dbtest has none. |
| observation | `observations/probe-removal-then-readd.txt` | Residual R1, measured with a probe case that was not kept |

A note on the earlier attempt this run resumed. It had left only the dbtest
(untracked) and empty `red/` and `green/` folders. Its first run failed three
password-change cases for a reason in the test itself: the new password
contained "Dbste", the e-mail's local part, and the password policy refused it
with a 400. With a compliant password those three cases pass at HEAD, as the
table shows. The shared test database already held a `users.sessions_ended_at`
column and a trigger of the same name from that attempt, with no file behind
them. The file was applied over them with psql in one transaction as the owner;
it replays cleanly (`ALTER … IF NOT EXISTS` skips, the function is replaced, and
the trigger is dropped and re-created).

## Commands

```
# database tier (the shared PostgreSQL 16)
TEST_DATABASE_URL=… APP_DATABASE_URL=… RLS_ENFORCE=on \
  npx vitest run --config vitest.db.config.ts tests/db/session-termination.dbtest.ts
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f migrations/20261001_users_sessions_ended_at.sql
# unit
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run server/services/__tests__/account-standing-session-currency.test.ts \
  server/routes/__tests__/auth-refresh-session-currency.test.ts server/routes/__tests__/auth-refresh-inactivity.test.ts \
  tests/field-sync-auth.contract.test.ts tests/socket-tenant-isolation.contract.test.ts \
  server/services/collab/__tests__/collab-governance.pglite.integration.test.ts
# gates
npm run -s ci:migration-drop-safety && npm run -s ci:migration-set-order && npm run -s ci:column-reachability && \
npm run -s ci:model-migration-agreement && npm run -s ci:migration-prefix-collisions && \
npm run -s ci:migration-reachability && npm run -s ci:insert-columns-declared && npm run -s check:security-patterns
```

The migration manifest was **not** regenerated and needs regenerating.

## Proposed changes to files this item does not own

- `tests/golden-journeys/ind-authoring.journey.test.ts` has another lane's
  uncommitted DP-35 edits. Its `migrations:` list needs one line after
  `'db/migrations/20260725_users_signing_lockout_columns.sql',`:
  `'migrations/20261001_users_sessions_ended_at.sql',`. Without it the journey
  stops at its schema-gap check with `[42703] column "sessions_ended_at" does not
  exist`. With it, the journey passes (`green/ind-authoring-journey-with-proposed-line.txt`).
- `server/services/audit/auth-event-audit.ts` `EVENT_DESCRIPTIONS`, one entry:
  `'user_logout|success|signed out of every session': 'Signed out of every session of the account'`.
  Until it is added, the ledger shows the fallback "user logout: success
  (signed out of every session)".
- Optional: `server/db/bootstrap/auth-schema.ts` could add
  `ADD COLUMN IF NOT EXISTS sessions_ended_at TIMESTAMPTZ`. A database that has
  not run the migration set fails closed: every authenticated request gets
  503 `SESSION_UNCHECKED`. Deploys run the set before serving. The recent
  precedent (`email_otp_resends`) left bootstrap alone, so this is a decision,
  not a gap.

## Residuals

- **R1: removal from the organisation pauses a session; re-adding revives it.**
  Measured (`observations/probe-removal-then-readd.txt`): while removed, the
  session gets 401. Once the membership row is inserted again within the
  session's 12-hour life, the same token gets 200 at the gate, the router gate,
  the probe, and the refresh. This is the defect 2 pattern applied to
  membership. There are two fixes, and choosing between them is a product
  decision:
  - (a) A `BEFORE DELETE` trigger on `organization_users` stamps the account's
    `sessions_ended_at`. It is simple, but it also signs the person out of every
    other organisation, so one tenant's administrator can end sessions in another.
  - (b) The gate and the refresh compare a session's start with the membership
    row's `created_at`. This is precise per organisation, but it changes
    `server/middleware/orgMembership.ts` and its cache, and it compares the
    database clock with the app clock.

  The P1-22-org lane is editing membership code (`server/routes/tenant-users.ts`,
  `server/services/tenant/membership-change.ts`) now.
- **R2: connector (MCP) grants.** A connector *access* token is checked by
  `verifyLiveToken` and so ends with the account's sessions. The connector's OAuth
  refresh grant (`server/mcp/auth/provider.ts`) checks only `status`. It mints a
  new connector token after a sign-out everywhere or a password change, and again
  after a reactivation. This belongs to the IAM-02 lane.
- **R3: same-second sign-in.** A session that *starts* in the same wall-clock
  second as a sign-out everywhere or a password change, before it, survives. To
  use this, an attacker must complete a password-and-TOTP sign-in inside that
  second. The suspension stamp comes from the database clock and sessions are
  stamped from the app clock, so app-ahead-of-database skew widens this window
  by the skew (NTP: milliseconds).
- **R4: client.** `authService.logout(true)` swallows a refused sign-out
  everywhere (`catch {}`) and clears local state as if it had succeeded. No UI
  calls it today. `getSessions`, `terminateSession` and
  `terminateAllOtherSessions` call endpoints that do not exist. These are client
  files and outside this item.
- Ended sessions keep their concurrent-session registry slot until they are
  pruned or evicted. The oldest are evicted first, and those are the ended ones,
  so nothing live is displaced.

---

## Fix round (2026-10-01, on HEAD `0812a990` + working tree)

This round resumed the uncommitted work above. It took the verifier's two
must-fix findings and the product decisions on R1, R2 and R3. Every red and
green file named below is a real run, saved as it printed.

### What was wrong, and what changed

**(1) Harnesses built from a hand-listed migration set failed on the new column.**
The standing statement reads `users.sessions_ended_at`. A harness that replays
only the migrations it lists, and not the one that adds the column, refuses every
signature with `REAUTH_ACCOUNT_STATE_UNKNOWN`, fail-closed. The line
`'migrations/20261001_users_sessions_ended_at.sql'` now follows
`20260725_users_signing_lockout_columns` in these harnesses:
`tests/golden-journeys/drug-nda-ectd.journey.test.ts` (in all three of its lists),
`submission-release-signature.journey.test.ts`, `ind-authoring.journey.test.ts`,
`tests/lineage/founder-path-lineage.pglite.test.ts` and
`tests/schema-contract/esignature-verify-roundtrip.contract.test.ts`. This
replaces "Proposed changes" item 1 above. Green: `green/harnesses-five.fix-round.txt`, 5 files, 22/22.

**(2) After a role change, a router gate served the old role for up to a minute.**
`applyOrganizationRole` (`server/middleware/auth.ts`) took the role from
`enforceOrgMembership`'s 60-second cache. Role writers clear that cache only on
the server task that wrote, so on every other task a demoted administrator still
passed `requireRole('admin')` behind a router gate. The global gate in front of
it already served the new role. The router gate now takes the role that the
`/api` gate read from `organization_users` on the same request (`req.identity`).
It takes that role only when the account and the organisation match. When there
is no such reading, it falls back to the cache.
- red: `red/role-from-gate.session-termination.mutant.txt` (case 4: "a router's
  gate behind the global gate served the cached role", and "requireRole('admin')
  admitted the demoted member … expected 200 to be 403") and
  `red/role-from-gate.auth-role-from-database.mutant.txt` (1 failed / 7). Both
  ran against a mutant that restores the cache-only reading. The mutant was
  removed afterwards, and the file is byte-identical to before.
- green: case (4) in `green/session-termination.dbtest.fix-round.txt`;
  `auth-role-from-database.test.ts` 8/8 in `green/unit-owned-auth-mcp.fix-round.txt`.

**(3) R1: removing a member now ends that organisation's sessions durably.**
`organization_users.created_at` exists (`timestamp without time zone NOT NULL
DEFAULT now()`), so this item did not need to be reported as blocked, and no
column was added. When the caller names an organisation, `readAccountStanding(userId,
organizationId)` (`server/services/account-standing.ts`) also reads, in the same
statement, when the account's membership in that organisation began.
`sessionEndedByStanding` then compares the session's start (`sst`, else `iat`)
with the latest of three stamps: the password change, the end of every session,
and the start of the membership. This is one check, made at every door:
- the `/api` gate (`server/auth.ts`), using the token's organisation;
- a router's gate (`server/middleware/auth.ts`), using the token's organisation;
- `verifyLiveToken` (`server/services/token-revocation.ts`), using the token's
  organisation. This covers the session probe, the enterprise refresh,
  select-organization, sockets and the connector bearer;
- the refresh (`server/routes/auth.ts`). It now chooses the organisation first
  and then reads the standing for that organisation once;
- the second factor of a sign-in;
- the connector's `/token` exchanges.

The comparison is strict and in whole seconds. A session that began in the same
second as the membership is current. Sign-up, SSO provisioning and first-run
setup create the membership and begin the session in one request, so they rely
on this. A removed member cannot begin a session in that organisation while
removed, so the shared second opens nothing.
`organizationIdOfClaims` is the one reader of a token's organisation.
`accountIdOfClaims` and `organizationIdOfClaims` now share the integer parsing.
- red: `red/r1-r3.session-termination.before.txt`, "a member removed and re-added
  …": the `/api` gate admitted the old session (`expected 200 to be 401`).
  `red/r1-r3.account-standing-unit.before.txt` shows the unit cases failing.
- green: case (3) R1 passes at every door. The enterprise refresh is refused.
  The router gate behind `/api` is refused. A new sign-in after the re-add is
  current and refreshes.

**(4) R2: connector grants end with the account's sessions.**
`liveGrantorMembership` (`server/mcp/auth/provider.ts`) now asks
`sessionEndedByStanding({ iat: issuedAt }, standing)`, with the standing read
for the grant's organisation. Before, it asked a second, narrower question:
`sessionPredatesPasswordChange` on `password_changed_at` only. As a result, a
sign-out everywhere, a suspension and a deprovisioning now end the access token,
the refresh token and any unredeemed code. They stay ended after reactivation. A
fresh sign-in connects again. The refusal reads "This connection ended after it
was authorised: the password was changed, every session was signed out, the
account was taken out of use, or its membership changed. Connect Concept2Cure
again." The P1-47 lane's `findGrantMembership` line in the same function was
kept as they wrote it.
- red: `red/r2-mcp-account-standing.before.txt`, 3 failed / 16. A grant made
  before a suspension or a deprovisioning "refreshed again once it was back in
  use" (200). A connector token issued before a sign-out everywhere still
  opened `/mcp`.
- green: `green/r2-mcp-account-standing.fix-round.txt`, 16/16.
- The suite's fixture held one session per member for the whole run. On the
  tree as it stood when this round began, the first suspension stamp had already
  ended that session, and two later cases failed at consent ("This session has
  ended"). Each case that needs a session now signs in again (`signInAgain`).

**(5) R3: a session begun in the same second as a password change.**

*The test.* `tests/db/session-termination.dbtest.ts` case (6) has two arms:
- (i) a session begun at .1 s of the second a password change lands in (at .6 s)
  must be over at every door;
- (ii) the sign-in that follows the change must be current. The holder signs in
  on a clock advanced by the real time the change took to answer.

A token records its start in whole seconds, so no comparison of whole seconds
can satisfy both arms by itself:

| Rule | Arm (i) | Arm (ii) | File |
|---|---|---|---|
| A: stamp = the event's own instant, strict `<` (the rule before this round) | **fails**: the same-second session is admitted | passes | `red/r3-decision.mutant-A-strict-own-second.txt` |
| B: stamp = the event's own instant, inclusive `<=` | passes | **fails**: the follower's sign-in is refused at its second factor | `red/r3-decision.mutant-B-inclusive-own-second.txt` |
| **Chosen**: stamp = the first whole second after the event, strict `<`, and the writer answers once that second has begun | passes | passes | `green/session-termination.dbtest.fix-round.txt` |

*The choice.* An ending stamp is the first whole second after its event:
`endingStampOf` in `account-standing.ts`. Every session begun in the event's own
second is therefore before the stamp. The writer waits for that second before it
answers (`untilStampHasBegun`, at most one second), so the sign-in that follows
begins in the stamp's second or later and is current. The comparison stays strict
everywhere, the same as for a membership's start.

*Where it applies.* Every writer stamps this way:
- the password change and the reset (`passwordChangedAt: endingStampOf()`, then
  wait);
- the sign-out everywhere (`endEverySessionOf` writes `endingStampOf(at)`, and
  the route waits);
- the trigger in `migrations/20261001_users_sessions_ended_at.sql`, which now
  writes `date_trunc('second', now()) + 1 s`. That migration file is new and
  uncommitted, so it was amended in place with a dated note. It was re-applied
  to the shared test database with `psql -1`.

*Cost.* The answer to a password change, a reset or a sign-out everywhere takes
up to one second longer.

*The second factor.* The tests also showed a sign-in whose password was checked
before the change and whose second factor arrived after it. That sign-in became
a full session: the five-minute challenge outlived the change.
`refuseAccountAtSecondFactor` now asks the challenge the same question
(`sessionEndedByStanding` on the challenge's `iat`). It answers
`401 MFA_002 "This sign-in has ended. Sign in again."` and writes a `user_login`
failure audit row with the reason `sign_in_begun_before_sessions_ended`.
- red: `red/r1-r3.session-termination.before.txt`. All three R3 cases failed
  against the code before the change. Arm (i) failed with "the /api gate still
  admitted it". The challenge case failed with "a sign-in begun before the
  password change became a session after it".
- green: case (6) passes, 3/3.

### Tests and their files

| Suite | Red | Green |
|---|---|---|
| `tests/db/session-termination.dbtest.ts` (16 cases) | `red/r1-r3.session-termination.before.txt` (4 failed), `red/role-from-gate.session-termination.mutant.txt`, `red/r3-decision.*` | `green/session-termination.dbtest.fix-round.txt` 16/16 |
| `server/mcp/__tests__/mcp-account-standing.dbtest.ts` | `red/r2-mcp-account-standing.before.txt` (3 failed) | `green/r2-mcp-account-standing.fix-round.txt` 16/16 |
| `server/services/__tests__/account-standing-session-currency.test.ts` | `red/r1-r3.account-standing-unit.before.txt` (7 failed) | in `green/unit-owned-auth-mcp.fix-round.txt` |
| owned unit/contract suites + `server/routes/__tests__/auth*` + `server/middleware/__tests__/auth*` + `server/mcp/__tests__` | — | `green/unit-owned-auth-mcp.fix-round.txt`: 68 files pass; 1 fails (`auth-mfa-totp-lockout`, see residual 1) |
| five harnesses | — | `green/harnesses-five.fix-round.txt` 22/22 |
| database tier, 14 files | — | `green/db-tier.fix-round.txt`: 164 passed, 9 failed, all in residual 2 |
| 238 neighbour files | — | `green/unit-neighbours-238-files.txt`: 2655 passed, 33 failed (accounted for below) |

Three fixtures that build `organization_users` (or no such table) by hand were
given `created_at`, as `migrations/0000_sweet_joseph.sql` defines it:
`tests/field-sync-auth.contract.test.ts`,
`tests/socket-tenant-isolation.contract.test.ts` and
`server/services/collab/__tests__/collab-governance.pglite.integration.test.ts`.
Without it the standing statement fails, and fails closed.

The 33 failures in the 238-file sweep:
- 8 are `auth-mfa-totp-lockout` (residual 1).
- 14 are `approval-workflow.contract.test.ts`. Its JWT double mints claims
  without `type: 'access'`, which IAM-23 (`bf83e12b`, committed) refuses. That
  route does not touch the standing.
- 11 are in three P1-17 containment suites (`evidence-sufficiency-5xx`,
  `predicate-intelligence-error`, `se-matrix-5xx`). These mock `middleware/auth`
  wholesale, so this change cannot reach them.

The first round's 148-file grep missed `auth-mfa-totp-lockout` because that
suite imports `../auth` dynamically. This round's grep includes dynamic imports.

### Gates (`green/gates-fix-round.txt`, `green/eslint-fix-round.txt`)

Exit 0:
- `check:security-patterns`
- `ci:server-error-leaks`
- `ci:sign-ceremony`
- `ci:unreferenced-modules`
- `ci:untracked-imports`
- `ci:migration-set-order`
- `ci:migration-drop-safety`
- `db:sync-manifest:check` ("Manifest is in sync")
- `ci:column-reachability`
- `ci:model-migration-agreement`
- `ci:migration-reachability`
- `ci:insert-columns-declared`

`ci:launch-scope-api` exits 1 on `[unmapped] /api/tenant-config/:p/claude-connector`,
called by `client/src/concept2cure/v2/surfaces/ClaudeConnectorSetting.tsx`. That
is P1-47's in-flight surface, not this item's.

ESLint: the ratchet's `--since HEAD` mode reports net −1 across the changed
tracked files, and none of this item's files gained a warning. Two files were
trimmed to stay under `max-lines`: `collab-governance` (its fixture line folded
into the existing statement) and the new dbtest (`signIn` delegates to
`signInAt`). The new dbtest lints clean.

### What remains (residuals; none is this item's file)

1. **`shared/schema.ts`, the `users` model.** Add
   `sessionsEndedAt: timestamp('sessions_ended_at', { withTimezone: true }),`
   (the column the migration creates). `auth-mfa-totp-lockout.pglite.integration.test.ts`
   generates its tables from the model and fails 8/8 with `[42703] column
   "sessions_ended_at" does not exist`. This has been true since the first round,
   whose standing read added the column. A throwaway copy with the column passes
   8/8 (`green/auth-mfa-totp-lockout-with-proposed-model-column.txt`; the copy
   was deleted).
2. **Faked-clock dbtests.** These suites sign in on a clock set behind the
   database's but insert memberships with the database's `now()`, so their
   fixture membership "begins" after the session (R1). One line in each
   `addMember` fixes it:
   `INSERT INTO organization_users (organization_id, user_id, role, created_at) VALUES ($1, $2, 'admin', $3::timestamp)`
   with `new Date(T0 - 60_000).toISOString()`.
   - `tests/db/one-time-credentials.dbtest.ts` (8 fail) and
     `tests/db/sign-in-posture.dbtest.ts` (1 fails): both pass 28/28 with that
     line (`green/faked-clock-dbtests-with-proposed-membership-start.txt`;
     throwaway copies, deleted).
   - `account-standing`, `second-factor-binding` and `signing-lockout` passed
     here, but they insert the same way and depend on timing: they fail when
     their `beforeAll` outlasts the margin between `T0` and their first sign-in.
     Each needs the same line.
3. **The enterprise sign-in door** (`server/routes/authEnterprise.ts`). Its
   second factor completes a challenge (`partialToken`, about line 422; session
   at about line 641) without asking whether the account's sessions were ended
   since the first factor. The `/api/auth` door now asks this. Proposed: the same
   `sessionEndedByStanding(jwt.decode(partialToken), await
   readAccountStanding(userId, organizationIdOfClaims(partial)))` refusal before
   it opens a session.
4. **select-organization under R1** (`authEnterprise.ts`). It carries the
   session's `sst` into the token for the organisation chosen. A member invited
   into an organisation during a session and switching to it by this route gets
   a token whose session predates the membership. The gates refuse it ("This
   session has ended. Sign in again."), and the person signs in again. This
   fails closed. No client calls the route today. If the switch should keep
   working without a sign-in, the route should open a new session (`openSession`)
   for the organisation instead of continuing the old one. That is a product
   decision.
5. **`server/services/audit/auth-event-audit.ts` `EVENT_DESCRIPTIONS`.** Two
   entries are needed (the first was also proposed above):
   - `'user_logout|success|signed out of every session': 'Signed out of every session of the account'`
   - `'user_login|failure|sign_in_begun_before_sessions_ended': 'Sign-in refused: begun before the account's sessions were ended'`
6. **Clocks and timezone.** The membership start and the suspension stamp come
   from the database clock; sessions are stamped by the app clock.
   - If the database clock runs ahead of the app clock, a sign-up or SSO
     provisioning that creates the membership and the session in one request can
     find its session "before" the membership. The odds are about (skew in ms) ÷
     1000 per sign-up. With NTP the skew is in milliseconds.
   - `created_at` is a naive timestamp, read as UTC, as `password_changed_at`
     is. Deploys run the database in UTC. **Superseded by Fix round 2:** nothing
     enforced that, and under any other zone the reading was wrong by the
     offset. The standing now reads `created_at` in the zone it was written in.
7. **Still open from the first round:** R4 (client `logout(true)` swallows a
   refusal; the client's sessions endpoints do not exist) and the optional
   `auth-schema.ts` bootstrap line.

`server/routes/scim.ts` and `server/services/tenant/membership-change.ts` also
show as modified in the working tree. Those changes belong to other lanes
(P1-49, P1-22-org), not to this item.

---

## Fix round 2 (2026-10-01, on HEAD `0812a990` + working tree)

The verifier returned three must-fix findings. This item fixed the one in its own
files (3, the time zone). The other two (1 and 2) are changes to files this item
does not own. They are written as patches under `proposed/`, each checked with
`git apply --check` against the tree, and each run green with the patch applied.
Every file named below is a real run, saved as it printed. Files from this round
are under `red/fix-round/` and `green/fix-round/`.

### (3) The membership start depended on the database's time zone (fixed)

**What was wrong.** R1 reads `organization_users.created_at`. That column is a
`timestamp without time zone DEFAULT now()` (`migrations/0000_sweet_joseph.sql`).
Every writer leaves it to that default: sign-up and setup through drizzle, SSO
through drizzle, SCIM, the invitation and quota paths, and the seeds. So the
column holds the writing connection's local time. The standing read it as UTC
(`date_part('epoch', created_at)`). Nothing pins or asserts the database's
TimeZone: not Terraform, not `server/db`, not the deploy workflow. Residual 6 of
the first fix round said "deploys run the database in UTC", but nothing enforced it.
- Under `Asia/Tokyo` the membership read 32 400 s in the future. Every session
  begun in the 9 h after a membership was created was refused as ended at every
  door.
- Under `America/Los_Angeles` it read 25 200 s in the past. A session older
  than its membership stayed current, so R1 was weakened by the offset.

`password_changed_at` does not have this problem. The app writes it through
drizzle as `toISOString()`, which a naive column stores as UTC wall time.
`sessions_ended_at` is `timestamptz`.

**What changed.** `server/services/account-standing.ts` `readAccountStanding`
now reads
`floor(date_part('epoch', created_at AT TIME ZONE current_setting('TimeZone')))::bigint`.
This reads the naive value in the zone of the connection reading it. That is the
zone every writer's default wrote it in, because no connection sets its own
TimeZone (searched: `server/db`, `scripts/db`, `terraform`). The doc comment
says why.

The two fixtures in `tests/db/session-termination.dbtest.ts` that set
`created_at` by hand now cast `::timestamptz` instead of `::timestamp`. The
naive column then holds the value in the connection's zone, as `now()` would.
`::timestamp` stores UTC wall time and would be wrong on a test database that is
not in UTC.

**Test.** The new file is `tests/db/account-standing-time-zone.dbtest.ts`
(lane `dbstz`, organisation 93331). It covers three zones: `Etc/UTC` (the
control), `Asia/Tokyo` and `America/Los_Angeles`. In each zone it does this:
- The membership is written by the column default, through a connection in that
  zone.
- The production standing statement reads it through the runtime pool
  (`server/db/runtime.ts`). The test opens that pool in the same zone with
  `PGOPTIONS`, which the pool passes through. The test first asserts that the
  reader's `SHOW TimeZone` is the zone under test, so it cannot pass vacuously
  in UTC.
- A session begun after the membership (the wall-clock second after the
  insert) must be current. One begun before it (the second before the insert)
  must be over. The membership must read between those two seconds.

Results:
- red: `red/fix-round/time-zone.account-standing-time-zone.before.txt`, 2 of 3
  failed. UTC passed. Tokyo read +32 400 s: "a session begun after the
  membership was ended". Los Angeles read −25 200 s: "a session begun before
  the membership stayed current".
- green: `green/fix-round/time-zone.account-standing-time-zone.txt`, 3/3.
- `green/fix-round/owned-dbtests.txt`: this file, `session-termination` (with
  the `::timestamptz` fixtures) and `mcp-account-standing`, 35/35.

**What a boot assertion would add.** It is not needed for correctness. The
reading is now right in any zone, as long as writer and reader share it. One
edge remains in zones with daylight saving. PostgreSQL reads the repeated hour
of a fall-back as standard time, the later of the two instants
(`observations/probe-dst-fall-back-reading.txt`). So a membership created in
the first pass of that hour reads up to one hour late. A session begun in that
hour after it is refused once, and the person signs in again. This fails closed,
for one hour a year, and never in UTC or Asia/Tokyo. Making `created_at`
`timestamptz` would remove it. That is a schema change to a table this item does
not own, so it is not proposed here.

### (1) `shared/schema.ts` lacks `users.sessions_ended_at` (proposed, not applied)

`server/routes/__tests__/auth-mfa-totp-lockout.pglite.integration.test.ts`
generates its tables from the drizzle model. The standing statement selects
`users.sessions_ended_at`, so the suite fails 8/8 with `column
"sessions_ended_at" does not exist`
(`red/fix-round/auth-mfa-totp-lockout.tree-without-schema-patch.txt`).
`ci:model-migration-agreement` does not catch this, because it does not check
migration-to-model.

- Patch: `proposed/shared-schema-sessions-ended-at.patch`. It adds one line
  beside `passwordChangedAt`, with a two-line comment:
  `sessionsEndedAt: timestamp('sessions_ended_at', { withTimezone: true }),`
- With the patch applied, the lockout suite passes 8/8, unmodified
  (`green/fix-round/auth-mfa-totp-lockout.with-proposed-schema-patch.txt`).
  The owned and auth/MCP unit set passes 74 files, 674/674
  (`green/fix-round/unit-owned-auth-mcp.with-proposed-schema-patch.txt`).
  Without the patch, the same set has 73 files passing and the lockout suite
  failing 8/8 (`green/fix-round/unit-owned-auth-mcp.txt`).
- `ci:model-migration-agreement` exits 0 before and after, with identical output
  (`green/fix-round/model-migration-agreement.with-proposed-schema-patch.txt`).
  `db:sync-manifest:check` reads only `db/migrations`, so the patch does not
  touch it.
- ESLint: `shared/schema.ts` has 2 warnings before and 2 after
  (`green/fix-round/eslint.txt`).
- `insertUserSchema` is used by no non-test server code, so the new column opens
  no path for a request to supply it.

### (2) Faked-clock dbtests start their membership after their sessions (proposed, not applied)

Each `addMember` inserts the membership with the database's `now()`. The suite's
faked `Date` (T0) is up to 25 s behind the wall clock. Under R1 the membership
therefore "begins" after the suite's own sessions and ends them.

On the tree, the eight neighbour files run 9 failed / 84 passed
(`red/fix-round/db-neighbours-eight.tree-without-proposed-patch.txt`):
- `one-time-credentials`: 8 failed;
- `sign-in-posture`: 1 failed.

`account-standing`, `second-factor-binding` and `signing-lockout` passed in this
run. They insert the same way, so they fail whenever their `beforeAll` outlasts
the gap.

- Patch: `proposed/faked-clock-membership-start.patch`. It changes all five
  files with the same three comment lines and one statement:
  `INSERT INTO organization_users (organization_id, user_id, role, created_at) VALUES ($1, $2, 'admin', $3::timestamptz)`
  with `new Date(T0 - 60_000).toISOString()`.
  It uses `::timestamptz` rather than `::timestamp` for the reason given in (3).
- With both patches applied, the eight neighbour files and the time-zone dbtest
  pass 9 files, 96/96
  (`green/fix-round/db-neighbours-eight.with-proposed-patches.txt`).
  The verifier expected 102 for the eight files. The eight files hold 93 tests;
  the 102 counted the failure summary lines twice.
- The other six files of round 1's database tier pass on the tree as it stands,
  88/88 (`green/fix-round/db-other-six.txt`). That includes `mcp-connector` and
  `mcp-consent-delegated`.
- ESLint: the five patched files have the same warning counts as the tree
  (`green/fix-round/eslint.txt`).

*How the patches were run.* The patched files were never written into the
shared tree. The tree was copied to a scratch directory (`server`, `shared`,
`tests`, `scripts`, `migrations`, `db`, `client/src`, the configs, and
`node_modules` linked). Both patches were applied there with `patch -p1`, and
vitest ran there against the shared PostgreSQL. The copy was then deleted.

### Gates (`green/fix-round/gates.txt`, `green/fix-round/eslint.txt`)

Exit 0:
- `check:security-patterns`
- `ci:server-error-leaks`
- `ci:sign-ceremony`
- `ci:unreferenced-modules`
- `ci:untracked-imports`
- `ci:migration-set-order`
- `ci:migration-drop-safety`
- `db:sync-manifest:check`
- `ci:model-migration-agreement`
- `ci:column-reachability`
- `ci:migration-reachability`
- `ci:insert-columns-declared`
- `ci:check-unrun-tests` (the new dbtest is reachable by a runner)

Exit 1: `ci:launch-scope-api`, on `[unmapped]
/api/tenant-config/:p/claude-connector`. It is called by P1-47's
`ClaudeConnectorSetting.tsx`, the same finding as the previous round. It is not
this item's.

ESLint: `server/services/account-standing.ts`,
`tests/db/session-termination.dbtest.ts` and
`tests/db/account-standing-time-zone.dbtest.ts` have 0 errors and 0 warnings.
The HEAD version of `account-standing.ts` also has 0.

### What remains

1. **Apply `proposed/shared-schema-sessions-ended-at.patch`**
   (`shared/schema.ts`, not this item's). Until it is applied,
   `auth-mfa-totp-lockout` fails 8/8. After applying, re-run that suite (8/8),
   `ci:model-migration-agreement` and `db:sync-manifest:check`.
2. **Apply `proposed/faked-clock-membership-start.patch`** (five `tests/db`
   files, not this item's). Until it is applied, `one-time-credentials` and
   `sign-in-posture` fail. The other three are flaky. After applying, re-run the
   eight neighbour files (93/93).
3. The first fix round's residuals 3, 4, 5 and 7 stand as written. Residual 6
   is superseded by (3) above, except for the clock-skew note, which stands.
   The fall-back hour described in (3) is new.
