# F06 — signup verification route

Date: 2026-10-14. Launch workstream: W1, D2 signup reachability; existing D6 session guards preserved. Base: `920b230bd1509a41347fe653605babdabea2ae78`, branch `concept2cure-v2`.

Opening `/concept2cure/verify-email#token=…` in an anonymous browser previously reached the protected UI-v2 fast path, which redirected to login before `VerifyEmail` could post the token. The route was already present in the later switch, but omitted from the fast path's auth-route classification.

`client/src/concept2cure/router/ZenRouter.tsx` now includes `verify-email` in the existing auth-route classifier. The existing verification route, authentication provider, bootstrap guard and signed-in redirect remain the implementation. Anonymous links reach `VerifyEmail`, which consumes and removes the token, confirms the address and offers sign-in without creating a session. Signed-in visitors follow the existing auth-route redirect to the app without consuming the verification token. Ordinary anonymous app navigation still requires login and retains its return URL.

## Verification

The new `client/src/concept2cure/router/__tests__/signupVerificationRoute.test.tsx` renders the actual `ZenRouter`, Wouter browser routing and `VerifyEmail`; authentication state, the app shell, translation and the HTTP response are controlled test seams.

- Before the production edit: 4 failures, 1 pass. Fragment and query links rendered Login; completing bootstrap also rendered Login; the signed-in URL did not canonicalize to `/concept2cure`. The protected-route control passed. See [red output](identity-verification.red.txt).
- After the edit: 5 test files, 19 tests passed, including the 5 new router regressions plus existing verification component, signup resend, protected deep-link and server signup verification checks. See [green output](identity-verification.green.txt).
- Scoped ESLint with `--no-ignore`: exit 0, no errors; one pre-existing unused `isFeatureEnabled` import warning in `ZenRouter.tsx`. The new regression file has no lint findings. See [lint output](identity-verification.lint.txt).
- Scoped `git diff --check`: passed.

Runtime: Node `v22.23.3` from `/workspace/audit/node-v22.23.3-linux-x64/bin`; Vitest `4.1.7`.

```bash
PATH=/workspace/audit/node-v22.23.3-linux-x64/bin:$PATH node node_modules/vitest/vitest.mjs run --config vitest.config.ts \
  client/src/concept2cure/router/__tests__/signupVerificationRoute.test.tsx \
  client/src/concept2cure/auth/__tests__/VerifyEmail.test.tsx \
  client/src/concept2cure/auth/__tests__/SignupVerifyStep.test.tsx \
  client/src/concept2cure/v2/__tests__/deepLinkKeepsProgram.test.tsx \
  server/routes/__tests__/auth-signup-verification.test.ts

PATH=/workspace/audit/node-v22.23.3-linux-x64/bin:$PATH node node_modules/eslint/bin/eslint.js --no-ignore \
  client/src/concept2cure/router/ZenRouter.tsx \
  client/src/concept2cure/router/__tests__/signupVerificationRoute.test.tsx
```

These are local regressions with mocked HTTP/database/mail seams, not a deployed SMTP round trip. The server test emits its existing development-session mock warning; all assertions pass. No commit, push, deployment or external mail was performed.
