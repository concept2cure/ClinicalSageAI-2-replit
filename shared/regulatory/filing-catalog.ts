/**
 * Filing Catalog — the ONE client-facing view of the Global Document Registry.
 *
 * BP-W1-2 background: the product answered "how many filing types do you
 * support" three ways — `shared/regulatory/global-document-registry.ts` (the
 * canonical registry), a hand-maintained tuple mirror in the client
 * (`RegistryBridge.tsx`), and a third fixture behind the Filings catalog page
 * (`filings-catalog-data.ts`). The two mirrors drifted from the canon and from
 * each other, including on corrected regulatory metadata (an Investigator's
 * Brochure still filed in M5 on two of the three).
 *
 * This module is the unification: every surface — the project wizard's
 * RegistryPicker, the Filings catalog, and anything else that lists filing
 * types — derives from `GLOBAL_REGISTRY` through here. There is no second
 * table. Counts are always computed, never written down.
 *
 * ── Identifier contract ──────────────────────────────────────────────────────
 * Client-visible ids are `lowercase(canonical id)` — e.g. `US_IND` → `us_ind`.
 * The retired mirror had its own id space (`fda_510k`, `investigator_brochure`,
 * `pediatric_plan`, …) which is preserved in LEGACY_FILING_ID_ALIASES so every
 * previously persisted selection, deep link, or stored submissionTypeId keeps
 * resolving. Aliases whose rows were deliberately COLLAPSED (e.g. the mirror's
 * `fda_510k_special` / `fda_510k_abbrev`, which the canonical 510(k) entry
 * already describes as its own sub-types) resolve to the surviving entry.
 *
 * @module shared/regulatory/filing-catalog
 */

import { GLOBAL_REGISTRY } from './global-document-registry';
import type { RegulatoryApplicationType, Agency, Segment, FilingCategory } from './document-taxonomy';
import {
  SEGMENT_METADATA,
  FILING_CATEGORY_METADATA,
  getCategoriesForSegment,
  getSegmentsSorted,
} from './filing-taxonomy';

// ─── Display labels ───────────────────────────────────────────────────────────

/** Agency → the label a customer reads (underscores are storage, not copy). */
export const AGENCY_LABEL: Record<Agency, string> = {
  FDA: 'FDA',
  EMA: 'EMA',
  MHRA: 'MHRA',
  Health_Canada: 'Health Canada',
  PMDA: 'PMDA',
  NMPA: 'NMPA',
  TGA: 'TGA',
  Swissmedic: 'Swissmedic',
  ANVISA: 'ANVISA',
  CDSCO: 'CDSCO',
  MFDS: 'MFDS',
  HSA: 'HSA',
  ICH: 'ICH / Global',
  ISO: 'ISO',
  IEC: 'IEC',
  IMDRF: 'IMDRF',
  EDQM: 'EDQM',
  National_Competent_Authority: 'National competent authority',
  Notified_Body: 'EU / Notified Body',
};

// ─── Wizard pathway keys ──────────────────────────────────────────────────────

/**
 * Client id → scaffolding pathway key (see `pathwayKey` on the registry entry
 * type). Load-bearing for the project wizard: `programTypeFor` reads it to
 * decide which document class scaffolds — and, deliberately, which filings fail
 * closed with NO_RULE_PACK rather than being mis-filed as a US NDA. Values are
 * carried over 1:1 from the retired mirror's tuples. An entry-level
 * `pathwayKey` in the registry wins over this map.
 */
