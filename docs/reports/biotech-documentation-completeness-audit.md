# BIOTECH DOCUMENTATION COMPLETENESS AUDIT — FINAL

**Date**: 2026-03-24
**Scope**: End-to-end document lifecycle for biotech regulatory/documentation teams

## The Question

Can a biotech regulatory/documentation team do their real work here from start to finish?

**Answer: Not yet. The single-document lifecycle is strong. Everything around it — the documentation operating system a biotech team actually needs — has critical gaps.**

---

## WHAT IS GENUINELY USABLE

| Capability | Status |
|---|---|
| Single-document lifecycle: create → edit → review → approve → lock → export | **Production-ready.** E2E tested, governance-gated. |
| Rich text editor with compliance scanning, citations, AI autocomplete | **Production-ready.** TipTap-based, enterprise-grade. |
| Version control + immutable audit trail + provenance chain | **Production-ready.** 21 CFR Part 11 compliant. |
| E-signatures with SHA-256 hashing, signer roles, attestation | **Production-ready.** |
| Review threads, reviewer assignment, approval orchestration | **Production-ready.** Two systems exist (see diagnosis). |
| Export to DOCX, PDF, PPTX, Markdown | **Production-ready.** |
| CTD section hierarchy definition (Modules 1-5, 50+ sections) | **Real data.** 2,298-line hierarchy. |
| Project section management (status per section, assignments) | **Real backend.** Full API. |
| Contradiction detection + governed resolution bundles | **Real.** Cross-artifact detection, overlay rules, receipts. |
| RIM intelligence + promotion blocking | **Real.** |
| AI assistant (AnA) for drafting and intelligence | **Real.** |
| 29 biotech/pharma document templates | **Usable.** Static scaffolds. |
| eCTD ZIP export with ICH M8 v4.0 structure | **Real service.** |

---

## WHAT IS STILL MISSING OR TOO WEAK

### TIER 1 — Client hits these in the first hour

**1. DossierMap shows mock data, not real project state.**
The primary dossier navigation view uses hardcoded constants (DossierMap.tsx lines 27-78). The backend project-sections API exists and works. They are not connected. A client opens their dossier and sees fiction.

**2. SubmissionReadiness shows mock data.**
The SubmissionReadiness.tsx component uses hardcoded section statuses (lines 19-41). A real readiness engine exists in ProjectReadinessDashboard — but the client may land on the mock one. Two readiness views, one fake.

**3. ProjectHomeDashboard shows zero status information.**
Four navigation cards. No metrics, no blockers, no progress. A client opens their project and has no idea where things stand.

**4. No document subtype tracking.**
Every document is `type: "markdown"`. The system cannot distinguish a CSR from a Protocol from an IB. Cannot filter by document type. Cannot answer "what protocols exist?" Cannot enforce type-specific rules.

### TIER 2 — Client hits these in week one

**5. Biotech document generation endpoints are not wired to UI.**
11 real generation endpoints exist (cover letters, PSURs, ICSRs, protocol synopses, monitoring reports). Zero are callable from the application. Backend investment that the client cannot access.

**6. No Investigator's Brochure support.**
No template, no generation, no structured support. The IB is a cornerstone biotech document.

**7. No submission-type-aware section requirements.**
IND requires different sections than NDA or BLA. The eCTD compile endpoint defines per-module required sections but this never reaches the authoring workflow. A client could work on the wrong sections for months.

**8. No cross-document dependency enforcement.**
Schema has `dependsOn` fields. Not enforced anywhere. Module 2.5 (Clinical Overview) can be promoted without Module 5 (Clinical Study Reports) being complete. No cascade warnings.

**9. Two authoring systems exist in parallel.**
`concept2cure` artifacts (concept2cureArtifacts table) AND `authoring.router.ts` documents (authoring_documents table). Both have their own status machines, version tracking, and review flows. It's unclear which one the client should use, and they don't share state.

### TIER 3 — Client hits these when trying to complete a submission

**10. eCTD export assumes pre-populated module/granule tables.**
For new projects, ectdModules/ectdGranules tables may be empty. The export service produces valid structure but potentially empty packages.

**11. No bulk document import.**
Single upload works. Biotech teams need to onboard 50+ existing documents. No batch upload, no folder-to-section mapping.

**12. No deadline or timeline tracking.**
No submission deadline fields, no milestone dates, no "days until filing." Biotech teams live by deadlines.

**13. Templates are static React components, not database-backed.**
Can't be customized per organization, can't be versioned, no mandatory section enforcement, no auto-population from project data.

