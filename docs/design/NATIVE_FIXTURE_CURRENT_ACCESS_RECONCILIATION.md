# Current tenant and project access in five retained native fixtures

Date: 2026-10-14. Scope: test fixture reconciliation only, on `concept2cure-v2`.

The hosted native failures show that these older fixtures reach the current
tenant or project boundary before the behavior their assertions describe. A
manufactured request principal or an unanchored regulatory program cannot prove
the current route contract. This change records the prerequisites a real client
must satisfy and exercises the existing canonical policy without changing it.

The exact files are:

- `tests/db/c2c-project-persistence.dbtest.ts`
- `tests/db/vault-ingest.dbtest.ts`
- `tests/db/vault-annotation-harness.ts`
- `tests/db/vault-version-annotations.dbtest.ts`
- `tests/db/vault-version-annotations-record.dbtest.ts`

Each invocation creates fresh UUID-namespaced organizations, users, programs,
document codes and storage records. Explicit active users have actual
`organization_users` rows with their intended roles. HTTP requests carry genuine
signed access tokens for those explicit actors and pass through
`requireTenantContext`; the middleware resolves the current role and attaches
the actual request SQL client. JWT role claims do not authorize a request.

Owner connections seed or inspect invented QA records. Raw program fixtures are
given real default workspaces and project anchors through
`ensureOrganizationDefaultWorkspace` and `requireProgramProjectAnchor` in owner
seed transactions. The ingestion member has a recorded active project edit
membership. Annotation fixture projects explicitly use `org_public` visibility,
matching the original own-organization viewer-read controls. No missing workspace,
project identity or membership is fabricated by an authorization stub.

The ingestion role controls use separate actual viewer and member users. The
old missing-role control now uses a genuinely missing organization membership;
a null observation in tenant scope does not model a nonexistent role when the
current policy reads the actual organization membership. The existing viewer,
foreign-tenant, no-write, atomicity, storage, audit and annotation assertions are
preserved in this initial change. Two historical expected outcomes may therefore
remain red after the prerequisites are correct: foreign-target HTTP `403`
versus canonical `404 PROJECT_NOT_FOUND`, and missing-membership
`VAULT_WRITE_ROLE_REQUIRED` versus `PROJECT_ACTOR_ACCESS_DENIED`. Any adjustment
requires an actual restricted-runtime observation and a separate reviewed
contract addendum. This design does not change those expectations.

Teardown retains QA data, audit history and stored bytes. It never disables
immutability triggers, deletes records by a reusable prefix, or reactivates an
older fixture organization. The existing annotation record tests still exercise
their explicit guarded mutation refusals and canonical tenant-purge control on
that invocation's fresh `gone` tenant; that behavior is a test subject, not
teardown. Its denial and unaffected-tenant assertions remain unchanged.

The project persistence fault control temporarily renames `regulatory_programs`
and restores it in `finally`. This reaches the actual licensed quota count's
undefined-table failure while the user's organization and membership remain
verifiable. Renaming `organizations` instead fails the earlier authentication
boundary and cannot prove `PENDING_STORE`. This DDL control requires a separately
allocated fresh native QA database and exclusive test execution. It must not run
against the shared reporting, catalogue or MCP QA database.

Before execution, the private installer and runner must retarget every owner,
runtime and test connection to that allocated database, verify the existing
`app_service` login is neither superuser nor `BYPASSRLS`, require RLS enforcement
and verify FORCE RLS on the relevant tables. The canonical fresh installer and
deploy migrator may refresh database-local object privileges for the existing
role; no global role creation, password rotation or role-membership grant is
authorized. Global role and membership fingerprints must remain unchanged.
Installer, source pins, original hosted failures, exact command, restricted-role
posture and each bounded native result are recorded separately. Preparation and
lint do not constitute a native green result.
