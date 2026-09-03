# Changelog

All notable changes to Concept2Cure.RI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### AnA at work — live progress, work queue and tools, visible to the client

- **A docked work panel** (`AnaWorkPanel`) in the persistent AnA rail and in the full-page conversation surface shows, while a turn runs: a **numbered progress list** of the phases the turn has actually passed through (planning, loading project memory, generating, running N steps, round 2, reading results, composing, finalizing) with the phase in flight highlighted and a running **"Still working · 57s"** clock; the **work queue** — this run's tool steps by round, steers accepted but not yet spliced into a round, and the tenant's background deep investigations (running / stalled / recently finished, read from the existing `GET /api/ana-ri/agent-activity`); the **tools** she called with their server-measured durations and an inputs disclosure for audit; the conversation's **outputs** (drafts and whether they were saved, executed actions, sign-offs waiting, reports); and the **context** she is grounded on. The rail remembers per browser whether the dock is shown.
- Honesty rules carried over from the transcript's activity record: phases are derived from the stream's own `status` events and never templated, a stopped turn reads "Stopped after …" not "Finished", a failed queue read says so instead of showing an empty queue, and there is still no progress bar or percentage.
- `useAnaChat` now keeps the ordered phase record (`progress`), the turn's wall-clock end (`completedAt`), per-step start/end clocks, and `pendingSteers`; the stream's `tool_result` event carries the server-side `latencyMs` it already logged to tool telemetry.
- **The work record survives a reload.** Reopening a conversation rehydrates each turn's persisted tool trace (`chat_messages.metadata.toolTrace`) and recorded steers (`humanControls`) onto the transcript and the dock, so a reopened thread shows the steps AnA took rather than answers with no work behind them. Durations are not persisted and none are claimed.
- **The dock reaches the owned panes.** Document authoring and the eCTD co-author, which run their own AnA conversation without the shell rail, mount the same dock with an "At work" toggle; one per-browser show/hide choice is shared by every host. Accessibility pass: section titles are headings wrapping their disclosure buttons, collapsed bodies stay in the DOM so `aria-controls` always resolves, the inputs disclosure is a named region, the dock's close control returns focus to its toggle, and the live region speaks the same placeholder the list shows.
- **The transcript keeps time too.** The per-turn activity record shows a running clock beside the live phase ("Running 2 steps… · 57s") and names the duration on its collapsed line once the turn has a recorded end ("4 steps completed · in 1m 12s"); a stopped or reopened turn claims no duration.

### Collaboration & Tasking — GA

