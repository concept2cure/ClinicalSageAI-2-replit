# Competitive Analysis: Artos AI

> Research date: 2026-03-30 (updated)
> Previous research: 2026-03-29
> Source: Public website (artosai.com), YC profile, DIA marketplace listing, blog posts, third-party coverage, web searches

---

## 1. Company Overview

- **Name**: Artos AI (artosai.com)
- **Founded**: 2023, San Francisco, CA
- **Founders**: Josh Kim (CEO) and Varun Patel (CTO) -- met at University of Chicago
- **Backing**: Y Combinator W24, Pioneer Fund
- **Funding**: $500K pre-seed
- **Stage**: Seed / early-stage
- **Competitors**: Weave Bio, Ritivel, X Doc (Artos ranks 3rd among 5 active competitors by funding)
- **Deployment speed**: Claims deployment in a large organization in under 7 days, value realization within 2 weeks

### Conference Presence (2024-2025)

- RAPS Regulatory Strategy 2024
- AMWA Medical Writing and Communication Conference 2024
- DIA SIDM Forum (Regulatory Submissions, Information and Document Management)
- DIA 2025 (exhibitor)
- RAPS EDTS 2025
- RAPS Convergence 2025 (Pittsburgh) -- Mihikaa Jain speaking at full-day preconference workshop on "Harnessing AI for Regulatory Excellence"

### Target Market

- Large Pharma/Biotech
- Medium Pharma/Biotech
- Small Pharma/Biotech
- CRO / Medical Writing Firms

### Teams Served

- Medical Writing
- CMC (Chemistry, Manufacturing, and Controls)
- Regulatory Affairs
- Regulatory Intelligence
- IT / Engineering

---

## 2. Document Editor UI

### What We Know

Artos does NOT appear to be a traditional rich-text or block-based editor like Google Docs or Notion. Instead, it is a **structured document generation and management platform** where:

- Users connect data sources, select a template, and get AI-generated first drafts
- The editor is **section-oriented** -- users work at the section level, not character-by-character
- Sections can be regenerated individually with new data or instructions
- The platform has an "intuitive interface" (their words) but no public screenshots or detailed UI documentation are available
- They mention a "Changes Marked" mode for showing AI edits (similar to track changes)

### Key UI Patterns (Inferred)

| Pattern | Evidence |
|---------|----------|
| Section-based editing | Section Regeneration is a core feature; users iterate "on sections in seconds" |
| Template-driven structure | Templates define document skeleton; AI fills sections |
| Source panel / sidebar | Source Tracer shows exact sources used per section |
| Changes Marked mode | Inconsistency Intelligence edits in "Changes Marked" mode |
| Search across documents | Robust cross-document and cross-program search |
| Workflow visualizations | "Intuitive workflows and visualizations" for tracking data/content |

### What Is NOT Confirmed

- Whether they use a rich-text editor (ProseMirror, TipTap, Slate, etc.) or a more structured/form-based approach
- Real-time co-editing (CRDT/OT-based collaborative editing)
- Inline commenting UI
- Block-based editing (like Notion)
- Markdown support

---

## 3. Collaboration Features

### Confirmed

- **Multi-team workflows**: Different teams (med writing, regulatory affairs, CMC, etc.) each get team-specific workflows and features
- **Automated notifications**: Automations can "notify users" when changes occur
- **Cross-document change propagation**: When a change is made in one section, Inconsistency Intelligence identifies all other affected sections across the document or dossier
- **Audit logs**: Complete record of all document changes for accountability

### Not Confirmed / Unknown

- Real-time co-editing (multiple cursors, presence indicators)
- Inline commenting / threaded discussions
- Suggestion mode (accept/reject individual changes)
- @-mentions or user tagging
- Role-based document permissions (viewer/commenter/editor)

---

## 4. Template / Structure Features

### Core Template System

- **Custom Templates**: Users can use Artos-provided templates, custom templates built by their team, or purchased third-party templates
- **eCTD Templates**: Artos provides 400+ free eCTD-compliant templates for IND/NDA/BLA submissions with guidances, descriptions, and unified styling (regularly updated)
- **Template Flexibility**: AI conforms drafts to any template structure
- **Module-aware**: Understands CTD module structure (e.g., Module 2.2 Introductory Statement per 21 CFR 312.23(a)(3)(i))

