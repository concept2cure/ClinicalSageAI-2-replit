/**
 * CTD authoring library — public API.
 *
 * One canonical home for CTD authoring DEPTH across the FDA drug lifecycle
 * (IND -> NDA/BLA): the leaf-level per-section authoring guidance overlay
 * (`CTD_AUTHORING_GUIDANCE`) and the lifecycle document-type registry
 * (`LIFECYCLE_DOCUMENT_TYPES`). Every authoring rail — the deep IND eCTD tree,
 * the marketing blueprints, the IND section registry — resolves guidance by
 * canonical CTD code through here, so authoring prose never forks.
 *
 * @module server/services/ind/ctd
 */

import type {
  CtdSection,
  LifecycleDocumentType,
  LifecycleFamily,
  SubmissionFamily,
} from './types.js';
import { CTD_AUTHORING_GUIDANCE } from './authoring-guidance.js';
import { LIFECYCLE_DOCUMENT_TYPES } from './lifecycle-document-types.js';
import { compareSectionCode } from '../../../../shared/regulatory/section-code';
import { resolveSectionBriefSource } from './section-brief.js';

export type {
  CtdSection,
  CtdContentType,
  SubmissionFamily,
  LifecycleDocumentType,
  LifecycleComponent,
  LifecycleCategory,
  LifecycleFamily,
} from './types.js';
export { CTD_AUTHORING_GUIDANCE } from './authoring-guidance.js';
export { LIFECYCLE_DOCUMENT_TYPES } from './lifecycle-document-types.js';
export {
  renderSectionBrief,
  renderLifecycleBrief,
  listLifecycleIds,
  sectionIdentityLine,
  resolveSectionBriefSource,
  SECTION_BRIEF_MAX_CHARS,
  type SectionBriefKind,
  type SectionBriefSource,
} from './section-brief.js';
export {
  resolveRequirements,
  REQUIREMENTS_BRIEF_CHARS,
  type RequirementQuery,
  type RequirementAnswer,
  type RequirementSource,
  type RequirementMatch,
} from './requirements-resolver.js';
export type { E3Section, E3Basis, E3Confidence, E3Applicability } from './types.js';
export {
  ICH_E3_GUIDANCE,
  E3_REPORT_NOTES,
  normalizeE3Number,
  getE3Section,
  e3ParentNumber,
  e3Children,
  e3TopLevel,
  e3BasisFor,
  renderE3Brief,
  renderE3Scaffold,
  e3PlaceholderToken,
} from './csr-e3-guidance.js';
export {
  SUBMISSION_CHAIN,
  getChainNode,
  evaluateChain,
  type ChainNode,
  type ChainStage,
  type ChainEvidence,
  type ChainVerdict,
  type NodeState,
  type NodeVerdict,
  type VaultSectionFact,
} from './submission-chain.js';
export {
  FDA_TECHNICAL_RULES,
  ELSA_NOTE,
  rulesByArea,
  type TechnicalRule,
  type RuleArea,
  type PlatformCheck,
} from './fda-technical-rules.js';

/**
 * The key a section code's authoring guidance is stored under: strip a leading
 * eCTD "m" module prefix (e.g. "m3.2.S.4" -> "3.2.S.4") and trim. Section
 * letters (S/P/A/R) keep their case.
 *
 * A lookup key, not a validator. It returns a string for anything, including a
 * code the placement gate must refuse. It used to share its name with the
 * refusing function in shared/regulatory/section-code.ts, and was re-exported
 * beside it (tests/schema-contract/one-normalize-ctd-code.contract.test.ts).
 */
export function ctdGuidanceKey(code: string): string {
  return String(code ?? '').trim().replace(/^m(?=\d)/, '');
}

/** Every canonical CTD code that carries authoring guidance. */
export function listCtdGuidanceCodes(): string[] {
  return Object.keys(CTD_AUTHORING_GUIDANCE);
}

/**
 * Resolve the authoring guidance for a CTD code. Exact match first; then the
 * longest registered code that is a prefix of the requested code (so a leaf
 * request like "3.2.S.4.1" falls back to "3.2.S.4"); then the longest
 * registered code the requested code is a prefix of (so a parent request like
 * "3.2.S" surfaces its most general child). Tolerates the "m" prefix.
 */
export function getCtdAuthoringGuidance(code: string): CtdSection | undefined {
  const canonical = ctdGuidanceKey(code);
  const exact = CTD_AUTHORING_GUIDANCE[canonical];
  if (exact) return exact;

  const codes = Object.keys(CTD_AUTHORING_GUIDANCE);
  // requested is deeper than any registered → nearest registered ancestor
  const ancestors = codes
    .filter((c) => canonical.startsWith(`${c}.`))
    .sort((a, b) => b.length - a.length);
  if (ancestors[0]) return CTD_AUTHORING_GUIDANCE[ancestors[0]];

  // requested is a parent of registered leaves → the first (lowest) descendant
  const descendants = codes
    .filter((c) => c.startsWith(`${canonical}.`))
    .sort(compareSectionCode);
  if (descendants[0]) return CTD_AUTHORING_GUIDANCE[descendants[0]];

  return undefined;
}