- **Task Board runs on real data.** Live project/assignee/current-user rosters (the project filter, "My tasks" and owner names previously bound to fixture slugs and returned nothing on live rows); a real Blocked column; explicit status transitions; optimistic moves with revert-and-explain; overdue computed from machine-readable due dates; workflow templates listable (`GET /api/tasks/templates`, org templates + built-in NDA/BLA / 510(k) / IND catalogs) and instantiable server-side with dependency linking. Board state (view/project/module/mine) is session-persisted and URL-shareable.
- **Every collaboration action persists.** The universal launcher's Quick task posts the real audited create carrying the captured surface context (`sourceEntityType/Id`, description); Collaborate delivers a persisted message to a colleague's notification inbox (`POST /api/tasks/messages`), optionally with a linked task. The in-memory session task store is retired.
- **Task Tray** in the shell top bar: live "what needs me" — open unified tasks assigned to the signed-in user with overdue/due-soon/blocked/approval counts (`GET /api/task-management/my-work`), the review queue, workflow approvals, and unread messages with mark-read.
- **Review threads UI**: the Review surface now renders the persisted review threads and change requests assigned to the reviewer (my-queue), with per-thread comments, reply / formal `request_changes` (server-side RBAC), and resolve-in-place — the first client consumer of the Phase-13 review-collaboration backend.
- **21 CFR Part 11 posture.** All task mutations (create / transition / link / assign / notify / archive) write the governed SHA-256-chained ledger on BOTH task routers; task status is a real state machine (free text previously accepted anything, including silent blocked→pending rewrites); completing an approval-gated task requires a PIN-verified electronic signature with stated §11.50(a)(3) meaning and reason, appended to `approvalHistory` (shared credential store + lockout policy with document sealing; the PIN never reaches logs or ledger payloads). Enforced identically on the legacy `/api/regulatory/tasks` path — the ceremony is not one URL away from optional.
- **Soft delete.** `unified_tasks` gains `deleted_at`/`deleted_by`; the delete verb archives with an audited reason and every read model filters live rows — no HTTP path hard-deletes a task record.
- **Durable, replica-safe section locks.** Collaborative-authoring edit locks move from a process-local Map to `collab_section_locks` (tenant-keyed, RLS-swept): atomic acquire, TTL expiry, and an explicit takeover that requires a reason, is written to the governed ledger, and notifies the displaced author (surfaced in the lock chip with time-to-expiry). Presence rosters now expire idle members and heartbeats pause in hidden tabs.
- **Notifications on task events**: assignment, blocked, completion and unblock-cascade notify through the shared notification service, and a scheduled due-date sweep notifies assignees once at due-soon (48h) and once at overdue (idempotent via task metadata markers; `TASK_DUE_SWEEP_DISABLED` to opt out).
- **One work model, converging**: the unified work view includes the canonical `unified_tasks` board (deduped against mirrors); AnA chat-created tasks mirror onto the board; new projects seed their registry blueprint milestones as board tasks instead of starting empty; dependency writes are cycle-guarded and the graph tables (`task_dependencies`, `cross_module_task_links`) gain a backfilled `organization_id` for the RLS regime.
- Full accessibility pass on the board and every modal (focusable cards, dialog semantics, Escape/focus restore, labelled controls, live announcements).

### Security
- **The DB-backed CI job now actually uses its database, and runs with `RLS_ENFORCE=on`.** `tests/setup.ts` installs a process-wide `vi.mock('pg')` for the default vitest project (~1,600 files) — correct for unit tests, and also in force in the "Integration Tests" job, which starts a real PostgreSQL service and applies migrations to it. Every `new Pool().query(...)` there resolved to `{ rows: [], rowCount: 0 }` without a packet leaving the process, so a broken tenant predicate read as "no rows", SQL naming a non-existent column never raised, and schema drift was undetectable — all while the job reported green. The mock is now **scoped**, not weakened: real-database tests are `*.dbtest.ts`, run under `vitest.db.config.ts` with `tests/setup.db.ts` (no mock; fails rather than skips when the database is unreachable, and throws if `pg` is mocked), and are excluded from every mocked config. First coverage: executed tenant isolation — the canonical `0021` policy filtering `SELECT`/`UPDATE`/`DELETE` for the non-superuser role minted by the real `provision-app-role.mjs`, `WITH CHECK` refusing a foreign-tenant `INSERT`, an unscoped connection seeing nothing rather than everything, and a superuser/owner connection *not* being filtered — the mechanism that leaves all 787 RLS policies inert today, pinned as an executable fact rather than prose. Enforced by `ci:db-test-isolation` (new) and by `ci:check-unrun-tests`, which previously could not see a `.dbtest.ts` file at all. No CI job had ever run a test with `RLS_ENFORCE=on`, the mode production hard-requires; one does now. See `docs/testing/REAL_DATABASE_TESTS.md`.
- **Firecrawl now fails closed on enablement and allowlist.** The `/api/firecrawl/scrape` route and the `/external-evidence/validate` preflight previously treated a null/undefined `firecrawl_enabled` column as ENABLED (`?? true` / `!== false`), and an enabled tenant with an empty domain allowlist could scrape any non-blocklisted public URL (an SSRF/exfiltration default-allow). A tenant is now active only on an explicit `firecrawl_enabled === true`, and an enabled tenant with no allowlist is blocked with a `allowlist_required` reason surfaced in an actionable 403. **Behavior change for deployers:** any tenant that relied on the implicit-enabled or empty-allowlist behavior must now set `firecrawl_enabled = true` and a non-empty `firecrawl_domain_allowlist_json`. The authorization is centralized in a pure, unit-tested `server/integrations/firecrawl/guards.ts`.
- **Gateway-bypass CI gate is now Python-aware.** `scripts/ci/check-gateway-bypass.mjs` previously matched only the JS idiom `new OpenAI(`/`new Anthropic(` and was blind to Python client instantiation (`openai.OpenAI()`, `Anthropic()`, async + cloud variants), even though `server/services/python` is in scope — so a Python agent framework or sidecar could open a second, unaudited LLM egress path undetected. The gate now scans `*.py` too. Green on the current tree (no Python LLM clients today).

