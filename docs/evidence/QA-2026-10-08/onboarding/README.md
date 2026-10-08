# QA 2026-10-08 — client onboarding and administration (j9 cluster)

Findings file: `scratchpad/qa/findings/j9-admin-onboarding.json` (walk on 5077/5078, older code).
Reproduced on a 5078 instance of the current tree (restarted for server changes) before each change.
Browser scripts live in the session scratchpad (`qa/fix-onboarding/`, harness `h.mjs`); the test
account's password is passed in the environment and is not written here. No setup link, reset link or
token is recorded in this folder (setup URLs in the captured responses are replaced by `[redacted]`).

## Item 1 (blocker) — an administrator can change a member's role and remove a member

Reproduced: yes. `r01` on 5078: the drawer offered `GRANT ACCESS`, `AUDIT ACTIVITY` only (both hand a
sentence to AnA). `PATCH`/`DELETE /api/tenant-users/:organizationId/:userId` existed, org-admin gated,
reason-required and audited, with no client caller.

Root cause: `client/src/concept2cure/v2/surfaces/AdminAccess.tsx:522-523` (HEAD) — the drawer's actions
were `ask()` hand-offs; the admin payload (`server/routes/mdx-admin.ts:141-156`, HEAD) did not carry the
organization id or the numeric user id those routes take.

Fix:

- `client/src/concept2cure/v2/surfaces/AdminMemberActions.tsx` (new): "Change role" and "Remove from
  organization" open a governed form that is also the confirmation (reason required; the consequence
  stated). The request goes to the existing routes; the server's answer is shown in its own words; a
  refusal keeps the form and what was typed. Not offered on the administrator's own row (the route
  refuses `SELF_ROLE_CHANGE` / `SELF_REMOVAL`), nor when the payload does not name the organization and
  user id (fail closed; ids are never parsed from the display id `u-<n>`).
- `server/routes/mdx-admin.ts`: payload carries `organizationId`; each member carries `userId` and `self`.
- `server/services/tenant/membership-change.ts` `wouldLeaveNoAdministrator` + `server/routes/tenant-users.ts`:
  a change or removal that would leave the organization with no administrator is refused, 409
  `LAST_ADMINISTRATOR`, "This member is the organization's only administrator. Make another member an
  administrator first. Nothing was changed." The organization's administrator rows are locked
  `FOR UPDATE` (one order) in the change's transaction, so two administrators demoting each other at
  the same moment cannot both commit, and a platform operator cannot demote the last one. The existing
  self-change refusal, `authorizeOrgAccess(requireAdmin)` against the target organization, the reason
  requirement and the in-transaction audit row are unchanged.

Removal is the organization-level deactivation: a user removed from their only organization is refused
at sign-in (`403 AUTH_011 No organization assigned`), and an existing session's next request is refused
(`401 Invalid tenant membership`). Suspending the global account remains a platform-operator act
(`server/routes/admin/master-admin.ts`); see decisions in the session report.

| Evidence | |
|---|---|
| Red (HEAD implementation, new tests) | `red/item1-member-actions.txt` — 12 failing |
| Green | `green/item1-member-actions.txt` — 97 passing (tenant-users audit + contract, mdx-admin honesty + facets, AdminAccess suites) |
| Browser (5078) | `browser/01..07-r03-*` and `browser/r03-member-actions-1.json`: invite `qa-onboard-1`, activate, sign in; role Member → Viewer with a reason (no reason: "Complete the required field: Reason for the change"); own row: both controls disabled with the reason shown; removal with a reason; removed member's open session gets 401, a fresh sign-in gets "No organization assigned" |
| Audit rows (read-only query) | `member_role_changed` and `member_removed` for user 28, actor 1, each with the stated reason |

Not verified live: the last-administrator refusal (every live path to it is refused earlier by the
self-change rule; covered by route tests including the lock order).

## Item 2 — a wrong password says so; a real expiry says expiry

Reproduced: yes. `browser/r02-before-wrong-password.json` and `browser/before-0*-r02-*`: a wrong password
for an active account, a never-activated invitee (`pat.pending`) and an unknown address each got
`401 AUTH_001 Invalid credentials` and the page showed "Session expired. Please log in again."

