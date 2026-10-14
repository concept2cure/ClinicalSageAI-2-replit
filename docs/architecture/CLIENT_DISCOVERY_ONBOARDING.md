# Client discovery and workspace setup

Implemented on `concept2cure-v2`, 2026-10-14. Launch workstream W1, row D2.

The canonical `Onboarding` surface now asks about company goals, workspace uses,
the setup author's working role and experience, guidance preference, therapeutic
areas, markets and pathways. A separate project-discovery step captures the
planned product, intended use, lifecycle, goals and milestone. Device and IVD
answers open the corresponding predicate or assay questions; changing product
context clears fields that no longer apply. Unknown project fields remain blank.

The questionnaire uses `shared/types/onboarding-discovery.ts` and saves a complete
versioned snapshot under `organizations.settings.onboardingDiscovery`. This is
organization-shared planning context supplied by the setup author. It is not a
personal-account update, regulatory determination, membership grant or security
configuration. No model generates discovery answers or decides permissions.

Storage uses the existing governed `PATCH /api/organizations/:id/settings` door:
the authenticated organization and administrator checks remain in place. A
bounded, strict snapshot and a reason are required. Other settings are preserved.
The existing row lock and chained-audit transaction commit together or roll back
together. Discovery values and invitation secrets do not enter the audit row;
the existing writer records changed field names and the reason. Unsupported saved
discovery formats and failed reads block activation rather than replacing an
unread profile with defaults.
Late reads fill only untouched fields, preserving both typed answers and the
saved context the person has not edited. A product change keeps inapplicable
predicate or assay fields cleared.

Activation saves discovery first. A refused save leaves review open before
invitations, licensing requests or checkout run. Market, pathway and review
preferences also reach the existing governed industry-profile endpoint. Its
preferences do not override approval and electronic-signature workflows.

The first-run welcome links directly to discovery and to the existing document
extraction/review flow. After activation, the project creator can copy the
user-stated planned name, product class, intended use and milestone into its
existing form. This requires an explicit action and never selects a filing type
or creates a project automatically.

Invitation results distinguish an emailed link, a link that must be shared,
pending cross-organization consent, an existing member, failed activation and an
unconfirmed result. Each setup link remains in memory and has its own copy
button and manual-copy fallback. Checkout is an explicit continuation so an
automatic redirect cannot erase these handoffs. Wizard role choices use the
canonical assignable organization roles, including reviewer and approver.

The personal Account dialog now lists invitations addressed to the signed-in
user, naming the inviting organization. Accept and decline preserve the server's
self-only invitation proof, quota and role checks. Acceptance does not switch
the active workspace. Consent mutations and their chained audit records share a
transaction; audit failure rolls them back. An existing membership keeps its
actual role rather than being re-granted the invitation's role.

Security setup reuses the Account dialog and existing administration surfaces.
Session policy exposes only the two settings the live engine reads:
`security.sessionTimeoutMinutes` and `security.maxConcurrentSessions`. Their
defaults, bounds and effective-value helpers come from
`shared/auth/session-policy.ts`, which the server also imports. Existing sessions
keep their recorded idle window; a new sign-in uses the policy and enforces the
concurrent-session limit. The absolute session lifetime remains 12 hours. Both
editable policy values are recorded before and after by the canonical settings
audit. The admin summary reads those same effective helpers, not the ignored
legacy `sessionTimeout` display preference.

API-key creation uses the existing tenant-scoped admin endpoint, with explicit
read scopes, expiry and rate limit. The raw key stays in component memory until
the person stores and dismisses it; it is never written to storage or published
to AnA context. Creation also carries the supplied reason into the existing
security audit and reports its actual audit outcome; an audit outage does not
hide a key that was already created. SCIM IP-rule controls use the existing
platform-operator routes and retain their server-side standing checks. Rule
creation, changes and deletion now commit with their chained audit row, including
the reason and policy before and after; an audit failure rolls back the rule.
These events appear in the administrative-changes report. SAML settings have no write API;
their deployment-administrator handoff remains explicit.

Evidence and limits are in
`docs/evidence/W1/2026-10-14-discovery-onboarding/README.md`.
