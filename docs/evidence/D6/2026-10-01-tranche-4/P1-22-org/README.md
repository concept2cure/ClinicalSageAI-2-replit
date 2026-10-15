# P1-22 remainder (DP-20; ADR-0014 §6): per-organisation retention period

Tranche 4, 2026-10-01. Verified at HEAD `0e58e794`. The work was resumed after
a usage-limit interruption at about 03:50 UTC. The earlier attempt's edits were
kept, then reviewed and finished. Every red and green run below was taken again
on the finished code.

## What was wrong

ADR-0014 §6 says a governed record is kept for 25 years by default. An
organisation may choose a longer period, or a shorter one if it records a reason
that names the governing rule. A legal hold always overrides deletion.

At HEAD none of this was implemented:

- **No default.** `retention_until` was set at admission
  (`server/services/vault/vault-ingest.service.ts`) only from a global named
  policy in `vault.retention_policies`. No applier seeds a policy (see the seed
  section below), so every admitted document was stored with
  `retention_until = NULL`. That means it was kept with no retention clock at
  all.
- **No per-organisation setting.** `vault.retention_policies` is a global
  table keyed by `policy_name`. It has no organisation column, so an
  organisation had nowhere to record its own period.
- **No way to set one.** There was no route and no screen.

The red run at HEAD's own code (`red/org-retention-period.at-HEAD-code.dbtest.txt`)
shows this:
`expected null to be '2051-10-01'` (the document is undated) and `expected 404`
from every retention route.

## What is true now

| ADR-0014 §6 | Where it now lives |
|---|---|
| 25 years by default | `DEFAULT_RETENTION_YEARS = 25` in `shared/schema/vault.ts`. This is the only place the number is written in code. It is bound as `$30` at admission. |
| An organisation may set a longer period | `public.organization_retention_settings`: one row per organisation, holding `retention_years`, `reason`, `governing_rule`, `set_by` and `set_at`. |
| A shorter period needs a recorded reason that names the governing rule | Enforced twice. The route answers 400 `RETENTION_REASON_REQUIRED`. The database CHECK `organization_retention_settings_shorter_is_reasoned` refuses the row on any write path. |
| A named policy is never shortened silently | Admission takes `GREATEST(org-or-default date, named policy date)`. |
| A legal hold always overrides | Unchanged: `vault.legal_holds` and `retentionCron.ts` already refuse to dispose of held records. |

- **Table.** It is in `public` with `organization_id INTEGER NOT NULL UNIQUE`,
  has a foreign key to `organizations` with `ON DELETE CASCADE`, and is created
  by `migrations/20261001_organization_retention_settings.sql`.
  - The migration is additive: `CREATE TABLE IF NOT EXISTS`, and each
    constraint is added only when one of the same shape is missing. It contains
    no DROP.
  - It is listed in `scripts/db/migration-set.mjs` immediately above the final
    tenant-isolation pair. The sweep therefore gives the table
    `ENABLE`/`FORCE` RLS and `tenant_isolation_policy`, which the dbtest
    asserts.
  - The drizzle model `organizationRetentionSettings` declares the same checks
    under the same names. A table created by `drizzle-kit push`
    (`install-fresh`) and a table created by the deploy path therefore end up
    identical. `green/migration-replay.txt` shows both paths, plus a second
    apply.
- **Admission** (`vault-ingest.service.ts`):
  `retention_until = GREATEST(CURRENT_DATE + COALESCE(org years, 25) years, the named active policy's date)`.
  The organisation's row is read under the caller's RLS scope and keyed by the
  organisation that the ownership guard has already proved.
