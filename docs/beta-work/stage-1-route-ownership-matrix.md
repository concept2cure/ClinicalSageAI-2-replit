# Stage 1 — Route Ownership Matrix

Stage: Stage 1 — Repo Truth Refresh and Canonical Ownership Map  
Branch / commit reviewed: `cursor/critical-files-management-f38a` @ `8a09e9d45388c9d7e3241b3ff06eeec6444f30da`

## Scope

This matrix covers route ownership across:
- `client/src/App.jsx`
- `client/src/concept2cure/router/ZenRouter.tsx`
- `client/src/portal-v2/ClientPortalV2.tsx`
- direct legacy routes and redirect-only routes

## Ownership legend

- **canonical-shell route**: current primary UX path
- **compatibility route**: retained path for transition/legacy continuity
- **legacy direct route**: non-shell route mounted directly in `App.jsx`
- **redirect-only route**: route exists only to reroute
- **dormant-candidate route tree**: route tree defined but not proven mounted from live shell

---

## A. `App.jsx` route ownership (`MainApp` switch)

| Route(s) | Type | Owner | Current behavior | Evidence |
|---|---|---|---|---|
| `/concept2cure/login`, `/concept2cure/signup`, `/concept2cure`, `/concept2cure/*` | canonical-shell route | `ZenRouter` | Delegates to Concept2Cure shell router | `client/src/App.jsx:369-396` |
| `/` (first definition) | canonical-shell route | `ZenRouter` | Root path delegates to ZenRouter | `client/src/App.jsx:413-419` |
| `/sales` | legacy direct route | `SalesLandingPage` | Public sales page | `client/src/App.jsx:421-427` |
| `/ana` | legacy direct route | `AnaCortex` | Standalone AnA page | `client/src/App.jsx:439-445` |
| `/submission-center`, `/cmc-wizard`, `/cerv2/*`, `/editor`, admin and module routes | legacy direct route | App-level module routes | Directly mounted lazy legacy/module pages | `client/src/App.jsx:437-926` |
| `/billing`, `/billing/*` | redirect-only route | `App.jsx` | Redirects to `/concept2cure/billing` | `client/src/App.jsx:429-434` |
| `/ana-cortex` | redirect-only route | `App.jsx` | Redirects to `/ana` | `client/src/App.jsx:446-448` |
| `/cmc`, `/cmc-module` | redirect-only route | `App.jsx` | Redirects to `/cmc-wizard` | `client/src/App.jsx:497-499`, `:667-669` |
| default catch-all | redirect-only route | `App.jsx` | Redirects unknowns to `/concept2cure` | `client/src/App.jsx:927-928` |

### App-level auth gate ownership

| Route(s) | Type | Owner | Behavior | Evidence |
|---|---|---|---|---|
| `/sign-in`, `/auth`, `/login` (outer switch) | redirect-only route | `App` (outer wrapper) | Redirects to `/concept2cure/login` before `MainApp` | `client/src/App.jsx:946-953` |
| all other routes (outer switch) | canonical-shell route | `AppContent` | Passed through protected wrapper unless concept2cure/public path | `client/src/App.jsx:237-258`, `:952-954` |

---

## B. `ZenRouter.tsx` route ownership

| Route(s) | Type | Owner | Behavior | Evidence |
|---|---|---|---|---|
| `/concept2cure/login`, `/concept2cure/signup` | canonical-shell route | Zen auth flow | `AuthRoute` + `ZenLogin` / `ZenSignup` | `client/src/concept2cure/router/ZenRouter.tsx:288-307` |
| `/` | redirect-only route | `LandingPageRoute` | Redirects to `/concept2cure` (auth) or `/concept2cure/login` (unauth) | `client/src/concept2cure/router/ZenRouter.tsx:251-262`, `:316-322` |
| `/concept2cure/legal/*`, `/concept2cure/password-reset`, `/concept2cure/onboarding` | canonical-shell route | ZenRouter | Legal/auth adjunct flows inside Zen shell | `client/src/concept2cure/router/ZenRouter.tsx:327-492` |
| `/concept2cure/project/:projectId/*`, `/concept2cure`, `/concept2cure/*` | canonical-shell route | `ProtectedZenApp` | Routes to main shell (`ZenApp`) | `client/src/concept2cure/router/ZenRouter.tsx:113-118`, `:495-531` |
| `/login`, `/signup`, `/billing` | redirect-only route | ZenRouter | Redirect helpers to concept2cure namespace | `client/src/concept2cure/router/ZenRouter.tsx:310-313`, `:323-324` |
| `/concept2cure/project/:projectId/510k*`, `/pma*` | compatibility route | bridge routes | Standalone bridge when embed flag disabled | `client/src/concept2cure/router/ZenRouter.tsx:367-413` |

