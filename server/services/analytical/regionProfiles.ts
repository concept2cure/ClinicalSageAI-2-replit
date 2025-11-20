export type RegionKey = 'FDA' | 'EMA' | 'PMDA';

export type RegionProfile = {
  code: RegionKey;
  name: string;
  compendia: {
    chromatography: string; // chapter reference label
    /* add others as needed (e.g., dissolution) */
  };
  terminology: {
    systemSuitability: string; // "System suitability" vs "System suitability tests"
    robustness: string; // "Robustness" (all)
    accuracy: string; // "Accuracy"
    precision: string; // "Precision"
    specificity: string; // "Specificity" (non-EU often "Selectivity/Specificity")
  };
  numeric: { decimalSeparator: '.' | ',' };
  notes?: string[];
};

export const profiles: Record<RegionKey, RegionProfile> = {
  FDA: {
    code: 'FDA',
    name: 'United States (FDA/USP)',
    compendia: { chromatography: 'USP <621> Chromatography' },
    terminology: {
      systemSuitability: 'System suitability',
      robustness: 'Robustness',
      accuracy: 'Accuracy',
      precision: 'Precision',
      specificity: 'Specificity',
    },
    numeric: { decimalSeparator: '.' },
    notes: [
      'Follow USP naming when citing compendial references.',
      'Round and report per internal SOP; decimals use a dot (.)',
    ],
  },
  EMA: {
    code: 'EMA',
    name: 'European Union (EMA/Ph. Eur.)',
    compendia: { chromatography: 'Ph. Eur. 2.2.46 Chromatographic separation techniques' },
    terminology: {
      systemSuitability: 'System suitability',
      robustness: 'Robustness',
      accuracy: 'Accuracy',
      precision: 'Precision',
      specificity: 'Specificity',
    },
    numeric: { decimalSeparator: ',' }, // if you display numbers as strings, respect comma
    notes: [
      'Use Ph. Eur. naming when citing compendial references.',
      'Decimals commonly shown with a comma; keep raw data unchanged.',
    ],
  },
  PMDA: {
    code: 'PMDA',
    name: 'Japan (PMDA/JP)',
    compendia: { chromatography: 'JP 2.01 Chromatography' },
    terminology: {
      systemSuitability: 'System suitability',
      robustness: 'Robustness',
      accuracy: 'Accuracy',
      precision: 'Precision',
      specificity: 'Specificity',
    },
    numeric: { decimalSeparator: '.' },
    notes: [
      'Use JP naming when citing compendial references.',
      'Attach English/Japanese bilingual terms where required.',
    ],
  },
};

export function getRegionProfile(region: string | undefined): RegionProfile {
  const key = (region || 'FDA').toUpperCase() as RegionKey;
  return profiles[key] ?? profiles.FDA;
}