### Document Types Supported

| Document Type | Category |
|--------------|----------|
| IND (Investigational New Drug) | Regulatory submission |
| NDA (New Drug Application) | Regulatory submission |
| BLA (Biologics License Application) | Regulatory submission |
| PMA (Premarket Approval) | Device submission |
| Clinical Study Reports (CSR) | Clinical |
| Protocols | Clinical |
| Investigator's Brochures (IB) | Clinical |
| Informed Consent Forms | Clinical |
| CMC Study Reports | CMC |
| Non-Clinical Study Reports | Non-clinical |
| Detailed protocol drafts | Clinical ops |

### Template Workflow

```
Template --> Add Source Data --> Generate Draft --> QC --> Regenerate with AI --> Finalize Draft --> Update Source Data
```

- Source traceability and audit trails are live throughout this entire workflow

### Blog Insight: "How to Build Templates for an AI Age"

- Artos published a blog post on template design for AI systems, suggesting they think deeply about how templates should be structured to work optimally with generative AI
- Indicates templates are not just static Word documents but structured objects the AI understands

---

## 5. AI Writing Assistance Features

### AI Document Drafting

- **Purpose-built AI per document type**: Not a generic LLM wrapper; they develop specific AI systems for each document type (IND, NDA, BLA, etc.)
- **No prompt engineering required**: Users don't need to write prompts; agents interface with LLMs to produce reproducible results
- **Anti-hallucination**: Platform is "purpose-trained to avoid hallucinations" -- claims zero hallucination in generated content
- **Source-grounded**: All generated content is traceable back to source data

### Section Regeneration

- Regenerate individual sections with new instructions or data
- **Modify tone or style** easily
- **Address comments in seconds** -- suggests AI can process reviewer comments and regenerate accordingly
- **Update with new data**: For teams that write documents before data is available, sections can be updated once data arrives
- **Add new sources**: Users can add scientific literature, raw data files, study reports, or internal documents to generate updated sections

### Inconsistency Intelligence

- **Cross-document discrepancy detection**: Automatically tracks when changes are made and understands impact on other sections
- **Dossier-scale**: Designed to scale to entire regulatory submissions
- **"Changes Marked" mode**: Edits affected sections showing what changed, similar to track changes
- **Trained on submission logic**: Understands the logical relationships within regulatory submissions

### Source Tracer

- Shows exact source data used to create each section
- Goes "beyond naive vector stores" -- designed for deep source attribution
- Keeps a record of all sources used by the AI system
- Makes it easy to compare source data to AI-generated content
- Enables quick edits and quality control of AI-generated content

### AI Capabilities Summary

| Capability | Status |
|-----------|--------|
| Full document first-draft generation | Confirmed |
| Section-level regeneration | Confirmed |
| Tone/style modification | Confirmed |
| Comment-driven regeneration | Confirmed |
| Source-grounded generation (no hallucination) | Confirmed (claimed) |
| Cross-document consistency checking | Confirmed |
| Tables, figures, graphs generation | Confirmed |
| Autocomplete / inline suggestions | Not confirmed |
| AI rewrite of selected text | Not confirmed (section-level only confirmed) |
| Summarization | Not confirmed |

---

## 6. Version Control / Document Lifecycle

### Confirmed

- **Audit logs**: Complete record of all document changes with full traceability
- **GxP compliance**: Built with GxP in mind; automation workflows contain built-in validation logic
- **Changes tracking**: Inconsistency Intelligence operates in "Changes Marked" mode
- **Iterative drafting**: Generate --> QC --> Regenerate --> Finalize workflow

### Not Confirmed / Unknown

- Formal version numbering (v1.0, v1.1, v2.0)
- Draft / Review / Approved / Published lifecycle stages with formal state transitions
- Electronic signatures (21 CFR Part 11)
- Approval workflows with sign-off chains
- Version comparison / diff view
- Branching or parallel versions
- Lock/unlock document states
- Formal review rounds

