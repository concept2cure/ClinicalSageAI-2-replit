## Lane: Commercial & GTM

Cold, read-only review of HEAD `92ccdba1`. I built nothing, ran no tests and edited nothing. My one scratch script is `<scratch>/commercial/openapi_check.py`, which compares the OpenAPI specs against the Express route definitions. Line references are to HEAD.

### Readiness scores: pilot 4/10, enterprise GA 2/10, self-serve 2/10

- **Pilot, sales-led and white-glove (4/10).** The core of a pilot works in code:
  - An operator can create a tenant, and the first admin can invite members.
  - The launch catalog is switched on automatically for every new org.
  - A central tenant-lifecycle guard enforces suspension and read-only states.
  - Admins get a signed audit export, and offboarding is governed.
  - The paper set exists: pilot agreement, DPA, MSA, order form, support policy and a day-0 to day-30 runbook.

  What blocks it:
  - Every legal document is an unsigned draft with placeholders, including the legal entity name.
  - The in-product legal text contradicts the DPA (it promises HIPAA protections), links to pages that don't exist, and acceptance is never recorded.
  - Changing a member's role or removing a member is not audited.
  - The "full export" leaves out document files, yet a purge accepts it as proof of data return.
  - Login depends on mandatory email OTP, and no mail deliverability setup (SPF/DKIM/DMARC) is documented.
  - There is no human support channel in the product.
- **Enterprise GA (2/10).** Much of what procurement expects is missing:
  - Each tenant's SAML setup lives in an environment variable, so adding a customer means a redeploy. OIDC returns 501, and the login page has no SSO button.
  - SCIM tokens can only be minted by vendor staff.
  - No SOC 2, pen test, signed SCCs or BAA; no status page, knowledge base or admin guide.
  - No email notifications for tasks, reviews or signatures.
  - Stripe cannot invoice or take purchase orders.
  - SharePoint, Box, Google Drive and Veeva connectors cannot be reached in production.
  - No deletion certificate.
- **Self-serve (2/10).** Public signup is open, with no way to switch it off. It creates a free org with:
  - the whole launch catalog, 5 seats and 10 projects (column defaults, not the published free plan);
  - no trial expiry and no AI spend cap;
  - no recorded acceptance of terms.

  Beyond that:
  - Production infrastructure code (Terraform) has no Stripe keys.
  - A paid plan picked at signup is lost after email verification.
  - The Growth plan provisions 5 seats instead of 25.
  - An org admin can raise their own purchased seat count without paying.
  - There is no marketing site or pricing page.

### What is genuinely strong (keep)
- **Tenant lifecycle guard.** One guard in the authenticated chain (`server/middleware/tenantLifecycleGuard.ts`, used from `middleware/auth.ts:24`). It denies suspended tenants, makes past-due and pending-deletion tenants read-only, keeps billing, export and session paths open, and returns 503 if state can't be read (`services/tenant/tenant-lifecycle.ts:98-118`). Suspensions and tier changes need a reason and are audited (`routes/admin/master-admin.ts:311-370`, `routes/admin/master-licensing.ts:610-704`).
- **Governed offboarding.** Request, cancel and purge, with a 30-day window and a 7-day floor. Purge is refused unless the digest matches a stored export receipt, and it reports what happened to stored files (`services/tenant/tenant-offboarding.ts:1-65,510-606`; `services/tenant-export/tenant-full-export.service.ts`). The export discovers tables from the database catalog, including the `vault` schema.
- **Stripe webhook plumbing.** The raw body is mounted before the JSON parser (`server/startup/middleware.ts:92`), the signature is checked with `constructEvent` (`routes/billing.ts:284-310`), and events are de-duplicated through a `stripe_events` table (`services/billing.ts:715-770`). The customer portal and self-serve checkout exist with tax-ID collection.
- **Enterprise identity foundations:**
  - SAML uses `@node-saml` with signed assertions, a pinned audience and InResponseTo checking (`services/saml-provider.ts:1-20`), plus JIT user creation (`routes/sso.ts:909-946`).
  - SCIM 2.0 covers create, patch and delete, with audited deprovisioning and an IP allowlist (`routes/scim.ts:404-905`).
  - Invitations are audited (`services/tenant/invitation-delivery.ts:114-130`).
