/**
 * useWorkspaceSuggestedActions — Extracted from ZenApp.tsx (Stage 10)
 *
 * Context-aware quick-start chips for AnA. Returns up to 4 actions
 * based on the active project type and workspace summary.
 */
import { useMemo } from 'react';

interface SuggestedAction {
  id: string;
  label: string;
  intent: string;
  description: string;
}

interface WorkspaceSummaryShape {
  nextActions?: SuggestedAction[];
}

const BIOSTATS_ACTION: SuggestedAction = {
  id: 'open-ana-biostats',
  label: 'Open AnA Biostats',
  intent: 'go-biostatistics',
  description: 'Run SAP-grade biostatistics analysis and governed document generation.',
};

const STARTERS: Record<string, SuggestedAction[]> = {
  '510K': [
    {
      id: 'upload-device-docs',
      label: 'Upload device documents',
      intent: 'upload-source-documents',
      description: 'Add device specs, test results, and labeling.',
    },
    {
      id: 'find-predicates',
      label: 'Find likely predicates',
      intent: 'find-likely-510k-predicates',
      description: 'Search FDA for substantially equivalent devices.',
    },
    {
      id: 'draft-device-desc',
      label: 'Draft device description',
      intent: 'draft-510k-device-description',
      description: 'Generate Section 3 device description.',
    },
    {
      id: 'check-estar',
      label: 'Check eSTAR readiness',
      intent: 'check-estar-readiness',
      description: 'Review eSTAR template requirements.',
    },
  ],
  IND: [
    {
      id: 'upload-source',
      label: 'Upload source documents',
      intent: 'upload-source-documents',
      description: 'Add CSRs, CMC data, and preclinical files.',
    },
    {
      id: 'draft-ind-outline',
      label: 'Draft IND outline',
      intent: 'draft-ind-outline',
      description: 'Generate IND outline per 21 CFR 312.23.',
    },
    {
      id: 'missing-sections',
      label: 'Identify missing sections',
      intent: 'identify-missing-ind-sections',
      description: 'Audit your IND for incomplete sections.',
    },
    {
      id: 'gen-cmc-workplan',
      label: 'Generate CMC workplan',
      intent: 'generate-cmc-workplan',
      description: 'Build Module 3 CMC workplan and timeline.',
    },
  ],
  CER: [
    {
      id: 'upload-evidence',
      label: 'Upload evidence & literature',
      intent: 'upload-source-documents',
      description: 'Add clinical literature and PMS data.',
    },
    {
      id: 'build-cer-outline',
      label: 'Build CER outline',
      intent: 'build-cer-outline',
      description: 'Structure CER sections per MEDDEV 2.7/1 Rev 4.',
    },
    {
      id: 'draft-benefit-risk',
      label: 'Draft benefit-risk section',
      intent: 'draft-cer-benefit-risk',
      description: 'Generate the benefit-risk analysis.',
    },
    {
      id: 'review-pms-pmcf',
      label: 'Review PMS / PMCF gaps',
      intent: 'review-pms-pmcf-gaps',
      description: 'Identify post-market surveillance gaps.',
    },
  ],
  NDA: [
    {
      id: 'upload-source',
      label: 'Upload source documents',
      intent: 'upload-source-documents',
      description: 'Add CSRs, CMC data, and prior filings.',
    },
    {
      id: 'draft-nda-outline',
      label: 'Draft NDA outline',
      intent: 'draft-nda-outline',
      description: 'Generate NDA outline per 21 CFR 314.',
    },
    {
      id: 'nda-missing',
      label: 'Identify missing sections',
      intent: 'identify-missing-nda-sections',
      description: 'Audit NDA for gaps and missing modules.',
    },
    {
      id: 'gen-summary',
      label: 'Generate ISS/ISE outline',
      intent: 'generate-iss-ise-outline',
      description: 'Outline Integrated Summary of Safety/Efficacy.',
    },
  ],
};

export function useWorkspaceSuggestedActions(
  projectType: string | undefined,
  workspaceSummary: WorkspaceSummaryShape | undefined
): SuggestedAction[] {
  return useMemo(() => {
    const base = workspaceSummary?.nextActions ?? [];
    if (base.length > 0) {
      const withBiostats = base.some(action => action.intent === 'go-biostatistics')
        ? base
        : [BIOSTATS_ACTION, ...base];
      return withBiostats.slice(0, 4);
    }

    const t = (projectType || 'IND').toUpperCase();
    const fallback = STARTERS[t] ?? STARTERS['IND'];
    return fallback.some(action => action.intent === 'go-biostatistics')
      ? fallback.slice(0, 4)
      : [BIOSTATS_ACTION, ...fallback].slice(0, 4);
  }, [projectType, workspaceSummary?.nextActions]);
}
