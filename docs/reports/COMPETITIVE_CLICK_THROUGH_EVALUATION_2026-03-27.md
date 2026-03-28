# Competitive Click-Through Evaluation: Concept2Cure vs Weave.bio vs Artos AI

**Date:** 2026-03-27
**Evaluator Persona:** Dr. Rachel Torres, CRO at mid-stage biotech ($80M Series C), first IND for a novel biologic
**Method:** Code walkthrough (C2C), public demos/docs (Weave, Artos)
**Standard:** Would I stake my $2M regulatory budget on this?

---

## Scorecard

| Dimension | Weave.bio | Artos AI | Concept2Cure | Notes |
|-----------|:---------:|:--------:|:------------:|-------|
| **A. First 5 Minutes** | 9 | 7 | 6 | Weave is polished SaaS. C2C still feels like a power tool, not a product. |
| **B. Project Setup** | 8 | 6 | 7 | C2C collects rich metadata. Weave is faster to start. |
| **C. Document Authoring** | 9 | 8 | 7 | Weave's AutoIND is validated (Takeda). C2C has the machinery but more clicks to get there. |
| **D. Review & Collaboration** | 8 | 5 | 7 | C2C has comments/compare/reviewers. Weave has tighter review cycles. Artos is light here. |
| **E. Verification & Source Tracing** | 7 | 4 | 8 | C2C's provenance + inconsistency + compliance scanner + proof chain is the deepest. |
| **F. Dossier & Submission** | 8 | 5 | 7 | Weave's Submission Builder is mature. C2C has DossierTree + SubmissionReadiness + eCTD export. |
| **G. Data Room / Evidence** | 9 | 6 | 6 | Weave's Data Room is their showpiece. C2C has vault + /api/evidence/ask but less polished. |
| **H. Regulatory Intelligence** | 2 | 1 | 9 | C2C dominates. RIM, Foresight, precedent, biostatistics. Neither competitor has anything close. |
| **I. HAQ Response** | 8 | 2 | 6 | Weave's HAQ Manager is production-validated. C2C has the workflow but it's newer. Artos has nothing. |
| **J. Export & Compliance** | 8 | 6 | 8 | C2C's 5-record governed export chain is enterprise-grade. Weave is equivalent. |
| **TOTAL** | **76/100** | **50/100** | **71/100** | |

---

## Per-Dimension Narrative

### A. First 5 Minutes (Weave 9, Artos 7, C2C 6)

**Weave:** You land on a clean workspace. Data Room on the left, document in the center. It screams "I know what I am." No learning curve for a regulatory professional.

**Artos:** Clean YC-style product. Upload data, pick template, get draft. Simple mental model. But feels early — like a very good tool, not a platform.

**C2C:** You land in AnA (conversational AI). The project context strip is clean — name, type, readiness. But an RA professional's first reaction is "why am I in a chat?" The mental model (conversation first, tools second) is correct architecturally but requires explanation. A buyer doing a 5-minute demo might not discover the Tools workbench, the dossier tree, or the editor lifecycle. **The power is hidden.**

**Honest verdict:** C2C has more capability than both competitors combined, but it takes 15 minutes to discover what Weave shows in 30 seconds.

### B. Project Setup (Weave 8, Artos 6, C2C 7)

**C2C reality (from code):** `NewProjectModal.tsx` collects submission type (9 options including IND, NDA, BLA, 510K, PMA), plus sponsor, agency, target date, custom instructions. Early Access badges on pharma types are honest. After creation, user lands in project-home. The section tree auto-adapts to submission type (106 IND sections, 8 device sections).

**What's good:** Rich metadata collection. Honest labeling. Type-aware workspace.
**What's weak:** The "Early Access" badge on IND might scare a buyer. IND is our target — don't label your hero path as early access.

### C. Document Authoring (Weave 9, Artos 8, C2C 7)

**C2C reality:** ToolsLanding offers 10 capabilities. "Create" makes a blank doc in EditorPanel. "Document Builder" is a 5-step wizard (FullDocumentBuilder). EditorPanel has TipTap editor with AI slash commands (/ai-rewrite, /ai-expand, /ai-summarize, /ai-regulatory). Batch AI panel for multi-section operations. 18 inspector panels grouped into 4 lifecycle stages.

