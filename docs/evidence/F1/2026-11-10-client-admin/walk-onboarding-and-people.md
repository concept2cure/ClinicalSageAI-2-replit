# Client administration walk 1: onboarding, setup and people (2026-11-10)

Plan: F1. Read-only phase: nothing in the product was changed. Walked in the running app with Playwright at
1440×900, and the main screens again at 390×844. Every screenshot named here is in `shots/` (prefix `w1-`), and the
scripts are in `walk1-scripts/` (as `.txt`, no secret in them). What each click wrote was read back from the
database (`audit_logs`, `organization_users`, `organization_invitations`, `organizations`).

## What already exists (RULE 3)

Everything walked exists; every proposed fix completes an existing file.

- Sign-up, verification, sign-in, password setup: `client/src/concept2cure/auth/ZenSignup.tsx`,
  `SignupVerifyStep.tsx`, `VerifyEmail.tsx`, `components/concept2cure-auth/Concept2CureLogin.tsx`;
  `server/routes/auth.ts` (`POST /signup`, `/verify-email`, `/resend-verification`, password reset confirm).
- First run: `v2/surfaces/HomeSetup.tsx` (three steps on Home), `Onboarding.tsx` (ten steps, "Set up a workspace"),
  `OnboardingInvitations.tsx`, `OnboardingSecurity.tsx`, `DiscoveryQuestions.tsx`, `OnboardingIngest.tsx`
  ("Set up from a document").
- Organization profile and company details: `OrganizationProfileCard.tsx`, `CompanyDocumentSettings.tsx`;
  `PATCH /api/organizations/:id/profile`, `PATCH /api/mdx/industry-profile`,
  `PUT /api/client-branding/company-documents`.
- People: `AdminAccess.tsx` (Members, Invite member, Audit activity), `AdminMemberActions.tsx` (Change role, Remove,
  Issue a new setup link), `AdminQmsApprover.tsx`; `server/routes/tenant-users.ts`,
  `tenant-users-qms-approver.ts`, `services/tenant/membership-change.ts`, `invitation-delivery.ts`,
  `invitation-consent.ts`, `services/atomicQuotaService.js`, `services/seat-licensing.ts`.
- Two organizations: `OrganizationAccess.tsx` ("Organizations and invitations"), `OrganizationSwitcher.tsx` (in
  Account), `switchOrganization.ts`, `contexts/TenantContext.tsx`; `POST /api/auth/enterprise/select-organization`.
- Terms acceptance storage that nothing reaches: `server/services/licensing/eula-service.ts` and
  `/api/licensing/agreements/*` (see W1-02, W1-05). Searched: `acceptedTerms`, `terms_accepted`, `legal_accept`,
  `aiLearning`, `opt_in`, `license_acceptances`, `legal/terms` across `client/`, `server/`, `shared/`,
  `migrations/`, `db/migrations/`.

## Setup

