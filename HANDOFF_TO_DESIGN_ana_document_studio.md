# Handoff to Design — AnA Document Studio (split-pane authoring)

> [!CAUTION]
> **RETRACTED AS EVIDENCE — 24 July 2026.**
> This brief is a historical record of what was believed on its authoring date. It is
> **not** evidence of what the code does and must not be cited as a reason to build,
> skip, or scope anything. At least one brief in this set was materially wrong about a
> live subsystem (`HANDOFF_TO_DESIGN_document_authoring.md` §2 — see
> `_sync/CLAUDE_DESIGN_MASTER_WORK_ORDER_2026-07-24.md` §0.1).
>
> Verify every claim below against the code at the head of `concept2cure-v2`, or treat
> it as an open question. Authoritative scope lives in
> `_sync/CLAUDE_DESIGN_MASTER_WORK_ORDER_2026-07-24.md`.

**Date:** 2026-06-20
**From:** Platform engineering (codebase study)
**To:** Claude design
**Companions:** `ANA_DOCUMENT_STUDIO_SPEC_2026-06-20.md` (feature→DB inventory), `HANDOFF_TO_DESIGN_document_authoring.md` (P1 authoring backends)
**Reference image:** the Claude split-pane legal-authoring screenshot (AI chat left, live DOCX preview right, "Download as DOCX")

---

## 0. How to read this document

This is a **hyper-detailed design brief**, not an implementation. Every region of the target surface is specified down to: layout math, component anatomy, the full state matrix, micro-interactions, the exact data each element binds to (so nothing is invented), the real design tokens to use, and the compliance/accessibility gates that must hold. Build against this with the standard flow: `design-brief` → `brief-to-tasks` → build → `design-review`, with `accessibility-enforcement`, `regulatory-compliance-ux`, `motion-discipline`, and `microcopy-tone` as gates throughout.

**Scope (locked):** enhance the **existing AnA surface in place** (`client/src/concept2cure/components/ana/`) — do **not** spin up a new module. Target **regulatory/clinical** documents (510(k), IND, CER, CSR, Module 2 summaries), not court filings. The legal screenshot is the *interaction reference*; the domain is ours.

**Design authority:** the bundle at `docs/design/concept2cure-design-system/project/ui_kits/ana_ri/` is the source of truth for the chat half. This brief adds the **right-hand document preview pane** and the chrome around it. **No new design tokens** — everything below maps to tokens already in `colors_and_type.css`.

---

## 1. Why this exists

AnA today is a single-column chat (`Ana.tsx` → `Sidebar` + `main`(`TopBar` + `ChatView`)). It already streams, shows tool-call rows, and produces document drafts (`message.generatedDraft`) — but a generated document currently leaves the surface via `onDraftInsert` to a separate editor. The reference screenshot shows the missing half: a **persistent right-hand pane** that renders the document the chat is producing, with its own chrome (title · format, version, download, pagination). This brief specifies that pane and how the existing left column adapts when it opens.

The one-line product promise: *"Ask AnA to draft a regulatory document, watch it build on the correct template in the right pane, verify every sentence against its source, and download a submission-ready Word file — without leaving the conversation."*

---

## 2. Layout architecture

### 2.1 The shell
Today `styles.module.css .shell` is a 2-column grid: `[sidebar] [main]`. The document pane is a **third column inside `main`**, not a third grid track — so the left rail stays fixed and only the conversation/preview split resizes.

```
┌────────┬───────────────────────────────────────────────────────────┐
│        │  TopBar  (breadcrumb · project / conversation · actions)   │
│  Left  ├──────────────────────────────┬────────────────────────────┤
│  rail  │                              │  Document pane (NEW)        │
│ (fixed │   Conversation column        ║  ┌──────────────────────┐  │
│  56–   │   (ChatView)                 ║  │ pane header          │  │
│  260px)│                              ║  │ title · DOCX · ⋯ · X │  │
│        │   ▸ messages                 ║  ├──────────────────────┤  │
│        │   ▸ tool-call rows           ║  │ rendered document    │  │
│        │   ▸ artifact draft chip      ║  │ (paginated)          │  │
│        │                              ║  ├──────────────────────┤  │
│        │   ┌── composer ──────────┐   ║  │ Page 1 / 15  ‹ ›     │  │
│        │   │ Write a message…     │   ║  └──────────────────────┘  │
│        │   └──────────────────────┘   ║                            │
└────────┴──────────────────────────────┴────────────────────────────┘
                                        ▲
                                   resize handle (║)
```

