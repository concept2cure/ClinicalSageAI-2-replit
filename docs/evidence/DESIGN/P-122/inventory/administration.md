# Inventory: Administration, client security settings, Licensing, Onboarding and the account

Investigated 2026-11-10 on `concept2cure-v2` at HEAD `25fe1790a` (14:51). Rechecked against HEAD `e5caee211`: the 19
commits between them touch the trial master file, the Vault and one registry entry (`etmf`), and nothing in this area.
The repository was only read. No server, test suite or typecheck was run.

Paths that begin `scratchpad/` are the investigating session's working files. They are not in the repository; what
this inventory takes from them is written out here. The restoration order is `administration-restoration-order.json`
beside this file. The decisions that govern the restorations are P-125 (`docs/LAUNCH_DEFINITION_OF_DONE.md`).

The clone is shallow. Its oldest commit is `892739bb7` (2026-10-22). Two older states were read through GitHub, not
locally:
- `UsageBilling.tsx` at `d39624627`;
- the commit `41c02467a` (2026-10-17).

Neither object exists in the local clone. A row that rests on them says so.

Four investigators wrote the rows (A: administration and security; B: licensing and billing; C: sign-up, onboarding
and the organisation; D: the account panel and data return). Two verifiers then re-checked 41 rows and folds against
the code. **41 were checked: 0 were dropped, 19 were corrected and 22 were confirmed.** The corrections are applied
below and marked "(corrected)". Rows the four investigators each wrote about the same capability are merged into one
row that carries every id, for example `A28 / D17`.

Production verdicts come from three files:
- `shared/constants/launch-scope.ts` (the launch shell surfaces);
- `server/services/entitlements/launch-scope-api.ts` (`LAUNCH_PLATFORM_API`, and `unmapped`, which production refuses
  with 403 `LAUNCH_SCOPE`);
- `server/services/entitlements/api-prefix-map.ts` (`NEVER_GATED`).

They also use the path claims in `shared/constants/ui-surface-registry*.ts`. For sign-up and onboarding, investigator
C ran the repo's own `launchScopeApiVerdict` in a scratch script (`scratchpad/p122-admin/verdict.ts`). No live request
was made.

## In short

1. **Little in this area was deleted. The losses are reach and truth.** Four commits moved things:
   - **The Setup fold** (`f83fcce03`, `beede0408`) put the organisation's profile, session policy, gateway accounts,
     retention, legal holds, company documents and (later) the GAMP 5 validation kit on Admin and access → Settings.
     Settings is a tab that does not open by default. Its cards are 12 stacked in one column, and the company card
     was measured 9,193 px down.
   - **The Part 11 console fold** (`66efa6179`) reached parity on Audit trail.
   - **The AdminConsole delete** (`16791c326`) removed a screen no customer had seen since July.
   - **Slice 0** (`a40acd714`) removed buttons that only typed a sentence to AnA.
2. **The Admin screen shows things the server never recorded.** Under P-122 the repair is to make them true:
   - SSO "connected" reads a flag that no code writes. An organisation admin can set it through the settings door
     with no identity provider configured.
   - SCIM "Attrs synced 0" and "Last event —" are constants.
   - Every member reads SSO "local", Groups "—" and project access "all projects".
   - The API key "Rotate in" column is always blank.
   - Licensing's "Seats" is `seats_purchased || 5`.
3. **Security policy a regulated customer expects to set is not theirs to set:**
   - SAML, SCIM tokens and the SCIM IP allowlist are platform-staff only.
   - "Require an authenticator app", password policy and a sign-in IP allowlist were stored and enforced by nothing.
     Lane S2 now refuses them in plain words.

   Whether to make them true is founder question 1 in S2.
4. **Data return has never had a screen, and production refuses it.** These routes are unmapped:
   - `GET /api/tenant-export/full`;
   - the P-58 custody signature (`/api/tenant-export/custody`).

   Lane L9 adds a caller for `/full` but no registry claim, so as written production would still refuse it.
5. **Some audit capability is a small wire job, not a build.** `GET /api/audit/export/signed` already filters by
   person, date, event type and record. The Audit trail sends no filter. "Export one member's activity as a signed
   record", asked for in October, is a client change.
6. **None of the folds has a test that opens the target in the running app.** Each fold is proven by a jsdom render
   or a source and registry check.
7. **Lanes in flight cover part of this area:**
   - S2: settings doors;
   - S3: invitations and key revocation;
   - S1a, S1b and S1c: agreements, billing writes and module requests;
   - U2: licensing;
   - U3: sign-in and account;
   - U4: organisation switch;
   - O: onboarding;
   - L5: audit reads;
   - L9: data return;
   - G: audit read-back;
   - X: SCIM consent;
   - P-119 slice 2: job roles.

   Their changes are in `stash@{0}` or their working trees. None of them is at HEAD, except S1a (`e44b0c0b8`).
   **Finding lane U1-admin-console has no fix report.** Its findings are in no running lane: the invented SSO values,
   the revocation reason, the 50-key cap, the invented project grant and the platform panel on a client's Roles tab.

---

## What already exists

- **The 2026-11-10 walk and audit.** Two walks and seven audits of client administration found 162 findings. All
  results by agent: `scratchpad/results/admin-all.json`. Finding ids in this file (W1-, ADM-, HS-, CA-, SEC-, IAM-ADM-,
  R1-ADM-, KEY-, LIC-, AUD-) are from there.
- **The fix lanes.** The findings grouped into lanes: `scratchpad/lanes/*.json`. These lanes have a fix report in
  `scratchpad/fixres/`, which is what this file read:

  | Lane | Fix report |
  |---|---|
  | G-audit-readback | `fix-G-audit-readback.json` |
  | O-onboarding | `fix-O-onboarding.json` |
  | S1a-agreements | `fix-S1a-agreements.json` |
  | S1b-billing-writes | `fix-S1b-billing-writes.json` |
  | S1c-module-requests | `fix-S1c-module-requests.json` |
  | S2-settings-doors | `fix-S2-settings-doors.json` |
  | S3-invitations | `fix-S3-invitations.json` |
  | U2-licensing | `fix-U2-licensing.json` |
  | U3-sign-in | `fix-U3-sign-in-and-account.json` |
  | U4-org-switch | `fix-U4-org-switch.json` |
  | X-scim-sso-identity | `fix-X-scim-consent.json` |
  | U1-admin-console | **none** |

  The audit-read and data-return lanes have reports too: `fix-L5-part11-reads.json` and `fix-L9-data-return.json`.
