# PROJECTS_HANDOFF.md — handoff to Claude Code

> **You are picking up the Projects module.** This file is your entry point.
> The backend is GA-grade; the UI is the main remaining work. Build it.

## 0. How to use this file

- **Branch:** work on `concept2cure-v2` only. Commit straight to it in small,
  surface-scoped commits. No feature branch, no PR. (Repo law — see `CLAUDE.md`.)
- **Before every push:** `npm run typecheck` clean, relevant tests green, and
  the pre-push gates pass (`ci:ectd-stubs`, `ci:risk-codes` — they need deps
  installed: run `npm install` first in a fresh container).
- **Read order:** this file → `PROJECTS_UI_WORK_ORDER.md` (full build spec) →
  `docs/reports/projects-module-surfacing-report-2026-06-03.md` +
  `docs/reports/projects-module-ga-status-2026-06-03.md` → `ui_kits/projects/`
  (design reference) → `CLAUDE.md` + the design constitution (tokens, voice, motion).
- **Do not invent surfaces.** If a surface isn't designed in `ui_kits/`, stop and ask.

## 1. Status snapshot (2026-06-03)

### Backend — DONE, on `concept2cure-v2` (GA-grade, tested, tsc clean)

Shipped this session (commits `54765d1 … 6e59330`):
- **Project instructions steer chat** on both paths (main `send-message` +
  `handleSubmissionChat`). Helper: `server/services/projects/project-instructions.ts`.
- **A2 two-mode capacity**: `projects.retrieval_mode` + `knowledge_token_estimate`
  (migration `20260603_project_retrieval_mode.sql`); estimate/select/persist/surface
  in `server/services/projects/retrieval-mode.ts`; surfaced on `GET /:id/knowledge`.
  In-context full-corpus injection is built, **dark-launched** behind
  `PROJECT_INCONTEXT_INJECTION_ENABLED` (default off).
- **`project_knowledge_search`** model tool (`AnaToolDefinitions.ts` +
  `AnaToolExecutor.ts`); `ToolContext` carries `organizationUuid`.
- **Real PDF/DOCX extraction** at upload (`server/services/projects/extract-text.ts`).
- **A3 contextual-embeddings ingest** built, **dark-launched** behind
  `PROJECT_CONTEXTUAL_INGEST_ENABLED` (default off):
  `server/services/projects/contextual-ingest.ts`.
- 44 unit tests across the four new services; full-repo `tsc --noEmit` clean.

