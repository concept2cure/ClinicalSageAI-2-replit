# Cleanup Execution Matrix (derived from repo risk map)

Date: 2026-03-26
Scope: convert risk findings into an execution-safe cleanup plan for guided beta.
Policy: **risk map != deletion approval**. No destructive cleanup without proof.

---

## Guardrails (non-negotiable)

1. Do not delete probable dead code without proof.
2. Do not collapse/merge risky routes without runtime validation.
3. Do not break beta-visible product truth for tidiness.
4. Any candidate touching auth, project context, artifacts, editor, export, provenance, audit, or signatures is at least **gated**.

---

## Required proof before destructive action

Every Delete/Merge candidate must attach evidence for:

- [ ] Import graph check (static importers + dynamic imports where possible)
- [ ] Route mount check (all mount points + aliases + compatibility facades)
- [ ] Nav reachability check (router/menu/deep-link reachable)
- [ ] Feature-flag reachability check (flag definitions + callsites + env gates)
- [ ] Test references (unit/integration/e2e usage)
- [ ] Runtime smoke path impact (beta golden-path manual/API smoke)

---

## Guided beta sensitive surfaces

### 510(k) beta flow — treat as high sensitivity
- `client/src/components/510k/*`
- `client/src/pages/*` and Concept2Cure shell routes that deep-link into 510(k)
- `server/routes/*` and `server/index.ts` mounts involving `/api/fda510k`, `/api/510k`, `/api/510k/estar`, `/api/device-data-center`, `/api/content-assembly`

### Biotech document lifecycle — treat as high sensitivity
- Authoring/editor/workspace surfaces in `client/src/concept2cure/components/editor/*`, `ProjectWorkspaceShell`, and CoAuthor pages
- Backend routes around `/api/document-authoring`, `/api/coauthor`, `/api/ectd-*`, `/api/documents`, `/api/reports`
- Anything tied to artifacts, export/provenance/audit/signature chains

### Critical domains requiring explicit gating
- Auth & tenancy: `server/auth.ts`, `server/middleware/auth.*`, tenant context middleware
- Project context/routing: project routers and shell route resolution
- Artifacts/storage/export/provenance/audit/signatures

---

## CLEANUP EXECUTION MATRIX

## 1) Delete now (safe with current proof)

### Candidate D1
- **Exact file/path:** `server/routes_update.ts`
- **Why candidate:** Appears to be a snippet, not a full module (top-level `app.use` without registration wrapper).
- **Proof exists:** No discovered callsites in current route registration scans; file shape indicates non-runtime-ready snippet.
- **Proof missing:** Final import-graph proof + test reference proof + runtime smoke confirmation.
- **Blast radius:** Low (if truly unreferenced).
- **Regression risk to guided beta paths:** Low, but still verify because route registration mistakes can be silent.
- **Classification note:** “Delete now” means first in queue **after** proof checklist is green.

### Candidate D2
- **Exact file/path:** `client/src/hooks/use-auth.jsx`
- **Why candidate:** Marked deprecated and functionally empty shim.
- **Proof exists:** File explicitly marked `@deprecated Legacy auth hook` and exports no behavior.
- **Proof missing:** Confirm no legacy import path references from JSX/TSX/tests and no bundler alias usage.
- **Blast radius:** Low.
- **Regression risk to guided beta paths:** Low unless stale imports still exist in edge routes.

---

## 2) Merge / consolidate (medium risk; gated)

### Candidate M1
- **Exact file/path:** `client/src/main.jsx` + `client/src/main.tsx`
- **Why candidate:** Parallel entrypoints suggest split ownership and drift risk.
- **Proof exists:** Both files exist and bootstrap app roots.
- **Proof missing:** Build tooling truth (which entrypoint is active per environment), test/e2e dependency mapping.
- **Blast radius:** Medium-high (global app bootstrap).
- **Regression risk to guided beta paths:** High if wrong entrypoint removed; could impact all beta navigation.

### Candidate M2
- **Exact file/path:** `server/db.js` + `server/db.ts`
- **Why candidate:** Duplicate DB access surface creates consistency drift and import ambiguity.
- **Proof exists:** JS file re-exports TS pool while also carrying JS-level status logic.
- **Proof missing:** Full importer map, runtime initialization order proof, migration/task script dependencies.
- **Blast radius:** High (all server DB paths).
- **Regression risk to guided beta paths:** High (all transactional flows, including 510(k)/biotech lifecycle).

### Candidate M3
- **Exact file/path:** `server/middleware/auth.js` + `server/middleware/auth.ts`
- **Why candidate:** Dual auth middleware stacks are a fragility hotspot.
- **Proof exists:** Both auth middleware variants exist.
- **Proof missing:** Exact runtime-mounted one(s), compatibility dependencies, tenant/auth edge-case tests.
- **Blast radius:** Very high.
- **Regression risk to guided beta paths:** Very high (login/session/tenant isolation).