const PATHWAY_BY_ID: Record<string, string> = {
  us_pre_ind: 'ind', us_ind: 'ind',
  eu_cta: 'cta', au_ctn: 'cta', ca_cta: 'cta', jp_ctn: 'cta', cn_cta: 'cta',
  us_nda: 'ctd', us_bla: 'bla', eu_maa: 'maa', jp_mkt_approval: 'jnda',
  us_nda_supp: 'ctd', us_bla_supp: 'bla',
  us_dmf: 'dmf', us_anda: 'anda', us_505b2: '505b2', us_351k: 'biosimilar',
  ich_csr: 'csr', ich_clin_overview: 'ctd',
  us_513g: 'device', us_qsub: 'device', us_breakthrough_device: 'device', us_rfd: 'device',
  eu_nb_consult: 'device',
  us_510k: '510k', us_de_novo: 'denovo', us_pma: 'pma', us_hde: 'device', us_eua: 'device',
  eu_mdr_techdoc: 'mdr', eu_mdr_class_i: 'mdr', eu_mdr_class_iia: 'mdr', eu_mdr_class_iib: 'mdr', eu_mdr_class_iii: 'mdr',
  eu_sscp: 'device', eu_doc: 'device',
  uk_device_reg: 'device', jp_shonin: 'device', jp_nintei: 'device', cn_device_reg: 'device',
  au_device_inclusion: 'device', ca_mdl: 'device', ch_device_conformity: 'device', br_device_reg: 'device',
  eu_sig_change: 'mdr', eu_fsca: 'device', us_ide: 'ide',
  us_mdr_report: 'device', eu_psur_device: 'device', eu_pmcf: 'cer', us_recall: 'device',
  us_dhf: 'device', iso_rmf: 'device',
  us_samd_presub: 'device', us_pccp: 'device', iec_62304: 'device', us_cybersecurity: 'device',
  eu_mir: 'device', eu_trend_report_device: 'device',
  eu_clin_investigation: 'mdr', iso_cip: 'device', eu_cer: 'cer',
  eu_ivdr: 'ivdr', eu_ivdr_class_a: 'ivdr', eu_ivdr_class_b: 'ivdr', eu_ivdr_class_cd: 'ivdr',
  eu_ivdr_classification: 'ivd', us_ivd_qsub: 'ivd', us_clia_waiver: 'ivd',
  us_eua_ivd: 'ivd', us_ldt: 'ivd', us_complementary_dx: 'ivd',
  eu_cdx_ivdr_d: 'ivdr', jp_cdx: 'ivd', us_cdx_codev: 'ivd',
  eu_per: 'ivd', eu_perf_study: 'ivdr', eu_ref_lab: 'ivd', eu_sscp_ivd: 'ivd',
  eu_ivd_clin_evidence: 'ivd', eu_pmpf: 'ivdr', eu_ivd_reeval: 'ivd',
  us_ivd_analytical_validation: 'ivd', jp_ivd_approval: 'ivd', cn_ivd_reg: 'ivd',
  au_ivd_inclusion: 'ivd', ca_ivd_licence: 'ivd',
  eu_ivd_pms_plan: 'ivdr', us_trend_report: 'ivd', eu_ivd_vigilance: 'ivd', eu_psur_ivd: 'ivd',
  // Explicit even where an id substring would currently route correctly — the
  // wizard treats a MISSING key as 'ctd' → 'nda', so a rename must never be
  // one substring away from scaffolding a US marketing dossier for a device.
  us_pma_supp: 'pma', us_510k_mod: '510k', us_pma_annual: 'pma',
  us_510k_ivd: '510k', us_pma_ivd: 'pma', us_de_novo_ivd: 'denovo',
  us_cdx_pma: 'pma', us_cdx_510k: '510k', us_device_reg: 'ivd',
};

// ─── Legacy id aliases ────────────────────────────────────────────────────────

/**
 * Retired-mirror id → current client id. Complete over the mirror's id space:
 * every id it ever exported resolves here (asserted by test). Collapsed rows
 * are annotated.
 */
