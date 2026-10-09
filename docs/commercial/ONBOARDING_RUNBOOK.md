# Onboarding runbook — pilot organisation, day 0 to day 30

> **DRAFT — operational document, for founder review.** Prepared 2026-09-20
> by a Claude Code session (workstream W6). Commands and paths are taken from
> `package.json` and `scripts/` on `concept2cure-v2` as of 2026-09-20. There
> is **no** `npm run db:provision` script; provisioning is
> `scripts/db/install-fresh.mjs` followed by `npm run db:migrate:deploy`.
> Steps that depend on a launch row that is not yet green say so. This
> runbook is an operational aid referenced by the Pilot Agreement and MSA;
> it is not a warranty. Launch row moved: **D9**.

Roles used below: **Operator** = founder (or a Claude Code session acting
under the founder's account, which is how operations run today; every such
action lands in the audit trail under that account). **Customer admin** =
the customer's first administrator. **NRU** = the Named Regulatory User.

---

## Day 0 — environment and tenant

### 0.1 Confirm which environment the pilot runs on

- Production (launch row **D1** green: one AWS environment from
  `terraform/environments/production`, image promoted by
  `.github/workflows/deploy-aws.yml`, `/readyz` returning 200 with `schema`,
  `ana`, `redis`, `worker` all `ok`). This is the only environment that may
  be a system of record.
- If D1 is not green, the pilot runs on staging and Pilot Agreement §7.6
  applies: tell the customer in writing before any upload; nothing on
  staging is a Governed Record they may rely on.

### 0.2 Provision the database (fresh environment only)

```
# 1. From-scratch application schema + RLS (one supported path)
DATABASE_URL='postgres://…' node scripts/db/install-fresh.mjs

# 2. The production deploy-time migration set (idempotent; every deploy re-runs it)
DATABASE_URL='postgres://…' npm run db:migrate:deploy

# 3. Non-superuser runtime role (required for D3)
#    set APP_SERVICE_DB_PASSWORD before step 2 so deploy-migrate refreshes grants
```

`install-fresh` is idempotent over a complete database and refuses to repair
a half-provisioned one; on a database that has never been provisioned,
`deploy-migrate` fails loudly at preflight by design. In the hosted
production path `deploy-migrate` runs as a one-off ECS task on the same
image before services roll (`.github/workflows/deploy-aws.yml`).

### 0.3 Boot-time gates

```
NODE_ENV=production RLS_ENFORCE=on npm run pilot:go-no-go
```

Hard gates: schema provisioned with RLS policies; RLS enforcement posture
(hard once more than one organisation exists); no known-password demo admin;
boot secrets present (`AUDIT_HMAC_KEY`, `MFA_ENCRYPTION_KEY`, JWT secrets —
in KMS per launch row **D5**); SMTP/login-OTP delivery configured. Soft
gates: Sentry DSN; PDF export toolchain. Do not proceed on a hard failure.

### 0.4 Prove login OTP delivery to a real inbox

```
npm run pilot:verify-otp -- <customer-admin-email>
```

Email OTP is mandatory 2FA at login (`server/services/emailOtpService.ts`);
if it does not deliver, nobody can log in. Keep the script output as
evidence (`docs/evidence/onboarding/<org>/day0-otp.txt`). Ask the customer
admin to confirm receipt from their corporate mailbox (spam filters are the
usual failure).

### 0.5 Readiness and preflight snapshots

```
curl -s https://<host>/readyz | tee day0-readyz.json
node scripts/ops/ga-readiness-report.mjs      | tee day0-ga-readiness.txt
node scripts/ops/submission-preflight.mjs     | tee day0-submission-preflight.txt
npm run audit:verify:full                     | tee day0-audit-chain.txt
```

File all four with the day-0 evidence. The two report scripts are the
launch dashboard (4/40 and 2/15 on 2026-09-20); the customer will not see
them, but the founder needs the number at the start of every pilot.

### 0.6 Create the organisation and first administrator

- First organisation on a fresh install: `POST /api/setup/initialize`
  (first-run setup, `server/routes/setup.ts`) creates the organisation and
  admin user. Additional organisations: the signup flow
  (`POST /api/auth/signup`).
- Organisation creation provisions the Launch Catalog automatically. For an
  organisation created before that change:
  `npm run ops:provision-launch-modules -- --org <id>` (expect 21/21 modules
  granted).
