/**
 * Read-side projection of a governed proposed-CMC-change row into the Lifecycle
 * surface's "CMC change control" card shape, enriched by the deterministic
 * SUPAC/variations classifier (`classifyVariation`).
 *
 * The card shows a risk band, the FDA reporting category (Annual Report / CBE-0 /
 * CBE-30 / PAS), the EMA variation type, the SUPAC tier, and the controlling
 * citation — all COMPUTED from the change's structured attributes, never a
 * fabricated verdict. Pure — no DB, no LLM.
 *
 * @module server/services/cmc/cmc-change-view
 */
import {
  classifyVariation,
  type VariationInput,
  type FdaReportingCategory,
  type DosageFormFamily,
  type ChangeCategory,
  type ScaleChangeFactor,
  type ExcipientLevelChange,
  type SiteChangeKind,
  type ProcessChangeKind,
} from './supac-classifier';

/** A governed proposed-change row (the c2c_cmc_changes column shape). */
export interface CmcChangeRow {
  title: string;
  area: string | null;
  programs: string | null;
  status: string;
  dosage_form_family: string;
  change_category: string;
  scale_change_factor: string | null;
  excipient_level_change: string | null;
  site_change_kind: string | null;
  process_change_kind: string | null;
  touches_critical_step: boolean | null;
  affects: string | null;
  has_comparability_data: boolean | null;
  description: string | null;
}

export type CmcRisk = 'high' | 'medium' | 'low';

export interface CmcChangeView {
  title: string;
  area: string;
  programs: string;
  status: string;
  risk: CmcRisk;
  fdaCategory: FdaReportingCategory;
  emaCategory: string;
  supacTier: string;
  citation: string;
}

/**
 * Risk band from the FDA reporting category — a filing-burden proxy: a Prior
 * Approval Supplement (approval required before implementation) is the highest
 * burden/risk; CBE-30 waits 30 days; CBE-0/annual report/no-filing are low.
 */
export function riskFromReportingCategory(cat: FdaReportingCategory): CmcRisk {
  switch (cat) {
    case 'pas':
      return 'high';
    case 'cbe_30':
      return 'medium';
    case 'cbe_0':
    case 'annual_report':
    case 'no_filing':
    default:
      return 'low';
  }
}

/** Build the classifier input from the stored row, coercing enum-typed columns. */
function toVariationInput(row: CmcChangeRow): VariationInput {
  return {
    dosageFormFamily: row.dosage_form_family as DosageFormFamily,
    changeCategory: row.change_category as ChangeCategory,
    description: row.description ?? undefined,
    scaleChangeFactor: (row.scale_change_factor as ScaleChangeFactor | null) ?? undefined,
    excipientLevelChange: (row.excipient_level_change as ExcipientLevelChange | null) ?? undefined,
    siteChangeKind: (row.site_change_kind as SiteChangeKind | null) ?? undefined,
    processChangeKind: (row.process_change_kind as ProcessChangeKind | null) ?? undefined,
    touchesCriticalStep: row.touches_critical_step ?? undefined,
    affects: (row.affects as VariationInput['affects']) ?? undefined,
    hasComparabilityData: row.has_comparability_data ?? undefined,
  };
}

/** Project one governed change row through the classifier into the card view. */
export function projectCmcChange(row: CmcChangeRow): CmcChangeView {
  const c = classifyVariation(toVariationInput(row));
  return {
    title: row.title,
    area: row.area ?? '—',
    programs: row.programs ?? '—',
    status: row.status,
    risk: riskFromReportingCategory(c.fdaReportingCategory),
    fdaCategory: c.fdaReportingCategory,
    emaCategory: c.emaVariationCategory,
    supacTier: c.supacTier,
    citation: c.citations[0] ?? '',
  };
}

/** Project a set of change rows, highest-risk first (then by title, stable). */
export function projectCmcChanges(rows: CmcChangeRow[]): CmcChangeView[] {
  const order: Record<CmcRisk, number> = { high: 0, medium: 1, low: 2 };
  return rows
    .map(projectCmcChange)
    .sort((a, b) => order[a.risk] - order[b.risk] || a.title.localeCompare(b.title));
}
