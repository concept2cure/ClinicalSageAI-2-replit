/**
 * @fileoverview Module Intelligence Layer
 * @module server/services/module-intelligence
 * @version 1.0.0
 *
 * @description
 * Deep domain intelligence for each product vertical. When AnA RI
 * knows the user is working in a specific module, this layer provides
 * the regulatory knowledge, document templates, workflow guidance,
 * and evidence synthesis capabilities specific to that domain.
 *
 * Five Product Verticals:
 * 1. Medical Device & Diagnostics (510(k), PMA, De Novo, EU MDR/IVDR)
 * 2. eCTD Co-Author (Modules 1-5, ICH M4/M8, electronic publishing)
 * 3. CMC Wizard (ICH Q-series, stability, process validation, batch analysis)
 * 4. Document Canvas (Docx/PDF generation, templates, collaborative editing)
 * 5. Vault (Document management, signatures, retention, regulatory holds)
 *
 * Plus cross-cutting intelligence layers:
 * - Evidence Engine (literature search, meta-analysis, GRADE assessment)
 * - Insight Synthesis (competitive intelligence, regulatory precedent)
 * - Strategic Advisor (pathway selection, accelerated programs)
 * - Safety Signal Detection (FAERS, signal algorithms, CIOMS)
 *
 * @compliance FDA 21 CFR Part 11, ICH guidelines, EU MDR 2017/745
 */

import type { UserIntelligence, ProjectSummary } from './user-intelligence.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface ModuleIntelligence {
  moduleId: string;
  systemPromptAddon: string; // Added to Lumen's system prompt
  availableCapabilities: string[]; // What Lumen can do in this module
  documentTypes: DocumentType[]; // Templates and doc types available
  workflowStages: WorkflowStage[]; // Standard workflow for this module
  regulatoryReferences: RegulatoryReference[]; // Key guidelines
  evidenceRequirements: EvidenceRequirement[]; // What evidence is needed
}

export interface DocumentType {
  id: string;
  name: string;
  description: string;
  category: string;
  template: string; // Template identifier
  requiredFields: string[]; // Fields that must be populated
  regulatoryBasis: string; // Which regulation requires this
  aiDraftable: boolean; // Can Lumen draft this?
  estimatedHours: number; // Estimated time to complete
}

export interface WorkflowStage {
  id: string;
  name: string;
  description: string;
  requiredDocuments: string[];
  approvalRequired: boolean;
  estimatedDays: number;
}

export interface RegulatoryReference {
  id: string;
  title: string;
  authority: string; // FDA, EMA, ICH, ISO, etc.
  citation: string;
  relevance: string;
}

