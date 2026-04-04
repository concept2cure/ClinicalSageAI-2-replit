# Build Order #9 — Lean Core Map & Repo Topology Audit

> **Date**: 2026-04-04
> **Scope**: Dependency families, governed stack topology, broken references, client governance wiring, sprint gaps
> **Method**: Static analysis of repo imports, exports, route registrations, and hook call-sites

---

## 1. Dependency / Runtime Families

| Family | Package | Status | Notes |
|--------|---------|--------|-------|
| **DB** | `drizzle-orm` | Canonical | Primary ORM for all production queries |
| | `@prisma/client` | Legacy | Used only in seed scripts — not in runtime paths |
| | `pg` | Canonical | PostgreSQL driver |
| | `postgres` | Canonical | Neon-compatible Postgres client |
| | `@neondatabase/serverless` | Canonical | Serverless Neon driver |
| **Cloud** | `@aws-sdk/*` (v3) | Canonical | S3, SES, etc. |
| | `aws-sdk` (v2) | Legacy | Still referenced — migration incomplete |
| **Testing** | `vitest` | Canonical | Primary test runner |
| | `jest` | Canonical (legacy) | Used by older test files — coexists with vitest |
| **Graph** | `reactflow` | Active | Used in `PlatformReadinessDashboard` |
| | `@xyflow/react` | **DEAD** | All imports commented out — zero active call-sites |
| **Platform** | `firebase` | Active | Realtime collaboration and workflow features |
| | `@supabase/supabase-js` | Legacy | Used in 9 server service files for data harvesting |
| **Document (JS)** | `docx` v9.5.1 | Canonical | Primary DOCX generation |
| | `mammoth` | Active | DOCX-to-HTML conversion |
| | `pdf-lib` | Active | PDF manipulation |
| | `pdfkit` | Active | PDF generation |
| | `jspdf` | Active | Client-side PDF generation |
| | `xlsx` | Active | Excel read/write |
| | `exceljs` | Active | Excel generation (server-side) |
| **Document (Python)** | `python-docx` | Canonical | shadow_service DOCX generation |
| | `shadow_service/docx_renderer` | Canonical | Template-based DOCX rendering |

### Summary

