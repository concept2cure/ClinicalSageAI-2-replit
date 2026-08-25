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

## 2.5 Second pass — four surfaces bypassed the lifecycle guard, and the ratchet that ends it

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

### 2.5.3 Background work — a suspended tenant kept being notified

The third instance of the same pattern, and the one that needed a different
answer rather than the same check.

`server/jobs/taskDueSweep.ts` selects open, dated, assigned tasks across **every
organization** and calls `notifyTaskEvent`. It runs on no transport, so no guard
saw it. A suspended organization's users kept receiving automated mail about work
that every HTTP route, the public API and the collaboration socket would all now
refuse them — mail whose links lead to a 403. On the AI-backed sweeps the same
gap is a spend problem: model budget burned on tenants that are not paying.

Closed with `filterTenantsForBackgroundWork`, resolved once per distinct
organization rather than per row (a 500-row sweep dominated by one tenant must
not issue 500 lookups), and reported as a `skippedNotEntitled` count rather than
a log line per row.

**Background work needed different semantics, not the same check.** Two
deliberate divergences from the HTTP rule, both pinned by test because getting
either backwards is silent:

- `read_only` is a **NO**. There is no read-only background job — a sweep exists
  to write, notify, or bill. Treating it as "go ahead" would let a past-due
  tenant keep generating notifications and spend, which is what the state exists
  to stop.
- An unreadable posture is a **SKIP, not an error**. A sweep has no caller to
  receive a 503; doing nothing this tick and retrying next is the safe failure,
  where alerting would turn a database blip into a cron alert storm.

The other jobs were surveyed rather than assumed: `retentionCron` notifies
*platform* admins with an estate summary, not tenants, and the remaining sweeps
(`auditChainIntegritySweep`, `corpusIngestionSweep`, `regulatoryHorizonScan`,
`externalIntelligenceSweep`, `scheduleOfEventsSweep`, `driftSentinelSweep`) run
estate-wide under a system scope with no per-tenant outward effect. `taskDueSweep`
was the one that needed the filter.

### 2.5.4 Socket.IO — a third transport, same gap

`server/socketServer.ts` is separate from the hocuspocus socket and carries live
task, notification, compliance and timer traffic. Its tenant ISOLATION is good —
rooms derive from the verified handshake principal, and a `check-security-patterns`
rule blocks namespace-global publishes — but isolation and entitlement are
different questions, and a suspended organization's users could still connect and
receive the feed.

Closed at the handshake. Refuses for `read_only` as well as `deny`: unlike the
hocuspocus socket there is no per-connection read-only mode to downgrade into —
this namespace is a live event feed and every handler on it publishes — so the
honest options are connect or do not. Read access to the same data remains on
HTTP, which `read_only` permits.

### 2.5.6 SCIM — the asymmetry, decided

Left open in the first pass as needing a product call. Decided here, with the
default chosen deliberately and made reversible without a deploy.

SCIM is mounted at `/scim/v2` — outside `/api`, with its own bearer token — so
the lifecycle guard never runs for it. A suspended organization's IdP could keep
**creating** users on a tenancy nobody may log into and nobody is paying for.

The behaviour is **asymmetric**, which is why it is a decision rather than a
copy of the HTTP rule:

- **Provisioning (create / activate) STOPS.** Adding a seat to a suspended tenant
  grows something unusable and, on a seat-licensed product, unbillable. An
  activating `PATCH` counts — re-activation is provisioning wearing a PATCH.
- **Deprovisioning (delete / deactivate) ALWAYS CONTINUES.** An IdP removing a
  user is a **security** action: a departed employee, or a compromised account.
  Blocking it because the tenant is behind on an invoice would turn a billing
  state into a security incident — and it is the direction an administrator
  reaches for *during* a suspension.
- **Reads always continue.** An IdP reconciling its view changes nothing.

It uses the BACKGROUND rule (`allow` only), not the HTTP one: a `read_only`
tenant must not gain seats either, and there is no safe verb here — every guarded
route creates or re-activates.

`SCIM_PROVISIONING_ON_SUSPENDED_TENANT=allow` restores the previous behaviour.
The default is `block` because that is the defensible position, but this is a
product judgement and the operator gets to override it.

Mutation-verified in both directions, which is what keeps an asymmetry honest:
disabling the guard fails the two provisioning assertions, and extending it to
`DELETE` fails the deprovisioning one.

### 2.5.5 The generalizable fix — a ratchet, not a fifth code review

Four surfaces, found one at a time, none related to the others. Finding the fifth
by reading code again is not a strategy.

`scripts/ci/check-tenant-entry-points.mjs` makes the surface **enumerable**. It
discovers files matching known entry-point shapes — scheduled sweeps, workers,
socket transports, alternative-auth routers — and requires each either to
reference the lifecycle vocabulary or to sit in a baseline **with a written
reason**. Same idiom as `check-tenant-isolation.mjs` and
`audit-requestdb-coverage.mjs`, because that idiom is already proven here and a
second pattern for the same job is just another thing to remember.

