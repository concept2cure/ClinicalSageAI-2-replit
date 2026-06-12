# Document Platform Audit — Authoring → Formatting → Publishing → Agency Submission

**Date:** 2026-06-12
**Scope:** Document authoring, editing, creation, formatting, template design, generation of final products (DOCX/PDF), and publishing of large PDFs and submission packages (eCTD) to regulatory agencies and other required file types — measured against the platform's stated goals and the goals of its clients.
**Method:** Full codebase exploration (client, server, migrations, tests, templates) reconciled against the root strategy and audit corpus (`FEATURE_INVENTORY.md`, `C2C_PRODUCT_AUDIT_QUESTIONNAIRE_RESPONSES.md`, `HI_8_ECTD_SCOPING_BRIEF.md`, `DOCUMENT_FORMATTING_TEMPLATE_BRIEF.md`, `SWARM_AUDIT_2026-06-09.md`, `EXPERT_SWARM_EVALUATION_2026-06-08.md`, `GA_READINESS_PLAN_STUDY_PROTOCOL_2026-05-29.md`, `CLIENT_ONBOARDING_GA_BUILD_PLAN_2026-03-25.md`, and others).

---

## 1. Executive summary

The document pipeline has six stages. Verdict per stage:

| Stage | Verdict | One-line state |
|---|---|---|
| **1. Author / edit** | 🔴 Weakest link | TipTap editor is a stub; real Yjs co-authoring, versioning, comments, approval, and e-sign backends exist but are not wired to any UI |
| **2. Format / template** | 🟢 Production | Template engine (extract client branding from DOCX/PDF → render in client format) shipped May 2026, tested, AI-integrated |
| **3. Generate (DOCX/PDF)** | 🟢 Production core | `docxFactory` + deterministic DOCX→PDF (LibreOffice/Puppeteer) + deterministic leaf PDF renderer; PDF/A code ready but not deployed |
| **4. Assemble (eCTD) | 🟡 60–75% ready | Real v3.2.2 backbone, FDA/EMA/PMDA regional XML, MD5 index, ZIP; blocked by un-vendored DTDs and leaf-content wiring |
| **5. Validate / QC** | 🟡 Internal only | Structural + regional validators real; no external eValidator gate, no PDF/A enforcement, no font-embedding/linearization QC |
| **6. Transmit** | 🟡 Real, credentials-gated | Genuine AS2 (FDA ESG), OAuth2 (EMA CESP), mTLS+HMAC (PMDA) clients; fail closed without credentials; no ACK polling/retry |

**The single most important finding:** the codebase is materially **ahead of the platform's own audit documents**. The February 2026 audits (`C2C_PRODUCT_AUDIT_QUESTIONNAIRE_RESPONSES.md`) recorded "PDF export ❌ not implemented" and "eCTD XML export ❌ missing (P0)". Both are now substantially built — the template engine landed 2026-05-31 (`migrations/20260531_template_specs.sql`), the eCTD packagers and the three agency gateway clients are real code with tests, and post-`SWARM_AUDIT_2026-06-09` the fabricated outputs (random ACK numbers, hardcoded "ACCEPTED") were replaced with honest fail-closed behavior. Internal documentation should be refreshed so sales, QC, and engineering are working from the same truth.

**The inverse finding:** the back half of the pipeline (format → transmit) outran the front half. A client today could have AnA draft a section, render it in their corporate template as DOCX and PDF, assemble it into a region-correct eCTD ZIP — but they cannot comfortably *edit* that document in the product, track changes, resolve reviewer comments, compare versions, or click through an approval chain. The authoring experience is the gap between "impressive demo" and "daily-use tool", and it is also the stage where every existing backend is already built and waiting for a UI.

**What stands between today and a real agency submission** is small and concrete: vendor the ICH DTDs (licensed drop-in), put Ghostscript + veraPDF + LibreOffice in the deployment image, wire authored content into leaf rendering, consolidate to one eCTD generator, and add an external eValidator dry-run gate. That is weeks, not quarters.

---

## 2. Goals and objectives baseline

What the platform is for, per the strategy corpus — this is the yardstick the rest of the report measures against.

**Mission** (`FEATURE_INVENTORY.md`, `CONCEPT2CURE_MASTER_ROADMAP.md`): an *Intelligent Regulatory Operating System* — "what Harvey did for law, C2C does for life sciences." AI-drafted regulatory submissions in hours rather than weeks, with 21 CFR Part 11-compliant audit trails, e-signatures, real-time collaboration, and submission-as-asset lifecycle (DRAFT → REVIEW → APPROVED → SUBMITTED → ACCEPTED).