- **The founder questions those lanes raised.** They decide several rows below:
  - S2 Q1: enforce MFA-required, IP rules and password policy?
  - S2 Q2: may a client configure its own SAML and SCIM?
  - S2 Q3: should audit-trail retention be an organisation setting?
  - U2 Q1–Q5: free-plan limits, self-service seats, metering credits, Enterprise features, which seat number is the
    contract limit;
  - S1a: does the EULA get a screen and its tables?
  - S1b: keep or retire budgets?
  - L9: must a full export give a reason, and is the export digest's date canonicalisation fixed before GA?
  - O: does the ten-step wizard stay open to every member?
  - X: switching on module enforcement.
- **P-119 slice 2.** Job roles in Administration replace the empty Groups column. Slice 3, planned: a member sees
  their own job roles in Account (`docs/design/CLIENT_TYPE_JOB_ROLES_2026-11-10.md`).
- **The fold records:**
  - `docs/evidence/D2-ONE-ANA/2026-10-29/fold-setup/README.md` (parity table; two things "handed on");
  - `docs/evidence/D2-ONE-ANA/2026-10-29/fold-billing/README.md`.
- **The other four inventories touch this area.** `vault-authoring-submission.md` §2.6 covers the audit trail's
  200-row read and the Part 11 signature routes. `shell-projects.md` covers Home and `/api/tenant-stats`.
- **Working notes for this file:** `scratchpad/p122-admin/` (A-, B-, C- and D-*-notes.md, `route-scan.txt`, the
  before copies of `AdminSurfaces.tsx` and `UsageBilling.tsx`).

---

## 1. Folds and reshapings in this area

| Date | Commit | What moved | What was lost | Test that proves the target |
|---|---|---|---|---|
| 2026-10-17 | `41c02467a` (read through GitHub; not in the local clone) | **Billing:** UsageBilling lost its credit balance, "Buy more", the auto-reload switch and the per-category credits card. Licensing's "Contact sales" became "Ask AnA about Enterprise". **Part 11 console:** the compliance-status and SOC 2 controls grid was deleted, with `GET /compliance-status`, `GET /soc2/controls` and `POST /soc2/evidence` on the server. **Setup:** the Translation card was deleted ("saved a setting nothing reads"). (corrected: the verifier found the Part 11 and Translation removals) | **Credits:** debitCredits has no caller, so the balance was never a meter. That makes it an invented figure, and P-122 repairs those by metering. **Compliance status and SOC 2 grid:** gone from both client and server; this inventory did not read the deleted handlers to judge whether they were true. **Translation card:** an invented setting. | none (removals) |
| 2026-10-23 | `c50f8810e` | The module catalogue (Apps) became `WorkflowCatalog.tsx`, "Subscription & features". | Each area's features now sit in a closed "Features and steps (N)". "Additional capabilities" and Platform services are closed too, and open only with "Admin controls" on or a search. | `workflowDiscovery.test.tsx` (line 153 pins the areas **closed**) |
| 2026-10-25 | `d97388005`, `507f5d091` | The catalogue left the rail for the account menu ("Plan & features", later "Subscription & features"). The first-run welcome moved into Home's empty project list. | **Members:** lost the rail door to the catalogue. **Organisations with one or more projects:** no longer see "Discover and set up my workspace" or "Upload a document to start" on Home. **Not verified in depth:** the verifier checked only the commits' existence for the catalogue half. | `railPiecesRehomed.test.tsx` (proves the narrowing, not parity); `homeStartHere.test.tsx`; `shellNav.test.tsx` |
| 2026-10-26 | `a40acd714` | Removed five buttons that only typed a sentence to AnA: "Audit a member", "Grant access", "Audit activity", "Edit scopes", "Change setting". "Audit activity" now opens Audit trail searched for the member. (corrected: the role button was "Edit scopes") | No working capability. Two asks were left unmet. Per-member project access from the admin record is not built. **A per-member signed export is built on the server** (`/api/audit/export/signed?user_id=…&start_date=…`) and only the client wiring is missing. (corrected) | `adminAccessNoDeadActions.test.tsx` (jsdom) |
| 2026-10-26 | `48e1cad80` | Organisation switching logic moved into `switchOrganization.ts`, shared by Account and the rail foot. | Nothing on screen. Two inboxes and two switchers remain (R1-ADM-09). | `organizationAccessOwnership.test.tsx`, `organizationSwitcher.test.tsx` (jsdom) |
| 2026-10-29 | `66efa6179` | Part11Console "Audit hash-chain integrity" → Audit trail's ledger banner and AuditEventChainBanner, under the header. | Nothing of substance. Audit trail is not on the rail. Its verdict reported false breaks (AUD-02). Lane G fixes that; the fix is not at HEAD. | `auditTrailEventChainVerdict.test.tsx` (jsdom); `foldPart11Console.test.ts` (source) |
| 2026-10-29 | `f83fcce03`, `beede0408` | Setup (its own screen, opening on "Profile & client type") → Admin and access → Settings, the 6th tab. `setup` aliases there. | **No control, but reach.** The default tab is Members. The cards are 1–12 of one column, and everything after the Profile card is below 900 px. The company card is 9,193 px down (W1-07). Two items were "handed on" and are reached nowhere at HEAD: choosing the gateway at Submit's first transmit, and "Place legal hold" in the Vault. | `adminConsoleSettings.test.tsx`, `adminSettingsClientTypeGoverned.test.tsx`, `adminSettingsRetentionPeriod.test.tsx`, `adminLegalHolds.test.tsx` (jsdom); `foldSetup.test.ts` (source) |
| 2026-10-29 | `16791c326` | Deleted AdminConsole, unmounted since `af973c5e8` (2026-07-27, outside the clone). Where its parts went: the GAMP 5 kit → ValidationKitCard (the last Settings card); grants → Roles tab; keys → API keys tab; modules → Subscription & features; session policy → Settings. | **Statements:** the "Compliance & validation" statements: SIEM export "Live", chain integrity, e-signatures, "Data residency … Single region". **Catalogue cards:** MFA policy, IP allowlist, Session policy and Audit to SIEM (labelled a catalogue, not a readout). **Not a successor:** Settings now has a different "Data residency" select, on the AI data use card, which governs where AI runs, not the deployment region (corrected). The deletion is `16791c326` itself; `4fa3184ab` is a merge. | `validationKitCard.test.tsx` (jsdom; its "where reached" case is a source check) |
| 2026-10-29 | `9c2fdec74`, `fc629866a`, `d140aefa5` | **Invoices:** moved under Licensing's plan status, for billing administrators. **Checkout and portal:** billing administrators only, by a server role gate. **Rate limits:** the invented per-tier grid was replaced by the limits actually enforced. | **Members:** lose invoices, checkout and the portal by permission, not by hiding. **Per-tier comparison:** no longer shown; it was invented. | `licensingInvoices.test.tsx`, `licensingBillingControls.test.tsx`, `foldBilling.test.ts`, `usageRateLimits.test.tsx`, and server gate tests |
| 2026-11-10 | `8a65a6f3a` | Sign-up fields split into `auth/SignupFields.tsx` (typing fixed). | The "AI Model Improvement" switch, which was never sent or stored. The privacy text on the same step still describes the opt-in (`ZenSignup.tsx:836`). Settings' "AI data use" card is an organisation placement policy, not this choice (corrected). | none for the data-use choice |