- **API** (`server/routes/vault-retention-period.ts`, mounted by the legal-holds
  router at `/api/vault/legal-holds/retention`):
  - `GET` returns the period in force.
  - `PUT { years, reason?, governingRule? }` sets it. A period below 25 years
    needs a reason (at least 10 characters) and a governing rule (at least 3).
  - Both are protected by `requireRole('owner','admin')`, and the organisation
    always comes from the session.
  - The upsert and its chained audit row (`writeChainedAuditRow`, action
    `vault.retention_period.set`, carrying the before and after values) commit
    in one transaction on the request's tenant-scoped client, under a
    per-organisation advisory lock. This is the same pattern legal holds use to
    place and lift.
  - A 5xx goes through `serverError` and contains no error text.
- **Client.** Admin → Setup was already the organisation's governed settings
  surface. It now has a *Retention period* card
  (`client/src/concept2cure/v2/surfaces/RetentionPeriodCard.tsx`, rendered by
  `Setup` in `AdminSurfaces.tsx`). No new surface was added (Rule 2). The card
  behaves as follows:
  - While loading, it shows a busy state.
  - If the read fails, it shows an error state with a retry, and never shows the
    default as if it were this organisation's period.
  - A member gets a 403 and is told that the owner or administrators set the
    period. No controls are shown.
  - A period below the default asks for the governing rule and a reason.
  - It reports a refusal in the server's own words.
  - It shows "Saved" only after the server answers, and shows the period the
    server returned.

## Red / green

### The admission and the API: `tests/db/org-retention-period.dbtest.ts`

This suite runs on PostgreSQL 16 as `app_service`, with `RLS_ENFORCE=on`. The
suite asserts that it is not running as a superuser and has no BYPASSRLS.

| Case | Red | Green |
|---|---|---|
| Whole suite, before the table existed (earlier attempt, 03:24) | `red/org-retention-period.dbtest.txt`: 11 of 12 fail | `green/org-retention-period.dbtest.txt`: 12 of 12 pass |
| Whole suite on HEAD's admission and router code, with the table present | `red/org-retention-period.at-HEAD-code.dbtest.txt`: 9 of 12 fail (undated record, 404) | same |
| Mutant A: the organisation's setting is ignored at admission | `red/mutant-A-org-setting-ignored.txt`: 2 fail (`2051` ≠ `2056`) | same |
| Mutant B: `COALESCE` replaces `GREATEST`, so a named policy is shortened | `red/mutant-B-named-policy-shortened.txt`: 1 fails (`a named policy is never shortened silently`) | same |
| Mutant C: COMMIT before the audit write | `red/mutant-C-audit-not-atomic.txt`: 2 fail (xmin differs; a refused audit row leaves the change in place) | same |
| Mutant D: the route's reason check removed | `red/mutant-D-no-reason-check.txt`: 1 fails (500, not 400; the CHECK still holds) | same |
| Mutant E: `requireRole` removed | `red/mutant-E-no-role-gate.txt`: 1 fails (a member gets 200) | same |

The suite covers each case the item names:

- An organisation's setting changes `retention_until` (25 → 30 → 10 years).
- Another organisation's setting does not apply, and is invisible under RLS.
- A shorter period with no reason or no rule is refused with 400, and nothing
  changes.
- A member gets 403.
- The audit row comes from the same transaction (same `xmin`). A refused audit
  write rolls the change back and returns a 500 with no error text.

### Admission SQL unit pin: `server/services/vault/__tests__/vault-ingest-storage.test.ts`

- Red: `red/vault-ingest-storage.unit.txt`. The new case fails on HEAD's SQL.
- Green: `green/vault-ingest-storage.unit.txt`, 18 of 18 pass.

### Client: `client/src/concept2cure/v2/__tests__/adminSetupRetentionPeriod.test.tsx`

- Red: `red/client-setup-retention-card.txt`. All 5 cases fail because Setup
  renders no card.
- Green: `green/client-setup-retention-card.txt`, 23 of 23 pass. This run also
  includes the two existing Setup suites unchanged:
  `adminSetupGoverned.test.tsx` and `adminSetupClientTypeGoverned.test.tsx`.

### Existing suites