### Assessment

Artos appears focused on the **drafting acceleration** phase rather than the full document lifecycle management (DLC). They do not publicly advertise formal approval workflows, electronic signatures, or multi-stage lifecycle management. Their "audit logs" and "GxP compliance" mentions suggest awareness of these needs but may not be fully built out yet given their early stage.

---

## 7. Compliance / Regulatory Features

### Confirmed

- **Source Traceability**: Every section traceable to source data
- **Inconsistency Intelligence**: Cross-document consistency checking at dossier scale
- **Audit Logs**: Searchable, complete change history
- **GxP Compliance**: Automation workflows with built-in validation logic; non-AI validation techniques
- **eCTD Structure Awareness**: Understands CTD module structure and regulatory requirements
- **Regulatory Intelligence Search**: Search across clinicaltrials.gov, Drugs@FDA, SBAs, health authority guidances, plus internal data
- **HL7 FHIR Integration**: Exploring FHIR data standards for structured submissions
- **Template Compliance**: AI conforms to regulatory template requirements

### Not Confirmed / Unknown

- 21 CFR Part 11 electronic signatures
- Automated regulatory cross-reference validation
- Compliance scanning (flagging non-compliant language)
- Regulatory style guide enforcement
- Citation management system
- Cross-reference numbering and linking
- Regulatory terminology checking

---

## 8. Data / Table Handling

### Confirmed

- **Table generation**: "Complex ensemble of AI systems" supports table creation
- **Figure generation**: Can create and iterate on figures
- **Graph generation**: Can create and iterate on graphs
- **Automated updates**: Automations can "update tables and graphs" based on source data changes
- **Data visualization**: "Downstream Visualization" is listed as a core feature

### Not Confirmed / Unknown

- Interactive table editor (add/remove rows, sort, formula)
- Figure annotation tools
- Chart type selection / customization
- Data import from statistical software (SAS, R)
- CDISC/SDTM data handling
- TLF (Tables, Listings, Figures) generation from datasets
- In-document data visualization widgets

---

## 9. Import / Export

### Import (Confirmed)

- **Multi-format input**: .pdf, .rtf, .docx, .jpeg, .xlsx and more
- **"Ossified Data" extraction**: Can extract structured information from legacy formats where data has been "trapped"
- **No manual organization required**: Platform handles messy, multi-format input documents
- **Data source connections**: Teams connect to their usual data sources

### Export (Not Confirmed / Speculative)

- No specific export formats publicly documented
- eCTD publishing integration is implied but not explicitly confirmed
- Word (.docx) export is likely given industry requirements but not documented
- PDF export not documented
- XML/eCTD backbone generation not documented

### Integrations (Confirmed)

- **Veeva RIM**: High-fidelity integration with the most widely used DMS for regulatory submissions
- **Box**: Sync and manage documents with company Box systems
- **SharePoint**: Read, write, and manage documents from SharePoint accounts
- **Google Drive**: Seamless read/write/manage integration
- **Empower**: Listed as supported integration
- **LIMS**: Listed as supported integration
- **Microsoft Teams**: Automations can notify team members via Teams with change summaries
- **API available**: REST API for custom integrations (IT/Engineering can build custom GxP-compliant data transformation workflows)
- **SSO support**: Mentioned for enterprise deployment; integrates with user management systems for granular access controls
- **Cross-system automations**: Can define workflows across DMS, communications apps, analysis software
- **Quick setup**: Integrations can be set up without weeks/months of work
- **More integrations coming**: Artos explicitly states more integrations are being added

---

## 10. Section Management

### Confirmed

- **Section-level operations**: Core unit of work is the section, not the full document
- **Individual section regeneration**: Each section can be independently regenerated
- **Section-to-source mapping**: Source Tracer maps each section to its source data
- **Cross-section dependency tracking**: Inconsistency Intelligence understands which sections affect which
- **Module/CTD structure**: Understands eCTD module hierarchy (Module 2.2, 2.5, etc.)
- **Cross-document section awareness**: Changes in one document's section can propagate to related sections in other documents

