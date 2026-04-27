# AnA Document Generation Tool-Coverage Audit
**Date:** 2026-04-27  
**Scope:** Regulatory submission document generation surface for AnA

---

## Part 1 — What the Current Generation Tools Actually Do

### `generate_document` (Lines 348–397 in ClaudeToolDefinitions.ts)
**Handler:** `ClaudeToolExecutor.ts:604–680`

**What it does:** Master document builder that generates **complete regulatory documents from scratch OR fills client-uploaded DOCX templates**. Produces DOCX, PDF, or XML output.

**Input shape:**
```typescript
{
  document_type: string (enum: csr | ctd_module1-5 | cer | 510k | pma | protocol | sap | ib | icsr | ectd_backbone),
  title: string,
  sections?: Array<{number, title, content}>,
  output_format?: 'docx'|'pdf'|'xml',
  agencies?: string[],
  template_path?: string (client-uploaded DOCX),
  replacements?: {placeholder: string}
}
```

**Underlying service:** `getMasterDocumentBuilder()` from `server/services/docx/masterDocumentBuilder.ts`. Handles:
- Scratch generation via `generateFromScratch()` 
- Template filling via `buildFromTemplate()`
- eCTD backbone XML via `generateEctdXml()`
- ICSR E2B(R3) XML via `generateIcsrXml()`

**Persistence:** Output saved to project artifact store; path returned in response.

---

### `build_from_template` (Lines 400–438)
**Handler:** `ClaudeToolExecutor.ts:682–715`

**What it does:** Unpacks a client DOCX template (as ZIP), performs **string placeholder replacement** (e.g., `{{PRODUCT_NAME}}` → "Compound X") and **XML injection** (direct OOXML insertion for complex structures).

**Input shape:**
```typescript
{
  template_path: string,
  replacements: {placeholder: string},
  xml_injections?: Array<{position, xml, placeholder?}>,
  output_format?: 'docx'|'pdf',
  document_title?: string
}
```

**Underlying service:** Same `masterDocumentBuilder`; calls `buildFromTemplate()` with XML injection support.

**Persistence:** Output artifact saved; usage tracked in `ectdTemplates.usageCount`.

---

### `ind_generate_section` (Lines 441–462)
**Handler:** `ClaudeToolExecutor.ts:721–740`

**What it does:** Generates a **single IND CTD section** (e.g., "2.5" Clinical Overview, "3.2.P" Drug Product). Module-specific, structured drafting.

**Input shape:**
```typescript
{
  section_code: string (e.g., "2.5", "3.2.S", "4.2.3"),
  project_id: string,
  product_name: string,
  indication: string,
  sponsor: string,
  phase: string
}
```

**Underlying service:** HTTP POST to `localhost:5000/api/ind-generation/generate-section` (internal IND service). Returns **governed artifact** with regulatory compliance.

**Persistence:** Section saved to project; tracked in artifact table with `module_number`.

---

### `generate_citation` (Lines 172–196)
**Handler:** `ClaudeToolExecutor.ts:374–394`

**What it does:** Formats **regulatory citations** (FDA guidance, ICH guidelines, 21 CFR, EU MDR, ISO standards, journal articles) in the requested style (regulatory/APA/Vancouver).

**Input shape:**
```typescript
{
  source_type: enum (fda_guidance|ich_guideline|eu_mdr|journal_article|21cfr|iso_standard),
  source_identifier: string (e.g., "G94-1", "E6(R2)", "21 CFR 807.87"),
  citation_style?: enum (regulatory|apa|vancouver)
}
```

**Underlying service:** Local `citationTemplates` map (lines 379–386 in executor). No external service; template-based formatting.

**Persistence:** No artifact persistence; returns formatted citation string for inline use.

---

### `rasterize_page` (Lines 481–502)
**Handler:** `ClaudeToolExecutor.ts:754–769`

**What it does:** Renders a specific page of a DOCX or PDF as a **PNG image** for visual inspection. Input is document path + page number + DPI.

