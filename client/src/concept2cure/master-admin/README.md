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
| Clients        | Every organization; detail drawer with members/modules/usage/audit. |
| Users          | Every platform user with memberships, MFA, last login.              |
| Entitlements   | Module catalog and per-module enablement across clients.            |
| Audit Trail    | Platform-wide, paginated explorer over the tamper-evident log.      |
| System Health  | Live process / DB-pool / uptime snapshot of the running service.    |

## Governed actions

The two mutations — suspend/reactivate a **client** and suspend/reactivate a
**user** — require a reason-for-change (captured by `GovernedActionDialog`,
re-enforced server-side) and are written through `auditService`, so they land
in the 21 CFR Part 11 tamper-evident audit chain.

## Conventions reused

- Data fetching: `../mdx/hooks/useFetchJson` (cancellable, auth-header aware)
  and `apiRequest` from `@/lib/queryClient` for mutations.
- Icons: the shared Lucide-derived set in `../mdx/icons`.
- Styling: design-system tokens from `design-system/colors_and_type.css`,
  scoped entirely under `.madmin` in `app.css` to avoid global collisions.
- Auth/RBAC: `useAuth()` from `@/services/portal/authService`.
