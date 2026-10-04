# D3 — the test-assembly tenant gate admits on the session alone

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-10-01. **Claim:** `docs/work-orders/README.md` §0, session
`…01W5zW66wy5szuFwRQYUKmkE`. Recorded open in
`../2026-09-24-atom-search-tenant-key/` ("Found on the way", item 3).

## The finding

`server/middleware/tenantAuth.ts` gates `/api/test-assembly` to the tenants in
`ALLOWED_TEST_ASSEMBLY_TENANTS`. It took the tenant from the JWT user, and when
there was none, from the client's `x-tenant-id` / `x-tenant` header:

```ts
const tenant = jwtTenant || headerTenant;
```

So a request with no session that named an allowlisted tenant was admitted. The
route sits behind the global `/api` auth boundary, which enforces in production
(`AUTH_BOUNDARY_MODE=warn` is refused there) and the route family itself is
fenced out of production unless `FORCE_TEST_ASSEMBLY` is set. The reach is
therefore non-production deployments running the boundary in warn mode — the
gate was the only thing deciding, and it decided on a header.

`scripts/check-security-patterns.ts`'s `tenant-trust-header` rule never saw it:
it matched only the `req.headers['x-…']` spelling, not `req.header('x-…')` or
`req.get('x-…')`, and not the bare `x-tenant` header.

## Proof

| File | Shows |
|---|---|
| `red/unfixed-middleware.txt` | The old gate: a request with no session and `x-tenant-id: 7` is admitted — *"admitted on x-tenant-id"*. The three other cases pass. |
| `green/fixed-middleware.txt` | The fix: 4 of 4 — an allowlisted session is admitted; a non-allowlisted session is refused whatever its header says (and the mismatch is reported); no session is refused on either header; no allowlist stands down. |
| `red/widened-rule-catches-req-header.txt` | The widened rule, with the file's allow marker removed: it flags `tenantAuth.ts:28`. The old rule on the same file: 0 violations. |

## The fix

- The gate admits on `req.user.organizationId` only; no session is 403
  `tenant context required`. The header is still read, under a
  `security-allow: impersonation-detection` marker, solely to report a
  disagreement with the session — never to admit.
- The `tenant-trust-header` rule matches `req.headers[…]`, `req.header(…)` and
  `req.get(…)` for `x-organization-id`, `x-tenant-id`, `x-org-uuid` and
  `x-tenant`. The tree has 0 violations under it.
