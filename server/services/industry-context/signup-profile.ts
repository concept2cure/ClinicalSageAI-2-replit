/**
 * Signup → organization industry profile derivation (CONTEXT correction).
 *
 * Pure mapping helpers that turn the coarse signup signals (the legacy
 * organizations.industry_mode enum plus the ZenSignup use-case selection)
 * into the governed organization_industry_profiles vocabulary consumed by
 * the effective-context resolver (./resolver.ts). Kept pure and exported so
 * the signup route stays thin and the mappings are unit-testable without a
 * database.
 */

import type { PrimaryIndustry } from './resolver';

/**
 * organizations.industry_mode → organization_industry_profiles.primary_industry.
 * Unknown or legacy modes (e.g. 'medical_writing') fall through to
 * biotech_pharma, matching the resolver's biopharma-first defaults.
 */
export function primaryIndustryForIndustryMode(
  industryMode: string | null | undefined,
): PrimaryIndustry {
  switch (industryMode) {
    case 'medtech':
      return 'medical_device_diagnostics';
    case 'pharma':
    case 'biotech':
      return 'biotech_pharma';
    case 'cro':
      return 'cro';
    case 'regulatory':
      return 'regulatory_consulting';
    case 'academic':
      return 'academic_research';
    default:
      return 'biotech_pharma';
  }
}

/**
 * Signup use-case values (ZenSignup USE_CASES) → default regulatory pathways.
 * Only pathway-shaped use cases map; workflow-shaped ones (cmc, ectd,
 * multiple) contribute nothing rather than guessing.
 */
const USE_CASE_TO_PATHWAY: Record<string, string> = {
  '510k': '510k',
  pma: 'pma',
  ind: 'ind',
  nda: 'nda',
  // Clinical Evaluation Reports are an EU MDR obligation.
  cer: 'eu_mdr',
};

/** Derive default_pathways from the signup's use-case selection. */
export function pathwaysForUseCases(useCases: string[] | null | undefined): string[] {
  if (!Array.isArray(useCases)) return [];
  const pathways = useCases
    .map(uc => USE_CASE_TO_PATHWAY[uc])
    .filter((p): p is string => Boolean(p));
  return Array.from(new Set(pathways));
}