- **Launch catalog on at org creation, on both paths** (`routes/auth.ts:1016-1060`, `routes/tenants-simple.ts:196-205`). Launch scope defaults to ON in production (`services/entitlements/launch-scope.ts:25-40`).
- **Metering foundations.** Every AI gateway call writes a usage row with tokens and cost (`services/usage-recorder.ts`, `ai-gateway/gateway.ts:3910`). Seats and weekly limits are governed with a reason and an audit event (`services/seat-licensing.ts`, `services/weekly-usage-limits.ts`). The org admin's signed audit export is wired (`routes/audit-trail-routes.ts:614`, `AdminSurfaces.tsx:980`).
- **MCP connector.** OAuth 2.1 with PKCE, dynamic client registration and discovery metadata. All 19 tools have a title and all four annotations (`server/mcp/tools/*.ts`, `runtime.ts:176`), and each call is audited.
- **Commercial paper set exists and is honest about its gaps:**
  - `docs/commercial/PILOT_AGREEMENT.md`, `MASTER_SUBSCRIPTION_AGREEMENT.md` (GxP edition), `DATA_PROCESSING_ADDENDUM.md` (security measures and subprocessor annexes);
  - `ORDER_FORM.md`, `SUPPORT_POLICY.md` (realistic founder-staffed targets), `ONBOARDING_RUNBOOK.md`;
  - `docs/security/SECURITY_QUESTIONNAIRE_SIG_LITE.md`, `TRUST_STATEMENT.md`, eight policies under `docs/security/policies/`.
- **The OpenAPI specs describe real routes** (output of the script above):
  - `submission-center.openapi.json`: 68 operations. 64 match the `/api/submissions` routers; the other 4 are mounted by `/api/ectd-documents` and `/api/region-profiles`.
  - `global-ri.openapi.json`: 87 of 87 found.
  - `ivd-platform.openapi.json`: 37 operations. The 7 not matched by the script are mounted elsewhere (`/api/ivd-assessments`), and one is a parametrised path.
- **An append-only terms-acceptance ledger already exists** (`services/licensing/eula-service.ts`: hash, IP and user agent, mirrored to the audit log). It is ready to wire in.