Root cause: `client/src/services/portal/authService.tsx:431-454` (HEAD) — `ApiClient.request` treated
every 401 as a possibly expired session: refresh, then "Session expired". The sign-in request carries no
session (`skipAuth`) and kept `retryOnUnauthorized` at its default, so its refusal never reached the page.
The same branch turned a wrong current password (`/password/change`, 401 AUTH_001) and a wrong
verification code (`/mfa/enable`, 401 AUTH_004) into "Session expired".

Fix:

- `authService.tsx` `unauthorizedMeansSession`: a 401 is a session problem only when the request presented
  a session and the server did not refuse the credential it was asked to check (AUTH_001, AUTH_004).
  Otherwise the server's refusal is returned as written; no refresh, no sign-out. A signed-in request
  refused for its session, whose refresh also fails, is still `SESSION_EXPIRED` "Session expired. Please
  log in again." (test).
- `Concept2CureLogin.tsx`: AUTH_001 reads "Incorrect email or password. If you were invited and have not
  set a password yet, open the link in your invitation or reset your password." — one sentence for a wrong
  password, an unknown address and an invitee with no password, so it does not say whether an account
  exists. New key `auth:error.invalidCredentials` in all 18 locales (`check-i18n-integrity`: OK, 134
  references resolve).

| Evidence | |
|---|---|
| Red | `red/item2-signin-401.txt` — service: 4 of 5 failing (the real-expiry case passes before and after); page: 1 of 2 failing |
| Green | `green/item2-signin-401.txt` — 50 passing (portal auth service suites, auth page suites, idle-session guard) |
| Browser (5078) | `browser/r02-after-wrong-password.json`, `browser/0*-r02-after-*`: the three cases above now show the same "Incorrect email or password…" sentence |

Not verified live: the real-expiry branch (unit test only).

## Item 3 — self-serve sign-up: "Open Concept2Cure" opens the workspace

Reproduced: yes, from the walker's run (`browser/before-s17-signup-open.json`: after Open, the URL was
`/concept2cure/login?returnTo=%2Fconcept2cure%3FreturnTo%3D%252Fconcept2cure` and local storage held only
`token` and `c2c.language`), and in code.

Root cause: `client/src/concept2cure/auth/ZenSignup.tsx:1024` (HEAD) `setLocation('/ai')` — no such client
route; `ZenSignup.tsx:319` stored the session under the legacy key `token`, which nothing reads. Found
while verifying: `client/src/services/portal/authService.tsx` `loadStoredAuth` refused to read back any
stored session without a refresh token, so a session adopted from a hand-off (sign-up, single sign-on)
was dropped on the next page load.

Fix:

- `ZenSignup.tsx` `openWorkspaceAfterSignup`: "Open Concept2Cure" adopts the sign-up's session through the
  existing `authService.adoptSession` (the server confirms it with `GET /session` before it is stored) and
  opens `/concept2cure`; a session the server does not confirm, or none, goes to sign-in. The session is
  held in component state until then (adopting it at submit would trip the `AuthRoute` around the page and
  leave before "Account created" is read). The legacy `token` key is no longer written. The paid-plan
  checkout's return URL was the same dead `/ai`; it is `/concept2cure?welcome=true`, and the session is
  adopted before the hand-off to checkout so the return lands signed in.
- `authService.tsx` `loadStoredAuth`: a stored, unexpired session without a refresh token is read back
  (it cannot be refreshed; the provider still re-validates it with the server on load). An expired one is
  still not read (test).

| Evidence | |
|---|---|
| Red | `red/item3-signup-open.txt` — helper/source: 5 of 5 failing; reload: 1 of 2 failing |
| Green | `green/item3-signup-open.txt` — 81 passing (portal auth service, auth page suites, idle-session guard, shell account menu) |
| Browser (5078) | `browser/r04-signup-open-3.json`, `browser/0*-r04-*`: sign-up → "Account created" → Open → `/concept2cure`, "Good morning, Quinn", org "QA Onboard Selfserve 3", "No programs yet"; reload stays on `/concept2cure`. The sign-up token is redacted in the capture |

Not verified live: the paid-plan checkout return (no billing provider on this instance).

## Item 4 — invitees are "Invited", not "Active"; a lost setup link can be re-issued

Reproduced: yes. `browser/before-r01-admin-baseline.json`, `browser/before-r01-invited-filter.png`: KPI
"12 active" with two never-activated invitees (`pat.pending`, `qa.second.admin`, both `invite:` hash),
Pat Pending's drawer "State: Active", the Invited filter "No members match this filter." In code: no route
or control re-issues an invitation; the link existed once, in the 201 and the toast.