- **Canonical**: 10 packages (drizzle-orm, pg, postgres, @neondatabase/serverless, @aws-sdk/*, vitest, docx, python-docx, shadow_service docx_renderer, reactflow)
- **Active/Useful**: 8 packages (mammoth, pdf-lib, pdfkit, jspdf, xlsx, exceljs, firebase, jest)
- **Legacy**: 3 packages (@prisma/client, aws-sdk v2, @supabase/supabase-js)
- **Dead**: 1 package (@xyflow/react)

---

## 2. Governed Stack Topology

### Server Files

| File | Lines | Exports | Role |
|------|-------|---------|------|
| `governed-decision-repository.ts` | 572 | 23 | DB-first decision storage. Single authority for all governed decisions. Handles create, query, lifecycle transitions, timeline, and summary. |
| `governance-controller.ts` | 98 | 6 | Thin request handlers. Adds validation layer and maps transition actions to repository calls. |
| `governance-observability.ts` | 216 | — | Singleton metrics service. Tracks decision counts, transition latency, error rates. In-memory only (no persistence). |
| `service-registry.ts` | 47 | — | **UNUSED** — 0 service registrations found anywhere in the codebase. |

### Route Endpoints (in `concept2cure.ts`)

| Endpoint | Method | Handler | Status |
|----------|--------|---------|--------|
| `/governance/decisions` | GET | List decisions | Functional |
| `/governance/decisions` | POST | Create decision | Functional |
| `/governance/summary` | GET | Aggregate summary | Functional |
| `/governance/trace/:id` | GET | Decision trace | Functional |
| `/governance/transition` | POST | State transition | Functional |
| `/governance/history/:id` | GET | Decision lifecycle | **BROKEN** (wrong function name) |
| `/governance/review-queue` | GET | Pending reviews | Functional |
| `/governance/health` | GET | Health check | Functional |

---

## 3. Broken References

| Location | Issue | Fix |
|----------|-------|-----|
| Route: `/governance/history/:id` | Calls `getDecisionLifecycleHistory()` which is not exported from repository | Should call `getDecisionTimeline()` — the actual exported function |
| `governed-decision-repository.ts` | `clearGovernedDecisionLog()` exists as a no-op shim | Dead code — never called, does nothing. Safe to remove or implement. |
| `governed-decision-repository.ts` | `clearTransitionLog()` exists as a no-op shim | Dead code — never called, does nothing. Safe to remove or implement. |
| `service-registry.ts` | Entire file is unused | Zero `registerService()` calls found across the repo. No imports of the registry. |

---

## 4. Client Governance Topology

### Hooks

| File | Hook / Export | Purpose |
|------|---------------|---------|
| `useFabricState.ts` | `useFabricDecisions()` | Fetches governed decisions list |
| | `useFabricSummary()` | Fetches governance summary stats |
| | `useGovernedReviewQueue()` | Fetches pending review queue |
| | `useGovernedDecisionHistory(id)` | Fetches decision timeline (hits broken route) |
| | `useGovernedDecisionTransition()` | Mutation: trigger state transition |
| | `selectBlockingDecisions` | Selector: filters decisions that block promotion |
| | `selectRecentDecisions` | Selector: filters decisions from last 7 days |
| `useGovernance.ts` | `usePromotionBlockers()` | Backward-compat wrapper around `selectBlockingDecisions` |
| | `useGovernanceDecisions()` | Backward-compat wrapper around `useFabricDecisions` |
| | Re-exports | All `useFabricState` exports re-exported for convenience |

### Components

| Component | Status | Notes |
|-----------|--------|-------|
| `GovernanceStatusBar.tsx` | **Functional** | Renders promotion blockers and recent decisions inline. Used in workspace shell. |
| `WorkspaceDashboardSurface.tsx` | Partial | Receives consequence/decision rows as props but renders **no governance-specific UI**. Data flows in, nothing renders out. |
| `workspaceShellControllers.ts` | Partial | Contains `reviewQueueVisible` state flag. No component reads or renders a review queue panel. Flag is set but never consumed. |

---

## 5. Gaps Identified for This Sprint

### Quarantine Candidates

| Item | Action | Risk |
|------|--------|------|
| `@xyflow/react` | Safe to quarantine/remove from `package.json` | None — all imports already commented out |
| `service-registry.ts` | Keep file but add `// UNUSED` header comment and document intended purpose | Low — useful concept for future service mesh |

### Broken Wiring

| Gap | Severity | Fix Effort |
|-----|----------|------------|
| History route calls wrong function (`getDecisionLifecycleHistory` vs `getDecisionTimeline`) | **High** — route returns 500 | 1 line fix |
| `clearGovernedDecisionLog()` / `clearTransitionLog()` are dead no-op shims | Low | Remove or implement with actual DB clear logic |

### Missing UI

| Gap | Severity | Notes |
|-----|----------|-------|
| No workspace review queue panel | **Medium** | `reviewQueueVisible` flag exists, `useGovernedReviewQueue` hook exists, but no panel component renders the queue |
| No decision action UI | **Medium** | Users cannot approve/reject/escalate decisions from the UI. `useGovernedDecisionTransition` mutation exists but no buttons invoke it. |
| `WorkspaceDashboardSurface` receives decision data but renders nothing | Low | Governance data passed as props is silently dropped |

### Governance Depth

| Gap | Severity | Notes |
|-----|----------|-------|
| Correspondence governance is advisory-only | **Medium** | Decisions are recorded but not enforced — no durable blocking. Promotion can proceed despite unresolved decisions. |
| Observability has no route-level metrics | Low | `governance-observability.ts` tracks in-memory counters but no route exposes them (no `/governance/metrics` endpoint) |
| `governance-controller.ts` has zero observability integration | Low | Controller does not call `governance-observability.ts` — metrics are never incremented from the request path |

---

## Summary

The governed stack has a solid foundation: `governed-decision-repository.ts` is well-structured with 23 exports covering the full decision lifecycle. The client hook layer (`useFabricState` + `useGovernance`) is complete and correctly typed.

**Critical fix**: The history route broken reference (`getDecisionLifecycleHistory` -> `getDecisionTimeline`) is a 1-line fix that should be addressed immediately.

**Sprint priorities**:
1. Fix the broken history route function name
2. Wire `governance-observability.ts` into `governance-controller.ts`
3. Build a minimal review queue panel (hook + flag already exist)
4. Add decision action buttons (transition mutation hook already exists)
5. Remove `@xyflow/react` from dependencies
