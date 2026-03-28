# Project Status Assessment — ClinicalSageAI (Concept2Cure.RI)
**Date**: 2026-03-28
**Branch**: `concept2cure-v2` (sole production + development branch)

---

## Executive Summary

ClinicalSageAI is an enterprise regulatory intelligence platform for life sciences (FDA, EMA, PMDA, Health Canada). The project is **post-GA** (v1.0.0 released 2026-01-24) and in an **active document-system convergence sprint** designed to unify fragmented document workflows into a single Anthropic-quality product experience.

Development velocity is extremely high: **500+ commits in the last 8 days** and **10 PRs merged on 2026-03-27 alone**, all Codex-driven.

---

## What's Currently Being Worked On

### Active Sprint: Document System Convergence
**Controlling spec**: `docs/plans/FINAL_DOCUMENT_SYSTEM_PROJECT_AND_BUILD_PLAN_2026-03-27.md`

The sprint's goal is to collapse competing document surfaces into one coherent flow:
- **AnA** (chat) as the single entry point
- **EditorPanel** as the canonical editing surface
- **Draft → Review → Verify → Publish** as the explicit lifecycle
- Match **Weave.bio** parity across 10 visible use cases, then surpass via biostat/precedent/device/multi-agency

**Sprint phases**:

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Freeze Truth — planning docs | ✅ Complete (4/4 docs delivered) |
| 1 | Real Tools Workbench | 📋 Planned |
| 2 | Canonical Creation-Path Completion | 📋 Planned |
| 3 | Editor Lifecycle Restructure (18 panels → 4 stages) | 📋 Planned |
| 4 | Data Room / Ask exposure | 📋 Planned |
| 5 | Dossier / Submission Completion Visibility | 📋 Planned |
| 6 | HAQ Workflow Exposure | 📋 Planned |
| 7 | Final Validation | 📋 Planned |

**Status**: Phase 0 planning is complete. Implementation has not yet started. The final validation doc (`DOCUMENT_SYSTEM_FINAL_VALIDATION_2026-03-27.md`) is pending.

---

## Recent Development Activity (Last 8 Days)

### Most Recent Commits (top of `concept2cure-v2`)
| Commit | Description |
|--------|-------------|
| `4335d2d` | Full canvas workflow — inline edit, save, download, full editor |
| `970e269` | Tier 2 Claude parity — code copy, thinking toggle, token usage |
| `c04e26b` | Top 3 Claude parity — Stop, Regenerate, Edit messages |
| `82508d5` | Claude parity audit — 20 improvements identified, 70% aligned |
| `f2618ba` | Claude-style conversation rendering for AnA |
| `cf4a615` | DocumentCanvasPanel polished to Anthropic quality standard |
| `05dba8a` | Claude-style document canvas + builder JSZip fix |
| `4a0faa0` | AnA Document Engine — 13 tools + Master Builder + proper ZIP |
| `fb8ed4e` | Wire 13 tools to AnA chat + Master Document Builder engine |
| `9ec0a75` | Submission-type-aware dossier tree + auto-navigate on project select |

### Recently Merged PRs (all 2026-03-27, all into `concept2cure-v2`)
| PR | Title |
|----|-------|
| #292 | Semgrep workflow + CodeQL Python extension + GA testing checklist |
| #291 | Proposal consequence durability + governed metadata in workspace |
| #290 | External Evidence Intelligence (Firecrawl) integration |
| #289 | Governed export: CERV2 ZIP, Reasoning Tier docs, CI readiness |
| #288 | OSS Stack control-tower docs, eval tooling, parser arbitration |
| #287 | AnA Document Product Quality Stack: intake, citations, linting |
| #286 | Document consequence ledger + governance hardening |
| #285 | Shell refocus on biotech hero lane + governed submission flow |
| #284 | Post-PR audit docs + repo risk/cleanup matrix |
| #283 | Merge conflict resolution + global header active state |

### Open PR
| PR | Title | Status |
|----|-------|--------|
| #293 | AnA Document Product Quality Stack (intake, citations, quality linting, review diffs) | Open, targeting `concept2cure-v2` |

---

## What's Already Built (Completed Systems)

