# FEATURE_INVENTORY.md — Concept2Cure / ClinicalSageAI

> Authoritative UI inventory for the `concept2cure-v2` codebase. Every surface below is already implemented on the backend or has routes + tables wired. Claude Design owns the UI redesign.
>
> **Source of truth:** the Comprehensive UI Design Report written by the repo's own Copilot agent (saved at `scraps/mdx-copilot-brief.txt`). This doc summarizes it into an implementation-ordered surface plan.

---

## 1 · The shape of the app

Single-page React 18 + Vite app. Entry at `client/src/concept2cure/ZenApp.tsx` (113 KB). No page reloads — a **`layoutMode` state machine** swaps the main canvas. URL is secondary.

### layoutMode values (from `zen-app-constants.ts` — authoritative)

| Category | Modes |
|---|---|
| Global          | `projects`, `apps`, `artifacts-center`, `setup` |
| Project tabs    | `project-home`, `documents`, `vault`, `review`, `submissions`, `dossier-map`, `section-workspace`, `csr-workflow`, `ind-checklist`, `template-library` |
| Workspaces      | `regulatory-workspace`, `editor`, `deep-research` |
| Specialist      | `precedent-intelligence`, `biostatistics`, `review-readiness`, `report-engine`, `safety-narrative`, `device-diagnostics-workbench`, `vault-workspace` |
| Embedded modules| `510k` (standalone `CERV2Page`), `pma` (standalone), `cer` (inline) |
| Tool panels     | `ectd`, `protocol`, `sop`, `capa`, `pms`, `inspection`, `intelligence`, `vault`, `doc-editor`, `ana-biostats` |

### Global layout (every authenticated screen)

```
┌─ Left rail (15 items, 4 tiers) ─┬──────── Main canvas ──────────┬─ AnA right panel ─┐
│  Projects · Apps · Artifacts    │  layoutMode-driven            │  Persistent chat   │
│  Setup · project tabs ·          │  (home, editor, vault,        │  Standard/Deep/   │
│  specialist tools                │   510k workbench, etc.)        │  Nano-banana      │
└──────────────────────────────────┴────────────────────────────────┴───────────────────┘
```

---

## 2 · Core surfaces we must design (ordered by dependency)

### Tier A — Auth & Identity
1. **Login** — email+password, lockout after 5 fails (15 min), demo button (dev only)
2. **MFA challenge** — 6-digit TOTP
3. **MFA setup wizard** — QR → verify → backup codes
4. **Organization selector** — multi-org picker

### Tier B — Projects (entry to everything)
5. **Projects list / Home** — list of programs (already partially built in `ui_kits/home/` and `ui_kits/mdx/`)
6. **Project Home dashboard** — readiness ring, tasks, milestones, RIM recs, change impact, governance, recent activity

### Tier C — The authoring workbench (the "real product")
7. **Regulatory Workspace** (3-pane: tree · canvas · intelligence) — generic editor shell
8. **Document Editor** — TipTap 3.x + Hocuspocus (real-time CRDT) + AI Autocomplete + Citations + ReviewMode + ComplianceScannerPanel. Slash commands (13). Section lifecycle: Draft → Review → Verify → Publish. Freeze + e-sign.
9. **510(k) Workbench** (`CERV2Page`) — eSTAR section tree · content editor · predicate/intelligence panel. Per-section completion %, AI draft status.
10. **PMA Workspace** — 10-phase workflow, module tabs.
11. **CER Generator** (EU MDR) — Annex XIV structure, FAERS, literature, GSPR checklist, export.

### Tier D — Evidence & knowledge
12. **Vault DMS** — drag-drop upload, chunking/embedding progress, semantic search, version history, evidence linking.
13. **Artifacts Center** — cross-project artifact library, version chain, provenance, signature status.
14. **Evidence Search (RAG)** — query → 3-layer memory → gateway → Claude → citations back to chunks.

### Tier E — Review & approval (21 CFR Part 11)
15. **Review Queue** — `my-queue` + project queue. Threads with status (open/resolved/outdated). Comment · resolve · reassign.
16. **Freeze & e-sign modal** — password re-entry, audit-log insert.
17. **Audit Trail** (admin) — log entries, filters, signed PDF export.

