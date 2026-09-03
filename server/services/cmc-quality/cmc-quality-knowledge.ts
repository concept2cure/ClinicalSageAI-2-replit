/**
 * CMC Quality (ICH Q-series) Intelligence — Deterministic Knowledge Base
 *
 * Pure, in-code reference data and decision engines for CMC quality
 * assessment covering stability study design, analytical method validation,
 * impurity classification, specification setting, process validation,
 * and comparability protocols.
 *
 * NO LLM, NO network, NO database. Every function is closed-form and
 * reproducible: identical input always yields identical output.
 *
 * Regulatory citations: ICH Q1A-Q1E, Q2(R2), Q3A-Q3D, Q5E, Q6A/Q6B,
 * Q8(R2), Q9, Q10, FDA Process Validation Guidance 2011.
 *
 * @module server/services/cmc-quality/cmc-quality-knowledge
 */

/* The ICH Q3A/Q3B threshold tables are NOT restated in this module: they live
   in services/global-ri/impurities-thresholds, which owns them. */
import {
  ELEMENTAL_IMPURITIES,
  getResidualSolvent,
  resolveImpurityThresholds,
  type AdministrationRoute,
  type ElementalImpurity,
} from '../global-ri/impurities-thresholds';

/**
 * Q3D element lookup by symbol or name. The catalog is an array so it can be
 * enumerated; this is the by-key read the classifier needs.
 */
