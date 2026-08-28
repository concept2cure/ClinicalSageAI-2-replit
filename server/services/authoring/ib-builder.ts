/**
 * @fileoverview Investigator's Brochure (IB) Authoring Engine
 * @module server/services/authoring/ib-builder
 *
 * Generates a complete ICH E6(R2) §7 Investigator's Brochure with AI-powered
 * section drafting. Pulls source content from the nonclinical summaries
 * (M2.4 Nonclinical Overview / M2.6 Written & Tabulated Summaries), the clinical
 * summaries (M2.5 Clinical Overview / M2.7 Clinical Summary), and a structured
 * safety/marketing-experience input, then drafts each IB section.
 *
 * INTEGRATION NOTES
 * -----------------
 * - This engine mirrors `server/services/csr-builder.ts` exactly so it compiles
 *   and integrates with the rest of the platform:
 *     • AI drafting goes through the unified AI gateway via the SAME dynamic
 *       import + call: `(await import('../../lib/unified-ai-client.js')).ai`,
 *       then `ai.complete(messages, { taskType, maxTokens, temperature,
 *       callerModule })`. When the gateway is unavailable it degrades to
 *       deterministic template drafting, just like csr-builder.
 *     • The section/structure model mirrors csr-builder's `CSRSection`
 *       (`number`, `title`, `required`, `description`, optional `childSections`).
 *     • The build-job model mirrors `CSRBuildJob`/`CSRBuildRequest`
 *       (`id`, `status`, `progress`, `sections`, `createdAt`).
 * - Per-section results add a regulatory-completeness verdict
 *   `{ status: 'rendered' | 'partial' | 'missing', content, gaps }`, computed
 *   deterministically from which inputs were available — independent of the AI
 *   call, so the gap engine is fully unit-testable offline.
 * - Input shapes reuse the M2 summary builders (`M2Summary`) and the preclinical
 *   loaders' study shape (`NonclinicalStudyInput`) so the IB consumes the same
 *   upstream artefacts the CTD composers produce. No existing files are edited.
 *
 * @compliance ICH E6(R2) §7; ICH M4S(R2); ICH M4E(R2).
 */

import type { M2Summary } from '../m2-summary-builders.js';
import type { NonclinicalStudyInput } from '../preclinical/nonclinical-m24-adapter.js';

// AI-powered drafting via the unified AI client (Claude primary) — identical
// acquisition pattern to csr-builder so behaviour and audit routing match.
let ai: { complete: (messages: any, options?: any) => Promise<string> } | null = null;
try {
  const mod = await import('../../lib/unified-ai-client.js');
  ai = mod.ai;
} catch {
  console.warn('[IB Builder] Unified AI client not available, using template drafting');
}

// ═══════════════════════════════════════════════════════════════════════════════
// IB SECTION STRUCTURE (ICH E6(R2) §7 / IB guidance)
// ═══════════════════════════════════════════════════════════════════════════════

export interface IBSection {
  number: string;
  title: string;
  required: boolean;
  description: string;
  content?: string;
  status: 'empty' | 'drafting' | 'drafted' | 'reviewed' | 'approved';
  /** Which input domains feed this section (used by the gap engine). */
  inputs: IBInputDomain[];
  childSections?: IBSection[];
}

/** The upstream data domains an IB section can draw on. */
export type IBInputDomain =
  | 'product' // physical/chemical/pharmaceutical + formulation
  | 'nonclinical' // M2.4 / M2.6 nonclinical
  | 'clinical' // M2.5 / M2.7 clinical
  | 'safety' // integrated safety / marketing experience
  | 'none'; // boilerplate / structural

