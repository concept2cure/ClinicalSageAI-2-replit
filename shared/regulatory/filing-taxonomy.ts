/**
 * Filing Taxonomy — Segment / Category structure for the regulatory document
 * system. This is the SECOND organizing axis of the registry (the first being
 * region/agency, see region-profiles.ts).
 *
 * Extends the Concept2Cure "Regulatory Filing & Document Taxonomy" reference
 * (4 segments · 18 categories) with three categories absorbed from the retired
 * client-side registry mirror during the BP-W1-2 catalog unification:
 * device_clinical, ivd_market_auth_intl, regulatory_intelligence.
 *
 *   Pharma & Biotech      → preclinical_pre_ind, investigational,
 *                            marketing_authorization, post_approval_lifecycle,
 *                            cmc_quality
 *   Medical Devices       → device_classification_pre_sub, device_market_auth_us,
 *                            device_market_auth_eu_intl, device_clinical,
 *                            device_post_market, device_samd_ai
 *   Diagnostics & IVD     → ivd_classification_pre_sub, ivd_market_auth_us,
 *                            ivd_companion_dx, ivd_market_auth_eu,
 *                            ivd_market_auth_intl, ivd_post_market
 *   Cross-Cutting         → ctd_ectd, qms, safety_pv, regulatory_intelligence
 *
 * Segment/category counts are always DERIVED from the registry
 * (getTaxonomyTree / getCountBySegment) — never hardcoded in a surface.
 *
 * @module shared/regulatory/filing-taxonomy
 */

import type {
  Segment,
  FilingCategory,
  SegmentMetadata,
  FilingCategoryMetadata,
  RegulatoryApplicationType,
} from './document-taxonomy';
import { GLOBAL_REGISTRY } from './global-document-registry';

// ─── Segment Metadata ─────────────────────────────────────────────────────────

export const SEGMENT_METADATA: SegmentMetadata[] = [
  {
    id: 'pharma_biotech',
    title: 'Pharma & Biotech',
    subtitle: 'Small Molecules, Biologics, Biosimilars, Gene & Cell Therapy',
    order: 1,
    iconHint: 'pill',
  },
  {
    id: 'medical_devices',
    title: 'Medical Devices',
    subtitle: 'Class I–III Devices, Combination Products, SaMD/AIaMD',
    order: 2,
    iconHint: 'cpu',
  },
  {
    id: 'diagnostics_ivd',
    title: 'Diagnostics & IVD',
    subtitle: 'In Vitro Diagnostics, Companion Diagnostics (CDx), Laboratory Developed Tests (LDTs)',
    order: 3,
    iconHint: 'microscope',
  },
  {
    id: 'cross_cutting',
    title: 'Cross-Cutting Documents',
    subtitle: 'ICH-Harmonized, Quality System, and Multi-Segment Filings',
    order: 4,
    iconHint: 'layers',
  },
];

// ─── Category Metadata ────────────────────────────────────────────────────────

