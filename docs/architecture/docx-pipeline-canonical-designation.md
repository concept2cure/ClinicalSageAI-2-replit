# DOCX Pipeline — Canonical Designation

## Date: 2026-04-04

## Three runtimes, one decision

The platform has three DOCX generation paths:

| Runtime | File | Purpose | When to use |
|---------|------|---------|-------------|
| **JS `docx` v9.5.1** | `server/services/docx/docxFactory.ts`, `server/services/docxGenerator.ts` | Programmatic document generation in Node.js | On-the-fly generation from structured data (AI-generated sections, real-time exports, lightweight documents) |
| **Python `python-docx`** | `workers/artifact-compute/docx-python-runtime.py` | Isolated worker for markdown→DOCX conversion | Artifact compute pipeline, batch generation, image-heavy documents |
| **Shadow Service (template-based)** | `shadow_service/shadow_service/docx_renderer.py` + `seed_docx_templates.py` | Template-driven rendering with placeholder filling | Production regulatory documents from approved templates (eCTD, FDA forms, CER) |

## Canonical designation

**Production regulatory documents** → Shadow Service (template-based)
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