---

## WHAT IS MISLEADINGLY "PRESENT"

| Feature | Appears to be | Actually is |
|---|---|---|
| Dossier Map | Real CTD tree with live status badges | Hardcoded mock data |
| Submission Readiness | Section-by-section readiness scoring | Mock data in primary view |
| Document Generation | 11 backend endpoints | Not accessible from UI |
| Document Types | 29 templates available | All stored as generic "markdown" — no type tracking |
| Dependency Tracking | Schema field exists | Never enforced |
| Required Sections | Defined per module in compile endpoint | Not connected to authoring |
| Two Readiness Dashboards | ProjectReadinessDashboard (real) + SubmissionReadiness (mock) | Client might see either |
| Two Document Systems | concept2cure artifacts + authoring documents | Parallel, disconnected |

---

## DOCUMENT LIFECYCLE DETAIL (Happy Path)

The actual working flow for a single document:

```
1. Create       POST /api/authoring/docs → status='draft'
2. Edit         PATCH /api/authoring/sections/:id (auto-revision)
3. Request Review POST /api/authoring/documents/:id/request-review
4. Submit Review POST /api/authoring/documents/:id/review (approve/reject/changes)
5. Check Status GET /api/authoring/documents/:id/reviews
6. Export       POST /api/authoring/docs/:docId/export?fmt=pdf
7. Freeze       POST /api/authoring/docs/:docId/freeze (immutable snapshot)
8. E-Sign       POST /api/authoring/docs/:docId/e-sign (SHA-256 hash)
```

**Key components**:
- `NewDocumentDialog.tsx` — 3 creation modes (blank/template/AI-generate)
- `UnifiedDocumentEditor.tsx` — TipTap editor with AI autocomplete, citations, compliance scanner
- `SignatureWorkflow.tsx` — 21 CFR Part 11 compliant e-signatures
- `approval-workflow.ts` — Multi-step approval orchestration
- `InlineAnnotations` + `DocumentComments` — Review threads

**Gaps in the lifecycle**:
- No document import/upload backend route (DocumentVault.tsx has Upload UI but no backend)
- No clear path from IN_REVIEW back to DRAFT
- FROZEN status is dead-end (no unfreeze endpoint)
- Documents can be exported without status validation (can export DRAFT)
- Inline annotations don't block export (compliance risk)

---

## TOP PRIORITIES — RANKED BY CLIENT IMPACT

**Must-fix before a biotech client can work with confidence:**

1. **Wire DossierMap to real project-section data.** Replace CTD_STRUCTURE constant with API calls to project-sections endpoints. This is the primary navigation surface.

2. **Kill mock SubmissionReadiness, wire to real readiness engine.** One readiness view, one data source.

3. **Add document subtype field to artifacts.** `documentType: 'csr' | 'protocol' | 'sap' | 'ib' | 'dsur' | 'clinical_overview' | 'quality_summary' | ...` — filterable, queryable, enforceable.

4. **Put readiness metrics on ProjectHomeDashboard.** Overall readiness %, blocker count, module breakdown — visible on first load.

5. **Add submission-type-aware required sections.** When project = IND, show which sections are required vs optional. Warn on missing required sections.

6. **Wire biotech-artifacts generation to UI.** Let clients generate cover letters, protocol synopses, PSURs from the application.

7. **Add IB template and structured support.**

8. **Enforce cross-document dependencies.** At minimum, warn when promoting a summary document whose source sections aren't complete.

---

## WHAT MUST BE TRUE BEFORE CONSIDERING MEDICAL DEVICE / DIAGNOSTICS

- A biotech client can open their project and immediately see real status across their entire dossier
- Every document has a type, and the system knows what types are needed for their submission
- The dossier view shows actual completion, not demo data
- Missing sections and dependencies are flagged, not invisible
- The system answers "what's missing for my IND?" with real data
- The generation endpoints that already exist are accessible to clients
- There is one authoring path, not two parallel systems

---

## CONCLUSION

**The individual document workflow is enterprise-grade. The documentation operating system around it is not yet there. That's the gap.**

**Production Ready For**: Linear single-reviewer document workflows with simple approval chains.

**NOT Ready For**: Complex regulatory environments where documents are frequently imported, merged, or require complex multi-step rejection/revision cycles.

**Friction Score**: 7/10 (medium-high) — happy path works, edge cases break down.

**Showstopper**: Mock data in primary navigation views (DossierMap, SubmissionReadiness) and missing document import.