export const FILING_CATEGORY_METADATA: FilingCategoryMetadata[] = [
  // ── Pharma & Biotech ──
  {
    id: 'preclinical_pre_ind',
    segment: 'pharma_biotech',
    title: 'Preclinical / Pre-IND',
    description: 'Nonclinical development, regulatory strategy, and agency interactions before first-in-human dosing',
    order: 1,
  },
  {
    id: 'investigational',
    segment: 'pharma_biotech',
    title: 'Investigational (Clinical Development)',
    description: 'Authorization to conduct clinical trials in humans, from Phase I through Phase III',
    order: 2,
  },
  {
    id: 'marketing_authorization',
    segment: 'pharma_biotech',
    title: 'Marketing Authorization (Registration)',
    description: 'Applications to bring a drug to market — the pivotal regulatory filings',
    order: 3,
  },
  {
    id: 'post_approval_lifecycle',
    segment: 'pharma_biotech',
    title: 'Post-Approval Lifecycle',
    description: 'Maintenance, supplements, variations, and ongoing safety reporting after market authorization',
    order: 4,
  },
  {
    id: 'cmc_quality',
    segment: 'pharma_biotech',
    title: 'CMC / Quality (Module 3)',
    description: 'Chemistry, Manufacturing, and Controls — the quality dossier components',
    order: 5,
  },

  // ── Medical Devices ──
  {
    id: 'device_classification_pre_sub',
    segment: 'medical_devices',
    title: 'Classification & Pre-Submission',
    description: 'Device classification determination and FDA pre-submission interactions',
    order: 1,
  },
  {
    id: 'device_market_auth_us',
    segment: 'medical_devices',
    title: 'Market Authorization (US FDA)',
    description: 'FDA submissions to legally market a medical device in the United States',
    order: 2,
  },
  {
    id: 'device_market_auth_eu_intl',
    segment: 'medical_devices',
    title: 'Market Authorization (EU / International)',
    description: 'European and international medical device regulatory filings',
    order: 3,
  },
  {
    id: 'device_clinical',
    segment: 'medical_devices',
    title: 'Device Clinical Investigations',
    description: 'Applications and plans for clinical investigations of medical devices (IDE-class trials, EU MDR investigations, ISO 14155 plans)',
    order: 4,
  },
  {
    id: 'device_post_market',
    segment: 'medical_devices',
    title: 'Post-Market & Lifecycle',
    description: 'Ongoing regulatory obligations after device market authorization',
    order: 5,
  },
  {
    id: 'device_samd_ai',
    segment: 'medical_devices',
    title: 'Software as Medical Device (SaMD) / AI',
    description: 'Regulatory filings specific to software-based and AI/ML-enabled medical devices',
    order: 6,
  },

  // ── Diagnostics & IVD ──
  {
    id: 'ivd_classification_pre_sub',
    segment: 'diagnostics_ivd',
    title: 'Classification & Pre-Submission',
    description: 'IVD-specific classification and pre-market interactions',
    order: 1,
  },
  {
    id: 'ivd_market_auth_us',
    segment: 'diagnostics_ivd',
    title: 'Market Authorization (US FDA)',
    description: 'FDA pathways for IVD devices',
    order: 2,
  },
  {
    id: 'ivd_companion_dx',
    segment: 'diagnostics_ivd',
    title: 'Companion Diagnostics (CDx)',
    description: 'Regulatory filings for diagnostics co-developed with therapeutic products',
    order: 3,
  },
  {
    id: 'ivd_market_auth_eu',
    segment: 'diagnostics_ivd',
    title: 'Market Authorization (EU IVDR)',
    description: 'European IVD Regulation (EU 2017/746) filings and documentation',
    order: 4,
  },
  {
    id: 'ivd_market_auth_intl',
    segment: 'diagnostics_ivd',
    title: 'Market Authorization (International IVD)',
    description: 'Ex-US/EU IVD registrations and licences (PMDA, NMPA, TGA, Health Canada)',
    order: 5,
  },
  {
    id: 'ivd_post_market',
    segment: 'diagnostics_ivd',
    title: 'Post-Market & Lifecycle (IVD)',
    description: 'Ongoing regulatory obligations specific to IVD products',
    order: 6,
  },

  // ── Cross-Cutting ──
  {
    id: 'ctd_ectd',
    segment: 'cross_cutting',
    title: 'ICH Common Technical Document (CTD/eCTD)',
    description: 'The universal dossier structure used by all major regulatory authorities',
    order: 1,
  },
  {
    id: 'qms',
    segment: 'cross_cutting',
    title: 'Quality Management System (QMS)',
    description: 'Quality system documentation required across all product types',
    order: 2,
  },
  {
    id: 'safety_pv',
    segment: 'cross_cutting',
    title: 'Safety & Pharmacovigilance (Global)',
    description: 'Global pharmacovigilance and safety reporting obligations',
    order: 3,
  },
  {
    id: 'regulatory_intelligence',
    segment: 'cross_cutting',
    title: 'Regulatory Intelligence & Strategy',
    description: 'Strategy documents, gap analyses, competitive landscape, and health-authority meeting records — governed work products rather than agency submissions',
    order: 4,
  },
];

// ─── Lookups ──────────────────────────────────────────────────────────────────

export function getSegmentMetadata(segment: Segment): SegmentMetadata | undefined {
  return SEGMENT_METADATA.find(s => s.id === segment);
}

export function getCategoryMetadata(category: FilingCategory): FilingCategoryMetadata | undefined {
  return FILING_CATEGORY_METADATA.find(c => c.id === category);
}

export function getCategoriesForSegment(segment: Segment): FilingCategoryMetadata[] {
  return FILING_CATEGORY_METADATA
    .filter(c => c.segment === segment)
    .sort((a, b) => a.order - b.order);
}

export function getSegmentsSorted(): SegmentMetadata[] {
  return [...SEGMENT_METADATA].sort((a, b) => a.order - b.order);
}

// ─── Tree builder ─────────────────────────────────────────────────────────────

export interface TaxonomyCategoryNode extends FilingCategoryMetadata {
  filings: RegulatoryApplicationType[];
  filingCount: number;
}

export interface TaxonomySegmentNode extends SegmentMetadata {
  categories: TaxonomyCategoryNode[];
  filingCount: number;
}

/**
 * Build the full segment → category → filings tree, in document order. Only
 * active, taxonomy-classified entries are included. Pass a registry slice to
 * scope the tree (defaults to the entire global registry).
 */
export function getTaxonomyTree(
  registry: RegulatoryApplicationType[] = GLOBAL_REGISTRY,
): TaxonomySegmentNode[] {
  const active = registry.filter(e => e.active && e.segment && e.category);

  return getSegmentsSorted().map(seg => {
    const categories = getCategoriesForSegment(seg.id).map(cat => {
      const filings = active.filter(e => e.category === cat.id);
      return { ...cat, filings, filingCount: filings.length };
    });
    return {
      ...seg,
      categories,
      filingCount: categories.reduce((sum, c) => sum + c.filingCount, 0),
    };
  });
}

/** Count of taxonomy-classified active filings per segment. */
export function getCountBySegment(
  registry: RegulatoryApplicationType[] = GLOBAL_REGISTRY,
): Record<Segment, number> {
  const counts = {} as Record<Segment, number>;
  for (const seg of SEGMENT_METADATA) counts[seg.id] = 0;
  for (const e of registry) {
    if (e.active && e.segment) counts[e.segment] = (counts[e.segment] || 0) + 1;
  }
  return counts;
}
