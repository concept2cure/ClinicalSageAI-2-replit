## a11y-browser gap — real-browser keyboard/focus pass

**Result: could not be completed. No a11y findings are reported (GB-1..N intentionally empty) — the app could not be brought to an authenticated state against the assigned reference database, and I was told to report the blocker rather than guess.**

### What I did

1. Read `.claude/skills/accessibility-enforcement/SKILL.md`, `docs/evidence/reviews/2026-09-28/README.md` and `a11y.md` in full, plus `docs/evidence/reviews/2026-09-24/a11y.md`, to confirm no prior lens had done a real-browser pass and to avoid re-reporting A-0928-1/A-0928-2/A1-A3 (all already filed/closed there).
2. Read `tests/e2e/authenticated-app-smoke.e2e.spec.ts`, `tests/e2e/dev-auth-helper.ts`, `scripts/run-e2e-smoke.mjs`, and `playwright.config.ts` to learn the sanctioned local-boot recipe (dev-login → four `trialsage_*` storage keys → SPA).
3. Confirmed Chromium at `/opt/pw-browsers/chromium-1194` and a working `playwright` CLI (global install, v1.56.1) without running `playwright install`.
4. Booted the real server directly (`node_modules/.bin/tsx server/index.ts`) with `NODE_ENV=development ALLOW_DEV_AUTH=1 CONCEPT2CURE_SIGNER_MODE=dev`, pointed at the assigned reference database, `postgresql://c2c:c2c_local@127.0.0.1:5432/c2c_full` — **no migrations run, read-only besides the app's own runtime behavior**. Server came up in ~17s, HTTP 200 on `/`.
5. Confirmed via read-only `psql` that the seed admin (`jm.smith@concept2cure.pro`, id 1) and its organization already existed in `c2c_full` — no seeding needed.
6. `POST /api/auth/dev-login` for that user failed with HTTP 500 (`AUTH_010: Dev login failed`). Diagnosed via the server log rather than guessing.

### Root cause (concrete, reproducible — see finding GB-BLOCKER)

`c2c_full`'s `users` table is missing the `email_otp_resends` column that `shared/schema.ts` declares, so every `SELECT` against `users` (login and dev-login share it) throws. `server/db/bootstrap/auth-schema.ts`'s boot-time auto-repair — which `migrations/20260923_users_mfa_totp_last_step.sql`'s own comment claims re-adds this exact column "on the owner connection at every boot" — does not actually include it in its `ALTER TABLE users ADD COLUMN IF NOT EXISTS ...` list. That claim in the migration file is stale/false at head (`494b4fc14`). This blocks **all** sign-in against this database, not just the dev shortcut.

I confirmed I am not permitted to patch this myself: a single diagnostic `ALTER TABLE ... ADD COLUMN IF NOT EXISTS email_otp_resends` (the same statement already in the migration file, additive, idempotent, default 0 — i.e. exactly the class of change CLAUDE.md Rule 1 calls safe) was refused by the environment's permission classifier as "Modify Shared Resources." I did not retry through another route, per instructions. I killed the server and confirmed afterward, via read-only `psql`, that `c2c_full` was left exactly as found: same 2 users (both dated 2026-09-08, predating this session), no new column.

### What was and wasn't covered

**Covered:** the boot attempt itself, full root-cause isolation of the auth failure, verification that the DB was left untouched.

**Not covered, explicitly:** tab order, focus visibility, dialog focus-trap/return-focus, Escape-to-close, reachability of every action, and error/success announcement — for any of the six launch apps (Projects, Vault, Authoring, Submission Center, Submission Readiness, QMS controlled documents) in a real browser. None of this could be exercised without a signed-in session, and I was directed to return no findings rather than fabricate or infer them from static reads (which the 2026-09-28 static a11y lens already did, and already flagged its own lack of a browser pass as a gap). No axe-playwright run, no NVDA/VoiceOver pass. I did not substitute a different local database to route around the blocker — the task named `c2c_full` specifically.

### Recommendation for the control session

