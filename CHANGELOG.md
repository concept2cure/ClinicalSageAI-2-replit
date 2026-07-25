# Changelog

All notable changes to Concept2Cure.RI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- AnA: cost-tiered model routing — economy (Haiku) for routine turns, standard (Sonnet) for real work, flagship (Opus) only for high risk-tier or Thorough; per-deployment tier remaps via `ANA_TIER_*_MODEL`; opt-out via `ANA_MODEL_TIERING`.
- AnA: effort-scaled extended thinking (`reasoning.ts`) with a safe legacy `budget_tokens` clamp.
- AnA: OpenAI/Moonshot streaming + reasoning parity — the cheaper fallback providers now stream tokens incrementally and surface reasoning (`reasoning_content`/`reasoning`) as "Thought for Ns", matching the Anthropic path (shared stall watchdog + partial-response resilience), so cost-tiered routing to them no longer degrades the experience.
- AnA: deeper agentic loop — progress-earned round extension, per-round tool-result budgeting, and failure-adaptation guidance.
- AnA: four-agent drafting council exposed as `convene_drafting_council` (idempotent `lumen` provisioning migration).
- AnA: background deep investigations (`start_deep_investigation` / `check_deep_investigation`) that outlive the request, with heartbeat + honest stalled reporting.
- AnA: segment-agnostic client onboarding journey (`get_client_journey`) and proactive journey/agent-activity presence on greetings.
- AnA: live agent surface — `GET /api/ana-ri/agent-activity` plus a home-screen activity card that polls it, so a returning user sees the background deep investigations AnA is running (or just finished) without asking. Each run is clickable: a finished one opens its research memo, a live one reports where it stands (routed through `check_deep_investigation`).
- AnA: auditable per-step tool I/O disclosure and round-grouped tool steps in the transcript; "Thought for Ns" reasoning display.
- AnA: began decomposing the AnA tool mega-files — `agentic-workflow-tools.ts` (agentic workflow tools), `bla-biologics-tool-defs.ts` (BLA 351(a) biologics + CTD nonclinical/clinical definitions), `document-surface-tool-defs.ts` (document view/operations), and `discovery-cheminformatics-tool-defs.ts` (discovery-stage compound search), all extracted verbatim with tool wiring unchanged.
- Concept2Cure foundation migration (tables, indexes, RLS, immutability).
- Concept2Cure signatures migration and API endpoint.
- Concept2Cure route tests for projects, conversations, artifacts, and signatures.
- Roadmap-aligned schema entry points for organizations and client engagements.
- Roadmap-aligned schema entry points for projects, WBS, and assignments.
- Roadmap-aligned PM settings schema and default seed entry point.
- Roadmap-aligned risk factor, detection, and prediction schema entry points.
- Roadmap-aligned communication channels, messages, and FDA communications schema entry points.
- Roadmap-aligned audit log and electronic signatures schema entry points.
- Roadmap-aligned documents and document versions schema entry points.
- Roadmap-aligned RLS policies entry point.
- Roadmap-aligned knowledge base and response cache schema entry points.

### Changed
- Redis rate limiter now initializes and shuts down with server lifecycle.
- Concept2Cure queries now batch message/version lookups to reduce N+1 load.
- Concept2Cure debug logging redacts request bodies in DEBUG mode.
- Concept2Cure error logs include structured operation fields.
- Concept2Cure error metrics counter added for observability.
- Concept2Cure migration run now completes successfully (64 succeeded, 0 failed).
- Fixed Concept2Cure migration policy checks (pg_policies.policyname) to allow successful reruns.

### Changed
- Concept2Cure migration runner path now targets root db/migrations.
- Migration manifest updated to include Concept2Cure foundation migration.
- Unified Concept2Cure roadmap cleaned and schedule authority clarified.

### Added
- Tech debt prevention system with ESLint rules and pre-commit hooks
- Comprehensive architecture documentation
- GRDHE (Global Regulatory Data Harmonization Engine) module

### Changed
- Package renamed from `rest-express` to `concept2cure-riai`
- Added Node.js engine requirements (>=20.0.0)

### Fixed
- Various build and deployment issues

---

## [1.0.0] - 2026-01-24

### Added
- **CER Generator** - EU MDR/IVDR Clinical Evaluation Reports
- **510(k) eSTAR** - FDA 510(k) electronic submissions with predicate finder
- **eCTD CoAuthor** - Real-time collaborative document authoring
- **CMC Platform** - Chemistry, Manufacturing, Controls documentation
- **Stability Studies** - ICH-compliant stability management
- **Cognitive Ecosystem** - LangGraph-powered AI agents
- **GRDHE Module** - Multi-jurisdiction regulatory data export (FDA MedWatch, EMA E2B(R3))

### Security
- 21 CFR Part 11 compliance layer
- Audit trails and e-signatures
- Role-based access control (RBAC)
- Hash chain verification

### Infrastructure
- PostgreSQL/Neon database with Drizzle ORM
- React 18 frontend with TipTap editor
- Express.js backend with TypeScript
- OpenAI/Anthropic AI integration

---

## Version History

| Version | Date | Highlights |
|---------|------|------------|
| 1.0.0 | 2026-01-24 | Enterprise GA release |
| 0.9.0 | 2025-11-01 | Beta release |
| 0.5.0 | 2025-08-01 | Alpha release |

---

[Unreleased]: https://github.com/concept2cure/Concept2Cure.RI-2-replit/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/concept2cure/Concept2Cure.RI-2-replit/releases/tag/v1.0.0