- The lead's app on `http://127.0.0.1:5220` (runtime role `app_service`, `RLS_ENFORCE=on`, no SMTP, no model key).
- Without SMTP, `POST /api/auth/signup` answers `503 AUTH_SIGNUP_UNAVAILABLE` ("Sign-up is not available right now.
  Try again later."), by design: the verification link cannot be mailed. That refusal reads as itself and is not a
  finding. To walk the real sign-up I started a **second instance of the same app on the same database**
  (port 5231, `SMTP_HOST=127.0.0.1` pointing at a local mail sink that writes to my scratch folder;
  `walk1-scripts/start-second.sh.txt`, `smtp-sink.cjs.txt`). I used it for the sign-up, the verification mail and
  the invitation mail's text, and stopped it and the sink at the end. The lead's app was never stopped or restarted.
- Organization I created: **Northgate Biologics** (renamed in the walk to "Northgate Biologics GmbH"), id 6, free
  tier. Its administrator is Avery Lind, `avery.lind@northgate-bio.example.test`. All destructive steps ran there.
- In "Concept2Cure Therapeutics" (seeded, id 2) I did one thing: the seeded administrator invited Avery Lind as a
  Member (the task asks for it). jm.smith was not changed.
- Accounts left behind in Northgate: Avery (admin), Vik Osei (viewer, active), Priya Raman (member, invited),
  noor.haddad (reviewer, invited), Lena Fischer (member, invited). Quinn Abara and Marta Kowal were removed.

## Flows walked

### 1. Sign-up, verification, first sign-in

1. Sign-in page → "Create an account" opens a four-step form (`w1-02`). Empty Continue names each missing field
   (`w1-03`); an address without `@`, a password under 12 characters and a mismatch are each named (`w1-04`). The
   password policy answers only on the last step and takes the person back to the field with its sentence
   (`w1-10`). The step-2 fields were kept on return.
2. **Typing with the keyboard does not work** (W1-01): each key press drops focus, so "Avery" leaves "A"
   (`w1-12`). Pasting or a password manager's autofill works, which is why earlier walks (which used `fill`) did
   not see it.
3. The request carries `email, password, companyName, industryMode, firstName, lastName, primaryUseCases,
   defaultMarkets`. The three acceptances, the "AI Model Improvement" switch, the job title (required on screen)
   and the plan are not sent (W1-02, W1-03, W1-04).
4. On 5231: `201`, "Check your e-mail … The link is valid for 24 hours. Until you open it, the account cannot be
   used." (`w1-13`). The mail: "Confirm your e-mail address — Concept2Cure", link to `/concept2cure/verify-email`
   with the token in the fragment. Signing in before confirming is refused in words: "Confirm your e-mail address to
   finish creating your account…" with "Request a new confirmation link" (`w1-14`). Audited: `user_signup`,
   the refused `user_login` (`email_unverified`), `email_verified`.
5. Opening the link: the server answered `200 {"success":true}` and the account became active, but the page said
   "This link is not valid or has expired" (`w1-15`). That is the development server's double effect run (W1-06).
   A second use answers `alreadyVerified`; a damaged token is refused with the same sentence.
6. First sign-in (5220, emailed code): Home greets "Good morning, Avery" and shows "Set up your organisation —
   0 of 3 done" (`w1-19`). Launch modules were provisioned, and the industry profile was seeded from the sign-up
   (biotech, EU from "Germany", IND).
7. An address that already has an account is refused without saying so: `409` "Unable to create account. Please try
   a different email or contact support."

### 2. First-run setup

- **Home, step 1 "Record your company details"** opens Admin → Settings at the top. The company card is 9,193 px
  further down, below ten other cards (W1-07). Filled address, contact and registration details with a reason;
  `PUT /api/client-branding/company-documents` → revision 1; audit row `tenant_settings_changed` with the reason;
  Home then says "1 of 3 done" (`w1-31` to `w1-34`).
- **Organization profile card**: saving with no reason or a two-letter reason is refused before any request. With a
  reason, the name was saved (`PATCH /api/organizations/6/profile` 200), held after reload, and is audited with
  before, after and the reason (`w1-22` to `w1-26`). The "Pharma" chip I picked at the same time was not saved, and
  the card still said "Saved" (W1-08).
- **Client type** is asked in four places with four lists (W1-09). The account menu's is a preference kept in the
  browser.
- **"Set up a workspace"** (ten steps, `w1-35`, `w1-36-*`): discovery answers save as drafts
  (`PATCH /api/onboarding/discovery`), the required questions adapt to the product type, step 6 refuses invalid or
  repeated addresses ("Enter valid, distinct email addresses before continuing."), step 8 records security
  requirements and says plainly that recording one configures nothing. "Start 14-day trial" then reported each part
  honestly (`w1-40`): discovery completed, name and industry "saved", "1 of 1 invitations recorded", and "The
  billing service did not return a checkout link — no plan was provisioned." The checkout itself answered 500
  (W1-11). The invitation's setup link is handed over on screen because no mail could be sent.
  Unchanged answers are written again on every pass (W1-10).
- **Home, step 2 and 3**: after the first invitation "Invite your team" reads Done; "Create your first project"
  opens the New project wizard.

### 3. Inviting a member, and the invited person

- "Invite member" (`w1-42`): Full name, Email, Role (Admin, Approver, Manager, Reviewer, Member, Viewer), Job title,
  Department, and the note that it consumes a seat and is audited. Empty submit: "Complete the required fields: Full
  name, Email, Role".
- An invalid address: the dialog closes and a toast says "Invalid user data" (W1-13, `w1-44`).
- An address already a member: "User is already a member of this organization" (`w1-45`).
- An address already invited, asked again with another role: a new setup link is issued and the screen says "The
  previous link no longer works; their role is unchanged (Reviewer)" (`w1-46`). Audited as `user_invited` with
  `reissued: true`.
- Viewer, Member and Approver were invited (201 each, audited with role and expiry). The fourth was refused at the
  seat limit (flow 7).
- With mail configured (5231) the invitation is mailed: subject "avery.lind@northgate-bio.example.test invited you
  to Northgate", text "…has invited you to join Northgate Biologics GmbH on Concept2Cure. Set your password and
  accept the invitation: <link> This invitation expires in 21 days."
- **As the invited person (Vik Osei, Viewer), clean browser**: the link opens "Set a new password — Choose a strong
  password you have not used before." (`w1-56`, W1-15). A mismatch and a weak password are refused with their
  sentences. The good password answers 200 and lands on the sign-in page.
- **Single use**: the same link again → "Invalid or expired reset token". **Replaced link**: after "Issue a new
  setup link", the first link shows the same form and is refused only on submit (`w1-54`, `w1-55`).
  **Expiry**: 21 days (`INVITATION_TTL_MS`, `server/services/password-setup-token.ts:26`); read in code, not
  exercised.
- The activation is audited as "Password changed through an emailed reset link" (W1-16).
- First screen for the Viewer: Home with the greeting, "Your projects" and "Create your first project" (`w1-60`,
  W1-22). No setup checklist (correct).

### 4. The administrator's member acts (Northgate)

| Act | Confirmation and reason | Written | Audit row |
|---|---|---|---|
| Change role (member → manager → viewer → reviewer → approver → admin → member) | A form naming the person and current role; reason required (spaces refused) | `organization_users.role` | `member_role_changed`, with previous role, new role and the reason, six rows |
| Same role again | — | nothing | none; "already holds the Member role — nothing changed." |
| Own role, own removal, own QMS designation | Buttons disabled with "Your own role and membership are changed by another administrator…"; the API answers 400 `SELF_ROLE_CHANGE`, `SELF_REMOVAL`, `SELF_DESIGNATION` | nothing | — |
| A role outside the six (`owner`, `super_admin`) by API | — | nothing (400) | — |
| Designate as QMS approver (an Approver) | Reason required; says it is the first designation and what that changes | `qms_approver_designated_at/by` | `c2c.work.qms-approver.designate` with the reason |
| Designate a Viewer | — | nothing; 409 "does not hold signing authority (role viewer)… Nothing was changed." | — |
| Remove designation | Reason required | cleared | `c2c.work.qms-approver.remove` |
| Remove from organization (an invited member) | States what removal does; reason required | membership row deleted; the seat is free again | `member_removed` with the role held and the reason |
| Issue a new setup link | Confirmation; says the old link stops working | new token | `user_invited`, `reissued: true` |
| Invite | Governed note, no reason asked | account + membership | `user_invited` with role, delivery and expiry |

- The member filters work (All 5, Active 1, Invited 4, Disabled: "No members match this filter.").
- The last administrator cannot be reached from the screen: the only way to it is the administrator's own row,
  which is refused first. `LAST_ADMINISTRATOR` (409) is read in code (`membership-change.ts:106`), not exercised.
- **Reading it back** fails: "Audit activity" on a member shows an empty table, and the audit screens name
  `organization_users:11`, not the person or the roles (W1-18, `w1-78` to `w1-82`).
- A removed invitee's old link still sets a password; sign-in is then refused "No organization assigned" (W1-17).
- There is no "cancel an invitation" as such. For a new person it is "Remove from organization". For a person who
  already has an account there is nothing (W1-19).

### 5. The lowest role (Vik Osei, Viewer)

- Account menu: Account, What AnA remembers, Usage & limits, Client type, Compare subscriptions, Set up a
  workspace, Get help, Log out. No Admin, no Access requests (`w1-61`).
- `/concept2cure/admin-console`: "Organization admin access required — Admin and access is limited to this
  organization's admins, and this account is not one." (`w1-62`). The header's "Invite member" still opens the form
  (W1-22).
- `/concept2cure/licensing` reads as "Compare subscriptions" and says invoices and changes are for billing
  administrators. `/concept2cure/onboarding` is read-only and says so. `/concept2cure/access-requests`: "Only an
  administrator can view access requests." `/concept2cure/master-licensing`: refused for platform administrators.
- Direct API calls with the Viewer's token:

| Call | Answer |
|---|---|
| `GET /api/mdx/admin` | 403 "Organization admin access required." |
| `POST /api/tenant-users`, `PATCH`/`DELETE /api/tenant-users/6/11`, `PATCH /api/tenant-users/6/10` (self to admin), `PUT …/qms-approver` | 403 "Admin of the target organization required" |
| `GET`/`POST /api/api-keys`, `GET /api/admin/security-health` | 403 "Admin permissions required" |
| `PATCH /api/organizations/6/settings`, `/profile` | 403 "Organization admin role required for this action" |
| `PATCH /api/tenant-config/6/settings` | 403 "Only organization admins can update settings" |
| `PATCH /api/mdx/industry-profile` | 403 "…requires an organization administrator role." |
| `PUT /api/client-branding/company-documents` | 403 `COMPANY_PERMISSION_REQUIRED` |
| `PATCH /api/onboarding/discovery` | 403 "An organization administrator or owner must save shared discovery." |
| `GET /api/module-access-requests`, `/api/audit/logs`, `/api/billing/invoices`, `POST /api/billing/dtc-checkout`, `GET /api/admin/access/grants` | 403, each in words |
| **`GET /api/tenant-users/6`** | **200**: every member's e-mail, status, last sign-in and join date (W1-21) |
| **`GET /api/organizations/6/settings`** | **200**: a block of fixed defaults (W1-21) |
| `GET /api/tenant-config/6/settings` | 200: the shared discovery answers (the questionnaire says they are shared) |
| **`GET /api/licensing/entitlements`** | **500** "Failed to resolve entitlements" (W1-05) |

### 6. Across organizations

- As Northgate's administrator, with Concept2Cure Therapeutics' ids (organization 2, member 1): every read and
  write was refused or answered with my own organization's data. `GET /api/tenant-users/2`, `/api/organizations/2`
  (+`/settings`, `/clients`), `/api/tenant-config/2/settings`: 403. `PATCH`/`DELETE /api/tenant-users/2/1`,
  `PUT …/2/1/qms-approver`, `POST /api/tenant-users` with `organizationId: 2`, `PATCH /api/organizations/2/profile`
  and `/settings`, `PATCH /api/tenant-config/2/settings`: 403. `?organizationId=2` on reads is ignored. An
  `X-Organization-Id: 2` header is refused 403 `TENANT_MISMATCH` and audited as `tenant_impersonation_attempt`.
  The seeded member's id on my own organization's routes: 404 "User not found in organization". The database shows
  organization 2's memberships unchanged.
- **Two organizations**: the seeded administrator invited Avery (who has an account) as Member → `202`, "Awaiting
  consent… must accept before membership is added" (`w1-85`). Avery's rail shows a "1" on "Organizations and
  invitations"; the panel lists "Concept2Cure Therapeutics · offered role: member" with Accept and Decline
  (`w1-87`); Accept asks for confirmation and says the current organization does not change (`w1-88`). Accepted:
  membership created, audited `organization_invitation_accepted`. The invitation's creation is not audited, and the
  inviting administrator cannot see or withdraw it (W1-19).
- **Switching** (from a clean sign-in): confirmation "The server verifies your membership and rotates this
  session…", then Projects of the other organization; audited `authorization.organization_switch`. The session is
  correct (Concept2Cure Therapeutics, Member; Admin console refused there). **The rail and the account menu keep
  naming the previous organization** (W1-20, `w1-91`, `w1-92`). Switching back from Account → "Switch organisation"
  works.

### 7. Seats

- A self-serve (free) organization admits **5** people. The sixth invitation is refused by the server: `403`
  "User quota exceeded. Current: 5, Maximum: 5", shown as a red toast (`w1-47-invite-4-manager.png`). Removing an
  invited member frees the seat at once.
- The plan cards say the free plan is "1 user, 2 projects, 1 GB" (W1-14). Nothing on the Members screen shows
  seats used.

### 390×844

- Sign-in, the four sign-up steps, verify-email, Home, the invite and change-role dialogs, the profile card and the
  onboarding steps fit (no horizontal overflow).
- Admin console: the four stat tiles fill the first screen; the Members table is 640 px wide and its section 706 px
  in a 390 px viewport, and the member drawer is cut on the left (`w1-p10`, `w1-p11`) (W1-23).

## Findings

Severity: blocker, high, medium, low. "Owner: this lane" means the client-administration lane.

**W1-01 — blocker — Sign-up cannot be typed into.** `ZenSignup.tsx` defines `FormInput` and `FormSelect` inside the
component (lines 447–520), so each key press remounts the field. Typed "Avery": the field holds "A", focus is on the
page body (`walk1-scripts/w1-typing.cjs.txt`, `w1-12`). Same in every text field of steps 1 and 2. Fix: move the two
components out of `ZenSignup` (props for value, error, onChange). Owner: this lane.

**W1-02 — high — The acceptances are not recorded.** Terms of Service, Privacy Policy and the regulatory
acknowledgement must be ticked, and the first two scrolled, before "Create account"; none is sent
(request keys above) and the `user_signup` audit row carries none. A record of acceptance exists unreached:
`eula-service.ts` (`license_acceptances`, with version, time, address and hash). Fix: send the three acceptances and
write them into the existing `user_signup` audit event (`recordAuthEvent` in `auth.ts`), refusing a sign-up without
them. Reaching `eula-service.ts` instead needs its tables on the applier: founder decision. Owner: this lane;
founder for the EULA path.

**W1-03 — medium — "AI Model Improvement" is a switch connected to nothing.** "Allow anonymized data to improve AI
(you can change this anytime in Settings)". The state is never sent, nothing stores it, and Settings has no such
control. The switch has no name or state for a screen reader. Fix: remove it from `ZenSignup.tsx` (lines 737,
930–952). Storing a choice is a founder decision. Owner: this lane.

**W1-04 — low — Job title is required and then dropped; the plan chosen is not sent; "Country" is free text.**
`ZenSignup.tsx` `handleSubmit`. Fix: send the job title into the existing `users.title`, or stop requiring it.

**W1-05 — medium — `GET /api/licensing/entitlements` answers 500 on a deploy-shaped database.** Log: `[licensing]
entitlements error — permission denied for schema public`. `eula-service.ts` creates its tables at run time
(`ensureSchema`, line 173), which the runtime role may not do, and `db/migrations/20260621_intelligent_licensing_eula.sql`
is not in `C2C_MIGRATION_FILES`. No client screen calls it today. Fix: founder decision: put that migration on the
applier and reach the service, or retire the route. Owner: founder decision.

**W1-06 — low — "This link is not valid or has expired" after a successful confirmation, on a development server.**
`VerifyEmail.tsx:36–60`: the effect removes the token from the address before the second (StrictMode) run reads it.
A production build runs the effect once. Fix: read the token once, outside the effect. Owner: this lane.

**W1-07 — medium — "Record your company details" does not land on the company details.** It opens Settings at the
top; the card is 9,193 px down, after Profile, Session policy, Review and approval, Agency gateway accounts,
Credential vault, AI data use, Submission files, Retention period and Legal holds. Fix: `HomeSetup.tsx`
`openAdminTab` passes the section, and `AdminAccess.tsx` scrolls `CompanyDocumentSettings` into view. Owner: this
lane.

**W1-08 — medium — "Saved" over a client type that was not saved.** With Biotech recorded, I picked "Pharma" (chip
turns orange), gave the reason "Legal entity name and client type corrected at set-up", and saved: only the name was
sent; the card said "Saved to the organization record and written to the audit trail."; after reload the chip is
Biotech (`w1-24`, `w1-28`; `organizations.client_type` still `biotech`). The governed profile cannot tell Pharma
from Biotech, yet `organizations.client_type` can. The "Enter a reason…" warning also stays on screen after a reason
is typed. Fix in `OrganizationProfileCard.tsx`: write the pick through the existing
`PATCH /api/organizations/:id/profile`, or offer one chip for the pair. Owner: this lane.

**W1-09 — medium — Four "client type" questions, four lists.** Sign-up (8 organization types), onboarding step 1
(9), the Admin profile card (7 chips), the account menu (5). The account menu's "Client type" is kept in the browser
(`c2c-v2-prefs.segment`), any member can change it, it sends the person to Projects, writes nothing, and can
disagree with the organization's recorded type (`w1-29`, `w1-30`). Fix: founder decision on the one place;
smallest step is to rename the account menu group so it does not claim the organization's setting. Owner: founder
decision.

**W1-10 — low — Unchanged answers are written and audited again.** One sitting took the discovery from revision 1
to 16; each "Save & continue" wrote `tenant_settings_changed` with `changedFields: [revision, updatedAt]`.
Activation re-wrote the unchanged name and industry (`before` equals `after`) with canned reasons. Fix:
`useOnboardingDiscovery.save` and `Onboarding.tsx` `activate()` skip a write that changes nothing. Owner: this lane.

**W1-11 — medium — Checkout answers 500 when billing is not set up.** `POST /api/billing/dtc-checkout` → 500
"Failed to create DTC checkout" (log: "Stripe secret key not configured"). The wizard offers "Start 14-day trial"
and then reports no plan. Fix: `server/routes/billing.ts` answers that case 503 in words, as Subscription & billing
already says it; the wizard does not offer a trial it cannot start. Owner: this lane.

**W1-12 — low — Wizard copy.** "1 users", "$1274/mo", "Plan features for the standard tier", "Startup Biotech -
standard", "Billing annual", "is receives", "Pharma Pricing", "100% answered", and nine "Next steps for your
workspace" rows (plan §2 retires guidance boxes, percentages as chrome and enum values on screen). File:
`Onboarding.tsx`. Owner: this lane.

**W1-13 — medium — A refused invitation closes the form and loses what was typed.** `AdminAccess.tsx:234` closes the
dialog before the request. An invalid address shows "Invalid user data"; the seat limit shows "User quota exceeded.
Current: 5, Maximum: 5". The success toast says "…any setup link below", and the handover is off screen. Fix: keep
the form open on a refusal (as Change role and Remove do), check the address in the form, and say the limit in plain
words with what to do. Owner: this lane.

**W1-14 — high — The plan's limits on screen are not the limits enforced.** Sign-up and Compare subscriptions say
Researcher (free) is "1 user, 2 projects, 1 GB storage". The organization's record has `maxUsers 5`,
`maxProjects 10`, `seatsPurchased 5` (column defaults, `shared/schema.ts:179`); five people were admitted and the
sixth refused; the subscription card says "Seats 5" beside "1 user" (`w1-63`). Fix: founder decision on the right
numbers, then set the limits from the tier in the sign-up insert (`auth.ts`) or correct `LIC_DTC`. Owner: founder
decision.

**W1-15 — medium — What the invited person meets.** "Set a new password — Choose a strong password you have not used
before.", with no organization, inviter or role. A replaced or used link shows the same form and refuses only after
both fields are typed: "Invalid or expired reset token". After success the confirmation shows for half a second and
the sign-in page opens with an empty address. The token stays in the address bar as `?token=` (the verification
link uses the fragment and removes it). People invited from the wizard are named by the address's first part
("noor.haddad") and are never asked their name. Fix: `Concept2CureLogin.tsx` (wording for a first password, keep the
confirmation until the person continues, carry the token in the fragment). Owner: this lane.

**W1-16 — medium — An invited account's activation is audited as a password reset.** `user_password_changed`,
"Password changed through an emailed reset link", though no mail was sent and no password existed; nothing records
that the invitation was taken up. Fix: the reset-confirm handler in `auth.ts` names a setup token's use for what it
is. Owner: this lane.

**W1-17 — low — Removing an invited member leaves their setup link working.** After "Remove from organization"
(Quinn, invited), the old link set a password (200). Sign-in is refused "No organization assigned", so nothing is
reached. Fix: `membership-change.ts` clears `users.reset_token` when it removes a member who never signed in. Owner:
this lane.

**W1-18 — high — The record of who changed whose access cannot be read back.**
(a) "Audit activity" on Priya Raman opens the audit trail searched for her name: an empty table with no message,
seconds after six role changes on her (`w1-78`). The search matches the visible columns, and the entries about her
name the target `organization_users:11`.
(b) The list and "Admin audit · recent" read "Member Role Changed — Organization Users", "C2c Work Qms Approver
Designate — Organization Member", "Data Modify", with ids such as `AUD-…` and `user:2` (`w1-79`, `w1-81`).
(c) The entry detail shows the reason but neither the person nor the role before and after, which the form promised
and the row holds (`w1-82`).
Fix: `AdminAccess.tsx:315` searches by what the entries carry; the audit list (`AdminSurfaces.tsx`, the
`/api/mdx/admin` audit facet) shows the person's name for a member target, and the detail shows before and after.
Owner: this lane for Admin; the audit trail screen's owner for its list.

**W1-19 — high — An invitation to a person who already has an account leaves no trace the administrator can see.**
(a) Its creation writes no audit row (invitations 1–3: only accept and decline are in `audit_logs`).
(b) The inviting administrator's Members list, filters and tiles do not show it; it cannot be withdrawn.
(c) `organization_invitations` has no expiry, so an offer of any role, Admin included, stays open.
Fix: `atomicQuotaService.js` writes the audit row with the invitation; `GET /api/mdx/admin` lists pending
invitations as members "awaiting consent" and the existing removal withdraws one; acceptance refuses an invitation
older than `INVITATION_TTL_MS` by its `created_at`. Owner: this lane.

**W1-20 — high — After switching organization, the app names the wrong one.** Session: Concept2Cure Therapeutics,
Member. Rail and account menu: "Northgate Biologics GmbH · Member", still after a reload (`w1-91`, `w1-92`).
`Shell.tsx:191` takes the name from `TenantContext`, which picks by `localStorage.currentOrganizationId`
(`TenantContext.tsx:195`); `switchOrganization.ts` updates the other keys and not that one. The same block falls
back to "organization id 7" by number. Fix: `switchOrganization.ts` writes `currentOrganizationId`; the shell names
the session's organization. Owner: this lane.

**W1-21 — medium — What the lowest role can read.** `GET /api/tenant-users/:id` gives a Viewer every member's
e-mail, status, last sign-in and join date (the route serves reviewer pickers, which need the name, role and
`canSign`). `GET /api/organizations/:id/settings` returns fixed values that are not the organization's
(`sessionTimeout: 30` while the policy in force is 15 minutes; `backupFrequency: "daily"`, `dataRetention: 365`,
`apiRateLimit: 1000`, integrations). Fix: `tenant-users.ts:321` returns the picker fields to a non-administrator;
`organizations-routes.ts:404` stops returning values nothing stores or enforces. Owner: this lane; founder decision
on whether members may see each other's last sign-in.

**W1-22 — medium — A Viewer is offered what they cannot do.** Home: "Create your first project", "Set up my first
IND project". New project then says "Which filing types the platform can carry could not be read, so none is offered
yet. Retry" over a run of 403s (`w1-68`): a refusal shown as a failed read. On the refused Admin console, "Invite
member" still opens the form (`w1-69`). Owner: the Projects lane for `HomeSections.tsx:112` and `AnaVerbs.tsx:332`;
this lane for `AdminAccess.tsx:448`.

**W1-23 — medium — Admin console design.** Four stat tiles are permanent chrome (plan §2 retires them) and fill the
first phone screen; the eyebrow "System"; scope ids (`records:read`, `members:administer`), "local", "email" as
values; the Members section is wider than a phone and the drawer is cut (`w1-p10`, `w1-p11`); the member list does
not say who is invited. Owner: this lane.

**W1-24 — low — Words.** "organisation" and "organization" in the same flow (Home and Account against Admin and the
organizations panel); "offered role: member", "The invitation offers member."; the invitation mail names the inviter
by address and omits the role; sign-up says "Full terms available at concept2cure.com/concept2cure/legal/terms" as
plain text, and the client has no legal page; "Subscriptions require a 3-month minimum commitment" beside "14-day
free trial". Owner: this lane; founder for the legal text.

**W1-25 — low — Not in this lane: agency gateway accounts (onboarding step 9).** "as2: CMS signing/encryption and
pinned MDN verification are implemented. FDA account UAT and agency acceptance remain unverified." is developer
wording on a client screen. Owner: the gateway and connector cards' owner (`GatewayAccountsSetting.tsx`).

## What held

Cross-organization isolation on every administration route tried; refusals for the lowest role on every write;
role change, removal and QMS designation each with a confirmation, a required reason and an audit row holding both;
self-change refused in the screen and by the API; setup links single-use and replaced on re-issue; sign-up,
verification and each sign-in audited; the hash chain verified intact over the walk's entries.

## Not covered

- Invitation expiry after 21 days and verification-link expiry after 24 hours (read in code only).
- The `LAST_ADMINISTRATOR` refusal (not reachable from a client administrator's screen).
- Paid-plan sign-up and checkout (no payment provider here).
- "Set up from a document" beyond opening it (AnA has no model key).
- Decline of an invitation in the screen (the other walker's accounts show it audited).
- SSO sign-up and SCIM provisioning.
- Dark theme.
