# Work Order & Statement of Work — Master Administration + Business Center UI

**To:** Claude Design
**From:** Platform Engineering (Master Admin / Business Center workstream)
**Re:** UI design + build hand-off for the platform administration surface
**Status:** Backend + API complete, merged to `concept2cure-v2`. UI is Claude Design's deliverable.
**Related PR:** #918

---

## 0. Why this hand-off

The server, data model, access control, and REST API for two non-client-facing
admin consoles are **built, tested, and merged**. UI is owned by Claude Design.
A functional engineering baseline UI exists in the repo (see §7) **only as a
reference for behavior and data wiring** — it is not the design deliverable.
Claude Design should design and build the production UI to the design-system
standard, using this document as the requirements source of truth.

Two consoles, two access tiers:

1. **Master Administration** — support tier. Non-client-facing. Cross-tenant
   monitoring + product-level support for the platform owner and support team.
2. **Business Center** — owner/finance tier. Cost-based accounting, revenue,
   margins, P&L. Stricter access than support.

---

## 1. Work Order (summary)

| Field | Value |
| --- | --- |
| Deliverable | Production UI for the Master Administration console and the Business Center console |
| Surfaces | 8 (Master Admin) + 5 (Business Center) — see §4, §5 |
| Data | Live REST endpoints already shipped (see §3) — no mocks needed |
| Standards | design-system tokens; WCAG 2.2 AA; 21 CFR Part 11 governed-action UX; calm motion; reviewer-grade microcopy |
| Out of scope for Design | Server, schema, auth, business logic (all complete) |
| Acceptance | §8 |

---

## 2. Product context & access model

- **Audience:** internal only (platform owner + support + finance). Never shown
  to clients/tenants. No marketing polish; this is an operations console —
  dense, fast, legible, trustworthy.
- **Three-tier spine:** client licensing (`organizations`, `module_subscriptions`,
  `feature_toggles`) → support backend (Master Admin) → executive module
  (Business Center). All read/write the same tables, so numbers reconcile.
- **Access tiers (enforced server-side; the UI must reflect, not enforce):**
  - Master Admin: roles `super_admin` / `platform_admin` / `support`, OR the
    `PLATFORM_ADMIN_EMAILS` allowlist, OR an active platform role grant.
  - Business Center: roles `owner` / `business_admin` / `super_admin` (support is
    **excluded**), OR `BUSINESS_CENTER_EMAILS`, OR an active business role grant.
  - Every endpoint returns **401** (unauthenticated) or **403** (authorized
    tier mismatch). The UI must render a clear, non-leaky **access-denied** state
    for 403 (no data hints), and route to login for 401.
- **Governed actions (Part 11):** every mutation requires a typed
  **reason-for-change** (min 3 chars) and is written to the tamper-evident audit
  chain. The UI must present a confirmation dialog that captures the reason
  before the call, show the action's consequence plainly, and surface success/
  failure. See the `regulatory-compliance-ux` skill.

---

## 3. API contract (already shipped — design to this)

Base auth: `Authorization: Bearer <jwt>` + `x-organization-id`. JSON in/out.

