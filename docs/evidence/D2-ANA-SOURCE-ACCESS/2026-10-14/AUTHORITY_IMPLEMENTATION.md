# Canonical source-read authority implementation

Owned production files are `server/services/ana/project-scope-admission.ts` and new `server/services/ana/source-read-scope.ts`. The focused fixture is `server/services/ana/__tests__/source-read-scope.pglite.test.ts`. No catalog, tool, receipt, retrieval, bootstrap, schema, migration, or dependency file was edited by this owner.

The existing explicit-project admission now reuses exported `readActiveAnaActorRole(q,{organizationId,userId}):Promise<string>`. It reads the same persisted active membership on the passed executor; ambiguous membership, inactive actors/organizations and empty roles refuse. Canonical project sharing and its viewer/custom-role/owner/review semantics are unchanged.

`source-read-scope.ts` exports the contract's exact `AnaSourceReadScopeInput`, `AdmittedAnaSourceReadScope` and `admitAnaSourceReadScope(q,input)`. The adapter requires actor identity even with no explicit project. It reuses `admitAnaProjectScope` for explicit scope and `getAccessibleReportProjectIds` for organization-wide scope. The program mapping groups all same-org anchors before intersecting accessible IDs and excludes deleted/foreign parents and unresolved anchors. An explicit unresolved program refuses. No policy is copied and no read-role allow-list is introduced.

Input primitives are copied before the first await; outputs and program arrays are frozen. `assertAnaSourceProgramAllowed(scope,programId)` validates canonical shape and exact allowed program. `revalidateAnaSourceReadScope(q,scope)` freshly admits pinned actor/project and refuses changed role, project, program or program set with `ANA_SOURCE_SCOPE_CHANGED`. Missing/malformed/sparse scope fields cannot erase an explicit scope or create a new grant. Unexpected SQL/record failures produce safe unavailable errors without raw detail.

All authority calls use their passed executor. The catalog owner supplies the single pooled interactive transaction wrapper and tenant/role stamping. This authority module opens no pool connection, transaction, lock or provider call. Its rechecks are point-in-time checks, not atomic remote-egress revocation or deployed RLS proof.

## Verification records

- `AUTHORITY_RED.json` records the fixture written before implementation. It failed because the new module was absent and executed **zero assertions**; it is not a behavioral gate failure. The tool/retrieval/receipt workstream records preserve their pre-fix behavioral failures separately.
- `AUTHORITY_GREEN.json` records 69 passing assertions across the new authority fixture and existing `project-scope-admission.pglite.test.ts`. These use actual canonical SQL/sharing over sequential PGlite and are not concurrent PostgreSQL tests.
- `AUTHORITY_TYPECHECK.txt` records diagnostics for the three owned targets plus repository ambient declarations/import resolution. It is not a full repository typecheck.
- `AUTHORITY_ESLINT.json` records the three owned files with no errors or warnings.
- `AUTHORITY_SOURCE_MANIFEST.json` hashes these owned source/test files at verification completion; root records a later integrated final manifest.

Commands use the supported Node 22 executable at `/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node` and the repository's installed Vitest/ESLint/TypeScript. No new dependency or external credential/provider is used.
