# F15 — active administration API-key creation validation

Date: 2026-10-14. Workstream: W1, launch D2 administration reachability and D6 credential handling. Base: `920b230bd1509a41347fe653605babdabea2ae78`; branch `concept2cure-v2`. This session validated the parent session's production changes and changed tests only.

The active `AdminAccess` API-key tab now mounts `AdminApiKeyCreate`, which calls the existing `POST /api/api-keys` issuer. The form requires a trimmed name, at least one canonical read scope and an access reason. The issuer derives tenant and user from the authenticated request; a supplied reason is optional for compatibility with existing callers, validated to 3–500 trimmed characters and recorded in the existing lifecycle audit.

The one-time key is held in mounted component state and rendered in the named `One-time API key` region. The parent session moved that component outside the estate read's loading branch so reloading the key list does not erase the only display of the secret. Dismissal, switching to another admin tab or unmounting the admin surface removes the display; returning does not restore it. The service continues to persist a SHA-256 hash and identification prefix rather than plaintext, as verified by source inspection. Audit entries contain the prefix, scopes and reason, without the issued plaintext key.

## Verification

- The initial targeted run failed the 3 newly added UI tests because their empty-org fixture had no member and therefore correctly rendered the existing `No administrative data yet` state without tabs. The fixture now represents an active organization admin. The other 83 tests passed. See [initial output](identity-api-keys.initial.txt).
- The extended UI regression now has 9 passing tests: field/scopes/reason gating and input bounds; the canonical issuance payload; refresh of the estate; refusal preserving entered values; a deliberately deferred estate refresh preserving the secret; clipboard rejection and unavailable clipboard; success only after clipboard resolution; leaving-tab removal; and unmount/remount removal. No plaintext is written to localStorage or sessionStorage. See [UI output](identity-api-keys.ui.txt).
- The new route contract has 15 tests covering reason trimming/auditing, compatibility when omitted, invalid reasons, name/scopes validation, request-derived tenant/user identity and missing authenticated context. The authentication middleware and issuer/audit persistence are controlled test seams.
- To prove the reason regression fails on its intended defect without reverting shared production files, the route source was read with `git show HEAD:server/routes/api-keys.ts` into a temporary sibling module and the same test imported that module. Result: **7 failed, 8 passed**. The baseline discarded the supplied reason from audit and accepted all 6 invalid supplied reasons. The temporary source/test files were removed afterward. See [reason red output](identity-api-keys.reason-red.txt).
- Final scoped run: **10 files, 107 tests passed**, including the 9 UI regressions, 15 new route contracts, existing admin UI/member/honesty suites, admin route/facet checks, key timing defense and public API-key coverage. See [green output](identity-api-keys.green.txt).
- Scoped ESLint with `--no-ignore`: exit 0, no errors; one test-suite callback length warning. See [lint output](identity-api-keys.lint.txt). Scoped `git diff --check` passed.

The test callback was subsequently split without changing its cases; the later
`identity-new-modules-lint.log` confirms zero warnings for that test and the new
identity modules. The original lint output is retained as historical evidence.

Runtime: Node `v22.23.3`, Vitest `4.1.7`. Reproduce the added regressions:

```bash
PATH=/workspace/audit/node-v22.23.3-linux-x64/bin:$PATH node node_modules/vitest/vitest.mjs run --config vitest.config.ts \
  client/src/concept2cure/v2/__tests__/adminApiKeyCreate.test.tsx \
  server/routes/__tests__/api-keys-create-reason.test.ts
```

The checks are local component and route regressions with HTTP/auth/database/audit seams, not deployed issuance or real clipboard permissions. Existing API-key lifecycle auditing remains best effort in production; this change adds the reason to that existing contract. No key was issued against a live service and no commit, push or deployment occurred.