### Capability matrix
| Capability | Status | Evidence | Note |
|---|---|---|---|
| Self-serve signup + email verification | WIRED | `routes/auth.ts:849-1060` | No kill switch; creates free org |
| Sales-led tenant creation | PARTIAL | `routes/tenants-simple.ts:159` (platform admin) | API only; no vendor UI; no first-admin step |
| Invitations / activation | WIRED | `routes/tenant-users.ts:346`; `AdminAccess.tsx:188`; `Onboarding.tsx:476` | Audited |
| Org roles | PARTIAL | `tenant-users.ts:24` (admin/manager/member/viewer); `middleware/auth.ts:376-384` | admin, manager and member all map to the same function; no custom roles |
| Org admin: change role / remove member | PARTIAL | API `tenant-users.ts:523,569`; no client caller | Not audited, no last-admin guard, no UI |
| Org admin console (settings, grants, scopes) | MOCKED | `AdminAccess.tsx:403,521,522,538,675` are AnA chat prompts, not actions | Settings API `organizations-routes.ts:465` has no UI |
| SAML SSO | PARTIAL | `routes/sso.ts:197-290` (in-memory config from `SAML_TENANTS` env var) | Redeploy per customer IdP; not in Terraform; no login-page entry point |
| OIDC (Okta/Entra/Google/Microsoft) | MISSING | `routes/sso.ts:776-829` returns 501 `SSO_NOT_IMPLEMENTED` | |
| JIT provisioning | WIRED | `sso.ts:909-935` | Always role `member`; no IdP-group-to-role mapping |
| SCIM | WIRED (vendor-gated) | `routes/scim.ts`; token minting is platform-admin only (`IdentityConsole.tsx:5-12`) | Customer IT can't self-configure |
| Trial expiry | MISSING | `services/lifecycle/org-lifecycle.ts:122-131` (no expiry job); `isProductiveState` has no callers | `trial_ends_at` is only read by master-admin lists |
| Suspension / past-due enforcement | WIRED | `tenantLifecycleGuard.ts` | Client never renders the `TENANT_*` codes |
| Full data export | PARTIAL | `routes/tenant-export.ts:157`; export service contains no storage/file code (431 lines) | Database rows only, no document files; single synchronous JSON response; no UI |
| Deletion + certificate | PARTIAL | `tenants-simple.ts:381-545` | Operator API; no signed destruction certificate; backups not addressed |
| Stripe checkout / portal | PARTIAL | `routes/billing.ts:97,144,217` | No `STRIPE_*` in `terraform/stack/main.tf:158-209`; any member can open the portal |
| Webhook signature + idempotency | WIRED (flawed) | `routes/billing.ts:284-327` | A processing failure returns 200 and later retries are skipped |
| Plan → feature entitlements | PARTIAL | `MODULE_ENFORCEMENT` defaults to off (`enforcement-mode.ts:142`); launch modules granted to every tier | Tiers barely differ inside the launch catalog |
| AI usage metering | WIRED | `usage-recorder.ts`; `gateway.ts:3910` | |
| AI caps per plan | MISSING | Weekly limits are opt-in (`register-ai-routes.ts:19-24`); `ai-gateway/policy.ts:222,366-377` tracks daily cost but never enforces it | |
| Seat counting | WIRED (leaky) | `seat-licensing.ts:115-127` (enforced in production) | The org admin can set seats (`billing-dashboard.ts:764`) |
| Enterprise invoice / PO | MISSING | Card and Link only (`services/billing.ts:594`); no `send_invoice` anywhere | Pilot fee must be invoiced off-platform |
| Pricing in code | PARTIAL | Three copies: `services/billing.ts:104-330`, `v2/fixtures/licensing.ts`, `ZenSignup.tsx:~590-605` | Two incompatible models (flat-rate plans vs per-user); `PRICING.md` §2.3 not implemented |
| Transactional email | PARTIAL | `emailService.ts`: reset, OTP, welcome, verification, invitation, report | Three separate mail senders with different env vars and sending domains |
| Task / review / signature emails | MISSING | `notification-service.ts:14-16` claims email fan-out that doesn't exist; `sendGenericEmail` has no callers | In-app only (28 producers) |
| In-app notifications / digest | WIRED | `services/notifications`, `services/digest` | |
| SPF / DKIM / DMARC | MISSING | Nothing in `terraform/` or `docs/` | OTP login depends on it |
| ToS / Privacy in product | MOCKED | Inline text in `ZenSignup.tsx:745-861`; checkboxes never sent (payload `:276-291`); `/concept2cure/legal/*` falls through to the app (`ZenRouter.tsx:35-39,251`) | Acceptance ledger never called; `requireLicenseAcceptance` never mounted |
| Legal pack (pilot, MSA, DPA, order form, support policy) | PARTIAL | `docs/commercial/*` | Drafts with placeholders; no AUP, BAA template, public privacy policy or ToS, cookie notice, or CAIQ |
| Support / status / knowledge base | MISSING | "Get help" opens an AnA chat (`Shell.tsx:150,213`); support mailbox is a placeholder (`SUPPORT_POLICY.md:24-30`) | No status page, user guide, admin guide or release notes |
| API docs | PARTIAL | 3 accurate specs | None for Vault, Projects, Authoring or QMS; `/api/v1` covers non-launch features and is branded "ClinicalSageAI" (`public-api.ts:239-245`) |
| Vendor admin UI | PARTIAL | `MasterLicensing.tsx` only | Tenant list, suspend, overview and business center are API-only |
| Support impersonation | MISSING (acceptable) | No code | No documented, consented support-access procedure |
| Document connectors (SharePoint, Box, Drive, OneDrive, Veeva) | PARTIAL, unreachable | Real clients in `services/connectors/*`; used only by Deep Research (`routes/deep-research.ts:175-221`), which is outside the launch scope | No import into Vault |
| Word | PARTIAL | DOCX import (`server/import/docx-to-authoring.ts`) and export (`routes/c2c/exports.ts`) | No Office add-in; round-trip fidelity UNVERIFIED |
| Customer webhooks | MISSING | — | API keys exist (`routes/api-keys.ts`) |
| Marketing / pricing / demo page | MISSING | Landing page removed (`ZenRouter.tsx:35-39`); demo intake `auth.ts:2635` notifies no one and is only reachable in-app | `sitemap.xml` lists dead URLs |
| MCP directory readiness | PARTIAL | Docs URL `/concept2cure/connector` (`mcp/config.ts:131`) not served; `MCP_ENABLED` not in Terraform; consent page has no privacy link (`mcp/auth/consent.ts:57-82`) | Checklist `docs/connector/DIRECTORY_SUBMISSION.md` has open items |
| Product analytics | MISSING | Only Sentry in `package.json:453-454`; `betaFlowTelemetry` is in-memory | Sentry session replay at 10% (`client/src/utils/sentry.ts:16-19`) is not disclosed in DPA Annex III |