It found 16 entry points: 4 now consider entitlement, 12 are baselined. Writing
those 12 justifications was itself the exercise — three turned out to be false
positives of the matcher (session-authed routers behind the boundary), two are
**deliberately unconditional** (audit-chain integrity and retention must run *for*
suspended tenants, not despite them), six have no per-tenant fan-out at all, and
one — SCIM — is a genuine open product decision rather than an oversight.
`server/workers/ivdr-pack-worker.ts` was the one that turned out to need the check
and got it rather than a justification.

Each baseline entry carries a **content digest**. A justification is true of the
code as it stood; "this sweep has no per-tenant fan-out" stops being true the
moment someone adds one, and nothing else would notice. A changed file re-flags
for re-justification.

Verified by mutation, both arms: a new unguarded sweep fails the gate, and
appending a line to a baselined file fails it for drift.

**The lesson, stated plainly.** A control mounted on one transport is not a
platform control. This gate does not prove any individual check is correct — the
contract tests beside each surface do that — but it does mean a new entry point
cannot ship having never considered the question, which is exactly how all four
arrived.

**The generalizable lesson.** A control mounted on one transport is not a
platform control. The remaining alternative-auth surfaces were enumerated and
dispositioned: Stripe webhooks must stay open (that is how a suspended tenant
pays its way back), Firecrawl webhooks are signature-verified ingestion,
`/api/csp-report` carries no tenant data, and the auth/health/setup paths carry
none either. SCIM (`/scim/v2`) is now **closed** — see §2.5.6.

---

## 3. Residual register — triaged, not closed

Ordered by what a prospective enterprise buyer's security review would ask about
first.

| # | Gap | Severity | Note |
|---|---|---|---|
| ~~R1~~ | ~~Full-schema two-tenant probe under `RLS_ENFORCE=on`~~ | ~~High~~ | **CLOSED 2026-08-13.** `tests/schema-contract/rls-two-tenant-full-schema.contract.test.ts` — 222 policied tables, 220 seeded with two tenants, zero cross-tenant reads, ships with a negative control. Closes GA plan item 0.1. |
| R2 | No per-tenant encryption keys (BYOK/CMK) | High for regulated buyers | **SCOPED 2026-08-13** — [ADR-0012](../adr/0012-tenant-key-custody-and-data-residency.md). Still open, but no longer a one-line deferral. Measured baseline: there is no key hierarchy *at all* — three platform-wide env-var secrets, stretched three slightly different ways, no master/data key split, no `key_id` beside any ciphertext, no rotation path. So R2 is not "add a key column"; per-tenant keys attempted before an envelope scheme produce a system that cannot rotate or re-key. Sequenced R2.0→R2.4 in the ADR. R2.0 (correcting a HIPAA encryption-at-rest annotation on a module with zero production call sites) is **done**. |
| R3 | No data-residency pinning (EU/US) | High for EU sponsors | **SCOPED 2026-08-13** — [ADR-0012](../adr/0012-tenant-key-custody-and-data-residency.md). Correcting the original wording: the schema has no *residency* concept, but it has a `region` concept in fifteen-plus tables — every one of them a **regulatory** region (FDA/EMA/PMDA), which is a different thing. That collision is the first hazard: a tenant filing an EU MAA whose bytes sit in `us-east-1` is a consistent state today and the field name suggests otherwise. The ADR fixes the vocabulary (`data_residency_zone`) before any column exists, and records that the expensive step is not the database but every egress — AI providers, audit archives, embeddings, gateway transmission. |
| ~~R4~~ | ~~Tenant export covers a subset of resources~~ | ~~Medium~~ | **CLOSED 2026-08-13.** The curated manifest covered 1 of the 8 tables the purge destroys, and the purge's `finalExportDigest` gate accepted **any non-empty string** — a precondition nothing could satisfy honestly. Now: a catalog-driven full export (`GET /api/tenant-export/full`, ~170 tenant-keyed tables discovered from `information_schema`, not a hand-list), an export **receipt** persisted per digest, and a purge that verifies the digest against a receipt **scoped to that organization**. A structural contract test keeps the purge set a subset of the export set. |
| ~~R5~~ | ~~No audited support-impersonation flow~~ | ~~Medium~~ | **CLOSED 2026-08-13.** The guard now evaluates the posture for platform actors instead of short-circuiting, and writes a `tenant_lifecycle_override` audit entry (severity `critical` on a denied tenant) plus a `platform_override` metric whenever staff proceed past a refusal. Staff are still never blocked — including when the posture is unreadable. |
| ~~R6~~ | ~~`max_storage` unenforced~~ | ~~Low–Medium~~ | **CLOSED 2026-08-13.** The original register also mis-triaged its sibling: `max_projects` is NOT decoration — `services/atomicQuotaService.js::atomicCreateProject` enforces it in a transaction with `SELECT … FOR UPDATE` and both creation routes go through it (it reads `license.max_projects` rather than `organizations.max_projects`, a second source of truth still worth reconciling). `max_storage` genuinely was unenforced, because there was no answer to "how much storage does this tenant use": eleven tables carry both a tenant key and a byte column. Now: catalog-driven accounting (`services/tenant/tenant-storage.ts`), a pure `evaluateStorageQuota`, and `middleware/storageQuotaGuard.ts` mounted in **both** auth chains rather than on each upload route — see §3.1 for why that placement, and why this control fails OPEN while the lifecycle guard fails closed. |
| ~~R7~~ | ~~Organization switch is not audited~~ | ~~Low~~ | **CLOSED 2026-08-13.** `POST /api/auth/enterprise/select-organization` now writes an `organization_switch` audit event recorded against the DESTINATION org, with the origin org and the role granted in metadata. Authorized-but-unrecorded was the wrong combination for the one endpoint whose job is to move a session between customers' data — a CRO consultant crosses it routinely, and an access review of any one sponsor needs to see when their tenant was entered and by whom. |
| R8 | Lifecycle posture cache converges across instances only within 60s | Low | Explicit invalidation is wired at every writer, so the mutating instance is immediate; others converge within the TTL. Same trade the membership cache already makes. |
| ~~R9~~ | ~~`server/routes/tenants.ts` appears unmounted~~ | ~~Low~~ | **CLOSED 2026-08-13.** Confirmed referenced nowhere (it was already carried in `scripts/ci/unreferenced-modules-baseline.json`) and deleted; both ratchets regenerated (unreferenced 109→108, requestdb baseline cleaned). It was the last copy of the ungoverned `db.delete(organizations)` cascade. The only endpoint lost with it is `GET /api/tenants/:id`, which was never reachable. |