**Clients** (`EXPERT_SWARM_EVALUATION_2026-06-08.md`): small/mid-cap biotech sponsors (who currently spend $2–5M per submission on consultants), CROs/regulatory writing shops, and medtech/IVD companies (510(k), PMA, EU MDR/IVDR). Buyer personas: VP Regulatory Affairs, CMC author, biostatistician, eCTD publishing lead, QA/Part 11 auditor.

**Client jobs-to-be-done for documents specifically:**
1. Draft regulatory documents (IND modules, protocols, IBs, CSRs, 510(k) sections) with AI, grounded in their own evidence with sentence-level traceability.
2. Edit and review collaboratively — track changes, comments, versions, approvals, e-signatures — under Part 11.
3. Produce final products in **their own corporate template** (Word and PDF).
4. Assemble valid, validated eCTD/eSTAR/technical-file packages.
5. Transmit to FDA/EMA/PMDA and track acknowledgments.

**Stated GA posture** (`C2C_PRODUCT_AUDIT_QUESTIONNAIRE_RESPONSES.md`, Feb 2026): ~52% ready, 10 P0 gaps, no-go until P0s closed. Document-relevant P0s: eCTD export, Module 5 (CSR) authoring, sentence-level traceability, removal of fabricated outputs (since largely fixed per `SWARM_AUDIT_2026-06-09.md`). Roadmap direction: **Phase 9 "Universal Authoring"** — one document editor replacing the per-pathway editors (`READ_ME_FIRST.md`).

---

## 3. What we have — stage by stage

Maturity legend: ✅ production (tested, wired, used) · 🟡 real but unwired (backend works, no UI/integration) · ⚠️ stub (routes/tables only) · ❌ missing.

### 3.1 Authoring and editing

| Capability | Status | Where |
|---|---|---|
| Rich-text editor (client) | ⚠️ stub | `client/src/components/ui/editor.jsx` — TipTap 3.x with bold/italic/headings/lists only; no tables, links, images, comments, or track changes |
| Real-time co-authoring backend | 🟡 real, zero UI | `server/routes/realtime-collab.ts` — Yjs CRDT + WebSocket, presence, document locks (exclusive/shared/advisory), Part 11 audit per edit, Postgres persistence. `@tiptap/y-tiptap` is in `package.json` but never connected |
| Co-author document model | ⚠️ stub | `server/routes/coauthor.ts` + tables `coauthor_documents`, `coauthor_sections`, `coauthor_annotations`, `coauthor_document_versions`, `coauthor_status_history` — CRUD only, no editor integration |
| Versioning | ⚠️ stub | `coauthor_document_versions` table with change summaries; no browse/diff UI |
| Comments / annotations | ⚠️ stub | `coauthor_annotations` table; no UI |
| Track changes | ❌ | Nothing in the editor; DOCX export supports tracked changes but authoring does not produce them |
| Approval workflow | ⚠️ stub | `server/routes/approval-workflow.ts` — start/approve/reject/delegate/pending endpoints over `shared/schema/unified_workflow`; minimal integration |
| E-signature (Part 11) | 🟡 real backend | `server/routes/esignature.ts` — server-side bcrypt password re-verify + TOTP + SHA-256 content hash into `electronic_signatures`; client UI placeholder |
| AI drafting | ✅ | `server/services/ana-capability-registry.ts` — ~30 registered draft capabilities (draft-csr, draft-protocol, draft-ind-module, draft-510k, draft-cmc, compliance scans…) dispatched through governed AI actions |
| IND autodraft (Modules 1–5 from uploads) | 🟡 scaffolded | `server/routes/ind-autodraft.ts` — section list + generate-section routes; backend AI plumbing incomplete |
| Authoring scaffolds | ✅ | `server/services/templates/nonclinical-templates.ts` — Module 4.2.x study reports, 2.6 summaries, FIH dose-justification memo, with placeholder tokens; tested |

### 3.2 Formatting and template design

This is the strongest, most recently shipped layer (per `DOCUMENT_FORMATTING_TEMPLATE_BRIEF.md`, all §5 acceptance criteria met; 25/25 tests in `tests/services/template-engine.test.ts`):