---

## 2. Capabilities removed, hidden, invented or never reached

Columns:
There are 66 rows in tables A to J, and merged ids count once:
- 23 hidden;
- 21 never reached;
- 15 invented;
- 6 removed;
- 1 refused.

Table K holds 9 kept-and-visible rows, which cover 43 source ids.

- **Kind:** removed, hidden, invented, never reached, or refused (reached, but the server refuses a client admin).
- **Prod:** yes (admitted), no (refused), or n/a (client only).
- **Lane:** the lane already restoring it, or "none".

### A. Members, invitations, access levels and job roles

| # | Kind | Capability | Before | Now | Server | Prod | Value | Size | Lane |
|---|---|---|---|---|---|---|---|---|---|
| A5 | invented | See each member's job roles beside their access level | never had a value | The "Groups" column is always "—" (`mdx-admin.ts:188`, `groups: []`). Job roles live only in Quality's training views. | `mdx-qms-training.ts:328-359` `/api/mdx/qms/job-roles` | not verified | MED | M | P-119 slice 2 |
| A6 | invented | See which members sign in through our identity provider | never had a value | Every member reads "local" (`mdx-admin.ts:189`, `sso: ''`). | client only. Whether any store records SAML sign-ins is not verified. | n/a | MED | M | none (U1, no report) |
| A7 | invented | See and grant a member's project access from their admin record | `a40acd714^` "Grant access" (an AnA sentence) | The drawer's "Project access" is a made-up "all projects" row (`mdx-admin.ts:212-217`). Real sharing is per project (ProjectTeamSharing). | client only for the drawer | not verified | MED | M | none (U1) |
| A8 | removed (corrected) | Read one member's activity and export it as a signed record | `a40acd714^` "Audit activity … Export as Part 11 PDF" (an AnA sentence) | "Audit activity" opens Audit trail searched by name. The signed export the screen calls has no filter (`AdminSurfaces.tsx:158`). | `audit-trail-routes.ts:683-700` GET `/api/audit/export/signed` **already takes `user_id`, `start_date`, `end_date`** | yes (`/api/audit` never-gated) | MED | **S** (corrected from M) | none |
| A9 | hidden | Understand the six access levels and what each may do | `a40acd714^` role cards | Roles tab (not default). It lists only the roles someone holds (`mdx-admin.ts:201-209`), and shows scopes as developer strings (CA-06). | `mdx-admin.ts` | yes | MED | S | none |
| A10 | invented in place | (Client admin) a platform-staff panel on the Roles tab | AdminConsole "Access & personnel" (unmounted) | AdminPlatformGrants shows "Platform access is restricted" to every client admin (D-6, UI-01). | `admin/access-management.ts` (platform-gated) | yes | LOW | S | none (U1) |
| C15 | invented (corrected) | Invite colleagues during set-up by their real name | `892739bb7` wizard step "Invite personnel" (e-mail and role) | **Wizard:** still derives the name from the e-mail (`Onboarding.tsx:119-126`, e.g. "j.smith"). That becomes the printed name, which no screen can correct (C24). **Admin and access:** the invite form takes the typed name, title and department (`AdminAccess.tsx:238`), so only the wizard is wrong (corrected). | `tenant-users.ts:375` POST `/api/tenant-users` | yes | HIGH | S | O-onboarding (ADM-10, HS-12); S3 |
| C23 | never reached | See, withdraw and expire an invitation sent to someone who already has an account | never had a screen | The existing-account path stores a pending invitation and returns 202 (`tenant-users.ts:506-518`). Members does not list it, nothing withdraws it, and it never expires (W1-19). | `tenant-users.ts`; `organization_invitations` | yes | HIGH | M | S3 (server withdraw and 21-day expiry; the Members listing is still open) |

### B. Single sign-on, SCIM and sign-in security policy