### Findings

**GTM-01 · P0 · No signable legal instrument**
- **Evidence:** MSA, DPA, pilot agreement, order form and support policy are all headed "DRAFT — FOR LAWYER REVIEW". The entity is `[CONCEPT2CURE LEGAL ENTITY NAME]` (`MASTER_SUBSCRIPTION_AGREEMENT.md:12`), while the product says "Concept2Cure, Inc." (`ZenSignup.tsx:749`). The SCC annex says "counsel to complete" (`DATA_PROCESSING_ADDENDUM.md:271-275`). The SMTP and uptime subprocessors are unnamed (`DPA:263-268`), and insurance is a placeholder.
- **Impact:** A regulated buyer can't sign or pay.
- **Fix:** Counsel review; fix the entity; complete the SCC and UK Addendum modules; name the subprocessors; bind insurance.
- **Effort:** M (legal time). **Dependencies:** founder, counsel.

**GTM-02 · P1 · In-product legal text is non-binding, contradicts the DPA, and acceptance isn't recorded**
- **Evidence:**
  - The inline ToS claims "HIPAA protections for health data" (`ZenSignup.tsx:772`), but DPA §4.1 says "does not claim HIPAA compliance".
  - It states a "3-month minimum commitment" (`:766,961`), but self-serve checkout is monthly with no minimum.
  - `acceptedTerms`, `acceptedPrivacy` and the AI-learning opt-in (`:686,881-897`) are not in the signup payload (`:276-291`); the signup schema has no terms fields (`routes/auth.ts:167-199`).
  - `requireLicenseAcceptance` is never mounted. The EULA and ToS rows are seeded with no body and no URL (`eula-service.ts:151-160`), and no client calls `/api/licensing/agreements`.
  - The terms and privacy links in the product and emails (`emailService.ts:102-104,253-255`) fall through the catch-all to the app.
- **Impact:** Unenforceable clickwrap, misrepresentation exposure, and no evidence of consent.
- **Fix:**
  - Publish the ToS, privacy policy and AUP at real URLs.
  - Replace the inline text with links plus a short summary.
  - Send the acceptances with the signup request and call `recordAcceptance` in the signup transaction.
  - Mount `requireLicenseAcceptance`, with carve-outs.
  - Remove the AI-learning toggle, or persist it and document what it controls.
- **Effort:** M. **Dependencies:** GTM-01 text.

**GTM-03 · P1 · Changes to who has access are not audited, and there is no last-admin guard**
- **Evidence:** PATCH and DELETE on `routes/tenant-users.ts:523-605` write no audit row, and the role change doesn't invalidate the membership cache. No global mutation audit exists (`startup/middleware.ts` chain). The UI says "Every action below emits a 21 CFR Part 11 audit entry" (`AdminAccess.tsx:399-400`).
- **Impact:** A GxP customer can't show who granted or removed access. An org admin can demote themselves and lock the tenant out.
- **Fix:**
  - Write an audit row (before/after role, reason) and invalidate the cache.
  - Refuse to demote or remove the last admin.
  - Add role-change and remove controls in AdminAccess.
- **Effort:** S–M.

**GTM-04 · P1 · The "full export" leaves out document files, yet purge accepts it as proof of data return**
- **Evidence:** `tenant-full-export.service.ts` contains no storage or file handling. `purgeTenant` erases stored files (`tenant-offboarding.ts:460-606`) once the export digest matches a receipt. The export is one synchronous JSON response (`routes/tenant-export.ts:157-215`).
- **Impact:** A customer can be purged without ever receiving their vault documents, which breaches the data-return clauses.
- **Fix:**
  - Run the export as an async job producing a ZIP (JSON rows plus every stored object plus a manifest with SHA-256 per file) in S3, with a pre-signed link.
  - Make the receipt cover the files.
  - Add an "Export all data" button for org admins.