- **Renderer-neutral TemplateSpec** (`server/services/templates/templateSpec.ts`): page size/orientation/margins, body+heading typography, colors, brand (logo with placement, confidentiality notice), header/footer with page numbering, table styling, named styles. `formFields` is modeled but not yet detected.
- **Extraction** (`templateExtractor.ts`): client uploads their corporate DOCX (or PDF, best-effort) → spec extracted from `sectPr`/`pgMar`/`docDefaults`/styles/theme fonts/headers/footers/media, with a confidence score and warnings surfaced to the user before saving.
- **Storage + API**: org-scoped `c2c_template_specs` table (`migrations/20260531_template_specs.sql`), audited CRUD + render endpoints at `server/routes/c2c/templates.ts`.
- **Rendering** (`templateRenderAdapter.ts`, `templateHtml.ts`): spec → `docxFactory` style (Word) and → print-CSS HTML → PDF, including embedded logo.
- **AI integration**: `extract-template-from-upload` and `render-document-with-template` AI-action handlers — the conversational flow "drop your template → AnA extracts → you confirm → AnA renders your document in it" works end to end.
- **Default regulatory look** when no template is chosen: Times New Roman 12pt body / Arial headings, 1″ margins (1.25″ left), confidentiality footer with page numbers (`server/services/docx/docxFactory.ts` `DEFAULT_DOCX_STYLE`).

**Not yet in the template engine** (acknowledged follow-ups, brief §6): form-field detection/recreation (`<w:sdt>`, `<w:fldChar>`), logo on pdfkit-path eCTD project PDFs, higher-fidelity PDF extraction, persistence of conversational template edits as memory atoms, and — most user-visible — **no template-management UI** (browse/preview/verify/choose-at-export; routed through the `ui_kits/` design-system process and not started).

### 3.3 Final-product generation (DOCX, PDF)

| Capability | Status | Where |
|---|---|---|
| DOCX generation | ✅ | `server/services/docx/docxFactory.ts` (~1,000 lines; `docx` v9.5.1; template-driven; dual output .docx + .source.json for regeneration) |
| DOCX→PDF conversion | ✅ (needs deploy) | `server/services/pdf-converter.ts` — LibreOffice headless primary (high fidelity), Puppeteer fallback; deterministic metadata stripping for audit reproducibility |
| Text→PDF leaf rendering | ✅ | `server/services/ectd/leaf-pdf-renderer.ts` — pure pdf-lib, byte-deterministic, paginating; text-fidelity only (no styled layout) |
| PDF bookmarks/outline | ✅ | `server/services/ectd/pdf-bookmark-generator.ts` — nested outlines per FDA guidance |
| PDF/A-1b conversion | 🟡 code ready, not deployed | `server/services/ectd/pdfa-pipeline.ts` — Ghostscript + veraPDF; **silently no-ops when binaries are absent** |
| PDF compression | ✅ (needs deploy) | `server/services/pdf-compression-service.ts` — five Ghostscript quality profiles |
| OCR | 🟡 | `server/integrations/ocrmypdf/client.ts` — graceful CLI wrapper |
| Fonts | ⚠️ | `/fonts/` DejaVu files are 0-byte placeholders; leaf renderer uses built-in Helvetica/Times (no embedding) |

### 3.4 Submission assembly (eCTD and other packages)

Per `HI_8_ECTD_SCOPING_BRIEF.md` and code verification — **60–75% agency-submittable**:

- **Two live generators, one dead**: `server/services/ectdExportService.ts` (DB-backed, highest fidelity) and `server/services/submission-gateways/regional-packager.ts` (cleanest per-region XML, used by governed AnA tools). `server/src/services/reg/{indexXml,packager}.ts` is orphaned; a legacy Python eCTD stack never starts. Consolidation is overdue.
- **eCTD v3.2.2 backbone**: index.xml per ICH M8, regional m1 backbones for FDA (`us-regional.xml`), EMA (`eu-regional.xml`), PMDA (`jp-regional.xml`); ICH M4 folder tree m1–m5; per-leaf MD5 in `util/index-md5.txt`; JSZip packaging. eCTD 4.0 JSON path exists with zero callers.
- **Submission Center lifecycle** (`server/routes/submissions.ts`, `server/services/submission-service/`): draft → assembling → validated → frozen → dispatched, with RBAC, Zod validation, tenant scoping, audit; freeze/dispatch/transmit gated behind e-signature (`GOVERNANCE_BINDING_CONTRACT.md` pattern). `POST /api/submissions/:id/sequences/:seqId/assemble` returns `{ sha256, sizeBytes, fileCount }`.
- **Device side**: MDR/IVDR technical-file assembly produces Annex II/III ZIP structure (leaf rendering TBD); eSTAR validation (`eSTARValidator.ts`) checks 2-6-2 filenames, lifecycle operators, regional rules.
- **Blockers**: ICH/regional **DTDs are not vendored** — `assets/ectd-dtd/` contains only a README (the files are licensed and must be dropped in manually), and `validateEctdPackage()` correctly flags packages "not submission-ready" without them. **STF** (`stf-generator.ts`) writes an envelope but doesn't cross-link M4/M5 study leaves. **Leaf content wiring** from authored documents into leaf rendering is incomplete (brief gap G4).

