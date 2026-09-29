# D3: a viewer could write the Vault through AnA, authoring and the shared services

**Row:** D3 (tenant and role isolation). **Workstream:** the AnA client-files
lane. **Date:** 2026-09-24. **Source:** handed to this lane by the vault
re-baseline (`docs/work-orders/README.md`, "Found by the vault re-baseline" →
`…01DiJJAk`: "The AnA vault write tools … carry no org-role gate: a viewer writes
the vault through AnA"). The same fix closes the item listed there as **D3,
unclaimed**: "Authoring file-to-vault (`e0f99d3c`) writes `vault.documents`
without `requireEditorAccess`: a viewer can write."

## The defect

`fd2ffa6ac` added `requireEditorAccess` to the two web routes that write the
Vault: `POST /api/vault/ingest` and `POST /api/c2c/project-vault/:id/file`.
Its message was "a viewer could do both". The services behind those routes have
other callers, and none of them checked a role:

| Caller | Writes through | Role check before |
|---|---|---|
| AnA `file_chat_upload_to_vault` | `ingestVaultDocument` | none (ToolContext carries no role) |
| AnA `place_project_document` | `placeVaultDocument` | none |
| `POST /api/authoring/docs/:docId/file-to-vault` | both | none |
| `POST /api/510k/estar/official` (retention) | `ingestVaultDocument` | `requireEditorAccess` |

Row-level security does not catch this either. The Vault's write policy scopes
writes by program, not by role, so the database accepted a viewer's row. This
was reproduced on real PostgreSQL as the runtime role (`app_service`, RLS on). A
viewer's scope, **and a scope with no role at all**, admitted a document,
stored its bytes and filed it, including through AnA's real
`place_project_document` handler. The AnA half is behind `ana.document_catalog`,
which is off in every deployment. The authoring half is not behind any toggle.

## The fix

`server/services/vault/vault-write-authority.ts`: `vaultWriteRefusal()` reads
the role the tenant scope carries and admits the middleware's own
`GOVERNED_WRITE_ROLES` (admin, manager, member, plus the platform roles that the
middleware keeps). The set is imported, not copied. `ingestVaultDocument` asks
first, before anything is stored, checked or disclosed; that is the order
`requireEditorAccess` uses. `placeVaultDocument` asks before it validates its
arguments. A refusal is `403 VAULT_WRITE_ROLE_REQUIRED`, and its message names
the role and says nothing was changed. AnA relays it through the tool's existing
`{ ok: false, error, message }` shape.

**Why the tenant scope's role is the right source.** Every caller that writes
the Vault today runs in a request scope, and on every one of them that scope's
role is the `organization_users` role:

- The global `/api` gate (`server/bootstrap/register-platform-routes.ts`) runs
  `authMiddleware` ahead of every authenticated route, including
  `/api/authoring`. It resolves the role from `organization_users`
  (`server/auth.ts`) and scopes the request with it.
  `establishRequestTenantScope` sets `req.userRole` from the same value, and
  that is what `requireEditorAccess` reads.
- The Vault ingest route re-enters its scope after multer with
  `req.userRole ?? req.user.role`.
- AnA's tools run inside the chat request's scope. No AnA code executes tools
  under a system scope; the system scopes in `server/services/ana/` write run
  bookkeeping only.
- No MCP, worker or scheduled path calls either service.

A scope with no role is refused. It is the one case this check cannot vouch
for, and no legitimate caller produces it.

## Evidence

The db runs are CI-shaped: `RLS_ENFORCE=on`, server pool as `app_service`.

| File | Result |
|---|---|
| `red/db-vault-write-role.txt` | 5 failed, 26 passed, run before the check existed. A viewer scope and a role-less scope each ingest a document through the service every caller shares, and each place a document; AnA acting for a viewer places one through the real `place_project_document` handler. The "member may" cases pass, as they should. |
| `red/unit-route-gate-disabled.txt` | The check disabled on purpose (`vaultWriteRefusal` forced to admit every role). The unit viewer and role-less cases and the authoring route's viewer case go red: the viewer's file-to-vault answers 201 and files the document. Restored immediately. |
| `green/db-vault-write-role.txt` | 56 passed: `vault-placement`, `vault-ingest`, `document-catalog` and `vault-catalog-tenant-isolation`. |
| `green/unit-vault-write-paths.txt` | 540 passed across 50 files: every unit or integration test that touches the Vault routes, the ingest, placement, catalog and AnA document tools, authoring file-to-vault and the eSTAR routes. |

## Test-harness change, and why it is not a weakening

`server/routes/__tests__/_authoring-canvas-fixture.ts` `makeApp` mounted the
authoring router with no tenant scope. The integration test mocks the database,
so the missing scope had never mattered, and the Vault services now read the role
from it. `makeApp` now opens the scope the production gate opens, with the role
`PREREQ` gives the author (`member`). `makeApp(router, { role: 'viewer' })`
drives the new viewer case. Without the scope, the three filing cases failed
403 "No organization role is attached". That was the harness diverging from
production, not the route.

## Gates

- ESLint against HEAD: `vault-ingest.service.ts` keeps its 2 warnings. The
  refusal wording moved into `vault-ingest-discard.ts` so the file stays under
  `max-lines`. Every other changed file is unchanged, or new with 0 warnings.
- `ci:tenant-isolation`: 8 candidates before and after.

## Not done here

- **The database does not enforce the role.** The Vault's RLS write policies
  (`core.can_write_program`) admit any member of the organization, viewer
  included. The check now sits in the one service every write goes through, but
  a new write path that bypassed the services would meet no role check at the
  database. Adding `app.current_user_role` to the policy is a schema change to
  the D3 lane's shared helper and belongs with that lane.
- **Authoring renders before it is refused.** The authoring route has no role
  gate of its own, so a viewer's request renders the export and is then refused
  at ingest. Rendering writes nothing (`renderAuthoringExport` has no INSERT,
  UPDATE or storage write), so nothing is left behind. Adding
  `requireEditorAccess` to that route would refuse earlier, but the route
  belongs to the authoring lane.
- **The authoring router's role comes from the token.** Its own middleware sets
  `req.user.role` from the JWT claim. That claim is the `organization_users`
  role at sign-in, so a demotion takes effect at the next token. The tenant
  scope the services read is set by the global gate from `organization_users`
  on every request, so the Vault check is not affected.
