# P1-7b — the X-Client-ID workspace header is a claim, verified before it counts (IAM-15, second half)

**Row moved:** D6 (security posture); the finding is D3-shaped (tenant isolation) and is closed here as
part of the audit's P1 tranche.
**Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` IAM-15 (Medium), second half. The `x-org-uuid`
half was closed by lane `…01W5zW66` in `b1618c69` (`docs/evidence/D3/2026-09-24-atom-search-tenant-key/`).
**Plan item:** `docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md` P1-7.
**Commit:** the control tower's, 2026-09-26; every run in this folder was made on the working tree over
HEAD `7fbe51c5`.

## What was wrong (verified at HEAD `7fbe51c5`)

- `server/middleware/tenantContext.ts:157` copies the `X-Client-ID` header onto
  `req.tenantContext.clientWorkspaceId` with no check that the workspace belongs to the session's
  organisation; the docblock at `:100-101` called it "non-sensitive supplemental context".
  `client_workspaces` rows belong to organisations (`shared/schema.ts:1156-1162`).
- `server/middleware/featureToggleMiddleware.ts:26-35` handed `Number(clientWorkspaceId)` to
  `FeatureToggleService.isFeatureEnabled`; `featureToggleService.ts:135-142` (`resolveEnabled`) answers
  true when `enabledForClientWorkspaceIds.includes(id)` — a WIDENING read, so a toggle enabled for
  organisation B's workspace opened for any caller who named that id. A non-numeric header went through
  as `NaN`. Latent at HEAD: `requireFeature`'s one mount (`regulatorySubmissions.ts:21`,
  `/api/regulatory-submissions`) sits behind the global `/api` gate alone, which never reads
  `X-Client-ID`; live the moment `requireFeature` is mounted on any of the ~17 routers that use
  `tenantContextMiddleware`, or on the cortex router (`cortex-unified.ts:128` writes the same field).
- `server/routes/cerv2-document-routes.ts:26-39` → `:549` → `INSERT documents.client_workspace_id` at
  `:581` and `:608` (`POST /api/cerv2/documents/:documentId/save`): the header in three spellings
  (`x-client-id`, `x-client-workspace-id`, `x-client-workspace`) or a query parameter, parsed and written
  unverified — another organisation's workspace key on this tenant's document row. A missing claim was
  an unhandled throw (500).
- `server/routes/regulatorySubmissions.ts:92-105` → `:191` `INSERT regulatory_submissions
  .client_workspace_id` unverified (`POST /projects`); `:118` and `:162` used the same claim as a read
  filter.
- No gate: `scripts/check-security-patterns.ts` had rules for the organisation/tenant headers
  (`tenant-trust-header`) and the identity headers (`identity-trust-header`) and none for the workspace
  header.
- No client sends `X-Client-ID` (`client/src/contexts/TenantContext.tsx:316-331` builds it; nothing calls
  `getTenantHeaders`), so the header is attacker-only today.

## What changed

- **One ownership predicate.** `FeatureToggleService.workspaceInOrganization(clientWorkspaceId,
  organizationId)` (`server/services/featureToggleService.ts`): one read of `client_workspaces` by id
  and organisation, `LIMIT 1`; positive integers only, nothing else reaches the database; the caller's
  tenant scope when it has one and the system scope otherwise (the `readToggle` rule); fails closed — a
  read that cannot be made is "not this organisation's", logged. Every consumer in this item uses it.
  (`server/routes/c2c/project-access.ts:45-79` keeps its own `pool.query` of the same predicate: it
  throws and, with no claim, resolves the organisation's own workspace — a different contract. Folding
  it onto this method is a follow-up, named below, not this item.)
- **The feature gate** (`server/middleware/featureToggleMiddleware.ts`): `ownWorkspaceId(req, orgId,
  claim)` — the workspace counts only when it is one of the session organisation's own; otherwise the
  feature resolves at organisation level and the header is logged and ignored. No organisation → never
  checked; no header → no read; non-numeric or non-positive → no read.
- **`POST /api/cerv2/documents/:documentId/save`** (`server/routes/cerv2-document-routes.ts`):
  `resolveClientWorkspaceId(req, organizationId)` returns a result — 400 for no or an invalid claim, 403
  for a claim outside the organisation (without saying whether the id exists anywhere), the id otherwise
  — and the handler answers it before any table probe or write. The header reads carry
  `// security-allow: workspace-claim` with the verification on the lines below.
