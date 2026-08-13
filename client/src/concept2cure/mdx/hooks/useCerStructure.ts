/**
 * useCerStructure — the canonical CER structure (MEDDEV 2.7/1 Rev 4 / MDR
 * Annex XIV Part A) and its deterministic gap assessment, consuming
 * server/routes/submissions.ts:
 *
 *   GET  /api/submissions/device/cer/structure   canonical stages + sections
 *   POST /api/submissions/device/cer/assess      { presentSectionIds } → gaps
 *
 * The client's only judgment call is mapping the program's live section
 * labels onto canonical section ids (matchPresentSectionIds). The matcher is
 * deterministic keyword matching, exported and unit-tested; a section that
 * does not match simply stays a gap — the check under-credits before it ever
 * over-credits, so the verdict is honest by construction.
 */

import { buildAuthHeaders, useFetchJson } from './useFetchJson';

export interface CerCanonSection {
  id: string;
  number: string;
  title: string;
  purpose: string;
  required: boolean;
  requiresClinicalData: boolean;
  equivalenceOnly?: boolean;
  reviewerQuestions: string[];
}

export interface CerCanonStage {
  stage: number;
  id: string;
  title: string;
  purpose: string;
  output: string;
}

interface StructurePayload {
  stages: CerCanonStage[];
  sections: CerCanonSection[];
}

export interface UseCerStructureResult {
  sections: CerCanonSection[] | null;
  stages: CerCanonStage[] | null;
  loading: boolean;
  error: string | null;
}

export function useCerStructure(): UseCerStructureResult {
  const { data, loading, error } = useFetchJson<StructurePayload>(
    '/api/submissions/device/cer/structure',
  );
  return {
    sections: data?.sections ?? null,
    stages: data?.stages ?? null,
    loading,
    error,
  };
}

/** The live-section shape the matcher needs (the kit's EstarRow subset). */
export interface LiveSectionRow {
  label: string;
  status: string;
  blocker?: boolean;
}

/**
 * Keyword map from canonical CER section id → substrings that identify it in
 * a live section label. Deterministic and deliberately narrow: a miss means
 * the section counts as absent (a gap), never the other way round.
 */
const CANON_KEYWORDS: Record<string, string[]> = {
  summary: ['summary of the clinical evaluation', 'cer summary'],
  scope: ['scope'],
  clinical_background: ['state of the art', 'state-of-the-art', 'clinical background', 'current knowledge'],
  device_description: ['device description', 'device under evaluation'],
  equivalence: ['equivalence'],
  clinical_data: ['clinical data'],
  appraisal: ['appraisal'],
  analysis: ['analysis of the clinical data', 'risk-benefit', 'benefit-risk', 'safety and risk'],
  pmcf: ['pmcf', 'post-market clinical follow', 'post-market surveillance'],
  conclusions: ['conclusion'],
  evaluator_qualification: ['evaluator', 'qualification'],
  references: ['references', 'appendices'],
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** A live row counts as authored only when it actually carries content. */
export function isAuthoredRow(row: LiveSectionRow): boolean {
  if (row.blocker) return false;
  return row.status === 'complete' || row.status === 'review' || row.status === 'draft';
}

/**
 * Pure: map authored live section labels onto canonical CER section ids.
 * Matching is exact-id, exact-title, or documented keyword containment —
 * anything else is a non-match and stays a gap.
 */
export function matchPresentSectionIds(
  liveRows: LiveSectionRow[],
  canonSections: CerCanonSection[],
): string[] {
  const present = new Set<string>();
  const authored = liveRows.filter(isAuthoredRow).map((r) => norm(r.label));
  if (authored.length === 0) return [];

  for (const canon of canonSections) {
    const canonId = norm(canon.id.replace(/_/g, ' '));
    const canonTitle = norm(canon.title);
    const keywords = CANON_KEYWORDS[canon.id] ?? [];
    const hit = authored.some(
      (label) =>
        label === canonId ||
        label === canonTitle ||
        keywords.some((kw) => label.includes(norm(kw))),
    );
    if (hit) present.add(canon.id);
  }
  return [...present];
}

export interface CerStructureAssessment {
  ready: boolean;
  missingRequiredSections: string[];
  sectionsNeedingClinicalData: string[];
  presentCount: number;
  totalRequired: number;
  equivalenceAddressed: boolean;
}

/**
 * POST the present-section set for the server's deterministic verdict.
 * Returns null when the request itself failed — never a fabricated pass.
 */
export async function assessCerStructure(
  presentSectionIds: string[],
  equivalenceClaimed: boolean,
): Promise<CerStructureAssessment | null> {
  try {
    const res = await fetch('/api/submissions/device/cer/assess', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...buildAuthHeaders() },
      body: JSON.stringify({ presentSectionIds, equivalenceClaimed }),
    });
    if (!res.ok) return null;
    return (await res.json()) as CerStructureAssessment;
  } catch {
    return null;
  }
}