| # | Kind | Capability | Before | Now | Server | Prod | Value | Size | Lane |
|---|---|---|---|---|---|---|---|---|---|
| A11 | invented (corrected) | See whether our SSO and SCIM are working: provider, status, users, last sync | AdminConsole SSO & SCIM description cards (unmounted) | **SSO tab (not default):** shows "Configured IdP / connected" when `security.ssoEnabled` is true. No code writes that flag, but `PATCH /api/organizations/:id/settings` overlays any body (`organizations-routes.ts:515-560`), so **an org admin can assert "connected" with no identity provider** (corrected). **Fallback, Proposed and SCIM figures:** "Local users / real-time", "None staged", "Attrs synced 0" and "Last event —" are literals (`mdx-admin.ts:382-386`). **Real configuration:** `SAML_TENANTS` (`sso.ts:77`) and `scim_tenants`. | `mdx-admin.ts:303-389` | yes | HIGH | M | none (U1, no report) |
| A12 | never reached | Set up our own SAML single sign-on | AdminConsole: "configured through the platform admin APIs, not from this page" | Nothing for a client admin. Configuration is the deployment's `SAML_TENANTS`. | `sso.ts:296-785` `/api/auth/sso/*` | yes | HIGH | L | S2 removes the Settings door; S2 founder Q2 |
| A13 | refused (corrected from "never reached") | Create, rotate and revoke our SCIM token; restrict SCIM to our IdP's addresses | AdminConsole description cards | **IdentityConsole.tsx:** has working controls with reasons. **Its doors:** the SSO tab and onboarding step 7 (`OnboardingSecurity.tsx:66`). **The refusal:** `requirePlatformAdmin` refuses a client admin ("not a platform administrator"). | `admin/scim-tenants.ts:92-114`; `admin/scim-ip-allowlist.ts:60-126`; `/scim/v2/*` | yes | HIGH | L | S2 (Settings door); X (SCIM consent); S2 founder Q2. The onboarding door is not changed (ADM-06). |
| A14 | never reached (corrected from "invented") | Require every member to use an authenticator app, not an emailed code | AdminConsole catalogue card "MFA policy — Require TOTP…", labelled "not a readout of this organization's configuration" (unmounted) | Settings row "Second factor at sign-in: Required for every member". **This is true:** every password sign-in is challenged, by app or e-mailed code (`mdx-admin.ts:339-356`). Requiring the app specifically was never built. The key `mfaRequired` was writable and read by nothing. | `organizations-routes.ts:515`; `tenant-config.ts:257,373` | yes | HIGH | L | S2 refuses the key; S2 founder Q1 |
| A17 | invented | Set our password policy | never had a screen | `passwordPolicy` was writable and enforced by nothing. | same doors | yes | MED | L | S2 refuses it; founder Q1 |
| A18 | invented | Restrict sign-in to our corporate IP ranges | AdminConsole catalogue card "IP allowlist" (a description) | `ipRestrictions` was writable and enforced by nothing. Only the SCIM allowlist exists, and it is platform-only (A13). | same doors | yes | MED | L | S2 refuses it; founder Q1 |
| D5 | hidden (corrected from "never reached") | Sign in with a recovery code when my phone is lost | `Concept2CureLogin.tsx` and `ZenLogin.tsx` already had the branch | **What works:** both screens have "Use a recovery code", and the SSO hand-off offers it (`Concept2CureLogin.tsx:233`). **Where it is missing:** password sign-in never offers it, because `mfa-enrolment.ts:51` lists one factor only (SEC-03). | `auth.ts:1888` `/api/auth/mfa/verify` accepts backup codes | yes | HIGH | S | U3 (SEC-03; not at HEAD) |
| A16 / C12 | hidden | Set idle sign-out and the concurrent-session limit, with a reason | Setup, 3rd card | Settings → SessionPolicySetting, 2nd card, below the fold on a non-default tab. Also on onboarding step 7. | `organizations-routes.ts:388,515` | yes | HIGH | S | S2 (SEC-01 server bounds and reason) |

### C. API keys

| # | Kind | Capability | Before | Now | Server | Prod | Value | Size | Lane |
|---|---|---|---|---|---|---|---|---|---|
| A19 | hidden, partly untrue | Create a scoped, expiring, rate-limited key; see its usage; revoke it | AdminAccess API keys tab | **API keys tab (not default):** create, usage and revoke all work. **What is wrong:** revoking asks no reason (ADM-08, HS-05); the list is cut at 50 **before** revoked keys are dropped (`mdx-admin.ts:230-262`, HS-04); uses are counted twice (KEY-02). | `api-keys.ts:123,180,203,259` | yes | HIGH | S | S1b (rate limit enforced); S3 (keys revoked on removal). Reason and cap: none (U1). |
| A20 | invented | Know when a key is due for rotation, and rotate it | an AnA sentence, "Stage a new key, dual-publish for 24h" (before the window) | The column "Rotate in" is always "—" (`mdx-admin.ts:261`). No rotation policy or endpoint exists. | client only | n/a | MED | L | none |

### D. Organisation settings (Admin and access → Settings)

Every row here is on a tab that does not open by default (`AdminAccess.tsx:263` opens Members). The order is from
`AdminSettings.tsx:68-93`. "Below the fold" is judged from the card order and CSS, except the company card, which the
walk measured.