### Master Administration — `/api/admin/master`
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/overview` | KPIs: tenants {total,active,suspended,new_30d}, users {total,active,suspended,active_30d,new_30d}, usage {credits_30d,events_30d}, modules {enabled}, audit {last_24h,last_7d}, tiers[] |
| GET | `/tenants?q=&status=` | All orgs: name, slug, tier, status, client_type, seats, member_count, last_active, enabled_modules, credits_30d |
| GET | `/tenants/:id` | tenant detail + members[] + modules[] + usage[] + recentAudit[] |
| PATCH | `/tenants/:id/status` | suspend/reactivate (governed: {status, reason}) |
| PATCH | `/tenants/:id/modules` | enable/disable a module (governed: {moduleId, enabled, reason}) |
| GET | `/users?q=&status=` | all users + memberships[] + mfa_enabled + last_login |
| PATCH | `/users/:id/status` | suspend/reactivate (governed: {status, reason}) |
| GET | `/entitlements` | module catalog + enabled_orgs counts |
| GET | `/feature-flags` | flags + enabled + per-org/workspace override arrays |
| PATCH | `/feature-flags/:key` | toggle global (governed: {enabled, reason}) |
| GET | `/billing` | byPaymentStatus[], trialsEndingSoon[], pastDue[], unacknowledgedAlerts[] |
| PATCH | `/billing/alerts/:id/acknowledge` | ack an alert (governed) |
| GET | `/connectors` | per-client connector validity (no secrets) |
| GET | `/jobs?status=` | deep-research jobs + 7d status summary |
| GET | `/system-health` | db pool, uptime, memory, env, node version |
| GET | `/audit?client=&action=&limit=&offset=` | paginated platform audit explorer |

### Business Center — `/api/admin/business`
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/cost-accounting` | per-client {revenueCents, revenueSource: 'stripe'\|'modeled', costCents, marginCents, marginPct, byFeature[]} + totals |
| GET | `/cost-accounting.csv` | CSV export (governed/audited) — needs Bearer; download as blob |
| GET | `/pnl` | platform P&L + byTier[] |
| GET | `/executive-summary` | portfolio {clients, activeClients, mrrCents, monthlyCostRunRateCents, grossMarginCents, grossMarginPct}, risk {lossMakingClients, lossMakers[], revenueConcentrationTop5Pct}, topClients[], tierMix[] |
| GET | `/cost-rates` | rate card (defaults merged w/ overrides; source flag) |
| PATCH | `/cost-rates/:costKey` | set unit cost (governed: {unitCostCents, reason}) |
| GET | `/tier-pricing` | per-tier price card |
| PATCH | `/tier-pricing/:tier` | set tier price (governed: {monthlyPriceCents, perSeatCents, reason}) |
| GET | `/metering-coverage` | accuracy audit: meteredFeatures[], gaps {usageWithoutExplicitRate[], ratedButNoUsage[]}, healthy |
| GET | `/access` | roster: roles[], allowlistEmails[], roleHolders[] |

