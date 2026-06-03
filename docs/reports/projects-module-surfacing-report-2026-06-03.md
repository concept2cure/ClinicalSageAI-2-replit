---
title: Projects Module — backend reality and Claude Design surfacing report
date: 2026-06-03
audience: Claude Design
branch: concept2cure-v2
basis: full code verification at 091ce63 + project-instructions fix 54765d1
status: backend partially complete — read before designing Part B surfaces
---

# Projects module — what Claude Design must surface now, and what is blocked

This report tells Claude Design exactly what the Projects backend provides today,
so you surface what exists and do not design against what is not built. It is
grounded in a full verification of the live `concept2cure-v2` server code (not the
`design-system/` mirror) against the Projects spec (Parts A/B), plus the one gap I
closed this session.

The headline: **the spec is roughly 60% implemented, under different names than
Part A4 uses.** Most of the retrieval/memory/audit/governance machinery is real and
project-scoped. Two things are genuinely absent — the **A2 two-mode capacity model**
and **A3 contextual-embeddings ingest** — and those gate a few Part B surfaces.

---

## 1. What I shipped this session (54765d1)

**Project instructions now reach the model.** Previously, a project's authored
instructions and knowledge context (persisted to `projects.settings.knowledge` via
`PATCH /api/concept2cure/projects/:id/knowledge`) were stored but **never injected
into any chat** — editing project instructions changed nothing. The main chat path
(`server/routes/chat/send-message.ts`) now reads that blob tenant-scoped and prepends
a `PROJECT INSTRUCTIONS` block to the system context (spec A1.1).

**Design impact:** the Instructions tab's promise — "tailor Claude for this project" —
is now true on the primary chat path. You may present it as real. Caveat: the narrower
`handleSubmissionChat` path (artifact present + post-generation/explicit submission
mode) does not yet inject it — noted as a backend follow-up in §4.

---

## 2. Backend reality by spec area (verified, with the real names to design against)

| Spec | Status | The real contract Design should reference |
|---|---|---|
| **A1 · Instructions** | ✅ now wired | `projects.settings.knowledge.customInstructions` → chat system prompt |
| **A1 · Knowledge corpus** | ✅ project-scoped | `concept2cure_artifacts.project_id` → `lumen_data_atoms` (org+project filtered) |
| **A1 · Chat history + memory** | ✅ | `project_memory_entries` + working-memory pipeline (see A6) |
| **A2 · Two-mode capacity** | ❌ **absent** | no `retrieval_mode`, no threshold, no in-context full-corpus injection, no mode persisted or surfaced |
| **A3 · Hybrid retrieval** | ✅ | `search_atoms_hybrid()` — dense pgvector + sparse tsvector, fused 0.7/0.3 |
| **A3 · Rerank** | ✅ | `rag-reranker.ts` (LLM-judge default; cross-encoder env-gated) |
| **A3 · Citations** | ✅ (version weak) | `submission-chat-handler.ts` → `{artifactId, sectionCode, pageRef, passageSnippet, relationship, title, score}` |
| **A3 · Retrieval audit** | ✅ | `ai_retrieval_runs` + `ai_retrieval_chunks` (query, ranked chunks, scores, project_id, sha256) |
| **A3 · Contextual embeddings** | ❌ **absent** | embeddings are plain; no per-chunk LLM context; atoms embedded whole-doc (16k truncation); PDF/DOCX text extraction is a placeholder |
| **A3 · `project_knowledge_search` tool** | ❌ absent | retrieval is server-orchestrated, not a model-callable tool |
| **A4 · Spec table names** | ❌ different | data lives in `projects.settings.knowledge` (JSON), `lumen_data_atoms`, `ai_retrieval_runs/_chunks`, `project_memory_entries` |
| **A5 · Two lifecycles** | ⚠️ partial | upload → indexed knowledge is real; ephemeral chat attachment + "promote to knowledge" is missing (`file_id` is accepted but unused) |
| **A6 · Project memory** | ✅ | `project_memory_entries`; working-memory summary → nightly consolidation → retrieval into chat |
| **Governed actions** | ✅ strongest | `/api/c2c/actions/*` (12 commands) → `c2c_ana_actions` + `audit_logs` sha256 chain; re-auth (bcrypt + TOTP) for sign/lock/revoke |
| **Activity / audit** | ✅ | feed: `project_activities`; Part 11 trail: `audit_logs` / `regulatory_audit_logs` (actor, IP, sha256 integrity hash) |

---

## 3. Part B surfacing instructions — what to build now vs hold

Verdicts: **SURFACE NOW** (backend ready), **PARTIAL** (design it, flag backend-pending),
**BLOCKED** (do not ship — no backend to read).

