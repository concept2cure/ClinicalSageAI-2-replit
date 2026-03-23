/**
 * Industry Segment Context
 *
 * Provides client segment awareness throughout the workspace UI.
 * Every feature adapts its available templates, submission types,
 * pathway suggestions, and document structures based on segment.
 *
 * Segments: pharma, biotech, medtech (medical device), diagnostics,
 *           cro, academic, regulatory, medical_writing
 *
 * The segment is read from the user's tenant profile (industryMode field)
 * and can be overridden per-project.
 */
import React, { createContext, useContext, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IndustrySegment =
  | 'pharma'
  | 'biotech'
  | 'medtech'
  | 'diagnostics'
  | 'cro'
  | 'academic'
  | 'regulatory'
  | 'medical_writing';

export type SubmissionType =
  | 'IND'
  | 'NDA'
  | 'ANDA'
  | '505B2'
  | 'BLA'
  | '510K'
  | 'PMA'
  | 'DE_NOVO'
  | 'CER'
  | 'MAA'
  | 'IVDR'
  | 'EUA'
  | 'IMPD'
  | 'CTA';

export type DocumentCategory =
  | 'ectd'          // eCTD Modules 1-5
  | '510k'          // 510(k) sections
  | 'pma'           // PMA sections
  | 'estar'         // FDA eSTAR
  | 'cer'           // EU MDR Clinical Evaluation Report
  | 'ivdr'          // EU IVDR Technical File
  | 'csr'           // Clinical Study Report (ICH E3)
  | 'protocol'      // Study Protocol
  | 'sap'           // Statistical Analysis Plan
  | 'ib'            // Investigator's Brochure
  | 'cmc'           // Chemistry Manufacturing Controls
  | 'sop'           // Standard Operating Procedures
  | 'fda-form';     // FDA Forms (3514, 3601, etc.)

export interface SegmentConfig {
  segment: IndustrySegment;
  label: string;
  submissionTypes: SubmissionType[];
  primaryDocCategories: DocumentCategory[];
  defaultSubmissionType: SubmissionType;
  defaultTemplateId: string;
  pathwayDefault: 'FDA' | 'EMA' | 'PMDA' | 'Health Canada';
  /** Which workspace tab should be the default landing */
  defaultAuthorTab: string;
}

export interface IndustryContextValue {
  segment: IndustrySegment;
  config: SegmentConfig;
  /** Check if a submission type is relevant for current segment */
  isRelevant: (type: SubmissionType) => boolean;
  /** Check if a document category is relevant for current segment */
  isDocRelevant: (category: DocumentCategory) => boolean;
  /** Get the segment-appropriate label for a generic concept */
  label: (concept: 'submission' | 'dossier' | 'predicate' | 'pathway') => string;
}

// ---------------------------------------------------------------------------
// Segment configurations
// ---------------------------------------------------------------------------

const SEGMENT_CONFIGS: Record<IndustrySegment, SegmentConfig> = {
  pharma: {
    segment: 'pharma',
    label: 'Pharmaceutical',
    submissionTypes: ['IND', 'NDA', 'ANDA', '505B2', 'BLA', 'MAA', 'CTA', 'IMPD'],
    primaryDocCategories: ['ectd', 'csr', 'protocol', 'sap', 'ib', 'cmc', 'sop', 'fda-form'],
    defaultSubmissionType: 'IND',
    defaultTemplateId: 'ind-full',
    pathwayDefault: 'FDA',
    defaultAuthorTab: 'ind-workspace',
  },
  biotech: {
    segment: 'biotech',
    label: 'Biotechnology',
    submissionTypes: ['IND', 'BLA', 'MAA', 'CTA', 'EUA'],
    primaryDocCategories: ['ectd', 'csr', 'protocol', 'sap', 'ib', 'cmc', 'sop', 'fda-form'],
    defaultSubmissionType: 'IND',
    defaultTemplateId: 'ind-full',
    pathwayDefault: 'FDA',
    defaultAuthorTab: 'ind-workspace',
  },
  medtech: {
    segment: 'medtech',
    label: 'Medical Device',
    submissionTypes: ['510K', 'PMA', 'DE_NOVO', 'CER', 'EUA'],
    primaryDocCategories: ['510k', 'pma', 'estar', 'cer', 'sop', 'fda-form'],
    defaultSubmissionType: '510K',
    defaultTemplateId: 'fda-510k',
    pathwayDefault: 'FDA',
    defaultAuthorTab: 'ind-workspace', // routes to 510k dossier view
  },
  diagnostics: {
    segment: 'diagnostics',
    label: 'Diagnostics & IVD',
    submissionTypes: ['510K', 'PMA', 'DE_NOVO', 'IVDR', 'CER', 'EUA'],
    primaryDocCategories: ['510k', 'pma', 'estar', 'ivdr', 'cer', 'sop', 'fda-form'],
    defaultSubmissionType: '510K',
    defaultTemplateId: 'fda-510k',
    pathwayDefault: 'FDA',
    defaultAuthorTab: 'ind-workspace',
  },
  cro: {
    segment: 'cro',
    label: 'Contract Research',
    submissionTypes: ['IND', 'NDA', 'ANDA', '505B2', 'BLA', '510K', 'PMA', 'DE_NOVO', 'CER', 'MAA'],
    primaryDocCategories: ['ectd', '510k', 'pma', 'csr', 'protocol', 'sap', 'cer', 'sop'],
    defaultSubmissionType: 'IND',
    defaultTemplateId: 'ind-full',
    pathwayDefault: 'FDA',
    defaultAuthorTab: 'ind-workspace',
  },
  academic: {
    segment: 'academic',
    label: 'Academic Research',
    submissionTypes: ['IND', 'CTA'],
    primaryDocCategories: ['protocol', 'sap', 'ib', 'csr', 'sop'],
    defaultSubmissionType: 'IND',
    defaultTemplateId: 'ind-full',
    pathwayDefault: 'FDA',
    defaultAuthorTab: 'clinical-trial',
  },
  regulatory: {
    segment: 'regulatory',
    label: 'Regulatory Affairs',
    submissionTypes: ['IND', 'NDA', 'ANDA', '505B2', 'BLA', '510K', 'PMA', 'DE_NOVO', 'CER', 'MAA', 'IVDR'],
    primaryDocCategories: ['ectd', '510k', 'pma', 'estar', 'cer', 'ivdr', 'csr', 'protocol', 'sap', 'ib', 'cmc', 'sop', 'fda-form'],
    defaultSubmissionType: 'IND',
    defaultTemplateId: 'ind-full',
    pathwayDefault: 'FDA',
    defaultAuthorTab: 'ind-workspace',
  },
  medical_writing: {
    segment: 'medical_writing',
    label: 'Medical Writing',
    submissionTypes: ['IND', 'NDA', 'ANDA', '505B2', 'BLA', '510K', 'PMA', 'DE_NOVO', 'CER', 'MAA'],
    primaryDocCategories: ['ectd', '510k', 'pma', 'cer', 'csr', 'protocol', 'sap', 'ib', 'sop'],
    defaultSubmissionType: 'IND',
    defaultTemplateId: 'ind-full',
    pathwayDefault: 'FDA',
    defaultAuthorTab: 'ectd-coauthor',
  },
};

// Segment-specific labels for generic regulatory concepts
const SEGMENT_LABELS: Record<IndustrySegment, Record<string, string>> = {
  pharma: { submission: 'Application', dossier: 'eCTD Dossier', predicate: 'Reference Product', pathway: 'Regulatory Pathway' },
  biotech: { submission: 'Application', dossier: 'eCTD Dossier', predicate: 'Reference Product', pathway: 'Regulatory Pathway' },
  medtech: { submission: 'Submission', dossier: 'Technical File', predicate: 'Predicate Device', pathway: 'Device Pathway' },
  diagnostics: { submission: 'Submission', dossier: 'Technical File', predicate: 'Predicate Device', pathway: 'Device Pathway' },
  cro: { submission: 'Application', dossier: 'Dossier', predicate: 'Reference', pathway: 'Regulatory Pathway' },
  academic: { submission: 'Application', dossier: 'Filing Package', predicate: 'Reference', pathway: 'Regulatory Pathway' },
  regulatory: { submission: 'Application', dossier: 'Dossier', predicate: 'Reference', pathway: 'Regulatory Pathway' },
  medical_writing: { submission: 'Document', dossier: 'Document Package', predicate: 'Reference', pathway: 'Regulatory Pathway' },
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const IndustryContext = createContext<IndustryContextValue | null>(null);

export function IndustryProvider({
  segment = 'biotech',
  children,
}: {
  segment?: IndustrySegment;
  children: React.ReactNode;
}) {
  const value = useMemo<IndustryContextValue>(() => {
    const config = SEGMENT_CONFIGS[segment] || SEGMENT_CONFIGS.biotech;
    const labels = SEGMENT_LABELS[segment] || SEGMENT_LABELS.biotech;
    const submissionSet = new Set(config.submissionTypes);
    const docSet = new Set(config.primaryDocCategories);

    return {
      segment,
      config,
      isRelevant: (type: SubmissionType) => submissionSet.has(type),
      isDocRelevant: (category: DocumentCategory) => docSet.has(category),
      label: (concept: string) => labels[concept] || concept,
    };
  }, [segment]);

  return (
    <IndustryContext.Provider value={value}>
      {children}
    </IndustryContext.Provider>
  );
}

export function useIndustry(): IndustryContextValue {
  const ctx = useContext(IndustryContext);
  if (!ctx) {
    // Sensible default if used outside provider
    const config = SEGMENT_CONFIGS.biotech;
    return {
      segment: 'biotech',
      config,
      isRelevant: () => true,
      isDocRelevant: () => true,
      label: (concept) => SEGMENT_LABELS.biotech[concept] || concept,
    };
  }
  return ctx;
}

export default IndustryContext;