### Not Confirmed / Unknown

- Section assignment to team members
- Section-level permissions / locking
- Section status tracking (draft, in review, approved)
- Section navigation sidebar / outline view
- Drag-and-drop section reordering
- Section-level commenting
- Section templates vs. document templates

---

## 11. Review Workflows

### Confirmed

- **Changes Marked mode**: Inconsistency Intelligence shows changes for reviewer evaluation
- **QC workflow**: Template --> Draft --> QC --> Regenerate --> Finalize
- **Source comparison**: Reviewers can compare AI-generated content against source data
- **Comment-driven iteration**: "Address comments in seconds" suggests AI processes reviewer feedback

### Not Confirmed / Unknown

- Formal review assignment / routing
- Reviewer roles and permissions
- Accept/reject individual changes
- Review deadline tracking
- Review completion status
- Multi-round review cycles
- Approval gates between lifecycle stages
- Electronic sign-off

---

## 12. Unique / Differentiating Concepts

### "Ossified Data"

Artos's proprietary concept: data that was once structured but has been trapped in unstructured formats (PDFs, RTFs, legacy exports) due to system migrations, regulatory requirements, or data ownership issues. Artos claims to extract and re-structure this data automatically.

### Document-Type-Specific AI

Rather than using a single general-purpose AI model, Artos develops specialized AI systems for each document type. This is a key differentiator from generic AI writing assistants.

### No Prompt Engineering

Users never write prompts. The AI agents are pre-configured for each document type and handle LLM interactions internally. This is positioned as a reliability and reproducibility feature.

### Submission Logic Training

Inconsistency Intelligence is "trained to understand the logic of these submissions" -- meaning it understands not just text similarity but the logical relationships between sections in regulatory documents (e.g., Module 2.7 Clinical Summary must be consistent with Module 5 Clinical Study Reports).

---

## 13. Gaps / Unknowns (Areas Where Artos Is Silent)

| Area | Assessment |
|------|-----------|
| Rich text editing experience | No details on actual editor UX (no screenshots public) |
| Real-time collaboration | Not mentioned (no co-editing, presence indicators) |
| Commenting / annotations | Not mentioned |
| Electronic signatures | Not mentioned (21 CFR Part 11 gap) |
| Formal approval workflows | Not mentioned (no sign-off chains) |
| Version comparison / diff | Not mentioned |
| Export formats | Not documented (Word/PDF export likely but not stated) |
| eCTD publishing (XML backbone) | Implied by FHIR blog but not confirmed as product feature |
| Offline editing | Not mentioned |
| Mobile support | Not mentioned |
| Compliance scanning / style guides | Not mentioned (no language/terminology checking) |
| Citation management | Not mentioned as formal system |
| Cross-reference linking | Not mentioned |
| Section assignment to users | Not mentioned |
| Review routing / assignment | Not mentioned |
| Pricing | Not public |
| HIPAA compliance | Not mentioned |
| 21 CFR Part 11 full compliance | Not mentioned |
| Data residency options | Not mentioned |
| Regulatory intelligence accumulation | No equivalent to RIM -- AI generates but does not learn over time |
| Predictive analytics | No equivalent to Foresight -- no submission risk prediction |
| Multi-agency comparison | No equivalent to precedent engine |

---

## 14. Competitive Positioning vs. Concept2Cure

### Where Artos Is Strong

1. **AI-first draft generation** -- purpose-built models per document type, no prompt engineering
2. **Source traceability** -- deep attribution beyond vector stores
3. **Inconsistency Intelligence** -- cross-document/dossier-scale consistency at change time
4. **Multi-format data ingestion** -- handles messy, "ossified" legacy data
5. **eCTD template library** -- free templates for common submission types
6. **Speed claims** -- "minutes not months" for first drafts
7. **Simplicity** -- positioned as easy to deploy and use

### Where Artos Appears Weak (Opportunities for Concept2Cure)