- `green/existing-retention-legal-hold-ingest.unit.txt`: 12 files, 106 of 106
  pass. The files are retentionCron (schedule, legal-hold, policies),
  vault-legal-holds, vault-ingest storage, refusal, type-binding, lineage,
  conflict (pglite), file-authorization, estar artifact retention and the
  catalog id-space suite.
- `green/existing-vault-dbtests.3-unrelated-lineage-trigger-failures.txt`: the
  vault ingest, lifecycle, reupload, version-checkin and versions suites, plus
  project-retention-locks. 36 pass, 9 are skipped and 3 fail. One suite fails
  outright.
  - **These failures are not caused by this change.** Every failure names the
    `vault_documents_lineage_guard` trigger, which does not exist in the shared
    test database (VR-08,
    `migrations/20260930_vault_documents_version_lineage.sql`).
  - Error text: `trigger "vault_documents_lineage_guard" for table "documents"
    does not exist` / `EnableDisableTrigger 42704`.
  - None of them involve retention.

### Gates

These gates ran green and their output is filed under `green/gate-*.txt`:

- **Migrations and schema:** `ci:migration-set-order`, `ci:migration-drop-safety`,
  `ci:migration-deploy-path`, `ci:migration-prefix-collisions`,
  `ci:migration-reachability`, `ci:column-reachability`,
  `ci:model-migration-agreement`, `ci:insert-columns-declared`,
  `ci:duplicate-table-ddl`, `ci:unbacked-tables`, `ci:orm-reachability`,
  `ci:rls-allowlist-sync`, `db:sync-manifest:check`.
- **Tenant isolation:** `ci:tenant-isolation` (and `:no-regression`),
  `ci:tenant-column-types`, `ci:tenant-blind-models`, `ci:drizzle-tenant-scope`,
  `ci:tenant-entry-points`, `ci:tenant-resolvers`.
- **Routes:** `ci:audit-route-mounts:no-regression`, `ci:check-route-collisions`,
  `ci:route-ownership-matrix:check`, `ci:server-error-leaks`, `ci:error-envelope`,
  `ci:check-client-api-calls`.
- **Audit:** `ci:discarded-audit-write`, `ci:dead-audit-tables`,
  `ci:audit-logs-fixture`, `ci:writerless-stores`.
- **Client:** `ci:empty-state-honesty`, `ci:action-overclaim`,
  `ci:success-before-ok`, `ci:internals-in-copy`, `ci:undefined-css-classes`,
  `ci:check-chip-tones`, `ci:unauthenticated-fetch`.
- **Tests and imports:** `ci:check-unrun-tests`, `ci:db-test-isolation`,
  `ci:check-test-imports`, `ci:untracked-imports`.
- **Security:** `check:security-patterns`.

Three gates were not green at the time of these runs:

- `ci:unkeyed-request-tables` is red for another lane. Its baseline has a stale
  entry, `audit.tamper_proof_log`, from the tamper-proof-audit lane's
  uncommitted change. Nothing in this item touches it.
- `ci:component-class-coverage` cannot run here. It needs `npm run build`
  output.
- Two gates go red because of this change. Each is fixed by a file that this
  item may not edit, so the fixes are filed as patches in the next section.

ESLint on the files this item changed: `green/eslint-own-files.txt`.

- No new warnings.
- `vault-ingest.service.ts` stays under the 500-line cap. `admitVaultDocument`
  shrinks from 401 to 400 lines.
- The `AdminSurfaces.tsx` warnings are the set HEAD already has.

## Changes this item needs in files it may not edit (proposed, verified, not applied; all three applied in the fix round below)

