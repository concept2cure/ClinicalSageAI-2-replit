# Master Administration

The **Master Administration** console is the platform-owner and support-team
surface. It is **non client-facing**: it exists for product-level support and
cross-tenant client monitoring, not for any individual customer.

- **Client route:** `/concept2cure/master-admin`
- **API base:** `/api/admin/master` (see `server/routes/admin/master-admin.ts`)

## Access model

Access is restricted to **platform roles** — `super_admin`, `platform_admin`,
or `support`. These are distinct from the org-scoped roles every tenant has
(`admin / manager / member / viewer`); a tenant administrator must never reach
this console.

Enforcement is in two layers:

1. **Server (authoritative):** `server/middleware/requirePlatformAdmin.ts`
   gates every endpoint. It has **no org-admin bypass**. It also honours a
   bootstrap allowlist — set `PLATFORM_ADMIN_EMAILS` (comma-separated) to grant
   the platform owner before a platform role is provisioned in the database.
2. **Client (UX only):** `App.tsx` shows an access-denied panel when the
   signed-in user lacks a platform role, so non-admins never see broken
   surfaces.

## Surfaces

| Nav            | What it shows                                                        |
| -------------- | ------------------------------------------------------------------- |
| Overview       | Estate-wide KPIs — clients, users, usage, modules, audit volume.    |
| Clients        | Every organization; detail drawer with members/modules/usage/audit + per-client module toggles. |
| Users          | Every platform user with memberships, MFA, last login.              |
| Billing        | Payment-status mix, trials ending soon, past-due clients, open billing alerts. |
| Entitlements   | Module catalog and per-module enablement counts across clients.     |
| Feature Flags  | Global rollout toggles with per-client override visibility.         |
| Audit Trail    | Platform-wide, paginated explorer over the tamper-evident log.      |
| Operations     | Live service health, integration-connector validity, deep-research job throughput. |

## Governed actions

These mutations require a reason-for-change (captured by `GovernedActionDialog`,
re-enforced server-side) and are written through `auditService`, so they land in
the 21 CFR Part 11 tamper-evident audit chain:

- suspend / reactivate a **client**
- suspend / reactivate a **user**
- enable / disable a **module entitlement** for a client
- enable / disable a global **feature flag**
- acknowledge a **billing alert**

## Business Center (owner / finance tier — API only)

A **separate, stricter** access tier for cost-based accounting and business
operations, mounted at `/api/admin/business`. The support team can reach Master
Admin but **not** the Business Center.

- **Guard:** `server/middleware/requireBusinessAdmin.ts` — business roles
  (`owner` / `business_admin` / `super_admin`) or the `BUSINESS_CENTER_EMAILS`
  allowlist. `support` / `platform_admin` are rejected.
- **Endpoints** (`server/routes/admin/business-center.ts`):
  - `GET /cost-accounting` — per-client revenue, attributed cost, gross margin
    (trailing 30d), sorted lowest-margin first.
  - `GET /cost-accounting.csv` — CSV export (audited).
  - `GET /pnl` — platform revenue/cost/margin roll-up, with a by-tier breakdown.
  - `GET /cost-rates`, `PATCH /cost-rates/:costKey` — unit cost rate card.
  - `GET /tier-pricing`, `PATCH /tier-pricing/:tier` — per-tier price card.
- **Cost model:** revenue = tier price card × seats; cost = metered
  `usage_records` credits × owner-set unit rates. Rate cards live in
  `platform_cost_rates` / `tier_pricing` (owner-managed, non-tenant config) and
  fall back to code-level defaults so reports work before any override. All
  rate-card edits are governed (reason-for-change) and audited.
- UI intentionally not built (per product direction) — consume via API / CSV.

## Tests

- `server/middleware/__tests__/requirePlatformAdmin.test.ts` — the access
  boundary (platform roles pass, org roles rejected, allowlist honoured).
- `server/routes/admin/__tests__/master-admin.test.ts` — route gating,
  validation, status codes, and audit-on-mutation (DB/auth/audit mocked).
- `server/middleware/__tests__/requireBusinessAdmin.test.ts` — the stricter
  finance boundary (support is rejected).
- `server/routes/admin/__tests__/business-center.test.ts` — cost-accounting
  math, P&L, CSV export, and governed rate-card edits.

## Conventions reused

- Data fetching: `../mdx/hooks/useFetchJson` (cancellable, auth-header aware)
  and `apiRequest` from `@/lib/queryClient` for mutations.
- Icons: the shared Lucide-derived set in `../mdx/icons`.
- Styling: design-system tokens from `design-system/colors_and_type.css`,
  scoped entirely under `.madmin` in `app.css` to avoid global collisions.
- Auth/RBAC: `useAuth()` from `@/services/portal/authService`.
