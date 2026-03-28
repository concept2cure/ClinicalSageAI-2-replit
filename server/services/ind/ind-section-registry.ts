/**
 * IND Section Registry — Complete CTD Module 1-5 structure for IND submissions.
 *
 * Defines every section required for an FDA IND application:
 * - Section code, title, module, required/optional status
 * - ICH/FDA guidance reference
 * - AI generation prompt template
 * - Expected content type (narrative, table, form, data)
 *
 * Used by AnA to guide users through complete IND preparation.
 *
 * @module server/services/ind/ind-section-registry
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface INDSection {
  /** CTD section code (e.g., "2.5", "3.2.S.1") */
  code: string;
  /** Section title */
  title: string;
  /** CTD module number */
  module: 1 | 2 | 3 | 4 | 5;
  /** Module name */
  moduleName: string;
  /** Whether this section is required for IND */
  required: boolean;
  /** Content type */
  contentType: 'narrative' | 'table' | 'form' | 'data' | 'list' | 'mixed';
  /** ICH/FDA guidance reference */
  guidance: string;
  /** AI generation prompt — what AnA should ask Claude to produce */
  generationPrompt: string;
  /** Expected word count range */
  wordCountRange?: [number, number];
  /** Dependencies — other sections that should be drafted first */
  dependencies?: string[];
}

// ─── Module 1 — Administrative ────────────────────────────────────────────────

const MODULE_1: INDSection[] = [
  {
    code: '1.1',
    title: 'Cover Letter',
    module: 1,
    moduleName: 'Administrative',
    required: true,
    contentType: 'narrative',
    guidance: '21 CFR 312.23(a)(1)',
    generationPrompt: 'Generate an FDA IND cover letter for {{PRODUCT_NAME}} ({{INDICATION}}). Include: applicant name and address, IND number (if amendment), submission type (initial/amendment/annual report), brief description of the submission contents, and contact information for the sponsor\'s authorized representative.',
    wordCountRange: [300, 800],
  },
  {
    code: '1.2',
    title: 'FDA Form 1571 — IND Application',
    module: 1,
    moduleName: 'Administrative',
    required: true,
    contentType: 'form',
    guidance: '21 CFR 312.23(a)(1)',
    generationPrompt: 'Generate the structured data for FDA Form 1571 (IND Application). Include: sponsor name and address, date of submission, IND number, drug name, indication, phase of clinical investigation, and a list of all attachments/modules being submitted.',
    wordCountRange: [200, 500],
  },
  {
    code: '1.3',
    title: 'FDA Form 1572 — Statement of Investigator',
    module: 1,
    moduleName: 'Administrative',
    required: true,
    contentType: 'form',
    guidance: '21 CFR 312.53',
    generationPrompt: 'Generate the structured data for FDA Form 1572 (Statement of Investigator). Include: investigator name and qualifications, clinical site address, IRB information, sub-investigators, research facilities description, and commitment to conduct the study per the protocol.',
    wordCountRange: [200, 400],
  },
  {
    code: '1.4',
    title: 'FDA Form 3674 — Certification of Compliance',
    module: 1,
    moduleName: 'Administrative',
    required: true,
    contentType: 'form',
    guidance: '42 U.S.C. 282(j)(5)(B)',
    generationPrompt: 'Generate the structured data for FDA Form 3674 certifying compliance with ClinicalTrials.gov registration and results reporting requirements under Section 402(j) of the PHS Act.',
    wordCountRange: [100, 300],
  },
  {
    code: '1.5',
    title: 'Table of Contents',
    module: 1,
    moduleName: 'Administrative',
    required: true,
    contentType: 'list',
    guidance: '21 CFR 312.23(a)(2)',
    generationPrompt: 'Generate a comprehensive table of contents for the IND submission, listing all modules (1-5) with section codes, titles, and page references. Follow the ICH M4 CTD structure.',
    wordCountRange: [200, 500],
  },
];

// ─── Module 2 — Summaries ─────────────────────────────────────────────────────

