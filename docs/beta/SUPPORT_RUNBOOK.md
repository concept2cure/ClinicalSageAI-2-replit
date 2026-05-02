# BETA support runbook — top issues + triage

**Status:** Living document. **Owner:** Support + Backend stream.
**Last revised:** 2026-05-01.

This runbook is for the on-call support engineer responding to a BETA
design-partner ticket. It covers the issues we expect to hit during the
limited BETA based on the surface area shipped — anything off-list
escalates to the backend stream rotation.

## Severity definitions

| Severity | Meaning                                                                 | First response | Resolution target |
|----------|-------------------------------------------------------------------------|----------------|-------------------|
| **P1**   | Customer cannot use a core BETA workflow (W1-W5). Data loss or risk.    | 1 business hour | 1 business day    |
| **P2**   | A core workflow is degraded but a workaround exists.                    | 4 business hours | 3 business days  |
| **P3**   | Cosmetic, documentation, or feature-request.                            | 2 business days | Next sprint       |
| **P0**   | Security incident, suspected data leakage, audit-chain tampering.       | Immediate (page)| Immediate         |

## Fast-path triage (before opening a ticket)

For every report:

1. **Confirm the tenant.** Get the customer's org slug and the timestamp.
2. **Pull request id.** Every BFF response includes `x-request-id` —
   ask the customer to read it back from the browser dev tools or check
   the structured log.
3. **Check the predicate-shadow probe.**
   ```bash
   curl -fsS https://<bff-host>/api/_ops/predicate-intelligence/ready
   ```
   If 503, half the surface is unavailable — check the shadow status
   first (issue 4 below).
4. **Check the BFF health.** `curl /api/health` must return 200.
5. **Check the audit trail** for the user's last 10 actions (not for
   data, for state — what did the customer actually do?):
   ```sql
   SELECT created_at, action, resource_type, resource_id
   FROM audit_logs
   WHERE tenant_id = <org-id> AND user_id = <user-id>
   ORDER BY created_at DESC LIMIT 10;
   ```

## Top-10 known issues

### 1. Customer can't log in (BETA tenant)

**Symptoms.** "Invalid credentials" or "user not found" on first login.

**Likely cause.** Org admin created via psql but `organization_users`
junction row missing.

**Fix.** Run:
```sql
INSERT INTO organization_users (organization_id, user_id, role)
VALUES (<org-id>, <user-id>, 'admin')
ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'admin';
```

**Prevention.** Use the customer-onboarding script (when it exists);
psql by hand should require a peer review.

### 2. "Q-Sub list is empty" on a tenant that should have data

**Symptoms.** Customer reports `/api/q-sub` returns `{rows: [], count: 0}`.

**Likely causes.**
- The customer's projects are in `projects` but no rows in
  `regulatory_programs`. Q-Sub is keyed off `regulatory_programs`.
- The org id in the JWT doesn't match the org id on the programs.

**Fix.** Verify the JWT org id matches:
```sql
SELECT id, organization_id, name, code FROM regulatory_programs
WHERE organization_id = <org-id>;
```
If empty, the customer needs to use the program-creation flow (or, for
demos, run `npm run db:seed:mdx-beta`).

### 3. "Cross-tenant data" report (P0 if confirmed)

**Symptoms.** Customer reports seeing another organization's data.

**This is P0.** Page on-call before doing anything else.

**Triage.**
1. Capture the screenshot + the request id.
2. Pull the audit log for that request.
3. Run the relevant tenant-isolation contract test against the deployed
   commit:
   ```bash
   npm test -- server/__tests__/security/tenant-isolation-*.contract.test.ts
   ```
4. If the test passes, the data is most likely a misconfigured project
   (the customer was added to two orgs). If the test fails, the IDOR
   gate is broken — that's a deploy halt + incident review.

### 4. Predicate-intelligence routes return 503

**Symptoms.** `GET /api/predicate-intelligence/candidates` returns 503
with body `Predicate Intelligence not configured`.

**Likely causes.**
- `REVIEW_ADMIN_TOKEN` env var missing.
- `SHADOW_SERVICE_URL` points to an unreachable host.
- Shadow container is in cold-start universe load (≤ 60 s).

**Triage.**
1. `curl /api/_ops/predicate-intelligence/info` to see config snapshot.
2. `curl /api/_ops/predicate-intelligence/ready` for the readiness
   probe with structured `reasons` array.
