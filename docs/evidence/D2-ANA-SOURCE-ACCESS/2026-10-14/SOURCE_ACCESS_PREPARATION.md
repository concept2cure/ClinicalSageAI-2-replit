# D2 AnA source access preparation — 2026-10-14

Status: read-only preparation. This note identifies a bounded authorization increment; it is not implementation or deployment evidence. All existing local changes on `concept2cure-v2` are preserved. No application, test, schema, provider, or client records were changed for this preparation.

## Finding

The repository already has an actor-aware canonical project policy. The remaining AnA document discovery and recall readers mostly establish organization/program ownership and conversation boundaries, but do not freshly establish the caller's active membership and permission to use a private project at each source access.

This is a static code finding, not a reproduced live tenant disclosure. A session initially admitted to a project can lose sharing or membership before a later tool call. An organization-wide conversation also has no private-project admission in these readers. The preceding scientific catalog increment deliberately hardened catalog writes and previews without claiming to repair organization-wide recall authorization.

## Canonical policy to reuse

- `server/services/ana/project-scope-admission.ts:101` exposes `admitAnaProjectScope(q, { organizationId, userId, projectId?, projectRef? })`. Explicit numeric and UUID scopes resolve exact tenant ownership, require a unique program/project anchor, reject contradictory identifiers, refresh persisted active membership, and use the canonical private-project policy. An omitted project intentionally returns null scope without validating membership. Therefore it cannot, by itself, authorize organization-wide source access.
- `server/services/report-os/project-access.ts:46` exposes `getAccessibleReportProjectIds(organizationId, { userId, role }, q)`; the individual variant is `canAccessReportProject`. Both share `allowedByProjectPolicy`, including current normalized `project_members`, persisted visibility, creator/owner fallback, management roles, and pending review assignments. Failures throw; an empty set means evaluated absence/denial.
- `server/services/project-sharing-access.ts` is the underlying sharing implementation. A viewer may use an organization-public or explicitly shared private project. A tenant-specific role also retains read access where project policy grants it. Do not introduce a read-role allow-list based on `GOVERNED_WRITE_ROLES`.
- `server/services/vault/document-catalog-admission.ts:67` already uses `admitAnaProjectScope` plus fresh membership and write-only role restrictions for catalog writes/preview. Its tenant/transaction locks should remain intact. It is not the right source-read entry point for organization-wide discovery because it requires one program and Vault tenant ALS.
- `server/services/authoring/authoring-program-access.ts:42` uses the same membership/project readers, with `forWrite:false` permitting legitimate viewers. It returns an authoring principal and takes authoring-specific actor identity, so using it for AnA Vault discovery would add an unnecessary parallel adapter.
- `server/services/ana/source-context-admission.ts` already protects exact selected CRE sources and uploads. Bound records require their recorded program and project/workspace identifiers to agree. A genuinely unbound upload is creator-only, except the documented immutable legacy figure association path. Current mutable HTML is not a read grant.

## Exact affected paths

| Entry point | Current boundary | Required addition |
| --- | --- | --- |
| `list_project_documents` (`document-catalog-tools.ts:135`) | `requireDocumentAccess` requires an org; `catalogScope` checks open/named program ownership | Pinned actor and fresh project policy before listing; actor-filtered program IDs applied before aggregate counts and limit |
| `read_project_document` (`document-catalog-tools.ts:370`) | Loads tenant-checked text before `documentScopeRefusal`; existing conversation scope compares programs | Admit recorded source program before text fetch, then exact current eligible source recheck before serving or deferring a receipt |
| `search_project_documents` (`document-catalog-tools.ts:512`) | Text and semantic SQL scoped to org and optional program | Actor-aware allowed programs in both arms before ranking/count/limit; recheck after embedding awaits |
| `search_document_passages` (`document-passage-tools.ts:107`) | Open/named program from ownership-only scope; RAG enforces tenant UUID | Actor admission and exact numeric/UUID tenant agreement; actor-filtered programs through canonical RAG filters, coverage, expansion, and final delivery |
| `loadDraftProjectSources` (`draft-project-sources.ts:40`) | Requires open project, metadata/text current hash and program agreement | Fresh actor/private-project admission before metadata/content and before returning loaded sources |
| `getCatalogBootstrapDigest` (`document-catalog.service.ts:634`) | Always organization-wide listing, no user argument | Actor-aware optional project scope; current session's program only when one is explicit |
| `listChatUploads` (`document-catalog.service.ts:583`) | Current tenant CRE records; program OR unscoped; no actor | Bound source scope admission and creator-only unbound uploads, before counts/limit; preserve unresolved scope refusal |
| Session auto-recall (`ana-session-bootstrap.ts:91,136`) | Input has org/project/thread, no user or projectRef; Vault and upload recall always org-wide | Carry authenticated user and explicit projectRef; authorize recall before protected loader calls; unavailable notice instead of fabricated emptiness |
| `recall_session_context` (`AnaToolExecutor.ts:951`) | Caller sends org/project but omits user and ref; model chooses optional thread ID | Propagate pinned `ctx.userId` and `ctx.projectRef`; source-file scope must not use model-body identity |
| MCP Vault list/search (`server/mcp/tools/vault.ts:29,83`) | Uses principal organization, omits principal actor | Existing shared readers must receive authenticated principal actor if their signature becomes required; no silent bypass for connector readers |

