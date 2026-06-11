# Tenant-isolation baseline — justifications

Status as of 2026-06-11 (post swarm-audit waves 1–7 + scanner-accuracy pass).

The raw-SQL tenant-isolation checker (`scripts/ci/check-tenant-isolation.mjs`)
baseline was reduced **77 → 25** across two remediation passes; 47+ queries
received real org scoping and five stale fingerprints were removed with their
dead files. A scanner-accuracy pass (2026-06-11) replaced the regex string
extractor with a quote-context-aware lexer: this revealed ~7 queries the old
extractor could not see (several were real cross-tenant leaks, fixed the same
day) and cleared several false positives. Current baseline: **26 entries**,
every one enumerated here. **Policy: a new baseline entry requires a row in
this table — enforced by `scripts/ci/check-baseline-justifications.mjs`.**

## Justified entries (remain in baseline)

| File:line | Class | Justification |
|---|---|---|
| `server/db/bootstrap/seed-default-org.ts:75, 87` | bootstrap | Pre-tenant seed inside the schema-migration transaction; no org exists yet. |
| `server/routes/esignature.ts:45, 173` | self-lookup | Part 11 re-auth / signer denormalization reads the **session user's own row**; `users` has no org column by design (tenancy lives in `organization_users`). |
| `server/services/billing.ts:632, 672, 678` | webhook | Stripe webhook idempotency/processing keyed by globally-unique `evt_…` id; signature-verified; org resolved asynchronously (`stripe_events.organization_id` nullable by design). |
| `server/routes/billing-dashboard.ts:620` | transitive | `customer_id` read from the authed org's own row first; adding a nullable org filter would drop unresolved-webhook rows. |
| `server/routes/tenant-users.ts:233, 265` | provisioning | Org-admin-gated invite dedupe by globally-unique email; `users` has no org column. (Cross-org **profile mutation** during dedupe was removed in wave 7.) |
| `server/services/atomicQuotaService.js:172, 202` | provisioning | Same dedupe pattern inside the org-quota transaction. |
| `server/routes/part11-compliance.ts:263` | self-lookup | bcrypt verify against the session user behind a policy guard; only `{valid}` is returned. |
| `server/services/ana-ri/command-executor.ts:1000` | self-lookup | Reads the authenticated `ctx.userId`'s own row. |
| `server/services/securityHealth.ts:337` | diagnostics | System security-health counters (24h event-type counts, no row data). |
| `server/services/connectors/veeva-vault.ts:54` | false positive | VQL sent to the external Veeva REST API — `documents` is Veeva's object, not a local table. |
| `server/storage.ts:2177, 2189, 2205, 2240, 2255` | users CRUD | `users` carries no tenant column (`shared/schema.ts` — only `default_organization_id`); tenancy is enforced through `organization_users` at the route layer. |
| `server/services/advancedRAGPipeline.ts:877, 910` | RLS | Vault retrieval arms (dense + lexical) run inside `withTenantContext(pool, organizationUuid, …)` — isolation is enforced by Postgres RLS session context, not a WHERE clause the static scanner can see. |
| `server/services/advancedRAGPipeline.ts:987+` | conditional scope | rag_chunks retrieval arms (dense + lexical) append `AND d.organization_id = $N` via an interpolated filter variable when tenant context is provided; the scanner cannot resolve the variable. Every route-facing caller passes the org. |
| `server/services/deep-research-orchestrator.ts:462` | system job | Worker progress callback updates `deep_research_jobs` by primary key; the job id originates from an org-scoped enqueue in the same orchestrator (transitive). |

## Resolved (no longer in baseline)

### 2026-06-11 scanner-accuracy pass — leaks found by the new lexer, fixed

- `server/routes/workspace-summary.ts` — **six cross-tenant leaks** on the
  home-page summary: `cro_clients` filtered with `… OR TRUE` (no-op filter),
  recent `chat_threads` titles, thread count, recent `file_uploads`
  filenames, recent `cer_exports`, pending `ivdr_analytical_validations`
  count, and the "continue where you left off" project UNION — all were
  unscoped. All now org-scoped (cer_exports via `cer_reports` join).
- `server/routes/license-routes.js` — `GET /api/licenses/:id/usage` was an
  IDOR (any authenticated caller could read any tenant's license usage);
  now fail-closed with a `client_workspaces.organization_id` join. The
  client-scoped usage route's soft `if (orgId)` verification became
  fail-closed 401.
- `server/routes/global-compliance.ts` — GDPR Art. 15 export and Art. 17
  erasure filtered a nonexistent `users.organization_id` column (export
  silently returned an empty user record via `safeQuery`; erasure threw and
  rolled back). Both rewritten to scope through `organization_users`
  membership.
- `server/routes/project-hierarchy.ts`, `server/services/project-rollup-service.ts`,
  `server/services/rules-engine/actions/index.ts` — id-keyed child-count /
  rollup-persist / risk-escalation queries hardened with explicit
  `organization_id` predicates (defense in depth; ids were org-derived).
- `server/services/memory-consolidation-job.ts` — false positive cleared:
  the old extractor cut the literal before its org reference.

### Earlier (waves 4–7)

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
