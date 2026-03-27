export interface MedicalWritingChecklist {
  requiredSections: string[];
  requiredQualityFlags: string[];
  forbiddenPatterns: string[];
}

export interface MedicalWritingAssessment {
  sectionCoverage: number;
  forbiddenPatternHits: string[];
  passed: boolean;
}

export function assessMedicalWritingDraft(
  draft: string,
  checklist: MedicalWritingChecklist
): MedicalWritingAssessment {
  const text = draft.toLowerCase();

  const required = checklist.requiredSections || [];
  const covered = required.filter(section => text.includes(section.toLowerCase())).length;
  const sectionCoverage = required.length > 0 ? covered / required.length : 0;

  const forbiddenPatternHits = (checklist.forbiddenPatterns || []).filter(pattern =>
    text.includes(pattern.toLowerCase())
  );

  const passed = sectionCoverage >= 0.85 && forbiddenPatternHits.length === 0;

  return {
    sectionCoverage,
    forbiddenPatternHits,
    passed,
  };
}