| # | Kind | Capability | Before | Now | Server | Prod | Value | Size | Lane |
|---|---|---|---|---|---|---|---|---|---|
| A22 / C17 | hidden | Rename the organisation and set its client type, under a reason | Setup: the first card of its own screen | Settings card 1 (OrganizationProfileCard) | `organizations-routes.ts:302`; `/api/mdx/industry-profile` | yes | HIGH | S | S2 (W1-08, ADM-09) |
| A23 | hidden | Set reviewers per approval, and self-approval for a one-person organisation | never had a screen before `d275af898` | Card 3, ReviewPolicySetting | `/api/organizations/:id/settings` | yes | MED | S | none |
| A24 / C13 | hidden | Choose whose agency gateway account our submissions go out under | Setup card 2 | **Settings:** card 4, and onboarding's Agency accounts step. **Submit:** at the first transmit it only says "An administrator adds them under Gateway accounts" (`SubmissionSeqWorkspaces.tsx:1892`). The fold handed this on and it is not done. The wizard's note still names "Admin, Setup". | `/api/gateway-accounts` | yes | HIGH | S | O (CA-10 wording only) |
| A25 | hidden | Store our connector and model-provider credentials | added `e6a7c391c` | Card 5, "Credential vault" | `/api/deep-research/connectors` | yes | MED | S | none |
| A26 | hidden | Govern where our data may be processed by AI (incl. a "Data residency" select) | added 2026-11-06 | Card 6 | `/api/ai-placement-policy` | yes | MED | S | none |
| A27 | hidden | Require PDF/A for production submissions | Setup card | Card 7 | `/api/organizations/:id/settings` | yes | MED | S | S2 |
| A28 / D17 / D18 | hidden | Set the records retention period; place and lift legal holds | Setup cards 5 and 6 of 7 | **Settings:** cards 8 and 9. **Vault:** shows an active hold but offers no "Place legal hold" (handed on, not done). **Managers:** may place holds on the server (`vault-legal-holds.ts:31`), but the Admin menu entry is for administrators and owners only (`orgAdmin.ts`), so a manager has no door. | `/api/vault/legal-holds`, `/retention` | yes | HIGH | S | S2 (retention bounds); holds: none |
| A29 | hidden | Turn the Claude connector on or off | AdminAccess Settings, 2nd under the rows | Card 10 | `tenant-config.ts:478,504` | yes | LOW | S | none |
| A30 / C8 | hidden (corrected) | Record our company identity, letterhead and legal documents; Home's "Record your company details" takes me there | Setup's last card; Home's step opened Settings, which then held only the rows and this card | **Settings:** card 11, measured 9,193 px down (W1-07). **Home's step:** opens Settings at its top. **Account:** the same component also sits behind the closed disclosure "Open company documents" (`CompanyDocumentsAccountSection.tsx`) (corrected). | `/api/client-branding/company-documents` | yes | HIGH | S | O (W1-07: HomeSetup passes the section; the scroll is handed to another lane) |
| A31 | hidden | Download the vendor's GAMP 5 validation package (IQ/OQ/PQ) | `16791c326^` AdminConsole "GAMP 5 validation package", per-document downloads (unmounted since July) | Card 12, the last. Each document has its status, and every download is recorded. | `validation-kit.ts:139,154` | yes | HIGH | S | U2 (copy only) |
| C6 | never reached | See and change our default markets, filing pathways and approval rigour | never had a screen; sign-up seeds markets and pathways | Nothing. The Profile card shows only the name and client type. | `mdx-industry-context.ts:91-96` PATCH `/api/mdx/industry-profile` accepts them, with a reason | yes | MED | M | none |
| A40 | removed (invented) | Choose a translation setting for the organisation | Setup "Translation" card (before `41c02467a`, read through GitHub) | Nothing. The commit says it "saved a setting nothing reads". | none | n/a | LOW | L | none |
| — | invented | Keep our audit trail N years | never had a screen | `qmp.auditTrailRetentionDays` was stored and audited, with tier defaults of 365 or 3650 days, and applied by nothing. The archive keeps a fixed 24-month hot window. | `tenant-config.ts:149,205` | yes | MED | L | S2 refuses it; S2 founder Q3 |

### E. Audit trail administration and compliance

| # | Kind | Capability | Before | Now | Server | Prod | Value | Size | Lane |
|---|---|---|---|---|---|---|---|---|---|
| A36 | hidden (corrected) | Read the whole audit trail, filter it by date or person, and export a filtered signed extract | never more than the newest 200 | **Audit trail:** the newest 200, with a kind filter and a search over what is loaded. There is no paging and no date range. **The signed export:** the server already filters by `start_date`, `end_date`, `user_id`, `event_type`, `resource_type` and `record_ids` (`audit-trail-routes.ts:688-700`; the Vault already calls it filtered), but the Audit trail sends none of them (corrected). | `audit-trail-ledger.routes.ts:742-751` (max 1000); `/api/audit/logs`, `/api/audit/export` (no caller) | yes | HIGH | **S** for the filtered extract; **M** for paging past 1,000 | L5 (reads 1,000 and says when full) |
| A32 / D23 | removed (from a screen no customer could open) (corrected) | Know the platform's compliance posture: SIEM export, chain integrity, e-signatures, residency | `16791c326^` AdminConsole "Compliance & validation" | **Chain integrity:** on Audit trail (A35). **The SIEM feed:** named on no screen. **The deployment residency statement:** gone. Settings' "Data residency" select is about AI placement, not this (corrected). | `admin/audit-siem.ts:109,172` (admin and compliance officer; session only) | yes | MED | S to name; L for key access | none (R1-ADM-13 in S1c, not fixed) |
| A39 | removed | See the Part 11 compliance status and the SOC 2 controls, with evidence | Part11Console compliance-status and SOC 2 grid (before `41c02467a`, read through GitHub) | Nothing. The server routes were deleted in the same commit. | none at HEAD | n/a | MED | L | none. Not verified whether the grid was true. |

### F. Licensing, plans, seats, usage, invoices and module requests