- **Effort:** L.

**GTM-05 · P1 · Email-dependent login has no deliverability setup, and the codebase has three mailers**
- **Evidence:**
  - OTP is the mandatory second factor (`ONBOARDING_RUNBOOK.md:63-73`). Nothing in `terraform/` or `docs/` covers SPF, DKIM or DMARC.
  - The default sender is `noreply@concept2cure.pro` (`emailService.ts:37`), while links and support use concept2cure.com.
  - `notify.ts:1-15` uses `MAIL_FROM` with default `no-reply@yourapp.local`.
  - `jobs/retentionCron.ts:261-273` reads `SMTP_PASSWORD` and `EMAIL_FROM` (default `trialsage.ai`), while Terraform sets `SMTP_PASS`, so retention mails are silently skipped in production.
- **Impact:** Pharma mail gateways quarantine the OTP and nobody can log in (Sev-1). Also inconsistent branding.
- **Fix:**
  - One sender module, `emailService`, for all mail.
  - A single sending domain with SES identity, DKIM, SPF and DMARC in Terraform.
  - A boot check that SMTP_FROM's domain matches.
- **Effort:** S–M.

**GTM-06 · P1 · Open public signup with unlimited free usage and no kill switch**
- **Evidence:**
  - No `SIGNUP_ENABLED`-type flag exists (grep empty). Signup sets `tier:'free'` (`auth.ts:970-977`).
  - The column defaults then give 5 seats, 5 users, 10 projects and 5 GB (`shared/schema.ts:172-179`); the published free plan is 1 user, 2 projects, 1 GB (`billing.ts:104-117`).
  - `payment_status` defaults to `incomplete`, which is allowed indefinitely (`tenant-lifecycle.ts:110-117`).
  - All 21 launch modules are granted to every org.
  - No AI cost cap (`policy.ts:366-377` records cost only).
- **Impact:** Unbounded AI spend; anonymous GxP data arriving under unrecorded terms.
- **Fix:**
  - Add `SELF_SERVE_SIGNUP=off` (default off in production), so signup is invite or allowlisted domains only.
  - Apply free-plan limits at org creation.
  - Default AI cost caps per plan (weekly limits seeded at provisioning).
- **Effort:** S–M. **Dependencies:** founder pricing decision (GTM-12).

**GTM-07 · P1 · No human support channel in or around the product**
- **Evidence:** "Get help" opens an AnA chat (`Shell.tsx:150,213`). The support mailbox is `support@[domain]` (`SUPPORT_POLICY.md:26`). The security contact is .pro in `SECURITY.md` and `well-known.ts:16` but .com in `docs/connector/SUPPORT.md`.
- **Impact:** Pilot users can't raise a Sev-1 from inside the product.
- **Fix:** Create the mailboxes and a ticket tool; add a "Contact support" item with a pre-filled context block; use one domain.
- **Effort:** S.

**GTM-08 · P2 · A customer org admin can grant itself purchased seats**
- **Evidence:** `PUT /api/billing/seats` uses `requireRole('admin','owner')` (`billing-dashboard.ts:764`). Every signup's first user is org `admin`, and the org-admin shortcut in `requireRole` applies (`middleware/auth.ts:443-448`).
- **Impact:** Seat enforcement, on by default in production, can be bypassed by the customer. Revenue leak.
- **Fix:** Restrict to platform admin or the Stripe webhook; org admins see their seats read-only.
- **Effort:** S.

**GTM-09 · P2 · Stripe state can drift silently**
- **Evidence:** The handler returns 200 even when processing fails (`routes/billing.ts:318-326`). The event row is written before processing, so any retry would be skipped (`services/billing.ts:718-735`). No replay job exists (`stripe_events` is referenced only by the export and a dashboard read). Subscriptions without `metadata.organizationId` are ignored (`:811`). Self-serve subscriptions carry no `seats` metadata, so the webhook defaults to 5 and a $1,499 Growth customer is capped at 5 seats (`:815` versus `:597-604`). Downgrading never revokes modules (`:943-980`).
- **Fix:**
  - Return 5xx on processing failure.
  - De-duplicate only on `processed = true`.
  - Add an admin replay endpoint.
  - Put seats and max users in the subscription metadata.
  - Revoke on downgrade.
