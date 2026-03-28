# Weave.bio Document Editor Research Report

> Research date: 2026-03-28
> Focus: Document editor features for regulatory document authoring
> Purpose: Competitive intelligence for Concept2Cure document system convergence sprint

---

## 1. Entry Points and Navigation Flow

### How Clients Access the Document Editor

Weave's platform is organized around three interconnected workspaces that funnel users into the editor:

1. **Data Room** (source material hub)
   - Users start by uploading source files (study reports, TLFs, protocols, literature)
   - Entire folder structures can be uploaded with preserved hierarchy
   - AI-extracted metadata and semantic search ("Ask" tab) help users find relevant sources
   - Direct connection to drafting workflows -- users go from Data Room to editor seamlessly

2. **Dossier Manager** (eCTD structure view)
   - Centralizes all submission documents and supporting content in a structured workspace
   - Sections are organized by eCTD module (Modules 1, 2, 3, 5)
   - Each section links to underlying data, and updates surface where changes are needed
   - Authors click into a section to enter the editor for that document/section

3. **AI Template Engine** (drafting entry point)
   - Users select an eCTD template or a general-purpose template
   - Configure variables, select source files from Data Room
   - Choose to generate an entire document or focus on individual sections
   - Generation launches directly into the unified editor

### Navigation Model

The overall flow is: **Data Room -> Dossier Manager -> Editor -> Submission Builder**

This is a linear, connected pipeline. The editor sits at the center, connected to both upstream (sources) and downstream (submission assembly) workflows.

---

## 2. Document Types Supported

### By Product Line

| Product     | Document Types                                                                                  | Stage              |
| ----------- | ----------------------------------------------------------------------------------------------- | ------------------ |
| **AutoIND** | IND application sections, Investigator's Brochure (IB), Nonclinical Written Summaries           | Preclinical / IND  |
| **AutoCT**  | Clinical Study Reports (CSRs), Protocols, Safety Reports, IBs, ISS/ISE summaries                | Clinical           |
| **HAQ Mgr** | Health Authority Question responses                                                             | Post-submission    |
| **General** | Any structured document using Data Room sources (general-purpose template, added April 2025)     | Any                |

### eCTD Module Coverage

- **Module 1**: Administrative information, including Investigator's Brochure
- **Module 2**: CTD summaries (quality, nonclinical, clinical overviews and summaries)
- **Module 3**: Quality (CMC) documentation
- **Module 5**: Clinical study reports and related information
- **Module 4**: Not explicitly mentioned in public materials (nonclinical study reports)

### Regulatory Agency Alignment

- Current: **FDA** (primary), **EMA** (secondary)
- Planned expansion: Japan (PMDA), Latin America, other global agencies
- eCTD structure is the foundational framework for all document types

---

## 3. Editor Features

### Unified Editor (April 2025 Release)

The editor is the core authoring environment. Key characteristics:

#### Rich Text & Formatting
- Full rich text editing with precision editing tools
- Tone adjustment, argument refinement, content polishing
- Automated table and figure generation from source data
- Automated formatting for submission compliance
- Cross-references maintained automatically: intra-document, inter-document, and literature references
- Citation management with automatic updates when sources change

#### Template/Content View Toggle
- **Seamless switching** between template view and content view within the same editor
- Template view: shows the AI template structure with prompt blocks and variables
- Content view: shows the generated/authored content
- Users can iterate rapidly between defining what to generate and refining what was generated

#### AI Content Generation (Inline)
- Generate entire documents or individual sections
- Insert new content beneath or in place of existing text
- Prompt blocks can run across all source files collectively or on each file individually
- AI generates tables, figures, and narrative sections from source data
- AI-assisted content refinement with sentence-level control

#### Source Traceability (Sentence-Level)
- Click on any sentence to view the exact source file and relevant keywords
- Every claim, table, and figure connects directly back to its origin
- Automated data verification against source documents
- This is deeply integrated into the editor -- not a separate feature

#### Version Control
- Version history with restore capability
- Live, version-controlled record of the submission process
- Every decision, edit, and data update captured in audit trail
- Section status tracking (status labels per section in the dossier)

#### Collaboration
- Real-time simultaneous editing (Google Docs-style)
- Comments, context, and redline suggestions displayed side-by-side
- Track who changed what
- Streamlined approval workflows with built-in checks
- Authors and reviewers work in one connected space

