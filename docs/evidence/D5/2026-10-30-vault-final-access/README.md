# D5: complete current access admission for Vault archives

## What already exists

Live searches covered `beginArchiveBuild`, `sendStagedArchive`, `recordVaultArchive`, `installProjectRouteAccess`, `requireCurrentProgramAccess`, `canReadAuditTrail`, `forShare`, project membership and private-project sharing across the existing Vault routes, services and native tests. Deleted-history search: `git log --all --diff-filter=D -- '*archive*' '*Staged*'`; no alternative live archive admission owner was found.

- `server/routes/c2c/project-vault.ts` already admits the current project through `installProjectRouteAccess`, stages verified bytes with the canonical archive builder, atomically records aggregate and per-document export rows, and uses the shared delivery/build guard. Neither archive compares its initial admission with current access after the potentially long byte/ZIP work.
- `server/routes/c2c/project-route-access.ts` and `server/services/c2c/current-program-access.ts` are the canonical project admission and truthful refusal owners. The latter verifies the current organization actor, unique project/program anchor and sharing policy; its `forShare` mechanism retains the organization/user/membership rows until the caller's transaction completes.
- `server/services/audit/audit-api-authority.ts:canReadAuditTrail` owns audit identity authority, but archive callers pass its original request role rather than the current database role already admitted by the project middleware.
- `server/services/vault/vault-archive-delivery.ts` already cleans an interrupted response and releases its process-local build admission through the routes' `finally` blocks.
- `tests/db/vault-folder-export.dbtest.ts` and `tests/db/vault-data-room-seal.dbtest.ts` already exercise real HTTP routes, verified storage and PostgreSQL as restricted `app_service` under RLS. Extend them rather than adding another archive path or fixture database.

## Design

Capture the middleware's `CurrentProgramAccess` before building each archive. Derive the existing audit-identity authority from that captured current database role, retaining the existing platform identity rule. Before writing export audit rows, re-admit the same actor/program inside `recordVaultArchive`'s transaction with the existing `forShare` mechanism and compare actor, role, exact project anchor and client-workspace anchor. Recheck the same current admission after writing the audit rows and before commit; any changed/unavailable access rolls back and flows through the existing project-access refusal mapper. This retains the actor's role through the final audit transaction and detects observed project/sharing/anchor changes without adding a parallel permission policy or holding locks through long byte construction/downloads.

A changed authority refuses the prepared archive; it is not rebuilt under a guessed or stale role. Stage cleanup and build release continue through the existing `finally` owners. This is a final transaction admission, not a claim of absolute revocation linearizability during an already-started network stream. A permission change after the final transaction commits remains outside that short admission boundary.

## Original native negative controls

Two isolated source-transform tests on the original implementation used the existing disposable `platform_ci_vault_fixture_20261030` database and restricted runtime role. Removing only the synthetic viewer's private-project membership after ZIP construction still returned HTTP200. Demoting only the synthetic administrator to viewer at the same point still returned the named-actor/IP audit projection. Each synthetic change was restored in `finally`; no trigger or permission bypass was used. Original logs and the temporary transform are retained with this evidence.

## Verification

`03-native-red.txt.gz` records 8 new failures with 28 existing controls still passing. `04-native-green.txt.gz` records all 36 native checks passing, including both archive routes after project revocation and organization-role change, current-database-role projections despite stale request roles, folder workspace-anchor movement and revocation during audit recording. Refusals send JSON without an archive hash, commit no aggregate or per-document export rows, remove staging and release build admission. Each synthetic mutation is restored in `finally`.

`05-focused-green.txt.gz` records 86 passing checks across eight existing archive, admission, parent-access, history and cabinet suites. `06-mutations.json` and the four compressed mutation logs demonstrate that removing the role comparison, workspace comparison, final pre-commit admission or current-role identity projection is caught by its native test. Transform plugins change loaded source only; live files remain unchanged during these controls.

`07-lint-comparison.json` compares historical and current bytes at their actual filenames through the existing lint owner: zero errors, six existing route warnings unchanged, zero warnings in both native suites. `08-verification.txt` gives exact commands and the admission boundary. Combined compiler, build and publication evidence belongs to the root continuation; no deployment or full launch acceptance is claimed.
