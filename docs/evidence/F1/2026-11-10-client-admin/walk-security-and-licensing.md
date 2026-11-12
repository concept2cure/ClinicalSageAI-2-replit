# F1 client administration walk 2: security settings, API keys, licensing and billing

Walked 2026-11-10 in the running app on http://127.0.0.1:5220 (database `cadmin`, runtime role `app_service`,
RLS_ENFORCE=on, LAUNCH_SCOPE_ENFORCE=on, dev sign-in off, no SMTP, no model key). Every sign-in used the emailed
six-digit code read from the server log. Viewports 1440x900 and 390x844.

- Screenshots: `shots/w2-*.png` (143 files).
- Walk scripts, without secrets: `walk2-scripts/*.txt`. Passwords were read at run time from files outside the
  repository; no password, code, token or key value is in this folder.
- Raw step output (HTTP status and body, database reads, audit rows) was kept in the walker's scratch folder
  (`walk-w2-*.json`). The figures quoted below come from it.

The run was cut off by a usage limit after the phone pass. It was resumed after a machine restart to write these
notes. No flow was repeated.

## Accounts and organisations

- **Self-serve sign-up on 5220 was refused.** Sign-up takes four steps (person, organisation, plan, agreements).
  The create call `POST /api/auth/signup` then answered **503**, and the screen said *"Sign-up is not available right
  now. Try again later."* (`w2-00-signup-*.png`). The cause is that this instance has no SMTP and dev sign-in is off
  (`server/routes/auth.ts` ~957-966). The refusal reads as itself, but only after four steps.
- **Own organisation used for every settings change.** "Walk Two Biologics" (organizations.id 7, free tier) was made
  by the real sign-up on walk 1's second instance (port 5231, with its mail sink), then used on 5220. The
  administrator was walk2.owner@example.test. It had four invited and activated members: member2 (Member), viewer
  (Viewer), manager (Manager), and walk2.admin (Reviewer, joined by invitation).
- **Accounts in the seeded organisation.** "Concept2Cure Therapeutics" (id 2): jm.smith invited walk2.admin (Admin)
  and walk2.member (Member). They were used for the multi-organisation checks, the member refusals and one positive
  API-key use on the enterprise plan. jm.smith's password, role and membership were not touched.

## Restored at the end (checked in the database after the restart)

| What | Value now (org 7) |
|---|---|
| Security settings | `{"sessionTimeoutMinutes":15,"maxConcurrentSessions":5,"mfaRequired":true,"passwordPolicy":{"minLength":12,"requireSpecialChars":true},"ipRestrictions":[]}` |
| Quality and every other module | Quality `enabled=t`, and all 12 modules on |
| Purchased seats | `seats_purchased=5`, `max_users=5` |
| PDF/A | `submission.requirePdfA=false` |
| Client type | Industry profile `biotech_pharma` |
| API keys | Both keys made by this walk are `revoked` |

The organisation's company documents remain at revision 1 (legal name and address recorded). That is the change the
walk was asked to make.

---

## Flow 1: the Admin console, tab by tab (1440)

Shots: `w2-01-*`, `w2-10-*`.

### Members

- The list, the drawer, role scopes, project access, change role, remove, and the QMS approver are present.
- The header holds stat tiles (Members 5 / Roles 5 / Authenticator app 0 of 5 / API keys 0). These are permanent
  stat tiles, a retired pattern (plan §2).

### Roles + scopes

The tab is a **true account** on the three rows tested against the server (`walk-w2-07`):

| Row | Server result |
|---|---|
| `audit:read` (Admin, Manager) | `GET /api/audit-trail/ledger` answered 200 for the admin and the manager. It answered **403 AUDIT_READ_RESTRICTED** for the member and the viewer. |
| `members:administer` (Admin only) | `GET /api/mdx/admin`, `POST /api/tenant-users`, `PATCH /api/organizations/7/settings` and `GET /api/api-keys` each answered 403 for the manager, the member and the viewer. |
| `records:write` (not Viewer) | `POST /api/c2c/projects` refused the viewer with **403** *"Your current role cannot create a project. Nothing was changed."* It let the member through to validation (400, *"A filing type is required."*). |

