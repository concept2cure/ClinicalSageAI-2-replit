/**
 * @fileoverview CMC Module 3 Auto-Draft Composer (extraction → draft bridge)
 * @module server/services/cmc/auto-draft-composer
 *
 * GLUE LAYER. Closes the gap flagged in GA_GAP_AUDIT_2026-06-10.md:40
 * ("CMC / Module 3 ... lacks auto-draft-from-uploads").
 *
 * The Module 3 composer (`composeModule3FromCanonicalSources`) and the auto
 * extraction pipeline (`autoExtractionPipeline.ts`) both already exist, but
 * nothing turns extracted/uploaded CMC documents into a drafted Module 3 in
 * one shot. This module is that bridge:
 *
 *   extracted documents  ──►  CanonicalSource[]  ──►  composeModule3FromCanonicalSources()
 *                              (this file)              (existing composer)
 *
 * It is intentionally pure (no DB / no AI calls) so it is fully deterministic
 * and testable. Persistence and tenant handling live in the route layer, which
 * mirrors the sibling CMC routes.
 */

import {
  composeModule3FromCanonicalSources,
  type CanonicalSource,
  type CmcSourceType,
  type ComposedSection,
} from '../module3Composer';

// ── Input contract ─────────────────────────────────────────────────────────────

/**
 * A single extracted/uploaded CMC document ready to be mapped into a canonical
 * source. This is intentionally a thin, transport-friendly shape that the
 * extraction pipeline output (`ExtractionResult` + detected section codes) and
 * direct API callers can both populate.
 */
export interface ExtractedCmcDocument {
  /** Stable identifier for the source document (artifact id / upload id / uuid). */
  id: string;
  /**
   * Explicit CMC source type. When omitted, the bridge infers it from
   * `ctdSection` (e.g. "3.2.S.4" → "specification"). If neither is resolvable
   * the document is skipped and reported as unmapped.
   */
  sourceType?: CmcSourceType | null;
  /** Detected/declared CTD section code, e.g. "3.2.S.4", "3.2.P.8". */
  ctdSection?: string | null;
  /**
   * Structured CMC fields keyed exactly as the composer's section generators
   * expect (e.g. `name`, `manufacturer`, `acceptanceCriteria`, `timePoints`).
   */
  payload?: Record<string, any> | null;
  /** Optional precomputed content hash; the composer recomputes if absent. */
  sourceHash?: string | null;
}

export interface AutoDraftCoverage {
  /** Number of input documents successfully mapped to a canonical source. */
  mappedSourceCount: number;
  /** Documents that could not be mapped to any source type. */
  unmappedDocuments: Array<{ id: string; reason: string }>;
  /** Distinct canonical source types present after mapping. */
  resolvedSourceTypes: CmcSourceType[];
  /** Section keys with completeness === 100. */
  completeSections: string[];
  /** Section keys with 0 < completeness < 100, including their missing inputs. */
  partialSections: Array<{ sectionKey: string; completeness: number; missingInputs: string[] }>;
  /** Section keys with no usable source data (completeness === 0). */
  emptySections: string[];
  /** Mean completeness across all Module 3 subsections (0-100, integer). */
  overallCompleteness: number;
}

export interface AutoDraftResult {
  /** The full drafted Module 3 as produced by the existing composer. */
  sections: ComposedSection[];
  /** Gap / coverage summary derived from the composer output. */
  coverage: AutoDraftCoverage;
}

// ── CTD section → primary source type inference ─────────────────────────────────

/**
 * Maps a CTD section code to the most representative CMC source type so that
 * extracted documents whose only signal is a detected section code can still be
 * routed into the composer. Mirrors the source/section relationships encoded in
 * MODULE3_SECTION_RULES.
 */
const CTD_SECTION_TO_SOURCE_TYPE: Record<string, CmcSourceType> = {
  '3.2.S.1': 'drug_substance',
  '3.2.S.2': 'manufacturing_process',
  '3.2.S.3': 'characterization',
  '3.2.S.4': 'specification',
  '3.2.S.5': 'reference_standard',
  '3.2.S.6': 'container_closure',
  '3.2.S.7': 'stability',
  '3.2.P.1': 'drug_product',
  '3.2.P.2': 'formulation_record',
  '3.2.P.3': 'batch',
  '3.2.P.4': 'excipient',
  '3.2.P.5': 'specification',
  '3.2.P.6': 'reference_standard',
  '3.2.P.7': 'container_closure',
  '3.2.P.8': 'stability',
};

