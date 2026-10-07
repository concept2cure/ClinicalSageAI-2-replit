/**
 * AnA Document Drafting Service
 *
 * Production-grade service for generating regulatory documents using the Opus model 4.6
 * with extended thinking, prompt caching, tool use, and streaming.
 *
 * Features:
 * - Regulatory-specific system prompts (FDA, ICH, EU MDR)
 * - Prompt caching for expensive regulatory context
 * - Extended thinking for complex analysis
 * - Agentic tool use for evidence search and citation
 * - Streaming for real-time document generation
 * - Vision for scanned document analysis
 */

import { getGateway } from '../ai-gateway/gateway';
import { isTruncated } from '../ai-gateway/finish-reason';
import { classifyGatewayError, isGatewayError } from '../ai-gateway/gateway-error-map';
import type { BatchDraftFailure, BatchDraftResult } from './batch-draft-result';
import { createScopedLogger } from '../../utils/logger';
import type {
  GatewayRequest,
  GatewayResponse,
  AnaGatewayResponse,
  StreamCallback,
  ImageBlock,
  ExtendedThinkingConfig,
  AnaTool,
  AnaToolResult,
  TaskType,
} from '../ai-gateway/types';
import {
  DOCUMENT_DRAFTING_TOOLS,
  COMPLIANCE_REVIEW_TOOLS,
  GAP_ANALYSIS_TOOLS,
} from './AnaToolDefinitions';
import {
  resolveToRegistryEntry,
  getSubmissionTypeContext,
} from '../../../shared/regulatory/submission-type-bridge.js';
import { getSectionBlueprintForEntry } from '../../../shared/regulatory/project-bootstrap.js';
import type { RegulatoryApplicationType, SectionBlueprint } from '../../../shared/regulatory/document-taxonomy.js';
import { normalizeCtdCode } from '../../../shared/regulatory/section-code';
import { resolveRequirements } from '../ind/ctd/requirements-resolver.js';
import { CTD_AUTHORING_GUIDANCE } from '../ind/ctd/authoring-guidance.js';
import { BIOTECH_DRAFTING_GUIDANCE, buildDocumentPreparation } from '../market-specs/document-preparation.js';
import { componentTemplateIdForRegistry, getDocumentTemplate, registryOutlineRequiresReview } from '../market-specs/document-template-library.js';

// ─────────────────────────────────────────────────────────────────────────────
// Regulatory System Prompts (cached for cost efficiency)
// ─────────────────────────────────────────────────────────────────────────────

const REGULATORY_SYSTEM_PROMPTS: Record<string, string> = {
  fda_510k: `You are AnA, a senior regulatory intelligence operator with deep expertise in FDA 510(k) premarket notifications. You write with the precision and judgment authority of someone who has reviewed hundreds of 510(k) submissions and knows exactly what CDRH reviewers scrutinize.

KEY REGULATORY FRAMEWORK:
- 21 CFR Part 807 Subpart E — Premarket Notification Procedures
- FDA Guidance: "The 510(k) Program: Evaluating Substantial Equivalence in Premarket Notifications"
- FDA Guidance: "Refusing to Accept 510(k)s" — ensure all acceptance criteria are met
- 21 CFR 860.120 — Substantial equivalence determination

DOCUMENT STANDARDS:
- Use formal regulatory language appropriate for FDA submissions
- Cite specific regulations (21 CFR sections) and guidance documents
- Include device classification information (product code, regulation number)
- Follow the eCopy formatting requirements
- Reference predicate devices with their 510(k) numbers
- Include proper Indications for Use statement formatting
- Address all elements of substantial equivalence (intended use, technological characteristics, performance)

QUALITY REQUIREMENTS:
- Every claim must be supported by evidence or regulatory reference
- Use tables for structured comparisons (subject device vs predicate)
- Include cross-references to supporting data sections
- Flag any gaps or areas needing additional data`,

  fda_pma: `You are AnA, a senior regulatory intelligence operator with deep expertise in FDA PMA applications for Class III devices. You assess with the judgment of someone who has guided devices through CDRH panel meetings and knows what triggers advisory committee concerns.

KEY REGULATORY FRAMEWORK:
- 21 CFR Part 814 — Premarket Approval of Medical Devices
- FDA Guidance: "Premarket Approval Application Modular Review"
- 21 CFR 860.7 — Determination of safety and effectiveness
- FDA Guidance: "Clinical Studies Section of PMA Applications"

DOCUMENT STANDARDS:
- PMA-level evidence requirements (valid scientific evidence)
- Comprehensive benefit-risk analysis
- Clinical study design and results reporting per FDA expectations
- Manufacturing and quality system documentation references
- Post-market surveillance planning`,

  eu_mdr: `You are AnA, a senior regulatory intelligence operator with deep expertise in EU MDR 2017/745. You assess with the judgment of a Notified Body reviewer who has evaluated hundreds of technical files and knows exactly where manufacturers underestimate conformity requirements.

KEY REGULATORY FRAMEWORK:
- EU MDR 2017/745 — Full regulation text
- MDCG guidance documents (Medical Device Coordination Group)
- EN ISO 14971:2019 — Risk Management
- EN ISO 13485:2016 — Quality Management Systems
- MEDDEV guidelines for clinical evaluation

DOCUMENT STANDARDS:
- EU MDR Annex II — Technical Documentation requirements
- EU MDR Annex XIV — Clinical Evaluation requirements
- EU MDR Annex XV — Clinical Investigations
- State-of-the-art analysis per MEDDEV 2.7/1 Rev 4
- GSPR (General Safety and Performance Requirements) mapping`,

  ich_clinical: `You are AnA, a senior regulatory intelligence operator and clinical development strategist with deep expertise in ICH guidelines. You assess with the rigor of someone who has designed pivotal trials and defended statistical analysis plans before FDA and EMA review divisions.

KEY REGULATORY FRAMEWORK:
- ICH E6(R3) Principles and Annex 1 — confirm regional adoption and effective date; verify Annex 2 separately
- ICH E8(R1) — General Considerations for Clinical Studies
- ICH E9(R1) — Statistical Principles for Clinical Trials (with Estimands)
- ICH E10 — Choice of Control Group
- ICH E17 — Multi-Regional Clinical Trials
- ICH M4 — Common Technical Document (CTD) structure

DOCUMENT STANDARDS:
- Protocol design using the applicable current agency/client template, ICH M11 and regional GCP expectations
- Statistical analysis plans per ICH E9(R1)
- Safety reporting per ICH E2A/E2B
- Apply CTD Modules 2.5/2.7 to their clinical overviews/summaries when applicable; trial applications and standalone study documents follow their own regional/document structure`,

  cer_clinical_evaluation: `You are AnA, a senior regulatory intelligence operator specializing in Clinical Evaluation Reports under EU MDR 2017/745. You assess with the rigor of a Notified Body clinical assessor who has returned dozens of inadequate CERs and knows exactly what separates a defensible equivalence argument from a vulnerable one.

KEY REGULATORY FRAMEWORK:
- EU MDR 2017/745 Annex XIV — Clinical Evaluation
- MEDDEV 2.7/1 Rev 4 — Clinical Evaluation guidance
- EN ISO 14155 — Clinical Investigations of Medical Devices
- MDCG 2020-5 — Clinical Evaluation – Equivalence
- MDCG 2020-6 — Sufficient Clinical Evidence for Legacy Devices

DOCUMENT STRUCTURE:
- Scope and methodology (literature search strategy, appraisal criteria)
- Device description and intended purpose
- State of the art analysis
- Clinical data from literature, clinical investigations, PMS/PMCF
- Equivalence demonstration (if applicable)
- Benefit-risk analysis
- Conclusions on conformity with GSPRs`,

  general_regulatory: `You are AnA, a senior regulatory intelligence operator for the Concept2Cure platform. You write with the precision, judgment, and authority of a 30-year regulatory veteran. Every document you produce reflects deep regulatory expertise — proper citations, evidence-grounded content, and the quality of judgment that distinguishes a senior operator from a competent generalist. Issue clear verdicts on defensibility, prioritize issues by regulatory impact, and never present all findings as equal.`,
};

