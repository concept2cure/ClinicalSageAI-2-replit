# Weave.bio Platform Capabilities — Factual Research Report

**Date**: 2026-03-29
**Purpose**: Honest assessment of what Weave.bio actually offers, based on publicly verifiable sources
**Methodology**: Web search of company website, press releases, investor blog posts, partnership announcements, published research paper, and third-party coverage

---

## Company Overview

- **Full name**: Weave Bio (legal entity: Weave, Inc.)
- **Founded**: 2022, San Francisco, CA
- **Co-founders**: Ari Caroline (CEO), Umut Eser (Chief AI Officer), Shlomo Klapper
- **Employees**: ~42 (as of January 2026, per Tracxn)
- **Total funding**: $36M across 3 rounds ($20M Series A in October 2025, led by USVP)
- **Key investors**: USVP, Innovation Endeavors, Magnetic Ventures, Character, TMV, Serrado Capital
- **Key partners**: Parexel (exclusive CRO partner), Takeda (validation/co-development partner)
- **Award**: "Biotech AI Innovation of the Year" (2024)

---

## Platform Modules (Verified)

Weave markets four distinct product modules:

### 1. AutoIND
- Flagship module for Investigational New Drug (IND) application preparation
- Focuses on preclinical IND submissions
- Automatically drafts sections based on company data, public information, and regulatory guidelines
- Validated with Takeda: 97% time savings on nonclinical written summaries (Sections 2.6.2, 2.6.4, 2.6.6)

### 2. AutoCT (Clinical-Stage)
- Extends platform to clinical and approval-stage submissions
- Announced as expansion beyond preclinical IND
- Less publicly documented than AutoIND

