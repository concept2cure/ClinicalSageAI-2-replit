# AnA Document Studio — Split-Pane Authoring Spec (Screenshot → UI → DB)

**Date:** 2026-06-20
**Author:** Platform engineering (codebase study)
**Source of truth:** the attached Claude split-pane legal-authoring screenshot, re-targeted to Concept2Cure's regulatory/clinical domain
**Scope decisions (locked by product):**
1. **Placement:** enhance the existing **AnA** chat surface *in place* (no new module).
2. **Document domain:** generate **regulatory/clinical** documents (510(k), IND, CER, CSR, Module 2 summaries) using the existing template + AnA document tools — *not* literal court filings.
3. **This deliverable builds NO UI.** It is the complete feature-to-DB inventory and the wiring plan. Implementation of the React surface is a separate, approved step.

> **The headline finding:** every feature your arrows point at in the screenshot already has a working backend in this repo, and most of the left-pane chat UI already exists. The split-pane is an **assembly + styling** job, not a greenfield clone. The single missing surface is the **right-hand document preview pane inside AnA** plus its **Download-as-DOCX** wiring.

---

## 1. The screenshot, decomposed

The image is a two-pane Claude session: an AI authoring chat on the left, a live rendered document (DOCX) on the right. Below, every visible feature and in-flight action is enumerated by region and mapped to where it already lives — or must be built — in this codebase.

### 1A. Left pane — the authoring chat

| # | Visible feature / action in screenshot | What it is | Where it lives today |
|---|---|---|---|
| L1 | Left icon rail (new chat `+`, chats, projects, code, palette) | Persistent navigation rail | `client/src/concept2cure/components/ana/Sidebar.tsx` |
| L2 | Breadcrumb: **"felony bribery case review / Email correspondence filing and Meckling objection"** with a chevron | Project → conversation hierarchy + conversation switcher | Project from `ProjectProvider`; conversation title from `concept2cure_conversations.title`; rendered in `ana/TopBar.tsx` (breadcrumb is a small gap — see §4) |
| L3 | User message bubble ("put it on the correct form and template…") | A persisted user turn | `ana/Message.tsx` (role `user`); persisted to `concept2cure_messages` |
| L4 | Sparkle summary line: **"Architected comprehensive document restructuring strategy…"** | Assistant headline / plan summary | `AnaChatMessage.text` + `detectedLens` chip in `ana/Message.tsx` |
| L5 | Step rows: **"Examine the body injection area"**, **"Examine caption cells content"** with `Script` tags | Tool-call transparency rows (a deterministic tool ran) | `tool_use` / `tool_result` SSE events → `AnaToolCall[]` in `useAnaChat.ts:618-668`; rendered as calm status rows in `Message.tsx` |
| L6 | File/step: **"Python script to inject content into the KC numbered-paper template…"** with an expandable code/text preview | A generated **artifact draft** with an inline preview | `artifact_draft` SSE event → `message.generatedDraft` in `useAnaChat.ts:669-682`; surfaced as an "Open in editor" chip in `Ana.tsx:443-458` |
| L7 | Composer: "Write a message…", attach `+`, paste/clipboard button | Message input + file upload | `ana/Composer.tsx`; uploads via `POST /api/chat/upload` |
| L8 | Model selector **"Opus 4.6 · Max"** | Model / effort picker | AI Gateway multi-model routing (`server/services/ai-gateway/gateway.ts`); **picker UI is a gap** — selection is server-side today (see §4) |
| L9 | Mic (voice input) and Stop (■) controls | Voice dictation; abort stream | Stop exists (`chat.stop()` → `AbortController`, `useAnaChat.ts:236`); **mic/voice is a gap** (see §4) |

### 1B. Right pane — the document preview

