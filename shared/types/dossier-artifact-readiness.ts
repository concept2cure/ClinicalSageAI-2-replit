/** Artifact-stage evidence, separate from governed document-section readiness. */
export interface ArtifactSectionReadiness {
  ctdSection: string;
  artifactCount: number;
  draftCount: number;
  reviewCount: number;
  approvedCount: number;
  lockedCount: number;
  unknownCount: number;
  status: 'draft' | 'review' | 'approved' | 'locked' | 'not_assessed';
  lastUpdated: string | null;
}

export interface ArtifactReadinessSummary {
  totalSections: number;
  readySections: number;
  inProgressSections: number;
  draftSections: number;
  notAssessedSections: number;
}

export type ArtifactReadiness =
  | {
      basis: 'governed_artifacts';
      state: 'measured' | 'no_artifacts';
      sections: ArtifactSectionReadiness[];
      summary: ArtifactReadinessSummary;
    }
  | {
      basis: 'governed_artifacts';
      state: 'unavailable' | 'unanchored';
      reason: string;
      sections: null;
      summary: null;
    };

/** The weakest supported recorded stage; unknown artifacts prevent assessment. */
export function artifactSectionStateOf(counts: Pick<ArtifactSectionReadiness,
  'draftCount' | 'reviewCount' | 'approvedCount' | 'lockedCount' | 'unknownCount'>): ArtifactSectionReadiness['status'] {
  if (counts.unknownCount > 0) return 'not_assessed';
  if (counts.draftCount > 0) return 'draft';
  if (counts.reviewCount > 0) return 'review';
  if (counts.approvedCount > 0) return 'approved';
  if (counts.lockedCount > 0) return 'locked';
  return 'not_assessed';
}

/** Count only classified sections in each stage; never infer a percentage. */
export function artifactReadinessSummaryOf(sections: readonly Pick<ArtifactSectionReadiness, 'status'>[]): ArtifactReadinessSummary {
  return {
    totalSections: sections.length,
    readySections: sections.filter(s => s.status === 'approved' || s.status === 'locked').length,
    inProgressSections: sections.filter(s => s.status === 'review').length,
    draftSections: sections.filter(s => s.status === 'draft').length,
    notAssessedSections: sections.filter(s => s.status === 'not_assessed').length,
  };
}
