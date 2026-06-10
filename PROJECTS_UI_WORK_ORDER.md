# WORK ORDER — Projects module UI (concept2cure-v2)

> **For:** Claude Code (UI implementer).
> **Scope:** Build the canonical Projects UI and wire every upstream/downstream
> surface it touches. The backend is now GA-grade (see §1, §6); this is the UI
> layer over it.
> **Authority:** the ana-ui-design-constitution + repo `CLAUDE.md` (tokens,
> voice, motion, the five destinations) WIN over this work order. The design
> reference is `ui_kits/projects/` + the Projects spec Part B. Do not invent
> surfaces — if a surface isn't designed in `ui_kits/`, stop and ask.
> **Companions:** `docs/reports/projects-module-surfacing-report-2026-06-03.md`,
> `docs/reports/projects-module-ga-status-2026-06-03.md`.

---

## 1. What we have today (current state — read before building)

### 1.1 Backend — shipped on `concept2cure-v2`, GA-grade

Project surface (mounted under `/api/concept2cure/projects`, `server/routes/concept2cure.ts`):
- `GET /` list · `POST /` create · `PUT /:id` update/archive · `DELETE /:id`
- `POST /:id/export | /:id/duplicate | /:id/transfer`
- `GET|PATCH /:id/knowledge` — instructions/context/memoryEnabled, **and now
  `retrievalMode` (`in_context` | `retrieval`) + `knowledgeTokenEstimate`**
- `GET /:id/sharing | /:id/team` · `PUT|DELETE /:id/sharing/members/:userId`
- `GET /:id/activity` (project_activities + recent artifacts)
- `GET /:id/artifacts` (files) · `GET /:id/linked`
- `POST /:id/conversations` · `POST /:id/conversations/:cid/messages` (storage only — see §5)
- `POST /api/concept2cure/documents/upload` (governed artifact + auto-embed + **real PDF/DOCX text extraction**)
- `GET /api/concept2cure/notifications/my` · `POST .../mark-all-read`

Program surface (`/api/c2c/projects`, `server/routes/c2c/projects.ts`):
`GET /:id` + `/workstreams /drafts /team /evidence /activity`.

Governed actions (`/api/c2c/actions/*`, `server/routes/c2c/actions.ts`):
`claim · transition · resolve · sign · accept-ai-suggestion · lock` (+ reverses),
each writing `c2c_ana_actions` + `audit_logs` with a SHA-256 chain; `sign`/`lock`
require re-auth (password + optional TOTP).