| Part B surface | Verdict | Notes for Design |
|---|---|---|
| B1 · Projects in Zone B (one of five) | SURFACE NOW | IA/structure only, no backend dependency |
| B2 · Projects browse (rows, search, filter) | SURFACE NOW | real list/search/filter/CRUD endpoints exist |
| B2 · **retrieval-mode indicator on a row** | **BLOCKED** | A2 does not exist; there is no mode to read. Do not ship the indicator until the backend lands it |
| B3 · Project Landing (conversation-first) | SURFACE NOW | chat, recent artifacts, files, memory, activity, tasks are all backed |
| B4 · Project chat (composer, in-thread tool activity) | SURFACE NOW | `send-message` is the real runtime; instructions now steer it |
| B5 · Context tab | SURFACE NOW | the `CONTEXT SNAPSHOT` block is assembled server-side per turn |
| B5 · Files tab (two lifecycles) | PARTIAL | indexed project knowledge is real; design the "save to project knowledge" / ephemeral-attachment split but mark it backend-pending (A5 gap) |
| B5 · Artifacts tab | SURFACE NOW | `concept2cure_artifacts` + version history |
| B5 · Memory tab | SURFACE NOW | `project_memory_entries`, project-scoped, governed |
| B5 · **Provenance tab** (cited source chunks) | SURFACE NOW | **this is the visible face of A3** — read `ai_retrieval_runs` + `ai_retrieval_chunks` + the citation tuples. Show document + section/span + score. (Version field is weak — request it be added.) |
| B5 · Review / Submission tabs | SURFACE NOW | governed actions + e-signature + audit are the strongest area |
| B6 · "Sources" affordance → Provenance | SURFACE NOW | citations exist on retrieved answers |
| B6 · inline "Searching project knowledge" | PARTIAL | retrieval runs server-side, not as a streamed model tool-call — you can surface a "retrieval occurred" indicator from response metadata, but there is no per-search streaming event yet |
| B6 · **retrieval-mode visible (in-context vs retrieval)** | **BLOCKED** | depends on A2; nothing to surface |
| B7 · tokens (neutral shell, single teal accent, sans) | SURFACE NOW | design-system work, no backend dependency |
| B8 · responsive (all listed widths) | SURFACE NOW | design-system work, no backend dependency |

**Net for Claude Design:** you can build essentially all of Part B's Project Landing,
chat, and right-drawer tabs **now** — including the Provenance tab, which is the
highest-value surface and is fully backed. Hold only the two A2-dependent affordances
(the retrieval-mode indicator in B2 and the in-context/retrieval mode display in B6),
and treat the Files two-lifecycle split as design-ahead/backend-pending.

---

## 4. Backend gaps that gate full parity (require the preview-DB / model loop)

These are the genuine remaining backend gaps. They were **not** pushed this session
because they need a real Postgres + pgvector + embedding/rerank-model + deploy loop to
build and verify safely. This environment cannot run those, and the repo's own history
(`HANDOFF.md`) shows blind regulated-schema work here gets reverted on `preview_db_test`.
Pushing them unverified to the development product is the failure mode to avoid.

1. **A2 two-mode capacity model** — add `retrieval_mode` + `knowledge_token_estimate`
   to the project row (migration), a single threshold constant, an in-context
   full-corpus injection path with gateway prompt caching, and reversibility. Surfaced
   to the UI per B6.
2. **A3 contextual-embeddings ingest** — chunk documents, generate a per-chunk situating
   context via `gateway.ts`, prepend before embedding; store both the dense vector and a
   stored `tsvector` with provenance (ordinal/span). Replaces whole-doc atom embedding.
3. **Real PDF/DOCX text extraction** at ingest (today binary uploads carry a placeholder).
4. **`project_knowledge_search` model tool** — expose the existing project-scoped
   retrieval as a model-callable tool so B6's inline "searching" activity can stream.
5. **Gateway unification** — route `advancedRAGPipeline` HyDE/rerank LLM calls through
   `gateway.ts` (they currently use `AIProviderRouter` directly).
6. **Conversations ↔ AI runtime** — the `/projects/:id/conversations/:convId/messages`
   endpoint is storage-only; wire it to the `send-message` runtime (or converge the two).
7. **Instruction injection on the `handleSubmissionChat` path** (companion to 54765d1).
8. **Citation `version`** field; **soft-delete (`deleted_at`)** on project/knowledge tables.

Each is specified enough to implement in a session that has the live preview DB.

---

## 5. Honest status

Done and pushed to `concept2cure-v2` this session: the single safe, high-value,
typecheck-verified gap — project instructions now steer chat (54765d1). The remaining
backend (§4) is real engineering against the live DB/model loop, not a port, and was
deliberately not blind-pushed to protect the development product. This report is the
contract for the UI work that the already-built backend (§2, §3) supports today.
