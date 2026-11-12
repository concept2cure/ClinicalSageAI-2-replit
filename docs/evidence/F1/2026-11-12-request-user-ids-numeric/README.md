# The request user's ids are numbers under every authenticator (GA-D6-05, 2026-11-12)

Plan package F1. Launch row D2. GA ledger item **GA-D6-05** ("Sign-in mints organisation and user ids as strings;
routes with positive-integer checks refuse"), unheld since 2026-11-10; the security session it was addressed to has
finished. Closing criterion: "Ids numeric at the source with a test, or every consumer listed and proven tolerant."

## What already exists (RULE 3)

| Path | What it did |
|---|---|
| `server/routes/auth.ts`, `authEnterprise.ts` | Every sign-in, refresh, MFA completion and organisation switch mints `userId` and `organizationId` as text ("7", "42") |
| `server/auth.ts` `authMiddleware` (the global `/api` gate) | Parses both and puts numbers on `req.user`, `req.identity`, `req.tenantContext` |
| `server/middleware/auth.ts` `authenticateToken`, `optionalAuth` | About sixty route files add them per route. They rebuilt `req.user` from the raw claims, **overwriting the gate's numbers with text** |
| `server/middleware/tenantContext.ts` | Built `req.user.organizationId` from the claim's text, beside a numeric `tenantId` |
| `server/routes/authoring.router.ts` | Builds its own `req.user` from the raw claims (held by another session; see Open) |
| `44f25b3fd` | Patched one consumer (Biostatistics' save answered 503 on every project); others had been patched one by one |

The membership, role and tenant-scope guards inside these middlewares already parse with `parseFiniteInt`, so they
were not affected; the text reached the routes.

## The change

- `numericTokenId` in `server/middleware/auth.ts`: a positive integer written in digits (no sign, point or padding,
  within the safe-integer range) becomes the number; anything else is kept exactly as given. So an identity
  provider's opaque subject keeps its identity, and a malformed organisation claim is refused downstream as before,
  never turned into an organisation.
- `authenticateToken` and `optionalAuth` build `req.user.id`, `userId` and `organizationId` with it.
  `tenantContextMiddleware` puts its already-parsed `orgIdInt` on `req.user.organizationId`.
- `requireOrgAccess` (no route uses it today) compared the requested organisation with `!==`: text from the URL
  against the session's id. It compares as text now; before, it also refused a caller's own organisation sent as a
  number in a JSON body.
- `tenant-impersonation-detector.e2e.test.ts` pinned the audit row's `userId` as `'42'` beside `tenantId: 7`, the
  inconsistency itself. It now expects `42`.

## Verified

| What | Where | Result |
|---|---|---|
| Both authenticators, text and numeric claims, the legacy `orgId`, an opaque subject, malformed organisation claims; `requireOrgAccess` | `server/middleware/__tests__/auth-request-user-ids-are-numbers.test.ts` (12 cases, a real signed token through the real middleware) | Against the old file: 7 fail. After: pass |
| Every middleware suite, the startup suites, and 80 route and service suites that use these authenticators or tenant context | `server/middleware`, `server/startup`, the 80 | 1,864 + 258 pass. One unrelated failure, below |

**In the running app** (the changed server, as the Lumen lead, the read-only screen sweep: home, the project's six
steps, every rail destination and every protocol tab, 82 stops): the only failed requests were CMC's five deliberate
`409 CMC_PRODUCT_CLASS_OUT_OF_SCOPE` refusals for LMN-201, a biologic (decision P-28). No other failed request.

## Open

- **`server/routes/authoring.router.ts`** builds `req.user` from the raw claims the same way. The file is held by
  `01T2woo…` (COORDINATION row :119, the draft route); the one line is handed to that holder.
- **The tokens still carry text.** Changing what sign-in mints touches every client and every stored session; the
  fix is where the token is read.
- **Unrelated, found on the way:** `server/routes/__tests__/csr-jobs-narratives.pglite.test.ts` fails on trunk
  without this change ("No flattenICHE3Sections export is defined on the csr-builder mock"); the builder gained the
  export and the test's mock did not. Left to the CSR lane.
- **CMC fires requests its scope refuses.** On a biologic project CMC's Specifications, Stability, Quality by design
  and Module 3 build tabs each send a request the server answers 409; the tabs show the refusal in words. For the
  CMC lane: the screen could read the scope once.
- HawkScan did not run: no `HAWK_API_KEY` in this environment.
