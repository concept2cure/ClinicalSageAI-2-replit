# D2 — Account onboarding and workspace membership

The existing Account drawer now exposes the authenticated person's pending invitations, organization switching and reporting role. It uses the existing `de-*` drawer controls, separators and shared loading/error components. It adds no stylesheet, dependency or parallel account route.

## Backend contracts made reachable

| Existing capability | Account action | Contract |
| --- | --- | --- |
| Pending invitations | Read the inbox | `GET /api/tenant-users/invitations/mine` |
| Accept an invitation | Accept the server-returned row | `POST /api/tenant-users/invitations/:invitationId/accept` |
| Decline an invitation | Confirm decline or cancel | `POST /api/tenant-users/invitations/:invitationId/decline` |
| Organization memberships | Choose an organization to open | `GET /api/organizations?membershipOnly=true` |
| Switch session organization | Confirm switch, verify the replacement session, open a fresh shell | `POST /api/auth/enterprise/select-organization`, then `GET /api/v1/auth/session` |
| Reporting persona | Choose or clear the reporting role | `GET/PUT /api/users/me/persona` |

`membershipOnly=true` is an optional, validated directory filter. It reads actual `organization_users` memberships even for platform staff; the default staff directory continues to list every organization. Invalid filter values fail before the directory is read.

Invitation rows carry organization IDs, without organization names. Account displays those IDs instead of inventing names. Only valid pending rows and canonical assignable roles offer response actions. Acceptance verifies the returned membership matches the invitation and authenticated person, refreshes the inbox and organization picker, and leaves the current session unchanged until the person confirms a switch. Reads, malformed responses and mutations have distinct error states; a read error does not claim there are no invitations.

## Organization changes fail closed

The select-organization route already checks a live access token and actual target membership, rotates the presented token and records the boundary crossing. Account never writes a tenant ID into storage to simulate a switch. It uses the canonical `authService.adoptSession` method to probe the new token against the session endpoint and verifies the expected user and organization before storing it.

After successful verification, adoption removes old canonical credentials and legacy bearer keys from both storage tiers before storing the successor. Device draft caches are purged by the same canonical credential-clearing routine. A session revision prevents a refresh request started in the predecessor workspace from replacing the successor if that request finishes late. Missing organization names also clear stale name/slug mirrors.

Account clears `c2c.shell-project`, `window.C2C_PROJECT` and the query cache, then opens `/concept2cure/projects` as a full document navigation without an old program query parameter. This discards prior-tenant AnA conversation, entitlement and component state. The person confirms the loss of unsaved changes before the request. A failed probe, expired session, uncertain request outcome or failed navigation ends the client session and requires sign-in; a definite membership refusal retains the original session and shows the server's refusal.

## Reporting personalization

The reporting-role selector uses the canonical `REPORT_PERSONAS` vocabulary and sends only `{ persona }`, with `null` to clear. It does not modify membership role or grant report execution. The successful response updates a React Query entry keyed by the user and session organization.

The existing report catalog reads that same self-only persona on entrance and uses it as the default for its existing Reporting role filter. Account saves update an already-open catalog through the scoped query cache. An explicit choice, including All, stays in control. A session identity change resets the previous choice and loads the new account's profile. A saved persona absent from the current catalog leaves All selected; an unreadable persona has an error and retry while the governed catalog remains reachable.

## Deferred preferences

`GET/PUT /api/users/me/preferences` stores density, rail and dock settings, but the current v2 shell has no consumers for those persisted fields. `GET/PATCH /api/users/me/notifications` stores notification choices, but searches for `notificationPreferences`, `notification_preferences`, `email_mentions`, `emailApprovals` and `emailDigest` across the server and client find the users-route CRUD only, with no delivery consumer. Those settings are not exposed as working controls. Deployment requires connecting the persisted preferences to the active shell and notification fanout before presenting them as behavior.

## Verification

The initial Account test failed before the new component existed (`account-self-service-red.txt`). More specific workspace regression tests failed before the implementation: platform staff still received the full directory with `membershipOnly=true`, malformed filters returned success, predecessor credentials survived in the opposite storage tier, the wrong expected identity was adopted, and a late predecessor refresh replaced the new session (`workspace-contract-red.txt`).

The final targeted run covers Account password/MFA regression behavior, invitations, reporting profile/filter integration, workspace switching, token adoption/reload, logout/expiry, the organization directory/settings routes and the server's existing token-rotation contract. `account-self-service-green.txt` contains the command result. `workspace-ui-green.txt` separately covers expiry, uncertain network outcomes and duplicate-rotation prevention. `account-lint.txt` records zero warnings and zero errors for the changed client surfaces and their new tests; auth-service files retain the repository's existing lint exclusion.

No production credentials, provider calls or migrations are required by this change. Runtime UI verification and launch-wide gates belong to the lead workstream.
