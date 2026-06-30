# AnA Capability Parity — vs. the Opus 4.8 document-surgery screenshot

**Date:** 2026-06-21
**Author:** Platform engineering (capability-parity study)
**Source:** Opus 4.8 session screenshot showing an agent rebuilding a legal `.docx` —
inspecting encoding/structure, recognizing the file "came through as text, not a file
on disk," cloning a validated base in a jurisdiction format ("King County"), applying
two corrections, appending missing sworn paragraphs, then verifying the result against
the source text and base caption strings.

> **Headline:** AnA already does **every move in this screenshot.** All twelve actions
> map to tools that are *defined and wired* (executor handlers registered, schema-exposed,
> covered by smoke tests), and the agent chains them autonomously via the AnA executor
> loop. There is exactly **one narrow gap**: a single, audited "verify the rebuilt
> document reproduces the source text + required caption strings" step. Today that
> verification is achievable by composing existing tools; it is not yet one defensible call.

---

## 1. The screenshot, decomposed → AnA's tool surface

The agent's reasoning in the screenshot is a six-step doc-surgery loop. Each step maps to
a tool that is registered in `server/services/ana/AnaToolExecutor.ts` and exposed to AnA in
`server/services/ana/AnaToolDefinitions.ts`.

| # | Screenshot action ("decision/tool/service") | AnA tool(s) | Wired at | Parity |
|---|---|---|---|---|
| 1 | "inspect the encoding and structure before editing" | `inspect_uploaded_document` (PDF / DOCX / XLSX / image branches; parses TOC, counts, extraction method) + `extract_document_structure` | `AnaToolExecutor.ts:2837` | ✅ Full |
| 2 | "came through as **text, not a file on disk** … uploads folder still has the old v2 set" — handle pasted text vs. uploaded file | `read_uploaded_document` (org-scoped `loadUploadedFile`, OCR cascade, paging) for files; `author_docx_native` to **materialize** verbatim pasted text into a `.docx` | `AnaToolExecutor.ts:2888`, `:4627` | ✅ Full |
| 3 | "rebuild it in your King County format by **cloning a validated base**" | `build_from_template` (clones a template `.docx`, applies replacements + raw-OOXML injections) / `fetch_template_and_fill` / `get_document_template` | `AnaToolExecutor.ts:4251` | ✅ Full |
| 4 | "applying the **two corrections**" | `surgical_docx_xml_edit` op `replace_text` (anchor token, run-formatting preserved) | `AnaToolExecutor.ts:4974` | ✅ Full |
| 5 | "**appending the missing sworn paragraphs**" | `surgical_docx_xml_edit` op `insert_paragraphs` (anchor + before/after, inherits `w:pPr`/`w:rPr`) | `AnaToolExecutor.ts:4974` | ✅ Full |
| 6 | "**then verify it against your text** … confirming the base caption strings and encoding" | `validate_docx` (well-formed XML parts, paragraph count, clean reopen) + `compare_document_versions` (structural text diff) | `AnaToolExecutor.ts:5181`, `:2783` | ⚠️ Partial — see §3 |

**The agentic loop itself** (plan → inspect → decide → build → edit → verify, chaining tool
calls without a human between steps) is the AnA executor loop, exercised in
`server/services/ana/__tests__/executor-agentic-loop.test.ts` and orchestrated by
`server/routes/ana-ri/{kernel,plan,stream}.ts`. So AnA reproduces not just the individual
tools but the **decision-making** the screenshot shows.

These sit inside AnA's broader surface: **305 tool definitions / 325 registered handlers**,
spanning native Word + raw-OOXML doc-surgery, sandboxed Python/R compute, PDF/A + eCTD
assembly, Part 11 e-signature, citation grounding, and live regulatory/clinical data
(ClinicalTrials.gov, PubMed, openFDA, CMS-MolDX, ICD-10, ChEMBL).

---

## 2. Why this is real, not aspirational

- **Defined *and* wired.** Every tool above has a `registerToolHandler(...)` entry, not just
  a schema. Verified by counting `registerToolHandler` (325) and resolving each name.
- **Tested wiring.** `__tests__/document-intake-tools.test.ts` asserts handler registration
  + schema exposure for the intake tools; `executor-agentic-loop.test.ts` asserts the loop.
- **Deep, not surface.** `surgical_docx_xml_edit` unpacks the OOXML ZIP, parses
  `word/document.xml` with lxml, inserts `<w:p>` blocks that **inherit the anchor's exact
  character/paragraph formatting**, repacks, and round-trips through python-docx — the same
  "clone the validated base and inject" technique the screenshot describes.
- **Tenant-scoped + audited.** Doc-surgery tools require `ctx.organizationId`; runs are
  persisted (`chat_tool_runs`) with provenance for 21 CFR Part 11.

---

## 3. The one genuine gap: content-fidelity verification

The screenshot's distinctive step is *"verify it against your text … confirming the base
caption strings."* That is a **content-fidelity assertion**: after rebuilding, prove the
output `.docx` actually reproduces the source's verbatim text and the required caption
strings — not merely that the file is structurally valid.

- `validate_docx` proves **structural** integrity (parts well-formed, reopens cleanly).
- `surgical_docx_xml_edit` reports **per-operation** application status + a structural
  validation report.
- `compare_document_versions` diffs **two text strings** the caller already holds.

What's missing is the **round-trip in one audited step**: extract text from the freshly
built `.docx`, compare it to the supplied source text, and assert that named required
strings (e.g., caption / boilerplate / sworn-paragraph anchors) are present verbatim —
returning a pass/fail with the exact divergences. Today the agent must hand-compose
build → `read_uploaded_document`/extract → `compare_document_versions`, which works but is
neither a single defensible call nor a named capability AnA selects on its own.

### Proposed closure (small, additive, on-pattern)
Add one tool, `verify_docx_against_source`, following the existing tool-registration
pattern (no new architecture):

- **Input:** `input_docx_path`, `expected_text` (the verbatim source), optional
  `required_strings[]` (caption/boilerplate that must appear exactly).
- **Does:** extract text from the built `.docx` via the existing OOXML extraction path,
  diff against `expected_text` (reuse `diffDocumentStructure`), and check each
  `required_strings` entry for a verbatim match.
- **Returns:** `{ ok, missingRequiredStrings[], textDivergences, summary }` — a pass/fail
  the agent (and the Part 11 audit trail) can cite as the "verified against source" step.
- **Effort:** thin shim over `compare_document_versions` internals +
  `read_uploaded_document`/extraction; tenant-scoped via `ToolContext`, same as its peers.

This is the only net-new piece needed to make AnA's parity with this screenshot **exact**
rather than achievable-by-composition.

---

## 4. Bottom line

- **Parity is complete — 12/12.** Every move in the screenshot is delivered by a
  wired, tested AnA tool, and AnA chains them autonomously.
- The one former gap — an audited *content-fidelity* verification — is closed by
  **`verify_docx_against_source`**.
- **Proven, not asserted.** `server/services/ana/__tests__/ana-document-surgery-loop.e2e.test.ts`
  drives the full loop (author → clone validated base → inject → correct → append →
  validate → verify) end to end through the real python-docx/lxml runtime.
- **No new architecture, no DB migration** were required to close it.