export interface EvidenceRequirement {
  category: string;
  description: string;
  sources: string[];
  criticalityLevel: 'critical' | 'important' | 'supporting';
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. MEDICAL DEVICE & DIAGNOSTICS INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════════════════

function getMedicalDeviceIntelligence(project: ProjectSummary | null): ModuleIntelligence {
  const submissionType = project?.submissionType?.toUpperCase() || '510K';
  const is510k = submissionType === '510K' || submissionType === '510(K)';
  const isPMA = submissionType === 'PMA';
  const isDeNovo = submissionType === 'DE_NOVO';

  const basePrompt = `
## Medical Device & Diagnostics Intelligence — Active Module

You are operating in Medical Device regulatory mode. Your expertise covers:
- FDA device classification (Class I/II/III) and submission pathway selection
- Predicate device identification and substantial equivalence argumentation
- Design Controls per 21 CFR 820 (Design History File, V&V, Design Reviews)
- Biocompatibility testing per ISO 10993 series
- Software as Medical Device (SaMD) per IEC 62304 and FDA AI/ML guidance
- Electrical safety per IEC 60601 series
- Risk management per ISO 14971:2019
- Usability engineering per IEC 62366
- Sterility assurance per ISO 11135, ISO 11137, ISO 17665
- Clinical evaluation per MEDDEV 2.7/1 Rev 4 (EU) and valid scientific evidence (US)
- Post-market surveillance per FDA 21 CFR 803 (MDR) and EU MDR Article 83-86
- Unique Device Identification (UDI) per 21 CFR 830

### Current Submission Context
${
  is510k
    ? `This is a **510(k) Premarket Notification** (21 CFR 807 Subpart E).
Key requirements:
- Predicate device selection with clear substantial equivalence (SE) argument
- Performance testing mapped to recognized consensus standards (FDA database)
- Indications for Use statement aligned with predicate
- If Special 510(k): summary of changes + risk analysis showing no new questions of safety/effectiveness
- If Abbreviated 510(k): reliance on guidance document/special controls
- eSTAR submission format per FDA guidance
- Review time: ~90 calendar days (traditional), ~30 days (special)`
    : ''
}
${
  isPMA
    ? `This is a **Premarket Approval (PMA)** application (21 CFR 814).
Key requirements:
- Valid scientific evidence demonstrating reasonable assurance of safety AND effectiveness
- Manufacturing information per QSR (21 CFR 820)
- Non-clinical laboratory studies (bench testing, animal studies)
- Clinical investigations (pivotal study, typically randomized controlled trial)
- Proposed labeling and indications for use
- Complete device description and drawings
- Review time: ~180 calendar days (standard), ~60 days (PMA supplement)`
    : ''
}
${
  isDeNovo
    ? `This is a **De Novo Classification Request** (21 CFR 860.260).
Key requirements:
- Demonstrate low-to-moderate risk for novel device with no predicate
- Proposed special controls (e.g., labeling, performance testing, post-market)
- Valid scientific evidence of safety and effectiveness
- Risk-benefit analysis comparing to standard of care
- Can reference FDA De Novo guidance and similar device precedents
- Review time: ~150 calendar days`
    : ''
}

### Device-Specific Analysis Capabilities
When the user asks me to analyze or draft, I will:
1. **Predicate Analysis**: Compare technological characteristics, indications, performance
2. **Standards Mapping**: Identify applicable consensus standards from FDA's recognized standards database
3. **Risk Analysis**: Generate ISO 14971 risk matrix with hazard identification
4. **Testing Strategy**: Design verification & validation test protocols
5. **Literature Review**: Search for clinical evidence, case reports, and safety data
6. **SE Argument Construction**: Build point-by-point SE comparison table
7. **eSTAR Sections**: Draft each section of the eSTAR template with proper formatting`;

  return {
    moduleId: 'medical-device',
    systemPromptAddon: basePrompt,
    availableCapabilities: [
      'predicate_device_search',
      'substantial_equivalence_analysis',
      'consensus_standards_mapping',
      'risk_matrix_generation',
      'biocompatibility_assessment',
      'software_classification',
      'clinical_evidence_review',
      'estar_section_drafting',
      'design_history_file',
      'post_market_plan',
    ],
    documentTypes: [
      {
        id: 'indications-for-use',
        name: 'Indications for Use Statement',
        description: 'FDA Form 3881 — defines device indications, population, and use environment',
        category: 'submission',
        template: 'md-indications-for-use',
        requiredFields: ['device_name', 'indications', 'population', 'prescription_otc'],
        regulatoryBasis: '21 CFR 807.87(e)',
        aiDraftable: true,
        estimatedHours: 2,
      },
      {
        id: 'se-comparison',
        name: 'Substantial Equivalence Comparison',
        description: 'Point-by-point comparison of subject and predicate devices',
        category: 'submission',
        template: 'md-se-comparison',
        requiredFields: ['subject_device', 'predicate_device', 'technology', 'indications'],
        regulatoryBasis: '21 CFR 807.87(f)',
        aiDraftable: true,
        estimatedHours: 8,
      },
      {
        id: 'performance-testing',
        name: 'Performance Testing Summary',
        description: 'Summary of bench, animal, and clinical testing per applicable standards',
        category: 'testing',
        template: 'md-performance-testing',
        requiredFields: ['test_standards', 'test_results', 'acceptance_criteria'],
        regulatoryBasis: '21 CFR 807.87(g)',
        aiDraftable: true,
        estimatedHours: 16,
      },
      {
        id: 'risk-analysis',
        name: 'Risk Analysis (ISO 14971)',
        description:
          'Comprehensive risk analysis per ISO 14971 with hazard identification and mitigation',
        category: 'quality',
        template: 'md-risk-analysis',
        requiredFields: ['hazards', 'risk_estimation', 'risk_evaluation', 'risk_controls'],
        regulatoryBasis: 'ISO 14971:2019',
        aiDraftable: true,
        estimatedHours: 20,
      },
      {
        id: 'biocompatibility',
        name: 'Biocompatibility Assessment',
        description: 'Material characterization and biological evaluation per ISO 10993',
        category: 'testing',
        template: 'md-biocompatibility',
        requiredFields: ['materials', 'body_contact', 'duration', 'testing_matrix'],
        regulatoryBasis: 'ISO 10993-1:2018',
        aiDraftable: true,
        estimatedHours: 12,
      },
      {
        id: 'software-doc',
        name: 'Software Documentation (IEC 62304)',
        description: 'Software lifecycle documentation for SaMD/embedded software devices',
        category: 'software',
        template: 'md-software-doc',
        requiredFields: ['software_class', 'architecture', 'requirements', 'test_plan'],
        regulatoryBasis: 'IEC 62304:2015',
        aiDraftable: true,
        estimatedHours: 40,
      },
    ],
    workflowStages: [
      {
        id: 'classification',
        name: 'Device Classification',
        description: 'Determine product code, classification, and regulatory pathway',
        requiredDocuments: ['device-description'],
        approvalRequired: false,
        estimatedDays: 5,
      },
      {
        id: 'predicate-selection',
        name: 'Predicate Selection',
        description: 'Identify and analyze predicate devices from FDA 510(k) database',
        requiredDocuments: ['predicate-analysis'],
        approvalRequired: true,
        estimatedDays: 10,
      },
      {
        id: 'testing-strategy',
        name: 'Testing Strategy',
        description: 'Define testing plan against applicable consensus standards',
        requiredDocuments: ['test-plan', 'risk-analysis'],
        approvalRequired: true,
        estimatedDays: 15,
      },
      {
        id: 'testing-execution',
        name: 'Testing Execution',
        description: 'Execute bench, biocompatibility, and clinical tests',
        requiredDocuments: ['test-reports'],
        approvalRequired: false,
        estimatedDays: 60,
      },
      {
        id: 'submission-assembly',
        name: 'Submission Assembly',
        description: 'Compile eSTAR or eCopy, all test reports, and administrative forms',
        requiredDocuments: ['estar-complete'],
        approvalRequired: true,
        estimatedDays: 20,
      },
      {
        id: 'submission-review',
        name: 'FDA Review',
        description: 'FDA review period with potential Additional Information requests',
        requiredDocuments: [],
        approvalRequired: false,
        estimatedDays: 90,
      },
    ],
    regulatoryReferences: [
      {
        id: 'cfr-807',
        title: '510(k) Regulation',
        authority: 'FDA',
        citation: '21 CFR 807 Subpart E',
        relevance: 'Core 510(k) submission requirements',
      },
      {
        id: 'cfr-814',
        title: 'PMA Regulation',
        authority: 'FDA',
        citation: '21 CFR 814',
        relevance: 'Class III premarket approval',
      },
      {
        id: 'cfr-820',
        title: 'Quality System Regulation',
        authority: 'FDA',
        citation: '21 CFR 820',
        relevance: 'Design controls, CAPA, documentation',
      },
      {
        id: 'iso-14971',
        title: 'Risk Management',
        authority: 'ISO',
        citation: 'ISO 14971:2019',
        relevance: 'Mandatory risk management process',
      },
      {
        id: 'iso-10993',
        title: 'Biocompatibility',
        authority: 'ISO',
        citation: 'ISO 10993 series',
        relevance: 'Biological evaluation of medical devices',
      },
      {
        id: 'iec-62304',
        title: 'Software Lifecycle',
        authority: 'IEC',
        citation: 'IEC 62304:2015',
        relevance: 'Medical device software development',
      },
      {
        id: 'eu-mdr',
        title: 'EU Medical Device Regulation',
        authority: 'EU',
        citation: '(EU) 2017/745',
        relevance: 'European market access, CE marking',
      },
    ],
    evidenceRequirements: [
      {
        category: 'Predicate Equivalence',
        description: 'Literature and test data demonstrating substantial equivalence to predicate',
        sources: ['FDA 510(k) database', 'PubMed', 'device testing'],
        criticalityLevel: 'critical',
      },
      {
        category: 'Clinical Safety',
        description: 'Clinical evidence of safety from trials, literature, and post-market data',
        sources: ['clinical trials', 'MAUDE database', 'literature'],
        criticalityLevel: 'critical',
      },
      {
        category: 'Performance Data',
        description: 'Bench and analytical testing results per consensus standards',
        sources: ['laboratory testing', 'third-party reports'],
        criticalityLevel: 'critical',
      },
      {
        category: 'Biocompatibility',
        description: 'Material safety data per ISO 10993 testing matrix',
        sources: ['ISO 10993 testing', 'material certificates'],
        criticalityLevel: 'important',
      },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. eCTD CO-AUTHOR INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════════════════

function getEctdCoauthorIntelligence(project: ProjectSummary | null): ModuleIntelligence {
  const submissionType = project?.submissionType?.toUpperCase() || 'IND';
  const phase = project?.phase || 'Phase 1';

  return {
    moduleId: 'ectd-coauthor',
    systemPromptAddon: `
## eCTD Co-Author 4.0 Intelligence — Active Module

You are the eCTD Co-Author 4.0 — the regulatory authoring engine at the heart of the Concept2Cure platform.
Users start new drafts directly OR ask you (AnA RI) to draft them. You execute immediately.

### One Intelligent, Connected Workspace
You operate within a single connected platform where:
- **Data Room** → source data feeds directly into your drafts
- **Dossier Manager** → tracks section lifecycle, dependencies, and team assignments
- **Document Editor** → where authors refine your drafts in real-time collaboration
- **Finalized submissions** serve as trusted reference points for health authority responses
- Every action flows into the next — no disconnected tools, no scattered files

### Core Module Mastery
- **Module 1** (Regional Administrative): FDA Forms (1571, 1572, 3674), cover letters, labeling, patent info, Investigator's Brochure (IB)
- **Module 2** (CTD Summaries): Quality Overall Summary (QOS 2.3), Nonclinical/Clinical Overviews (2.4/2.5), Written/Tabulated Summaries (2.6/2.7)
- **Module 3** (Quality/CMC): Drug Substance (3.2.S.1-S.7), Drug Product (3.2.P.1-P.8), Appendices (3.2.A), Regional Info (3.2.R)
- **Module 4** (Nonclinical): Pharmacology (4.2.1), Pharmacokinetics (4.2.2), Toxicology (4.2.3)
- **Module 5** (Clinical): Study Reports (5.3), Listing of Clinical Studies (5.2), Tabular Listings (5.3.5), Literature References (5.4)

### Submission Context
- **Type**: ${submissionType}${submissionType === 'IND' ? ` (Investigational New Drug, 21 CFR 312.23)` : submissionType === 'NDA' ? ` (New Drug Application, 21 CFR 314)` : submissionType === 'BLA' ? ` (Biologics License Application, 42 USC 262)` : ''}
- **Phase**: ${phase}

### Content Generation — You Generate Entire Sections
When the user says "Draft Module 2.5" or "Generate the IB" or "Create Table 2.7.4.1-1", you do it.

**For Modules 1 (including IB), 2, 3, and 5, you can generate:**
- Complete first drafts populated from Data Room source data
- Properly formatted tables with sequential numbering and source citations
- Figures with descriptions, axes, legends, and data specifications
- Cross-references that link to actual section codes in the dossier
- Compliance statements (GLP, GCP, GMP) appropriate to the section

**Draft & Iterate**: Templates are customized with project variables. Context is maintained across iterations.
Users refine and improve work over time without losing the thread.

**Assemble**: You automate submission formatting and table/figure handling, keeping citations and
cross-references current — including intra-document, inter-document, and literature references.

### Authoring Intelligence
When drafting any CTD section, you:
1. **Reference the correct ICH guideline** (M4Q, M4S, M4E, M4 organization)
2. **Pre-populate with required content elements** per FDA reviewer expectations
3. **Pull data from the Data Room** — variables auto-populate, source references auto-link
4. **Cross-reference** related sections (Module 2 summaries must be consistent with Module 3/4/5 data)
5. **Flag completeness gaps** — [DATA NEEDED: description] for what data is missing
6. **Enforce eCTD 4.0 formatting** — structure, header hierarchy, table numbering, bookmarks
7. **Apply lifecycle operations** — new, append, replace, delete per amendment rules
8. **Generate hyperlinks** — cross-reference other CTD sections per M8 backend
9. **Shape the narrative** — surface insights, flag inconsistencies, present data strategically

### eCTD Publishing Rules
- XML backbone must conform to ICH M8 (eCTD v4.0) or regional DTD (eCTD v3.2.2)
- PDFs must be bookmarked with 12pt+ fonts, A4/Letter format
- Files must not exceed 100MB per leaf; prefer <50MB
- Granularity: each study report, each batch analysis is a separate leaf
- Lifecycle: always specify operation (new/append/replace/delete) for each leaf

### Quality Control Checks
Before any section is finalized, you verify:
- [ ] All required sub-sections present per ICH M4
- [ ] Cross-references to data in other modules are accurate
- [ ] Regulatory citations are current and correctly formatted
- [ ] Tables/figures are numbered sequentially
- [ ] Abbreviations are defined on first use
- [ ] GLP/GCP/GMP compliance statements included where required
- [ ] Tracked changes resolved, comments addressed
- [ ] Version control markers present
- [ ] Every claim traces to a source document in the Data Room
- [ ] Consistency verified across sections (no conflicting data)`,
    availableCapabilities: [
      'ctd_section_drafting',
      'cross_reference_validation',
      'ectd_xml_generation',
      'section_completeness_check',
      'lifecycle_operation_management',
      'multi_module_consistency_check',
      'reviewer_guidance_lookup',
      'amendment_diff_generation',
      'pdf_bookmark_generation',
      'regulatory_citation_validation',
    ],
    documentTypes: [
      {
        id: 'qos',
        name: 'Quality Overall Summary (2.3)',
        description: 'High-level CMC summary per ICH M4Q',
        category: 'module-2',
        template: 'ectd-qos',
        requiredFields: ['drug_substance', 'drug_product', 'manufacturing'],
        regulatoryBasis: 'ICH M4Q(R1)',
        aiDraftable: true,
        estimatedHours: 40,
      },
      {
        id: 'nonclinical-overview',
        name: 'Nonclinical Overview (2.4)',
        description: 'Integrated nonclinical assessment',
        category: 'module-2',
        template: 'ectd-24',
        requiredFields: ['pharmacology', 'pk', 'toxicology'],
        regulatoryBasis: 'ICH M4S(R2)',
        aiDraftable: true,
        estimatedHours: 30,
      },
      {
        id: 'clinical-overview',
        name: 'Clinical Overview (2.5)',
        description: 'Integrated clinical benefit-risk assessment',
        category: 'module-2',
        template: 'ectd-25',
        requiredFields: ['study_results', 'safety_data', 'efficacy_data'],
        regulatoryBasis: 'ICH M4E(R2)',
        aiDraftable: true,
        estimatedHours: 60,
      },
      {
        id: 'written-summary-27',
        name: 'Clinical Summary (2.7)',
        description: 'Tabulated and written clinical summaries',
        category: 'module-2',
        template: 'ectd-27',
        requiredFields: ['biopharmaceutics', 'pk_human', 'efficacy', 'safety'],
        regulatoryBasis: 'ICH M4E(R2)',
        aiDraftable: true,
        estimatedHours: 80,
      },
      {
        id: 'drug-substance-32s',
        name: 'Drug Substance (3.2.S)',
        description: 'Complete CMC for drug substance',
        category: 'module-3',
        template: 'ectd-32s',
        requiredFields: ['general_info', 'manufacture', 'characterization', 'control', 'stability'],
        regulatoryBasis: 'ICH Q-series',
        aiDraftable: true,
        estimatedHours: 100,
      },
      {
        id: 'drug-product-32p',
        name: 'Drug Product (3.2.P)',
        description: 'Complete CMC for drug product',
        category: 'module-3',
        template: 'ectd-32p',
        requiredFields: ['description', 'development', 'manufacture', 'control', 'stability'],
        regulatoryBasis: 'ICH Q-series',
        aiDraftable: true,
        estimatedHours: 120,
      },
      {
        id: 'csr-535',
        name: 'Clinical Study Report (5.3.5)',
        description: 'Full CSR per ICH E3',
        category: 'module-5',
        template: 'ectd-csr',
        requiredFields: ['protocol', 'results', 'safety', 'efficacy', 'appendices'],
        regulatoryBasis: 'ICH E3',
        aiDraftable: true,
        estimatedHours: 200,
      },
    ],
    workflowStages: [
      {
        id: 'planning',
        name: 'Submission Planning',
        description: 'Define scope, timeline, and team assignments per CTD module',
        requiredDocuments: ['submission-plan'],
        approvalRequired: true,
        estimatedDays: 10,
      },
      {
        id: 'data-gathering',
        name: 'Data Gathering',
        description: 'Collect source data from labs, clinics, manufacturing',
        requiredDocuments: [],
        approvalRequired: false,
        estimatedDays: 30,
      },
      {
        id: 'drafting',
        name: 'Section Drafting',
        description: 'AI-assisted drafting of each CTD section with expert review',
        requiredDocuments: [],
        approvalRequired: false,
        estimatedDays: 60,
      },
      {
        id: 'internal-review',
        name: 'Internal Review',
        description: 'Subject matter expert review of all sections',
        requiredDocuments: [],
        approvalRequired: true,
        estimatedDays: 20,
      },
      {
        id: 'qc-review',
        name: 'QC Review',
        description: 'Quality control check for cross-references, formatting, completeness',
        requiredDocuments: [],
        approvalRequired: true,
        estimatedDays: 10,
      },
      {
        id: 'publishing',
        name: 'eCTD Publishing',
        description: 'Generate eCTD XML backbone, finalize PDFs, validate with eCTD validator',
        requiredDocuments: ['ectd-xml', 'validated-pdfs'],
        approvalRequired: true,
        estimatedDays: 5,
      },
      {
        id: 'submission',
        name: 'Electronic Submission',
        description: 'Submit via FDA ESG or EU eSubmission gateway',
        requiredDocuments: ['submission-receipt'],
        approvalRequired: true,
        estimatedDays: 1,
      },
    ],
    regulatoryReferences: [
      {
        id: 'ich-m4',
        title: 'CTD Organization',
        authority: 'ICH',
        citation: 'ICH M4',
        relevance: 'Defines the 5-module CTD structure',
      },
      {
        id: 'ich-m4q',
        title: 'CTD Quality (Module 3)',
        authority: 'ICH',
        citation: 'ICH M4Q(R1)',
        relevance: 'CMC documentation requirements',
      },
      {
        id: 'ich-m4s',
        title: 'CTD Safety (Module 4)',
        authority: 'ICH',
        citation: 'ICH M4S(R2)',
        relevance: 'Nonclinical documentation requirements',
      },
      {
        id: 'ich-m4e',
        title: 'CTD Efficacy (Module 5)',
        authority: 'ICH',
        citation: 'ICH M4E(R2)',
        relevance: 'Clinical documentation requirements',
      },
      {
        id: 'ich-m8',
        title: 'eCTD Specification',
        authority: 'ICH',
        citation: 'ICH M8',
        relevance: 'Electronic submission backbone (v4.0)',
      },
      {
        id: 'cfr-312',
        title: 'IND Regulation',
        authority: 'FDA',
        citation: '21 CFR 312',
        relevance: 'IND application content and procedures',
      },
      {
        id: 'ich-e3',
        title: 'Clinical Study Reports',
        authority: 'ICH',
        citation: 'ICH E3',
        relevance: 'Structure and content of CSRs',
      },
    ],
    evidenceRequirements: [
      {
        category: 'CMC Data',
        description: 'Manufacturing process, analytical methods, stability data',
        sources: ['lab records', 'batch records', 'stability protocols'],
        criticalityLevel: 'critical',
      },
      {
        category: 'Nonclinical Data',
        description: 'Pharmacology, PK, and toxicology study reports',
        sources: ['GLP study reports', 'in vitro data'],
        criticalityLevel: 'critical',
      },
      {
        category: 'Clinical Data',
        description: 'Protocol, CSRs, safety and efficacy data',
        sources: ['clinical database', 'CRFs', 'SAE reports'],
        criticalityLevel: 'critical',
      },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. CMC WIZARD INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════════════════

function getCmcWizardIntelligence(project: ProjectSummary | null): ModuleIntelligence {
  return {
    moduleId: 'cmc-wizard',
    systemPromptAddon: `
## CMC Wizard Intelligence — Active Module

You are the CMC (Chemistry, Manufacturing & Controls) Wizard. You help regulatory scientists
author and review CTD Module 3 content with deep ICH Q-series expertise.

### ICH Q-Series Mastery
- **ICH Q1A/B**: Stability testing — photostability, stress testing, accelerated/long-term protocols
- **ICH Q2(R2)**: Analytical method validation — specificity, linearity, accuracy, precision, LOD/LOQ
- **ICH Q3A/B/C/D**: Impurities — organic, inorganic, residual solvents, elemental impurities
- **ICH Q5A-E**: Biotechnology products — cell substrates, viral safety, comparability
- **ICH Q6A/B**: Specifications — test procedures and acceptance criteria
- **ICH Q7**: GMP for APIs
- **ICH Q8(R2)**: Pharmaceutical Development — QbD, design space, CQAs, CPPs
- **ICH Q9(R1)**: Quality Risk Management — risk assessment, FMEA, HACCP
- **ICH Q10**: Pharmaceutical Quality System — lifecycle approach
- **ICH Q11**: Drug Substance development and manufacturing
- **ICH Q12**: Post-approval changes — ECs, PACs, regulatory flexibility
- **ICH Q13**: Continuous manufacturing
- **ICH Q14**: Analytical procedure development

### CMC Document Types (Module 3.2)
**Drug Substance (3.2.S):**
- S.1: General Information (nomenclature, structure, properties)
- S.2: Manufacture (process description, controls, process validation)
- S.3: Characterisation (elucidation of structure, impurities)
- S.4: Control of Drug Substance (specifications, analytical procedures, batch analyses)
- S.5: Reference Standards
- S.6: Container Closure System
- S.7: Stability

**Drug Product (3.2.P):**
- P.1: Description and Composition
- P.2: Pharmaceutical Development (QbD, formulation, manufacturing process)
- P.3: Manufacture (batch formula, process, controls, process validation)
- P.4: Control of Excipients
- P.5: Control of Drug Product (specifications, analytical procedures)
- P.6: Reference Standards
- P.7: Container Closure System
- P.8: Stability

### When Drafting CMC Sections I Will:
1. Structure content per ICH M4Q(R1) with proper sub-section numbering
2. Include required tables: batch analysis, stability data, specifications
3. Reference ICH guidelines for each acceptance criterion justification
4. Flag any gaps in development data (e.g., missing stress stability conditions)
5. Cross-reference to Drug Master Files (DMFs) where applicable
6. Generate stability protocol tables with proper conditions (25°C/60%RH, 40°C/75%RH)
7. Build specifications tables with test, method, and acceptance criteria columns
8. Identify CQAs and CPPs from the development narrative
9. Apply QbD principles: design space → control strategy → lifecycle management`,
    availableCapabilities: [
      'cmc_section_drafting',
      'stability_protocol_design',
      'specification_table_generation',
      'analytical_method_review',
      'batch_analysis_tabulation',
      'impurity_qualification',
      'process_validation_protocol',
      'qbd_design_space_analysis',
      'excipient_compatibility_review',
      'container_closure_assessment',
      'comparability_study_design',
      'dmf_cross_reference',
    ],
    documentTypes: [
      {
        id: 'drug-substance-general',
        name: 'Drug Substance General Info (S.1)',
        description: 'Nomenclature, structure, physico-chemical properties',
        category: 'drug-substance',
        template: 'cmc-s1',
        requiredFields: ['inn', 'cas', 'structure', 'molecular_formula', 'properties'],
        regulatoryBasis: 'ICH M4Q S.1',
        aiDraftable: true,
        estimatedHours: 4,
      },
      {
        id: 'drug-substance-mfg',
        name: 'DS Manufacturing (S.2)',
        description: 'Synthetic route, process controls, process validation',
        category: 'drug-substance',
        template: 'cmc-s2',
        requiredFields: ['manufacturer', 'process_description', 'controls', 'process_validation'],
        regulatoryBasis: 'ICH Q11',
        aiDraftable: true,
        estimatedHours: 40,
      },
      {
        id: 'drug-substance-specs',
        name: 'DS Specifications (S.4)',
        description: 'Test procedures, acceptance criteria, batch analyses',
        category: 'drug-substance',
        template: 'cmc-s4',
        requiredFields: ['specifications_table', 'analytical_methods', 'batch_data'],
        regulatoryBasis: 'ICH Q6A/Q6B',
        aiDraftable: true,
        estimatedHours: 20,
      },
      {
        id: 'drug-substance-stability',
        name: 'DS Stability (S.7)',
        description: 'Stability protocol, results, shelf life proposal',
        category: 'drug-substance',
        template: 'cmc-s7',
        requiredFields: ['protocol', 'conditions', 'results', 'shelf_life'],
        regulatoryBasis: 'ICH Q1A(R2)',
        aiDraftable: true,
        estimatedHours: 16,
      },
      {
        id: 'drug-product-dev',
        name: 'Pharmaceutical Development (P.2)',
        description: 'QbD, formulation development, manufacturing process development',
        category: 'drug-product',
        template: 'cmc-p2',
        requiredFields: ['formulation_rationale', 'cqas', 'cpps', 'design_space'],
        regulatoryBasis: 'ICH Q8(R2)',
        aiDraftable: true,
        estimatedHours: 60,
      },
      {
        id: 'drug-product-mfg',
        name: 'DP Manufacturing (P.3)',
        description: 'Batch formula, process flow, equipment, process validation',
        category: 'drug-product',
        template: 'cmc-p3',
        requiredFields: ['batch_formula', 'process_flow', 'equipment', 'process_validation'],
        regulatoryBasis: 'ICH Q7',
        aiDraftable: true,
        estimatedHours: 30,
      },
      {
        id: 'stability-protocol',
        name: 'Stability Protocol',
        description: 'Complete stability testing protocol per ICH Q1A',
        category: 'testing',
        template: 'cmc-stability-protocol',
        requiredFields: ['conditions', 'timepoints', 'test_parameters', 'acceptance_criteria'],
        regulatoryBasis: 'ICH Q1A(R2)/Q1B',
        aiDraftable: true,
        estimatedHours: 8,
      },
    ],
    workflowStages: [
      {
        id: 'characterization',
        name: 'DS/DP Characterization',
        description: 'Complete physico-chemical characterization and structure elucidation',
        requiredDocuments: ['analytical-reports'],
        approvalRequired: false,
        estimatedDays: 30,
      },
      {
        id: 'method-development',
        name: 'Analytical Method Development',
        description: 'Develop and validate analytical methods per ICH Q2',
        requiredDocuments: ['method-validation'],
        approvalRequired: true,
        estimatedDays: 45,
      },
      {
        id: 'process-development',
        name: 'Process Development',
        description: 'Define manufacturing process, identify CQAs/CPPs',
        requiredDocuments: ['process-description', 'risk-assessment'],
        approvalRequired: true,
        estimatedDays: 60,
      },
      {
        id: 'specifications',
        name: 'Set Specifications',
        description:
          'Establish acceptance criteria based on batch data and compendial requirements',
        requiredDocuments: ['specifications-justification'],
        approvalRequired: true,
        estimatedDays: 15,
      },
      {
        id: 'stability-initiation',
        name: 'Stability Studies',
        description: 'Initiate ICH stability studies and compile results',
        requiredDocuments: ['stability-protocol', 'stability-data'],
        approvalRequired: true,
        estimatedDays: 180,
      },
      {
        id: 'cmc-compilation',
        name: 'CMC Compilation',
        description: 'Assemble Module 3 sections with all supporting data',
        requiredDocuments: ['module-3-sections'],
        approvalRequired: true,
        estimatedDays: 30,
      },
    ],
    regulatoryReferences: [
      {
        id: 'ich-q1a',
        title: 'Stability Testing',
        authority: 'ICH',
        citation: 'ICH Q1A(R2)',
        relevance: 'Stability protocol conditions and duration',
      },
      {
        id: 'ich-q2',
        title: 'Analytical Validation',
        authority: 'ICH',
        citation: 'ICH Q2(R2)',
        relevance: 'Method validation parameters',
      },
      {
        id: 'ich-q3a',
        title: 'Impurities in DS',
        authority: 'ICH',
        citation: 'ICH Q3A(R2)',
        relevance: 'Impurity identification and qualification thresholds',
      },
      {
        id: 'ich-q6a',
        title: 'Specifications',
        authority: 'ICH',
        citation: 'ICH Q6A',
        relevance: 'Setting specifications for chemical substances',
      },
      {
        id: 'ich-q8',
        title: 'Pharmaceutical Development',
        authority: 'ICH',
        citation: 'ICH Q8(R2)',
        relevance: 'Quality by Design approach',
      },
      {
        id: 'ich-q11',
        title: 'DS Development',
        authority: 'ICH',
        citation: 'ICH Q11',
        relevance: 'Drug substance development and manufacturing',
      },
    ],
    evidenceRequirements: [
      {
        category: 'Batch Data',
        description: 'Certificate of analysis for development and GMP batches',
        sources: ['batch records', 'CoAs', 'analytical reports'],
        criticalityLevel: 'critical',
      },
      {
        category: 'Stability Data',
        description: 'Long-term, accelerated, and stress stability results',
        sources: ['stability reports', 'chromatograms'],
        criticalityLevel: 'critical',
      },
      {
        category: 'Process Validation',
        description: 'Process validation protocol and report',
        sources: ['validation reports', 'equipment qualification'],
        criticalityLevel: 'important',
      },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. DOCUMENT CANVAS INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════════════════

function getDocCanvasIntelligence(_project: ProjectSummary | null): ModuleIntelligence {
  return {
    moduleId: 'doc-canvas',
    systemPromptAddon: `
## Document Editor & Canvas Intelligence — Active Module

You are the Document Editor — a high-volume authoring engine that brings writing, reviewing, and
collaboration into one seamless environment across the entire drug development lifecycle.

### Connected to Everything
The Document Editor is directly connected to:
- **Data Room** — source data surfaces automatically in your drafts
- **Dossier Manager** — every document stays aligned with section status and dependencies
- **Supporting Evidence** — latest team inputs, cross-references, and source citations
- Consistent versioning, structured review workflow, and real-time collaboration

### Document Generation Capabilities
- **Word Documents (DOCX)**: Full-fidelity export with track changes, comments, formatting
- **PDF Generation**: eCTD-compliant PDFs with bookmarks, metadata, electronic signatures
- **Python/Data Scripts**: Analysis scripts for regulatory data processing and visualization
- **Canvas Editor**: Rich WYSIWYG editor with real-time collaboration, comment threads, suggestion mode
- **IND Document Editor**: Specialized editor for regulatory submissions with CTD-aware formatting

### How Users Work in the Editor
1. **Start a draft**: Use a template OR ask AnA RI to generate a complete first draft
2. **Iterate with AI**: "Expand the safety section" → you expand it in-place, preserving context
3. **Connect to data**: Variables auto-populate from Data Room. Changes surface automatically.
4. **Collaborate**: Multiple team members work simultaneously. Comments stay in context.
5. **Version**: Full history with named snapshots, diff views, and restore capability
6. **Export**: DOCX, PDF, eCTD XML — format-appropriate for the document type

### Data Room Integration (Inside the Editor)
The Data Room is the operational center of source data:
- **Semantic Search**: AI-powered search finds related content across all uploaded documents
- **AI-Extracted Metadata**: Document type, entities, regulatory relevance, quality flags
- **Traceable Flow**: Source file → Data Room → draft section → finalized document
- **Import Existing**: Import and map existing document structures to CTD framework
- **Version Tracking**: Know which version of a source document was used in each draft

### Template Library
I can draft ALL of these document types:

**Regulatory Submissions:**
- IND Application (initial, amendments, annual reports, safety reports)
- 510(k) Premarket Notifications (Traditional, Special, Abbreviated)
- NDA/BLA (full applications, supplements, annual reports)
- PMA applications and supplements
- Investigator's Brochure (IB)
- Briefing Documents (pre-IND, End-of-Phase 2, pre-NDA)

**Clinical Documents:**
- Clinical Protocols (all phases) per ICH E6(R2)
- Informed Consent Forms per 21 CFR 50
- Clinical Study Reports per ICH E3
- Statistical Analysis Plans
- Data Management Plans
- Monitoring Plans

**Quality Documents:**
- SOPs per 21 CFR Part 211/820
- Deviation Reports and CAPA documentation
- Change Control documentation
- Validation Protocols and Reports
- Batch Records and CoAs

**Safety Documents:**
- IND Safety Reports (15/7-day) per 21 CFR 312.32
- DSUR per ICH E2F
- PSUR/PBRER per ICH E2C(R2)
- CIOMS-I forms, SUSAR narratives

**Corporate/Business:**
- Board presentations, investor briefings, due diligence assessments

### Document Quality Standards
Every document generated will:
1. Follow proper regulatory formatting (fonts, margins, numbering)
2. Include version control headers (Document #, Version, Date, Author)
3. Have table of contents for documents >5 pages
4. Include regulatory citations with proper formatting
5. Use defined abbreviations consistently
6. Be 21 CFR Part 11 ready (audit trail, e-signatures)
7. Trace every data point to its Data Room source`,
    availableCapabilities: [
      'docx_generation',
      'pdf_generation',
      'python_script_generation',
      'regulatory_template_library',
      'real_time_collaboration',
      'tracked_changes',
      'version_control',
      'electronic_signatures',
      'template_customization',
      'multi_language_support',
      'cross_reference_management',
      'table_of_contents_generation',
      'citation_management',
      'comment_threads',
      'document_comparison',
    ],
    documentTypes: [
      {
        id: 'sop',
        name: 'Standard Operating Procedure',
        description: 'GxP-compliant SOP with approval workflow',
        category: 'quality',
        template: 'doc-sop',
        requiredFields: ['title', 'scope', 'procedure', 'responsibilities'],
        regulatoryBasis: '21 CFR 211.22',
        aiDraftable: true,
        estimatedHours: 8,
      },
      {
        id: 'protocol',
        name: 'Clinical Protocol',
        description: 'Full clinical protocol per ICH E6(R2)',
        category: 'clinical',
        template: 'doc-protocol',
        requiredFields: ['objectives', 'design', 'endpoints', 'statistics'],
        regulatoryBasis: 'ICH E6(R2)',
        aiDraftable: true,
        estimatedHours: 80,
      },
      {
        id: 'ib',
        name: "Investigator's Brochure",
        description: 'IB per ICH E6(R2) Section 7',
        category: 'clinical',
        template: 'doc-ib',
        requiredFields: ['compound_info', 'nonclinical', 'clinical', 'safety'],
        regulatoryBasis: 'ICH E6(R2) §7',
        aiDraftable: true,
        estimatedHours: 60,
      },
      {
        id: 'briefing',
        name: 'FDA Briefing Document',
        description: 'Pre-meeting briefing for FDA interactions',
        category: 'regulatory',
        template: 'doc-briefing',
        requiredFields: ['background', 'questions', 'data_summary'],
        regulatoryBasis: 'FDA Meeting Management',
        aiDraftable: true,
        estimatedHours: 40,
      },
      {
        id: 'icf',
        name: 'Informed Consent Form',
        description: 'ICF per 21 CFR 50.25',
        category: 'clinical',
        template: 'doc-icf',
        requiredFields: ['study_description', 'risks', 'benefits', 'alternatives'],
        regulatoryBasis: '21 CFR 50.25',
        aiDraftable: true,
        estimatedHours: 16,
      },
      {
        id: 'deviation-report',
        name: 'Deviation Report',
        description: 'GMP deviation investigation report',
        category: 'quality',
        template: 'doc-deviation',
        requiredFields: ['description', 'impact', 'root_cause', 'capa'],
        regulatoryBasis: '21 CFR 211.192',
        aiDraftable: true,
        estimatedHours: 8,
      },
      {
        id: 'validation-protocol',
        name: 'Validation Protocol',
        description: 'Process/method/system validation protocol',
        category: 'quality',
        template: 'doc-validation',
        requiredFields: ['scope', 'acceptance_criteria', 'test_plan'],
        regulatoryBasis: 'FDA Process Validation Guidance',
        aiDraftable: true,
        estimatedHours: 20,
      },
    ],
    workflowStages: [
      {
        id: 'template-select',
        name: 'Template Selection',
        description: 'Choose template and configure document parameters',
        requiredDocuments: [],
        approvalRequired: false,
        estimatedDays: 1,
      },
      {
        id: 'ai-draft',
        name: 'AI-Assisted Drafting',
        description: 'Generate initial draft with AI, review and refine',
        requiredDocuments: [],
        approvalRequired: false,
        estimatedDays: 5,
      },
      {
        id: 'sme-review',
        name: 'SME Review',
        description: 'Subject matter expert review with tracked changes',
        requiredDocuments: [],
        approvalRequired: true,
        estimatedDays: 5,
      },
      {
        id: 'qa-check',
        name: 'QA Check',
        description: 'Quality assurance formatting and content check',
        requiredDocuments: [],
        approvalRequired: true,
        estimatedDays: 2,
      },
      {
        id: 'approval',
        name: 'Approval & Signature',
        description: 'Electronic signature per 21 CFR Part 11',
        requiredDocuments: [],
        approvalRequired: true,
        estimatedDays: 2,
      },
      {
        id: 'distribution',
        name: 'Distribution',
        description: 'Controlled distribution to relevant parties',
        requiredDocuments: [],
        approvalRequired: false,
        estimatedDays: 1,
      },
    ],
    regulatoryReferences: [
      {
        id: 'cfr-part11',
        title: 'Electronic Records',
        authority: 'FDA',
        citation: '21 CFR Part 11',
        relevance: 'Electronic signatures, audit trails, access controls',
      },
      {
        id: 'ich-e6',
        title: 'GCP Guidelines',
        authority: 'ICH',
        citation: 'ICH E6(R2)',
        relevance: 'Clinical document requirements and standards',
      },
      {
        id: 'ich-e3',
        title: 'Study Report Structure',
        authority: 'ICH',
        citation: 'ICH E3',
        relevance: 'CSR structure and content',
      },
    ],
    evidenceRequirements: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. VAULT INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════════════════

function getVaultIntelligence(_project: ProjectSummary | null): ModuleIntelligence {
  return {
    moduleId: 'vault',
    systemPromptAddon: `
## Document Vault Intelligence — Active Module

You are managing the regulatory Document Vault — the secure, 21 CFR Part 11 compliant
document management system for TrialSage.

### Vault Capabilities
- **Version Control**: Full document history with diff comparison, branching, and merging
- **Access Control**: Role-based permissions per document, folder, and project
- **Electronic Signatures**: 21 CFR Part 11 compliant e-signatures with meaning codes
- **Retention Management**: Automated retention policies per regulatory requirements
- **Audit Trail**: Complete, unalterable audit trail of all document actions
- **Regulatory Holds**: Legal and regulatory hold management
- **Search**: Full-text search across all documents with metadata filtering
- **Classification**: Auto-classification of documents by type, CTD module, and regulatory relevance

### Compliance Features
- **21 CFR Part 11**: Electronic records, electronic signatures, closed system controls
- **EU Annex 11**: Computerized systems validation for EU GxP
- **GAMP 5**: Good Automated Manufacturing Practice for validation
- **ISO 27001**: Information security management
- **SOC 2 Type II**: Service organization controls

### Document Lifecycle
1. Draft → Review → Approved → Effective → Superseded → Archived
2. Each transition requires appropriate authorization
3. Electronic signatures with reason codes (Author, Reviewer, Approver)
4. Version numbering: MAJOR.MINOR (1.0, 1.1, 2.0)
5. Controlled copies vs. uncontrolled copies tracking

### When Users Ask About Documents, I Will:
1. Help locate documents by content, metadata, or classification
2. Explain the retention requirements for specific document types
3. Guide through the approval workflow and signature requirements
4. Identify documents that need periodic review
5. Flag documents approaching retention expiry
6. Recommend folder structure aligned with CTD modules
7. Ensure proper access controls are set per document sensitivity`,
    availableCapabilities: [
      'document_search',
      'version_history',
      'access_control_management',
      'electronic_signatures',
      'retention_policy_management',
      'audit_trail_query',
      'regulatory_hold_management',
      'document_classification',
      'folder_structure_design',
      'compliance_reporting',
      'document_comparison',
      'watermarking',
    ],
    documentTypes: [],
    workflowStages: [
      {
        id: 'upload',
        name: 'Document Upload',
        description: 'Upload or create document with metadata classification',
        requiredDocuments: [],
        approvalRequired: false,
        estimatedDays: 1,
      },
      {
        id: 'classify',
        name: 'Classification',
        description: 'Auto or manual classification by document type and CTD section',
        requiredDocuments: [],
        approvalRequired: false,
        estimatedDays: 1,
      },
      {
        id: 'review',
        name: 'Review Cycle',
        description: 'Route for review with tracked changes and comments',
        requiredDocuments: [],
        approvalRequired: true,
        estimatedDays: 5,
      },
      {
        id: 'approve',
        name: 'Approval',
        description: 'Electronic approval with 21 CFR Part 11 signature',
        requiredDocuments: [],
        approvalRequired: true,
        estimatedDays: 2,
      },
      {
        id: 'effective',
        name: 'Effective',
        description: 'Document becomes effective and available for use',
        requiredDocuments: [],
        approvalRequired: false,
        estimatedDays: 1,
      },
    ],
    regulatoryReferences: [
      {
        id: 'cfr-part11',
        title: 'Electronic Records',
        authority: 'FDA',
        citation: '21 CFR Part 11',
        relevance: 'Foundation for electronic document management',
      },
      {
        id: 'eu-annex11',
        title: 'Computerised Systems',
        authority: 'EU',
        citation: 'EU GMP Annex 11',
        relevance: 'EU requirements for computerized systems',
      },
      {
        id: 'gamp5',
        title: 'GAMP 5',
        authority: 'ISPE',
        citation: 'GAMP 5 2nd Edition',
        relevance: 'Validation of computerized GxP systems',
      },
    ],
    evidenceRequirements: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CROSS-CUTTING INTELLIGENCE LAYERS
// ═══════════════════════════════════════════════════════════════════════════════

function getEvidenceEnginePrompt(): string {
  return `
## Evidence Engine — Cross-Cutting Intelligence

When analyzing or synthesizing evidence, I apply:

### Evidence Search & Retrieval
- **PubMed/MEDLINE**: Systematic literature search with PICO framework
- **ClinicalTrials.gov**: Active and completed trial identification
- **FDA databases**: Approval histories, labels, safety communications
- **MAUDE**: Medical device adverse event reports
- **FAERS**: Drug adverse event reports
- **WHO VigiBase**: Global pharmacovigilance data

### Evidence Assessment Framework
- **GRADE**: Grading of Recommendations Assessment, Development and Evaluation
  - High → Moderate → Low → Very Low quality
- **Oxford Levels of Evidence**: Level 1 (systematic reviews) through Level 5 (expert opinion)
- **Risk of Bias**: Cochrane Risk of Bias tool for RCTs
- **PRISMA**: Systematic review and meta-analysis reporting

### Evidence Synthesis Capabilities
1. **Gap Analysis**: Identify missing evidence vs. regulatory requirements
2. **Benefit-Risk Assessment**: Structured benefit-risk framework per FDA/EMA guidance
3. **Competitive Landscape**: Approved products, ongoing trials, pending applications
4. **Regulatory Precedent**: How FDA/EMA reviewed similar products
5. **Meta-Analysis**: Combine data across studies for pooled estimates
6. **Signal Detection**: Identify emerging safety signals from multiple data sources

### Strategic Decision Support
When helping with regulatory strategy, I consider:
- FDA Expedited Programs: Fast Track, Breakthrough Therapy, Accelerated Approval, Priority Review
- Orphan Drug Designation opportunities
- Pediatric exclusivity and PREA requirements
- Patent/regulatory exclusivity landscape
- Global filing sequence optimization (US → EU → Japan → ROW)
- Advisory Committee meeting history and voting patterns`;
}

function getSafetyIntelligencePrompt(): string {
  return `
## Safety Intelligence — Cross-Cutting Layer

### Pharmacovigilance Capabilities
- **IND Safety Reporting**: 15-day and 7-day expedited reports per 21 CFR 312.32
- **CIOMS-I Forms**: Generate international safety report forms
- **DSUR**: Annual Development Safety Update Reports per ICH E2F
- **PSUR/PBRER**: Periodic safety reports per ICH E2C(R2)
- **SUSAR Narratives**: Structure clinical narratives for suspected unexpected serious adverse reactions

### Signal Detection
- Disproportionality analysis (PRR, ROR, IC, EBGM)
- Medical dictionary coding (MedDRA) at PT, HLT, HLGT, SOC levels
- Temporal analysis of adverse event clustering
- Exposure-adjusted incidence rate calculations

### Safety Database Management
- Individual Case Safety Reports (ICSRs) — E2B(R3) format
- Aggregate safety analysis and line listings
- Benefit-risk re-evaluation triggers
- REMS (Risk Evaluation and Mitigation Strategies) when required`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT — Get intelligence for a specific module
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get the deep domain intelligence for a specific module.
 * Returns system prompt additions, capabilities, and workflow guidance.
 */
export function getModuleIntelligence(
  moduleId: string,
  project: ProjectSummary | null
): ModuleIntelligence | null {
  switch (moduleId) {
    case '510k-submission':
    case 'pma-submission':
    case 'ce-marking':
    case 'medical-device':
      return getMedicalDeviceIntelligence(project);

    case 'ectd-coauthor':
    case 'ind-filing':
    case 'nda-bla':
      return getEctdCoauthorIntelligence(project);

    case 'cmc-wizard':
      return getCmcWizardIntelligence(project);

    case 'doc-canvas':
    case 'csr-author':
    case 'cer-generator':
    case 'protocol-designer':
      return getDocCanvasIntelligence(project);

    case 'vault':
    case 'team-workspace':
      return getVaultIntelligence(project);

    default:
      return null;
  }
}

/**
 * Build the complete cross-cutting intelligence prompts.
 * These are always appended regardless of active module.
 */
export function getCrossCuttingIntelligence(enabledModules: string[]): string {
  const parts: string[] = [];

  // Evidence engine is always available if any intelligence module is enabled
  const hasIntelligence = enabledModules.some(m =>
    ['evidence-engine', 'insight-synthesis', 'strategic-advisor', 'safety-signal'].includes(m)
  );

  if (hasIntelligence || enabledModules.length > 0) {
    parts.push(getEvidenceEnginePrompt());
  }

  if (enabledModules.includes('safety-signal') || enabledModules.length > 0) {
    parts.push(getSafetyIntelligencePrompt());
  }

  return parts.join('\n');
}

/**
 * Determine the active module from project context and user session.
 */
export function detectActiveModule(intelligence: UserIntelligence): string | null {
  // If user has an active session with a context type, map it to a module
  const sessionContext = intelligence.currentSession?.contextType;
  if (sessionContext) {
    const contextModuleMap: Record<string, string> = {
      section_drafting: 'ectd-coauthor',
      cmc_authoring: 'cmc-wizard',
      document_creation: 'doc-canvas',
      device_submission: '510k-submission',
      document_review: 'vault',
      data_analysis: 'evidence-engine',
      safety_review: 'safety-signal',
    };
    if (contextModuleMap[sessionContext]) return contextModuleMap[sessionContext];
  }

  // Infer from submission type
  const subType = intelligence.activeProject?.submissionType?.toUpperCase();
  if (subType === '510K' || subType === '510(K)' || subType === 'PMA' || subType === 'DE_NOVO') {
    return '510k-submission';
  }
  if (subType === 'IND') return 'ind-filing';
  if (subType === 'NDA' || subType === 'BLA') return 'nda-bla';

  // Infer from industry mode
  if (intelligence.organization.industryMode === 'medtech') return '510k-submission';
  if (intelligence.organization.industryMode === 'medical_writing') return 'doc-canvas';

  return 'ectd-coauthor'; // Default for biotech/pharma
}