**Input shape:**
```typescript
{
  document_path: string,
  page_number?: number (1-based),
  dpi?: number (default 150)
}
```

**Underlying service:** Deferred to `libreoffice --headless` + `pdftoppm`. The executor returns command instructions; actual rasterization happens externally.

**Persistence:** PNG output path returned; not stored in artifact table.

---

### `pdf_overlay` (Lines 505–539)
**Handler:** `ClaudeToolExecutor.ts:771–786`

**What it does:** Overlays **text, images, stamps** onto specific PDF coordinates. Used for form filling, signatures, approval watermarks.

**Input shape:**
```typescript
{
  base_pdf_path: string,
  overlays: Array<{
    page: number,
    type: 'text'|'image'|'stamp',
    x, y: number (points from left/bottom),
    content: string,
    font_size?: number,
    color?: string
  }>,
  output_path?: string
}
```

**Underlying service:** Deferred to PDF library (pdf-lib, PyPDF2, reportlab). Executor queues operations; actual overlay happens externally.

**Persistence:** Output PDF path returned; not tracked in artifact table.

---

## Part 2 — Template & Drafting Infrastructure Inventory

### Database Schema
- **Table:** `ectdTemplates` (shared/schema.ts)
  - `id, organizationId, templateName, granuleId, moduleNumber, category, templateType, content, placeholders, ichGuidance, wordTemplate, isActive, isDefault, version, usageCount, tags`
  - Also: `generatedArtifacts` table with `templateId, documentType, moduleNumber, status, filePath, aiGenerated, aiModel, approvedBy`
  - **Migrations:** Lines 100-103 in `db/migrations/` seed 150+ templates (eCTD modules 1-5, quality, clinical, nonclinical).

### Template Service
- **Location:** `server/services/templateService.ts`
- **Methods:**
  - `getAllTemplates(organizationId, filters)` — fetch + transform with metadata (complexity, expertise, time estimate)
  - `getTemplateById(id)` — single template with content
  - `createTemplate()` — register custom template
  - `trackTemplateUsage()` — increment usage count
  - `duplicateTemplate()` — clone for customization
  - `initializeDefaultTemplates()` — bootstrap org with eCTD defaults
- **Categories supported:** administrative, quality, nonclinical, clinical (plus module-specific overrides)

### AnA Personality & Submission Context
- **Location:** `server/services/ana-personality.ts`
- **Key exports:**
  - `ANA_IDENTITY` — persona definition (lines 15–37)
  - `ANA_EXPERTISE` — knowledge domains (lines 43–63)
  - `ANA_BEHAVIOR` — action guidance (lines 69–89)
  - `ANA_SUBMISSION_CONTEXT[submission_type]` (lines 116–148) — **submission-specific prompts** for 510K, IND, NDA, BLA, MAA, PMA, De Novo, EUA
- **Status:** Voice exemplars exist; specific drafting protocols NOT found in code.

### CSR Builder Service
- **Location:** `server/services/csr-builder.ts`
- **Capabilities:**
  - `launchCSRBuild(request)` — orchestrates ICH E3 section generation
  - `generateCSRSections()` — loops through E3 structure, calls AI or template-based generation
  - `generateSectionWithAI()` — Claude integration for regulatory-quality prose
  - `draftCSRSection()` — single-section on-demand drafting
  - `compareWithExistingCSRs()` — query database for similar studies
  - `analyzeCSRSafetySignals()` — pharmacovigilance analysis
- **Structure:** Full ICH E3 hierarchy (sections 1-16, subsections 2.1-2.10, 8.1-8.2, 9.1-9.7, 10.1-10.2, 11.1-11.4, 12.1-12.5) hardcoded in `ICH_E3_STRUCTURE` (lines 36–107)
- **Status:** Mature; AI-powered OR template fallback; used for CSR generation.