### Core Platform
- **Auth**: JWT + bcrypt + MFA (TOTP), account lockout, session validation
- **Multi-tenant**: All DB access tenant-scoped
- **Real-time**: Socket.io live updates
- **Payments**: Stripe integration
- **Monitoring**: Sentry + Prometheus

### AI & Intelligence
- **AI Gateway**: Claude primary, OpenAI fallback — `server/services/ai-gateway/`
- **RIM (Regulatory Intelligence Model)**: 6 judgment models, 16 seed patterns, 4 interceptors, signal capture — `server/services/intelligence/`
- **CORTEX Prime**: Knowledge atoms, threads, agents — `server/services/cortex/`
- **Foresight**: Predictive analytics engine (75KB) — `server/services/foresight/`
- **Memory**: 3-layer architecture (working + project + client) — assembler, working memory, shared pool
- **Kernel/Control Plane**: Goal planner, decision records, adaptive policy

### Document & Regulatory
- **Document Authoring**: Wave 2 hardened, governed actions, escalation gating
- **EditorPanel**: 3,249-line canonical editor with AI autocomplete, citations, review mode, compliance scanner
- **Export Governance**: 5-record provenance chain
- **CSR Builder + Extractor**: Full clinical study report pipeline
- **eCTD/CTD**: Section tree, dossier management
- **510(k) Builder**: With predicate device finder
- **CER Generator**: EU MDR/IVDR compliance
- **CMC Platform**: Chemistry, manufacturing, controls

### AnA 1.0 RI
- 43 slash commands + 39 operational commands
- 6 intent lenses, 9 Claude tools (some dormant)
- 8 data connectors
- LangGraph agentic loop
- Extended thinking support
- Document export pipeline (DOCX, PDF, XML, eCTD-ZIP)

---

## Known Issues & Gaps

### GitHub Issues
| # | Title | Status |
|---|-------|--------|
| 101 | Branch Sync Conflicts (19 legacy branches) | Open — automated, 97 comments |

### Architectural Issues Identified in Planning
1. **4 competing "home" surfaces** — ProjectHomeDashboard, FullDocumentBuilder, ProjectWorkspaceShell, AnaPersistentPanel (convergence sprint addresses this)
2. **1 document creation path doesn't converge to EditorPanel** — SubmissionApps creates artifact without opening editor
3. **18 flat inspector panels** — need grouping into 4 lifecycle stages
4. **9 fake apps in AppsPage** — no real destinations, marked for removal
5. **AnA tools dormant in chat** — 16 tools built but not wired to chat flow

### Post-Sprint Planned Work
- **Master Python Builder** — server-side Python service for publication-quality document generation
- **AnA tool-awareness** — wire 16 dormant tools into chat
- **Multi-agency harmonization** — deeper FDA + EMA + PMDA + HC + TGA coverage

---

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind + Radix UI |
| Backend | Express + TypeScript (ESM) |
| Database | PostgreSQL (Neon/pgvector) via Drizzle ORM |
| AI | Anthropic Claude (primary) + OpenAI (fallback) + LangChain |
| Auth | JWT + bcrypt + MFA (TOTP) |
| Real-time | Socket.io |
| Queue | Bull + Redis |
| Storage | AWS S3 |
| Testing | Vitest + Jest + Playwright |
| CI/CD | GitHub Actions (CodeQL, Semgrep, integration tests) |

---

## Key Metrics

- **Total commits (last 8 days)**: ~500+
- **Open PRs**: 1
- **Open issues**: 1
- **Merged PRs (2026-03-27)**: 10
- **Test files**: 114
- **Route files**: 240+
- **Service files**: 200+ across 40+ subdirectories
- **Migrations**: 10+ SQL migration files
- **Documentation**: 60+ subdirectories in `docs/`

---

## Bottom Line

The project is a mature, post-GA regulatory intelligence platform with deep AI integration. The current focus is a **document system convergence sprint** to unify the UX into a single coherent flow (AnA → Tools → EditorPanel → lifecycle stages). Phase 0 planning is complete with 4 approved specification documents. Implementation phases 1–7 are queued and ready to execute. Development velocity is very high, driven primarily by Codex automation.
