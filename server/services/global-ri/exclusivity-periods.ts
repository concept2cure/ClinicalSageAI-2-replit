/**
 * Regulatory exclusivity & loss-of-exclusivity (LOE) expert — across markets.
 *
 * Regulatory (data/market) exclusivity is distinct from patent protection: it is
 * granted by the medicines agency on approval and blocks competitor reliance /
 * approval for a statutory period independent of any patent. Projecting when a
 * product loses exclusivity (LOE) — and which exclusivity is the binding one — is
 * a core lifecycle/portfolio judgement for RA, commercial, and finance teams.
 *
 * This service encodes the statutory exclusivity periods per market and product
 * class, applies orphan and pediatric extensions, and projects the binding LOE
 * date from an approval date — deterministically.
 *
 * Markets: FDA (US), EMA (EU centralised), PMDA (JP — re-examination period).
 *
 * Pure / deterministic — no DB, no IO. Periods are statutory durations; the
 * binding LOE in practice may also be set by patents/SPCs (not modeled here) and
 * by case-specific agency determinations. This is an indicative planning aid.
 *
 * References:
 *  - FDA: NCE 5-year exclusivity (21 USC 355(j)(5)(F)(ii)); "other"/new-clinical-
 *    investigation 3-year exclusivity; Orphan 7-year (21 USC 360cc); reference-
 *    product (biologic) 12-year exclusivity / 4-year data (BPCIA, 42 USC 262(k)(7));
 *    Pediatric exclusivity +6 months (BPCA, 21 USC 355a).
 *  - EU: 8 years data + 2 years market (+1 for a new indication of significant
 *    benefit) — the "8+2(+1)" rule (Dir 2001/83/EC Art 14(11); Reg 726/2004 Art 14);
 *    Orphan market exclusivity 10 years (+2 with an agreed PIP) (Reg 141/2000 Art 8;
 *    Reg 1901/2006 Art 37); paediatric SPC extension / PUMA.
 *  - PMDA: re-examination period — typically 8 years for a new active ingredient,
 *    10 years for an orphan drug, ~4–6 years for a new indication (PMD Act).
 *
 * @module server/services/global-ri/exclusivity-periods
 */

export type ExclusivityMarket = 'FDA' | 'EMA' | 'PMDA';

/** Product class that drives which exclusivity regime applies. */
export type ProductClass = 'new_chemical_entity' | 'biologic' | 'new_indication' | 'generic_or_biosimilar';

export interface ExclusivityRule {
  /** Exclusivity type label. */
  type: string;
  /** Base statutory duration in months. */
  baseMonths: number;
  /** Plain-language description. */
  description: string;
  /** Governing citation. */
  citation: string;
}

/** Statutory base exclusivity, by market and product class. */
const RULES: Record<ExclusivityMarket, Record<ProductClass, ExclusivityRule>> = {
  FDA: {
    new_chemical_entity: {
      type: 'New Chemical Entity (NCE) exclusivity',
      baseMonths: 60,
      description: '5-year NCE exclusivity for a drug containing no previously approved active moiety (ANDA/505(b)(2) submission blocked 5 years, or 4 with a paragraph IV patent challenge).',
      citation: '21 USC 355(j)(5)(F)(ii); 21 CFR 314.108',
    },
    biologic: {
      type: 'Reference Product exclusivity (BPCIA)',
      baseMonths: 144,
      description: '12-year reference-product exclusivity for a biologic (biosimilar approval blocked 12 years; a biosimilar application may not be submitted for the first 4 years).',
      citation: '42 USC 262(k)(7) (BPCIA)',
    },
    new_indication: {
      type: 'New clinical investigation ("3-year") exclusivity',
      baseMonths: 36,
      description: '3-year exclusivity for a change to an approved drug (new indication, strength, dosage form, etc.) requiring new clinical investigations essential to approval.',
      citation: '21 USC 355(j)(5)(F)(iii)–(iv); 21 CFR 314.108',
    },
    generic_or_biosimilar: {
      type: 'No originator exclusivity (generic/biosimilar)',
      baseMonths: 0,
      description: 'A generic/biosimilar does not itself earn new-product exclusivity (a first-filer ANDA may earn 180-day competitive exclusivity, modeled separately).',
      citation: '21 USC 355(j)(5)(B)(iv)',
    },
  },
  EMA: {
    new_chemical_entity: {
      type: 'Data + market exclusivity ("8+2")',
      baseMonths: 120,
      description: '8 years data exclusivity + 2 years market protection (10 years total); a generic dossier may be submitted after 8 years but not marketed until 10.',
      citation: 'Dir 2001/83/EC Art 14(11); Reg (EC) 726/2004 Art 14',
    },
    biologic: {
      type: 'Data + market exclusivity ("8+2")',
      baseMonths: 120,
      description: 'Biologicals follow the same 8+2 regime; a biosimilar dossier may be submitted after 8 years but not marketed until 10.',
      citation: 'Dir 2001/83/EC Art 14(11); Reg (EC) 726/2004 Art 14',
    },
    new_indication: {
      type: 'Additional year for a new indication ("+1")',
      baseMonths: 12,
      description: 'A single additional year of market protection for a new indication with significant clinical benefit, when applied for during the first 8 years (the "+1" in 8+2+1).',
      citation: 'Dir 2001/83/EC Art 14(11)',
    },
    generic_or_biosimilar: {
      type: 'No originator exclusivity (generic/biosimilar)',
      baseMonths: 0,
      description: 'A generic/biosimilar does not earn new data/market exclusivity.',
      citation: 'Dir 2001/83/EC Art 10',
    },
  },
  PMDA: {
    new_chemical_entity: {
      type: 'Re-examination period (new active ingredient)',
      baseMonths: 96,
      description: 'Re-examination period of typically 8 years for a drug with a new active ingredient; generics cannot rely on the originator data during this period.',
      citation: 'PMD Act (re-examination); MHLW notifications',
    },
    biologic: {
      type: 'Re-examination period (new active ingredient)',
      baseMonths: 96,
      description: 'Re-examination period of typically 8 years for a new biologic active ingredient.',
      citation: 'PMD Act (re-examination); MHLW notifications',
    },
    new_indication: {
      type: 'Re-examination period (new indication)',
      baseMonths: 48,
      description: 'Re-examination period of typically 4–6 years for a new indication / additional use.',
      citation: 'PMD Act (re-examination); MHLW notifications',
    },
    generic_or_biosimilar: {
      type: 'No re-examination period (generic/biosimilar)',
      baseMonths: 0,
      description: 'A generic/biosimilar does not earn a new re-examination period.',
      citation: 'PMD Act',
    },
  },
};