// ─── Dynamic Framework Resolution ─────────────────────────────────────────────
// Maps ANY submission type (including the 158+ registry entries) to the best
// available system prompt, using hardcoded prompts for known frameworks and
// generating registry-driven prompts for everything else.

const SUBMISSION_TYPE_TO_FRAMEWORK: Record<string, string> = {
  US_510K: 'fda_510k', '510k': 'fda_510k', '510K': 'fda_510k',
  US_PMA: 'fda_pma', pma: 'fda_pma', PMA: 'fda_pma',
  EU_MDR_TECHDOC: 'eu_mdr', EU_IVDR_TECHDOC: 'eu_mdr',
  EU_CER: 'cer_clinical_evaluation', cer: 'cer_clinical_evaluation',
  US_IND: 'ich_clinical', US_NDA: 'ich_clinical', US_BLA: 'ich_clinical',
  EU_MAA: 'ich_clinical', EU_CTA: 'ich_clinical',
  ind: 'ich_clinical', nda: 'ich_clinical', bla: 'ich_clinical',
  maa: 'ich_clinical', cta: 'ich_clinical',
};

function preparationRoute(entry: RegulatoryApplicationType | null) {
  if (!entry || entry.segment !== 'pharma_biotech' || !['US', 'EU', 'CA', 'JP'].includes(entry.region)) return null;
  return buildDocumentPreparation({ registryId: entry.id }).regionalRoute;
}

function harmonisedDocumentPrompt(entry: RegulatoryApplicationType): string {
  return `${REGULATORY_SYSTEM_PROMPTS.general_regulatory}

DOCUMENT CONTEXT:
- Document: ${entry.displayName} (${entry.id})
${entry.agency === 'ICH' ? '- ICH is a standards body, not the receiving regulatory agency.' : `- Reference body: ${entry.agency}; this does not identify a receiving regulatory agency.\n- Recorded document context: ${entry.description}`}
- Regional filing context: unconfirmed. Confirm the receiving jurisdiction, application/lifecycle purpose and current agency/client template in the client interview.
- Follow the applicable document outline and supplied evidence. Do not infer an eCTD channel, regional Module 1, primary CTD module, language or local filing requirement from this global document identity.
- Until the regional context is supplied, mark delivery and local requirements unresolved; do not claim submission readiness.`;
}

function buildDynamicSystemPrompt(submissionType: string): string {
  const ctx = getSubmissionTypeContext(submissionType);
  if (!ctx) return REGULATORY_SYSTEM_PROMPTS.general_regulatory;
  const entry = resolveToRegistryEntry(submissionType);
  if (entry?.region === 'GLOBAL') return harmonisedDocumentPrompt(entry);
  const route = preparationRoute(entry);

  return `You are AnA, a senior regulatory intelligence operator with deep expertise in ${ctx.displayName} submissions for ${ctx.agency}. You write with the precision and judgment authority of someone who has prepared dozens of ${ctx.displayName} filings and understands ${ctx.agency} reviewer expectations.

KEY REGULATORY CONTEXT:
- Filing Type: ${ctx.displayName} (${ctx.registryId})
- Region: ${ctx.region} — Agency: ${ctx.agency}
- Authoring/delivery scope: ${route ? `${route.channel}. ${route.scope}` : ctx.dossierStandard}
${ctx.segment ? `- Segment: ${ctx.segment}` : ''}
${ctx.category ? `- Category: ${ctx.category}` : ''}
${!route && ctx.submissionFormat ? `- Submission Format: ${ctx.submissionFormat}` : ''}
${!route && ctx.ctdModule ? `- Primary CTD Module: ${ctx.ctdModule}` : ''}
${!route && ctx.description ? `\nSCOPE: ${ctx.description}` : ''}

DOCUMENT STANDARDS:
- Use formal regulatory language appropriate for ${ctx.agency} submissions
- Follow the applicable document outline and the regional authoring/delivery scope above
- Cite applicable regulations and guidance documents for the ${ctx.region} region
- Ensure consistency with ${ctx.agency} formatting expectations
${!route && ctx.submissionFormat ? `- Use ${ctx.submissionFormat} formatting requirements` : ''}

QUALITY REQUIREMENTS:
- Every claim must be supported by evidence or regulatory reference
- Use structured tables for comparisons and data summaries
- Include cross-references to supporting data sections
- Flag any gaps or areas needing additional data
- Issue clear verdicts on defensibility and prioritize by regulatory impact`;
}