- Set `industry_mode` to the archetype on the Order Form.
- Never use `scripts/seed-admin.mjs` or `seed-ga-demo.mjs` on a customer
  environment; the go/no-go gate fails on a known-password demo admin.
- The founder's own platform-owner account is seeded separately
  (`node scripts/seed-founder.mjs --i-know-this-is-production` with
  `FOUNDER_EMAIL` / `FOUNDER_PASSWORD` set). It is not exempt from launch
  scope.

### 0.7 Configure the AI placement for the tenant

Set `AI_PROVIDER_PLACEMENT_APPROVALS` exactly as the Order Form §4 states
(provider, region, approved data classes, intended uses, retention decision).
Production refuses to start on a missing or malformed value
(`docs/AI_SENSITIVE_DATA_PLACEMENT.md`). Do not set
`ANTHROPIC_ZERO_RETENTION=true` unless the signed agreement exists.

### 0.8 Day-0 handover checklist (send to customer admin)

- [ ] Login URL, first-admin invitation, OTP expectations (10-minute code,
      5 attempts).
- [ ] Support channel and severity definitions (`SUPPORT_POLICY.md`).
- [ ] The environment statement (production or staging) in writing.
- [ ] Current posture statement: `SECURITY.md` and validation package
      status (unsigned until **D4**).
- [ ] Export instructions (§ Day 30) so the customer knows the exit before
      the entry.

## Day 1 — first admin, MFA, launch catalog

### 1.1 First admin login and MFA proof

- Customer admin logs in: password + email OTP.
- Customer admin enrols **TOTP** (Settings → Security; `mfaService.ts`,
  RFC 6238, AES-256-GCM-encrypted secret). TOTP is per-user opt-in and cannot
  yet be enforced org-wide (`SECURITY.md` known gap); the Order Form may
  require it for the NRU, in which case verify enrolment by observing the
  audit-trail entry.
- Evidence: the `auth_audit_log` entries for the login and the MFA
  enrolment, exported from the Part 11 console. File as
  `day1-first-admin-mfa.json`.

### 1.2 Launch catalog on by default — verify from the customer's seat