const MODULE_2: INDSection[] = [
  {
    code: '2.2',
    title: 'Introduction',
    module: 2,
    moduleName: 'CTD Summaries',
    required: true,
    contentType: 'narrative',
    guidance: 'ICH M4, 21 CFR 312.23(a)(3)',
    generationPrompt: 'Draft the CTD Module 2.2 Introduction for {{PRODUCT_NAME}}. Include: pharmacological class, proposed indication(s), mechanism of action, and a brief overview of the development program. Reference the investigational product\'s chemical/biological nature and the rationale for studying it in the proposed patient population.',
    wordCountRange: [500, 1500],
  },
  {
    code: '2.3',
    title: 'Quality Overall Summary',
    module: 2,
    moduleName: 'CTD Summaries',
    required: true,
    contentType: 'narrative',
    guidance: 'ICH M4Q(R1)',
    generationPrompt: 'Draft the CTD Module 2.3 Quality Overall Summary for {{PRODUCT_NAME}}. Summarize the drug substance (manufacturing, characterization, controls) and drug product (formulation, manufacturing, specifications). Include stability data summary and container closure information.',
    wordCountRange: [2000, 5000],
    dependencies: ['3.2.S', '3.2.P'],
  },
  {
    code: '2.4',
    title: 'Nonclinical Overview',
    module: 2,
    moduleName: 'CTD Summaries',
    required: true,
    contentType: 'narrative',
    guidance: 'ICH M4S(R2)',
    generationPrompt: 'Draft the CTD Module 2.4 Nonclinical Overview for {{PRODUCT_NAME}}. Provide an integrated assessment of the pharmacology, pharmacokinetics, and toxicology data. Discuss the relevance of animal models to the proposed clinical studies and address any safety concerns.',
    wordCountRange: [3000, 8000],
    dependencies: ['4.2.1', '4.2.2', '4.2.3'],
  },
  {
    code: '2.5',
    title: 'Clinical Overview',
    module: 2,
    moduleName: 'CTD Summaries',
    required: true,
    contentType: 'narrative',
    guidance: 'ICH M4E(R2)',
    generationPrompt: 'Draft the CTD Module 2.5 Clinical Overview for {{PRODUCT_NAME}}. Include: product development rationale, biopharmaceutic and clinical pharmacology overview, efficacy and safety overview for the proposed indication. For initial IND, focus on the rationale for first-in-human study design.',
    wordCountRange: [3000, 10000],
    dependencies: ['5.3'],
  },
  {
    code: '2.6',
    title: 'Nonclinical Written and Tabulated Summaries',
    module: 2,
    moduleName: 'CTD Summaries',
    required: true,
    contentType: 'mixed',
    guidance: 'ICH M4S(R2)',
    generationPrompt: 'Draft the CTD Module 2.6 Nonclinical Written and Tabulated Summaries for {{PRODUCT_NAME}}. Include: 2.6.1 Introduction, 2.6.2 Pharmacology Written Summary, 2.6.3 Pharmacology Tabulated Summary, 2.6.4 Pharmacokinetics Written Summary, 2.6.5 Pharmacokinetics Tabulated Summary, 2.6.6 Toxicology Written Summary, 2.6.7 Toxicology Tabulated Summary.',
    wordCountRange: [5000, 15000],
    dependencies: ['4.2.1', '4.2.2', '4.2.3'],
  },
  {
    code: '2.7',
    title: 'Clinical Summary',
    module: 2,
    moduleName: 'CTD Summaries',
    required: false,
    contentType: 'mixed',
    guidance: 'ICH M4E(R2)',
    generationPrompt: 'Draft the CTD Module 2.7 Clinical Summary for {{PRODUCT_NAME}}. Include: 2.7.1 Biopharmaceutics, 2.7.2 Clinical Pharmacology, 2.7.3 Summary of Efficacy, 2.7.4 Summary of Safety, 2.7.5 Literature References, 2.7.6 Synopses. For initial IND, this may be abbreviated.',
    wordCountRange: [5000, 20000],
    dependencies: ['5.3'],
  },
];

// ─── Module 3 — Quality (CMC) ─────────────────────────────────────────────────