| File | Why | Patch | Without it | With it |
|---|---|---|---|---|
| `server/routes/__tests__/_authoring-canvas-fixture.ts` | Its PGlite `VAULT_DDL` has no `organization_retention_settings` table, and admission now reads one. | `proposed/authoring-canvas-fixture.patch` | `red/fixture-users.without-fixture-patch.txt`: authoringFileToVault 4 fail; founder-path lineage 9 fail; `relation "organization_retention_settings" does not exist` | `green/fixture-users.with-proposed-fixture-patch.txt` (see the note below the table) |
| `server/services/tenant/tenant-offboarding.ts` | `ci:purge-coverage` refuses a new org-keyed table that a tenant purge cannot reach. A purge updates `organizations` rather than deleting it, so the cascading foreign key does not help. The fix adds `'organization_retention_settings'` at the end of `PURGE_CHILD_TABLES`. | `proposed/tenant-offboarding.patch` | `red/gate-ci:purge-coverage.without-proposed-purge-line.txt` | `green/gate-ci:purge-coverage.with-proposed-purge-line.txt`: this table no longer listed |
| `shared/constants/ui-surface-registry.ts` | `ci:launch-scope-api` reports `/api/vault/legal-holds/retention` as "unmapped". Under `enforce` the module gate refuses that path with 403 LAUNCH_SCOPE. The fix adds the prefix to the `setup` surface's `apiPrefixes`. | `proposed/ui-surface-registry.patch` | `red/gate-ci:launch-scope-api.without-proposed-registry-line.txt` | `green/launch-scope-verdict.with-proposed-registry-line.txt`: `unmapped` → `launch` |

Notes on the "With it" column:

- **Fixture patch.** The run used a scratch alias, and the tree's fixture was
  never edited. authoringFileToVault passes 9 of 9 and leaf-cross-project
  passes. The 9 founder-path lineage failures that remain all start at hop 5
  (seal), with `column "sessions_ended_at" does not exist`. That comes from
  P0-4b's uncommitted `account-standing.ts` change, and none of these failures
  names this table.
- **Purge patch.** The gate still shows `ana_record_blobs` and
  `ana_turn_records`, which belong to the AnA lane.

## Seeded global policies (`vault.retention_policies`)

**There are none.**

- `grep -rn "retention_policies" migrations db/migrations` finds only
  `migrations/20260608_vault_retention.sql`, which creates the table and
  inserts nothing, and this item's own migration (in a comment).
- `20260608_vault_retention.sql` is **not** in `C2C_MIGRATION_FILES`. The table
  reaches a deployed database through `drizzle-kit push` during
  `install-fresh`, from `vaultRetentionPolicies` in `shared/schema/vault.ts`.
- No `scripts/seed-*` writes the table.
- The shared test database holds no rows.

There is nothing to correct. A named policy now matters only when it is longer
than the organisation's period. If one is wanted (for example `tmf-eu-ctr`),
the Rule 1 route is a new migration with
`INSERT … ON CONFLICT (policy_name) DO NOTHING` and a row-count assertion, never
an edit in place.

## Residuals

1. **The clock starts at admission, not at finalization.** For a document filed
   from Authoring after its seal, the two are effectively the same moment. For
   an uploaded draft, admission comes earlier. Dating from the approval or seal
   event would need the lifecycle state at admission. That needs a decision.
2. **Changing the period does not re-date documents already admitted.** Those
   keep their date, and the card says so.
   - If the period is lengthened, existing dates could safely be extended in
     the same transaction (`GREATEST`, never earlier).
   - Shortening existing dates would be a disposition decision.
   - Proposed as a follow-up.
3. **Documents admitted before this change still have
   `retention_until = NULL`**, which means they are kept indefinitely. That is
   the safe direction. Backfilling them to 25 years would start a disposition
   clock on records nobody re-dated, so it is the founder's decision, not a
   migration.
4. **The audit trail's own retention** (the "and its audit trail" part of
   §6) belongs to P1-23-audit and is not covered here.
5. **`/api/vault/legal-holds` itself (place, lift and list) is also
   "unmapped"** for launch scope at HEAD, so under `enforce` it is refused with
   403. No screen calls it today. This predates this item. The fix is to
   declare it on whichever surface gains a legal-hold control, or on
   `LAUNCH_PLATFORM_API` with a reason.