### 3.1 R6 in detail — the two decisions worth arguing with

**Why the guard is in the auth chain and not in the upload helpers.**
`middleware/uploadSafety.ts::assertUploadSafe` looked like the natural home:
every upload path already calls it. It takes a Buffer, a MIME type and a
filename — no request, therefore no tenant. Threading an *optional* organization
id through it would have produced a quota enforced only on whichever of its eight
call sites someone remembered to update, and enforced on none of the routes
written next year. That is the same defect as a hand-maintained table list, which
this codebase has been bitten by twice (the export manifest, R4; the entry-point
sweep, §2.5). So the check sits where the tenant is already known and every
authenticated request already passes, keyed on request `Content-Length` read
before any body parser runs. There is no per-route wiring, therefore nothing to
forget.

It is also mounted on `/api/v1` (`routes/public-api.ts`), which has **no
content-bearing write route today** — so it is a no-op on every current path
there, deliberately. The lifecycle guard had to be retrofitted onto that same
router (§2.5.1) precisely because a key-authenticated transport is invisible to a
guard mounted in the session auth chain. Mounting this one now means the first
`/api/v1` upload route is metered by construction rather than by whoever writes it
remembering to ask.

The cost of that choice, stated rather than hidden: the guard sees *declared*
request size, so it is a pre-flight check, not a post-hoc measurement. A chunked
upload declares no `Content-Length` and is evaluated as zero incoming bytes,
which degrades the check to "is this tenant already over?" — still a real refusal,
just not a predictive one. And only content-bearing requests are evaluated
(multipart, octet-stream, or a body ≥ 1 MiB): a storage limit must block storage,
not every mutation, or it becomes an unadvertised suspension.

**Why this control fails OPEN when the lifecycle guard fails closed.** They are
different kinds of control. Entitlement and isolation are security properties, so
an unreadable posture must never be read as "active" — the lifecycle guard answers
503. A storage quota is commercial metering; failing closed there means one
database hiccup stops every upload on the platform, taking out regulated
submission work for a billing reason. An unmeasurable quota is therefore not
enforced, but it is counted as `unverified` so the blind spot is visible rather
than silent.

**Two properties that make the number honest.** The measurement reports itself as
`partial` — it counts rows the database knows the size of, not object storage it
has no row for — and an under-count under-blocks, which is the safe direction. And
admitted bytes are charged against the 30-second usage cache, because a pure TTL
cache has a hole a bulk importer walks straight through: fifty uploads inside one
window all evaluated against the same pre-burst figure would leave the quota
holding on paper and failing in practice.

