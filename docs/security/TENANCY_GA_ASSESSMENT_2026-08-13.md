# Multi-tenancy assessment against the enterprise-GA bar — 2026-08-13

**Scope:** the whole platform's tenancy model — isolation, lifecycle, entitlement,
observability. **Method:** code and schema review against the running
architecture, not against the design documents.

**Headline:** *isolation* is in good shape and is the subject of a long, careful,
well-evidenced programme. The gap that remained was one layer up: nothing on the
request path ever asked whether a tenant was **entitled to be operating at all**.
Four defects of that class are closed here; the rest of the register is triaged
below.

---

## 1. What the assessment found in good order

These are stated so the register below is read in proportion. This is a mature
tenancy implementation, not a greenfield one.

| Control | State |
|---|---|
| Postgres RLS policy across org-keyed tables, `FORCE ROW LEVEL SECURITY` | Installed; behaviour proven against real Postgres in CI |
| Production boot refuses to start unless `RLS_ENFORCE=on` | `server/db/rlsEnforcement.ts` |
| Default-deny `/api` auth boundary with a documented public allowlist | `server/middleware/authBoundary.ts` |
| Live organization-membership re-check behind a 60s TTL cache, fail-closed | `server/middleware/orgMembership.ts` |
| AsyncLocalStorage tenant scope + instrumented pool that blocks unscoped queries | `server/db/tenantStore.ts`, `poolInstrumentation.ts` |
| Named system scopes for schedulers, workers and cross-tenant consoles | `server/db/withTenantConnection.ts` |
| Raw-SQL tenant-filter ratchet with per-entry justifications, RLS policy/allowlist parity | `scripts/ci/check-tenant-isolation.mjs`, `check-rls-allowlist-sync.mjs` |
| ~30 cross-tenant contract tests | `server/__tests__/security/tenant-isolation-*.contract.test.ts` |
| Org-keyed in-process caches (RAG prefix, deadline radar, idempotency) | Spot-checked; all keyed by organization |
| Membership-validated organization switching for multi-org users | `server/routes/authEnterprise.ts` |
| Seat-licensing decision engine, pure and unit-tested | `server/services/seat-licensing.ts` |

The isolation burndown (`docs/RLS_ENFORCEMENT_BURNDOWN.md`) tracked one residual
item — a full-schema two-tenant probe under `RLS_ENFORCE=on`. **That is now
closed** (see R1 below): 222 policied tables, 220 seeded with two tenants, zero
cross-tenant reads, with a negative control proving the probe can fail.

---

## 2. The gap this change closes: entitlement, not isolation

Isolation answers *"can tenant A see tenant B's data?"* — well covered.
Nothing answered *"may tenant A be here at all?"*

### 2.1 A suspended organization retained full access — CRITICAL

`organizations.status` (`active | inactive | suspended`) and
`organizations.payment_status` have been on the schema since the first billing
migration, and both are **written** by live code: the admin console writes
`status`, and the Stripe webhook writes `payment_status`
(`services/billing.ts:767-846`).

**Nothing on the request path read either one.** The only checks lived at
`middleware/tenantContext.ts:253` and `services/ana-platform-controller.ts:131`,
mounted on roughly ten routers out of several hundred.

Consequences, all live before this change:

- An organization suspended in response to a **security incident** kept full read
  and write access to every route.
- An organization suspended for a **terminated contract** kept using the product.
- A **past-due or cancelled** subscription had no effect on anything. There was no
  mechanism to enforce non-payment short of deleting the tenant.

**Closed by** `server/services/tenant/tenant-lifecycle.ts` (the policy) and
`server/middleware/tenantLifecycleGuard.ts` (enforcement), mounted once in each
authenticated chain so no route file can forget it.

The decision model is three-valued, and the middle value is the commercially
important one:

| Tenant state | Decision |
|---|---|
| `active` / `trialing` / `incomplete` | allow |
| `past_due` / `unpaid` / subscription `canceled` | **read-only** |
| `pending_deletion` | **read-only** |
| `suspended` / `inactive` / `purged` / unrecognized status | deny |
| posture unreadable | 503, fail-closed |

`read_only` keeps the customer's own regulatory record readable and exportable
while blocking new work. Locking a past-due customer out of their own IND file is
both a support burden and, under most enterprise MSAs, a breach — so the state
that drives payment is deliberately not a lockout.

