# BETA delivery kit

Documents shipped to design-partner customers and the internal team
during the medical-device limited BETA.

## Validation kit (`validation/`)

Customers receive these as Markdown templates and adapt to their internal
SOPs. Concept2Cure does not validate on the customer's behalf — the
customer's RA / Quality team owns sign-off.

- [`IQ_TEMPLATE.md`](./validation/IQ_TEMPLATE.md) — Installation Qualification.
- [`OQ_TEMPLATE.md`](./validation/OQ_TEMPLATE.md) — Operational Qualification (5 BETA workflows).
- [`PQ_TEMPLATE.md`](./validation/PQ_TEMPLATE.md) — Performance Qualification (load profile).

## Security (`security/`)

- [`PEN_TEST_SCOPE_2026-05-01.md`](./security/PEN_TEST_SCOPE_2026-05-01.md) — Limited pen-test SOW for BETA.

## Operations

- [`CUSTOMER_ONBOARDING_RUNBOOK.md`](./CUSTOMER_ONBOARDING_RUNBOOK.md) — End-to-end provisioning of a new BETA design partner.
- [`SUPPORT_RUNBOOK.md`](./SUPPORT_RUNBOOK.md) — Top-10 known issues + triage steps for the on-call support engineer.

## Companion docs

- [`docs/reports/MDX_BETA_AUDIT_2026-05-01.md`](../reports/MDX_BETA_AUDIT_2026-05-01.md) — master plan (on `claude/mdx-beta-audit-2026-05-01`).
- [`docs/reports/MDX_BETA_BACKEND_PROGRESS_2026-05-01.md`](../reports/MDX_BETA_BACKEND_PROGRESS_2026-05-01.md) — what landed in the backend stream.
- [`docs/operations/predicate-intelligence-shadow-service.md`](../operations/predicate-intelligence-shadow-service.md) — shadow service runbook + SLO.
- [`docs/operations/audit-trail-coverage.md`](../operations/audit-trail-coverage.md) — every governed mutation, its action code, current coverage status.
- [`docs/operations/audit-log-retention-policy.md`](../operations/audit-log-retention-policy.md) — retention schedule + DB role policy.