**Mutation-verified, including one test that was proving nothing.** Six mutations
were applied and each was caught by the named test: the quota boundary made
exclusive; the admitted-bytes charge removed; the production enforcement default
flipped to report; the refusal arm removed; the billing carve-out dropped; the
fail-OPEN arm made fail-closed. Two more against the accounting itself: dropping
the tenant `WHERE` clause (tenant A then sees tenant B's bytes), and widening the
size-column pattern to a bare `size` (a `page_size` column starts being billed as
storage).

A seventh mutation *survived*, and the finding was in the test rather than the
code: an assertion claiming a vanished organization row must not read as "limit
0 GB" could never fail, because a non-positive limit already means unlimited. The
comment was simply wrong. It is reworded to state what it actually pins.

Separately, three assertions in the contract test were **silently skipping**:
they guarded on `tablesInFixture.has('file_uploads')`, and `file_uploads` is not
in the base drizzle journal — it was retrofitted by its own tenancy migration. The
fixture now applies that migration and the skip-guards are gone, so a table
missing from the fixture fails loudly instead of quietly reducing the suite to
nothing. Both are recorded here because "the tests passed" is worth exactly as
much as the tests were capable of failing.

**Composition is now proven, not just each guard in isolation.** Every guard in
this workstream was unit-tested with its neighbours mocked, and every one passed.
That says nothing about whether they compose — a guard mounted in the wrong order,
or reading a request field an earlier middleware has not yet populated, fails only
on a live chain. Two claims had been written as comments in `middleware/auth.ts`
and `auth.ts` and asserted nowhere:

- **Both chains or neither.** Dropping the storage guard from the global `/api`
  gate alone fails one assertion — the one-sided mount is exactly the shape of the
  four transport bypasses closed in §2.5.
- **A suspended tenant is told it is suspended, not that it is out of disk.**
  Swapping the two mounts fails the ordering assertions and *nothing else* in the
  file: the other thirteen pass under either order, which is precisely why the
  ordering needed its own test. It matters commercially — a 413 tells a customer
  to delete files or buy storage, and neither restores access to a suspended
  tenancy.

Both verified by mutation against the real middleware, not a mock of it.

**Rollout: this one needs reconciliation first.** Unlike `seats_purchased`
(default 0 = unlimited), `max_storage` defaults to **5 GB** and nothing has ever
measured a tenant against it, so switching enforcement on can refuse tenants who
have been quietly over for months — during a submission, which is the worst moment
available. `npm run report:tenant-storage` prints exactly who would be refused and
by how much. Ship with `STORAGE_LIMIT_ENFORCEMENT=report` until that list is empty.
Report mode is not an off switch: it computes, counts and logs every decision.

---

## 4. Verification

| Suite | Result |
|---|---|
| `services/tenant/__tests__/tenant-lifecycle.test.ts` | 22 passed — full decision table, both asymmetric unknown-value arms |
| `services/tenant/__tests__/tenant-offboarding.test.ts` | 18 passed — every refusal path, plus the "row survives" and "audit trail excluded" invariants |
| `middleware/__tests__/tenantLifecycleGuard.test.ts` | 16 passed — carve-outs, platform bypass, read-only verb split, fail-closed |
| `middleware/__tests__/auth-establishes-scope.integration.test.ts` | 15 passed — wiring proof on **both** auth chains, now including guard **composition and ordering** (see below) |
| `services/__tests__/seat-licensing.test.ts` | 11 passed — production-default enforcement |
| `services/tenant/__tests__/tenant-storage.test.ts` | 25 passed — quota boundaries, every spelling of "unlimited", hostile inputs, the burst-through-cache hole |
| `middleware/__tests__/storageQuotaGuard.test.ts` | 19 passed — which requests are evaluated, carve-outs, report mode, the deliberate fail-OPEN arm |
| `tests/schema-contract/tenant-storage-accounting.contract.test.ts` | 8 passed — 11 storage tables discovered against the shipped drizzle lineage; two-tenant sum; decoy `size` column rejected |
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

**Storage enforcement.** Production enforces by default here too, but this one is
NOT symmetric with seats and the difference is the whole risk. `seats_purchased`
defaults to 0 (unlimited), so switching seat enforcement on cannot surprise a
tenant that was never provisioned. `max_storage` defaults to **5 GB** and nothing
had ever measured a tenant against it, so switching storage enforcement on can
refuse a customer who has been quietly over for months — during a submission.

Run this first; it prints exactly who would start receiving 413s and by how much:

```
npm run report:tenant-storage
```

Ship with `STORAGE_LIMIT_ENFORCEMENT=report` until that list is empty. Report mode
is a measurement mode, not an off switch: it still computes every decision, counts
it on `tenant_quota_decisions_total{resource="storage"}` and logs the tenant.

---

## 6. The three switches are machine-checkable

Every enforcement decision in this workstream is a deploy-time variable, and a
variable documented only in `.env.example` is a variable someone ships wrong. All
three now appear in `scripts/ops/ga-readiness-report.mjs` under **Tenant
entitlement switches**, so a release check reports them rather than an operator
remembering:

| Variable | READY when | BLOCKED when |
|---|---|---|
| `SEAT_LIMIT_ENFORCEMENT` | unset, or `enforce` | `report` — over-seat adds counted, never blocked |
| `STORAGE_LIMIT_ENFORCEMENT` | unset, or `enforce` | `report` — a paid limit deliberately unenforced |
| `SCIM_PROVISIONING_ON_SUSPENDED_TENANT` | unset, or `block` | `allow` — an IdP can still provision into a suspended tenant |

They deliberately do NOT use that report's `ENFORCEMENT_FLAGS` shape, which is
ready only on an exact value because unset means OFF there. These three default to
the *safe* posture in production, so "not set" is genuinely ready, and forcing
them into that shape would have made the report lie.

Falsified in both directions: each row goes BLOCKED when the control is explicitly
disabled, and a typo'd value (`repot`) reads READY — which matches the runtime,
where an unrecognized value falls back to the enforcing default rather than
silently disabling a paid control. The probe agrees with the code, not with an
assumption about it.

---

## 7. Second front — the boundaries that are not RLS

RLS is the platform's strongest tenancy control and it is genuinely mature. That
is also why the remaining isolation defects are all in places RLS does not reach.
Two were found and closed by inspecting exactly those places.

### 7.1 The Part 11 signature table had no tenant key at all — HIGH

`electronic_signatures` is the 21 CFR Part 11 §11.50/§11.70 record. `shared/
schema.ts` declared `organization_id` on it and indexed it twice;
`services/part11/signature-persistence.ts` **throws** without it and writes it on
every insert. **No migration ever created the column.** The schema lived in two
substrates — a drizzle-push model and the SQL lineage — and they had diverged.

The isolation sweep policies tables that carry a tenant column and silently skips
those that do not, correctly, because a table with no tenant key has no predicate
to write. So the signature table was not mis-policied. It was **invisible to the
control** — and invisible is the one state a "no unpoliced tenant table"
assertion cannot report, because such a table is absent from that query rather
than failing it.

It also broke deploys: `20260813d` builds an index on the missing column and
fails 42703, which takes out every migration ordered after it — **including the
isolation sweep itself**. One missing column disabled the isolation pass for the
whole tail of the set.

Closed by `migrations/20260813c2_electronic_signatures_tenant_key.sql`. Verified
by probe, not assumption: the column exists, `tenant_isolation_policy` is
installed, and RLS is **ENABLED and FORCED**. FORCE matters more here than almost
anywhere — without it the table owner bypasses the policy, and the owner is the
role the application connects as on a stock deployment.

### 7.2 Object storage was cross-tenant by construction — HIGH

RLS does nothing for bytes on a disk or in a bucket. The vault provider's read
API was `get(vaultVersionId)` — **no organization at all**:

- the **local** provider resolved that id by walking EVERY organization's
  directory under `VAULT_ROOT` and returning the first match;
- the **S3** provider read the owning org out of the object's own metadata and
  used it to rebuild the key — answering "which org owns this?" and then
  fetching, never asking whether that was the org doing the asking;
- `delete()` did the same on both. A cross-tenant delete is strictly worse than a
  cross-tenant read: the read leaks a regulatory record, the delete destroys one.

`vaultVersionId` is a `randomUUID`, which makes it unguessable but is not an
authorization control — ids leak through logs, provenance rows, exports and AI
context, and an unguessable capability is still a capability.

**The reachable vector was AI actions.** `ocr_extract_text` and
`extract_template_from_upload` passed a payload-supplied id straight through, and
on that surface the payload is **model-authored**. An instruction injected into a
document AnA is reading could name another tenant's file id and have its contents
returned as OCR text. `ctx.user.organizationId` was already in scope in both
handlers — used for provenance, never for authorization.

Closed by making `orgId` a **required** parameter on `get`, `delete` and
`getSignedUrl`. Required rather than optional deliberately: an optional tenant
argument is a control that is only on where someone remembered it, which is the
same defect as a hand-maintained allowlist. A required parameter makes the
boundary impossible to omit because the compiler asks — no CI ratchet needed.

Two supporting decisions:

- **A foreign file reports as MISSING, never forbidden.** A distinguishable 403
  confirms the id exists, turning the endpoint into an enumeration oracle. Same
  rule `ana/uploaded-file-access.ts` already follows.
- **The version id is shape-validated before it is joined onto a path.** Rooting
  the search at the caller's org made traversal reachable in a way the old
  whole-vault scan did not. Ids are UUIDs, so the check is an exact whitelist
  rather than a blocklist.

Mutation-verified by restoring the original whole-vault search: four assertions
fail, including the cross-tenant read and the cross-tenant delete.

### 7.3 In-process caches — enumerated, not spot-checked

§1 recorded org-keyed caches as "spot-checked". Spot-checking is how the one
that is wrong survives, so all **23** module-level caches in `server/` were
enumerated and their key composition read.

**22 were correct.** Several carry an explicit comment saying why — `deadline-radar`
keys on `${organizationId}:${clientWorkspaceId}`, `csr-intelligence-routes` has a
header reading "Build a cache key that cannot serve one tenant's numbers to
another", and `ana-ri/chat.ts` scopes its idempotency key to tenant *and* user so
"a client-supplied idempotency_key can never replay another org's cached
response". Prior work had clearly been here.

**One was not.** `services/ai-actions/action-registry.ts::computeIdempotencyKey`
hashed `(actionType, targetType, targetId, projectId, userId)` — **no
organization**. `userId` does not stand in for it: a user can belong to several
organizations and switch between them
(`POST /api/auth/enterprise/select-organization`), which is precisely how a CRO
consultant serving several sponsors works. Same person, same action, colliding
`targetId` — ids are per-table serials, so collisions across tenancies are
ordinary — meant one shared cache entry for the 5-minute TTL.

The confidentiality impact is bounded: both organizations are ones that user may
already reach. **The record-integrity impact is not.** A cached response is
replayed with its ORIGINAL `provenance.organizationId`, so an action executed in
sponsor B's context can return attributed to sponsor A — a misattributed record
under 21 CFR Part 11 §11.10(b). The same window also outlives a membership
revocation by up to the TTL.

Fixed by adding the organization to the hashed payload, matching the two
neighbouring caches that already did it.

**What the tests here do and do not prove.** The key function is module-private,
so the property tests reproduce its composition — which means they cannot detect
the implementation drifting away from them. A separate assertion reads
`action-registry.ts` and fails if `organizationId` leaves the hashed payload;
mutation-testing confirms it is the *only* one of the five that catches the
original defect. Recorded because a suite that looks thorough while being unable
to fail is the specific thing this workstream keeps finding.

### 7.4 An authenticated proxy reached any internal-service endpoint — HIGH

`GET /api/knowledge-base/context/:projectId` (mounted by
`bootstrap/register-document-routes.ts:259`) built its upstream path by
interpolation and then resolved it:

```ts
new URL(`/knowledge/project-context/${projectId}`, shadowUrl())
```

`new URL` **applies** `../` segments during resolution, and Express **decodes
`%2F`** inside a route param. So:

```
GET /api/knowledge-base/context/..%2F..%2Fadmin
  → projectId === '../../admin'
  → proxied to http://<shadow-service>/admin
```

Any endpoint on the internal shadow service, reachable by any authenticated user,
through a route that names exactly one. The service is not otherwise exposed, so
this route *was* the way in.

**Why it survived review.** Two things look protective and one of them genuinely
is. The `/knowledge/...` prefix does defeat a protocol-relative host override — a
`projectId` of `//evil.com` resolves to `http://<shadow>/knowledge//evil.com`, not
to `evil.com`, so the destination host really is pinned. And a single route param
looks like it cannot contain a slash. `%2F` is why it can, and the prefix does
nothing about traversal *within* the host.

**Closed by** `encodeURIComponent`, which keeps the value one inert path segment
(`..%2F..%2Fadmin` stays encoded through `new URL`). Verified end-to-end against a
real Express router rather than by reasoning about the decoding: the probe sent
`..%2F..%2Fadmin` over HTTP, observed the handler receive `../../admin`, and
observed the resolved upstream become `/admin`.

It is the only occurrence — `new URL(<interpolated path>, base)` appears nowhere
else in `server/`.

### 7.5 SSRF — checked, and already sound

Reported because a negative result is worth as much as a finding here. 43
outbound `fetch`/`axios` sites were reviewed. The tenant-controlled sinks are
guarded:

| Sink | Control |
|---|---|
| Webhook delivery targets | `utils/ssrfGuard.isSafePublicUrl` — https-only, rejects private/loopback/link-local/unique-local and the 169.254.169.254 metadata address |
| Connector base + token URLs | the same shared guard |
| Firecrawl scraping | per-tenant domain allowlist, **fail-closed** — an enabled tenant with an empty allowlist is refused with a distinct `allowlist_required` reason rather than defaulting to allow |

Everything else resolves against a server constant (NCBI, CrossRef, openFDA) with
`encodeURIComponent`'d identifiers. `ssrfGuard` even documents its own limit —
hostname inspection does not defeat DNS rebinding, so it is applied both at
storage time and before each fetch. No change was needed.

### 7.6 Tenant-blind models — the class behind two of the findings above

§7.1 (`electronic_signatures`) and the CMC finding below are the same defect seen
twice in unrelated subsystems, which makes it a class rather than two incidents:
**the Drizzle model and the physical table disagree about the tenant column.**

Measured across the whole schema: **225** tables carry a physical tenant column,
**701** `pgTable` models exist, and exactly **5** models are blind to a tenant
column their table declares. All five are in `shared/cmc-schema.ts`, a stale
parallel definition of tables that `shared/schema.ts` also models correctly.

**Why a blind model is a security property, not a tidiness one.** Every route
built on it is *structurally* unable to filter by tenant —
`db.update(t).set(x).where(eq(t.id, id))` cannot carry an organization predicate
the model does not expose. The only boundary left is RLS, one control deep.

**What the CMC routes actually do today, measured not assumed.**
`shared/cmc-schema.ts` disagrees with the database on three counts: `id` modelled
as `uuid` where the table is `serial`, and no `organization_id` where the table
declares it NOT NULL. Executed against the real DDL:

```
INSERT without organization_id → null value in column "organization_id" ... violates not-null constraint
SELECT by uuid id              → invalid input syntax for type integer
```

So `server/api/cmc/projectRoutes.ts` **500s rather than leaking** — the divergence
fails closed. These are dead endpoints, not an exposure.

**The trap, and why the five are baselined rather than fixed.** `projectRoutes`
does `db.update(drugProducts).set({...req.body}).where(eq(id, productId))` — an
unvalidated mass assignment with **no organization predicate**. Aligning the model
to the database *first* would convert a dead endpoint into a live cross-tenant
write. The divergence is currently masking a missing authorization check, and
removing the mask before adding the check is the wrong order. The baseline says
so on every entry, so the next person cannot "tidy up" `cmc-schema.ts` into a
vulnerability.

**Closed by** `scripts/ci/check-tenant-blind-models.mjs` (`ci:tenant-blind-models`,
wired into `.github/workflows/ci.yml`). Near-zero baseline — 5 of 701 — so it is a
real gate rather than a large backlog being papered over. Ratchet semantics: the
list may only shrink, entries need a written reason, and a fixed-but-still-listed
entry fails so the baseline cannot silently regrow.

It is deliberately separate from `ci:tenant-column-types`, which validates the
TYPE of declared tenant columns and by construction cannot see one that is absent.

Both failure arms verified by exit code: a new blind model exits 1; a baselined
model that has been fixed but left in the list exits 1.

### 7.7 Org ids in the URL path — audited completely, all 43 sound

A route that takes a tenant identifier from the path and uses it without
comparing it to the caller's JWT is the textbook IDOR. **RLS does not backstop
this class**: six tables sit deliberately on the RLS allowlist
(`organization_users`, `api_keys`, `stripe_events`, `billing_budgets`,
`billing_alerts`, `__drizzle_migrations`) because they must be readable *before*
a tenant context exists — `validateApiKey` resolves which org a key belongs to by
reading `api_keys` pre-auth, and policing it once broke all API-key
authentication (ledger C-44). For routes touching those tables the application
check is the only control there is.

**Result: 43 routes carry an org/tenant path param, and all 43 are guarded.** No
finding. Recorded because a clean result on the class RLS cannot cover is worth
as much as a defect.

**The real finding is structural.** The invariant is enforced by **nine**
different local idioms with no shared helper and no naming convention:

```
authorizeOrgAccess · enforceOrgScope · requireAuthedOrgId · assertTenantMatchesAuth
requireOrganizationContext · validateTenantId · orgScope · getOrgId · authedOrgId
```

Two of them are correct in a different way: `intelligent-reports` and
`mdx-imports` **ignore the path param entirely** and scope from the token, each
with a SECURITY comment saying so — a stronger answer than comparing to it.

That fragmentation is what makes the class dangerous to audit. During this review
**four separate greps each reported "unguarded" routes that were in fact guarded**
by an idiom the pattern did not know about — including one that looked, for
several minutes, like a live cross-tenant read of another tenant's user roster. A
reviewer who stops at the first such result publishes a false vulnerability; one
who trusts a too-narrow pattern in the other direction misses a real one.

**Closed by** `scripts/ci/check-org-path-param-guards.mjs`
(`ci:org-path-param-guards`, wired into CI). It encodes the vocabulary once so
the check is mechanical, with a **zero baseline** — nothing is being papered
over, and the failure mode this class actually has is a NEW route, which the gate
now blocks.

**The gate was itself defective on first write, and mutation-testing caught it.**
The initial version ended each handler's slice at the next *org-param* route, so
a guard belonging to an unrelated handler in between satisfied the check:
deleting the real guard from `tenant-users.ts` `GET /:tenantId` still exited 0,
because two intervening POST handlers each called `authorizeOrgAccess` inside the
over-long slice. Fixed to end at the next route of any kind. Both arms now
verified by exit code — a new unguarded route exits 1, and an existing route
losing its own guard exits 1. A gate that cannot fail is worse than no gate,
because it is believed.

### 7.8 The tenant header is a detector, not an input — and one thing it is not

`utils/tenantContext.ts` reads `x-organization-id` / `?organizationId`. It does
**not** trust them, and the construction is worth calling out as a pattern to
copy: the client-supplied value is compared against the JWT and, on mismatch,
raises a `tenant_header_mismatch` security alert — then the JWT value is used
regardless. The attack vector is turned into an impersonation detector. Every
other org-from-request read in `server/` is either that helper or a comment
recording where a `req.query.organizationId` IDOR was already fixed
(`decision-lineage`, `document-routes`, `client-branding`).

**What is NOT a boundary, stated so nobody assumes it is.** Three lines below,
`clientWorkspaceId` *is* taken from `x-client-workspace-id` / query and used
unvalidated. That is not a cross-tenant hole — every workspace-scoped table
(`client_workspaces`, `client_workspace_settings`, `client_security_settings`,
`projects`) carries a tenant column and is policied, so RLS confines the query to
the caller's org even where the handler filters on workspace id alone.

But there is **no workspace-level membership or ACL anywhere in the schema**, and
nothing restricts which workspace a user may select. So within one organization,
any member can scope themselves to any workspace. That is coherent with the
model this platform actually implements — the boundary is the ORGANIZATION, a CRO
serving several sponsors gets one org per sponsor, and consultants are multi-org
members whose switching is membership-validated and audited (R7). It is recorded
here only because "client workspace" reads like an isolation boundary and is not
one: if workspace-level isolation is ever sold to a CRO, this is the gap to close
first, and it is a schema change (a membership table), not a patch.

---

## 8. Security sweep — what was examined beyond the tenancy register

Recorded so the negative results carry weight alongside the fixes. Each row was
examined against the running code, not the design docs.

| Surface | Result |
|---|---|
| Tenant lifecycle / entitlement on every transport | **4 fixed** (§2.5) — session, API key, two sockets, background sweeps |
| `electronic_signatures` tenant key | **Fixed** (§7.1) — column never created; also broke deploys |
| Object storage read/delete | **Fixed** (§7.2) — cross-tenant by construction, reachable via model-authored AI payloads |
| In-process caches (23 enumerated) | **1 fixed** (§7.3) — AI-action idempotency key omitted the org |
| Internal-service proxy path | **Fixed** (§7.4) — `%2F` + `new URL` traversal to any endpoint |
| SSRF (43 outbound sinks) | **Clean** (§7.5) — shared guard on webhooks/connectors, fail-closed allowlist on firecrawl |
| Drizzle model vs physical tenant column | **Gated** (§7.6) — 5 of 701 blind, all baselined with the fix-order trap recorded |
| Org id in the URL path (43 routes) | **Clean, gated** (§7.7) — all guarded; nine idioms unified into one check |
| Org id in body/query/header | **Clean** (§7.8) — header is a detector; prior IDORs already fixed |
| Stripe + Firecrawl webhooks | **Clean** — HMAC/`constructEvent`, raw body preserved, timing-safe, fail closed without a secret |
| Pre-auth allowlist (18 entries) | **Clean** — first-run setup is rate-limited and self-closing; health/metrics carry their own gate |
| File-serving sinks (`sendFile`/`createReadStream`) | **Clean** — none takes a request-derived path |
| Mass assignment into DB writes | **Recorded** (§7.6) — reachable only if the model divergence is "fixed" without adding the org predicate |

Two lessons from the sweep itself, both earned the hard way:

1. **Pattern-matching lies in both directions.** Four greps reported unguarded
   routes that were guarded; one `(empty = unmounted)` echo printed
   unconditionally and briefly convinced me a live router was dead. Every finding
   above was confirmed by reading the handler or executing the behaviour.
2. **A gate is not evidence until it has failed.** The org-path-param gate passed
   its own first mutation and silently missed the second; the compliance-claim
   check I nearly built already existed. Both were caught by mutation-testing
   with exit codes, not by reading output.

### 7.9 Two corrections to §7.6, and a defect in one of this workstream's own gates

Both found by continuing to probe rather than by re-reading, and both matter more
than the refactor they were meant to enable.

**1. The CMC routes are not unguarded — the gap is narrower than §7.6 said.**
`server/api/cmc/projectRoutes.ts` carries a
`router.param('projectId', …)` that calls `verifyProjectOwnership` for EVERY
sub-resource route. Eighteen handlers with no visible check are covered by that
one line. A handler-scoped reading — including the analysis that produced the
original §7.6 wording — cannot see it.

The real gap is subtler and easier to miss. `router.param` verifies the PARENT:
a caller cannot reach another org's project. The sub-resource writes then filter
on the CHILD id alone:

```ts
db.update(drugProducts).set({ ...req.body }).where(eq(drugProducts.id, productId))
```

So a caller can pass **their own** `projectId` (which passes `router.param`)
together with **another tenant's** `productId`, and the write targets the foreign
row. RLS is the only thing stopping it, since `drug_products` carries
`organization_id NOT NULL` and is policied — one control deep, which is the whole
point of recording it. `drug_products` has no `project_id` column, so the write
cannot be scoped to the verified project; the organization is the predicate to
use, and it cannot be added until the model exposes the column. The baseline
entries are corrected to say this.

**2. `check-org-path-param-guards.mjs` had the same blind spot as the analysis
that produced it.** `router.param` guards were invisible to it, so a correctly
guarded router was reported as UNGUARDED — demonstrated with a synthetic router
before fixing. That is the more corrosive direction of failure: a false positive
on a safe route teaches the next reader that the gate cries wolf, and the true
positive is then ignored too.

Fixed by collecting params guarded at the router level and treating routes that
use them as covered — but only when the `router.param` callback itself contains a
guard idiom, so a param handler that merely parses the id still fails. Three arms
verified by exit code: a `router.param`-guarded route now exits 0; a
`router.param` that only parses exits 1; a handler losing its own inline guard
still exits 1.

**The pattern across this whole sweep.** Five times now, a structural feature
defeated a text-level analysis — nine guard idioms, an over-long slice, an
unconditional echo, `router.param`, and a model/DDL split. Every correction came
from executing the behaviour or reading the whole file, never from re-reading the
grep. That is the durable lesson, and it is why each gate here is mutation-tested
by exit code before being believed.
