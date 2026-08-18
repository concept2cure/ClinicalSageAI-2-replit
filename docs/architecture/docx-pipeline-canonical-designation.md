# DOCX Pipeline — Canonical Designation

## Date: 2026-04-04

## Three runtimes, one decision

> **2026-08-18 — one of these three no longer exists.** The Shadow Service
> renderer was deleted by `b79f020e1` ("surgical dead code purge — 670 files
> removed"), together with the whole `shadow_service/` Python service. Nothing
> under `shadow_service/` remains except two risk-code data files. The canonical
> designation recorded below therefore names a runtime that is not there, and
> the CI gate that enforces it
> (`scripts/ci/check-docx-runtime-canonicality.mjs`) went on listing it as
> approved — and printing it in its own PASS banner — until the allowlist was
> checked against the tree. **The designation for production regulatory
> documents is currently unassigned and needs re-deciding by whoever owns this
> pipeline.** The row is left in place rather than deleted so the decision that
> has to be revisited is visible.

The platform had three DOCX generation paths:

| Runtime | File | Purpose | When to use |
|---------|------|---------|-------------|
| **JS `docx` v9.5.1** | `server/services/docx/docxFactory.ts`, `server/services/docxGenerator.ts` | Programmatic document generation in Node.js | On-the-fly generation from structured data (AI-generated sections, real-time exports, lightweight documents) |
| **Python `python-docx`** | `workers/artifact-compute/docx-python-runtime.py` (family also includes the `docx-insert` / `docx-xml` / `docx-validate` surgical-edit and validation runtimes in the same directory) | Isolated worker for markdown→DOCX conversion, surgical edits to existing documents, and OOXML validation | Artifact compute pipeline, batch generation, image-heavy documents, AnA document surgery |
| **Shadow Service (template-based) — REMOVED, see note above** | ~~`shadow_service/shadow_service/docx_renderer.py`~~ + `seed_docx_templates.py` | Template-driven rendering with placeholder filling | Production regulatory documents from approved templates (eCTD, FDA forms, CER) |

## Canonical designation

**Production regulatory documents** → Shadow Service (template-based) — *this runtime was removed; see the note above*
- This is the canonical path for documents that will be submitted to regulatory authorities
- Uses approved DOCX templates with placeholder filling
- Deterministic output (SHA-256 normalized)
- Audit trail via render events
- 20 demo templates covering IND, NDA, BLA, 510(k), CER, SOP families

**AI-generated documents** → JS `docx` library
- For real-time document generation from AI-structured content
- Headers, footers, tables, styled paragraphs, page breaks, bullet/numbered lists
- Used by `docxFactory.generateRegulatory()` for on-the-fly exports

**Batch/worker documents** → Python `python-docx` runtime
- For isolated artifact compute workers
- Supports markdown parsing, image embedding, table rendering
- Used by the artifact compute pipeline for background generation

## Rule
Do not add a fourth DOCX runtime. If a new document generation need arises, use one of these three.
