/**
 * Medical-writing self-review — standards-conformance QC for AnA.
 *
 * The complement to medical-writing.ts (how to write): given a document type and
 * optionally a draft, it checks the draft's section coverage against the
 * governing structure and emits a conformance checklist (structure / key
 * requirements / pitfalls). This is what an elite medical writer does before
 * handoff — QC against ICH E3 / MDR / ICMJE structure rather than vibes.
 *
 * Deterministic and dependency-free; reuses the medical-writing knowledge base.
 *
 * @module server/services/ana/medical-writing-review
 */

import { getDocumentTypeStandard, listMedicalWritingCatalog } from './medical-writing.js';

export interface SectionCoverage {
  section: string;
  present: boolean;
}

export interface ChecklistItem {
  category: 'structure' | 'requirement' | 'pitfall';
  item: string;
  status: 'present' | 'missing' | 'review';
}

export interface MedicalWritingReview {
  documentType: string | null;
  label: string | null;
  governingStandards: string[];
  /** Present only when a draft was supplied. */
  structureCoverage?: SectionCoverage[];
  missingSections?: string[];
  checklist: ChecklistItem[];
  readiness: string;
  availableDocumentTypes?: string[];
}

/** Tokenize a section heading to its salient words for loose matching. */
function sectionKeywords(section: string): string[] {
  return (section.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []).filter(
    w => !['with', 'from', 'into', 'over', 'overview', 'study', 'data', 'list'].includes(w)
  );
}

/**
 * Heuristic: a section is considered present if a salient keyword from its
 * heading appears in the draft text. Conservative — meant to catch obviously
 * missing sections, not to grade prose.
 */
function detectSection(section: string, haystack: string): boolean {
  const kws = sectionKeywords(section);
  if (kws.length === 0) return false;
  return kws.some(k => haystack.includes(k));
}

/**
 * Build a standards-conformance review for a document type. When `draftText` is
 * supplied, structure coverage is assessed against it; otherwise structure items
 * are returned as 'review' (writer to confirm). Never throws.
 */
export function reviewMedicalWriting(documentType: string, draftText?: string): MedicalWritingReview {
  const doc = getDocumentTypeStandard(documentType);
  if (!doc) {
    return {
      documentType: null,
      label: null,
      governingStandards: [],
      checklist: [],
      readiness: 'Unknown document type — cannot review against a standard.',
      availableDocumentTypes: listMedicalWritingCatalog().documentTypes.map(d => d.id),
    };
  }

  const haystack = (draftText ?? '').toLowerCase();
  const hasDraft = haystack.trim().length > 0;
  const checklist: ChecklistItem[] = [];

  let structureCoverage: SectionCoverage[] | undefined;
  let missingSections: string[] | undefined;

  if (hasDraft) {
    structureCoverage = doc.structure.map(section => ({
      section,
      present: detectSection(section, haystack),
    }));
    missingSections = structureCoverage.filter(s => !s.present).map(s => s.section);
    for (const s of structureCoverage) {
      checklist.push({
        category: 'structure',
        item: `Section present: ${s.section}`,
        status: s.present ? 'present' : 'missing',
      });
    }
  } else {
    for (const section of doc.structure) {
      checklist.push({ category: 'structure', item: `Include section: ${section}`, status: 'review' });
    }
  }

  for (const req of doc.keyRequirements) {
    checklist.push({ category: 'requirement', item: req, status: 'review' });
  }
  for (const pit of doc.commonPitfalls) {
    checklist.push({ category: 'pitfall', item: `Avoid: ${pit}`, status: 'review' });
  }

  let readiness: string;
  if (!hasDraft) {
    readiness = `Pre-draft checklist for ${doc.label} (${doc.governingStandards.join('; ')}). Confirm each item as you write.`;
  } else if (missingSections && missingSections.length > 0) {
    readiness =
      `NOT READY: ${missingSections.length} expected section(s) appear missing — ${missingSections.join(', ')}. ` +
      `Also self-verify the requirement and pitfall items before handoff.`;
  } else {
    readiness =
      `Structure complete against ${doc.governingStandards.join('; ')}. ` +
      `Now self-verify each requirement (traceability, consistency, even-handed benefit–risk) and pitfall item.`;
  }

  return {
    documentType: doc.id,
    label: doc.label,
    governingStandards: doc.governingStandards,
    structureCoverage,
    missingSections,
    checklist,
    readiness,
  };
}
