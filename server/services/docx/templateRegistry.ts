/**
 * DOCX template blueprints — the RENDERING skeleton docxFactory fills.
 *
 * ── Which of the four "template" modules is this? ───────────────────────────
 * `DocumentTemplate` was exported by four modules in server/services/, with
 * four different shapes, so the name told a reader nothing. Each now says what
 * it owns and names the others:
 *
 *   · intelligence/template-registry.ts — WHICH template applies. DB-backed,
 *     async, resolves (agency, document_type, submission_type, indication) down
 *     a most-specific-first chain. Owns the name `DocumentTemplate`.
 *   · THIS FILE — what a chosen template LOOKS LIKE as a DOCX. Static,
 *     in-memory, sync. Section blueprints with CTD codes and boilerplate, fed
 *     to docxFactory. Owns `DocxTemplateBlueprint`.
 *   · regulatory/templateCatalog.ts — which templates are OFFERED for a
 *     registry entry. Metadata only (id/title/format/aiDraftable), no
 *     structure. Owns `CatalogTemplateEntry`.
 *   · ana-ri/document-actions.ts — the heading outline an AnA quick-action
 *     scaffolds from. Owns `ActionArtifactOutline`.
 *
 * (`market-specs/document-template-library.ts` supplies the heading outlines
 * templateCatalog's metadata lacks, and already states that boundary itself.)
 *
 * This module does NOT decide which template to use — ask template-registry.
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
import { e3Children, e3SectionSummary, e3TopLevel } from '../ind/ctd/csr-e3-guidance';
import type { E3Section } from '../ind/ctd/types';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface TemplateSectionBlueprint {
  /** Section heading */
  title: string;
  /** CTD/regulatory section code */
  sectionCode: string;
  /** Instructional text shown to LLM — what to write here */
  instruction?: string;
  /** Instructional text alias used by older blueprints */
  instructionalText?: string;
  /** Whether this section is required */
  required: boolean;
  /** Default boilerplate if LLM provides nothing */
  defaultText?: string;
  /** Sub-sections */
  subsections?: TemplateSectionBlueprint[];
  /** Expected tables */
  expectedTables?: { caption: string; suggestedHeaders: string[] }[];
}