### Master Document Builder
- **Location:** `server/services/docx/masterDocumentBuilder.ts`
- **Capabilities:**
  - `buildFromTemplate()` — unpack DOCX ZIP, replace strings, inject XML
  - `generateFromScratch()` — assemble OOXML from sections
  - `generateEctdXml()` — eCTD leaf metadata + M1 backbone
  - `generateIcsrXml()` — ICH E2B(R3) XML for adverse events
  - OOXML helpers: `ooxmlParagraph()`, `ooxmlHeading()`, `ooxmlTable()`
  - `htmlToOoxml()` — convert HTML prose to OOXML paragraphs
- **Status:** Production-ready for template filling and structured document assembly.

### Client-Side Template UI
- **Location:** `client/src/concept2cure/components/editor/` — **NOT thoroughly surveyed** (out of scope for read-only audit)
- **Evidence:** Routes exist in `server/routes/templates.ts`, `server/routes/templates.routes.ts`, `server/routes/ind-templates.ts`

### Drafting Protocols
- **Status:** NOT FOUND. Prior commit message referenced "feat(ana): add drafting protocols for SAP, PMA SSED, Type B meeting briefings" but these do NOT appear in the codebase as explicit config/registry.
- **Inference:** Likely embedded in `ANA_SUBMISSION_CONTEXT` prompts or missing from this branch.

---

## Part 3 — Document Taxonomy of Regulatory Submissions

### **DRUG Submissions**

| Document Type | Submission | ✅/🟡/❌ | Notes |
|---|---|---|---|
| IND Application | IND | ✅ | `ind_generate_section` tool; full CTD module structure |
| NDA/ANDA | NDA | 🟡 | Generic `generate_document` (type='ctd_module1-5'); no NDA-specific tool |
| BLA | BLA | 🟡 | Generic `generate_document`; no BLA-specific biologics guidance |
| sNDA/sBLA/PAS | Supplement | ❌ | Not covered |
| MAA (EU) | MAA | 🟡 | `ANA_SUBMISSION_CONTEXT['MAA']` prompt only; no structured tool |
| JNDA (Japan) | JNDA | ❌ | Not mentioned |
| Clinical Protocol | Phase 1-4 | 🟡 | Type='protocol'; no ICH E6(R2) structure-aware drafting |
| Study Analysis Plan | Phase 2-4 | 🟡 | Type='sap'; no ICH E9(R1) estimand-aware drafting |
| Investigator's Brochure | All phases | 🟡 | Type='ib'; no module structure |
| Clinical Summary (2.7) | NDA/MAA | 🟡 | `mine_precedents` mentions M2.7; no dedicated tool |
| Clinical Overview (2.5) | NDA/MAA | 🟡 | Supported in templates; no section-specific tool |
| Nonclinical Overview (2.4) | NDA/MAA | 🟡 | Generic module generation |
| Quality Overall Summary (2.3) | NDA/MAA | 🟡 | Generic module generation |
| DMF / ASMF | CMC | ❌ | Not covered |

### **DEVICE Submissions**

| Document Type | Submission | ✅/🟡/❌ | Notes |
|---|---|---|---|
| 510(k) SE Report | 510(k) | 🟡 | `generate_document` type='510k'; `mine_precedents` mentions 510k_substantial_equivalence |
| De Novo Classification | De Novo | 🟡 | `generate_document` generic; `mine_precedents` mentions de_novo_classification |
| PMA + SSED | PMA | 🟡 | Type='pma'; `mine_precedents` mentions pma_ssed; no dedicated tool |
| IDE Application | IDE/Clinical | ❌ | Not mentioned |
| Clinical Evaluation Report (CER) | EU MDR | 🟡 | Type='cer'; `mine_precedents` mentions CER; no section structure |
| IVDR Technical File | IVDR | 🟡 | `mine_precedents` mentions ivdr_technical_file; no tool |
| MDR Technical File | EU MDR | ❌ | Not mentioned (separate from CER) |
| Risk Management File | EU MDR / ISO 14971 | 🟡 | `mine_precedents` mentions risk_management_plan; no tool |

### **EU MDR Specific**

