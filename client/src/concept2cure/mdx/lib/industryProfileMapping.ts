/**
 * industryProfileMapping — pure translation between the Admin Setup
 * client-type picker vocabulary and the governed org industry profile
 * (organization_industry_profiles.primary_industry / mdx_specialization,
 * served by GET/PATCH /api/mdx/industry-profile).
 *
 * The picker predates the governed enum and speaks in market-facing
 * shorthand (`medtech`, `pharma`, …) while the profile row uses the
 * canonical CONTEXT-01 taxonomy. The mapping is deliberately lossy in
 * two places, and this module owns both:
 *
 *   - `medtech` and `diagnostics` share primary_industry
 *     `medical_device_diagnostics` and are told apart by
 *     mdx_specialization (`medical_device` vs `ivd_diagnostics`).
 *   - `biotech` and `pharma` both map to `biotech_pharma`; the round
 *     trip canonicalizes to `biotech`, so callers hydrating the picker
 *     from the profile should keep the local chip when it already maps
 *     to the same governed pair (see pickerMatchesProfile).
 *
 * Kept pure (no React, no fetch) so it is unit-testable in isolation.
 */

export const PRIMARY_INDUSTRIES = [
  'medical_device_diagnostics',
  'biotech_pharma',
  'cro',
  'regulatory_consulting',
  'academic_research',
] as const;
export type PrimaryIndustry = (typeof PRIMARY_INDUSTRIES)[number];

export const MDX_SPECIALIZATIONS = [
  'medical_device',
  'ivd_diagnostics',
  'both',
  'samd',
  'companion_diagnostic',
  'combination_product',
] as const;
export type MdxSpecialization = (typeof MDX_SPECIALIZATIONS)[number];

/** Chip vocabulary the Setup surface renders. `consulting` exists so the
 *  governed `regulatory_consulting` value has a chip to light up; without
 *  it a consulting org's saved profile would render as nothing selected. */
export const CLIENT_TYPE_OPTIONS = [
  'medtech',
  'biotech',
  'pharma',
  'diagnostics',
  'cro',
  'consulting',
  'health',
] as const;
export type ClientTypeOption = (typeof CLIENT_TYPE_OPTIONS)[number];

export interface GovernedIndustryPair {
  primaryIndustry: PrimaryIndustry;
  /** null = the picker chip implies no device/IVD specialization. */
  mdxSpecialization: MdxSpecialization | null;
}

const PICKER_TO_GOVERNED: Record<ClientTypeOption, GovernedIndustryPair> = {
  medtech: { primaryIndustry: 'medical_device_diagnostics', mdxSpecialization: 'medical_device' },
  diagnostics: { primaryIndustry: 'medical_device_diagnostics', mdxSpecialization: 'ivd_diagnostics' },
  biotech: { primaryIndustry: 'biotech_pharma', mdxSpecialization: null },
  pharma: { primaryIndustry: 'biotech_pharma', mdxSpecialization: null },
  cro: { primaryIndustry: 'cro', mdxSpecialization: null },
  consulting: { primaryIndustry: 'regulatory_consulting', mdxSpecialization: null },
  // Health systems / academic medical centers — closest governed bucket.
  health: { primaryIndustry: 'academic_research', mdxSpecialization: null },
};

/** Picker chip → governed (primary_industry, mdx_specialization) pair.
 *  Returns null for values outside the picker vocabulary (e.g. a stale
 *  localStorage blob from an older build). */
export function pickerToGoverned(picker: string): GovernedIndustryPair | null {
  return (PICKER_TO_GOVERNED as Record<string, GovernedIndustryPair>)[picker] ?? null;
}

/** Governed pair → canonical picker chip. Every primary_industry value
 *  resolves to a chip; within medical_device_diagnostics the
 *  specialization decides device vs IVD (any non-IVD specialization —
 *  samd, combination_product, … — renders as `medtech`). */
export function governedToPicker(
  primaryIndustry: PrimaryIndustry,
  mdxSpecialization?: MdxSpecialization | null,
): ClientTypeOption {
  switch (primaryIndustry) {
    case 'medical_device_diagnostics':
      return mdxSpecialization === 'ivd_diagnostics' ? 'diagnostics' : 'medtech';
    case 'biotech_pharma':
      return 'biotech';
    case 'cro':
      return 'cro';
    case 'regulatory_consulting':
      return 'consulting';
    case 'academic_research':
      return 'health';
  }
}

/**
 * True when a picker chip already denotes the same governed pair, so a
 * hydrating surface should keep the local chip rather than overwrite it.
 * Preserves the `pharma` vs `biotech` nuance (both are `biotech_pharma`)
 * while still honoring the governed device-vs-IVD distinction.
 */
export function pickerMatchesProfile(
  picker: string,
  primaryIndustry: PrimaryIndustry,
  mdxSpecialization?: MdxSpecialization | null,
): boolean {
  const g = pickerToGoverned(picker);
  if (!g || g.primaryIndustry !== primaryIndustry) return false;
  if (primaryIndustry === 'medical_device_diagnostics') {
    return governedToPicker(primaryIndustry, mdxSpecialization) === picker;
  }
  return true;
}

/**
 * Build the PATCH body for a chip click.
 *
 * Sends mdx_specialization alongside primary_industry, except when the
 * profile already carries a finer device specialization (samd,
 * companion_diagnostic, combination_product) that renders as the same
 * chip — clicking `medtech` then must not coarsen `samd` back to
 * `medical_device`. Switching away from the device industry clears the
 * specialization (null) so a biotech org never keeps a device flag.
 *
 * @param picker      The chip the admin clicked.
 * @param currentSpec The profile's current mdx_specialization, if known.
 * @returns PATCH body, or null when the picker value is unmappable.
 */
export function buildOrgProfilePatch(
  picker: string,
  currentSpec?: MdxSpecialization | null,
): { primaryIndustry: PrimaryIndustry; mdxSpecialization?: MdxSpecialization | null } | null {
  const g = pickerToGoverned(picker);
  if (!g) return null;
  if (
    g.primaryIndustry === 'medical_device_diagnostics' &&
    currentSpec != null &&
    governedToPicker(g.primaryIndustry, currentSpec) === picker
  ) {
    return { primaryIndustry: g.primaryIndustry };
  }
  return { primaryIndustry: g.primaryIndustry, mdxSpecialization: g.mdxSpecialization };
}