- **Effort:** S–M.

**GTM-10 · P2 · Production can't bill, and the self-serve paid path is broken**
- **Evidence:** No `STRIPE_*` settings in `terraform/stack/main.tf:158-209` or the deploy workflow. The paid plan chosen at signup is dropped because email verification returns first (`ZenSignup.tsx:311-315` versus `:323`). Any member can open the Stripe portal or start checkout (`routes/billing.ts:97,144`). No invoice or PO collection. Overage is advertised (`ZenSignup.tsx:766-768`, `PRICING` overage fields) but never billed.
- **Fix:**
  - Put the Stripe secret and webhook secret in Secrets Manager.
  - Carry `plan` through verification and start checkout on first login.
  - Restrict the portal to admin or billing roles.
  - Add `collection_method: send_invoice` for enterprise.
  - Remove the overage claims until overage is billed.
- **Effort:** M.

**GTM-11 · P2 · Trial expiry isn't enforced; sales-led orgs have no contract term**
- **Evidence:** `org-lifecycle.ts:122-131` has no expiry job. `trial_ends_at` is only read by master-admin lists (`master-admin.ts:587-592`), and signup never sets it.
- **Fix:**
  - Add `contract_end_at`, `trial_ends_at` and a daily sweep that moves expired orgs to read-only, with notices to the admin at T-14 and T-3 and a customer-facing banner.
  - Render the `TENANT_*` codes in the client (no handler exists today).
- **Effort:** M.

**GTM-12 · P2 · Pricing and packaging aren't decided, are duplicated, and aren't differentiated**
- **Evidence:** Two models live in `services/billing.ts:104-330`, with further copies in `v2/fixtures/licensing.ts` and `ZenSignup.tsx`. `PRICING.md` §2.3 is a proposal only. Every tier gets the full launch catalog, and entitlement enforcement is off by default (`enforcement-mode.ts:142`).
- **Fix:**
  - One server-side plan catalog served by `GET /api/billing/plans`; the client reads it.
  - Retire the per-user `PRICING`.
  - Implement the founder-approved SKUs (pilot, per-submission, platform tiers).
- **Effort:** M. **Dependencies:** founder decision.

**GTM-13 · P2 · SSO isn't self-service or complete**
- **Evidence:** SAML config comes from the `SAML_TENANTS` env JSON (`sso.ts:237-260`), held in memory and not in Terraform. OIDC returns 501 (`:776-829`). The login page has no SSO button or email-domain discovery (`ZenLogin.tsx`, grep empty). JIT always assigns `member`. No "SSO required" policy. SCIM tokens are platform-admin only.
- **Fix:**
  - A per-org `sso_connections` table with admin UI (metadata upload or URL, certificate rotation, test connection).
  - Email-domain routing on the login page.
  - IdP-group-to-role mapping.
  - An enforce-SSO flag.
  - Let org admins mint SCIM tokens (audited).
- **Effort:** L.

**GTM-14 · P2 · The org admin console is mostly chat prompts**
- **Evidence:** "Grant access", "Audit activity", "Edit scopes", "Change setting" and "Audit a member" call `ask()` (`AdminAccess.tsx:403,521,522,538,675`). `PATCH /api/organizations/:id/settings` exists (`organizations-routes.ts:465`) with no client caller.
- **Fix:** Real forms for program access grants, per-user activity export and org settings.
- **Effort:** M.

**GTM-15 · P2 · No email for the governed workflow**
- **Evidence:** `notification-service.ts:14-16` claims email fan-out that isn't implemented. The 28 `createNotification` producers (reviews, tasks, schedule) are in-app only.
- **Impact:** Review and signature requests go unseen, and cycle time suffers in pilots.
- **Fix:** Email delivery for categories the user has subscribed to, plus a daily digest.
- **Effort:** M. **Dependencies:** GTM-05.

