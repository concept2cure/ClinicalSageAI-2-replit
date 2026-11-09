# S6: the catalog's actor-scope suite was red on trunk; its mock lacked a module export (2026-11-05)

`server/services/vault/__tests__/catalog-actor-scope-wrapper.test.ts` failed 7 of 11 on trunk (`01-red.txt`). It tests
`withAnaSourceReadScope` (`server/services/vault/document-catalog-actor-access.ts`), the one connection, role and
project policy an AnA source read runs under.

## Cause

`a06ae96c83` (P-72 slice 1b, 2026-10-31) made `setTenantContextTx`
(`server/services/tenant/governed-tenant-context.ts`) refuse the platform role through `isPlatformScopeRole`, imported
from `server/db/tenantStore`. The suite mocks that module with `getTenantScope` alone. So `isPlatformScopeRole` was
undefined, the call threw a TypeError, and the wrapper answered every read with its generic
`ANA_SOURCE_ACCESS_UNAVAILABLE` (503). The cases that expect a specific refusal (`ANA_PROJECT_ACCESS_DENIED`,
`ANA_SOURCE_SCOPE_CHANGED`) or a result saw that 503 instead. The four cases that refuse before a connection is taken
passed.

The product code is right. Only the test's mock was out of date.

## Change

The mock keeps the module's own exports and replaces `getTenantScope` alone. The test file is the only file changed.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | Trunk's suite: 7 failed, 4 passed |
| `02-green.txt` | With the mock corrected: 11 of 11 |
