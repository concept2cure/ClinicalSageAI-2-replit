# Tenant-isolation baseline — justifications

Status as of 2026-08-07 (baseline driven to **zero**).

The raw-SQL tenant-isolation checker (`scripts/ci/check-tenant-isolation.mjs`)
baseline was reduced **77 → 25** across two remediation passes; 47+ queries
received real org scoping and five stale fingerprints were removed with their
dead files. A scanner-accuracy pass (2026-06-11) replaced the regex string
extractor with a quote-context-aware lexer: this revealed ~7 queries the old
extractor could not see (several were real cross-tenant leaks, fixed the same
day) and cleared several false positives. A 2026-06-15 GA pass landed three
more genuine scoping fixes (billing-dashboard, deep-research updateJobProgress,
the RAG neighbour-window fetch) — see Resolved.

A **2026-08-07** pass drove the baseline **25 → 0**. No new bugs were found —
all 25 remaining entries were confirmed safe — but they were re-dispositioned
from a coarse file/class baseline onto precise, auditable mechanisms:

- **23 queries** carry an inline `// tenant-isolation-safe: <reason>` marker at
  the call site (a new per-query suppression mechanism —
  `scripts/ci/lib/inline-suppression.mjs`, unit-tested in
  `tests/inline-suppression.test.ts`). The justification is mandatory and lives
  next to the query; enumerate them with
  `grep -rn 'tenant-isolation-safe:' server/`.
- **2 queries** (the bootstrap demo-admin seed) moved to the file allowlist,
  alongside the other `server/db/bootstrap/*` entries.

The inline marker was preferred over file allowlisting for every file that also
holds genuinely tenant-scoped queries the gate must keep watching
(`storage.ts`, `advancedRAGPipeline.ts`, the `ana-ri` services, `billing.ts`,
`tenant-users.ts`, …): allowlisting those whole files would have blinded the
gate on the most SQL-heavy surfaces in the codebase.

**Policy:** the baseline is now empty. A raw SQL statement against a
tenant-scoped table must take one of three auditable paths, all visible in
review: (1) carry an org/tenant filter in the statement; (2) carry an inline
`// tenant-isolation-safe: <reason>` marker; or (3) live in a file on the
allowlist. A new baseline entry additionally requires a row in the "Justified
entries" table below — enforced by `scripts/ci/check-baseline-justifications.mjs`.

## Justified entries (remain in baseline)

_None — the baseline is empty as of 2026-08-07._ Every previously-justified
entry is now dispositioned inline (grep `tenant-isolation-safe:`) or via the
file allowlist; see the 2026-08-07 Resolved subsection for the per-file mapping.

## Resolved (no longer in baseline)

### 2026-08-07 — baseline driven to zero (inline suppression + bootstrap allowlist)

All confirmed safe (no cross-tenant bug); each re-dispositioned onto a precise
mechanism. "inline" = `// tenant-isolation-safe:` marker at the call site.

- `server/services/advancedRAGPipeline.ts` (vault dense/lexical arms + the
  small-to-big neighbour-window fetch) — **inline (RLS).** Run inside
  `withTenantContext(pool, organizationUuid, …)`, which sets
  `app.current_org_id`; `vault.*` rows are org-filtered by RLS policy (fails
  closed with no org context) — not a WHERE clause the static scanner can see.
- `server/services/advancedRAGPipeline.ts` (rag_chunks dense/lexical arms) —
  **inline (conditional scope).** Append `AND d.organization_id = $N` via an
  interpolated filter variable when the org id is supplied; every route-facing
  caller passes it. The scanner cannot resolve interpolated predicates.
- `server/routes/esignature.ts:54, 272` — **inline (self-lookup).** Part 11
  re-auth / signer denormalization reads the **session user's own row**
  (`resolveUserId`, never client-supplied); `users` has no org column by design
  (tenancy lives in `organization_users`).
- `server/routes/part11-compliance.ts:332` — **inline (self-lookup).** bcrypt
  verify against the session user; a client-supplied `signerId` is rejected
  unless it matches the authenticated user (§11.200(a)(2)); only a boolean is
  returned.
- `server/services/ana-ri/command-executor.ts:1108` — **inline (self-lookup).**
  Reads the authenticated `ctx.userId`'s own row (the very next query IS
  org-scoped).
- `server/services/ana-ri/governed-action-signoff.ts:106` — **inline
  (self-lookup).** §11.200 e-signature re-auth: reads the signer's own
  `password_hash` for bcrypt compare; fails closed on schema drift.
- `server/routes/tenant-users.ts:438, 507` — **inline (provisioning).**
  Org-admin-gated invite dedupe by globally-unique email + org-less user
  creation; `users` is a global identity, membership added via
  `organization_users` and cross-org joins require a consented invitation.
- `server/services/atomicQuotaService.js:172, 259` — **inline (provisioning).**
  Same dedupe + org-less creation pattern inside the org-quota transaction.
- `server/services/billing.ts:664, 704, 710` — **inline (webhook).** Stripe
  webhook idempotency/processing keyed by globally-unique `evt_…` id; no tenant
  request context (org derived from the event, stored on INSERT); runs under
  `runWithSystemTenantScope('stripe-webhook')`.
- `server/services/securityHealth.ts:338` — **inline (diagnostics).**
  Platform-wide 24h audit-event coverage counters (no row data) run under
  `runWithSystemTenantScope('security-self-test')`.
- `server/storage.ts:2152, 2164, 2180, 2215, 2230` — **inline (users CRUD).**
  Foundational identity accessors (get/getByUsername/create/update/delete);
  `users` carries no tenant column (only `default_organization_id`); tenancy is
  enforced through `organization_users` at the route layer. `getByUsername` is
  the pre-tenant-resolution login path.
- `server/db/bootstrap/seed-default-org.ts:141, 153` — **file allowlist
  (bootstrap).** Startup, pre-tenant seed of the platform-owner org + GA demo
  admin (a global `users` identity and its `organization_users` membership); no
  tenant request context. Same category as `bootstrap/index.ts`.

### 2026-06-15 GA remediation — genuine scoping fixes (PR #809)

- `server/routes/billing-dashboard.ts:620` — the recent-Stripe-events query
  filtered `WHERE customer_id = $1` and selected `data`, **neither column
  exists** on `stripe_events` (it was unscoped AND a latent runtime bug).
  Rewritten to `WHERE organization_id = $1` (passing the authed `orgId`) and
  `SELECT … payload …` — now properly tenant-scoped and functional.
- `server/services/deep-research-orchestrator.ts` (`updateJobProgress`) — the
  one `deep_research_jobs` UPDATE without an org predicate (the other four
  carry `AND organization_id = $n`). Threaded `organizationId` through the
  helper + all five call sites and added `AND organization_id = $4`.
- `server/services/advancedRAGPipeline.ts` (rag_chunks neighbour-window fetch,
  ~L763) — was scoped only transitively by `document_id`; now joins
  `rag_documents` and filters `AND rd.organization_id = $4` (explicit
  defense-in-depth; the integer org id is threaded into `expandContext`).
- `server/services/connectors/veeva-vault.ts:54` — no longer flagged after the
  connector hardening reshaped the VQL builder; it was always a false positive
  (external Veeva REST query, not a local table).

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

- Invite dedupe can still _add_ an existing cross-org user to the inviting
  org by email — that is the intended invite-by-email feature; the profile
  mutation half was removed. If invite-by-email should require consent,
  that's a product change, not a query fix.