Root cause: `server/services/atomicQuotaService.js:306` creates the invitee `status 'active'` with an
unusable `invite:` hash; `server/routes/mdx-admin.ts:154` (HEAD) reported `state: r.status`, so the KPI
(`AdminAccess.tsx:270`) and the filter (`:467`) could not tell an invitee from an active member. Re-issue:
`server/routes/tenant-users.ts` POST answered `USER_EXISTS` for any member, invited or not. Also found:
`AdminAccess.tsx:222-223` (HEAD) said the link was "on your clipboard" whenever the browser had no
clipboard to write to (`navigator.clipboard?.writeText` resolves `undefined`), so the one copy was lost
while the page said it was kept (client test reproduces it).

Fix:

- `server/routes/mdx-admin.ts` `memberStateOf`: `invited` while the password hash still carries the
  invitation prefix (computed in SQL; the hash never leaves the database) or the sign-up address is
  unconfirmed; `active` for `users.status 'active'` (`account-standing.ts`); `disabled` for any other
  status. KPI "N active · N invited" (server and surface). `INVITE_PASSWORD_HASH_PREFIX` is one constant in
  `password-setup-token.ts`, used by the hash writer and both readers.
- Re-issue through the existing invitation route, `POST /api/tenant-users` (no new route): for a member of
  the target organization whose hash is still the invitation's, `reissueForUnredeemedInvitee`
  (`invitation-delivery.ts`) issues a new setup token through the existing `issueInvitation` — the old link
  stops working — keeps the stored role, consumes no seat, and audits `user_invited` with
  `reissued: true`. Everyone else is unchanged: an activated member is still `400 USER_EXISTS` (so
  re-inviting can never reset an active person's password), a non-admin is still 403 before any lookup.
- Drawer: "Issue a new setup link" for an invited member (not self), behind a confirmation that says the
  previous link stops working. The invite form re-inviting the same address says a new link was issued and
  the role is unchanged. `setupLinkHandover` names the clipboard only when the copy succeeded, otherwise
  shows the link.
- The link is not written to the server log, in any environment (decision noted in the report).

| Evidence | |
|---|---|
| Red | `red/item4-invited-state.txt` (server 2, client 1 failing), `red/item4-reissue.txt` (server 3 of 5 failing — the activated-member and non-admin cases are guards that hold before and after; client 3 failing, one showing the false clipboard claim) |
| Green | `green/item4-invited-reissue.txt` — 108 passing |
| Browser (5078) | `browser/r05-invited-reissue-2.json`, `browser/0*-r05-*`: KPI "10 active · 2 invited"; Invited filter lists Pat Pending and QA Second Admin; invite `qa-onboard-2` → "10 active · 3 invited", drawer "State: Invited" with "Issue a new setup link"; re-issue and re-invite (form role Admin, stored role Member kept); first and second links → "Invalid or expired reset token", third link → password set; KPI "11 active · 2 invited", drawer "Active". Links redacted |
| Audit rows (read-only) | three `user_invited` rows for user 33, the second and third with `"reissued": true` |

## Item 5 — Roles + scopes says what each role may do

Reproduced: yes. `browser/before-r01-admin-baseline.json` and `browser/before-r01-roles.png`: every role card
"Org-level role derived from live membership." with no scopes; the drawer's "Role scopes" empty.

Root cause: `server/routes/mdx-admin.ts:164-165` (HEAD) built each role with `desc: ''` and `scopes: []`.

Fix: `server/services/tenant/role-scopes.ts` (new) `roleScopesOf(role)`: one sentence per assignable role, a
signing sentence appended from the signing policy, and scopes each read from the check that enforces it —
`records:write` (`GOVERNED_WRITE_ROLES`), `programs:manage` (`canMutateProgram`'s organization-wide branch),
`records:sign` (`isSigningAuthorized`), `reports:finalize` (the session's `report:finalize`), `audit:read`
(`AUDIT_READER_ROLES`), `members:administer` (`ADMINISTRATOR_ROLES`, now exported from
`membership-change.ts` and used by `authorizeOrgAccess` too). No second policy: a change to any of those
checks shows on the page without an edit. A role the product does not assign says so and lists only what the
checks grant it.

| Evidence | |
|---|---|
| Red | `red/item5-role-scopes.txt` — 2 failing |
| Green | `green/item5-role-scopes.txt` |
| Browser (5078) | `browser/r07-role-scopes.json`, `browser/0*-r07-*`: Admin (7 scopes, signs), Manager (`programs:manage`, `audit:read`, does not sign), Member, Reviewer (`records:sign`), Viewer (`records:read`); the drawer lists the member's role scopes |

Not changed: "Edit scopes" still hands to AnA. The scopes are derived from code, so per-organization scope
editing does not exist; whether it should is a product decision.

## Item 6 — password reset and activation limits: two buckets, a refused password does not count

Reproduced: yes, in the route test through the real router and limiter (`red/item6-reset-limits.txt`: the
6th policy-refused activation attempt from one address got 429; asking for links used up redeeming them; the
refusal said "Please try again later" with no time). The walk saw the same: two requests, one policy refusal
and two successes, then 429.

Root cause: `server/routes/auth.ts:161-166` (HEAD) `passwordResetLimiter` — 5 per hour per address, every
request counted, one instance on `forgot-password`, `password/reset-request`, `reset-password` and
`password/reset-confirm` (`:2588-2592`).

Fix (`server/middleware/password-reset-limits.ts`, new; numbers in `server/config/platform-limits.ts`
`PASSWORD_RESET_LIMITS`):

- Asking for a link (`forgot-password`, `password/reset-request`): **5 per hour per client address, every
  request counted** (each can send mail).
- Redeeming a link (`reset-password`, `password/reset-confirm`; an invitation's setup link is the same
  token): **5 refused links per hour per client address**. Only a refused link is counted — invalid, expired,
  already used, or none presented (`markResetLinkRefused` in `handleResetPassword`). Setting the password,
  and a password the policy refused for a valid link, are not counted.
- Every refusal ends "Try again in N minutes." from the limiter's own reset time.
- Address keying is the sign-in limiter's (`ipKeyGenerator(clientIpKey(req))`).

| Evidence | |
|---|---|
| Red | `red/item6-reset-limits.txt` — 4 of 5 failing (the numbers case passes once the config exists) |
| Green | `green/item6-reset-limits.txt` — 57 passing (new limits test, reset audit trail, sign-in limits, sign-up verification, auth surface security) |
| Browser (5078) | `browser/r08-reset-limits-4.json`, `browser/0*-r08-*`: invitee `qa-onboard-4` — seven policy-refused passwords each answered with the policy sentence, then a compliant password activated; six "Forgot password" requests: five "Check your email", the sixth "Too many password reset requests from this network. Try again in 60 minutes." |

## Item 7 — profile page, in-app password change, authenticator enrolment

Reproduced: yes, in code. The account menu (`client/src/concept2cure/v2/Shell.tsx` `ACCT_ITEMS`) has no
profile or account entry; the surface registry has no profile, account or security-settings surface; the
client methods `changePassword`, `setupTotp`, `verifyTotpSetup`, `generateBackupCodes`, `disableMfaMethod`
(`client/src/services/portal/authService.tsx`) have no caller. `git log --diff-filter=D` over
`*Profile*`, `*Mfa*`, `*Account*`, `*Security*`, `*Password*`, `*TwoFactor*` under `client/` finds no deleted
profile or enrolment screen.

Server routes exist: `POST /api/auth/password/change` (current password, policy, history; ends every
session including the caller's), `POST /api/auth/mfa/setup`, `/mfa/enable`, `/mfa/disable`.

Not built: there is no existing account/settings surface to wire them into, and the account menu lives in
`Shell.tsx`, which this session may not edit. A new account surface is a build decision (Rule 2), not made
here. Item 2's fix already makes those routes' refusals read correctly when a screen calls them: a wrong
current password (401 AUTH_001) and a wrong authenticator code (401 AUTH_004) now come back as the server's
sentence instead of "Session expired".

Fixed: the Setup page told administrators MFA is "TOTP via an authenticator app, enrolled by each member"
(`client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx:702`, HEAD). It now says what sign-in does — an
emailed code, or an authenticator app on an account that already has one — and that enrolling an
authenticator app is not offered in this product yet.

| Evidence | |
|---|---|
| Red | `red/item7-mfa-copy.txt` — 1 failing |
| Green | `green/item7-mfa-copy.txt` — 27 passing (the new test and the three Setup suites) |
