/**
 * Which report types the `regional` engine computes, and the market each one is
 * about. Pure: no database, no IO, `shared/**` imports only.
 *
 * It lives apart from `filing-readiness.ts` because `report-engine.ts` — the one
 * place that says which engine computes a type — must stay importable without a
 * database, and the engine itself reads the program's record from one.
 *
 * @module server/services/report-os/regional/filing-types
 */

import {
  type ApplicationKind,
  type ModeledJurisdiction,
} from '../../../../shared/regulatory/regional-module1';

/**
 * The report types this engine computes, and the application kinds each one is
 * about.
 *
 * `jurisdiction` is asserted against the type's own declared
 * `governanceRequirements.region` at run time ({@link REGION_TO_JURISDICTION}),
 * so a type whose region is edited in the taxonomy and not here is refused
 * rather than computed for the wrong market.
 *
 * Every `kinds` entry is in `REGIONAL_MODULE1[jurisdiction].kinds` —
 * `regional-filing-readiness.test.ts` holds that, so a kind the Module 1 record
 * does not model can never be listed here.
 */
export const REGIONAL_FILING_TYPES: Readonly<
  Record<string, { jurisdiction: ModeledJurisdiction; kinds: readonly ApplicationKind[] }>
> = Object.freeze({
  'usa_fda.ind_safety_readiness': { jurisdiction: 'US', kinds: ['ind'] },
  'usa_fda.nda_bla_filing_readiness': { jurisdiction: 'US', kinds: ['nda', 'bla'] },
  'ema.maa_readiness_assessment': { jurisdiction: 'EU', kinds: ['maa'] },
  'japan_pmda.jnda_shonin_readiness': { jurisdiction: 'JP', kinds: ['jnda'] },
});

/** The report type ids the regional engine computes. */
export const REGIONAL_REPORT_TYPE_IDS: readonly string[] = Object.freeze(
  Object.keys(REGIONAL_FILING_TYPES),
);

/**
 * The taxonomy's `governanceRequirements.region` for each modelled jurisdiction.
 * Only these three; a type declaring any other region has no Module 1 record and
 * so no engine.
 */
export const REGION_TO_JURISDICTION: Readonly<Record<string, ModeledJurisdiction>> = Object.freeze({
  USA_FDA: 'US',
  EU_EMA: 'EU',
  JP_PMDA: 'JP',
});

/**
 * The registry entries whose application kind a Module 1 tree models, and the
 * kind each one is. The inverse of nothing: `LEGACY_TO_REGISTRY_ID` maps a
 * legacy label to a registry id and covers device and EU CTA filings the Module 1
 * record does not model, so reading it backwards would offer kinds no tree has.
 * This map is exactly the six (registry entry, kind) pairs the record covers.
 */
export const REGISTRY_TO_KIND: Readonly<Record<string, ApplicationKind>> = Object.freeze({
  US_IND: 'ind',
  US_NDA: 'nda',
  US_BLA: 'bla',
  US_ANDA: 'anda',
  EU_MAA: 'maa',
  JP_MKT_APPROVAL: 'jnda',
});