Every opening of the tab, by an organisation administrator, makes a **403 `GET /api/admin/access/grants`** call and
logs a console error. The card then reads *"Platform access is restricted"*. The refusal reads as itself, but the call
should not be made for a client administrator.

### SSO + provisioning

- The tab shows status only: SAML/OIDC *"Not configured · Disabled"*, SCIM *"Not configured"*, Local *"Enabled"*.
- It says SAML endpoints and SCIM tokens are governed in the Identity console.
- **"Open Identity console"** leads a client administrator to *"Platform administrator required. SCIM token and
  allowlist administration requires the super_admin or platform_admin role."* That page makes four 403 calls
  (`/api/admin/scim-tenants`, `/api/admin/scim-ip-allowlist`) (`w2-01-identity-console-1440.png`).
- **A client cannot enter an identity provider anywhere in its own administration.** Settings shows "Single sign-on ·
  SAML / OIDC via your IdP · Disabled" with no control. Nothing was entered, saved or reloaded, because there is no
  form.

### API keys

See flow 3.

### Settings

- Profile & client type, Session policy, Review and approval (P-117, another lane), agency gateway accounts and
  credential vault (another lane), AI data use, Submission files (PDF/A), retention and legal holds, company
  documents, and the GAMP 5 validation package.

### Audit activity

- The "Admin audit · recent" list is under every tab. "Open the audit trail" opens `/concept2cure/audit-trail`
  (flow 6b).

### A member opening the Admin console

The member's own address shows *"Organization admin access required. Admin and access is limited to this
organization's admins, and this account is not one."* (`w2-10-admin-console-as-member-1440.png`). The refusal reads
as itself.

## Flow 2: security settings (own organisation)

### 2a. Session policy card

Shots: `w2-20-*`.

- **Refusals on the card.** With no reason, with idle 0, 2000 or 1.5: *"Enter whole numbers within the stated limits
  and a reason of at least 3 characters."* Nothing was written.
- **Save.** Idle 1 minute and 2 concurrent sessions, with a reason, gave *"Session policy saved with your reason in
  the audit trail…"*.
  - Stored: `{"sessionTimeoutMinutes":1,"maxConcurrentSessions":2}`.
  - Audit row `tenant_settings_changed` with the reason and full **before/after** in `new_values`.
  - After a reload the card showed 1 / 2.

### 2b. Idle sign-out is enforced

Shots: `w2-21-*`.

- The new session's token carried `idl:60`. A signed-in page left untouched signed itself out at **+59 s**
  (`POST /api/v1/auth/logout`).
- The sign-in page then said *"You were signed out after a period of inactivity. Sign in to continue."*
- The stored token then answered **401 AUTH_005 "Session expired"**.

### 2c. Concurrent-session limit is enforced

Limit 2. The viewer signed in three times: session A was then 401, while B and C were 200.

Session A's open page did not sign itself out. On its next click it showed *"Couldn't load the project portfolio ·
Sign in again to continue"* inside the shell (`w2-22-superseded-session-screen.png`). This is a low-severity finding.

### 2d. The settings route underneath the card

Probe through `PATCH /api/organizations/7/settings` (`walk-w2-12`):

| Body sent | Answer | Stored |
|---|---|---|
| Bare body `{"security":{"sessionTimeoutMinutes":20}}`, **no reason** | 200 | Stored, with an audit row whose reason is empty |
| Governed body, idle **99999** | 200 | Stored |
| Governed body, idle **"abc"** | 200 | Stored. The next session ran on `idl:900`, a silent fallback. |
| Governed body, concurrent **0** | 200 | Stored |

After these writes the card showed **idle 15, concurrent 1**, which is not what was stored.