1. **No visible document lifecycle management** -- no draft/review/approve/publish stages
2. **No electronic signatures or formal approval workflows** -- critical for 21 CFR Part 11
3. **No confirmed real-time collaboration** -- no co-editing, commenting, presence
4. **No confirmed rich-text editing** -- appears to be AI-generation-first, not editing-first
5. **No regulatory compliance scanning** -- no language/terminology checking
6. **No confirmed cross-reference management** -- no citation system
7. **No confirmed version control UI** -- no diff view, branching, formal versioning
8. **No review workflow tooling** -- no reviewer assignment, routing, deadlines
9. **Early stage** -- $500K funding, small team, limited track record
10. **No intelligence layer** -- no equivalent to RIM; AI generates but doesn't accumulate regulatory judgment
11. **No predictive analytics** -- no equivalent to Foresight; cannot predict submission outcomes
12. **No multi-agency intelligence** -- no precedent engine for comparing FDA/EMA/PMDA/HC approaches
13. **No conversation-first interface** -- no equivalent to AnA; users work through structured UI only
14. **No project management** -- no equivalent to project workspace, milestones, team coordination

### Where They Overlap

| Capability | Artos | Concept2Cure |
|-----------|-------|-------------|
| AI document drafting | Core feature (per-doc-type AI) | Via AnA + authoring actions |
| Section-level editing | Yes (section regeneration) | Yes (UnifiedDocumentEditor) |
| Source traceability | Strong (Source Tracer) | Via CORTEX + citations |
| Cross-document consistency | Inconsistency Intelligence | RIM cross-artifact intelligence |
| eCTD awareness | 400+ templates + structure | Submission workflow + DossierMap |
| Audit trail | GxP-grade immutable audit logs | Full audit system |
| Template system | Custom + 400+ eCTD templates | Document templates |
| Regulatory search | clinicaltrials.gov, Drugs@FDA | Regulatory intelligence + precedent engine |
| DMS integrations | Veeva RIM, Box, SharePoint, GDrive | Via export/import |
| Automation workflows | Trigger-based cross-system | Bull queue + workflow engine |
| Tables/figures/graphs | AI generation + auto-update | Editor + AI generation |
| Multi-format ingestion | PDF, RTF, DOCX, JPEG, XLSX | PDF, DOCX import |
| Security | SOC 2 + GDPR | SOC 2 + GDPR + Helmet + rate limiting |
| FHIR readiness | Blog-level exploration | Not mentioned |

---

## 15. Security & Compliance (Updated 2026-03-30)

### Confirmed

- **SOC 2 Type II compliant**: Internal practices exceed SOC II and GDPR requirements
- **GDPR compliant**: Explicitly mentioned alongside SOC II
- **GxP compliance**: Automations built with GxP in mind; every AI action and manual edit logged in immutable record
- **Data privacy**: Artos never trains AI models on data belonging to another company; minimal data redundancy is a core security tenet
- **Access controls**: Infrastructure designed from database level up with access control; integrates with user management systems for granular, enforceable access controls
- **Audit logs**: Searchable, real-time retrievable, designed to meet GxP software requirements; captures every action/change with contextual narrative of document evolution
- **IT dashboard**: Comprehensive IT dashboard for managing Artos and ensuring GxP compliance
- **AI usage policy**: Published internal policy for responsible, transparent, ethical AI use
- **Cloud provider security**: Works closely with cloud and AI providers for maximum security

### Not Confirmed / Unknown

- 21 CFR Part 11 electronic signatures (not mentioned)
- HIPAA compliance (not mentioned)
- ISO 27001 certification (not mentioned)
- Encryption specifics (at rest / in transit)
- Data residency / sovereignty options
- Penetration testing cadence
- Specific cloud provider (AWS, Azure, GCP)

---

## 16. Automations & Workflows (Updated 2026-03-30)

### Confirmed