/** Orphan exclusivity, by market (replaces/extends the base where longer). */
const ORPHAN_RULE: Record<ExclusivityMarket, ExclusivityRule> = {
  FDA: {
    type: 'Orphan Drug exclusivity',
    baseMonths: 84,
    description: '7-year orphan exclusivity blocking approval of the same drug for the same orphan indication.',
    citation: '21 USC 360cc; 21 CFR 316.31',
  },
  EMA: {
    type: 'Orphan market exclusivity',
    baseMonths: 120,
    description: '10-year orphan market exclusivity (a similar product cannot be approved for the same indication).',
    citation: 'Reg (EC) No 141/2000 Art 8',
  },
  PMDA: {
    type: 'Orphan re-examination period',
    baseMonths: 120,
    description: '10-year re-examination period for an orphan drug.',
    citation: 'PMD Act; MHLW orphan designation',
  },
};

/** Pediatric extension, by market. */
const PEDIATRIC_EXTENSION: Record<ExclusivityMarket, { months: number; appliesTo: 'standard' | 'orphan' | 'both'; description: string; citation: string }> = {
  FDA: {
    months: 6,
    appliesTo: 'both',
    description: 'Pediatric exclusivity adds 6 months to existing exclusivity/patent protection on completion of FDA-requested pediatric studies (BPCA).',
    citation: '21 USC 355a (BPCA)',
  },
  EMA: {
    months: 24,
    appliesTo: 'orphan',
    description: 'A completed, compliant agreed PIP extends orphan market exclusivity by 2 years (non-orphan products instead receive a 6-month SPC extension, modeled at the patent layer).',
    citation: 'Reg (EC) No 1901/2006 Art 37',
  },
  PMDA: {
    months: 0,
    appliesTo: 'both',
    description: 'No standardized pediatric exclusivity extension; pediatric development may inform the re-examination period — confirm with PMDA.',
    citation: 'PMD Act',
  },
};

export interface ExclusivityInput {
  market: ExclusivityMarket;
  productClass: ProductClass;
  /** Whether the product holds orphan designation in this market. */
  orphan?: boolean;
  /** Whether a qualifying pediatric study/PIP earns the pediatric extension. */
  pediatricExtension?: boolean;
  /** Approval date (ISO yyyy-mm-dd) to project the LOE date from. */
  approvalDate?: string;
}

export interface ExclusivityComponent {
  type: string;
  months: number;
  description: string;
  citation: string;
}

export interface ExclusivityResult {
  market: ExclusivityMarket;
  productClass: ProductClass;
  /** All exclusivity components considered (base + orphan + pediatric). */
  components: ExclusivityComponent[];
  /** The binding (longest) exclusivity duration in months. */
  bindingMonths: number;
  /** Which component is binding. */
  bindingType: string;
  /** Projected LOE date (ISO) when approvalDate is supplied, else null. */
  approvalDate: string | null;
  lossOfExclusivityDate: string | null;
  notes: string[];
}