With the customer admin's account, screenshot: the home rail (Projects,
Vault, Submission Center, Tasking, Explore, Quick access; no specialist
entries), the Apps catalog (six launch apps open; everything else "Not in
this release" with a lock and no switch), and one deep link to a
non-launch surface rendering the honest gate panel. This is the same
evidence set as `docs/evidence/W1/2026-09-20/`; the pilot copy goes under
`docs/evidence/onboarding/<org>/`.

### 1.3 Invite the NRU and the remaining users

Admin console → invite up to the Order Form user count. Assign roles
(owner / business_admin / platform_admin / support map to the platform's
grantable roles; regulatory users are ordinary members with project roles).
Each user completes email OTP on first login.

## Days 2–5 — first project and first Vault upload

### 2.1 First project

Projects → new project: name the program exactly as the Order Form scopes
it (product code, submission type). Confirm the program journey and the
filings catalog render for that submission type. Add the first three tasks
from Exhibit B of the Pilot Agreement.

### 2.2 First Vault upload

Vault → upload one real controlled document (an SOP or a draft protocol is
a good first document — something the customer already owns and will
recognise). Confirm: version 1 recorded; audit-trail entry present; the
document opens from the project. Do not upload PHI unless Order Form §4
says PHI is permitted.

### 2.3 Honest-state check

If any surface shows "Sample data", an empty state that looks like a result,
or a fabricated success, stop and file a Sev-2 (`SUPPORT_POLICY.md`). The
working agreement is fail closed, never fabricate; a pilot that sees fixture
data has found a launch-blocking defect.

## Days 6–10 — first governed draft

### 3.1 Draft

Authoring → template library → pick the template for one section the
customer actually needs (for an IND-shaped pilot, a Module 2 section; for a
QMS-first pilot, an SOP). Generate the first draft with AI assistance.
Confirm the draft shows its citations and that any figure in it is traceable
to a deterministic engine or a source document, not to the model. If the
engine has insufficient data it must say so.

### 3.2 Review and sign

Route the draft through review. The NRU reviews, edits, records
reason-for-change, and signs (server-side password + MFA verification,
`server/routes/esignature.ts`). Confirm the audit-trail entry carries the
signer identity, the reason, and the model version that produced the draft.
This is the first Governed Record. File the audit entry as
`day10-first-governed-draft.json`.

### 3.3 Weekly check-in #1 (30 minutes)

Agenda for every weekly check-in:

1. What the NRU tried to do this week, and where the product stopped them
   (defects first, wishes second).
2. Honest-state review: any figure, verdict or status the user did not
   trust, and why.
3. Milestone status against Exhibit B — met / not met / blocked, never
   "mostly".
4. Next week's one milestone.
5. Support tickets opened and closed; anything above Sev-3 reviewed.
6. Anything the founder must decide (pricing, scope, an out-of-scope
   request the customer raised — answer is "not in this release", logged).

Notes are shared with the customer within one business day.

## Days 11–20 — first sequence

### 4.1 Dossier map and compile

Submission Center → dossier map for the program → place the signed
document(s) at their eCTD location → compile sequence `0000` (four-digit
sequence numbers are enforced). Run validation. Read the validation report
with the NRU: every finding is a real finding; a clean report on a
one-document sequence is expected and is not evidence of much.

### 4.2 Readiness

Submission Readiness → dispatch readiness and inconsistency check for the
project. File the readiness output as `day20-readiness.json`. The
submission preflight (`scripts/ops/submission-preflight.mjs`) is the
founder's view of the same thing; run it again and compare with day 0.

### 4.3 Transmission

Not in scope unless the Order Form says so and the **D7** acceptance notice
exists. The gateway-transmittals surface will report transmission as not
configured; that is correct behaviour, say so in the check-in, and record
that the customer transmits through its own ESG account or vendor.

## Days 21–30 — the D10 filing, export drill, and review

### 5.1 The filing

The NRU files at least one governed document into the sequence on the
production tenant. The audit-trail entry for that action is the D10
evidence; export it from the Part 11 console and file it under
`docs/evidence/W6/<date>/` (founder) with the customer's permission for the
redacted form.

### 5.2 Export drill (do this before the customer needs it)

```
GET /api/tenant-export                 # admin-only, tenant JSON (beta: synchronous)
GET /api/tenant-export/attestation     # HMAC-signed hash-chain attestation
GET /api/audit/exports                 # signed audit-log export
```

Plus a Vault document export in native format and the compiled sequence
folder. Verify the attestation offline per
`docs/operations/attestation-key-rotation.md` step 4. Give the customer the
verification output. The tenant export is synchronous JSON at this stage;
for a large tenant, run it off-peak.

### 5.3 Day-30 review (60 minutes)

- Exhibit B milestones: met / not met, with evidence links.
- Defect list and what shipped in response (release notes provided).
- The customer's answer to one question: "Would you file your next sequence
  in this?" — recorded verbatim, not summarised.
- Decision on the remaining term and on conversion (Pilot Agreement §4.3
  credit window).

## Exit — end of term

1. Export window opens ([60] days). Repeat §5.2; assist as needed.
2. Written confirmation from the customer that exports are complete.
3. Deletion from the active environment within [30] days, backups within
   35 days; audit-trail records retained ten years per
   `docs/operations/audit-log-retention-policy.md`; deletion certificate on
   request.
4. Logo/case-study rights: confirm what the customer approved in writing
   (Pilot Agreement §6.3); nothing else is used.

## Evidence index for one pilot org

| Day | File | Source |
|---|---|---|
| 0 | `day0-go-no-go.txt`, `day0-otp.txt`, `day0-readyz.json`, `day0-ga-readiness.txt`, `day0-submission-preflight.txt`, `day0-audit-chain.txt` | scripts above |
| 1 | `day1-first-admin-mfa.json`, `day1-rail.png`, `day1-apps-catalog.png`, `day1-deep-link-gate.png` | Part 11 console; screenshots |
| 5 | `day5-first-project.json`, `day5-first-upload.json` | audit trail |
| 10 | `day10-first-governed-draft.json` | audit trail |
| 20 | `day20-sequence-validation.json`, `day20-readiness.json` | Submission Center; Readiness |
| 30 | `day30-filing-audit-entry.json` (D10), `day30-export-attestation-verify.txt`, `day30-review-notes.md` | audit trail; export; check-in |