export const IB_STRUCTURE: IBSection[] = [
  { number: '0', title: 'Title Page', required: true, status: 'empty', inputs: ['none'], description: 'Sponsor name, product identifier(s), IB edition number and date, supersedes statement' },
  { number: '0a', title: 'Confidentiality Statement', required: true, status: 'empty', inputs: ['none'], description: 'Confidentiality notice and intended-recipient statement for investigators and IRB/IEC' },
  { number: '0b', title: 'Table of Contents', required: true, status: 'empty', inputs: ['none'], description: 'Auto-generated table of contents for the IB' },
  { number: '1', title: 'Summary', required: true, status: 'empty', inputs: ['nonclinical', 'clinical', 'safety'], description: 'Concise summary (typically <2 pages) of significant physical, chemical, pharmaceutical, pharmacological, toxicological, pharmacokinetic, and clinical information' },
  { number: '2', title: 'Introduction', required: true, status: 'empty', inputs: ['product', 'none'], description: 'Chemical name, active ingredients, pharmacological class, rationale and anticipated indication(s), general approach to evaluation' },
  { number: '3', title: 'Physical, Chemical, and Pharmaceutical Properties and Formulation', required: true, status: 'empty', inputs: ['product'], description: 'Description of the substance (structural formula), physical/chemical/pharmaceutical properties, formulation and excipients, storage and handling' },
  {
    number: '4', title: 'Nonclinical Studies', required: true, status: 'empty', inputs: ['nonclinical'], description: 'Summary of nonclinical pharmacology, pharmacokinetics, and toxicology results',
    childSections: [
      { number: '4.1', title: 'Nonclinical Pharmacology', required: true, status: 'empty', inputs: ['nonclinical'], description: 'Primary and secondary pharmacodynamics, mechanism of action, safety pharmacology' },
      { number: '4.2', title: 'Pharmacokinetics and Product Metabolism in Animals', required: true, status: 'empty', inputs: ['nonclinical'], description: 'Absorption, distribution, metabolism, and excretion (ADME) in animal species' },
      { number: '4.3', title: 'Toxicology', required: true, status: 'empty', inputs: ['nonclinical'], description: 'Single- and repeat-dose toxicity, genotoxicity, carcinogenicity, reproductive toxicity, NOAELs and target-organ findings' },
    ],
  },
  {
    number: '5', title: 'Effects in Humans', required: true, status: 'empty', inputs: ['clinical', 'safety'], description: 'Summary of clinical pharmacokinetics, metabolism, safety, efficacy, and marketing experience',
    childSections: [
      { number: '5.1', title: 'Pharmacokinetics and Metabolism in Humans', required: true, status: 'empty', inputs: ['clinical'], description: 'Human PK including absorption, distribution, protein binding, metabolism, excretion; population PK and special populations' },
      { number: '5.2', title: 'Safety and Efficacy', required: true, status: 'empty', inputs: ['clinical', 'safety'], description: 'Summary of safety and efficacy across studies; adverse drug reactions by body system; identified and potential risks' },
      { number: '5.3', title: 'Marketing Experience', required: false, status: 'empty', inputs: ['safety'], description: 'Countries where marketed/approved/withdrawn; post-marketing findings significant to safety' },
    ],
  },
  { number: '6', title: 'Summary of Data and Guidance for the Investigator', required: true, status: 'empty', inputs: ['nonclinical', 'clinical', 'safety'], description: 'Integrated discussion of nonclinical and clinical data; practical guidance on recognition and treatment of possible overdose and adverse drug reactions; risk-benefit context' },
  { number: '7', title: 'References', required: false, status: 'empty', inputs: ['none'], description: 'List of references to publications and reports cited in the IB' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// IB BUILD JOB
// ═══════════════════════════════════════════════════════════════════════════════

/** Per-section regulatory verdict returned alongside the drafted content. */
export type IBSectionStatus = 'rendered' | 'partial' | 'missing';

export interface IBSectionResult {
  number: string;
  title: string;
  required: boolean;
  /** Whether the inputs this section needs were available. */
  status: IBSectionStatus;
  /** Drafted content (AI or template). */
  content: string;
  /** Inputs that were missing or empty for this section. */
  gaps: string[];
}

export interface IBProductInfo {
  /** Investigational product / code name (e.g. "BX-115"). */
  productName: string;
  /** Chemical / INN name if assigned. */
  chemicalName?: string;
  /** Active ingredient(s). */
  activeIngredients?: string[];
  /** Pharmacological / therapeutic class. */
  pharmacologicalClass?: string;
  /** Anticipated indication(s). */
  indication?: string;
  /** Sponsor name (title page). */
  sponsor?: string;
  /** IB edition number. */
  edition?: string;
  /** Structural formula / molecular description. */
  structuralFormula?: string;
  /** Physical/chemical properties narrative. */
  physicalChemicalProperties?: string;
  /** Formulation / excipients / strengths. */
  formulation?: string;
  /** Storage and handling. */
  storageHandling?: string;
}

export interface IBSafetyInfo {
  /** Identified risks (important identified ADRs). */
  identifiedRisks?: string[];
  /** Potential risks under evaluation. */
  potentialRisks?: string[];
  /** Adverse drug reactions by body system / SOC. */
  adrsByBodySystem?: Array<{ bodySystem: string; reactions: string[] }>;
  /** Guidance on recognition/treatment of overdose. */
  overdoseGuidance?: string;
  /** Marketing experience: countries marketed/withdrawn and post-marketing signals. */
  marketingExperience?: string;
}

export interface IBBuildRequest {
  organizationId?: number;
  userId?: number;
  projectId?: number;
  product: IBProductInfo;
  /** M2.4 Nonclinical Overview (preferred) — supplies §4 narrative + gaps. */
  nonclinicalOverview?: M2Summary;
  /** M2.6 Nonclinical Written & Tabulated Summaries (optional supplement). */
  nonclinicalSummaries?: M2Summary;
  /** Raw nonclinical study list (used when no M2.4/M2.6 summary is supplied). */
  nonclinicalStudies?: NonclinicalStudyInput[];
  /** M2.5 Clinical Overview — supplies §5 narrative + benefit-risk. */
  clinicalOverview?: M2Summary;
  /** M2.7 Clinical Summary — supplies §5 efficacy/safety detail. */
  clinicalSummary?: M2Summary;
  /** Integrated safety / marketing experience. */
  safety?: IBSafetyInfo;
  /** Specific IB sections to draft, or all when empty. */
  sectionsToGenerate?: string[];
  /** When true, skip AI even if available (deterministic template build). */
  templateOnly?: boolean;
}

export interface IBBuildJob {
  id: number;
  status: 'queued' | 'generating' | 'complete' | 'failed';
  progress: number;
  /** Flat list of every section/sub-section with its verdict + content. */
  sections: IBSectionResult[];
  productName: string;
  /** Overall completeness (0–100), fraction of required sections rendered. */
  completeness: number;
  createdAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build a full Investigator's Brochure. Drafts each ICH E6(R2) §7 section via
 * the unified AI gateway (falling back to templates), returns each section's
 * content with a deterministic `{ status, gaps }` verdict, and rolls up an
 * overall completeness score.
 */
export async function buildInvestigatorBrochure(request: IBBuildRequest): Promise<IBBuildJob> {
  const structure = JSON.parse(JSON.stringify(IB_STRUCTURE)) as IBSection[];
  const flat = flattenSections(structure);
  const available = resolveAvailability(request);
  const useAI = !!ai && !request.templateOnly;

  const results: IBSectionResult[] = [];
  for (const section of flat) {
    if (request.sectionsToGenerate?.length && !request.sectionsToGenerate.includes(section.number)) {
      continue;
    }

    const gaps = detectSectionGaps(section, available);
    let status = sectionStatus(section, available, gaps);

    let content = '';
    if (status !== 'missing') {
      content = useAI
        ? await draftSectionWithAI(section, request)
        : draftSectionTemplate(section, request);
    } else {
      // Even a "missing" section gets a placeholder so the IB skeleton is whole.
      content = `[${section.number} ${section.title}] — not yet available. Missing inputs: ${gaps.join('; ')}.`;
    }

    // A DATA-BEARING section whose drafted content still shows an unresolved
    // [placeholder] cannot count as complete. Some sections cannot be
    // synthesized from a template at all (e.g. the integrated Summary, §1, whose
    // template always emits "[Integrated summary to be drafted ...]"), so a
    // 'rendered' verdict from input-availability alone would report the section
    // complete over an un-drafted body — a false-completeness signal in a
    // document handed to investigators and IRB/IEC. Boilerplate sections (no
    // input domains) are exempt: their optional [Sponsor]/[Edition] fields do
    // not make the section incomplete.
    const dataBearing = section.inputs.some(d => d !== 'none');
    if (status === 'rendered' && dataBearing && hasUnresolvedPlaceholder(content)) {
      status = 'partial';
    }

    results.push({
      number: section.number,
      title: section.title,
      required: section.required,
      status,
      content,
      gaps,
    });
  }

  const requiredResults = results.filter(r => r.required);
  const rendered = requiredResults.filter(r => r.status === 'rendered').length;
  const completeness = requiredResults.length
    ? Math.round((rendered / requiredResults.length) * 100)
    : 0;

  return {
    id: Date.now(),
    status: 'complete',
    progress: 100,
    sections: results,
    productName: request.product.productName,
    completeness,
    createdAt: new Date(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DETERMINISTIC: registry, availability, gap detection
// ═══════════════════════════════════════════════════════════════════════════════

/** Flatten the IB tree (parents + children) into draft order. */
export function flattenSections(structure: IBSection[] = IB_STRUCTURE): IBSection[] {
  const out: IBSection[] = [];
  for (const s of structure) {
    out.push(s);
    if (s.childSections) out.push(...s.childSections);
  }
  return out;
}

/** Which input domains the request actually carries (non-empty). */
export function resolveAvailability(request: IBBuildRequest): Record<IBInputDomain, boolean> {
  const p = request.product;
  const hasProduct = !!(
    p.structuralFormula ||
    p.physicalChemicalProperties ||
    p.formulation ||
    (p.activeIngredients && p.activeIngredients.length > 0)
  );
  const hasNonclinical = !!(
    request.nonclinicalOverview ||
    request.nonclinicalSummaries ||
    (request.nonclinicalStudies && request.nonclinicalStudies.length > 0)
  );
  const hasClinical = !!(request.clinicalOverview || request.clinicalSummary);
  const s = request.safety;
  const hasSafety = !!(
    s &&
    ((s.identifiedRisks && s.identifiedRisks.length > 0) ||
      (s.potentialRisks && s.potentialRisks.length > 0) ||
      (s.adrsByBodySystem && s.adrsByBodySystem.length > 0) ||
      s.overdoseGuidance ||
      s.marketingExperience)
  );
  return {
    product: hasProduct,
    nonclinical: hasNonclinical,
    clinical: hasClinical,
    safety: hasSafety,
    none: true, // structural/boilerplate is always "available"
  };
}

/**
 * The input domains a section needs but that are not available.
 * `none` is never a gap; for multi-input sections, a missing optional domain is
 * still reported so the verdict can drop to 'partial'.
 */
export function detectSectionGaps(
  section: IBSection,
  available: Record<IBInputDomain, boolean>,
): string[] {
  const needed = section.inputs.filter(d => d !== 'none');
  return needed.filter(d => !available[d]).map(domainLabel);
}

/**
 * Verdict for a section:
 *  - 'missing'  — every required input domain is absent (nothing to say).
 *  - 'partial'  — at least one needed domain present, at least one absent.
 *  - 'rendered' — all needed domains present (or a pure boilerplate section).
 */
export function sectionStatus(
  section: IBSection,
  available: Record<IBInputDomain, boolean>,
  gaps: string[],
): IBSectionStatus {
  const needed = section.inputs.filter(d => d !== 'none');
  if (needed.length === 0) return 'rendered'; // boilerplate sections
  const presentCount = needed.filter(d => available[d]).length;
  if (presentCount === 0) return 'missing';
  if (gaps.length > 0) return 'partial';
  return 'rendered';
}

function domainLabel(domain: IBInputDomain): string {
  switch (domain) {
    case 'product':
      return 'physical/chemical/pharmaceutical & formulation data';
    case 'nonclinical':
      return 'nonclinical pharmacology/PK/toxicology summary (M2.4/M2.6)';
    case 'clinical':
      return 'clinical summary (M2.5/M2.7)';
    case 'safety':
      return 'integrated safety / marketing experience';
    default:
      return domain;
  }
}

/** Return the full IB section registry (deep copy). */
export function getIBStructure(): IBSection[] {
  return JSON.parse(JSON.stringify(IB_STRUCTURE));
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI DRAFTING (mirrors csr-builder's generateSectionWithAI)
// ═══════════════════════════════════════════════════════════════════════════════

async function draftSectionWithAI(section: IBSection, request: IBBuildRequest): Promise<string> {
  if (!ai) return draftSectionTemplate(section, request);

  const p = request.product;
  const sourceContext = buildSourceContext(section, request);

  const systemPrompt = `You are an expert medical writer drafting an Investigator's Brochure (IB) compliant with ICH E6(R2) Section 7.
You are drafting one section of the IB for an investigational product.

Product:
- Product/code name: ${p.productName}
${p.chemicalName ? `- Chemical/INN name: ${p.chemicalName}` : ''}
${p.activeIngredients?.length ? `- Active ingredient(s): ${p.activeIngredients.join(', ')}` : ''}
${p.pharmacologicalClass ? `- Pharmacological class: ${p.pharmacologicalClass}` : ''}
${p.indication ? `- Anticipated indication: ${p.indication}` : ''}
${p.sponsor ? `- Sponsor: ${p.sponsor}` : ''}

Write professional regulatory prose suitable for distribution to investigators and IRB/IEC.
Base statements ONLY on the SOURCE DATA provided; do not invent results. Where the source is silent,
insert an explicit placeholder like [DATA TO BE INSERTED]. Do NOT use markdown — plain text with headers in CAPS.`;

  try {
    const content = await ai.complete(
      [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Draft IB Section ${section.number}: ${section.title}\n\nSection scope: ${section.description}\n\nSOURCE DATA:\n${sourceContext || '[No structured source data supplied for this section.]'}\n\nWrite a complete, submission-ready draft for this section per ICH E6(R2) §7.`,
        },
      ],
      {
        taskType: 'document_drafting',
        maxTokens: 4096,
        temperature: 0.3,
        callerModule: 'ib-builder/section-draft',
      },
    );
    return content;
  } catch (err) {
    console.warn(`[IB Builder] AI drafting failed for section ${section.number}, using template:`, err);
    return draftSectionTemplate(section, request);
  }
}

/** Assemble the upstream source text relevant to a given IB section. */
function buildSourceContext(section: IBSection, request: IBBuildRequest): string {
  const parts: string[] = [];
  const wants = new Set(section.inputs);

  if (wants.has('product')) {
    const p = request.product;
    const bits = [
      p.structuralFormula && `Structural formula: ${p.structuralFormula}`,
      p.physicalChemicalProperties && `Physical/chemical properties: ${p.physicalChemicalProperties}`,
      p.formulation && `Formulation: ${p.formulation}`,
      p.storageHandling && `Storage & handling: ${p.storageHandling}`,
    ].filter(Boolean);
    if (bits.length) parts.push(`PRODUCT PROPERTIES:\n${bits.join('\n')}`);
  }

  if (wants.has('nonclinical')) {
    if (request.nonclinicalOverview) {
      parts.push(`NONCLINICAL OVERVIEW (M2.4):\n${request.nonclinicalOverview.narrative}`);
    }
    if (request.nonclinicalSummaries) {
      parts.push(`NONCLINICAL SUMMARIES (M2.6):\n${request.nonclinicalSummaries.narrative}`);
    }
    if (!request.nonclinicalOverview && request.nonclinicalStudies?.length) {
      parts.push(
        `NONCLINICAL STUDIES:\n${request.nonclinicalStudies
          .map(s => `- ${s.studyType} (${s.species ?? 'species n/s'}): ${s.primaryFinding ?? s.keyFindings ?? 'see report'}${s.noael ? `; NOAEL ${s.noael}` : ''}`)
          .join('\n')}`,
      );
    }
  }

  if (wants.has('clinical')) {
    if (request.clinicalOverview) {
      parts.push(`CLINICAL OVERVIEW (M2.5):\n${request.clinicalOverview.narrative}`);
    }
    if (request.clinicalSummary) {
      parts.push(`CLINICAL SUMMARY (M2.7):\n${request.clinicalSummary.narrative}`);
    }
  }

  if (wants.has('safety') && request.safety) {
    const s = request.safety;
    const bits = [
      s.identifiedRisks?.length && `Identified risks: ${s.identifiedRisks.join('; ')}`,
      s.potentialRisks?.length && `Potential risks: ${s.potentialRisks.join('; ')}`,
      s.adrsByBodySystem?.length &&
        `ADRs by body system: ${s.adrsByBodySystem.map(a => `${a.bodySystem} — ${a.reactions.join(', ')}`).join('; ')}`,
      s.overdoseGuidance && `Overdose guidance: ${s.overdoseGuidance}`,
      s.marketingExperience && `Marketing experience: ${s.marketingExperience}`,
    ].filter(Boolean);
    if (bits.length) parts.push(`SAFETY / MARKETING EXPERIENCE:\n${bits.join('\n')}`);
  }

  return parts.join('\n\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE DRAFTING (fallback when AI unavailable)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * True when the content still carries an unresolved bracketed placeholder (a
 * "[... to be inserted]" / "[Sponsor]" span containing a letter). Governed IB
 * prose never uses square brackets for anything else, so this is a fail-closed
 * signal that the section is not actually drafted.
 */
function hasUnresolvedPlaceholder(content: string): boolean {
  return /\[[^\]]*[A-Za-z][^\]]*\]/.test(content);
}

function draftSectionTemplate(section: IBSection, request: IBBuildRequest): string {
  const p = request.product;
  const product = p.productName;
  const indication = p.indication || 'the proposed indication';

  switch (section.number) {
    case '0':
      return `INVESTIGATOR'S BROCHURE\n\n${product}${p.chemicalName ? ` (${p.chemicalName})` : ''}\n\nSponsor: ${p.sponsor || '[Sponsor]'}\nEdition: ${p.edition || '1.0'}\nDate: ${new Date().toISOString().slice(0, 10)}\n\nThis edition supersedes all previous editions.`;
    case '0a':
      return `CONFIDENTIALITY STATEMENT\n\nThis Investigator's Brochure contains confidential information belonging to ${p.sponsor || 'the Sponsor'}. It is provided to investigators, potential investigators, and the responsible IRB/IEC for the purpose of conducting the clinical investigation. It may not be disclosed to any third party without prior written authorization from the Sponsor, except to the extent necessary to obtain informed consent.`;
    case '0b':
      return `TABLE OF CONTENTS\n\n${flattenSections().map(s => `${s.number}  ${s.title}`).join('\n')}`;
    case '1':
      return `SUMMARY\n\n${product} is${p.pharmacologicalClass ? ` a ${p.pharmacologicalClass}` : ' an investigational product'} under development for ${indication}. This brochure summarizes the significant physical, chemical, pharmaceutical, nonclinical (pharmacology, pharmacokinetics, toxicology), and clinical information available to date.\n\n[Integrated summary to be drafted from the nonclinical and clinical sections.]`;
    case '2':
      return `INTRODUCTION\n\n${product}${p.chemicalName ? ` (chemical name: ${p.chemicalName})` : ''}${p.activeIngredients?.length ? `, active ingredient(s) ${p.activeIngredients.join(', ')},` : ''} is${p.pharmacologicalClass ? ` a ${p.pharmacologicalClass}` : ' an investigational agent'} being developed for ${indication}. This Investigator's Brochure provides the clinical and nonclinical data relevant to the study of ${product} in human subjects.`;
    case '3':
      return `PHYSICAL, CHEMICAL, AND PHARMACEUTICAL PROPERTIES AND FORMULATION\n\n${p.structuralFormula ? `Structure: ${p.structuralFormula}\n\n` : ''}${p.physicalChemicalProperties || '[Physical and chemical properties to be inserted.]'}\n\nFormulation: ${p.formulation || '[Formulation and excipients to be inserted.]'}\n\nStorage and handling: ${p.storageHandling || '[Storage and handling instructions to be inserted.]'}`;
    case '4':
      return `NONCLINICAL STUDIES\n\nThe nonclinical program for ${product} is summarized below across pharmacology, pharmacokinetics/metabolism, and toxicology. ${request.nonclinicalOverview ? 'See the integrated nonclinical overview for the consolidated assessment.' : '[Nonclinical data to be inserted.]'}`;
    case '4.1':
      return `NONCLINICAL PHARMACOLOGY\n\n${excerptNarrative(request.nonclinicalOverview, request.nonclinicalSummaries) || '[Primary/secondary pharmacodynamics, mechanism of action, and safety pharmacology to be inserted.]'}`;
    case '4.2':
      return `PHARMACOKINETICS AND PRODUCT METABOLISM IN ANIMALS\n\n${excerptNarrative(request.nonclinicalSummaries, request.nonclinicalOverview) || '[Animal absorption, distribution, metabolism, and excretion (ADME) to be inserted.]'}`;
    case '4.3':
      return `TOXICOLOGY\n\n${excerptNarrative(request.nonclinicalOverview, request.nonclinicalSummaries) || '[Single- and repeat-dose toxicity, genotoxicity, carcinogenicity, reproductive toxicity, NOAELs, and target-organ findings to be inserted.]'}`;
    case '5':
      return `EFFECTS IN HUMANS\n\nThe available human pharmacokinetic, safety, and efficacy data for ${product} are summarized below. ${request.clinicalOverview || request.clinicalSummary ? '' : '[No clinical data are yet available; this is an early-phase program.]'}`;
    case '5.1':
      return `PHARMACOKINETICS AND METABOLISM IN HUMANS\n\n${excerptNarrative(request.clinicalSummary, request.clinicalOverview) || '[Human PK — absorption, distribution, protein binding, metabolism, and excretion — to be inserted.]'}`;
    case '5.2':
      return `SAFETY AND EFFICACY\n\n${excerptNarrative(request.clinicalOverview, request.clinicalSummary) || '[Summary of safety and efficacy across clinical studies to be inserted.]'}${formatSafetyByBodySystem(request.safety)}`;
    case '5.3':
      // Do NOT assert "not currently marketed in any country" as a fallback —
      // that is a specific, checkable regulatory fact the code has no basis to
      // know (a repurposed/partner-marketed product would make it false). When
      // no marketing-experience data is supplied, emit an honest gap marker so
      // the sponsor confirms the status rather than shipping an assumed negative.
      return `MARKETING EXPERIENCE\n\n${request.safety?.marketingExperience || '[Marketing experience — country/approval/withdrawal status to be confirmed by the Sponsor.]'}`;
    case '6':
      return `SUMMARY OF DATA AND GUIDANCE FOR THE INVESTIGATOR\n\nThis section integrates the nonclinical and clinical findings for ${product} and provides practical guidance to the investigator.\n\nIDENTIFIED RISKS: ${request.safety?.identifiedRisks?.join('; ') || '[to be inserted]'}\nPOTENTIAL RISKS: ${request.safety?.potentialRisks?.join('; ') || '[to be inserted]'}\n\nRECOGNITION AND TREATMENT OF OVERDOSE / ADVERSE DRUG REACTIONS: ${request.safety?.overdoseGuidance || '[Guidance to be inserted.]'}`;
    case '7':
      return `REFERENCES\n\n[Reference list to be compiled from the cited nonclinical and clinical reports.]`;
    default:
      return '';
  }
}

function excerptNarrative(primary?: M2Summary, fallback?: M2Summary): string {
  const text = primary?.narrative || fallback?.narrative || '';
  if (!text) return '';
  return text.length > 1200 ? text.slice(0, 1200).trim() + '…' : text;
}

function formatSafetyByBodySystem(safety?: IBSafetyInfo): string {
  if (!safety?.adrsByBodySystem?.length) return '';
  return (
    '\n\nADVERSE DRUG REACTIONS BY BODY SYSTEM:\n' +
    safety.adrsByBodySystem.map(a => `- ${a.bodySystem}: ${a.reactions.join(', ')}`).join('\n')
  );
}

export default {
  buildInvestigatorBrochure,
  getIBStructure,
  flattenSections,
  resolveAvailability,
  detectSectionGaps,
  sectionStatus,
  IB_STRUCTURE,
};