function findElementalImpurity(key: string): ElementalImpurity | null {
  const k = key.trim().toLowerCase();
  if (!k) return null;
  return (
    ELEMENTAL_IMPURITIES.find(
      (e) => e.symbol.toLowerCase() === k || e.name.toLowerCase() === k,
    ) ?? null
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 0 — Common Utility Types
// ─────────────────────────────────────────────────────────────────────────────

type ClimaticZone = 'I' | 'II' | 'III' | 'IVa' | 'IVb';

type DosageFormKey =
  | 'tablet'
  | 'capsule'
  | 'solution'
  | 'suspension'
  | 'cream'
  | 'ointment'
  | 'injection'
  | 'lyophilized'
  | 'inhaler'
  | 'suppository'
  | 'patch'
  | 'ophthalmic';

type PackagingTypeKey =
  | 'HDPE_bottle'
  | 'glass_bottle'
  | 'blister_alu_alu'
  | 'blister_pvc_alu'
  | 'ampoule'
  | 'vial'
  | 'prefilled_syringe'
  | 'tube'
  | 'sachet';

type RouteOfAdministration =
  | 'oral'
  | 'parenteral'
  | 'topical'
  | 'inhalation'
  | 'ophthalmic'
  | 'otic'
  | 'nasal'
  | 'rectal'
  | 'vaginal';

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — Stability Study Design (ICH Q1A–Q1E)
// ─────────────────────────────────────────────────────────────────────────────

// ── 1.1 Interfaces ──

export interface StabilityStudyParams {
  dosageForm: string;
  climaticZone: ClimaticZone;
  packagingType: string;
  intendedMarkets: string[];
  productType: 'new' | 'generic' | 'variation';
  photosensitive: boolean;
}

export interface StorageConditionEntry {
  conditionType: 'long_term' | 'accelerated' | 'intermediate' | 'refrigerated' | 'frozen';
  temperature: string;
  humidity: string;
  duration_months: number;
  applicable: boolean;
}

export interface MatrixingBracketingInfo {
  eligible: boolean;
  designOptions: string[];
  restrictions: string[];
}

export interface PhotostabilityTesting {
  required: boolean;
  option1: string;
  option2: string;
  lightExposure: string;
}

export interface StatisticalAnalysis {
  approach: string;
  poolability: string;
  extrapolationRules: string[];
}

export interface ShelfLifeEstimation {
  method: string;
  maxExtrapolation: string;
  conditions: string[];
}

export interface MinimumBatches {
  registration: number;
  clinicalSupply: number;
  postApproval: number;
}

export interface StabilityStudyResult {
  storageConditions: StorageConditionEntry[];
  testingIntervals: number[];
  minimumBatches: MinimumBatches;
  matrixingBracketing: MatrixingBracketingInfo;
  photostabilityTesting: PhotostabilityTesting;
  statisticalAnalysis: StatisticalAnalysis;
  shelfLifeEstimation: ShelfLifeEstimation;
  requiredAttributes: string[];
  citations: string[];
}

// ── 1.2 Reference Data ──

interface ClimaticZoneConditions {
  meanTemperature: string;
  meanHumidity: string;
  longTermTemp: string;
  longTermHumidity: string;
  longTermDuration: number;
  acceleratedTemp: string;
  acceleratedHumidity: string;
  acceleratedDuration: number;
  intermediateApplicable: boolean;
  intermediateTemp: string;
  intermediateHumidity: string;
  intermediateDuration: number;
}

const CLIMATIC_ZONE_TABLE: Record<ClimaticZone, ClimaticZoneConditions> = {
  I: {
    meanTemperature: '21°C',
    meanHumidity: '45% RH',
    longTermTemp: '25°C ± 2°C',
    longTermHumidity: '60% RH ± 5% RH',
    longTermDuration: 36,
    acceleratedTemp: '40°C ± 2°C',
    acceleratedHumidity: '75% RH ± 5% RH',
    acceleratedDuration: 6,
    intermediateApplicable: true,
    intermediateTemp: '30°C ± 2°C',
    intermediateHumidity: '65% RH ± 5% RH',
    intermediateDuration: 12,
  },
  II: {
    meanTemperature: '25°C',
    meanHumidity: '60% RH',
    longTermTemp: '25°C ± 2°C',
    longTermHumidity: '60% RH ± 5% RH',
    longTermDuration: 36,
    acceleratedTemp: '40°C ± 2°C',
    acceleratedHumidity: '75% RH ± 5% RH',
    acceleratedDuration: 6,
    intermediateApplicable: true,
    intermediateTemp: '30°C ± 2°C',
    intermediateHumidity: '65% RH ± 5% RH',
    intermediateDuration: 12,
  },
  III: {
    meanTemperature: '30°C',
    meanHumidity: '35% RH',
    longTermTemp: '30°C ± 2°C',
    longTermHumidity: '35% RH ± 5% RH',
    longTermDuration: 36,
    acceleratedTemp: '40°C ± 2°C',
    acceleratedHumidity: '75% RH ± 5% RH',
    acceleratedDuration: 6,
    intermediateApplicable: false,
    intermediateTemp: 'N/A',
    intermediateHumidity: 'N/A',
    intermediateDuration: 0,
  },
  IVa: {
    meanTemperature: '30°C',
    meanHumidity: '65% RH',
    longTermTemp: '30°C ± 2°C',
    longTermHumidity: '65% RH ± 5% RH',
    longTermDuration: 36,
    acceleratedTemp: '40°C ± 2°C',
    acceleratedHumidity: '75% RH ± 5% RH',
    acceleratedDuration: 6,
    intermediateApplicable: false,
    intermediateTemp: 'N/A',
    intermediateHumidity: 'N/A',
    intermediateDuration: 0,
  },
  IVb: {
    meanTemperature: '30°C',
    meanHumidity: '75% RH',
    longTermTemp: '30°C ± 2°C',
    longTermHumidity: '75% RH ± 5% RH',
    longTermDuration: 36,
    acceleratedTemp: '40°C ± 2°C',
    acceleratedHumidity: '75% RH ± 5% RH',
    acceleratedDuration: 6,
    intermediateApplicable: false,
    intermediateTemp: 'N/A',
    intermediateHumidity: 'N/A',
    intermediateDuration: 0,
  },
};

/** ICH Q1A standard testing intervals for long-term studies. */
const LONG_TERM_INTERVALS_36: number[] = [0, 3, 6, 9, 12, 18, 24, 36];
const LONG_TERM_INTERVALS_24: number[] = [0, 3, 6, 9, 12, 18, 24];
const ACCELERATED_INTERVALS: number[] = [0, 1, 2, 3, 6];
const INTERMEDIATE_INTERVALS: number[] = [0, 3, 6, 9, 12];

/** Dosage-form–specific stability test attributes per ICH Q1A(R2) Annex. */
const DOSAGE_FORM_ATTRIBUTES: Record<string, string[]> = {
  tablet: [
    'Appearance (color, shape, surface condition)',
    'Assay (potency)',
    'Degradation products / Related substances',
    'Dissolution',
    'Water content / Loss on drying',
    'Hardness / Friability',
    'Disintegration (if applicable)',
    'Microbial limits',
  ],
  capsule: [
    'Appearance (color, body integrity, brittleness)',
    'Assay (potency)',
    'Degradation products / Related substances',
    'Dissolution',
    'Water content / Loss on drying',
    'Microbial limits',
  ],
  solution: [
    'Appearance (color, clarity)',
    'Assay (potency)',
    'Degradation products / Related substances',
    'pH',
    'Particulate matter (parenteral)',
    'Preservative content (if applicable)',
    'Antimicrobial preservative effectiveness',
    'Extractables / Leachables (if applicable)',
    'Microbial limits / Sterility',
  ],
  suspension: [
    'Appearance (color, sedimentation, resuspendability)',
    'Assay (potency)',
    'Degradation products / Related substances',
    'pH',
    'Viscosity',
    'Particle size distribution',
    'Redispersibility',
    'Preservative content (if applicable)',
    'Microbial limits',
  ],
  cream: [
    'Appearance (color, homogeneity, consistency)',
    'Assay (potency)',
    'Degradation products / Related substances',
    'pH',
    'Viscosity',
    'Particle size (if applicable)',
    'Water content',
    'Preservative content',
    'Antimicrobial preservative effectiveness',
    'Microbial limits',
  ],
  ointment: [
    'Appearance (color, homogeneity, consistency)',
    'Assay (potency)',
    'Degradation products / Related substances',
    'Particle size (if applicable)',
    'Viscosity / Penetration',
    'Water content',
    'Microbial limits',
  ],
  injection: [
    'Appearance (color, clarity)',
    'Assay (potency)',
    'Degradation products / Related substances',
    'pH',
    'Sterility',
    'Endotoxin / Pyrogen',
    'Particulate matter (sub-visible)',
    'Extractables / Leachables',
    'Container closure integrity',
    'Volume in container',
    'Preservative content (multi-dose)',
  ],
  lyophilized: [
    'Appearance (cake integrity, color)',
    'Assay (potency)',
    'Degradation products / Related substances',
    'Reconstitution time',
    'pH (reconstituted)',
    'Water content / Residual moisture',
    'Sterility',
    'Endotoxin / Pyrogen',
    'Particulate matter (reconstituted)',
    'Container closure integrity',
  ],
  inhaler: [
    'Appearance',
    'Assay (potency)',
    'Degradation products / Related substances',
    'Delivered dose uniformity',
    'Aerodynamic particle size distribution (APSD)',
    'Number of actuations per container',
    'Spray pattern / Plume geometry',
    'Leak rate',
    'Microbial limits',
    'Water content',
    'Net content weight',
  ],
  suppository: [
    'Appearance (color, surface condition)',
    'Assay (potency)',
    'Degradation products / Related substances',
    'Softening time / Melting range',
    'Dissolution (if applicable)',
    'Microbial limits',
  ],
  patch: [
    'Appearance (visual, adhesion properties)',
    'Assay (potency)',
    'Degradation products / Related substances',
    'Drug release rate (in vitro)',
    'Peel adhesion',
    'Residual solvents (if applicable)',
    'Crystal formation (if applicable)',
    'Microbial limits',
    'Liner / Release liner peel',
  ],
  ophthalmic: [
    'Appearance (color, clarity)',
    'Assay (potency)',
    'Degradation products / Related substances',
    'pH',
    'Osmolality',
    'Sterility',
    'Particulate matter',
    'Preservative content (if applicable)',
    'Antimicrobial preservative effectiveness',
    'Extractables / Leachables',
    'Container closure integrity',
  ],
};

/** Market-to-climatic-zone mapping for default zone selection. */
const MARKET_ZONE_MAP: Record<string, ClimaticZone> = {
  US: 'II',
  EU: 'II',
  Japan: 'II',
  Canada: 'II',
  Australia: 'II',
  UK: 'II',
  China: 'II',
  Brazil: 'IVb',
  India: 'IVa',
  ASEAN: 'IVb',
  Indonesia: 'IVb',
  Thailand: 'IVb',
  Philippines: 'IVb',
  Vietnam: 'IVb',
  Malaysia: 'IVb',
  Nigeria: 'IVb',
  Egypt: 'IVa',
  GCC: 'IVa',
  Mexico: 'II',
  Argentina: 'II',
  Russia: 'II',
  Korea: 'II',
  Turkey: 'II',
  Colombia: 'IVa',
  Peru: 'IVa',
  SouthAfrica: 'IVa',
};

// ── 1.3 Exported Function ──

export function designStabilityStudy(params: StabilityStudyParams): StabilityStudyResult {
  const {
    dosageForm,
    climaticZone,
    packagingType,
    intendedMarkets,
    productType,
    photosensitive,
  } = params;

  // Determine the harshest climatic zone across all intended markets
  const zoneOrder: ClimaticZone[] = ['I', 'II', 'III', 'IVa', 'IVb'];
  let harshestZone: ClimaticZone = climaticZone;
  for (const market of intendedMarkets) {
    const mz = MARKET_ZONE_MAP[market];
    if (mz && zoneOrder.indexOf(mz) > zoneOrder.indexOf(harshestZone)) {
      harshestZone = mz;
    }
  }

  const zoneData = CLIMATIC_ZONE_TABLE[harshestZone];

  // ── Storage conditions ──
  const lowerForm = dosageForm.toLowerCase() as DosageFormKey;
  const isRefrigerated = lowerForm === 'injection' || lowerForm === 'lyophilized';
  const isFrozen = false; // Would need explicit param; default false

  const storageConditions: StorageConditionEntry[] = [];

  if (isFrozen) {
    storageConditions.push({
      conditionType: 'frozen',
      temperature: '-20°C ± 5°C',
      humidity: 'N/A (no humidity control)',
      duration_months: 36,
      applicable: true,
    });
  } else if (isRefrigerated) {
    storageConditions.push({
      conditionType: 'refrigerated',
      temperature: '5°C ± 3°C',
      humidity: 'N/A (no humidity control)',
      duration_months: 36,
      applicable: true,
    });
    storageConditions.push({
      conditionType: 'accelerated',
      temperature: '25°C ± 2°C',
      humidity: '60% RH ± 5% RH',
      duration_months: 6,
      applicable: true,
    });
  } else {
    storageConditions.push({
      conditionType: 'long_term',
      temperature: zoneData.longTermTemp,
      humidity: zoneData.longTermHumidity,
      duration_months: zoneData.longTermDuration,
      applicable: true,
    });
    storageConditions.push({
      conditionType: 'accelerated',
      temperature: zoneData.acceleratedTemp,
      humidity: zoneData.acceleratedHumidity,
      duration_months: zoneData.acceleratedDuration,
      applicable: true,
    });
    if (zoneData.intermediateApplicable) {
      storageConditions.push({
        conditionType: 'intermediate',
        temperature: zoneData.intermediateTemp,
        humidity: zoneData.intermediateHumidity,
        duration_months: zoneData.intermediateDuration,
        applicable: true,
      });
    }
  }

  // ── Testing intervals ──
  const testingIntervals = isRefrigerated
    ? LONG_TERM_INTERVALS_24
    : [...LONG_TERM_INTERVALS_36, ...ACCELERATED_INTERVALS.filter((i) => !LONG_TERM_INTERVALS_36.includes(i))];

  // Deduplicate and sort
  const uniqueIntervals = Array.from(new Set(testingIntervals)).sort((a, b) => a - b);

  // ── Minimum batches ──
  const minimumBatches: MinimumBatches = {
    registration: productType === 'new' ? 3 : productType === 'generic' ? 2 : 1,
    clinicalSupply: productType === 'new' ? 1 : 0,
    postApproval: 1,
  };

  // ── Matrixing and bracketing per ICH Q1D ──
  const matrixEligibleForms = ['tablet', 'capsule'];
  const matrixEligible = matrixEligibleForms.includes(lowerForm);
  const matrixingBracketing: MatrixingBracketingInfo = {
    eligible: matrixEligible,
    designOptions: matrixEligible
      ? [
          'Full factorial: all time points, all conditions, all batches (baseline reference)',
          'Bracketing: test only extreme levels (e.g., highest and lowest strengths) with assumption intermediate strengths are represented',
          'Matrixing: systematic reduced testing at specified time points, with each attribute tested at every time point across the full design',
          'Combined matrixing/bracketing: apply both reductions simultaneously (requires strong justification)',
        ]
      : ['Full factorial design required — matrixing/bracketing not appropriate for this dosage form'],
    restrictions: matrixEligible
      ? [
          'Matrixing must not omit early or final time points',
          'Bracketing requires identical formulation across strengths (same qualitative composition)',
          'At least 3 strengths required for bracketing to be meaningful',
          'Statistical justification required per ICH Q1D Section 4',
          'Accelerated studies should not be subject to matrixing',
          'Full data must be available for degradation products',
        ]
      : ['Dosage form variability precludes matrixing/bracketing assumptions'],
  };

  // ── Photostability testing per ICH Q1B ──
  const photostabilityTesting: PhotostabilityTesting = {
    required: true, // Q1B: photostability is required for all new drug substances and products
    option1:
      'Option 1: Expose sample to both D65 fluorescent lamp (visible light) and a near-UV fluorescent lamp concurrently. Exposure: >= 1.2 million lux hours (visible) + >= 200 Wh/m² (near-UV).',
    option2:
      'Option 2: Expose sample to a xenon lamp or metal halide lamp that produces both visible and UV output. Same overall exposure: >= 1.2 million lux hours (visible) + >= 200 Wh/m² (near-UV).',
    lightExposure:
      'Overall illumination >= 1.2 million lux hours (visible light) and >= 200 Wh/m² (near-UV, 320-400 nm). Use actinometric/chemical or calibrated radiometric systems.',
  };

  // ── Statistical analysis per ICH Q1E ──
  const statisticalAnalysis: StatisticalAnalysis = {
    approach:
      'Linear regression of stability data versus time. If data from all batches can be pooled (per ANCOVA test), use pooled estimate; otherwise use worst-case batch.',
    poolability:
      'ANCOVA test (p > 0.25 for batch-by-time interaction and batch main effect) determines poolability. If significant, estimate shelf life from worst-case batch.',
    extrapolationRules: [
      'Extrapolation beyond observed data permitted up to 2x the long-term data period or 12 months beyond, whichever is shorter.',
      'Extrapolation requires no significant change under accelerated conditions for 6 months.',
      'If significant change occurs at accelerated: intermediate condition data needed, and extrapolation is limited.',
      'Statistical model must show no significant deviation from linearity.',
      'Shelf life must be supported by at least 12 months of long-term data for initial registration.',
    ],
  };

  // ── Shelf life estimation per ICH Q1E ──
  const shelfLifeEstimation: ShelfLifeEstimation = {
    method: 'Linear or non-linear regression with 95% one-sided confidence interval. Shelf life = time at which 95% CI crosses acceptance criterion.',
    maxExtrapolation:
      'Up to 2x the period covered by long-term data, not exceeding 12 months beyond the last real-time data point.',
    conditions: [
      'No significant change at accelerated conditions (6 months)',
      'Regression model demonstrates adequate fit (residual analysis)',
      'At least 12 months of long-term data at filing',
      'For generic products: at least 6 months accelerated + 6 months long-term at filing',
      'Shelf life > 24 months generally requires 24 months of real-time data post-approval',
    ],
  };

  // ── Required attributes for this dosage form ──
  const requiredAttributes: string[] = DOSAGE_FORM_ATTRIBUTES[lowerForm] || [
    'Appearance',
    'Assay (potency)',
    'Degradation products / Related substances',
    'Microbial limits',
  ];

  if (photosensitive) {
    requiredAttributes.push(
      'Photodegradation products (specific to light-exposed samples)',
      'Color change assessment under ICH Q1B conditions',
    );
  }

  // Add packaging-specific attributes
  void packagingType; // Acknowledged — used for packaging-specific notes
  const lowerPackaging = packagingType.toLowerCase();
  if (lowerPackaging.includes('blister') || lowerPackaging.includes('pvc')) {
    requiredAttributes.push('Moisture vapor transmission rate (MVTR) through packaging');
  }
  if (lowerPackaging.includes('vial') || lowerPackaging.includes('syringe') || lowerPackaging.includes('ampoule')) {
    requiredAttributes.push('Container closure integrity testing');
    requiredAttributes.push('Extractables and leachables from container');
  }

  // ── Citations ──
  const citations: string[] = [
    'ICH Q1A(R2) — Stability Testing of New Drug Substances and Products (2003)',
    'ICH Q1B — Photostability Testing of New Drug Substances and Products (1996)',
    'ICH Q1C — Stability Testing for New Dosage Forms (1996)',
    'ICH Q1D — Bracketing and Matrixing Designs for Stability Testing (2002)',
    'ICH Q1E — Evaluation of Stability Data (2003)',
    'WHO TRS 953 Annex 2 — Stability Testing of Pharmaceutical Products (2009)',
  ];

  if (intendedMarkets.includes('US')) {
    citations.push('FDA Guidance: Stability Testing of Drug Substances and Drug Products (revised 2024)');
  }
  if (intendedMarkets.includes('EU')) {
    citations.push('EMA/CPMP/QWP/122/02/Rev 1 — Note for Guidance on Stability Testing');
  }

  return {
    storageConditions,
    testingIntervals: uniqueIntervals,
    minimumBatches,
    matrixingBracketing,
    photostabilityTesting,
    statisticalAnalysis,
    shelfLifeEstimation,
    requiredAttributes,
    citations,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — Analytical Method Validation (ICH Q2(R2))
// ─────────────────────────────────────────────────────────────────────────────

// ── 2.1 Interfaces ──

export type MethodType =
  | 'identification'
  | 'assay_potency'
  | 'impurities_quantitative'
  | 'impurities_limit'
  | 'dissolution'
  | 'content_uniformity'
  | 'biological_potency';

export type AnalyticalTechnique =
  | 'HPLC'
  | 'GC'
  | 'CE'
  | 'UV'
  | 'titration'
  | 'biological_assay'
  | 'LCMS'
  | 'ICP_MS'
  | 'Karl_Fischer'
  | 'NIR';

export interface AnalyticalMethodParams {
  methodType: MethodType;
  technique: AnalyticalTechnique;
}

export interface ValidationParameter {
  parameter: string;
  required: boolean;
  acceptanceCriteria: string;
  numberOfDeterminations: string;
  details: string;
}

export interface LinearityRequirements {
  rangeMinPercent: number;
  rangeMaxPercent: number;
  minimumConcentrations: number;
  correlationCoefficientMin: number;
  yInterceptCriteria: string;
  residualAnalysis: string;
}

export interface PrecisionLevels {
  repeatability: { required: boolean; rsdMax: number; numberOfDeterminations: number; details: string };
  intermediatePrecision: { required: boolean; factors: string[]; rsdMax: number; details: string };
  reproducibility: { required: boolean; details: string };
}

export interface SystemSuitabilityParams {
  resolutionMin: number;
  tailingFactorMax: number;
  plateCountMin: number;
  rsdMaxPercent: number;
  numberOfInjections: number;
  details: string[];
}

export interface AnalyticalMethodResult {
  requiredParameters: ValidationParameter[];
  linearityRequirements: LinearityRequirements;
  precisionLevels: PrecisionLevels;
  robustnessFactors: string[];
  systemSuitability: SystemSuitabilityParams;
  citations: string[];
}

// ── 2.2 Reference Data ──

interface ValidationRequirementSet {
  specificity: boolean;
  linearity: boolean;
  range: boolean;
  accuracy: boolean;
  repeatability: boolean;
  intermediatePrecision: boolean;
  lod: boolean;
  loq: boolean;
  robustness: boolean;
}

const VALIDATION_REQUIREMENTS_TABLE: Record<MethodType, ValidationRequirementSet> = {
  identification: {
    specificity: true,
    linearity: false,
    range: false,
    accuracy: false,
    repeatability: false,
    intermediatePrecision: false,
    lod: false,
    loq: false,
    robustness: false,
  },
  assay_potency: {
    specificity: true,
    linearity: true,
    range: true,
    accuracy: true,
    repeatability: true,
    intermediatePrecision: true,
    lod: false,
    loq: false,
    robustness: true,
  },
  impurities_quantitative: {
    specificity: true,
    linearity: true,
    range: true,
    accuracy: true,
    repeatability: true,
    intermediatePrecision: true,
    lod: true,
    loq: true,
    robustness: true,
  },
  impurities_limit: {
    specificity: true,
    linearity: false,
    range: false,
    accuracy: false,
    repeatability: false,
    intermediatePrecision: false,
    lod: true,
    loq: false,
    robustness: true,
  },
  dissolution: {
    specificity: true,
    linearity: true,
    range: true,
    accuracy: true,
    repeatability: true,
    intermediatePrecision: true,
    lod: false,
    loq: false,
    robustness: true,
  },
  content_uniformity: {
    specificity: true,
    linearity: true,
    range: true,
    accuracy: true,
    repeatability: true,
    intermediatePrecision: true,
    lod: false,
    loq: false,
    robustness: true,
  },
  biological_potency: {
    specificity: true,
    linearity: true,
    range: true,
    accuracy: true,
    repeatability: true,
    intermediatePrecision: true,
    lod: false,
    loq: false,
    robustness: true,
  },
};

/** Linearity ranges per ICH Q2(R2) by method type. */
const LINEARITY_RANGES: Record<MethodType, LinearityRequirements> = {
  identification: {
    rangeMinPercent: 0,
    rangeMaxPercent: 0,
    minimumConcentrations: 0,
    correlationCoefficientMin: 0,
    yInterceptCriteria: 'N/A — linearity not required for identification',
    residualAnalysis: 'N/A',
  },
  assay_potency: {
    rangeMinPercent: 80,
    rangeMaxPercent: 120,
    minimumConcentrations: 5,
    correlationCoefficientMin: 0.999,
    yInterceptCriteria: 'y-intercept should not exceed 2% of the response at the 100% target concentration',
    residualAnalysis: 'Plot residuals vs. concentration; no systematic pattern should be observed',
  },
  impurities_quantitative: {
    rangeMinPercent: 50, // of specification limit or LOQ, whichever is lower
    rangeMaxPercent: 120, // of specification limit
    minimumConcentrations: 5,
    correlationCoefficientMin: 0.999,
    yInterceptCriteria: 'y-intercept should not exceed ±25% of the response at the reporting threshold',
    residualAnalysis: 'Plot residuals vs. concentration; acceptable deviation < 15% at low concentrations',
  },
  impurities_limit: {
    rangeMinPercent: 0,
    rangeMaxPercent: 0,
    minimumConcentrations: 0,
    correlationCoefficientMin: 0,
    yInterceptCriteria: 'N/A — linearity not required for limit tests',
    residualAnalysis: 'N/A',
  },
  dissolution: {
    rangeMinPercent: 20, // from low Q range
    rangeMaxPercent: 120, // of label claim
    minimumConcentrations: 5,
    correlationCoefficientMin: 0.998,
    yInterceptCriteria: 'y-intercept evaluated; proportional response expected across dissolution range',
    residualAnalysis: 'Residual plot reviewed for non-linearity at extremes of dissolution range',
  },
  content_uniformity: {
    rangeMinPercent: 70,
    rangeMaxPercent: 130,
    minimumConcentrations: 5,
    correlationCoefficientMin: 0.998,
    yInterceptCriteria: 'y-intercept should not exceed 2% of the response at 100% label claim',
    residualAnalysis: 'Standard residual analysis',
  },
  biological_potency: {
    rangeMinPercent: 50,
    rangeMaxPercent: 150,
    minimumConcentrations: 5,
    correlationCoefficientMin: 0.995,
    yInterceptCriteria: 'Parallelism between dose-response curves of sample and reference standard must be demonstrated',
    residualAnalysis: 'Non-linear regression with appropriate model fit statistics (e.g., 4-parameter logistic)',
  },
};

/** Technique-specific robustness factors. */
const ROBUSTNESS_FACTORS: Record<AnalyticalTechnique, string[]> = {
  HPLC: [
    'Mobile phase composition (±2% organic modifier)',
    'pH of mobile phase (±0.2 units)',
    'Column temperature (±5°C)',
    'Flow rate (±10%)',
    'Detection wavelength (±2 nm)',
    'Column lot / manufacturer',
    'Sample preparation stability (bench-top, solution stability)',
    'Injection volume variation',
  ],
  GC: [
    'Column temperature program (±5°C)',
    'Carrier gas flow rate (±10%)',
    'Injection port temperature (±10°C)',
    'Detector temperature (±10°C)',
    'Split ratio variation',
    'Column lot / manufacturer',
    'Sample preparation solvent',
  ],
  CE: [
    'Buffer concentration (±10%)',
    'Buffer pH (±0.2 units)',
    'Applied voltage (±2 kV)',
    'Capillary temperature (±2°C)',
    'Injection time (±10%)',
    'Capillary lot / length',
  ],
  UV: [
    'Wavelength accuracy (±1 nm)',
    'Slit width',
    'Cell path length',
    'Solvent lot / grade',
    'Temperature of measurement',
  ],
  titration: [
    'Titrant concentration (±2%)',
    'Endpoint detection method sensitivity',
    'Stirring rate',
    'Temperature (±2°C)',
    'Electrode calibration',
  ],
  biological_assay: [
    'Cell passage number',
    'Incubation time (±10%)',
    'Incubation temperature (±1°C)',
    'Serum lot',
    'Reference standard preparation',
    'Plate reader parameters',
    'Analyst / operator',
  ],
  LCMS: [
    'Mobile phase composition (±2%)',
    'Ionization source temperature (±10°C)',
    'Cone voltage / Fragmentor voltage (±10%)',
    'Collision energy (±2 eV)',
    'Column temperature (±5°C)',
    'Flow rate (±10%)',
    'Source gas flow rates',
  ],
  ICP_MS: [
    'Plasma RF power (±50W)',
    'Nebulizer gas flow (±5%)',
    'Sample uptake rate',
    'Internal standard selection and concentration',
    'Rinse time between samples',
    'Torch position',
  ],
  Karl_Fischer: [
    'Reagent freshness / lot',
    'Stirring speed',
    'Electrode conditioning',
    'Sample weight accuracy',
    'Drift endpoint threshold',
    'Ambient humidity control',
  ],
  NIR: [
    'Number of scans',
    'Resolution (±2 cm⁻¹)',
    'Sample presentation (pathlength, packing)',
    'Temperature (±2°C)',
    'Reference background frequency',
    'Instrument lamp age / intensity',
  ],
};

// ── 2.3 Exported Function ──

export function validateAnalyticalMethod(params: AnalyticalMethodParams): AnalyticalMethodResult {
  const { methodType, technique } = params;

  const reqSet = VALIDATION_REQUIREMENTS_TABLE[methodType];

  // Build required parameters array
  const requiredParameters: ValidationParameter[] = [];

  // Specificity
  requiredParameters.push({
    parameter: 'Specificity / Selectivity',
    required: reqSet.specificity,
    acceptanceCriteria: reqSet.specificity
      ? 'No interference from placebo, degradation products, excipients at the analyte retention time / response'
      : 'N/A',
    numberOfDeterminations: reqSet.specificity
      ? 'Forced degradation (acid, base, oxidation, heat, light, humidity) — minimum 5 stress conditions'
      : 'N/A',
    details: reqSet.specificity
      ? 'Demonstrate peak purity (PDA or MS) for principal peak. Separation from all known related substances. Forced degradation typically 10-30% degradation.'
      : 'Not required for this method type.',
  });

  // Linearity
  requiredParameters.push({
    parameter: 'Linearity',
    required: reqSet.linearity,
    acceptanceCriteria: reqSet.linearity
      ? `Correlation coefficient (r) >= ${LINEARITY_RANGES[methodType].correlationCoefficientMin}; minimum ${LINEARITY_RANGES[methodType].minimumConcentrations} concentrations over ${LINEARITY_RANGES[methodType].rangeMinPercent}–${LINEARITY_RANGES[methodType].rangeMaxPercent}% range`
      : 'N/A',
    numberOfDeterminations: reqSet.linearity ? 'Minimum 5 concentrations, each in triplicate' : 'N/A',
    details: reqSet.linearity
      ? LINEARITY_RANGES[methodType].yInterceptCriteria
      : 'Not required for this method type.',
  });

  // Range
  requiredParameters.push({
    parameter: 'Range',
    required: reqSet.range,
    acceptanceCriteria: reqSet.range
      ? `${LINEARITY_RANGES[methodType].rangeMinPercent}%–${LINEARITY_RANGES[methodType].rangeMaxPercent}% of target concentration`
      : 'N/A',
    numberOfDeterminations: 'Derived from linearity, accuracy, and precision studies',
    details: reqSet.range
      ? 'Range is the interval between upper and lower concentrations for which linearity, accuracy, and precision have been demonstrated.'
      : 'Not required for this method type.',
  });

  // Accuracy
  requiredParameters.push({
    parameter: 'Accuracy',
    required: reqSet.accuracy,
    acceptanceCriteria: reqSet.accuracy
      ? methodType === 'assay_potency'
        ? 'Recovery 98.0–102.0% at each level; mean recovery 99.0–101.0%'
        : methodType === 'impurities_quantitative'
          ? 'Recovery 80–120% at LOQ level; 90–110% at higher levels'
          : 'Recovery within predefined acceptance criteria appropriate for the method'
      : 'N/A',
    numberOfDeterminations: reqSet.accuracy
      ? '9 determinations across 3 concentration levels (3 replicates each), or 6 determinations at 100% of target'
      : 'N/A',
    details: reqSet.accuracy
      ? 'Determined by spiking known amounts of analyte into placebo matrix or by comparison to an independent validated method.'
      : 'Not required for this method type.',
  });

  // Repeatability (Precision)
  requiredParameters.push({
    parameter: 'Precision — Repeatability',
    required: reqSet.repeatability,
    acceptanceCriteria: reqSet.repeatability
      ? methodType === 'assay_potency'
        ? 'RSD <= 2.0% (6 determinations at 100% or 9 determinations across 3 levels)'
        : methodType === 'biological_potency'
          ? 'RSD <= 10% (may be higher depending on biological assay inherent variability)'
          : 'RSD <= 5.0%'
      : 'N/A',
    numberOfDeterminations: reqSet.repeatability
      ? 'Minimum 6 determinations at 100% of test concentration, or 9 determinations (3 levels x 3 replicates)'
      : 'N/A',
    details: reqSet.repeatability
      ? 'Same analyst, same instrument, same day, short time interval.'
      : 'Not required for this method type.',
  });

  // Intermediate precision
  requiredParameters.push({
    parameter: 'Precision — Intermediate Precision',
    required: reqSet.intermediatePrecision,
    acceptanceCriteria: reqSet.intermediatePrecision
      ? methodType === 'assay_potency'
        ? 'RSD <= 3.0% across all conditions; individual results within ±2.0% of mean'
        : 'RSD <= 5.0% across all conditions (or as justified based on method type)'
      : 'N/A',
    numberOfDeterminations: reqSet.intermediatePrecision
      ? 'Minimum 12 determinations: 2 analysts x 2 days x 3 replicates'
      : 'N/A',
    details: reqSet.intermediatePrecision
      ? 'Vary: different analyst, different day, different instrument (if applicable). Report individual and pooled RSD.'
      : 'Not required for this method type.',
  });

  // LOD
  requiredParameters.push({
    parameter: 'Limit of Detection (LOD)',
    required: reqSet.lod,
    acceptanceCriteria: reqSet.lod
      ? 'S/N >= 3:1 (signal-to-noise), or based on standard deviation of response and slope (LOD = 3.3 * sigma / S)'
      : 'N/A',
    numberOfDeterminations: reqSet.lod ? 'Minimum 3 independent determinations at LOD level' : 'N/A',
    details: reqSet.lod
      ? 'Approaches: visual evaluation, S/N ratio, standard deviation of blank, or standard deviation of regression line.'
      : 'Not required for this method type.',
  });

  // LOQ
  requiredParameters.push({
    parameter: 'Limit of Quantitation (LOQ)',
    required: reqSet.loq,
    acceptanceCriteria: reqSet.loq
      ? 'S/N >= 10:1; precision RSD <= 10% and accuracy 80–120% at LOQ concentration'
      : 'N/A',
    numberOfDeterminations: reqSet.loq ? 'Minimum 6 independent determinations at LOQ level' : 'N/A',
    details: reqSet.loq
      ? 'LOQ = 10 * sigma / S. Must demonstrate acceptable precision and accuracy at the LOQ level.'
      : 'Not required for this method type.',
  });

  // Robustness
  requiredParameters.push({
    parameter: 'Robustness',
    required: reqSet.robustness,
    acceptanceCriteria: reqSet.robustness
      ? 'Method performance remains within acceptance criteria under deliberate small variations of method parameters'
      : 'N/A',
    numberOfDeterminations: reqSet.robustness
      ? 'Fractional factorial or Plackett-Burman design; typically 8-16 experiments'
      : 'N/A',
    details: reqSet.robustness
      ? 'Evaluate the effect of deliberate small changes in method parameters on results. Identify parameters requiring system suitability controls.'
      : 'Not required for this method type.',
  });

  // ── Precision levels ──
  const precisionLevels: PrecisionLevels = {
    repeatability: {
      required: reqSet.repeatability,
      rsdMax: methodType === 'assay_potency' ? 2.0 : methodType === 'biological_potency' ? 10.0 : 5.0,
      numberOfDeterminations: 6,
      details: 'Same analyst, same equipment, same laboratory, short interval between measurements.',
    },
    intermediatePrecision: {
      required: reqSet.intermediatePrecision,
      factors: ['Different analyst', 'Different day', 'Different instrument (where applicable)'],
      rsdMax: methodType === 'assay_potency' ? 3.0 : methodType === 'biological_potency' ? 15.0 : 5.0,
      details:
        'Typical experimental design: 2 analysts x 2 days x 3 replicates = 12 determinations minimum.',
    },
    reproducibility: {
      required: false,
      details:
        'Reproducibility (inter-laboratory) is typically assessed during method transfer or pharmacopeial collaborative studies, not during initial validation.',
    },
  };

  // ── System suitability ──
  const systemSuitability: SystemSuitabilityParams =
    technique === 'HPLC' || technique === 'LCMS'
      ? {
          resolutionMin: 2.0,
          tailingFactorMax: 2.0,
          plateCountMin: 2000,
          rsdMaxPercent: 2.0,
          numberOfInjections: 5,
          details: [
            'Resolution (Rs) >= 2.0 between analyte peak and nearest eluting peak',
            'Tailing factor (T) <= 2.0 for analyte peak (USP definition)',
            'Theoretical plate count (N) >= 2000 for analyte peak',
            'RSD of peak area <= 2.0% for 5 replicate standard injections (6 for assay)',
            'Inject blank and placebo to verify no interference',
          ],
        }
      : technique === 'GC'
        ? {
            resolutionMin: 1.5,
            tailingFactorMax: 2.0,
            plateCountMin: 1000,
            rsdMaxPercent: 5.0,
            numberOfInjections: 5,
            details: [
              'Resolution (Rs) >= 1.5 between analyte and nearest peak',
              'Tailing factor <= 2.0',
              'Column efficiency >= 1000 theoretical plates',
              'RSD of peak area <= 5.0% for 5 replicate injections',
              'Blank injection to confirm no carryover',
            ],
          }
        : technique === 'CE'
          ? {
              resolutionMin: 1.5,
              tailingFactorMax: 2.5,
              plateCountMin: 50000,
              rsdMaxPercent: 5.0,
              numberOfInjections: 5,
              details: [
                'CE offers very high plate counts (typically > 100,000)',
                'Migration time RSD <= 2.0%',
                'Peak area RSD <= 5.0% for replicate injections',
                'Current stability during run',
              ],
            }
          : {
              resolutionMin: 0,
              tailingFactorMax: 0,
              plateCountMin: 0,
              rsdMaxPercent: methodType === 'biological_potency' ? 15.0 : 5.0,
              numberOfInjections: technique === 'biological_assay' ? 3 : 5,
              details: [
                `System suitability criteria for ${technique}: verify instrument performance per method SOP`,
                'Check standard response consistency across replicate determinations',
                'Verify calibration/qualification of equipment per pharmacopeial requirements',
              ],
            };

  // ── Robustness factors ──
  const robustnessFactors = ROBUSTNESS_FACTORS[technique];

  // ── Citations ──
  const citations = [
    'ICH Q2(R2) — Validation of Analytical Procedures (2022, Step 4)',
    'ICH Q14 — Analytical Procedure Development (2022, Step 4)',
    'USP <1225> — Validation of Compendial Procedures',
    'USP <621> — Chromatography, System Suitability',
    'Ph. Eur. 2.2.46 — Chromatographic Separation Techniques',
  ];

  return {
    requiredParameters,
    linearityRequirements: LINEARITY_RANGES[methodType],
    precisionLevels,
    robustnessFactors,
    systemSuitability,
    citations,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 3 — Impurity Classification (ICH Q3A/Q3B/Q3C/Q3D)
// ─────────────────────────────────────────────────────────────────────────────

// ── 3.1 Interfaces ──

export type ImpurityType = 'organic' | 'inorganic' | 'residual_solvent' | 'elemental';
export type ImpurityContext = 'drug_substance' | 'drug_product';

export interface ImpurityClassificationParams {
  impurityType: ImpurityType;
  maximumDailyDose_mg: number;
  context: ImpurityContext;
  solventName?: string;
  elementName?: string;
  route?: 'oral' | 'parenteral' | 'inhalation' | 'topical';
}

export interface ThresholdEntry {
  value: string;
  unit: string;
  basis: string;
}

export interface SolventClassification {
  class: number;
  pde_mg_per_day: number;
  concentrationLimit_ppm: number;
  rationale: string;
}

export interface ElementalClassification {
  class: string;
  oralPDE_ug_per_day: number;
  parenteralPDE_ug_per_day: number;
  inhalationPDE_ug_per_day: number;
  rationale: string;
}

export interface ImpurityClassificationResult {
  reportingThreshold: ThresholdEntry;
  identificationThreshold: ThresholdEntry;
  qualificationThreshold: ThresholdEntry;
  qualificationStrategy: string[];
  solventClassification?: SolventClassification;
  elementalClassification?: ElementalClassification;
  mutagenicImpurityNote: string;
  citations: string[];
}

/* ── ICH Q3A / Q3B thresholds ─────────────────────────────────────────────────
   Deliberately NOT restated here. services/global-ri/impurities-thresholds owns
   the tables; this module reads them through resolveImpurityThresholds. The
   copy that used to live here disagreed with the guideline in the Q3B rows and
   fell open through a band gap in the Q3A rows. */

// ── 3.4 / 3.5 Reference Data — ICH Q3C and Q3D ──
//
// DELETED. These two sections held private copies of the ICH Q3C(R8)
// residual-solvent and Q3D(R2) elemental-impurity tables. They disagreed in
// membership with the catalog in server/services/global-ri/impurities-thresholds.ts,
// both were partial, and the partiality was not the worst of it:
//
//   - A solvent this table did not recognise was answered "5000 ppm (Class 3
//     default)" with an ICH Q3C(R8) citation attached. Benzene is Class 1 at
//     2 ppm, so any misspelling — or any real solvent outside a partial list —
//     produced a limit 2500x too permissive, presented as the guideline's own
//     answer, in a governed path.
//   - The Q3D branch read `route || 'oral'`, so a record with no route of
//     administration was assessed against the oral PDE, which is the most
//     permissive of the three for most elements.
//
// The catalog now lives in ONE place, is materially complete, and REFUSES the
// cases these defaults covered. classifyImpurity below reads it.

// ── 3.6 Exported Function ──

export function classifyImpurity(params: ImpurityClassificationParams): ImpurityClassificationResult {
  const {
    impurityType,
    maximumDailyDose_mg,
    context,
    solventName,
    elementName,
    route,
  } = params;

  let reportingThreshold: ThresholdEntry;
  let identificationThreshold: ThresholdEntry;
  let qualificationThreshold: ThresholdEntry;
  let qualificationStrategy: string[];
  let solventClassification: SolventClassification | undefined;
  let elementalClassification: ElementalClassification | undefined;

  // ── Organic impurities (Q3A / Q3B) ──
  if (impurityType === 'organic') {
    /* The ICH tables live in services/global-ri/impurities-thresholds, which is
       their single source. The copy that used to sit in this file had a band
       gap (its second Q3A row started at 2000.01, so a dose of exactly 2000.5
       matched nothing and FELL THROUGH to a hardcoded "default" — a fabricated
       threshold under this repo's fail-closed rule) and a Q3B table that
       invented five reporting bands where Q3B has two and returned the wrong
       qualification threshold above 2 g. Both are deleted; this reads the
       canonical table, and a dose it cannot key a threshold to is now a
       refusal rather than a default. */
    const resolved = resolveImpurityThresholds({
      matrix: context === 'drug_substance' ? 'drug_substance' : 'drug_product',
      maxDailyDoseMg: maximumDailyDose_mg,
      impurityClass: 'organic',
    });
    const basis = context === 'drug_substance' ? 'ICH Q3A(R2)' : 'ICH Q3B(R2)';
    if (resolved.ok) {
      reportingThreshold = { value: resolved.reporting.expression, unit: '% (w/w) or TDI', basis };
      identificationThreshold = { value: resolved.identification.expression, unit: '% (w/w) or TDI', basis };
      qualificationThreshold = { value: resolved.qualification.expression, unit: '% (w/w) or TDI', basis };
    } else {
      const refusal = `Not established — ${resolved.message}`;
      reportingThreshold = { value: refusal, unit: 'not established', basis };
      identificationThreshold = { value: refusal, unit: 'not established', basis };
      qualificationThreshold = { value: refusal, unit: 'not established', basis };
    }

    qualificationStrategy = [
      'Conduct toxicological qualification per ICH Q3A(R2)/Q3B(R2) decision tree',
      'Option 1: Literature search for published safety data on the impurity or structural class',
      'Option 2: Structure-based assessment — (Q)SAR for mutagenicity (ICH M7 if flagged)',
      'Option 3: Comparative in vivo studies if impurity found in drug substance used in safety studies',
      'Option 4: Targeted toxicological study (e.g., Ames test, 90-day repeated dose)',
      'Threshold of Toxicological Concern (TTC) approach: 1.5 ug/day for mutagenic impurities (ICH M7)',
    ];
  }
  // ── Residual solvents (Q3C) ──
  else if (impurityType === 'residual_solvent') {
    const solvent = getResidualSolvent(String(solventName ?? ''));

    if (solvent) {
      solventClassification = {
        class: solvent.class,
        pde_mg_per_day: solvent.pdeMgPerDay ?? 0,
        concentrationLimit_ppm: solvent.concentrationLimitPpm,
        rationale:
          solvent.class === 1
            ? 'ICH Q3C(R8) Class 1 — to be avoided; presence requires justification even below the concentration limit.'
            : solvent.class === 2
              ? 'ICH Q3C(R8) Class 2 — limited by permitted daily exposure; the ppm figure is the Option 1 concentration limit.'
              : 'ICH Q3C(R8) Class 3 — low toxic potential; 50 mg/day (5000 ppm) unless a higher level is justified.',
      };
      reportingThreshold = {
        value: `${solvent.concentrationLimitPpm} ppm`,
        unit: 'ppm',
        basis: `ICH Q3C(R8) Class ${solvent.class}`,
      };
      identificationThreshold = {
        value: solvent.class === 1 ? 'Must be identified and quantified' : `${solvent.concentrationLimitPpm} ppm`,
        unit: 'ppm',
        basis: `ICH Q3C(R8) Class ${solvent.class}`,
      };
      qualificationThreshold = {
        value: solvent.pdeMgPerDay === null
          ? 'Class 1 — no PDE; the solvent is to be avoided'
          : `PDE: ${solvent.pdeMgPerDay} mg/day`,
        unit: solvent.pdeMgPerDay === null ? 'not applicable' : 'mg/day',
        basis: `ICH Q3C(R8) Class ${solvent.class}`,
      };
    } else {
      /* REFUSAL, not a default. This branch used to answer "5000 ppm (Class 3
         default)" — the most permissive band in the guideline — for anything the
         table did not recognise, so a misspelt Class 1 solvent came back as one
         of the safest, with an ICH citation on it. */
      const named = String(solventName ?? '').trim();
      const refusal = named
        ? `"${named}" is not in the ICH Q3C(R8) catalog, so its class and limit are not established. Q3C requires a solvent outside its tables to be justified on its own toxicological data.`
        : 'No solvent is named, so no ICH Q3C class or limit is established for this record.';
      const basis = 'ICH Q3C(R8) — not established';
      reportingThreshold = { value: refusal, unit: 'not established', basis };
      identificationThreshold = { value: refusal, unit: 'not established', basis };
      qualificationThreshold = { value: refusal, unit: 'not established', basis };
    }

    qualificationStrategy = [
      'Class 1 solvents: should not be used; justify if unavoidable and keep below PDE',
      'Class 2 solvents: limit to PDE or concentration limit; use Option 1 (concentration-based) or Option 2 (daily dose-based)',
      'Class 3 solvents: limit to 5000 ppm each (or 50 mg/day), loss on drying may suffice if only Class 3 solvents used',
      'Analytical method: typically headspace GC per USP <467> / Ph. Eur. 2.4.24',
    ];
  }
  // ── Elemental impurities (Q3D) ──
  else if (impurityType === 'elemental') {
    const element = findElementalImpurity(String(elementName ?? ''));

    if (!element) {
      const named = String(elementName ?? '').trim();
      const refusal = named
        ? `"${named}" is not in the ICH Q3D(R2) catalog, so its permitted daily exposure is not established — derive and justify a PDE on its own data.`
        : 'No element is named, so no ICH Q3D permitted daily exposure is established for this record.';
      const basis = 'ICH Q3D(R2) — not established';
      reportingThreshold = { value: refusal, unit: 'not established', basis };
      identificationThreshold = { value: refusal, unit: 'not established', basis };
      qualificationThreshold = { value: refusal, unit: 'not established', basis };
    } else if (!route) {
      /* REFUSAL, not `route || 'oral'`. Q3D sets a different PDE per route and
         the spread is large — cadmium is 5 ug/day oral against 2 parenteral,
         vanadium 100 oral against 1 by inhalation — so defaulting to oral takes
         the most permissive of the three for most elements. */
      const refusal =
        `The route of administration is not recorded, so no ICH Q3D permitted daily exposure can be selected for ${element.name}: ` +
        `${element.pdeMicrogramsPerDay.oral} ug/day oral, ${element.pdeMicrogramsPerDay.parenteral} parenteral, ` +
        `${element.pdeMicrogramsPerDay.inhalation} by inhalation.`;
      const basis = 'ICH Q3D(R2) — route not recorded';
      elementalClassification = {
        class: element.class,
        oralPDE_ug_per_day: element.pdeMicrogramsPerDay.oral,
        parenteralPDE_ug_per_day: element.pdeMicrogramsPerDay.parenteral,
        inhalationPDE_ug_per_day: element.pdeMicrogramsPerDay.inhalation,
        rationale: `ICH Q3D(R2) ${element.class}. The permitted daily exposure depends on the route, which is not recorded.`,
      };
      reportingThreshold = { value: refusal, unit: 'not established', basis };
      identificationThreshold = { value: refusal, unit: 'not established', basis };
      qualificationThreshold = { value: refusal, unit: 'not established', basis };
    } else {
      const pde = element.pdeMicrogramsPerDay[route as AdministrationRoute];
      elementalClassification = {
        class: element.class,
        oralPDE_ug_per_day: element.pdeMicrogramsPerDay.oral,
        parenteralPDE_ug_per_day: element.pdeMicrogramsPerDay.parenteral,
        inhalationPDE_ug_per_day: element.pdeMicrogramsPerDay.inhalation,
        rationale: `ICH Q3D(R2) ${element.class}; permitted daily exposure taken for the recorded ${route} route.`,
      };
      reportingThreshold = {
        value: `${pde} ug/day (${route} PDE)`,
        unit: 'ug/day',
        basis: `ICH Q3D(R2) ${element.class}`,
      };
      identificationThreshold = {
        value: `Control threshold at 30% of PDE = ${(pde * 0.3).toFixed(1)} ug/day (${route})`,
        unit: 'ug/day',
        basis: 'ICH Q3D(R2) — control threshold',
      };
      qualificationThreshold = {
        value: `PDE: ${pde} ug/day (${route})`,
        unit: 'ug/day',
        basis: `ICH Q3D(R2) ${element.class}`,
      };
    }

    qualificationStrategy = [
      'Perform risk assessment per ICH Q3D(R2) to identify potential elemental impurity sources',
      'Sources to evaluate: drug substance synthesis (catalysts, reagents), excipients, container closure, manufacturing equipment, water',
      'Class 1 elements: must always be evaluated regardless of likelihood of occurrence',
      'Class 2A elements: evaluate based on probability of use in manufacturing process',
      'Class 2B elements: evaluate only if intentionally added or known to be present',
      'Class 3 elements: evaluate for oral and parenteral routes; generally low toxicity',
      'Analytical method: ICP-MS or ICP-OES per USP <232>/<233> or Ph. Eur. 2.4.20',
      'Control strategy options: component testing, periodic verification, in-process controls',
    ];
  }
  // ── Inorganic impurities ──
  else {
    reportingThreshold = { value: 'Per pharmacopeial specification or 0.1%', unit: '% (w/w)', basis: 'ICH Q3A(R2) / Pharmacopeial monograph' };
    identificationThreshold = { value: 'Per pharmacopeial specification', unit: '% (w/w)', basis: 'Pharmacopeial monograph' };
    qualificationThreshold = { value: 'Per pharmacopeial specification', unit: '% (w/w)', basis: 'Pharmacopeial monograph' };
    qualificationStrategy = [
      'Identify inorganic impurities by pharmacopeial tests (heavy metals, sulfated ash, residue on ignition)',
      'Common tests: USP <231> (heavy metals — withdrawn), USP <232>/<233> (elemental impurities), sulfated ash (Ph. Eur. 2.4.14)',
      'Residue on ignition (USP <281>) typically NMT 0.1% for drug substances',
      'Metal catalysts or heavy metal reagents: assess per ICH Q3D for individual elements',
    ];
  }

  // ── Mutagenic impurity note (ICH M7) ──
  const mutagenicImpurityNote =
    'ICH M7(R2) applies to mutagenic impurities in drug substances and drug products. ' +
    'Threshold of Toxicological Concern (TTC) = 1.5 ug/day for lifetime exposure. ' +
    'Less-than-lifetime (LTL) exposure adjustments: <= 1 month: 120 ug/day; > 1-12 months: 20 ug/day; > 1-10 years: 10 ug/day; > 10 years: 1.5 ug/day. ' +
    'Impurities are classified into 5 classes per ICH M7: Class 1 (known mutagenic carcinogen), Class 2 (known mutagen, unknown carcinogenicity), ' +
    'Class 3 (alerting structure, no mutagenicity data), Class 4 (alerting structure but negative Ames), Class 5 (no structural alerts). ' +
    'In silico (Q)SAR assessment using two complementary methodologies (expert rule-based and statistical-based) is the initial screen.';

  // ── Citations ──
  const citations: string[] = [
    'ICH Q3A(R2) — Impurities in New Drug Substances (2006)',
    'ICH Q3B(R2) — Impurities in New Drug Products (2006)',
    'ICH Q3C(R8) — Residual Solvents (2021)',
    'ICH Q3D(R2) — Elemental Impurities (2022)',
    'ICH M7(R2) — Assessment and Control of DNA Reactive (Mutagenic) Impurities (2023)',
  ];

  if (impurityType === 'elemental') {
    citations.push('USP <232> — Elemental Impurities — Limits');
    citations.push('USP <233> — Elemental Impurities — Procedures');
  }
  if (impurityType === 'residual_solvent') {
    citations.push('USP <467> — Residual Solvents');
    citations.push('Ph. Eur. 2.4.24 — Identification and Control of Residual Solvents');
  }

  return {
    reportingThreshold,
    identificationThreshold,
    qualificationThreshold,
    qualificationStrategy,
    solventClassification,
    elementalClassification,
    mutagenicImpurityNote,
    citations,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 4 — Specification Setting (ICH Q6A / Q6B)
// ─────────────────────────────────────────────────────────────────────────────

// ── 4.1 Interfaces ──

export type SpecProductType = 'small_molecule' | 'biological' | 'herbal';

export interface SpecificationParams {
  productType: SpecProductType;
  dosageForm: string;
  route: RouteOfAdministration;
  compendialStatus: 'compendial' | 'non_compendial';
  developmentDataSummary?: string;
}

export interface TestEntry {
  test: string;
  required: boolean;
  rationale: string;
}

export interface SpecificTestEntry {
  test: string;
  required: boolean;
  applicableCondition: string;
  rationale: string;
}

export interface DecisionTreeEntry {
  name: string;
  applicable: boolean;
  recommendation: string;
  rationale: string;
}

export interface CompendialRequirements {
  status: string;
  implications: string[];
  pharmacopeia: string[];
}

export interface SpecificationLimits {
  approach: string;
  factors: string[];
}

export interface SpecificationResult {
  universalTests: TestEntry[];
  specificTests: SpecificTestEntry[];
  decisionTrees: DecisionTreeEntry[];
  biologicalTests: TestEntry[];
  specificationLimits: SpecificationLimits;
  compendialRequirements: CompendialRequirements;
  citations: string[];
}

// ── 4.2 Reference Data ──

/** ICH Q6A universal tests applicable to all drug substances and drug products. */
const UNIVERSAL_TESTS_DRUG_SUBSTANCE: TestEntry[] = [
  { test: 'Description / Appearance', required: true, rationale: 'Visual inspection for physical form, color, and clarity. Q6A Section 3.1.1.' },
  { test: 'Identification', required: true, rationale: 'Two independent tests recommended (e.g., IR + HPLC RT). Q6A Section 3.1.2.' },
  { test: 'Assay', required: true, rationale: 'Quantitative determination of the drug substance. Specific, stability-indicating method. Q6A Section 3.1.3.' },
  { test: 'Impurities — Organic', required: true, rationale: 'Individual and total impurities per ICH Q3A thresholds. Q6A Section 3.1.4.' },
  { test: 'Impurities — Inorganic', required: true, rationale: 'Residue on ignition, heavy metals (now elemental impurities per Q3D). Q6A Section 3.1.4.' },
  { test: 'Impurities — Residual Solvents', required: true, rationale: 'Per ICH Q3C classification. Q6A Section 3.1.4.' },
];

const UNIVERSAL_TESTS_DRUG_PRODUCT: TestEntry[] = [
  { test: 'Description / Appearance', required: true, rationale: 'Visual inspection. Q6A Section 3.2.1.' },
  { test: 'Identification', required: true, rationale: 'At least one specific test (e.g., HPLC RT, IR). Q6A Section 3.2.2.' },
  { test: 'Assay', required: true, rationale: 'Specific, stability-indicating assay. Q6A Section 3.2.3.' },
  { test: 'Impurities — Degradation Products', required: true, rationale: 'Individual and total degradation products per ICH Q3B. Q6A Section 3.2.4.' },
];

/** Q6B tests for biological products. */
const BIOLOGICAL_PRODUCT_TESTS: TestEntry[] = [
  { test: 'Amino Acid Composition / Sequence', required: true, rationale: 'Primary structure confirmation. Q6B Section III.A.' },
  { test: 'Peptide Map', required: true, rationale: 'Sequence and post-translational modification confirmation. Q6B Section III.A.' },
  { test: 'Disulfide Bond Analysis', required: true, rationale: 'Higher-order structure element. Q6B Section III.A.' },
  { test: 'Glycosylation Profile', required: true, rationale: 'Carbohydrate content, glycan mapping, sialic acid. Q6B Section III.A.' },
  { test: 'Molecular Weight / Size Variants', required: true, rationale: 'SEC-HPLC for aggregates, fragments. Q6B Section III.B.' },
  { test: 'Charge Variants', required: true, rationale: 'IEF or cIEF for acidic/basic variants. Q6B Section III.B.' },
  { test: 'Biological Activity / Potency', required: true, rationale: 'Cell-based or binding assay relative to reference standard. Q6B Section III.C.' },
  { test: 'Purity (Process-Related)', required: true, rationale: 'Host cell protein (HCP), host cell DNA, Protein A (if applicable). Q6B Section III.D.' },
  { test: 'Sterility', required: true, rationale: 'USP <71> or equivalent. Q6B Section III.E.' },
  { test: 'Endotoxin', required: true, rationale: 'LAL test per USP <85>. Q6B Section III.E.' },
  { test: 'General Properties (pH, appearance, osmolality)', required: true, rationale: 'Physicochemical properties. Q6B Section III.F.' },
];

/** Dosage-form-specific test requirements derived from Q6A decision trees. */
interface DosageFormTestSet {
  tests: SpecificTestEntry[];
}

const DOSAGE_FORM_SPECIFIC_TESTS: Record<string, DosageFormTestSet> = {
  tablet: {
    tests: [
      { test: 'Dissolution', required: true, applicableCondition: 'All oral solid dosage forms', rationale: 'Q6A Decision Tree #7. Discriminating dissolution method required.' },
      { test: 'Disintegration', required: false, applicableCondition: 'May replace dissolution if correlation demonstrated (Q6A DT #7)', rationale: 'Only if complete disintegration is demonstrated in < 15 min across 3 pH values.' },
      { test: 'Hardness / Crushing strength', required: true, applicableCondition: 'All tablets', rationale: 'In-process control; may be release test.' },
      { test: 'Friability', required: true, applicableCondition: 'All uncoated tablets', rationale: 'USP <1216>. NMT 1.0% weight loss.' },
      { test: 'Uniformity of Dosage Units', required: true, applicableCondition: 'All dosage units', rationale: 'USP <905> / Ph. Eur. 2.9.40. Content uniformity or weight variation.' },
      { test: 'Water Content', required: true, applicableCondition: 'Hygroscopic products or moisture-sensitive APIs', rationale: 'Q6A Decision Tree #1. Karl Fischer or LOD.' },
      { test: 'Microbial Limits', required: true, applicableCondition: 'Non-sterile oral products', rationale: 'USP <61>/<62>. TAMC/TYMC + specified organisms.' },
    ],
  },
  capsule: {
    tests: [
      { test: 'Dissolution', required: true, applicableCondition: 'All oral solid dosage forms', rationale: 'Q6A Decision Tree #7.' },
      { test: 'Uniformity of Dosage Units', required: true, applicableCondition: 'All dosage units', rationale: 'USP <905>.' },
      { test: 'Water Content', required: true, applicableCondition: 'All capsule products', rationale: 'Critical for shell integrity; gelatin cross-linking.' },
      { test: 'Microbial Limits', required: true, applicableCondition: 'Non-sterile oral products', rationale: 'USP <61>/<62>.' },
      { test: 'Brittleness / Shell Integrity', required: false, applicableCondition: 'Hard gelatin or HPMC capsules', rationale: 'Visual or instrumental check.' },
    ],
  },
  solution: {
    tests: [
      { test: 'pH', required: true, applicableCondition: 'All solutions', rationale: 'Critical for stability and compatibility.' },
      { test: 'Preservative Content', required: true, applicableCondition: 'Multi-dose liquid products', rationale: 'Antimicrobial preservative effectiveness (AET) per USP <51>.' },
      { test: 'Extractables / Leachables', required: true, applicableCondition: 'Products in plastic or elastomeric containers', rationale: 'Q6A DT #2.' },
      { test: 'Microbial Limits / Sterility', required: true, applicableCondition: 'Route-dependent', rationale: 'Sterility for parenterals (USP <71>); microbial limits for oral (USP <61>/<62>).' },
      { test: 'Particulate Matter', required: true, applicableCondition: 'Parenteral and ophthalmic solutions', rationale: 'USP <788> / <789>.' },
      { test: 'Osmolality', required: false, applicableCondition: 'Parenteral and ophthalmic solutions', rationale: 'Critical for patient safety.' },
    ],
  },
  suspension: {
    tests: [
      { test: 'pH', required: true, applicableCondition: 'All suspensions', rationale: 'Affects stability and resuspendability.' },
      { test: 'Viscosity', required: true, applicableCondition: 'All suspensions', rationale: 'Impacts drug delivery and patient compliance.' },
      { test: 'Particle Size Distribution', required: true, applicableCondition: 'All suspensions', rationale: 'Q6A Decision Tree #3. Affects dissolution and bioavailability.' },
      { test: 'Resuspendability', required: true, applicableCondition: 'All suspensions', rationale: 'Dose uniformity depends on adequate resuspension.' },
      { test: 'Content Uniformity / Delivered Dose', required: true, applicableCondition: 'All suspensions', rationale: 'Ensure uniform dosing.' },
      { test: 'Preservative Content', required: true, applicableCondition: 'Multi-dose formulations', rationale: 'USP <51> AET.' },
      { test: 'Microbial Limits', required: true, applicableCondition: 'Non-sterile products', rationale: 'USP <61>/<62>.' },
    ],
  },
  injection: {
    tests: [
      { test: 'Sterility', required: true, applicableCondition: 'All parenteral products', rationale: 'USP <71>. Mandatory for all injectable products.' },
      { test: 'Endotoxin / Pyrogen', required: true, applicableCondition: 'All parenteral products', rationale: 'USP <85> LAL or USP <151> rabbit pyrogen test.' },
      { test: 'Particulate Matter', required: true, applicableCondition: 'All parenteral products', rationale: 'USP <788>. Sub-visible particles per injection volume.' },
      { test: 'pH', required: true, applicableCondition: 'All parenteral solutions', rationale: 'Critical for patient safety and stability.' },
      { test: 'Osmolality', required: true, applicableCondition: 'IV infusions and large-volume parenterals', rationale: 'Patient safety for IV administration.' },
      { test: 'Container Closure Integrity', required: true, applicableCondition: 'All parenteral products', rationale: 'Maintain sterility throughout shelf life. USP <1207>.' },
      { test: 'Extractables / Leachables', required: true, applicableCondition: 'Products in contact with elastomeric or plastic components', rationale: 'Safety concern for parenteral exposure.' },
      { test: 'Volume in Container', required: true, applicableCondition: 'All injectable products', rationale: 'Ensure adequate volume for withdrawal.' },
    ],
  },
  cream: {
    tests: [
      { test: 'pH', required: true, applicableCondition: 'All semi-solid products', rationale: 'Affects stability and skin compatibility.' },
      { test: 'Viscosity', required: true, applicableCondition: 'All semi-solid products', rationale: 'Product performance and patient acceptability.' },
      { test: 'Homogeneity / Content Uniformity', required: true, applicableCondition: 'All semi-solid products', rationale: 'Ensure uniform API distribution.' },
      { test: 'Particle Size', required: true, applicableCondition: 'Suspensions in semi-solid matrix', rationale: 'Q6A DT #3. Affects drug release.' },
      { test: 'In Vitro Drug Release (IVRT)', required: true, applicableCondition: 'Topical semi-solids (FDA guidance)', rationale: 'Product performance test; Franz diffusion cell.' },
      { test: 'Preservative Content / AET', required: true, applicableCondition: 'Multi-dose semi-solids', rationale: 'USP <51> antimicrobial effectiveness.' },
      { test: 'Microbial Limits', required: true, applicableCondition: 'Non-sterile topical products', rationale: 'USP <61>/<62>.' },
    ],
  },
  ointment: {
    tests: [
      { test: 'Viscosity / Penetration', required: true, applicableCondition: 'All ointments', rationale: 'Product consistency and performance.' },
      { test: 'Homogeneity', required: true, applicableCondition: 'All ointments', rationale: 'Uniform API distribution.' },
      { test: 'In Vitro Drug Release (IVRT)', required: true, applicableCondition: 'Topical ointments', rationale: 'FDA draft guidance for topical products.' },
      { test: 'Microbial Limits', required: true, applicableCondition: 'Non-sterile products', rationale: 'USP <61>/<62>.' },
      { test: 'Water Content', required: true, applicableCondition: 'Water-containing ointment bases', rationale: 'Stability and consistency.' },
    ],
  },
  lyophilized: {
    tests: [
      { test: 'Reconstitution Time', required: true, applicableCondition: 'All lyophilized products', rationale: 'Practical for clinical use.' },
      { test: 'Residual Moisture', required: true, applicableCondition: 'All lyophilized products', rationale: 'Critical for stability; typically NMT 2-3%.' },
      { test: 'Cake Appearance / Integrity', required: true, applicableCondition: 'All lyophilized products', rationale: 'Collapse, meltback, or shrinkage indicate process issues.' },
      { test: 'Sterility', required: true, applicableCondition: 'All lyophilized injectables', rationale: 'USP <71>.' },
      { test: 'Endotoxin', required: true, applicableCondition: 'All lyophilized injectables', rationale: 'USP <85>.' },
      { test: 'Particulate Matter (reconstituted)', required: true, applicableCondition: 'All lyophilized injectables', rationale: 'USP <788> after reconstitution.' },
      { test: 'pH (reconstituted)', required: true, applicableCondition: 'All lyophilized injectables', rationale: 'Ensure appropriate pH after reconstitution.' },
      { test: 'Container Closure Integrity', required: true, applicableCondition: 'All lyophilized products', rationale: 'USP <1207>. Stopper and crimp seal integrity.' },
    ],
  },
  inhaler: {
    tests: [
      { test: 'Delivered Dose Uniformity (DDU)', required: true, applicableCondition: 'All inhalation products', rationale: 'USP <601>. Through container life and at multiple flow rates.' },
      { test: 'Aerodynamic Particle Size Distribution (APSD)', required: true, applicableCondition: 'All inhalation products', rationale: 'USP <601>. Andersen cascade impactor or NGI.' },
      { test: 'Number of Actuations', required: true, applicableCondition: 'All metered-dose products', rationale: 'Tail-off profile assessment.' },
      { test: 'Spray Pattern / Plume Geometry', required: true, applicableCondition: 'Nasal sprays and oral inhalers', rationale: 'FDA guidance for nasal/inhalation products.' },
      { test: 'Leak Rate', required: true, applicableCondition: 'Pressurized MDIs', rationale: 'Propellant leak rate affects product life.' },
      { test: 'Moisture Content', required: true, applicableCondition: 'DPIs', rationale: 'Affects powder aerosolization performance.' },
      { test: 'Microbial Limits', required: true, applicableCondition: 'All inhalation products', rationale: 'Stringent limits for pulmonary delivery.' },
      { test: 'Foreign Particulate Matter', required: true, applicableCondition: 'All inhalation products', rationale: 'Safety concern for pulmonary administration.' },
    ],
  },
  patch: {
    tests: [
      { test: 'In Vitro Drug Release Rate', required: true, applicableCondition: 'All transdermal systems', rationale: 'Product performance test. USP <724> apparatus 5, 6, or 7.' },
      { test: 'Peel Adhesion', required: true, applicableCondition: 'All transdermal patches', rationale: 'Adhesive performance. ASTM or USP methods.' },
      { test: 'Tack', required: false, applicableCondition: 'Patches where initial adhesion is critical', rationale: 'Probe tack or loop tack test.' },
      { test: 'Drug Content / Assay', required: true, applicableCondition: 'All patches', rationale: 'Per unit area or per patch.' },
      { test: 'Content Uniformity', required: true, applicableCondition: 'All patches', rationale: 'USP <905>.' },
      { test: 'Release Liner Removal Force', required: true, applicableCondition: 'All patches with release liners', rationale: 'Ease of application.' },
      { test: 'Residual Solvents', required: true, applicableCondition: 'Patches manufactured with solvent-based adhesive coatings', rationale: 'ICH Q3C.' },
      { test: 'Microbial Limits', required: true, applicableCondition: 'All transdermal products', rationale: 'USP <61>/<62>.' },
    ],
  },
  ophthalmic: {
    tests: [
      { test: 'Sterility', required: true, applicableCondition: 'All ophthalmic products', rationale: 'USP <71>. Mandatory for all ophthalmic products.' },
      { test: 'Particulate Matter', required: true, applicableCondition: 'All ophthalmic solutions', rationale: 'USP <789>.' },
      { test: 'pH', required: true, applicableCondition: 'All ophthalmic products', rationale: 'Ocular comfort and stability.' },
      { test: 'Osmolality', required: true, applicableCondition: 'All ophthalmic products', rationale: 'Prevent ocular irritation.' },
      { test: 'Preservative Content / AET', required: true, applicableCondition: 'Multi-dose ophthalmic products', rationale: 'USP <51>. Critical for ophthalmic safety.' },
      { test: 'Container Closure Integrity', required: true, applicableCondition: 'All ophthalmic products', rationale: 'Maintain sterility.' },
      { test: 'Extractables / Leachables', required: true, applicableCondition: 'Products with plastic dropper tips or containers', rationale: 'Ocular safety concern.' },
    ],
  },
  suppository: {
    tests: [
      { test: 'Softening Time / Melting Range', required: true, applicableCondition: 'All suppositories', rationale: 'Product performance.' },
      { test: 'Dissolution / Drug Release', required: true, applicableCondition: 'All suppositories', rationale: 'USP apparatus 2 adapted.' },
      { test: 'Uniformity of Dosage Units', required: true, applicableCondition: 'All suppositories', rationale: 'USP <905>.' },
      { test: 'Microbial Limits', required: true, applicableCondition: 'Non-sterile products', rationale: 'USP <61>/<62>.' },
    ],
  },
};

// ── Q6A Decision Trees ──

interface DecisionTreeDef {
  name: string;
  description: string;
  applicableDosageForms: string[];
  defaultRecommendation: string;
  rationale: string;
}

const Q6A_DECISION_TREES: DecisionTreeDef[] = [
  {
    name: 'Decision Tree #1 — Water Content / Loss on Drying',
    description: 'When to set acceptance criteria for water content or loss on drying.',
    applicableDosageForms: ['tablet', 'capsule', 'lyophilized', 'inhaler'],
    defaultRecommendation: 'Test for water content if drug substance is hygroscopic, if water affects stability, or if the dosage form contains gelatin.',
    rationale: 'Q6A Annex, Decision Tree #1. Karl Fischer preferred over LOD for specificity.',
  },
  {
    name: 'Decision Tree #2 — Extractables / Leachables',
    description: 'When to perform extractables and leachables studies.',
    applicableDosageForms: ['solution', 'injection', 'inhaler', 'ophthalmic', 'patch'],
    defaultRecommendation: 'Required when product contacts plastic, elastomeric, or adhesive components. Perform extraction study followed by toxicological risk assessment.',
    rationale: 'Q6A Decision Tree #2. Scope determined by container closure and route of administration.',
  },
  {
    name: 'Decision Tree #3 — Particle Size',
    description: 'When to include particle size in drug substance specification.',
    applicableDosageForms: ['tablet', 'capsule', 'suspension', 'cream', 'inhaler'],
    defaultRecommendation: 'Include particle size if it affects dissolution, bioavailability, stability, or product performance (inhalation products always require).',
    rationale: 'Q6A Decision Tree #3. Critical for BCS Class II/IV drugs and inhalation products.',
  },
  {
    name: 'Decision Tree #4 — Polymorphic Forms',
    description: 'When to include polymorphic form identification in specification.',
    applicableDosageForms: ['tablet', 'capsule', 'suspension', 'cream', 'ointment'],
    defaultRecommendation: 'If drug substance exhibits polymorphism: determine if different forms affect solubility/stability/bioavailability. If yes, include polymorph ID test (XRPD, DSC, or Raman).',
    rationale: 'Q6A Decision Tree #4. Critical when polymorphic conversion can occur during processing or storage.',
  },
  {
    name: 'Decision Tree #5 — Chirality',
    description: 'When to include chiral purity testing.',
    applicableDosageForms: ['tablet', 'capsule', 'solution', 'injection'],
    defaultRecommendation: 'If drug substance has chiral center(s) and is marketed as single enantiomer: test for chiral purity. Racemic drugs generally do not need enantiomeric purity testing.',
    rationale: 'Q6A Decision Tree #5. Chiral chromatography (HPLC/SFC) or polarimetry.',
  },
  {
    name: 'Decision Tree #6 — Container Closure Integrity',
    description: 'When to include container closure integrity testing.',
    applicableDosageForms: ['injection', 'lyophilized', 'ophthalmic', 'inhaler'],
    defaultRecommendation: 'Required for all sterile products. Methods: dye ingress, vacuum decay, high-voltage leak detection (HVLD), helium leak.',
    rationale: 'Q6A Decision Tree #6. FDA Guidance on CCI testing (2008).',
  },
  {
    name: 'Decision Tree #7 — Dissolution vs. Disintegration',
    description: 'When dissolution testing can be replaced by disintegration testing.',
    applicableDosageForms: ['tablet', 'capsule'],
    defaultRecommendation: 'Dissolution preferred unless: drug is highly soluble (BCS I/III), product disintegrates rapidly (<15 min in all media), and no relationship between dissolution rate and BA exists.',
    rationale: 'Q6A Decision Tree #7. Disintegration as surrogate only with strong justification.',
  },
];

// ── 4.3 Exported Function ──

export function setSpecifications(params: SpecificationParams): SpecificationResult {
  const {
    productType,
    dosageForm,
    route,
    compendialStatus,
  } = params;

  void params.developmentDataSummary; // Acknowledged — for future extension; deterministic logic only

  const lowerForm = dosageForm.toLowerCase();

  // ── Universal tests ──
  const isProduct = true; // This function always assesses drug product specs
  const universalTests: TestEntry[] = isProduct
    ? [...UNIVERSAL_TESTS_DRUG_PRODUCT]
    : [...UNIVERSAL_TESTS_DRUG_SUBSTANCE];

  // Add drug substance universal tests as well (dual perspective)
  if (productType === 'small_molecule') {
    universalTests.push(
      { test: 'Residual Solvents (drug substance)', required: true, rationale: 'ICH Q3C. Applicable to drug substance specification.' },
      { test: 'Elemental Impurities', required: true, rationale: 'ICH Q3D. Risk assessment across drug substance, excipients, container closure, manufacturing equipment.' },
    );
  }

  // ── Specific tests based on dosage form ──
  const formKey = Object.keys(DOSAGE_FORM_SPECIFIC_TESTS).find((k) => lowerForm.includes(k)) || '';
  const specificTests: SpecificTestEntry[] = formKey
    ? [...DOSAGE_FORM_SPECIFIC_TESTS[formKey].tests]
    : [
        { test: 'Consult Q6A for dosage-form-specific tests', required: true, applicableCondition: 'All', rationale: 'Dosage form not found in standard registry.' },
      ];

  // Route-specific additions
  if (route === 'parenteral' && !specificTests.some((t) => t.test.includes('Sterility'))) {
    specificTests.push(
      { test: 'Sterility', required: true, applicableCondition: 'All parenteral products', rationale: 'USP <71>.' },
      { test: 'Endotoxin', required: true, applicableCondition: 'All parenteral products', rationale: 'USP <85>.' },
      { test: 'Particulate Matter', required: true, applicableCondition: 'All parenteral products', rationale: 'USP <788>.' },
    );
  }
  if (route === 'ophthalmic' && !specificTests.some((t) => t.test.includes('Sterility'))) {
    specificTests.push(
      { test: 'Sterility', required: true, applicableCondition: 'All ophthalmic products', rationale: 'USP <71>.' },
    );
  }
  if (route === 'inhalation' && !specificTests.some((t) => t.test.includes('Delivered Dose'))) {
    specificTests.push(
      { test: 'Delivered Dose Uniformity', required: true, applicableCondition: 'All inhalation products', rationale: 'USP <601>.' },
      { test: 'Aerodynamic Particle Size Distribution', required: true, applicableCondition: 'All inhalation products', rationale: 'USP <601>.' },
    );
  }

  // ── Decision trees ──
  const decisionTrees: DecisionTreeEntry[] = Q6A_DECISION_TREES.map((dt) => ({
    name: dt.name,
    applicable: dt.applicableDosageForms.some((f) => lowerForm.includes(f)),
    recommendation: dt.defaultRecommendation,
    rationale: dt.rationale,
  }));

  // ── Biological tests ──
  const biologicalTests: TestEntry[] = productType === 'biological'
    ? [...BIOLOGICAL_PRODUCT_TESTS]
    : [];

  if (productType === 'herbal') {
    biologicalTests.push(
      { test: 'Botanical Identity (macroscopic and microscopic)', required: true, rationale: 'USP <561> / Ph. Eur.' },
      { test: 'Marker Compound Assay', required: true, rationale: 'Quantify characteristic marker compound(s).' },
      { test: 'Fingerprint Chromatogram (HPTLC or HPLC)', required: true, rationale: 'Consistency of phytochemical profile.' },
      { test: 'Heavy Metals / Elemental Impurities', required: true, rationale: 'Contamination concern for botanical materials.' },
      { test: 'Pesticide Residues', required: true, rationale: 'USP <561> / Ph. Eur. 2.8.13.' },
      { test: 'Aflatoxins / Mycotoxins', required: true, rationale: 'Contamination risk for plant-derived materials.' },
    );
  }

  // ── Specification limits approach ──
  const specificationLimits: SpecificationLimits = {
    approach:
      'Set specifications based on: (1) pharmacopeial requirements, (2) approved shelf-life stability data, (3) batch analysis data from registration batches (minimum 3 batches for NDA), (4) clinical batch data, and (5) manufacturing capability.',
    factors: [
      'Pharmacopeial monograph limits (if compendial)',
      'Stability data — release limits derived from end-of-shelf-life limits (back-calculated)',
      'Batch analysis data — typically mean ± 3 SD or 95% tolerance interval',
      'Clinical batches — specifications must encompass batches used in pivotal studies',
      'Process capability — specifications should be achievable (Cpk > 1.33 target)',
      'Safety and efficacy — limits must ensure product quality throughout shelf life',
      'Regulatory precedent — compare to approved products in same class',
    ],
  };

  // ── Compendial requirements ──
  const compendialRequirements: CompendialRequirements = {
    status: compendialStatus,
    implications: compendialStatus === 'compendial'
      ? [
          'Must comply with all compendial monograph tests and limits',
          'Additional non-compendial tests may be required based on ICH Q6A',
          'Compendial methods must be verified (not fully validated) per USP <1226>',
          'Alternative methods may be used if shown to be equivalent or superior',
          'If product monograph exists, specifications must meet or exceed those requirements',
        ]
      : [
          'All analytical methods must be fully validated per ICH Q2(R2)',
          'Specifications justified based on development data and regulatory guidance',
          'Acceptance criteria derived from batch data, stability data, and toxicological limits',
          'May reference pharmacopeial general chapters for test methodology',
          'Regulatory authority may request comparison to pharmacopeial standards for similar products',
        ],
    pharmacopeia: [
      'USP-NF (United States Pharmacopeia)',
      'Ph. Eur. (European Pharmacopoeia)',
      'JP (Japanese Pharmacopoeia)',
      'BP (British Pharmacopoeia)',
      'IP (Indian Pharmacopoeia)',
    ],
  };

  // ── Citations ──
  const citations: string[] = [
    'ICH Q6A — Specifications: Test Procedures and Acceptance Criteria for New Drug Substances and New Drug Products: Chemical Substances (1999)',
    'ICH Q6B — Specifications: Test Procedures and Acceptance Criteria for Biotechnological/Biological Products (1999)',
  ];
  if (productType === 'biological') {
    citations.push('ICH Q5C — Stability Testing of Biotechnological/Biological Products (1995)');
  }
  citations.push(
    'USP General Chapters <905>, <711>, <601>, <71>, <85>, <788>',
    'FDA Guidance: Specifications for Drug Substances and Drug Products (various)',
  );

  return {
    universalTests,
    specificTests,
    decisionTrees,
    biologicalTests,
    specificationLimits,
    compendialRequirements,
    citations,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 5 — Process Validation (FDA 2011 + ICH Q8-Q10)
// ─────────────────────────────────────────────────────────────────────────────

// ── 5.1 Interfaces ──

export type ProcessType =
  | 'chemical_synthesis'
  | 'fermentation'
  | 'formulation'
  | 'filling'
  | 'lyophilization'
  | 'coating'
  | 'granulation'
  | 'tableting'
  | 'encapsulation';

export type ValidationScale = 'lab' | 'pilot' | 'commercial';

export type ValidationStage =
  | 'stage_1_process_design'
  | 'stage_2_process_qualification'
  | 'stage_3_continued_verification';

export interface ProcessValidationParams {
  processType: ProcessType;
  scale: ValidationScale;
  validationStage: ValidationStage;
}

export interface StageRequirements {
  activities: string[];
  deliverables: string[];
  documentation: string[];
}

export interface Stage1Design {
  doe: string[];
  cqas: string[];
  cpps: string[];
  designSpace: string[];
  riskAssessment: string[];
}

export interface Stage2Qualification {
  ppqProtocol: string[];
  batchRequirements: string[];
  acceptanceCriteria: string[];
  samplingPlans: string[];
}

export interface Stage3Verification {
  controlStrategy: string[];
  trending: string[];
  spcTools: string[];
  triggers: string[];
}

export interface QbdElements {
  qtpp: string[];
  cqaIdentification: string[];
  designSpace: string[];
  controlStrategy: string[];
}

export interface ProcessSpecificInfo {
  cpps: string[];
  cqas: string[];
  typicalRanges: string[];
}

export interface ProcessValidationResult {
  stageRequirements: StageRequirements;
  stage1Design: Stage1Design | null;
  stage2Qualification: Stage2Qualification | null;
  stage3Verification: Stage3Verification | null;
  qbdElements: QbdElements;
  patOpportunities: string[];
  processSpecific: ProcessSpecificInfo;
  citations: string[];
}

// ── 5.2 Reference Data ──

interface ProcessProfile {
  cpps: string[];
  cqas: string[];
  typicalRanges: string[];
}

const PROCESS_PROFILES: Record<ProcessType, ProcessProfile> = {
  chemical_synthesis: {
    cpps: [
      'Reaction temperature',
      'Reaction time / duration',
      'Stoichiometric ratio of reagents',
      'Rate of reagent addition',
      'Agitation / mixing speed',
      'Solvent volume and type',
      'pH control during reaction',
      'Atmosphere control (inert gas)',
      'Catalyst loading and type',
      'Crystallization temperature and cooling rate',
      'Filtration pressure and time',
      'Drying temperature and duration',
      'Milling parameters (if applicable)',
    ],
    cqas: [
      'Assay / Purity',
      'Related substances / Impurity profile',
      'Residual solvents',
      'Particle size distribution',
      'Polymorphic form',
      'Water content',
      'Heavy metals / Elemental impurities',
      'Chiral purity (if applicable)',
      'Color / Appearance',
      'Residue on ignition',
    ],
    typicalRanges: [
      'Reaction temperature: typically ±5°C of setpoint',
      'Reaction time: ±10% of target',
      'Stoichiometry: ±2% of target molar ratio',
      'Crystallization: cooling rate 0.1-1.0°C/min',
      'Drying: 40-80°C under vacuum, endpoint by LOD',
    ],
  },
  fermentation: {
    cpps: [
      'Temperature',
      'pH',
      'Dissolved oxygen (DO)',
      'Agitation rate / Impeller speed',
      'Aeration rate',
      'Feed rate (carbon source)',
      'Inoculation density',
      'Harvest time / Viability at harvest',
      'Antifoam addition',
      'CO2 concentration',
    ],
    cqas: [
      'Product titer / Yield',
      'Cell viability at harvest',
      'Glycosylation profile',
      'Charge variant profile',
      'Aggregate level',
      'Host cell protein (HCP) level',
      'Host cell DNA level',
      'Endotoxin',
      'Bioburden',
    ],
    typicalRanges: [
      'Temperature: 36-38°C (mammalian), 25-30°C (microbial)',
      'pH: ±0.1 units of setpoint',
      'DO: 30-60% saturation',
      'Harvest viability: > 60% (typical target)',
      'Culture duration: 10-21 days (mammalian fed-batch)',
    ],
  },
  formulation: {
    cpps: [
      'Order of addition of components',
      'Mixing speed and time',
      'Temperature during mixing',
      'Granulation endpoint (if wet granulation)',
      'Lubricant blending time',
      'Sieving / screening mesh size',
      'Batch size / Fill level in mixer',
      'Environmental conditions (RH, temperature)',
    ],
    cqas: [
      'Blend uniformity',
      'Content uniformity of finished dosage form',
      'Moisture content',
      'Particle size distribution (granules)',
      'Bulk / Tapped density',
      'Flow properties',
      'Assay',
      'Related substances',
    ],
    typicalRanges: [
      'Mixing time: 5-30 min depending on scale and mixer type',
      'Lubricant blend time: 2-5 min (over-lubrication risk)',
      'Blend uniformity: RSD <= 5% (target <= 3%)',
      'Granulation LOD endpoint: 1-3% (wet granulation)',
    ],
  },
  filling: {
    cpps: [
      'Fill speed (units/min)',
      'Fill volume / Fill weight',
      'Pump pressure / Speed (for liquids)',
      'Stopper insertion force',
      'Crimp seal force / torque',
      'RABS / Isolator environment (Grade A)',
      'Bioburden of product pre-fill',
      'Gas overlay (N2 blanket for oxygen-sensitive)',
    ],
    cqas: [
      'Fill volume accuracy',
      'Fill weight uniformity',
      'Container closure integrity',
      'Sterility',
      'Endotoxin',
      'Particulate matter',
      'Appearance (cosmetic defects)',
      'Headspace oxygen (if applicable)',
    ],
    typicalRanges: [
      'Fill weight: ±1-3% of target (for small volumes)',
      'Fill volume: ±2% of nominal',
      'CCI: zero leaks acceptable',
      'Headspace O2: typically < 1-2% for oxygen-sensitive products',
    ],
  },
  lyophilization: {
    cpps: [
      'Shelf temperature (freezing ramp rate)',
      'Freezing hold temperature',
      'Freezing hold time',
      'Primary drying shelf temperature',
      'Primary drying chamber pressure',
      'Primary drying time / endpoint detection',
      'Secondary drying shelf temperature',
      'Secondary drying chamber pressure',
      'Secondary drying time',
      'Condenser temperature',
      'Stoppering pressure / force',
    ],
    cqas: [
      'Residual moisture content',
      'Cake appearance / integrity',
      'Reconstitution time',
      'Assay (potency)',
      'Degradation products',
      'Particulate matter (after reconstitution)',
      'pH (after reconstitution)',
      'Sterility',
      'Container closure integrity',
      'Sub-visible particles',
    ],
    typicalRanges: [
      'Freezing: -40°C to -50°C shelf temperature; hold 2-4 hours',
      'Primary drying: -20°C to -10°C shelf; 50-200 mTorr chamber pressure',
      'Secondary drying: +25°C to +40°C shelf; 50-100 mTorr',
      'Residual moisture: typically NMT 1-3% (product-dependent)',
      'Reconstitution time: < 3 min preferred',
    ],
  },
  coating: {
    cpps: [
      'Inlet air temperature',
      'Outlet air temperature / Product bed temperature',
      'Spray rate',
      'Atomization air pressure',
      'Pan speed / rotation rate',
      'Air volume / flow rate',
      'Coating solution concentration',
      'Target weight gain',
    ],
    cqas: [
      'Weight gain / Coating thickness',
      'Appearance (color uniformity, gloss, defects)',
      'Dissolution profile',
      'Disintegration time',
      'Moisture content',
      'Logo/imprint legibility',
      'Enteric coating acid resistance (if applicable)',
    ],
    typicalRanges: [
      'Inlet air temp: 50-80°C (conventional coating)',
      'Product bed temp: 38-50°C',
      'Spray rate: 5-50 g/min/gun (scale-dependent)',
      'Weight gain: 2-5% for immediate-release film coat',
      'Enteric coating weight gain: 6-12% typical',
    ],
  },
  granulation: {
    cpps: [
      'Binder solution concentration',
      'Binder addition rate / Spray rate',
      'Impeller speed',
      'Chopper speed',
      'Granulation endpoint (power consumption, torque, or time)',
      'Water / solvent amount',
      'Drying inlet temperature',
      'Drying endpoint (LOD)',
      'Milling screen size',
      'Milling speed',
    ],
    cqas: [
      'Granule particle size distribution',
      'Loss on drying / Moisture content',
      'Bulk / Tapped density',
      'Flow properties (Carr index, Hausner ratio)',
      'Assay / Content uniformity of granules',
      'Granule friability / strength',
    ],
    typicalRanges: [
      'Binder concentration: 3-15% w/v PVP or HPMC',
      'Impeller speed: 100-300 rpm (high-shear)',
      'Granulation LOD endpoint: 1-3%',
      'Fluid bed drying: inlet temp 50-70°C',
      'Milling screen: 0.5-2.0 mm (product-dependent)',
    ],
  },
  tableting: {
    cpps: [
      'Compression force (main and pre-compression)',
      'Turret speed / Tablets per minute',
      'Feeder speed / Paddle speed',
      'Die fill depth / Weight adjustment',
      'Punch penetration depth',
      'Dwell time',
      'Tooling type and condition',
      'Environmental conditions (RH, temperature)',
    ],
    cqas: [
      'Tablet weight',
      'Tablet hardness / Breaking force',
      'Tablet thickness',
      'Friability',
      'Disintegration time',
      'Dissolution',
      'Content uniformity',
      'Appearance (visual defects: capping, lamination, sticking, picking)',
    ],
    typicalRanges: [
      'Compression force: 5-30 kN (product-dependent)',
      'Pre-compression force: 1-5 kN',
      'Turret speed: 20-80 rpm',
      'Hardness: 40-200 N (product-dependent)',
      'Friability: NMT 1.0% (USP <1216>)',
      'Weight variation: ±5% of target',
    ],
  },
  encapsulation: {
    cpps: [
      'Capsule fill weight',
      'Tamping / Dosing disc station pressure',
      'Machine speed (capsules/min)',
      'Powder bed height (dosator) or dosing disc setting',
      'Slug hardness / compaction force (if applicable)',
      'Environmental conditions (RH for gelatin shells)',
      'Capsule locking / band-sealing parameters',
    ],
    cqas: [
      'Capsule fill weight / Weight variation',
      'Content uniformity',
      'Dissolution',
      'Disintegration',
      'Appearance (shell defects, closure integrity)',
      'Moisture content',
      'Microbial limits',
    ],
    typicalRanges: [
      'Fill weight RSD: NMT 3%',
      'Weight variation: ±5% for capsules >300 mg, ±7.5% for smaller',
      'Machine speed: 50,000-150,000 capsules/hour',
      'RH for hard gelatin: 35-65% (shell brittleness concern)',
    ],
  },
};

// ── 5.3 Exported Function ──

export function assessProcessValidation(params: ProcessValidationParams): ProcessValidationResult {
  const { processType, scale, validationStage } = params;

  const profile = PROCESS_PROFILES[processType];

  // ── Stage requirements ──
  let stageRequirements: StageRequirements;
  let stage1Design: Stage1Design | null = null;
  let stage2Qualification: Stage2Qualification | null = null;
  let stage3Verification: Stage3Verification | null = null;

  if (validationStage === 'stage_1_process_design') {
    stageRequirements = {
      activities: [
        'Define Quality Target Product Profile (QTPP)',
        'Identify Critical Quality Attributes (CQAs) via risk assessment',
        'Perform risk assessment (FMEA, Ishikawa, or equivalent)',
        'Conduct Design of Experiments (DoE) to understand factor-response relationships',
        'Establish proven acceptable ranges (PARs) and design space',
        'Develop control strategy linking CPPs to CQAs',
        'Establish in-process controls and acceptance criteria',
        'Document process understanding in development reports',
      ],
      deliverables: [
        'QTPP document',
        'CQA risk assessment (including rationale for CQA classification)',
        'DoE study reports with statistical analysis',
        'Design space definition (multidimensional combination of input variables)',
        'Preliminary control strategy',
        'Technology transfer protocol',
        'Development pharmaceutical report (Section 3.2.P.2 of CTD)',
      ],
      documentation: [
        'ICH Q8(R2) Pharmaceutical Development report',
        'Risk assessment records (ICH Q9)',
        'DoE protocols and reports',
        'Scale-up rationale and considerations',
        'Analytical method development reports',
      ],
    };

    stage1Design = {
      doe: [
        'Screening designs (fractional factorial, Plackett-Burman) to identify significant factors',
        'Optimization designs (Central Composite, Box-Behnken) to define design space',
        'Response surface methodology for CQA prediction models',
        'Minimum 3 center-point replicates for variance estimation',
        'Consider scale as a factor if design space spans lab to commercial',
      ],
      cqas: profile.cqas,
      cpps: profile.cpps,
      designSpace: [
        'Design space: multidimensional combination and interaction of input variables (material attributes, process parameters) demonstrated to provide assurance of quality',
        'Working within the design space is not considered a change per ICH Q8(R2)',
        'Movement out of design space requires regulatory post-approval change',
        'Design space verified at commercial scale during Stage 2 PPQ',
        'Edge-of-failure studies recommended to understand design space boundaries',
      ],
      riskAssessment: [
        'Failure Mode and Effects Analysis (FMEA) — score Severity x Occurrence x Detection',
        'Ishikawa (fishbone) diagram for initial cause identification',
        'Risk Ranking and Filtering for large parameter sets',
        'Process Hazard Analysis if safety-critical (e.g., high-potency, cytotoxic)',
        'Update risk assessment iteratively as process knowledge increases',
        'ICH Q9 lifecycle risk management approach',
      ],
    };
  } else if (validationStage === 'stage_2_process_qualification') {
    stageRequirements = {
      activities: [
        'Facility and equipment qualification (IQ/OQ/PQ)',
        'Utility qualification (HVAC, water, compressed gases)',
        'Execute Process Performance Qualification (PPQ) protocol',
        'Enhanced sampling and testing during PPQ batches',
        'Statistical analysis of PPQ data',
        'Confirm process operates within design space at commercial scale',
        'Validate analytical methods used for PPQ testing',
        'Train operators on commercial-scale procedures',
      ],
      deliverables: [
        'PPQ protocol (pre-approved)',
        'IQ/OQ/PQ reports for all critical equipment',
        'PPQ batch records and data',
        'PPQ summary report with statistical analysis',
        'Confirmation of control strategy adequacy',
        'Training records for manufacturing personnel',
        'Cleaning validation (if not previously qualified)',
        'Media fill studies (for aseptic processes)',
      ],
      documentation: [
        'PPQ protocol and report',
        'Equipment qualification documents',
        'Batch production records',
        'Deviation reports (if any)',
        'Change control records',
        'Updated risk assessment post-PPQ',
      ],
    };

    stage2Qualification = {
      ppqProtocol: [
        'Pre-approved protocol defining acceptance criteria, sampling plan, and statistical methods',
        'Protocol must be approved before execution (not retrospective)',
        'Define number of PPQ batches (typically 3 consecutive, but science-based justification required)',
        'Specify all tests, sampling points, and acceptance criteria',
        'Include provisions for process deviations and reprocessing rules',
        'Define success/failure criteria and decision rules',
      ],
      batchRequirements: [
        scale === 'commercial'
          ? 'Minimum 3 consecutive successful commercial-scale batches (science-based justification for number)'
          : scale === 'pilot'
            ? 'Pilot-scale PPQ is preliminary; commercial-scale PPQ still required for process validation'
            : 'Lab-scale PPQ is informational; does not satisfy Stage 2 requirements',
        'Batches manufactured using commercial equipment, procedures, and trained operators',
        'Batches should represent the range of conditions the process will encounter in routine production',
        'Material from qualified raw material suppliers',
        'Enhanced in-process sampling compared to routine production',
      ],
      acceptanceCriteria: [
        'All CQAs meet pre-defined acceptance criteria',
        'Process capability indices: Ppk >= 1.33 (target >= 1.67 for critical attributes)',
        'No OOS results or unexplained deviations',
        'Individual batch results and inter-batch consistency evaluated',
        'Statistical process capability demonstrated',
        'All in-process controls met without adjustment',
      ],
      samplingPlans: [
        'Stratified sampling across blend time, compression run, fill operation',
        'Beginning, middle, end of each unit operation (positional sampling)',
        'Content uniformity: minimum 10 locations per blend (per PDA TR 25)',
        'Dissolution: 12 units per stage (enhanced from routine 6)',
        'For aseptic fill: 100% of media fill units incubated',
        'Consider PAT-enabled real-time monitoring where possible',
      ],
    };
  } else {
    stageRequirements = {
      activities: [
        'Implement routine monitoring using validated control strategy',
        'Collect and trend process performance data',
        'Apply statistical process control (SPC) methods',
        'Perform periodic product quality reviews (APR/PQR)',
        'Investigate process trends and signals',
        'Maintain validated state through change control',
        'Requalification when significant changes occur',
        'Continuous process verification (CPV) program execution',
      ],
      deliverables: [
        'Ongoing process monitoring plan',
        'SPC control charts (X-bar, R, CUSUM, EWMA)',
        'Annual Product Review (APR) / Product Quality Review (PQR)',
        'Trend reports for CQAs and CPPs',
        'Continuous Process Verification (CPV) reports',
        'Updated risk assessments as new data accumulates',
      ],
      documentation: [
        'CPV protocol',
        'SPC chart reviews and trend analysis',
        'Annual Product Review reports',
        'Deviation investigation reports',
        'Change control records',
        'Revalidation protocols and reports (when triggered)',
      ],
    };

    stage3Verification = {
      controlStrategy: [
        'Maintain commercial control strategy established during PPQ',
        'In-process controls at critical points with defined action limits',
        'Real-time monitoring of CPPs (e.g., PAT probes, in-line sensors)',
        'Raw material incoming testing to verify supplier qualification',
        'Environmental monitoring (for sterile and controlled environments)',
        'Equipment maintenance and calibration schedules',
      ],
      trending: [
        'Trend CQA results over time (batch-to-batch and within-batch)',
        'Monitor process yield and cycle time',
        'Track deviation rates and CAPA effectiveness',
        'Environmental monitoring trend data',
        'Customer complaint trend analysis',
        'Stability data trends for ongoing batches',
      ],
      spcTools: [
        'Shewhart control charts (X-bar, R, s charts) for continuous data',
        'p-charts or np-charts for attribute data (defect rates)',
        'CUSUM (Cumulative Sum) charts for detecting small shifts',
        'EWMA (Exponentially Weighted Moving Average) for drift detection',
        'Process capability recalculation (Cpk/Ppk) annually or with process changes',
        'Nelson rules or Western Electric rules for pattern detection',
      ],
      triggers: [
        'OOS/OOT results trigger investigation',
        'Process capability Ppk drops below 1.0 — immediate action required',
        'Ppk between 1.0-1.33 — enhanced monitoring and investigation',
        'Any confirmed process change (equipment, raw material supplier, site)',
        'Regulatory inspection observations',
        'Multiple deviations of similar nature within review period',
        'Customer complaints or recalls related to product quality',
        'Significant changes to analytical methods or specifications',
      ],
    };
  }

  // ── QbD elements (applicable across all stages) ──
  const qbdElements: QbdElements = {
    qtpp: [
      'Dosage form and route of administration',
      'Dosage strength(s)',
      'Container closure system',
      'Drug release / delivery characteristics',
      'Pharmacokinetic attributes (e.g., bioavailability)',
      'Drug product quality criteria (identity, assay, purity, stability)',
    ],
    cqaIdentification: [
      'Physical: appearance, particle size, polymorphic form, moisture content',
      'Chemical: assay, related substances, residual solvents, elemental impurities',
      'Microbiological: sterility (if applicable), endotoxin, bioburden',
      'Performance: dissolution, content uniformity, delivered dose',
      'Biological (if applicable): potency, immunogenicity, glycosylation',
    ],
    designSpace: [
      'Multidimensional combination of input variables and process parameters',
      'Developed from DoE and process understanding during Stage 1',
      'Working within design space is not considered a regulatory change',
      'Must be verified at commercial scale',
      'Can be product-specific or process-specific',
    ],
    controlStrategy: [
      'Level 1: Real-time testing / PAT-based release (highest process understanding)',
      'Level 2: End-product testing with reduced routine testing',
      'Level 3: Extensive end-product testing (traditional approach)',
      'Control strategy encompasses: input material controls, in-process controls, end-product testing, process monitoring',
      'Design space + control strategy = assurance of consistent quality',
    ],
  };

  // ── PAT opportunities ──
  const patOpportunities: string[] = [
    'Near-Infrared (NIR) spectroscopy: blend uniformity, moisture content, API identification',
    'Raman spectroscopy: polymorph identification, API content, coating thickness',
    'Focused Beam Reflectance Measurement (FBRM): particle size monitoring in real-time',
    'In-line pH and conductivity: process endpoint detection',
    'Acoustic emission: granulation endpoint detection',
    'Machine vision / image analysis: tablet appearance inspection, defect detection',
    'Multivariate data analysis (MVDA): real-time process monitoring and fault detection',
    'Heat flux / power consumption: granulation and mixing endpoint',
  ];

  // ── Process-specific information ──
  const processSpecific: ProcessSpecificInfo = {
    cpps: profile.cpps,
    cqas: profile.cqas,
    typicalRanges: profile.typicalRanges,
  };

  // ── Citations ──
  const citations: string[] = [
    'FDA Guidance for Industry: Process Validation: General Principles and Practices (January 2011)',
    'ICH Q8(R2) — Pharmaceutical Development (2009)',
    'ICH Q9 — Quality Risk Management (2005)',
    'ICH Q10 — Pharmaceutical Quality System (2008)',
    'ICH Q11 — Development and Manufacture of Drug Substances (2012)',
    'ICH Q12 — Lifecycle Management (2019)',
    'ICH Q13 — Continuous Manufacturing (2022)',
    'PDA Technical Report 60 — Process Validation: A Lifecycle Approach (2013)',
  ];

  if (processType === 'filling' || processType === 'lyophilization') {
    citations.push('FDA Guidance: Sterile Drug Products Produced by Aseptic Processing (2004)');
    citations.push('PDA Technical Report 22 — Process Simulation Testing for Aseptically Filled Products (2011)');
  }

  void scale; // Acknowledged — used in stage2Qualification batch requirements

  return {
    stageRequirements,
    stage1Design,
    stage2Qualification,
    stage3Verification,
    qbdElements,
    patOpportunities,
    processSpecific,
    citations,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 6 — Comparability Assessment (ICH Q5E)
// ─────────────────────────────────────────────────────────────────────────────

// ── 6.1 Interfaces ──

export type ChangeType =
  | 'manufacturing_site'
  | 'scale_up'
  | 'process_change'
  | 'formulation_change'
  | 'cell_bank';

export type BiologicalProductType =
  | 'mAb'
  | 'vaccine'
  | 'blood_product'
  | 'gene_therapy'
  | 'biosimilar'
  | 'recombinant_protein';

export type ChangeSignificance = 'minor' | 'moderate' | 'major';

export interface ComparabilityParams {
  changeType: ChangeType;
  productType: BiologicalProductType;
  significance: ChangeSignificance;
}

export interface AssessmentTier {
  level: string;
  description: string;
}

export interface AnalyticalPlan {
  primaryStructure: string[];
  higherOrderStructure: string[];
  biologicalActivity: string[];
  purityImpurities: string[];
  quantity: string[];
  details: string[];
}

export interface StatisticalApproach {
  methods: string[];
  criteria: string[];
}

export interface RegulatoryPathway {
  fda: string;
  ema: string;
  details: string[];
}

export interface ClinicalRequirements {
  needed: boolean;
  studyType: string;
  rationale: string;
}

export interface ComparabilityResult {
  assessmentTier: AssessmentTier;
  analyticalPlan: AnalyticalPlan;
  statisticalApproach: StatisticalApproach;
  functionalAssays: string[];
  clinicalRequirements: ClinicalRequirements;
  regulatoryPathway: RegulatoryPathway;
  citations: string[];
}

// ── 6.2 Reference Data ──

interface TierDefinition {
  level: string;
  description: string;
  analyticalScope: string;
  functionalScope: string;
  clinicalScope: string;
}

const TIER_MATRIX: Record<ChangeSignificance, TierDefinition> = {
  minor: {
    level: 'Tier 1 — Analytical Comparability',
    description: 'Analytical comparability exercise only. Demonstrate equivalent quality attributes using side-by-side analytical testing of pre- and post-change material.',
    analyticalScope: 'Comprehensive analytical characterization of CQAs',
    functionalScope: 'Confirmatory bioassay (if available)',
    clinicalScope: 'No clinical studies required',
  },
  moderate: {
    level: 'Tier 2 — Analytical + Functional Comparability',
    description: 'Comprehensive analytical comparability plus functional/biological activity studies. May include non-clinical PK/PD or targeted toxicology if analytical data shows differences.',
    analyticalScope: 'Extended analytical characterization including orthogonal methods',
    functionalScope: 'Full panel of functional/biological assays including cell-based potency',
    clinicalScope: 'Non-clinical bridging studies may be needed; clinical studies typically not required if analytical similarity demonstrated',
  },
  major: {
    level: 'Tier 3 — Full Comparability (Analytical + Functional + Clinical)',
    description: 'Comprehensive analytical and functional comparability plus clinical bridging study (typically PK bioequivalence). Required when change fundamentally affects product or process.',
    analyticalScope: 'Comprehensive analytical characterization with state-of-art methods',
    functionalScope: 'Full functional assessment panel',
    clinicalScope: 'Clinical PK bridging study and/or immunogenicity assessment required',
  },
};

/** Product-type-specific functional assays. */
const FUNCTIONAL_ASSAYS: Record<BiologicalProductType, string[]> = {
  mAb: [
    'Target binding assay (ELISA or SPR)',
    'Fc receptor binding (FcRn, FcgammaR)',
    'Complement-dependent cytotoxicity (CDC) assay',
    'Antibody-dependent cellular cytotoxicity (ADCC) assay',
    'Cell-based potency assay (reporter gene or proliferation)',
    'Apoptosis assay (if MOA-relevant)',
    'Binding kinetics (kon, koff, KD by Biacore)',
  ],
  vaccine: [
    'Antigen potency assay (ELISA or cell-based)',
    'In vivo potency (animal challenge or immunogenicity)',
    'Adjuvant activity assay',
    'Viral particle count / Plaque-forming units',
    'Identity serotyping',
    'Residual infectivity (if live attenuated)',
  ],
  blood_product: [
    'Specific activity assay (e.g., clotting factor activity)',
    'Chromogenic substrate assay',
    'Functional coagulation assay (aPTT, PT)',
    'Thrombin generation assay',
    'VWF activity (ristocetin cofactor) if applicable',
  ],
  gene_therapy: [
    'Vector genome titer (qPCR)',
    'Transduction efficiency / Infectious titer',
    'Transgene expression assay (reporter or functional)',
    'Capsid identity (VP ratios for AAV)',
    'Replication-competent virus (RCV/RCA) assay',
    'In vivo potency in animal model',
  ],
  biosimilar: [
    'Target binding assay (matching reference product MOA)',
    'Fc effector function assays (ADCC, CDC if applicable)',
    'Cell-based potency assay (relative to reference standard)',
    'FcRn binding (pharmacokinetic relevance)',
    'Fab-mediated functions specific to reference product',
    'Comprehensive comparative functional assessment vs. reference product',
  ],
  recombinant_protein: [
    'Cell-based potency assay',
    'Receptor binding assay',
    'Enzymatic activity assay (if enzyme)',
    'Proliferation / Survival assay (for growth factors / cytokines)',
    'Specific activity determination (activity per mg protein)',
  ],
};

/** Analytical characterization methods for biologics comparability. */
const ANALYTICAL_METHODS_COMPARABILITY: AnalyticalPlan = {
  primaryStructure: [
    'Intact mass analysis (LC-MS)',
    'Reduced / Deglycosylated mass analysis',
    'Peptide mapping with UV and MS detection',
    'N-terminal and C-terminal sequencing',
    'Disulfide bond mapping',
    'Post-translational modification identification (oxidation, deamidation, glycation)',
    'Free sulfhydryl content',
  ],
  higherOrderStructure: [
    'Far-UV circular dichroism (CD) spectroscopy',
    'Intrinsic fluorescence spectroscopy',
    'Fourier-transform infrared spectroscopy (FT-IR)',
    'Differential scanning calorimetry (DSC) — thermal stability',
    'Hydrogen-deuterium exchange mass spectrometry (HDX-MS)',
    'Analytical ultracentrifugation (AUC)',
    'Dynamic light scattering (DLS)',
    'Small-angle X-ray scattering (SAXS) (if needed)',
  ],
  biologicalActivity: [
    'Cell-based potency assay (relative potency to reference standard)',
    'Target binding assay (ELISA, SPR/BLI)',
    'Fc effector function assays (product-dependent)',
    'Functional assays specific to mechanism of action',
  ],
  purityImpurities: [
    'Size exclusion chromatography (SEC) — aggregates, fragments',
    'Capillary electrophoresis (CE-SDS) — purity under reducing and non-reducing conditions',
    'Charge variant analysis (cIEF or CEX-HPLC)',
    'Host cell protein (HCP) ELISA',
    'Residual host cell DNA (qPCR)',
    'Protein A residuals (if Protein A purification used)',
    'Endotoxin (LAL)',
    'Bioburden',
    'Residual process chemicals (e.g., Triton X-100, leached Protein A)',
    'Subvisible and visible particulate matter',
  ],
  quantity: [
    'Protein concentration (UV A280, BCA, or Bradford)',
    'Extinction coefficient verification',
    'Active concentration (if different from total protein)',
  ],
  details: [
    'Pre-change and post-change samples tested side-by-side under identical conditions',
    'Use same reference standard for both pre- and post-change testing',
    'Minimum 3 pre-change lots and 3 post-change lots (recommended)',
    'Include historical release and stability data in assessment',
    'Trending analysis to establish pre-change baseline variability',
    'Use orthogonal methods to increase confidence in comparability conclusions',
  ],
};

/** Regulatory pathway mapping for post-approval changes. */
interface RegulatoryChangeCategory {
  fdaCategory: string;
  emaCategory: string;
  details: string[];
}

const CHANGE_REGULATORY_MAP: Record<ChangeType, Record<ChangeSignificance, RegulatoryChangeCategory>> = {
  manufacturing_site: {
    minor: {
      fdaCategory: 'Annual Report (AR)',
      emaCategory: 'Type IA variation',
      details: [
        'Site change with no process change (same equipment type, same procedures)',
        'FDA: Annual Report under 21 CFR 314.70(d) or 601.12(d)',
        'EMA: Type IA variation per Commission Regulation (EC) No 1234/2008',
        'No prior approval required; submit notification within 30 days (FDA) or 12 months (EMA)',
      ],
    },
    moderate: {
      fdaCategory: 'CBE-30 (Changes Being Effected in 30 days)',
      emaCategory: 'Type IB variation',
      details: [
        'Site change with minor process adaptation',
        'FDA: CBE-30 supplement under 21 CFR 314.70(c) or 601.12(c)',
        'EMA: Type IB variation — do-and-tell with 30-day review',
        'Comparability data required showing equivalent quality',
      ],
    },
    major: {
      fdaCategory: 'Prior Approval Supplement (PAS)',
      emaCategory: 'Type II variation',
      details: [
        'Significant site change with potential impact on product quality',
        'FDA: PAS under 21 CFR 314.70(b) or 601.12(b); pre-approval inspection likely',
        'EMA: Type II variation requiring CHMP assessment',
        'Full comparability exercise including analytical, functional, potentially clinical',
        'Expect 6-12 month review period',
      ],
    },
  },
  scale_up: {
    minor: {
      fdaCategory: 'Annual Report (AR)',
      emaCategory: 'Type IA variation',
      details: [
        'Scale-up within validated design space (e.g., 10x within same equipment class)',
        'Scale-up with demonstrated linear scalability',
        'Analytical comparability sufficient',
      ],
    },
    moderate: {
      fdaCategory: 'CBE-30',
      emaCategory: 'Type IB variation',
      details: [
        'Scale-up beyond validated range or to new equipment scale',
        'FDA: CBE-30 with supporting comparability data',
        'EMA: Type IB with analytical comparability package',
        'PPQ of new scale required',
      ],
    },
    major: {
      fdaCategory: 'Prior Approval Supplement (PAS)',
      emaCategory: 'Type II variation',
      details: [
        'Major scale change (e.g., from 200L to 20,000L bioreactor)',
        'Significant process re-development required',
        'Full comparability exercise with potential clinical bridging',
        'New process validation at commercial scale',
      ],
    },
  },
  process_change: {
    minor: {
      fdaCategory: 'Annual Report (AR)',
      emaCategory: 'Type IA variation',
      details: [
        'Minor process parameter adjustment within proven acceptable ranges',
        'No impact on CQAs demonstrated through process understanding',
        'Within approved design space (ICH Q8)',
      ],
    },
    moderate: {
      fdaCategory: 'CBE-30',
      emaCategory: 'Type IB variation',
      details: [
        'Process change outside design space but within overall process capability',
        'New unit operation or significantly different processing conditions',
        'Analytical and potentially functional comparability required',
      ],
    },
    major: {
      fdaCategory: 'Prior Approval Supplement (PAS)',
      emaCategory: 'Type II variation',
      details: [
        'Fundamental process change (e.g., new purification platform, new expression system)',
        'Change to cell culture conditions that could affect product quality profile',
        'Full comparability exercise required; clinical data likely needed',
      ],
    },
  },
  formulation_change: {
    minor: {
      fdaCategory: 'CBE-0 (Changes Being Effected)',
      emaCategory: 'Type IA variation',
      details: [
        'Minor excipient change within compendial limits',
        'Change in non-functional component within approved ranges',
        'Stability data to support shelf-life maintenance',
      ],
    },
    moderate: {
      fdaCategory: 'CBE-30',
      emaCategory: 'Type IB variation',
      details: [
        'Addition or deletion of excipient that may affect product performance',
        'Change in container closure system with potential extractables concern',
        'Comparability data including stability required',
      ],
    },
    major: {
      fdaCategory: 'Prior Approval Supplement (PAS)',
      emaCategory: 'Type II variation',
      details: [
        'New formulation composition that fundamentally differs from approved',
        'Change in route of administration or dosage form',
        'Clinical bridging study required for PK comparability',
        'New stability program required',
      ],
    },
  },
  cell_bank: {
    minor: {
      fdaCategory: 'CBE-30',
      emaCategory: 'Type IB variation',
      details: [
        'Replacement of working cell bank (WCB) from same master cell bank (MCB)',
        'Routine WCB preparation within qualified procedures',
        'Analytical comparability of product from new WCB',
      ],
    },
    moderate: {
      fdaCategory: 'Prior Approval Supplement (PAS)',
      emaCategory: 'Type II variation',
      details: [
        'New master cell bank (MCB) preparation from same cell line',
        'Extended characterization of new MCB required',
        'Comprehensive analytical and functional comparability',
        'Genetic stability assessment at limit of in vitro cell age',
      ],
    },
    major: {
      fdaCategory: 'Prior Approval Supplement (PAS)',
      emaCategory: 'Type II variation',
      details: [
        'New cell line or expression system',
        'Completely new cell bank characterization package',
        'Full comparability exercise — analytical, functional, and clinical',
        'Considered essentially a new product in many cases',
        'Pre-submission meeting with regulatory agency strongly recommended',
      ],
    },
  },
};

// ── 6.3 Exported Function ──

export function assessComparabilityProtocol(params: ComparabilityParams): ComparabilityResult {
  const { changeType, productType, significance } = params;

  // ── Assessment tier ──
  const tierDef = TIER_MATRIX[significance];
  const assessmentTier: AssessmentTier = {
    level: tierDef.level,
    description: tierDef.description,
  };

  // ── Analytical plan ──
  const analyticalPlan: AnalyticalPlan = { ...ANALYTICAL_METHODS_COMPARABILITY };

  // Tailor detail line for significance level
  if (significance === 'minor') {
    analyticalPlan.details = [
      ...analyticalPlan.details,
      'Reduced scope acceptable for minor changes: focus on CQAs most likely impacted by the change',
      'Minimum 3 lots pre-change and 3 lots post-change',
    ];
  } else if (significance === 'major') {
    analyticalPlan.details = [
      ...analyticalPlan.details,
      'Full scope required: all quality attributes characterized with orthogonal methods',
      'Extended characterization including forced degradation of pre- and post-change material',
      'Stability studies on post-change material (accelerated and long-term)',
      'Minimum 5 lots pre-change and 5 lots post-change recommended',
    ];
  }

  // ── Statistical approach ──
  const statisticalApproach: StatisticalApproach = {
    methods: [
      'Descriptive statistics: mean, SD, %RSD for each quality attribute',
      'Equivalence testing (TOST — Two One-Sided Tests) where quantitative acceptance ranges exist',
      'Quality range approach: post-change results within ±X SD of pre-change mean (typically 2-3 SD)',
      'Graphical comparison: overlay of pre- and post-change results with historical range bands',
      significance === 'major'
        ? 'Bayesian inference or tolerance interval approach for comprehensive evaluation'
        : 'Standard parametric or non-parametric comparison as appropriate',
    ],
    criteria: [
      'Predefined acceptance criteria for each quality attribute BEFORE post-change data is generated',
      'Criteria based on: regulatory requirements, historical variability, clinical relevance',
      'Typically: post-change mean within pre-change mean ± 3 SD (or tighter based on attribute criticality)',
      'For potency: ±10% of pre-change mean (or as defined in specification)',
      'For purity/impurities: post-change results within pre-change specification limits',
      'Any attribute outside pre-defined criteria triggers investigation and potential escalation',
    ],
  };

  // ── Functional assays ──
  const functionalAssays: string[] = FUNCTIONAL_ASSAYS[productType];

  // ── Clinical requirements ──
  let clinicalRequirements: ClinicalRequirements;
  if (significance === 'major') {
    clinicalRequirements = {
      needed: true,
      studyType: productType === 'biosimilar'
        ? 'Comparative PK study and potentially comparative efficacy/safety study (per regulatory guidance)'
        : 'PK bridging study (single-dose, crossover or parallel design) comparing pre- and post-change product',
      rationale:
        'Major changes may impact PK, efficacy, or immunogenicity. Clinical data required to demonstrate comparable safety and efficacy profile. ' +
        'For biologics, immunogenicity assessment typically required (anti-drug antibody evaluation).',
    };
  } else if (significance === 'moderate') {
    clinicalRequirements = {
      needed: false,
      studyType: 'Not typically required. Non-clinical PK/PD or targeted tox study may be requested if analytical differences observed.',
      rationale:
        'Moderate changes are generally supported by analytical and functional comparability data. ' +
        'Clinical studies may be triggered if unexplained analytical differences are observed.',
    };
  } else {
    clinicalRequirements = {
      needed: false,
      studyType: 'Not required',
      rationale: 'Minor changes with demonstrated analytical comparability do not require clinical data.',
    };
  }

  // ── Regulatory pathway ──
  const regPath = CHANGE_REGULATORY_MAP[changeType][significance];
  const regulatoryPathway: RegulatoryPathway = {
    fda: regPath.fdaCategory,
    ema: regPath.emaCategory,
    details: regPath.details,
  };

  // ── Citations ──
  const citations: string[] = [
    'ICH Q5E — Comparability of Biotechnological/Biological Products Subject to Changes in Their Manufacturing Process (2004)',
    'FDA Guidance: Demonstration of Comparability of Human Biological Products (1996)',
    'FDA Guidance: Changes to an Approved Application — Biological Products (CBE/PAS) (2021)',
    'EMA/CHMP/BWP/304831/2014 — Guideline on Comparability of Biotechnology-Derived Medicinal Products After a Change in the Manufacturing Process',
    'ICH Q8(R2) — Pharmaceutical Development (2009)',
    'ICH Q9 — Quality Risk Management (2005)',
    '21 CFR 314.70 / 601.12 — Supplements and Other Changes to an Approved Application',
  ];

  if (productType === 'biosimilar') {
    citations.push(
      'FDA Guidance: Scientific Considerations in Demonstrating Biosimilarity to a Reference Product (2015)',
      'EMA/CHMP/437/04 Rev 1 — Guideline on Similar Biological Medicinal Products',
    );
  }

  if (changeType === 'cell_bank') {
    citations.push(
      'ICH Q5A(R2) — Viral Safety Evaluation of Biotechnology Products Derived from Cell Lines of Human or Animal Origin (2023)',
      'ICH Q5B — Analysis of the Expression Construct in Cells Used for Production of r-DNA Derived Protein Products (1995)',
      'ICH Q5D — Derivation and Characterisation of Cell Substrates Used for Production of Biotechnological/Biological Products (1997)',
    );
  }

  return {
    assessmentTier,
    analyticalPlan,
    statisticalApproach,
    functionalAssays,
    clinicalRequirements,
    regulatoryPathway,
    citations,
  };
}