### 2e. A second settings door: /api/tenant-config

`PATCH /api/tenant-config/7/settings`, with **no reason**, answered 200 and stored:

- `mfaRequired:false`
- `ipRestrictions:["203.0.113.7"]`
- `passwordPolicy:{minLength:8,requireSpecialChars:false}`

Nothing enforces any of them (`walk-w2-13`):

- Sign-in from 127.0.0.1 still worked.
- The second factor was still asked.
- An 8-character password was still refused (*"Password must be at least 12 characters"*).
- The Settings tab still said **"Second factor at sign-in · Required for every member"** while the record said
  `mfaRequired:false`.

These are dead governed settings. A client or an auditor reading the record would believe there is an IP
restriction.

### 2f. Password rules

- Fixed by the platform (12+ characters, upper, lower, digit, special, no common or dictionary words, no own name,
  e-mail or organisation, history).
- There is no client-settable password rule on any screen.
- The rules hold (flow 4).

### 2g. Second factor

- Email code: mandatory for everyone.
- Authenticator: flow 4.
- The organisation-wide toggle is not a control. The card states the rule, which is honest.

### 2h. IP, domain or sign-in restrictions

No screen offers one. The only one found is the unenforced `ipRestrictions` key behind `/api/tenant-config` (2e).

### 2i. A member (non-administrator)

Every settings and admin write was refused (403) for the member, the viewer and the manager (flow 1).

### Restore

The card was restored to 15 / 5 with a reason. The unenforced keys were reset through the same door (`walk-w2-13`).

## Flow 3: API keys

Shots: `w2-30-*`. Own organisation (free plan), then the seeded organisation (enterprise plan) for a positive use.

### Create form

Refusals:

- No name: *"Enter a key name with 1–255 characters."*
- No scope: *"Select at least one read-only scope."*
- No reason: *"Enter a reason with 3–500 characters."*

### Created with documents:read only

- The value was shown once in *"Store your API key … the full key is shown once and cannot be retrieved after this
  drawer closes."*
- After closing, the value appears nowhere: not on the page, not in `GET /api/api-keys`, not in `GET /api/mdx/admin`,
  not in browser storage, not in `audit_logs`, not in the server log.
- The row stores `key_hash` (64 hex characters) and `key_prefix` only.
- Audit row `api_key_created` with the reason, prefix and scopes.

### Use on the free plan

- In scope: `GET /api/v1/documents` answered **403** *"Quota exceeded … This feature requires a standard plan."* The
  refusal reads as itself.
- Out of scope (`csr:read`, `regulatory:read`): 403 *"Insufficient scope"*.
- The session API (`/api/mdx/admin`, settings, the key list): 401 `API_KEY_NOT_ACCEPTED`.
- No key: 401. A wrong key: 401.
- The create form does not say the free plan cannot use the public API.

### Use on the enterprise plan (seeded organisation, as walk2.admin)

- In scope: **200**. Out of scope: 403. Another organisation's document id: 404.
- The key was created with **"Requests per minute" 3**, and `rate_limit=3` was stored. Every response said
  `x-ratelimit-limit: 60`, and calls 4, 5 and 6 inside the minute answered **200**. The per-key limit is not
  enforced: `server/routes/public-api.ts:115` uses a fixed `MAX_REQUESTS = 60`.
- **The request count doubled.** 7 calls showed "Total requests 14" in the usage view, with `request_count=14`
  stored.
- **No per-use record.** `api_usage_logs` had 0 rows, and `audit_logs` had 0 rows naming the key. The list's empty
  state promises *"every use is audited"*.

### Usage view

Prefix, status, total requests, last used, created.

### Revoke

- The confirmation reads *"Revocation is immediate and cannot be undone…"*. The toast reads *"API key … revoked —
  the revocation is in the audit trail."*
- After revocation, use answered 401 *"API key has been revoked"*.
- **No reason is asked.** The audit row `api_key_revoked` has a null reason, while creation required one.

Both keys are revoked.