Two carve-out classes stay reachable even under `deny`, because blocking them
makes the state unrecoverable: **billing** (a past-due tenant must be able to
reach checkout — locking the paywall behind the paywall) and **data portability**
(`/api/tenant-export`, audit export — contractual, and GDPR Art. 20).

Two deliberately **asymmetric** unknown-value policies, which is the subtlest part
of the policy and is pinned by test:

- Unrecognized `status` → **deny**. Small closed vocabulary written only by our own
  admin surfaces; an unknown value means a bug or tampering.
- Unrecognized `payment_status` → **allow** (and log). Stripe owns that vocabulary
  and may extend it; denying on an unseen value would turn a Stripe release note
  into a customer-visible outage.

### 2.2 Tenant identity was coupled to the RLS knob — HIGH

`authBoundary.continueWithTenantExecutionContext` carried a second, divergent copy
of the tenant-scope setup, gated behind `readEnforcementMode() !== 'on'`.
Production is the **only** environment that accepts `RLS_ENFORCE=on`, so in dev,
test and CI `req.tenantContext` was simply never populated.

Two silent consequences:

- **Per-organization rate limiting** (`redisRateLimiter.ts:352` reads
  `req.tenantContext?.organizationId`) degraded to a single shared bucket
  everywhere except production. The tenant-fairness control was never exercised
  before the environment it had to hold in.
- Any tenant-aware middleware written against `req.tenantContext` behaved
  differently under test than in production — the worst possible split for a
  control whose entire job is to hold in production.

**Closed by** publishing identity unconditionally in
`establishRequestTenantScope` (the one point every authenticated route already
passes through) and reducing `continueWithTenantExecutionContext` to the single
control it uniquely added: rejecting an authenticated request with no resolvable
tenant. There is now one implementation of tenant-scope setup, not two.

### 2.3 Tenant deletion was an unguarded cascade — HIGH

`DELETE /api/tenants/:id` ran `DELETE FROM organizations` plus child-table
cascades inside one transaction. One authenticated call; no export, no waiting
period, no way back, and the audit trail went with it.

For a platform holding IND applications, 510(k) submissions and clinical
protocols that fails three separate obligations:

- **21 CFR Part 11 §11.10(e)** requires record deletion to remain reconstructable
  from a secure audit trail. A cascade delete destroys the evidence with the record.
- Every enterprise MSA on this product commits to a **data-return window** before
  destruction. Deleting first makes that unmeetable.
- Sponsors carry their own retention duties (**ICH E6(R2) §5.5.11**, **21 CFR
  312.62(c)**, both years past study close). A vendor that can irrecoverably delete
  on an API call is a finding in the sponsor's own audit.

**Closed by** `server/services/tenant/tenant-offboarding.ts`:

```
active ──request──> pending_deletion ──window closes──> purge ──> purged
                          │  (read-only, exportable)
                          └──cancel──> active
```

`DELETE` now *requests* offboarding. Purge is a separate endpoint that refuses
unless the tenant is already pending deletion, the retention window has closed
(or an explicit, recorded override reason is given), and a **final export digest**
proves the data-return obligation was discharged. Purge is deliberately **not** a
scheduled job: irreversible destruction of regulated records stays an explicit,
attributable operator action. A cron that quietly destroyed tenants on a timer
would be a worse control than the hard delete it replaced, because it would do it
unattended.

The organization **row survives** in status `purged`, carrying who requested the
deletion, when, why, which export was handed over, and who executed the purge.
Deleting that row would delete the audit trail of the deletion. The tenant's
*content* is gone; the *record that it existed and was removed* is not. The purge
list also excludes the audit trail and billing history by construction — the
former must outlive the tenant, the latter is needed for revenue recognition.

### 2.4 Seat licensing shipped inert — MEDIUM (revenue)

`server/services/seat-licensing.ts` is well built and unit-tested: it counts
active members plus outstanding invitations against `seats_purchased`. But
`isSeatEnforcementOn()` was `=== 'enforce'`, and **no deployment manifest in the
repository set the variable**. The control shipped off.

This is the same shape of defect the RLS rollout spent months closing: built,
tested, documented, switched off in every environment that matters. For a
seat-licensed product it is also direct revenue leakage — nothing stopped an
organization from running 40 users on a 25-seat contract — and it removes the
expansion signal that would have started the upsell conversation.

**Closed by** adopting the doctrine already set by `db/rlsEnforcement.ts`:
enforce by default in production, report-only elsewhere, with an explicit
`report` opt-out for the reconciliation window and a typo falling back to the
environment default rather than silently disabling a revenue control.

---

