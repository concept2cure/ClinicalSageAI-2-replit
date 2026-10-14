# Catalog actor-read and capture-discovery owner evidence

The approved D2 source-access contract governs this increment. Existing scientific preview/write paths, the catalog value checker, raw source/receipt primitives and historical human review records remain intact. Changes are local on `concept2cure-v2`; no provider, dependency, table, migration, backlog operation or deployment was added.

## Implemented boundaries

- `loadDocumentForOrg` accepts server-internal `allowedProgramIds` and the existing transaction executor. The filter applies before full-text projection. Catalog rows join only the selected exact content hash; current family membership is projected from the canonical family SQL.
- `listProjectDocuments` accepts the same server-only filter/executor and a current-only option. Actor facades apply the canonical accessible program set before SQL windows and LIMIT. Returned metadata must agree with the admitted scope.
- `withAnaSourceReadScope` opens one short READ COMMITTED transaction, requires matching ambient tenant/identified actor, stamps the tenant and current persisted role, admits the canonical source scope, refuses a role change between the current-role stamp and that admission, and re-admits the pinned scope before COMMIT. Read authority preserves viewer/custom-role policy. No provider call occurs inside this wrapper.
- Actor by-ID reads re-load and compare the exact source, bytes, stored extraction, currentness and disposition before returning. Historical by-ID reading is explicitly disclosed and earns no new current-source receipt. Readable legacy bodies without a coherent recorded catalog remain readable and also earn no new receipt. `keep_data` retains eligible text with original unavailable. Metadata-only reads expose the exact extraction SHA while stripping the body; the digest is not body-delivery proof.
- Composite callers may use `revalidateActorSourceScope` after independent awaits; changing role/project/program or accessible-program set refuses the stale result.
- Chat capture discovery first reads eligible identity fields without filename/title/dossier/body. It uses canonical upload access for every candidate before the final counted/limited SQL. The counted SQL includes only admitted files and exact program/workspace anchors. Unique anchors are counted across all same-org rows before intersecting allowed programs. A denied extra upload parent excludes that file before pagination; unknown policy/SQL state remains unavailable.
- Creator-owned unbound discovery requires a genuine `chat_upload` capture, matching capture creator and upload creator, and no open project. Bound captures require exact recorded program/workspace agreement. Canonical upload access is repeated over the full admitted file set after loading the page, including files outside the page, so a newly private unreturned upload cannot leave a stale authorized total.
- Existing legacy receipt/coverage comments describe aggregate original-byte-bound host-span history. They make no durable extraction-specific, current-actor or provider-served claim.

## Verification

`CATALOG_FAIL_FIRST.log` records four authority-filter/executor controls failing against the prior raw queries. The missing allowed-program predicates and ignored protected executor were observed before the fixes.

`CATALOG_FINAL_TESTS.log`: Node 22, 157/157 tests across 11 suites. This includes four focused owner suites plus existing discovery, legacy value, scientific preview, source snapshot, catalog write and governance regressions. Controls cover matching active viewer reads, empty scopes, source/extraction drift, historical/retained caveats, canonical upload extra parents, unbound ownership, workspace and anchor inconsistency, stale outside-page count, unknown ledger/access and final revocation.

`CATALOG_TYPECHECK.log`: eight owned production/test roots, repository compiler options and ambient/imported dependencies, zero selected-scope diagnostics. This is a target diagnostic check, not a whole-repository typecheck.

`CATALOG_ESLINT.json`: zero errors and zero new helper/test warnings. The existing catalog service max-lines warning remains; the added helpers have no warnings. This check does not imply repository-wide lint success.

Exact commands use `/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node`. The exact argument arrays and source hashes are in `CATALOG_SOURCE_MANIFEST.json`; the Vitest command names all 11 suites in its output; it uses `vitest.config.ts`. The typecheck uses the already-published scientific increment's `owned-target-typecheck.cjs` with the eight owned roots. ESLint uses the repository configuration and JSON reporting on those same roots.

These owner tests use controlled query/policy stubs and establish sequential source-admission behavior. Independent held-out and real owned PostgreSQL evidence belong to the control tower/review owner. No deployed role posture, RLS guarantee or atomic remote-egress revocation claim is made here. Capture discovery performs an identity-only candidate scan and canonical parent admission before counting; it does not apply an organization-wide top-N post-filter and label the sample a complete authorized count.