6. **The card shows the setter as `user #id`**, because the API returns
   `set_by` and not a name.
7. **The compliance report `retention-legal-holds.ts`** (the
   compliance-reports lane) does not yet state the organisation's period.

## Commands

```
export TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:5432/c2c_testdb?sslmode=disable' \
       APP_DATABASE_URL='postgresql://app_service:local-testdb-app-service-password@127.0.0.1:5432/c2c_testdb?sslmode=disable' \
       RLS_ENFORCE=on
NODE_OPTIONS=--max-old-space-size=2560 npx vitest run --config vitest.db.config.ts tests/db/org-retention-period.dbtest.ts
NODE_OPTIONS=--max-old-space-size=2560 npx vitest run server/services/vault/__tests__/vault-ingest-storage.test.ts
NODE_OPTIONS=--max-old-space-size=2560 npx vitest run client/src/concept2cure/v2/__tests__/adminSetupRetentionPeriod.test.tsx
npm run ci:migration-set-order && npm run ci:migration-drop-safety && npm run ci:column-reachability && npm run ci:tenant-isolation
DATABASE_URL="$TEST_DATABASE_URL" npm run ci:purge-coverage
npm run ci:launch-scope-api
```

The red runs at HEAD's code and the mutant runs swapped one file temporarily
(`git show HEAD:<file> > <file>`, or a one-line Python substitution), ran the
suite, and restored the file from a scratch copy. Each restore was checked with
`cmp`.

## Fix round (2026-10-01, after adversarial verification)

The verifier found four must-fix defects. All four are fixed in the tree. The
three patches under `proposed/` are now applied (the files stay as the record
of what the first round proposed). Each fix below shows its red run before the
fix and its green run after it. The red runs used the real tree, or a scratch
vitest config that changed one string in memory and was deleted after one run;
no tracked file was swapped.

### 1. The legal-hold routes could not be reached in production (DP-20 re-opened)

**What was wrong.** No surface in `shared/constants/ui-surface-registry.ts`
claimed `/api/vault/legal-holds`. In production, `LAUNCH_SCOPE_ENFORCE` unset
means on, and `LAUNCH_SCOPE_API_UNATTRIBUTED` unset means enforce. So
`moduleEntitlementGate` answered **403 LAUNCH_SCOPE** to all five routes the
router serves:

- the retention period, `GET` and `PUT /retention`;
- the legal-hold list, place and lift, which the first round recorded as
  residual 5 and did not fix.

A legal hold could not be placed. The control "a legal hold always overrides"
(ADR-0014 §6) therefore had no operable form. `ci:launch-scope-api` saw only
`/retention`, because no screen calls the other three routes. The first
round's proposed registry line covered `/retention` alone.

The card had a defect of its own. On any 403 it said "Your role cannot view or
change the retention period", even to an administrator whose 403 was
LAUNCH_SCOPE.

**What is true now.**

- **The registry claims the whole family.**
  - `vault` now lists `'/api/vault/legal-holds'`.
  - `setup` now lists `'/api/vault/legal-holds/retention'`.
  - The longest prefix wins, so the retention period is attributed to Setup,
    whose card calls it, and the rest of the family to the Vault. Both are
    launch surfaces.
- **The new test checks every route, now and later.**
  `server/routes/__tests__/vault-legal-holds-launch-scope.test.ts` reads the
  routes from the router files themselves:
  - `router.<verb>('…')` calls, plus `router.use('/retention', …)` followed to
    its file, all under the mount in `register-inline-routes.ts`.
  - A route added later is therefore checked too.
  - It sends each route through the real `moduleEntitlementGate`. The gate is
    built from the real registry, with both modes read from a production
    environment that sets neither variable.