## Flow 4: your own account

Shots: `w2-40`…`w2-45`.

### Profile

- Name, e-mail, organisation and role are read-only.
- **Role is shown as the raw value "manager"** (`w2-40-account-panel-1440.png`).

### Password change

| Attempt | Result |
|---|---|
| Wrong current password | *"Current password is incorrect"* |
| Weak new password | Each rule refused in words, including name or organisation and the history rule |
| Success | *"Password changed. Every session of this account has ended, this one included."* The other session was 401 at once. Audit row `user_password_changed`. |
| Old password at sign-in | Refused |
| Back to the earlier password | Refused (history) |

### Authenticator app

- **Set up.** QR and key were shown. A wrong code was refused, and the right code (TOTP computed in node) confirmed
  it. 10 recovery codes were shown once and are not stored in clear. Audit rows for the failure and the success.
- **Sign-out and sign-in.** The app code was asked and a wrong one refused. The right one signed in. The same code
  was refused when replayed in another browser.
- **Stale error.** The wrong-code message at set-up was shown together with a stale *"This password was used
  recently…"* from the password section.
- **Recovery code not usable on the sign-in page.**
  - The Account panel promises *"Each code completes one sign-in if the app is lost."*
  - The challenge page offers only six digit boxes, "Verify" and "Back to sign in", with no "Use a recovery code".
  - The server accepts a recovery code (`POST /api/v1/auth/mfa/verify` gave 200, signedIn).
  - Cause: `server/services/mfa-enrolment.ts` `mfaEnrolmentOf` never lists `backup_code` in `mfaMethods`, so
    `ZenLogin.tsx:608` (`supportsRecoveryCodes`) never shows its existing "Use a recovery code" control.
  - A person who loses the app is locked out.
- **Remove.** A wrong code was refused. A recovery code was not accepted, and the screen says so. The right code
  removed it. Audit rows.

### Sign out everywhere / session list

Not offered on Account. A password change ends every session, which is the only door.

### Invitations

- Inviting an existing account records *"Awaiting consent"*.
- In the invited person's Account: Accept, then *"Invitation accepted for Walk Two Biologics."* Membership was
  created and audited.
- Decline asks for confirmation, then *"Invitation declined…"*. No membership. Audited.

### Switch organisation

- Two clicks (select, then "Confirm switch"). It lands in the other organisation with the reviewer role.
- Audited as `authorization.organization_switch`.

## Flow 5: licensing and billing

Shots: `w2-50`…`w2-56`.

### Subscription & features (`/concept2cure/features`)

- **Header.** *"Free — biotech"*, Projects 0 / 10, Seats 5 / 5. The database agrees: 5 members, `max_users 5`,
  `max_projects 10`, 0 projects.

**Turning a feature off.** Quality, with the governed dialog: a reason of at least 8 characters, then type "yes".

- It wrote `PUT /api/module-subscriptions/quality/toggle` and stored `enabled=f`.
- Audit row `data_modify` with `org.module_toggle` and the reason.

**The member while Quality is off.**

- Clicking Quality in the rail shows *"Turned off for this workspace"* with "Ask an administrator". The request was
  recorded (`module_access_requests` row 1, open).
- Opening `/concept2cure/quality` **by address** loads the full Quality surface. Its APIs `/api/mdx/qms/documents`,
  `changes`, `templates` and `training/*` all answered **200** (`w2-52-member-quality-by-address.png`).
- The feature is not off. `MODULE_ENFORCEMENT` defaults to `off`
  (`server/services/entitlements/enforcement-mode.ts:142`).

**Access requests** (account menu, "Access requests").

- Approve and decline each need a reason of at least 3 characters and the typed "yes".
- Approving turned Quality on and recorded who, when and why. Audit row `request.approved`.

**Seats.**

- **The sixth person.** With 5 of 5 seats, inviting a sixth gave **403** *"User quota exceeded. Current: 5, Maximum:
  5"*. The refusal is honest, in developer wording ("quota").
