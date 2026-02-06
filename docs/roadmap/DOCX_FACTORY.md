# Phase 6: DOCX Factory — Regulatory Document Generation
> **Version:** 1.0 | **Created:** 2026-02-06 | **Status:** PLANNED  
> **Parent:** [CONCEPT2CURE_MASTER_ROADMAP.md](./CONCEPT2CURE_MASTER_ROADMAP.md)  
> **Depends On:** Phase 4 (Orchestration Kernel), Phase 5 (Evidence Fabric)

---

## Purpose

Phase 6 builds the **DOCX Factory** — an automated regulatory document generation pipeline that:

1. Generates **eCTD-compliant documents** from traced evidence + AI-drafted prose
2. Manages **template libraries** for submission types (IND, NDA, 510(k), BLA)
3. Produces **versioned artifacts** with content hashes (Trust Rails pillar)
4. Integrates with the orchestration kernel as `document_gen` step type
5. Exports **submission-ready packages** (Word, PDF, eCTD XML)

---

## Architecture Overview

```
Evidence Fabric          Orchestration
    │                        │
    ▼                        ▼
┌──────────────────────────────────────┐
│           DOCX Factory               │
│                                      │
│  Template ──▶ Renderer ──▶ Artifact  │
│  Library      Engine       Store     │
│                                      │
│  ┌────────┐  ┌────────┐  ┌────────┐ │
│  │ Jinja2 │  │ python │  │ S3 /   │ │
│  │ DOCX   │  │ docx   │  │ local  │ │
│  │ tmpls  │  │ + PDF  │  │ store  │ │
│  └────────┘  └────────┘  └────────┘ │
└──────────────────────────────────────┘
                    │
                    ▼
            Trust Rails
        (content_hash per version)
```

---

## Core Concepts

### Document Templates

| Template Type | Submission | Sections |
|---------------|------------|----------|
| IND Module 2 | IND | Summary, Introduction, Quality, Nonclinical, Clinical |
| 510(k) Substantial Equivalence | 510(k) | Device Description, Predicate Comparison, Performance Data |
| NDA Module 2.5 | NDA | Clinical Overview, Efficacy Summary, Safety Summary |
| CER | MDR | Clinical Background, State of Art, Clinical Data, Benefit-Risk |

### Artifact Lifecycle

```
TEMPLATE ──▶ DRAFT ──▶ REVIEW ──▶ APPROVED ──▶ EXPORTED
   │            │          │           │            │
   │         AI draft   Human QA    e-Sign     Release hash
   │         (auto)     (gate)     (gate)      (immutable)
```

### Rendering Pipeline

1. **Gather Inputs** — Collect claims, fragments, metadata from Evidence Fabric
2. **Apply Template** — Jinja2/DOCX template with section placeholders
3. **AI Enhancement** — Optional AI pass for prose quality, consistency
4. **Render Output** — Generate DOCX + PDF with embedded metadata
5. **Hash & Store** — Compute `content_hash`, store versioned artifact
6. **Register in Workflow** — Update step_run output with artifact references

---

## Planned Schema

```sql
-- Schema: documents (new)
documents.templates          — DOCX/Jinja2 template registry
documents.template_sections  — section definitions per template
documents.artifacts          — generated documents with content_hash
documents.artifact_versions  — version history (each render = new version)
documents.artifact_sections  — per-section content with fragment links

-- Bridge to evidence
-- artifact_sections reference evidence.claim_links
-- artifacts reference orchestration.step_runs (which step produced it)
```

---

## Planned Components

### Backend Services

| Service | Purpose | Location |
|---------|---------|----------|
| `TemplateRegistry` | CRUD for document templates | `shadow_service/shadow_service/docx_factory/` |
| `DocumentRenderer` | Jinja2 + python-docx rendering engine | `shadow_service/shadow_service/docx_factory/` |
| `PDFConverter` | DOCX → PDF conversion (LibreOffice headless) | `shadow_service/shadow_service/docx_factory/` |
| `ArtifactStore` | Versioned storage with content_hash | `shadow_service/shadow_service/docx_factory/` |
| `ExportPackager` | eCTD XML packaging for submission | `shadow_service/shadow_service/docx_factory/` |

### API Endpoints (Planned)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/documents/templates` | List available templates |
| `POST` | `/documents/render` | Render a document from template + inputs |
| `GET` | `/documents/artifacts?program_id=` | List artifacts for a program |
| `GET` | `/documents/artifacts/{id}/download` | Download artifact (DOCX/PDF) |
| `GET` | `/documents/artifacts/{id}/versions` | Version history |
| `POST` | `/documents/artifacts/{id}/verify` | Verify content_hash integrity |
| `POST` | `/documents/export/ectd` | Package for eCTD submission |

### UI Components (Planned)

| Component | Purpose | Surface |
|-----------|---------|---------|
| Template Browser | Browse/select document templates | Center Pane |
| Document Preview | Live DOCX/PDF preview | Center Pane |
| Version Timeline | Artifact version history with diffs | Right Panel |
| Export Wizard | Guided eCTD export flow | Modal |

---

## Integration with Orchestration

### `docx_gen` Step Type

When the orchestration runner encounters a step with `step_type = 'document_gen'`:

1. Read step `config` for template ID and input mapping
2. Gather inputs from prior step outputs (via `workflow_runs.context`)
3. Call `DocumentRenderer.render()` with template + inputs
4. Store artifact, compute `content_hash`
5. Write `step_runs.output = { artifact_id, content_hash, download_url }`
6. Emit `step_run_event` with `event_type = 'document_generated'`

### Existing `docx_gen` Seed Template

The `docx_gen` workflow template (seeded in Phase 4) provides a 2-step pipeline:

```
Gather Document Inputs (task) → Render DOCX/PDF (document_gen)
```

Phase 6 expands this with real rendering logic.

---

## Trust Rails Integration

| Requirement | Implementation |
|-------------|---------------|
| **Content integrity** | `content_hash` (SHA-256) computed for every artifact version |
| **Version provenance** | Each version links to the step_run that produced it |
| **Export verification** | `release_hash` on export package — verifiable against source artifacts |
| **Signature binding** | Electronic signatures bind to specific `content_hash` |
| **Audit trail** | artifact_versions + step_run_events provide complete history |

---

## Dependencies

### Upstream (Required)
- Phase 4 Orchestration Kernel (execution engine) ✅
- Phase 5 Evidence Fabric (claims + traceability for document content)
- `python-docx` library for DOCX rendering
- LibreOffice headless for PDF conversion (Docker image)

### Downstream (Enables)
- Phase 7: Mission Control (artifact status on dashboard)
- Phase 8: Communication Hub (attach artifacts to HAQ responses)
- Phase 10: Validation (exported packages as validation artifacts)

---

## Acceptance Criteria

- [ ] Template renders DOCX with correct eCTD section structure
- [ ] Every artifact version has a verified `content_hash`
- [ ] DOCX → PDF conversion preserves formatting
- [ ] Artifact versions link to generating step_run
- [ ] eCTD export produces valid XML package structure
- [ ] Content hash verification endpoint detects tampered files
- [ ] RLS prevents cross-program artifact access
