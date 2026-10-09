# D5 — the shared e-signature modal could not verify a signer, 2026-09-24

**Launch row:** D5, Part 11 evidence (`docs/LAUNCH_DEFINITION_OF_DONE.md`) —
"every signing path re-verifies the signer through one ceremony". The
product's own signing modal could not reach that ceremony at all.
**Also bears on:** D4 — the executed OQ did not exercise this path (§3).

## 1. What was wrong

`<EsignModal>` (`client/src/concept2cure/_shared/components/EsignModal.tsx:297`)
gates every governed confirm on `useEsignature().verifyPassword`, then
`verifyMfa`. The modal is used by Submission Center, the task board, authoring
signatures and the authoring filing bar, the document workbench,
GovernedConfirmDialog, and the protocol surfaces.

`useEsignature` (`client/src/concept2cure/hooks/useEsignature.ts`) posted to
`/api/esignature/*` with `credentials: 'include'` and a Content-Type header —
**no Authorization**. In this app `credentials: 'include'` is not
authentication: the `/api` gate reads `req.headers.authorization` only
(`server/middleware/auth.ts`, `extractBearerToken`).

`/api/esignature` is mounted with no inline auth
(`server/bootstrap/register-inline-routes.ts:272`), so:

| authBoundary mode | What happened to a signer's verify-password |
|---|---|
| `enforce` (production) | 401 at the boundary, before the handler |
| `warn` (every other environment) | passed through with no user; the handler's `resolveUserId()` answered 401 `AUTH_REQUIRED` |

**No signer could be verified, in any environment.** This is not the
production-only form of the defect.

Two more call sites of the same kind, found while sizing this one, fail the same
way because their routes carry auth inline:

| Call site | Route | Mount |
|---|---|---|
| `usePdevData.ts` `postJson` — all nine PDEV writes | `/api/pdev` | `authenticateToken` inline (`register-regulatory-routes.ts:454`) |
| `EvidencePicker.tsx` search | `/api/evidence-objects` | `authMiddleware` inline (`register-inline-routes.ts:875`) |

## 2. The fix and its proof

Each call now sends the bearer token through the lane's existing helper
(`getAuthHeaders()` / `buildAuthHeaders()`), not a new copy.

| Evidence | Red | Green |
|---|---|---|
| Client: the hooks send the token | `red/client-tests-before-fix.txt` — 4 of 4 fail ("expected undefined to be 'Bearer test-token'"), run with the three files as at `e0e42ec4` | `green/client-tests-after-fix.txt` — 4 of 4 pass |
| Server: the route refuses a request without one, in BOTH modes, and reaches the signer check with one | `red/server-mutant-handler-check-removed.txt` — with the handler's own user check removed, `warn` mode answers **200** to an unauthenticated request and the test fails; this is what shows the test discriminates | `green/server-requires-bearer.txt` — 6 of 6 |
| Gate: every raw client `fetch()` sends the token or targets a public endpoint | `red/gate-before-fix.txt` — names all three call sites by file and line, including the two a URL-string sweep cannot see (`${BASE}${path}`, and a URL passed as a parameter) | `green/gate-and-selftest-after-fix.txt` — 64 calls scanned, 0 baselined; self-test 9 of 9 |

Tests: `client/src/concept2cure/hooks/__tests__/useEsignature.sendsAuth.test.tsx`,
`client/src/concept2cure/pdev/__tests__/pdevSendsAuth.test.tsx`,
`server/routes/__tests__/esignature-requires-bearer.test.ts`.

### The gate, `ci:unauthenticated-fetch` (pre-push)

Seven client call sites shipped without the token between 2026-09-19 and today
(`useVaultUpload`, `useSubmissionDetail`, `useEsignature`, `usePdevData`,
`EvidencePicker`, and `useAcceptAnaDraft` / `useProgramExtras` fixed upstream),
each found by hand. An earlier sweep reported "no further instances" and was
wrong: it searched for the string `/api/`, and three of the seven reach
`fetch()` as a parameter or a `${BASE}${path}` template.

The gate flips the default. It checks **every** raw `fetch()` in `client/src`
whatever its URL, and passes a call only when the token is sent (directly,
through a local helper, or through an init object passed by name — the shape
of `apiRequest` itself), or when its literal URL is public per the **server's own**
`PUBLIC_API_ALLOWLIST`, parsed from `server/middleware/authBoundary.ts` so the
two cannot drift. Comments are stripped with the shared
`scripts/ci/lib/strip-comments.mjs`, so a comment that mentions Authorization
does not count as sending it. It refuses to report success if it scanned fewer
than 40 calls. Baseline: empty.

## 3. What this does NOT prove — owed

- **No run through the product UI.** The fix is proven at the request (client)
  and contract (server) levels. A signed-in user completing an e-signature
  through `<EsignModal>` in a browser has not been executed here.
- **D4: the validation package does not cover this path.** Every OQ signing step
  signs through `/api/c2c/actions/sign` with the harness's own bearer token
  (`tests/validation/lib/harness.mjs`), so a UI signing path that cannot
  authenticate is invisible to it — which is how "OQ 100 pass" coexisted with a
  modal no one could sign through. Proposed for VSR-001 as a finding, and for
  the OQ set as a step that drives the modal's own verify calls: the validation
  owner's call, not made here.
- The PDEV fix is proven for one of the nine mutations (all nine share the one
  `postJson`); the Evidence Picker is covered by the gate, not a test of its own.
