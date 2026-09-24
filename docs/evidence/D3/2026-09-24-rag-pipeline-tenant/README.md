# D3 — the RAG pipeline scoped the vault to its caller's argument, not the session

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-09-24. **Finding:** the vault re-baseline's unclaimed D3 item,
_"The vault context-expansion (small-to-big) query has no org predicate and
relies on RLS alone"_ (`docs/work-orders/README.md`). Following it found the
defect one level up. **Database:** PostgreSQL 16, `c2c_d3`, provisioned from
empty by `scripts/db/provision-test-db.sh` at `0521402e`. The runtime connects
as `app_service` (not superuser, no BYPASSRLS) with `RLS_ENFORCE=on`. See
`posture.txt`.

**What this is not:** the row's closing evidence, which is the contract against
staging with the production image, owed with D1.

**Claimed late, recorded honestly:** the lane row in `docs/work-orders/README.md`
§0 was written when the work was filed, not before it started.

## The defect

Every vault query in `server/services/advancedRAGPipeline.ts` took its tenant
from the pipeline's `organizationUuid` **option**, and it did so twice:

- `withTenantContext` runs `SET LOCAL app.current_org_id = <option>`. Vault RLS
  keys on exactly that GUC. The `vault.documents` SELECT policy is
  `core.can_access_program(program_id)` → `identity.can_access_program` →
  `identity.current_org_id()`, which reads `current_setting('app.current_org_id')`
  (in `posture.txt`).
- The vault search arm's explicit predicate, `o.uuid = $4`, is the same option.

So the SQL and the database both answered to whatever uuid the caller passed.
The request's own tenant scope, the one the auth boundary opened from the
verified session, was overridden for the length of the transaction. The
context-expansion query really does lack an org predicate, but its RLS was keyed
on the caller's value, so it was no boundary.

Callers that could pass a uuid they did not get from the session:

- `server/routes/chat/send-message.ts` builds its tool context's uuid as
  `req.tenantContext.organizationUuid || req.headers['x-org-uuid']`. That reaches
  `search_document_passages` and then this pipeline.
- The cortex query route's generate and advisory modes did the same until
  `c062f4b0` (`../2026-09-24-cortex-tenant-header/`, whose containment section is
  corrected for this).
- `server/routes/ana-features.ts` has the same fallback at five routes. At
  `/citations/run` it reaches `ragPipeline.retrieve`, which the work orders
  record for that lane.

## The contract

`tests/db/rag-pipeline-tenant-scope.dbtest.ts` is its own file on the shared
two-tenant fixture. Each org gets a `regulatory_programs` row, a
`vault.documents` row and one chunk. It calls `ragRouter.retrieve` exactly as
`search_document_passages` does (vault corpus, basic strategy, no reranking),
inside tenant A's request scope. Only the query embedding is stubbed.

| #   | Case                                                                                                               | Unfixed, RLS on                        | Fixed, RLS on |
| --- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | ------------- |
| 1   | A handed its own uuid retrieves its own passage (positive control)                                                 | pass                                   | pass          |
| 2   | A's session handed B's uuid never receives B's passage                                                             | **fail** — B's passage returned        | pass          |
| 3   | …and is refused, not quietly answered                                                                              | **fail** — resolved with B's documents | pass          |
| 4   | …including when the scope carries no uuid (when a header fallback fires); the same scope handed A's uuid is served | **fail** — B's passage returned        | pass          |
| 5   | no uuid keeps its existing refusal                                                                                 | pass                                   | pass          |

Case 2 is a live cross-tenant read under enforcing RLS as `app_service`. A
database that enforces a policy is not a boundary when the application picks
the key the policy reads.

| File                                   | Shows                                                                                                                                                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `red/unfixed-pipeline-rls-on.txt`      | The unfixed pipeline: **3 fail, 2 pass**. _"tenant B's vault passage reached tenant A's session"_.                                                                                                                          |
| `red/mutation-no-tenant-id-lookup.txt` | The fix with its tenant-id lookup removed, so it compares against `scope.orgUuid` only: **1 fail** (case 4). A guard that stands down when the scope has no uuid stands down in exactly the case the header fallback fires. |
| `green/fixed-pipeline-5-of-5.txt`      | The fix: **5 of 5**.                                                                                                                                                                                                        |
| `posture.txt`                          | `app_service` flags, vault RLS state and policies, the definer functions, and `identity.current_org_id()`'s body.                                                                                                           |

## The fix

`assertCallerTenantIsSession` in `advancedRAGPipeline.ts` runs at the top of
`retrieve()` and inside `withTenantContext` straight after the connection is
taken, before the GUC is set. Inside a tenant scope:

- an `organizationId` other than the scope's tenant is refused;
- an `organizationUuid` other than the session's is refused. The session's uuid
  comes from `scope.orgUuid`, or from the `organizations` row for the scope's
  tenant id when the scope carries none;
- a refusal throws `RagTenantScopeMismatchError`. An empty result would read as
  "the vault has nothing on this", which is an error rendered as an empty
  result.

This closes the cross-tenant read for every caller running in a request scope,
`send-message.ts` included. It does not remove that file's header fallback,
which is the chat lane's. It adds no predicate to the context-expansion query:
with the GUC now always the session's, the RLS it relies on is keyed correctly.

`vault-passage-search.dbtest.ts` and the cortex suite still pass on the same
database (18 of 18 with this suite). So do the 16 unit files that touch the
pipeline (138 of 138).

## Still asserted, not proven

- **Outside a tenant scope, or in system scope (`tenantId '0'`), the guard
  stands down** and the pipeline still trusts its caller's uuid. Background jobs
  and scripts run there by design and have no session to compare against. A
  system-scope caller that forwards a client value would reopen this; none was
  found, but that is a search, not a proof.
- **`core.can_access_program` returns TRUE when neither `identity.can_access_program`
  nor the auth-schema equivalent exists.** That fail-open is not live on this
  install (both exist, `posture.txt`), but a database missing the identity
  schema would expose the vault to every tenant. Recorded, not changed here:
  its creator is outside this lane.
- The vault tables have RLS enabled but not FORCEd. They are owned by
  `postgres` and `app_service` is not the owner, so RLS applies to the runtime.
  An owner-role connection would bypass it.
- **Staging.** The row closes there, with the production image, owed with D1.