### 3.5 Validation and QC

| Check | Status |
|---|---|
| Structural (filenames 2-6-2, MD5 format, completeness, lifecycle operators) | ✅ `server/services/ectd/ectd4-validator.ts` |
| Regional rules (FDA 4GB, EMA 600MB + filename/path limits, PMDA 1GB) | ✅ `server/services/ectd/ectd-regional-rules.ts` |
| Pre-transmission integrity (checksums) | ✅ `server/services/submission-gateways/bundle-integrity.ts` |
| PDF/A conformance | 🟡 detect-only without binaries (`pdfa-detect.ts`; veraPDF optional) |
| External eValidator dry-run (Lorenz/GlobalSubmit-class) | ❌ none — internal validators only |
| Font embedding, fast web view (linearization), page-size QC | ❌ not checked |

### 3.6 Transmission to agencies

Real protocol implementations, honest about credentials (post-SWARM-audit):

- **FDA ESG** (`server/services/submission-gateways/fda-esg.ts`): AS2 over HTTPS with SFTP fallback, mTLS client certs; `CredentialError` when unconfigured.
- **EMA CESP + EUDAMED** (`ema-cesp.ts`): OAuth2 client-credentials (CESP) and mTLS (EUDAMED device path).
- **PMDA** (`pmda-gateway.ts`): mTLS + HMAC-SHA256 signatures, multi-byte filename support.
- Receipts recorded in `submission_transmittals`; everything audit-logged. **Missing**: ACK1/2/3 polling and status tracking, automatic retry, and a sanctioned test-gateway workflow.

### 3.7 Other output formats

| Format | Status |
|---|---|
| DOCX export (incl. tracked changes on export) | ✅ |
| eCTD ZIP (FDA/EMA/PMDA) | 🟡 (see 3.4) |
| eSTAR / device technical file | 🟡 structure only |
| Health Canada regional backbone | ❌ |
| Define-XML / CDISC SDTM-ADaM / SAS datasets | ❌ references only |
| SPL (Structured Product Labeling) XML | ⚠️ validation stub only (`spl-fhir.ts`) |
| CTIS (EU clinical trials) | ❌ |

---

## 4. Gap register — what we still need

### P0 — blocks a real agency submission (the GA bar)

| # | Gap | Evidence | Fix shape |
|---|---|---|---|
| P0-1 | **ICH/regional DTDs not vendored** — every package self-flags "not submission-ready" | `assets/ectd-dtd/` has README only; `ectdExportService.bundleVendoredDtds` | Obtain licensed DTD set, drop into `assets/ectd-dtd/`, CI check that they exist in deploy artifact. Days. |
| P0-2 | **Deployment image lacks LibreOffice, Ghostscript, veraPDF** — high-fidelity DOCX→PDF, PDF/A-1b, and compression all silently degrade | `pdf-converter.ts`, `pdfa-pipeline.ts` graceful no-ops | Add binaries to `Dockerfile.optimized`/Helm images; **flip silent degradation to a hard submission-path failure** (a regulated pipeline must not quietly skip PDF/A). Days. |
| P0-3 | **Authored content not wired into leaf rendering** (HI-8 G4) — packages assemble, but with placeholder/text-only leaves rather than the documents users wrote | `assemble-from-core.ts` ↔ `coauthor_documents` | Materialize coauthor/artifact content → `pdf-converter.ts` → PDF/A → leaf. ~1–2 weeks. |
| P0-4 | **No external eValidator gate** — internal validation only; agencies use Lorenz-class validators | No integration code anywhere | Integrate a commercial eValidator API or a documented manual dry-run step in dispatch-readiness (`dispatch-gate.ts` is the natural seam). ~2 weeks incl. vendor selection. |
| P0-5 | **Module 5 / CSR authoring missing** — refuse-to-file gap for NDA/BLA, flagged P0 since February | `C2C_PRODUCT_AUDIT_QUESTIONNAIRE_RESPONSES.md` | Extend nonclinical-template pattern to ICH E3 CSR scaffolds + AnA draft capability + M5 leaf mapping. ~3–4 weeks for scaffold-grade. |
| P0-6 | **Three parallel eCTD generators** (one dead) + dead Python stack — drift risk on the most safety-critical artifact | HI-8 G2/G6/G7 | Make `regional-packager.ts` (fed by `core-to-packager.ts`) the only path; delete `server/src/services/reg/` and the Python stack. ~1 week. |
| P0-7 | **STF not cross-linked to study leaves** | `stf-generator.ts` | Tag M4/M5 study leaves into STF per spec. Days. |