### Access management — `/api/admin/access`
| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/grants` | active platform role grants + grantee user |
| POST | `/grants` | grant a role (governed: {email\|userId, role, reason}) |
| DELETE | `/grants/:id` | revoke a grant (governed: {reason}) |

All money values are **integer cents** — format to currency in the UI. All
timestamps are ISO strings or null. All percentages are numbers (e.g. `94.7`).

---

## 4. Master Administration — surfaces & UI requirements

Shell: left rail (collapsible) + top bar (breadcrumb + refresh + "internal,
non client-facing" indicator) + content. RBAC-gated; access-denied state for
non-platform users.

1. **Overview** — estate KPI cards (clients, new clients 30d, users, active
   users, usage credits, enabled modules, audit volume); tier breakdown; jump
   links. Needs loading skeletons, empty state (fresh install), error+retry.
2. **Clients** — searchable, status-filterable table; row → **detail drawer**
   (org facts, members table, module entitlements with per-module enable/disable
   toggle, 30d usage by feature, recent audit). Governed suspend/reactivate
   (client + per-module). Status badges with tone (active/suspended/inactive).
3. **Users** — searchable table; memberships chips, MFA on/off, last login;
   governed suspend/reactivate per user.
4. **Billing** — payment-status mix; trials ending ≤14d; past-due/incomplete;
   unacknowledged billing alerts with one-click acknowledge.
5. **Entitlements** — module catalog grouped by category; per-module
   "enabled clients" counts.
6. **Feature Flags** — global on/off with override counts; governed toggle.
7. **Audit Trail** — paginated, filterable (action, client) tamper-evident log;
   when/action/target/actor/client/IP columns; relative + absolute time.
8. **Operations** — live system health (DB pool, uptime, memory, env) with
   gentle auto-refresh; connector validity per client; deep-research job
   throughput. Health/degraded indicator.

---

## 5. Business Center — surfaces & UI requirements

Shell mirrors Master Admin but a distinct, more "executive/finance" tone; a
clear "owner · finance" indicator. Stricter access-denied state (support is
excluded). Money formatted as currency; margins with sign + color tone
(positive/negative); a small "Revenue: Stripe-invoiced vs modeled" legend
wherever revenue appears.

1. **Executive Summary** — headline KPIs (MRR, monthly cost run-rate, gross
   margin $/%, clients, active); **loss-making clients** table (cost > revenue —
   high-visibility/danger tone); revenue concentration (top-5 share %); top
   clients by revenue; tier mix. This is the owner's landing view.
2. **Cost Accounting** — per-client table: client, tier, status, revenue (with
   source flag), cost, margin, margin% (sortable; lowest-margin first by
   default). **Download CSV** action (authenticated blob download).
3. **Rate Cards** — editable cost rates (per metered feature) and tier prices;
   each edit is a **governed** action (reason-for-change dialog); show
   default-vs-override source and last-updated.
4. **Metering Coverage** — accuracy audit: "healthy" indicator; metered features
   table; two gap lists — *usage without an explicit rate* (mispricing risk) and
   *rates with no usage* (stale). Explain why this matters (cost accuracy).
5. **Access** — read-only roster of who can enter (roles, allowlisted emails,
   active grants). (Grant/revoke management UI is optional v2 — see
   `/api/admin/access`; if built, governed dialogs.)

---

## 6. Cross-cutting UI requirements (apply to both consoles)

- **Design system:** use design-system tokens only (`--bg-*`, `--text-*`,
  `--border`, `--accent-main-*`, `--success/--warning/--error`, `--radius-*`,
  `--font-*`). Lucide icons only. Light + dark mode.
- **States:** every data view needs loading (skeleton), empty (with guidance),
  and error (message + retry). Never a blank screen.
- **Governed actions:** mandatory reason-for-change capture; destructive actions
  (suspend, disable, flag-off) use danger tone + explicit consequence text;
  optimistic UI is discouraged — confirm on server response. (`regulatory-
  compliance-ux`, `microcopy-tone` skills.)
- **Tables:** dense, tabular-nums for numbers, right-aligned numerics,
  sortable where useful, server-driven pagination for audit.
- **Accessibility:** WCAG 2.2 AA — keyboard operable, visible focus, no keyboard
  traps in drawers/modals, ARIA on icon-only buttons, color-never-alone for
  status/margin. (`accessibility-enforcement` skill.)
- **Motion:** calm — 200ms ease-out default, no spring/bounce/overshoot, respect
  `prefers-reduced-motion`. (`motion-discipline` skill.)
- **Microcopy:** calm, factual, restrained; no exclamations or cheerleading.
  (`microcopy-tone` skill.)
- **Money/percent/time formatting:** cents→currency; consistent percent
  precision; relative + absolute (tooltip) time.
- **Non-leaky security:** 403 access-denied must not reveal any data or counts;
  401 routes to login.
- **Responsiveness:** usable down to laptop widths; rail collapses; tables scroll
  horizontally rather than break.

---

## 7. Greenfield — no baseline UI in the tree

By design decision, **no baseline UI ships** for these consoles. Only the
backend + API are merged. Claude Design builds the UI greenfield from this SOW
and the API contract (§3) — there is nothing to override or preserve.

A throwaway engineering baseline existed during development and was intentionally
**removed before merge**; if you want it purely as a behavior reference, it is
recoverable from this branch's git history (PR #918, commit prior to the
"strip baseline UI" change) — but treat the design as new work to the
design-system standard. The route registrations at
`client/src/concept2cure/router/ZenRouter.tsx` (`/concept2cure/master-admin`,
`/concept2cure/business-center`) are where the designed entrypoints get wired
back in.

---

## 8. Acceptance criteria

1. All 13 surfaces (§4, §5) implemented against the live endpoints (§3) with
   loading/empty/error states.
2. Both access-denied states correct and non-leaky; tiers visually distinct.
3. Every governed action captures a reason and reflects server success/failure.
4. WCAG 2.2 AA pass (run `accessibility-enforcement` review).
5. Motion + microcopy pass (`motion-discipline`, `microcopy-tone` reviews).
6. Light/dark parity; design-system tokens only; Lucide only.
7. Design review pass against this SOW (`design-review` skill).

---

## 9. Suggested process (designer skills)

`information-architecture` → `design-brief` → `design-tokens` (reuse existing) →
`frontend-design` per surface → `accessibility-enforcement` + `motion-discipline`
+ `microcopy-tone` + `regulatory-compliance-ux` enforcement → `design-review`
against §8.