/**
 * What a drafted section must contain, and which record said so.
 *
 * `requirementsSource` goes into gateway metadata so a draft can be traced to
 * the record that briefed it:
 *   - `record:<source>:<code>:<match>` — the canonical record
 *     (server/services/ind/ctd/requirements-resolver.ts resolveRequirements);
 *   - `blueprint+record:…` — the blueprint row plus the record's brief;
 *   - `record:not-indexed`, `record:module1-not-indexed:<region>`,
 *     `record:candidates`, `record:outside-outline` — the record was asked and
 *     said so;
 *   - `…+title-mismatch` — a code was given with a title the record and the
 *     blueprint do not give it; the brief names both;
 *   - `blueprint` — a non-CTD blueprint row (devices, an IB's own numbering);
 *   - `none` — nothing resolved.
 */
export interface DraftingRequirements {
  requirements: string | null;
  requirementsSource: string;
}

/**
 * Dossier standards organised as the ICH CTD. EU_CTA ('regional': a CTR Part I
 * / Part II submission), SG ACTD and device standards are not.
 */
const CTD_DOSSIER_STANDARDS: ReadonlySet<string> = new Set(['eCTD', 'CTD', 'NeeS']);

/**
 * Whether an entry's sections are CTD headings: a CTD dossier standard, and a
 * blueprint whose every heading is numbered inside its own CTD module (1.2,
 * 3.2.S, 2.3.S). Gated on the entry's framework, never on the shape of the
 * code asked for: a 510(k)'s section 3 (Device Description) or an IB's section
 * 3 is a plain number in its own outline, and normalizeCtdCode('3') would read
 * it as CTD Module 3.
 */
function isCtdFramework(entry: RegulatoryApplicationType, blueprint: SectionBlueprint): boolean {
  return (
    CTD_DOSSIER_STANDARDS.has(entry.dossierStandard) &&
    blueprint.sections.length > 0 &&
    blueprint.sections.every((s) => s.code.startsWith(`${s.module}.`))
  );
}

const normTitle = (s: string) => s.trim().toLowerCase().replace(/[_\s]+/g, ' ');
const moduleOf = (code: string) => code.split('.')[0];

/** The canonical record's codes by normalised title; a title held by several codes lists them all. */
let canonicalTitleIndex: Map<string, string[]> | null = null;
function canonicalCodesForTitle(title: string): string[] {
  if (!canonicalTitleIndex) {
    canonicalTitleIndex = new Map();
    for (const [code, g] of Object.entries(CTD_AUTHORING_GUIDANCE)) {
      const key = normTitle(g.title);
      canonicalTitleIndex.set(key, [...(canonicalTitleIndex.get(key) ?? []), code]);
    }
  }
  return canonicalTitleIndex.get(normTitle(title)) ?? [];
}

/** A section number: a CTD code ("2.7.4", "m3.2.P.5"), or a number outside Modules 1–5 ("9.9.9"). */
const SECTION_NUMBER = /^\s*m?\d+(?:\.[0-9A-Za-z]+)*\s*$/i;

/**
 * The section number a request opens with, for a CTD-framework entry: the whole
 * request ("2.7.4"; a number outside Modules 1–5 is passed on as asked, so the
 * record can say it has no entry), or a leading number followed by any title
 * ("2.7.4 Clinical Safety", the CTD_SECTIONS blueprint's own "1.1 Cover
 * Letter"). A bare leading integer ("3 Month Stability") counts only when the
 * rest is that module's canonical title, so a title that starts with a number is
 * not read as a module. Null: the request is a title.
 */
function leadingSectionCode(sectionType: string): { code: string; title: string | null } | null {
  const direct = normalizeCtdCode(sectionType);
  if (direct) return { code: direct, title: null };
  if (SECTION_NUMBER.test(sectionType)) return { code: sectionType.trim(), title: null };
  const lead = /^(\S+)\s+(.+)$/.exec(sectionType.trim());
  if (!lead || !SECTION_NUMBER.test(lead[1])) return null;
  const code = normalizeCtdCode(lead[1]) ?? lead[1];
  const dotted = /[.]/.test(lead[1]) || /^m/i.test(lead[1]);
  const canonical = CTD_AUTHORING_GUIDANCE[code]?.title;
  if (!dotted && !(canonical && normTitle(canonical) === normTitle(lead[2]))) return null;
  return { code, title: lead[2] };
}

/** a is b, or an ancestor or descendant of it, in the CTD tree. */
const sameBranch = (a: string, b: string) => a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`);

/**
 * The record's answer for one CTD code. Modules 2–5 are ICH-harmonised and are
 * answered for every region; the record's Module 1 is FDA's, so it answers a US
 * entry only, and any other region is told the record has no entry for it.
 */
function recordRequirements(
  entry: RegulatoryApplicationType,
  code: string,
  namedByCode: boolean,
): DraftingRequirements {
  if (moduleOf(code) === '1' && entry.region !== 'US') {
    return {
      requirements:
        `SECTION REQUIREMENTS: Module 1 is regional; the platform's guidance has no ${entry.region} (${entry.agency}) ` +
        `Module 1 entry${namedByCode ? ` for ${code}` : ''} — do not supply its requirements from memory. ` +
        `Draft only what the material provided supports, and say which ${entry.region} Module 1 requirements were not available.`,
      requirementsSource: `record:module1-not-indexed:${entry.region}`,
    };
  }
  const answer = resolveRequirements({ document: code });
  if (answer.kind === 'answer') {
    const src = answer.source;
    const id = src.kind === 'ctd-section' ? src.code : src.kind === 'lifecycle' ? src.id : src.outlineId;
    return {
      requirements:
        `SECTION REQUIREMENTS (from the platform's canonical regulatory record — draft to these; do not add requirements from memory):\n` +
        answer.requirements,
      requirementsSource: `record:${src.kind}:${id}:${answer.match}`,
    };
  }
  return {
    requirements: `SECTION REQUIREMENTS: ${answer.kind === 'not_indexed' ? answer.reason : `The platform's guidance has no entry for "${code}"; do not supply requirements from memory.`}`,
    requirementsSource: 'record:not-indexed',
  };
}

