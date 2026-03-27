# AnA Document Generation Engine + Master Python Builder

**Date:** 2026-03-27
**Status:** PLAN ONLY — awaiting approval
**Branch:** `concept2cure-v2`

---

## The Problem

AnA has 43 slash commands, 6 intent lenses, 9 Claude tools, 8 data connectors, an agentic loop executor, extended thinking support, and a full document export pipeline (DOCX, PDF, XML, eCTD-ZIP). **Almost none of it is wired to the chat flow.** The chat route sends plain text to Claude with no tools, no connectors, no agentic loops.

The result: AnA talks about regulatory documents but can't actually make them at the level Claude Opus does when used directly through Anthropic's API.

---

## What We Need

### 1. Master Python Builder

A server-side Python service that generates publication-quality regulatory documents using:
- **Structured templates** for every major regulatory document type
- **XML generation** for eCTD backbone, ICSR (E2B R3), Define-XML
- **DOCX generation** with regulatory-compliant formatting (FDA/EMA/PMDA standards)
- **PDF generation** from structured data (not just DOCX→PDF conversion)
- **Data-driven sections** that pull from project artifacts, CSR data, CMC records
- **Multi-agency variants** (FDA Module 1 vs EMA Module 1 vs PMDA Module 1)

### 2. Tool-Aware AnA

Wire all existing tools into the chat flow so AnA can:
- Search ClinicalTrials.gov, PubMed, FDA, EMA databases mid-conversation
- Check regulatory compliance in real-time
- Generate citations and cross-references
- Analyze predicate devices
- Extract document structure from uploaded files
- Use extended thinking for complex regulatory reasoning

### 3. Document Generation Commands

New slash commands that produce real governed artifacts:
- `/generate csr` — Full Clinical Study Report (ICH E3)
- `/generate ctd [module]` — CTD module sections
- `/generate cer` — Clinical Evaluation Report (EU MDR)
- `/generate 510k` — 510(k) summary and supporting docs
- `/generate pma` — PMA application sections
- `/generate icsr` — Individual Case Safety Report (XML)
- `/generate sap` — Statistical Analysis Plan
- `/generate protocol` — Clinical Protocol
- `/generate ib` — Investigator's Brochure

---

## Architecture

```
AnA Chat (frontend)
    ↓
Chat Route (server/routes/chat.ts)
    ↓ (tools enabled)
AI Gateway (Claude Opus 4 + tools)
    ↓ (tool calls)
Claude Tool Executor (agentic loop, max 5 rounds)
    ├── search_clinical_evidence → ClinicalTrials.gov API
    ├── search_literature → PubMed E-utilities
    ├── lookup_fda_guidance → FDA guidance database
    ├── lookup_ich_guideline → ICH reference
    ├── check_regulatory_compliance → RIM + pattern engine
    ├── validate_cross_references → consistency engine
    ├── generate_citation → citation service
    ├── analyze_predicate_device → 510(k) engine
    ├── extract_document_structure → eCTD parser
    └── generate_document → Master Python Builder
         ↓
Master Python Builder (FastAPI service)
    ├── XML generators (eCTD, ICSR E2B, Define-XML)
    ├── DOCX generators (regulatory-compliant formatting)
    ├── PDF generators (direct from structured data)
    ├── Template engine (Jinja2 + regulatory templates)
    ├── Data assembly (project artifacts → section content)
    └── Validation (DTD/schema checking)
         ↓
Governed Artifact (saved to project)
    ↓
EditorPanel (user reviews/edits)
```

---

## Implementation Phases

### Phase 1: Wire Existing Tools to Chat (Server-side)

**Files:**
- `server/routes/chat.ts` — Pass Claude tools + enable agentic loop
- `server/services/claude/ClaudeToolExecutor.ts` — Already built, just needs activation

**What changes:**
- Chat route passes `tools` array to AI Gateway request
- Gateway forwards tools to Claude API
- Tool calls execute via ClaudeToolExecutor
- Results flow back into conversation
- Extended thinking enabled for complex queries

**Outcome:** AnA can search databases, check compliance, and reason deeply mid-conversation.

### Phase 2: Master Python Builder Service

**New files:**
- `server/services/python/master_builder/` — Python package
  - `__init__.py`
  - `builder.py` — Main orchestrator
  - `generators/xml_generator.py` — eCTD XML, ICSR E2B(R3), Define-XML
  - `generators/docx_generator.py` — Regulatory DOCX with python-docx
  - `generators/pdf_generator.py` — Direct PDF with ReportLab
  - `templates/` — Jinja2 templates for every document type
  - `validators/` — DTD/schema validation
  - `requirements.txt` — python-docx, lxml, reportlab, jinja2

**Document types supported:**

