# Stage 5 — Frontend Shell Truth Cleanup

Stage: Stage 5 — Frontend Shell Truth Cleanup  
Branch / commit reviewed: `cursor/critical-files-management-f38a` @ `86b32d44` (`86b32d44`) as pre-Stage-5 baseline

## Mission and boundary

Make browser entry and shell routing tell one truthful beta story without deleting core shells:

- keep `App.jsx` and `ZenApp.tsx` intact as protected organs
- avoid deep rewrites
- reduce duplicate/contradictory shell signals with reversible routing and navigation cleanup

## Files opened for evidence

- `client/index.html`
- `client/src/main.tsx`
- `client/src/main.jsx`
- `client/src/App.jsx`
- `client/src/concept2cure/router/ZenRouter.tsx`
- `client/src/concept2cure/ZenApp.tsx`
- `client/src/portal-v2/ClientPortalV2.tsx`
- `client/src/portal-v2/index.ts`
- `client/src/concept2cure/auth/redirectUtils.ts`
- `client/src/components/navigation/UnifiedTopNavV3.jsx`
- `client/src/components/navigation/UnifiedTopNavV4.jsx`
- `client/src/components/navigation/UnifiedTopNav.jsx`
- `client/src/components/common/NavigationBanner.jsx`

## Canonical declarations (Stage 5 required)

1. **Canonical beta browser entry path**  
   `client/index.html` -> `client/src/main.tsx` -> `App.jsx`  
   Evidence: `client/index.html:45`, `client/src/main.tsx:15-24`.

2. **Canonical project shell path**  
   `App.jsx` routes `/`, `/concept2cure`, `/concept2cure/*` into `ZenRouter`, then `ZenRouter` routes protected product paths into `ZenApp` (`ProtectedZenApp`).  
   Evidence: `client/src/App.jsx:412-419`, `:383-396`; `client/src/concept2cure/router/ZenRouter.tsx:494-531`.

## Before-state hazards (why Stage 5 was needed)

1. **Duplicate root ownership inside `MainApp`**  
   A second `Route path="/"` redirect existed after the first `/` route that already mounts `ZenRouter`, making the second root route unreachable and misleading.

2. **Implicit portal handling instead of explicit intent**  
   `/client-portal/*` was effectively handled by catch-all fallback to `/concept2cure` rather than an explicit fence route in the main shell.

3. **Navigation truth drift**  
   Multiple top-nav/banner surfaces labeled "Client Portal" while runtime flow steered users into Concept2Cure shell.

4. **Post-auth role fallback drift**  
   `computeRedirect` still defaulted client roles to `/client-portal`, conflicting with real shell direction during beta.

## Stage 5 implementation (thin, reversible changes)

### A) `App.jsx`: explicit shell truth and reduced route museum noise

- Removed unreachable duplicate `Route path="/"` redirect.
- Added explicit portal compatibility fence:
  - `/client-portal` -> `/concept2cure`
  - `/client-portal/:rest*` -> `/concept2cure`

Effect: legacy links now land intentionally via an explicit compatibility path, not accidental catch-all behavior.

### B) Navigation labels/targets made truthful to beta shell

Updated top-level navigation actions that previously implied a separate live portal:

- `UnifiedTopNavV3.jsx`: home chip now routes to `/concept2cure` and label updated to "Concept2Cure".
- `UnifiedTopNavV4.jsx`: home link now routes to `/concept2cure` and label updated to "Concept2Cure Home".
- `UnifiedTopNav.jsx`: "Return to Client Portal" now routes to `/concept2cure` and label updated accordingly.
- `NavigationBanner.jsx`: portal quick action now routes to `/concept2cure` and label changed to "Workspace".

### C) Auth redirect fallback aligned to canonical shell

- `client/src/concept2cure/auth/redirectUtils.ts`
  - role fallback for `client_admin` / `client_user` now lands at `/concept2cure` (same as default fallback)

This preserves safe `next/returnTo/redirect` handling while removing non-canonical fallback target.

## Validation notes for beta-safe entry path

The following browser-entry behavior is now intentional and documented:

- `/` -> `ZenRouter` landing flow (auth-aware -> `/concept2cure/login` or `/concept2cure`)
- `/login`, `/sign-in`, `/auth` -> `/concept2cure/login` (outer app redirect)
- `/client-portal/*` -> `/concept2cure` (explicit compatibility fence in `App.jsx`)

## Explicitly protected in Stage 5

- `client/src/App.jsx` (retained; only thin route cleanup/fencing)
- `client/src/concept2cure/ZenApp.tsx` (no structural rewrite)
- `client/src/concept2cure/router/ZenRouter.tsx` (no deep behavior rewrite)

## Stage 5 tolerated debt (not resolved in this stage)

1. `main.jsx` remains a fenced dormant candidate (not entry-wired).
2. `ClientPortalV2.tsx` and `portal-v2/index.ts` remain compatibility/fenced surfaces pending later ownership convergence.
3. Broader `/client-portal` links across the codebase still exist outside the targeted top-nav/banner surfaces updated here; explicit route fence prevents drift at runtime.