function blueprintLines(entry: RegulatoryApplicationType, section: SectionBlueprint['sections'][number]): string {
  const lines = [
    `SECTION REQUIREMENTS (from the ${entry.displayName} authoring blueprint):`,
    `- Section: ${section.code} — ${section.title}`,
    `- Content type: ${section.contentType}`,
    `- ${section.required ? 'REQUIRED section' : 'Optional section'}`,
  ];
  if (section.guidance) lines.push(`- Governing standard: ${section.guidance} (cite it and draft to its structure)`);
  return lines.join('\n');
}

type BlueprintRow = SectionBlueprint['sections'][number];

/** Reuse the same component record exposed by get_document_template; a DSUR
 * section must not revert to the legacy eleven-heading project copy. */
function componentRequirements(entry: RegulatoryApplicationType, sectionType: string): DraftingRequirements | null {
  const componentId = componentTemplateIdForRegistry(entry.id);
  const template = componentId ? getDocumentTemplate(componentId) : undefined;
  if (!template) return null;
  const target = normTitle(sectionType);
  const section = template.sections.find(s => [s.number, s.heading, `${s.number} ${s.heading}`].some(v => normTitle(v) === target));
  if (!section) return { requirements: null, requirementsSource: 'none' };
  return {
    requirements: `SECTION AUTHORING GUIDANCE (existing ${template.title} record):\n- Section: ${section.number} — ${section.heading}\n- ${section.purpose}\n- Recorded basis: ${template.regulatoryBasis}\n- Confirm applicability and the current agency/client template; platform required flags are not a completeness or approval verdict.`,
    requirementsSource: `outline:${template.outlineSource?.kind ?? 'canonical-record'}:${entry.id}:${section.number}`,
  };
}

/** A CTD-framework entry, its blueprint rows outside Module 1 (`outline`), and the request. */
interface CtdDraftContext {
  entry: RegulatoryApplicationType;
  blueprint: SectionBlueprint;
  outline: BlueprintRow[];
  sectionType: string;
}

const sameCode = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The record's brief, with the outline's row for the same code above it (never a Module 1 row). */
function withBlueprintRow(ctx: CtdDraftContext, code: string, rec: DraftingRequirements): DraftingRequirements {
  const row = moduleOf(code) === '1' ? undefined : ctx.outline.find((s) => sameCode(s.code, code));
  if (!row) return rec;
  return {
    requirements: `${blueprintLines(ctx.entry, row)}\n\n${rec.requirements}`,
    requirementsSource: `blueprint+${rec.requirementsSource}`,
  };
}

/**
 * One code → its brief (recordRequirements gates another region's Module 1);
 * several → the listing, picking none. No record title is held both in Module 1
 * and elsewhere (2026-10-05), so a listing never names FDA's Module 1 to another
 * region; g-drafting-paths-scope scopes Module 1 by region.
 */
function candidateRequirements(ctx: CtdDraftContext, codes: string[]): DraftingRequirements {
  const { entry, outline, sectionType } = ctx;
  if (codes.length === 1) return withBlueprintRow(ctx, codes[0], recordRequirements(entry, codes[0], false));
  const titleOf = (c: string) => CTD_AUTHORING_GUIDANCE[c]?.title ?? outline.find((s) => s.code === c)?.title ?? '';
  const listed = codes.map((c) => `${c} ${titleOf(c)}`.trim()).join('; ');
  return {
    requirements:
      `SECTION REQUIREMENTS: "${sectionType.trim()}" names more than one section in the platform's CTD record: ${listed}. ` +
      `Ask which section code is meant, or draft to the code given; do not merge their requirements or pick one from memory.`,
    requirementsSource: 'record:candidates',
  };
}

/**
 * A section number, alone or followed by any title: the number decides. A title
 * that neither the record nor the outline gives that number is named in a NOTE,
 * with the record's own code(s) for it, never silently dropped.
 */
function codeRequirements(ctx: CtdDraftContext, lead: { code: string; title: string | null }): DraftingRequirements {
  const rec = withBlueprintRow(ctx, lead.code, recordRequirements(ctx.entry, lead.code, true));
  const title = lead.title?.trim();
  if (!title || rec.requirementsSource.startsWith('record:module1-not-indexed')) return rec;
  const canonical = CTD_AUTHORING_GUIDANCE[lead.code]?.title;
  const rowTitle = ctx.outline.find((s) => sameCode(s.code, lead.code))?.title;
  if ([canonical, rowTitle].some((t) => t && normTitle(t) === normTitle(title))) return rec;
  const elsewhere = canonicalCodesForTitle(title).filter((c) => c !== lead.code);
  const note =
    `NOTE: the request titles ${lead.code} "${title}"` +
    (canonical ? `; the record titles ${lead.code} "${canonical}"` : '') +
    (elsewhere.length ? `; the record holds "${title}" at ${elsewhere.join(', ')}` : '') +
    `. Drafted to ${lead.code} as numbered — confirm the section with the author; do not merge the two.`;
  return { requirements: `${rec.requirements}\n${note}`, requirementsSource: `${rec.requirementsSource}+title-mismatch` };
}

/**
 * A title. The entry's own outline answers first: its row's code, never a
 * same-titled section elsewhere in the record (a DMF's "Stability" is 3.2.S.7,
 * not 3.2.P.8; a QOS's "Introduction" is 2.3.I, not 2.2) — unless the record
 * holds the title more than once and several of those sections lie inside the
 * outline (an IND's "Literature References": 2.7.5 and 5.4), when the codes are
 * listed and none is picked. A title only the record holds is its code (or
 * codes) among the CTD modules the blueprint covers; outside them it is
 * `record:outside-outline` (a QOS asked for "Stability" never gets 3.2.P.8).
 * Null when nothing holds the title.
 */
