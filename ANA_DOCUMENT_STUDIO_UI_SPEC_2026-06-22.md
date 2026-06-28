# AnA Document Studio — UI Spec & Build (screenshot → surface → DB → user action)

**Date:** 2026-06-22
**Status:** Implemented behind `ENABLE_ANA_DOCUMENT_STUDIO` (ships dark; enable per-org)
**Scope:** How the AnA document-surgery capability set (the 12 moves from the Opus 4.8 screenshot, incl. `verify_docx_against_source`) is reflected in the UI — what each feature does, and exactly how a human reaches it.

---

## 1. Governing principle — chat-first, AnA in place

There is **no separate "document tool" screen.** Everything is accessed by talking to AnA in the composer (`client/src/concept2cure/components/ana/Composer.tsx`). The user states intent ("put my 510(k) SE draft on our reviewer template and make sure it won't trigger an RTA"); the 12 moves run as AnA's tool calls and surface as calm, auditable UI. The UI's job is to make AnA's **decisions, work, and verification** visible and trustworthy.

---

## 2. Feature inventory — capability → what it does → UI surface → how the user accesses it

| Move | Capability (tool) | What the user sees | How they trigger it |
|---|---|---|---|
| 1 | Inspect encoding/structure (`inspect_uploaded_document`, `extract_document_structure`) | Tool-call status row (`Message.tsx` `toolCalls`, "Examining document structure") | Attach a file via composer `+` |
| 2 | Read source (`read_uploaded_document`) | Tool row | Automatic after attach / paste |
| 3–4 | Text-vs-file decision, hold verbatim source | Intent-lens chip + reasoning | Orchestration (executor loop) |
| 5 | Materialize text → `.docx` (`author_docx_native`) | **Document Studio preview** opens (right pane) | Automatic when a draft is produced |
| 6–7 | Clone validated base + inject (`build_from_template`) | Preview shows the rendered doc | Conversational ("use our template") |
| 8 | Apply corrections (`surgical_docx_xml_edit` replace) | Tool row + updated preview | Conversational ("fix X") |
| 9 | Append paragraphs (`surgical_docx_xml_edit` insert) | Tool row + updated preview | Conversational ("add the sworn paragraph") |
| 10 | Validate structural integrity (`validate_docx`) | Tool row pass/fail | Automatic |
| 11 | Verify vs. source text (`verify_docx_against_source`, diff) | **Verification trust-panel** (divergence line) | Automatic; "verify it against my text" |
| 12 | Confirm caption strings (`verify_docx_against_source`, required_strings) | **Verification trust-panel** (missing-strings list) | Automatic |

---

## 3. The two surfaces built in this change

Both live in `client/src/concept2cure/components/ana/` and are gated by `ENABLE_ANA_DOCUMENT_STUDIO` (`client/src/flags/featureFlags.ts`, default off).

### 3A. `DocumentStudioPane.tsx` — split-pane live preview
Chat stays left; the active generated draft renders right (serif reading surface via `renderSafeMarkdown`). Header carries: title · format, **Download as DOCX**, and close. The pane **auto-opens** for each new draft and re-opens when a *different* draft arrives; the user can close it (`Ana.tsx` `studioOpen` / `studioClosed` state). When closed, the wrappers are `display:contents` (`.studioPassthrough`) so the existing chat layout is untouched.

- **Wiring:** `Ana.tsx` selects the most recent message carrying `generatedDraft` (`activeDraft` memo) and its `verification`, and renders the pane inside a `.studioLayout` flex row.
- **Download:** `handleDownloadDocx` POSTs `{ title, markdown, format: 'docx' }` to `POST /api/docx-factory/render`, streams the returned `.docx` blob to the browser, and **falls back** to a Markdown download if the render route is unavailable (never a silent no-op). *Backend contract for the host: return `application/vnd.openxmlformats-officedocument.wordprocessingml.document` bytes for that POST.*

### 3B. `VerificationPanel.tsx` — the "verified against your source" trust-panel (the 12th move's UI)
Renders `verify_docx_against_source`'s result as a calm strip:
- **Verified** → shield-check, "Verified against your source", "N of M required strings present verbatim".
- **Not verified** → alert, "X added / Y dropped lines vs. source", and a list of the **exact caption/boilerplate strings that are missing**.

It is a `role="status"` / `aria-live="polite"` region. Status reads as quiet stone (verified = `--success` fallback green; unverified = `--danger`), never neon. This is the evidence a regulatory user (and the Part 11 trail) cites.

- **Data path:** `useAnaChat.ts` parses the verify tool result in the `tool_result` SSE handler via the exported pure `mapVerificationResult(...)`, attaching `verification` to the assistant message.

---

## 4. Data model (unchanged — no migration)

`generatedDraft` already arrives on the message via the `artifact_draft` SSE event; the verification rides on the existing `tool_result` event. Persistence/versioning/provenance use the existing `concept2cure_artifacts` / `_artifact_versions` / `chat_tool_runs` / `provenance_events` tables (see `ANA_DOCUMENT_STUDIO_SPEC_2026-06-20.md` §3). The version dropdown (R3) and pagination (R7) remain as documented future polish.

---

## 5. Entry points (where a human starts)

Home **AnA card / morning briefing** (`concept2cure-home/AnaCard.tsx`), the **AnA dock** in each workspace (`biopharma/shell/AnaDock.tsx`, `pdev/shell/AnaDock.tsx`), the **MDX drafter** (`mdx/components/AnaDrafter.tsx`), and the shell (`ZenApp.tsx`). All route into the same `Ana` surface, so the Document Studio appears wherever AnA does once the flag is on.

---

## 6. Design gates honored

- **regulatory-compliance-ux:** verification is presented as auditable evidence; governed mutations keep the existing Part 11 sign-off (`GovernedActionSignoff.tsx`).
- **accessibility-enforcement:** tool rows and the verify panel are live regions; the close button has an accessible name; targets are keyboard-reachable. (WCAG 2.2 AA.)
- **microcopy-tone:** factual strings only — "Verified against your source", "Not verified", "N added / N dropped lines". No emoji, no cheerleading.
- **motion-discipline:** 200ms ease-out on pane controls; no spring/bounce.

---

## 7. Polish (built — follow-up after the initial flag-gated surface)

- **Resize handle** ✅ — the split is now a draggable, keyboard-operable separator via `react-resizable-panels` (`PanelGroup`/`Panel`/`PanelResizeHandle`), with the width persisted per browser (`autoSaveId`). `.studioResize` styles the affordance; the lib supplies `role="separator"` + arrow-key resize.
- **Version dropdown (R3)** ✅ — `Ana.tsx` groups every draft this session by title into versions (v1…vN, oldest→newest); the pane shows a version `<select>` (latest selected, "(latest)" tagged) when >1, switching the preview — and the per-version verification — without a backend call. Surfaces only when more than one version exists.
- **Page pagination (R7)** ✅ — `paginateContent()` splits the rendered draft at paragraph boundaries (~2200 chars/page, never cutting a block); the sub-bar shows "Page n / N" with prev/next (disabled at bounds, `aria-live`). Resets to page 1 on version switch / new draft.

Still future: a model/effort picker (L8). Documented in `ANA_DOCUMENT_STUDIO_SPEC_2026-06-20.md` §4.