**What's good:** The editor is genuinely powerful. The lifecycle pipeline (Draft → In Review → Approved → Published) is the best lifecycle UX I've seen in regulatory software. The 4-stage inspector ribbon with progressive collapse is smart.

**What's weak:** Getting FROM the home screen TO a drafted document takes too many clicks: Home → Open Tools → Document Builder → 5-step wizard → Open in Editor. Weave gets you from upload to draft in 2 clicks. **The authoring is excellent once you're in the editor. Getting there is the problem.**

### D. Review & Collaboration (Weave 8, Artos 5, C2C 7)

**C2C reality:** EditorPanel has Comments (thread-based), Reviewers (assignment), Compare (version diff), History (version list), Review (reviewer mode toggle). All exist as inspector panels under the "Review" lifecycle stage.

**What's good:** The infrastructure is complete. Comments, versioning, reviewer assignment, status gating — all real.
**What's weak:** Collaboration feels like parallel inspectors, not one connected space. There's no "review dashboard" that shows me "3 documents pending your review" in one view. ReviewReadiness exists but it's more about compliance readiness than collaborative review.

### E. Verification & Source Tracing (Weave 7, Artos 4, C2C 8)

**C2C reality:** EditorPanel "Verify" stage includes: Provenance (DocumentProvenancePanel), Cross-Refs, Inconsistency detection, Compliance Scanner, Evidence/Proof chain. RIM operates in the background capturing signals from every chat, compliance scan, and artifact change.

**This is where C2C wins.** No competitor has a compounding intelligence layer that learns from every interaction. Provenance traces AI-generated content to its source. Inconsistency detection flags contradictions across sections. The compliance scanner checks regulatory alignment.

**What's weak:** These capabilities are inspector panels in a side drawer. A buyer might not realize they exist. The "Verify" stage in the ribbon needs to be more prominent — maybe a visual indicator when verification issues are found.

### F. Dossier & Submission (Weave 8, Artos 5, C2C 7)

**C2C reality:** DossierTree shows CTD hierarchy with per-section document count and status. `useSubmissionSections` loads IND M1-M5 (106 sections) or device sections (8). SubmissionReadiness shows readiness checklist. eCTD compilation (`ectd-compile.ts`) and export (`ectd-export.ts`) produce ZIP packages. eCTD 4.0 validation exists.

**What's good:** The section tree is submission-type-aware. The infrastructure for eCTD assembly is real.
**What's weak:** There's no "one-click assemble submission package" that takes all approved sections and creates the final eCTD ZIP. The user has to understand the relationship between DossierTree, SubmissionReadiness, and export routes. Weave makes this feel like one continuous flow.

### G. Data Room / Evidence (Weave 9, Artos 6, C2C 6)

**C2C reality:** VaultPage for file upload/browse. `/api/evidence/ask` endpoint for semantic Q&A over project documents. AskDataRoomPanel.jsx exists and is now wired to the endpoint. ForesightRAGService provides the RAG pipeline.

**What's good:** The "Ask" capability exists end-to-end (UI + endpoint + RAG service).
**What's weak:** Weave's Data Room is their demo centerpiece — folder upload with structure preservation, AI metadata extraction, semantic deep search with relevance scoring, traceable flow between source files and submission documents. C2C's vault feels like a file browser with an "Ask" tab bolted on. **The functionality may be equivalent, but the polish isn't.**

### H. Regulatory Intelligence (Weave 2, Artos 1, C2C 9)

**C2C reality:** This is the overwhelming advantage.
- **RIM:** 6 judgment models, 16+ seed patterns, 4 interceptors, signal accumulation
- **Precedent Intelligence:** CRL/RTF trigger patterns, advisory committee risk, EMA question taxonomy, confidence calibration, cross-jurisdictional pathways
- **Foresight AI:** Approval probability scoring, timeline estimation, risk prediction
- **Biostatistics:** 7-module deterministic judgment engine (power adequacy, assumption fragility, endpoint defensibility, tradeoff interpreter, risk classifier, role-aware interpreter, artifact generator)
- **Protocol Design:** StudyProtocolDesigner with 12 trial types
- **ClinicalTrials.gov:** Live MCP connector
- **Multi-Agency:** FDA + EMA + PMDA + Health Canada + TGA

