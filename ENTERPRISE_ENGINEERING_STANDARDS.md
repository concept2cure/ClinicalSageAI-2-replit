# ENTERPRISE ENGINEERING STANDARDS (HARD RULE)

## Non‑Negotiable Quality Bar

All code changes MUST meet enterprise-grade, audit-proof standards. This is a hard rule.

### Required for Every Feature

- **No placeholders or mocks** in production paths.
- **Database-backed logic only** for persisted, reportable data.
- **Audit instrumentation** for user- or system-impacting actions (e.g., auth, drafting, saves, compliance checks).
- **Security-first**: authentication, tenant isolation, and least-privilege access required.
- **Observability**: log errors with actionable context and never suppress critical failures.
- **Deterministic behavior**: avoid random or simulated results in regulated workflows.
- **Data integrity**: validate inputs and sanitize outputs for all external boundaries.
- **Backward compatibility** unless explicitly waived by the user.

### Review Gate

Any change that does not satisfy the above is **rejected** and must be revised before merge.

### Ownership

The engineering agent is responsible for enforcing this rule on every change.