The route turn guards already admit the initially selected project through `admitAnaProjectScope`: `send-message.ts:119` and `stream.ts:377`. This initial guard should remain. It cannot replace rechecking later tool/read/recall calls after revocation.

The three actual session bootstrap caller changes are:

1. `server/routes/chat/send-message.ts:607`: supply `numericUserId` and `admittedProject.projectRef` (the server-resolved value), alongside `turnProjectId`.
2. `server/routes/ana-ri/stream.ts:1497`: supply the server-extracted numeric user and admitted/resolved projectRef, alongside `streamProjectIdNumber`.
3. `server/services/ana/AnaToolExecutor.ts:961`: supply `ctx.userId` and `ctx.projectRef`; do not use fields in `input` as authority.

## Smallest reusable API proposal

Add one source-read scope adapter adjacent to `project-scope-admission.ts`, reusing its canonical explicit-project admission and the canonical bulk project policy. Suggested shape:

```ts
interface AnaSourceReadActor { organizationId: number; userId: number }
interface AnaSourceReadScopeInput extends AnaSourceReadActor {
  projectId?: unknown;
  projectRef?: unknown;
  requestedProgramId?: unknown;
}
interface AdmittedAnaSourceReadScope {
  organizationId: number;
  userId: number;
  projectId: number | null;
  programId: string | null;
  projectRef: string | null;
  accessibleProgramIds: readonly string[];
  organizationWide: boolean;
  actorFiltered: true;
}
admitAnaSourceReadScope(q, input): Promise<AdmittedAnaSourceReadScope>
```

The adapter must validate positive server-pinned actor IDs even with no project. For explicit scope, call `admitAnaProjectScope`; preserve malformed and conflicting scope refusal, open-project cross-project refusal, and a legacy project without a program as an explicit zero Vault-program scope. For organization-wide scope, refresh the exact active membership role, evaluate `getAccessibleReportProjectIds` on the same connection, then map programs only through unique anchors.

Important grouping order: validate uniqueness over **all** organization anchor rows before intersecting accessible project IDs. A duplicate public/private pair must not become unique merely because a caller sees only the public row. Live programs with no unique anchor remain outside organization-wide source eligibility; an explicitly requested unresolved program returns the existing named refusal. No new anchor or grant may be invented.

The program list is a server-owned result. Do not accept caller/model supplied accessible-program arrays. SQL adapters should apply it with a parameterized `ANY(...::uuid[])`; an empty list means zero scope and must never be converted to omitted filtering. Both counts and paged/ranked results must use the same scope **before** LIMIT. A server-pinned program parameter remains exact and additional to the program list.

For a by-ID read, use identity-only tenant metadata to discover its recorded program, freshly admit that exact program while preserving the open-conversation boundary, and fetch protected text with the expected program/current version on the same executor. A helper that merely filters a serialized result after text or model/provider access is too late. Async embedding/query rewriting cannot carry a cached admission over its await; re-establish source access before source selection/delivery. Locks and provider sequencing must be defined by the contract, without holding policy writes for a remote call.

## Source identity and lifecycle requirements