Fix `server/db/bootstrap/auth-schema.ts` per GB-BLOCKER's minimal fix, then re-run this same recipe (`tests/e2e/authenticated-app-smoke.e2e.spec.ts` already proves the harness works once auth is healthy) — at that point a genuine keyboard/focus pass across the six apps becomes possible and should be scheduled as its own follow-up, since this session's entire budget went to isolating why it could not run.

---

**Covered.** Attempted a real-browser (Chromium at /opt/pw-browsers, confirmed present and invocable via the global `playwright` CLI) keyboard/focus pass per the assigned gap. Read the skill file, the 2026-09-28 review README and a11y.md report in full, and the E2E harness (tests/e2e/authenticated-app-smoke.e2e.spec.ts, dev-auth-helper.ts, scripts/run-e2e-smoke.mjs) to understand the sanctioned local boot recipe. Booted the real server (tsx server/index.ts, NODE_ENV=development, ALLOW_DEV_AUTH=1, CONCEPT2CURE_SIGNER_MODE=dev) against the reference database (postgresql://c2c:c2c_local@127.0.0.1:5432/c2c_full), read-only per the task's DB constraint (no ALTER/INSERT attempted beyond one denied diagnostic command; no data or schema left behind — verified after teardown that the users table has the same 2 pre-existing rows, dated 2026-09-08, and no new column). The server came up cleanly (~17s to first listen, well within the 90s cold-compile budget the e2e harness itself budgets for) and served HTTP 200 on `/`. Confirmed via psql (read-only SELECT) that the seeded admin user (jm.smith@concept2cure.pro) and its organization already exist in c2c_full, so no seeding was needed or attempted.

**Not covered.** No keyboard/focus pass of any of the six launch apps (Projects, Vault, Authoring, Submission Center, Submission Readiness, QMS controlled documents) was completed, and I am not attaching any tab-order/focus/dialog findings, per the task's own instruction to return no findings rather than guess when the app cannot be booted within budget.

Root cause, concretely reproduced: authentication is broken against c2c_full at head (494b4fc14, concept2cure-v2). `POST /api/auth/dev-login` returns `{"success":false,"error":{"code":"AUTH_010","message":"Dev login failed"}}` (HTTP 500). The server log shows the underlying cause: the Drizzle-generated SELECT against `users` includes a column, `email_otp_resends`, that does not exist in `c2c_full`'s actual `users` table (verified directly with `\d users` via read-only psql). `shared/schema.ts` declares this column; it is supposed to be added by two independent "creators" per the migration file's own comment (`migrations/20260923_users_mfa_totp_last_step.sql`, amended 2026-09-26): (1) the migration set itself, and (2) `server/db/bootstrap/auth-schema.ts`'s `applyAuthSchemaMigrations`, which the file's comment explicitly claims "re-adds the users auth columns on the owner connection at every boot." I read `auth-schema.ts`'s actual `ALTER TABLE users ADD COLUMN IF NOT EXISTS ...` list (lines ~57-84) and `email_otp_resends` is NOT in it — only `reset_token`, `mfa_totp_last_step`, and the other MFA/lockout columns are. So on this database (whose migration-file version predates or otherwise missed the 2026-09-26 amendment), boot-time auto-repair silently fails to add the one column both the dev-login path and the real password-login path select. Since every `users` SELECT (login and dev-login share the same generated column list) would hit the identical missing-column failure, real password-based sign-in would fail the same way, not just the dev shortcut — this is a full authentication outage against this database, not a dev-login-only issue.

I stopped there rather than working around it: adding the column myself (even though it is the same additive, `IF NOT EXISTS`-guarded, default-0 statement the migration file already contains, and would be a no-data-loss schema repair) was refused by the environment's own permission classifier as "Modify Shared Resources" when I tried it once as a diagnostic, confirming the DB is meant to stay untouched for this task. I did not retry through another path. Total time from first attempt to giving up on boot: well under the ~20 minute budget once the schema mismatch was isolated (server itself booted in ~20s each time; the diagnosis took the remaining time).

Not covered as a direct consequence: tab order, visible focus rings, dialog focus-trap/return-focus, Escape-to-close, and live-region announcement behavior for any of the six apps in a real browser — none of this could be exercised without a signed-in session. No axe-playwright or manual NVDA/VoiceOver pass was run either (out of scope for this static/browser-boot attempt regardless). I did not check whether a different local database (e.g., a fresh PGlite/test DB, or the `concept2cure-ri` default DATABASE_URL mentioned in scripts/startup.sh) would have booted cleanly — the task named `c2c_full` specifically as the reference database and I did not substitute another one.

## Independent verification

Each finding went to three agents, each told to refute it through one lens: reachability, reproduction or intent. A finding is confirmed when two of the three could not. Low findings had one reproduction verifier.

### GB-BLOCKER — **refuted** (0 of 3)

- **reach** — not real: Refuted on reachability. The outage happens only on a database whose migration set was never applied. In the production configuration the migration always runs before the new image serves traffic.

(1) The finding misreads the migration header. The "TWO creators" paragraph at migrations/20260923_users_mfa_totp_last_step.sql:76-79 is the original 2026-09-23 text, and it is about mfa_totp_last_step. The 2026-09-26 amendment that added email_otp_resends says the opposite at lines 40-42: "One creator, like its email_otp_* siblings (0009_email_otp_fields.sql), which server/db/bootstrap/auth-schema.ts does not carry either; deploy runs this set before the new image serves." Leaving the column out of the bootstrap is deliberate and documented, not an oversight. It matches email_otp_hash, email_otp_expires_at and email_otp_attempts, none of which are in auth-schema.ts:57-84 either.

(2) The file is in C2C_MIGRATION_FILES (scripts/db/migration-set.mjs:2550). The applier re-runs every file in that set on every deploy (CLAUDE.md Rule 1). scripts/db/deploy-migrate.mjs step 4 applies the set and fails closed.

(3) Production deploy order is enforced. In .github/workflows/deploy-aws.yml:275-313 the `migrate` job runs deploy-migrate.mjs as a one-off ECS task on the same image. `deploy-api` has `needs: migrate`, so an image whose shared/schema.ts declares emailOtpResends (shared/schema.ts:2606) cannot roll before the column exists. The regression test at server/services/__tests__/account-lockout-atomic.pglite.integration.test.ts:219-240 checks the migration file itself.

(4) The live reproduction is an artifact of the local reference database, not of head. I checked `c2c_full` read-only. users has email_otp_hash, email_otp_expires_at and email_otp_attempts but not email_otp_resends, and c2c_migration_journal has no row for this file. That database has not had the current set applied, and the audit's own dev boot (`npm run dev`) never runs deploy-migrate. On a correctly deployed estate the failing SELECT does not occur.

Coverage: I checked the bootstrap column list, the migration header and statements, set membership, the deploy-migrate steps, the deploy-aws.yml job dependency, and the reference database columns and journal. Not covered: the Replit `[deployment]` target in .replit (build = npm run build, run = npm run start, no migrate step). It is not the production path named by deploy-migrate.mjs and deploy-aws.yml, and I did not establish whether anyone deploys through it.

- **repro** — not real: Checked at head 9d2134b52 (not the 494b4fc14 the auditor cites). What reproduces: server/db/bootstrap/auth-schema.ts:57-83 does not add email_otp_resends, and the reference DB c2c_full does not have the column. `BEGIN; select email_otp_resends from users limit 1; ROLLBACK;` fails with `column "email_otp_resends" does not exist`. So a server started against c2c_full will fail any query that expands to every users column, which fits the reported dev-login 500.

Why this is not a code defect at head:

(1) The finding rests on a misquote. The auditor says the migration header claims 'TWO creators' for email_otp_resends and that the bootstrap therefore contradicts it. The header says the opposite. migrations/20260923_users_mfa_totp_last_step.sql:41-43, in the 2026-09-26 amendment note for this column, reads: "One creator, like its email_otp_* siblings (0009_email_otp_fields.sql), which server/db/bootstrap/auth-schema.ts does not carry either; deploy runs this set before the new image serves." The 'TWO creators … as for every other mfa_* column' text at lines 76-79 is about mfa_totp_last_step, and the bootstrap does carry that column (auth-schema.ts:77). The code and its governing comment agree.

(2) The bootstrap has never carried any email_otp_* column (email_otp_hash, email_otp_expires_at, email_otp_attempts are absent too). Leaving the OTP columns out of the bootstrap is a documented design choice, not a single missing line.

(3) The outage comes from a stale database, not from the code. The latest last_applied_at in c2c_migration_journal on c2c_full is 2026-09-22 21:20. No journal row is later than 2026-09-23, so C2C_MIGRATION_FILES (scripts/db/migration-set.mjs:2550 includes this file) has not been applied since before the 2026-09-26 amendment. c2c_full has mfa_totp_last_step only because the boot copy added it. Running `npm run db:migrate:deploy` (scripts/db/deploy-migrate.mjs) adds the column, and the ADD COLUMN IF NOT EXISTS is idempotent. A database whose migration set is behind the image is the documented 'must not serve before this runs' condition (the C-20 mode), and it would hit the same failure for any other set-only column.

Side observation, not this finding: .replit [deployment] runs only `npm run build` and `npm run start`, and neither invokes deploy-migrate. Whether production actually runs the set before serving depends on a deploy step outside this repo's Replit config. That is a separate, broader question about every C2C_MIGRATION_FILES column; it is not evidence that the bootstrap should carry this one.

Covered: auth-schema.ts in full, the migration header and statements, migration-set membership, c2c_full column presence and journal timestamps (read-only), package.json scripts, .replit. Not covered: I did not boot the server or call /api/auth/dev-login, and I did not trace the real-login handler's column list, since the failure mechanism is already confirmed at the SQL level.

- **intent** — not real: This is deliberate and written down. The auditor misread the migration header. HEAD checked: 9d2134b52.

1. The "TWO creators, deliberately, as for every other mfa_* column" paragraph (migrations/20260923_users_mfa_totp_last_step.sql:76-79) belongs to the original 2026-09-23 text about `mfa_totp_last_step`. That column is in the bootstrap list at server/db/bootstrap/auth-schema.ts:76, so that claim is true.

2. The 2026-09-26 amendment note that added `email_otp_resends` (same file, lines 23-45) says the opposite for this column, in so many words: "One creator, like its email_otp_* siblings (0009_email_otp_fields.sql), which server/db/bootstrap/auth-schema.ts does not carry either; deploy runs this set before the new image serves." It also says "a server whose shared/schema.ts declares emailOtpResends must not serve before this runs (the same C-20 mode)". Commit a19eb72bd records the same choice and its reason.

3. This is consistent with existing practice. The older siblings `email_otp_hash`, `email_otp_expires_at` and `email_otp_attempts` are also declared in shared/schema.ts:2599-2601 and are also missing from auth-schema.ts. Their only creator is migrations/0009_email_otp_fields.sql. So the bootstrap file was never meant to cover every column in shared/schema.ts, and a database behind on migrations fails the same way on those three columns. The proposed "same pattern already used for every other MFA column" is wrong: the email_otp_* family has never been in the bootstrap.

4. The migration file is in C2C_MIGRATION_FILES (scripts/db/migration-set.mjs:2550), which deploy-migrate runs on every deploy (CLAUDE.md Rule 1). A deployed server therefore gets the column before it serves.

5. The reproduction proves only that the local reference database was not re-migrated after 2026-09-26. psql on c2c_full shows the three older email_otp_* columns and no email_otp_resends. That is a stale local database, not a code defect at HEAD.

6. The finding breaks none of the repository's rules (CLAUDE.md, the design constitution, 21 CFR Part 11, WCAG 2.2 AA). The failure is fail-closed: HTTP 500 AUTH_010, not a fabricated or empty result.

7. It is not already listed as open under docs/evidence/reviews/, but it is not a defect, so there is nothing to file.