- **Admin controls shown to a member.** The member sees the "Admin controls" switches (12) and can press one. The
  server refuses: *"Could not disable Tasks — Admin access required"*.

### Subscription & billing (`/concept2cure/licensing`, titled "Compare subscriptions")

| Item | What the screen says | What is true |
|---|---|---|
| Status | **"Incomplete"** | The organisation is on the free plan with nothing to pay (`paymentStatus: incomplete` from `GET /api/billing/status`) |
| Researcher (free) plan card | **"1 user · 2 projects · 1 GB storage"** | This organisation's record is 5 users, 10 projects and 5 GB, as shown on Subscription & features |
| Plan cards | Tier values **"free", "standard", "professional", "enterprise"** under each plan name | Raw tier values |
| Header copy | "Billing runs on Stripe Checkout + Customer Portal" | Vendor or implementation wording |
| "Manage billing" | Disabled, with *"Billing is set up the first time a subscription is checked out."* | Honest |
| Invoices | *"Billing is not set up · This organization has no Stripe customer record…"* | Honest about the state. It names Stripe. |

**Start 14-day trial (Startup Biotech).** It answered `POST /api/billing/dtc-checkout` with **500** *"Failed to create
DTC checkout"*. The screen said *"Checkout failed · Failed to create DTC checkout"* (`w2-54-licensing-trial-after.png`).
With no billing provider configured this should be refused as itself, not reported as a server fault, and "DTC" is
developer wording.

**Purchased seats through the API.** `PUT /api/billing/seats` with a reason, and no payment, raised purchased seats
to **50** (200, audited with previous and new values).

- "Subscription & billing" then showed **Seats 50**.
- Inviting a sixth person was still refused (Maximum 5), and `GET /api/billing/seats` reports
  `"enforcement":"report-only"`.
- Two seat figures disagree, and a client administrator can raise its own purchased seats without paying. No screen
  calls this route.
- Restored to 5.

**Weekly caps.** The page says *"overage caps you set yourself. Changing a cap is a governed action"*. `GET
/api/billing/weekly-limits` exists, and `PUT /weekly-limits/:metric` (`server/routes/billing-dashboard.ts`) exists,
but **no control on Usage & limits or this page reaches it**.

### Usage & limits (`/concept2cure/usage`)

- Own organisation: Free plan, 0% session, 0% weekly. The database has 0 `usage_records` for org 7. **True.**
- Seeded organisation: Enterprise, 0%. It has 5 `usage_records`, all `api_documents_list` quota counts, not model
  cost. Consistent.
- The "Rate limits" tab states one table *"The same for every subscription"*.

### Enforcement mode

Seen only in API answers (`report-only`). No screen states it to the client.

## Flow 6: the cards reached from administration

### Validation kit (GAMP 5 validation package)

- Lists VMP-001 and URS-001…008. Each shows **"DRAFT — UNSIGNED"**, which is honest.
- Download gave `VMP-001.md` (16 kB). Audit row `EXPORT_GENERATED` with its sha256.
- A member can also read `GET /api/validation-kit` (200).

### Profile & client type

- Saving with no reason was refused on the card. With a reason: `PATCH /api/mdx/industry-profile`, saved and
  audited (`update`, reason).
- Restored to Biotech.

### PDF/A requirement

- Turned on and then off with a reason. Each change wrote `tenant_settings_changed`, but **`values:{}`**: the audit
  row does not say what the value became.

### Company documents

- Saving with no reason was blocked. With a reason: revision 1, audited with sha256 before and after.
- "Download saved Word letterhead" and the "unsaved proof" are valid .docx files, and each download is audited.
- From Account, a member sees the same documents with "Save company documents" locked.

### 6b. Audit trail screen (`/concept2cure/audit-trail`)

Shots: `w2-70-*`, `w2-71-*`.

**Settings changes cannot be read on screen.**

