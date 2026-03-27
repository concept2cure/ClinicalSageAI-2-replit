export interface MedicalWritingChecklistDomain {
  required_sections: string[];
  required_quality_controls: string[];
}

export interface MedicalWritingChecklist {
  domains: Record<string, MedicalWritingChecklistDomain>;
}

export interface MedicalWritingCoverageSummary {
  domainCount: number;
  totalRequiredSections: number;
  totalRequiredControls: number;
}

export function summarizeMedicalWritingChecklist(
  checklist: MedicalWritingChecklist
): MedicalWritingCoverageSummary {
  const domains = checklist.domains || {};

  let totalRequiredSections = 0;
  let totalRequiredControls = 0;

  for (const config of Object.values(domains)) {
    totalRequiredSections += Array.isArray(config.required_sections)
      ? config.required_sections.length
      : 0;
    totalRequiredControls += Array.isArray(config.required_quality_controls)
      ? config.required_quality_controls.length
      : 0;
  }

  return {
    domainCount: Object.keys(domains).length,
    totalRequiredSections,
    totalRequiredControls,
  };
}
