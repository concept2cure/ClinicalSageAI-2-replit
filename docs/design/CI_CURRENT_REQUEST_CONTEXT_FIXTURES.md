# CI fixtures for current request context

Status: bounded fixture repair following published CI run `38522415630` on
`concept2cure-v2`. The first scope covers the AnA deterministic stream health
fixture and the secondary native access proof's isolated database selector.
Production access policy, role grants and schema indexes are outside this scope.

## Request clients and fixture boundaries

Application routes use `requestPgClient(req)` or `requestDb(req)` on the actual
client attached by the canonical tenant middleware. A missing `req.dbClient`
must remain a refusal. A request's current actor, organization and recorded
parent must be established on that executor before private metadata, counts,
checksums, content or bytes can be supplied. The shared pool must not substitute
for the request connection.

`tests/routes/ana-ri-health.test.ts` deliberately mocks database, orchestration
and provider dependencies. Its SSE helper mounts the router after the middleware
boundary and tests the core deterministic response. Bind the same declared fake
SQL executor returned by that fixture's `getPool()` to `req.dbClient` in this
helper. Preserve the expected `done` event and all existing health/provider
assertions. The health and command helpers keep their existing setup.

This seam qualifies deterministic core delivery with the declared mocks. It does
not establish production authentication, current membership or parent admission,
native RLS, provider availability, or a general unscoped stream access policy.
Do not mock an allow decision, restore a production fallback, or label the fake
executor as native admission evidence.

Native HTTP fixtures require the actual tenant middleware and restricted runtime
client. An `establishRequestTenantScope` AsyncLocalStorage marker alone does not
attach `req.dbClient`. The canonical middleware owns checkout, tenant stamping
and cleanup. Writers retain their actual transaction executor for admission,
locks, mutation and audit; readers retain the transaction scope their SQL needs.

## Current membership and recorded parents

A mocked verified principal identifies the caller; its role string does not
create an organization membership. Seed the intended actor's real active user,
active organization and `organization_users` row. Preserve separate real viewer
or peer identities for refusal probes. Never infer the current requester from a
stored citation creator, source uploader or historical audit actor.

A `regulatory_programs` row alone does not establish an accessible project.
Positive fixtures must provide the programme's actual canonical project anchor,
workspace and intended ownership/sharing records. Give an existing legitimate
positive its recorded parent rather than an organization-wide grant. Retain
private, foreign, ambiguous, revoked and unbound-source refusal assertions.
Historical actor naming and citation/hash preservation remain independent of a
current grant to read the parent.

Direct catalogue or tool fixtures must pass the actual scoped SQL executor and
current actor under the current service interface. For example,
`getCatalogBootstrapDigest(q, organizationId, { userId, limit })` cannot be
replaced by the former two-argument call or a fabricated scope allowlist. The
remaining native fixture families are separate repair scopes; this document
does not classify all hosted failures as fixture-only.

## Narrow native database selection

`tests/db/project-vault-secondary-access.dbtest.ts` previously accepted only the
recorded local target `/platform_ci_native_recheck_20261013`. Hosted CI provisions
`/concept2cure-ri_dbtest` and supplies it consistently through `DATABASE_URL`,
`TEST_DATABASE_URL` and the restricted `APP_DATABASE_URL`.

The test selector permits only:

- The existing recorded local QA database.
- The exact disposable hosted database when `CI=true` and `NODE_ENV=test`.

Owner and runtime URL host, port and database must match, and the runtime URL
must name `app_service`. These are defensive selector checks. Existing native
queries must still prove actual `current_user`, `NOSUPERUSER`, `NOBYPASSRLS`,
forced table RLS, enforcement and request tenant scope. URL labels cannot
replace those queries. Missing runtime selection, production/default database
names, endpoint disagreement, wrong runtime identity and CI-name use outside
the declared CI context remain refused before fixture seeding.

The selector adds no role, membership, project/source grant or policy bypass.
Synthetic test data and history stay within the declared isolated target. The
two newer protocol authority and report-pack native proofs use dynamic actual
database identity with restricted runtime checks; they do not need this old
local-name exception.

## Verification and evidence

Preserve the original local AnA failure before applying its fixture change. The
red must identify `REQUEST_DB_CONTEXT_REQUIRED`; an unrelated import or setup
error does not qualify it. Then run the affected health/readiness suites and
scoped lint. Keep the expected `done` assertion.

Lightweight selector checks cover the allowed local/CI targets and rejected
missing, mismatched, production and wrongly scoped inputs. They are selector
checks only. Run the actual native proof after an execution slot is available,
preserving its restricted-role/RLS checks and its current actor/source refusals.

Record this repair in a new evidence phase with exact source and raw log pins.
Do not rewrite earlier sealed citation, golden journey, schema or native proof.
This work makes no compiler-zero, image-boot, whole-CI, provider, concurrency
through COMMIT or regulatory acceptance claim beyond its recorded checks.

The bounded repair is verified: the original deterministic-stream case failed
with the request-client refusal, then the unchanged `done` assertion passed in
the complete 303-case AnA readiness suite. The actual secondary native suite
passed all 18 cases on the recorded isolated QA database; the selector passed
12 static cases. Scoped lint has zero errors and the same one pre-existing
health-fixture warning. The first readiness wrapper attempt executed no tests
because its login shell reset the executable search path; a process-local
Node 22/Vitest path restored the exact package script without repository or
system-shell changes. Exact logs, source pins and qualifications are in
[the current request-context evidence](../evidence/D2-PLATFORM-COMPLETION/2026-10-14/ci-current-request-context/README.md).