### Candidate M4
- **Exact file/path:** Duplicate mount prefixes in `server/index.ts` (`/api/ai`, `/api/billing`, `/api/reports`, `/api/documents`)
- **Why candidate:** Repeated mounts can shadow behavior or make ordering brittle.
- **Proof exists:** Multiple mounts observed on same prefixes.
- **Proof missing:** Runtime route table proof + request-level behavior matrix + API smoke parity.
- **Blast radius:** Very high.
- **Regression risk to guided beta paths:** High for 510(k), coauthor, document lifecycle endpoints.

---

## 3) Hide / deprecate (non-destructive first)

### Candidate H1
- **Exact file/path:** `server/routes_fixed.ts`
- **Why candidate:** Likely legacy alternate registrar; no active callsite found in current scans.
- **Proof exists:** File exists as “fixed routes registration file” but active server bootstrap uses `server/index.ts`.
- **Proof missing:** Complete importer proof + script/test references.
- **Blast radius:** Low-medium.
- **Regression risk to guided beta paths:** Low if hidden first (deprecate tag + warning), medium if deleted blindly.

### Candidate H2
- **Exact file/path:** Unused feature flag IDs in `client/src/flags/featureFlags.ts`
- **Why candidate:** Large block of flags appears non-referenced by current search.
- **Proof exists:** Definition list present; spot checks show no obvious callsites for multiple IDs.
- **Proof missing:** Dynamic access audit (string-built IDs), remote config/admin usage, product/ops signoff.
- **Blast radius:** Medium.
- **Regression risk to guided beta paths:** Medium-high if hidden flags are toggled out-of-band.

### Candidate H3
- **Exact file/path:** `server/routes/index.ts` aggregator + `mountApiRoutes`
- **Why candidate:** Appears unmounted by primary server bootstrap.
- **Proof exists:** No direct callsite found during current search.
- **Proof missing:** Dynamic import path proof, historical boot variants, test harness dependencies.
- **Blast radius:** Medium.
- **Regression risk to guided beta paths:** Medium unless hidden first and observed.

---

## 4) Needs proof before action (hold)

### Candidate P1
- **Exact file/path:** `client/src/hooks/*`, `client/src/utils/*`, `client/src/lib/*` candidates flagged by basename heuristics
- **Why candidate:** Potentially stale helpers from heuristic scan.
- **Proof exists:** Heuristic “no obvious basename references” only.
- **Proof missing:** Real import graph, runtime usage, lazy-load/dynamic references.
- **Blast radius:** Unknown.
- **Regression risk to guided beta paths:** Unknown-to-high depending on hidden runtime wiring.

### Candidate P2
- **Exact file/path:** Large monoliths (e.g., `server/index.ts`, `server/routes/concept2cure.ts`, `shared/schema.ts`, major client monolith components)
- **Why candidate:** Refactor pressure is high, but splitting can change behavior.
- **Proof exists:** High size/churn hotspots documented.
- **Proof missing:** Behavior-preserving extraction plan + high-confidence regression suite.
- **Blast radius:** Very high.
- **Regression risk to guided beta paths:** Very high.

### Candidate P3
- **Exact file/path:** Route families touching artifacts/editor/export/provenance/audit/signatures
- **Why candidate:** Cleanup likely valuable but safety-critical.
- **Proof exists:** Route concentration and overlapping mounts.
- **Proof missing:** End-to-end path validation and signed artifact parity.
- **Blast radius:** Very high.
- **Regression risk to guided beta paths:** Very high.

---

## 5) Do not touch before beta

### Candidate B1
- **Exact file/path:** `server/index.ts` route order and bootstrap wiring
- **Why candidate:** Centralized high-risk route fan-in and middleware order dependency.
- **Proof exists:** Single-file control plane for many API mounts.
- **Proof missing:** Safe decomposition tests and runtime route table assertions.
- **Blast radius:** Platform-wide.
- **Regression risk to guided beta paths:** Critical.

### Candidate B2
- **Exact file/path:** Auth/tenant core (`server/auth.ts`, `server/middleware/auth.*`, tenant middleware)
- **Why candidate:** Security and tenant isolation boundary.
- **Proof exists:** Multiple implementations and compatibility layers.
- **Proof missing:** Auth parity matrix across all beta personas/tenants.
- **Blast radius:** Critical.
- **Regression risk to guided beta paths:** Critical.

### Candidate B3
- **Exact file/path:** Biotech lifecycle + export/provenance/signature routes and corresponding UI flows
- **Why candidate:** Business-critical guided beta truth surface.
- **Proof exists:** Direct linkage to authoring, artifacts, and submissions.
- **Proof missing:** Lifecycle e2e parity under seeded beta scenarios.
- **Blast radius:** Critical.
- **Regression risk to guided beta paths:** Critical.

---

## Explicit impact calls

