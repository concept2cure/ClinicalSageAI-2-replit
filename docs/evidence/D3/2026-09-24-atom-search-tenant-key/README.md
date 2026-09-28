# D3 — an atom search runs under the session's tenant key, or it does not run

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-09-24. **Claim:** `docs/work-orders/README.md` §0, session
`…01W5zW66wy5szuFwRQYUKmkE`. **Database:** PostgreSQL 16 + pgvector, provisioned
from empty by `scripts/db/provision-test-db.sh` (install-fresh + deploy-migrate,
1235 base tables); the runtime connects as `app_service` (not superuser, no
BYPASSRLS) with `RLS_ENFORCE=on`. See `posture.txt`.

**What this is not:** the row's closing evidence, which is the contract against
staging with the production image, owed with D1.

## The finding

`enhancedEmbeddingService.searchHybrid` is the one road into `lumen_data_atoms`
for AI retrieval. Authoring's AI draft, deep research, AnA chat, AI section
editing and template generation, evidence-ask, the cortex search and the RAG
pipeline's project arm all end in it. It had two ways to read another tenant's
evidence.

**No key ran unfiltered.** With no `organizationUuid` it called
`search_atoms_hybrid` with no atom filter, ranking every tenant's atoms.
Authoring's AI draft (`authoring.router.ts`) and deep research
(`deep-research.ts`) never passed a key; `evidence-ask.ts` passed an optional
one. Until `search_atoms_hybrid` was fixed today
(`docs/evidence/D4/2026-09-24-atom-search/`, `881680d73`) every call failed, so
nobody saw it. From that fix on, a CTD section draft could be grounded in, and
cite as `[SRC-n]`, another sponsor's Data Room.

**A key was trusted as given.** Nine routes built their key as
`tenantContext?.organizationUuid || req.headers['x-org-uuid']`:
`ana-features.ts` ×5 (citations, batch citations, submission chat ×2, the
authoring plan), `c2c/ai-editing.ts` ×2, `chat/send-message.ts` ×2. The header
took over whenever the scope carried no uuid — the degraded membership path.
`ai-editing.ts` and `send-message.ts` call `searchHybrid` directly, and the
chat path also records the run as scope `'global'`. The security-patterns rule
that forbids tenant headers matched only `x-organization-id` / `x-tenant-id`,
so none of the nine was ever flagged.

## What contained it, and what did not

In production posture the database contains both: `lumen_data_atoms` is
FORCEd, its `tenant_isolation_policy` keys on the session's GUC, and
`search_atoms_hybrid` is not SECURITY DEFINER. Production refuses to boot
without `RLS_ENFORCE=on`. D3 asks for more than that — the application must
hold the boundary with the policy off — and it did not.

| # | Case (tenant A's request scope) | Unfixed, RLS on | Unfixed, RLS off | Fixed, RLS on | Fixed, RLS off |
|---|---|---|---|---|---|
| 1 | A's own key serves A's atoms (positive control) | pass | pass | pass | pass |
| 2 | a key naming tenant B is refused, and no search runs | **fail** — `[]`, no refusal | **fail — B's atom served** | pass | pass |
| 3 | no key is refused — never the unfiltered search | **fail** — ran, RLS kept it to A | **fail — B's atom served** | pass | pass |
| 4 | a scope with no uuid resolves the session's own key | pass | pass | pass | pass |
| 5 | on that degraded path, a key naming B is still refused | **fail** — `[]` | **fail — B's atom served** | pass | pass |
| 6 | outside a per-user scope, no key is named | pass | pass | pass | pass |
| 7 | outside any scope, the key alone holds on an owner connection | pass | pass | pass | pass |

Tenant B's atoms score higher than tenant A's in the fixture, so any search not
held to A surfaces B's first. In every case the leak assertion runs before the
refusal assertion, so a red result names what crossed.

