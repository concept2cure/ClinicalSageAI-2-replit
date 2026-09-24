# D2 — which missing relations production reaches through the launch catalog

**Date:** 2026-09-24 · **Row:** D2 (Launch catalog) · **Workstream:** W1 ·
**Session:** `…01E2moDuSNSNTBqAHV5GtWoz`
**Status of this folder:** interim. The reference database, two baseline
ratchets and the enterprise-intake fix below are complete. The classification of the remaining 40 is running; this
README is extended with its verdicts, and with red → green proof for any
in-scope defect, when they land.

## The question

`scripts/ci/tables-live-schema-baseline.json` lists relations that server SQL
names and that do not exist on a database the real provisioning path builds.
Every statement naming one raises 42P01 or 42883. Rule 2 makes one question
decisive: **does production reach that statement through the launch catalog?**
— a launch-app or shell action, an AnA tool, or a path that runs with no user at
all (boot, cron, worker, event, webhook). Anything else sits behind a flag that
is off in production and gets no session.

This is not what the two neighbouring sessions measure. `…01PwLFr8`'s fresh-org
sweep (`../2026-09-23-surface-truth/`) opens every surface once and records what
it calls **on first render** — no in-scope surface there failed on a missing
relation, every in-scope failure being a 403, 404 or 503. `…01KiDof7`'s guards
(`../../W2/2026-09-22/`) cover all server SQL regardless of scope. Neither sees a
missing relation behind a launch **action**, an AI tool or a scheduled job.

## Reference database

| | |
|---|---|
| Database | `c2c_ref_0924`, PostgreSQL 16, local |
| Built | from empty by `scripts/db/provision.mjs` at `872c47182`, then re-migrated by `scripts/db/deploy-migrate.mjs` at the ratchet commit (307 migrations) — the same replay every production deploy performs |
| Verified | `provision.mjs` exit 0: 27/27 contract tables readable by `app_service`; 1281/1281 relations hold the recipe privileges |
| Runtime role | `app_service`, non-superuser — the gate result is identical as the owner (`live-schema-at-HEAD-as-owner.txt`) and as `app_service` |

At that commit: **1281 relations, 745 referenced by server SQL, 9 resolved as
functions, 41 absent.**

## Ratchet: 42 → 41

`document_approvals` is no longer referenced by any server SQL. The Tasks
module's Vault sync used to read it; `server/services/unifiedTaskService.ts`
now raises `ModuleSyncUnavailableError` instead — *"Refused, never read"* —
because the legacy table has no organization column and a sync would have
imported every tenant's pending approvals into the caller's organization. The
only remaining mentions are that comment and a PGlite test asserting the read
never happens (`unifiedTasks-governed.pglite.integration.test.ts:356`).

Removed by hand, not by `--baseline`, which would also absorb anything else red.
Shown biting after the removal (`ratchet-document-approvals.txt`): with a
genuinely absent entry (`site_intel.site_scorecard`) also removed, the gate exits
1 and names exactly that relation; restored, exit 0.

The baseline's `count` field is kept equal to its entries. It had drifted once
before — this session left it at 47 over 42 entries on 2026-09-19
(`3d7f3b486`); nothing reads the field, and `…01KiDof7` corrected it.

## Fixed: the enterprise onboarding intake lost every request in production

**Found by this sweep; missed by the first-render sweep by construction** — the
defect is behind a button, and only in production's posture.

`license_requests` was one of the baselined absences. Its only statement site is
`POST /api/auth/license-request` (`server/routes/auth.ts`), and its only caller is
the Onboarding surface's **"Request Enterprise onboarding"** button
(`client/src/concept2cure/v2/surfaces/Onboarding.tsx` §3a). `onboarding` is a
launch **shell** surface (`shared/constants/launch-scope.ts`), always on. This is
the platform's only enterprise sales intake.

### The mechanism

No applier created the table. On 42P01 the handler ran `CREATE TABLE IF NOT
EXISTS` itself, at request time. That depends on who is asking
(`intake-runtime-ddl-refused.txt`):

| Role | Result |
|---|---|
| owner / superuser — every developer machine | `CREATE TABLE` |
| `app_service` — production's runtime role | `ERROR: permission denied for schema public` |

So in production every request answered 500. The error log carried only the
failing SQL, never who had asked, so the lead was gone. The prospect was told to
retry, which could never succeed. **Nothing on a developer machine could show
it**, because there the fallback works.

### Red, then green — real routes, real PostgreSQL, production posture

`tests/db/enterprise-onboarding-intake.dbtest.ts` mounts the app with the real
`registerPlatformRoutes`, so `/api/auth` runs behind production's own pre-auth
scope. It connects as a NOBYPASSRLS runtime role minted by the real
`provision-app-role.mjs`, with `RLS_ENFORCE=on`. Its posture block asserts
that, including that the role holds no CREATE on `public`.

