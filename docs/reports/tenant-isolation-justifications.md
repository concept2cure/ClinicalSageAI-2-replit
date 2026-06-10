# Tenant-isolation baseline — justifications

Status as of 2026-06-10 (post swarm-audit waves 1–7).

The raw-SQL tenant-isolation checker (`scripts/ci/check-tenant-isolation.mjs`)
baseline was reduced **77 → 25** across two remediation passes; 47+ queries
received real org scoping and five stale fingerprints were removed with their
dead files. Every remaining baseline entry is enumerated here with its
justification. **Policy: a new baseline entry requires a row in this table.**

## Justified entries (remain in baseline)

| File:line | Class | Justification |
|---|---|---|
| `server/db/bootstrap/seed-default-org.ts:75, 87` | bootstrap | Pre-tenant seed inside the schema-migration transaction; no org exists yet. |
| `server/routes/esignature.ts:45, 173` | self-lookup | Part 11 re-auth / signer denormalization reads the **session user's own row**; `users` has no org column by design (tenancy lives in `organization_users`). |
| `server/routes/billing.ts:632, 672, 678` | webhook | Stripe webhook idempotency/processing keyed by globally-unique `evt_…` id; signature-verified; org resolved asynchronously (`stripe_events.organization_id` nullable by design). |
| `server/routes/billing-dashboard.ts:620` | transitive | `customer_id` read from the authed org's own row first; adding a nullable org filter would drop unresolved-webhook rows. |
| `server/routes/tenant-users.ts:232, 254, 270` | provisioning | Org-admin-gated invite dedupe by globally-unique email; `users` has no org column. (Cross-org **profile mutation** during dedupe was removed in wave 7.) |
| `server/services/atomicQuotaService.js:172, 206` | provisioning | Same dedupe pattern inside the org-quota transaction. |
| `server/routes/part11-compliance.ts:263` | self-lookup | bcrypt verify against the session user behind a policy guard; only `{valid}` is returned. |
| `server/services/ana-ri/command-executor.ts:1000` | self-lookup | Reads the authenticated `ctx.userId`'s own row. |
| `server/services/securityHealth.ts:337` | diagnostics | System security-health counters (24h event-type counts, no row data). |
| `server/jobs/memory-consolidation-job.ts:92` | system job | Explicit cross-tenant job under `app_super_admin` via `withTenantConnection`; per-row work re-scopes to `memory.organization_id`. |
| `server/services/veeva-vault.ts:54` | false positive | VQL sent to the external Veeva REST API — `documents` is Veeva's object, not a local table. |
| `server/storage.ts:2177, 2189, 2205, 2240, 2255` | users CRUD | `users` carries no tenant column (`shared/schema.ts` — only `default_organization_id`); tenancy is enforced through `organization_users` at the route layer. |

## Resolved (no longer in baseline)

- GDPR export/erasure (`command-executor.ts`) — was filtering a nonexistent
  `users.organization_id` column (runtime 42703); rewritten to scope through
  `organization_users` membership (wave 6).
- `document-processor.js` (4 queries) and `models/ind_sequence.js` — dead
  code, deleted (wave 7).
- `server/api/cmc/portfolio.ts` (all handlers) and `server/routes/innovation-routes.ts`
  — real org scoping added (waves 4–5).

## Standing follow-up

- Invite dedupe can still *add* an existing cross-org user to the inviting
  org by email — that is the intended invite-by-email feature; the profile
  mutation half was removed. If invite-by-email should require consent,
  that's a product change, not a query fix.
