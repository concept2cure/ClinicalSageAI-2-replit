# IND Submission Journey: Login to Filing

**Date:** 2026-03-27
**Status:** Implementation plan
**Goal:** Complete IND submission capability from login through eCTD filing

---

## The Journey

```
Login → Onboarding → Create IND Project → AnA Home
  ↓
AnA: "Let's build your IND. Here's what we need."
  ↓
Module 1 — Administrative Forms
  ├── FDA Form 1571 (IND Application)
  ├── FDA Form 1572 (Statement of Investigator)
  ├── FDA Form 3674 (Certification)
  ├── Cover Letter
  └── Table of Contents
  ↓
Module 2 — Summaries
  ├── 2.2 Introduction
  ├── 2.3 Quality Overall Summary
  ├── 2.4 Nonclinical Overview
  ├── 2.5 Clinical Overview
  ├── 2.6 Nonclinical Written/Tabulated Summaries
  └── 2.7 Clinical Summary
  ↓
Module 3 — Quality (CMC)
  ├── 3.2.S Drug Substance
  ├── 3.2.P Drug Product
  └── 3.2.A Appendices
  ↓
Module 4 — Nonclinical
  ├── 4.2.1 Pharmacology
  ├── 4.2.2 Pharmacokinetics
  └── 4.2.3 Toxicology
  ↓
Module 5 — Clinical
  ├── 5.3 Clinical Study Reports
  └── 5.4 Literature References
  ↓
Review → Compliance Check → eCTD Packaging → Export → File with FDA
```

---

## What Exists (From Audit)

| Capability | Status | Component |
|-----------|--------|-----------|
| Project creation with IND type | ✅ Built | NewProjectModal, FirstRunExperience |
| AnA conversational home | ✅ Built | AnaPersistentPanel (project-home) |
| CTD section templates | ✅ Built | templateRegistry.ts |
| CSR generation (Module 5) | ✅ Built | csr-builder.ts |
| Document editor with CTD awareness | ✅ Built | UnifiedDocumentEditor + 7 extensions |
| AI section drafting | ✅ Built | AIAutocomplete, BatchAIPanel |
| Version control + diff | ✅ Built | VersionTimeline, DocumentDiff |
| Review workflow (D→R→A→L) | ✅ Built | GovernedDocumentPanel |
| Compliance scanning | ✅ Built | ComplianceScanner extension |
| Cross-references | ✅ Built | CrossReferencePanel |
| E-signatures (21 CFR Part 11) | ✅ Built | SignatureWorkflow |
| eCTD XML backbone | ✅ Built | masterDocumentBuilder |
| DOCX/PDF export | ✅ Built | docxFactory, ExportDialog |
| 13 Claude tools for research | ✅ Built | ClaudeToolDefinitions + chat wiring |
| Document canvas (Claude-style) | ✅ Built | DocumentCanvasPanel |

## What Needs Wiring

The features exist. They need to be **connected into one seamless flow** that AnA guides the user through.

### 1. IND Project Template
When user creates an IND project, pre-populate the dossier map with all required CTD sections (Module 1-5). Each section starts as "not started" with the template ready to generate.

### 2. AnA IND Guidance
When on an IND project's home, AnA should:
- Know the complete IND structure
- Track which sections are drafted, in review, approved
- Suggest the next section to work on
- Offer to generate any section on demand

### 3. Module 1 Form Generation
FDA Forms 1571, 1572, 3674 need to be:
- Generateable from project data (sponsor, investigator, product info)
- Produced as DOCX with proper FDA formatting
- Available through AnA command: `/generate form-1571`

### 4. Section-by-Section Guided Drafting
For each CTD section, AnA should:
- Explain what the section requires (ICH M4 guidance)
- Generate a first draft using project context
- Open the draft in DocumentCanvasPanel for review
- Allow inline editing → save → promote to governed artifact
- Move to the next section

### 5. Readiness Dashboard per Module
Show completion status for each module and section:
- Not started → Drafting → In Review → Approved → Locked
- Gap analysis: which sections are missing
- Estimated time to completion

### 6. eCTD Assembly + Export
When all sections are ready:
- Validate all sections against eCTD requirements
- Assemble into eCTD ZIP package (index.xml + documents)
- Generate cover letter and ToC
- Final compliance check
- Export for FDA gateway submission