| Run | Schema | Handler | Result | File |
|---|---|---|---|---|
| Red A | as provisioned (no table) | old | **7 fail**, 2 pass — 500 instead of 200, zero rows | `intake-red-A-no-table.txt` |
| Red B | migration applied by `deploy-migrate` | old | **1 fail** — a store failure left the lead out of the log | `intake-red-B-table-old-handler.txt` |
| Green | migration | fixed | **13 / 13** | `intake-green.txt` |
| Mutant | platform policy widened to `USING (true)` | fixed | **2 fail** — the pre-auth scope and a tenant member could read another company's request | `intake-mutant-policy-widened.txt` |

The mutant was restored by dropping it and re-running the migration file, which
exercises its create-when-absent path. The suite was back to 13 / 13.

### What changed

- **`migrations/20260924_license_requests.sql`**, on the applier before the final
  sweep pair, is now the only creator. The columns are the handler's own; that
  was the only contract ever written. Replay-safe (RULE 1): no DROP, policies
  created only when absent. Replayed twice on the reference database: exit 0,
  exactly two policies.
- **No `organization_id`: a deliberate, documented exception to RULE 1.** The
  row is written by an unauthenticated prospect before any organisation exists.
  Inventing a tenant would be a fabricated attribution. The tenant sweeps
  therefore never see this table, so it carries its own policy in the canonical
  shape minus the tenant arm:
  - anyone may INSERT;
  - SELECT, UPDATE and DELETE need shadow mode or the platform super-admin.

  Under enforcement, neither the scope that wrote a request nor any tenant
  member can read it.
- **`server/routes/auth.ts`**: the runtime DDL is gone. A store failure now
  answers through the canonical `serverError`, with no database text in the
  response. The log records the prospect's email and organisation — the same
  fields the success line already logs — plus PostgreSQL's reason and SQLSTATE.
  Drizzle keeps those on `.cause`, so that is what is passed.
- The old handler also had an `else` that answered `success: true` without
  storing. **It could not fire:** Drizzle's error text always names the table, so
  the other branch always matched. Red B confirmed it — the injected failure took
  the CREATE branch. It is removed as an error rendered as success waiting on a
  change of error format, and the test keeps a guard for it. It is not claimed
  as a reproduced defect.
- Baseline ratchet 41 → 40 (`ratchet-license-requests.txt`).

Gates, on the tree with the change: `ci:migration-set-order`,
`ci:migration-drop-safety`, `ci:migration-reachability`, `ci:duplicate-table-ddl`,
`ci:unbacked-tables`, `ci:unkeyed-request-tables`,
`ci:tenant-isolation:no-regression`, `ci:column-reachability`,
`ci:rls-allowlist-sync` and `ci:insert-columns-declared` all pass. Typecheck is
clean in the touched files. ESLint on `auth.ts` shows 21 warnings, 0 errors,
unchanged from trunk. The onboarding client test and every `server/routes/__tests__/auth*`
test pass: 30 files, 237 tests. `ci:server-error-leaks` is red on
`server/routes/c2c/commitments.ts`, identically on the tree without this change.

### For the founder: a stored request still reaches nobody

The handler's comment says it "optionally emails the sales team". **It does
not.** There is no notification of any kind, and nothing in the product reads
`license_requests`. There is no admin view. After this fix, requests are
recorded and recoverable, but **no human learns one arrived** unless someone
queries the table. Until a reader or an alert exists — a product decision, and
new capability under Rule 2 — the team can see them with:

```sql
SELECT created_at, name, email, organization, message
  FROM license_requests WHERE status = 'pending' ORDER BY created_at DESC;
```

The query must run as the platform super-admin, or with enforcement off. The
table's policy exists to stop anyone else reading it.

## Recorded, not fixed: the EULA store fails open, behind no caller

`license_agreements` and `license_acceptances` are baselined absences too.
`server/services/licensing/eula-service.ts` creates them with the same runtime
DDL, which the production role cannot run. Its read paths catch the failure and
return `[]`, so `hasAcceptedAll()` answers **true** for everyone. That is an
error rendered as "every agreement accepted".

It is recorded rather than fixed, because nothing reaches it:

- `requireLicenseAcceptance` — the middleware that would enforce acceptance — is
  mounted on no route.
- `/api/licensing/*` is mounted, but no client code and no AnA tool calls any
  route under it.
- `docs/commercial/` relies on signed paper — pilot agreement, MSA, order form —
  and mentions no clickwrap.

So there is no in-app acceptance in the product, and the commercial terms do not
need one for launch. If in-app acceptance is ever wanted, it needs a durable
creator and read paths that fail closed. Building it is new capability.

## The class behind the intake defect — and the gate that closes it

The intake defect was not a one-off. It is one instance of a class that is
**invisible everywhere except production, by construction.**

### The fact the class rests on

PostgreSQL checks CREATE on the schema, and ownership of the table, **before**
it looks at `IF NOT EXISTS`. Production's runtime role (`app_service`) has
neither. So on the runtime connection each of these is refused **even when the
object already exists** — including the core `organizations` table
(`runtime-ddl-refused-on-existing-objects.txt`, PostgreSQL 16, as `app_service`):