- `loadDocumentForOrg` already requires recorded `d.organization_id` and live program ownership; opt-in `currentOnly:true` removes version-family supersession. Use it for current source admission and retain catalog/source byte hash coherence.
- `listProjectDocuments` checks recorded document tenant and live program ownership but does not currently remove superseded families. Catalog rows join exact content hash. Counts describe this current reader's SQL, so an authorization increment must state whether listing historical versions remains supported or current-only is chosen.
- `vault-search.ts` checks live program ownership and version-family currentness but not recorded `d.organization_id`; semantic catalog and passage coverage similarly omit that recorded source-tenant predicate. Add exact source/program/org agreement in the chosen shared SQL paths; do not repair or assume legacy conflicts.
- RAG dense, lexical, and lifecycle recheck SQL already have recorded source tenant and live-program checks, but no private actor or version-family predicate. Scope propagation must reach both ranking arms and context expansion/recheck.
- Preserve `vaultDataEligibleSql`: removed-data and disposition-superseded records must not enter new retrieval. `keep_data` retains extracted data with an original-unavailable caveat; it is not a successful original-byte verification.
- Chat upload listing currently filters eligibility after a bounded read and computes `hasMore` from pre-filter rows. Access/eligibility filters must occur before the page and its next-row probe so denied records do not distort visible counts or starve eligible older rows.
- A file with several recorded parents must satisfy all canonical retained-parent scope checks. A visible copy is not a grant to a private original.

## Fail-first fixtures for the contract owner

1. Active member in org, private program in same org, no sharing: by-ID read, listing, text search, semantic search, passages, draft sources, and bootstrap must not expose a unique sentinel title/body/dossier or defer a receipt. Existing ownership checks alone admit this static shape.
2. Open conversation initially shared, then `project_members.status` changes to revoked: next invocation denies. Also test owner/creator with removed organization membership, admin downgraded to unshared member, suspended user, inactive org, and duplicate ambiguous membership rows.
3. Positive viewer in public project and viewer with `use` sharing in a private project: reads work; catalog/write role gate still refuses. Include custom analyst role admitted by canonical sharing and pending reviewer access to avoid an accidental policy narrowing.
4. Org-wide listing/search with private high-ranked/newest documents and visible older ones: total/withheld and returned page include only permitted records, including visible records beneath denied entries. Empty permitted scope returns an honest evaluated zero; policy DB error returns unavailable.
5. Duplicate anchor public/private pair, zero anchor, foreign/deleted program, contradictory numeric/ref identifiers: no silent org-wide fallback or unique accessible-anchor shortcut.
6. Same-tenant program joined to a source row recorded under another org: text, catalog, coverage and recall refuse/exclude source; no migration/repair.
7. Superseded family and `remove_data`/`supersede` disposition with high match rank: never returned as current evidence. Retained `keep_data` remains readable under policy with original-unavailable caveat.
8. Revocation while an embedding mock is paused: no result or count carrying inaccessible source content after resumption. No real provider call is needed.
9. Pinned user differs from arbitrary `input.user_id` / `input.organization_id` / `input.accessible_program_ids`: body fields cannot grant access. Missing actor denies before content query.
10. Organization UUID resolves to another numeric org than request actor: passage search refuses rather than mixing hits from one tenant with counts from another.
11. Chat uploads: bound private source denies; unbound noncreator denies; creator-only unbound is visible; program plus contradictory recorded workspace denies; denied rows do not turn older visible uploads into a truncated or empty page.
12. Session auto-recall both chat routes and explicit recall preserve server user/ref, keep open-program scope, and label a failed source loader incomplete without presenting a zero-file statement.

These are proposed synthetic fixtures. None is independent review or expert scientific qualification evidence yet.

## Suggested file ownership

- Read admission owner: new shared AnA source-read scope adapter and focused admission tests; existing `catalog-scope.ts` reuse/migration only after caller DTO contract is published. Avoid modifying catalog write admission or canonical project policy semantics unless a failing fixture proves it necessary.
- Catalog reader owner: `document-catalog.service.ts` list/load/chat/bootstrap read portions, `document-catalog-source-scope.ts`, reader-specific tests. Preserve the prior completeCatalog snapshot/write implementation.
- Tool integration owner: `document-catalog-tools.ts`, `document-tools-shared.ts`, `document-passage-tools.ts`, `draft-project-sources.ts`, matching handler tests. No overlapping service-reader edits.
- Search/RAG owner: `vault-search.ts`, `vault-assistant-search.ts`, `document-catalog-search.ts`, `document-passage-search.ts`, `advancedRAGPipeline.ts`, query-filter DTO/canonical context recheck as required, and targeted scope/ranking tests. No new retrieval engine or model call.
- Recall/root owner: `ana-session-bootstrap.ts`, bounded existing `recall_session_context` block in `AnaToolExecutor.ts`, two bootstrap route caller blocks, MCP principal propagation, and integration/evidence.

Root selects the actual bounded ownership and final API. This preparation grants no implementation authority.
