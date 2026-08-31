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

/**
 * Normalize a section code to the canonical (plain) form used as the guidance
 * key: strip a leading eCTD "m" module prefix (e.g. "m3.2.S.4" -> "3.2.S.4")
 * and trim. Section letters (S/P/A/R) keep their case.
 */
export function normalizeCtdCode(code: string): string {
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
  const canonical = normalizeCtdCode(code);
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
 * guidance entry, interpolating project context. Returns null when no guidance
 * is registered for the code (caller can then fall back to a generic prompt).
 */
export function buildSectionGenerationPrompt(
  code: string,
  ctx: { productName?: string; indication?: string; sponsor?: string; phase?: string } = {},
): string | null {
  const g = getCtdAuthoringGuidance(code);
  if (!g) return null;

  const fill = (s: string) =>
    s
      .replace(/\{\{PRODUCT_NAME\}\}/g, ctx.productName || '[Product Name]')
      .replace(/\{\{INDICATION\}\}/g, ctx.indication || '[Indication]')
      .replace(/\{\{SPONSOR\}\}/g, ctx.sponsor || '[Sponsor]')
      .replace(/\{\{PHASE\}\}/g, ctx.phase || '[Phase]');

  const parts: string[] = [];
  parts.push(
    `You are a senior regulatory affairs writer authoring CTD section ${g.code} "${g.title}" ` +
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
  parts.push(
    `Do not fabricate study results, numbers, or product-specific facts you were not given; ` +
      `where a value is unknown, insert a clearly-marked placeholder. Governing reference: ${g.guidance || 'ICH M4'}.`,
  );
  return parts.join('\n\n');
}
