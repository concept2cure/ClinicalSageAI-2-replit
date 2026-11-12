# D3: the real-database tier at head, on a database built from empty, 2026-11-12

**Row:** D3 (tenant isolation proven). **Package:** L1, with F1 for the two repairs. **Session:**
`session_01UrPzGsENAo1PbcH1GQGRvX`.

D3's evidence is the two-tenant contract run on a real PostgreSQL as the non-superuser runtime role with row security
on. This is that tier (`npm run test:db`, 264 files) run at head, twice, on databases built from empty the way CI's
Integration Tests job builds them. Nothing was added: it is run, and what it found is repaired in the files that
already existed.

**Result.** At `592233d61`: 13 of 3,261 failed, in 2 files. At `5b12373521` (trunk as of `788b8b3838` with this
lane's two repairs): 3 of 3,266 failed, in 1 file. What stays red is one known conflict between two founder decisions, which no session
may settle (below).

## What already exists

Searched before running or changing anything (RULE 3): the tier, its CI job, earlier D3 records, and today's entries
in the coordination file.

| Piece | Path | What it does today | What it did not do |
|---|---|---|---|
| The tier | `tests/db/*.dbtest.ts` (264 files), `vitest.db.config.ts`, `npm run test:db` | Runs against a real database: the owner on `DATABASE_URL`, the product's own pool on `APP_DATABASE_URL` as `app_service`. | — |
| CI's recipe | `.github/workflows/ci.yml`, job "Integration Tests" (`:1634-1845`) | Installs Noto fonts, drops and creates `concept2cure-ri_dbtest`, runs `install-fresh` then `deploy-migrate`, then the tier with `CI=true NODE_ENV=test RLS_ENFORCE=on`. | About two days behind trunk, and its database jobs were cancelled in the newest completed runs. |
| The Vault fixtures' guard | `tests/db/vault-current-access-fixture.ts` (`assertVaultFixtureDatabase`) | Refuses to seed unless the database is literally `concept2cure-ri_dbtest` (or a declared `platform_ci_vault_fixture_*`) and the runtime user is `app_service`. | — |
| Today's earlier run | the CI-throughput lane (`01J935DZ…`), at `21c6837180`, 05:09 UTC; `docs/evidence/F1/2026-11-10-trunk-ci/README.md` | 5 of 3,243 failed; 2 fixed; 3 left as the founder's (`tenant-purge-blocking-keys`). | Ran before the four commits below landed. |
| The last D3 records | `docs/evidence/D3/2026-10-18-gate-suite-green/` | The 13 tenant gates, 12 green without a database; `ci:purge-coverage` on a local schema. | No tier run. |
| From-blank provisioning | `provisioning-from-blank.md` in this directory (`dfa9927bc`) | The repair that let a database be built from empty at all today. | — |

**A correction to this lane's own first message.** It said the tier had not been run at head since 2026-09-30. That
was wrong: the CI-throughput lane ran it this morning. The search had covered `docs/evidence/D3/` and the plan, and
not the coordination file. What this run adds is the 16 hours of trunk after theirs.

## The environment, stated so the result can be weighed

| | Here | CI's job |
|---|---|---|
| PostgreSQL | 16.15 with pgvector 0.6.0 (Ubuntu packages, installed for this run) | `pgvector/pgvector:pg15` |
| Database | `concept2cure-ri_dbtest`, dropped and created empty before each run | the same name |
| Schema | `node scripts/db/install-fresh.mjs` then `node scripts/db/deploy-migrate.mjs`, both exit 0 | the same two commands |
| Runtime role | `app_service` (LOGIN, NOSUPERUSER, NOBYPASSRLS), minted by `deploy-migrate` | the same |
| Environment | `CI=true NODE_ENV=test RLS_ENFORCE=on`, `DATABASE_URL` and `TEST_DATABASE_URL` as the owner, `APP_DATABASE_URL` as `app_service` | the same |
| Fonts | `fonts-noto-core`, `fonts-noto-cjk` | the same |
| Node | 22.23.4 | `22` |

The PostgreSQL major version differs from CI's. Nothing found here depends on it: each failure below is explained by a
commit, and each repair was shown red and green on the same database.

Recipe, as run:

```
DROP DATABASE IF EXISTS "concept2cure-ri_dbtest"; CREATE DATABASE "concept2cure-ri_dbtest";
DATABASE_URL=<owner> APP_SERVICE_DB_PASSWORD=<local> node scripts/db/install-fresh.mjs
DATABASE_URL=<owner> APP_SERVICE_DB_PASSWORD=<local> node scripts/db/deploy-migrate.mjs
CI=true NODE_ENV=test RLS_ENFORCE=on DATABASE_URL=<owner> TEST_DATABASE_URL=<owner> \
  APP_DATABASE_URL=<app_service> npm run test:db
```

## Run 1, at `592233d61` (21:23:22Z to 21:38:52Z)

```
 Test Files  2 failed | 262 passed (264)
      Tests  13 failed | 3248 passed (3261)
   Duration  928.67s
```

The tree was clean before and after, and the head did not move during the run. Every failing test is named in
`red/H-tier-at-592233d61-13-failed.txt`. Provisioning: `green/J-install-fresh-at-592233d61.txt`,
`green/K-deploy-migrate-at-592233d61-tail.txt`.

### 1. `tests/db/tenant-purge-blocking-keys.dbtest.ts`, 3 of 6: known, and the founder's

Unchanged since the CI-throughput lane recorded it this morning, and it is right to be red. `fd04214563` (P-104) put a
RESTRICTIVE owner boundary with FORCE row security on `ana_relational_profiles`. The purge runs in the organization's
scope with no account, so its delete removes 0 of those rows, the later `DELETE FROM projects` fails with 23503 on
`ana_relational_profiles_project_id_fkey`, and the whole erasure rolls back. The export, read in the same scope, leaves
those rows out too.

**So today a tenant with a project-bound AnA relational profile cannot be erased.** Two decisions disagree: P-58 (the
export returns every row the purge erases, then the purge erases) and P-104 (a private profile admits only its owner,
"even inside the tenant or system scope"). The decision needed is written out in the coordination file under "→ the
founder, the P-104 private-profile owner … and the D6 offboarding owner": whether the offboarding export returns
members' private AnA profiles or they are excluded by a founder-approved entry and erased without being returned, and
how the purge erases them. `user_intelligence_profiles` is under the same decision and is not in the purge's list at
all. **Not repaired here: the repair is either a privacy boundary or a new door, and neither is a session's to
choose.**

### 2. `tests/db/vault-estar-required-sections.dbtest.ts`, 10 of 12: the suite had fallen behind a deliberate change

New since this morning's run. Every failure is the same line: "the filing document is in the Library: expected
undefined to be truthy".

`41d18d0b8` (16:36 UTC, P-123 item 8) made the Library list a filing's outline once:
`placeAuthoredSectionsInBinder` (`server/services/vault/vault-binder-outline.ts`) moves an authored section into the
binder heading with its key, stamps it with its filing document's id, and removes the document's own folder once it
is empty. The suite's helper looked for that folder at the top level of the tree. The two cases that still passed are
the EU ones (`mdr:ema`, `ivdr:ema`), whose outline the binder is not. The change was verified against the unit and
service tests; this suite needs a database and had not been run on it.

The product is right. The helper (`libraryLeaves`) now collects a document's leaves from wherever the Library puts
them: under a node carrying the document's id, or under the document's own folder. What each case asserts is
unchanged: the Library's mark and blocker for a section are the eSTAR mapper's answer (P-107 item 3).

| Stage | Result | File |
|---|---|---|
| In the tier at `592233d61` | 10 failed, 2 passed | `red/H-tier-at-592233d61-13-failed.txt` |
| After, the suite alone on the same database | 12 of 12 | `green/L-estar-suite-after.txt` |
| M1: `project-vault.ts` answering from the pack's flag again, the defect P-107 item 3 closed | **exit 1**: 7 failed, 5 passed | `red/M1-estar-suite-library-ignores-the-mapper.txt` |

M1 is the control: a helper that finds more leaves could also have made the suite vacuous. With the original defect
put back, it fails, so it still proves what it is for. The product file was restored byte for byte and is not part of
the change.

## Also found on the from-blank database: `ci:purge-coverage`

The one tenant gate that needs a provisioned database was run on it and failed: two tables became org-keyed today and
the purge reached neither, so an erased tenant kept its support messages. Repaired in the purge's own list, with a
real-database case and a control. Its record is `purge-coverage.md` in this directory.

## Run 2, at `5b12373521` (22:11:59Z to 22:26:33Z)

```
 Test Files  1 failed | 263 passed (264)
      Tests  3 failed | 3263 passed (3266)
   Duration  872.38s
```

`5b12373521` is this lane's two repairs (`05758671e5`, `de95410fe0`) merged with trunk as of `788b8b3838`, which had
moved by 430 files since run 1, among them a governed-content migration
(`db/migrations/038_gcc_ectd_seeder_service.sql`) and `deploy-migrate.mjs`. So the database was
dropped and built from empty again at that tree: `install-fresh` exit 0 with 31 of 31 guarded root files re-applied
(`green/S-install-fresh-at-5b12373521.txt`), `deploy-migrate` exit 0. The tree was clean before and after, apart from
this directory's own files, which were being written, and the head did not move.

The three failures are the three of `tenant-purge-blocking-keys` above, test for test
(`red/R-tier-at-5b12373521-3-failed.txt`). Nothing else is red. The eSTAR suite passes inside the tier, 12 of 12, and
the purge's suite 14 of 14. The five tests beyond run 1's 3,261 are this lane's new purge case and four that arrived
with trunk in `tests/db/ectd-filed-state-view.dbtest.ts` (7 to 11, all passing).

So everything this tier tests of the two-tenant contract passes at head, on a real database, as the runtime role,
with row security on. The one exception is a purge that refuses to run; no test of a read or a write across tenants
fails.

## Two errors in this lane's own first attempt, both discarded

1. **The database was named for the run** (`c2c_d3_head_20261112`). Five Vault suites then failed in setup, because
   `assertVaultFixtureDatabase` refuses any name but CI's. That is the guard working.
2. **The tree changed during the run.** A push's merge landed while the tier was still going.

That run was stopped and none of its results are used. Both runs reported here used CI's database name, started from a
clean tree, and had no git activity until they finished.

## Not done

- **The purge conflict (P-58 against P-104).** The founder's. See 1 above.
- **No hosted run.** Everything here is local. CI is about two days behind, and its Integration Tests job has not
  reached these commits.
- **PostgreSQL 15.** Not run on CI's major version.
- **The staging run D3 owes with D1** is still owed; it depends on the AWS account.
- **`docs/LAUNCH_DEFINITION_OF_DONE.md`'s D3 row** still carries the `search_atoms_hybrid` sentence that was closed
  on 2026-09-24 under D4. Left for the row's owner, as on 2026-10-18.
