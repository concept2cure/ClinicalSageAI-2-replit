# Changelog

All notable changes to Concept2Cure.RI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Authoring: **connected the eCTD CoAuthor surface to the canonical spine** — `authoring-canonical-bridge` commits an authoring document's assembled content into `concept2cure_artifacts` through the atomic revision spine when it is submitted for review, so the working store and the canonical governed record (version + Part 11 audit + review state + placement + readiness) move together. Conservative by design: it writes only with a real project scope and a numeric-user attribution, and otherwise skips (reported, never silent, never breaks submit) rather than inventing a project or mis-attributing the governed action.
- AnA: **canonical regulated-document spine** — `commit_document_revision`, the ONE atomic flow every AnA-authored document mutation runs through, over the canonical document identity (`concept2cure_artifacts`). A single transaction creates the new version, records the AI action, writes the 21 CFR Part 11 audit event, moves the document into review, and refreshes eCTD dossier placement; immediately after commit it records source provenance (append-only lineage) and recalculates program readiness, then notifies the UI. The core (`commitCanonicalRevision`) is dependency-injected and unit-tested for ordering + rollback with no database; `artifactVersionStore` now exposes `upsertDocumentArtifactVersionTx` so the version write joins the caller's transaction.
- Authoring backend: **created the 22 authoring-subsystem tables the API queried but no migration created** (documents, sections, comments, reviews, audit events + trail, AI suggestions, compliance scores, suggestion feedback, change requests, checklists (+ items), permissions, signatures, workflow steps, exports, frozen snapshots, template sections, signing PINs) — closing the schema-contract gap that left enterprise authoring endpoints failing with missing-relation errors. Columns/types match the exact SQL the router runs, verified by a new `authoring-schema-contract` test that plans the router's SQL against the migration schema and guards against any table being referenced-but-uncreated.
- AnA: biotech program orchestrator (`get_biotech_program_status`) — a modality-aware development spine (discovery → IND-enabling → Phase 1/2/3 → BLA/NDA → post-approval) that maps the client's journey plus a phase hint onto the regulatory arc and returns the objective, deliverables, gates, CTD focus, modality critical-path risk, next milestone and the exact AnA tools for the current phase.
- AnA: expanded the biotech wisdom pack from 8 to 26 lifecycle heuristics (TPP discipline, pathway-as-evidence-commitment, safety-database sizing, reference-standard infrastructure, process-validation lifecycle, clinical-hold recovery, IND safety-report clock, adaptive-design pre-specification, pre-IND/EOP2 framing, BLA refuse-to-file checklist, dataset reproducibility, advisory-committee prep, review-clock management, REMS design, post-approval change classification, PBRER), and taught the persona the biotech program arc.
- AnA: cost-tiered model routing — economy (Haiku) for routine turns, standard (Sonnet) for real work, flagship (Opus) only for high risk-tier or Thorough; per-deployment tier remaps via `ANA_TIER_*_MODEL`; opt-out via `ANA_MODEL_TIERING`.
- AnA: effort-scaled extended thinking (`reasoning.ts`) with a safe legacy `budget_tokens` clamp.
- AnA: OpenAI/Moonshot streaming + reasoning parity — the cheaper fallback providers now stream tokens incrementally and surface reasoning (`reasoning_content`/`reasoning`) as "Thought for Ns", matching the Anthropic path (shared stall watchdog + partial-response resilience), so cost-tiered routing to them no longer degrades the experience.
- AnA: deeper agentic loop — progress-earned round extension, per-round tool-result budgeting, and failure-adaptation guidance.
- AnA: four-agent drafting council exposed as `convene_drafting_council` (idempotent `lumen` provisioning migration).
- AnA: background deep investigations (`start_deep_investigation` / `check_deep_investigation`) that outlive the request, with heartbeat + honest stalled reporting.
- AnA: segment-agnostic client onboarding journey (`get_client_journey`) and proactive journey/agent-activity presence on greetings.
- AnA: live agent surface — `GET /api/ana-ri/agent-activity` plus a home-screen activity card that polls it, so a returning user sees the background deep investigations AnA is running (or just finished) without asking. Each run is clickable: a finished one opens its research memo, a live one reports where it stands (routed through `check_deep_investigation`).
- AnA: auditable per-step tool I/O disclosure and round-grouped tool steps in the transcript; "Thought for Ns" reasoning display.
- AnA: began decomposing the AnA tool mega-files — `agentic-workflow-tools.ts` (agentic workflow tools), `bla-biologics-tool-defs.ts` (BLA 351(a) biologics + CTD nonclinical/clinical definitions), `document-surface-tool-defs.ts` (document view/operations), `discovery-cheminformatics-tool-defs.ts` (discovery-stage compound search), `notifications-study-memory-tool-defs.ts` (notification, clinical-study and working-memory tools), `evidence-literature-tool-defs.ts` (evidence/literature search and citation), `submission-center-tool-defs.ts`, `legacy-import-tool-defs.ts`, `qms-labeling-analytics-tool-defs.ts`, `mutation-surface-tool-defs.ts`, and `document-intake-tool-defs.ts`, all extracted verbatim with tool wiring unchanged. `AnaToolDefinitions.ts` is down from ~9.6k to ~2.6k lines across eleven focused modules.
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

### Fixed
- Governed actions: **the `c2c_ana_actions` command CHECK rejected the verbs the platform actually uses.** `c2c_ana_actions` is the agentic-action ledger every governed mutation writes (paired with an `audit_logs` sha256-chain row in one transaction via `recordGovernedAction`). Its original CHECK enumerated only the six universal mutations + reverses (`claim/transition/resolve/sign/accept-ai-suggestion/lock` …), but the ledger is now written across the platform with domain verbs — `create`/`update`/`delete`/`assign`/`approve`/`review` (governed routes + AnA tool executor), `transmittal_rollback` (FDA-ESG), and `update`/`reaffirm` (the canonical document spine). Each of those raised `check_violation` (SQLSTATE 23514), rolling back the ENTIRE governed transaction — so those mutations failed AND wrote no audit row, and `commitCanonicalRevision` could never commit a revision. The defect was masked because the db-verify bootstrap schema creates the table WITHOUT the CHECK and unit tests mock the DB (mocks don't enforce CHECKs). Fix (`20260730_c2c_ana_actions_command_vocab.sql`): `command` is open-vocabulary descriptive audit metadata passed as a free string through generic `governed()` helpers, so an enumerated allow-list cannot stay complete — the narrow CHECK is dropped and replaced by a drift-proof length bound (non-empty, ≤64), while the genuine closed enums it depends on (`risk`/`state`/`agentic_mode`) are untouched. Proven end-to-end by a new PGlite integration test that applies the real migration and drives the real `recordGovernedAction` (both rows written atomically + mutually backlinked, chain verified, tamper caught, rollback leaves nothing, and every previously-rejected domain verb now lands). A second PGlite test drives the real `commitCanonicalRevision` — the whole seven-step spine — against real Postgres to prove the fix unblocks it: version + AI-action + audit + review + placement commit atomically, a forced failure in a later in-transaction step rolls back the version AND its audit row (no orphan), and the AI action lands with `command='update'` (which the pre-fix CHECK rejected).
- AnA: `answer_intelligence_question` advertised a `flow_id` parameter while the stateless engine resumes from the full `flow_state` object the handler actually reads — so every intelligence flow (onboarding, IND/BLA/CMC questionnaires) failed past the first question with "flow_state and node_id are required". The tool schema now declares `flow_state`, matching the handler; guarded by a regression test.

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