const MODULE_3: INDSection[] = [
  {
    code: '3.2.S',
    title: 'Drug Substance',
    module: 3,
    moduleName: 'Quality (CMC)',
    required: true,
    contentType: 'mixed',
    guidance: 'ICH M4Q(R1), 21 CFR 312.23(a)(7)',
    generationPrompt: 'Draft the CTD Module 3.2.S Drug Substance section for {{PRODUCT_NAME}}. Include: 3.2.S.1 General Information (nomenclature, structure, properties), 3.2.S.2 Manufacture (manufacturer, process description, controls), 3.2.S.3 Characterization (structure, impurities), 3.2.S.4 Control of Drug Substance (specifications, analytical methods), 3.2.S.5 Reference Standards, 3.2.S.6 Container Closure, 3.2.S.7 Stability.',
    wordCountRange: [3000, 10000],
  },
  {
    code: '3.2.P',
    title: 'Drug Product',
    module: 3,
    moduleName: 'Quality (CMC)',
    required: true,
    contentType: 'mixed',
    guidance: 'ICH M4Q(R1), 21 CFR 312.23(a)(7)',
    generationPrompt: 'Draft the CTD Module 3.2.P Drug Product section for {{PRODUCT_NAME}}. Include: 3.2.P.1 Description and Composition, 3.2.P.2 Pharmaceutical Development, 3.2.P.3 Manufacture (batch formula, process, controls, validation), 3.2.P.4 Control of Excipients, 3.2.P.5 Control of Drug Product (specifications), 3.2.P.6 Reference Standards, 3.2.P.7 Container Closure, 3.2.P.8 Stability.',
    wordCountRange: [3000, 10000],
  },
  {
    code: '3.2.A',
    title: 'Appendices',
    module: 3,
    moduleName: 'Quality (CMC)',
    required: false,
    contentType: 'mixed',
    guidance: 'ICH M4Q(R1)',
    generationPrompt: 'Draft appendices for Module 3 including: 3.2.A.1 Facilities and Equipment, 3.2.A.2 Adventitious Agents Safety Evaluation (if applicable for biologics), 3.2.A.3 Novel Excipients (if applicable).',
    wordCountRange: [500, 3000],
  },
];

// ─── Module 4 — Nonclinical ───────────────────────────────────────────────────

const MODULE_4: INDSection[] = [
  {
    code: '4.2.1',
    title: 'Pharmacology',
    module: 4,
    moduleName: 'Nonclinical',
    required: true,
    contentType: 'narrative',
    guidance: 'ICH M4S(R2), ICH S7A/S7B',
    generationPrompt: 'Draft the CTD Module 4.2.1 Pharmacology section for {{PRODUCT_NAME}}. Include: 4.2.1.1 Primary Pharmacodynamics (mechanism of action, in vitro/in vivo efficacy), 4.2.1.2 Secondary Pharmacodynamics (off-target effects), 4.2.1.3 Safety Pharmacology (cardiovascular, CNS, respiratory).',
    wordCountRange: [2000, 8000],
  },
  {
    code: '4.2.2',
    title: 'Pharmacokinetics',
    module: 4,
    moduleName: 'Nonclinical',
    required: true,
    contentType: 'mixed',
    guidance: 'ICH M4S(R2), ICH S3A/S3B',
    generationPrompt: 'Draft the CTD Module 4.2.2 Pharmacokinetics section for {{PRODUCT_NAME}}. Include: 4.2.2.1 Analytical Methods, 4.2.2.2 Absorption, 4.2.2.3 Distribution, 4.2.2.4 Metabolism, 4.2.2.5 Excretion, 4.2.2.6 Drug Interactions.',
    wordCountRange: [2000, 6000],
  },
  {
    code: '4.2.3',
    title: 'Toxicology',
    module: 4,
    moduleName: 'Nonclinical',
    required: true,
    contentType: 'mixed',
    guidance: 'ICH M4S(R2), ICH M3(R2), ICH S5(R3)',
    generationPrompt: 'Draft the CTD Module 4.2.3 Toxicology section for {{PRODUCT_NAME}}. Include: 4.2.3.1 Single-Dose Toxicity, 4.2.3.2 Repeat-Dose Toxicity, 4.2.3.3 Genotoxicity, 4.2.3.4 Carcinogenicity (if applicable), 4.2.3.5 Reproductive/Developmental Toxicity, 4.2.3.6 Local Tolerance, 4.2.3.7 Other Toxicity Studies.',
    wordCountRange: [3000, 10000],
  },
];

// ─── Module 5 — Clinical ──────────────────────────────────────────────────────