/** All CTD guidance entries for a given module (1-5), in code order. */
export function getCtdGuidanceForModule(module: 1 | 2 | 3 | 4 | 5): CtdSection[] {
  return Object.values(CTD_AUTHORING_GUIDANCE)
    .filter((s) => s.module === module)
    .sort((a, b) => compareSectionCode(a.code, b.code));
}

/** CTD guidance entries required for a given submission family. */
export function getCtdGuidanceForFamily(family: SubmissionFamily): CtdSection[] {
  return Object.values(CTD_AUTHORING_GUIDANCE)
    .filter((s) => s.requiredFor.includes(family))
    .sort((a, b) => a.module - b.module || compareSectionCode(a.code, b.code));
}

// ── Lifecycle document types ──────────────────────────────────────────────────

export function listLifecycleDocumentTypes(): LifecycleDocumentType[] {
  return LIFECYCLE_DOCUMENT_TYPES;
}

export function getLifecycleDocumentType(id: string): LifecycleDocumentType | undefined {
  return LIFECYCLE_DOCUMENT_TYPES.find((d) => d.id === id);
}

export function listLifecycleDocumentTypesByFamily(family: LifecycleFamily): LifecycleDocumentType[] {
  return LIFECYCLE_DOCUMENT_TYPES.filter((d) => d.family === family);
}

/**
 * Resolve a canonical document-taxonomy registry id (e.g. "US_NDA", "US_IND_SR")
 * to the lifecycle document type that carries its deep authoring guidance, so a
 * taxonomy entry the product already offers surfaces the components + CTD
 * sections a sponsor authors it from. Returns undefined when no lifecycle type
 * maps to that registry id.
 */
export function getLifecycleDocumentTypeForRegistry(registryId: string): LifecycleDocumentType | undefined {
  const id = String(registryId ?? '').trim().toUpperCase();
  return LIFECYCLE_DOCUMENT_TYPES.find((d) => d.registryId === id);
}

/**
 * Expand a document type's `ctdSectionCodes` (which may be prefixes like "3.2.S"
 * or whole modules like "3") into the concrete CTD guidance entries it pulls
 * from the shared overlay, in code order.
 */
export function resolveCtdSectionsForDocType(dt: LifecycleDocumentType): CtdSection[] {
  const prefixes = dt.ctdSectionCodes ?? [];
  if (prefixes.length === 0) return [];
  const seen = new Set<string>();
  const out: CtdSection[] = [];
  for (const s of Object.values(CTD_AUTHORING_GUIDANCE)) {
    const hit = prefixes.some(
      (p) => s.code === p || s.code.startsWith(`${p}.`) || (/^\d$/.test(p) && String(s.module) === p),
    );
    if (hit && !seen.has(s.code)) {
      seen.add(s.code);
      out.push(s);
    }
  }
  return out.sort((a, b) => a.module - b.module || compareSectionCode(a.code, b.code));
}

/**
 * Build a rich, industry-grade drafting prompt for a CTD section from its
 * guidance entry, interpolating project context.
 *
 * Resolves through resolveSectionBriefSource (section-brief.ts), the same
 * resolution the section playbook uses, and NOT through
 * getCtdAuthoringGuidance, whose parent branch returns the first descendant:
 * that briefed 8 of the 19 IND sections (2.6, 2.7, 3.2.S, 3.2.P, 4.2.1,
 * 4.2.2, 4.2.3, 5.3) as their first child, so a 4.2.3 Toxicology draft was
 * written as "4.2.3.1 Single-Dose Toxicity".
 *   - exact    → the entry's brief, titled with the entry;
 *   - ancestor → the entry's brief, titled with the requested (open) code and
 *                saying whose requirements follow;
 *   - parent   → the requested container, listing the sections it contains
 *                (parentHeadingLines: true depth, an unregistered intermediate
 *                level such as 5.3.5 by code only, titles without the
 *                overlay's picker qualifiers); no one child's requirements;
 *                "Not applicable" only where the material says so;
 *   - null     → null (the caller falls back or says nothing).
 * getCtdAuthoringGuidance stays for its other callers (GET /guidance/:code).
 */