| # | Kind | Capability | Before | Now | Server | Prod | Value | Size | Lane |
|---|---|---|---|---|---|---|---|---|---|
| B2 | invented | See seats bought and seats used | Licensing "Seats" (since July) | **Licensing:** shows `org.seats_purchased \|\| 5` (`billing.ts:721`), while seat licensing treats null as unlimited. **Subscription & features:** shows a second, unreconciled "Seats". The seats-used read has no caller. | `billing-dashboard.ts:771` GET `/api/billing/seats` (purchased, used, pending, available) | yes | HIGH | S | U2 (R1-ADM-02, HS-01); U2 founder Q5 (which number is the contract limit) |
| B3 | never reached | See that our subscription will cancel at the period end | never had a screen | Licensing renders "Renews <date>" even when `/status` returns `cancelAtPeriodEnd`. | `billing.ts` GET `/api/billing/status` | yes | MED | S | none |
| B7 | invented | Compare what each plan includes | Plan cards: users, projects, storage, deep-research and builder credits, AI tokens per user | **Unchanged at HEAD.** Credits and tokens are metered by nothing. Self-service checkout sends no seat count. The catalogue is a client fixture, held three times. | `/api/billing/pricing`, `/dtc-pricing` (no caller) | n/a | HIGH | L | **U2 is removing the credits and user lines without a Founder-Decision.** P-122 §2 requires one. U2 founder Q2–Q3. |
| B8 | removed (invented) | See the credit balance, top it up, turn auto-reload on or off | `d39624627` (GitHub): "Current balance", "Buy more", "Auto-reload … Turn on/off" under a reason | Nothing. Nothing debits the ledger. | `billing-dashboard.ts:896,924` | yes | MED | L | none (U2 notFixed R1-ADM-12) |
| B9 | removed (corrected) | See credits by category | an empty card. Its words survive only in a deletion comment (`9c2fdec74^:UsageBilling.tsx:29-36`); the cited commit is not in the clone (corrected) | Nothing | client only | n/a | LOW | L | none |
| B26 | invented (corrected from "removed") | Refer a colleague and earn credits | a card with a "Copy link" that did nothing; there is no referral programme (`9c2fdec74^` comment) | Nothing | none | n/a | LOW | L | none. **Do not restore** unless a programme is decided. |
| B12 / B13 | never reached | See our weekly limits and this week's accrued overage | never had a screen. Licensing still promises "overage caps you set yourself" (`LicensingSurface.tsx:579-581`). | Only the read-only usage bars. | `billing-dashboard.ts:746,759,807` | yes | MED | M | S1b (writes are platform-only); U2 removes the promise. The read is in no lane. |
| B14 | never reached | See billing alerts at 80% or 100% of a limit and acknowledge them | never had a screen | Nothing. `weekly-usage-limits.ts:413` writes real alert rows that no one sees. | `billing-dashboard.ts:443,492` | yes | MED | M | S1b (the acknowledge write is governed); no screen |
| B15 | never reached | Set a monthly budget | never | Nothing | `billing-dashboard.ts:316,377` | yes | LOW | L | S1b founder question (keep or retire) |
| B16 | never reached | See usage by model, the period summary and billing activity | a BillingDashboard deleted 2026-04-28 (founder directive, outside the window) | Nothing | `billing-dashboard.ts:85,163,641,880` | yes | MED | M | none (U2 calls it a product decision) |
| B17 | hidden | See what our subscription includes, feature by feature, and why a feature is locked | `c50f8810e^` Apps: every group open; Platform services for everyone | Each area's features sit in a closed `<details>`. A test pins them closed. | `module-subscriptions.ts` `/catalog`, `/license` | yes | MED | S | none |
| B19 | hidden | Turn a feature on or off | switches after "Admin controls" | Behind "Admin controls", and inside the closed areas | `module-subscriptions.ts` PUT `/:moduleId/toggle` | yes | MED | S | none (UI-02, A11Y-01 unassigned) |
| B22 | never reached | See which modules our plan entitles us to, as the API decides | never | Screens read license-manager, while the API gate reads the entitlements resolver, so a screen can offer what the API refuses. | GET `/api/billing/capabilities`; `/api/licensing/entitlements` | yes | MED | L | none (R1-ADM-11, three resolvers, unowned) |
| B23 | never reached (corrected) | Accept the versioned licence agreement, and see what we accepted and when | **Sign-up** records three acceptances with their text revision (`auth.ts:944-945`) (corrected) | The versioned EULA service and "see what we accepted" have no screen. Its middleware is mounted nowhere, and its tables are on no applier. | `licensing.ts:127-192` | yes (answers 503 without tables) | HIGH | L | S1a, **at HEAD** (`e44b0c0b8`): fails closed; publishing is platform-only. The screen is a founder question. |

### G. Sign-up and onboarding

| # | Kind | Capability | Before | Now | Server | Prod | Value | Size | Lane |
|---|---|---|---|---|---|---|---|---|---|
| C3 | invented | Choose at sign-up whether our data may improve the AI | `8a65a6f3a^` switch "AI Model Improvement", local state only | Removed. The privacy text still describes the opt-in. No server field exists. | none | n/a | MED | L | none (agreement text handed to founder and counsel, D9) |
| C4 | invented | Pick a plan at sign-up and have it start | the sign-up "plan" step | **The step:** still there. **In production:** sign-up goes to "verify" before the checkout branch (`ZenSignup.tsx:366-369`). The chosen plan is never recorded or started. | `/api/billing/dtc-checkout` | yes | MED | L | U3 (says plainly it was not started; does not record it) |
| C9 | hidden | On Home, start set-up from AnA, discovery or a document | `d97388005^` welcome under the composer for every organisation | Shown only while the organisation has no project. `welcome.greeting` is built and rendered nowhere. | client only | n/a | LOW | S | none |
| C16 | hidden | Set up from a document: AnA reads it, I approve what it found | the Home starter for everyone | `OnboardingIngest.tsx` is intact. It is reached only from Home while there are no projects, by AnA or by URL. Neither the menu nor the wizard links to it. | `onboarding-proposals.ts:104,185` | yes | MED | S | O (copy only); reach: none |
| C10 / C11 / C13 / C14 | hidden by position | The ten-step workspace wizard, discovery, agency accounts and activation | the same ten steps | Unchanged. Reached from the account menu "Set up a workspace" and the Home starter. | `/api/onboarding/discovery` and others | yes | MED | S | O (founder question D-4 on its lifetime) |

### H. The account panel (each member)

| # | Kind | Capability | Before | Now | Server | Prod | Value | Size | Lane |
|---|---|---|---|---|---|---|---|---|---|
| D3 | hidden (corrected) | Change my password | `c04ed02be` "Password", higher in the drawer | **Position:** the second-to-last block, after Profile, Invitations, the switcher, Reporting role, and two closed disclosures (23 alert categories; company documents) (corrected: the alert rows are collapsed). **Fold:** probably below the drawer's first view; not measured. | `auth.ts:2747` | yes | HIGH | S | none |
| D4 | hidden | Set up or remove my authenticator; keep my recovery codes | `c04ed02be` "Authenticator app" | The last block of the drawer, beyond 900 px even with the disclosures closed. There is no regenerate or count route. | `auth.ts:2192,2270,2350` | yes | HIGH | S | U3 (one refusal at a time) |
| D6 | never reached | Sign out of every other session after losing a laptop | never had a screen | `authService.logout(true)` exists and no caller passes true. | `auth.ts:1451` POST `/api/auth/logout` `terminateAllSessions` | yes | MED | S | none |
| C24 / D2 | never reached | Correct my own name (printed on my e-signatures), or have my admin correct it | never had a screen | **Account:** Name is read-only, by design, because the route writes no audit row. **Admin:** the member edit changes the role only. | `users.ts:217` PATCH `/api/users/me` (unaudited) | yes | HIGH | L | none (O stops new guessed names only) |
| D8 | never reached | Set my time zone and quiet hours | never | **Today:** nothing. **Already read:** the server reads the time zone for review due dates (`review-route-rules.ts:141`), so every due date ends at midnight UTC. **Would be untrue:** e-mail toggles, because e-mail alerts are not sent. | `users.ts:582,647` `/api/users/me/notifications` | yes | MED | M | none |
| D9 | never reached | Change the language after signing in | sign-in pages only | No v2 file uses `useTranslation`. | `users.ts` PATCH `/me` | yes | LOW | L | none (founder decision) |
| D11 | never reached | See my own job roles in Account | never | Read only on Quality | `/api/mdx/qms/job-roles` | not verified | MED | M | P-119 slice 3 (planned) |

