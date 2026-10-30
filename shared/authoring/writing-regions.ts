/** Writing preferences for the canonical regional agencies.
 * A mapped label says nothing about indexed requirements or filing readiness. */
import { canonicalRegionOf, listCanonicalRegions, toAgency, type CanonicalRegion } from '../regulatory/region-identity';

const FIRST_REGIONS = ['US', 'CA', 'EU', 'JP'] as const;
const FIRST_REGION_SET = new Set<string>(FIRST_REGIONS);
export const WRITING_REGIONS: readonly CanonicalRegion[] = [...FIRST_REGIONS,
  ...listCanonicalRegions().filter(region => !FIRST_REGION_SET.has(region))];
export type WritingRegion = CanonicalRegion;
export type WritingAgency = 'FDA' | 'Health Canada' | 'EMA' | 'PMDA' | 'MHRA' | 'NMPA' | 'MFDS'
  | 'TGA' | 'Swissmedic' | 'ANVISA' | 'CDSCO' | 'HSA';
export type DraftingRegionState = 'recorded' | 'not-recorded' | 'global' | 'unavailable';
export interface SectionDraftingRegion {
  draftingRegion: WritingAgency | null;
  draftingRegionState: DraftingRegionState;
}
/** Historical assembly labels; each resolves into the canonical region identity. */
const WRITING_ALIASES: Partial<Record<string, WritingRegion>> = {
  HC: 'CA', CANADA: 'CA', HEALTHCANADA: 'CA', JAPAN: 'JP', EMEA: 'EU',
};

/** No default jurisdiction; GLOBAL and unsupported values stay unresolved. */
export function writingAgencyOf(value: unknown): WritingAgency | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, '_');
  const region = canonicalRegionOf(normalized) ?? WRITING_ALIASES[normalized.toUpperCase().replace(/[_-]/g, '')];
  if (!region || !WRITING_REGIONS.some(supported => supported === region)) return null;
  return String(toAgency(region)).replace(/_/g, ' ') as WritingAgency;
}

export const WRITING_AGENCIES: readonly WritingAgency[] = WRITING_REGIONS.map(region => writingAgencyOf(region)!);
