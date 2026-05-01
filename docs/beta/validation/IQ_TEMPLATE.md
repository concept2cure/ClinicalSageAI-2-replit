# Installation Qualification (IQ) — Concept2Cure.RI BETA tenant

**Template version:** 1.0 — 2026-05-01.
**Customer fills in:** name, environment URL, dates, signatures.
**Concept2Cure provides:** the tenant, the seeded demo project, the built
artifacts (image digests, migration files), and remediation if any check fails.

This template is delivered as part of the BETA validation kit. Customers
adapt it to their internal SOPs. Concept2Cure is not the validating
authority — the customer's RA / Quality team owns sign-off.

## 1. Identification

| Field                 | Value                                |
|-----------------------|--------------------------------------|
| Tenant name           |                                      |
| Tenant slug / domain  |                                      |
| Environment           | ☐ BETA  ☐ Production                 |
| Date IQ executed      |                                      |
| IQ executed by        |                                      |
| Reviewer              |                                      |

## 2. Pre-installation prerequisites

- [ ] Customer has provisioned and signed the BETA agreement and DPA.
- [ ] Customer has supplied the SSO IdP metadata (or confirmed local-only auth).
- [ ] Customer has supplied the list of organization administrators.
- [ ] Database admin URL (DIRECT / non-pooler) confirmed available for migrations.
- [ ] Container image digests confirmed against the BETA release manifest.

## 3. Application stack — what is installed

| Component                  | Expected            | Captured value | Pass / Fail |
|----------------------------|---------------------|----------------|-------------|
| BFF image (digest)         | `ghcr.io/...@sha256:...` |          |             |
| Predicate shadow image     | `ghcr.io/...@sha256:...` |          |             |
| Node.js runtime            | 20.x LTS            |                |             |
| Postgres version           | 15.x                |                |             |
| Redis (queue cache)        | 7.x                 |                |             |
| Database extensions        | `pgcrypto`, `pg_trgm`, `vector` |     |             |

## 4. Configuration — required env vars

For each, capture the **fact that it is set** (not the secret value).

| Variable                    | Set? | Source        | Notes |
|-----------------------------|------|---------------|-------|
| `DATABASE_URL`              | ☐    | Secret manager |       |
| `DATABASE_URL_DIRECT`       | ☐    | Secret manager | Migrations only |
| `JWT_SECRET`                | ☐    | Secret manager |       |
| `SHADOW_SERVICE_URL`        | ☐    | Manifest       |       |
| `REVIEW_ADMIN_TOKEN`        | ☐    | Secret manager |       |
| `OPENAI_API_KEY` / equivalent | ☐ | Secret manager |       |
| `ESG_*` (FDA gateway certs) | ☐    | Secret manager |       |
| `STRIPE_*` (if billing on)  | ☐    | Secret manager |       |

## 5. Database migrations — applied state

| Check                                                      | Expected | Captured | Pass / Fail |
|------------------------------------------------------------|----------|----------|-------------|
| `migrations/0000_sweet_joseph.sql` is applied              | yes      |          |             |
| Latest dated migration in `db/migrations/` is applied      | yes      |          |             |
| `q_submissions` table exists                               | yes      |          |             |
| `q_sub_questions`, `_commitments`, `_meetings`, `_timeline` exist | yes |          |             |
| `audit_logs` table exists with INSERT-only role grant      | yes      |          |             |
| Tamper-proof audit table exists with hash-chain trigger    | yes      |          |             |
| Tenant indexes (`reg_programs_org_idx`, `q_submissions_program_idx`) exist | yes | |   |

Capture the migration manifest hash:

```
$ sha256sum db/migrations/migrations_manifest.json
```

## 6. Health probes — green at install

| Probe                                                  | Expected | Captured | Pass / Fail |
|--------------------------------------------------------|----------|----------|-------------|
| `GET /api/_ops/predicate-intelligence/live`            | 200      |          |             |
| `GET /api/_ops/predicate-intelligence/ready`           | 200      |          |             |
| `GET /api/health` (BFF top-level)                       | 200      |          |             |
| Predicate shadow `GET /predicate/health` (internal)    | 200      |          |             |
| Database `SELECT 1`                                     | 1        |          |             |

## 7. Seed verification

Run `npm run db:seed:mdx-beta` once after migrations. Expected:

- 5 programs in `regulatory_programs` for the customer organization (or, if the customer skipped the demo seed, this row count may be zero).
- 7 Q-Submissions with the documented Q-numbers.
- Verify-stage SQL block at the end of the seed script printed correct counts.

| Check                              | Expected | Captured | Pass / Fail |
|------------------------------------|----------|----------|-------------|
| Programs count                     | 5        |          |             |
| Q-Submissions count                | 7        |          |             |
| Q-Sub questions count              | ≥ 24     |          |             |
| Q-Sub commitments count            | ≥ 11     |          |             |

## 8. Sign-off

| Role            | Name | Signature | Date |
|-----------------|------|-----------|------|
| IQ executed by  |      |           |      |
| QA reviewer     |      |           |      |
| RA reviewer     |      |           |      |

If any item failed: a CAPA must be opened and remediated before OQ
begins.