export const LEGACY_FILING_ID_ALIASES: Record<string, string> = {
  pre_ind: 'us_pre_ind', scientific_advice: 'eu_scientific_advice',
  type_a_meeting: 'us_type_a_meeting', type_b_meeting: 'us_type_b_meeting', type_c_meeting: 'us_type_c_meeting',
  pre_sub_hc: 'ca_presub_meeting', pre_consult_pmda: 'jp_pre_consult', pre_sub_tga: 'au_presub_meeting',
  ctn_au: 'au_ctn', cta_hc: 'ca_cta', ctn_jp: 'jp_ctn', cta_nmpa: 'cn_cta',
  ind_safety: 'us_ind_sr', ind_annual: 'us_ind_annual', dsur: 'ich_dsur',
  protocol_amend: 'ich_protocol', investigator_brochure: 'ich_ib', informed_consent: 'ich_icf',
  jp_jnda: 'jp_mkt_approval', cn_nda: 'cn_maa', au_reg: 'au_cat1', uk_maa: 'uk_ma',
  ch_maa: 'ch_ma', br_reg: 'br_ma', kr_nda: 'kr_ma_new',
  accel_approval: 'us_accel_approval', conditional_ma: 'eu_cma', rolling_sub: 'us_rolling',
  // The mirror carried the combined "PSP / PIP" row BP-W1-3 splits: the legacy
  // id resolves to the FDA PSP; the EMA PIP is its own entry (eu_pip).
  pediatric_plan: 'us_psp',
  // Collapsed: "Prior Approval Supplement" and "Supplemental NDA" were two
  // rows for the one 21 CFR 314.70(b) filing type.
  prior_approval_suppl: 'us_nda_supp', snda: 'us_nda_supp', sbla: 'us_bla_supp',
  cbe30: 'us_cbe', cbe0: 'us_cbe',
  annual_report_nda: 'us_nda_annual',
  type_ia_var: 'eu_variation_ia', type_ib_var: 'eu_variation_ib', type_ii_var: 'eu_variation_ii',
  supac: 'us_supac', renewal_eu: 'eu_renewal', line_ext: 'eu_line_extension',
  mod_32s: 'ich_m3_ds', mod_32p: 'ich_m3_dp', qos_23: 'ich_qos',
  comparability: 'ich_comparability', env_assess: 'us_ea', dmf: 'us_dmf', asmf: 'eu_asmf',
  cep: 'eu_cep', gmp_cert: 'eu_gmp_cert', stability_protocol: 'ich_stability_protocol',
  btd: 'us_btd', fast_track: 'us_fast_track', odd_fda: 'us_orphan', odd_ema: 'eu_orphan',
  prime: 'eu_prime', rmat: 'us_rmat', sakigake: 'jp_sakigake',
  priority_review: 'us_priority_review', accel_assess: 'eu_accel_assess', ilap: 'uk_ilap',
  psur_pbrer: 'eu_psur', rems: 'us_rems', rmp: 'eu_rmp', pmr_pmc: 'us_pmr',
  icsr_15day: 'us_icsr_15day', pader: 'us_pader',
  eudravigilance: 'eu_eudravigilance_icsr', susar_report: 'ich_susar', signal_detect: 'ich_signal',
  csr: 'ich_csr', sap: 'ich_sap',
  // Collapsed: the mirror listed "Clinical Protocol" and "Protocol & Protocol
  // Amendments" as two rows for one document type.
  clin_protocol: 'ich_protocol',
  clin_overview: 'ich_clin_overview', clin_summary: 'ich_clin_summary',
  nonclin_overview: 'ich_nonclin_overview', nonclin_summary: 'ich_nonclin_summary',
  tabulated_sum: 'ich_tabulated_summaries',
  anda: 'us_anda', biosim_351k: 'us_351k', biosim_eu: 'eu_biosimilar_maa',
  biosim_pmda: 'jp_biosimilar', biosim_tga: 'au_biosimilar', generic_eu: 'eu_generic_dcp',
  ands_hc: 'ca_ands',
  class_513g: 'us_513g', pre_sub_qsub: 'us_qsub', breakthrough_dev: 'us_breakthrough_device',
  rfd_ocp: 'us_rfd', dev_nb_consult: 'eu_nb_consult',
  fda_510k: 'us_510k', fda_de_novo: 'us_de_novo', fda_pma: 'us_pma', fda_hde: 'us_hde',
  // Collapsed: Special / Abbreviated 510(k) are sub-types the canonical
  // US_510K entry names in its own description.
  fda_510k_special: 'us_510k', fda_510k_abbrev: 'us_510k',
  eu_mdr_i: 'eu_mdr_class_i', eu_mdr_iia: 'eu_mdr_class_iia',
  eu_mdr_iib: 'eu_mdr_class_iib', eu_mdr_iii: 'eu_mdr_class_iii',
  uk_ukca: 'uk_device_reg',
  pmda_shonin: 'jp_shonin', pmda_nintei: 'jp_nintei', nmpa_device: 'cn_device_reg',
  tga_device: 'au_device_inclusion', hc_mdl: 'ca_mdl', ch_device: 'ch_device_conformity',
  br_device: 'br_device_reg',
  pma_suppl: 'us_pma_supp', dev_510k_mod: 'us_510k_mod', dev_fsc: 'eu_fsca',
  eu_clin_inv: 'eu_clin_investigation', cip_iso: 'iso_cip', cer: 'eu_cer',
  ivd_510k: 'us_510k_ivd', ivd_de_novo: 'us_de_novo_ivd', ivd_pma: 'us_pma_ivd',
  eu_ivdr_a: 'eu_ivdr_class_a', eu_ivdr_b: 'eu_ivdr_class_b', eu_ivdr_cd: 'eu_ivdr_class_cd',
  cdx_pma: 'us_cdx_pma', cdx_ivdr_d: 'eu_cdx_ivdr_d', cdx_pmda: 'jp_cdx', cdx_codev: 'us_cdx_codev',
  ivdr_perf_study: 'eu_perf_study', ivd_clin_evidence: 'eu_ivd_clin_evidence',
  ivdr_pmpf: 'eu_pmpf', ivd_anal_val: 'us_ivd_analytical_validation',
  pmda_ivd: 'jp_ivd_approval', nmpa_ivd: 'cn_ivd_reg', tga_ivd: 'au_ivd_inclusion', hc_ivd: 'ca_ivd_licence',
  ivd_pms_plan: 'eu_ivd_pms_plan', ivd_trend: 'us_trend_report', ivd_vigilance: 'eu_ivd_vigilance',
  ectd_backbone: 'ich_ectd_backbone',
  ctd_m1_us: 'us_ctd_m1_regional', ctd_m1_eu: 'eu_ctd_m1_regional', ctd_m1_jp: 'jp_ctd_m1_regional',
  nees: 'eu_nees',
  gmp_inspect: 'qms_gmp_inspection', gcp_compliance: 'qms_gcp_compliance',
  glp_compliance: 'qms_glp_compliance', qsr_820: 'qms_qsr_820', iso_13485: 'qms_iso_13485',
  reg_strategy: 'ri_strategy', gap_analysis: 'ri_gap_analysis',
  competitive_intel: 'ri_competitive', ha_meeting: 'ri_ha_meeting',
};

