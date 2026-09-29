# D2 / D6: the device kit under `/api/mdx` answered as launch

**Row:** D2 / D6, the launch-scope API lane (`…session_01E8btkB8mcLirW4rNvsMNxK`).
**Date:** 2026-09-26. Found while measuring AnA's tools against the launch catalog.

## What was wrong

`gateway-transmittals` has claimed the whole `/api/mdx` prefix since 2026-07-21
(`shared/constants/ui-surface-registry.ts`), although its own `engineering`
note says its routes are `/api/mdx/gateways`. It is a launch surface, and
launch scope passes a path when any claiming surface ships. So in production
every device-kit API under `/api/mdx` answered as launch: clinical studies,
labeling, IVD/IVDR, companion diagnostics, CLIA, LDT, UDI, risk, software,
RBM and the rest. The device kit is outside the launch catalog.

## What changed

- `gateway-transmittals` claims `/api/mdx/gateways`, the routes it owns.
- The launch screens that called other `/api/mdx` paths now have explicit
  owners:
  - `/api/mdx/vault` belongs to `vault` (`useVault.ts`).
  - `/api/mdx/admin` belongs to `admin-console` (`AdminAccess.tsx`).
  - `/api/mdx/industry-profile` (read across the shell, written by Setup and
    onboarding) and `/api/mdx/notifications` (the task tray) go on
    `LAUNCH_PLATFORM_API`, each with its reason.
  - `/api/mdx/qms` (quality) and `/api/mdx/ana/*` (AnA memory) were already
    claimed by their surfaces.

## Proof

| Check | Red | Green |
|---|---|---|
| Real-registry gate test: device kit refused, launch paths under `/api/mdx` pass | 1 failed of 24: `/api/mdx/risk-items/1` passed (`gate-red.txt`) | 24/24 (`gate-green.txt`) |
| `ci:launch-scope-api` with the narrowing alone, no new owners | 7 launch calls refused: vault ×2, industry profile, admin, notifications ×3 (`ci-gate-red.txt`) | 268 paths, none refused (`ci-gate-green.txt`) |

**Production effect, measured.** The route inventory
(`scripts/ci/launch-scope-route-inventory.ts --rows`) was run in production
posture before and after, against a throwaway copy of the local database.
Exactly **130 routes moved from launch to refused (60 of them writes)**, all
under `/api/mdx`, and nothing else changed (`route-verdict-diff.json`).
Before: launch 1,229 and out-of-scope 941. After: launch 1,099 and
out-of-scope 1,071. The largest groups are clinical-studies (13), labeling
(11), ivd (10), ivdr (9), cdx (8), analytics (7), imports (7), udi (6),
clia (6) and ldt (6). No launch or shell screen calls any of them (the CI
check above). None is on the auth boundary's public list or has an external
caller. `rbm-metric-ingest` is a signed-in user's upload from the hidden RBM
app.
