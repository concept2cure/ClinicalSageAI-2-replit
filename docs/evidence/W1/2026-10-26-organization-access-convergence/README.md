# W1 / D2 — converge organization consent and verified workspace rotation

## What already exists

- `OrganizationAccess.tsx`: existing top-bar Organizations and invitations drawer, invitation badge, membership choices, and governed confirmation forms. Uses ambient list/request credentials; weak invitation guards omit pending status/email/name and duplicate checks. Any success:true acceptance is acknowledged. Retained decisions are not tied to their read owner.
- `AccountOnboardingSettings.tsx`: canonical stricter invitation guards and exact accepted-membership confirmation, preserving existing membership roles. Reuse these contracts across both homes.
- `OrganizationSwitcher.tsx`: Account selector with captured source headers and the stronger rotation ceremony: dirty/pending editor reservation, confirmed destination probe, replacement-login protection, spent/unknown-session recovery and fresh shell. It duplicates the weaker helper's rotation implementation.
- `switchOrganization.ts`: existing helper used by the top-bar entry, with beforeunload checking, credential adoption, selection/cache cleanup and audit-warning carryover. It lacks the Account ceremony's reservation and replacement-owner protections. Complete this helper using the stronger existing ceremony and make Account delegate to it; do not maintain two rotation implementations.
- `authToken.ts`, AuthService and `sessionChangeGuard.ts`: canonical captured-actor header matching, verified session adoption and unsaved-editor reservation. Server authentication remains authoritative. Reuse these owners.
- `organizationSwitchAuditNotice.ts`: bounded non-secret audit warning for the completed switch across shell reload. Preserve this existing helper outcome in both entry points.
- `server/routes/tenant-users.ts`: self-only inbox/accept/decline, atomic quota/membership preservation and chained consent audit. Acceptance returns exact invitation/organization/user/status/actual role. Decline returns success and audit proof, not a membership row.
- AuthService `SecureStorage.clear` previously purged storage and legacy keys but did not clear `authToken.ts` memory. It now calls the canonical `clearAuthToken`, and its duplicate legacy-key list/loop is removed.
- Existing organizationAccess, switchOrganization, organizationSwitcher and organizationSwitchAuditNotice tests cover entry reachability, declined consent, dirty-editor prevention, verified adoption and honest audit notices.

Searches: all organization/invitation/switch consumers, bearer/session helpers, native editor reservation and deletion history for OrganizationAccess, switchOrganization and invitations. No deleted replacement for these active owners was found. Accepted client-journey IA keeps these utilities in existing Account/top-bar homes; no new surface is proposed.

## Design

Move existing invitation read/confirmation contracts to a shared organization-access data owner, reused by Account and the top-bar drawer. Read lists with captured source headers, exact current-owner checks, and request retirement on retry/unmount. Bind each confirmed decision to its read owner. Require actual acceptance proof and a named inviting organization; retain explicit decline and actual preserved roles.

Complete the existing switchOrganization helper with Account's stronger ceremony, pinned source owner and destination identity. Both entry points delegate to it. Preserve unload checking, editor reservation, fresh-shell cleanup and audit notice carryover; never overwrite or sign out an unrelated replacement login. Unknown/spent own sessions fail closed while preserving their device recovery text. No automatic mutation retries. Existing controls remain in their current homes, with no backend schema/authority/dependency changes.

## Verification

- `safety-red.txt` and full compressed log: eleven negative cases fail on the original entry/helper; its existing late-list guard passes. `memory-red.txt` separately proves that AuthService session end left the token utility's in-memory bearer available before the canonical cleanup call.
- `regressions.txt`: 212 checks across 20 suites pass, including native AuthService adoption/session-end, pending editor reservation and late unsaved work, replacement sign-in protection, both entry points, Account/reporting integration and transactional invitation consent. `auth-token-regressions.txt`: all 104 checks across ten AuthService/token-helper suites pass after removing the duplicated legacy-key cleanup list.
- `build.txt`: production client/server/audit verifier build passes. `lint.txt`: no errors or warnings in changed lintable files. AuthService remains excluded by existing repository ESLint policy; its change is checked by TypeScript and its regression suites. No baseline was widened.
- `browser-check.json` and four screenshots: sixteen acceptance/stale-decision/late-consent/verified-rotation flows at 1440px/390px in light/dark. Uses actual OrganizationAccess, C2CForm, shared contracts, AuthService destination probe/adoption, API transport, editor reservation and bearer cleanup. HTTP replies/JWTs and a navigation sink are explicit seams; no hosted authenticated journey is claimed. Actual preserved member role is acknowledged, stale choices cannot post, late acceptance cannot announce success for another sign-in, the destination is Projects, refresh credentials are cleared, and the editor stays held until reload. No page errors or horizontal overflow.
- Browser qualification initially used an ambiguous locator for multiple valid stale-session alerts; choosing the first matching alert corrected the harness without a product change.

`final-regressions.txt` combines the final AuthService/token, native editor, Account/reporting, company-session and backend invitation suites: all 265 checks across 24 suites pass. `final-build.txt` passes all production targets. `typecheck.txt` records the full-program zero-error check. Normal publication gates remain required. Previous hosted CI/staging remain queued. No backend authority/schema, dependency, surface or navigation destination changes. The Account rotation implementation is carried into the canonical helper rather than maintained alongside it; both UI homes preserve their existing outcomes.

## Shared-branch integration

The first normal push passed every gate with zero type errors (`initial-prepush.txt`) but lost a shared-ref race. Merged upstream `c7f320403` filing-workflow completion into `1b885eb14` without conflicts or changes to these organization/authentication owners. On the combined source, `merged-regressions.txt` records all 299 tests in 28 suites passing; `merged-build.txt` passes all production targets; refreshed browser artifacts repeat all sixteen flows. No gate or baseline was bypassed.