### I. Data return, retention and closure

| # | Kind | Capability | Before | Now | Server | Prod | Value | Size | Lane |
|---|---|---|---|---|---|---|---|---|---|
| A38 / D14 | never reached | Export all our organisation's data | never had a screen | Nothing at HEAD. L9 adds a "Your organisation's data" section below the attestation on Audit & compliance reports, with a reason. | `tenant-export.ts:191` GET `/full` (owner or admin); `:127` GET `/` (older dump) | **no**: unmapped; only `/attestation` is claimed (`ui-surface-registry.ui-v2.ts:845`) | HIGH | M | L9, **which adds no registry claim**, so production would still refuse it. Admitting it is a decision. |
| D15 | never reached | Sign that we received our export and take custody (P-58) before closure | never | Nothing. Without it, the purge of an organisation holding signed records is refused, so offboarding cannot finish. | `tenant-export.ts:371,387` GET/POST `/custody` (signed act) | **no**: unmapped | HIGH | M | none |
| D16 | never reached | Ask to close our organisation, or cancel a closure | never | Platform staff only | `tenants-simple.ts:348,406,449` (requirePlatformAdmin) | admitted, but refused to customers | MED | L | none (founder decision) |
| D24 | never reached | Download my own personal data (GDPR) | never | Nothing. Erasure answers 410 and points to AnA's `erase_personal_data`. | `global-compliance.ts:431` | **no**: unmapped | MED | L | none (scope decision) |
| — | invented | Per-document-type retention policies and a retention sweep | never | `/api/retention/*` always answers 503 "temporarily disabled" | `ana-ri-inline-routes.ts:125-155` | **no** | LOW | L | none. The real controls are A28. |

### J. Client workspaces for a CRO or consultancy

| # | Kind | Capability | Before | Now | Server | Prod | Value | Size | Lane |
|---|---|---|---|---|---|---|---|---|---|
| C25 | never reached (corrected) | Create and manage a workspace per sponsor, and put projects in it | never in the window | **New project:** requires a "Client workspace" and tells a CRO to "Contact your organization administrator" (`Projects.tsx:740-751`). **Administrator:** has no screen. **CroPortfolio's "Onboard a sponsor":** writes a different store (`cro_clients`) and is locked in production (corrected). | `clients-routes.ts:293,501,857,993,1107` on `client_workspaces`; `organizations-routes.ts:234` | yes for `/api/clients` | HIGH for CROs | M | none. Which of the two sponsor stores is canonical is a founder question (Rule 3). |
| C26 / C27 | hidden (locked) | Sponsor portfolio; a sponsor's read-only portal | `892739bb7` screens | Present, with no entry point, and refused in production | `/api/cro-portfolio`, `/api/cro/clients`, `/api/client-portal/overview` | **no** | MED / LOW | L | none (P-122 §4: founder) |

### K. Checked and kept visible

These were checked and need no restoration. They are listed so the picture is whole.

| # | Capability | Where at HEAD | Note |
|---|---|---|---|
| A1 | Who is in my organisation | Members tab (default) | The design audits D-1 and W1-23 asked for the KPI tiles to go. Under P-122 they stay. |
| A2 / A3 / C22 | Invite with a role; change a role or remove, with a reason; reissue a setup link | Members header and drawer | S3 in flight |
| A4 | Designate QMS approvers | Member drawer, foot | Above 900 px not verified |
| A15 | My password, authenticator and recovery codes | Account drawer | See D3 and D4 for position |
| A21 | Recent administrative changes | A band under every tab | Capped at 20 without saying so (ADM-10) |
| A33, A34 | Ask AnA to summarise the configuration; AnA skills | Settings head; Skills tab | non-default tabs |
| A35 | Both audit hash chains | Audit trail, under the header | G fixes false breaks |
| A37 / C19 / C20 / D12 / D13 | Switch organisation; answer invitations | Rail foot and Account | Duplicated (R1-ADM-09); U4 |
| B1, B4, B5, B6, B10, B11, B18, B20, B21, B24, B25, B27 | Plan status, invoices, portal, checkout, usage, rate limits, licence quotas, module requests, sign-up plans, Enterprise, platform licensing | Licensing; Usage & limits; Subscription & features; Access requests | The plan grid's fold position is not verified |
| C1, C2, C5, C7, C18, C21, C28, C29, C30 | Sign-up, e-mail verification, organisation seeding, Home's set-up checklist, client-type preference, invite acceptance, client filter, AnA readiness, Enterprise request | as named | C7 is visible at 1440×900 (measured in `fc0eb748d`) |
| D1, D7, D10, D19, D20, D21, D22 | Profile, alert choices, reporting role, file removal decision, signed attestation, signed audit bundle, sealed compliance reports | Account drawer; Vault; Audit trail; Audit & compliance reports | The attestation's position is not measured |

---

## 3. Server capability no screen calls