| Statement (object exists) | Result as `app_service` |
|---|---|
| `CREATE TABLE IF NOT EXISTS license_requests (…)` | `permission denied for schema public` |
| `CREATE TABLE IF NOT EXISTS organizations (…)` | `permission denied for schema public` |
| `CREATE INDEX IF NOT EXISTS … ON license_requests` | `must be owner of table license_requests` |
| `ALTER TABLE license_requests ADD COLUMN IF NOT EXISTS …` | `must be owner of table license_requests` |

On a developer machine the server connects as a superuser and every one
succeeds.

### It had bitten before, and been fixed by hand each time

`tests/db/gdpr-service-runtime-role.dbtest.ts` records three earlier instances:

- the GDPR service threw on its first call in every process;
- the AI provenance ledger reported success and wrote nothing;
- `audit.tamper_proof_log` also reported success and wrote nothing.

Each was fixed where it was found. Nothing stopped the next one, and
`license_requests` was the fourth.

Worse, three guards vouch for runtime DDL as a way a table gets created:

- `ci:unbacked-tables` calls it one of *"three real provisioning paths"*;
- `ci:column-reachability` counts it as a creator;
- `ci:migration-reachability` calls it *"a real (if discouraged) provisioning path"*.

That is why `license_requests` never appeared in `ci:unbacked-tables`' baseline.
The guard counted the table as created by the very statement production refuses.
Only the live-database guard, run against a real provisioned database, saw it
missing.

### Every site, triaged at HEAD (15 files → 14 in scope)

| Disposition | Files |
|---|---|
| Launch-reached and broken in production — **fixed above** | `routes/auth.ts` → `license_requests` |
| Latent, in a mounted API nothing calls | `services/licensing/eula-service.ts` (read paths fail **open**: `hasAcceptedAll()` answers true); `routes/c2c/context-intelligence.ts` (`ai_feedback`, answers `recorded: true` with nothing stored) |
| Reached but harmless — caught, and the tables (and seed) come from the applier | `services/chat-thread-helpers.ts` (AnA chat; `20260728_chat_thread_store.sql`); `services/innovation/submission-readiness-twin-service.ts` (AnA tool `get_submission_readiness_twin`; `072_gcc_innovation_platform_core.sql`, 14 criteria rows present) |
| Boot, on the **owner** connection — safe | `db/ensureCoreTables.ts` (called with `DATABASE_URL`); `db/bootstrap/auth-schema.ts` (`ensureAuthTables` opens the owner pool when the role is split) |
| Dead — no importer, or no caller | `db/tenantRls.ts`, `utils/database-optimizer.ts`, `services/integrations/credentialVault.ts`, `db/setupLiterature.ts` (its only importer `initDatabase.ts` is itself unimported), `services/ai/openai-orchestrator.ts` (`initializeFactsGraph`, no caller) |
| Unmounted, gated, or test infrastructure | `routes/cognitive-ecosystem.ts` (retired, #844), `routes/test-assembly.ts` (`testRoutesEnabled` only), `db/pglite-harness.ts` (imported only by tests) |
| False positive, excluded by the pattern | `services/module-intelligence.ts:407` — a prompt quoting *"Create Table 2.7.4.1-1"*, an ICH E3 caption |

### `ci:runtime-ddl` — server code runs no DDL on the runtime connection

`scripts/ci/check-runtime-ddl.mjs` matches SQL-shaped DDL in runtime server code,
with comments stripped. The object keyword must be followed by an identifier, so
prose passes.

`scripts/ci/runtime-ddl-baseline.json` pins each of the 14 files above to its
exact statement count, and **every entry carries its written reason** — an entry
without one fails. So does a new file with DDL, or a baselined file that gains a
statement. There is deliberately no `--write-baseline`.

It is wired into `.husky/pre-push` and `.github/workflows/ci.yml` (with its
self-test), and runs in about 1.5 s with no database.

Shown failing, not just passing:

| Proof | Result | File |
|---|---|---|
| Self-test: 17 cases — seven DDL forms caught (lower case included), prose / comments / tests / migrations passed, a grown count caught, a missing reason caught, `--strict` on an overstated baseline | **17 / 17** | `runtime-ddl-selftest-and-mutant.txt` |
| Mutant gate whose pattern can never match | self-test **9 / 17**, exit 1 | same |
| **The real tree with the genuine pre-fix `auth.ts` (`254f502da~1`) restored in place** | exit 1, naming `server/routes/auth.ts:2342  CREATE TABLE IF NOT EXISTS l` | `runtime-ddl-gate-catches-prefix-auth.txt` |

A note on that last proof, since the first attempt at it was wrong. I first
restored `dfc52bd5c~1`. `dfc52bd5c` is a merge, so its first parent is the
**fixed** `auth.ts`, and the gate rightly passed. Found by checking that the
restored file actually contained the statement, which it did not. Redone
against `254f502da~1`, the commit before the fix.

### For `…01KiDof7` (W2 schema guards) — recorded, not edited

`ci:unbacked-tables`, `ci:column-reachability` and `ci:migration-reachability`
count runtime DDL as a creator. On production's connection it creates nothing.
With `ci:runtime-ddl` in place, no new runtime creator can land, so what that
path now vouches for is only the 14 baselined files. Whether to stop counting
them — which would surface the latent EULA and `ai_feedback` tables as unbacked —
is that lane's call. It was not changed from here.