| Document Type | ✅/🟡/❌ | Notes |
|---|---|---|
| CER | 🟡 | Generic 'cer' type; no CER-specific section structure |
| PMCF Plan | ❌ | Not mentioned |
| RMP (Risk Management Plan) | 🟡 | Listed in `mine_precedents`; no tool |
| Module 1 (EU) | 🟡 | Generic module generation |

### **Cross-Jurisdictional**

| Document Type | ✅/🟡/❌ | Notes |
|---|---|---|
| PMDA J-NDA | ❌ | Not mentioned (separate from MAA) |
| Health Canada CTA | ❌ | Not mentioned |
| Health Canada NDS | ❌ | Not mentioned |
| China NMPA Dossier | ❌ | Not mentioned |

### **Operational & Correspondence**

| Document Type | ✅/🟡/❌ | Notes |
|---|---|---|
| Cover Letter | 🟡 | Generic template in `templateService.initializeDefaultTemplates()` |
| IR (Information Request) Response | ❌ | Not covered |
| CRL (Complete Response Letter) Response | 🟡 | `mine_precedents` mentions nda_response; no dedicated tool |
| Day 120/180 Response | ❌ | Not mentioned |
| Type B/C Meeting Briefing | 🟡 | `ANA_SUBMISSION_CONTEXT['IND']` mentions pre-IND; no tool |
| Advisory Committee Briefing | ❌ | Not mentioned |
| Pre-IND / Pre-Submission Briefing | 🟡 | Mentioned in persona; no tool |

### **Quality / CMC**

| Document Type | ✅/🟡/❌ | Notes |
|---|---|---|
| DMF (Drug Master File) | ❌ | Not mentioned |
| CMC Module 3 (Q sections) | 🟡 | Generic module type; templates exist (3.2.S, 3.2.P, 3.2.A) |
| Site Master File | ❌ | Not mentioned |
| Validation Protocols (DQ/IQ/OQ/PQ) | ❌ | Not mentioned |
| Stability Protocol + Report | 🟡 | Templates exist (3.2.S.7, 3.2.P.8); no dedicated tool |

### **Pharmacovigilance**

| Document Type | ✅/🟡/❌ | Notes |
|---|---|---|
| PSUR (Periodic Safety Update Report) | ❌ | Not mentioned |
| DSUR (Development Safety Update Report) | ❌ | Not mentioned |
| REMS / Risk Minimization | ❌ | Not mentioned |
| RMP (Risk Management Plan) | 🟡 | Listed in mine_precedents; no tool |
| J-RMP (Japan) | ❌ | Not mentioned |
| PSMF (Pharmacovigilance System Master File) | ❌ | Not mentioned |
| ICSR (Individual Case Safety Report) | ✅ | Type='icsr'; `generateIcsrXml()` produces E2B(R3) XML |

### **Clinical**

| Document Type | ✅/🟡/❌ | Notes |
|---|---|---|
| Protocol (Study Design) | 🟡 | Type='protocol'; no ICH E6(R2) / E8(R1) structure |
| Statistical Analysis Plan | 🟡 | Type='sap'; no ICH E9(R1) estimand framework |
| Investigator's Brochure | 🟡 | Type='ib'; no regulatory structure |
| CRF (Case Report Form) | ❌ | Not mentioned |
| ICF (Informed Consent Form) | ❌ | Not mentioned |
| Clinical Study Report (CSR) | ✅ | Type='csr'; full ICH E3 structure in `csr-builder.ts`; AI + template generation |

---

## Part 4 — Recommended Tools to Add

### **Tier A — Template Fetching & Structured Assembly**

#### 1. `fetch_template_and_fill`
**When to use:** User has selected a template from the library and wants to fill it with project data without typing out every placeholder.

*AnA voice:* "Templates are only useful if they save time. This tool fetches the template from your library, shows you what needs filling, and lets you pass the values once. The output is a filled DOCX with proper formatting—no copy-paste from spreadsheets. Choose the template first; the tool handles the mechanics."