3. If `reasons` includes "shadow probe timed out", inspect shadow
   container logs.

**Fix.** Restore the env var or the shadow container per
`docs/operations/predicate-intelligence-shadow-service.md`.

### 5. eSTAR section save returns 500

**Symptoms.** `PATCH /api/cerv2-sections/:id` returns 500.

**Likely cause.** The `cerv2_510k_sections` table doesn't exist in this
tenant's schema (migration not applied).

**Triage.**
```sql
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables WHERE table_name = 'cerv2_510k_sections'
);
```

**Fix.** Apply migrations per the IQ template; restart the BFF.

### 6. eSignature `/sign` returns 503 with `ESIGNATURE_SCHEMA_MISSING`

**Symptoms.** Customer's e-sign attempt rejected with that specific
error code.

**Likely cause.** `electronic_signatures` table not migrated.

**Fix.** Apply migrations. The route refuses to silently succeed
without the schema — that's by design (Part 11).

### 7. Q-Sub commitment "rolled-in" UI doesn't update

**Symptoms.** Customer flips a commitment, server returns 200, UI shows
old state.

**Likely cause.** UI cache (`useK510Predicates` hook) hasn't refetched.

**Fix.** Customer hard-refreshes. Long-term: the UI work that lands
with this backend should invalidate the cache after a successful PATCH.
Track as P2, not P1.

### 8. ESG transmit returns 502

**Symptoms.** `POST /api/510k/:projectId/esg/submit` returns 502.

**Likely cause.** FDA ESG endpoint unreachable, or our ESG creds
expired.

**Triage.**
1. Check `audit_logs` for `k510_workflow.transmit.failed` — the error
   message is captured in `details.error`.
2. If creds expired, the ESG admin rotates them per the secure
   secret-rotation procedure (separate doc).

### 9. Predicate shadow flapping (`/ready` toggles 200 ↔ 503)

**Symptoms.** Multiple `predicate-shadow` restarts in the past hour.
Customer experiences intermittent 503 on predicate routes.

**Likely cause.** Shadow container OOM under load.

**Fix.**
1. Inspect shadow memory utilization in the platform dashboard.
2. Raise the pod memory limit per
   `docs/operations/predicate-intelligence-shadow-service.md` §SLO.
3. If the shadow universe has a corrupt index, the shadow team rebuilds
   it (separate engagement).

### 10. Audit-log query timing out

**Symptoms.** Support engineer's audit-log queries take > 10 s.

**Likely cause.** The hot table has grown beyond expected size; the
nightly archive job either isn't running or doesn't exist yet.

**Triage.**
```sql
SELECT count(*), min(created_at), max(created_at) FROM audit_logs;
```

**Fix.** If the count is > 5M for a single BETA tenant, escalate. The
nightly archive job is an open item per
`docs/operations/audit-log-retention-policy.md`.

## Escalation paths

| Issue type                          | Escalate to                         |
|-------------------------------------|-------------------------------------|
| P0 (security / data leakage)        | On-call → CTO + RA leadership       |
| P1 cannot resolve in 4 hours        | Backend stream lead                  |
| Predicate shadow incidents          | mdx-platform rotation                |
| Audit-trail integrity (hash-chain)  | RA leadership + backend lead        |
| Customer SSO / IdP issues           | Customer's IdP team + auth backend  |

## Logs you'll need

- BFF structured logs (per request, includes `x-request-id`).
- Predicate-shadow container logs (for issues 4, 9).
- Postgres slow-query log (issue 10).
- `audit_logs` table (any "what did the customer do?" question).
- `auth_audit_log` table (issue 1, login problems).

## Customer communication templates

- **P1 acknowledgement** (within 1 business hour) — separate template
  doc.
- **P0 incident page** — separate template doc.
- **Daily check-in** during week 1 — separate template doc.

## What this runbook deliberately does not cover

- Provisioning a new tenant — see
  `docs/beta/CUSTOMER_ONBOARDING_RUNBOOK.md`.
- The validation kit — see `docs/beta/validation/`.
- The shadow service runbook — see
  `docs/operations/predicate-intelligence-shadow-service.md`.
- Pen-test response — see
  `docs/beta/security/PEN_TEST_SCOPE_2026-05-01.md`.