#### Export
- DOCX export confirmed
- eCTD-formatted output for submission

---

## 4. Document Lifecycle Workflow

Based on publicly available information, Weave's document lifecycle follows these stages:

```
[Data Organization] -> [Drafting] -> [Review & Refinement] -> [Verification] -> [Publishing]
```

### Stage Details

1. **Data Organization** (Data Room)
   - Upload and organize source files
   - AI extracts metadata, enables semantic search
   - Import existing folder structures
   - Connect sources to drafting workflows

2. **Drafting** (Editor + AI Templates)
   - Select eCTD template or general-purpose template
   - Configure AI variables and source file selection
   - AI generates initial draft from source data (minutes, not weeks)
   - Users guide narrative direction, AI handles content assembly
   - Whole-document or section-by-section generation

3. **Review & Refinement** (Editor)
   - Multi-user real-time collaboration
   - Comments and redline suggestions side-by-side
   - AI surfaces insights and flags inconsistencies
   - Precision editing: tone, arguments, content
   - Section status tracking for progress visibility
   - Approval workflows with built-in checks

4. **Verification** (Editor + Automated Checks)
   - Automated content verification against source data
   - Sentence-level source traceability for QC
   - Cross-reference and citation validation
   - Consistency checks across sections and documents

5. **Publishing** (Submission Builder)
   - Assemble eCTD submission package
   - Automated formatting to eCTD standards
   - Section status tracking for completeness
   - DOCX export
   - Built-in eCTD structure for final packaging

### Key Design Principle

Human oversight is central at every stage. The AI automates structure and content generation, but regulatory professionals make every critical decision. The platform surfaces data and flags issues -- it does not make autonomous regulatory judgments.

---

## 5. eCTD/CTD Structure Navigation

### Dossier Manager as Navigation Hub

- The Dossier Manager provides an eCTD-structured view of all submission documents
- Sections are organized by CTD module hierarchy
- Each section is tied to underlying source data
- Updates to source data surface where changes are needed in the dossier
- Section status tracking provides visibility into completeness

### Built-in eCTD Framework

- The editor is "grounded in the eCTD structure"
- Users can start new drafts from the built-in eCTD template
- Finalized submissions serve as reference points for HAQ responses
- Module/section hierarchy is the organizing principle for the entire platform

### Cross-Document Awareness

- Intra-document cross-references maintained automatically
- Inter-document cross-references maintained automatically
- Literature references tracked and updated
- When one section changes, related sections are flagged for update

---

## 6. Template and AI-Powered Drafting Features

### AI Template Engine

This is one of Weave's strongest differentiators:

| Feature                        | Description                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------- |
| **eCTD Templates**             | Pre-built templates aligned to eCTD module sections                              |
| **General-Purpose Template**   | Generate structured documents beyond eCTD using any Data Room sources            |
| **Customizable Variables**     | Templates populated with user-defined variables, maintaining context across iterations |
| **Prompt Blocks**              | AI prompt blocks within templates; run across all sources or per-file            |
| **Whole vs. Section Gen**      | Choose to generate entire document or target individual sections                 |
| **Insert Modes**               | Insert new content beneath existing text or replace existing text                |
| **Source-Linked Generation**   | All generated content traced back to specific source documents                   |
| **Iterative Refinement**       | Templates maintain context as users iterate -- no lost thread                    |
| **Custom Rules**               | Customize with organization-specific rules and standards                         |

### AI Capabilities in the Editor

- **Content generation**: Tables, figures, narrative text from source data
- **Content refinement**: Sentence-level AI-assisted editing
- **Inconsistency detection**: AI flags inconsistencies across sections
- **Insight surfacing**: AI surfaces relevant data and patterns from sources
- **Automatic classification**: Source files automatically classified by type
- **Semantic search**: "Ask" feature in Data Room for querying across all sources

### Performance Benchmarks (Publicly Claimed)

- Takeda partnership: 97% time reduction for IND nonclinical written summaries (100 hours to 2.6-3.7 hours)
- No critical AI-generated regulatory errors found in independent QC assessment
- Parexel partnership: 50% faster IND authoring timelines
- CSR drafted in under one hour (demo claim)
- Thousands of pages of study reports ingested and reviewed in minutes

---

## 7. Key Competitive Differentiators vs. Concept2Cure

### What Weave Does Well