| # | Visible feature / action in screenshot | What it is | Where it lives today |
|---|---|---|---|
| R1 | Header: **"Smith objections final v3 · DOCX"** + Google-Drive glyph | Artifact title + format + source badge | Title/type from `concept2cure_artifacts.title` / `.type`; **the preview pane chrome inside AnA is the primary gap** (see §3) |
| R2 | **"Download as DOCX"** button | Export the rendered artifact to a Word file | `POST /api/docx-factory/*` (proxy to Shadow Service) **and/or** `POST /api/c2c/templates/:id/render` → `.docx`/`.pdf` |
| R3 | Version dropdown (v3) next to the title | Pick a prior artifact version | `concept2cure_artifact_versions` (`UNIQUE(artifact_id, version)`); **version picker UI is a gap** |
| R4 | Refresh / reload control | Re-render the artifact from latest content | Re-fetch artifact content; render via `claude-ectd-coauthor/ArtifactDoc.tsx` |
| R5 | Close (`X`) control | Collapse the preview pane | Pane open/close state (new local UI state — gap) |
| R6 | Rendered court document (caption block, parties, case no., title, "[Filed Under Protest]") | The **rendered template** with content injected | Renderer: `ArtifactDoc.tsx`; for the regulatory re-target, content comes from `concept2cure_artifacts.content`, formatted by the chosen template spec |
| R7 | **"Page 1 / 15"** pagination | Multi-page document navigation | Pagination over rendered pages (new UI affordance — gap) |

### 1C. The implicit workflow (what the user was doing)

The user prompt — *"put it on the correct form and template and make sure it won't be rejected by the court for any reason"* — drives a four-step agentic loop that maps **directly** onto AnA's existing orchestration:

1. **Plan** ("Architected … restructuring strategy") → AnA `orchestration` event (`detectedIntent`, `suggestedActions`).
2. **Inspect** ("Examine the body injection area / caption cells") → `tool_use`/`tool_result` rows.
3. **Generate** ("inject content into the … template") → `artifact_draft` event → `generatedDraft`.
4. **Render + export** (right pane, "Download as DOCX") → template render + DOCX factory.

For Concept2Cure this becomes: *"put my 510(k) Substantial Equivalence draft on our reviewer template and make sure it won't get an FDA RTA deficiency."* Same loop, regulatory tools (`check_regulatory_compliance`, `lookup_fda_guidance`, `generate_statistical_document`).

---

## 2. End-to-end data flow (UI → API → service → AI → DB → DOCX)

```
[Composer: user prompt + attachments]
        │  POST /api/chat/upload            → file text into project memory
        │  POST /api/ana-ri/stream  (SSE)
        ▼
[server/routes/ana-ri/stream.ts] ── orchestration ──► [server/routes/ana-ri/kernel.ts + plan.ts]
        │                                                     │
        │  SSE events back to client (useAnaChat.ts):         │ routes model + tools
        │   status · thread_id · orchestration · text ·       ▼
        │   thinking · tool_use · tool_result ·        [services/ai-gateway/gateway.ts]
        │   artifact_draft · grounding_strip ·          (Claude Opus / Sonnet, OpenAI fallback)
        │   post_done · warning · done                        │
        ▼                                                     │ tools: generate_statistical_document,
[Left pane renders live]                                      │        check_regulatory_compliance, …
        │                                                     ▼
        │  artifact_draft → message.generatedDraft     [services/ana/artifact-generator.ts]
        ▼                                                     │
[RIGHT PANE PREVIEW  ← the gap to build]              persist ▼
        │  render artifact content via                 concept2cure_artifacts (+ _versions)
        │  ArtifactDoc.tsx using template spec          concept2cure_messages · chat_tool_runs
        ▼                                               provenance_events · artifact_citations
[Download as DOCX]
        │  POST /api/c2c/templates/:id/render  (template-formatted .docx/.pdf)
        │   — or —  POST /api/docx-factory/*  (Shadow Service compiler)
        ▼
[Browser downloads Word/PDF]
```

Every box except **"RIGHT PANE PREVIEW"** already exists and is exercised by the current AnA chat. The audit trail (Part 11) is written today for messages, tool runs, artifacts, versions, and provenance.

---