// ─── The derived catalog ──────────────────────────────────────────────────────

export interface FilingCatalogEntry {
  /** Client id: lowercase canonical registry id. */
  id: string;
  /** Canonical registry id (`GLOBAL_REGISTRY` key), for server round-trips. */
  registryId: string;
  displayName: string;
  /** Display label, not the storage enum (Health Canada, not Health_Canada). */
  agency: string;
  region: string;
  segment: string;
  category: string;
  dossierStandard: string;
  ctdModule: string;
  submissionFormat: string;
  description: string;
  /** Named specification behind ctdModule, when traced (BP-W1-4). */
  moduleAuthority: string | null;
  pathwayKey: string | null;
}

function toCatalogEntry(e: RegulatoryApplicationType): FilingCatalogEntry {
  const id = e.id.toLowerCase();
  return {
    id,
    registryId: e.id,
    displayName: e.displayName,
    agency: AGENCY_LABEL[e.agency] ?? String(e.agency),
    region: e.region,
    segment: e.segment ?? 'cross_cutting',
    category: e.category ?? 'ctd_ectd',
    dossierStandard: e.dossierStandard === 'none' ? '—' : e.dossierStandard,
    ctdModule: e.ctdModule ?? '—',
    submissionFormat: !e.submissionFormat || e.submissionFormat === 'none' ? '—' : e.submissionFormat,
    description: e.description ?? '',
    moduleAuthority: e.moduleAuthority ?? null,
    pathwayKey: e.pathwayKey ?? PATHWAY_BY_ID[id] ?? null,
  };
}

/** Every active registry entry, in registry order. THE catalog. */
export const FILING_CATALOG: FilingCatalogEntry[] = GLOBAL_REGISTRY.filter((e) => e.active).map(toCatalogEntry);

const CATALOG_INDEX: Record<string, FilingCatalogEntry> = {};
for (const e of FILING_CATALOG) CATALOG_INDEX[e.id] = e;

// ─── Derived counts and grouping ──────────────────────────────────────────────

/** Segment id → derived entry count. Never hardcode these. */
export function filingCountBySegment(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of SEGMENT_METADATA) counts[s.id] = 0;
  for (const e of FILING_CATALOG) counts[e.segment] = (counts[e.segment] ?? 0) + 1;
  return counts;
}

export function filingCatalogTotal(): number {
  return FILING_CATALOG.length;
}

export interface FilingCatalogCategoryNode {
  id: FilingCategory;
  title: string;
  description: string;
  entries: FilingCatalogEntry[];
}

export interface FilingCatalogSegmentNode {
  id: Segment;
  title: string;
  subtitle: string;
  iconHint: string;
  categories: FilingCatalogCategoryNode[];
  count: number;
}

