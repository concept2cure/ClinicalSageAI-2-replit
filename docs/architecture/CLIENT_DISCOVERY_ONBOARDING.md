# Client discovery and workspace setup

Implemented on `concept2cure-v2`, 2026-10-14. Launch workstream W1, row D2.

The canonical discovery contract and API are documented in
[ONBOARDING_DISCOVERY.md](./ONBOARDING_DISCOVERY.md). The revisioned
`/api/onboarding/discovery` endpoint is the only discovery write door. General
organization settings, resets and AnA tools cannot bypass its revision,
completeness or audit checks. The setup author's role and experience describe
discovery context; they do not grant permissions or change a personal persona.

The wizard uses `useOnboardingDiscovery`, `DiscoveryQuestions` and
`DiscoveryNextSteps`. It supports saved drafts, conditional questions, read-only
members and explicit recovery from stale edits. Activation completes discovery
before invitations, licensing or checkout. `ProjectDiscoveryHandoff` lets the
person explicitly copy the stated first-project context into the existing
project form. It never creates a project or infers a filing type automatically.

Invitation results distinguish an emailed link, a link that must be shared,
pending cross-organization consent, an existing member, failed activation and an
unconfirmed result. Setup links remain in memory with explicit copy and manual
copy fallback. Checkout is an explicit continuation so handoffs remain visible.
Role choices use the canonical assignable organization roles.

The Account dialog's `AccountOnboardingSettings` lists invitations addressed to
the signed-in user and names the inviting organization. An unnamed invitation
cannot be accepted. Accept and decline retain the server's self-only proof,
quota and role checks, and commit with their chained audit records. Audit failure
rolls them back. Existing members keep their actual role. Acceptance refreshes
the membership list; switching workspaces remains an explicit action through
`OrganizationSwitcher`, which adopts the new session and clears prior workspace
state. Account reporting preferences and authenticator/password controls retain
their canonical endpoints.

Security setup combines the stated security needs with the current session's
actual MFA state and links to the existing Account and administration surfaces.
Only administrators can edit session policy. The live engine and UI share
`shared/auth/session-policy.ts` for `security.sessionTimeoutMinutes` and
`security.maxConcurrentSessions`, including defaults and bounds. Existing
sessions keep their recorded idle window; new sign-ins use the saved policy and
enforce concurrent-session limits. The absolute session lifetime remains 12
hours. The canonical settings audit records before and after values for both
editable settings. The administration summary uses those same effective-value
helpers instead of the ignored legacy `sessionTimeout` display preference.

`AdminApiKeyCreate` uses the existing tenant-scoped endpoint and signature
ceremony, with explicit read scopes, expiry, rate limit and reason. Its raw key is
shown once in component memory, never stored in browser storage or sent to AnA.
Creation and revocation commit with the chained audit row; audit failure rolls
back the mutation. `AdminApiKeyUsage` and `AdminPlatformGrants` expose the existing
authorized usage and operator administration endpoints.

SCIM IP-rule controls retain the existing platform-operator standing checks.
Creation, changes and deletion commit with their chained audit rows, including
the reason and policy before and after. Audit failure rolls back the mutation.
Named invitation consent and SCIM changes appear in the administrative-changes
report. SAML configuration has no write API, so its deployment-administrator
handoff remains explicit. Existing legal-hold and authoring access controls from
the parallel upstream update remain reachable through their canonical surfaces.

Evidence, the consolidation map and verification limits are in
[the W1/D2 evidence record](../evidence/W1/2026-10-14-discovery-onboarding/README.md).

Enterprise provisioning credentials in `IdentityConsole` use the existing
`/api/admin/scim-tenants` endpoints. Creation, rotation, enable/disable and
revocation require an explicit 3–500-character `reason` in the request body;
unknown request fields and non-integer target identifiers are refused. These
remain platform-administrator operations. The mutation connection rechecks
standing, locks the target record to establish its organization, and commits
with the canonical chained audit row. Neither plaintext credentials nor their
hashes enter audit metadata or directory responses. These events are included
in the existing administrative-changes report.

One-time secrets are returned only after confirmed commit and remain in drawer
memory. A `SCIM_TOKEN_UNAVAILABLE` response means the transaction was refused;
`SCIM_TOKEN_COMMIT_UNCONFIRMED` means the change may have committed and its
secret may no longer be recoverable. The console reloads the directory before
a fresh action. Do not automatically retry an unconfirmed create or rotation.
Deletion confirms its audit record through `X-Audit-Row-Persisted` and
`X-Audit-Row-Chained`; other mutations return `auditTrail` with the record.

Account setup also reaches the existing per-organization in-app notification
choices. Its expandable section and the inbox dialog share
`NotificationPreferenceSettings` and `/api/mdx/notification-subscriptions`.
Requests use the canonical captured-actor bearer headers, strict category and
boolean validation, and confirmation of the returned user, organization,
category and value. Obsolete replies cannot acknowledge another account's
save. Confirmed choices refresh the existing inbox badge, and readback retains
keyboard focus. Defaults are shown only after a valid preferences read.
Email, push, sound and digest settings from the separate legacy personal
preferences store remain outside these working in-app controls.

Invitation responses and reporting-role reads/saves in Account also capture the
validated actor and organization through the canonical bearer helper. A reply
is applied only while the same bearer and mounted Account owner remain current,
including after response-body decoding. A changed session cannot inherit a late
saved acknowledgement, membership refresh or reporting-cache update. Requests
do not adopt another session or automatically retry a mutation. Server-side
self-only invitation and current-membership authority remain authoritative.

Reporting-catalog persona reads now pin the same actor/organization headers and
consume query cancellation. Late network or body-decoding results cannot
populate another session's cache; an invalid current bearer also withholds a
previously cached persona from presentation. Explicit catalog filters remain
under the person's control while their owner is current.

Account's organization membership reader pins its source owner, withholds late
or malformed reads and reports failures explicitly. The existing confirmed
workspace-rotation POST also pins source-account headers before spending that
session. Its unsaved-editor reservation, replacement-session probe and fresh
shell handoff remain the existing ceremony. The separate organization-access
entry remains an identified follow-up rather than an implied completed audit.