---

## C. `ClientPortalV2.tsx` route ownership

| Route(s) | Type | Owner | Behavior | Evidence |
|---|---|---|---|---|
| `/client-portal`, `/client-portal/*` family | dormant-candidate route tree | `ClientPortalV2` | Full nested portal router defined | `client/src/portal-v2/ClientPortalV2.tsx:228-406` |
| `/client-portal/ind-wizard`, `/ectd-coauthor`, `/protocol-designer`, `/medical-writing`, `/dossier` | redirect-only route | Portal v2 router | Redirects to `/client-portal/documents` | `client/src/portal-v2/ClientPortalV2.tsx:288-343` |

### Portal-v2 mount reality (from live app shell)

| Check | Finding | Evidence |
|---|---|---|
| `App.jsx` contains explicit `/client-portal` route mount | **No** | No `/client-portal` route in `client/src/App.jsx` route table (`:367-929`) |
| fallback behavior for unknown paths | Redirect to `/concept2cure` | `client/src/App.jsx:927-928` |
| route links to `/client-portal` exist elsewhere | Yes (many references) | e.g. `UnifiedTopNavV3.jsx`, `redirectUtils.ts`, `portal-v2/layouts/*` (repo grep evidence) |

---

## D. Route collisions / overshadowing / ambiguity

1. **Duplicate `/` in `MainApp` switch**  
   - First `/` delegates to `ZenRouter`, second `/` redirects to `/concept2cure`.  
   - The second definition is overshadowed by the first in first-match switch behavior.  
   - Evidence: `client/src/App.jsx:413-419` and `:436`.

2. **`/login` defined in multiple layers**  
   - Outer app switch redirects `/login` to `/concept2cure/login` before `MainApp`.  
   - `MainApp` also defines `/login` -> `ZenRouter`, and `ZenRouter` defines `/login` redirect.  
   - Ownership is layered, with outer switch winning first.  
   - Evidence: `client/src/App.jsx:398-404`, `:946-953`; `ZenRouter.tsx:310`.

3. **`/client-portal/*` links vs route ownership mismatch**  
   - Links exist in many files, but no proven mount in `App.jsx`; unknowns fall to `/concept2cure`.  
   - Evidence: `client/src/App.jsx:927-928` and grep output for `/client-portal`.

## Stage 1 known cleanup hazards (must be treated as Stage 2 risks)

These are explicitly flagged as cleanup hazards, not just route notes:

1. **Layered `/login` ownership hazard**  
   Cleanup can easily break auth flow because `/login` is handled in multiple layers (`App` outer redirect, `MainApp`, `ZenRouter`).
2. **Duplicate `/` ownership hazard**  
   Two `/` route entries in `MainApp` increase regression risk from route-order edits; one appears overshadowed.
3. **`/client-portal/*` ownership hazard**  
   Many link emitters target `/client-portal/*`, but explicit mount ownership in `App.jsx` is unproven; route cleanup without ownership decision can strand user paths.

---

## E. Stage 1 conclusion for route ownership

- Canonical product route ownership for beta is:  
  `App.jsx` (root) -> `ZenRouter.tsx` (Concept2Cure gateway) -> `ZenApp.tsx` (primary shell).
- Legacy direct routes still exist in `App.jsx` and remain compatibility burden.
- `ClientPortalV2.tsx` is currently best classified as **dormant-candidate route tree** until explicitly mounted from the live app shell.
- Stage 2 should be proof-driven: resolve `/client-portal/*` ownership decision before any portal deletion or route consolidation.
