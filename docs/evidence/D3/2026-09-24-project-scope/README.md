# D3: a project-scoped request acts on the caller's own project, plan and session

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.

**Date:** 2026-09-24.

**Database:** the from-blank PostgreSQL 16 install of
`../2026-09-24-update-boundary/`. The runtime connects as `app_service` with
`app.rls_enforce=on`. See `posture.txt`.

**What this is not:** the row's closing evidence. That is the contract against
staging, owed with D1.

## What was wrong

These are ledger L195(b) and (c), the last of the findings from the L192 audit
apart from actor forgery. Every one was re-read against the code before it was
fixed.

| Endpoint | The defect | Does RLS stop it? |
|---|---|---|
| `/api/client-intelligence/project/:projectId/*` (8 routes) | They read and wrote project intelligence by project id alone. `POST …/profile` filed a profile in the caller's org against another tenant's project. | **No.** `project_id` is a foreign key, which Postgres checks without RLS. Without RLS, the same call moved the other tenant's profile into the caller's org and overwrote it, and `GET …/profile` served it. |
| `DELETE /api/client-intelligence/memory/:id`, `POST …/memory/:id/verify` | Wrote by id alone, then answered 200 whether or not anything was written. | Yes, but with RLS off another tenant's entry is archived or marked verified by the caller. |
| `PATCH /api/ana/platform/projects/:id` (and the AnA action that calls it) | `updateProject` spread the request body into `.set()`. | **No** for `clientWorkspaceId` and `parentProjectId`, which are foreign keys: the project was re-pointed at another tenant's workspace and project. For `organizationId`, RLS refused the move (500). Without RLS it moved the project into the other tenant. |
| `POST /api/resolution/bundles` | A `planId` from another tenant was written onto the bundle, and the plan's `bundle_id` was then set by plan id alone. | Partly. The bundle naming the other tenant's plan was created with RLS on, since neither column is a foreign key. With RLS off, the other tenant's plan was linked to the caller's bundle. |
| Corpus ingest (`POST /api/corpus/ingest` → `DrizzleCorpusWriter`) | Looked up an existing report by NCT id across every org, then updated it and replaced its details. | Yes: with RLS on, the insert hits the global unique key and the ingest counts an error. With RLS off, the other org's report was moved into the caller's org and its details replaced. |
| `/api/users/me*` (10 handlers) | Verified a live token, but not that it was an access token. | Not a tenant question. The router is mounted pre-auth-scoped, and the `/api` boundary in front of it is in warn mode outside production, so a password-only token awaiting its second factor read the account. |

"RLS off" is not hypothetical. Every policy on these tables passes all rows when
`app.rls_enforce` is not `on`, which is the posture outside production
(`posture.txt`). So in those environments the handler is the only wall.

## The fix

| Where | Change |
|---|---|
| `server/routes/client-intelligence.ts` | A `router.param('projectId')` guard proves the project is the caller's (`isOwnProject`) before any of the eight routes runs, and answers 404 otherwise. That is the pattern `server/api/cmc/projectRoutes.ts` uses. Memory verify and archive carry the org and answer 404 when nothing of this org has the id. |
| `server/services/client-intelligence-memory.ts` | `getProjectIntelligence` and `buildProjectIntelligenceContext` now require the org, so no caller can read a profile by project id alone. That covers the AnA session bootstrap, `remember_document_in_project`, and both chat context builders. The upsert's lookup carries the org, as do `archiveMemoryEntry` and `verifyMemoryEntry`, which return whether they wrote. |
| `server/services/ana-platform-controller.ts` | `updateProject` writes an allow-list of 24 configuration columns (`pickWritable`, typed against the row). Not the id, the org, the place in the hierarchy, the regulatory program, the owner or creator, or the server-computed token estimate. The WHERE carries the org. |
| `server/services/resolution/bundle-builder.ts` | The plan must be this org's, checked before anything is inserted, so a refused link leaves no orphan bundle. The link update carries the org. |
| `server/services/corpus/drizzle-corpus-writer.ts` | The lookup and the update carry the writer's org. A study another org holds falls through to the insert, which the global unique key refuses: the same outcome RLS gives. |
| `server/routes/users.ts` | `verifyAccessToken` = `verifyLiveToken` + `requireAccessTokenReason`, the rule the `/api` boundary applies. A refused token is a `SessionEndedError`, answered 401. |

## What the database contained