- A governed settings change appears as **"Tenant Settings Changed"** with target **`organization_settings:7`**,
  actor **`user:5`**, and a row id `AUD-…` (`w2-70-audit-trail-settings-row.png`).
- Opening the row shows neither the field nor the before/after. The database row holds both.
- The signed export does not carry them either: `sessionTimeoutMinutes`, `"before"`, `requirePdfA` and
  `seatsPurchased` each appear 0 times in the 65 kB export.
- The feature toggle and the client-type change are generic `data_modify` / `update` rows.

**The audit-event chain fails on its own.** After three "Export signed bundle" clicks, the screen header read
**"Audit-event chain verification failed · 3 broken links over 3 entries"** (`w2-71-audit-chain-verification-failed.png`).

- Org 7's `audit_events` rows are linked correctly by `previous_hash` (bc909fea → 9f7c9f48 → 280efd42).
- So the failure is in the hash recomputation. The writer in `server/services/audit/signedAuditExport.ts:655` and the
  verifier in `server/routes/part11-compliance.ts` (~845-900) do not agree.
- A new client sees a tamper alarm from normal use.

## Flow 7: phone (390x844)

Shots: `w2-80-phone-*` (each with a `-tall` full-page copy). No screen had page-level horizontal scroll
(`overflowX 0`). Within screens:

| Screen | Result |
|---|---|
| Sign-in, home, account menu, Account panel, Subscription & features, Access requests, Usage, Rate limits | Fit |
| Admin console, Settings tab | **Broken.** The tab strip makes the page container 644 px wide inside a 390 px screen (`div.page 644>390`). Choosing "Settings" scrolls the whole page sideways, so the left half of every card is off-screen (`w2-80-phone-admin-settings.png`). Scrolled to the session policy card, the card is clipped: *"Save session polic…"*, *"No unsaved…"*, and a 66 px reason box (`w2-80-phone-admin-settings-session-policy.png`). Five settings cards are wider than their box (`txw-set-card` 458/335/364/384/395 > 324). |
| Admin console, Members drawer | Drawer content runs to x=752 ("Role scopes", "Project access") |
| Audit trail | "Export signed bundle" is cut off at the right edge. The HEAD hash squeezes the status text into a ~100 px column. The entries table is clipped (`ctable 679>356`) (`w2-80-phone-audit-trail.png`). |
| Subscription & billing | Plan cards scroll sideways in their own row. Growth is cut at the edge. The tier values are shown here too. |
| Feature switches | 36x20 px, below the 24 px minimum target height (WCAG 2.5.8) |
| API key form | Fits. Submit inside the viewport. |
| Feature-off dialog | Fits. Confirm inside the viewport. |

## What already exists (RULE 3), for the fixes proposed below

| Fix | Existing code it completes |
|---|---|
| Settings bounds | `reviewPolicyRefusal` in `server/routes/organizations-routes.ts:515` (P-117) already refuses out-of-bounds review rules on this door. The session policy needs the same. |
| Bare-body form | A comment in that handler says the bare body is kept but "no shipped caller uses it". |
| Recovery-code sign-in | `client/src/concept2cure/auth/ZenLogin.tsx:562-618` already has the recovery-code input and the "Use a recovery code" button. It is gated on `mfaMethods`, which `server/services/mfa-enrolment.ts` builds. |
| Per-key rate limit | Stored in `api_keys.rate_limit` and collected by `AdminApiKeyCreate.tsx`. `server/routes/public-api.ts:111-130` ignores it. |
| Module enforcement | `server/services/entitlements/enforcement-mode.ts` and `server/middleware/moduleEntitlementGate.ts` |
| Weekly caps | `PUT /api/billing/weekly-limits/:metric` in `server/routes/billing-dashboard.ts` (no screen reaches it) |
| Seats | `PUT /api/billing/seats` in `server/routes/billing-dashboard.ts:784`, and `server/services/seat-licensing.ts` |
| Trial / checkout | `POST /api/billing/dtc-checkout` in `server/routes/billing.ts:235` |
| Audit-event chain | Writer `server/services/audit/signedAuditExport.ts:655`. Verifier `server/routes/part11-compliance.ts` (chain-integrity). Screen `client/src/concept2cure/v2/surfaces/AuditEventChain.tsx`. |
| Settings doors | Second door `server/routes/tenant-config.ts:257/373`. Writer `server/services/tenant/tenant-settings-writer.ts`. |