function titleRequirements(ctx: CtdDraftContext, matchRow: (s: BlueprintRow) => boolean): DraftingRequirements | null {
  const { entry, blueprint, outline, sectionType } = ctx;
  const canon = canonicalCodesForTitle(sectionType);
  const rows = outline.filter(matchRow);
  if (rows.length > 1) return candidateRequirements(ctx, rows.map((r) => r.code));
  if (rows.length === 1) {
    const inOutline = canon.filter((c) => outline.some((s) => sameBranch(s.code, c)));
    if (canon.length > 1 && inOutline.length > 1) return candidateRequirements(ctx, canon);
    return withBlueprintRow(ctx, rows[0].code, recordRequirements(entry, rows[0].code, true));
  }
  if (canon.length === 0) return null;
  const modules = new Set(blueprint.sections.map((s) => moduleOf(s.code)));
  const inModules = canon.filter((c) => modules.has(moduleOf(c)));
  if (inModules.length > 0) return candidateRequirements(ctx, inModules);
  return {
    requirements:
      `SECTION REQUIREMENTS: the platform's CTD record holds "${sectionType.trim()}" only at ${canon.join(', ')}, ` +
      `outside the ${entry.displayName} outline (Module ${[...modules].sort().join(', ')}). ` +
      `Ask which section of this submission is meant; do not supply its requirements from memory.`,
    requirementsSource: 'record:outside-outline',
  };
}

/**
 * Ground a draft in what the section must contain.
 *
 * For a CTD-framework entry (isCtdFramework) the requirements come from the
 * canonical record, never from the 17-row CTD_SECTIONS blueprint, whose Module 1
 * rows swap FDA's 1.1 Forms and 1.2 Cover letters and which has no row for
 * 2.7.4, 5.3.5.3, 1.14.4.1 or 3.2.P.5 (D2 findings 28 and 74, 2026-10-05):
 *   - a code, alone or followed by any title → recordRequirements (Modules 2–5
 *     any region; Module 1 for a US entry; otherwise, or when the record has
 *     nothing, an explicit "do not supply from memory" line — never null). The
 *     blueprint row for the same code is kept above the brief, outside Module 1
 *     only. A title that disagrees with the code is named in a NOTE
 *     (`+title-mismatch`), never silently dropped;
 *   - a title the entry's own outline (its blueprint rows outside Module 1)
 *     holds → that row's code with the record's brief for it (US IND "Drug
 *     Substance" → 3.2.S; DMF "Stability" → 3.2.S.7, never the record's
 *     same-titled 3.2.P.8), unless the record holds the title more than once
 *     and several of those sections lie inside the outline — then the codes are
 *     listed (US IND "Literature References" → 2.7.5; 4.3; 5.4);
 *   - any other title → the record's code when it holds the title once, every
 *     code when more than once, among the modules the entry's blueprint covers
 *     (a QOS's "Stability" is outside-outline, never 3.2.P.8); unmatched → null.
 * Any other blueprint (510(k), De Novo, MDR/IVDR, an IB's own numbering) is
 * answered from its blueprint row as before. Pure and deterministic.
 */
export function resolveDraftingRequirements(
  submissionType: string | undefined,
  sectionType: string,
): DraftingRequirements {
  const none: DraftingRequirements = { requirements: null, requirementsSource: 'none' };
  if (!submissionType || submissionType.trim().toUpperCase() === 'CTA') return none;
  const entry = resolveToRegistryEntry(submissionType);
  if (!entry) return none;

  const blueprint = getSectionBlueprintForEntry(entry);
  if (registryOutlineRequiresReview(entry.id) || blueprint.id !== entry.defaultSectionBlueprint) {
    return {
      requirements: `SECTION REQUIREMENTS: A suitable exact ${entry.displayName} outline is not indexed or requires review. Use the current agency/client template; do not substitute the platform's default CTD or supply section requirements from memory.`,
      requirementsSource: 'record:not-indexed-outline',
    };
  }
  const norm = (s: string) => s.trim().toLowerCase();
  const target = norm(sectionType);
  const matchRow = (s: BlueprintRow) =>
    norm(s.code) === target || norm(s.title) === target || norm(`${s.code} ${s.title}`) === target;

  if (!isCtdFramework(entry, blueprint)) {
    const component = componentRequirements(entry, sectionType);
    if (component) return component;
    const section = blueprint.sections.find(matchRow);
    return section ? { requirements: blueprintLines(entry, section), requirementsSource: 'blueprint' } : none;
  }

  // The blueprint's Module 1 rows are not a brief for a CTD entry: CTD_SECTIONS
  // swaps FDA's 1.1 Forms and 1.2 Cover letters (finding 28), and any other
  // region's Module 1 is not in the record (recordRequirements says so).
  const ctx: CtdDraftContext = {
    entry,
    blueprint,
    outline: blueprint.sections.filter((s) => moduleOf(s.code) !== '1'),
    sectionType,
  };
  const lead = leadingSectionCode(sectionType);
  return lead ? codeRequirements(ctx, lead) : titleRequirements(ctx, matchRow) ?? none;
}

/** The requirements block alone; resolveDraftingRequirements also names its source. */
export function resolveSectionRequirements(
  submissionType: string | undefined,
  sectionType: string,
): string | null {
  return resolveDraftingRequirements(submissionType, sectionType).requirements;
}

/**
 * Resolve any submission type string to the best system prompt.
 * Checks hardcoded frameworks first, then builds a dynamic prompt from registry data.
 */
