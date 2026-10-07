# Derived-workbook dependency containment receipt

Date: 2026-10-07. W3/D4. Branch `concept2cure-v2`.
Contract: [DERIVATION-PLAN.md](DERIVATION-PLAN.md).
Related Authoring continuation: [AUTHORING-SOURCE-SNAPSHOT-RESULTS.md](AUTHORING-SOURCE-SNAPSHOT-RESULTS.md).

## Resulting behavior

The disposition impact now finds an eligible captured workbook that names the
original source ID or original upload, including a workbook captured into
another project of the same organization. Its complete recorded capture row
contributes to the existing preview fingerprint and its dependency contributes
to `downstreamReferences`.

With those dependencies present, original-file withdrawal with `keep_data`
remains allowed unless an existing legal/approval blocker prevents it.
`remove_data` and `supersede` require review of the dependent workbook first.
This holds equally when the request uses the captured source ID or its linked
Vault document ID. An old preview is refused if a child arrives or changes,
even when the dependency count does not change.

Malformed relevant lineage is retained as a review dependency. A contradictory
digest, string/scalar parent-ID encoding, or malformed parent array does not
silently lose an exact named parent. Equal digests without a named edge do not
invent ancestry; another tenant's named edge cannot restrict this source.
Malformed query projections fail with `503 IMPACT_UNAVAILABLE`.

No workbook, parent file, extracted value, catalog entry or lineage record is
automatically deleted, reparented, superseded, recalculated or rewritten.
This helper reads the existing canonical stores. The root integrated
choice-specific review blockers into the existing service and shared contract.

## Falsifiable evidence

Initial service-containment RED, saved in `derivation-red.txt`:
**5 failed / 10 passed**, 3.98 seconds. Failures demonstrated omitted
same-/cross-project dependencies, permitted parent supersession, terminal
choices still available after `keep_data`, and acceptance of a stale preview
after a late child. The earlier first run reproduced the same failures in
6.26 seconds.

Projection-failure RED, saved in `derivation-projection-red.txt`:
**3 failed / 17 skipped**, 4.14 seconds. Null/object/partial-row results either
threw an untyped error or returned a fabricated dependency projection. Explicit
identity/scope/boolean/row-set validation now refuses those results.

Final integrated command:

```sh
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run --config vitest.config.ts server/services/document-data-disposition/__tests__/derived-impact.pglite.integration.test.ts server/services/document-data-disposition/__tests__/eligibility.pglite.integration.test.ts server/services/document-data-disposition/__tests__/service.pglite.integration.test.ts server/services/ana/__tests__/derived-spreadsheet-sql.test.ts --reporter=dot
```

GREEN, saved in `derivation-green.txt`: **60 passed / 4 files**, exit 0,
18.94 seconds. Twenty focused cases cover direct child matching, project and
tenant scope, malformed relevant lineage, source snapshots, both typed target
spaces, retained-data usability, terminal-choice refusal, stale previews,
eligible child withdrawal and fail-closed projection errors. The neighboring
existing SQL suites cover append-only disposition identity and transition
guards, retained/removed/superseded data projections, and derived capture/audit
atomicity with explicit persistence seams.

Owned-file ESLint, saved in `derivation-eslint.txt`: **0 errors / 0 warnings**.
The npm environment emitted its existing unknown `http-proxy` configuration
notice. `git diff --check` passed. Full build, combined release gates,
existing-dialog component verification and publication belong to the root
control tower; this receipt does not replace them.

## Boundaries and remaining qualification

The PostgreSQL checks execute the existing migration and service SQL through
the existing in-memory PGlite fixture. The fixture's audit writer returns a
test receipt. The existing derivation-save suite uses explicit filesystem and
capture/audit persistence doubles. Neither proves production RLS,
independently concurrent connections, immutable storage, a real audit-HMAC
verdict, scanner/provider behavior or agency acceptance.

This is conservative direct captured-dependency containment. It does not
rewrite transitive read eligibility or retrospectively invalidate children
whose parent was already terminally disposed before this change.
Conversation-only spreadsheet edits retain their ancestry only in existing
audit events; those uploads and later adoption without carried derivation
metadata remain outside this helper. A Vault-only identity without a proved
upload/capture bridge cannot be connected through digest guessing.

The workbook's scientific qualification remains `unassessed`; formula results
remain `not_recalculated`. Column/type/unit/population/method mapping,
scientific analysis qualification and jurisdiction-specific release review
remain separate obligations.

## Focused worker ownership

- `server/services/document-data-disposition/derived-impact.ts`
- `server/services/document-data-disposition/__tests__/derived-impact.pglite.integration.test.ts`
- This derivation plan, receipt and four test/lint logs.

The root owns `impact.ts`, `service.ts`, internal/shared types, fixture and UI
integration. No focused worker commit or push occurred.