### 3. Submission Builder (Launched January 2026)
- Prepares, organizes, and manages eCTD submission content
- Generates and refines content for Modules 1 (including Investigator's Brochure), 2, 3, and 5
- Automates submission formatting and table/figure handling
- Manages citations and cross-references (intra-document, inter-document, and literature)
- Section status tracking
- DOCX export
- Version history and restore

### 4. HAQ Manager (Launched November 2025)
- Handles Health Authority Questions during post-submission regulatory review
- Automatically extracts and tracks incoming questions from FDA and EMA
- Generates draft responses based on source documentation and historical regulatory interactions
- Consolidates responses across teams
- Developed in collaboration with Takeda

---

## Editor Capabilities (What Is Publicly Documented)

### What Weave says their editor does:
- **Unified Editor** (April 2025 release): Seamless switching between template view and content view
- **AI content generation**: Generate entire documents or focus on individual sections
- **Insert modes**: Insert new content beneath existing text or replace existing text
- **Table generation**: AI generates structured tables from source data
- **Figure insertion**: Insert figures from uploaded source files
- **Precision editing tools**: Fine-tune details (exact capabilities not publicly specified)
- **Template and content views**: Dual-mode editing
- **Prompt blocks**: Logic allowing prompts to run across all source files collectively or individually

### What is NOT publicly documented about their editor:
- Whether it is a rich-text editor, block editor, or structured XML editor
- Specific keyboard shortcuts
- Inline AI suggestions (vs. batch generation)
- Table editing UX (manual cell editing, formulas, drag-resize)
- Find-and-replace capabilities
- Undo/redo depth
- Formatting toolbar specifics
- Whether the editor is custom-built or based on an existing framework (ProseMirror, TipTap, Slate, etc.)

---

## AI Capabilities (Verified)

- **AI model**: GPT-4-turbo (confirmed in the Takeda study, release 2024-10)
- **Document extraction**: AWS Textract for PDF source document processing
- **Style guide adherence**: AI customized to match company-specific style guides (demonstrated with Takeda)
- **Source linking**: Sentence-level tracing back to origin documents
- **Automated data verification**: Content checked against source data
- **AI-powered updates**: When source data changes, AI helps propagate changes across affected pages
- **Prompt-based generation**: Users instruct AI with parameters; AI generates tables, figures, and narrative sections
- **General-purpose template**: Can generate structured documents beyond eCTD framework (April 2025 addition)

### What is NOT publicly documented about AI:
- Whether there is inline/autocomplete-style AI assistance (vs. batch generation only)
- Whether multiple AI models are supported or just GPT-4
- Latency/response time for generation
- Token limits or document size constraints
- Whether AI can do iterative refinement in-context or requires full regeneration

---

## Collaboration Features (Verified)

- **Real-time multi-user editing**: Multiple people edit simultaneously
- **Change tracking**: Tracks who changed what
- **Comments**: Comments stay side-by-side with context
- **Redline suggestions**: Redline capability mentioned alongside comments
- **Shared workspace**: Teams collaborate in a single shared environment
- **Section status tracking**: Track progress across document sections

### What is NOT publicly documented:
- Whether track changes follows the Word-style accept/reject model
- Granularity of change tracking (character-level, block-level, section-level)
- Comment threading or resolution workflows
- Permissions model (who can edit vs. comment vs. view)
- Offline editing support
- Conflict resolution for simultaneous edits

---

## Template System (Verified)

- **eCTD-formatted templates**: Pre-built templates aligned to eCTD structure
- **AI Template Engine**: Templates with variables and prompt blocks
- **Prompt block logic**: Prompts can run across all source files collectively or individually per file
- **General-purpose template**: For structured documents outside eCTD (added April 2025)
- **Context preservation**: Variables maintain context across iterations

### What is NOT publicly documented:
- Total number of templates available
- Whether users can create custom templates from scratch
- Template versioning
- Whether templates cover all CTD modules or only specific ones
- Template marketplace or sharing

---

## Export and Integration (Verified)

- **DOCX export**: Confirmed
- **Built-in eCTD**: eCTD formatting and packaging (extent of eCTD compliance not detailed)
- **Veeva integration**: Bi-directional import/export with Veeva Vault; auto-update/resync feature; document classification and tagging for Veeva workflows
- **PDF import**: Source documents ingested as PDFs via AWS Textract

### What is NOT publicly documented:
- Whether PDF export is supported
- Whether eCTD XML backbone generation is included or just content formatting
- Integration with other regulatory submission tools (e.g., LORENZ docuBridge, EXTEDO, GlobalSubmit)
- API availability for custom integrations
- Whether they produce submission-ready eCTD packages or just eCTD-structured content

---

## Data Room (Verified)

- **Central repository**: Single smart repository for all source files
- **AI-extracted metadata**: Automatic metadata extraction from uploaded documents
- **Semantic search**: AI-powered search across source files
- **Import existing structures**: Can import pre-organized file structures
- **Direct connection to drafting**: Traceable flow between source files and submission documents
- **Document classification**: AI classifies source documents into relevant IND sections

---

## Version Control (Verified)

- **Version history**: Maintained for documents
- **Version restore**: Can restore previous versions
- **Change tracking**: Who changed what is tracked

### What is NOT publicly documented:
- Granularity of versioning (auto-save vs. manual checkpoints)
- Diff view between versions
- Branching or parallel version support
- Version comparison tools

---

## Security and Compliance (Verified)

- **Infrastructure**: AWS
- **Zero data retention**: AI models do not train on customer data
- **SOC 2**: Listed as "launching Q1 2026" (not confirmed as obtained)
- **MFA**: Multi-factor authentication supported
- **SSO**: Single sign-on supported
- **Role-based permissions**: Confirmed
- **End-to-end encryption**: Confirmed
- **VPC deployment**: Platform operates inside VPC on AWS (confirmed in Takeda study)

### What is NOT publicly documented:
- 21 CFR Part 11 compliance (not mentioned anywhere)
- HIPAA compliance status
- Audit trail capabilities (beyond change tracking)
- Electronic signature support
- Data residency options (US-only? EU?)
- Penetration testing or security audit reports

---

## Validated Performance (From Published Research)

The Takeda study (arXiv:2509.09738) provides the most concrete public evidence:

- **Task**: IND nonclinical written summaries (eCTD Modules 2.6.2, 2.6.4, 2.6.6)
- **Source data**: IND 1 = 61 source files (18,870 pages); IND 2 = 58 files (11,425 pages)
- **Time savings**: ~100 hours reduced to 2.6-3.7 hours (97% reduction)
- **Quality**: No critical regulatory errors found by independent QC (reviewer with 6+ years experience)
- **Quality dimensions assessed**: Correctness, Completeness, Consistency, Redundancy, Conciseness, Clarity, Emphasis
- **AI model used**: GPT-4-turbo (release 2024-10)
- **Ethics**: Adhered to WHO 2023 ethical AI principles and GAMP 5 guidelines

**Important caveats**:
- Study was co-funded by Weave and Takeda (no independent third-party funding)
- Limited to nonclinical summaries (3 specific sections), not full IND
- Quality assessment was done by a single reviewer
- Study scope was preclinical IND, not clinical or post-market submissions

---

## Review Site Presence

- **G2**: No listing found for Weave Bio (the regulatory platform). G2 listings for "Weave" are for Weave Communications (dental/healthcare practice management), a completely different company.
- **Capterra**: Same situation. Capterra listings for "Weave" are for unrelated products.
- **No independent user reviews** are publicly available for Weave Bio's regulatory platform as of this date.

---

## Public Demos and Videos

- **No YouTube demos found** in public search
- Weave.bio website contains embedded product videos (not publicly accessible via direct URL)
- Webinars available on their site (e.g., HAQ Manager introduction), likely gated behind registration
- Product demos available by scheduling through their website

---

## Pricing

- **Not publicly available**. Enterprise SaaS model with what appears to be tiered offerings.
- Website mentions solutions for: Biotech, Pharma, CROs, and Regulatory Consultants
- White-label collaborative platform option mentioned for CROs/consultants

---

## What Weave Bio Is NOT (Based on Public Evidence)

To be fair and accurate, here is what Weave Bio does NOT appear to be:

1. **Not a general-purpose document editor** — It is a regulatory-specific authoring platform. It does not compete with Google Docs or Microsoft Word for general writing.
2. **Not a full eCTD publishing tool** (unclear) — While "built-in eCTD" is mentioned, it is not clear whether they produce fully validated eCTD submission packages or just eCTD-structured content that needs to go through a publishing tool.
3. **Not a document management system** — They integrate with Veeva Vault for DMS needs.
4. **Not yet broadly adopted** — 42 employees, ~$36M raised, key validation with one pharma partner (Takeda) and one CRO partner (Parexel). Still early-stage by enterprise software standards.
5. **Not multi-agency beyond FDA/EMA** — Future plans mention Japan and Latin America, but current coverage appears FDA and EMA focused.

---

## Summary: Verified Capabilities at a Glance

| Feature Area | Status | Confidence |
|---|---|---|
| AI-powered draft generation | Verified (Takeda study) | High |
| eCTD-formatted templates | Verified (marketing + study) | High |
| Multi-user real-time editing | Claimed (marketing copy) | Medium |
| Track changes | Claimed (marketing copy) | Medium |
| Comments and redlines | Claimed (marketing copy) | Medium |
| DOCX export | Verified (multiple sources) | High |
| Veeva integration | Verified (dedicated feature page) | High |
| Sentence-level source tracing | Claimed (marketing copy) | Medium |
| Semantic search in Data Room | Claimed (marketing copy) | Medium |
| HAQ response management | Verified (press release + Takeda) | High |
| SOC 2 certification | Planned Q1 2026, not confirmed obtained | Low |
| 21 CFR Part 11 | Not mentioned anywhere | None |
| Table/figure generation | Verified (Takeda study) | High |
| Version history/restore | Claimed (marketing copy) | Medium |
| General-purpose templates | Claimed (April 2025 release notes) | Medium |

**Confidence key**:
- **High** = Confirmed by published study, press release with named partner, or multiple independent sources
- **Medium** = Stated in company marketing materials but not independently verified
- **Low** = Mentioned as planned/forthcoming
- **None** = No public evidence found

---

## Sources

- [Weave Bio Homepage](https://www.weave.bio/)
- [Weave Bio Platform Page](https://www.weave.bio/platform/)
- [Weave Bio Submission Builder](https://www.weave.bio/platform/platform-submission-builder/)
- [HAQ Manager Product Page](https://www.weave.bio/platform/platform-haq-manager/)
- [AutoIND April 2025 Release Notes](https://www.weave.bio/resources/autoind-april-2025-product-release-notes/)
- [Weave Bio Resources (Veeva Vault Integration)](https://www.weave.bio/resources/veeva-vault-integration-autoupdate-feature/)
- [Excedr: Weave Bio AI-Powered Regulatory Automation](https://www.excedr.com/blog/weave-bio-ai-powered-regulatory-automation-for-drug-development)
- [$20M Series A Announcement (BusinessWire)](https://www.businesswire.com/news/home/20251016053611/en/Weave-Bio-Secures-$20M-Series-A-Funding-to-Enhance-Its-AI-Native-Regulatory-Platform)
- [HAQ Manager Launch (BusinessWire)](https://www.businesswire.com/news/home/20251106110323/en/Weave-Bio-Launches-HAQ-Manager-Extending-AI-Native-Regulatory-Automation-into-Critical-Review-Phase)
- [Parexel Partnership Announcement](https://newsroom.parexel.com/news-releases/news-release-details/parexel-announces-ai-partnership-weave-bio-accelerate-regulatory/)
- [Human-AI Collaboration Study (arXiv:2509.09738)](https://www.arxiv.org/pdf/2509.09738)
- [Strategic Advisory Board (PharmiWeb)](https://www.pharmiweb.com/press-release/2026-03-25/weave-bio-establishes-inaugural-strategic-advisory-board-to-shape-the-future-of-ai-driven-regulatory)
- [Innovation Endeavors Investment Blog](https://www.innovationendeavors.com/insights/our-investment-in-weave-bio-using-ai-to-alleviate-regulatory-friction-in-drug-development)
- [Tracxn Company Profile](https://tracxn.com/d/companies/weave/__wq2qZ4RE5NKgizafsWHg-6LSiwWtPBaIE0gfe-aMbmw)