export interface DocxTemplateBlueprint {
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
  /** Template version */
  version?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CER TEMPLATE — EU MDR 2017/745 (MEDDEV 2.7/1 Rev 4)
// ═══════════════════════════════════════════════════════════════════════════════

const cerTemplate: DocxTemplateBlueprint = {
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

const fda510kTemplate: DocxTemplateBlueprint = {
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
// CSR TEMPLATE — ICH E3, read from the E3 tree
// ═══════════════════════════════════════════════════════════════════════════════

/*
 * 2026-10-05 (g-csr-copies-onto-e3): this blueprint was a hand-written list
 * numbered 1–10 — Introduction 3 (E3: 7), References 10 (E3: 15), no §3–§6,
 * §14 or §16 — and it offered "No deaths occurred during the study." as the
 * default for its Deaths section. Every heading, its number, title and whether
 * it is expected now come from the canonical E3 tree
 * (server/services/ind/ctd/csr-e3-guidance.ts), to the depth E3 numbers it; the
 * instruction is the tree's own one-line summary. No section has a default: an
 * unwritten section is bracketed as owed, never stated.
 */
function e3Blueprint(s: E3Section): TemplateSectionBlueprint {
  const children = e3Children(s.number);
  return {
    title: s.title,
    sectionCode: s.number,
    required: s.applies === 'always',
    instruction: e3SectionSummary(s),
    ...(children.length ? { subsections: children.map(e3Blueprint) } : {}),
  };
}

const csrTemplate: DocxTemplateBlueprint = {
  id: 'csr-ich-e3',
  name: 'Clinical Study Report (ICH E3)',
  submissionType: 'CSR',
  region: 'ICH',
  standard: 'ICH E3: Structure and Content of Clinical Study Reports',
  requiredMetadata: ['product', 'sponsor'],
  sections: e3TopLevel().map(e3Blueprint),
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

// ─── IND Template (FDA IND Application — Modules 1-5) ────────────────────────

const indTemplate: DocxTemplateBlueprint = {
  id: 'ind-fda',
  name: 'IND Application (FDA)',
  submissionType: 'IND',
  region: 'FDA',
  standard: '21 CFR 312, ICH M4 (CTD), FDA Guidance for IND Applications',
  requiredMetadata: ['product', 'sponsor', 'region'],
  sections: [
    // Module 1
    { sectionCode: '1.1', title: 'Cover Letter', required: true, instruction: 'Draft an FDA IND cover letter including applicant information, IND number, and submission description.' },
    { sectionCode: '1.2', title: 'FDA Form 1571', required: true, instruction: 'Complete FDA Form 1571 with sponsor details, drug information, and regulatory classification.' },
    { sectionCode: '1.3', title: 'FDA Form 1572', required: true, instruction: 'Complete investigator statement with qualifications, facilities, and commitments.' },
    { sectionCode: '1.4', title: 'FDA Form 3674', required: true, instruction: 'Certify compliance with ClinicalTrials.gov registration requirements.' },
    { sectionCode: '1.5', title: 'Table of Contents', required: true, instruction: 'Generate comprehensive table of contents for all modules.' },
    // Module 2
    { sectionCode: '2.2', title: 'Introduction', required: true, instruction: 'Introduce the drug, its pharmacological class, mechanism of action, and proposed indication.' },
    { sectionCode: '2.3', title: 'Quality Overall Summary', required: true, instruction: 'Summarize drug substance manufacturing, characterization, controls, and drug product formulation.' },
    { sectionCode: '2.4', title: 'Nonclinical Overview', required: true, instruction: 'Provide integrated assessment of pharmacology, pharmacokinetics, and toxicology data.' },
    { sectionCode: '2.5', title: 'Clinical Overview', required: true, instruction: 'Summarize product development rationale, clinical pharmacology, efficacy, and safety.' },
    { sectionCode: '2.6', title: 'Nonclinical Summaries', required: true, instruction: 'Written and tabulated summaries for pharmacology, PK, and toxicology.' },
    { sectionCode: '2.7', title: 'Clinical Summary', required: false, instruction: 'Biopharmaceutics, clinical pharmacology, efficacy, safety summaries.' },
    // Module 3
    { sectionCode: '3.2.S', title: 'Drug Substance', required: true, instruction: 'General information, manufacture, characterization, control, reference standards, stability.' },
    { sectionCode: '3.2.P', title: 'Drug Product', required: true, instruction: 'Description, pharmaceutical development, manufacture, control, stability.' },
    { sectionCode: '3.2.A', title: 'Appendices', required: false, instruction: 'Facilities, adventitious agents, novel excipients.' },
    // Module 4
    { sectionCode: '4.2.1', title: 'Pharmacology', required: true, instruction: 'Primary and secondary pharmacodynamics, safety pharmacology.' },
    { sectionCode: '4.2.2', title: 'Pharmacokinetics', required: true, instruction: 'Absorption, distribution, metabolism, excretion studies.' },
    { sectionCode: '4.2.3', title: 'Toxicology', required: true, instruction: 'Single-dose, repeat-dose, genotoxicity, reproductive toxicity studies.' },
    // Module 5
    { sectionCode: '5.3', title: 'Clinical Study Reports', required: false, instruction: 'ICH E3 compliant clinical study reports for prior human experience.' },
    { sectionCode: '5.4', title: 'Literature References', required: true, instruction: 'Published evidence supporting the clinical development program.' },
  ],
};

const templates = new Map<string, DocxTemplateBlueprint>();
templates.set(cerTemplate.id, cerTemplate);
templates.set(fda510kTemplate.id, fda510kTemplate);
templates.set(csrTemplate.id, csrTemplate);
templates.set(indTemplate.id, indTemplate);

export function getTemplate(id: string): DocxTemplateBlueprint | undefined {
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
 * What a section nobody wrote says.
 *
 * `defaultText` used to be emitted as ordinary unmarked body prose, while a
 * section WITHOUT one was bracketed as an instruction — so the sections that
 * read as authored fact were exactly the ones nobody authored. Several of those
 * defaults are positive regulatory declarations:
 *
 *   fda-510k   5.3  "Not applicable — device does not contain software."
 *              5.4  "Not applicable — device is not electrically powered."
 *              5.5  "Not applicable — device is supplied non-sterile."
 *              7    "Clinical data is not required for this submission…"
 *   cer-eu-mdr 3.3  "No clinical investigations were conducted for this device."
 *              6    "The clinical evaluation was performed by qualified personnel…"
 *
 * (csr-ich-e3 offered "No deaths occurred during the study." under a Deaths
 * section it numbered 8.3; that blueprint is now read from the E3 tree and has
 * no defaults — 2026-10-05, g-csr-copies-onto-e3.)
 *
 * Nothing in this product ever asked whether the device contains software, is
 * mains-powered or ships sterile, whether clinical data are required, or who
 * the evaluators were. The absence of an answer became the answer, addressed to
 * FDA or a Notified Body — and for a software-driven, mains-powered, sterile
 * device the same document asserted all three of the opposite.
 *
 * The wording is still offered, because a sensible default saves an author
 * work; it is offered as a PROPOSAL they have to accept. Everything unwritten
 * now starts with '[' so a reader scanning the DOCX can find every section
 * still owed, and nothing unwritten can be mistaken for prose someone stands
 * behind. This is the rule the rest of the repo already keeps: estar-mapper
 * treats an unanswered device flag as a gap ("a question nobody answered is not
 * a section nobody needs"), and gspr-postmarket's checkContentField treats
 * scaffold text as ABSENT so it cannot pass a gate.
 */
function unwrittenSection(bp: TemplateSectionBlueprint): string {
  if (bp.defaultText) {
    return `[NOT YET AUTHORED — suggested wording, confirm before filing: ${bp.defaultText}]`;
  }
  return bp.required ? `[${bp.instruction}]` : `[Optional — ${bp.instruction}]`;
}

/**
 * Merge LLM-generated content with a template blueprint.
 *
 * The LLM provides partial sections (by sectionCode or title).
 * This function:
 *   1. Walks the template blueprint (including subsections)
 *   2. Matches LLM sections by sectionCode or title
 *   3. Marks every section the caller did not supply as unwritten — see
 *      {@link unwrittenSection}; a default is offered as a proposal, never as prose
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

  // A blueprint may carry the same title at two codes — ICH E3 has "Protocol
  // Deviations" at §10.2 (the narrative) and §16.2.2 (the patient-data
  // listing), and "Demographic Data" at §14.1 and §16.2.4. A title-only match
  // there is ambiguous, and matching both would write one caller's prose under
  // both numbers, so an ambiguous title is matched by sectionCode alone.
  // (2026-10-05, g-csr-copies-onto-e3: the hand-written ten-heading blueprint
  // could not collide; reading the full E3 tree made it possible.)
  const blueprintTitleCount = new Map<string, number>();
  const countTitle = (bp: TemplateSectionBlueprint): void => {
    const key = bp.title.toLowerCase().trim();
    blueprintTitleCount.set(key, (blueprintTitleCount.get(key) ?? 0) + 1);
    bp.subsections?.forEach(countTitle);
  };
  tpl.sections.forEach(countTitle);

  function findLlmSection(bp: TemplateSectionBlueprint): DocxSection | undefined {
    const byItsCode = byCode.get(bp.sectionCode);
    if (byItsCode) return byItsCode;
    const key = bp.title.toLowerCase().trim();
    return (blueprintTitleCount.get(key) ?? 0) > 1 ? undefined : byTitle.get(key);
  }

  // Flatten blueprint (with subsections in order)
  const assembledSections: DocxSection[] = [];

  function walkBlueprint(bp: TemplateSectionBlueprint, pageBreak: boolean) {
    const llm = findLlmSection(bp);

    const section: DocxSection = {
      title: bp.title,
      sectionCode: bp.sectionCode,
      paragraphs: llm?.paragraphs?.length ? llm.paragraphs : [unwrittenSection(bp)],
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