**GTM-16 · P2 · Trust material isn't published**
- **Evidence:** `TRUST_STATEMENT.md`, SIG-Lite and the policies are drafts. No public subprocessor page, CAIQ, cookie notice, BAA template or AUP. SOC 2 and pen test are stated as not in place (DPA §6). Sentry replay (`client/src/utils/sentry.ts:16-19`) isn't disclosed. Data-subject erasure is retired (`routes/global-compliance.ts:541-562`).
- **Fix:**
  - Publish a trust page (subprocessors, residency, AI terms, security contact).
  - Start a SOC 2 Type I and a pen test.
  - Disclose the replay or turn it off.
  - Define the data-subject request procedure.
- **Effort:** L (external).

**GTM-17 · P2 · No customer documentation or status page**
- **Evidence:** `docs/guides` and `docs/getting-started` are developer documents. No knowledge base, admin guide or customer-facing release notes. Status is only `/readyz`.
- **Fix:** A user and admin guide for the six launch apps (can start in-app), a status page, and release notes.
- **Effort:** M.

**GTM-18 · P2 · Enterprise integrations can't be reached at launch**
- **Evidence:** The SharePoint, Box, Drive, OneDrive and Veeva clients exist but only Deep Research uses them (`routes/deep-research.ts:175-221`), and Deep Research is outside `LAUNCH_APPS` (`shared/constants/launch-scope.ts`). No import into Vault. No Word add-in. No customer webhooks. The public API (`/api/v1`) covers none of the launch catalog.
- **Fix:** Import from SharePoint or Veeva into Vault (with provenance) inside the Vault app; customer webhooks for review, sign and sequence events.
- **Effort:** L.

**GTM-19 · P2 · MCP connector isn't ready for directory submission**
- **Evidence:** The documentation URL it advertises (`mcp/config.ts:131`) isn't served; the router's catch-all sends it to the app. `MCP_ENABLED` isn't in Terraform. The consent page has no privacy or terms link (`consent.ts:57-82`). The privacy policy is unpublished (`DIRECTORY_SUBMISSION.md:74-83`). `c2c_ga_readiness_probe` shows every customer the vendor's own deployment gaps (`readiness.ts:95-121`).
- **Fix:** Serve `docs/connector/README.md` at that URL; add `MCP_ENABLED` and `MCP_PUBLIC_URL` to Terraform; link privacy and terms on the consent page and in the OAuth metadata; restrict the probe tool to platform admins.
- **Effort:** S–M. **Dependencies:** production environment live, counsel.

**GTM-20 · P2 · No web presence or lead capture**
- **Evidence:**
  - The landing, pricing, legal and billing pages were removed (`ZenRouter.tsx:35-39`).
  - `sitemap.xml` still lists `/concept2cure/legal/*` and `/concept2cure/billing`.
  - `index.html` says "Trusted by clinical research professionals worldwide".
  - Demo requests are stored but notify no one (`auth.ts:2635-2639`) and can only be submitted from inside the app (`Onboarding.tsx:521`).
- **Fix:** A marketing site (external is fine); fix the sitemap and the claim; a public demo form that emails the founder or creates a CRM record.
- **Effort:** S–M.

**GTM-21 · P2 · No product analytics**
- **Evidence:** Only Sentry is present. Usage data is AI cost plus `last_login`, and the vendor overview is API-only (`master-admin.ts:140-200`).
- **Fix:** A per-tenant usage and adoption event table (feature, org, user hashed), shown on a vendor dashboard, with a privacy note.
- **Effort:** M.

**GTM-22 · P3 · Polish**
- The customer account menu includes "Codebase coverage" (`Shell.tsx:212`).
- Brand drift: "ClinicalSageAI Public API" and `csai_` keys (`public-api.ts:239-245`); `app.concept2cure.ai` as the SAML default (`sso.ts:211`).
- No signed deletion certificate.
- No documented, consented support-access procedure.
- **Effort:** S each.

### Recommended work orders (in order)
1. **WO-A Legal pack to signable (GTM-01, GTM-16).**
   - Goal: signed pilot, DPA and MSA templates.
   - Scope: entity; counsel review; SCC and UK Addendum; named subprocessors including Sentry replay; insurance.
   - Done when: counsel sign-off on file; no `[`-placeholders except deal fields.
   - Effort: M external. Needs: founder.