**Implementation:** Wraps `templateService.getTemplateById()` + `masterDocumentBuilder.buildFromTemplate()`. New business logic: auto-detect placeholders in template, return discovery result to user, then fill on second call.

**Input shape:** `{template_id: number, project_id: number, fill_data?: {placeholder: value}}`

---

#### 2. `assemble_ectd_module_from_artifacts`
**When to use:** You have several completed artifacts (e.g., drug substance overview, manufacturing process, analytical methods) and need them assembled into a single Module 3 document with proper cross-references.

*AnA voice:* "You've drafted the pieces. This assembles them into a CTD module with headers, section numbering, and cross-reference validation. Feed it the artifact IDs, and out comes a finalized DOCX."

**Implementation:** New logic: fetch artifacts by ID, validate CTD section compatibility, apply cross-reference links via `check_dossier_consistency`, inject via XML, generate DOCX.

**Input shape:** `{module_number: string (3.2.S | 3.2.P), artifact_ids: number[], project_id: number}`

---

### **Tier B — Section-Aware Drafting**

#### 1. `draft_510k_substantial_equivalence`
**When to use:** Drafting a 510(k) SE report with predicate device comparison.

*AnA voice:* "Substantial equivalence is 80% about predicate comparison and 20% about your device. I'll structure the SE report with sections for intended use, technological characteristics, performance testing, and labeling. Feed me the predicate K-number, and I'll pull the predicate data; give me your device specs, and I'll draft the comparison."

**Implementation:** Wraps `analyze_predicate_device` (existing), calls Claude for SE narrative drafting, returns structured DOCX sections per FDA 510(k) guidance.

**Input shape:** `{predicate_510k_number: string, device_name: string, intended_use: string, technology_summary: string}`

---

#### 2. `draft_cmc_section_3_2_p_2`
**When to use:** Drafting Pharmaceutical Development (3.2.P.2) — the QbD-heavy manufacturing process section.

*AnA voice:* "Module 3.2.P.2 is where you show FDA that you understand the science, not just follow a recipe. This tool scaffolds the section with headings for formulation development, manufacturing process development, process validation approach, and QbD elements. Feed it your batch data and process parameters."

**Implementation:** New logic specific to ICH Q8/Q9/Q10; Claude drafting with process parameter templates; auto-inject batch release tables.

**Input shape:** `{product_name: string, formulation: string, manufacturing_process: string, process_parameters: {param: value}[]}`

---

#### 3. `draft_clinical_overview_m2_5`
**When to use:** Writing the clinical overview summary (Module 2.5) for NDA/MAA — the executive summary that reviewers skim first.

*AnA voice:* "The clinical overview is what reviewers read while drinking coffee. It has to be clear, compelling, and cite all the right studies. I'll scaffold it with sections for drug development, clinical pharmacology, efficacy, safety, and risk–benefit. You feed me the clinical data summary; I'll draft the narrative."

**Implementation:** Template-based with AI enhancement; auto-cite studies from project artifacts via `check_dossier_consistency`.

**Input shape:** `{project_id: number, studies: {study_id: string, indication: string, n_patients: number, primary_endpoint_result: string}[]}`

---

#### 4. `draft_cer_clinical_evaluation_report`
**When to use:** Drafting a Clinical Evaluation Report (CER) for EU MDR submission — literature-based or clinical-data-based.

*AnA voice:* "The CER is your clinical argument for EU MDR. If it's literature-based, I'll help you structure the evidence synthesis per MEDDEV 2.7.1. If you have clinical data, I'll draft the CER with proper clinical data tables and safety conclusions."

**Implementation:** Two modes: literature synthesis (calls `search_literature`, synthesizes) or clinical data (calls `mine_precedents` for precedent CERs, scaffolds sections, calls Claude).

**Input shape:** `{device_name: string, indication: string, mode: 'literature'|'clinical_data', clinical_studies?: {study_id, n_patients, endpoints}[]}`

---

### **Tier C — Regulatory Metadata & XML Generation**

#### 1. `generate_ectd_leaf_index`
**When to use:** Building an eCTD submission; need to generate the M1 leaf index and sequence.xml mapping all modules to their files.