- **The card no longer blames role for every 403.** It shows the server's own
  reason (already reduced to display copy by `dataConnect`). It states the
  owner/administrator rule as the rule, not as the cause.

| Check | Red (before) | Green (after) |
|---|---|---|
| `vault-legal-holds-launch-scope.test.ts` | `red/fix-round-1-legal-holds-launch-scope.before-registry-fix.txt`: 6 of 7 fail. All five routes get `"status": 403, "code": "LAUNCH_SCOPE"`, and `/retention` is attributed to nothing (`[]`). | `green/fix-round-1-legal-holds-launch-scope.txt`: 7 of 7 pass |
| `adminSetupRetentionPeriod.test.tsx` (new case: a LAUNCH_SCOPE 403 is shown in the server's words, never as "your role") | `red/fix-round-1-card-403-not-about-role.before-card-fix.txt`: 2 of 6 fail | `green/fix-round-1-card-403-not-about-role.txt`: 6 of 6 pass |
| `ci:launch-scope-api` | `red/fix-round-1-ci:launch-scope-api.before-registry-fix.txt`: `[unmapped] /api/vault/legal-holds/retention` | `green/fix-round-1-ci:launch-scope-api.txt`: 279 paths, none refused |

### 2. A tenant purge left the organisation's period behind (DP-68, GDPR Art. 17)

**What was wrong.** `organization_retention_settings` was not in
`PURGE_CHILD_TABLES`. The table's foreign key to `organizations` is
`ON DELETE CASCADE`, but a purge UPDATEs that row and never deletes it. The
cascade therefore never fires, and the row survives erasure: `set_by` (a user
id), the free-text reason, and the governing rule.

**What is true now.**

- `'organization_retention_settings'` is the last entry of
  `PURGE_CHILD_TABLES`, with a comment saying why it must be listed.
- A new case in `tests/db/org-retention-period.dbtest.ts` runs the real
  `purgeTenant` on a third tagged organisation:
  - The setup is a pending-deletion organisation, a matching export receipt,
    and a 30-year setting row.
  - The real list is narrowed to this table's entry, so nothing else in the
    shared database is touched.
  - It asserts that the setting row is gone and the organisation row survives
    as `purged`.
  - Without the entry, the narrowed list is empty and the row survives.

| Check | Red (before) | Green (after) |
|---|---|---|
| `ci:purge-coverage` (local `c2c_testdb`) | `red/fix-round-2-ci:purge-coverage.before-purge-line.txt`: lists `organization_retention_settings` | `green/fix-round-2-ci:purge-coverage.txt`: no longer listed. The gate stays red on `ana_record_blobs` and `ana_turn_records`. Those come from `migrations/20260926_ana_turn_records.sql` (committed 09-29, session_01T2wooCZu46W7msw4TJuuzr), so it is red at HEAD without this item. |
| dbtest purge case | `red/fix-round-2-org-retention-period.dbtest.purge-entry-stripped.txt`: the entry was stripped in memory by a scratch config. 1 of 13 fails: `the organisation's period survived its purge: expected { id: 68, organization_id: 279, … } to be null`. | `green/fix-round-2-org-retention-period.dbtest.txt`: 13 of 13 pass, as app_service with enforcement on. Afterwards no tagged organisation, user, document, receipt or policy is left behind. |

### 3. The PGlite fixture broke admission in its neighbours

**What was wrong.** Admission now reads `organization_retention_settings`, and
the `VAULT_DDL` in `_authoring-canvas-fixture.ts` had no such table.

**What is true now.** The fixture creates the two columns admission reads, and
the table is empty, so every document gets the 25-year default. Every suite
that imports the fixture was run, not just the two named in the finding.

| Check | Red (before) | Green (after) |
|---|---|---|
| The 11 suites that import the fixture | `red/fix-round-3-fixture-suites.without-fixture-line.txt`: 4 fail, all in `authoringFileToVault`, each with `relation "organization_retention_settings" does not exist`. The other 10 suites pass. | `green/fix-round-3-fixture-suites.txt`: 11 files, 115 of 115 pass |
| `tests/lineage/founder-path-lineage.pglite.test.ts` | `red/fix-round-3-founder-path-lineage.without-fixture-line.txt`: 9 of 14 fail. Hop 6 fails with the relation error; hop 5 and the hops after it fail with `sessions_ended_at`. | `green/fix-round-3-founder-path-lineage.txt`: the relation error is gone. The same 9 fail, all from `column "sessions_ended_at" does not exist` at hop 5 (seal). |
| The same lineage suite, with P0-4b's column supplied in memory | — | `green/fix-round-3-founder-path-lineage.with-P0-4b-column-supplied-in-memory.txt`: 14 of 14 pass |

**The remaining lineage failure belongs to P0-4b, not this item.**

- P0-4b's uncommitted `server/services/account-standing.ts` reads
  `users.sessions_ended_at`.
- The lineage world builds `users` from `migrations/0000_sweet_joseph.sql`,
  which does not have that column.
- The fix belongs to that lane: `prerequisites()` in
  `tests/lineage/founder-path-lineage.world.ts` should apply
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS sessions_ended_at TIMESTAMPTZ;`,
  or the lane's migration file.
- The 14-of-14 run added exactly that line, in memory only, through a scratch
  vitest config that was deleted afterwards.

### 4. The commit set

**What was wrong.** `server/routes/vault-legal-holds.ts` imports
`./vault-retention-period`, which is untracked. Production mounts the router
inside a `try/catch` that only logs. A commit of the importer without the new
file would therefore unmount **every** legal-hold route, silently.

**What holds it now.**

- `ci:untracked-imports` runs in `.husky/pre-push`. It reads the index for
  every file a push changes. Run with `--all` today, it flags both importers
  while their targets are untracked
  (`red/fix-round-4-ci:untracked-imports--all.while-new-files-untracked.txt`):
  - `vault-legal-holds.ts:26 → ./vault-retention-period`;
  - `AdminSurfaces.tsx:60 → ./RetentionPeriodCard`.
- So a push that commits either importer without its target is refused.
- The migration, the tests and the three one-line changes are not imports, so
  nothing holds them together. They must go in one commit.

The full set:

- **New:**
  - `migrations/20261001_organization_retention_settings.sql`
  - `server/routes/vault-retention-period.ts`
  - `client/src/concept2cure/v2/surfaces/RetentionPeriodCard.tsx`
  - `client/src/concept2cure/v2/__tests__/adminSetupRetentionPeriod.test.tsx`
  - `server/routes/__tests__/vault-legal-holds-launch-scope.test.ts`
  - `tests/db/org-retention-period.dbtest.ts`
  - this evidence directory
- **Modified:**
  - `shared/schema/vault.ts`
  - `server/services/vault/vault-ingest.service.ts`
  - `server/services/vault/__tests__/vault-ingest-storage.test.ts`
  - `server/routes/vault-legal-holds.ts`
  - `client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx`
  - `shared/constants/ui-surface-registry.ts`
  - `server/routes/__tests__/_authoring-canvas-fixture.ts`
- **Modified, one hunk among other lanes' uncommitted changes:**
  - `scripts/db/migration-set.mjs`: the line
    `'migrations/20261001_organization_retention_settings.sql', // P1-22-org …`.
    The P1-24, P0-4b and P0-18 lines sit beside it.
  - `server/services/tenant/tenant-offboarding.ts`: the last entry of
    `PURGE_CHILD_TABLES` and its comment. The rest of the file's diff
    (+186/−72) is another lane's.

### Neighbours and gates (after all four fixes)

- `green/fix-round-neighbour-suites.txt`: 26 files, 752 of 752 pass. They
  cover:
  - the new test;
  - the launch-scope gate and the module entitlement gate;
  - `launch-scope` and `ana-launch-scope`;
  - both registry suites;
  - `tenant-offboarding`, `tenant-purge-audit` and
    `tenant-purge-vault-scope`;
  - the export-covers-purge and program-anchor contracts;
  - the three Setup suites;
  - the client registry, catalog and render suites that read `apiPrefixes`.
- Gates, each in `green/fix-round-gate-<name>.txt`, all exit 0:
  - `ci:launch-scope-api:selftest` and `ci:launch-scope`
  - `check:security-patterns`
  - `ci:check-client-api-calls`
  - `ci:empty-state-honesty` and `ci:internals-in-copy`
  - `ci:untracked-imports`, `ci:check-test-imports` and `ci:check-unrun-tests`
  - `ci:undefined-css-classes` and `ci:check-chip-tones`
  - `ci:route-ownership-matrix:check`
  - `ci:success-before-ok` and `ci:unauthenticated-fetch`
  - `ci:db-test-isolation`, after the dbtest gained its purge case
- ESLint on the files this round touched (`green/fix-round-eslint.txt`):
  - 0 errors.
  - 1 warning, `max-lines` on `ui-surface-registry.ts`, with the same count
    (854) at HEAD.

### Residual found while fixing

**Module enforcement and Setup.**

- The retention period is decided as Setup's. Under
  `MODULE_ENFORCEMENT=enforce`, every Setup prefix (`/api/setup`,
  `/api/validation-kit`, and now this one) is decided by
  `canAccessModule(org, 'setup')`.
- No migration seeds a `setup` row in `available_modules`, so that call
  answers "does not exist". Enforcement would therefore refuse all of Setup,
  not only this card.
- This predates this item. The default mode is `off`.
- The card now shows that refusal in the server's words, not as a role
  problem.

### Files edited that another lane touched in the last 24 hours

| File | Last commit | Lane |
|---|---|---|
| `server/services/tenant/tenant-offboarding.ts` | 10-01 05:48 | session_01GCu8tcx7BxXG5B6SysALUV (plus another lane's uncommitted hunks) |
| `server/services/vault/vault-ingest.service.ts` | 10-01 02:00 | session_01DiJJAkasGVrccrxjhYyjxG |
| `scripts/db/migration-set.mjs` | 10-01 03:26 | (no session trailer) |
| `client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx` | 10-01 02:11 | session_0194UQPxy9Er2ibRAjog8Ven (the control tower) |

Outside the window:

- `ui-surface-registry.ts`: 09-29 21:36, session_01E8btkB8mcLirW4rNvsMNxK.
- `_authoring-canvas-fixture.ts`: 09-26 04:36, session_01KnUGoX3g4R4FWKWGc2sTbN.
- `shared/schema/vault.ts`: 09-22.
- `vault-ingest-storage.test.ts`: 09-29.
- `vault-legal-holds.ts`: 09-26.

**Database availability.** The shared server on 5432 was down from about 07:22
to 07:38 while other lanes ran their own verification clusters. The dbtest runs
above were made after it returned. At that point 5432 answered from the same
`c2c-local` data directory.

### Fix-round commands

```
NODE_OPTIONS=--max-old-space-size=2560 npx vitest run server/routes/__tests__/vault-legal-holds-launch-scope.test.ts
NODE_OPTIONS=--max-old-space-size=2560 npx vitest run client/src/concept2cure/v2/__tests__/adminSetupRetentionPeriod.test.tsx
npm run ci:launch-scope-api
DATABASE_URL="$TEST_DATABASE_URL" npm run ci:purge-coverage
NODE_OPTIONS=--max-old-space-size=2560 npx vitest run --config vitest.db.config.ts tests/db/org-retention-period.dbtest.ts
NODE_OPTIONS=--max-old-space-size=2560 npx vitest run <the 11 fixture suites> tests/lineage/founder-path-lineage.pglite.test.ts
node scripts/ci/check-untracked-imports.mjs --all
```
