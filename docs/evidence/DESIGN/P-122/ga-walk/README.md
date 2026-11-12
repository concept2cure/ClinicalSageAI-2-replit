# P-122: the GA walk — every launch screen with the production access gate on (2026-11-12)

**What was run.** The app at `d41ef02b9`, with `LAUNCH_SCOPE_ENFORCE=on` and `LAUNCH_SCOPE_API_UNATTRIBUTED=enforce`
(the gate production runs), `RLS_ENFORCE=on`, as `app_service`, on the demo data. A synthetic organisation
administrator on the top tier signed in through the form. `walk.cjs` opened all 43 launch screens (44 visits: a
small-molecule IND, a biologic IND and a device 510(k)), then clicked every tab on each. For each it recorded
redirects, page errors, console errors, every API response of 400 or more with its code, and failure text on the page.
The raw record is `findings.json`.

## What already exists (Rule 3)

- `ci:launch-scope-api` checks statically that every path a launch screen names is served. This walk is the same
  question asked of the running app, which also catches paths built at run time.
- `docs/evidence/DESIGN/R1/2026-11-01-inventory/` §1 listed 196 handlers called by a screen and refused in production,
  and asked for this walk ("What happens next", step 1).

## Result

- **44 screen visits, 82 tabs clicked. No request was refused by the launch-scope gate** (no `403 LAUNCH_SCOPE`), no
  screen redirected, and none threw a page error.
- **Three screens made a request that failed:**

| Screen | Request | What it is |
|---|---|---|
| Enterprise identity | `GET /api/admin/scim-tenants`, `/scim-ip-allowlist` → 403 | The screen is offered to an organisation administrator, and its reads need a platform administrator. It says so ("Platform administrator required"). It should not be offered to someone who cannot use it. |
| 510(k) and eSTAR | `GET /api/predicate-intelligence/candidates`, `/se-matrix` → 503 `PREDICATE_INTELLIGENCE_NOT_CONFIGURED` | The predicate service is not configured on this instance. A deployment setting. |
| IVDR evidence | `GET /api/ivdr/gspr-checklist/:id/matrix` → 404 `IVDR_GSPR_NOT_FOUND` | No checklist exists for the project yet; a missing record is answered as an error. |

- **Four tabs failed, all on CMC for the biologic project (LMN-201):** Specifications, Stability, Quality by design
  and Module 3 build each got `409 CMC_PRODUCT_CLASS_OUT_OF_SCOPE`. This is decision P-28's boundary, by design. The
  same tabs on the small-molecule project (C2C-201) are clean.
  - The shelf-life estimate is ICH Q1E, including its extrapolation rule. For a biologic ICH Q5C governs: shelf life
    rests on real-time data. So the refusal is scientifically right, and turning the Q1E engine on for a biologic
    would not be. A Q5C trend for biologics is an engine addition and a founder decision (P-73, P-74 item 4).

## What was done about the three

- **Enterprise identity: fixed** (`fixes/identity-red.txt`, `identity-green.txt`). ⌘K offers the page only to a
  platform administrator (`ADMIN_AUDIENCE` in `Shell.tsx`). The Admin console's SSO tab gives its "Open Identity
  console" button only to one; a customer's administrator reads who sets up single sign-on and SCIM instead
  (`IdentityConsoleDoor` in `AdminSettings.tsx`). The page's refusal no longer prints the role names
  `super_admin` and `platform_admin`. Red: 2 tests failed. Green: 116 of 116 across the 13 suites that read these
  files.
- **Predicate intelligence: a deployment setting, no code change.** The 510(k) screen's predicate candidates and
  SE matrix are proxied to a separate service (`server/routes/predicate-intelligence.ts`: `SHADOW_SERVICE_URL`,
  `REVIEW_ADMIN_TOKEN`). Without the token the route answers 503 with its code, and the screen says once that it is
  not configured (2026-11-09). For GA, production needs that service and token, or the two tabs say so.
- **IVDR checklist: by design, no code change.** `useIvdGsprMatrix` (`mdx/hooks/useIvd.ts:256`) reads the 404
  `IVDR_GSPR_NOT_FOUND` as "this project has no checklist yet" and the screen shows that.

## What this does not show

- The walk opens screens and tabs. It does not create, edit, sign or file anything. Those flows are qualified by the
  OQ protocols (`docs/validation/OQ-*.md`) and each slice's acceptance walk.
- AnA's answers. This instance has no AI provider configured, so the conversation could not be exercised.
- Tiers. The organisation was on the top tier. On `standard`, Biostatistics, Risk-based monitoring and CMC show
  locked, by the product owner's packaging of 2026-08-24.
