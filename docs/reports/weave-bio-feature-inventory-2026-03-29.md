# Weave.bio Comprehensive Feature Inventory

> Research date: 2026-03-29, updated 2026-03-30
> Purpose: Competitive intelligence for Concept2Cure document system convergence sprint

---

## Company Overview

- **Founded**: 2022, San Francisco, CA
- **Funding**: $36M total ($10M seed May 2024, $20M Series A Oct 2025 led by USVP)
- **Positioning**: "AI-native platform for regulatory workflows" -- the only AI-native platform built to manage regulatory content across the entire lifecycle of a therapeutic candidate
- **Key Partners**: Takeda (validation partner), Parexel (CRO design partner), Boehringer Ingelheim, Gilead (SAB)
- **Recognition**: "Biotech AI Innovation of the Year" 2024
- **Security**: AWS infrastructure, OpenAI ZDR policy, AES-256 at rest, SSL/TLS in transit, SAML SSO, MFA, RBAC, 14-day rolling backups

---

## 1. Document Editor UI

### Editor Architecture
- **Unified Editor** (shipped April 2025): Allows seamless switching between **template view** and **content view** within a single editing surface
- Template view: Define structure, AI generation instructions, prompt blocks, and variables
- Content view: See and edit the generated output as rich formatted text
- The editor is **connected directly to the Data Room and Dossier Manager** -- every document stays aligned with source data, supporting evidence, and latest team inputs
- Not a standalone word processor -- it is deeply integrated with the data pipeline

### Editor Capabilities
- **Rich text editing** with structured sections, tables, and figures
- **Precision editing tools**: Fine-tune every detail -- adjust tone, refine arguments, polish content
- **Sentence-level source tracing**: Click on any sentence to view the exact source file and relevant keywords
- **Inline citations and cross-references**: Automated management of intra-document, inter-document, and literature references
- **Section status tracking**: Visual indicators per section showing completion/review state
- **Version history with restore**: Full version control with the ability to restore previous versions
- **Live, version-controlled record**: Captures each decision, edit, and data update as part of the audit trail

### What We Don't Know (Not Publicly Documented)
- Underlying editor technology (ProseMirror, Slate, Tiptap, or custom)
- Whether it is truly block-based (like Notion) or more traditional rich text (like Google Docs)
- Keyboard shortcut model
- Markdown support
- Inline AI command palette / slash commands

---

## 2. Collaboration Features

### Real-Time Co-Editing
- **Simultaneous multi-user editing**: Multiple people can edit at the same time
- **Change attribution**: Weave tracks who changed what -- no lost edits or version chaos
- **Global collaboration**: Teams across the globe work together in real time

### Comments & Suggestions
- **Inline comments**: Comments stay side-by-side with content in a shared workspace
- **Redline suggestions**: Track-changes style redlining alongside comments and context
- **Context preservation**: Comments, context, and redline suggestions are co-located so teams resolve faster

### Progress Tracking
- **Real-time progress tracking**: Teams see status of sections/documents
- **Easy sharing**: Built-in sharing mechanisms (not email/SharePoint dependent)
- **Centralized workspace**: Replaces email and SharePoint for regulatory collaboration

---

## 3. Template & Structure Features

