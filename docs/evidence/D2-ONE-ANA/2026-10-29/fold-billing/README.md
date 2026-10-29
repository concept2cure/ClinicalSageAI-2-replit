# Fold `billing` into Licensing (D2, 2026-10-29), Parts 1 and 1b

**Launch row:** D2 ("one AnA"; `docs/LAUNCH_DEFINITION_OF_DONE.md`).

**Founder direction, 2026-10-29:** "We are moving most 'app' into core functionality and away from any out of process 'app'."

**Plan:**
- the placement map: `.design/client-journey/FUNCTION_PARITY.md`, "Into Licensing (`licensing`) / From `billing`";
- the common fold checklist: `docs/design/DEVICE_FOLDS_2026-10-29.md` (from `2168fd56`; it applies to any fold);
- the deletion rule: `CLAUDE.md`'s working agreement.

**The work, named for what it is:**
- **move** the invoice list from the `billing` screen (`UsageBilling.tsx`'s Billing tab) to Licensing, under the plan status;
- **fix** the invoice route: it answered any member; it could not tell "billing is not set up" from "no invoices yet"; it called the page length a total and returned no cursor;
- **reach** the platform's existing role-to-screen rule (`shared/constants/permissions.ts`) for billing, so the screen offers the list to exactly the roles the route admits;
- **point** the account menu's Billing entry at Licensing, for billing administrators only.

Part 2 (after "checklist go") retires the `billing` id. See "Part 2" at the end.

## What already exists

Searched by every name the capability could have:
- names: `UsageBilling`, `billing`, `Billing`, `invoice`, `Invoices`, `billing-dashboard`, `/api/billing`, `stripe_customer_id`, `LicensingSurface`, `licensing`, `usage`, `rate-limits`, `RATE_LIMITS`, `open-tab`, `BillingDashboard`, `isOrgAdminRole`, `requireRole('admin', 'owner')`, `sessionPermissions`, `AUDIT_ATTEST_ROLES`, `pager`, `hasMore`;
- across: `client/src`, `shared`, `server`, `scripts/ci`, `tests`, `config`, `db/migrations`, `migrations`, `.design`, `docs`.

| Piece | Path | What it does today | What it does not do |
|---|---|---|---|
| Usage & billing screen (source of the move) | `client/src/concept2cure/v2/surfaces/UsageBilling.tsx` (HEAD) | One component under two ids, `usage` and `billing` (`surfaceViews.ts:568-569`). Three tabs: Usage (session window :376-410, weekly buckets :411-458, "Learn more" AnA prompt :417-429), Billing (the invoice table, :463-528), Rate limits (:546-604). Publishes AnA context under whichever id is mounted (:294-336) and registers `usage.open-tab` / `billing.open-tab` (:282-292). | The invoice list was offered to every member under both ids. `{ invoices: [] }` read as "No invoices yet" whether or not billing was set up. It read one page and had no way to the next. |
| Licensing (the target) | `client/src/concept2cure/v2/surfaces/LicensingSurface.tsx` | "Compare subscriptions": the plan status from `GET /api/billing/status` (:285-310), the tier catalogue and checkout, "Manage billing" (Stripe portal, :135). AnA context `licensing` (:227). Account menu, every member. | No invoices. Its usage row claimed "credits with auto-reload" (:530), which `UsageBilling.tsx` itself says are not metered (credit ledger `debitCredits` has no caller). |
| Invoice route | `server/routes/billing-dashboard.ts:237-297` (HEAD), mounted at `/api/billing` (`server/bootstrap/register-inline-routes.ts:210`) | Reads `organizations.stripe_customer_id` for the JWT's organisation and lists that customer's Stripe invoices. A failed read is a 500 (`serverError`). | **No role gate**: `authenticateToken` only, so any member read the amounts and the hosted and PDF links. No customer returned `{ invoices: [], total: 0 }` (:255), the same body as "none yet". `total` was the page length (:291). `page` was parsed and never used (:244). No cursor was returned, so no client could page. `startingAfter` went to Stripe unvalidated. |
| Billing writes beside it | `billing-dashboard.ts` `PUT /seats`, `PUT /weekly-limits/:metric`, `PUT /credits/auto-reload` | `requireRole('admin', 'owner')`, each written out by hand. | Three literal copies of one role list. |
| The platform's role-to-screen rule | `shared/constants/permissions.ts`; `server/middleware/orgMembership.ts` `sessionPermissions`; precedent `client/src/concept2cure/v2/surfaces/ComplianceAttestation.tsx:319-330` | The server derives a permission from the same list its guard reads (`governed:write`, `report:finalize`, `audit:attest`); every auth response carries it; the client offers a control on it and "mirrors no role list". | Had no billing permission. |
| The org-admin test | `client/src/concept2cure/v2/orgAdmin.ts` `isOrgAdminRole` | The account menu's admin entries. | Broader than the billing guard: it admits `business_admin`, `super_admin` and `platform_admin`, which `requireRole('admin', 'owner')` refuses. So it is not used for billing. |
| Account menu | `client/src/concept2cure/v2/Shell.tsx:390` (HEAD) | "Billing" → `billing`, for every member. | Offered the invoice list to members. |
| Paging precedent | `client/src/concept2cure/v2/surfaces/licensing/LicensingHistoryPanel.tsx:575-603`, `styles/licensing-history.css` `.lh-page*` | "A truncated page says so": the footer states what is on screen beside Newer and Older. | Reused here (its classes); not changed. |
| Usage route, rate card | `GET /api/billing/usage/limits` (`billing-dashboard.ts`), `GET /api/billing/rate-limits` (`RATE_LIMITS`) | Session and weekly windows for the organisation; the per-tier rate card. Any member. | `/rate-limits` has no client caller; the screen mirrors the grid as `USAGE_RATE_LIMITS`. Not changed here (the IA lists it as left work). |
| Registry claims | `shared/constants/ui-surface-registry.ts:1077` (`billing`: `/api/billing/invoices`, `/budgets`, `/portal`), `ui-surface-registry.ui-v2.ts:1258` (`licensing`: `/api/billing`) | `licensing` already claims the whole `/api/billing` prefix. | **No claim has to move**; `/api/billing` is also never gated (`server/services/entitlements/api-prefix-map.ts:26`). |
| AnA surface actions | `shared/navigation/surface-actions.ts` `usage.open-tab`, `billing.open-tab` (enum `usage`, `billing`, `limits`) | Open a tab of the shared screen. | Part 2 removes `billing.open-tab` and `billing` from the enum (a checklist file). |
| Catalogue | `db/migrations/20260810_reconcile_module_catalog.sql`, `20260823_module_catalog_commercial_packaging.sql` | | **No `billing` row** and no keep-list entry, so Rule 1's in-place amendment has nothing to amend. |
| The placement and the IA | `.design/client-journey/FUNCTION_PARITY.md` "From `billing`"; `INFORMATION_ARCHITECTURE.md` §5.8 row `billing` | "Invoices → a tab gated to administrators on the server (`/api/billing/invoices` returns them to any member today); with no Stripe customer it says billing is not set up, not 'no invoices'." | The IA also lists server gates on checkout, DTC checkout and the portal. Not in this fold's rows; see "Not carried". |

### Deletion history search (Rule 3 step 2; the working agreement)

- The clone is shallow: 1,321 commits back to `892739bb7` (2026-10-22). `git log --all --diff-filter=D --name-only`: 82 deleted paths, **none** matching `billing|invoice|licens|usage|stripe|subscription|plan-?status|rate-?limit` (`history.txt`).
- The GitHub API (`repos/.../commits?path=`, branch `concept2cure-v2`; the search API is not available to this session):
  - `server/routes/billing-dashboard.ts` and `client/src/pages/billing/BillingDashboard.tsx` were created together in `1ae2b44d3` (2026-03-19, "add Anthropic-style billing dashboard").
  - **`BillingDashboard.tsx` was deleted** in `bb243dfad` (2026-04-28, "delete every surface not built by Claude Design").
  - `UsageBilling.tsx` was created in `a32a0067c` (2026-07-13, the ui-v2 kit) and is the screen that replaced it; `LicensingSurface.tsx` in the same commit.
- So the billing screen has been deleted and rebuilt once before. This fold rebuilds nothing: the invoice table, its formatters and its shape guard are **moved** out of `UsageBilling.tsx` into `LicensingInvoices.tsx` (the old copies are deleted in the same change), and the usage half of `UsageBilling.tsx` stays where it is.

## Parity

| Function | From (HEAD) | Goes to | Status |
|---|---|---|---|
| Invoice list | `UsageBilling.tsx:463-528` | `client/src/concept2cure/v2/surfaces/LicensingInvoices.tsx`, mounted by `LicensingSurface.tsx` directly under the plan status. Shown when the session carries `billing:admin`; a member reads "Invoices are shown to billing administrators: your organization's admins and owners." and no request is made. The route is gated (`requireRole(...BILLING_ADMIN_ROLES)`). "Billing is not set up" when there is no Stripe customer; "No invoices yet" only when there is one with none; a 403 is a refusal; any other failure is "Couldn't load invoices" with Try again. Paged ten at a time by Stripe's cursor, with Newer and Older, and a line saying which invoices are on screen ("Showing invoices 1 to 10. Older invoices are on the next page."; on the last page "Showing invoices 11 to 13 of 13. There are no older invoices."). Stripe's list gives no total, so the count is stated when it is known. | **Moved** |
| Session usage window | `UsageBilling.tsx:376-410` | **Stays on `usage`** (the same component). Every member reads it (`GET /usage/limits` admits any member) and it is what a member runs into while working; Licensing is where a subscription is bought, and its invoice half is administrators only. Embedding it would put one panel on two screens. The IA's later "Subscription & billing" makes `usage` a tab of one screen, which this does not pre-empt. | Stays |
| Weekly limit buckets | `UsageBilling.tsx:411-458` | The same, for the same reason. | Stays |
| Rate limits by tier | `UsageBilling.tsx:546-604` | **Stays on `usage`.** It is a usage fact (requests and tokens per minute and day) with the organisation's tier highlighted, read by every member. Licensing's B2B catalogue has no free card, so a rate row would have nowhere to sit there. One copy stays. | Stays |
| "Learn more" AnA prompt | `UsageBilling.tsx:417-429` | Beside the weekly-limits card, on `usage`, where it was. | Stays |
| Billing entry in the account menu | `Shell.tsx:390` | `Shell.tsx`: "Billing" → `licensing`, offered when the session carries `billing:admin` (`canAdministerBilling`). Members keep Usage & limits and Compare subscriptions. | **Pointed** |
| AnA invoice facts | `UsageBilling.tsx:294-336` | Licensing's context (`invoiceContext`, `LicensingInvoices.tsx`): `facts.invoices` is `{ billingSetUp, first, last, hasMore, rows }` or `{ billingSetUp: false, rows: [] }` or `null`, and `facts.invoicesUnavailable` says why it is null (not a billing administrator; loading; refused; the read failed). The summary carries one sentence in every state. The usage context no longer carries invoices and says where they are. | **Moved** |
| AnA `billing.open-tab` | `UsageBilling.tsx:282-292`, `surface-actions.ts` | Part 1: both handlers refuse `tab: 'billing'` with where the invoices are ("Invoices are on Compare subscriptions, for billing administrators."), instead of opening a tab that is gone. Part 2 removes the action and the enum value (a checklist file). | Part 2 |
| AnA target "Billing" | `shared/navigation/index.ts:247` | Part 2: kept, resolving through the alias to `licensing`. | Part 2 |

**Also fixed on the way, because it sat beside the moved list:** Licensing's usage row no longer says the subscription meters "credits with auto-reload". Nothing debits the credit ledger (settings/integrity audit 2026-10-17, finding 4, restated in `UsageBilling.tsx`).

## Who may read invoices: the gate, red first

- **Before:** `GET /api/billing/invoices` was `authenticateToken` only. `billing-invoices-admin-gate.test.ts`, run against HEAD's route: `member`, `viewer`, `manager`, `approver`, `reviewer` and `user` each got **200 with the invoice rows** (`red.txt`).
- **After:** `requireRole(...BILLING_ADMIN_ROLES)`, the platform's existing role check, over `BILLING_ADMIN_ROLES = withExtendingRoles(['owner', 'admin'])` in `shared/constants/permissions.ts`. The three billing writes beside it now read the same list instead of three literals (no behaviour change; `billing-configuration-audit-outcome.test.ts` still pins their refusal).
- **The screen offers what the server admits:** `sessionPermissions` derives `billing:admin` from the same list, and Licensing and the account menu read it through `canAdministerBilling`, as Compliance Reports reads `audit:attest`. `session-permissions.test.ts` "billing:admin" asserts the permission and `requireRole(...BILLING_ADMIN_ROLES)` agree for eleven roles, and the route test asserts the route and the permission agree for eight.
- **The exact-equality pin** on an admin's permissions (`session-permissions.test.ts`) now lists `billing:admin`, so the addition is a visible decision rather than a tolerated one.

## Red, green, mutations

- **`red.txt`** (each against HEAD's code, before the change):
  - server route: **16/24 failed** (the six refused roles got 200; no `billingSetUp`; `total` present; no cursor; five junk cursors passed to Stripe);
  - session permissions: **15/47 failed** (the billing cases and the admin exact-equality pin);
  - Licensing invoices and the account menu: **19/19 failed**;
  - UsageBilling after the move: **3/13 failed** (an invoice read under each id; AnA's tab action). The other ten are pins that hold before and after.
  - A surviving mutation counts as red too: C3 (the shape guard accepting a body with no `billingSetUp`) survived the first run, because that test body also lacked `nextCursor` and was refused for another reason. The case was tightened and a "no cursor field" case added; both mutations are now killed.
- **`green.txt`:**
  - this change's own seven suites, **112/112**: server 79 (the route gate 24, session permissions 47, and `billing-configuration-audit-outcome.test.ts` 8, which pins the billing writes' refusal now that they read `BILLING_ADMIN_ROLES`); client 33 (Licensing invoices 17, the account menu 3, the usage screen 10 + 3);
  - the regression set, 51 suites touching the menu, Licensing, usage, billing, permissions and the billing routes, **626/627**. The one failure is trunk's: `server/services/part11/__tests__/one-signing-authority-policy.test.ts` counts `isSigningAuthorized` calls in `server/services/review/review-route-member.ts` (committed in `5985619e5`), a file this change does not touch.
- **`mutations.txt`:** **24/24 killed** (the first run 21/22, C3 surviving; then C3 and the two added mutations 3/3).
  - server, 7/7: the invoice guard, "not set up" conflated with empty, the cursor check, the next-page cursor, a billing write's own literal list, the session permission, the role list widened to managers;
  - Licensing, 12/12: a 403 read as a failure, "not set up" read as empty, the guard without `billingSetUp`, the guard without `nextCursor`, the list read whatever the permission, Older not paging, a total claimed while more remain, a failure told to AnA as no invoices, the facts not published, the card not mounted, the card moved above the plan status, Try again not reading again;
  - the account menu, 3/3: Billing to the retired screen, to every org admin, to every member;
  - the usage screen, 2/2: an invoice read restored, the billing tab reported as opened.
  - Every mutation was reversed by replacement and checked with md5.

## Gates

`gates.txt`, on HEAD `e455afe16` + this change, in a working tree shared with the ectd-publishing fold.

All green:
- ci:undefined-css-classes;
- ci:unreferenced-modules (73, baseline 73);
- ci:launch-scope;
- ci:launch-scope-api (558 paths, none refused);
- ci:surface-discoverability;
- ci:ana-surface-context (no publisher added or removed in Part 1: the `billing` publisher stays until Part 2);
- audit:ui-authority (the menu still carries a "Billing" label);
- ci:internals-in-copy, through a scoped copy: the stock gate reads every git-tracked file and crashes on `PublishingCenter.tsx`, which the ectd-publishing fold has deleted in the shared tree. The copy skips missing files and adds the untracked `LicensingInvoices.tsx` (`tools/internals-in-copy.scoped.mjs.txt`).

Type-check and lint:
- scoped `tsc` over the 13 changed files (`tools/tsc-scoped.py.txt`): 0 errors in them;
- ESLint: 0 errors; no file gained a warning, net −2 (`eslint.txt`, `tools/lint-net.sh.txt`).

No migration, registry, launch-scope or surface-action file is touched in Part 1: they are the checklist files, held for "checklist go".

## Part 1b: who may buy, change or manage the subscription

Part 1 is on trunk as `9c2fdec74`. The lead decided Part 1's first "not carried" item should be done now, because the design document already names these gates. INFORMATION_ARCHITECTURE.md, item 10 "Administration" of the order of work, and the administration session: "server role gates on `/api/billing/checkout`, `/dtc-checkout`, `/portal` and `/invoices`". Its evidence line: "a member cannot fetch invoices or start checkout". Part 1 gated `/invoices`. Part 1b gates the other three, and nothing else.

### What already exists (Part 1b)

| Piece | Path | What it does today | What it does not do |
|---|---|---|---|
| The three routes | `server/routes/billing.ts` `POST /checkout`, `/portal`, `/dtc-checkout` | Take the organisation from the token, never the body. Validate the body with zod. Open Stripe Checkout, open the customer portal, or activate the free tier (`createDTCCheckoutSession`). | **No role gate**: `authenticateToken` only. A member could open a Checkout that bills the organisation, activate the free tier, or open the portal, with its payment methods, cancellation and the invoice history Part 1 refuses them. |
| The free-tier service guard | `server/services/billing.ts` `createDTCCheckoutSession`, pinned by `server/services/__tests__/billing-free-tier-activation.test.ts` | Refuses to "activate" free over a live paid plan, and writes nothing. | It is not a role check. Its test's header said the route had none; that comment now says the route has one. The service guard stays. |
| Licensing's controls | `client/src/concept2cure/v2/surfaces/LicensingSurface.tsx` | "Manage billing" (portal) whenever a status is read. Every plan card's checkout ("Start free", "Start 14-day trial", "Choose …"). "Ask AnA about Enterprise". | Offered every control to every member. |
| Onboarding's activation | `client/src/concept2cure/v2/surfaces/Onboarding.tsx` `activate()` step 3 | Sends `/dtc-checkout` or `/checkout` last. It reports the outcome per step. | Already an administrator's act: its discovery save admits admin and owner only (`server/routes/onboarding-discovery-routes.ts` `canEditDiscovery`), and a member is told so above the steps. A 403 at checkout read "did not return a checkout link". Both failure notes said "Retry from Usage & Billing", a screen that no longer has billing. |
| Sign-up | `client/src/concept2cure/auth/ZenSignup.tsx` | Sends `/dtc-checkout` with the sign-up token. | Unaffected: sign-up mints the first user as `admin` (`server/routes/auth.ts` `/signup`). |
| Other callers | grep of `client/src`, `server`, `shared`, `tests`, `scripts` for the three paths | None but the three above. The server tests that name `/checkout` (`csrf-webhook-exemption`, `stripe-webhook-raw-body`, `tenantLifecycleGuard`, `storageQuotaGuard`) build their own stubs. | |

### The change

- **Server:** `requireRole(...BILLING_ADMIN_ROLES)` on `POST /checkout`, `/dtc-checkout` and `/portal` (`server/routes/billing.ts`, with its header listing who each route admits). This is the guard `/invoices` takes. `GET /status` stays readable by every member, so a member still sees which subscription the organisation is on. The price lists stay public.
- **Licensing:**
  - "Manage billing" is offered only with `canAdministerBilling`.
  - Each plan card's control is one `PlanCta`. "Ask AnA about Enterprise" buys nothing, so everyone keeps it. Every checkout is a billing administrator's. The current subscription is marked by the card's Current tag.
  - A member reads one line under the plan status: "Invoices and subscription changes are for billing administrators: your organization's admins and owners." This replaces Part 1's invoice-only note, so a member is not told twice.
  - AnA's facts carry `subscriptionActions` in every state. A member's available actions say checkout and the portal are not theirs, and the summary says so in one sentence.
- **Onboarding:**
  - A session without the permission sends no checkout. The summary reads "Choosing the subscription is for billing administrators: your organization's admins and owners. No plan was provisioned."
  - A 403 from checkout (a session older than its permissions) reads the same, not "did not return a checkout link".
  - The two failure notes now say "Retry from Compare subscriptions", the registry label.
  - I added no plan-step note: the wizard already tells a member that only an owner or administrator activates.

### Red, green, mutations (Part 1b)

- **Red**, against trunk `70c9e75ad` before the change:
  - `billing-checkout-portal-admin-gate.test.ts`, **24/35 failed**. Each of the seven refused roles (member, viewer, manager, approver, reviewer, user, business_admin) got **200 and reached the Stripe service** on each of the three routes, and the permission-agreement case failed on each.
  - Licensing and onboarding: **6/6 new cases failed**. The five existing onboarding cases pass before and after, because an unknown session is offered checkout as before.
- **Green:**
  - the seven 1b suites, **74/74**: server 45 (the gate 35, plus the free-tier service and the webhook contract) and client 29 (Licensing's controls, invoices and Enterprise action, and onboarding);
  - the regression set, now 62 suites (Part 1's 51, plus onboarding, sign-up, the free-tier service and the webhook contract), **741/741** on `70c9e75ad` + this change.
- **Mutations, 12/12 killed** (`mutations.txt`, "Part 1b"; `tools/mutate-1b.py.txt`):
  - each of the three route guards removed (3);
  - Manage billing offered to every member; checkout offered on a member's cards; Ask AnA about Enterprise taken from a member; AnA told a member may buy; AnA offered checkout for a member; the member's one-line note removed (6);
  - onboarding sends checkout without the permission; a 403 read as a missing link; the retired "Usage & Billing" name restored (3).
- **Gates**, on `70c9e75ad` + this change, all green: undefined-css-classes, unreferenced-modules, launch-scope, launch-scope-api, surface-discoverability, ana-surface-context and audit:ui-authority. `ci:internals-in-copy` passes through the scoped copy; the stock gate still crashes on the ectd-publishing fold's deleted `PublishingCenter.tsx`.
- **Type-check and lint:** scoped `tsc` over the 9 files, 0 errors in them. ESLint 0 errors; no file gained a warning, net −1.

## Not carried, and found (for the founder)

- **Two menu doors to one screen for administrators.** A billing administrator's menu has "Billing" and "Compare subscriptions", both opening `licensing`. This follows the placement map. Each names a job, but the design document's eventual "Subscription & billing" is one entry. Renaming is a naming decision (INFORMATION_ARCHITECTURE.md section 9), not this fold's.
- **`/api/billing/rate-limits` has no caller.** The usage screen mirrors its grid as `USAGE_RATE_LIMITS`. Unchanged.
- (Part 1's first item, checkout and the portal accepting any member, is done in Part 1b above.)

## Part 2 (after "checklist go")

Inventory, read at the time of Part 1:
- `client/src/concept2cure/v2/surfaceViews.ts:568` `billing: { component: UsageBilling }` → removed; the alias resolves it;
- `client/src/concept2cure/v2/registryModel.ts:93` `NAV_GROUP_OF.billing` → removed; `DEEP_LINK_ALIASES.billing = 'licensing'`;
- `shared/constants/ui-surface-registry.ts:1077` the `billing` entry → removed (`licensing` already claims `/api/billing`);
- `shared/constants/launch-scope.ts:234` → removed, with a guard in `launch-scope.test.ts`;
- `scripts/ci/check-surface-discoverability.mjs:62` → removed;
- `shared/navigation/surface-actions.ts` `billing.open-tab` removed; `usage.open-tab`'s enum and description lose `billing`;
- `UsageBilling.tsx`: the `billing` publish and handler go; `ID_BASELINE` in `check-ana-surface-context.mjs` minus one;
- `shared/navigation/index.ts:247` the AnA target stays, its description corrected;
- the catalogue: no row, so no amendment;
- the tours (`demo-scripts.ts`): no billing stop;
- a fold guard modelled on `foldDeviceTasks.test.ts`.
