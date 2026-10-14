# Existing AnA catalog tools and canonical service

14 October 2026. Local, uncommitted work on `concept2cure-v2`, baseline `87b27c897c5d1be20b0527009bcaf425ebbf3af6`. Node `v22.23.3`. No live provider, production database, dependency, migration, deployment, commit or push.

The existing `catalog_project_document` now has mutually exclusive description and explicit read-only verification-preview branches. Facts without explicit preview mode refuse. Preview refuses actor/review/write fields, requires its default-off server flag plus the catalog gate and existing Vault write authority, and delegates to canonical current membership/private-project admission and current owned source reads on one read-only transaction executor. It writes no receipt, catalog, audit or embedding. Exact byte/extraction/quote/value failures refuse the batch; missing or failed context stays visible as an unreviewed diagnostic. Oversized complete diagnostic responses refuse with a reduce-batch message instead of clipping results.

`read_project_document` supplies exact original-byte and stored-extraction SHA-256 identities. The text hash is computed once per read, and delivery-aware window fitting/deferred receipts retain their prior semantics. Read windows and catalog coverage now use actual stored text length, so a stale catalog character count cannot clip the source or manufacture a complete read. The canonical loader constrains both recorded document organization and live program ownership and defensively refuses mismatched/missing organization identities, including historical reads.

Description writes take a private clone before the first await and pin the exact stored text digest before embedding. The hardened writer receives that digest, checked key-data snapshot and server-derived proposer; locked verification refusals preserve unverified paths. Reads, description results, listing and bootstrap DTOs disclose the legacy value-only check scope without inventing historical passes or scientific fact acceptance. The existing public service imports/re-exports remain canonical. Narrow parser, preview and type-only DTO helpers keep the implementation within lint limits; preview receives canonical query primitives and adds no runtime import cycle.

The serving-project boundary is also pinned across the tool and completion service. Registered description preflight must resolve the source and passes its server-loaded program as `expectedProgramId`; a fresh service load in another program refuses before embedding or writer invocation, even if the actor could write both. Body-supplied program fields cannot replace the expected program. The final writer retains its current-program fence for moves after that initial load. Catalog listing and bootstrap recall constrain both recorded document organization and live same-organization parent before computing totals, and malformed returned scope rows throw a visible failure instead of exposing descriptions or fabricating totals. This identity guard does not add actor-aware private-project policy to organization-wide bootstrap recall; that qualification boundary remains unchanged.

The existing list, read, catalog and search registrations opt into the lead's canonical safe exception transport. An uncaught exception returns a static failed request with `outcome:'unconfirmed'`, without raw SQL/private metadata or an unsupported claim that nothing changed. Other tool registrations retain their previous wrapper behavior. The [actual registered preview-exception baseline](tools-safe-outcome-red.txt) recorded 1 failure and 21 passes before opt-in; the updated case passes in the final 113-case run. This replaces the prior exception case, so it does not increase that count.

The first observed run of the initial 24 targeted cases produced 22 failures and 2 passes, demonstrating silent fact-field dropping, unknown-mode acceptance, missing identities/scope and mutable proposal handoff. The [registered-tool/service program-move baseline](tools-program-binding-red.txt) produced 4 failures and 2 passes; the [discovery/recall scope baseline](tools-discovery-scope-red.txt) produced 7 failures and 1 pass. Final [focused test log](tools-focused-tests-final.txt) records **113/113 across 11 files**, including unchanged project/id-space/read-receipt/key-free access/catalog-gate and updated writer compatibility tests. The five new owner test files account for 64 of those cases. Tests use synthetic source/authority/provider mocks; they are not deployed RLS or scientific-expert qualification.

[Selected-root TypeScript evidence](tools-target-typecheck-final.txt) records zero diagnostics over twelve owned roots using repository compiler options and ambient declarations; this is not a whole-repository typecheck. [Scoped ESLint evidence](tools-eslint-final.json) records zero errors and zero warnings. [Owner source hashes](tools-source-manifest.json) list seven production files and five new test files. Imported core/shared/admission changes and genuine PostgreSQL evidence belong to the lead's final manifest and review.

The focused run used the repository Vitest configuration on these paths:

```text
server/services/ana/__tests__/document-catalog-preview-tools.test.ts
server/services/vault/__tests__/document-catalog-source-snapshot.test.ts
server/services/vault/__tests__/document-catalog-preview.service.test.ts
server/services/ana/__tests__/document-catalog-program-binding.test.ts
server/services/vault/__tests__/document-catalog-discovery-scope.test.ts
server/services/ana/__tests__/document-catalog-tools-id-space.test.ts
server/services/ana/__tests__/document-catalog-tools-project-scope.test.ts
server/services/ana/__tests__/read-receipts.test.ts
server/services/ana/__tests__/vault-access-without-key.test.ts
server/services/ana/__tests__/catalog-gated-tools.test.ts
server/services/vault/__tests__/catalog-write-result.test.ts
```

The preview remains default off. Source relation checks do not establish scientific truth, regulatory applicability, method qualification or agency acceptance. No typed facts are persisted or independently accepted in this increment.