- **Trigger-based automations**: Automations trigger on data updates, document changes, and more
- **Section rewriting**: Automations can rewrite sections based on triggers
- **Table/graph updates**: Automations can update tables and graphs from new source data
- **Change tracking**: Automations track their changes for review
- **User notifications**: Automations notify users of changes (including via Microsoft Teams)
- **Built-in validation**: Non-AI validation logic ensures automations perform correctly 100% of the time
- **GxP immutable logging**: Every automation action logged in immutable record
- **Cross-system rules**: Users can define complex rules and workflows across DMS, communications apps, analysis software
- **Example workflow**: "Automatically update summaries of tabular data when new tabular data is updated and notify a member via Microsoft Teams with a brief summary of what changes were made"
- **IT/Engineering API**: Intuitive interface or API to build custom, GxP-compliant data transformation workflows for mappings, database storage, document management

### Assessment

Artos's automation system appears relatively sophisticated for their stage. The trigger-based model with cross-system integration (DMS + Teams + analysis software) is a genuine workflow orchestration capability, not just simple macros. The built-in non-AI validation logic for automations is a noteworthy detail -- it suggests deterministic validation alongside AI generation.

---

## 17. Validation & AI Quality (Updated 2026-03-30)

### Multi-Layered Validation Approach (from blog)

Artos has published detailed thinking on production-grade AI validation:

1. **Human-in-the-Loop (HITL)**: Core component; humans evaluate, provide feedback, make edits
2. **Edit tracking as ground truth**: Monitoring human edits generates validation datasets; modified content becomes benchmark data
3. **Pipeline validation**: Modular validation of each step:
   - Document ingestion validation (structured, consistent intake)
   - Document storage validation (integrity, compliance)
   - Information retrieval validation (correct content retrieval)
4. **Modular upgrade path**: Component-level validation minimizes re-validation when upgrading parts of the system
5. **95% pilot failure rate**: Artos claims 95% of AI pilots fail; positions itself as having solved the production-grade problem

### Anti-Hallucination Claims

- "No hallucinations" is a core marketing claim
- Purpose-built AI systems per document type (not generic LLM wrapper)
- All content source-grounded via Source Tracer
- Reproducible results from agents that interface with LLMs

---

## 18. Strategic Takeaways

1. **Artos validates the market** -- YC-backed, focused on the exact problem Concept2Cure solves. The $13B regulatory submission market is real and attracting serious attention.

2. **Draft generation is table stakes** -- Artos's core value prop (fast first drafts) is becoming commoditized. The differentiator is what happens AFTER the draft: lifecycle management, collaboration, compliance, intelligence.

3. **Inconsistency Intelligence is their strongest feature** -- cross-document consistency checking at submission scale is genuinely valuable and something to ensure Concept2Cure matches or exceeds via RIM cross-artifact intelligence.

4. **Source traceability matters** -- "Beyond naive vector stores" is a meaningful claim. Concept2Cure should ensure its citation and source attribution system is equally robust.

5. **Document-type-specific AI is smart** -- rather than generic prompts, building specialized AI pipelines per document type produces better results. Concept2Cure's authoring actions should follow this pattern.

6. **Artos is NOT a full platform** -- it is a drafting accelerator, not a complete regulatory operations platform. Concept2Cure's breadth (RIM, CORTEX, Foresight, submission workflow, client portal, project management) is a massive advantage.

7. **No intelligence accumulation** -- Artos generates documents but does not learn from regulatory outcomes, build judgment models, or accumulate institutional knowledge. RIM is a fundamental differentiator.

---

## Sources