function addMonthsIso(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid approvalDate "${iso}" (expected yyyy-mm-dd).`);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  // Guard month overflow (e.g. Jan 31 + 1 month) by clamping to the last valid day.
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

/**
 * Compute regulatory exclusivity for a product in a market and project the LOE
 * date. The binding exclusivity is the longest applicable component. Orphan
 * exclusivity, where applicable, is considered alongside (not added to) the base
 * regime; the pediatric extension adds to the binding period per the market rule.
 *
 * Pure / deterministic. Throws for an unmodeled market/product class.
 */
export function computeExclusivity(input: ExclusivityInput): ExclusivityResult {
  const byClass = RULES[input.market];
  if (!byClass) throw new Error(`No exclusivity rules modeled for market "${input.market}".`);
  const base = byClass[input.productClass];
  if (!base) throw new Error(`Unknown product class "${input.productClass}".`);

  const notes: string[] = [];
  const components: ExclusivityComponent[] = [];

  // Base regime (skip the zero-month "no exclusivity" placeholder from components
  // but still report it as the base).
  components.push({ type: base.type, months: base.baseMonths, description: base.description, citation: base.citation });

  // Orphan exclusivity, where claimed.
  if (input.orphan) {
    const orphan = ORPHAN_RULE[input.market];
    components.push({ type: orphan.type, months: orphan.baseMonths, description: orphan.description, citation: orphan.citation });
  }

  // The binding base/orphan exclusivity is the longest of the components so far.
  const binding = components.reduce((a, b) => (b.months > a.months ? b : a));
  let bindingMonths = binding.months;
  let bindingType = binding.type;

  // Pediatric extension adds to the binding period per the market's rule.
  if (input.pediatricExtension) {
    const ped = PEDIATRIC_EXTENSION[input.market];
    // An orphan product's binding period is governed by orphan exclusivity when
    // orphan is claimed and the orphan period is at least as long as the base
    // (it ties with the base under reduce() but should still count as orphan for
    // the purpose of the orphan-only pediatric/PIP extension, e.g. EU Art 37).
    const orphanBinding =
      !!input.orphan && ORPHAN_RULE[input.market].baseMonths >= bindingMonths;
    const applies =
      ped.appliesTo === 'both' ||
      (ped.appliesTo === 'orphan' && orphanBinding) ||
      (ped.appliesTo === 'standard' && !orphanBinding);
    if (applies && ped.months > 0) {
      // When the orphan period ties (or exceeds) the base, reduce() keeps the
      // earlier base component, but the binding is actually governed by orphan
      // exclusivity — and the orphan-only extension (e.g. EU Art 37 PIP) can
      // only attach to it. Relabel the binding as orphan so the reported type
      // matches the months (avoids an impossible "8+2 + pediatric = 144 months").
      if (orphanBinding) bindingType = ORPHAN_RULE[input.market].type;
      bindingMonths += ped.months;
      components.push({ type: 'Pediatric extension', months: ped.months, description: ped.description, citation: ped.citation });
      bindingType = `${bindingType} + pediatric extension`;
    } else if (ped.months > 0) {
      notes.push(ped.description);
    }
  }

  let lossOfExclusivityDate: string | null = null;
  if (input.approvalDate) {
    lossOfExclusivityDate = bindingMonths > 0 ? addMonthsIso(input.approvalDate, bindingMonths) : input.approvalDate;
  }

  if (base.baseMonths === 0 && !input.orphan) {
    notes.push('This product class does not earn originator exclusivity; LOE is governed by the reference product and any first-filer competitive exclusivity.');
  }
  notes.push('Indicative statutory durations only — the real LOE may be set by patents/SPCs and case-specific agency determinations not modeled here.');

  return {
    market: input.market,
    productClass: input.productClass,
    components,
    bindingMonths,
    bindingType,
    approvalDate: input.approvalDate ?? null,
    lossOfExclusivityDate,
    notes,
  };
}

/** List the modeled exclusivity rules for a market (reference). */
export function getExclusivityRules(market: ExclusivityMarket): {
  byClass: Record<ProductClass, ExclusivityRule>;
  orphan: ExclusivityRule;
} | null {
  const byClass = RULES[market];
  if (!byClass) return null;
  return { byClass, orphan: ORPHAN_RULE[market] };
}

/** The modeled product classes. */
export const PRODUCT_CLASSES: ProductClass[] = ['new_chemical_entity', 'biologic', 'new_indication', 'generic_or_biosimilar'];