## Potential impact to 510(k) beta flow
- Any cleanup involving `/api/fda510k`, `/api/510k`, `/api/510k/estar`, predicate/assembly/pathway flags, or shell routing is high risk.
- Entrypoint consolidation (`main.jsx`/`main.tsx`) and route-prefix merges can disrupt beta deep links.

## Potential impact to biotech document lifecycle
- Any changes in document authoring/coauthor/eCTD/reporting routes or shared `/api/documents` mount behavior are high risk.
- Cleanup touching editor state, artifact generation, export/provenance, audit trails, or signatures must be staged with runtime smoke and lifecycle e2e checks.

## Touchpoints that require executive caution
- Auth
- Project context
- Artifacts
- Editor
- Export
- Provenance
- Audit
- Signatures

---

## Recommended execution order

## Phase A: safe now (proof-backed low-risk)
1. Run proof checklist for D1/D2.
2. Remove `server/routes_update.ts` if no references.
3. Remove deprecated empty `client/src/hooks/use-auth.jsx` if no references.
4. Re-run targeted smoke checks + relevant tests.

## Phase B: gated cleanup (validation-first)
1. Deprecate/hide `server/routes_fixed.ts` and `server/routes/index.ts` aggregator before deletion.
2. Build route-behavior matrix for duplicate mounts in `server/index.ts`; normalize only with parity tests.
3. Start flag cleanup by marking candidates deprecated (not deleted), then remove after telemetry/ops confirmation.

## Phase C: post-beta cleanup (structural)
1. Consolidate `main.jsx`/`main.tsx` and JS/TS middleware twins with explicit parity plan.
2. Refactor monoliths (`server/index.ts`, `server/routes/concept2cure.ts`, large client modules) only after beta hardening.
3. Complete deep lifecycle regression suite for biotech and 510(k) paths, then perform larger structural deletions.

---

## Execution stance

Be ruthless, not reckless:
- Delete only with proof.
- Consolidate only with runtime parity.
- Protect beta-visible truth over repo neatness.

---

## Continuation: execution worksheet (ready-to-run)

Use this worksheet to convert matrix decisions into auditable proof artifacts.

### Proof command pack (copy/paste)

```bash
# 1) Import graph check
rg -n "routes_update|use-auth\.jsx|routes_fixed|mountApiRoutes|featureFlags" server client shared tests

# 2) Route mount check (primary bootstrap)
rg -n "app\.use\(" server/index.ts

# 3) Nav reachability check (client route/router/menu references)
rg -n "main\.tsx|main\.jsx|use-auth|regulatory-submissions|510k|coauthor|ectd" client/src

# 4) Feature-flag reachability check
rg -n "ENABLE_510K_MODULE|ENABLE_PREDICATE_SEARCH|ENABLE_IVDR_MODULE|ENABLE_EARLY_ACCESS_MODULES" client/src server tests

# 5) Test references check
rg -n "routes_update|routes_fixed|use-auth\.jsx|mountApiRoutes|featureFlags" tests server client

# 6) Runtime smoke path impact (example API checks; adapt to env)
# curl -i http://localhost:5000/api/health
# curl -i http://localhost:5000/api/fda510k/health
# curl -i http://localhost:5000/api/document-authoring/health
```

### Candidate tracking board

| Candidate | Tier | Owner | Proof complete? | Beta-sensitive domain | Go/No-Go |
|---|---|---|---|---|---|
| `server/routes_update.ts` | Delete now | TBD | No | Routing bootstrap | No-Go until proof |
| `client/src/hooks/use-auth.jsx` | Delete now | TBD | No | Auth edge imports | No-Go until proof |
| `server/routes_fixed.ts` | Hide/deprecate | TBD | No | Routing bootstrap | No-Go until proof |
| `server/routes/index.ts` (`mountApiRoutes`) | Hide/deprecate | TBD | No | API mount topology | No-Go until proof |
| `client/src/main.jsx` + `client/src/main.tsx` | Merge/consolidate | TBD | No | Global app bootstrap | No-Go pre-beta |
| `server/db.js` + `server/db.ts` | Merge/consolidate | TBD | No | DB/runtime init | No-Go pre-beta |
| `server/middleware/auth.js` + `server/middleware/auth.ts` | Merge/consolidate | TBD | No | Auth/tenant isolation | No-Go pre-beta |
| Duplicate `/api/*` mounts in `server/index.ts` | Merge/consolidate | TBD | No | 510(k), biotech lifecycle | No-Go pre-beta |
| Unused flag candidates in `client/src/flags/featureFlags.ts` | Hide/deprecate | TBD | No | Feature rollout truth | No-Go until telemetry+ops |

### Exit criteria per phase

- **Phase A complete** when D1/D2 proof checklist is fully green and smoke paths pass.
- **Phase B complete** when route/flag deprecations show no regressions through guided beta runs.
- **Phase C complete** only after post-beta structural parity tests pass for 510(k) + biotech lifecycle.
