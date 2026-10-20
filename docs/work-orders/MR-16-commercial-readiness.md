# MR-16 — Commercial readiness: signable paper, consent, billing, email, support, SSO

| | |
|---|---|
| Phase | Phase 0 (Stage 1) · Phase 1 (Stages 2–6) · Phase 3 (Stages 7–11) · Backlog (Stage 12) |
| Highest open severity at head | P0 (GTM-01) |
| Human testing | Blocks: sign-in on any staging or production deployment. Login needs an emailed one-time code, and mail from the unauthenticated default sender `noreply@concept2cure.pro` is quarantined or never configured (GTM-05). Degrades: signup shows a non-binding ToS that claims HIPAA protections, and the Terms/Privacy links land on the app (GTM-02). "Get help" opens AnA with no human channel (GTM-07). Plan cards and onboarding advertise modules that do not ship (UX-05). Admin actions are chat prompts (GTM-14). Review and signature requests are in-app only (GTM-15). The connector docs link opens the app shell (GTM-19). "Codebase coverage" sits in the customer menu (GTM-22). Not observable in testing: GTM-01, 04, 06, 08–13, 16–18, 20, 21. |
| Owner | mixed: founder and counsel own Stage 2 and the content decisions in Stages 1, 3, 5, 7, 9 and 10; engineering owns the rest |
| Effort | XL in total: M + M + M + M + M + L + L + L + L + L + L + M. The pilot path (Stages 1–6) is M + M + M + M + M + L. |
| Depends on | MR-03 (staging and production stack, Terraform), MR-04 (pen test with F-21), MR-07 (GTM-03 access-change audit, before Stage 8), MR-13 (connector directory, F-26), MR-15 (signup surfaces, F-3); F-3, F-4, F-19, F-20, F-21, F-24, F-26; two NEW decisions |
| Findings | 22 total — open 18 · partially fixed 3 · fixed 0 · refuted 0 · unverifiable 1 |
| Basis | cold audit at `92ccdba1`; every status re-verified at `94b4f9238` on 2026-10-13 — [evidence](../evidence/reviews/2026-10-13-market-readiness/) · [findings register](MR-findings-2026-10-13.json). The branch moves about 1,500 commits a day: re-confirm each finding at the current head before starting its stage. |

