# Stage 1 — Runtime Path Schematic

Stage: Stage 1 — Repo Truth Refresh and Canonical Ownership Map  
Branch / commit reviewed: `cursor/critical-files-management-f38a` @ `11dd2bbba54193f85d75eb55ada201967e7d75d0`

## 1) Browser bootstrap path (proven from code)

```text
client/index.html
  -> <script type="module" src="/src/main.tsx">
      -> client/src/main.tsx
          -> ReactDOM.createRoot('#root')
          -> ErrorBoundary
          -> QueryClientProvider
          -> FileContextProvider
          -> App (client/src/App.jsx)
          -> Toaster
```

Evidence:
- `client/index.html:45`
- `client/src/main.tsx:15-24`

## 2) Live root shell path (frontend)

```text
client/src/App.jsx
  -> Root provider stack:
      ModuleErrorBoundary -> ErrorBoundary -> QueryClientProvider -> AuthProvider
      -> TenantProvider -> EvidenceGraphProvider -> AnAAssistantProvider
  -> Root auth redirects:
      /sign-in, /auth, /login -> /concept2cure/login
  -> AppContent/MainApp route switch:
      /concept2cure*, /, /login, /signup -> ZenRouter
      Many legacy/module routes (admin/csr/cmc/vault/etc.)
      catch-all -> /concept2cure
  -> Global AnAAssistantContainer
```

Evidence:
- Providers: `client/src/App.jsx:939-964`
- Root redirects: `client/src/App.jsx:947-953`
- Main route switch: `client/src/App.jsx:367-929`
- Catch-all redirect: `client/src/App.jsx:927-928`
- Global assistant: `client/src/App.jsx:956`

## 3) Canonical Concept2Cure shell path

```text
App.jsx route entries
  -> lazy ZenRouter for /concept2cure, /concept2cure/* (and /)
      -> PortalAuthProvider (portal-v2 auth service)
      -> ZenRouter route switch:
          /concept2cure/login, /concept2cure/signup
          /concept2cure/project/:projectId...
          /concept2cure/* -> ProtectedZenApp
              -> ProtectedRoute (auth check)
              -> ProjectProvider
              -> ZenApp
```

Evidence:
- App mounts ZenRouter: `client/src/App.jsx:383-396`, `:413-418`
- ZenRouter provider + protected shell: `client/src/concept2cure/router/ZenRouter.tsx:273`, `:113-118`, `:525-531`

## 4) Governed workspace path (UI critical path)

```text
ZenApp
  -> when layoutMode === 'regulatory-workspace'
     and riViewMode !== 'intelligence'
      -> ProjectWorkspaceShell
          -> dossier/file/template/outline trees
          -> EditorPanel handoff
          -> provenance/review/export inspector surfaces
```

Evidence:
- `client/src/concept2cure/ZenApp.tsx:58` (import)
- `client/src/concept2cure/ZenApp.tsx:2886-2958` (render condition + component usage)
- `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx:2-7` (contract header)

## 5) Backend startup path (proven from code)

```text
package.json scripts
  -> dev: tsx server/index.ts
  -> start: node dist/index.js (built from server/index.ts)

server/index.ts
  -> env + telemetry bootstrap
  -> express app + middleware order
  -> /api/auth mounts
  -> global /api auth gate (authMiddleware from server/auth.ts)
  -> core route mounts
      /api/ana-ri
      /api/concept2cure
```

Evidence:
- `package.json:dev/start` scripts (verified during Stage 1 shell checks)
- `server/index.ts:51` (`authMiddleware` import)
- `server/index.ts:522` (`/api/auth` mount)
- `server/index.ts:600-624` (global `/api` auth gate)
- `server/index.ts:3866` (`/api/ana-ri`)
- `server/index.ts:3951` (`/api/concept2cure`)

## 6) Auth runtime path schematic

```text
Global path:
server/index.ts (/api gate)
  -> authMiddleware from server/auth.ts
      -> validates bearer JWT
      -> sets req.userId, req.userRole, req.tenantId, req.tenantContext

Parallel auth surfaces:
  -> server/routes/auth.ts mounted at /api/auth (HTTP auth endpoints)
  -> server/middleware/auth.ts (route-level helpers)
  -> server/middleware/auth.js (alternate JS behavior)
  -> server/middleware/authAdapter.ts (compat wrapper)
```

Evidence:
- `server/index.ts:51`, `:522`, `:600-624`
- `server/auth.ts:54-119`
- `server/middleware/auth.ts:64+`
- `server/middleware/auth.js:18+`
- `server/middleware/authAdapter.ts:15-16`

## 7) DB runtime path schematic

```text
Canonical:
server/db.ts
  -> pool init
  -> drizzle db export
  -> getPool()
  -> ensureAuthTables()

Compatibility:
server/db.js
  -> imports canonical db.ts
  -> exports compatibility helpers + db
```

Evidence:
- `server/db.ts:100`, `:106`, `:153`
- `server/db.js:2`, `:252`

## 8) Ambiguous/dormant runtime branches flagged in Stage 1

1. `client/src/main.jsx` exists but not loaded by `client/index.html`.
2. `client/src/portal-v2/ClientPortalV2.tsx` defines `/client-portal/*` routes but no explicit `App.jsx` route mount to this component was proven in Stage 1.
3. `server/routes/index.ts` defines `mountApiRoutes` but no usage in `server/index.ts` was proven in Stage 1.

## 9) Stage 1 validation status

- Live browser bootstrap path proven from code: **PASS**
- Live root shell identified from code: **PASS**
- Backend startup owner identified from code: **PASS**
- Contradictions against prior report explicitly listed: **PASS**

