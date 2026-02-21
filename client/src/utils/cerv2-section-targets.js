/**
 * CERV2 Section Targets — Phase 9 P1
 *
 * Word count targets, required elements, and section status definitions
 * for all three doc types. Used by:
 *  - Outline panel (section-level progress)
 *  - Export preview (word count targets)
 *  - Compliance engine (required elements check)
 */

/** Section status lifecycle */
export const SECTION_STATUS = {
  EMPTY: 'empty',
  DRAFT: 'draft',
  REVIEW: 'review',
  COMPLETE: 'complete',
};

export const STATUS_CONFIG = {
  [SECTION_STATUS.EMPTY]: {
    label: 'Empty',
    dot: 'bg-border',
    text: 'text-muted-foreground/50',
  },
  [SECTION_STATUS.DRAFT]: {
    label: 'Draft',
    dot: 'bg-amber-400',
    text: 'text-amber-600 dark:text-amber-400',
  },
  [SECTION_STATUS.REVIEW]: {
    label: 'In Review',
    dot: 'bg-blue-400',
    text: 'text-blue-600 dark:text-blue-400',
  },
  [SECTION_STATUS.COMPLETE]: {
    label: 'Complete',
    dot: 'bg-primary',
    text: 'text-primary',
  },
};

/**
 * Word count targets per section per doc type.
 * `min` = minimum expected for a thorough submission.
 * `target` = recommended target for a strong submission.
 */
export const SECTION_TARGETS = {
  cerv2_510k: {
    cover_letter: {
      min: 150,
      target: 300,
      requiredElements: ['device name', 'predicate', 'k-number', 'intended use'],
    },
    admin: {
      min: 100,
      target: 250,
      requiredElements: ['submitter', 'contact', 'establishment registration'],
    },
    ifu: {
      min: 200,
      target: 500,
      requiredElements: ['intended use', 'target population', 'contraindications'],
    },
    summary: {
      min: 500,
      target: 1500,
      requiredElements: [
        'device description',
        'intended use',
        'predicate comparison',
        'substantial equivalence',
      ],
    },
    desc: {
      min: 300,
      target: 800,
      requiredElements: ['components', 'materials', 'dimensions', 'operating principle'],
    },
    pred: {
      min: 300,
      target: 700,
      requiredElements: ['predicate device', 'k-number', 'manufacturer', 'comparison table'],
    },
    se: {
      min: 800,
      target: 2000,
      requiredElements: [
        'intended use comparison',
        'technological characteristics',
        'performance data',
        'conclusion',
      ],
    },
    testing: {
      min: 500,
      target: 1500,
      requiredElements: ['test standards', 'biocompatibility', 'performance results'],
    },
    labeling: { min: 200, target: 500, requiredElements: ['IFU', 'warnings', 'precautions'] },
    concl: {
      min: 150,
      target: 400,
      requiredElements: ['substantial equivalence determination', 'predicate reference'],
    },
  },
  cerv2_pma: {
    summary: {
      min: 500,
      target: 1500,
      requiredElements: ['device description', 'indications', 'classification', 'regulation'],
    },
    nonclin: {
      min: 800,
      target: 2500,
      requiredElements: [
        'bench testing',
        'biocompatibility',
        'electrical safety',
        'EMC',
        'software V&V',
      ],
    },
    clin: {
      min: 1500,
      target: 5000,
      requiredElements: [
        'study design',
        'enrollment',
        'primary endpoint',
        'safety data',
        'effectiveness data',
      ],
    },
    mfgqa: {
      min: 500,
      target: 1200,
      requiredElements: ['facility', 'ISO 13485', 'QSR compliance', 'supplier management'],
    },
    labeling: {
      min: 300,
      target: 800,
      requiredElements: ['physician manual', 'patient manual', 'warnings'],
    },
    risk: {
      min: 500,
      target: 1500,
      requiredElements: ['benefits', 'risks', 'benefit-risk determination'],
    },
    pms: {
      min: 300,
      target: 800,
      requiredElements: ['post-approval study', 'reporting timeline', 'endpoints'],
    },
  },
  cerv2_cer: {
    sota: {
      min: 800,
      target: 2500,
      requiredElements: ['current clinical knowledge', 'available alternatives', 'unmet need'],
    },
    device: {
      min: 400,
      target: 1000,
      requiredElements: ['device description', 'intended purpose', 'MDR classification'],
    },
    dataset: {
      min: 1000,
      target: 3000,
      requiredElements: ['search protocol', 'databases', 'inclusion/exclusion criteria', 'PRISMA'],
    },
    appraisal: {
      min: 500,
      target: 1500,
      requiredElements: ['appraisal criteria', 'scientific validity', 'relevance'],
    },
    benefitrisk: {
      min: 800,
      target: 2000,
      requiredElements: ['clinical benefits', 'residual risks', 'benefit-risk ratio'],
    },
    gspr: {
      min: 500,
      target: 1500,
      requiredElements: ['GSPR mapping', 'compliance status', 'evidence references'],
    },
    pms: {
      min: 500,
      target: 1200,
      requiredElements: ['PMS plan', 'PMCF plan', 'MDR Articles 83-86'],
    },
    concl: {
      min: 300,
      target: 700,
      requiredElements: ['overall conclusion', 'GSPR conformity', 'evaluator qualification'],
    },
  },
};

/**
 * Get target for a section. Returns { min, target, requiredElements } or defaults.
 */
export function getSectionTarget(docType, sectionId) {
  return (
    SECTION_TARGETS[docType]?.[sectionId] || {
      min: 100,
      target: 500,
      requiredElements: [],
    }
  );
}

/**
 * Compute section status from doc type, section ID, and content.
 * Internally computes word count and checks against section targets.
 *
 * @param {string} docType — cerv2_510k | cerv2_pma | cerv2_cer
 * @param {string} sectionId — outline section ID
 * @param {string} content — combined section text
 * @returns {string} — SECTION_STATUS value
 */
export function computeSectionStatus(docType, sectionId, content) {
  if (!content || typeof content !== 'string') return SECTION_STATUS.EMPTY;
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return SECTION_STATUS.EMPTY;

  const target = getSectionTarget(docType, sectionId);
  if (words < target.min) return SECTION_STATUS.DRAFT;
  if (words >= target.target) return SECTION_STATUS.COMPLETE;
  return SECTION_STATUS.DRAFT;
}