### Added
- Memory: **genuine gateway-routed LLM memory-atom extraction** for client/project intelligence (`server/services/memory/llm-extraction.ts`). Document ingestion now extracts memory entries through the governed AI gateway (audited, tenant-scoped, PII/PHI-screened, `jsonMode`+`jsonSchema`, zod-validated), and falls back to the existing deterministic regex/heuristic extractor when LLM extraction is disabled (`MEMORY_LLM_EXTRACTION_ENABLED=false`), unavailable (e.g. air-gapped with no local model), or empty. Replaces the previously mislabeled "AI-powered" heuristic-only extractor. All four fallback branches are unit-tested.
- On-prem inference: **LocalAI Gate 0 Operational-Qualification smoke test** (`server/services/ai-gateway/providers/__tests__/local-provider-gate0.test.ts`, `npm run test:localai-gate0`) proving the local generation lane never activates by accident and that on-prem/ZDR residency routes only to the self-hosted substrate; plus a GxP/CSV pilot & validation plan (`LOCALAI_ONPREM_INFERENCE_PILOT_PLAN_2026-07-30.md`).
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
- Schema-contract remediation: **created 20 tables the server SQL queried but no migration ever created** — the scattered remainder of the same missing-relation class as the 22 authoring tables, surfaced by the repo-wide audit and triaged one subsystem at a time. GraphRAG/knowledge (`knowledge_graph_nodes`/`knowledge_graph_edges`/`citation_chains`/`knowledge_documents`), CMC/stability (`cmc_methods`, `qa_methods`, `dp_specs`, `qc_specs`, `proc_control_strategy`, `stab_signoffs`, `specification_audit_log`), submission center + regulatory intake (`submission_projects`, `submission_tasks`, `fda_510k_initial_data_forms`, `c2c_investigator_brochure`, `reg_question_events`, `reg_mail_ingest`), and licensing/IP (`licenses`, `patent_portfolio`, `predicate_intelligence_results`). Several were ACTIVE 500s (`cmc_methods`, `stab_signoffs`, `licenses`) or a Part 11 gap (`specification_audit_log` — a spec row could commit without its audit entry); the rest were silently no-oping behind try/catch. Every column contract is extracted from the exact referencing SQL (INSERT column lists + `ON CONFLICT` targets where present); tenant-scoped tables (`c2c_investigator_brochure`, `patent_portfolio`, `predicate_intelligence_results`, `stab_signoffs`) ship the canonical `tenant_isolation_policy`; the pgvector `embedding` column is added only where the extension is available. Proven by a PGlite integration test that applies all four migrations and runs the real statements (upserts, traversal joins, the `submission_tasks→submission_projects` FK, the `reg_mail_ingest.msg_id` unique dedup, RLS shadow-mode, the 20-column `licenses` insert). **Deliberately NOT created (10, kept in the audit baseline with a documented disposition):** collisions with existing tables (`correspondences`→`c2c_correspondence`, `trials`→`registry.trials`, `uploads`→`file_uploads`), a query bug (`tasks`→`unified_tasks`), incompatible-shape RBAC (`user_roles`), a thin best-effort write (`concept2cure_projects`), and four `analytical_*` tables backing an unreferenced/dead module — creating a guessed schema for any of these would be wrong. The audit itself was hardened (recursive-CTE detection for `WITH RECURSIVE`, plus `medline`/`trend_data` false positives) and its baseline ratcheted from 33 to 10.
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