## 3. The data model — "all the way to the DB"

All tables are multi-tenant (`organization_id`) with RLS keyed on `app.current_tenant_id`, and carry `created_by_id` / `created_at` for 21 CFR Part 11.

| Table | Migration | Role in this workflow | Key columns |
|---|---|---|---|
| `concept2cure_conversations` | `db/migrations/20260128_concept2cure_foundation.sql` | The thread behind the breadcrumb (L2) and Recents | `conversation_id`, `project_id`, `organization_id`, `title`, `summary`, `thread_id`, `message_count`, `metadata` |
| `concept2cure_messages` | `…foundation.sql` + `migrations/20260601_chat_message_metadata.sql` | Every user/assistant turn (L3, L4) | `message_id`, `conversation_id`, `role`, `content`, `content_hash`, `attachments` (JSONB), `artifact_id`, `citations` (JSONB), `token_count`, `model_used`, `latency_ms`, `metadata` |
| `concept2cure_artifacts` | `db/migrations/20260311_concept2cure_artifacts.sql` | The generated document (L6, R1, R6) | `artifact_id`, `project_id`, `conversation_id`, `type`, `category`, `title`, `content`, `content_hash`, `version`, `ctd_section`, `template_id`, `status` (`draft`/`locked`), `locked_at/by`, `metadata` |
| `concept2cure_artifact_versions` | `…20260311_concept2cure_artifacts.sql` | The version dropdown (R3, "v3") | `artifact_id`, `version`, `content`, `content_hash`, `change_description`, `UNIQUE(artifact_id, version)` |
| `chat_tool_runs` | `db/migrations/20260306_chat_tool_runs.sql` | The "Examine …" / `Script` step rows (L5) | `thread_id`, `project_id`, `tool_name`, `arguments` (JSONB), `result` (JSONB), `status`, `latency_ms` |
| `artifact_citations` | `db/migrations/20260508_artifact_citations.sql` | Sentence-level source traceability | citation spans per artifact |
| `concept2cure_provenance_events` | `db/migrations/20260311_concept2cure_provenance_events.sql` | Immutable "how this was made" trail | event ledger per artifact/message |
| *(templates)* | `server/routes/c2c/templates.ts` store | The "correct form/template" (L6, R2) | TemplateSpec: page, typography, colors, brand/logo, header/footer, named styles |

**No schema change is required** to deliver the split-pane preview. `concept2cure_artifacts.template_id` already binds an artifact to a template, and `_versions` already backs the version picker.

---

## 4. Gap analysis — exists vs. must-build (to enhance AnA *in place*)

Because placement is **AnA in place**, the work attaches to `client/src/concept2cure/components/ana/` and reuses `useAnaChat.ts` unchanged for the chat half.

### Already working (reuse as-is)
- ✅ Streaming chat, status phases, thinking, tool-call rows, artifact drafts — `useAnaChat.ts` (the full SSE contract in §2 is implemented).
- ✅ `message.generatedDraft` carries `{ title, content, documentType }` per turn — the exact payload the right pane needs.
- ✅ Artifact persistence, versioning, provenance, citations — all tables live.
- ✅ DOCX/PDF export — `POST /api/c2c/templates/:id/render` and `POST /api/docx-factory/*`.
- ✅ Document renderer — `claude-ectd-coauthor/ArtifactDoc.tsx`.
- ✅ Resizable split — `react-resizable-panels` already in `package.json`.
- ✅ Regulatory document tools — `generate_statistical_document`, `check_regulatory_compliance`, `lookup_fda_guidance`, `lookup_ich_guideline`, etc. (see `TOOL_LABELS`, `useAnaChat.ts:59-74`).