/** Segment → category → entries, in taxonomy order. Both surfaces render this. */
export function filingCatalogTree(): FilingCatalogSegmentNode[] {
  return getSegmentsSorted().map((seg) => {
    const categories = getCategoriesForSegment(seg.id)
      .map((cat) => ({
        id: cat.id,
        title: cat.title,
        description: cat.description,
        entries: FILING_CATALOG.filter((e) => e.segment === seg.id && e.category === cat.id),
      }))
      .filter((c) => c.entries.length > 0);
    return {
      id: seg.id,
      title: seg.title,
      subtitle: seg.subtitle,
      iconHint: seg.iconHint,
      categories,
      count: categories.reduce((n, c) => n + c.entries.length, 0),
    };
  });
}

// ─── Resolution ───────────────────────────────────────────────────────────────

/** Resolve any client id, legacy mirror id, or canonical id to a catalog entry. */
export function resolveFilingCatalogEntry(input?: string | null): FilingCatalogEntry | null {
  if (!input) return null;
  const direct = CATALOG_INDEX[input] ?? CATALOG_INDEX[input.toLowerCase()];
  if (direct) return direct;
  const alias = LEGACY_FILING_ID_ALIASES[input] ?? LEGACY_FILING_ID_ALIASES[input.toLowerCase()];
  if (alias && CATALOG_INDEX[alias]) return CATALOG_INDEX[alias];
  return null;
}

// ─── Filings-catalog workflow codes ───────────────────────────────────────────

/**
 * The Filings catalog labels each row with a coarse execution-workflow code
 * (`FILING_WF_LABEL` / `FILING_LOOP_ARCHETYPE` in the client keep their
 * meanings). Derived from the entry, with explicit overrides where the family
 * rule is too coarse.
 */
const WF_OVERRIDES: Record<string, string> = {
  us_anda: 'ANDA', ca_ands: 'ANDA', eu_generic_dcp: 'ANDA',
  us_505b2: '505b2',
  us_351k: 'biosimilar', eu_biosimilar_maa: 'biosimilar', jp_biosimilar: 'biosimilar', au_biosimilar: 'biosimilar',
  us_hde: 'HDE', us_ide: 'IDE', us_eua: 'eua', us_eua_ivd: 'eua', us_ldt: 'ldt',
  eu_cer: 'CER', eu_mdr_techdoc: 'CER', eu_pmcf: 'CER', eu_sscp: 'CER',
  us_cdx_pma: 'PMA', us_cdx_510k: '510k',
};

export function filingWfCode(e: FilingCatalogEntry): string {
  const o = WF_OVERRIDES[e.id];
  if (o) return o;
  const pharma = e.segment === 'pharma_biotech';
  const ivd = e.segment === 'diagnostics_ivd';
  const reg = GLOBAL_REGISTRY.find((r) => r.id === e.registryId);
  const family = reg?.applicationFamily ?? 'clinical_document';
  switch (family) {
    case 'clinical_trial':
      return pharma ? 'IND' : ivd ? 'IVDR' : 'IDE';
    case 'marketing_authorization':
      if (!pharma) return e.region === 'US' ? '510k' : 'intldevice';
      if (e.region === 'US') return (reg?.productClass ?? []).includes('biologic') ? 'BLA' : 'NDA';
      return 'MAA';
    case 'supplement':
    case 'variation':
    case 'renewal':
      return pharma ? (e.region === 'US' ? 'NDA' : 'MAA') : 'pmdevice';
    case 'safety_report':
      return e.segment === 'cross_cutting' ? 'pv' : 'postmarket';
    case 'master_file':
    case 'quality_cmc':
      return 'DMF';
    case 'pre_submission':
      return pharma ? 'presub' : ivd ? 'ivdpresub' : 'presub';
    case 'designation':
    case 'orphan':
      return 'designation';
    case 'pediatric':
      return 'clindoc';
    case 'clinical_document':
      return e.category === 'regulatory_intelligence' ? 'advice' : pharma ? 'clindoc' : 'CSR';
    case 'device_clearance':
      return e.id.includes('de_novo') ? 'denovo' : '510k';
    case 'device_approval':
      if (e.region === 'EU') return ivd ? 'IVDR' : 'MDR';
      return e.region === 'US' ? 'PMA' : 'intldevice';
    case 'post_market':
      return ivd ? 'ivdpostmarket' : 'pmdevice';
    case 'software_documentation':
      return 'samd';
    case 'companion_diagnostic':
      return 'cdx';
    case 'quality_system':
      return 'qms';
    case 'dossier_module':
      return pharma || e.segment === 'cross_cutting' ? 'NDA' : 'CER';
    default:
      return 'clindoc';
  }
}

// Re-exported so pickers group with the same metadata the tree uses.
export { SEGMENT_METADATA, FILING_CATEGORY_METADATA };