1. **Source traceability as a first-class feature** -- sentence-level linking back to source documents is deeply integrated, not bolted on
2. **Data Room as a connected workspace** -- sources, metadata, semantic search, all feeding the editor
3. **Template-first authoring** -- eCTD templates are the starting point, not blank documents
4. **Unified editor with template/content toggle** -- seamless switch between template design and content authoring
5. **Real-time collaboration** -- multi-user editing, comments, redlines, approval workflows
6. **eCTD-native structure** -- the entire platform is organized around the eCTD hierarchy
7. **Automated cross-referencing** -- intra-document, inter-document, and literature references maintained automatically
8. **Strong enterprise validation** -- Takeda, Parexel partnerships with published metrics

### What Weave Does NOT Appear to Have (Based on Public Info)

1. **No visible chat-first/AI assistant interface** -- Weave is editor-centric, not conversational
2. **No regulatory intelligence layer** (equivalent to RIM) -- no pattern detection, signal accumulation, or judgment scoring
3. **No multi-agency comparison** -- currently FDA-focused, EMA secondary, no PMDA/Health Canada deep support
4. **No predictive analytics** -- no equivalent to Foresight engine
5. **No biostatistics/SAP capabilities** mentioned
6. **No device/combination product** workflows mentioned
7. **No precedent analysis engine** -- no historical submission pattern analysis
8. **Limited post-submission lifecycle** -- HAQ Manager is new (Nov 2025), post-market not yet available

---

## 8. Implications for Concept2Cure Document System Sprint

### Weave Parity Features (Must Match)

Based on this research, the 10 Weave parity use cases likely include:

1. eCTD-structured document creation from templates
2. AI-powered draft generation from source data
3. Real-time collaborative editing
4. Sentence-level source traceability
5. Automated cross-reference management
6. Section status tracking across the dossier
7. Version history with restore
8. Inline AI content refinement (section-level and sentence-level)
9. Connected data room with semantic search
10. DOCX/submission-ready export

### Concept2Cure Superiority Opportunities (Already Identified in Sprint Plan)

- Biostatistics/SAP integration
- Regulatory precedent analysis
- Multi-agency support (FDA + EMA + PMDA + Health Canada)
- Device/combination product workflows
- Chat-first AI assistant (AnA) -- conversational regulatory intelligence
- RIM intelligence layer -- pattern detection, signal accumulation, judgment scoring
- Predictive analytics (Foresight)

---

## Sources

- [Weave Bio Homepage](https://www.weave.bio/)
- [Weave Bio Platform Page](https://www.weave.bio/platform/)
- [Weave Bio Submission Builder](https://www.weave.bio/platform/platform-submission-builder/)
- [AutoIND April 2025 Release Notes](https://www.weave.bio/resources/autoind-april-2025-product-release-notes/)
- [Weave Bio Series A Announcement (BusinessWire)](https://www.businesswire.com/news/home/20251016053611/en/Weave-Bio-Secures-20M-Series-A-Funding-to-Enhance-Its-AI-Native-Regulatory-Platform)
- [HAQ Manager Launch (BusinessWire)](https://www.businesswire.com/news/home/20251106110323/en/Weave-Bio-Launches-HAQ-Manager-Extending-AI-Native-Regulatory-Automation-into-Critical-Review-Phase)
- [Excedr Blog: Weave Bio Overview](https://www.excedr.com/blog/weave-bio-ai-powered-regulatory-automation-for-drug-development)
- [Innovation Endeavors Investment Post](https://www.innovationendeavors.com/insights/our-investment-in-weave-bio-using-ai-to-alleviate-regulatory-friction-in-drug-development)
- [AutoCT Product Page (Webflow)](https://weave-bio.webflow.io/products/autoct)
- [Weave Bio Solutions (Webflow)](https://weave-bio.webflow.io/solutions)
- [Parexel Partnership Announcement](https://newsroom.parexel.com/news-releases/news-release-details/parexel-announces-ai-partnership-weave-bio-accelerate-regulatory/)
- [Weave Bio $10M Seed Announcement (BusinessWire)](https://www.businesswire.com/news/home/20240530329583/en/Weave-Bio-Announces-10M-in-New-Funding-and-Launch-of-Its-AI-Powered-Platform-to-Streamline-Drafting-Reviewing-Submitting-Regulatory-Documents-in-Drug-Development)
