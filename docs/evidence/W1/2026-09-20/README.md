# W1 evidence — launch-scope registry, 2026-09-20

**Row moved:** D2 (launch catalog on by default; everything else flagged off in
production). **State after this session:** green on a local instance with
`LAUNCH_SCOPE_ENFORCE=on`; staging/production still owed under W2 (D1).

## What was built

- `shared/constants/launch-scope.ts` — the one list: six apps, their surfaces,
  their `available_modules` ids, and the shell/compliance surfaces that stay.
- `server/services/entitlements/launch-scope.ts` — `LAUNCH_SCOPE_ENFORCE`
  (unset ⇒ on in production, off elsewhere; anything else refuses to boot in
  production) and `provisionLaunchModules()`.
- `navigation-entitlements.ts` — `applyLaunchScope()` overlays a
  `launch-scope` lock on every non-launch verdict and emits one for every
  registered surface with no catalog row, so the client's "unknown id is
  available" rule cannot open them. The platform owner is not exempt.
- Catalog payloads carry `launchScope.enforced`; each module carries
  `launchScope: 'launch' | 'later'`.
- Client: rail hides launch-locked entries (never a dead button); Apps catalog
  says "not in this release" with no toggle and no upsell; a deep link renders
  `LaunchScopeGate` from the same verdict; the project workspace grid drops
  launch-locked tools.
- Organisation creation (signup, first-run setup) now provisions the launch
  catalog; `npm run ops:provision-launch-modules -- --org <id>` does it for an
  existing organisation.
- `ci:launch-scope` gate + selftest, wired into `ci.yml`, with a per-symbol
  fixture allowlist (`scripts/ci/launch-scope-fixture-allowlist.json`).

## Defect found on the way

`writeModuleGrant` (the single writer of `module_subscriptions`) failed on a
real Postgres with `could not determine data type of parameter $5` whenever
`actorEmail`/`expiresAt` were null — which is every provisioning path
(free-tier activation, the Stripe webhook, and now organisation creation).
The PGlite test harness inferred the type, so tests were green. Fixed with
explicit casts; reproduced before and verified after with `PREPARE` against
the local database.

## Evidence in this folder

| File | What it shows |
|---|---|
| `ci-launch-scope.json` | Gate output on the real tree: 6 apps, 41 surfaces, 21 modules, 36 surface files checked, 0 findings |
| `ci-launch-scope-selftest.txt` | The gate exiting 1 on a seeded un-allowlisted fixture import in Vault, then passing on the real tree |
| `navigation-payload-summary.json` | `GET /api/module-subscriptions/navigation` with enforcement on: resolved, 101 verdicts, 80 `launch-scope`, 21 `master_admin` (launch apps only) |
| `home-rail-enforced.png` | Rail after login: Projects, Vault, Submission Center, Tasking, Explore and Quick access; no specialist entries |
| `apps-catalog-enforced.png` | Apps catalog: launch apps open, others "Not in this release" with lock and no switch |
| `deep-link-rbm-enforced.png` | `/concept2cure/rbm` rendering the honest panel instead of the surface |

Live numbers from the run: 86 catalog cards, 20 on, 66 not in this release;
`provision-launch-modules --org 2` granted 21/21.

## Tests

- `server/services/entitlements/__tests__/launch-scope.test.ts` (mode reader,
  scope list, `applyLaunchScope` both directions)
- `client/src/concept2cure/v2/__tests__/launchScopeLock.test.tsx` (lock copy
  offers no plan, toggle or request)
- Existing `navigation-entitlements`, `module-grants`, `grant-expiry` suites
  pass unchanged in behaviour.

## Still owed for D2

- Same run against staging once D1 lands (W2).
- `regulatory-workspace` has no catalog row and is reached only through AnA;
  it is in scope by the shell rule, not by a grant.

## Addendum 2026-09-21 (WI) — protocol development joins the catalog

By founder decision the Authoring app now includes `protocol-dev`
(`shared/constants/launch-scope.ts`, surfaces and modules). The surface was
already registered (`ui-surface-registry.ui-v2.ts`), routable and licensable;
only the scope list gated it. In the same change `authoring-engine` left the
Authoring app: `surfaces/AuthoringEngine.tsx` is a static explainer from
inline constants with no editor and no authoring API, and under enforcement
it now shows the "Not in this release" gate (verdict before / after filed).
Verdicts, the gate failing first on an unregistered id, the org-2
re-provisioning and the live screenshots are in
`docs/evidence/WI/2026-09-21/`. Live numbers: 41 launch surfaces, 21 modules
(one id swapped); navigation payload 21 `master_admin` / 80 `launch-scope`.
