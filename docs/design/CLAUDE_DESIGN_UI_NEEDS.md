# Claude Design — UI Needs & Hand-off

**Purpose:** the consolidated list of UI work the design team needs to build, and the backend contracts/constraints it must respect. All UI has been **deliberately left to Claude Design** — the engineering work to date is backend, services, security, and specs.

**Date:** 2026-06-21 · **Author:** backend/QA (Claude Code)

---

## 1. Where the canonical specs already live (build from these)
- **`docs/design/FEATURE_AND_SERVICE_INVENTORY.md`** — exhaustive, code-derived catalog: every module → feature → sub-feature with code path, maturity (Built/Partial/Stub), data model, operations, and **what the UI must show**. This is the primary build-from reference.
- **`docs/design/UI_CODEBASE_STUDY.md`** — the advisory UX study: document-lifecycle spine, the **7 reusable primitives** (Lifecycle Ribbon, Readiness Inspector, Governed-action Sign-off, Provenance/grounding chips, AnA panel, Signals/Alerts, Audit viewer) and the **10 primary workspaces / IA**.

Start there for scope and structure. This document adds the **deltas and constraints** that emerged from the licensing build and the multi-wave QA storm.

## 2. Cross-cutting UI requirements (apply to everything)
- **21 CFR Part 11 / GxP:** governed mutations need reason-for-change capture; high-impact actions need an e-signature (password + MFA) flow. Build the **Governed-action Sign-off** primitive once and reuse. Never show fabricated success.
- **Tenant isolation is now enforced server-side (see §3.1).** Every data view/mutation is org-scoped; the UI must always operate within the authenticated org and handle `401 AUTH_REQUIRED` / `403` / not-found cleanly.
- **WCAG 2.2 AA** (procurement gate), **calm motion** (200ms ease-out, `prefers-reduced-motion`), **per-tenant theming**, and **reviewer-grade microcopy** (factual, no cheerleading).

## 3. New / changed backend contracts the UI must accommodate (from this work)

### 3.1 Quality Control module — now strictly org-scoped (security fix)
All QC **write** endpoints now require a JWT-derived org and reject cross-tenant access. The QC UI (OOS investigations, batch releases, deviations, microbiological tests, reference standards) must:
- Always send the authenticated session; expect `401 { code: 'AUTH_REQUIRED' }` when missing.
- Treat a not-found/forbidden on another org's record as "not found" (no cross-tenant visibility).
- Routes: `PUT /api/qc/oos-investigations/:id` (+ `/timeline`, `/root-cause`, `/capa`), `PUT /api/qc/batch-releases/:id`, `PUT /api/qc/deviations/:id` (+ `/impact-assessment`, `/capa`), `PUT /api/qc/microbiological-tests/:id` (+ `/results`), `PUT /api/qc/reference-standards/:id` (+ `/usage`).

### 3.2 QC endpoints intentionally **NOT IMPLEMENTED** (501) — fail-closed
These return `501 { notImplemented: true }` on purpose (they previously faked success on GMP records). The UI must **not** present them as working, and these features need real backend before UI is built:
- `POST /api/qc/batch-releases/:id/review` (batch-record review)
- `POST /api/qc/batch-releases/:id/coa` (Certificate of Analysis generation)
- `POST /api/qc/batch-releases/:id/validate-criteria` (release-criteria validation)
- `POST /api/qc/batch-releases/:id/release` (batch disposition/release)
> Design treatment: show these as "pending" / disabled with an honest explanation, not as completed actions.

### 3.3 Expedited-programs screener — new required input
PMDA **Sakigake** eligibility now requires **all four** catalog criteria. The screening form (`matchExpeditedPrograms`) must collect:
`innovativeNovelMechanism`, `seriousOrLifeThreatening`, `substantialImprovementOverExisting`, `intendedForEarlyJapanDevelopment` (boolean each). `innovativeNovelMechanism` is **new** — add the input.

### 3.4 Intelligent licensing & EULA (backend shipped — PR #910)
A full entitlements + end-user-license backend exists and needs UI:
- **Entitlements/upgrade panel** ← `GET /api/licensing/entitlements` (tier, per-module feature availability, quota usage with %/near-limit, and ranked recommendations) and `GET /api/licensing/features`.
- **Clickwrap acceptance flow** ← `GET /api/licensing/agreements/outstanding`, `POST /api/licensing/agreements/:id/accept`; gate the app when agreements are outstanding (`403 LICENSE_ACCEPTANCE_REQUIRED` carries the list). History at `GET /api/licensing/acceptances`.

### 3.5 GraphRAG query UI — bounded inputs
`POST /api/graphrag/query` now clamps `maxHops` to 1–5 and `topK` to 1–100. Any query-tuning UI should expose only those ranges.

## 4. UI build backlog surfaced (priority order suggestion)
1. **Governed-action Sign-off + Readiness Inspector + Lifecycle Ribbon** primitives (unlock everything else).
2. **Section Workspace (editor) + Project Home + AnA panel** — the daily driver.
3. **Licensing/EULA UI** (§3.4) — backend is ready now, clean first win.
4. **QC module UI** (§3.1) — org-scoped CRUD for OOS/batch/deviation/micro/reference-standard, with §3.2 endpoints shown as pending.
5. **Submission/eCTD builder + Submission Center + Review/Approvals**.
6. **Evidence/Vault + Signals/Intelligence center + Global-RI requirements matrix** (incl. the expedited-programs screener §3.3).

## 5. Open questions for design discovery
Carried from `UI_CODEBASE_STUDY.md` Part 9 — concurrent-editing scope, revert/rollback UX, section-level permission matrix, review-thread lifecycle, Global-RI IA, eCTD compile/validation pass criteria, evidence-linking interaction, and tool/command visibility by role/tier. Items marked **Partial/Stub** in the inventory are where backend is incomplete — pair design with backend on those.

---

*Backend, services, security, and specs are in place or in flight; the UI surface is yours to design. Ping engineering for any contract details — the inventory has verbatim routes, enums, and data models for every item above.*