*AnA voice:* "The eCTD backbone is just XML. You give me the module structure and file manifest; I generate the leaf index, sequence.xml, and regional administrative sections per ICH M8. Safe, deterministic, no surprises."

**Implementation:** Calls `masterDocumentBuilder.generateEctdXml()` with full module list, auto-generates sequence.xml, region-specific M1 sections (FDA/EMA/PMDA).

**Input shape:** `{submission_type: 'original'|'amendment', regions: string[], modules: {module_number: string, files: {path, type}[]}[]}`

---

#### 2. `generate_icsr_batch`
**When to use:** Submitting a batch of adverse event reports in eCTD ICSR format (E2B R3 XML).

*AnA voice:* "ICSRs are structured and repetitive. You give me a spreadsheet of adverse events; I generate valid E2B(R3) XML ready for submission to FDA MedWatch or EMA Eudravigilance."

**Implementation:** Extends `masterDocumentBuilder.generateIcsrXml()` to loop over batch, validate against ICSR schema, return ZIP of individual XmlFiles + envelope.

**Input shape:** `{drug_name: string, events: {event_id, reaction_term, onset_date, outcome, seriousness}[]}`

---

#### 3. `generate_idmp_substance_information`
**When to use:** Submitting to NMPA or other regulators that require ISO 11616 IDMP substance coding.

*AnA voice:* "IDMP is the ISO standard for drug substance / drug product identification and coding. Regulators like NMPA, Health Canada, and increasingly EMA want it in submissions. This tool generates valid IDMP XML for your active ingredients and excipients."

**Implementation:** New integration with IDMP database or lookup service; generates ISO 11616 compliant XML.

**Input shape:** `{drug_substance: {name, cas_number}, drug_product: {form, strength}, routes: string[]}`

---

### **Tier D — Correspondence & Response Drafting**

#### 1. `draft_fda_information_request_response`
**When to use:** FDA sent a Day 74 Information Request; you need to draft the response addressing each question.

*AnA voice:* "FDA's IR is predictable: they ask about missing sections, endpoints, safety pool size, manufacturing specs. This tool takes their questions, queries your submission package, finds the relevant data, and drafts a response. You review, I refine."

**Implementation:** Parses IR letter (extract questions), calls `lookup_regulatory_precedents` for similar responses, calls Claude to draft response sections, assembles cover letter + responses.

**Input shape:** `{ir_document_path: string, project_id: number, responses_data?: {question_id: number, answer: string}[]}`

---

#### 2. `draft_type_b_meeting_briefing`
**When to use:** FDA Type B meeting coming up; need to brief the review division on your development strategy.

*AnA voice:* "Type B meetings are where you teach reviewers your story before they read your submission. The briefing document walks through development program, clinical strategy, CMC approach, and asks for guidance. This tool scaffolds the briefing with the right sections and tone."

**Implementation:** Uses `ANA_SUBMISSION_CONTEXT['IND']` + `mine_precedents` to find similar meeting briefings, scaffolds sections (program overview, clinical strategy, regulatory pathway, specific questions), calls Claude for prose.

**Input shape:** `{product_name: string, indication: string, phase: string, specific_questions: string[]}`

---

#### 3. `draft_crl_response_strategy`
**When to use:** Complete Response Letter received; need to plan and draft responses to major deficiencies.

*AnA voice:* "A CRL is not a failure; it's a negotiation. This tool analyzes the CRL categories (clinical, CMC, biostatistics), groups deficiencies, looks up precedent CRL responses, and drafts your strategy for each. You decide what to address vs. debate."

**Implementation:** CRL parsing (extract deficiencies by category), `lookup_regulatory_precedents` for precedent CRL resolutions, `simulate_reviewer_challenges` to anticipate follow-up, draft response memo + supporting section revisions.

**Input shape:** `{crl_document_path: string, project_id: number, deficiency_categories: string[]}`

---