### eCTD Template System
- **Built-in eCTD templates**: Pre-built templates aligned with ICH CTD structure
- **Module coverage**: Currently generates/refines content for Modules 1 (including Investigator's Brochure), 2, 3, and 5
- **Regulatory domain coverage**: Clinical, non-clinical, clinical pharmacology, CMC
- **General-purpose template** (April 2025): Allows generating structured documents beyond eCTD using any data in the Data Room
- **Custom templates**: Users can customize with unique rules and variables

### AI Template Engine
- **Prompt blocks**: Configurable AI generation instructions within templates
- **Variable population**: Templates populated with variables from source data, maintaining context across iterations
- **Flexible generation scope**: Generate entire document OR focus on individual sections
- **Insert modes**: New content can be inserted beneath or in place of existing text
- **Cross-file prompt logic**: Prompts can run across all source files collectively or on each file individually for more nuanced summaries
- **Iterative refinement**: Context maintained as teams iterate, so work improves over time without losing the thread

### Supported Submission Types
- **Currently live**: IND (Investigational New Drug) -- flagship via AutoIND
- **On roadmap**: NDA (New Drug Application), BLA (Biologics License Application), post-market filings
- **HAQ/RTQ**: Health Authority Questions / Requests to Queries (live as of Nov 2025)
- **Pre-IND**: Briefing packages for health authority meetings
- **Geographic expansion planned**: FDA (current), EMA, PMDA (Japan), Latin America

---

## 4. AI Writing Assistance Features

### Content Generation
- **Full section generation**: AI generates entire sections based on source data
- **Table generation**: Structured tables auto-generated from study data
- **Figure insertion**: Figures inserted from uploaded source files
- **Summary generation**: Summaries created from source files (collective or per-file)
- **Consistent voice**: AI writes in consistent voice, organization's style, with unvarying structure and level of detail

### Content Refinement
- **Tone adjustment**: Adjust the tone of generated content
- **Argument refinement**: Refine arguments and reasoning
- **Content polishing**: Polish content until it represents the therapeutic story
- **Iterative AI context**: AI maintains context from previous iterations

### Intelligence Features
- **Inconsistency detection**: AI surfaces insights and flags inconsistencies
- **Data surfacing**: AI surfaces relevant data from the Data Room
- **Automated data verification**: Content automatically checked against source data
- **Potential issue flagging**: Built-in checks catch issues early

### Anti-Hallucination
- **Source grounding**: Every generated claim linked to source documents
- **Sentence-level tracing**: Click any sentence to see origin
- **Biomedical concept linking**: Methods that link together biomedical concepts and faithfully reference source documents
- **Validated accuracy**: Independent QC found no critical AI-generated errors in Takeda pilot

### Performance Benchmarks
- **97% time savings**: 100 hours of manual drafting reduced to ~2.6-3.7 hours
- **Zero critical errors**: Independent QC assessment found no critical AI-generated regulatory errors
- **50% faster IND completion**: Parexel completing INDs 50% faster than traditional timelines
- **Single-day first draft**: Conventional 12-18 month IND prep reduced to first draft in one day

---

## 5. Version Control & Document Lifecycle

### Version Control
- **Consistent versioning**: All changes tracked with version history
- **Version restore**: Ability to restore previous versions
- **Live version-controlled record**: Every decision, edit, and data update captured
- **Audit trail**: Transparent bridge between automation and accountability -- every source citation, model-generated paragraph, and data linkage visible

### Document Lifecycle
- **Data organization** --> **Authoring** --> **Review** --> **Publishing** --> **Response management**
- Supports the full lifecycle from early development through market application and post-market updates
- Finalized submissions serve as trusted reference points for health authority responses

### Audit & Compliance
- **Regulatory professionals can see**: Every source citation, every model-generated paragraph, every data linkage
- **Edits flow back into traceable record**: Creating transparent bridge between automation and accountability
- **Rigorous traceability, auditability, and expert oversight** in AI-powered workflows

---

## 6. Compliance & Regulatory Features

### Source Traceability
- **Sentence-level source tracing**: Click any sentence to view exact source file and relevant keywords
- **Instant source linking**: Every claim, table, and figure connects directly back to its origin
- **Automated data verification**: Content checked against source data automatically

### Citation Management
- **Intra-document references**: Cross-references within the same document
- **Inter-document references**: Cross-references across documents in the dossier
- **Literature references**: External literature citations
- **Auto-updating**: Citations and cross-references kept current automatically

### Regulatory Standards Alignment
- **eCTD structure**: Grounded in eCTD format
- **FDA compliance**: Primary regulatory standard
- **EMA compliance**: Supported/expanding
- **Global standards**: Working toward PMDA, Health Canada, Latin America
- **Built-in compliance checks**: Issues caught early before review

### Formatting Automation
- **Submission formatting**: Automated to regulatory standards
- **Table/figure formatting**: Automated handling of structured data presentation

---

## 7. Data & Table Handling

### Data Room
- **Central repository**: One smart repository for all source files
- **AI-extracted metadata**: Automatic metadata extraction from uploaded files
- **Semantic search**: AI-powered semantic search with relevance scoring ("Deep search")
- **Folder upload with structure preservation**: Upload entire folders while preserving hierarchy
- **File preview in context**: Preview file content directly within the Data Room
- **Automatic source file classification**: Files classified automatically on import
- **Resync capability**: Automatically update source files

### Ask Tab (formerly "Explore")
- **Natural language questions**: Ask questions against your data
- **Multiple saved questions**: Save and manage multiple queries
- **Editable queries**: Refine questions over time
- **Referenced responses**: Answers include source references
- **File downloads**: Download relevant files from answers
- **HAQ response support**: Generate answers to Health Authority Questions from source data

### Table & Figure Generation
- **Structured table generation**: AI generates complex regulatory tables from source data
- **Figure insertion**: Figures pulled from source files and inserted into documents
- **Automated table/figure handling**: Formatting and placement automated
- **Source data connection**: Tables/figures linked to underlying data

### Smart Extraction
- **Automated data point extraction**: Key data points pulled from hundreds of source files automatically
- **Study report parsing**: No manual hunting through study reports
- **Organization**: Extracted data organized and made instantly accessible

---

## 8. Import/Export

### Import
- **Source file upload**: Upload study reports, CMC docs, scientific literature
- **Folder upload**: Upload entire folder structures with preserved hierarchy
- **Veeva import**: Import from Veeva with ease
- **Existing structure import**: Import existing organizational structures
- **Resync**: Automatically update imported source files

### Export
- **DOCX export**: Export documents in Word format
- **Veeva export**: Export back to Veeva
- **eCTD packaging**: Built-in eCTD structure for submission-ready output
- **Section status tracking export**: Track and package outputs

### What's NOT Mentioned
- Direct PDF export (likely handled through DOCX --> PDF workflow or eCTD publishing)
- XML export for eCTD v4.0
- Integration with dedicated eCTD publishing tools (LORENZ, Extedo, etc.)
- API access for programmatic integration

---

## 9. Section Management

### Dossier Manager
- **Centralized dossier structure**: All submission documents and supporting content in a structured workspace
- **Sections tied to data**: Each section linked to its underlying source data
- **Update surfacing**: When data changes, the system surfaces where content updates are needed
- **Connected workspace**: Authors and reviewers work in one connected space

### Section Operations
- **Section status tracking**: Visual tracking of each section's state (draft, review, complete, etc.)
- **Section-level generation**: Choose to generate content for individual sections rather than entire documents
- **Content insertion modes**: Insert new content beneath existing text or replace in place
- **Built-in eCTD structure**: Document sections mapped to eCTD modules and subsections

### Module Coverage
- **Module 1**: Administrative + Investigator's Brochure
- **Module 2**: Quality overall summary, nonclinical overview/summaries, clinical overview/summaries
- **Module 3**: Quality (CMC) data
- **Module 5**: Clinical study reports
- **Module 4**: Not explicitly mentioned (nonclinical study reports -- may be covered under "nonclinical" domain)

---

## 10. Review Workflows

### Review & Approval
- **Structured review workflow**: Built-in review process with defined stages
- **Streamlined approval workflows**: Eliminate back-and-forth chaos
- **Built-in quality checks**: Issues caught early before review
- **Audit readiness**: Clarity and control over review cycles at every stage

### Reviewer Experience
- **In-platform quality review**: Full review capability without leaving the platform
- **Inline comments**: Comment directly on content
- **Redline suggestions**: Track-changes style suggestions
- **Source verification**: Click any sentence to verify against source data
- **Side-by-side layout**: Comments, context, and redlines visible alongside content

### Review Intelligence
- **AI-assisted review**: AI flags inconsistencies and potential issues
- **Source traceability during review**: Reviewers can trace any claim to its origin
- **Automated data verification**: Content verified against source data during review
- **Shift from formatting to strategy**: Reviewers spend more time on strategic decisions, less on formatting/cross-referencing/proofreading

### What's NOT Mentioned
- Formal review assignment (assigning specific reviewers to specific sections)
- Review status workflows (submitted for review, reviewed, approved, rejected)
- Digital signatures for approval (21 CFR Part 11)
- Comment resolution workflows
- Review deadline/timeline management

---

## 11. HAQ Manager (Launched Nov 2025)

### Question Management
- **Automatic extraction**: Incoming agency questions automatically extracted from HAQ documents
- **Categorization**: Questions automatically categorized by type/topic
- **Tracking**: Questions tracked throughout the response lifecycle

### Response Drafting
- **AI-drafted responses**: Responses drafted using verified source data and historical regulatory context
- **Source-grounded**: Responses reference relevant source documentation
- **Historical context**: Leverages previous regulatory interactions for context
- **Cross-team consolidation**: Unifies contributions across regulatory, operational, and scientific functions

### Workflow
- **Real-time collaboration**: Teams collaborate on responses in real time
- **Version control**: Full versioning on response drafts
- **Alignment tracking**: Ensures alignment across functions
- **Multi-agency support**: Handles questions from FDA, EMA, and other authorities
- **Tight deadline management**: Built for extreme time pressure scenarios

---

## 12. Security, Privacy & Compliance (CONFIRMED -- from weave.bio/data-security-privacy/)

### Encryption & Data Protection
- **Encryption in transit**: SSL/TLS for all data in transit [CONFIRMED]
- **Encryption at rest**: AES-256 encryption for all data at rest [CONFIRMED]
- **Zero Data Retention (ZDR)**: Formal ZDR policy with OpenAI -- neither Weave nor OpenAI uses customer data for ML training [CONFIRMED]
- **Data segregation**: Logical partitioning ensures customer data remains separate (multi-tenant isolation) [CONFIRMED]

### Authentication & Access Control
- **Multi-factor authentication (MFA)**: Supported for all users [CONFIRMED]
- **SAML SSO**: Single sign-on with any SAML-compatible identity provider [CONFIRMED]
- **Username/password + MFA**: Alternative login method [CONFIRMED]
- **Role-based access controls (RBAC)**: Users have access only to their specific data [CONFIRMED]
- **Strict need-to-know access**: Internal access given only when required for product/customer operations [CONFIRMED]
- **Immediate access revocation**: Access removed immediately when no longer needed [CONFIRMED]

### Infrastructure
- **Cloud provider**: AWS [CONFIRMED]
- **LLM provider**: OpenAI (primary), AWS Bedrock (content extraction) [CONFIRMED]
- **Bedrock data handling**: AWS Bedrock does not retain any customer data [CONFIRMED]
- **Rolling backups**: 14-day rolling backup window [CONFIRMED]
- **Hot-standby databases**: Available for server outage recovery [CONFIRMED]

### Data Lifecycle
- **Data deletion on contract end**: Uploaded files and generated content deleted within 30 days of contract termination [CONFIRMED]
- **Explicit permission required**: Weave requests explicit permission before using customer data for any purpose beyond product operations [CONFIRMED]

### Authorized Users
- **Contracted customers**: Direct access to their data [CONFIRMED]
- **Partners on projects**: Working on unique projects in the system [CONFIRMED]
- **Approved consultants**: Provisioned at customer request [CONFIRMED]
- **Weave employees**: Only provisioned employees have access [CONFIRMED]

### What's NOT Publicly Confirmed
- SOC 2 Type II certification status (not mentioned on security page)
- ISO 27001 certification
- HIPAA compliance status
- 21 CFR Part 11 compliance (electronic signatures, audit trails)
- GDPR-specific data handling documentation
- Penetration testing / vulnerability assessment cadence
- Data residency options (e.g., EU-only hosting)
- BAA (Business Associate Agreement) availability

---

## 13. Integrations

### Confirmed Integrations
- **Veeva Vault**: Import from and export to Veeva [CONFIRMED]
- **OpenAI**: LLM provider for AI generation [CONFIRMED]
- **AWS Bedrock**: Content extraction from uploaded files [CONFIRMED]
- **SAML identity providers**: SSO integration with corporate IdPs [CONFIRMED]

### What's NOT Publicly Confirmed
- Public API or developer SDK
- Webhook/event system
- Integration with eCTD publishing tools (LORENZ, Extedo, Celegence)
- EHR/EDC system integration
- CTMS (Clinical Trial Management System) integration
- Statistical software integration (SAS, R)
- SharePoint/OneDrive integration
- Slack/Teams notifications
- JIRA/project management integration

---

## 14. Platform Architecture Summary

```
The Weave Platform
|
+-- Data Room
|   +-- Source file repository
|   +-- AI-extracted metadata
|   +-- Semantic search (Deep search)
|   +-- Ask tab (natural language queries)
|   +-- Folder upload with structure preservation
|   +-- File preview
|   +-- Veeva import/resync
|
+-- AI Template Engine
|   +-- eCTD templates (Module 1, 2, 3, 5)
|   +-- General-purpose templates
|   +-- Prompt blocks with cross-file logic
|   +-- Variable-based population
|   +-- Unified Editor (template + content views)
|
+-- Unified Editor
|   +-- Rich text editing
|   +-- Precision editing (tone, arguments, polish)
|   +-- Sentence-level source tracing
|   +-- Citation management (intra/inter/literature)
|   +-- Section status tracking
|   +-- Version history/restore
|   +-- DOCX export
|
+-- Dossier Manager
|   +-- Structured document hierarchy (eCTD)
|   +-- Section-to-data linkage
|   +-- Update propagation surfacing
|   +-- Connected authoring workspace
|
+-- Submission Builder
|   +-- eCTD submission assembly
|   +-- Formatting automation
|   +-- Table/figure handling
|   +-- Cross-reference management
|   +-- Compliance checks
|
+-- HAQ Manager
|   +-- Question extraction & categorization
|   +-- AI response drafting
|   +-- Cross-team consolidation
|   +-- Multi-agency support
|
+-- Collaboration Layer
|   +-- Real-time co-editing
|   +-- Change attribution
|   +-- Inline comments
|   +-- Redline suggestions
|   +-- Approval workflows
|   +-- Progress tracking
|
+-- Security & Infrastructure
|   +-- AWS cloud hosting
|   +-- AES-256 at rest / SSL/TLS in transit
|   +-- OpenAI ZDR (zero data retention)
|   +-- SAML SSO + MFA + RBAC
|   +-- Logical tenant isolation
|   +-- 14-day rolling backups + hot standby
|
+-- Integrations
    +-- Veeva Vault import/export
    +-- OpenAI (LLM)
    +-- AWS Bedrock (extraction)
    +-- SAML identity providers
```

---

## 13. Competitive Positioning vs. Concept2Cure

### What Weave Does That We Should Match or Exceed

| Weave Capability | Concept2Cure Status | Gap? |
|---|---|---|
| Sentence-level source tracing | Not implemented | YES -- key differentiator |
| AI generates entire sections from source data | Partial (AI authoring exists) | MODERATE -- need source-grounded generation |
| Unified template + content view toggle | Not implemented | YES -- powerful UX pattern |
| Data Room with semantic search | Partial (document ingestion exists) | MODERATE |
| Click-to-verify any sentence | Not implemented | YES -- trust feature |
| Real-time co-editing | Not implemented | YES -- but lower priority for MVP |
| Automated citation management (intra/inter/lit) | Partial | MODERATE |
| Section status tracking in dossier | Partial (section workspace exists) | MODERATE |
| eCTD module mapping | Partial (CSR builder exists) | MODERATE |
| DOCX export | Not confirmed | CHECK |
| Veeva integration | Not implemented | LOW priority |
| HAQ Manager | Not implemented | FUTURE -- strong differentiator for them |
| AI precision editing (tone, refine, polish) | Partial (AI rewrite exists) | MODERATE |
| Version history with restore | Partial | CHECK |
| Structured approval workflows | Partial | MODERATE |

### Where Concept2Cure Can Be Superior (Per Sprint Directives)

1. **Biostatistics intelligence** -- Weave does not mention statistical analysis capabilities
2. **Regulatory precedent engine** -- RIM intelligence layer has no Weave equivalent
3. **Device regulatory** -- Weave focuses on pharma/biotech, not medical devices
4. **Multi-agency comparison** -- Weave is expanding geographically but doesn't emphasize cross-agency analysis
5. **Conversational-first UX** -- Weave is editor-first; our chat-first approach is differentiated
6. **Regulatory intelligence (RIM)** -- Compounding judgment, pattern recognition, signal capture -- nothing like this at Weave
7. **CORTEX Prime knowledge atoms** -- Deeper knowledge management than Weave's Data Room
8. **Foresight predictive analytics** -- No predictive analytics mentioned at Weave

---

## Sources

- [Weave Bio Homepage](https://www.weave.bio/)
- [Weave Platform Page](https://www.weave.bio/platform/)
- [Weave Submission Builder](https://www.weave.bio/platform/platform-submission-builder/)
- [Weave HAQ Manager](https://www.weave.bio/platform/platform-haq-manager/)
- [AutoIND April 2025 Release Notes](https://www.weave.bio/resources/autoind-april-2025-product-release-notes/)
- [Excedr: Weave Bio AI-Powered Regulatory Automation](https://www.excedr.com/blog/weave-bio-ai-powered-regulatory-automation-for-drug-development)
- [BusinessWire: $20M Series A](https://www.businesswire.com/news/home/20251016053611/en/Weave-Bio-Secures-20M-Series-A-Funding-to-Enhance-Its-AI-Native-Regulatory-Platform)
- [BusinessWire: HAQ Manager Launch](https://www.businesswire.com/news/home/20251106110323/en/Weave-Bio-Launches-HAQ-Manager-Extending-AI-Native-Regulatory-Automation-into-Critical-Review-Phase)
- [Innovation Endeavors Investment Thesis](https://www.innovationendeavors.com/insights/our-investment-in-weave-bio-using-ai-to-alleviate-regulatory-friction-in-drug-development)
- [HIT Consultant: Weave Bio Launch](https://hitconsultant.net/2024/05/30/weave-bio-launches-for-ai-powered-drug-development-secures-10m/)
- [HIT Consultant: HAQ Manager](https://hitconsultant.net/2025/11/06/weave-bio-launches-haq-manager-ai-automation-accelerates-health-authority-question-responses/)
- [Fierce Biotech: Weave AI Platform](https://www.fiercebiotech.com/sponsored/weaves-ai-platform-aims-revolutionize-regulatory-workflows-pharma)
- [Built In SF: $20M Raise](https://www.builtinsf.com/articles/weave-bio-raises-20m-series-a-20251020)
- [PharmiWeb: Strategic Advisory Board](https://www.pharmiweb.com/press-release/2026-03-25/weave-bio-establishes-inaugural-strategic-advisory-board-to-shape-the-future-of-ai-driven-regulatory)
- [Parexel Partnership](https://newsroom.parexel.com/news-releases/news-release-details/parexel-announces-ai-partnership-weave-bio-accelerate-regulatory/)
- [Weave Bio Webflow (legacy site)](https://weave-bio.webflow.io/)
- [Weave Bio Solutions](https://weave-bio.webflow.io/solutions)
- [HLTH: HAQ Manager with Takeda](https://hlth.com/insights/news/weave-bio-launches-haq-manager-with-takeda-to-extend-ai-automation-into-regulatory-review-2025-11-07)
- [Weave Bio Data Security & Privacy](https://www.weave.bio/data-security-privacy/) -- security/privacy details (2026-03-30 research)
- [Weave RFP Checklist & Platform Overview PDF](https://23328296.fs1.hubspotusercontent-na1.net/hubfs/23328296/Website%20Files/Weave%20RFP%20Checklist%20&%20Platform%20Overview_July2025.pdf) -- detailed capability checklist (403'd, title confirmed)
- [Weave RFP Checklist Landing Page](https://www.weave.bio/resources/weave-rfp-checklist-platform-overview/)
- [Weave Submission Builder (alternate URL)](https://www.weave.bio/platform/submission-builder/)
- [DIP-AI: Best Regulatory Writing Automation Tools 2025](https://www.dip-ai.com/use-cases/en/the-best-regulatory-writing-automation) -- competitive landscape