- [Artos AI Homepage](https://www.artosai.com/)
- [Artos on Y Combinator](https://www.ycombinator.com/companies/artos)
- [YC Launch: Artos](https://www.ycombinator.com/launches/KGo-artos-turning-science-into-regulatory-submissions)
- [Artos: Turning Complex Data into Regulatory Gold (HireTop)](https://hiretop.com/blog2/artos-ai-based-document-drafting-platform/)
- [Artos at DIA 2025](https://live.diaglobal.org/event/dia2025/exhibitor/RXhoaWJpdG9yXzIxNTg2OTY=)
- [Artos on Tracxn](https://tracxn.com/d/companies/artos/__gLCfmd5gi50dRHqoAv7P7QG44woxWv8bZUSS0K_R0MI)
- [Artos Blog: HL7 FHIR in eCTD](https://www.artosai.com/blog/the-future-of-structured-regulatory-submissions-leveraging-hl7-fhir-in-ectd-with-ai)
- [Artos Blog: AI-Augmented Medical Writer](https://www.artosai.com/blog/the-ai-augmented-medical-writer)
- [Artos Blog: Templates for an AI Age](https://www.artosai.com/blog/how-to-build-templates-for-an-ai-age)
- [Artos: Section Regeneration Feature](https://www.artosai.com/feature/generative-ai-medical-writing-document-section-regeneration)
- [Artos: Source Tracer Feature](https://www.artosai.com/feature/generative-ai-medical-writing-source-tracer)
- [Artos: Inconsistency Intelligence Feature](https://www.artosai.com/feature/generative-ai-medical-writing-inconsistency-intelligence)
- [Artos: Automated Workflows Feature](https://www.artosai.com/feature/generative-ai-medical-writing-automated-workflows)
- [Artos: AI Document Drafting Feature](https://www.artosai.com/feature/generative-ai-medical-writing-ai-document-drafting)
- [Artos: Custom Templates Feature](https://www.artosai.com/feature/generative-ai-medical-writing-custom-ai-templates)
- [Artos: Regulatory Affairs Team Page](https://www.artosai.com/team/generative-ai-regulatory-affairs)
- [Artos: Medical Writing Team Page](https://www.artosai.com/team/generative-ai-medical-writing)
- [Artos: Engineering Team Page](https://www.artosai.com/team/generative-ai-engineering)
- [Artos: Regulatory Intelligence Team Page](https://www.artosai.com/team/generative-ai-regulatory-intelligence)
- [Artos: eCTD Templates Resource](https://www.artosai.com/resources/ectd-ind-nda-bla-templates/2.2-intro-to-summary)
- [DIA Marketplace: Artos AI](https://marketplace.diaglobal.org/listing/artosai)
- [Weave Bio (Competitor)](https://www.weave.bio/)
- [Fondo: Artos Launch Coverage](https://www.fondo.com/blog/artosai-launches)
- [HuntScreens: Artos](https://huntscreens.com/en/products/artos)
- [Artos: Integrations](https://www.artosai.com/feature/generative-ai-integrations)
- [Artos: Security](https://www.artosai.com/resources/security)
- [Artos: Audit Logs](https://www.artosai.com/backup/generative-ai-medical-writing-audit-logs)
- [Artos Blog: Validating LLM Systems](https://www.artosai.com/blog/getting-to-production-grade-ai-validating-llm-systems)
- [Artos Blog: Evaluating Model-Level Performance](https://www.artosai.com/blog/evaluating-model-level-performance-in-genai-applications)
- [Artos Blog: How Trustworthy Can AI Be?](https://www.artosai.com/blog/how-trustworthy-can-ai-be)
- [Artos: Clinical Operations Team Page](https://www.artosai.com/team/generative-ai-clinical-operations)
- [Artos: IT Team Page](https://www.artosai.com/team/generative-ai-information-technology)
- [Artos: Big Pharma Page](https://www.artosai.com/organization/generative-ai-in-big-pharmaceutical)
- [Artos at RAPS Convergence 2025](https://www.artosai.com/events/artos-at-raps-convergence-2025)
- [Artos at RAPS EDTS 2025](https://www.artosai.com/events/artos-at-raps-edts-2025)
- [Artos at AMWA 2024](https://www.artosai.com/events/artos-at-amwa-medical-writing-and-communication-conference-2024)
- [Artos at RAPS Regulatory Strategy 2024](https://www.artosai.com/events/artos-at-raps-regulatory-strategy-2024)
- [Artos at DIA SIDM Forum](https://live.diaglobal.org/event/regulatory-submissions-information-and-document-management-forum/exhibitor/RXhoaWJpdG9yXzIwOTMzOTM=)
- [Artos: eCTD Templates (400+)](https://www.artosai.com/resources/ectd-ind-nda-bla-templates)
- [Artos Privacy Policy](https://www.artosai.com/legal)
- [Artos on PitchBook](https://pitchbook.com/profiles/company/593028-46)
- [Artos on Crunchbase](https://www.crunchbase.com/organization/artos-78fd)