## 2.5 Second pass — two transports bypassed the lifecycle guard entirely

Found on a follow-up sweep, after the guard had shipped. Both are the same
mistake in different clothes: the guard is Express middleware on the `/api`
chain, and **not everything that reaches tenant data is on that chain.**

### 2.5.1 The public API — a suspended tenant's key kept working

`/api/v1` is on `PUBLIC_API_ALLOWLIST` precisely because it authenticates with
`X-API-Key` rather than a session — so it never reached `enforceTenantLifecycle`.
And `validateApiKey` checks the **key's** status (`revoked`, `expired`) and
nothing else: key status and *organization* status are different facts.

Net: an organization suspended for non-payment, a terminated contract, or a
security incident kept **full programmatic read and write access**, using a key
that was itself still `active`. The guard covered the session surface and left a
hole exactly the shape of the public API — the surface an enterprise customer is
most likely to have automated against.

Closed in `requireApiKey` (`routes/public-api.ts`): posture consulted after key
validation, `deny` → 403 with the machine-readable code and `tenantState` so an
integration can branch, `read_only` → writes blocked and reads allowed, unreadable
posture → 503 fail-closed. Deliberately not a carve-out like billing: there is no
"you must be able to reach checkout" equivalent here.

### 2.5.2 The collaboration socket — a suspended tenant kept editing in real time

`server/services/hocuspocus-server.ts` is a different **transport**. It checked
token class, live membership and per-document tenant ownership — genuinely good
controls — but not the lifecycle posture, because no Express middleware runs for
a WebSocket.

This one is sharper than the API-key gap: a collaboration socket is a pure
**write** channel. A suspended organization's users kept editing documents in
real time while every HTTP route refused them — the worst possible split for a
control whose entire job is to stop a suspended tenant working.

Closed in `authenticateCollabConnection`. `deny` refuses the connection;
`read_only` **downgrades** it via hocuspocus's `connectionConfig.readOnly` rather
than refusing, because a past-due tenant retains HTTP read access by design and
making a document readable over one transport but not the other buys nothing.
Where no `connectionConfig` is available to downgrade with, it fails closed
rather than admitting a writer. The check sits *after* membership, so a revoked
user is refused for revocation and never learns the tenant's billing state.

**The generalizable lesson.** A control mounted on one transport is not a
platform control. The remaining alternative-auth surfaces were enumerated and
dispositioned: Stripe webhooks must stay open (that is how a suspended tenant
pays its way back), Firecrawl webhooks are signature-verified ingestion,
`/api/csp-report` carries no tenant data, and the auth/health/setup paths carry
none either. SCIM (`/scim/v2`) is left deliberately: provisioning for a suspended
tenant arguably *should* stop while deprovisioning *should* continue, and that
distinction wants a product decision rather than a guess.

---

## 3. Residual register — triaged, not closed

Ordered by what a prospective enterprise buyer's security review would ask about
first.