2. **WO-B Terms consent that holds up (GTM-02).**
   - Scope: ToS, privacy and AUP served at real routes (they must not fall through to the app); signup and invitation acceptance record rows in `license_acceptances`; middleware mounted; inline claims removed.
   - Tests: a signup without `acceptedTerms` gets 400; a successful signup writes one acceptance row per agreement; `/concept2cure/legal/terms` returns 200 and is not the app shell.
   - Effort: M.
3. **WO-C Access-change audit and lockout guard (GTM-03, GTM-14).**
   - Tests: PATCH and DELETE on tenant-users write an audit row with before/after role and a reason; removing or demoting the last admin gets 409; AdminAccess has role-change and remove controls with no `ask()` left in their place.
   - Effort: S–M.
4. **WO-D Signup gate and cost safety (GTM-06, GTM-08).**
   - Tests: with `SELF_SERVE_SIGNUP` unset in production, signup gets 403 unless an invite or allowlisted domain applies; free-plan orgs get 1 user, 2 projects, 1 GB and a weekly AI cost cap; `PUT /api/billing/seats` as org admin gets 403.
   - Effort: S–M.
5. **WO-E Email deliverability and one mailer (GTM-05, GTM-07).**
   - Tests: only `emailService.ts` creates a mail transport (a CI grep enforces it); Terraform declares the SES identity with DKIM, SPF and DMARC; boot fails if the sender domain isn't verified; the support and security mailboxes are live and the app has a "Contact support" item.
   - Effort: S–M.
6. **WO-F Complete data return (GTM-04).**
   - Tests: the export ZIP contains every stored object with a per-file SHA-256 manifest; purge is refused if the receipt doesn't cover the files; an org admin can start the export from the UI; a 1 GB tenant exports without request timeouts.
   - Effort: L.
7. **WO-G Billing correctness (GTM-09, GTM-10, GTM-11, GTM-12).**
   - Tests: a webhook processing failure returns 500 and the replay succeeds; Growth checkout yields 25 seats; the chosen plan survives verification; enterprise invoice collection works; the trial or contract sweep moves an expired org to read-only with a banner; one plan catalog endpoint is the source of pricing.
   - Effort: M–L. Needs: founder pricing decision.
8. **WO-H Enterprise identity (GTM-13).**
   - Scope: per-org SSO in the database with admin UI and test connection; OIDC; email-domain routing on login; IdP group-to-role mapping; enforce-SSO flag; org-admin SCIM token minting.
   - Tests: Okta and Entra SAML and OIDC round-trips in CI with mock IdPs.
   - Effort: L.
9. **WO-I Governed-workflow email and digest (GTM-15).** Effort: M. Needs: WO-E.
10. **WO-J Connector directory submission (GTM-19).** Effort: S–M. Needs: production environment live, WO-A.
11. **WO-K Docs, status page, analytics, web presence (GTM-17, GTM-20, GTM-21).** Effort: M each.
12. **WO-L Integrations: Vault import from SharePoint and Veeva; customer webhooks (GTM-18).** Effort: L.

### Open questions / needs from the founder
- **Legal entity:** name and jurisdiction; "Concept2Cure, Inc." appears in product text. Also counsel, E&O/cyber insurance, and who signs.
- **Domain:** .com, .pro, .ai or trialsage.ai — needed for email, security.txt, SAML entity IDs and MCP URL.
- **Pricing:** adopt `PRICING.md` §2.3? Withdraw the free tier? Pilot fee amount; per-submission SKUs; card or invoice for enterprise.
- **Self-serve:** is it in scope at launch at all? If not, turn off public signup.
- **Support:** mailbox, ticket tool, Sev-1 phone coverage, and whether the founder-only model is stated to buyers.
- **Data:** PHI in scope? If so, BAAs with Anthropic and AWS first. Residency offering beyond us-east-1.
- **Compliance roadmap:** SOC 2 Type I timing and auditor; pen-test vendor and date.
- **Customer IdPs:** which ones the first 3–5 design partners require, to prioritise OIDC versus SAML UI.
- **Directory listing:** go/no-go for the Anthropic Connectors Directory (production origin, published privacy policy).
- **Offboarding:** backup-retention statement for purged tenants (RDS snapshots at 35 days), and whether a signed destruction certificate is a contractual deliverable.