const MODULE_5: INDSection[] = [
  {
    code: '5.3',
    title: 'Clinical Study Reports',
    module: 5,
    moduleName: 'Clinical',
    required: false,
    contentType: 'mixed',
    guidance: 'ICH E3, 21 CFR 312.23(a)(8)',
    generationPrompt: 'Draft or reference Clinical Study Reports for {{PRODUCT_NAME}}. For an initial IND, this may include: clinical pharmacology studies, bioavailability studies, or any prior human experience. Structure per ICH E3: title page, synopsis, table of contents, ethics, investigators, study design, study population, efficacy, safety, discussion, conclusions.',
    wordCountRange: [5000, 50000],
  },
  {
    code: '5.4',
    title: 'Literature References',
    module: 5,
    moduleName: 'Clinical',
    required: true,
    contentType: 'list',
    guidance: '21 CFR 312.23(a)(8)',
    generationPrompt: 'Compile literature references supporting the clinical development program for {{PRODUCT_NAME}}. Include published studies on the drug substance, mechanism of action, disease background, and any relevant clinical experience. Format per Vancouver/ICMJE citation style.',
    wordCountRange: [500, 3000],
  },
];

// ─── Complete Registry ────────────────────────────────────────────────────────

export const IND_SECTIONS: INDSection[] = [
  ...MODULE_1,
  ...MODULE_2,
  ...MODULE_3,
  ...MODULE_4,
  ...MODULE_5,
];

/**
 * Get sections for any FDA submission type.
 * IND, NDA, and BLA all use the same CTD Module 1-5 structure.
 * The difference is which sections are required vs optional.
 */
export function getSectionsForSubmissionType(type: 'IND' | 'NDA' | 'BLA'): INDSection[] {
  if (type === 'IND') return IND_SECTIONS;

  // NDA/BLA: same structure but Module 2.7 and Module 5.3 become required
  return IND_SECTIONS.map(s => {
    if (type === 'NDA' || type === 'BLA') {
      // For NDA/BLA, clinical summaries and CSRs are required
      if (s.code === '2.7' || s.code === '5.3' || s.code === '3.2.A') {
        return { ...s, required: true };
      }
    }
    return s;
  });
}

/** Get all sections for a specific module */
export function getSectionsByModule(module: 1 | 2 | 3 | 4 | 5): INDSection[] {
  return IND_SECTIONS.filter(s => s.module === module);
}

/** Get a specific section by code */
export function getSectionByCode(code: string): INDSection | undefined {
  return IND_SECTIONS.find(s => s.code === code);
}

/** Get all required sections */
export function getRequiredSections(): INDSection[] {
  return IND_SECTIONS.filter(s => s.required);
}

/** Get module completion status */
export function getModuleStatus(artifacts: Array<{ ctdSection?: string; status?: string }>): Record<string, { total: number; drafted: number; approved: number; completion: number }> {
  const modules: Record<string, { total: number; drafted: number; approved: number; completion: number }> = {};

  for (const section of IND_SECTIONS) {
    const modKey = `Module ${section.module}`;
    if (!modules[modKey]) {
      modules[modKey] = { total: 0, drafted: 0, approved: 0, completion: 0 };
    }
    modules[modKey].total++;

    const artifact = artifacts.find(a => a.ctdSection === section.code);
    if (artifact) {
      modules[modKey].drafted++;
      if (artifact.status === 'approved' || artifact.status === 'locked') {
        modules[modKey].approved++;
      }
    }
  }

  for (const mod of Object.values(modules)) {
    mod.completion = mod.total > 0 ? Math.round((mod.drafted / mod.total) * 100) : 0;
  }

  return modules;
}

/** Generate the prompt for a specific section with project context */
export function getGenerationPrompt(code: string, projectContext: {
  productName?: string;
  indication?: string;
  sponsor?: string;
  phase?: string;
}): string {
  const section = getSectionByCode(code);
  if (!section) return '';

  let prompt = section.generationPrompt;
  prompt = prompt.replace(/\{\{PRODUCT_NAME\}\}/g, projectContext.productName || '[Product Name]');
  prompt = prompt.replace(/\{\{INDICATION\}\}/g, projectContext.indication || '[Indication]');
  prompt = prompt.replace(/\{\{SPONSOR\}\}/g, projectContext.sponsor || '[Sponsor]');
  prompt = prompt.replace(/\{\{PHASE\}\}/g, projectContext.phase || '[Phase]');

  return `You are a regulatory affairs expert. ${prompt}\n\nWrite in formal regulatory language suitable for FDA submission. Follow ICH M4 CTD structure. Include section headings and sub-headings as appropriate. Reference: ${section.guidance}.`;
}

export default IND_SECTIONS;