| # | Gap | Severity | Note |
|---|---|---|---|
| ~~R1~~ | ~~Full-schema two-tenant probe under `RLS_ENFORCE=on`~~ | ~~High~~ | **CLOSED 2026-08-13.** `tests/schema-contract/rls-two-tenant-full-schema.contract.test.ts` — 222 policied tables, 220 seeded with two tenants, zero cross-tenant reads, ships with a negative control. Closes GA plan item 0.1. |
| R2 | No per-tenant encryption keys (BYOK/CMK) | High for regulated buyers | Frequently a hard requirement in pharma procurement. Needs a key-hierarchy design, not a patch. |
| R3 | No data-residency pinning (EU/US) | High for EU sponsors | The schema has no region concept. Architectural. |
| ~~R4~~ | ~~Tenant export covers a subset of resources~~ | ~~Medium~~ | **CLOSED 2026-08-13.** The curated manifest covered 1 of the 8 tables the purge destroys, and the purge's `finalExportDigest` gate accepted **any non-empty string** — a precondition nothing could satisfy honestly. Now: a catalog-driven full export (`GET /api/tenant-export/full`, ~170 tenant-keyed tables discovered from `information_schema`, not a hand-list), an export **receipt** persisted per digest, and a purge that verifies the digest against a receipt **scoped to that organization**. A structural contract test keeps the purge set a subset of the export set. |
| ~~R5~~ | ~~No audited support-impersonation flow~~ | ~~Medium~~ | **CLOSED 2026-08-13.** The guard now evaluates the posture for platform actors instead of short-circuiting, and writes a `tenant_lifecycle_override` audit entry (severity `critical` on a denied tenant) plus a `platform_override` metric whenever staff proceed past a refusal. Staff are still never blocked — including when the posture is unreadable. |
| R6 | `max_storage` unenforced | Low–Medium | **Partially mis-triaged in the original register — corrected.** `max_projects` is NOT decoration: `services/atomicQuotaService.js::atomicCreateProject` enforces it inside a transaction with `SELECT … FOR UPDATE`, and both creation routes (`routes/projects-management.ts:244`, `routes/project-hierarchy.ts:229`) go through it. It reads `license.max_projects` rather than `organizations.max_projects`, which is a second source of truth worth reconciling but is a working control. **`max_storage` is genuinely unenforced** — it needs storage accounting that does not exist yet, which is why it is left rather than patched. |
| ~~R7~~ | ~~Organization switch is not audited~~ | ~~Low~~ | **CLOSED 2026-08-13.** `POST /api/auth/enterprise/select-organization` now writes an `organization_switch` audit event recorded against the DESTINATION org, with the origin org and the role granted in metadata. Authorized-but-unrecorded was the wrong combination for the one endpoint whose job is to move a session between customers' data — a CRO consultant crosses it routinely, and an access review of any one sponsor needs to see when their tenant was entered and by whom. |
| R8 | Lifecycle posture cache converges across instances only within 60s | Low | Explicit invalidation is wired at every writer, so the mutating instance is immediate; others converge within the TTL. Same trade the membership cache already makes. |
| ~~R9~~ | ~~`server/routes/tenants.ts` appears unmounted~~ | ~~Low~~ | **CLOSED 2026-08-13.** Confirmed referenced nowhere (it was already carried in `scripts/ci/unreferenced-modules-baseline.json`) and deleted; both ratchets regenerated (unreferenced 109→108, requestdb baseline cleaned). It was the last copy of the ungoverned `db.delete(organizations)` cascade. The only endpoint lost with it is `GET /api/tenants/:id`, which was never reachable. |

---

## 4. Verification

| Suite | Result |
|---|---|
| `services/tenant/__tests__/tenant-lifecycle.test.ts` | 22 passed — full decision table, both asymmetric unknown-value arms |
| `services/tenant/__tests__/tenant-offboarding.test.ts` | 18 passed — every refusal path, plus the "row survives" and "audit trail excluded" invariants |
| `middleware/__tests__/tenantLifecycleGuard.test.ts` | 16 passed — carve-outs, platform bypass, read-only verb split, fail-closed |
| `middleware/__tests__/auth-establishes-scope.integration.test.ts` | 9 passed — wiring proof on **both** auth chains |
| `services/__tests__/seat-licensing.test.ts` | 11 passed — production-default enforcement |
| Regression: middleware, db, security, routes, services | 3,141 passed, 25 skipped, 0 failed |
| `tsc --noEmit`, `eslint` on changed files | clean |
| `ci:tenant-isolation`, `ci:rls-allowlist-sync` | pass |

`ci:env-var-docs` reports 8 undocumented variables. All 8 are pre-existing and in
files this change does not touch; `SEAT_LIMIT_ENFORCEMENT` is documented in
`.env.example` here.

---

## 5. Operator notes

**Rollout order matters.** The lifecycle guard denies an unrecognized `status`.
Before deploying, confirm no production organization carries a status outside
`active | inactive | suspended | pending_deletion | purged`:

```sql
SELECT status, count(*) FROM organizations GROUP BY status;
```

Any other value will be denied. This is the intended fail-closed behaviour, but it
should be discovered in a query rather than in a support ticket.

**Seat enforcement.** Production now enforces by default. Before deploying, find
tenants already over their license:

```sql
SELECT o.id, o.name, o.seats_purchased,
       (SELECT count(*) FROM organization_users ou WHERE ou.organization_id = o.id) AS members
  FROM organizations o
 WHERE o.seats_purchased > 0
   AND (SELECT count(*) FROM organization_users ou WHERE ou.organization_id = o.id) > o.seats_purchased;
```

Existing over-seat tenants are **not** retroactively broken — enforcement blocks
*additions*, not existing members. Set `SEAT_LIMIT_ENFORCEMENT=report` if the
commercial team needs a reconciliation window first.

**Metrics to alert on.** `tenant_lifecycle_decisions_total{decision="unverified"}`
rising means the posture lookup is failing and tenants are being refused for
infrastructure reasons. Alert on it separately from `decision="deny"`, which is
the control working.