#### 4. `draft_pediatric_investigation_plan`
**When to use:** Drug is developable in pediatric population; FDA/EMA asks for PIP.

*AnA voice:* "Pediatric investigation plans are templates with regulatory teeth. They require age-stratified development strategy, dosing rationale, safety / efficacy endpoints appropriate for each age. I'll scaffold the PIP per ICH E11(R1) and EMA guidelines."

**Implementation:** Template-based (EMA vs. FDA variants), auto-cite ICH E11(R1) / guidance, calls Claude for development strategy narrative per age group.

**Input shape:** `{product_name: string, indication: string, adult_trial_design: string, pediatric_ages: string[], target_regions: string[]}`

---

### **Tier D (cont.) — Additional High-Value Tools**

#### 5. `draft_advisory_committee_briefing`
**When to use:** Product going to FDA advisory committee; need briefing document for the committee.

**AnA voice:** "Advisory committee briefings are different from Type B meetings — they're for external experts who will vote on approvability. The briefing is your chance to show the committee your efficacy/safety case clearly. This tool scaffolds slides or briefing memo with sections for unmet need, your clinical data, risk–benefit analysis, and anticipated questions."

**Implementation:** Calls `lookup_regulatory_precedents` for precedent committee briefings, scaffolds with regulatory best practices, auto-generates tables from project efficacy/safety data.

**Input shape:** `{product_name: string, indication: string, primary_efficacy_result: string, major_safety_signals: string[], committee_focus_areas: string[]}`

---

## Top 5 Highest-Value Recommendations

Ranked by **client value × wires-not-builds urgency**:

### 1. **`draft_510k_substantial_equivalence`** (Tier B)
- **Client value:** Device shops spend 2–3 weeks on SE reports; this cuts it to 1 week (if predicate is clear).
- **Build type:** Wires (uses existing `analyze_predicate_device` + new Claude prompt for SE narrative).
- **Why top:** 510(k) is the high-volume device pathway; SE is the bottleneck.

### 2. **`fetch_template_and_fill`** (Tier A)
- **Client value:** Eliminates manual copy-paste; ensures all templates in library are actually used.
- **Build type:** Wires (uses existing `templateService` + `masterDocumentBuilder`; adds placeholder discovery logic).
- **Why top:** Low effort, immediate ROI (every client will use it weekly).

### 3. **`draft_clinical_overview_m2_5`** (Tier B)
- **Client value:** The clinical overview is 40% of what reviewers read first; gets it done in a day instead of a week.
- **Build type:** Wires + small new business logic (auto-cite artifact integration).
- **Why top:** NDA/MAA is the high-value pharma pathway; M2.5 is the bottleneck.

### 4. **`draft_fda_information_request_response`** (Tier D)
- **Client value:** Information Requests are stressful and time-critical (14-day response window). This takes 3 days instead of 7.
- **Build type:** Wires (existing precedent lookup + Claude drafting + IR parsing).
- **Why top:** Regulatory correspondence is **stressful** and high-stakes; saves time = saves anxiety.

### 5. **`assemble_ectd_module_from_artifacts`** (Tier A)
- **Client value:** Submitters often have artifacts in the system but have to manually copy them into a final DOCX. This automates it.
- **Build type:** Wires (uses existing dossier consistency check + `masterDocumentBuilder` XML injection).
- **Why top:** Mid-to-high-frequency use; feels magical to users (chaos → order).

---

## Conclusion

**Current state:** AnA has 3 core document generation tools (`generate_document`, `build_from_template`, `ind_generate_section`) and 2 output-rendering tools (`rasterize_page`, `pdf_overlay`). **Infrastructure is solid** — template library, CSR builder, master document builder, AI integration. **Coverage is sparse** — most regulatory document types are covered by generic "generate_document" with no structure-aware scaffolding.

**Gap:** 12 additional tools would cover 80% of the document generation surface with minimal new business logic. Top 5 are wires-not-builds, achievable in 1–2 sprint cycles. **These tools would transform the platform from "helps you write" to "writes it for you (with your data)."**

