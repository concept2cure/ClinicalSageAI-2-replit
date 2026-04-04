# Build Order #9 — Lean Core Production Hardening Architecture

Date: 2026-04-04
Status: Complete

---

## 1. Dependency/Runtime Ownership Matrix

| Family | Dependency | Status | Justification |
|--------|-----------|--------|---------------|
| DB/Data | drizzle-orm | Canonical | Primary ORM |
| DB/Data | @prisma/client | Legacy (quarantine) | Only in seed scripts |
| DB/Data | pg | Canonical | Connection pool |
| DB/Data | postgres | Canonical | Serverless driver |
| DB/Data | @neondatabase/serverless | Canonical | Serverless PG |
| Cloud | @aws-sdk/* | Canonical | S3, presigner |
| Cloud | aws-sdk v2 | Legacy (quarantine) | Still used in 9 service files |
| Testing | vitest | Canonical | Unit/integration tests |
| Testing | jest | Legacy (retained) | Legacy test configs |
| Graph | reactflow | Active | PlatformReadinessDashboard |
| Graph | @xyflow/react | Dead (quarantine) | All imports commented out |
| Platform | firebase | Active | Realtime collab, auth |
| Platform | @supabase/supabase-js | Legacy (quarantine) | Data harvesting services |
| Document | docx v9.5.1 | Canonical (JS) | On-the-fly DOCX generation |
| Document | mammoth | Active | DOCX-to-HTML conversion |
| Document | pdf-lib | Active | PDF manipulation |
| Document | pdfkit | Active | PDF generation |
| Document | jspdf | Active | Client-side PDF export |
| Document | xlsx | Active | Excel parsing |
| Document | exceljs | Active | Excel generation |
| Python | python-docx | Canonical | Shadow service DOCX |
| Python | shadow_service/docx_renderer | Canonical | Template-based DOCX |

**Status definitions:**
- **Canonical** — blessed dependency, long-term.
- **Active** — in use, no replacement planned.
- **Legacy (quarantine)** — still present, no new usage allowed, removal tracked.
- **Legacy (retained)** — kept for compatibility, not actively migrated.
- **Dead (quarantine)** — all usage commented out or removed, awaiting package removal.

---

## 2. Governed Stack Simplification

Prior to Build Order #9, governed decision routes in `concept2cure.ts` directly imported and called repository functions, bypassing any centralized control. This created three problems: no observability, duplicated error handling, and dead code accumulation.

Changes made:

- **Controller delegation.** All governed decision routes now delegate to `governance-controller.ts` instead of importing repository functions directly. The controller owns logging, metrics emission, and error normalization.
- **Observability built in.** The controller emits structured logs and metrics for every governance operation (create, transition, query, health).
- **Dead shims removed.** `clearGovernedDecisionLog` and `clearTransitionLog` were no-op functions that existed only for test convenience. They have been deleted from `governed-decision-repository.ts` and all references cleaned from test files.
- **Broken history route fixed.** The route called `getDecisionLifecycleHistory`, which did not exist. Corrected to `getDecisionTimeline`.
- **Transition route simplified.** The original 78-line switch statement for state transitions was replaced with a 30-line controller delegation that validates input and forwards to the controller.
- **Health endpoint added.** `GET /governance/health` returns decision_records table row count, last transition timestamp, and service status.

---

## 3. DOCX Runtime Enforcement

A CI guard script prevents introduction of new DOCX generation entry points outside the canonical paths.

- Script: `scripts/ci/check-docx-runtime-canonicality.mjs`
- npm script: `npm run ci:check-docx-runtime`
- Behavior: scans server and client source for `new Document()` imports from the `docx` package outside of approved files. Exits non-zero if violations found.
- Approved files: the existing canonical DOCX generation services and the Python shadow service renderer.

This prevents drift back toward scattered DOCX generation that previously existed across 6+ files.

---

## 4. Workspace Review/Action UX

`GovernedDecisionReviewPanel.tsx` provides an inline review interface for pending governance decisions within the project workspace.

- Wired into `ProjectWorkspaceShell.tsx` as a collapsible panel.
- Uses all three governance hooks: `useGovernedDecisions`, `useGovernanceTransition`, `useGovernanceHealth`.
- Displays pending decisions with risk level, age, and available transitions.
- Action buttons trigger transitions through the governance controller (not direct repository calls).
- Review queue button added to `GovernanceStatusBar.tsx` for quick access.

---

## 5. Correspondence Durable Consequences

The regulatory correspondence lifecycle gate in `regulatory-correspondence.ts` now writes transition events to the database on every state change.

- Each lifecycle gate call (draft, review, send, archive) records a `recordTransitionEvent` with the correspondence ID, old state, new state, actor, and timestamp.
- This provides an auditable trail of correspondence lifecycle changes, satisfying 21 CFR Part 11 traceability requirements.
- Events are written non-blocking (fire-and-forget with error logging) so correspondence operations are not slowed.

---

## 6. Observability Enhancements

Three observability improvements:

1. **decision_records table health check.** The `/governance/health` endpoint queries the decision_records table for row count and last activity. Returns degraded status if the table is unreachable.

2. **Correspondence gate metrics.** Each correspondence lifecycle transition emits a metric with gate name, outcome (pass/fail), and duration. Failures are logged with full context for debugging.

3. **Parallel health checks.** The governance health endpoint runs its sub-checks (table health, controller status, correspondence gate status) in parallel using `Promise.allSettled`, reducing response time from serial to concurrent.
