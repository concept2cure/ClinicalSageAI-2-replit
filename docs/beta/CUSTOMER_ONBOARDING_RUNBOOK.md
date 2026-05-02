# BETA design-partner onboarding runbook

**Status:** Living document. **Owner:** Customer Success + Backend stream.
**Last revised:** 2026-05-01.

This runbook covers the end-to-end provisioning of a new BETA design
partner. It is the operational complement to the BETA delivery kit
(`docs/beta/`).

Target time to "first useful day" — **5 business days** from contract
signature to the customer's RA team writing their first eSTAR section
inside Concept2Cure.RI.

## Pre-conditions

- [ ] BETA agreement, MSA, and DPA executed.
- [ ] Customer's tenant slug agreed (e.g. `acme-spine` for "Acme Spine
      Devices").
- [ ] Customer's two named org administrators identified.
- [ ] Customer's SSO IdP metadata exchanged (or "local-only auth, BETA
      duration only" agreed in writing).
- [ ] Pen-test no-finding letter shared (per
      `docs/beta/security/PEN_TEST_SCOPE_2026-05-01.md`).
- [ ] Validation kit shared (per `docs/beta/validation/`).

## Step-by-step

### Day 1 — Tenant provisioning

1. **Create the organization row.**
   ```sql
   INSERT INTO organizations (
     name, slug, domain, industry_mode, tier, status,
     max_users, max_projects, billing_cycle, payment_status, seats_purchased
   ) VALUES (
     '<Customer Name>', '<slug>', '<customer.com>',
     'medtech', 'beta', 'active',
     10, 5, 'beta', 'beta', 10
   );
   ```
   The `tier='beta'` flag is what the rate-limiter and feature flags key
   off; do not use `enterprise` for BETA tenants.

2. **Provision the two admin users** with secure-random temporary
   passwords. Force password change on first login.

3. **Run IQ.** Use `docs/beta/validation/IQ_TEMPLATE.md`. Capture the
   filled template in the customer success folder; it ships back to the
   customer for their records.

4. **Notify the customer admins** via the welcome email template
   (separate doc) with login credentials, the URL to the BETA support
   channel, and the SLA summary.

### Day 2 — Demo data + walkthrough

1. **Optional: seed the OR-801 demo project** so the customer can
   evaluate workflows before importing their own data:
   ```bash
   ORG_SLUG=<slug> npm run db:seed:mdx-beta
   ```
   The seed is idempotent and creates 5 device programs + 7 Q-Subs.
   Mark the project as `is_demo = true` in the metadata so it doesn't
   contaminate production reporting.

2. **Customer success walkthrough call.** ~60 minutes. Cover:
   - Project creation + RA team invite flow.
   - The 5 BETA workflows (W1-W5).
   - How to file a support ticket.
   - Where the audit trail lives and how to export it (read-only API
     for now).

### Day 3 — Customer's first project

1. **Customer creates their first regulatory program** via the UI. If
   they prefer, customer success can do a paired session.

2. **Run OQ on the customer's project.** Use
   `docs/beta/validation/OQ_TEMPLATE.md` against the customer's actual
   project (not the demo). Capture the filled template; the customer's
   RA team signs off.

### Day 4-5 — Independent operation

1. Customer's team works the W1-W2 workflows on their own (read program
   state + author eSTAR sections).
2. Customer success monitors the audit log + the predicate-shadow
   `/ready` probe for anomalies. Daily check-in for the first week.
3. **End of week 1:** confirm the customer can complete a full save +
   sign-off cycle on at least one section. If not, run a triage call
   the same day.

## Tenancy isolation verification (run before day 1 ends)

For every new BETA tenant, run the following sanity checks. None should
return cross-tenant rows:

```sql
-- 1. Programs scope check.
SELECT COUNT(*) FROM regulatory_programs
WHERE organization_id <> (SELECT id FROM organizations WHERE slug = '<slug>');

-- 2. Q-Sub scope check (joins through programs).
SELECT q.id FROM q_submissions q
JOIN regulatory_programs p ON p.id::text = q.program_id
WHERE p.organization_id <> (SELECT id FROM organizations WHERE slug = '<slug>')
LIMIT 1;
```

The tenant-isolation contract suite
(`server/__tests__/security/tenant-isolation-*.contract.test.ts`) must
also be passing in CI on the deployed commit.

## Feature-flag posture

BETA tenants run with the following flag defaults:

| Flag                          | Default | Notes |
|-------------------------------|---------|-------|
| `VITE_LIVE_PREDICATE`         | `1`     | Predicate shadow live (sidecar); refuse to fall back to fixtures. |
| `VITE_AI_LETTER_SURFACE`      | `0`     | UI surface gated on Claude Design brief #2. |
| `VITE_PREFLIGHT_SURFACE`      | `0`     | UI surface gated on Claude Design brief #8. |
| `VITE_REVIEWER_SIMULATOR_UI`  | `0`     | UI gated on Claude Design brief #4 (extra-credit). |
| `VITE_BILLING_ENABLED`        | `0`     | BETA is free; no Stripe traffic. |

All flags are stored in the customer's `organizations.metadata.flags`
JSON column and read at session boot. To flip a flag for a tenant,
update the JSON and have the customer log out + back in.

## Customer-facing commitments

The BETA agreement commits Concept2Cure to:

- 99.0% uptime monthly (lower than GA; explicit BETA SLA).
- Audit-trail retention for the customer's full BETA term + 10 years
  per `docs/operations/audit-log-retention-policy.md`.
- 1-business-day support response for P1 issues; 3-business-day for P2.
- 30 days written notice before any breaking schema or API change.
- A no-finding letter from the limited pen test (per
  `docs/beta/security/PEN_TEST_SCOPE_2026-05-01.md`) on request.

## Off-boarding

If a BETA design partner exits before the BETA window closes:

1. **Snapshot their data.** Run the customer-export job (currently a
   manual `pg_dump`-by-org-id; full export endpoint is a GA item).
2. **Hash-chain attestation.** Generate the tamper-proof attestation
   report for their portion of the chain.
3. **Hand off the snapshot + attestation** to the customer per the DPA.
4. **Disable login** on the org. Do not delete the underlying rows; the
   audit trail must persist for the full retention period regardless of
   account status. Mark `organizations.status = 'archived'`.
5. **Decommission BETA-specific resources** (predicate-shadow capacity,
   test data, etc.) per the off-boarding ticket.

## Open items

- [ ] Build the customer-export endpoint (currently `pg_dump` manual).
- [ ] Build the audit-trail attestation report generator.
- [ ] Build a BETA admin dashboard for support engineers (currently
      everything is psql + the BFF API).
