# Weave Bio -- Comprehensive Feature & Product Analysis

**Date**: 2026-03-28 (updated)
**Previous version**: 2026-03-27
**Subject**: Competitive intelligence report on www.weave.bio

---

## 1. Company Overview

| Field | Detail |
|---|---|
| **Full Name** | Weave Bio |
| **Founded** | 2022 |
| **HQ** | San Francisco, CA |
| **Founders** | Shlomo Klapper, Ari Caroline, Umut Eser |
| **Current Leadership** | Brandon Rice (CEO/Co-founder), Umut Eser (CTO), Lindsay Mateo (CCO) |
| **Positioning** | "AI-Native Platform for Regulatory Workflows" |
| **Total Funding** | $36M ($10M Seed May 2024 + $20M Series A Oct 2025) |
| **Lead Investors** | USVP (Series A lead), Innovation Endeavors, Magnetic Ventures, Character, TMV, Serrado Capital |
| **Awards** | "BioTech AI Innovation of the Year" 2024 (BioTech Breakthrough) |
| **Employee Count** | Not publicly disclosed (startup stage) |

---

## 2. Target Customers

Weave Bio targets four segments:

1. **Large Pharmaceutical Companies** -- Takeda is the flagship customer/design partner
2. **Biotech Firms** -- Small/mid-stage biotechs where operational efficiency is survival-critical
3. **CROs (Contract Research Organizations)** -- Parexel is the exclusive CRO partner (with exclusivity period on new products)
4. **Regulatory Consultants** -- Independent regulatory affairs professionals

---

## 3. Product Suite

### 3.1 AutoIND (Flagship Product)

The original and core product. Automates Investigational New Drug (IND) application preparation.

