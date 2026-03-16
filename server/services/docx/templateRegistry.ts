/**
 * Regulatory Document Template Registry
 *
 * Architecture (Veeva/Certara pattern):
 *   Template Blueprint → AI fills sections → docxFactory renders DOCX
 *
 * Each template defines:
 *   - Required metadata fields
 *   - Section structure with CTD/eCTD codes
 *   - Default instructional text (boilerplate)
 *   - Regulatory references
 *
 * The LLM receives the blueprint and fills each section with content.
 * The factory renders the populated structure into a formatted DOCX.
 */

import type { DocxSection, DocxMetadata, DocxInput } from './docxFactory';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface TemplateSectionBlueprint {
  /** Section heading */
  title: string;
  /** CTD/regulatory section code */
  sectionCode: string;
  /** Instructional text shown to LLM — what to write here */
  instruction: string;
  /** Whether this section is required */
  required: boolean;
  /** Default boilerplate if LLM provides nothing */
  defaultText?: string;
  /** Sub-sections */
  subsections?: TemplateSectionBlueprint[];
  /** Expected tables */
  expectedTables?: { caption: string; suggestedHeaders: string[] }[];
}

export interface DocumentTemplate {
  /** Template identifier */
  id: string;
  /** Display name */
  name: string;
  /** Submission type code */
  submissionType: string;
  /** Regulatory region */
  region: string;
  /** Regulatory standard reference */
  standard: string;
  /** Required metadata fields beyond base */
  requiredMetadata: string[];
  /** Section blueprints */
  sections: TemplateSectionBlueprint[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// CER TEMPLATE — EU MDR 2017/745 (MEDDEV 2.7/1 Rev 4)
// ═══════════════════════════════════════════════════════════════════════════════

const cerTemplate: DocumentTemplate = {
  id: 'cer-eu-mdr',
  name: 'Clinical Evaluation Report (EU MDR)',
  submissionType: 'CER',
  region: 'EMA',
  standard: 'MEDDEV 2.7/1 Rev 4, EU MDR 2017/745',
  requiredMetadata: ['product', 'sponsor', 'region'],
  sections: [
    {
      title: 'Executive Summary',
      sectionCode: '1',
      required: true,
      instruction:
        'Provide a concise overview of the clinical evaluation, including device description, intended purpose, clinical evidence summary, and overall benefit-risk conclusion. 1-2 pages.',
      expectedTables: [
        {
          caption: 'Table 1 — Document Overview',
          suggestedHeaders: ['Item', 'Details'],
        },
      ],
    },
    {
      title: 'Scope of the Clinical Evaluation',
      sectionCode: '2',
      required: true,
      instruction:
        'Define the scope: device identification, intended purpose, target population, clinical claims, and standards/guidance applied. Reference MEDDEV 2.7/1 Rev 4.',
      subsections: [
        {
          title: 'Device Identification',
          sectionCode: '2.1',
          required: true,
          instruction: 'Trade name, model/catalog numbers, UDI-DI, GMDN code, accessories.',
        },
        {
          title: 'Intended Purpose and Claims',
          sectionCode: '2.2',
          required: true,
          instruction:
            'Intended purpose per IFU, clinical claims, target patient population, intended users, clinical conditions.',
        },
        {
          title: 'Clinical Background',
          sectionCode: '2.3',
          required: true,
          instruction:
            'Current knowledge of the medical condition, available treatments, state of the art, relevant anatomy/physiology.',
        },
      ],
    },
    {
      title: 'Clinical Evidence',
      sectionCode: '3',
      required: true,
      instruction:
        'Describe all clinical evidence: literature, clinical investigations, PMS/PMCF, registry data.',
      subsections: [
        {
          title: 'Literature Search Protocol',
          sectionCode: '3.1',
          required: true,
          instruction:
            'Databases searched (PubMed, Embase, Cochrane), search terms, date range, inclusion/exclusion criteria, PRISMA flow.',
          expectedTables: [
            {
              caption: 'Table 2 — Literature Search Strategy',
              suggestedHeaders: ['Database', 'Search Terms', 'Date Range', 'Results'],
            },
          ],
        },
        {
          title: 'Literature Appraisal',
          sectionCode: '3.2',
          required: true,
          instruction:
            'Systematic appraisal of identified publications. Relevance scoring, quality assessment, data extraction summary.',
        },
        {
          title: 'Clinical Investigations',
          sectionCode: '3.3',
          required: false,
          instruction:
            'Summary of any sponsor or third-party clinical investigations. Study design, endpoints, results.',
          defaultText: 'No clinical investigations were conducted for this device.',
        },
        {
          title: 'Post-Market Clinical Data',
          sectionCode: '3.4',
          required: true,
          instruction:
            'PMS reports, PMCF study results, complaint analysis, vigilance reports (serious incidents, FSCAs).',
        },
      ],
    },
    {
      title: 'Risk-Benefit Analysis',
      sectionCode: '4',
      required: true,
      instruction:
        'Identify residual risks from clinical data, quantify clinical benefits, provide overall benefit-risk determination per Annex I GSPR.',
      subsections: [
        {
          title: 'Identification of Risks',
          sectionCode: '4.1',
          required: true,
          instruction:
            'List residual risks identified from clinical data and risk management file.',
          expectedTables: [
            {
              caption: 'Table 3 — Residual Risk Summary',
              suggestedHeaders: ['Risk', 'Severity', 'Probability', 'Mitigation', 'Residual Level'],
            },
          ],
        },
        {
          title: 'Clinical Benefits',
          sectionCode: '4.2',
          required: true,
          instruction: 'Quantified clinical benefits supported by evidence.',
        },
        {
          title: 'Benefit-Risk Determination',
          sectionCode: '4.3',
          required: true,
          instruction:
            'Overall conclusion: do benefits outweigh risks? Reference state of the art.',
        },
      ],
    },
    {
      title: 'Conclusions',
      sectionCode: '5',
      required: true,
      instruction:
        'Confirm device meets GSPR requirements. State whether clinical evidence is sufficient. Identify any gaps and planned PMCF activities. Provide final statement of clinical evaluation.',
    },
    {
      title: 'Qualifications of Evaluators',
      sectionCode: '6',
      required: true,
      instruction:
        'CVs/qualifications of the clinical evaluators per MEDDEV 2.7/1 Rev 4 requirements.',
      defaultText:
        'The clinical evaluation was performed by qualified personnel with documented training and experience in the relevant medical field and regulatory requirements.',
    },
    {
      title: 'References',
      sectionCode: '7',
      required: true,
      instruction: 'Numbered list of all references cited in the report.',
    },
    {
      title: 'Appendices',
      sectionCode: '8',
      required: false,
      instruction: 'Literature search logs, appraisal tables, PMCF plan, supporting data.',
      defaultText: 'See attached appendices.',
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// 510(K) TEMPLATE — FDA 21 CFR 807 Subpart E
// ═══════════════════════════════════════════════════════════════════════════════

const fda510kTemplate: DocumentTemplate = {
  id: 'fda-510k',
  name: 'FDA 510(k) Premarket Notification',
  submissionType: '510K',
  region: 'FDA',
  standard: '21 CFR 807 Subpart E, FDA Guidance: The 510(k) Program',
  requiredMetadata: ['product', 'sponsor', 'region'],
  sections: [
    {
      title: 'Cover Letter',
      sectionCode: '1',
      required: true,
      instruction:
        'Formal cover letter to FDA CDRH. Include device name, classification, product code, applicant name, and submission contact.',
    },
    {
      title: 'Indications for Use Statement',
      sectionCode: '2',
      required: true,
      instruction:
        'FDA Form 3881 content: device name, indications for use, prescription/OTC status, 510(k) number placeholder.',
    },
    {
      title: 'Device Description',
      sectionCode: '3',
      required: true,
      instruction:
        'Complete description: technology, principles of operation, components, materials, specifications, software (if applicable), accessories.',
      expectedTables: [
        {
          caption: 'Table 1 — Device Specifications',
          suggestedHeaders: ['Parameter', 'Specification'],
        },
      ],
    },
    {
      title: 'Substantial Equivalence Comparison',
      sectionCode: '4',
      required: true,
      instruction:
        'Side-by-side comparison with predicate device(s). Cover intended use, technology, performance, materials, biocompatibility.',
      expectedTables: [
        {
          caption: 'Table 2 — Predicate Comparison',
          suggestedHeaders: ['Feature', 'Subject Device', 'Predicate Device', 'Comparison'],
        },
      ],
      subsections: [
        {
          title: 'Predicate Device Information',
          sectionCode: '4.1',
          required: true,
          instruction:
            'Predicate device name, manufacturer, 510(k) number, classification, product code.',
        },
        {
          title: 'Comparison of Intended Use',
          sectionCode: '4.2',
          required: true,
          instruction: 'Demonstrate same intended use/indications between subject and predicate.',
        },
        {
          title: 'Comparison of Technological Characteristics',
          sectionCode: '4.3',
          required: true,
          instruction:
            'If different technology, explain why differences do not raise new safety/effectiveness questions.',
        },
      ],
    },
    {
      title: 'Performance Testing',
      sectionCode: '5',
      required: true,
      instruction:
        'Summary of bench, animal, and clinical testing demonstrating substantial equivalence.',
      subsections: [
        {
          title: 'Bench Testing',
          sectionCode: '5.1',
          required: true,
          instruction:
            'Mechanical, electrical, software verification, shelf life, packaging validation.',
        },
        {
          title: 'Biocompatibility',
          sectionCode: '5.2',
          required: true,
          instruction:
            'ISO 10993 risk assessment and testing summary. Cytotoxicity, sensitization, irritation, etc.',
          expectedTables: [
            {
              caption: 'Table 3 — Biocompatibility Test Summary',
              suggestedHeaders: ['Test', 'Standard', 'Result', 'Conclusion'],
            },
          ],
        },
        {
          title: 'Software Validation',
          sectionCode: '5.3',
          required: false,
          instruction:
            'IEC 62304 software lifecycle documentation, level of concern, hazard analysis.',
          defaultText: 'Not applicable — device does not contain software.',
        },
        {
          title: 'Electrical Safety and EMC',
          sectionCode: '5.4',
          required: false,
          instruction: 'IEC 60601-1 and IEC 60601-1-2 testing summary.',
          defaultText: 'Not applicable — device is not electrically powered.',
        },
        {
          title: 'Sterilization',
          sectionCode: '5.5',
          required: false,
          instruction: 'Sterilization method validation per ISO 11135/11137/17665.',
          defaultText: 'Not applicable — device is supplied non-sterile.',
        },
      ],
    },
    {
      title: 'Labeling',
      sectionCode: '6',
      required: true,
      instruction: 'Draft labeling: device label, IFU, packaging. Must comply with 21 CFR 801.',
    },
    {
      title: 'Clinical Data',
      sectionCode: '7',
      required: false,
      instruction:
        'Clinical study data if applicable. Study protocol, results, adverse events, conclusions.',
      defaultText:
        'Clinical data is not required for this submission. Substantial equivalence is demonstrated through bench and performance testing.',
    },
    {
      title: 'Summary',
      sectionCode: '8',
      required: true,
      instruction:
        'Conclude that the subject device is substantially equivalent to the predicate. Summarize key evidence.',
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// CSR TEMPLATE — ICH E3
// ═══════════════════════════════════════════════════════════════════════════════

const csrTemplate: DocumentTemplate = {
  id: 'csr-ich-e3',
  name: 'Clinical Study Report (ICH E3)',
  submissionType: 'CSR',
  region: 'ICH',
  standard: 'ICH E3: Structure and Content of Clinical Study Reports',
  requiredMetadata: ['product', 'sponsor'],
  sections: [
    {
      title: 'Title Page',
      sectionCode: '1',
      required: true,
      instruction:
        'Study title, protocol number, phase, sponsor, investigational product, therapeutic area, study dates, report date.',
    },
    {
      title: 'Synopsis',
      sectionCode: '2',
      required: true,
      instruction:
        'Structured synopsis: study design, objectives, endpoints, sample size, treatment duration, key results, conclusions. Typically 3-5 pages.',
      expectedTables: [
        {
          caption: 'Table 1 — Study Synopsis',
          suggestedHeaders: ['Item', 'Description'],
        },
      ],
    },
    {
      title: 'Introduction',
      sectionCode: '3',
      required: true,
      instruction:
        'Disease background, rationale for the study, summary of relevant nonclinical and clinical findings.',
    },
    {
      title: 'Study Objectives',
      sectionCode: '4',
      required: true,
      instruction: 'Primary and secondary objectives. Exploratory objectives if applicable.',
    },
    {
      title: 'Investigational Plan',
      sectionCode: '5',
      required: true,
      instruction:
        'Study design, selection of study population, treatments, efficacy/safety measures, statistical methods.',
      subsections: [
        {
          title: 'Study Design',
          sectionCode: '5.1',
          required: true,
          instruction:
            'Design type (parallel, crossover, etc.), randomization, blinding, stratification, study periods.',
        },
        {
          title: 'Study Population',
          sectionCode: '5.2',
          required: true,
          instruction: 'Inclusion/exclusion criteria, planned and actual enrollment, demographics.',
          expectedTables: [
            {
              caption: 'Table 2 — Key Inclusion/Exclusion Criteria',
              suggestedHeaders: ['Criterion', 'Type', 'Description'],
            },
          ],
        },
        {
          title: 'Treatments',
          sectionCode: '5.3',
          required: true,
          instruction:
            'Description of investigational and comparator treatments. Dose, route, regimen, duration.',
        },
        {
          title: 'Efficacy Assessments',
          sectionCode: '5.4',
          required: true,
          instruction:
            'Primary and secondary efficacy endpoints. Measurement methods, assessment schedule.',
        },
        {
          title: 'Safety Assessments',
          sectionCode: '5.5',
          required: true,
          instruction:
            'Safety endpoints, adverse event collection, laboratory assessments, vital signs, ECG.',
        },
        {
          title: 'Statistical Methods',
          sectionCode: '5.6',
          required: true,
          instruction:
            'Analysis populations (ITT, PP, safety), sample size calculation, hypothesis testing, pre-specified analyses.',
        },
      ],
    },
    {
      title: 'Study Patients',
      sectionCode: '6',
      required: true,
      instruction: 'Disposition, protocol deviations, demographics, baseline characteristics.',
      subsections: [
        {
          title: 'Patient Disposition',
          sectionCode: '6.1',
          required: true,
          instruction:
            'CONSORT flow: screened, enrolled, randomized, completed, discontinued (reasons).',
          expectedTables: [
            {
              caption: 'Table 3 — Patient Disposition',
              suggestedHeaders: ['Category', 'Treatment Arm', 'Control Arm', 'Total'],
            },
          ],
        },
        {
          title: 'Demographics and Baseline Characteristics',
          sectionCode: '6.2',
          required: true,
          instruction: 'Age, sex, race, weight, disease severity, relevant medical history.',
          expectedTables: [
            {
              caption: 'Table 4 — Demographics',
              suggestedHeaders: ['Characteristic', 'Treatment (N=)', 'Control (N=)', 'p-value'],
            },
          ],
        },
      ],
    },
    {
      title: 'Efficacy Results',
      sectionCode: '7',
      required: true,
      instruction:
        'Analysis of primary and secondary endpoints. Statistical results, clinical significance.',
      subsections: [
        {
          title: 'Primary Endpoint',
          sectionCode: '7.1',
          required: true,
          instruction: 'Primary efficacy analysis with confidence intervals and p-values.',
          expectedTables: [
            {
              caption: 'Table 5 — Primary Efficacy Endpoint',
              suggestedHeaders: [
                'Endpoint',
                'Treatment',
                'Control',
                'Difference',
                '95% CI',
                'p-value',
              ],
            },
          ],
        },
        {
          title: 'Secondary Endpoints',
          sectionCode: '7.2',
          required: true,
          instruction: 'Analysis of secondary endpoints. Multiplicity adjustment if applicable.',
        },
      ],
    },
    {
      title: 'Safety Results',
      sectionCode: '8',
      required: true,
      instruction:
        'Adverse events, serious adverse events, deaths, laboratory findings, vital signs.',
      subsections: [
        {
          title: 'Adverse Events',
          sectionCode: '8.1',
          required: true,
          instruction:
            'Overall AE incidence, treatment-emergent AEs by SOC/PT, severity, relationship to treatment.',
          expectedTables: [
            {
              caption: 'Table 6 — Treatment-Emergent Adverse Events',
              suggestedHeaders: [
                'SOC / Preferred Term',
                'Treatment N (%)',
                'Control N (%)',
                'p-value',
              ],
            },
          ],
        },
        {
          title: 'Serious Adverse Events',
          sectionCode: '8.2',
          required: true,
          instruction: 'Listing and narratives of all SAEs. Relationship assessment, outcome.',
        },
        {
          title: 'Deaths',
          sectionCode: '8.3',
          required: true,
          instruction: 'Description of all deaths during the study. Cause, relationship, timing.',
          defaultText: 'No deaths occurred during the study.',
        },
        {
          title: 'Laboratory Findings',
          sectionCode: '8.4',
          required: true,
          instruction: 'Clinically significant laboratory changes, shift tables.',
        },
      ],
    },
    {
      title: 'Discussion and Conclusions',
      sectionCode: '9',
      required: true,
      instruction:
        'Interpretation of efficacy and safety results. Comparison with existing literature. Risk-benefit assessment. Conclusions regarding study objectives.',
    },
    {
      title: 'References',
      sectionCode: '10',
      required: true,
      instruction: 'All references cited in the report.',
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

const templates = new Map<string, DocumentTemplate>();
templates.set(cerTemplate.id, cerTemplate);
templates.set(fda510kTemplate.id, fda510kTemplate);
templates.set(csrTemplate.id, csrTemplate);

export function getTemplate(id: string): DocumentTemplate | undefined {
  return templates.get(id);
}

export function listTemplates(): {
  id: string;
  name: string;
  submissionType: string;
  region: string;
}[] {
  return Array.from(templates.values()).map(t => ({
    id: t.id,
    name: t.name,
    submissionType: t.submissionType,
    region: t.region,
  }));
}

/** All registered template IDs */
export function templateIds(): string[] {
  return Array.from(templates.keys());
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE → DocxInput MERGER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Merge LLM-generated content with a template blueprint.
 *
 * The LLM provides partial sections (by sectionCode or title).
 * This function:
 *   1. Walks the template blueprint (including subsections)
 *   2. Matches LLM sections by sectionCode or title
 *   3. Falls back to instruction text / defaultText for missing required sections
 *   4. Returns a fully populated DocxInput ready for generateRegulatory()
 */
export function mergeWithTemplate(
  templateId: string,
  metadata: DocxMetadata,
  llmSections: DocxSection[]
): DocxInput {
  const tpl = templates.get(templateId);
  if (!tpl) {
    throw new Error(`Template "${templateId}" not found. Available: ${templateIds().join(', ')}`);
  }

  // Index LLM sections by code and title for fast lookup
  const byCode = new Map<string, DocxSection>();
  const byTitle = new Map<string, DocxSection>();
  for (const s of llmSections) {
    if (s.sectionCode) byCode.set(s.sectionCode, s);
    byTitle.set(s.title.toLowerCase().trim(), s);
  }

  function findLlmSection(bp: TemplateSectionBlueprint): DocxSection | undefined {
    return byCode.get(bp.sectionCode) ?? byTitle.get(bp.title.toLowerCase().trim());
  }

  // Flatten blueprint (with subsections in order)
  const assembledSections: DocxSection[] = [];

  function walkBlueprint(bp: TemplateSectionBlueprint, pageBreak: boolean) {
    const llm = findLlmSection(bp);

    const section: DocxSection = {
      title: bp.title,
      sectionCode: bp.sectionCode,
      paragraphs: llm?.paragraphs?.length
        ? llm.paragraphs
        : bp.defaultText
          ? [bp.defaultText]
          : bp.required
            ? [`[${bp.instruction}]`]
            : [`[Optional — ${bp.instruction}]`],
      tables: llm?.tables,
      pageBreak,
    };

    assembledSections.push(section);

    // Walk subsections
    if (bp.subsections) {
      for (const sub of bp.subsections) {
        walkBlueprint(sub, false);
      }
    }
  }

  for (let i = 0; i < tpl.sections.length; i++) {
    walkBlueprint(tpl.sections[i], i > 0); // page break before each top-level section except first
  }

  return {
    metadata: {
      ...metadata,
      submissionType: metadata.submissionType || tpl.submissionType,
      region: metadata.region || tpl.region,
    },
    sections: assembledSections,
  };
}