> **Re-checked 2026-10-18 at `8ca7e74ca`** (every finding that stopped a tester's journey at `94b4f9238`). Start from this, not from the 13 October text below, for:
> - **GTM-05**: partially fixed; for testers it now degrades the journey but does not stop it. Evidence at head: [findings register](MR-findings-2026-10-13.json), `GTM-05.recheck`.

## Goal

A pilot customer signs a counsel-approved pilot agreement and DPA with a named Concept2Cure legal entity. Its users receive login codes from an authenticated sending domain. Every user accepts published, versioned terms, and the acceptance is recorded. They can reach a human through a named support mailbox from inside the product. Production signup is closed unless the founder opens it. The in-product plan catalog lists only what the launch catalog ships, at prices that rise with the tier. When the pilot ends, the customer receives every stored file with a per-file SHA-256 manifest before anything is purged. After the pilot, billing, SSO, admin forms, workflow email and published trust material bring the same commercial surface to enterprise GA.

## Why it matters

- **No pilot can start lawfully today.** Every instrument in `docs/commercial/` is headed "DRAFT — FOR LAWYER REVIEW. NOT AN OFFER AND NOT A BINDING DOCUMENT." and names the provider as `[CONCEPT2CURE LEGAL ENTITY NAME]`. Governing law, insurance, two subprocessors and the SCC annex are blank.
- **Nobody at a pilot customer may be able to log in.** The email code is the mandatory second factor. Terraform declares no SES identity, DKIM, SPF or DMARC, and the default sender is a `.pro` address that the templates contradict with `.com` links. A corporate M365 gateway can quarantine every code, which is a Sev-1 under the customer's own support policy.
- **The product contradicts the paper.** Signup tells every user the platform provides "HIPAA protections for health data" and a 3-month minimum, while the DPA disclaims HIPAA. It offers an AI-training opt-in that the DPA rules out and that does nothing. No acceptance is recorded, so the company cannot prove which terms any user accepted.
- **The first offboarding can destroy customer files.** The tenant export is database rows only. Its receipt still authorises a purge that deletes the tenant's Vault objects, so the customer's documents are gone with no copy returned, in breach of the data-return clause.
- **Anyone who finds the URL can open a tenant and spend model budget.** Public signup has no off switch. Self-serve orgs get 5 seats, 10 projects and the whole launch catalog instead of the free plan's 1 user and 2 projects, and no AI cost cap is enforced on any route.
- **In-app pricing reads as misrepresentation to a GxP buyer.** Plan cards advertise "510(k) Module", "Custom AI Models" (a Rule 2 conflict) and an "SLA Guarantee". Professional is priced below Standard at list and at Stripe checkout. Onboarding tells the org these modules are "provisioned" when the server grants none of them.

## State at head

| Finding | Status at head | Severity (pilot) | Tester impact | Evidence at head |
|---|---|---|---|---|
| GTM-01 | STILL_OPEN | P0 | None | `docs/commercial/MASTER_SUBSCRIPTION_AGREEMENT.md:3,14` DRAFT banner and `[CONCEPT2CURE LEGAL ENTITY NAME]`; `DATA_PROCESSING_ADDENDUM.md:268-269,275-279` subprocessors and Annex IV blank |
| GTM-02 | STILL_OPEN | P1 | Degrades | `client/src/concept2cure/auth/ZenSignup.tsx:795,801` 3-month minimum and HIPAA claim; `:299-317` sends no acceptance; `server/middleware/requireLicenseAcceptance.ts:17` never mounted |
| GTM-04 | STILL_OPEN | P1 | None | `server/services/tenant-export/tenant-full-export.service.ts:294-296` digests rows only; `server/services/tenant/tenant-offboarding.ts:845` erases vault objects after a rows-only receipt |
| GTM-05 | PARTIALLY_FIXED | P1 | Blocks (staging sign-in) | `terraform/stack/variables.tf:292-299` free-text `smtp_from`, no SES identity; `server/services/emailService.ts:40` defaults to `noreply@concept2cure.pro`; dead transport in `server/services/notify.ts:1-15` |
| GTM-06 | STILL_OPEN | P1 | None | `server/routes/auth.ts:887` `/signup` open to anyone; `:1018` inserts `tier: 'free'` with schema-default limits; `cost_cents` enforced nowhere (`server/services/weekly-usage-limits.ts:37`) |
| GTM-07 | STILL_OPEN | P1 | Degrades | `client/src/concept2cure/v2/Shell.tsx:74-76,376` "Get help" opens AnA; `docs/commercial/SUPPORT_POLICY.md:28` `support@[domain]`; `server/routes/well-known.ts:16` hard-coded `.pro` security contact |
| GTM-08 | STILL_OPEN | P3 | None | `server/routes/billing-dashboard.ts:747` `PUT /seats` allows org `admin` |
| GTM-09 | STILL_OPEN | P3 | None | `server/routes/billing.ts:325` returns 200 on webhook processing failure |
| GTM-10 | STILL_OPEN | P2 | None | No `STRIPE_*` in `terraform/stack/main.tf`; portal and checkout open to any member at `server/routes/billing.ts:97,144` |
| GTM-11 | STILL_OPEN | P3 | None | `trial_ends_at` read only by `server/routes/admin/master-admin.ts`; no `contract_end_at` in `server/` |
| GTM-12 | UNVERIFIABLE | P3 | None | `server/services/billing.ts:64-86` `PRICING` beside DTC tiers; the packaging decision is a founder action (F-20) |
| GTM-13 | STILL_OPEN | P2 | None | `server/routes/sso.ts:789,820` OIDC returns 501 `SSO_NOT_IMPLEMENTED`; SAML from env JSON |
| GTM-14 | STILL_OPEN | P2 | Degrades | `client/.../AdminAccess.tsx:413,531,532,552,689` admin actions call `ask()` |
| GTM-15 | STILL_OPEN | P2 | Degrades | `server/services/notifications/notification-service.ts:14-16` claims email fan-out that does not exist |
| GTM-16 | PARTIALLY_FIXED | P2 | None | Sentry replay removed (`client/src/utils/sentry.ts:10-13`); no trust page, subprocessor list, SOC 2 or pen test |
| GTM-17 | STILL_OPEN | P2 | None | No customer user or admin guide, status page or release notes; status is `/readyz` only |
| GTM-18 | STILL_OPEN | P2 | None | No SharePoint/Veeva import into Vault and no customer webhooks |
| GTM-19 | PARTIALLY_FIXED | P2 | Degrades | `server/mcp/config.ts:140` docsUrl `/concept2cure/connector` has no route; `server/mcp/auth/consent.ts` has no privacy or terms link |
| GTM-20 | STILL_OPEN | P2 | None | `client/public/sitemap.xml:22-34` lists dead routes; `client/index.html:39` unsupported "Trusted by … worldwide"; `server/routes/auth.ts:2818` demo requests notify no one |
| GTM-21 | STILL_OPEN | P3 | None | No usage or adoption event table or analytics SDK |
| GTM-22 | STILL_OPEN | P3 | Degrades | `client/src/concept2cure/v2/Shell.tsx:375` "Codebase coverage" in the customer menu; `server/routes/public-api.ts:232-246` "ClinicalSageAI Public API" and `csai_` keys |
| UX-05 | STILL_OPEN | P1 | Degrades | `server/services/billing.ts:206-303` out-of-catalog features and inverted ladder; client copies at `v2/fixtures/licensing.ts:68-93` and `v2/fixtures/onboarding-data.ts:21-57`; `surfaces/Onboarding.tsx:358-385` "Modules provisioned" |

## Already done at head — do not redo

- **Retention mail uses the one mailer.** `server/jobs/retentionCron.ts:288-332` `notifyAdmins` calls `sendGenericEmail` (`server/services/emailService.ts:396`) and raises `retention_notify_failed` when undelivered (177a0a00f). `server/jobs/__tests__/retentionCron.policies.test.ts` passes 13/13 (GTM-05).
- **One SMTP predicate, and logins refused honestly when no code can be sent.** `server/services/email/smtp-config.ts:25` is the only `isEmailConfigured`. `canDeliverLoginCode()` (`server/services/auth/login-code-delivery.ts:54`) gates `server/routes/auth.ts:682,2007` and `server/routes/authEnterprise.ts:421`, which return `AUTH_OTP_UNDELIVERABLE` instead of a false "code sent" (31a4aace7, GTM-05).
- **Sentry session replay is gone.** `client/src/utils/sentry.ts:10-13` registers only `browserTracingIntegration`, so there is no replay to disclose in DPA Annex III (GTM-16, and GTM-01 step 2's Sentry clause no longer applies).
- **`MCP_ENABLED` is rendered by Terraform** (`terraform/stack/main.tf:275`), and the customer-visible GA readiness probe tool is gone from `server/mcp/tools/readiness.ts` (GTM-19).
- **DPA changes already made:** the breach notice is a fixed 48 hours (cbed89866); OpenAI, Vertex and Azure apply only on an Order Form election and Moonshot is removed (d29275b1b). Do not reopen them in Stage 2.

## Work, in order

### Stage 1 — Login codes reach the inbox from one authenticated domain, and users can reach a human (Phase 0 · M · mixed) — closes GTM-05, GTM-07

GTM-05 and GTM-07 share the domain decision (F-4), the same env-var rendering in Terraform, and the same line in `server/services/emailService.ts:243`, so they land together. The `Shell.tsx` menu change also hides "Codebase coverage" (part of GTM-22), because it is the adjacent line.

1. Re-confirm GTM-05 and GTM-07 at the current head (statuses here are from 94b4f9238).
2. Founder (F-4): pick the single product domain and a sending subdomain (for example `mail.<domain>`). Move SES out of the sandbox in `us-east-1`. Create `support@` and `security@` mailboxes on that domain, plus a shared-inbox or ticket tool, and name the Sev-1 contact. Fill `docs/commercial/SUPPORT_POLICY.md:28-31`, and make `docs/connector/SUPPORT.md:3,13` and `SECURITY.md:17,150` name the same addresses on the same domain.
3. Terraform, SES identity. Create `terraform/modules/ses-identity` with `aws_sesv2_email_identity` (domain identity, Easy DKIM `RSA_2048_BIT`) and `aws_sesv2_email_identity_mail_from_attributes` (MAIL FROM subdomain, `behavior_on_mx_failure = "REJECT_MESSAGE"`). Output the three DKIM CNAMEs, the MAIL FROM MX, the SPF TXT `"v=spf1 include:amazonses.com -all"` and a DMARC TXT `"v=DMARC1; p=quarantine; rua=mailto:dmarc@<domain>"`. If the zone is in Route 53, add `aws_route53_record` resources gated on a new optional `var.dns_zone_id`; otherwise surface the records in `terraform/stack/outputs.tf` for the registrar. Instantiate the module from `terraform/stack/main.tf`.
4. Terraform, variables. In `terraform/stack/variables.tf` add `mail_domain`, and a validation on `smtp_from` (`:292-299`) requiring its domain to equal `var.mail_domain` or end with `"." + var.mail_domain`. Add required `support_email` and `security_contact_email` (no default, same email regex as `smtp_from`). Render `MAIL_DOMAIN`, `SUPPORT_EMAIL` and `SECURITY_CONTACT_EMAIL` in the env list in `terraform/stack/main.tf` next to `SMTP_FROM` (about `:288`), and add the last two to `docker-compose.yml` and `docker-compose.beta.yml` as `${VAR:?…}`. In `terraform/stack/tests/boot_contract.tftest.hcl` add one run with a mismatched `smtp_from` (`expect_failures = [var.smtp_from]`) and one that omits `support_email`. Show both failing to fail before adding the validations.
5. Remove silent defaults. In `server/services/emailService.ts:40` delete the `'noreply@concept2cure.pro'` fallback. In `server/services/email/smtp-config.ts:25` make `isEmailConfigured()` also require `SMTP_FROM` when `NODE_ENV==='production'`, so signup (`server/routes/auth.ts:933-940`) and login (`login-code-delivery.ts:54`) refuse honestly. Replace the hard-coded `https://concept2cure.com` fallbacks at `emailService.ts:102-106,253-255,303` with the deployment origin (`APP_URL`, the source `resolveAppBaseUrl` uses in `routes/auth.ts`). Replace `support@concept2cure.com` at `:243` with `process.env.SUPPORT_EMAIL`, and omit the sentence when it is unset. In `server/routes/well-known.ts:16` remove the `security@concept2cure.pro` fallback: in production with `SECURITY_CONTACT_EMAIL` unset, `/.well-known/security.txt` returns 404 and boot logs a CRITICAL line; outside production keep an obviously fake dev value.
6. One mailer. Add `scripts/ci/single-mail-transport.mjs` and `npm run ci:single-mail-transport`: it fails when any non-test file under `server/` other than `server/services/emailService.ts` imports `nodemailer` or calls `createTransport(`. Add a `:selftest` that plants a temporary second transport and expects failure. Run it at HEAD and show it failing on `server/services/notify.ts`. Then delete `server/services/notify.ts` and its re-export at `server/services/index.ts:77`; `grep -rn notifyOverride` finds no other caller and it has no route or UI, so no user-facing capability is lost. Name `sendGenericEmail` (`emailService.ts:396`) as the canonical mail path in the commit message. Add the gate to `.husky/pre-push`.
7. Readiness, not a log line. In `server/startup/services.ts:284-303` (production only), require `SMTP_FROM`'s domain to equal `MAIL_DOMAIN`. When `SMTP_HOST` matches `/^email-smtp\.[a-z0-9-]+\.amazonaws\.com$/`, call SESv2 `GetEmailIdentity(MAIL_DOMAIN)` and require `VerifiedForSendingStatus===true` and `DkimAttributes.Status==='SUCCESS'`. On failure mark the deployment not-ready through `server/startup/readiness-state.ts` so `/readyz` reports it. Grant `ses:GetEmailIdentity` on that identity to the ECS task role in `terraform/modules/ecs-fargate`.
8. A human channel in the product. Add `supportEmail` (string or null, from `process.env.SUPPORT_EMAIL`) to the `GET /api/auth/me` payload (`server/routes/auth.ts:1631`). In `client/src/concept2cure/v2/Shell.tsx` add `{ label: 'Contact support', ic: 'mail', action: 'contact-support' }` next to "Get help" (`:376`; the icon exists at `client/src/concept2cure/v2/icons.tsx:259`). Handle it in the click handler at `:457-460` by opening `mailto:${supportEmail}` with a subject and a body pre-filled with organisation name and id, user email, current surface or route, the last `X-Request-Id` seen by `client/src/concept2cure/v2/dataConnect.tsx` (expose it from the existing support-handle state at `:509-540`), UTC time and build id. When `supportEmail` is null, render the item disabled with "Support contact not configured for this deployment". Keep "Get help" on AnA; this adds a channel and replaces nothing. Add the same "Contact support" link, carrying that error's request ID, to the error panel in `dataConnect.tsx:509-540`.
9. In the same menu block, show "Codebase coverage" (`Shell.tsx:375`) only to platform admins. The `Coverage.tsx` route stays reachable for them.
10. Founder or ops, before any tester session on staging and again on production: run `node scripts/ops/verify-otp-delivery.mjs` against the environment with a Gmail inbox, an M365 inbox and, if possible, the pilot customer's domain. Keep the `Authentication-Results` headers showing `spf=pass`, `dkim=pass` and `dmarc=pass`, and send a test message to `support@` and `security@`.

**Acceptance**

- Failing first: a production-mode test in `server/services/auth/__tests__/login-code-delivery.test.ts` with `SMTP_HOST/USER/PASS` set and `SMTP_FROM` unset sees `canDeliverLoginCode()===true` at HEAD. After the fix it is `false`, and `POST /api/auth/login` answers `AUTH_OTP_UNDELIVERABLE`.
- `npm run ci:single-mail-transport` fails at HEAD on `server/services/notify.ts`, its selftest fails on a planted transport, and it passes after the deletion.
- `grep -rn "concept2cure\.\(pro\|com\)" server/services/emailService.ts server/routes/well-known.ts` returns nothing.
- Terraform tests: a mismatched `smtp_from` and a missing `support_email` each fail validation; `terraform plan` shows `aws_sesv2_email_identity` and outputs for the DKIM, SPF and DMARC records; the rendered task definition contains `MAIL_DOMAIN`, `SUPPORT_EMAIL` and `SECURITY_CONTACT_EMAIL`.
- A unit test with a mocked SESv2 client returning `DkimAttributes.Status='PENDING'` makes readiness report not-ready.
- A server test with `NODE_ENV=production` and `SECURITY_CONTACT_EMAIL` unset gets 404 from `/.well-known/security.txt`.
- A new test under `client/src/concept2cure/v2/__tests__/` renders the account menu with `supportEmail='support@example.test'` and expects a "Contact support" item whose activation builds a `mailto:` URL containing the org id, the surface and the last request ID. It fails at HEAD. With `supportEmail=null` the item renders disabled with the "not configured" text. A non-platform-admin menu has no "Codebase coverage" item.
- `grep -rn "support@\[domain\]\|to be confirmed" docs/commercial/SUPPORT_POLICY.md docs/connector/SUPPORT.md` returns nothing, and every support and security address in `SECURITY.md`, `docs/commercial/` and `docs/connector/` uses one domain.
- Operational, recorded by the founder: an OTP at Gmail and M365 from staging and from production shows `spf=pass`, `dkim=pass`, `dmarc=pass`; test mail to `support@` and `security@` creates an inbox item or ticket.

### Stage 2 — A signable pilot agreement and DPA (Phase 1 · M · founder and counsel) — closes GTM-01

1. Re-confirm GTM-01 at the current head (statuses here are from 94b4f9238).
2. Founder (F-19): decide the contracting entity (exact legal name, entity type, jurisdiction, registered address) and the signatory. Replace `[CONCEPT2CURE LEGAL ENTITY NAME]` and the adjacent `[STATE/COUNTRY] [entity type] … [ADDRESS]` in `docs/commercial/MASTER_SUBSCRIPTION_AGREEMENT.md:14`, `DATA_PROCESSING_ADDENDUM.md:16`, `PILOT_AGREEMENT.md:16-17`, `ORDER_FORM.md:16` and `PARTNER_HUB_APPLICATION.md:21`. The product's own copy of the entity name (`ZenSignup.tsx:778,854`) is removed in Stage 4; any entity name the product still shows must match.
3. Name the transactional-mail subprocessor (the SES account chosen in Stage 1) and the uptime-monitoring subprocessor in DPA Annex III (`:268-269`), with region and DPA reference. Sentry replay is already removed (see "Already done"), so the Sentry row needs no replay disclosure.
4. Counsel completes DPA Annex IV (`:275-279`): SCC module, Annex I.A/I.B/I.C, supervisory authority and the UK Addendum tables. Alternatively, counsel states in the annex that the pilot processes data only in `us-east-1` with no restricted transfer, and that the annex applies only if one occurs.
5. Fill insurance in MSA §18 (`:361-364`) and Pilot §14 (`:350-353`) with coverage actually bound (technology E&O and cyber, with limits). If none is bound, counsel decides whether to delete the section. Never state coverage that is not held.
6. Fill governing law, venue and notice addresses (MSA `:368-370`; Pilot `:376-390`) and resolve every `[Counsel: …]` note (DPA `:142,189`; Pilot `:255,317,352,378`).
7. While counsel has the pack, have counsel also produce the Terms of Service, Privacy Policy and Acceptable Use Policy that Stage 4 publishes, and a data-return clause that cites the Stage 6 archive format and link expiry.
8. Counsel reviews the Pilot Agreement, DPA, Order Form and Support Policy. After sign-off, replace each "DRAFT — FOR LAWYER REVIEW" banner with a version line (`v1.0, approved by <counsel> on <date>`). Keep the signed approval in the company records outside the repository (F-22); the repository line is a pointer, not the evidence.
9. Add `scripts/ci/check-legal-pack-placeholders.mjs`. It fails if `PILOT_AGREEMENT.md`, `DATA_PROCESSING_ADDENDUM.md`, `MASTER_SUBSCRIPTION_AGREEMENT.md` or `ORDER_FORM.md` contain `DRAFT — FOR` or any `[` placeholder outside an allowlist of deal fields (`[DATE]`, `[CUSTOMER LEGAL NAME]`, `[CUSTOMER]`, `[C2C-OF-YYYY-NNN]`, `[NAME, TITLE, EMAIL]`, `[90]`). Run it at HEAD and show it failing on the entity placeholder. Wire it into `package.json` as a non-blocking report until step 8 is done, then make it blocking.

**Acceptance**

- Failing first: at HEAD the step-9 check, or `grep -n 'LEGAL ENTITY NAME\|counsel to complete\|founder to name\|DRAFT — FOR' docs/commercial/{PILOT_AGREEMENT,DATA_PROCESSING_ADDENDUM,MASTER_SUBSCRIPTION_AGREEMENT,ORDER_FORM}.md`, returns matches. After the fix it returns none, and only allowlisted deal-field brackets remain.
- DPA Annex III names every subprocessor with region and terms; Annex IV is complete or counsel has marked it not applicable for the pilot.
- The entity name in the templates matches any entity name the product shows.
- Off-repo, confirmed by the founder: a counsel sign-off and a pilot agreement plus DPA executed by both parties.

### Stage 3 — Close the front door: signup off by default, plan limits, an enforced AI cost cap, no seat self-grant (Phase 1 · M · engineering) — closes GTM-06, GTM-08

Stage 3 lands before Stage 4: with signup closed in production, consent is captured on the invitee path that Stage 4 adds, and the signup-path consent only matters where the founder opens signup.

1. Re-confirm GTM-06 and GTM-08 at the current head (statuses here are from 94b4f9238).
2. Founder: confirm F-3 (self-serve signup off for the pilot) and set the free-plan weekly AI cost cap. The defaults below work without the decision: off in production and a conservative `cost_cents` cap.
3. Config. In the `server/config` module that already exports `config.billing`, add a typed `selfServeSignup: 'off' | 'allowlist' | 'open'` from `SELF_SERVE_SIGNUP`, defaulting to `'off'` when `NODE_ENV==='production'` and `'open'` otherwise; an unknown value is `'off'`. Add `signupAllowedDomains` from `SIGNUP_ALLOWED_DOMAINS` (comma-separated, lowercased).
4. Gate. In `server/routes/auth.ts` `POST /signup` (`:887`), straight after `signupSchema.safeParse` and before password policy or any DB call, return `403 { success:false, error:{ code:'AUTH_SIGNUP_CLOSED', message:'Sign-up is by invitation. Ask your organisation administrator for an invitation.' } }` when the mode is `'off'`, or `'allowlist'` with a domain not in the list. Log one info line without the email address. Invitations (`POST /api/tenant-users/invitations/:invitationId/accept`, `server/routes/tenant-users.ts:202`) and platform-admin tenant creation (`POST /api/tenants`, `server/routes/tenants-simple.ts:160`) are unaffected.
5. Client. Add public `GET /api/auth/signup-availability` returning `{ mode }`. In `client/src/concept2cure/auth/ZenSignup.tsx` call it on mount and render an honest "Sign-up is by invitation" state with a link to login when the mode is `'off'`, and handle `AUTH_SIGNUP_CLOSED` from the POST. Hide any "Create account" link on the login page when off. Keep the `/concept2cure/signup` route (`client/src/concept2cure/router/ZenRouter.tsx:210-214`) so no capability is deleted.
6. Terraform. Add `self_serve_signup` (default `"off"`, validated against the three values) and `signup_allowed_domains` (default `""`) to `terraform/stack/variables.tf`; render them next to `SMTP_FROM` in `terraform/stack/main.tf` (about `:288`) and add them to `docker-compose.yml` and `docker-compose.beta.yml`.
7. Plan limits at creation. Next to `DTC_PRICING` in `server/services/billing.ts:104`, export `limitsForTier(tier)` returning `{ seatsPurchased, maxUsers, maxProjects, maxStorage }` from the plan table. Use it in the signup insert at `auth.ts:1018` (`.values({ …, tier: 'free', ...limitsForTier('free') })`) and in the `POST /` org insert in `server/routes/tenants-simple.ts`, honouring an explicit platform-admin override. Do not change the `shared/schema.ts:172-179` column defaults; if they must change, amend the creating migration in place with a dated header note (Rule 1). When Stage 5 settles the single catalog, `limitsForTier` reads from it.
8. Default AI cost cap. In the `runWithTenantScope` block after `provisionLaunchModules` (`auth.ts` about `:1090-1100`), call `setWeeklyLimit(result.org.id, { metric:'cost_cents', weeklyLimit:<free cap>, overageCapPct:0, overageHardCap:null, warnThresholdPct:80, weekStartDow:1, enabled:true }, { userId: result.user.id }, 'Plan default at provisioning: free')` from `server/services/weekly-usage-limits.ts:278`. Do the same in `tenants-simple.ts` with the operator's chosen plan.
9. Enforce cost at the one choke point. In `server/services/ai-gateway/gateway.ts`, next to `this.policyEngine.evaluate(request)` (`:1418`) and before the provider call, call `checkWeeklyLimit(orgId, 'cost_cents', 0)`. When `decision.allowed===false`, refuse with a typed `USAGE_LIMIT_REACHED` error that routes map to 429, and audit the refusal. This covers every AI route, not only `/api/ana`, `/api/ana-ri` and `/api/chat`. Keep the existing fail-open behaviour on a metering outage, but raise `reportSecurityAlert` so it is visible.
10. Seats. In `server/routes/billing-dashboard.ts:747` replace `requireRole('admin','owner')` on `PUT /seats` with the platform/master-admin guard, so seats change only through a platform admin or the Stripe webhook. Org admins keep a read-only view.

**Acceptance**

- Failing first: a route test with `NODE_ENV=production` and `SELF_SERVE_SIGNUP` unset POSTs a valid body to `/api/auth/signup`. At HEAD it passes validation (201, or 503 with SMTP mocked off). After the fix it gets 403 `AUTH_SIGNUP_CLOSED` and no `organizations` insert is attempted.
- With `SELF_SERVE_SIGNUP=allowlist` and `SIGNUP_ALLOWED_DOMAINS=acme.com`, `a@acme.com` proceeds and `a@other.com` gets 403. With signup off, invitation accept and platform-admin `POST /api/tenants` still succeed.
- `tests/db/signup-launch-catalog.dbtest.ts` extended: a self-serve org has `seats_purchased=1`, `max_users=1`, `max_projects=2`, `max_storage=1` and a `weekly_usage_limits` row with `metric='cost_cents'` and `enabled=true`. It fails at HEAD (5/5/10/5, no row).
- A gateway unit test: an org at or above its weekly `cost_cents` cap gets `USAGE_LIMIT_REACHED` on a non-chat AI call, and the provider mock is never invoked.
- Terraform test: `self_serve_signup` defaults to `"off"` and the rendered task definition contains `SELF_SERVE_SIGNUP=off`.
- A `ZenSignup` component test renders the invitation-only state when signup-availability returns `'off'`.
- Failing first: an org-admin `PUT /api/billing/seats` succeeds at HEAD and gets 403 after the fix; a platform admin still succeeds.

### Stage 4 — Published terms, recorded consent, honest signup copy (Phase 1 · M · mixed) — closes GTM-02

The mechanism can be built now. The seed migration carrying the agreement text lands only with counsel-approved text from Stage 2, because a seeded row can never be corrected in place, only superseded by a new version row (Rule 1).

1. Re-confirm GTM-02 at the current head (statuses here are from 94b4f9238).
2. Ledger into the migration set. Add `migrations/<YYYYMMDD>_license_agreements_ledger.sql` and append it to `C2C_MIGRATION_FILES` (`scripts/db/migration-set.mjs:86`) before the final sweep pair (`ci:migration-set-order` enforces this). It must:
   - `CREATE TABLE IF NOT EXISTS public.license_agreements` and `public.license_acceptances`, column for column as in `server/services/licensing/eula-service.ts:113-147`, so tables already made at runtime are adopted unchanged;
   - add `body_sha256 TEXT` to `license_agreements` with `ADD COLUMN IF NOT EXISTS`;
   - refuse `UPDATE` and `DELETE` on `license_acceptances` with a trigger (append-only);
   - seed the counsel-approved `tos`, `privacy` and `aup` rows (version, title, url `/concept2cure/legal/<key>`, body, `body_sha256`) with `INSERT … ON CONFLICT (agreement_key, version) DO NOTHING`, followed by a row-count assertion that `RAISE`s if fewer than 3 are present;
   - mark the bodiless `2026.06` `eula` and `tos` rows superseded with `UPDATE … SET status='superseded', superseded_at=NOW() WHERE agreement_key IN ('eula','tos') AND version='2026.06' AND body IS NULL` (idempotent on replay).
   `license_agreements` is a global catalog with no `organization_id`: register it, with a written reason, in the RLS allowlist that `scripts/ci/check-rls-allowlist-sync.mjs` reads. `license_acceptances` keeps `organization_id INTEGER`; make it `NOT NULL` inside a `pg_get_constraintdef`/`attnotnull` guard.
3. In `eula-service.ts` delete the runtime `CREATE TABLE` and seed in `ensureSchema` (`:109-167`) and replace them with a `to_regclass` presence check that throws (fail closed). Change `recordAcceptance` (`:249`) to `recordAcceptance(input, client = pool)` and write the acceptance row plus a chained audit row (`writeChainedAuditRow`, as `membership-change.ts` does) on that client.
4. Publish the documents. Add public, unauthenticated `GET /api/licensing/public/:key` to `server/routes/licensing.ts`, mounted outside the auth chain, returning `{ key, version, title, body, effectiveAt }` for the active version or 404. Add `/concept2cure/legal/terms`, `/concept2cure/legal/privacy` and `/concept2cure/legal/aup` to `client/src/concept2cure/router/ZenRouter.tsx` above the catch-all at `:254`. They render a new `LegalDocumentPage` that sanitises the body, shows version and effective date, and shows an explicit error state, never a blank page or redirect, when the fetch fails.
5. Signup copy (`ZenSignup.tsx`):
   - delete the inline Terms and Privacy prose (scroll boxes at about `:755-812` and `:833-905`), including "Concept2Cure, Inc." (`:778,854`), the HIPAA sentence (`:801`), the 3-month minimum (`:795`) and the footer (`:990`);
   - replace them with one factual summary consistent with DPA §4.1 and links to the three pages;
   - fetch the active versions from the step-4 endpoint on mount, and disable submit with an honest error if they cannot be loaded;
   - remove the AI Model Improvement toggle (`:715`, `:910-930`): it has no server consumer, so no capability is lost; say so in the commit message;
   - reword the HIPAA mention in the compliance acknowledgement (`:948`) so it does not imply HIPAA compliance;
   - add `acceptedAgreements: [{ key:'tos', version }, { key:'privacy', version }, { key:'aup', version }]` to the request body at `:299-317`.
6. Server signup. Add a required `acceptedAgreements` array to `signupSchema` (`server/routes/auth.ts:174-202`). Before any write, return 400 `TERMS_NOT_ACCEPTED` when it is missing or does not match the active required versions. Inside the signup `db.transaction` (`:1009`), after the org and user rows exist, call `recordAcceptance` once per agreement on the transaction client (method `'clickwrap'`, with client IP and user agent), so an acceptance failure rolls the account back.
7. Every user, not only signups. Mount `requireLicenseAcceptance()` (`server/middleware/requireLicenseAcceptance.ts:17`) in the authenticated chain (`server/middleware/auth.ts` or the bootstrap that registers authenticated `/api` routes), with carve-outs for `/api/auth/*`, `/api/licensing/*`, session refresh, logout, billing and tenant export. Change its catch (`:49-52`) to return 503 `LICENSE_STORE_UNAVAILABLE` instead of calling `next()`, and `acceptUrl` (`:45`) to `/concept2cure/legal/accept`. In the shared `apiRequest` helper, handle 403 `LICENSE_ACCEPTANCE_REQUIRED` centrally by routing to a `/concept2cure/legal/accept` page that lists outstanding agreements and POSTs `/api/licensing/agreements/:id/accept` for each. This page is how invitees, who never see signup, and every future version bump capture acceptance.
8. Links. Confirm the email footer links (`server/services/emailService.ts:102-104,253-255`) now resolve to the pages. Add Privacy Policy and Terms links to the MCP consent page (`server/mcp/auth/consent.ts`) and to the OAuth metadata; this is GTM-19's consent-page item, which Stage 10 then only verifies.

**Acceptance** (each fails at HEAD first)

- `POST /api/auth/signup` without `acceptedAgreements` returns 400 `TERMS_NOT_ACCEPTED` and writes no `users`, `organizations` or `organization_users` row. At HEAD the field is ignored and the account is created.
- A successful signup writes exactly one append-only `license_acceptances` row per required agreement with `acceptance_hash`, `ip_address` and `user_agent`, plus a chained audit row, in the signup transaction. An injected acceptance-insert failure returns 500 and leaves no user or org row.
- `/concept2cure/legal/terms`, `/privacy` and `/aup` render the counsel-approved text with its version and do not redirect to `/concept2cure` (router test on `LegalDocumentPage`).
- The rendered signup page contains none of "HIPAA protections for health data", "3-month minimum" or the AI Model Improvement toggle, and the submitted body includes `acceptedAgreements`.
- With the middleware mounted, an invited user with no acceptance gets 403 `LICENSE_ACCEPTANCE_REQUIRED` on a launch API, 200 on `/api/licensing/agreements/outstanding`, and is routed to the accept page; after accepting, the same call succeeds. A licensing-store error yields 503, not access.
- `license_agreements` and `license_acceptances` are created by a file in `C2C_MIGRATION_FILES`; `eula-service.ts` contains no `CREATE TABLE`; an `UPDATE` on `license_acceptances` is refused by the trigger.
- The MCP consent page links the Privacy Policy and Terms.

### Stage 5 — One server-served plan catalog that lists only what ships, on a rising price ladder (Phase 1 · M · mixed) — closes UX-05, GTM-12

GTM-12's register entry proposes a new `GET /api/billing/plans`; UX-05 extends the existing `GET /api/billing/pricing`. Extend the existing endpoint and add no new one (zero duplication). GTM-12 is UNVERIFIABLE because the packaging decision is the founder's; it settles when F-20 is recorded in this stage's commit message and the catalog test below enforces it.

1. Re-confirm UX-05 and GTM-12 at the current head (statuses here are from 94b4f9238).
2. Founder (F-20, content only): approve per family (pharma, medtech, academic) and per tier a feature list drawn only from `LAUNCH_APPS` in `shared/constants/launch-scope.ts`: Projects, Vault, Authoring, Submission Center (eCTD v3.2.2 + FDA ESG), Submission Readiness, QMS controlled documents, Reporting & analytics, CMC / Module 3 (worded to its boundary: small-molecule Module 3 for a US IND), and the remote MCP connector, plus support, SSO and audit-pack items. Approve a monotonic price ladder and the pilot SKU. Decide with counsel whether "SLA Guarantee" and "On-Prem Option" may appear at all. Decide which server table survives, `PRICING` (`server/services/billing.ts:193-321`) or `DTC_PRICING` (`:104-117`); the other is deleted in this change and `limitsForTier` (Stage 3) reads the survivor. Steps 4–10 can be built against placeholder approved lists while the decision is pending.
3. Write `server/services/__tests__/billing-pricing-catalog.test.ts` first and show it failing on HEAD data. Extract the per-seat amount logic in `createCheckoutSession` (`billing.ts:383-391`) into an exported pure `computePerUserAmount(tierPricing, seats)` and call it from `createCheckoutSession`. The test asserts: for each family, `computePerUserAmount` does not decrease as tier level rises for seats in {1, 5, 10, 25, 50}; every feature string is in an allowlist built from `LAUNCH_APPS` labels plus the approved non-module items; custom-priced tiers expose no numeric price.
4. Replace every `features` array in the surviving catalog with the approved lists. Remove "Custom AI Models" (Rule 2), "510(k) Module", "510(k) Workflow", "CER Generation", "Basic CER", "Biostatistics Module", "eSTAR Builder", "EU MDR/IVDR Support", "GSPR Mapping" and "Predicate Intelligence" unless the founder puts them in the catalog. Set the Professional `perUserMonthly` values (`:211`, `:256`, `:296`) to the approved ladder and correct the comment at `:211`.
5. Make the API servable. Extend `GET /api/billing/pricing` (`server/routes/billing.ts:193-212`) to return per tier: `name`, `tier`, `perUserMonthly` (dollars, null when custom), `annualDiscountPct`, `includedTokensMonthly`, `maxProjects` (-1 for unlimited), `maxStorageGB`, `minCommitmentMonths` and `features`, plus top-level `bundles` (`BUNDLE_DISCOUNTS`) and `tierLevels`. Accept `family` alongside `industry`. Change `GET /api/billing/dtc-pricing` (`:263-277`) to return `baseMonthly: null` for custom-priced tiers (today `0`, which reads as Free) and -1 for unlimited. Add a route test for both shapes.
6. `client/src/concept2cure/v2/surfaces/LicensingSurface.tsx`: drop the `LIC_DTC`, `LIC_PRICING` and `licBundle` imports (`:16-23`); read `useLiveData('/api/billing/pricing?family=' + family)` and `useLiveData('/api/billing/dtc-pricing')`; compute the bundle from the returned `bundles`; on a failed read render dataConnect's `ErrorState` and never fall back to a constant. Rewrite the header comment (`:8-14`) and footer note (`:541-547`) so neither claims a client mirror.
7. `client/src/concept2cure/v2/surfaces/Onboarding.tsx`: replace `:322-327` with the same two reads, with loading and error states. Replace `provisionedFeatures()` (`:358-385`) and the step block (`:1094-1112`) with either (a) the modules the server would actually grant, from a new `GET /api/billing/tier-modules?tier=` that shares one pure helper with `provisionModulesForTier` (`billing.ts:943-976`) so they cannot drift, or (b), if the founder prefers, a step relabelled "Plan includes" showing only approved features. Rewrite the DATA HONESTY comment (`:250-268`).
8. Remove the duplication. Delete `LIC_DTC`, `LIC_PRICING`, `LIC_BUNDLES`, `licBundle` and their price interfaces from `client/src/concept2cure/v2/fixtures/licensing.ts` (`:15-40`, `:68-93`, `:108-113`, `:133-end`) and from `fixtures/onboarding-data.ts`. Keep one copy of `LIC_ARCHETYPES`, `LIC_TIER_LEVEL` and `LIC_ROLES` in `fixtures/licensing.ts`; delete the duplicates from `onboarding-data.ts`, or the whole file if nothing remains. Repoint imports in `surfaces/Onboarding.tsx`, `__tests__/onboardingActivation.test.ts`, `surfaces/licensing/TrialsPanel.tsx` and `surfaces/AdminSurfaces.tsx`. No capability is removed: the plan cards still render in `LicensingSurface.tsx` and `Onboarding.tsx`, now from the API; name both in the commit message.
9. Add `scripts/ci/check-client-pricing-constants.mjs` (`npm run ci:client-pricing-constants`): it fails if any file under `client/src` exports `LIC_PRICING` or `LIC_DTC`, or assigns a numeric literal to `perUserMonthly` or `baseMonthly`. Give it a `--self-test` on an inline fixture. Run it at HEAD and show it failing. Wire it into the lint job in `.github/workflows/ci.yml` and `.husky/pre-push`.
10. Update `client/src/concept2cure/v2/__tests__/onboardingActivatesPlan.test.tsx` to mock both endpoints, and add DOM tests showing both surfaces render tier cards from the mocked API and render `ErrorState` with no cards on a 500.

**Acceptance**

- `billing-pricing-catalog.test.ts` fails on HEAD data (Professional below Standard; "510(k) Module" and "Custom AI Models" outside the allowlist) and passes after the change.
- `npm run ci:client-pricing-constants` exits non-zero at HEAD, its self-test shows the failure, and it exits 0 after step 8.
- `grep -rn "LIC_PRICING\|LIC_DTC\|perUserMonthly: [0-9]" client/src` returns nothing, and only one plan table remains in `server/services/billing.ts`.
- Both surfaces render tiers from the mocked endpoints, and a 500 renders `ErrorState` with no price cards.
- The onboarding step no longer says "Modules provisioned" for anything the server does not grant: a test compares its list with the shared provisioning helper per tier, or the step reads "Plan includes" with approved features only.
- `/dtc-pricing` returns `null`, not `0`, for a custom-priced tier.
- The founder's approval of ladder, feature lists and pilot SKU is recorded in the commit message.

### Stage 6 — Return every stored file before any purge (Phase 1 · L · engineering) — closes GTM-04

1. Re-confirm GTM-04 at the current head (statuses here are from 94b4f9238).
2. Write the purge test first. A DB-tier test seeds a tenant with Vault objects, takes the digest from `GET /api/tenant-export/full`, calls `purgeTenant`, and expects refusal `EXPORT_MISSING_FILES`. Show that at HEAD the purge succeeds and deletes the objects.
3. Schema (Rule 1, additive). Add `migrations/<YYYYMMDD>_tenant_export_archive.sql`, appended to `C2C_MIGRATION_FILES` (`scripts/db/migration-set.mjs:86`) before the final sweep pair. Create `public.tenant_export_jobs` (`id BIGSERIAL`, `organization_id INTEGER NOT NULL`, `requested_by INTEGER NOT NULL`, `status TEXT CHECK (status IN ('queued','running','succeeded','failed'))`, `storage_key`, `rows_digest`, `files_manifest_digest`, `file_count BIGINT`, `byte_count BIGINT`, `error`, `created_at`, `started_at`, `finished_at`). `ALTER TABLE tenant_export_receipts ADD COLUMN IF NOT EXISTS file_count BIGINT, files_manifest_digest TEXT, covers_files BOOLEAN NOT NULL DEFAULT FALSE`; receipts written before the change keep `covers_files = false`.
4. Archive builder. In `server/services/tenant-export/tenant-full-export.service.ts` add `exportTenantArchive(pool, orgId, jobId)`:
   - call `exportTenantFull` (`:306`) for rows and `digestOf` (`:294`) for `rows_digest`;
   - enumerate every stored object of the org: `vault.documents.storage_version_id/storage_provider` (the same set `public.purge_tenant_vault_records` returns), rendered eCTD leaf files (`server/services/ectd/rendered-leaf-files.ts:97`) and module attachments (`server/routes/moduleIntegrationRoutes.ts:465`); grep for any other `getStorageProvider().put` caller and include it; put this enumeration in one exported function, because step 6 reuses it;
   - stream each object with `getStorageProviderFor(provider).get(versionId, orgId)` (`server/services/storage/storage-provider.ts:80`) into a ZIP built with `archiver` (`package.json:539`, 7.0.1): `rows/*.json`, `files/<sourceTable>/<rowId>/<versionId>-<filename>`, and `manifest.json` listing source table, row id, version id, byte size and sha256 per file;
   - on any null or throwing `get`, mark the job failed and write no receipt: a partial archive is never a data return;
   - upload the ZIP through the storage provider under an org export prefix (SSE-KMS on S3);
   - on success write the receipt with `covers_files = true`, `file_count` and `files_manifest_digest`; the receipt digest becomes sha256 over (`rows_digest`, `files_manifest_digest`).
5. Routes (`server/routes/tenant-export.ts`, same `isAdmin` check as `:79`). Add `POST /api/tenant-export/full/jobs` → 202 `{ jobId }`, running off-request with a durable job row that is resumable or explicitly fails on restart; and `GET /api/tenant-export/full/jobs/:id` → status and, on success, a pre-signed URL from `getSignedUrl` (`storage-provider.ts:103`, expiry at most 24 h) plus the receipt digest. Keep `GET /full` (`:172`) as a rows-only view whose receipt stays `covers_files = false` and whose body says "not sufficient for purge".
6. Purge gate. Extend `findExportReceipt` (`tenant-full-export.service.ts:494`) to return `covers_files` and `file_count`. In `assertPurgePermitted` (`server/services/tenant/tenant-offboarding.ts:294-352`) throw `OffboardingStateError('EXPORT_MISSING_FILES', …)` when `covers_files` is false or `file_count` is below the org's current stored-object count from the step-4 enumeration.
7. UI. In `client/src/concept2cure/v2/surfaces/ComplianceReports.tsx`, beside `AuditAttestation` (`:39`), add "Export all organization data": it starts the job, polls status, then shows digest, file count and the download link. Failures show the server's message, never an empty success.
8. Production storage: the S3 export prefix or bucket with KMS goes into the production Terraform stack (coordinate with MR-03).

**Acceptance**

- Failing first: the step-2 test passes the purge at HEAD; after the fix the purge is refused with `EXPORT_MISSING_FILES`.
- A service test with a fake storage provider holding 3 objects across 2 source tables yields a ZIP with 3 files whose manifest sha256s match the bytes; an org with N stored objects yields `file_count = N`.
- When one object's `get` returns null, the job ends `failed` with a message and no receipt row is written.
- A receipt from a succeeded archive job permits the purge, and `storageErasure.objects` equals the receipt's `file_count`.
- Route test: POST returns 202 and GET reaches `succeeded` with a pre-signed URL that expires.
- An org admin starts the export from the UI and downloads it.
- Staging: a tenant with about 1 GB of Vault objects exports with no request timeout.

### Stage 7 — Billing that production can run and that cannot drift (Phase 3 · L · engineering) — closes GTM-09, GTM-10, GTM-11

The pilot is invoiced manually under the signed pilot agreement, so this stage is GA work. It assumes Stage 5's single catalog.

1. Re-confirm GTM-09, GTM-10 and GTM-11 at the current head (statuses here are from 94b4f9238).
2. Production Stripe (GTM-10). Put the Stripe secret key and webhook signing secret in Secrets Manager in `terraform/stack/main.tf` and inject them into the task definition; today `grep STRIPE terraform/stack/main.tf` finds nothing. Restrict the portal and checkout routes (`server/routes/billing.ts:97,144`) to org admin or a billing role. Carry the chosen plan through email verification in `ZenSignup.tsx` (today verification returns before the plan is used) and start checkout on first login; this applies only where Stage 3 opens signup. Add `collection_method: 'send_invoice'` for enterprise orders. Remove every overage claim from the catalog and copy until overage is billed.
3. Webhook correctness (GTM-09). In `server/routes/billing.ts:318-326` return 500, not 200 with `received: true`, when processing fails, so Stripe retries. In `server/services/billing.ts` de-duplicate an event only when its row has `processed = true`, so a failed event is retried. Add a platform-admin replay endpoint for a stored event id. Put seats and max users in the subscription metadata at checkout, so the webhook stops defaulting to 5 seats. Revoke modules on downgrade through the same provisioning helper Stage 5 shares.
4. Contract term and trial expiry (GTM-11). Add `contract_end_at` (and set `trial_ends_at` where trials exist) by amending the migration that creates `organizations` columns in place with a dated header note, or by a new additive `ADD COLUMN IF NOT EXISTS` file in `C2C_MIGRATION_FILES`; never a DROP. Add a daily sweep that moves an expired org to read-only, with admin notices at T-14 and T-3 through `sendGenericEmail`. Handle the `TENANT_*` refusal codes in the client with a banner that says what happened and whom to contact.

**Acceptance**

- Failing first: a webhook test whose processing throws gets 200 at HEAD and 500 after the fix; a replay of the stored event then succeeds and the event is marked processed.
- A checkout for a 25-seat tier yields a subscription whose webhook sets 25 seats, not 5.
- A downgrade webhook revokes modules the new tier does not include.
- A member without admin or billing role gets 403 from the portal and checkout routes.
- `terraform plan` shows the Stripe secrets in Secrets Manager and in the task definition.
- The sweep moves an org with `contract_end_at` in the past to read-only, a write returns a `TENANT_*` code, and the client shows the banner (DB-tier test plus a component test).
- No overage claim appears in `server/services/billing.ts` or `ZenSignup.tsx`.

### Stage 8 — Real admin forms and governed-workflow email (Phase 3 · L · engineering) — closes GTM-14, GTM-15

Start after MR-07 closes GTM-03 (access-change audit and last-admin guard), because the forms here write through the same audited paths.

1. Re-confirm GTM-14 and GTM-15 at the current head (statuses here are from 94b4f9238).
2. Admin console (GTM-14). In `client/.../AdminAccess.tsx` replace the `ask()` calls at `:413,531,532,552,689` ("Audit a member", "Grant access", "Audit activity", "Edit scopes", "Change setting") with forms that call `PATCH /api/organizations/:id/settings` (`organizations-routes.ts`, which exists with no client caller) and the access-grant and activity-export endpoints. Where an endpoint does not exist, add it on the canonical route file, audited, rather than a second path. Keep AnA available, but no admin action depends on it.
3. Workflow email (GTM-15). In `server/services/notifications/notification-service.ts` implement the email fan-out its header (`:14-16`) already claims: for categories a user has subscribed to, send through `sendGenericEmail` (`server/services/emailService.ts:396`), the one mailer from Stage 1, and add an opt-in daily digest. Record delivery failure on the notification row rather than dropping it; an undelivered email never marks the notification delivered. Correct the header comment to match.

**Acceptance**

- Failing first: a component test asserting AdminAccess has no `ask(` call for those five actions fails at HEAD; after the change each form submits to its endpoint and shows the server's error on failure.
- A server test: a review or signature request for a subscribed user sends exactly one email through the mocked `sendGenericEmail`; an unsubscribed category sends none; a mail failure is recorded on the notification. At HEAD no email is sent.
- `npm run ci:single-mail-transport` still passes.

### Stage 9 — Enterprise identity: per-org SSO, OIDC and domain routing (Phase 3 · L · engineering) — closes GTM-13

Move this stage into Phase 1 if a design partner mandates SSO; MR-09 Stage 6 (signing through the identity provider) depends on it.

1. Re-confirm GTM-13 at the current head (statuses here are from 94b4f9238).
2. Founder (F-24): confirm scope (OIDC, per-org SAML UI, SCIM self-service) and which IdPs the first design partners need.
3. Add `public.sso_connections` (`organization_id INTEGER NOT NULL`, protocol, metadata or discovery URL, certificates, email domains, group-to-role map, `enforce_sso` flag) in a new migration in `C2C_MIGRATION_FILES` before the final sweep pair. Move SAML configuration from the `SAML_TENANTS` env JSON into this table, reading env only as a one-time import, so there is one source.
4. Implement OIDC in `server/routes/sso.ts` where `:789,820` return 501 `SSO_NOT_IMPLEMENTED`. Add email-domain discovery and an SSO button on `ZenLogin.tsx`. Apply the IdP-group-to-role map at JIT provisioning instead of always `member`. Refuse password login for an org with `enforce_sso` set. Let org admins mint SCIM tokens, audited.
5. Add an org-admin UI for the connection (metadata upload or URL, certificate rotation, test connection). Replace the SAML default entity host `app.concept2cure.ai` in `sso.ts` with the F-4 domain.

**Acceptance**

- Failing first: an OIDC callback test gets 501 at HEAD and completes a round-trip against a mock IdP after the fix.
- SAML and OIDC round-trips against mock Okta and Entra IdPs run in CI.
- A user whose IdP group maps to `approver` is provisioned as `approver`; with `enforce_sso` on, password login is refused.
- Two orgs' connections are isolated under RLS (a cross-tenant read returns nothing).

### Stage 10 — Trust material, customer docs, connector directory readiness, honest web presence (Phase 3 · L · mixed) — closes GTM-16, GTM-17, GTM-19, GTM-20

1. Re-confirm GTM-16, GTM-17, GTM-19 and GTM-20 at the current head (statuses here are from 94b4f9238).
2. Trust (GTM-16, founder and external, F-21). Publish a trust page with the subprocessor list from DPA Annex III (Stage 2), residency (`us-east-1`), AI data terms consistent with F-5 and F-17, and the security contact from Stage 1. Write the data-subject request procedure. Engage the SOC 2 Type I auditor and book the external pen test with a two-tenant isolation test (shared with MR-04).
3. Customer documentation (GTM-17). Write a user guide and an admin guide for the launch apps, served in-app on a route rather than from developer docs. Add an external status page and customer-facing release notes.
4. Connector (GTM-19). Serve `docs/connector/README.md` at `/concept2cure/connector` (the `docsUrl` in `server/mcp/config.ts:140`) from a server route that returns 200 with the document, not the app shell. Confirm the consent-page and OAuth-metadata privacy and terms links added in Stage 4. The directory submission itself is F-26 and runs with MR-13.
5. Web presence (GTM-20). Remove the dead `/concept2cure/billing` and `/concept2cure/legal/*` entries from `client/public/sitemap.xml:22-34`, or keep the legal entries only once Stage 4 serves them. Remove "Trusted by … worldwide" from `client/index.html:39`. Make the demo request (`server/routes/auth.ts:2818`) notify the founder by email through `sendGenericEmail` or a CRM record, and fail closed: if the notification cannot be sent, the request reports failure instead of a silent success.

**Acceptance**

- Failing first: a route test gets the app shell for `GET /concept2cure/connector` at HEAD and the connector document with 200 after the fix.
- `grep -n "Trusted by" client/index.html` returns nothing; every `sitemap.xml` URL returns 200 with real content.
- A demo-request test with the mailer mocked to fail returns an error, not success; with it working, exactly one notification is sent. At HEAD nothing is sent.
- The trust page lists every Annex III subprocessor; the auditor engagement and pen-test booking are recorded by the founder (off-repo).
- The user and admin guides are reachable from the product for every launch app.

### Stage 11 — Enterprise integrations into Vault (Phase 3 · L · engineering, after founder approval) — closes GTM-18

Rule 2 forbids new integrations until the launch rows are green. This stage starts only after D1–D10 are green and the founder approves it (NEW decision below).

1. Re-confirm GTM-18 at the current head (statuses here are from 94b4f9238).
2. Reuse the existing SharePoint and Veeva clients that only `server/routes/deep-research.ts:175-221` uses today; do not write a second client. Add an import into Vault inside the Vault app that records provenance (source system, source id, source version, import time, importing user) on the Vault document and runs the same upload scanning path as any other upload (MR-08).
3. Add customer webhooks for review, sign and sequence events, with signed payloads, per-org endpoints in a `public` table with `organization_id INTEGER NOT NULL`, and an audited delivery log.

**Acceptance**

- An imported document appears in Vault with provenance fields and passes the same scan gate as an upload; a failed import leaves no partial document.
- A sign event delivers one signed webhook to the org's endpoint, and a signature mismatch is detectable by the receiver; another org receives nothing.

### Stage 12 — Product analytics and polish (Backlog · M · mixed) — closes GTM-21, GTM-22

1. Re-confirm GTM-21 and GTM-22 at the current head (statuses here are from 94b4f9238).
2. Product analytics (GTM-21). First check whether the Reporting & analytics service already records the events needed; extend it rather than building a parallel pipeline. If a table is needed, add `public.product_usage_events` (`organization_id INTEGER NOT NULL`, feature, hashed user id, time) in a new migration before the final sweep pair, and a vendor dashboard behind platform-admin. Add a privacy note to the trust page.
3. Polish (GTM-22). The "Codebase coverage" menu item is handled in Stage 1 step 9. Rename "ClinicalSageAI Public API" in `server/routes/public-api.ts:232-246`; keep accepting existing `csai_` keys while issuing new keys under the product prefix, so no customer key breaks. Document a signed deletion certificate (issued after Stage 6's purge) and a consented support-access procedure.

**Acceptance**

- `grep -n "ClinicalSageAI" server/routes/public-api.ts` returns nothing; an existing `csai_` key still authenticates in a test.
- A usage event written for org A is invisible to org B under RLS.
- The deletion certificate and support-access procedure are published with the trust material.

## Definition of done

- A pilot agreement and DPA naming the legal entity are counsel-approved and executed by both parties, and `check-legal-pack-placeholders` is blocking and green.
- On production, a login code reaches Gmail and M365 inboxes with SPF, DKIM and DMARC passing; readiness fails when the sending domain is unverified; only `emailService.ts` creates a mail transport; and every user can reach a named support mailbox from inside the product.
- Production signup is off unless configured; every user, signup or invitee, has an append-only acceptance row for the active ToS, Privacy Policy and AUP, which are published at real routes.
- The plan catalog is served by the server alone, lists only launch-catalog items, and its price ladder is monotonic under test.
- No purge can run without a receipt that covers every stored file, and an org admin can download that archive.
- Stages 7–12 are closed or explicitly carried into a later order with the founder's decision recorded.

## Founder decisions this order needs

- **F-4** — single domain, sending subdomain, SES out of sandbox, mailboxes and Sev-1 contact. Blocks Stage 1 (and the domain used in Stages 9 and 10).
- **F-19** — legal entity, signatory, counsel and insurance. Blocks Stage 2, and Stage 4's seeded agreement text.
- **F-3** — self-serve signup off for the pilot. Blocks the production default in Stage 3 (the code defaults to off without it).
- **F-20** — pilot price and packaging, one server catalog. Blocks the content of Stage 5 (and settles GTM-12), and Stage 7.
- **F-21** — SOC 2 Type I and pen test. Blocks Stage 10.
- **F-24** — enterprise identity scope. Blocks Stage 9.
- **F-26** — Connectors Directory submission. Blocks the submission step after Stage 10.
- **NEW: the free-plan weekly AI cost cap** (amount in cents, and whether a free plan exists at all). Blocks the final value in Stage 3 step 8; a conservative default ships until decided.
- **NEW: whether "SLA Guarantee" and "On-Prem Option" may be offered, decided with counsel,** and whether integrations (SharePoint/Veeva import, customer webhooks) are approved after D1–D10 are green. Blocks Stage 5's feature lists and the start of Stage 11.

## Do not

- Do not edit the legal templates to look final by removing the DRAFT banners or brackets before counsel signs off, and never state insurance that is not bound.
- Do not seed agreement text before counsel approves it. A seeded row cannot be corrected in place; a wrong text means a new version row and re-acceptance by every user.
- Do not fix pricing, signup or consent in the client only. The server rejects missing acceptance, enforces the signup mode and the cost cap at the gateway, and serves the only plan catalog; a client constant left as a fallback is a parallel source.
- Do not add a new pricing endpoint, a second mail transport or a second SSO configuration source alongside the existing one. Extend `/api/billing/pricing`, `emailService.ts` and `sso_connections` and delete what they replace in the same change.
- Do not fence, delete or omit CMC / Module 3 or Reporting & analytics from the plan catalog because older audit text lists the catalog without them. The boundary is `LAUNCH_APPS` in `shared/constants/launch-scope.ts`.
- Do not change the `shared/schema.ts` column defaults or append a DROP to remove schema; amend the creating migration in place with a dated header note (Rule 1). Do not run a purge on any tenant whose files matter until Stage 6 is closed.

## How to run this order

- Claim it with one line in `docs/work-orders/README.md` §0 before starting; release it when you stop.
- Commit to `concept2cure-v2` only; merge, never rebase.
- Show each acceptance check failing on the current code before the fix, then passing; file that evidence under `docs/evidence/MR-16/<date>/`.
- When a finding closes, update its `statusAtHead` in `docs/work-orders/MR-findings-2026-10-13.json` with the closing commit.