## Findings

Ordered by severity. Each finding gives its evidence in this file's sections above, and in the structured result.

1. **SEC-01 (high, security).** The settings route stores session policy with no reason and out of bounds (99999,
   "abc", 0). The card then shows values that were not stored (2d).
2. **SEC-02 (high, dishonest-state).** `/api/tenant-config` stores `mfaRequired:false`, an IP allowlist and an
   8-character password policy with no reason. Nothing enforces any of them, and the screen says the opposite (2e).
3. **SEC-03 (high, broken).** A recovery code cannot be entered on the sign-in page, although Account promises it and
   the server accepts it (flow 4).
4. **LIC-01 (high, dishonest-state).** A feature "turned off" stays open by address and through its APIs (flow 5).
   Owner: the founder, on enforcement mode.
5. **AUD-01 (high, part11).** The audit trail screen and the signed export show settings changes without the field or
   before/after. PDF/A rows store `values:{}`. API key revocation records no reason (6b, 3, 6).
6. **AUD-02 (high, part11).** The audit-event chain reports "verification failed" after three signed exports in a new
   organisation (6b).
7. **LIC-02 (medium, security).** A client administrator raises its own purchased seats through `PUT
   /api/billing/seats` without payment. "Subscription & billing" then shows 50 while the limit stays 5 (flow 5).
8. **KEY-01 (medium, broken).** The per-key "Requests per minute" is collected and stored but not enforced (fixed 60)
   (flow 3).
9. **KEY-02 (medium, dishonest-state).** Each key use is counted twice. There is no per-use record, though the screen
   says "every use is audited" (flow 3).
10. **LIC-03 (medium, broken).** "Start 14-day trial" with no billing provider gives 500 *"Failed to create DTC
    checkout"* (flow 5).
11. **LIC-04 (medium, dishonest-state).** Plan card figures (1 user, 2 projects, 1 GB) contradict the organisation's
    record (5 / 10 / 5 GB). "Status: Incomplete" is shown on the free plan.
12. **PH-01 (medium, design).** Admin console at 390: the page shifts sideways and the Settings cards are clipped.
    Audit trail at 390: the export button and table are clipped. The Members drawer overflows.
13. **SSO-01 (medium, unreached).** A client administrator has nowhere to configure SSO. The SSO tab's only door leads
    to "Platform administrator required". Owner: the founder (who configures a client's IdP).
14. **LIC-05 (low, unreached).** Weekly caps are described as a client control, but no screen reaches the route.
15. **COPY-01 (low, copy).** Raw values and developer wording on screen:
    - "manager" (Account role)
    - "free / standard / professional / enterprise"
    - "Free — biotech"
    - "Tenant Settings Changed", `organization_settings:7`, `user:5`
    - "Stripe Checkout + Customer Portal"
    - "User quota exceeded"
    - The stale password error shown in the authenticator section
16. **UI-01 (low, broken).** The Roles tab makes a 403 call to `/api/admin/access/grants` on every opening for a
    client administrator. The Identity console makes four 403 calls.
17. **UI-02 (low, design).** "Admin controls" switches are shown to a member and refused on press.
18. **SES-01 (low, broken).** A session closed by the concurrent limit shows as a load failure on the next click
    rather than signing out.
19. **ONB-01 (low, design).** Self-serve sign-up refuses only at the last of four steps when e-mail is not configured.
    Owner: walk 1 / onboarding.
20. **A11Y-01 (low, a11y).** The feature switches are 36x20 px on the phone.