| File | Shows |
|---|---|
| `red/unfixed-service-rls-on.txt` | The old service, RLS on: 3 fail (2, 3, 5), none on a leak — the database answered for the code. |
| `red/unfixed-service-rls-off.txt` | The old service, RLS off on `lumen_data_atoms`: the same 3 fail, each on *"expected '[{"id":37,"content":"tenant-B: …' not to match /tenant-B/"*. |
| `red/tsc-callers-without-key.txt` | With the key required, the compiler names the four callers that had none to give. |
| `red/security-patterns-x-org-uuid.txt` | The widened rule on the unfixed tree: the nine reads, plus one in a cortex comment (reworded). |
| `red/M1-no-assert-rls-off.txt` | Fixed, minus the session assertion, RLS off: cases 2 and 5 fail, each serving B's atom. |
| `red/M2-no-key-check-rls-on.txt` | Fixed, minus the key check: case 3 fails — a silent `[]` where a refusal belongs. |
| `red/M3-evidence-ask-reads-request.txt` | `evidence-ask.ts` reading the request's `tenantContext` again: its new 403 case fails, the search having run. |
| `green/fixed-rls-on.txt` | The fix, RLS on: 23 of 23 — this file's 7, D4's `atom-search` 5, the D3 cortex contract 6, the D3 pipeline contract 5. |
| `green/fixed-rls-off-atoms.txt` | The fix, RLS off on `lumen_data_atoms`: 18 of 18 (this file, D4's, cortex). The fix holds without the policy. |

RLS was restored and re-read (`rls=true force=true`) after each run that
disabled it.

## The fix

- **One resolver.** `server/db/currentTenant.ts` — `currentTenantOrgUuid(db)`:
  the verified tenant scope's uuid, or the organizations row for the scope's own
  tenant id when the scope carries none; null outside a per-user scope. It takes
  no request, so no header, body field or middleware-written context can reach
  it. The same derivation lived in three places and none of the eleven
  retrieval sites used any of them: cortex's local `sessionOrgUuid` and the
  derivation inside `advancedRAGPipeline`'s D3 guard now call it, and
  `utils/tenantContext.getSecureOrgUuid` — no production caller — is deleted,
  its contract moved to the new resolver.
- **The choke point refuses.** `searchHybrid` requires the key: none throws
  `TenantKeyRequiredError`; one that is not the session's throws
  `TenantScopeMismatchError` (the D3 pipeline's check, moved to the same module,
  messages unchanged). Both refusals come before the embedding call. The
  unfiltered branch is gone. This also covers the pipeline's project arm, which
  searches with `artifactScope.organizationUuid` — a field the pipeline's own
  guard did not check.
- **Every caller passes the session's key.** The nine header reads and the three
  keyless or optional callers resolve it and refuse with 403
  `TENANT_CONTEXT_REQUIRED` when there is none — before any work, and on the
  streaming route before its event-stream headers. Authoring's AI draft and deep
  research treat it as a failed retrieval instead, because Authoring already
  reports `retrievalStatus: 'failed'` with its reason. `send-message` and
  `evidence-ask` record `'org'`: a `'global'` retrieval can no longer happen.
- **The rule that should have caught it does.** `scripts/check-security-patterns.ts`'s
  `tenant-trust-header` now matches `x-org-uuid`: 10 violations on the unfixed
  tree, 0 after.

Every changed route sits behind the global `/api` auth boundary, which opens the
session's tenant scope before the route runs (`middleware/authBoundary.ts`; none
of these paths is on `PUBLIC_API_ALLOWLIST`). Two unit harnesses mounted routers
without it and gained a middleware that opens the scope as the boundary does.

## Found on the way — recorded, not fixed here

1. **Thresholds are passed as weights.** `ai-editing.ts` (×2), `send-message.ts`,
   `evidence-ask.ts`, `deep-research.ts` and Authoring pass their similarity
   *threshold* (0.65 / 0.7 / the caller's) as `searchHybrid`'s third argument,
   which is `semanticWeight`. Nothing filters by the threshold, so they always
   take the top-k however weak. Retrieval quality, not isolation.
2. **Two retrieval failures still read as "no sources".** `ai-editing.ts` reports
   only `sourcesRetrieved: N`, and deep research only logs; a failed retrieval
   looks like an empty corpus to the person reading the draft. Authoring's AI
   draft shows the honest pattern (`retrievalStatus`). A missing tenant key is
   refused before either path, so this change does not route into it.
3. **`middleware/tenantAuth.ts` admits by header** when there is no JWT user
   (`x-tenant-id` / `x-tenant` against `ALLOWED_TEST_ASSEMBLY_TENANTS`). It is an
   admission gate on the test-assembly routes, not a data key, and it reads the
   header with `req.header(...)`, a form the security rule does not match.
4. **The security-patterns checker skips only comment lines that start with `//`
   or `*`.** A block-comment line without the leading `*` is scanned as code —
   the cortex comment above was flagged for that reason. Its exemption list also
   names `middleware/auth.js` and `middleware/tenantContext.js`, which are `.ts`
   now; those files pass on their `security-allow:` markers.