Already real before this session (surface it, don't rebuild): project-scoped
hybrid retrieval (`search_atoms_hybrid`) + reranker, citations, retrieval audit
(`ai_retrieval_runs` / `ai_retrieval_chunks`), project memory
(`project_memory_entries`), governed actions (`/api/c2c/actions/*` →
`c2c_ana_actions` + SHA-256 `audit_logs`, e-sign re-auth).

### Backend — REMAINING (needs the live preview-DB + models; do NOT blind-push)

- **#5 Gateway unification** — route `advancedRAGPipeline` HyDE/rerank LLM calls
  through `server/services/ai-gateway/gateway.ts` (they use `AIProviderRouter`
  today). Validate provider parity live.
- **#6 Conversations ↔ AI runtime** — converge the storage-only
  `/projects/:id/conversations/:cid/messages` with the `send-message` runtime.
- **Flag enablement** — validate cost/quality of A2 in-context + A3 contextual
  ingest in the live env, then enable the two flags.
- **#8 Citation `version`** — minor; the citation path's artifact query selects
  no version column (fix the query/type first).

### UI — current state (the work you are picking up)

Three parallel "project" surfaces exist (converge to one — Replace-or-Delete):
1. `client/src/concept2cure/components/concept2cure-projects/` — the rich list ↔
   detail (6 tabs, 6 modals, `ProjectConfigPanel`, `data/*` hooks). Mounted in
   `Concept2CureHome.tsx:848`. **Recommended canonical shell.**
2. `client/src/concept2cure/projects/ProjectDetail.tsx` (+ `components/*`) — the
   program-home view via `ProjectDetailRoute` (`ZenApp.tsx:2018`). Fold its
   panels (workstreams/drafts/evidence) into the canonical detail.
3. `client/src/concept2cure/mdx/projectHome/ProjectHome.tsx` — MDX per-program home.

Projects is **not** the default route yet (`/` and `/concept2cure` still resolve
to ZenApp); the flip is gated on the new shell replacing ZenApp's project nav.

## 2. Your mission — two tracks

- **Track A (primary): build the canonical Projects UI.** Full spec in
  `PROJECTS_UI_WORK_ORDER.md`. Conversation-first, neutral shell, single teal
  accent — never a dashboard.
- **Track B (when you have the live preview DB + models): finish the backend** —
  the four REMAINING items above.

## 3. Task checklist (ordered — condensed from the work order)

1. **Converge to one Projects shell.** Pick `components/concept2cure-projects` as
   canonical; absorb the program-home panels; repoint `ZenApp` `ProjectDetailRoute`;
   update `config/ui-surface-registry.json`; delete the superseded surface; run
   `scripts/audit-ui-authority.ts`; write a `docs/reports/ui-convergence-proof`.
2. **Retrieval-mode indicator** (list row + landing) from `GET /:id/knowledge`
   → `retrievalMode` + `knowledgeTokenEstimate`.
3. **Right context drawer** with tabs: Context · Files · Memory · Provenance ·
   Activity · Review · Submission · Apps.
4. **Provenance tab** — cited source chunks from `ai_retrieval_runs` /
   `ai_retrieval_chunks` + answer citations. (Confirm or add a read endpoint.)
5. **Files tab** — two lifecycles (indexed knowledge vs chat attachment) +
   "save to project knowledge" promote (promote endpoint is a backend TODO).
6. **Memory tab** — `project_memory_entries`.
7. **Inline "searching project knowledge"** tool-activity + "Sources" → Provenance.
8. **Governed-action dialogs** — reason capture + Part 11 e-sign (`ui_kits/esign/`)
   over `/api/c2c/actions/*` (use `_shared/hooks/useC2cAction.ts`).
9. **Tokens / voice / motion / a11y pass** (§5).
10. **Flip the default route** to the new shell (after 1–9; delete the legacy path).

## 4. Backend contracts to bind to

- `/api/concept2cure/projects` — list/CRUD; `/:id/{export,duplicate,transfer}`.
- `GET|PATCH /:id/knowledge` → `{ documents, customInstructions, context,
  memoryEnabled, retrievalMode, knowledgeTokenEstimate }`.
- `/:id/{sharing,team,activity,artifacts,linked,conversations}`;
  `POST /documents/upload`; `/notifications/{my,mark-all-read}`.
- `/api/c2c/projects/:id` + `/{workstreams,drafts,team,evidence,activity}`.
- `/api/c2c/actions/{claim,transition,resolve,sign,lock,...}` (+ reverses).

## 5. Non-negotiables (constitution)

Sentence case; no emoji / exclamation / cheerleading; second person. Body 13–15px.
One teal accent (one focal point per screen); regulatory status colors sacred.
200ms ease-out, no bounce, respect `prefers-reduced-motion`. Lucide only, sans
shell type. WCAG 2.2 AA. No silent retrieval (show, cite, log). No dashboard hero,
no KPI farm, no second nav inside a project. No parallel project UI paths left behind.

## 6. Definition of done

One Projects view + one Project Landing; superseded surfaces deleted and
`ui-surface-registry.json` updated with a convergence proof. Retrieval-mode
visible; Provenance/Memory/Activity tabs bound to real data; Files shows two
lifecycles; governed actions run through `/api/c2c/actions/*` with reason + e-sign.
Conversation-first landing; ⌘K switch; deep-links in/out work. Tokens/voice/motion/
a11y per §5; responsive at 1440/1280/1024/834/768/430/390. No console errors.
Committed + pushed to `concept2cure-v2`.

## 7. Open decisions — resolve with the designer before task 1 and task 10

- **Canonical surface**: `components/concept2cure-projects` (recommended) vs `projects/`.
- **Default-route-flip timing** (Phase 3 dependency in `CLAUDE.md`).
- **`cmc` rail ownership** (standalone module vs Intelligence tab — open in `HANDOFF.md`).

## 8. Environment caveat

Commits this session show GitHub "Unverified": the provisioned SSH signing key
(`/home/claude/.ssh/commit_signing_key.pub`) is an empty 0-byte file with no
private key, and the agent runs as `root`, so git cannot sign. Committer identity
is correct (`Claude <noreply@anthropic.com>`). Have the signing key populated in
the environment if Verified commits are required; do not force-rewrite pushed
history to "fix" it.