`tests/db/project-scope-boundary.dbtest.ts` is a new contract file on the shared
two-tenant fixture. It has 14 cases: 9 negative, each on rows no other case
touches, and 5 positive controls. The controls prove a guard that refused
everything would fail: the caller's own profile is written and read, its own
memory entry archived, its own plan linked, its own corpus report re-ingested,
and `/me` still answers an access token. The leak assertion comes before the
status assertion in every case.

**Red, unfixed code, production posture (RLS on): 8 of the first 12 fail.** The
four positive controls pass. Four are leaks with RLS enforcing:

- *"no profile of tenant A may hang from tenant B's project: expected 1 to be +0"*
- *"tenant A's project must not point at tenant B's workspace or project: expected { client_workspace_id: 110, … } to deeply equal { client_workspace_id: 109, … }"*
- *"no bundle may name tenant B's plan: expected 1 to be +0"*
- *"a password-only session must not read the account: expected '{"id":"140","email":"wo03_…' not to contain …"*

The other four are contained by RLS, and fail on the status:

- the profile read and the two memory writes answered 200 where 404 is expected (under RLS the read found no profile it could see, and the writes wrote nothing);
- the org move answered 500 (RLS refused it).

**Mutation B, unfixed code, RLS disabled on `projects`,
`project_intelligence_profiles`, `client_memory_entries` and `resolution_plans`:
all 8 fail on the leak itself.** Tenant B's profile was served to A, B's two
memory entries were archived and verified by A's user, A's project was moved into
B, and B's plan was linked to A's bundle.

**The corpus case** (added after those runs; the writer was still unfixed) passes
with RLS on, because the insert is refused. With RLS off on `csr_reports` and
`csr_details` it fails: *"tenant B's report and its details must stay tenant B's:
expected { organization_id: 90301, … }"*. Tenant B's title and objective were
replaced by A's.

**Mutation A, fixed code, RLS disabled on all six tables: 14 of 14 pass.** The
handlers hold without the database's help.

**Green, fixed code, production posture: 72 of 72** across the six fixture
suites (29 + 14 + 2 + 7 + 6 + 14).

## The evidence

| File | What it shows |
|---|---|
| `posture.txt` | From the catalog: RLS on each table, the policy's pass-all clause when enforcement is off, the foreign keys the pin cases write through, the plan link having none, and the corpus's global unique keys. |
| `red/contract-before-fix-rls-on.txt` | The 8 failures above, with RLS on. |
| `red/mutation-B-before-fix-rls-off.txt` | The same 8 as leaks, with RLS off. The RLS state is read back before and after. |
| `red/corpus-writer-before-fix.txt` | The corpus case, contained with RLS on and a takeover with it off. |
| `green/mutation-A-fixed-rls-off.txt` | 14 of 14 with RLS off on all six tables, with the state read back before and after. |
| `green/contract-72-of-72.txt` | The six suites, fixed, RLS on. |

The fixture teardown now also clears client memory entries and profiles,
resolution bundles and plans, and corpus reports and their details, all by
fixture org. After the red runs it was checked against the catalog and left
none of their cross-tenant rows behind.

## Recorded, not fixed here

- **L195**, narrowed to (a): actor forgery. CMC `validatedBy` / `approvedBy` / `initiator` / `approvers`, `submission-ops` `resolvedById`, and the GSPR HTTP route's `decidedBy` / `reviewedBy` are still taken from the body.
- **Corpus tenancy (new ledger row).** `csr_reports` keys a study across all orgs (`report_id`, `nct_id` unique), while RLS scopes it per org. So only the first org to ingest a study can hold it. Another org's ingest of it is refused, and the refusal names the constraint. Whether the precedent corpus is per-tenant or platform-wide is a product decision.

## Reproduce

```
TEST_DATABASE_URL=<owner url> APP_DATABASE_URL=<app_service url> \
  npx vitest run --config vitest.db.config.ts tests/db/two-tenant-application-rls.dbtest.ts \
    tests/db/report-os-tenant-from-session.dbtest.ts tests/db/traceability-update-boundary.dbtest.ts \
    tests/db/governed-edit-boundary.dbtest.ts tests/db/request-parent-boundary.dbtest.ts \
    tests/db/project-scope-boundary.dbtest.ts
```

For the mutation runs, disable RLS on the tables named above as the database
owner (`ALTER TABLE … DISABLE ROW LEVEL SECURITY`), run the last file, then
restore it (`ENABLE` and `FORCE ROW LEVEL SECURITY`) and read `pg_class` back.