| Route(s) | Handler | Prod | What a customer would do with it | Value |
|---|---|---|---|---|
| GET `/api/tenant-export/full`, GET `/api/tenant-export` | `tenant-export.ts:191,127` | **no** (unmapped) | "We are leaving, or our auditor wants a full copy: give us every record, with a receipt." | HIGH |
| GET/POST `/api/tenant-export/custody` | `tenant-export.ts:371,387` | **no** | "I sign that we have our export, so you can close our account." | HIGH |
| GET `/api/billing/seats` | `billing-dashboard.ts:771` | yes | "How many of the seats we pay for are taken, and how many invitations are waiting?" | HIGH |
| POST/PATCH/DELETE `/api/clients`, `/:id/settings`, `/:id/security-settings`; GET `/api/organizations/:id/clients` | `clients-routes.ts`; `organizations-routes.ts:234` | yes | "Give each of our sponsors their own workspace, set it up, and archive it when the engagement ends." `/security-settings` writes a table nothing reads (R1-ADM-07). | HIGH for CROs |
| PATCH `/api/users/me` (name) | `users.ts:217` | yes | "My name is spelled wrong on my signatures." Needs a reason and an audit row first. | HIGH |
| `/scim/v2/*` | `scim.ts:690-1279` | yes (not judged by the gate) | "Okta creates and removes our accounts." Only platform staff can mint the token. | HIGH |
| GET `/api/licensing/agreements/*`, `/acceptances` | `licensing.ts:127-192` | yes (503 without tables) | "See what terms we agreed to, and be asked again when they change." | HIGH |
| GET `/api/audit/logs`, `/api/audit/export` (CSV with filters), `/api/audit-logs` | `audit-trail-routes.ts:238,260,629` | yes | "The audit trail for this record or person, as a spreadsheet." Partly a duplicate of the ledger read. | MED |
| GET `/api/admin/audit/siem`, `/siem/head` | `admin/audit-siem.ts:109,172` | yes | "Point our Splunk at our Part 11 trail." Today it needs a person's session. | MED |
| POST `/api/auth/logout` with `terminateAllSessions` | `auth.ts:1451` | yes | "I lost my laptop: sign me out everywhere." | MED |
| GET/PATCH `/api/users/me/notifications` | `users.ts:582,647` | yes | "Set my time zone so due dates end at my end of day." | MED |
| PATCH `/api/mdx/industry-profile` (markets, pathways, rigour) | `mdx-industry-context.ts:91-96` | yes | "We file in the US and EU, mostly 510(k)s, with two-person review." | MED |
| GET `/api/billing/weekly-limits`, `/weekly-usage`, `/weekly-overage`, `/alerts/history`, POST `/alerts/:id/acknowledge` | `billing-dashboard.ts` | yes | "What are our caps, how close are we, what overage do we owe, and when did we hit 80%?" | MED |
| GET `/api/billing/usage`, `/usage/summary`, `/usage/by-model`, `/activity`, `/capabilities`, `/pricing`, `/dtc-pricing` | `billing-dashboard.ts`; `billing.ts:211,281` | yes | "What did we use, on which models, what changed on our account, and what does checkout really charge?" | MED |
| GET `/api/compliance/gdpr/…/export`, `/dsr`, `/ropa`, `/dpia`, `/breach` | `global-compliance.ts` | **no** | "Give me my personal data; log a data-subject request." | MED |
| DELETE `/api/tenants/:id`, `/cancel-deletion`, `/purge` | `tenants-simple.ts:348,406,449` | admitted; platform staff only | "Close our organisation." | MED |
| GET/POST `/api/billing/budgets`; GET `/api/billing/credits`, PUT `/credits/auto-reload` | `billing-dashboard.ts` | yes | "Set a budget; top up credits automatically." There is nothing to spend credits against until something meters them. | LOW |
| GET `/api/tenant-stats/:id` | `tenant-stats.ts:30` | **no** | "How much is my organisation using?" | LOW |
| GET `/api/admin/security-health` | `admin-security.ts:62` | yes, and admits customer admins (R1-ADM-06) | A platform-wide report that should be platform-only. | LOW |
| `/api/tenant-config/:id/settings*`; `/api/auth/enterprise/*` (except organizations and select-organization) | `tenant-config.ts`; `authEnterprise.ts` | yes | Nothing new: a second settings door and a second sign-in flow. These should be converged (Rule 3). | LOW |
| `/api/retention/*` | `ana-ri-inline-routes.ts:125-155` | **no** | An invented facade (always 503). | LOW |
| GET `/api/module-subscriptions/enabled`, `/check/:id`, POST `/provision`; `/user-intelligence`, `/work-queue*` | `module-subscriptions.ts` | yes | Re-provision after a plan change; a task queue that belongs to Tasks. | LOW |

---

## 4. Not verified

- **Nothing was opened in a running app.** "Visible by default at 1440×900" was decided from component order and CSS
  (`admin-access.css`, `translation-v2.css`, `journey-v2.css`). The exceptions are the company card's 9,193 px (walk
  finding W1-07) and Home's figures (`fc0eb748d`).
- **History before 2026-10-22 is not in the clone.** `af973c5e8`, which unmounted AdminConsole, was not read.
  `41c02467a` and `d39624627` were read through GitHub by one investigator; the second verifier could not resolve them
  locally. So the before-states for A39, A40, B8 and B9 rest on that remote read or on deletion comments.
- **Visibility, unmeasured:**
  - A4: whether the QMS approver control clears 900 px;
  - A21: whether the admin audit band does (it depends on member count);
  - D3: whether Password clears the drawer's first view;
  - B6, B7, B25: where the plan grid falls;
  - D20: where the attestation falls.
- **Production verdicts not traced:** A5 and D11 (`/api/mdx/qms/job-roles`), and A7 (real project-sharing routes).
- **A6:** whether any store records which accounts sign in by SAML, which the SSO column would need in order to be
  made true.
- **A11:** whether lane S2's governed settings door now refuses `security.ssoEnabled`. The verifier read HEAD, where
  it is accepted.
- **A39:** whether the deleted compliance-status and SOC 2 grid reported true values.
- **D18:** whether a manager who opens `admin-console` by URL sees the Settings tab and its legal holds.
- **D21:** whether managers and audit readers have a door to Audit trail.
- **The in-flight lanes:** read from their fix reports and from the stash's file list. Their code was not inspected,
  and whether they land as reported is not verified.
- **U1-admin-console** has no fix report. Its findings are treated as not in flight; the lead may have assigned them
  elsewhere.
- **The `d97388005` / `507f5d091` catalogue half:** only the existence of the commits was verified.
- **Deliberately not examined:** the platform owner's Master Licensing screens beyond noting that they exist (B27).
