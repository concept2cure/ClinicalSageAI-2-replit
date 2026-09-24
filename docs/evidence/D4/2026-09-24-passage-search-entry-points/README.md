# D4: passage search was unavailable in a deep investigation

**Row:** D4 (Validation package), retrieval honest state. **Workstream:** the
AnA client-files lane. **Date:** 2026-09-24. **Source:** handed to this lane by
the vault re-baseline (`docs/work-orders/README.md` → `…01DiJJAk`: "The vault
passage tool refuses on two AnA entry points that never pass
`organizationUuid`").

## The defect

`search_document_passages` scopes the vault corpus by the tenant **uuid**
(`server/services/vault/document-passage-search.ts`). Without one it throws
`PassageSearchUnavailableError`, and the tool tells AnA that nothing was
searched. `project_knowledge_search` and the artifact scope need the same value.

The chat route puts it on the tool context. `executeAgenticLoop` has two other
callers, and both built their context from the integer org id alone:

| Entry point | Reachable | Tool context |
|---|---|---|
| `server/services/ana/deep-investigation.ts` (AnA's `start_deep_investigation`) | yes: a tool in every chat | `{ organizationId, userId, projectId }` |
| `server/services/ana/ana-realtime.ts` (socket.io `/ana`) | registered (`server/socketServer.ts`), but **no client connects to it** | `{ organizationId, userId, projectId }` |

A deep investigation (the thorough, multi-round research AnA runs in the
background) therefore could not search the client's document passages, or the
project knowledge, at all. Each attempt came back "unavailable". The honest
refusal held, but the capability was missing exactly where AnA reads most deeply.

## The fix

`executeAgenticLoop` now builds its tool context with
`withScopeOrganizationUuid()`. When the caller passed no uuid, it takes the one
the active tenant scope holds, **only when that scope belongs to the same
tenant** (`scope.tenantId === String(ctx.organizationId)`). A deep investigation
is started fire-and-forget from inside the chat request, so it runs in that
request's scope. That scope's uuid is the one the auth boundary resolved
(`establishRequestTenantScope`). The fix never takes another tenant's uuid,
never overrides a uuid the caller passed, and adds nothing outside a scope.

It is filled once, in the loop, rather than in each caller, so a future caller
cannot repeat the omission.

## Evidence

| File | Result |
|---|---|
| `red/unit-executor-agentic-loop.txt` | 1 failed, 7 passed. The real `executeAgenticLoop`, driven by a scripted gateway, runs a tool inside the tenant's request scope, and the tool still sees no `organizationUuid`. The guard cases (another tenant's scope, a uuid the caller passed, no scope) already pass. |
| `green/unit-executor-agentic-loop.txt` | 8 passed. |

The suites that drive the same loop also pass: `governed-write-gate`,
`agentic-loop-cancel-entries`, `tests/services/agentic-loop`, and the passage and
deep-investigation tests (112 tests across 6 files). `AnaToolExecutor.ts` has the
same ESLint count as HEAD (0 errors, 102 warnings, all pre-existing).

## Not done here

- **The realtime namespace opens no tenant scope at all.** Its socket
  middleware verifies the token and stores the org and user ids on the socket,
  but runs no `runWithTenantScope`, no membership re-check and resolves no role.
  Under `RLS_ENFORCE=on`, which production requires, every pool query its tools
  issue is refused by the instrumentation. The uuid fix does nothing there, and
  the Vault write check (`docs/evidence/D3/2026-09-24-vault-write-role/`)
  refuses writes, which is correct. No client connects to `/ana`. Whether to
  scope it properly or remove it is a decision for whoever owns realtime AnA,
  and removing it follows the working agreement on deleting a capability.
- **`send-message.ts` falls back to the client's `x-org-uuid` header** when
  `req.tenantContext.organizationUuid` is missing, for the tool context and the
  submission chat. A client-supplied tenant key is the pattern the re-baseline
  already lists for the cortex vault Q&A route. RLS on the vault tables keys on
  the session's own GUC, not the header. Even so, the fallback should be the
  scope's uuid or nothing. The chat route is outside this lane.