Neither Weave nor Artos has ANY of this. Weave is a document tool. C2C is a regulatory intelligence platform that also does documents.

**What's weak:** These capabilities are not visible enough. A buyer comparing C2C to Weave in a demo would see Weave's polished document flow and might not discover C2C's intelligence depth. **The most powerful differentiator is the hardest to demonstrate.**

### I. HAQ Response (Weave 8, Artos 2, C2C 6)

**C2C reality:** HAQManager.tsx — ingest questions, parse, AI draft responses (via /api/evidence/ask), save as artifact, open in editor, session persistence, bulk "Draft All", confirmation on clear.

**What's good:** The workflow exists end-to-end. AI drafting uses project evidence. Responses converge to EditorPanel.
**What's weak:** Weave's HAQ Manager is production-validated with real pharma clients. C2C's is newer and uses a simpler AI path (evidence-ask RAG) instead of the full AnA intelligence pipeline. Responses may lack the regulatory sophistication that AnA would provide if the drafting went through the full orchestrator.

### J. Export & Compliance (Weave 8, Artos 6, C2C 8)

**C2C reality:** `exportGovernance.ts` creates 5 interconnected records per export: artifact, version, provenance event, audit log, submission snapshot. PDF/DOCX/ZIP via Puppeteer + docx library + PDFKit fallback. Electronic signatures supported. Status lifecycle: draft → review → approved → locked.

**What's good:** The governance chain is enterprise-grade. 21 CFR Part 11 audit trail is real. This would pass a regulatory audit.
**What's weak:** The export UX is scattered across multiple surfaces (editor export, cerv2-export-routes, ectd-export). There's no single "Export Center" that shows all my export history with governed snapshots.

---

## What Would Make Me Choose Each Platform

### Choose Weave.bio if:
- You need IND authoring that works TODAY with minimal setup
- Your team is 2-3 RA professionals who just need to write faster
- You value polish and Parexel/Takeda validation over intelligence depth
- You're FDA-only and don't need multi-agency support
- Budget: ~$50-100K/yr

### Choose Artos AI if:
- You're a medical writing team that needs faster first drafts
- You already have a DMS (Veeva, SharePoint) and need a drafting layer
- You're cost-sensitive and want a focused tool, not a platform
- You don't need regulatory intelligence or submission management
- Budget: ~$20-50K/yr

### Choose Concept2Cure if:
- You need ONE platform for documents + intelligence + submission
- You're multi-track (IND + device + CER) or multi-agency (FDA + EMA + PMDA)
- You want biostatistics, precedent intelligence, and risk scoring
- Your RA team is 4+ people who need collaboration and governance
- You're willing to invest in learning a deeper platform
- Budget: ~$75-150K/yr

---

## What Each Platform Is Missing

### Weave.bio is missing:
1. Biostatistics (no SAP builder, no power analysis, no defensibility)
2. Regulatory precedent intelligence (no CRL/RTF patterns, no AC risk)
3. Risk scoring / approval probability
4. Medical device workflows (510k, PMA, CER)
5. Multi-agency support (FDA only, EMA "on roadmap")
6. Protocol design tools
7. Real-time compliance scanning
8. Compounding intelligence (no RIM equivalent)

### Artos AI is missing:
1. Everything Weave is missing, plus:
2. HAQ response workflow
3. Dossier management
4. Submission assembly
5. Review/collaboration workflow
6. Regulatory intelligence of any kind
7. Still early-stage — limited production validation

### Concept2Cure is missing:
1. **Demo polish** — first impression doesn't match capability depth
2. **Guided onboarding** — new user needs help discovering Tools and intelligence
3. **Data Room visual quality** — vault feels utilitarian vs Weave's showpiece
4. **One-click submission assembly** — no "Assemble Package" button that does it all
5. **Review dashboard** — no "3 documents pending your review" landing
6. **Weave-level validation story** — no published case study with named pharma
7. **HAQ drafting through full AnA intelligence** — currently uses basic RAG
8. **Export center** — no single view of all governed exports
9. **IND "Early Access" label** — signals lack of confidence in the hero path
10. **Getting to the editor faster** — too many clicks from home to first draft