### P1 — blocks daily-use authoring (the client-experience bar)

These all share one property: **the backend already exists**; the work is UI design (per `HANDOFF.md` / `ui_kits/` process) plus wiring.

| # | Gap | Backend that's waiting |
|---|---|---|
| P1-1 | Editor is a stub — no tables, links, images, citations in the writing surface | TipTap extensions already in `package.json` (table, link, mention, task-list) |
| P1-2 | Real-time co-authoring has no client | `realtime-collab.ts` Yjs server + `@tiptap/y-tiptap` |
| P1-3 | No track changes / redline in authoring | `coauthor_document_versions` for diff basis; DOCX export already supports tracked changes |
| P1-4 | No comment/annotation UI | `coauthor_annotations` |
| P1-5 | No version browse/compare UI | `coauthor_document_versions` |
| P1-6 | No approval-workflow UI (queue, step history, reject dialog) | `approval-workflow.ts` |
| P1-7 | E-signature UI placeholder (and §11.50 signature manifestation — printed name/date/meaning — not fully wired) | `esignature.ts` |
| P1-8 | No template-management UI (browse, preview, verify extraction, pick at export) | Full template REST API |
| P1-9 | Sentence-level source traceability (the product's core promise) is claim-level only | Citation plugin + provenance events exist |
| P1-10 | TOC/heading-numbering not automated in generated documents (AnA-mediated only) | `document-analysis.ts` heading parser |

### P2 — expansion (market and format reach)

- **Form-field recreation** in templates (`<w:sdt>`/`<w:fldChar>` detection → fillable outputs) — needed for FDA forms beyond the three Jinja2 templates (1571/1572/3674 in `templates/forms/`).
- **PDF polish for large submissions**: font embedding (replace 0-byte `/fonts/` placeholders), fast-web-view linearization, intra-PDF cross-reference hyperlinking, page-size QC — FDA reviewer ergonomics for multi-hundred-page documents.
- **ACK lifecycle**: poll and surface ACK1/2/3 from ESG/CESP, retry policy, test-gateway workflow.
- **Regions/formats**: Health Canada `ca-regional.xml`; eCTD 4.0 (activate the zero-caller path when agencies require it); CTIS; Define-XML/CDISC datasets; SPL XML generation.
- **EU MDR CER service is broken** ("UnifiedCERService not wired") — must be fixed before any device demo.
- **Veeva Vault coexistence** — absent entirely; gates enterprise pharma deals (`EXPERT_SWARM_EVALUATION_2026-06-08.md`).
- **Lifecycle/maintenance RA** — variations, supplements, annual reports, RFI/IR response: 80% of a regulatory team's real workload, currently out of scope.
- **Corpus**: regulatory evidence corpus is ~4 PDFs + ~8 CSV rows; grounded drafting quality is capped until real corpus ingestion.

### Documentation debt

`C2C_PRODUCT_AUDIT_QUESTIONNAIRE_RESPONSES.md` and `PHASE6` audit claims ("PDF export not implemented", "eCTD export missing") are now false. Stale internal audits are their own risk — they understate the product to buyers and misdirect engineering priority. Refresh after each shipped phase.

---

## 5. Enhancement and expansion roadmap

### Phase A — "One real submission, end to end" (~4–6 weeks, mostly backend/devops)

Goal: a pilot client's IND sequence 0000 passes an external eValidator and transmits to the FDA test gateway.

1. Vendor DTDs (P0-1) + binaries into deploy image (P0-2) — *days; do first*.
2. Make PDF/A + LibreOffice degradation **fail closed** on the submission path.
3. Wire authored content → leaf rendering (P0-3).
4. Consolidate generators, delete dead paths (P0-6); STF cross-linking (P0-7).
5. External eValidator integration as a dispatch-gate requirement (P0-4).
6. CSR/Module 5 scaffolds + AnA draft capability (P0-5) — can run in parallel.
7. Prove it: scripted end-to-end test — author → template render → assemble → validate (internal + external) → transmit to ESG test endpoint with staging credentials.

### Phase B — "A place writers live" (~6–10 weeks, mostly UI; follows `ui_kits/` design process)

Goal: a regulatory writer drafts, reviews, and approves entirely in-product. Aligns with the Phase 9 "Universal Authoring" roadmap direction.

1. Build the real editor: extend TipTap with tables/links/images/citations; connect `y-tiptap` to the existing Yjs server (P1-1/P1-2). This single integration activates presence, locks, and Part 11 edit audit that already work server-side.
2. Versions panel + diff view over `coauthor_document_versions` (P1-5), then track-changes overlay derived from version diffs (P1-3).
3. Comment threads over `coauthor_annotations` (P1-4); approval queue UI over `approval-workflow.ts` (P1-6); e-sign modal completing §11.50 manifestation (P1-7).
4. Template-management surface (P1-8) — browse/preview/verify/choose-at-export; closes the loop on the strongest backend in the platform.
5. Sentence-level traceability in the editor (P1-9) — citation marks resolving to source spans; this is the product's headline differentiator.

### Phase C — "Expand reach" (quarter+ horizon, sequence by pipeline)

1. PDF polish for reviewer ergonomics (fonts, linearization, hyperlinks) and ACK lifecycle tracking.
2. Fix EU MDR CER service; finish device technical-file leaf rendering (IVD/medtech clients).
3. Form-field templates; Health Canada; then eCTD 4.0 / CTIS / Define-XML / SPL as client demand dictates.
4. Veeva Vault coexistence and lifecycle-RA workflows (enterprise expansion).
5. Corpus ingestion at scale to raise drafting quality.

### Sequencing rationale

Phase A is small, unblocks revenue-critical credibility ("can it actually submit?"), and requires no design work. Phase B is where clients spend their days and where every backend is already paid for — it converts sunk engineering into visible product. Phase C broadens the market only after the core pipeline is trustworthy end to end.

---

## 6. Sources

**Code (verified present on this branch):** `server/services/templates/*`, `server/services/docx/docxFactory.ts`, `server/services/pdf-converter.ts`, `server/services/pdf-compression-service.ts`, `server/services/ectd/*` (leaf-pdf-renderer, pdfa-pipeline, pdf-bookmark-generator, ectd4-validator, ectd-regional-rules, stf-generator, assemble-from-core, core-to-packager, dispatch-gate), `server/services/submission-gateways/*` (fda-esg, ema-cesp, pmda-gateway, regional-packager, bundle-integrity), `server/services/ectdExportService.ts`, `server/routes/{coauthor,realtime-collab,approval-workflow,esignature,submissions,ectd-export,ind-autodraft}.ts`, `server/routes/c2c/templates.ts`, `server/services/ana-capability-registry.ts`, `client/src/components/ui/editor.jsx`, `templates/{ectd,forms}/`, `migrations/20260531_template_specs.sql`, `assets/ectd-dtd/README.md`, `tests/services/template-engine.test.ts`.

**Documents:** `DOCUMENT_FORMATTING_TEMPLATE_BRIEF.md`, `HI_8_ECTD_SCOPING_BRIEF.md`, `SUBMISSION_CENTER.md` / `SUBMISSION_CENTER_API.md`, `C2C_PRODUCT_AUDIT_QUESTIONNAIRE_RESPONSES.md`, `SWARM_AUDIT_2026-06-09.md`, `EXPERT_SWARM_EVALUATION_2026-06-08.md` (+ parts 2–3), `FEATURE_INVENTORY.md`, `READ_ME_FIRST.md`, `CLIENT_ONBOARDING_GA_BUILD_PLAN_2026-03-25.md`, `GA_READINESS_PLAN_STUDY_PROTOCOL_2026-05-29.md`, `PRODUCT_QC_REVIEW_2026-06-08.md`, `GOVERNANCE_BINDING_CONTRACT.md`, `HANDOFF.md`.