- **`/api/regulatory-submissions`** (`server/routes/regulatorySubmissions.ts`): `claimedWorkspace(req,
  organizationId)` verifies the claim; `getTenantContext` (now `async`, awaited at its nine call sites)
  answers 403 for a foreign workspace on every handler — a read is refused outright rather than narrowed
  to nothing, and a write never carries a foreign key.
- **`server/middleware/tenantContext.ts`** docblock (`:100-109`): the workspace id is a claim; names the
  verifiers and the gate. The header read itself is kept — `c2c/project-access.ts` consumes the claim as
  input to its own ownership check, so removing the read is not the fix.
- **Gate** `workspace-trust-header` in `scripts/check-security-patterns.ts`: matches
  `req.headers['x-client-…']`, `req.header('x-client-…')` and `req.get('x-client-…')` for the three
  spellings. Exempt, each with its reason in the file: `server/middleware/tenantContext.ts` (the reader
  by design), `server/utils/tenantContext.ts` (`getTenantContext()`: its consumers filter by the value
  or verify it against the project's own workspace in `project-module-bridge.ts`; no write), and
  `server/routes/cortex-unified.ts` (**deferred, not legitimate** — dated; see "Left open").

## Evidence

| File | What | Result |
|---|---|---|
| `red/unit-before-fix.txt` | the four suites against unchanged HEAD `7fbe51c5` | 15 of 20 fail — middleware 4/6 (the organisation's own workspace never checked; foreign `9` passed through; workspace `5` trusted with no organisation; `abc` passed through as `NaN`); service 5/5 (`workspaceInOrganization` absent); cerv2 4/5 (foreign `9` → 200 and written; the aliases and `?client_workspace_id=9` → 200; no verification call; no claim → 500); regulatory submissions 2/4 (`POST /projects` with foreign `9` → 201, written; `GET /projects` with foreign `9` → 200 `[]`). `exit=1` |
| `red/security-patterns-before-fix.txt` | the gate with the new rule against HEAD's consumers | 4 violations: `cerv2-document-routes.ts:27,28,29`, `regulatorySubmissions.ts:94`. `exit=1` |
| `green/unit-after-fix.txt` | the same four suites after the change | 20 of 20 pass. `exit=0` |
| `green/security-patterns-after-fix.txt` | the gate after the change | 0 violations across 2854 files. `exit=0`. The rule was then shown still to bite: a scratch `server/routes/__p17b_probe/probe.ts` reading `req.headers['x-client-id'] \|\| req.get('X-Client-Workspace-Id')` produced `[workspace-trust-header] 1 violation(s)` and was removed |
| `green/existing-suites.txt` | the neighbouring suites that import or mock the changed modules (`tenant-isolation-org-uuid.contract`, `project-access-guard-unavailable`, `document-chunking.tenancy`, `document-catalog-bootstrap`, `smoke`, `strictPositiveInt`) | 6 files, 61 tests pass. `exit=0` |
| `green/lint.txt` | `eslint` per touched file, HEAD vs working tree | no file's warning count rose (`cerv2-document-routes.ts` 4→4, `regulatorySubmissions.ts` 1→1, `tenantContext.ts` 3→3, `check-security-patterns.ts` 1→1, the two feature-toggle files 0→0); the five new files lint clean |
| `green/gates.txt` | `check:security-patterns`, `ci:server-error-leaks`, `ci:tenant-isolation:no-regression`, `audit-requestdb-coverage.mjs` | the first two OK (leak baseline 145 → 145, no file gained a site). Tenant isolation: FAIL on `server/services/submission-service/submission-service.ts#59f216b0a04a` — **trunk's, not this item's**: the submission lane's red the board already records (DP-37), and none of this item's files appear in `docs/reports/tenant-isolation-baseline.json`. The requestdb audit's output is in the file |
| `dbtest-unexecuted.txt` | `tests/db/feature-toggle-workspace-header.dbtest.ts` attempted here | **UNEXECUTED**: no PostgreSQL answers in this container (`psql` finds no socket; the suite refuses rather than skips, `tests/setup.db.ts`). Written on the two-tenant fixture; to be run where a database answers |

## The plan's acceptance ("dbtest per route with RLS off: a foreign id → 403/404")

`tests/db/feature-toggle-workspace-header.dbtest.ts` is that test, on `tests/db/two-tenant-fixture.ts`
(`workspaceA`/`workspaceB`, `tokenA`/`tokenB`): a `feature_toggles` row off everywhere and enabled for
`workspaceB` alone; `tokenA + X-Client-ID: workspaceB` → 404 (200 before the change); `tokenB` naming its
own workspace → 200; `tokenA` naming its own → 404 until the toggle lists it, then 200 while `tokenB`
naming A's still gets 404; no header → organisation level; a non-numeric header → not a workspace; no
token → 401 at the boundary. Two facts about it:

- **RLS.** It runs under the suite's default `RLS_ENFORCE=on` and the answer does not depend on it:
  `feature_toggles` has no tenant column and no policy (row security never contained this finding), and
  the ownership SQL carries the organisation predicate itself, so a policy on `client_workspaces` — none
  found in `migrations/` — could only narrow, never widen.
- **"Per route" is synthetic.** No production router combines `tenantContextMiddleware` with
  `requireFeature` at HEAD, so the composed app is the real auth boundary, the real tenant-context
  middleware and the real feature gate in the order a router that used all three would mount them.
  The two production consumers that DO write the claim are pinned by the supertest suites above
  (`cerv2-document-save-workspace.test.ts`, `regulatory-submissions-workspace.test.ts`), which prove the
  call pattern and the statuses; the predicate itself is what the dbtest proves.

## Re-run

```
NODE_OPTIONS=--max-old-space-size=1536 npx vitest run \
  server/middleware/__tests__/featureToggleMiddleware.workspace.test.ts \
  server/services/__tests__/featureToggleService.workspace.test.ts \
  server/routes/__tests__/cerv2-document-save-workspace.test.ts \
  server/routes/__tests__/regulatory-submissions-workspace.test.ts
npx tsx scripts/check-security-patterns.ts        # or: npm run check:security-patterns
# where a database answers (APP_DATABASE_URL + TEST_DATABASE_URL, RLS_ENFORCE=on):
npx vitest run --config vitest.db.config.ts tests/db/feature-toggle-workspace-header.dbtest.ts
```

## Left open

- **Deferred: `server/routes/cortex-unified.ts:128`** reads `x-client-workspace-id` into the cortex
  router's own `tenantContext.clientWorkspaceId`. The file is inside another lane's 24-hour window
  (`session_01T2wooCZu46W7msw4TJuuzr`, `f7597c2c`, 2026-09-26 04:43; **window closes 2026-09-27 04:43
  UTC**) and was not edited. The gate exempts it with a dated comment that says it is a deferral. Not
  needed for this closure — `featureToggleMiddleware` now verifies whatever lands in the field — but any
  consumer inside the cortex router that reads that field directly is unverified; that lane, or a
  follow-up after the window, either verifies it with `workspaceInOrganization` or drops the header and
  lets the verified path decide, and then removes the exemption line.
- **The dbtest is unexecuted here** (no database). Until it has run once where a database answers, the
  plan's acceptance column is met in code and by mocked-service tests, not by the real predicate.
- `server/utils/tenantContext.ts:35` reads the same header into `getTenantContext().clientWorkspaceId`
  and is exempt because its consumers today only narrow (`project-hierarchy.ts`, `projects-management.ts`)
  or verify against the project (`project-module-bridge.ts`); a future WRITE through it would be
  unverified. Fold it onto `workspaceInOrganization` when that file is next touched.
- `c2c/project-access.ts:45-79` keeps a second copy of the ownership predicate (`pool.query`, throws,
  own-workspace fallback). Fold onto the one method in a change of its own.
- Same class, not header-borne, out of P1-7b's scope: `report-os.ts:993-1006` writes a body-supplied
  `clientWorkspaceId` into `reportProgramGroups` unverified; `qc.routes.ts` and `client-intelligence.ts`
  use query-supplied ids as read filters.
- `requireFeature`'s one mount (`/api/regulatory-submissions`) still has no `tenantContextMiddleware`, so
  per-workspace toggles are inert there as before; mounting it is a feature decision, now safe.
- `tenantContext.ts:349 requireClientWorkspaceContext` has no users; deleting it is a product decision
  under the working agreement, not a cleanup.
- Behaviour that changed for a caller: the cerv2 save answers 403 (foreign) or 400 (none/invalid) where
  it answered 200 or 500; the regulatory-submissions handlers answer 403 for a foreign workspace where
  reads returned `[]` and the write carried the foreign key. No client sends these headers; a caller of
  `?client_workspace_id=` now needs one of its own organisation's workspaces.