What is real and project-scoped (surface it, don't rebuild it):
- Hybrid retrieval (`search_atoms_hybrid`: dense pgvector + tsvector) + reranker
  (`rag-reranker.ts`), scoped via `concept2cure_artifacts.project_id → lumen_data_atoms`.
- Citations on retrieved answers; retrieval audit in `ai_retrieval_runs` / `ai_retrieval_chunks`.
- Project memory (`project_memory_entries`) with summarize → nightly consolidate → retrieve.
- **Project instructions now steer chat** on both paths (main + submission-chat).
- **A2 two-mode capacity**: mode persisted + surfaced; in-context corpus
  injection dark-launched behind `PROJECT_INCONTEXT_INJECTION_ENABLED`.
- **`project_knowledge_search`** model tool (agentic chat can pull project knowledge).
- **A3 contextual-embeddings ingest** dark-launched behind `PROJECT_CONTEXTUAL_INGEST_ENABLED`.

### 1.2 Frontend — what exists in the codebase right now

| Surface | Path | Role | Status |
|---|---|---|---|
| **Projects module** | `client/src/concept2cure/components/concept2cure-projects/` | List ↔ detail, 6 tabs (Chats/Memory/Instructions/Files/Linked/Activity), 6 modals, `ProjectConfigPanel`, `data/*` hooks | Live; mounted in `Concept2CureHome.tsx:848` when rail item `projects` is active |
| Program home | `client/src/concept2cure/projects/ProjectDetail.tsx` (+ `components/Project{Header,Workstreams,Thread,Drafts,Aside}`) | `/api/c2c/projects/:id/*`-driven program view | Live via `ProjectDetailRoute` in `ZenApp.tsx:2018` |
| MDX project home | `client/src/concept2cure/mdx/projectHome/ProjectHome.tsx` | Per-program dashboard inside MDX | Live in MDX shell |
| Design reference | `ui_kits/projects/` | The hi-fi prototype for the canonical Projects surface | Reference |

### 1.3 The problem this work order solves

1. **Three parallel "project" surfaces** exist. The Replace-or-Delete law (spec
   Part D) requires converging to **one** canonical Projects view + one Project
   Landing, then deleting the superseded ones and updating
   `config/ui-surface-registry.json`.
2. **Backend capabilities are not surfaced**: retrieval-mode, provenance/citations,
   project memory, the knowledge-search tool activity, and the two file lifecycles
   have no UI yet.
3. **Projects is not the default route** — `/` and `/concept2cure` still resolve to
   legacy ZenApp; flipping the catch-all is gated on the Projects shell shipping
   (the open decision in `CLAUDE.md`).

---

## 2. Target — what to build (spec Part B + constitution)

Conversation-first context container, never a dashboard. One of the five
destinations (Zone B). Neutral shell, single restrained teal accent, sans shell
type, composer-first, no dashboard hero, no KPI farm.

- **2.1 Projects view (browse).** Rows: name, client, status, last activity, and
  a small **retrieval-mode indicator** (in-context vs retrieval). Search, filters,
  saved views, bulk bar, quick switcher (⌘K), notifications. The existing
  `ProjectsList` is close — re-skin to the constitution, add the mode indicator.
- **2.2 Project Landing.** Conversation-first: composer + AnA thread + recent
  artifacts/drafts + files-in-context + open tasks/reviews. Primary CTAs: ask AnA
  · resume chat · start new project chat. Reconcile the two detail
  implementations into one.
- **2.3 Right context drawer** (the main new surface). Tabs: **Context · Files ·
  Memory · Provenance · Activity · Review · Submission · Apps.**
  - **Files** — two lifecycles (A5): indexed project knowledge vs chat-attached;
    a "save to project knowledge" promote affordance (backend promote = §5 TODO).
  - **Memory** — `project_memory_entries`.
  - **Provenance** — the highest-value surface: render the cited source chunks
    from `ai_retrieval_runs` / `ai_retrieval_chunks` + the answer citations
    (`{document, section/span, score}`). This is the visible face of retrieval.
  - **Activity** — `GET /:id/activity` (+ Part 11 trail).
- **2.4 Retrieval visibility (spec B6).** A quiet in-context/retrieval indicator;
  an inline "searching project knowledge" activity in-thread when the
  `project_knowledge_search` tool runs; a "Sources" affordance that opens
  Provenance. Informational tone, never celebratory.
- **2.5 Governed-action UX.** Reason-for-change capture and the 21 CFR Part 11
  e-signature modal (reuse `ui_kits/esign/`), surfaced from the config panel
  danger zone and the sign/lock/transfer flows (backed by `/api/c2c/actions/*`).

---

## 3. Build tasks (ordered vertical slices — each shippable)

1. **Converge to one Projects shell.** Choose the canonical list↔detail
   (`components/concept2cure-projects` is the richest) and reconcile or absorb
   `projects/ProjectDetail.tsx`. Repoint `ZenApp` `ProjectDetailRoute`, update
   `config/ui-surface-registry.json`, delete the superseded surface, run
   `scripts/audit-ui-authority.ts`, write a `docs/reports/ui-convergence-proof`.
2. **Retrieval-mode indicator** in the list row and Project Landing — read
   `retrievalMode` + `knowledgeTokenEstimate` from `GET /:id/knowledge`.
3. **Right context drawer shell** + the tab set (2.3).
4. **Provenance tab** — bind to `ai_retrieval_runs`/`ai_retrieval_chunks` +
   answer citations. (May need a small read endpoint; confirm with backend.)
5. **Files tab two-lifecycle** + promote affordance (mark promote backend-pending).
6. **Memory tab** — `project_memory_entries`.
7. **Inline "searching project knowledge"** tool-activity + "Sources" → Provenance.
8. **Governed-action dialogs** — reason capture + e-sign (Part 11) over `/api/c2c/actions/*`.
9. **Token / voice / motion / a11y pass** (§7).
10. **Flip the default route** to the new shell — only after 1–9 land and the
    Projects shell replaces ZenApp's project navigation (the `CLAUDE.md` open
    decision). Delete the legacy catch-all path it supersedes.

---

## 4. Upstream UI needs (what feeds Projects)

- **Shell**: the five-destination rail, `TopBar`, command palette (⌘K) listing
  Projects; persistent collapse state.