| Document | Format | Standard | Agencies |
|----------|--------|----------|----------|
| CSR | DOCX + PDF | ICH E3 | All |
| CTD Module 1 | DOCX | Regional | FDA, EMA, PMDA, NMPA |
| CTD Module 2 | DOCX | ICH M4 | All |
| CTD Module 3 (Quality) | DOCX | ICH M4Q | All |
| CTD Module 4 (Nonclinical) | DOCX | ICH M4S | All |
| CTD Module 5 (Clinical) | DOCX | ICH M4E | All |
| eCTD Backbone | XML | ICH M8 v4.0 | All |
| ICSR | XML | ICH E2B(R3) | All |
| CER | DOCX + PDF | EU MDR 2017/745 | EU |
| 510(k) Summary | DOCX | FDA eSTAR | FDA |
| PMA | DOCX | FDA | FDA |
| Protocol Synopsis | DOCX | ICH E6 | All |
| SAP | DOCX | ICH E9 | All |
| IB | DOCX | ICH E7 | All |
| Define-XML | XML | CDISC | FDA, PMDA |

### Phase 3: AnA Document Generation Commands

**File:**
- `server/routes/chat.ts` — Slash command handler for `/generate`
- `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` — UI for document generation progress

**New command flow:**
1. User types `/generate csr` or asks "Generate a Clinical Study Report for this project"
2. AnA detects intent, confirms parameters (study info, agencies, sections)
3. Calls Master Python Builder via internal API
4. Builder generates structured document
5. Document saved as governed artifact in project
6. AnA shows preview + "Open in Editor" action
7. User clicks → EditorPanel with full document

### Phase 4: Data-Driven Section Assembly

**Files:**
- `server/services/python/master_builder/assembler.py` — Pulls data from project

**What it does:**
- Queries project artifacts, CSR tables, safety data, efficacy results
- Populates template sections with real project data
- Generates regulatory-standard tables (demographics, AEs, efficacy endpoints)
- Cross-references between sections
- Validates completeness against ICH checklist

### Phase 5: Multi-Agency Harmonization

**What it does:**
- Same content, region-specific formatting
- FDA Module 1 (Form 356h, 1571, 3674) vs EMA Module 1 (Application Form)
- Region-specific labeling requirements
- CTD section differences by jurisdiction
- Automatic variant generation from single source

---

## Tool Manifest for AnA

Every tool AnA should know about and have loaded:

### Search & Research Tools
| Tool | Use Case | When to Use |
|------|----------|-------------|
| `search_clinical_evidence` | Find clinical trial data | User asks about trials, evidence, study designs |
| `search_literature` | PubMed literature search | User needs published evidence, systematic reviews |
| `lookup_fda_guidance` | FDA guidance reference | User asks about FDA requirements, 21 CFR |
| `lookup_ich_guideline` | ICH guideline reference | User asks about CTD structure, GCP, E3/E6/E9/M4 |
| `analyze_predicate_device` | 510(k) predicate comparison | User working on device submission |

### Compliance & Validation Tools
| Tool | Use Case | When to Use |
|------|----------|-------------|
| `check_regulatory_compliance` | Compliance checking | User drafts content, needs compliance validation |
| `validate_cross_references` | Cross-document consistency | User has multiple sections, needs consistency check |
| `generate_citation` | Regulatory citation | User needs formatted citations for regulatory docs |
| `extract_document_structure` | Parse uploaded documents | User uploads a document for analysis |

### Document Generation Tools
| Tool | Use Case | When to Use |
|------|----------|-------------|
| `generate_document` | Full document generation | User asks to create CSR, CTD, CER, 510(k), etc. |
| `generate_section` | Single section generation | User asks to draft a specific CTD section |
| `generate_table` | Regulatory table generation | User needs demographics, AE, efficacy tables |
| `generate_xml` | XML generation (eCTD, ICSR) | User needs structured XML output |
| `export_package` | eCTD/submission package | User ready to export for filing |

### Intelligence Tools
| Tool | Use Case | When to Use |
|------|----------|-------------|
| `assess_readiness` | Submission readiness score | User asks "are we ready to submit?" |
| `detect_deficiencies` | Deficiency prediction | User wants to know likely reviewer concerns |
| `compare_precedents` | Precedent analysis | User wants to compare with approved products |
| `risk_assessment` | Risk-benefit analysis | User needs structured risk evaluation |

---

## What This Means for Users

**Before:** AnA is a smart chatbot that gives regulatory advice.
**After:** AnA is a regulatory document production engine that:

1. **Searches** — pulls real evidence from ClinicalTrials.gov, PubMed, FDA, EMA
2. **Thinks** — uses extended thinking for complex regulatory reasoning
3. **Generates** — produces publication-quality documents in DOCX, PDF, XML
4. **Validates** — checks compliance against ICH, FDA, EMA, PMDA standards
5. **Governs** — saves outputs as governed artifacts with audit trail
6. **Edits** — flows directly into EditorPanel for human review

Same quality as using Claude Opus directly, but tuned for regulatory affairs and integrated with the project's data.

---

## Recommended Build Order

1. **Phase 1** (wire tools to chat) — highest leverage, lowest risk
2. **Phase 2** (Master Python Builder) — the engine
3. **Phase 3** (generation commands) — the interface
4. **Phase 4** (data-driven assembly) — the intelligence
5. **Phase 5** (multi-agency) — the reach

**No code was changed. This is a plan only.**