### Tier F — Submission
18. **Submission Center** — package preview, eSTAR validation pass, FDA ESG send OR eSTAR PDF export (user picks). Status tracking after send.

### Tier G — Specialist tools (deeper modules)
19. **Biostatistics** — SAP authoring, power analysis, TLF shells, adaptive trial plans, IDMC.
20. **Report Engine** — immutable report records, cryptographic seal, provenance atoms.
21. **Safety Narrative** — SAE narrative generation.
22. **Precedent Intelligence** — past approvals search, decision rationale.
23. **Device Diagnostics Workbench** — classification, performance testing, risk analysis.
24. **Pharmacovigilance / Regulatory Correspondence / Regulatory Digital Twin** — placeholder surfaces (routes exist, UI later).

### Tier H — Collaboration, admin, billing
25. **Collaboration / Tasks** — channels, messages, activity feed, presence, reactions, mentions, assignments, task board, due dates, e-sig workflow.
26. **Admin Settings** (`setup`) — org profile, users/roles, MFA policy, SSO, module subscriptions, feature flags, API keys.
27. **AnA Memory** — browse/search AI memory (knowledge atoms), pin/unpin, confidence scores.
28. **Billing Dashboard** — usage, invoices, budgets, alerts.
29. **Client Portal** — external persona (CRO's client viewing work).

---

## 3 · Concrete data shapes (what each surface binds to)

### projects
`id, orgId, name, type, status, regulatoryPathway, deviceClassification, metadata, createdAt`

### unifiedDocuments
`id, projectId, type, status (draft/review/verify/publish), title, content, version, frozenAt, signedAt`

Audit: `documentAuditLogs`, `electronicSignatures`, `documentLocks`, `workflowDocumentVersions`.

### fda510kSubmissions
`orgId, deviceId, submissionNumber, status, submissionType, estarVersion`
Joined to `fda510kDocuments`, `fda510kStageProgress`, `fda510kSubmissionPackages`, `fda510kDataMappings`, `cerv2510kSections` (eSTAR sections), `cerv2SectionVersions`.

### pmaSubmissions
`orgId, deviceId, supplementType, clinicalDataIncluded, status`

### cerProjects
`deviceId, mdRegulation, gspr, clinicalEvalPlan, reportDate` + 14 related cer* tables (evidence, literature, FAERS, sections, versions, compliance, workflows, exports, device profiles, essential requirements).

### ragDocuments / ragChunks
`id, projectId, filename, status, chunks, embeddedAt` — S3-backed, 384-dim local embeddings, pgvector similarity search.

### projectMemoryEntries
`projectId, category, content, confidence, importance, embedding` — AnA 3-layer memory context.

### immutableReportRecords / reportSealEvents / reportAtomProvenance
Cryptographically sealed artifacts for regulatory export.

### workflowTemplates / workflowApprovals / concept2cureReviewComments
Approval-chain configuration + per-document review state.

---

## 4 · The right-rail (AnA) contract

Already designed in `ui_kits/mdx/` as a **persistent 400px rail, 32px seam when collapsed**.

- **Modes** — `standard` (Sonnet 4.5), `deep-research` (Opus 4.5), `quick-ask` (Haiku 4.5). Resolves to model server-side via the gateway.
- **Context assembly** — `memory-context-assembler.ts` pulls 3 layers: working (thread), project (`projectMemoryEntries` semantic search), client/account.
- **Streaming** — SSE via `/api/ana-ri/stream`.
- **Routes** — `POST /api/ana-ri/chat`, `/stream`, `/plan`, `/generate`, `/execute`, `/kernel/*`.
- **Observability** — every call logged to `aiAuditLog`.

UI state that needs to exist in EVERY surface above:
- Context card ("You're looking at device K-250-CGM, section 12 · Performance Testing")
- Suggested prompts (context-aware)
- Thread history
- Inline "Ask AnA about this" chips on any row/section/citation

---

## 5 · Non-negotiable global rules (from CLAUDE.md and the brief)

- **21 CFR Part 11** — every document action audit-logged, e-sign requires password re-entry, frozen documents immutable.
- **WCAG 2.1 AA** — focus management, ARIA live for AI streaming, screen-reader labels for all streaming output.
- **Role gating** — viewer / member / manager / admin / super_admin. Section-level permissions (`AUTH_ENFORCE_SECTION_PERMS`). Can only assign roles ≤ own.
- **Feature flags** — per-tenant `featureToggles`. Locked modules show an upgrade CTA, not a dead button.
- **JWT on every authoring route** — refresh sliding 7 days.

---

## 6 · Phase 3 → N design plan

### Phase 3 (this sprint) — Program detail shell + 510(k) document editor
Build the workbench surfaces in `ui_kits/mdx/` as additional `layoutMode` targets:

1. **Project Home dashboard** — readiness, tasks, milestones, RIM, activity
2. **510(k) Workbench** — eSTAR section tree (left) · TipTap editor stub (center) · AnA rail (right), with the **existing Precedent/SE workbench** slotting in as the "Section 12 · Substantial Equivalence" content.
3. **Vault DMS** — upload drop zone, file list, version history, evidence link affordance
4. **Submission Center** — package preview, validation pass, ESG send vs. eSTAR export picker

### Phase 4 — PMA + CER parity
PMA workbench (10-phase workflow), CER generator (Annex XIV + FAERS + lit + GSPR).

### Phase 5 — Review & compliance
Review Queue, Freeze & e-sign modal, Audit Trail, Artifacts Center.

### Phase 6 — Collaboration & tasks
Task board (list + kanban), activity feed, mentions, presence.

### Phase 7 — Specialist tools
Biostatistics, Report Engine, Safety Narrative, Precedent Intelligence, Device Diagnostics.

### Phase 8 — Admin, billing, AnA memory, client portal
Admin setup, billing dashboard, AnA memory browser, external client portal.

### Phase 9 — Auth shell
Login / MFA setup / MFA challenge / org selector (intentionally last — least visual complexity, highest compliance risk; build with audit/e-sign patterns already validated).

---

## 7 · Left-rail re-structure

Redesign from the current demo rail to match the real 15-item hierarchy:

```
── Tier 1 · Global
   Projects                      (layoutMode: projects)          ✓ designed (home UI kit)
   Artifacts Center              (artifacts-center)              ☐ Phase 5
   Apps catalog                  (apps)                          ☐ Phase 8

── Tier 2 · Active project
   Project home                  (project-home)                  ☐ Phase 3
   Documents                     (documents / editor)            ☐ Phase 3
   510(k) workbench              (510k)                          ◐ in progress
   PMA workspace                 (pma)                           ◐ dashboard only
   CER generator                 (cer)                           ◐ dashboard only
   Vault                         (vault)                         ☐ Phase 3
   Submission Center             (submissions)                   ☐ Phase 3
   Review                        (review)                        ☐ Phase 5
   Tasks & collaboration         (tasks)                         ☐ Phase 6

── Tier 3 · Specialist
   Precedent Intelligence        (precedent-intelligence)        ◐ Phase 7
   Biostatistics                 (biostatistics)                 ☐ Phase 7
   Safety Narrative              (safety-narrative)              ☐ Phase 7
   Report Engine                 (report-engine)                 ☐ Phase 7
   Device Diagnostics            (device-diagnostics-workbench)  ☐ Phase 7

── Tier 4 · Admin
   AnA Memory                    (ana-memory)                    ☐ Phase 8
   Audit Trail                   (audit)                         ☐ Phase 5
   Billing                       (billing)                       ☐ Phase 8
   Admin / setup                 (setup)                         ☐ Phase 8
```

---

## 8 · This sprint's scope (Phase 3 — starting now)

1. Extend `ui_kits/mdx/` left rail to the 15-item hierarchy above.
2. Build `ui_kits/mdx/` Project Home dashboard surface.
3. Build `ui_kits/mdx/` 510(k) Workbench: eSTAR tree + editor + AnA rail. The **existing** Overview, 510(k) dashboard, Predicate/SE workbench become sub-surfaces slotted into the new workbench shell.
4. Build `ui_kits/mdx/` Vault DMS surface.
5. Build `ui_kits/mdx/` Submission Center (eSTAR + ESG).
6. Update `HANDOFF.md` with Phase 3 implementation contract per surface.