export function buildSectionGenerationPrompt(
  code: string,
  ctx: { productName?: string; indication?: string; sponsor?: string; phase?: string } = {},
): string | null {
  const src = resolveSectionBriefSource(code);
  if (!src) return null;

  const fill = (s: string) =>
    s
      .replace(/\{\{PRODUCT_NAME\}\}/g, ctx.productName || '[Product Name]')
      .replace(/\{\{INDICATION\}\}/g, ctx.indication || '[Indication]')
      .replace(/\{\{SPONSOR\}\}/g, ctx.sponsor || '[Sponsor]')
      .replace(/\{\{PHASE\}\}/g, ctx.phase || '[Phase]');

  const noFabrication =
    `Do not fabricate study results, numbers, or product-specific facts you were not given; ` +
    `where a value is unknown, insert a clearly-marked placeholder.`;

  if (src.kind === 'parent') {
    return [
      `You are a senior regulatory affairs writer authoring CTD section ${src.requested} as a whole ` +
        `for an FDA submission. Write in formal regulatory language suitable for filing; follow the ICH M4 CTD structure.`,
      fill('Product: {{PRODUCT_NAME}}. Indication: {{INDICATION}}. Sponsor: {{SPONSOR}}. Development phase: {{PHASE}}.'),
      `Section ${src.requested} contains these sections. Organise the draft under them, in this order, ` +
        `with each heading numbered and titled as listed. A code listed without a title is a containing ` +
        `heading: keep it, numbered as listed, with the sections under it nested beneath it:\n` +
        parentHeadingLines(src.requested, src.children!).join('\n'),
      `Each listed section has its own requirements. Under each heading, write only what the material ` +
        `provided supports for that section. Where the material provided states that a section does not ` +
        `apply to this product or phase, write "Not applicable" under the heading with the reason the ` +
        `material gives; do not decide that yourself. Where the material supports nothing, keep the heading ` +
        `and insert a placeholder.`,
      noFabrication,
    ].join('\n\n');
  }

  const g = src.entry!;
  const parts: string[] = [];
  parts.push(
    src.kind === 'ancestor'
      ? `You are a senior regulatory affairs writer authoring CTD section ${src.requested}, within ${g.code} "${g.title}", ` +
          `for an FDA submission. The requirements below are ${g.code}'s; write the part of them that belongs in ${src.requested}. ` +
          `Write in formal regulatory language suitable for filing; follow the ICH M4 CTD structure.`
      : `You are a senior regulatory affairs writer authoring CTD section ${g.code} "${g.title}" ` +
          `for an FDA submission. Write in formal regulatory language suitable for filing; follow the ICH M4 CTD structure.`,
  );
  if (g.authoringGuidance) parts.push(`Section intent: ${fill(g.authoringGuidance)}`);
  if (g.keyContentElements.length) {
    parts.push(`The section MUST cover:\n${g.keyContentElements.map((e) => `- ${fill(e)}`).join('\n')}`);
  }
  if (g.expectedData?.length) {
    parts.push(`Expected tables / datasets:\n${g.expectedData.map((e) => `- ${fill(e)}`).join('\n')}`);
  }
  if (g.commonPitfalls?.length) {
    parts.push(`Avoid these common deficiencies:\n${g.commonPitfalls.map((e) => `- ${fill(e)}`).join('\n')}`);
  }
  if (g.generationPrompt) parts.push(fill(g.generationPrompt));
  parts.push(`${noFabrication} Governing reference: ${g.guidance || 'ICH M4'}.`);
  return parts.join('\n\n');
}

/**
 * The overlay's title for a section as a filed heading: without the
 * platform's disambiguating qualifiers — a " — Overview" suffix and a trailing
 * bracketed note ("Stability (Drug Substance)", "Introduction (Nonclinical
 * Written and Tabulated Summaries)"), which tell sections apart in a picker
 * but are not part of the ICH M4 heading. A bracket inside the title
 * ("Manufacturer(s)", "Human Pharmacokinetic (PK) Studies") is kept.
 */
function headingTitle(title: string): string {
  return title
    .replace(/\s+—\s+Overview$/, '')
    .replace(/\s+\([^()]*\)$/, '')
    .trim();
}

/**
 * The heading lines of a parent prompt: every registered section under
 * `requested`, in order, indented by its true depth below `requested`. An
 * intermediate level with no overlay entry (5.3.5 under 5.3) is listed by
 * code only — no title is invented — right before its first descendant, so
 * 5.3.5.1–5.3.5.4 are never read as children of 5.3.4.
 */
function parentHeadingLines(requested: string, children: CtdSection[]): string[] {
  const base = requested.split('.').length;
  const listed = new Set(children.map((c) => c.code));
  const indent = (segments: number) => '  '.repeat(Math.max(0, segments - base - 1));
  const lines: string[] = [];
  for (const c of children) {
    const segs = c.code.split('.');
    for (let n = base + 1; n < segs.length; n++) {
      const level = segs.slice(0, n).join('.');
      if (listed.has(level)) continue;
      listed.add(level);
      lines.push(`${indent(n)}- ${level}`);
    }
    lines.push(`${indent(segs.length)}- ${c.code} ${headingTitle(c.title)}`);
  }
  return lines;
}
