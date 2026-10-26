# W1 / D2 — complete Account self-service request ownership

## What already exists

- `client/src/concept2cure/v2/AccountOnboardingSettings.tsx`: canonical invitation acceptance/decline and reporting-role controls. Validates the rendered auth user, invitation record and accepted membership; personalizes reporting without changing access. Its local `request` checks only bearer presence and uses ambient transport credentials; late saves can update cache or membership revision after session change/unmount.
- `client/src/utils/authToken.ts`: canonical `capturedActorHeaders` matches bearer claims to the captured numeric user/organization and pins transport headers. Claims are consistency hints; server authentication remains authoritative.
- `client/src/lib/queryClient.ts`: canonical `apiRequest`, error redaction and reporting cache. Explicit headers already override ambient credentials.
- `client/src/concept2cure/v2/NotificationPreferences.tsx`: recently completed actor-owned request lifecycle in the same Account home, using the canonical helper. Do not create another transport convention.
- `client/src/concept2cure/v2/OrganizationSwitcher.tsx`: explicit guarded session rotation, unsaved-work reservation and fresh-shell handoff. Preserve this separate rotation ceremony; do not reuse its credential adoption for a settings write.
- `server/routes/tenant-users.ts`: self-only inbox/accept/decline, membership quota/role preservation and transactional chained audit. Decline returns success and audit proof, not a membership row.
- `server/routes/users.ts`: current organization membership persona GET/PUT; canonical vocabulary, no role grant. No actor IDs belong in the body.
- `reportingPersona.ts`: canonical actor/organization cache key and response guard.

Searches covered invitation/inbox/accept/decline, persona/reporting-role, Account owners, captured actor headers, transport and backend routes. Deletion history: `git log --all --diff-filter=D -- '*AccountOnboard*' '*invitation*' '*persona*'`; no deleted replacement for the active flow found. Existing accepted IA keeps personal Account and administration in their current homes. No navigation, dependency, schema or backend authority changes.

## Design

Extend the existing Account request owner: capture validated bearer/user/organization headers per request; verify the captured bearer is still current after both network and JSON decoding; suppress obsolete reads, cache writes, membership callbacks and saved acknowledgements after unmount or session replacement. Preserve the existing controls, response contracts, mutation locks, retries and canonical API client. Account updates never adopt a session or retry a mutation automatically.

## Verification

- `safety-red.txt` and its full compressed log: all ten initial ownership checks fail against the original implementation. The final ownership suite adds positive acceptance and mutation-lock coverage plus late decline refusal (13 checks total).
- `regressions.txt`: 158 tests across 12 suites pass, including Account, actual reporting-cache/catalog integration, invitation consent/atomic audit, existing session rotation, discovery, authenticator/password and alert controls.
- The catalog integration test auth seam now supplies the canonical captured-header helper and explicitly awaits both catalog and Account selectors. Its initial missing-mock failure was corrected in the test harness, with no catalog product change.
- `build.txt`: production client/server/audit-verifier build passes; existing chunk warnings remain. `lint.txt`: no errors or warnings in the changed TypeScript files.
- `browser-check.json` and four screenshots: actual AccountPanel, AccountOnboardingSettings, canonical API transport, captured-actor helper and reporting cache at 1440px/390px in light/dark. Successful saves update the scoped reporting cache; accepting a named invitation refreshes membership choices without switching. A stale bearer cannot write; a late save cannot populate the old cache or announce success. No page errors or horizontal overflow. Synthetic auth-service adapter, JWTs and API replies are explicit seams; this is not a hosted authenticated journey.
- The initial full-program typecheck found one test cleanup signature error (`setAuthToken(null)`). Cleanup now uses the canonical `clearAuthToken`; all 20 ownership/catalog tests pass again in `cleanup-tests.txt`. No product type change or baseline widening was needed. `prepush.txt` records every normal publication gate passing, including the corrected full-program zero-error typecheck, for published implementation `98987035fb8a2e86ec019d474c9a44f90eaeb164`. Previous hosted CI and staging remain queued.

No backend contract, authority, audit policy, schema, dependency or navigation changed. Existing server-side self-only invitation checks and membership rules remain authoritative. A stale response may correspond to a server-side committed action; this change withholds stale client acknowledgement and never automatically retries a mutation. Reopen Account under the current session to read actual state.