- **Auth/session**: org + project scope on every call (`Authorization: Bearer` +
  `x-organization-id`); project-scoped RBAC already enforced server-side.
- **Composer** (shared): multiline, attach/paperclip, `@app`, slash commands —
  the same composer the global Chats destination uses, scoped to the project.
- **Deep-links IN**: `/concept2cure/?nav=projects` (list), `/projects/:id`
  (landing), and entries from the home rail, MDX, and PDEV.

## 5. Downstream UI needs (what Projects feeds) + backend follow-ups

Deep-links OUT (wire these affordances):
- Project → **Authoring** (`authoring` shell with doc type preset).
- Project → **PDEV** IND tiles (already wired via `onOpenPdev`).
- Project → **MDX** workstream, **Submission gateway**, **Intelligence** cluster.
- Project drafts → **Artifact workbench** (Phase 3/4 — in design; coordinate).
- Files → **Vault**; Activity → **Audit log viewer**; bell → **Notifications inbox**.

Backend follow-ups the UI depends on (track, don't block all UI on them):
- **Promote-to-knowledge** endpoint for the Files two-lifecycle (§2.3) — not built.
- **Conversations ↔ AI runtime** (#6): `/:id/conversations/:cid/messages` is
  storage-only; the AI runtime is `routes/chat/send-message`. Converge so posting
  a project message yields an AnA answer in-thread.
- **Citation `version`** (#8) — minor; artifact version not in the citation path yet.
- **Gateway unification** (#5) and **A2/A3 flag enablement** — validated in the
  preview/CI loop (see GA status report); no UI dependency, but the retrieval-mode
  indicator and Provenance get richer once enabled.

## 6. Backend contracts the UI binds to (reference)

- List/detail/CRUD: `/api/concept2cure/projects` (§1.1).
- Knowledge + **mode**: `GET /:id/knowledge` → `{ documents, customInstructions,
  context, memoryEnabled, retrievalMode, knowledgeTokenEstimate }`.
- Sharing/team, activity, artifacts, linked, conversations, upload, notifications (§1.1).
- Program data: `/api/c2c/projects/:id` + `/workstreams /drafts /team /evidence /activity`.
- Governed actions: `/api/c2c/actions/{claim,transition,resolve,sign,lock,...}` —
  use the shared `useC2cAction` hooks already in `_shared/hooks/useC2cAction.ts`.

## 7. Non-negotiables (constitution — every PR is checked against these)

- Sentence case everywhere; never Title Case; ALL CAPS only on 10px metadata labels.
- No emoji, no exclamation marks, no cheerleading. Second person ("you").
- Body 13–15px; max title per the ramp; numbers over adjectives.
- One restrained accent (teal) — one focal point per screen. Regulatory status
  colors are sacred (green=approved only, amber=pending, red=rejected, etc.).
- 200ms (150–220ms) ease-out motion; no bounce/spring/overshoot; respect
  `prefers-reduced-motion`.
- Lucide icons only, 1.5px stroke, `currentColor`. Sans shell type.
- WCAG 2.2 AA: focus order, keyboard nav, contrast, color-never-alone.
- No silent retrieval — retrieval is shown, cited, and (server-side) logged.

## 8. Acceptance criteria

- One Projects view + one Project Landing; the other project surfaces deleted and
  `ui-surface-registry.json` updated; convergence proof written.
- Retrieval-mode visible; Provenance tab populated from real retrieval rows;
  Memory and Activity tabs bound to real data; Files shows the two lifecycles.
- Governed actions run through `/api/c2c/actions/*` with reason capture + e-sign;
  audit visible.
- Conversation-first Project Landing (no dashboard hero); composer stable; ⌘K
  switch; deep-links in/out work.
- Tokens/voice/motion/a11y per §7; responsive at 1440/1280/1024/834/768/430/390.
- No console errors; no parallel project UI paths remain.

## 9. Open decisions (resolve with the designer/operator before §3.1 and §3.10)

- **Canonical surface:** `components/concept2cure-projects` (rich list↔detail) vs
  `projects/ProjectDetail` (program home). Recommend the former as the shell and
  fold the program-home panels (workstreams/drafts/evidence) into its detail.
- **Default-route flip timing:** gated on the Projects shell replacing ZenApp's
  project navigation (Phase 3 dependency in `CLAUDE.md`).
- **`cmc` rail ownership** (standalone module vs Intelligence tab) — open in `HANDOFF.md`.