---

## If I Could Only Pick One

**For a 45-person biotech filing its first IND in 2026:**

I would choose **Concept2Cure** — but I would tell the team it's a 2-week investment to learn, not a plug-and-play tool.

**Reasoning:**
- Weave is better at documents alone. But I don't just need documents — I need to know if my IND will succeed. I need precedent intelligence (who else filed similar? what were the CRL triggers?). I need biostatistics (is my sample size defensible? will the reviewer question my endpoint?). I need multi-agency support (we're filing FDA first, EMA six months later).
- Weave gives me faster drafts. C2C gives me smarter drafts AND tells me where the risks are before I file.
- The regulatory intelligence gap is not close. Weave has zero. C2C has a compounding intelligence layer that gets better with every project.

**But I would demand from Concept2Cure before signing:**
1. Remove the "Early Access" label from IND — it's your hero path
2. Give me a guided onboarding that shows Tools + Intelligence in the first session
3. Make the Data Room feel as polished as Weave's
4. Add a "Your IND at a Glance" view that shows section completion + risk score + readiness
5. Let me get from project creation to AI-drafted first section in under 60 seconds

---

## 10 Actionable Suggestions for Concept2Cure

| # | Suggestion | Impact | Effort |
|---|-----------|--------|--------|
| 1 | **Remove "Early Access" from IND/NDA/BLA** — these are your hero paths, not experiments | High | 5 min |
| 2 | **Add a "Quick Start" to project home** — "Draft your first section" button that goes directly to AI generation for the most critical section (e.g., M2.5 Clinical Overview) | High | Medium |
| 3 | **Build a 60-second demo mode** — guided overlay showing Home → Tools → Draft → Editor → Review → Export in one flow | High | Medium |
| 4 | **Add a submission progress dashboard** — one card showing: readiness %, sections complete, risk score, next action | High | Medium |
| 5 | **Route HAQ drafting through full AnA pipeline** — responses should get deficiency taxonomy, precedent data, and RIM intelligence, not just basic RAG | High | Medium |
| 6 | **Polish the Data Room** — add folder upload with structure preservation, visual file previews, drag-and-drop, relevance scoring on search results | Medium | Large |
| 7 | **Create an Export Center** — one page showing all governed exports with snapshot hashes, reviewer signatures, and download links | Medium | Medium |
| 8 | **Add a Review Inbox** — "3 documents awaiting your review" with one-click navigation to the document in review mode | Medium | Medium |
| 9 | **Publish a case study** — even a self-reported benchmark (e.g., "IND nonclinical summaries: 100 hours → 4 hours") would close the validation gap with Weave | High | Low |
| 10 | **Surface intelligence scores in the editor** — show RIM risk score, claim confidence, and readiness % as a persistent strip in EditorPanel, not hidden in inspector panels | High | Medium |

---

## Final Grade

| Platform | Grade | One-Line |
|----------|-------|----------|
| **Weave.bio** | **B+** | Best document authoring UX, but it's just documents. |
| **Artos AI** | **C+** | Good draft accelerator, but too early and too narrow. |
| **Concept2Cure** | **B** | Deepest capability by far, but the product doesn't yet show its power in the first 5 minutes. |

**The gap between B and A for Concept2Cure is not engineering — it's product storytelling.** The intelligence is there. The workflows are there. The governance is there. What's missing is the ability to make a busy RA professional feel the power in 60 seconds instead of 60 minutes.

---

Sources:
- [Weave Bio](https://www.weave.bio/)
- [Weave Bio Series A](https://www.businesswire.com/news/home/20251016053611/en/Weave-Bio-Secures-$20M-Series-A-Funding-to-Enhance-Its-AI-Native-Regulatory-Platform)
- [Artos AI](https://www.artosai.com/)
- [Artos Y Combinator](https://www.ycombinator.com/companies/artos)