**Capabilities:**
- Automatic drafting of IND sections based on user-uploaded source data
- AI generates tables, figures, and entire narrative sections from source files
- Covers eCTD Modules 1 (including Investigator's Brochure), 2, 3, and 5
- Validated specifically for nonclinical written summaries: Modules 2.6.2, 2.6.4, 2.6.6
- In-platform content templates with customizable rules
- Automatic classification of uploaded source files
- AI augmentation to refine and review generated content
- Alerts users when new data conflicts with initial source content
- General-purpose template for documents beyond standard eCTD framework

**AI Template Engine (April 2025 Update):**
- Unified Editor: seamless switching between template view and content view
- Generate entire document or focus on individual sections
- Insert new content beneath or in place of existing text
- Prompt blocks can run across all source files collectively or individually per file
- Customizable AI templates with variables that maintain context across iterations

**Validated Performance (Takeda Pilot):**
- 97% time reduction in initial drafting (100 hours down to 2.6--3.7 hours)
- Processed 18,870 pages across 61 source documents
- No critical regulatory errors detected in AI-generated drafts
- Reviewers spent more time on strategic decisions, less on formatting/cross-referencing

### 3.2 Data Room

Centralized document repository with intelligence layer.

**Capabilities:**
- Single smart repository for all source files
- AI-extracted metadata from uploaded documents
- Semantic "Deep Search" with AI-generated relevance scoring
- Import existing folder/file structures (preserves structure on upload)
- Direct connection to drafting workflows
- Traceable flow between source files and submission documents
- Smart extraction pulls key data points from hundreds of source files automatically
- In-context file preview directly in the Data Room
- **"Ask" tab** (formerly "Explore"): natural-language Q&A against your data room
  - Multiple saved questions
  - Editable queries
  - Referenced responses with citations
  - File downloads from answers
  - Useful for answering Health Authority Questions or internal queries

### 3.3 Dossier Manager

Integrated regulatory dossier lifecycle management.

**Capabilities:**
- Sections tied to underlying source data
- Automatic surfacing of where changes are needed when data updates
- Authors and reviewers work in one connected space
- Clarity and control over review cycles
- Audit readiness tracking at every stage
- Integrated with Data Room and drafting environment

### 3.4 Submission Builder (Launched January 2026)

Structured workspace for assembling submission-ready content.

**Capabilities:**
- Automated submission formatting
- Table and figure handling
- Citation management: intra-document, inter-document, and literature references
- Cross-reference maintenance (kept current automatically)
- Sentence-level source tracing (every claim traced back to origin)
- Automated data verification
- Section status tracking
- Built-in eCTD structure compliance
- Version history with restore capability
- DOCX export
- Live collaboration with comments, context, and redline suggestions side-by-side

### 3.5 AutoCT (Clinical-Stage Submissions)

Extends Weave's AI workbench from preclinical (AutoIND) into clinical development.

**Supported Document Types:**
- Clinical Study Reports (CSRs) -- including pivotal CSRs from one workspace
- Protocols -- generate complete protocol from synopsis, no specific input format required
- Safety Narratives / Safety Reports
- Investigator's Brochures (IBs)
- Integrated Summary of Safety (ISS) / Integrated Summary of Efficacy (ISE)

**Capabilities:**
- AI-generated first drafts in minutes, starting from primary sources (protocols, TLFs)
- AI-assisted sentence-level content refinement for scientific narratives
- Source-linked review: sentence-level traceability back to source documents (two-click traceability)
- Protocol generation directly from synopsis
- AI-driven templates for rapid submission creation
- Automated checks to reduce errors
- Effortless updates when source data changes

**Key Claim:** "Reduces document prep from days to minutes."

### 3.6 HAQ Manager (Launched November 2025)

Post-submission Health Authority Question response management.

**Capabilities:**
- Automated extraction of incoming HAQs from FDA, EMA, and other agencies
- Tracking and management of all questions in structured workflow
- AI-generated draft responses based on:
  - Relevant source documents
  - Prior submissions
  - Historical regulatory interactions
- Version control on all responses
- Progress tracking across questions
- Cross-functional team consolidation for final submission
- Real-time collaboration across regulatory, operational, and scientific teams
- Developed in collaboration with Takeda Pharmaceuticals

---

## 4. Core AI Capabilities

| Capability | Description |
|---|---|
| **AI-Powered Authoring** | Generates tables, figures, and full narrative sections from source data |
| **Source Linking** | Every claim, table, and figure connects directly back to its source document at the sentence level |
| **Inconsistency Detection** | AI flags inconsistencies across documents and sections |
| **Insight Surfacing** | AI proactively surfaces relevant data points during authoring |
| **Smart Extraction** | Pulls key data points from hundreds of source files automatically |
| **Semantic Search** | AI-powered search across Data Room content |
| **Metadata Extraction** | Automatic classification and metadata extraction from uploaded files |
| **Conflict Alerts** | Alerts when new data conflicts with content already generated from initial sources |
| **AI Template Engine** | Customizable prompt-based templates with variables; maintains context across iterations |
| **HAQ Response Generation** | Draft answers to health authority questions from prior submissions and source docs |
| **Review Augmentation** | AI reviews and refines generated content; surfaces issues for human decision |

**Key Design Principle:** Human-in-the-loop -- "The AI surfaces insights, flags inconsistencies and surfaces data, but the user is the expert making every critical decision."

---

## 5. Regulatory Workflows Supported

### Currently Supported:
- **IND (Investigational New Drug)** -- Core product, fully operational
- **Health Authority Questions (HAQ/RTQ)** -- Post-submission response management
- **Preclinical IND preparation** -- Widely adopted use case

### eCTD Modules Covered:
- Module 1 (Administrative, including Investigator's Brochure)
- Module 2 (Summaries -- specifically 2.6.2, 2.6.4, 2.6.6 validated)
- Module 3 (Quality/CMC)
- Module 5 (Clinical Study Reports)

### AutoCT (Clinical-Stage -- Launched/Expanding):
- **CSR (Clinical Study Reports)** -- AI-generated first drafts from protocols and TLFs
- **Protocols** -- Generate complete protocol documents from synopsis
- **Safety Reports / Safety Narratives** -- Clinical safety documents
- **Investigator's Brochures (IBs)** -- Clinical-stage IB updates
- **ISS/ISE (Integrated Summary of Safety/Efficacy)** -- Polished integrated summaries

### On Roadmap (Not Yet Launched):
- **NDA (New Drug Application)** -- Planned expansion
- **BLA (Biologics License Application)** -- Planned expansion
- **Post-market filings** -- Planned expansion
- **Diagnostics & medical devices** -- Hinted at by leadership

### Regulatory Agencies:
- **FDA** -- Primary focus, operational
- **EMA** -- Referenced as supported/expanding
- **Global standards** -- Compliance with international regulatory standards
- **Japan (PMDA)** -- On roadmap
- **Latin America** -- On roadmap
- **Europe** -- On roadmap for deeper coverage

---

## 6. Document Types Generated

**Preclinical (AutoIND):**
- IND application sections (full eCTD-formatted)
- Nonclinical written summaries (Modules 2.6.2, 2.6.4, 2.6.6)
- Investigator's Brochure (IB) sections
- Quality/CMC documentation (Module 3)

**Clinical (AutoCT):**
- Clinical Study Reports (CSRs) -- including pivotal CSRs
- Protocols -- from synopsis to complete document
- Safety Reports and Safety Narratives
- Integrated Summary of Safety (ISS)
- Integrated Summary of Efficacy (ISE)
- Clinical Study Report sections (Module 5)

**Post-Submission:**
- HAQ response documents

**General:**
- General-purpose structured documents (via flexible template engine beyond eCTD)
- Tables and figures from source data

---

## 7. Collaboration & Workflow Features

- Live multi-user collaboration in shared workspace
- Comments, context, and redline suggestions side-by-side
- Review cycle management with status tracking
- Cross-functional team coordination (regulatory, scientific, operational)
- Version control and version history with restore
- Audit trail capturing every decision, edit, and data update
- DOCX export for external distribution

---

## 8. Integrations & Technical Details

- **Cloud-based** SaaS platform
- **eCTD-native** formatting built in
- **DOCX export** for offline/external use
- **Veeva Integration** -- Import and export between Weave and Veeva with ease; resync to automatically update source files
- **AWS infrastructure** -- Zero data retention policy, enterprise security controls
- **Folder upload** -- Preserves existing folder structures on import
- No public API documentation found
- Parexel integration as exclusive CRO partner suggests enterprise integration capability

---

## 9. Pricing & Packaging

**No public pricing disclosed.** Enterprise sales model with demo/contact required.

Messaging suggests tiered approach:
- Startup/biotech tier (efficiency for small teams)
- Enterprise tier (multi-program workflows, advanced integration and management)
- CRO/consultant tier (client management, multi-client workflows)

---

## 10. Key Partnerships & Validation

### Takeda Pharmaceuticals
- Design partner for HAQ Manager
- Published peer-reviewed study: "Human-AI Collaboration Increases Efficiency in Regulatory Writing" (arXiv)
- 97% time savings validated in controlled pilot
- Andrew Robertson (VP, Head of Global Regulatory Policy & Innovation) sits on SAB

### Parexel
- Exclusive CRO partner (exclusivity period on new product launches)
- CRO design partner contributing regulatory consulting expertise across clinical, non-clinical, clinical pharmacology, and CMC
- 50% faster IND completion using AutoIND
- Joint enhancement of Weave's AI platform and product pipeline

### Strategic Advisory Board (Formed March 2026)
- **Andrew Robertson** -- VP, Head of Global Regulatory Policy & Innovation, Takeda
- **Vada Perkins** -- VP, Global Head of Regulatory Intelligence and Policy, Boehringer Ingelheim
- **Chris Lee** -- VP, Regulatory Affairs Innovation and Strategic Operations, Gilead
- **Russ Altman** -- Professor of Bioengineering/Genetics/Medicine, Stanford; Senior Fellow, Stanford HAI

---

## 11. Competitive Positioning Summary

**What Weave Bio IS:**
- An AI-native regulatory authoring and submission preparation platform
- Focused on the document creation/management layer of regulatory workflows
- IND-first, expanding to NDA/BLA
- Human-in-the-loop AI with source traceability
- Strong pharma validation (Takeda, Parexel)
- Well-funded Series A startup ($36M total)

**What Weave Bio is NOT (based on available information):**
- Not a full regulatory intelligence platform (no signal detection, no regulatory change monitoring)
- No real-time regulatory intelligence feeds or monitoring capabilities disclosed
- No predictive analytics or risk scoring engine disclosed
- No compliance scanning / gap analysis capabilities disclosed
- No multi-agency comparison or regulatory strategy recommendation engine
- No mention of chat-first AI assistant or conversational interface (their AI is embedded in templates/editor, not conversational)
- No dedicated project management dashboard or task management system -- workflow is document-centric, not task-centric
- No readiness scoring or submission risk assessment
- No cross-document consistency analysis beyond basic inconsistency flagging
- No learning loop or pattern registry (accumulated regulatory judgment over time)
- No CSR deep extraction / knowledge building (AutoCT generates CSRs but does not extract intelligence from existing CSRs)
- No biostatistics / SAP capabilities
- No device or diagnostics regulatory support yet
- No multi-agency strategy comparison (e.g., "FDA vs EMA approach")

---

## 12. Key Differentiators Weave Claims

1. "AI-native" -- built from ground up with AI, not bolted on
2. eCTD-formatted output from the start (not converted post-authoring)
3. Source traceability at sentence level
4. Unified platform (data room + authoring + review + submission in one)
5. Validated 97% time savings in peer-reviewed study
6. Major pharma validation (Takeda, Parexel)
7. HAQ response automation (relatively unique capability)

---

## Sources

- [Weave Bio Homepage](https://www.weave.bio/)
- [Weave Bio Platform Page](https://www.weave.bio/platform/)
- [Weave Bio Submission Builder](https://www.weave.bio/platform/platform-submission-builder/)
- [Weave Bio HAQ Manager](https://www.weave.bio/platform/platform-haq-manager/)
- [Weave Bio About / Team](https://www.weave.bio/about-us/our-team)
- [Series A Announcement (BusinessWire)](https://www.businesswire.com/news/home/20251016053611/en/Weave-Bio-Secures-$20M-Series-A-Funding-to-Enhance-Its-AI-Native-Regulatory-Platform)
- [HAQ Manager Launch (BusinessWire)](https://www.businesswire.com/news/home/20251106110323/en/Weave-Bio-Launches-HAQ-Manager-Extending-AI-Native-Regulatory-Automation-into-Critical-Review-Phase)
- [Parexel Partnership (Parexel Newsroom)](https://newsroom.parexel.com/news-releases/news-release-details/parexel-announces-ai-partnership-weave-bio-accelerate-regulatory/)
- [SAB Announcement (BusinessWire)](https://www.businesswire.com/news/home/20260325527928/en/Weave-Bio-Establishes-Inaugural-Strategic-Advisory-Board-to-Shape-the-Future-of-AI-Driven-Regulatory-Science)
- [Excedr Deep Dive](https://www.excedr.com/blog/weave-bio-ai-powered-regulatory-automation-for-drug-development)
- [Innovation Endeavors Investment Thesis](https://www.innovationendeavors.com/insights/our-investment-in-weave-bio-using-ai-to-alleviate-regulatory-friction-in-drug-development)
- [AutoIND April 2025 Release Notes](https://www.weave.bio/resources/autoind-april-2025-product-release-notes/)
- [AutoCT Product Page (Webflow)](https://weave-bio.webflow.io/products/autoct)
- [RAPS Webcast: AutoCT](https://www.raps.org/events/sponsored-webcast-ai-for-your-clinical-program-submissions-autoct-from-weave)
- [Human-AI Collaboration Study (arXiv)](https://www.arxiv.org/pdf/2509.09738)
- [Built In SF: $20M Raise](https://www.builtinsf.com/articles/weave-bio-raises-20m-series-a-20251020)
- [HIT Consultant: HAQ Manager](https://hitconsultant.net/2025/11/06/weave-bio-launches-haq-manager-ai-automation-accelerates-health-authority-question-responses/)
- [Fierce Biotech Feature](https://www.fiercebiotech.com/sponsored/weaves-ai-platform-aims-revolutionize-regulatory-workflows-pharma)
- [SAB Announcement (PharmiWeb)](https://www.pharmiweb.com/press-release/2026-03-25/weave-bio-establishes-inaugural-strategic-advisory-board-to-shape-the-future-of-ai-driven-regulatory)