### Must build (the actual remaining work — NOT in this deliverable)
| Gap | Maps to | Effort | Notes |
|---|---|---|---|
| **G1. Right-pane artifact preview inside AnA** | R1, R4, R5, R6, R7 | Medium | Wrap `Ana.tsx` `<main>` in `ResizablePanelGroup`; right panel renders the active `generatedDraft` via `ArtifactDoc.tsx`. Today `generatedDraft` exits via `onDraftInsert` to a host editor — change to *also* open the in-pane preview. |
| **G2. Pane open/close + active-artifact state** | R5 | Small | Local state in `Ana.tsx`: which artifact is open; close collapses the right panel. |
| **G3. "Download as DOCX" button in pane header** | R2 | Small | Calls `POST /api/c2c/templates/:templateId/render` with artifact content; streams file to browser (pattern already in `Ana.tsx:329` `handleExport`). |
| **G4. Version dropdown** | R3 | Small | `GET` artifact versions; switch `content` rendered in the pane. |
| **G5. Page pagination** | R7 | Small | Paginate rendered content; "Page n / N". Cosmetic. |
| **G6. Breadcrumb (project / conversation) in TopBar** | L2 | Small | `ana/TopBar.tsx` already renders the bar; add project + conversation-title crumb with switcher. |
| **G7. Model/effort picker in composer** | L8 | Small | Surface AI Gateway's model list as a selector; pass through `useAnaChat` body (new optional field). |
| **G8. Voice dictation (mic)** | L9 | Small–Med | Web Speech API → composer text. Optional; not core to the document workflow. |

**Critical-path for "looks almost identical":** G1 + G3 + G6. The rest are polish.

---

## 5. Re-targeting the domain (legal → regulatory/clinical)

The screenshot's legal specifics translate 1:1 onto existing Concept2Cure surfaces:

| Screenshot (legal) | Concept2Cure equivalent | Backed by |
|---|---|---|
| "KC numbered-paper template" | A reviewer/agency DOCX template (e.g., FDA cover, CER house style) | `server/routes/c2c/templates.ts` (extract from an uploaded form, render matching `.docx`/`.pdf`) |
| "Defendant's Objections …" court filing | 510(k) Substantial Equivalence, IND cover letter, CER, CSR, M2 summary | AnA tools `generate_statistical_document`, `get_csr_template`, `draft_clinical_summary_m2_7`, etc. |
| "won't be rejected by the court" | "won't trigger an FDA RTA / CE deficiency" | `check_regulatory_compliance`, `lookup_fda_guidance`, `check_dossier_consistency` |
| "Filed Under Protest" caption block | Template header/footer + named styles | TemplateSpec (header/footer, brand/logo, named styles) |

No new document engine is needed — only template **content/spec** for the regulatory house styles, which the template service already extracts from an uploaded sample.

---

## 6. Recommended build sequence (when UI work is greenlit)

1. **G1 + G2** — split-pane shell in `Ana.tsx` + in-pane preview of `generatedDraft` (lights up R1/R4/R5/R6 using existing renderer).
2. **G3** — Download-as-DOCX header button (reuses the template render route).
3. **G6** — project/conversation breadcrumb in `TopBar.tsx`.
4. **G4, G5, G7** — version picker, pagination, model selector (polish to match the screenshot chrome).
5. **G8** — voice (optional).

Gate the surface behind a feature flag (e.g., `ENABLE_ANA_DOCUMENT_STUDIO` in `client/src/flags/featureFlags.ts`) so it can ship dark and be enabled per-org. Honor the existing design gates from `HANDOFF_TO_DESIGN_document_authoring.md`: `regulatory-compliance-ux` (Part 11 confirmations, immutable history, e-sign manifestation) and `accessibility-enforcement` (WCAG 2.2 AA).

---

## 7. Bottom line

- **You already own ~85% of this.** The chat (left pane), the AI orchestration, the tools, the artifact/version/audit tables, the template engine, and the DOCX/PDF export are all production code in this repo.
- **The one genuinely new surface** is the right-hand document preview pane *inside AnA* and its export button (gaps G1–G3). Everything else is small polish to match the Claude chrome.
- **No DB migration is required** for the core experience.
- This spec is the "every feature, all the way to the DB" map you asked for; it intentionally builds **no UI**, per the locked scope.