- **Mechanism:** wrap the conversation + document pane in `react-resizable-panels` (`ResizablePanelGroup direction="horizontal"`) — already a dependency. The left rail (`Sidebar`) stays outside the group.
- **Default split when pane is open:** conversation **56%** / document **44%** (matches the reference's slightly chat-biased balance). Persist the user's drag to `localStorage` (key `ana.studio.split`).
- **Pane closed (default):** conversation is full width; the document column has width 0 and is unmounted. Opening animates the split in (see §6.1).
- **Min widths:** conversation min **420px**; document min **400px**. Below the combined min, the document pane goes **overlay** (see §2.2).

### 2.2 Responsive behavior
| Viewport | Behavior |
|---|---|
| ≥ 1280px | Side-by-side split as above. |
| 1024–1279px | Side-by-side allowed; default split shifts to 60/40; resize handle still active. |
| 768–1023px | Document pane becomes a **right-anchored overlay sheet** (max-width 560px, scrim behind), not a split. Chat stays full width underneath. |
| < 768px | Document pane is a **full-screen sheet** pushed over the chat; a back affordance returns to the conversation. Left rail collapses to icon-only (existing `data-collapsed`). |

The left rail's existing collapse behavior (`shell[data-collapsed="true"]`, 56px) is unchanged.

---

## 3. Region-by-region specification

Each region lists: **what it is · anatomy · states · tokens · data binding**. "Data binding" names the real prop/event/table so design knows the element is backed by something concrete (see `ANA_DOCUMENT_STUDIO_SPEC_2026-06-20.md` §1 for the full map).

### 3.1 Left rail — `Sidebar.tsx` (existing, minor add)
- **Anatomy:** logo + wordmark (`.sbLogo`), New chat (`.sbNew`), nav items (`.sbItem`: Home, Chats, Projects, Artifacts), Recents list (`.sbSection` + rows), account chip (`.sbAccount`) pinned to bottom (`.sbSpacer`).
- **Add:** an **Artifacts** count badge on the nav item when the active conversation has ≥1 generated document, so the user can find prior outputs. Badge uses `--bg-300` fill, `--text-300` text, 11px.
- **States:** expanded / collapsed (existing). Active item `aria-current="page"` (existing rule).
- **Tokens:** `--sidebar` (#f0eee6 via `--bg-100`), hover `--bg-200`, brand glyph `--accent-main-100` (#d97757).
- **Binding:** Recents from `useRecents` (`/api/chat/threads`); account from host `user` prop. No new endpoint.

### 3.2 TopBar — `TopBar.tsx` (existing, extend)
This is the screenshot's **breadcrumb** region (`felony bribery case review / Email correspondence filing…`).
- **Anatomy (left→right):** project name → `/` separator → conversation title → chevron (▾) opening a conversation switcher menu. Right side: existing **Export** action; add a **"Open document"** toggle (only when the active turn has a `generatedDraft` and the pane is closed).
- **Conversation switcher (chevron menu):** lists recent conversations in this project (reuse Recents data); selecting one calls `loadThread`. Rename inline (writes `concept2cure_conversations.title`).
- **States:** `home` view shows only the wordmark/greeting context (no breadcrumb); `chat` view shows the full crumb; long titles truncate with middle-ellipsis, full text in `title`/tooltip.
- **Tokens:** project name `--text-300`, separator `--text-400`, conversation title `--text-100` 14px/600, chevron `--text-300`.
- **Binding:** project from `ProjectProvider`; conversation title + id from `concept2cure_conversations`. The breadcrumb is the only genuinely new TopBar content.

### 3.3 Conversation column — `ChatView.tsx` (existing)
Scrolling thread + sticky composer; "jump to latest" pill when scrolled away (existing). No structural change — it simply narrows when the pane opens. Confirm line-length stays readable at the 420px min (target 60–75ch via existing max-width on the message column).

### 3.4 Message anatomy — `Message.tsx` (existing, the screenshot's L3–L6)
A single assistant turn can show, top to bottom:
1. **Reasoning** (collapsible) — `message.thinking`, shown for high-risk turns. Label "Reasoning", chevron, calm reveal. *(screenshot has no visible thinking block; keep collapsed by default.)*
2. **Status phase** (pre-first-token) — `message.statusPhase` ("Planning response…", "Loading project memory…"). Single muted line with a quiet 3-dot pulse (respect `prefers-reduced-motion`).
3. **Tool-call rows** — `message.toolCalls[]` (the screenshot's "Examine the body injection area / Script" rows). See §3.5.
4. **Answer text** — streamed `message.text`, markdown via `renderSafeMarkdown.ts`. The screenshot's sparkle "Architected comprehensive…" headline is the first line of the answer + an optional `detectedLens` chip ("Strategy"/"Risk"/"Audit").
5. **Artifact draft chip** — `message.generatedDraft` (the screenshot's "Python script to inject content into the … template" file block). See §3.6.
6. **Evidence chip** — `message.evidence` (shield-check + "N sources", or alert + "N weak"). Drill-down lists `flaggedClaims`.
7. **Footer chips** — latency, fallback-provider badge, stopped badge, copy/retry/feedback, `executedActions[]`, `suggestedActions[]` pills.
- **Tokens:** user bubble fill `--secondary` (#ebe5d9); assistant text `--text-100`; meta chips `--text-400` 11px; lens/evidence chips bordered with `--border`.
- **Binding:** every field is already on `AnaChatMessage` (`useAnaChat.ts:94-176`). Nothing new to fetch.

### 3.5 Tool-call rows (the "Script" steps, L5)
- **Anatomy:** a stack (`.toolCalls`) of rows (`.toolCall`), each: leading status icon, humanized label ("Computing sample size — biostatistics engine"), trailing state glyph.
- **States:** `running` (quiet spinner, `--text-400`), `success` (check, `--accent-100` #d97757), `error` (alert, `--destructive` + italic `.toolCallError` note).
- **Reference mapping:** the screenshot's gray `Script` tag = our tool-kind affordance. Use a small monospace kind-chip ("query", "compute", "search", "compliance") derived from the tool name, left of the label.
- **Binding:** `tool_use`/`tool_result` SSE events → `AnaToolCall[]`; audit rows persist to `chat_tool_runs`. **Do not invent tools** — labels come from `TOOL_LABELS` (`useAnaChat.ts:59-74`) or server-provided `label`.

### 3.6 Artifact draft chip (L6) — the bridge to the right pane
- **Anatomy:** a bordered card: doc icon, title (`generatedDraft.title`), a 3–5 line content preview (monospace if `documentType` is a script/XML, prose otherwise — the screenshot shows a scrollable code preview), and a primary action **"Open in document pane"**.
- **Today:** this renders as an "Open in editor" action chip (`Ana.tsx:449-457`) that fires `onDraftInsert`. **Change:** primary action now **opens the right pane** with this artifact; keep "Insert into governed editor" as a secondary action.
- **States:** preview collapsed (default, ~5 lines + fade) / expanded; "Open" is disabled while the turn is still streaming.
- **Tokens:** card border `--border`, preview bg `--bg-050`, title `--text-100`, "Open" primary button `--accent-main-100` fill / `--text-000`.
- **Binding:** `artifact_draft` SSE event → `message.generatedDraft` (`useAnaChat.ts:669-682`). On open, persist/fetch via `concept2cure_artifacts`.

### 3.7 Composer — `Composer.tsx` (existing, the screenshot's L7–L9)
- **Anatomy (left→right within the input):** attach (`+`), the textarea ("Write a message…"), a tool-pin button (`ToolPicker`), **model/effort selector**, mic, send/stop.
- **Model/effort selector (L8, "Opus 4.6 · Max"):** a compact menu showing model (Opus/Sonnet) and effort (Standard/Max). Selection passes through `useAnaChat` as a new optional body field (`model`, `effort`) consumed by the AI Gateway. Default reflects the gateway's task-routed choice; show that default, don't fabricate.
- **Mic (L9):** Web Speech API dictation → appends to the textarea; pulsing record state; `prefers-reduced-motion` disables the pulse. Optional/last priority.
- **Stop (■):** visible only while `isStreaming`; calls `chat.stop()`.
- **Attachments:** `+` uploads via `/api/chat/upload`; show as chips above the input with extraction method/word-count (`MessageAttachment`).
- **Tokens:** input bg `--popover` (#fff), border `--input`, focus ring `--ring` (#5088ea); icons `--text-300`; send/active `--accent-main-100`.
- **Binding:** send → `useAnaChat.send`; the only new wiring is the model/effort field.

### 3.8 Document pane header (R1–R5)
The screenshot's `Smith objections final v3 · DOCX  [Download as DOCX] ▾ ⟳ ✕`.
- **Anatomy (left→right):** source glyph (optional, e.g. Drive) · **title** (`artifact.title`) · format pill (**DOCX**/PDF) · flexible spacer · **version dropdown** (R3) · **refresh** (R4) · **overflow ⋯** (rename, duplicate, insert into editor, view provenance) · **close ✕** (R5). The **"Download as DOCX"** button (R2) is the primary action, right-aligned, brand-filled.
- **Version dropdown:** lists `concept2cure_artifact_versions` newest-first ("v3 · 2m ago · you"); selecting renders that version's content (read-only for non-latest, with an immutable-history note per `regulatory-compliance-ux`).
- **States:** draft (editable affordances) / locked (lock glyph, read-only, "Locked for signature" note) / non-latest-version (amber "Viewing v2 of 3" banner).
- **Tokens:** header bg `--bg-050`, bottom border `--border`, title `--text-100` 14px/600, format pill `--bg-200`/`--text-300`, Download button `--accent-main-100`/`--text-000`.
- **Binding:** title/type/status from `concept2cure_artifacts`; versions from `concept2cure_artifact_versions`; download → `POST /api/c2c/templates/:templateId/render` (template-formatted) or `POST /api/docx-factory/*`.

### 3.9 Rendered document (R6)
The screenshot's court document = our regulatory document rendered on its template.
- **Renderer:** reuse `claude-ectd-coauthor/ArtifactDoc.tsx`. Content from `concept2cure_artifacts.content`; visual formatting (fonts, margins, header/footer, named styles, logo) from the bound **TemplateSpec** (`concept2cure_artifacts.template_id` → template service).
- **Page presentation:** render as discrete **pages** on a `--bg-100` canvas, each page a white sheet (`--text-000`) with a soft shadow, centered, with realistic margins. This is what sells "this is the actual Word document."
- **States:** empty (no artifact open → pane shouldn't be open); loading (skeleton sheet, shimmer respecting reduced-motion); rendered; render-error (inline "Couldn't render this version" + retry); streaming-into (content fills as the draft streams — optional nicety).
- **Tokens:** canvas `--bg-100`, sheet `--text-000`, body ink `--text-100`, sheet shadow via existing elevation token; selection/citation marks use `--accent-main-000` highlight.
- **Sentence-level traceability (marquee):** per `HANDOFF_TO_DESIGN_document_authoring.md` §9, citation marks resolve to the exact source span (`artifact_citations`). Treat as the headline interaction, not a footnote: hovering a cited sentence reveals its source; clicking opens the evidence drawer.

### 3.10 Pagination (R7)
- **Anatomy:** centered footer bar "Page n / N" with ‹ › steppers; optional page-jump on click.
- **States:** single page (hide steppers); multi-page; keyboard ↑/↓/PageUp/PageDn navigate when the pane is focused.
- **Tokens:** footer bg `--bg-050`, text `--text-300`, active stepper `--text-100`.
- **Binding:** derived from rendered page count; cosmetic, no endpoint.

---

## 4. State matrix (surface-level)

| State | Conversation column | Document pane | Trigger |
|---|---|---|---|
| Empty / home | Greeting + suggestion pills (`EmptyState`) | Closed | New chat |
| Streaming, no draft yet | Status phase → tokens, tool rows | Closed | `send()` |
| Draft produced | Artifact chip appears in the turn | Still closed until opened | `artifact_draft` event |
| Pane open | Narrows to 56% | Renders artifact, header live | "Open in document pane" |
| Viewing old version | unchanged | Read-only + amber banner | Version dropdown |
| Locked artifact | unchanged | Read-only + lock note | `status='locked'` |
| Exporting | unchanged | Download button → spinner → file | Download click |
| Render error | unchanged | Inline error + retry | Render failure |
| Offline / degraded | Warning chip on the turn | Header shows "Reconnecting…" | `warning` event |

---

## 5. Microcopy (per `microcopy-tone` — calm, factual, sentence case, no emoji, no exclamations)
- Empty pane never shown (open only with content). 
- Streaming status: "Planning response", "Loading project memory", "Generating" (existing).
- Download success: silent (the file download is the feedback); failure: "Couldn't export. Try again." with retry.
- Locked: "Locked for signature. Viewing read-only."
- Old version: "Viewing v2 of 3. Switch to latest to edit."
- Evidence weak: "3 claims need a source." (links to the flagged claims).
- Never cheerlead ("Done!", "Success!"); never hedge ("maybe", "I think").

---

## 6. Motion & micro-interactions (per `motion-discipline` — 200ms ease-out default, no spring/bounce/overshoot, honor `prefers-reduced-motion`)
1. **Open pane:** conversation eases from 100%→56% and the pane fades+slides in from the right over **200ms ease-out**. Reduced-motion: instant split, no slide.
2. **Resize:** live, no transition while dragging; snap-to-default (56/44) when released within 4% of it.
3. **Close pane:** reverse of open; focus returns to the artifact chip that opened it.
4. **Version switch:** cross-fade the sheet content (150ms), banner slides in.
5. **Tool-call row resolve:** icon swaps running→check with a 120ms fade, no scale.
6. **Download:** button label → inline spinner; no layout shift.

---

## 7. Data binding summary (so design builds on real wiring)

| UI element | Event / prop | Persistence |
|---|---|---|
| Streamed answer, status, thinking | SSE `text` / `status` / `thinking` | `concept2cure_messages` |
| Tool rows (§3.5) | SSE `tool_use` / `tool_result` | `chat_tool_runs` |
| Artifact chip + pane content (§3.6, §3.9) | SSE `artifact_draft` → `generatedDraft` | `concept2cure_artifacts` |
| Version dropdown (§3.8) | fetch versions | `concept2cure_artifact_versions` |
| Citations / traceability (§3.9) | citation marks | `artifact_citations`, `concept2cure_provenance_events` |
| Download (§3.8) | `POST /api/c2c/templates/:id/render` · `POST /api/docx-factory/*` | Shadow Service compiler |
| Breadcrumb (§3.2) | `ProjectProvider` + thread | `concept2cure_conversations` |
| Model/effort (§3.7) | new `model`/`effort` body field | AI Gateway routing/audit |

**No DB migration is required** for the core experience.

---

## 8. Compliance & accessibility gates (must hold — these are requirements, not polish)

**`regulatory-compliance-ux` (21 CFR Part 11):**
- Immutable history visible: version dropdown + "viewing old version" banner; never silently overwrite.
- Governed actions (lock, sign, promote) use the confirmation pattern with reason-for-change capture.
- E-signature manifestation (§11.50): when an artifact is signed, the printed name, UTC date/time, and meaning of signature are visibly bound to the record (see `esignature.ts` + `governed-action-signoff.ts`).
- The pane header must surface `status` (draft/locked) truthfully; locked = read-only, no edit affordances.

**`accessibility-enforcement` (WCAG 2.2 AA):**
- The resize handle is keyboard-operable (focusable, ←/→ adjusts, ARIA `separator` with `aria-valuenow`).
- Pane open/close manages focus (move into pane on open; restore on close); the pane is a labelled region (`aria-label="Document preview"`).
- Pagination reachable by keyboard; current page announced (`aria-live="polite"` "Page n of N").
- Color is never the only signal: tool-call success/error, evidence verdicts, and locked state each pair color with an icon + text.
- Contrast: body ink `--text-100` on sheet `--text-000` and all chip combinations must pass AA; verify `--text-400` meta text against its background (use ≥ `--text-300` where AA fails at 11px).
- Focus visible everywhere using `--ring` (#5088ea); no focus traps in the overlay/sheet modes.

---

## 9. Definition of done (acceptance criteria)
1. With the pane closed, AnA looks and behaves exactly as today (no regression to the single-column chat).
2. Producing a document draft surfaces an artifact chip; "Open in document pane" opens the right pane with the rendered document on its bound template.
3. The pane header shows title · format, a working version dropdown, refresh, overflow, and close; **Download as DOCX** produces a template-formatted Word file.
4. Multi-page documents paginate; pagination is keyboard-accessible and announced.
5. Split is resizable, persists, and degrades to overlay/sheet at the breakpoints in §2.2.
6. All compliance + accessibility gates in §8 pass; `design-review`, `accessibility-enforcement`, and `regulatory-compliance-ux` are clean.
7. No new design tokens introduced; every style resolves to a token in `colors_and_type.css`.

---

## 10. Out of scope (tracked elsewhere)
- The single-editor TipTap authoring substrate, real-time co-authoring, track-changes, comments, approvals, e-sign flows — these are the P1 register in `HANDOFF_TO_DESIGN_document_authoring.md` and stand on their own. This brief only needs the **read/preview + download** half of the right pane; full in-pane editing can land later by mounting the existing editor in the same column.
- New regulatory template content/specs (house styles) — produced by the template service from an uploaded sample; not a design task.
- Voice dictation (§3.7 mic) is optional and lowest priority.

---

## 11. Suggested build sequence
1. **Split-pane shell + in-pane preview** (§2, §3.8–3.9) — the surface that makes it "look almost identical." Reuses `ArtifactDoc.tsx`.
2. **Artifact chip → open pane** rewire (§3.6).
3. **Download as DOCX** (§3.8) — reuses the template render route.
4. **Breadcrumb + conversation switcher** (§3.2).
5. **Version dropdown, pagination, model/effort selector** (§3.8, §3.10, §3.7).
6. **Sentence-level traceability** (§3.9) and **voice** (§3.7) last.