export function resolveSystemPrompt(submissionType: string): string {
  if (submissionType.trim().toUpperCase() === 'CTA') {
    return `${REGULATORY_SYSTEM_PROMPTS.general_regulatory}\n\nCTA jurisdiction is unconfirmed. Confirm the receiving market and exact trial application type in the client interview before applying a regional outline or filing route. Mark regional requirements unresolved in a section draft.\n\n${BIOTECH_DRAFTING_GUIDANCE}`;
  }
  // Direct framework key (e.g. 'fda_510k', 'ich_clinical') — backward compatible.
  if (REGULATORY_SYSTEM_PROMPTS[submissionType]) {
    return `${REGULATORY_SYSTEM_PROMPTS[submissionType]}\n\n${BIOTECH_DRAFTING_GUIDANCE}`;
  }
  const entry = resolveToRegistryEntry(submissionType);
  if (entry) {
    const idKey = SUBMISSION_TYPE_TO_FRAMEWORK[entry.id];
    if (idKey && REGULATORY_SYSTEM_PROMPTS[idKey]) {
      return `${REGULATORY_SYSTEM_PROMPTS[idKey]}\n\n${buildDynamicSystemPrompt(entry.id)}\n\n${BIOTECH_DRAFTING_GUIDANCE}`;
    }
    return `${buildDynamicSystemPrompt(entry.id)}\n\n${BIOTECH_DRAFTING_GUIDANCE}`;
  }
  return `${REGULATORY_SYSTEM_PROMPTS.general_regulatory}\n\n${BIOTECH_DRAFTING_GUIDANCE}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Document Types
// ─────────────────────────────────────────────────────────────────────────────

export type RegulatoryFramework = 'fda_510k' | 'fda_pma' | 'eu_mdr' | 'ich_clinical' | 'cer_clinical_evaluation' | 'general_regulatory';

export interface DocumentDraftRequest {
  /** Regulatory framework context */
  framework: RegulatoryFramework;
  /**
   * Canonical submission/filing type (any of the 158+ registry IDs or aliases,
   * e.g. 'US_IND', 'CA_NDS', 'JP_MKT_APPROVAL', '510k'). When provided, the
   * system prompt is resolved from the Global Document Registry via the bridge,
   * unlocking framework-grade authoring for ALL filing types — not just the six
   * hardcoded frameworks. Falls back to `framework` when absent/unrecognized.
   */
  submissionType?: string;
  /** Document section or type to draft */
  sectionType: string;
  /** User instructions / content requirements */
  instructions: string;
  /** Optional existing content to revise */
  existingContent?: string;
  /** Project context (device type, indication, etc.) */
  projectContext?: {
    deviceName?: string;
    deviceType?: string;
    indication?: string;
    predicateDevice?: string;
    classification?: string;
  };
  /** Enable extended thinking for complex analysis */
  enableThinking?: boolean;
  /** Thinking budget tokens (default: 10000) */
  thinkingBudget?: number;
  /** Enable agentic tool use */
  enableTools?: boolean;
  /** Streaming callback */
  onStream?: StreamCallback;
  /** Organization/user context for audit */
  organizationId?: string | number;
  userId?: string | number;
  projectId?: string | number;
}

export interface DocumentDraftResponse {
  /** Generated document content */
  content: string;
  /** Extended thinking output (reasoning chain) */
  thinking?: string;
  /** Tools invoked during generation */
  toolsUsed?: string[];
  /** Provider and model info */
  model: string;
  /** Token usage */
  usage: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  };
  /** Whether prompt cache was hit (cost savings) */
  cacheHit?: boolean;
  /** Latency in ms */
  latencyMs: number;
  /**
   * Why generation ended, verbatim from the provider — 'end_turn',
   * 'max_tokens', 'length', 'chunk_timeout', 'unknown'. The gateway has always
   * recorded this and this service used to drop it, so a narrative that hit the
   * 8192-token ceiling mid-sentence came back indistinguishable from a finished
   * one and could be accepted into `coauthor_documents`, which is the table
   * eCTD leaves are materialized from.
   */
  finishReason?: string;
  /**
   * True when {@link finishReason} says the output was cut off with more to
   * say. Required, not optional, so the compiler catches a return site that
   * drops the signal. Not the negation of "complete": an absent or unknown
   * reason is neither, and a governed write should treat not-knowing as
   * not-confirmed.
   */
  truncated: boolean;
}

export interface VisionAnalysisRequest {
  /** Base64-encoded image data */
  imageData: string;
  /** Image MIME type */
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  /** Analysis instructions */
  instructions: string;
  /** Regulatory framework for context */
  framework?: RegulatoryFramework;
  /** Canonical submission/filing type — registry-driven prompt for any of 158+ types. */
  submissionType?: string;
  /** Enable extended thinking */
  enableThinking?: boolean;
  /** Streaming callback */
  onStream?: StreamCallback;
  organizationId?: string | number;
  userId?: string | number;
}

export interface BatchDocumentRequest {
  /** Array of draft requests to process */
  requests: DocumentDraftRequest[];
  /** Maximum concurrent requests */
  concurrency?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service Class
// ─────────────────────────────────────────────────────────────────────────────

export class AnaDocumentDraftingService {
  private static instance: AnaDocumentDraftingService;

  static getInstance(): AnaDocumentDraftingService {
    if (!this.instance) {
      this.instance = new AnaDocumentDraftingService();
    }
    return this.instance;
  }

  /**
   * Draft a regulatory document section using the model with full feature set.
   */
  async draftDocument(req: DocumentDraftRequest): Promise<DocumentDraftResponse> {
    const gateway = getGateway();
    const startTime = Date.now();

    // Prefer registry-driven prompt resolution (all 158+ types) when a
    // submissionType is supplied; otherwise use the hardcoded framework prompt.
    const systemPrompt = req.submissionType
      ? resolveSystemPrompt(req.submissionType)
      : resolveSystemPrompt(req.framework);

    // Build user prompt with project context
    let userPrompt = '';
    if (req.projectContext) {
      const ctx = req.projectContext;
      userPrompt += `PROJECT CONTEXT:\n`;
      if (ctx.deviceName) userPrompt += `- Device: ${ctx.deviceName}\n`;
      if (ctx.deviceType) userPrompt += `- Type: ${ctx.deviceType}\n`;
      if (ctx.indication) userPrompt += `- Indication: ${ctx.indication}\n`;
      if (ctx.predicateDevice) userPrompt += `- Predicate: ${ctx.predicateDevice}\n`;
      if (ctx.classification) userPrompt += `- Classification: ${ctx.classification}\n`;
      userPrompt += '\n';
    }

    userPrompt += `SECTION TO DRAFT: ${req.sectionType}\n\n`;

    // Ground the draft in the section blueprint (guidance reference, content
    // type, required flag) so every one of the 158 types drafts to its real
    // regulatory structure rather than the model re-deriving it.
    const { requirements, requirementsSource } = resolveDraftingRequirements(req.submissionType, req.sectionType);
    if (requirements) userPrompt += `${requirements}\n\n`;

    userPrompt += `INSTRUCTIONS:\n${req.instructions}`;

    if (req.existingContent) {
      userPrompt += `\n\nEXISTING CONTENT TO REVISE:\n${req.existingContent}`;
    }

    // Build gateway request
    const gatewayRequest: GatewayRequest = {
      taskType: 'document_drafting',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      provider: 'anthropic',
      model: 'claude-opus-4', // Use Opus for document drafting (registry alias, not a wire version)
      maxTokens: 8192,
      // Enable prompt caching for regulatory system prompts
      promptCache: { enabled: true, type: 'ephemeral' },
      organizationId: req.organizationId,
      userId: req.userId,
      projectId: req.projectId,
      callerModule: 'AnaDocumentDraftingService',
      metadata: {
        framework: req.framework,
        submissionType: req.submissionType,
        sectionType: req.sectionType,
        requirementsSource,
      },
    };

    // Extended thinking for complex reasoning
    if (req.enableThinking) {
      gatewayRequest.thinking = {
        enabled: true,
        budgetTokens: req.thinkingBudget || 10000,
      };
    }

    // Agentic tool use for evidence search and citation
    if (req.enableTools) {
      gatewayRequest.tools = DOCUMENT_DRAFTING_TOOLS;
      gatewayRequest.toolChoice = 'auto';
    }

    // Streaming
    if (req.onStream) {
      gatewayRequest.stream = true;
      gatewayRequest.onStream = req.onStream;
    }

    const response = await gateway.route(gatewayRequest) as AnaGatewayResponse;

    return {
      content: response.content,
      thinking: response.thinking,
      toolsUsed: response.toolUses?.map(t => t.name),
      model: response.model,
      usage: {
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        estimatedCostUsd: response.usage.estimatedCostUsd,
      },
      cacheHit: response.cacheHit,
      latencyMs: response.latencyMs,
      finishReason: response.finishReason,
      truncated: isTruncated(response.finishReason),
    };
  }

  /**
   * Analyze a scanned document or image using the Vision-capable model.
   */
  async analyzeImage(req: VisionAnalysisRequest): Promise<DocumentDraftResponse> {
    const gateway = getGateway();

    const systemPrompt = req.submissionType
      ? resolveSystemPrompt(req.submissionType)
      : req.framework
        ? resolveSystemPrompt(req.framework)
        : 'You are a document analysis expert specializing in regulatory and clinical documents. Analyze the provided image and extract all relevant information.';

    const imageBlock: ImageBlock = {
      type: 'image',
      source: {
        type: 'base64',
        media_type: req.mediaType,
        data: req.imageData,
      },
    };

    const gatewayRequest: GatewayRequest = {
      taskType: 'document_analysis',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: req.instructions,
          contentBlocks: [
            imageBlock,
            { type: 'text', text: req.instructions },
          ],
        },
      ],
      provider: 'anthropic',
      model: 'claude-sonnet-4', // Sonnet for vision (cost-effective) — registry alias
      maxTokens: 4096,
      organizationId: req.organizationId,
      userId: req.userId,
      callerModule: 'AnaDocumentDraftingService.vision',
    };

    if (req.enableThinking) {
      gatewayRequest.thinking = { enabled: true, budgetTokens: 5000 };
    }

    if (req.onStream) {
      gatewayRequest.stream = true;
      gatewayRequest.onStream = req.onStream;
    }

    const response = await gateway.route(gatewayRequest) as AnaGatewayResponse;

    return {
      content: response.content,
      thinking: response.thinking,
      model: response.model,
      usage: {
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        estimatedCostUsd: response.usage.estimatedCostUsd,
      },
      latencyMs: response.latencyMs,
      finishReason: response.finishReason,
      truncated: isTruncated(response.finishReason),
    };
  }

  /**
   * Run compliance review on a document section using the model with compliance tools.
   */
  async reviewCompliance(
    content: string,
    framework: RegulatoryFramework | string,
    options?: {
      enableThinking?: boolean;
      onStream?: StreamCallback;
      organizationId?: string | number;
      userId?: string | number;
    }
  ): Promise<DocumentDraftResponse> {
    const gateway = getGateway();

    // Universal resolver: accepts a hardcoded framework key OR any of the 158+
    // registry submission types/aliases.
    const systemPrompt = resolveSystemPrompt(framework);

    const gatewayRequest: GatewayRequest = {
      taskType: 'regulatory_review',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Review the following document content for regulatory compliance under the ${framework} framework. Identify any gaps, non-compliant sections, and provide specific recommendations with regulatory citations.\n\nDOCUMENT CONTENT:\n${content}`,
        },
      ],
      provider: 'anthropic',
      model: 'claude-opus-4',
      maxTokens: 8192,
      promptCache: { enabled: true, type: 'ephemeral' },
      tools: COMPLIANCE_REVIEW_TOOLS,
      toolChoice: 'auto',
      callerModule: 'AnaDocumentDraftingService.compliance',
      organizationId: options?.organizationId,
      userId: options?.userId,
    };

    if (options?.enableThinking) {
      gatewayRequest.thinking = { enabled: true, budgetTokens: 15000 };
    }

    if (options?.onStream) {
      gatewayRequest.stream = true;
      gatewayRequest.onStream = options.onStream;
    }

    const response = await gateway.route(gatewayRequest) as AnaGatewayResponse;

    return {
      content: response.content,
      thinking: response.thinking,
      toolsUsed: response.toolUses?.map(t => t.name),
      model: response.model,
      usage: {
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        estimatedCostUsd: response.usage.estimatedCostUsd,
      },
      cacheHit: response.cacheHit,
      latencyMs: response.latencyMs,
      finishReason: response.finishReason,
      truncated: isTruncated(response.finishReason),
    };
  }

  /**
   * Run gap analysis on a document using the model with gap analysis tools.
   */
  async analyzeGaps(
    documentContent: string,
    framework: RegulatoryFramework | string,
    targetSections: string[],
    options?: {
      enableThinking?: boolean;
      onStream?: StreamCallback;
      organizationId?: string | number;
      userId?: string | number;
    }
  ): Promise<DocumentDraftResponse> {
    const gateway = getGateway();

    // Universal resolver: hardcoded framework key OR any registry submission type.
    const systemPrompt = resolveSystemPrompt(framework);

    const gatewayRequest: GatewayRequest = {
      taskType: 'document_analysis',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Perform a comprehensive gap analysis on this document against the ${framework} requirements.

TARGET SECTIONS TO EVALUATE:
${targetSections.map((s, i) => `${i + 1}. ${s}`).join('\n')}

For each required section, determine:
1. Whether it exists in the document
2. Whether it meets the regulatory requirements
3. Specific gaps and missing content
4. Priority level (critical / major / minor)
5. Recommended remediation

DOCUMENT CONTENT:
${documentContent}`,
        },
      ],
      provider: 'anthropic',
      model: 'claude-opus-4',
      maxTokens: 8192,
      promptCache: { enabled: true, type: 'ephemeral' },
      tools: GAP_ANALYSIS_TOOLS,
      toolChoice: 'auto',
      callerModule: 'AnaDocumentDraftingService.gapAnalysis',
      organizationId: options?.organizationId,
      userId: options?.userId,
    };

    if (options?.enableThinking !== false) {
      // Default to thinking enabled for gap analysis
      gatewayRequest.thinking = { enabled: true, budgetTokens: 20000 };
    }

    if (options?.onStream) {
      gatewayRequest.stream = true;
      gatewayRequest.onStream = options.onStream;
    }

    const response = await gateway.route(gatewayRequest) as AnaGatewayResponse;

    return {
      content: response.content,
      thinking: response.thinking,
      toolsUsed: response.toolUses?.map(t => t.name),
      model: response.model,
      usage: {
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        estimatedCostUsd: response.usage.estimatedCostUsd,
      },
      cacheHit: response.cacheHit,
      latencyMs: response.latencyMs,
      finishReason: response.finishReason,
      truncated: isTruncated(response.finishReason),
    };
  }

  /**
   * Batch process multiple document sections (parallel with concurrency limit).
   *
   * Each slice settles PER SECTION. This ran through `Promise.all`, so one
   * section that could not be drafted — realistically one whose existing
   * content is too large for any model, which the gateway now refuses before
   * dispatch — rejected the whole call, and the other sections' drafts,
   * already generated and paid for, were discarded. A failed section is now a
   * failure result in its own slot (batch-draft-result.ts), carrying the
   * gateway's code and its actionable sentence; a fault of ours is
   * DRAFT_FAILED with the internals withheld and logged here, where the detail
   * is useful.
   */
  async batchDraft(req: BatchDocumentRequest): Promise<BatchDraftResult[]> {
    const concurrency = req.concurrency || 3;
    const results: BatchDraftResult[] = [];

    // Process in batches
    for (let i = 0; i < req.requests.length; i += concurrency) {
      const batch = req.requests.slice(i, i + concurrency);
      const settled = await Promise.allSettled(batch.map(r => this.draftDocument(r)));
      settled.forEach((outcome, j) => {
        if (outcome.status === 'fulfilled') {
          results.push(outcome.value);
          return;
        }
        results.push(describeBatchDraftFailure(batch[j], outcome.reason));
      });
    }

    return results;
  }

  /**
   * Quick completion using the Sonnet model (faster, cheaper for simple tasks).
   *
   * With a `framework` it is regulatory drafting, not a quick completion: the
   * system turn is the framework's drafting persona (resolveSystemPrompt), so
   * it goes to the gateway as `document_drafting` with no model pinned. An
   * approved model drafts it; in production the gateway refuses it until a
   * model passes PQ (ADR-0015 §3). Until 2026-09-28 (track GW review [10]) it
   * was sent as `general` pinned to claude-sonnet-4 — not approved for
   * high-risk work, PQ pending — so neither rule applied: a label bypass on
   * POST /api/claude/quick. With no framework it is still a quick `general`
   * completion on Sonnet.
   */
  async quickComplete(
    prompt: string,
    options?: {
      framework?: RegulatoryFramework | string;
      maxTokens?: number;
      organizationId?: string | number;
      userId?: string | number;
    }
  ): Promise<{ content: string; provider: string; model: string }> {
    const gateway = getGateway();

    const messages: { role: 'system' | 'user'; content: string }[] = [];
    if (options?.framework) {
      // Universal resolver: hardcoded framework key OR any registry submission type.
      const sys = resolveSystemPrompt(options.framework);
      if (sys) messages.push({ role: 'system', content: sys });
    }
    messages.push({ role: 'user', content: prompt });

    const drafting = messages[0]?.role === 'system';
    const response = await gateway.route({
      ...(drafting
        ? { taskType: 'document_drafting' as const }
        : { taskType: 'general' as const, provider: 'anthropic' as const, model: 'claude-sonnet-4' }),
      messages,
      maxTokens: options?.maxTokens || 2048,
      promptCache: options?.framework ? { enabled: true, type: 'ephemeral' } : undefined,
      organizationId: options?.organizationId,
      userId: options?.userId,
      callerModule: 'AnaDocumentDraftingService.quickComplete',
    });

    // The model that served, for the caller's provenance record: the pin above
    // is a preference the gateway may fall back from, not a fact.
    return { content: response.content, provider: response.provider, model: response.model };
  }
}

const batchLog = createScopedLogger('ana-drafting-batch');

/**
 * The failure result for one section of a batch. A gateway refusal keeps its
 * classification and its own actionable sentence (for a size refusal: how big
 * the request is, the largest window available, how much to cut). Anything
 * else is a fault of ours — logged with its detail, reported without it, so a
 * driver message never becomes card copy.
 */
function describeBatchDraftFailure(request: DocumentDraftRequest, reason: unknown): BatchDraftFailure {
  if (isGatewayError(reason)) {
    const { code, message } = classifyGatewayError(reason);
    return { error: code, message, sectionType: request.sectionType };
  }
  batchLog.error('batch section failed', {
    sectionType: request.sectionType,
    err: reason instanceof Error ? reason.message : String(reason),
  });
  return {
    error: 'DRAFT_FAILED',
    message: 'This section could not be drafted. The problem has been logged.',
    sectionType: request.sectionType,
  };
}

// Export singleton getter
export function getAnaDraftingService(): AnaDocumentDraftingService {
  return AnaDocumentDraftingService.getInstance();
}