export function inferSourceTypeFromCtdSection(
  ctdSection: string | null | undefined,
): CmcSourceType | null {
  if (!ctdSection) return null;
  const normalized = ctdSection.trim().toUpperCase().replace(/\s+/g, '');
  if (CTD_SECTION_TO_SOURCE_TYPE[normalized]) {
    return CTD_SECTION_TO_SOURCE_TYPE[normalized];
  }
  // Tolerate deeper codes like "3.2.S.4.1" by matching the longest known prefix.
  const candidates = Object.keys(CTD_SECTION_TO_SOURCE_TYPE)
    .filter((key) => normalized.startsWith(key))
    .sort((a, b) => b.length - a.length);
  return candidates.length > 0 ? CTD_SECTION_TO_SOURCE_TYPE[candidates[0]] : null;
}

// ── Pure mapping: extracted docs → CanonicalSource[] ────────────────────────────

/**
 * Maps extracted/uploaded CMC documents to the `CanonicalSource[]` shape the
 * composer consumes. Documents that resolve to no source type are returned in
 * `unmapped` rather than being silently dropped, so callers can surface them.
 *
 * Pure: no I/O, deterministic for a given input.
 */
export function buildCanonicalSourcesFromExtractedDocuments(
  documents: ExtractedCmcDocument[],
): { sources: CanonicalSource[]; unmapped: Array<{ id: string; reason: string }> } {
  const sources: CanonicalSource[] = [];
  const unmapped: Array<{ id: string; reason: string }> = [];

  for (const doc of documents) {
    const resolvedType = doc.sourceType ?? inferSourceTypeFromCtdSection(doc.ctdSection);

    if (!resolvedType) {
      unmapped.push({
        id: doc.id,
        reason: doc.ctdSection
          ? `Unrecognized CTD section "${doc.ctdSection}" and no explicit sourceType`
          : 'No sourceType or ctdSection provided',
      });
      continue;
    }

    const sourcePayload: Record<string, any> = { ...(doc.payload ?? {}) };
    // Preserve the originating CTD section for downstream lineage without
    // overwriting an explicit payload field.
    if (doc.ctdSection && sourcePayload.ctdSection === undefined) {
      sourcePayload.ctdSection = doc.ctdSection;
    }

    const source: CanonicalSource = {
      id: doc.id,
      sourceType: resolvedType,
      sourcePayload,
    };
    if (doc.sourceHash) {
      source.sourceHash = doc.sourceHash;
    }
    sources.push(source);
  }

  return { sources, unmapped };
}

// ── Coverage / gap analysis derived from composer output ────────────────────────

function summarizeCoverage(
  sections: ComposedSection[],
  sources: CanonicalSource[],
  unmapped: Array<{ id: string; reason: string }>,
): AutoDraftCoverage {
  const completeSections: string[] = [];
  const partialSections: Array<{ sectionKey: string; completeness: number; missingInputs: string[] }> = [];
  const emptySections: string[] = [];

  for (const section of sections) {
    if (section.completeness >= 100) {
      completeSections.push(section.sectionKey);
    } else if (section.completeness > 0) {
      partialSections.push({
        sectionKey: section.sectionKey,
        completeness: section.completeness,
        missingInputs: section.missingInputs,
      });
    } else {
      emptySections.push(section.sectionKey);
    }
  }

  const overallCompleteness =
    sections.length === 0
      ? 0
      : Math.round(sections.reduce((sum, s) => sum + s.completeness, 0) / sections.length);

  return {
    mappedSourceCount: sources.length,
    unmappedDocuments: unmapped,
    resolvedSourceTypes: [...new Set(sources.map((s) => s.sourceType))],
    completeSections,
    partialSections,
    emptySections,
    overallCompleteness,
  };
}

// ── Public entrypoint ───────────────────────────────────────────────────────────

/**
 * Drafts a full Module 3 from extracted/uploaded CMC documents by mapping them
 * to canonical sources and delegating to the existing composer. Returns the
 * drafted sections plus a coverage/gap summary.
 *
 * Pure and deterministic — safe to call from a route handler or a background
 * job. Does not persist anything; the route layer is responsible for governance
 * and persistence (which it already does via `bridgeCompileToArtifact`).
 */
export function autoDraftModule3(documents: ExtractedCmcDocument[]): AutoDraftResult {
  const { sources, unmapped } = buildCanonicalSourcesFromExtractedDocuments(documents);
  const sections = composeModule3FromCanonicalSources(sources);
  const coverage = summarizeCoverage(sections, sources, unmapped);
  return { sections, coverage };
}
