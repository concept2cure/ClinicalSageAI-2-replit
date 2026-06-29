/**
 * Pediatric Development Intelligence — deterministic knowledge base.
 *
 * Pure, deterministic decision engines for pediatric drug development strategy.
 * No LLM, no network calls, no database — every function is a closed-form lookup
 * or rule-based computation over the in-code regulatory corpus. Identical input
 * always produces identical output, making results submission-defensible.
 *
 * Domains covered:
 *   1. ICH E11(R1) age classification & developmental pharmacology
 *   2. Pediatric Investigation Plan (PIP) / Pediatric Study Plan (PSP)
 *   3. Pediatric extrapolation framework (FDA/EMA decision tree)
 *   4. Age-appropriate formulation selection & excipient safety
 *   5. Pediatric dose selection (allometric, PBPK, maturation-adjusted)
 *   6. Regulatory & ethical requirements (PREA, PDCO, assent/consent)
 *
 * Regulatory references:
 *   - ICH E11(R1): Clinical Investigation of Medicinal Products in the
 *     Pediatric Population (2017)
 *   - FDA PREA: Pediatric Research Equity Act (21 USC §355c)
 *   - EMA Paediatric Regulation: EC No 1901/2006 (as amended by EC 1902/2006)
 *   - FDA Guidance: General Clinical Pharmacology Considerations for
 *     Pediatric Studies (2014)
 *   - FDA Guidance: Pediatric Study Plans (2020)
 *   - EMA Guideline on Pharmaceutical Development of Medicines for
 *     Paediatric Use (EMA/CHMP/QWP/805880/2012 Rev. 2)
 *   - FDA Guidance: Leveraging Existing Clinical Data for Extrapolation
 *     to Pediatric Uses (2016)
 *   - EMA Reflection Paper on Extrapolation (EMA/199678/2016)
 *   - EMA Guideline on the Investigation of Medicinal Products in the
 *     Term and Preterm Neonate (EMEA/536810/2008)
 *
 * @module server/services/pediatric/pediatric-knowledge
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type PediatricAgeBand =
  | 'preterm_neonate'
  | 'term_neonate'
  | 'infant'
  | 'child'
  | 'adolescent';

export type Jurisdiction = 'FDA' | 'EMA' | 'PMDA' | 'NMPA' | 'Health_Canada';

export type TherapeuticArea =
  | 'oncology'
  | 'infectious_disease'
  | 'neurology'
  | 'cardiology'
  | 'endocrinology'
  | 'respiratory'
  | 'gastroenterology'
  | 'dermatology'
  | 'immunology'
  | 'rare_disease'
  | 'hematology'
  | 'nephrology'
  | 'psychiatry'
  | 'other';

export type FormulationType =
  | 'oral_solution'
  | 'oral_suspension'
  | 'orodispersible_tablet'
  | 'orodispersible_film'
  | 'mini_tablet'
  | 'granules_sprinkle'
  | 'chewable_tablet'
  | 'powder_for_reconstitution'
  | 'conventional_tablet'
  | 'capsule'
  | 'rectal_suppository'
  | 'injectable'
  | 'topical'
  | 'inhaled'
  | 'nasal';

export type DoseScalingMethod =
  | 'linear_weight'
  | 'allometric_0.75'
  | 'allometric_maturation'
  | 'bsa_based'
  | 'age_based'
  | 'pbpk_predicted'
  | 'therapeutic_drug_monitoring';

export type ExtrapolationLevel =
  | 'full_extrapolation'
  | 'partial_extrapolation_pk_pd'
  | 'partial_extrapolation_pk_efficacy'
  | 'no_extrapolation_full_program';

export type DeferralWaiverType =
  | 'full_waiver'
  | 'partial_waiver'
  | 'class_waiver'
  | 'deferral'
  | 'none';

// ─────────────────────────────────────────────────────────────────────────────
// Result interfaces
// ─────────────────────────────────────────────────────────────────────────────

export interface AgeClassificationResult {
  ageBand: PediatricAgeBand;
  ageRange: string;
  ichE11Label: string;
  developmentalConsiderations: string[];
  pkImplications: {
    renal: string;
    hepatic: string;
    bodyComposition: string;
    absorption: string;
    proteinBinding: string;
  };
  organMaturation: {
    gfrPercentOfAdult: string;
    cypActivity: Record<string, string>;
    bodyWaterPercent: string;
    bodyFatPercent: string;
    albuminLevel: string;
  };
  formulationPreferences: FormulationType[];
  consentRequirements: string;
  references: string[];
}

export interface PIPDesignResult {
  regulatoryFramework: {
    fda: {
      applies: boolean;
      mechanism: string;
      requirements: string[];
      timeline: string;
    };
    ema: {
      applies: boolean;
      mechanism: string;
      requirements: string[];
      timeline: string;
    };
  };
  pipStructure: {
    quality: string[];
    nonclinical: string[];
    clinical: string[];
  };
  requiredStudies: Array<{
    studyType: string;
    ageBands: PediatricAgeBand[];
    objective: string;
    designRecommendation: string;
  }>;
  deferralWaiverAssessment: {
    type: DeferralWaiverType;
    justification: string;
    conditions: string[];
  };
  submissionTiming: string;
  references: string[];
}

export interface ExtrapolationResult {
  feasibility: ExtrapolationLevel;
  diseaseProgressionSimilarity: string;
  drugResponseSimilarity: string;
  rationale: string;
  studyRequirements: {
    pkStudy: boolean;
    pdStudy: boolean;
    efficacyStudy: boolean;
    safetyStudy: boolean;
    studyDesigns: string[];
  };
  bayesianBorrowing: {
    applicable: boolean;
    approach: string;
    priorSource: string;
  };
  evidenceNeeded: string[];
  regulatoryPrecedents: string[];
  references: string[];
}

export interface FormulationResult {
  recommendedFormulations: Array<{
    formulation: FormulationType;
    suitability: 'preferred' | 'acceptable' | 'conditional';
    rationale: string;
    acceptabilityEvidence: string;
  }>;
  excipientSafety: Array<{
    excipient: string;
    status: 'safe' | 'restricted' | 'contraindicated';
    limit: string;
    ageRestriction: string;
    reference: string;
  }>;
  palatabilityRequirements: string[];
  dosingDeviceRequirements: string[];
  emaReflectionPaperGuidance: string[];
  references: string[];
}

export interface DoseSelectionResult {
  recommendedMethod: DoseScalingMethod;
  scalingRationale: string;
  doseRecommendation: {
    method: string;
    formula: string;
    adjustmentFactors: string[];
    practicalConsiderations: string[];
  };
  doseBanding: {
    recommended: boolean;
    rationale: string;
    bandingApproach: string;
  };
  safetyConsiderations: string[];
  tdmRecommendation: {
    recommended: boolean;
    rationale: string;
    targetRange: string;
  };
  references: string[];
}

export interface PediatricRequirementsResult {
  regulatoryObligations: {
    fdaPrea: {
      required: boolean;
      mechanism: string;
      exclusivity: string;
      timeline: string;
    };
    emaPdco: {
      required: boolean;
      mechanism: string;
      rewards: string;
      timeline: string;
    };
  };
  ethicalRequirements: {
    consentModel: string;
    assentAge: string;
    minimalRiskDefinition: string;
    irbEcRequirements: string[];
    additionalSafeguards: string[];
  };
  orphanConsiderations: {
    applicable: boolean;
    incentives: string[];
    waiverImplications: string;
  };
  timeline: {
    pipPspSubmission: string;
    studyCompletion: string;
    dataSubmission: string;
  };
  references: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal knowledge corpus
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ICH E11(R1) age-band definitions with developmental pharmacology data.
 * GFR maturation based on Rhodin et al. (2009) and Schwartz formula norms.
 * CYP ontogeny based on Hines (2008) and de Wildt et al. (1999).
 * Body composition based on Friis-Hansen (1961) and Fomon et al. (1982).
 */
const AGE_BAND_DATA: Record<PediatricAgeBand, {
  ageRange: string;
  ichLabel: string;
  developmental: string[];
  renal: string;
  hepatic: string;
  bodyComp: string;
  absorption: string;
  proteinBinding: string;
  gfrPctAdult: string;
  cyp: Record<string, string>;
  waterPct: string;
  fatPct: string;
  albuminLevel: string;
  formulations: FormulationType[];
  consent: string;
}> = {
  preterm_neonate: {
    ageRange: 'Gestational age <37 weeks',
    ichLabel: 'Preterm newborn infants',
    developmental: [
      'Immature organ systems across all domains; high vulnerability to excipient toxicity',
      'Blood-brain barrier incomplete — increased CNS drug penetration',
      'Immature hepatic conjugation (glucuronidation deficient until ~2 months post-natal)',
      'Very low GFR at birth (~10-20% of adult normalized); rapid postnatal maturation',
      'High total body water (up to 85%) and low body fat (~1-2%) alter Vd for hydrophilic/lipophilic drugs',
      'Reduced plasma protein levels (albumin, alpha-1 acid glycoprotein) increase free fraction',
      'Gastric pH near neutral (pH 6-8) at birth; delayed gastric emptying',
      'Immature skin barrier — significantly increased percutaneous absorption',
      'Patent ductus arteriosus may alter hepatic and renal blood flow',
    ],
    renal: 'GFR 10-20% of adult values (normalized to BSA). Tubular secretion and reabsorption markedly immature. Nephrogenesis ongoing until 34-36 weeks gestational age. Dose adjustment essential for renally cleared drugs.',
    hepatic: 'Phase I: CYP3A7 predominates (fetal isoform); CYP3A4 near-absent. CYP1A2 essentially absent. CYP2D6 ~5-10% adult activity. Phase II: UGT activity very low; sulfonation relatively preserved. Risk of kernicterus from bilirubin displacement.',
    bodyComp: 'Total body water ~80-85%. Body fat ~1-2%. Very high Vd for hydrophilic drugs; reduced Vd for lipophilic drugs compared to older children.',
    absorption: 'Gastric pH near neutral at birth (achlorhydria). Delayed and irregular gastric emptying. Reduced bile salt pool. Oral bioavailability highly variable and unpredictable. Rectal absorption relatively reliable.',
    proteinBinding: 'Albumin 2.0-3.0 g/dL (adult 3.5-5.0 g/dL). Alpha-1 acid glycoprotein very low. Fetal albumin has lower binding affinity. Elevated free fractions for highly protein-bound drugs (phenytoin, diazepam). Bilirubin competes for albumin binding sites.',
    gfrPctAdult: '10-20% (normalized to 1.73 m² BSA)',
    cyp: {
      CYP3A4: '<5% of adult activity; CYP3A7 (fetal form) predominant',
      CYP3A7: 'High expression (predominant hepatic CYP at birth)',
      CYP1A2: 'Essentially absent; not detectable until 1-3 months postnatal',
      CYP2D6: '5-10% of adult activity',
      CYP2C9: '~10% of adult activity',
      CYP2C19: '~15-20% of adult activity (polymorphic maturation)',
      CYP2E1: 'Detectable within hours of birth; ~30% of adult by first week',
      UGT1A1: 'Very low (<10% adult); physiological jaundice risk',
      UGT2B7: '~10-20% of adult activity; morphine glucuronidation impaired',
    },
    waterPct: '80-85%',
    fatPct: '1-2%',
    albuminLevel: '2.0-3.0 g/dL',
    formulations: ['injectable', 'oral_solution', 'rectal_suppository'],
    consent: 'Parent/legal guardian consent required. No assent possible. IRB/EC must include neonatal expertise. Studies require additional safeguards per 21 CFR 50.51-54 (FDA) or Article 32 of Directive 2001/20/EC (EU).',
  },

  term_neonate: {
    ageRange: '0 to 27 days (≥37 weeks gestational age)',
    ichLabel: 'Term newborn infants (0 to 27 days)',
    developmental: [
      'Rapid physiological adaptation to extrauterine life in first 48-72 hours',
      'Hepatic enzyme systems undergoing rapid postnatal induction',
      'GFR doubles in first 2 weeks of life; still markedly below adult values',
      'Gastric pH drops from ~6-8 at birth to ~1-3 by day 10 (variable)',
      'Blood-brain barrier more permeable than in older infants',
      'Total body water ~75%; body fat ~12-15%',
      'Transitioning from fetal to neonatal hemoglobin',
    ],
    renal: 'GFR ~25-30% of adult at birth (term), doubling by 2 weeks. Tubular function immature. Aminoglycosides require extended interval dosing. Serum creatinine initially reflects maternal values.',
    hepatic: 'CYP3A7→CYP3A4 transition initiating. CYP1A2 absent. CYP2D6 ~10-15% adult. UGT1A1 rising (jaundice resolving). Phase II conjugation (glucuronidation) still well below adult.',
    bodyComp: 'Total body water ~75%. Body fat ~12-15% (term). Larger Vd/kg for aminoglycosides and vancomycin than in adults.',
    absorption: 'Gastric pH initially elevated (6-8), decreases over first 10 days. Gastric emptying prolonged and erratic. Intestinal transit time variable. Oral bioavailability unpredictable for many drugs.',
    proteinBinding: 'Albumin 2.5-3.5 g/dL. Binding capacity reduced but improving. Displacement interactions with bilirubin remain clinically relevant in first 2 weeks.',
    gfrPctAdult: '25-30% at birth; ~50% by 2 weeks',
    cyp: {
      CYP3A4: '~10% of adult; CYP3A7 still dominant but declining',
      CYP3A7: 'Still predominant but beginning to decline',
      CYP1A2: 'Absent to trace; not clinically relevant',
      CYP2D6: '10-15% of adult activity',
      CYP2C9: '~15% of adult activity',
      CYP2C19: '~20-30% of adult activity',
      CYP2E1: '~40% of adult by 1 week',
      UGT1A1: '~20% of adult; physiological jaundice still possible',
      UGT2B7: '~20-30% of adult',
    },
    waterPct: '75%',
    fatPct: '12-15%',
    albuminLevel: '2.5-3.5 g/dL',
    formulations: ['injectable', 'oral_solution', 'rectal_suppository'],
    consent: 'Parent/legal guardian consent required. No assent possible. IRB/EC must include neonatal expertise.',
  },

  infant: {
    ageRange: '28 days to 23 months',
    ichLabel: 'Infants and toddlers (28 days to 23 months)',
    developmental: [
      'Rapid organ maturation — most enzyme systems reach near-adult levels by 12-24 months',
      'GFR reaches adult values (normalized to BSA) by 6-12 months',
      'CYP3A4 surpasses adult activity by 1-2 years (supra-adult levels)',
      'Increased per-kg clearance compared to adults for many drugs',
      'Body composition shifting: decreasing total body water, increasing fat',
      'Myelination ongoing — blood-brain barrier more mature but still developing',
      'Rapid growth and weight changes necessitate frequent dose adjustments',
      'Teething affects acceptance of oral formulations',
    ],
    renal: 'GFR rapidly matures: ~50% adult at 1 month, ~80% by 6 months, adult-equivalent (per BSA) by 6-12 months. Tubular function matures in parallel. Most renally cleared drugs can use near-adult-equivalent dosing by 6 months with appropriate per-kg adjustment.',
    hepatic: 'CYP3A4 activity rises rapidly, reaching and often exceeding adult levels by 6-12 months. CYP1A2 detectable at 1-3 months, reaching ~50% adult by 12 months. CYP2D6 approaches adult activity by 3-6 months. UGT matures to near-adult by 3-6 months.',
    bodyComp: 'Total body water decreases from ~75% to ~60% over 12 months. Body fat increases to peak of ~25-30% at ~6 months, then decreases. Per-kg volumes of distribution change substantially across this age range.',
    absorption: 'Gastric acid secretion matures by ~3 months. Gastric emptying normalizes by 6-8 months. Bile salt pool adequate for lipophilic drug absorption by ~6 months. Oral bioavailability more predictable than in neonates.',
    proteinBinding: 'Albumin reaches adult levels by 6-12 months. Alpha-1 acid glycoprotein reaches adult range by 1 year. Protein binding approaches adult values, but continued monitoring warranted for drugs with narrow therapeutic index.',
    gfrPctAdult: '50% at 1 month → 80% at 6 months → ~100% by 12 months (per BSA)',
    cyp: {
      CYP3A4: 'Rising rapidly; 50% adult by 6 months, ≥100% by 12 months (may exceed adult)',
      CYP3A7: 'Declining; minimal by 6 months',
      CYP1A2: 'Detectable 1-3 months; ~50% adult by 12 months',
      CYP2D6: '50-70% adult by 3 months; near-adult by 6 months',
      CYP2C9: '~50% adult by 6 months; near-adult by 12 months',
      CYP2C19: '~50% adult by 6 months',
      CYP2E1: 'Near-adult levels by 3 months',
      UGT1A1: 'Near-adult by 3-6 months',
      UGT2B7: 'Near-adult by 3-6 months',
    },
    waterPct: '60-75% (decreasing across range)',
    fatPct: '15-30% (peaks ~6 months)',
    albuminLevel: '3.0-4.5 g/dL (approaches adult by 12 months)',
    formulations: ['oral_solution', 'oral_suspension', 'granules_sprinkle', 'mini_tablet', 'rectal_suppository', 'injectable'],
    consent: 'Parent/legal guardian consent required. No assent expected. Consider using familiar caregivers and minimizing painful procedures.',
  },

  child: {
    ageRange: '2 to 11 years',
    ichLabel: 'Children (2 to 11 years)',
    developmental: [
      'Most organ systems have matured to adult functional capacity',
      'CYP3A4 and CYP1A2 activity may exceed adult levels (supra-adult clearance)',
      'Higher per-kg clearance than adults — may require higher mg/kg doses',
      'GFR at adult levels (per BSA); absolute GFR scales with body size',
      'Body composition approaching adult proportions by late childhood',
      'Cognitive development allows increasing participation in assent',
      'Psychosocial development varies widely; taste/palatability critical for adherence',
      'Growth considerations: long-term effects on growth plates, puberty timing',
    ],
    renal: 'GFR at adult equivalent per BSA. Absolute renal clearance scales with body size. Weight-based dosing generally appropriate for renally cleared drugs.',
    hepatic: 'CYP3A4 activity often 120-150% of adult levels (ages 1-5), normalizing toward adult values by puberty. CYP1A2 ~80-100% adult by age 4. CYP2D6 at adult levels. Higher per-kg hepatic clearance may necessitate higher per-kg doses than adults (e.g., carbamazepine, theophylline).',
    bodyComp: 'Total body water ~55-65%. Body fat ~15-20% (lower than infants, rising toward puberty). Body composition is sex-neutral before puberty.',
    absorption: 'GI function essentially mature. Gastric emptying and intestinal transit comparable to adults. Biliary function mature. Oral bioavailability generally comparable to adults.',
    proteinBinding: 'Albumin and alpha-1 acid glycoprotein at adult levels. Protein binding equivalent to adults for most drugs.',
    gfrPctAdult: '~100% (per BSA)',
    cyp: {
      CYP3A4: '100-150% of adult (supra-adult in early childhood, normalizing)',
      CYP3A7: 'Absent',
      CYP1A2: '80-100% adult by age 4',
      CYP2D6: 'Adult levels; genotype-dependent',
      CYP2C9: 'Adult levels',
      CYP2C19: 'Adult levels; genotype-dependent',
      CYP2E1: 'Adult levels',
      UGT1A1: 'Adult levels',
      UGT2B7: 'Adult levels',
    },
    waterPct: '55-65%',
    fatPct: '15-20%',
    albuminLevel: '3.5-5.0 g/dL (adult range)',
    formulations: ['mini_tablet', 'chewable_tablet', 'orodispersible_tablet', 'oral_solution', 'oral_suspension', 'granules_sprinkle', 'conventional_tablet', 'capsule', 'inhaled', 'topical'],
    consent: 'Parent/legal guardian consent required. Assent required from approximately age 7 (varies by jurisdiction and institutional policy). Child-friendly information sheets required.',
  },

  adolescent: {
    ageRange: '12 to <18 years (to 16 in some jurisdictions)',
    ichLabel: 'Adolescents (12 to 16/18 years)',
    developmental: [
      'Organ function and enzyme activity at adult levels in most cases',
      'Puberty introduces sex-based differences in PK (body composition, CYP activity)',
      'Body composition diverges by sex: increased muscle mass (male), increased fat (female)',
      'CYP3A4 normalizes to adult levels; CYP1A2 may show sex differences',
      'Adult formulations generally acceptable; adherence is the primary challenge',
      'Psychosocial development: autonomy, risk behavior, adherence challenges',
      'Reproductive safety considerations (pregnancy prevention, teratogenicity)',
      'Growth plate closure considerations for drugs affecting bone metabolism',
    ],
    renal: 'Adult GFR (absolute values proportional to adult body size). Standard adult dosing approaches generally appropriate with weight or BSA adjustment.',
    hepatic: 'CYP enzyme activity at adult levels. Possible sex-related differences emerging with puberty (e.g., CYP1A2 higher in post-pubertal males). Adult metabolic pathways fully operational.',
    bodyComp: 'Total body water 50-60%. Body fat highly variable (females 20-28%, males 12-18%). Significant variability during pubertal transition. Weight-based dosing may need capping to avoid supratherapeutic exposure in obese adolescents.',
    absorption: 'Adult GI function. Oral bioavailability equivalent to adults.',
    proteinBinding: 'Adult levels for all binding proteins. No pediatric-specific adjustments needed.',
    gfrPctAdult: '~100% (absolute adult values)',
    cyp: {
      CYP3A4: 'Adult levels',
      CYP3A7: 'Absent',
      CYP1A2: 'Adult levels (may be higher in post-pubertal males)',
      CYP2D6: 'Adult levels; genotype-dependent',
      CYP2C9: 'Adult levels',
      CYP2C19: 'Adult levels; genotype-dependent',
      CYP2E1: 'Adult levels',
      UGT1A1: 'Adult levels',
      UGT2B7: 'Adult levels',
    },
    waterPct: '50-60%',
    fatPct: '12-28% (sex-dependent)',
    albuminLevel: '3.5-5.0 g/dL (adult)',
    formulations: ['conventional_tablet', 'capsule', 'orodispersible_tablet', 'oral_solution', 'injectable', 'inhaled', 'topical', 'nasal'],
    consent: 'Parent/legal guardian consent required. Adolescent assent required. In some jurisdictions (e.g., UK at 16, some US states), adolescents may consent independently for certain research. Reproductive counseling and pregnancy testing may be required.',
  },
};

/**
 * Excipient safety data per EMA guidance (EMA/CHMP/QWP/805880/2012 Rev. 2)
 * and STEP database (Safety and Toxicity of Excipients for Paediatrics).
 */
const EXCIPIENT_SAFETY: Array<{
  excipient: string;
  concern: string;
  limit: string;
  ageRestriction: string;
  reference: string;
}> = [
  {
    excipient: 'Ethanol',
    concern: 'CNS depression, hypoglycemia, metabolic acidosis in neonates',
    limit: 'Avoid in neonates and infants <2 years. If unavoidable: neonates <6 mg/kg/dose, children max 75 mg/dose (EMA limit). FDA: ≤0.5% in OTC products for children <6 years.',
    ageRestriction: 'Contraindicated in preterm and term neonates. Restricted in infants/young children.',
    reference: 'EMA/CHMP/QWP/805880/2012 Rev. 2; STEP database',
  },
  {
    excipient: 'Benzyl alcohol',
    concern: '"Gasping syndrome" in neonates — metabolic acidosis, CNS depression, cardiovascular collapse, multi-organ failure, death.',
    limit: 'Contraindicated in neonates. EMA: max 5 mg/kg/day in children >4 weeks. FDA: avoid in neonates and low-birth-weight infants.',
    ageRestriction: 'Contraindicated in preterm and term neonates. Avoid in infants <28 days.',
    reference: 'FDA Safety Alert (1982); EMA/CHMP/QWP/805880/2012 Rev. 2',
  },
  {
    excipient: 'Propylene glycol',
    concern: 'CNS depression, hyperosmolality, lactic acidosis, seizures. Immature alcohol dehydrogenase in neonates.',
    limit: 'EMA: neonates max 1 mg/kg/day; infants 1-23 months max 50 mg/kg/day; children 2-11 years max 200 mg/kg/day (not to exceed 5 g/day). FDA: avoid in neonates.',
    ageRestriction: 'Severely restricted in neonates. Dose-limited in all pediatric age groups.',
    reference: 'EMA/CHMP/QWP/805880/2012 Rev. 2; WHO STEP guideline',
  },
  {
    excipient: 'Aspartame',
    concern: 'Source of phenylalanine — contraindicated in phenylketonuria (PKU).',
    limit: 'Requires labeling for PKU. Acceptable in non-PKU children at standard sweetener doses.',
    ageRestriction: 'No age restriction beyond PKU labeling.',
    reference: 'EMA/CHMP/QWP/805880/2012 Rev. 2',
  },
  {
    excipient: 'Sorbitol',
    concern: 'Osmotic diarrhea, abdominal pain. Fructose intolerance risk.',
    limit: 'EMA: laxative threshold ~10 g/day adults. Children: proportionally lower thresholds. Contraindicated in hereditary fructose intolerance.',
    ageRestriction: 'Avoid high doses in all pediatric groups. Contraindicated in fructose intolerance.',
    reference: 'EMA/CHMP/QWP/805880/2012 Rev. 2',
  },
  {
    excipient: 'Parabens (methyl/propylparaben)',
    concern: 'Weak estrogenic activity. Potential sensitization. Immature conjugation in neonates.',
    limit: 'EMA: avoid in neonates if possible. Use lowest effective concentration. Consider alternatives.',
    ageRestriction: 'Avoid in neonates. Use with caution in infants.',
    reference: 'EMA/CHMP/QWP/805880/2012 Rev. 2; STEP database',
  },
  {
    excipient: 'Polysorbate 80',
    concern: 'E-Ferol syndrome (hepatic/renal failure) reported in neonates with IV polysorbate 80.',
    limit: 'Avoid IV in neonates. Oral use at low levels generally acceptable.',
    ageRestriction: 'IV use contraindicated in neonates.',
    reference: 'FDA historical safety data; EMA/CHMP/QWP/805880/2012 Rev. 2',
  },
  {
    excipient: 'Cyclodextrins (hydroxypropyl-beta-cyclodextrin)',
    concern: 'Renal tubular vacuolation in animal studies. Accumulation with immature renal function.',
    limit: 'EMA: avoid parenteral use in neonates and young infants with immature renal function. Oral use generally acceptable.',
    ageRestriction: 'Parenteral: avoid in neonates. Oral: acceptable with monitoring.',
    reference: 'EMA reflection paper on cyclodextrins (EMA/CHMP/333892/2013)',
  },
  {
    excipient: 'Saccharin',
    concern: 'Potential accumulation in neonates due to immature renal clearance.',
    limit: 'Avoid in neonates. Use at low concentrations in older children. ADI: 5 mg/kg/day.',
    ageRestriction: 'Avoid in neonates and young infants (<3 months).',
    reference: 'EMA/CHMP/QWP/805880/2012 Rev. 2',
  },
];

/**
 * EMA class waivers — therapeutic classes where pediatric studies are waived
 * because the disease or condition does not occur in children. Based on
 * EMA revised class waiver list (Commission Decision C(2015) 6600).
 */
const CLASS_WAIVER_CONDITIONS: string[] = [
  'Alzheimer disease / dementia (all subtypes)',
  'Amyotrophic lateral sclerosis (ALS)',
  'Age-related macular degeneration',
  'Atrial fibrillation (chronic/paroxysmal in adults)',
  'Benign prostatic hyperplasia',
  'Erectile dysfunction',
  'Hepatocellular carcinoma (adult-type)',
  'Cervical cancer (HPV-related)',
  'Mesothelioma',
  'Non-small cell lung cancer (adult-type)',
  'Osteoarthritis (degenerative)',
  'Osteoporosis (postmenopausal / age-related)',
  'Parkinson disease',
  'Peripheral arterial occlusive disease (atherosclerotic)',
  'Prostate cancer',
  'Renal cell carcinoma (adult-type)',
  'Chronic obstructive pulmonary disease (COPD)',
  'Endometriosis',
  'Infertility (adult)',
  'Menopause-related conditions',
];

/**
 * Extrapolation decision tree per FDA Guidance (2016) and EMA Reflection
 * Paper (EMA/199678/2016). Conditions scored on two axes: disease similarity
 * and response similarity.
 */
const EXTRAPOLATION_CONDITIONS: Record<string, {
  diseaseSimilarity: 'similar' | 'uncertain' | 'different';
  responseSimilarity: 'similar' | 'uncertain' | 'different';
  examples: string[];
}> = {
  'hypertension': { diseaseSimilarity: 'similar', responseSimilarity: 'similar', examples: ['ACE inhibitors', 'ARBs', 'calcium channel blockers'] },
  'type_2_diabetes': { diseaseSimilarity: 'uncertain', responseSimilarity: 'similar', examples: ['Metformin', 'GLP-1 agonists'] },
  'asthma': { diseaseSimilarity: 'similar', responseSimilarity: 'similar', examples: ['ICS', 'LABA', 'leukotriene antagonists'] },
  'hiv': { diseaseSimilarity: 'similar', responseSimilarity: 'similar', examples: ['NRTIs', 'NNRTIs', 'protease inhibitors', 'integrase inhibitors'] },
  'epilepsy': { diseaseSimilarity: 'uncertain', responseSimilarity: 'uncertain', examples: ['Age-dependent seizure types', 'electrographic patterns differ'] },
  'depression': { diseaseSimilarity: 'uncertain', responseSimilarity: 'uncertain', examples: ['SSRIs (mixed adult/peds efficacy correlation)', 'presentation differs by age'] },
  'pain_acute': { diseaseSimilarity: 'similar', responseSimilarity: 'similar', examples: ['NSAIDs', 'acetaminophen'] },
  'crohn_disease': { diseaseSimilarity: 'uncertain', responseSimilarity: 'similar', examples: ['TNF inhibitors', 'growth impairment unique to pediatrics'] },
  'ulcerative_colitis': { diseaseSimilarity: 'similar', responseSimilarity: 'similar', examples: ['Mesalamine', 'TNF inhibitors'] },
  'rheumatoid_arthritis_jia': { diseaseSimilarity: 'uncertain', responseSimilarity: 'similar', examples: ['JIA is distinct entity; biologics show cross-age efficacy'] },
  'oncology_solid_tumor': { diseaseSimilarity: 'different', responseSimilarity: 'uncertain', examples: ['Pediatric tumors biologically distinct', 'molecular targets may overlap'] },
  'rare_metabolic': { diseaseSimilarity: 'similar', responseSimilarity: 'similar', examples: ['Enzyme replacement therapies', 'same enzyme deficiency across ages'] },
  'cystic_fibrosis': { diseaseSimilarity: 'similar', responseSimilarity: 'similar', examples: ['CFTR modulators (ivacaftor, lumacaftor/ivacaftor)'] },
  'transplant_rejection': { diseaseSimilarity: 'similar', responseSimilarity: 'similar', examples: ['Calcineurin inhibitors', 'mTOR inhibitors'] },
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API — deterministic knowledge functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify a patient's age into the ICH E11(R1) age band and return
 * comprehensive developmental pharmacology considerations.
 *
 * @param params.ageValue — numeric age value
 * @param params.ageUnit — 'weeks_gestational' | 'days' | 'months' | 'years'
 * @param params.gestationalAge — gestational age in weeks (for neonates)
 */
export function classifyPediatricAge(params: {
  ageValue: number;
  ageUnit: 'weeks_gestational' | 'days' | 'months' | 'years';
  gestationalAge?: number;
}): AgeClassificationResult {
  const band = resolveAgeBand(params.ageValue, params.ageUnit, params.gestationalAge);
  const data = AGE_BAND_DATA[band];

  return {
    ageBand: band,
    ageRange: data.ageRange,
    ichE11Label: data.ichLabel,
    developmentalConsiderations: data.developmental,
    pkImplications: {
      renal: data.renal,
      hepatic: data.hepatic,
      bodyComposition: data.bodyComp,
      absorption: data.absorption,
      proteinBinding: data.proteinBinding,
    },
    organMaturation: {
      gfrPercentOfAdult: data.gfrPctAdult,
      cypActivity: { ...data.cyp },
      bodyWaterPercent: data.waterPct,
      bodyFatPercent: data.fatPct,
      albuminLevel: data.albuminLevel,
    },
    formulationPreferences: [...data.formulations],
    consentRequirements: data.consent,
    references: [
      'ICH E11(R1): Clinical Investigation of Medicinal Products in the Pediatric Population (2017)',
      'Rhodin MM et al. Human renal function maturation: a quantitative description using weight and postmenstrual age. Pediatr Nephrol 2009;24:67-76',
      'Hines RN. The ontogeny of drug metabolism enzymes and implications for adverse drug events. Pharmacol Ther 2008;118:250-267',
      'Friis-Hansen B. Body water compartments in children. Pediatrics 1961;28:169-181',
      'de Wildt SN et al. Cytochrome P450 3A: ontogeny and drug disposition. Clin Pharmacokinet 1999;37:485-505',
      'Kearns GL et al. Developmental pharmacology — drug disposition, action, and therapy in infants and children. NEJM 2003;349:1157-1167',
    ],
  };
}

/**
 * Design a Pediatric Investigation Plan (PIP) or Pediatric Study Plan (PSP)
 * based on drug characteristics, therapeutic area, and target population.
 */
export function designPIP(params: {
  drugName: string;
  therapeuticArea: TherapeuticArea;
  indication: string;
  targetAgeBands: PediatricAgeBand[];
  isOrphan?: boolean;
  adultApprovalStatus: 'pre_approval' | 'approved' | 'under_review';
  routeOfAdministration: string;
  mechanismOfAction?: string;
  condition?: string;
}): PIPDesignResult {
  const isClassWaiver = CLASS_WAIVER_CONDITIONS.some(
    c => params.condition?.toLowerCase().includes(c.toLowerCase().split(' ')[0]) ||
         params.indication.toLowerCase().includes(c.toLowerCase().split(' ')[0])
  );

  // Determine deferral/waiver
  let deferralWaiver: { type: DeferralWaiverType; justification: string; conditions: string[] };
  if (isClassWaiver) {
    deferralWaiver = {
      type: 'class_waiver',
      justification: `The condition "${params.indication}" is on the EMA class waiver list (Commission Decision C(2015) 6600) because it does not occur in the pediatric population.`,
      conditions: ['Waiver applies to all pediatric subsets.'],
    };
  } else if (params.isOrphan && params.targetAgeBands.length <= 2) {
    deferralWaiver = {
      type: 'deferral',
      justification: 'Orphan designation with limited pediatric population. Deferral of pediatric studies until adult efficacy and safety data are available. EMA Article 21 / FDA 505B(1).',
      conditions: [
        'Adult efficacy and safety data must be available before pediatric studies commence.',
        'A stepwise pediatric development starting with the oldest pediatric age group is recommended.',
        'Post-marketing commitment with defined milestones required.',
      ],
    };
  } else if (params.adultApprovalStatus === 'pre_approval') {
    deferralWaiver = {
      type: 'deferral',
      justification: 'Adult development ongoing. Pediatric studies deferred until sufficient adult safety and efficacy data are available per ICH E11(R1) Section 2.6.',
      conditions: [
        'PIP/PSP should be submitted and agreed before or during Phase 2 adult development.',
        'Deferral milestones must be defined with agreed-upon timelines.',
        'Nonclinical juvenile animal studies may need to proceed in parallel with adult Phase 3.',
      ],
    };
  } else {
    deferralWaiver = {
      type: 'none',
      justification: 'No waiver or deferral applicable. Full pediatric development required.',
      conditions: [],
    };
  }

  // Build required studies
  const requiredStudies: PIPDesignResult['requiredStudies'] = [];
  const sortedBands = sortAgeBands(params.targetAgeBands);

  for (const band of sortedBands) {
    // PK study needed for all age bands
    requiredStudies.push({
      studyType: 'Pediatric PK study',
      ageBands: [band],
      objective: `Characterize pharmacokinetics of ${params.drugName} in ${AGE_BAND_DATA[band].ichLabel} to identify age-appropriate dosing.`,
      designRecommendation: band === 'preterm_neonate' || band === 'term_neonate'
        ? 'Population PK using sparse sampling (opportunistic or scavenged samples preferred). Micro-sampling techniques (DBS) recommended. Maximum blood volume ≤3% of total in 24 hours, ≤1% per sample.'
        : band === 'infant'
        ? 'Population PK with sparse sampling. Rich sampling only in older infants if justified. Consider micro-sampling methods (DBS, micro-volumes).'
        : 'Population PK or conventional PK study. Sparse or rich sampling depending on drug characteristics and ethical considerations.',
    });

    // Safety study for all bands
    requiredStudies.push({
      studyType: 'Pediatric safety study',
      ageBands: [band],
      objective: `Evaluate safety and tolerability in ${AGE_BAND_DATA[band].ichLabel}. Assess growth, development, and age-specific adverse events.`,
      designRecommendation: 'Open-label or double-blind extension. Growth monitoring (height, weight, head circumference, Tanner staging in adolescents). Neurodevelopmental assessments in children <6 years. Minimum 6-12 months follow-up.',
    });

    // Efficacy study depends on extrapolation feasibility
    if (band === 'preterm_neonate' || band === 'term_neonate') {
      requiredStudies.push({
        studyType: 'Neonatal efficacy/safety study',
        ageBands: [band],
        objective: `Evaluate efficacy and safety in neonates. Disease pathophysiology and drug response may differ substantially from older children.`,
        designRecommendation: 'Small randomized or historically controlled study. Consider adaptive or Bayesian designs to minimize exposure. Study must comply with EMA neonatal guideline (EMEA/536810/2008). Separate neonatal formulation may be required.',
      });
    }
  }

  // Nonclinical: juvenile animal study assessment
  const juvenileStudyNeeded = sortedBands.some(b => b === 'preterm_neonate' || b === 'term_neonate' || b === 'infant' || b === 'child');

  const nonclinicalStudies: string[] = [];
  if (juvenileStudyNeeded) {
    nonclinicalStudies.push(
      'Juvenile animal toxicology study (JAS) per ICH S11 required when target population includes children <12 years.',
      'Species selection: rat or dog depending on PK/pharmacology relevance; must cover equivalent developmental stages.',
      'Assess effects on growth, organ maturation, neurobehavioral development, reproductive organ development, skeletal development.',
      'Timing: JAS should be completed before enrollment of the corresponding pediatric age group.',
    );
  } else {
    nonclinicalStudies.push(
      'Juvenile animal study may not be required if target population is limited to adolescents and adult toxicology data are sufficient (ICH S11).',
    );
  }

  // Quality/formulation requirements
  const qualityReqs: string[] = [
    'Age-appropriate formulation development per EMA Reflection Paper (EMA/CHMP/QWP/805880/2012 Rev. 2).',
    'Palatability assessment (taste, texture, volume, dosing frequency) per target age bands.',
    'Excipient safety assessment using STEP database for each target age group.',
  ];
  if (sortedBands.includes('preterm_neonate') || sortedBands.includes('term_neonate')) {
    qualityReqs.push(
      'Neonatal formulation: preservative-free, low osmolality (<500 mOsm/kg), appropriate concentration for accurate neonatal dosing.',
      'Compatibility with neonatal enteral feeding tubes and IV administration sets if applicable.',
    );
  }
  if (sortedBands.includes('infant') || sortedBands.includes('child')) {
    qualityReqs.push(
      'Oral liquid or mini-tablet formulation for infants/young children. Flexible dosing capability.',
      'Dosing device (oral syringe, graduated dropper) with markings appropriate for the dose range.',
    );
  }

  return {
    regulatoryFramework: {
      fda: {
        applies: true,
        mechanism: params.adultApprovalStatus === 'approved'
          ? 'PREA (Pediatric Research Equity Act, 21 USC §355c) — mandatory pediatric studies for new active ingredients, new indications, new dosage forms, new dosing regimens, new routes of administration.'
          : 'PREA requirement triggered at NDA/BLA submission. Pediatric Study Plan (PSP) must be submitted no later than 60 days after End-of-Phase 2 meeting (21 CFR 314.55).',
        requirements: [
          'Pediatric Study Plan (PSP) agreed with FDA Division',
          'Studies in relevant age groups unless waiver/deferral granted',
          'Extrapolation justified per FDA Extrapolation Guidance (2016)',
          'Pediatric use supplement or labeling update required',
        ],
        timeline: 'PSP submitted ≤60 days after End-of-Phase 2 meeting. FDA responds within 90 days. Studies completed per agreed deferral milestones.',
      },
      ema: {
        applies: true,
        mechanism: 'EC No 1901/2006 (Paediatric Regulation) — PIP submission to PDCO required for all new marketing authorisations, new indications, new pharmaceutical forms, and new routes of administration.',
        requirements: [
          'PIP agreed with PDCO (Paediatric Committee)',
          'Compliance check before MA application (Article 23 verification)',
          'PIP modifications submitted if development plan changes',
          'Results posted in EudraCT regardless of outcome',
        ],
        timeline: 'PIP should be submitted at end of Phase 1 or early Phase 2 (no later than completion of adult PK studies). PDCO opinion within 120 days (with clock stops). Compliance check at MA application.',
      },
    },
    pipStructure: {
      quality: qualityReqs,
      nonclinical: nonclinicalStudies,
      clinical: requiredStudies.map(s => `${s.studyType} in ${s.ageBands.map(b => AGE_BAND_DATA[b].ichLabel).join(', ')}: ${s.objective}`),
    },
    requiredStudies,
    deferralWaiverAssessment: deferralWaiver,
    submissionTiming: params.adultApprovalStatus === 'pre_approval'
      ? 'FDA: PSP ≤60 days after EoP2 meeting. EMA: PIP at end of Phase 1/early Phase 2.'
      : 'FDA: Post-marketing requirement (PMR) with agreed milestones. EMA: PIP modification or new PIP for additional indication.',
    references: [
      'ICH E11(R1): Clinical Investigation of Medicinal Products in the Pediatric Population (2017)',
      'FDA PREA: 21 USC §355c (Pediatric Research Equity Act)',
      'EC No 1901/2006: Regulation on medicinal products for paediatric use',
      'FDA Guidance: Pediatric Study Plans — Content of and Process for Submitting Initial PSPs and Amended PSPs (2020)',
      'EMA PIP procedure: PDCO Standard Operating Procedure',
      'ICH S11: Nonclinical Safety Testing in Support of Development of Paediatric Pharmaceuticals (2020)',
      'EMA Guideline on the Investigation of Medicinal Products in the Term and Preterm Neonate (EMEA/536810/2008)',
    ],
  };
}

/**
 * Assess the feasibility of extrapolating adult efficacy data to a pediatric
 * population using the FDA/EMA decision framework.
 */
export function assessExtrapolation(params: {
  indication: string;
  therapeuticArea: TherapeuticArea;
  targetAgeBands: PediatricAgeBand[];
  diseaseProgressionSimilar: boolean | null;
  drugResponseSimilar: boolean | null;
  mechanismOfAction?: string;
  adultEfficacyEstablished: boolean;
  biomarkerAvailable?: boolean;
  condition?: string;
}): ExtrapolationResult {
  // Determine disease and response similarity
  let diseaseSim: 'similar' | 'uncertain' | 'different' = 'uncertain';
  let responseSim: 'similar' | 'uncertain' | 'different' = 'uncertain';

  // Check known conditions
  const conditionKey = Object.keys(EXTRAPOLATION_CONDITIONS).find(k =>
    params.indication.toLowerCase().includes(k.replace(/_/g, ' ')) ||
    (params.condition && params.condition.toLowerCase().includes(k.replace(/_/g, ' ')))
  );
  if (conditionKey) {
    diseaseSim = EXTRAPOLATION_CONDITIONS[conditionKey].diseaseSimilarity;
    responseSim = EXTRAPOLATION_CONDITIONS[conditionKey].responseSimilarity;
  }

  // Override with explicit user input
  if (params.diseaseProgressionSimilar === true) diseaseSim = 'similar';
  if (params.diseaseProgressionSimilar === false) diseaseSim = 'different';
  if (params.drugResponseSimilar === true) responseSim = 'similar';
  if (params.drugResponseSimilar === false) responseSim = 'different';

  // Neonates always require caution
  const hasNeonates = params.targetAgeBands.some(b => b === 'preterm_neonate' || b === 'term_neonate');
  if (hasNeonates && diseaseSim === 'similar') {
    diseaseSim = 'uncertain';
  }

  // Apply FDA/EMA decision tree
  let level: ExtrapolationLevel;
  let rationale: string;
  const studyReqs = {
    pkStudy: true,
    pdStudy: false,
    efficacyStudy: false,
    safetyStudy: true,
    studyDesigns: [] as string[],
  };
  const bayesian = {
    applicable: false,
    approach: '',
    priorSource: '',
  };
  const evidenceNeeded: string[] = [];
  const precedents: string[] = [];

  if (diseaseSim === 'similar' && responseSim === 'similar') {
    level = 'full_extrapolation';
    rationale = 'Disease progression and drug response are sufficiently similar between adults and the target pediatric population. Full extrapolation of efficacy is supportable per FDA Extrapolation Guidance (2016) and EMA Reflection Paper (EMA/199678/2016). Pediatric PK study to establish dosing + safety monitoring required.';
    studyReqs.studyDesigns.push(
      'Population PK study to establish exposure-matched dosing',
      'Open-label or controlled safety study with age-appropriate endpoints',
    );
    evidenceNeeded.push(
      'PK data demonstrating pediatric exposures match efficacious adult exposures',
      'Safety data in target pediatric population (minimum 6-12 months)',
      'Literature supporting disease similarity across ages',
    );
    bayesian.applicable = true;
    bayesian.approach = 'Informative prior from adult efficacy data for Bayesian analysis of pediatric exposure-response.';
    bayesian.priorSource = 'Adult Phase 2/3 efficacy data; historical pediatric data for the class if available.';
    precedents.push(
      'HIV antiretrovirals — full extrapolation widely accepted (e.g., dolutegravir, bictegravir)',
      'Asthma — ICS/LABA extrapolation with PK bridging for children ≥4 years',
      'Hypertension — ACE inhibitors/ARBs extrapolated with PK study',
    );
  } else if (diseaseSim === 'similar' && responseSim === 'uncertain') {
    level = 'partial_extrapolation_pk_pd';
    rationale = 'Disease is similar but drug response relationship is uncertain in the pediatric population. Partial extrapolation with PK and PD/biomarker study required to confirm drug response similarity.';
    studyReqs.pdStudy = true;
    studyReqs.studyDesigns.push(
      'PK/PD bridging study with pharmacodynamic or biomarker endpoints',
      'Exposure-response analysis to confirm adult-pediatric PD similarity',
      'Safety study with age-specific monitoring',
    );
    evidenceNeeded.push(
      'PK data in target pediatric population',
      'PD biomarker or surrogate endpoint data demonstrating similar drug response',
      'Exposure-response modeling bridging adult to pediatric data',
      'Safety data in target population',
    );
    bayesian.applicable = true;
    bayesian.approach = 'Bayesian hierarchical model borrowing adult exposure-response with skeptical pediatric prior.';
    bayesian.priorSource = 'Adult exposure-response data as informative prior; pediatric PD data to update.';
    precedents.push(
      'Type 2 diabetes — metformin PK/PD bridging in adolescents',
      'IBD — TNF inhibitors PK with biomarker (calprotectin, endoscopy) endpoints',
    );
  } else if (diseaseSim === 'uncertain' && responseSim === 'similar') {
    level = 'partial_extrapolation_pk_efficacy';
    rationale = 'Drug response is expected to be similar based on mechanism of action, but disease presentation or progression may differ in the pediatric population. PK study plus a controlled efficacy study with potentially modified endpoints required.';
    studyReqs.efficacyStudy = true;
    studyReqs.studyDesigns.push(
      'PK study for dosing',
      'Randomized controlled efficacy study (may be smaller than adult pivotal if Bayesian borrowing applied)',
      'Pediatric-specific efficacy endpoints may be needed',
      'Growth and development monitoring',
    );
    evidenceNeeded.push(
      'PK data for dose selection',
      'Efficacy data from controlled study (sample size may be reduced with Bayesian borrowing)',
      'Justification for endpoint selection (adult endpoint vs. pediatric-adapted endpoint)',
      'Long-term safety including growth and development',
    );
    bayesian.applicable = true;
    bayesian.approach = 'Bayesian augmented design — use adult efficacy data as informative prior to reduce required pediatric sample size.';
    bayesian.priorSource = 'Adult pivotal efficacy data with appropriate discounting (power prior or commensurate prior).';
    precedents.push(
      'JIA — biologics with modified ACR-Pedi endpoints, Bayesian borrowing from adult RA',
      'Epilepsy — AEDs with age-appropriate seizure classification',
    );
  } else {
    level = 'no_extrapolation_full_program';
    rationale = 'Both disease progression and drug response are uncertain or different in the pediatric population relative to adults. A full pediatric clinical development program (PK + efficacy + safety) is required. Extrapolation is not supportable.';
    studyReqs.pdStudy = true;
    studyReqs.efficacyStudy = true;
    studyReqs.studyDesigns.push(
      'Dose-finding study (Phase 2 equivalent) in the pediatric population',
      'Randomized controlled pivotal efficacy study with pediatric-specific endpoints',
      'Comprehensive safety program with long-term follow-up',
      'Consider adaptive/seamless Phase 2/3 designs to minimize sample size and timelines',
    );
    evidenceNeeded.push(
      'Complete PK characterization across target age groups',
      'Dose-response data in the pediatric population',
      'Pivotal efficacy data from adequately powered controlled trial',
      'Comprehensive safety database including growth and development',
      'Pediatric-specific endpoint validation if adult endpoints are not applicable',
    );
    bayesian.applicable = false;
    bayesian.approach = 'Limited applicability of adult data borrowing. Non-informative or weakly informative priors recommended if Bayesian design used.';
    bayesian.priorSource = 'Minimal adult data borrowing justified; pediatric data must stand independently.';
    precedents.push(
      'Pediatric oncology — most pediatric tumors require independent programs',
      'Neonatal sepsis — disease pathophysiology distinct from adult sepsis',
      'Pediatric depression — SSRIs required independent efficacy trials (adult efficacy did not predict pediatric efficacy)',
    );
  }

  return {
    feasibility: level,
    diseaseProgressionSimilarity: diseaseSim,
    drugResponseSimilarity: responseSim,
    rationale,
    studyRequirements: studyReqs,
    bayesianBorrowing: bayesian,
    evidenceNeeded,
    regulatoryPrecedents: precedents,
    references: [
      'FDA Guidance: Leveraging Existing Clinical Data for Extrapolation to Pediatric Uses of Medical Products (2016)',
      'EMA Reflection Paper on the Use of Extrapolation (EMA/199678/2016)',
      'ICH E11(R1): Clinical Investigation of Medicinal Products in the Pediatric Population (2017), Section 2.4',
      'FDA Guidance: General Clinical Pharmacology Considerations for Pediatric Studies (2014)',
      'Dunne J et al. Extrapolation of adult data and other approaches to pediatric drug development. Clin Pharmacol Ther 2011;89:318-326',
      'Gamalo-Siebers M et al. Statistical modeling for Bayesian extrapolation of adult clinical trial information in pediatric drug evaluation. Pharm Stat 2017;16:232-249',
    ],
  };
}

/**
 * Select age-appropriate formulations and assess excipient safety for
 * a target pediatric age band.
 */
export function selectFormulation(params: {
  targetAgeBands: PediatricAgeBand[];
  routeOfAdministration: 'oral' | 'parenteral' | 'topical' | 'inhaled' | 'rectal' | 'nasal';
  drugProperties?: {
    solubility?: 'high' | 'low';
    stability?: 'stable' | 'unstable_solution';
    tasteProfile?: 'neutral' | 'bitter' | 'unpleasant';
    doseRange?: string;
  };
  proposedExcipients?: string[];
}): FormulationResult {
  const recommendations: FormulationResult['recommendedFormulations'] = [];
  const youngestBand = getYoungestBand(params.targetAgeBands);
  const isBitter = params.drugProperties?.tasteProfile === 'bitter' || params.drugProperties?.tasteProfile === 'unpleasant';

  if (params.routeOfAdministration === 'oral') {
    // Age-appropriate oral formulations per EMA Reflection Paper
    for (const band of params.targetAgeBands) {
      const preferred = AGE_BAND_DATA[band].formulations.filter(f =>
        f !== 'injectable' && f !== 'rectal_suppository' && f !== 'inhaled' && f !== 'topical' && f !== 'nasal'
      );
      for (const form of preferred) {
        if (!recommendations.some(r => r.formulation === form)) {
          let suitability: 'preferred' | 'acceptable' | 'conditional' = 'preferred';
          let rationale = '';
          let evidence = '';

          switch (form) {
            case 'oral_solution':
              rationale = 'Flexible dosing; suitable for dose titration and nasogastric/orogastric tube administration.';
              evidence = isBitter
                ? 'Taste masking required (sweeteners, flavoring). May require co-administration with food/drink.'
                : 'Generally well accepted in liquid form. Age-appropriate flavoring recommended.';
              if (band === 'adolescent') suitability = 'acceptable';
              break;
            case 'oral_suspension':
              rationale = 'Preferred when drug has poor solution stability. Uniform dosing requires proper shake-before-use instructions.';
              evidence = 'Shake-well uniformity critical. Appropriate measuring device essential.';
              if (params.drugProperties?.stability === 'unstable_solution') suitability = 'preferred';
              break;
            case 'mini_tablet':
              rationale = 'EMA preferred for infants ≥6 months. Studies show swallowability of 2mm mini-tablets from 6 months. Taste-masking via coating feasible.';
              evidence = 'Klingmann et al. (2015): 2mm mini-tabs swallowed by >85% of infants 6-12 months. Acceptability superior to syrups in several studies.';
              if (band === 'preterm_neonate' || band === 'term_neonate') suitability = 'conditional';
              break;
            case 'granules_sprinkle':
              rationale = 'Sprinkled on soft food for infants/young children. Multiparticulate systems enable flexible dosing and taste masking.';
              evidence = 'Acceptable from ~4-6 months with food introduction. Must not require chewing.';
              break;
            case 'chewable_tablet':
              rationale = 'Suitable from ~2 years (sufficient chewing ability). Requires taste masking for bitter drugs.';
              evidence = 'Choking risk in children <2 years. Chewing ability varies significantly 2-4 years.';
              if (band === 'infant') suitability = 'conditional';
              break;
            case 'orodispersible_tablet':
              rationale = 'Disintegrates on tongue without water. Suitable from ~3 years (some evidence from 2 years). Good for adherence.';
              evidence = 'Rapid disintegration (<30 seconds). No water required. Size typically <15mm.';
              if (band === 'infant') suitability = 'conditional';
              break;
            case 'orodispersible_film':
              rationale = 'Thin film placed on tongue. Rapid dissolution. Novel platform with emerging pediatric acceptability data.';
              evidence = 'Limited clinical evidence in very young children. Promising for 3+ years.';
              suitability = 'acceptable';
              break;
            case 'conventional_tablet':
              rationale = 'Suitable for children ≥6 years who can swallow tablets. Preferred for adolescents.';
              evidence = 'Swallowability generally reliable from age 6+. Size should be ≤10mm for children 6-12.';
              if (band === 'infant' || band === 'child') suitability = 'conditional';
              break;
            case 'capsule':
              rationale = 'Suitable for children ≥6 years. Sprinkle capsules for younger if contents are multiparticulate.';
              evidence = 'Swallowability similar to tablets. Sprinkle contents can extend age range downward.';
              if (band === 'infant') suitability = 'conditional';
              break;
            default:
              rationale = 'Standard formulation.';
              evidence = 'Refer to EMA Reflection Paper for age-specific guidance.';
          }
          recommendations.push({ formulation: form, suitability, rationale, acceptabilityEvidence: evidence });
        }
      }
    }
  } else if (params.routeOfAdministration === 'parenteral') {
    recommendations.push({
      formulation: 'injectable',
      suitability: 'preferred',
      rationale: 'IV/IM/SC administration may be necessary for drugs with poor oral bioavailability, emergency settings, or neonatal populations. Concentration must allow accurate dosing in small volumes.',
      acceptabilityEvidence: 'Volume limits: neonates ≤0.5 mL IM, infants ≤1 mL IM. SC volume age-dependent. IV preferred for continuous dosing in neonates.',
    });
  } else if (params.routeOfAdministration === 'rectal') {
    recommendations.push({
      formulation: 'rectal_suppository',
      suitability: youngestBand === 'preterm_neonate' || youngestBand === 'term_neonate' ? 'preferred' : 'acceptable',
      rationale: 'Alternative route for neonates/infants when oral/IV not feasible. Absorption less variable than oral in neonates.',
      acceptabilityEvidence: 'Size and dose must be appropriate for age group. Caution in immunocompromised patients (mucosal injury risk).',
    });
  } else if (params.routeOfAdministration === 'inhaled') {
    recommendations.push({
      formulation: 'inhaled',
      suitability: 'preferred',
      rationale: 'Nebulized formulation for <4 years. MDI with spacer/VHC and mask for 4-6 years. MDI with spacer for ≥6 years. DPI for ≥6 years with adequate inspiratory flow.',
      acceptabilityEvidence: 'Device selection critical: nebulizer (all ages), pMDI+VHC+mask (<4 yr), pMDI+VHC (4-6 yr), DPI (≥6 yr if peak inspiratory flow ≥30 L/min).',
    });
  } else {
    const formType: FormulationType = params.routeOfAdministration === 'nasal' ? 'nasal' : 'topical';
    recommendations.push({
      formulation: formType,
      suitability: 'acceptable',
      rationale: `${params.routeOfAdministration} formulation. Adjust concentration and application area for pediatric body surface area. Consider increased systemic absorption in neonates/infants (immature skin barrier).`,
      acceptabilityEvidence: 'Neonatal skin absorption may be 2-5x adult. Occlusive dressings contraindicated in young children. BSA-to-weight ratio higher in children.',
    });
  }

  // Excipient safety assessment
  const excipientAssessment: FormulationResult['excipientSafety'] = [];
  const proposedExcipients = params.proposedExcipients ?? [];
  for (const ex of EXCIPIENT_SAFETY) {
    const isProposed = proposedExcipients.some(p => p.toLowerCase().includes(ex.excipient.toLowerCase()));
    // Always include if proposed, or include common ones relevant to youngest age band
    if (isProposed || (youngestBand === 'preterm_neonate' || youngestBand === 'term_neonate')) {
      const isNeonatal = youngestBand === 'preterm_neonate' || youngestBand === 'term_neonate';
      const status: 'safe' | 'restricted' | 'contraindicated' =
        ex.ageRestriction.toLowerCase().includes('contraindicated') && isNeonatal
          ? 'contraindicated'
          : ex.ageRestriction.toLowerCase().includes('avoid') && isNeonatal
          ? 'contraindicated'
          : ex.ageRestriction.toLowerCase().includes('restricted') || ex.ageRestriction.toLowerCase().includes('avoid')
          ? 'restricted'
          : 'safe';
      excipientAssessment.push({
        excipient: ex.excipient,
        status,
        limit: ex.limit,
        ageRestriction: ex.ageRestriction,
        reference: ex.reference,
      });
    }
  }

  // Palatability
  const palatabilityReqs: string[] = [
    'Palatability should be assessed per EMA Reflection Paper (EMA/CHMP/QWP/805880/2012 Rev. 2) in a representative pediatric population.',
  ];
  if (isBitter) {
    palatabilityReqs.push(
      'Taste masking essential: consider coating (mini-tablets/granules), ion-exchange resin complexation, cyclodextrin complexation, or co-formulation with sweeteners/flavors.',
      'Validated taste-assessment methodology (electronic tongue, brief taste panels in adults before pediatric testing) recommended.',
      'Multiple flavor options may be needed across regions (cultural flavor preferences vary).',
    );
  }

  // Dosing device
  const deviceReqs: string[] = [];
  if (recommendations.some(r => r.formulation === 'oral_solution' || r.formulation === 'oral_suspension')) {
    deviceReqs.push(
      'Oral dosing syringe (not household teaspoon) must be provided per EMA and FDA guidance.',
      'Syringe markings must correspond to the prescribed dose increments.',
      'Neonatal/infant: 1 mL oral syringe with 0.1 mL graduations.',
      'Children: appropriately sized syringe (5 mL or 10 mL) with clear volume markings.',
      'Instructions for use in pictographic form for low-literacy caregivers.',
    );
  }

  return {
    recommendedFormulations: recommendations,
    excipientSafety: excipientAssessment,
    palatabilityRequirements: palatabilityReqs,
    dosingDeviceRequirements: deviceReqs,
    emaReflectionPaperGuidance: [
      'EMA/CHMP/QWP/805880/2012 Rev. 2: Pharmaceutical Development of Medicines for Paediatric Use.',
      'Formulation should enable flexible, accurate dosing across the weight/age range of the target population.',
      'Multiple strengths/formulations may be needed to cover the full pediatric age range.',
      'Bioequivalence between pediatric and adult formulation must be established or justified.',
      'Stability data for the pediatric formulation in the primary packaging (opened and unopened) are required.',
      'In-use stability data (after first opening, after reconstitution) must be generated.',
    ],
    references: [
      'EMA/CHMP/QWP/805880/2012 Rev. 2: Guideline on Pharmaceutical Development of Medicines for Paediatric Use',
      'EMA Reflection Paper: Formulations of Choice for the Paediatric Population (EMEA/CHMP/PQP/194810/2005)',
      'FDA Guidance: Considerations for the Use of Devices to Deliver Products to Pediatric Patients (draft)',
      'Klingmann V et al. Acceptability of mini-tablets in young children: results from three prospective cross-over studies. AAPS PharmSciTech 2015;16:18-25',
      'WHO Technical Report Series 970, Annex 5: Development of Paediatric Medicines — Points to Consider in Formulation (2012)',
      'STEP Database: Safety and Toxicity of Excipients for Paediatrics (EMA)',
    ],
  };
}

/**
 * Select an appropriate dose for a pediatric patient using allometric scaling,
 * PBPK-guided, or maturation-adjusted methods.
 */
export function selectPediatricDose(params: {
  targetAgeBand: PediatricAgeBand;
  adultDose: number;
  adultDoseUnit: string;
  adultWeight: number;
  childWeight?: number;
  childAge?: number;
  childBSA?: number;
  primaryEliminationRoute: 'renal' | 'hepatic' | 'mixed' | 'unchanged';
  hepaticCYP?: string;
  narrowTherapeuticIndex: boolean;
  pbpkAvailable?: boolean;
  scalingMethodPreference?: DoseScalingMethod;
}): DoseSelectionResult {
  const band = params.targetAgeBand;
  const data = AGE_BAND_DATA[band];

  // Determine recommended scaling method
  let method: DoseScalingMethod;
  if (params.scalingMethodPreference) {
    method = params.scalingMethodPreference;
  } else if (params.pbpkAvailable) {
    method = 'pbpk_predicted';
  } else if (band === 'preterm_neonate' || band === 'term_neonate') {
    method = 'allometric_maturation';
  } else if (params.narrowTherapeuticIndex) {
    method = 'therapeutic_drug_monitoring';
  } else if (params.primaryEliminationRoute === 'hepatic' && (band === 'infant' || band === 'child')) {
    method = 'allometric_maturation';
  } else if (params.primaryEliminationRoute === 'renal' && (band === 'infant' || band === 'child')) {
    method = 'allometric_0.75';
  } else if (band === 'adolescent') {
    method = 'linear_weight';
  } else {
    method = 'allometric_0.75';
  }

  // Build dose recommendation
  let formula: string;
  let scalingRationale: string;
  const adjustmentFactors: string[] = [];
  const practicalConsiderations: string[] = [];

  switch (method) {
    case 'linear_weight':
      formula = `Pediatric dose = Adult dose × (Child weight / ${params.adultWeight} kg)`;
      scalingRationale = 'Linear weight-based scaling suitable for adolescents where organ maturation is complete and body composition is similar to adults. Simple and widely used, but may over-predict dose in younger/smaller children.';
      if (band !== 'adolescent') {
        adjustmentFactors.push('WARNING: Linear scaling from adult doses tends to under-dose in children 2-11 years (due to supra-adult per-kg clearance) and over-dose in neonates/infants.');
      }
      break;

    case 'allometric_0.75':
      formula = `Pediatric dose = Adult dose × (Child weight / ${params.adultWeight} kg)^0.75`;
      scalingRationale = 'Simple allometric scaling with exponent 0.75 (clearance scales with body weight^0.75 per West et al., 1997). Better than linear scaling for children but does not account for enzyme maturation. Suitable as initial estimate for children 2+ years.';
      adjustmentFactors.push(
        'Exponent 0.75 assumes mature organ function — not appropriate for neonates/young infants without maturation adjustment.',
        'FDA General Clinical Pharmacology Guidance (2014) endorses allometric scaling for initial pediatric dose estimation.',
      );
      break;

    case 'allometric_maturation':
      formula = `Pediatric dose = Adult dose × (Child weight / ${params.adultWeight} kg)^0.75 × MF`;
      scalingRationale = 'Maturation-adjusted allometric scaling: applies the 0.75 exponent for body size AND a maturation factor (MF) for ontogeny of the primary elimination pathway. MF derived from enzyme or renal maturation data (Anderson & Holford, 2008). Essential for neonates and infants.';
      if (params.primaryEliminationRoute === 'hepatic' && params.hepaticCYP) {
        const cypData = data.cyp[params.hepaticCYP];
        if (cypData) {
          adjustmentFactors.push(`${params.hepaticCYP} maturation in ${data.ichLabel}: ${cypData}`);
        }
      }
      if (params.primaryEliminationRoute === 'renal') {
        adjustmentFactors.push(`GFR maturation in ${data.ichLabel}: ${data.gfrPctAdult}`);
      }
      adjustmentFactors.push(
        'Maturation factor (MF) is age/PMA-dependent and pathway-specific.',
        'Sigmoidal Hill equation commonly used: MF = PMA^Hill / (TM50^Hill + PMA^Hill), where TM50 is the post-menstrual age at 50% maturation.',
      );
      break;

    case 'bsa_based':
      formula = `Pediatric dose = Adult dose × (Child BSA / 1.73 m²)`;
      scalingRationale = 'BSA-based dosing (Mosteller formula or DuBois). Common in oncology. Accounts for metabolic rate differences better than weight alone. Standard adult BSA assumed as 1.73 m².';
      adjustmentFactors.push(
        'BSA calculations less reliable in obese children and neonates.',
        'Does not account for enzyme maturation; supplementary adjustment needed in neonates/infants.',
      );
      break;

    case 'pbpk_predicted':
      formula = 'Dose derived from PBPK model prediction — no universal formula; model-specific.';
      scalingRationale = 'PBPK (Physiologically-Based Pharmacokinetic) modeling integrates age-dependent physiology (organ volumes, blood flows, enzyme ontogeny, GFR maturation, body composition, plasma protein binding) to predict pediatric PK and dose. Gold standard for pediatric dose prediction per FDA/EMA guidance.';
      adjustmentFactors.push(
        'PBPK model must be qualified against observed pediatric PK data.',
        'FDA recommends PBPK for dose selection in pediatric studies (FDA PBPK Guidance, 2018).',
        'EMA accepts PBPK-informed dose selection for PIPs when the model is adequately validated.',
        'Model should be verified against available PK data in the closest available age group before extrapolation to younger ages.',
      );
      break;

    case 'age_based':
      formula = 'Dose assigned by age band using population PK-derived or clinical-data-derived age-based dosing tables.';
      scalingRationale = 'Age-based fixed dosing (dose banding by age range) is practical but may not account for weight variability within an age group. Most commonly used for vaccines and some anti-infectives.';
      adjustmentFactors.push(
        'Weight extremes (underweight, obese) within an age group may require individualized adjustment.',
        'Dose banding tables derived from population PK modeling provide the best balance of precision and practicality.',
      );
      break;

    case 'therapeutic_drug_monitoring':
      formula = 'Starting dose from allometric or PBPK estimate → individualized via therapeutic drug monitoring (TDM).';
      scalingRationale = 'For drugs with narrow therapeutic index, high PK variability, or serious toxicity, TDM-guided dosing is essential. Initial dose estimated via allometric/PBPK methods, then adjusted based on measured drug concentrations.';
      adjustmentFactors.push(
        'TDM requires validated bioanalytical assay suitable for small-volume pediatric samples.',
        'Target trough, peak, or AUC ranges should be established from adult/pediatric PK-PD relationships.',
        'Frequency of TDM sampling should account for the pace of pediatric growth and changing PK parameters.',
      );
      break;
  }

  // Dose banding
  const doseBandingRecommended = (band === 'child' || band === 'infant') && method !== 'therapeutic_drug_monitoring';
  const doseBandResult = {
    recommended: doseBandingRecommended,
    rationale: doseBandingRecommended
      ? 'Dose banding (grouping continuous weight-based doses into discrete dose levels) is recommended for practical administration and to reduce dosing errors. Weight bands should be derived from population PK modeling to ensure exposures remain within the therapeutic range across the band.'
      : 'Dose banding not primary approach for this combination of age band and dosing method.',
    bandingApproach: doseBandingRecommended
      ? 'Derive dose bands from population PK simulations: (1) simulate exposures at multiple weights, (2) identify weight ranges where a single dose maintains AUC within ±20-25% of target, (3) validate via population PK re-simulation with the banded doses.'
      : 'Individual dose calculation recommended.',
  };

  // Safety considerations
  const safetyConsiderations: string[] = [
    'Maximum dose should not exceed the approved adult dose unless specifically justified by PK data.',
  ];
  if (band === 'preterm_neonate' || band === 'term_neonate') {
    safetyConsiderations.push(
      'Neonatal dosing intervals typically extended (q12h or q24h) due to reduced clearance.',
      'Monitor for drug accumulation; half-lives may be 2-10x longer than in adults.',
      'Blood sampling volume must not exceed 3% of total blood volume in 24 hours.',
      'Consider impact of concomitant neonatal medications (e.g., caffeine, indomethacin) on drug metabolism.',
    );
  }
  if (band === 'infant') {
    safetyConsiderations.push(
      'Rapid growth in infancy requires dose reassessment at regular intervals (every 1-3 months).',
      'Per-kg clearance may exceed adult values — monitor for underdosing.',
    );
  }
  if (band === 'child') {
    safetyConsiderations.push(
      'Supra-adult CYP3A4 activity (ages 1-5) may require higher mg/kg doses than adults for hepatically cleared drugs.',
      'Monitor growth velocity; dose adjustments needed as weight increases.',
    );
  }
  if (params.narrowTherapeuticIndex) {
    safetyConsiderations.push(
      'Narrow therapeutic index: start at conservative dose and titrate with TDM.',
      'Increased PK variability in pediatrics makes empiric dosing insufficient for NTI drugs.',
    );
  }

  // TDM recommendation
  const tdmRec = {
    recommended: params.narrowTherapeuticIndex || method === 'therapeutic_drug_monitoring',
    rationale: params.narrowTherapeuticIndex
      ? 'Narrow therapeutic index drug — TDM essential for safe and effective dosing in the pediatric population.'
      : band === 'preterm_neonate' || band === 'term_neonate'
      ? 'Neonatal PK highly variable — TDM recommended for drugs with significant toxicity risk.'
      : 'TDM may be warranted if high inter-individual PK variability observed in the pediatric population.',
    targetRange: 'Establish based on adult PK-PD data; validate/adjust with pediatric exposure-response data when available.',
  };

  practicalConsiderations.push(
    'Ensure formulation allows accurate measurement/administration of the calculated dose.',
    'Consider dose rounding to practically administrable amounts (whole tablets/capsules, measurable liquid volumes).',
    'Provide age-appropriate dosing tables in the product labeling.',
  );

  return {
    recommendedMethod: method,
    scalingRationale,
    doseRecommendation: {
      method: method.replace(/_/g, ' '),
      formula,
      adjustmentFactors,
      practicalConsiderations,
    },
    doseBanding: doseBandResult,
    safetyConsiderations,
    tdmRecommendation: tdmRec,
    references: [
      'FDA Guidance: General Clinical Pharmacology Considerations for Pediatric Studies (2014)',
      'Anderson BJ, Holford NHG. Mechanism-based concepts of size and maturity in pharmacokinetics. Annu Rev Pharmacol Toxicol 2008;48:303-332',
      'West GB, Brown JH, Enquist BJ. A general model for the origin of allometric scaling laws in biology. Science 1997;276:122-126',
      'FDA Guidance: Physiologically Based Pharmacokinetic Analyses — Format and Content (2018)',
      'EMA Guideline on the Role of PK Modelling in Paediatric Drug Development (EMA/CHMP/EWP/147013/2004 Rev. 1)',
      'Johnson TN et al. Prediction of the clearance of eleven drugs and associated variability in neonates, infants and children. Clin Pharmacokinet 2006;45:931-956',
      'Maharaj AR, Edginton AN. Physiologically based pharmacokinetic modeling and simulation in pediatric drug development. CPT Pharmacometrics Syst Pharmacol 2014;3:e150',
    ],
  };
}

/**
 * Assess comprehensive regulatory, ethical, and timeline requirements for
 * pediatric drug development.
 */
export function assessPediatricRequirements(params: {
  drugName: string;
  therapeuticArea: TherapeuticArea;
  indication: string;
  targetAgeBands: PediatricAgeBand[];
  isOrphan?: boolean;
  isNewMolecularEntity: boolean;
  hasAdultApproval: boolean;
  targetJurisdictions: Jurisdiction[];
}): PediatricRequirementsResult {
  const isOrphan = params.isOrphan ?? false;
  const hasNeonates = params.targetAgeBands.some(b => b === 'preterm_neonate' || b === 'term_neonate');
  const hasYoungChildren = params.targetAgeBands.some(b => b === 'infant' || b === 'child');

  // FDA PREA
  const fdaPrea = {
    required: params.isNewMolecularEntity || !params.hasAdultApproval,
    mechanism: params.isNewMolecularEntity
      ? 'PREA (21 USC §355c): All applications for new active ingredients, new indications, new dosage forms, new dosing regimens, or new routes of administration must contain a pediatric assessment unless waived or deferred.'
      : params.hasAdultApproval
      ? 'FDA may issue a Written Request (21 USC §355a) for voluntary pediatric studies in exchange for 6 months exclusivity. PREA applies if a new indication or dosage form is being sought.'
      : 'PREA triggered at NDA/BLA submission.',
    exclusivity: 'Pediatric Exclusivity: 6 months of additional market exclusivity (patent extension) for all formulations/indications of the active moiety upon completion of FDA-requested pediatric studies, regardless of outcome. For orphan drugs, pediatric exclusivity extends the 7-year orphan exclusivity by 6 months.',
    timeline: params.hasAdultApproval
      ? 'PMR (Post-Marketing Requirement): milestones agreed with FDA. Typically 1-3 years for initial PK study, 3-5 years for full pediatric program.'
      : 'PSP submitted ≤60 days after EoP2 meeting. FDA review: 90 days. Studies completed before or after adult approval per agreed deferral schedule.',
  };

  // EMA PDCO
  const emaPdco = {
    required: params.targetJurisdictions.includes('EMA'),
    mechanism: 'EC No 1901/2006: PIP required for all new MAs, new indications, new pharmaceutical forms, new routes. PIP agreed with PDCO. Compliance verified at MA application (Article 23). Failure to comply = MA cannot be granted.',
    rewards: isOrphan
      ? 'Orphan pediatric: 2 additional years of market exclusivity (12 total instead of 10) if all PIP measures completed AND results reflected in SmPC. No separate PUMA pathway for orphans.'
      : 'PUMA (Paediatric Use Marketing Authorisation): 8 years data exclusivity + 10 years marketing protection for approved pediatric-only indications. SPC extension: 6-month extension of SPC for products with completed PIP and approved pediatric indication in SmPC.',
    timeline: 'PIP submitted at end of Phase 1 / early Phase 2. PDCO opinion: 120 days (with clock stops). Compliance check at MA submission. PIP modifications as development evolves.',
  };

  // Ethical requirements
  const consentModel = determineConsentModel(params.targetAgeBands);
  const ethicalReqs = {
    consentModel: consentModel.model,
    assentAge: consentModel.assentAge,
    minimalRiskDefinition: 'FDA (45 CFR 46.404): Risks no greater than those ordinarily encountered in daily life or routine examinations. EU CTR (Article 32): Minimal risk = very slight and temporary negative impact on health. EMA: minimal burden = minimal pain, discomfort, fear, and other foreseeable risks.',
    irbEcRequirements: [
      'IRB/EC must include members with pediatric expertise (21 CFR 56.107 / EU CTR Article 4)',
      'Data Safety Monitoring Board (DSMB) required for controlled pediatric trials',
      'Adverse event reporting must include age-specific context (developmental stage, growth metrics)',
      hasNeonates ? 'Neonatal IRB review requires expertise in neonatology and neonatal ethics' : '',
      'Study information sheets adapted to reading level of parents and (where applicable) pediatric subjects',
    ].filter(Boolean),
    additionalSafeguards: [
      '21 CFR 50.51-54 (FDA): Research involving children — four categories of permissible risk (no greater than minimal risk → prospect of direct benefit → minor increase above minimal risk → otherwise not approvable except by Secretary).',
      'Independent pediatric advocate/monitor for studies with more than minimal risk and no prospect of direct benefit.',
      'Blood volume limits: neonates ≤3% of total blood volume per 24 hours, children ≤3% or 2.5 mL/kg (whichever is less).',
      'Minimize number and invasiveness of procedures; use micro-sampling, DBS, or scavenged sampling when feasible.',
      hasYoungChildren ? 'Child life specialists recommended to reduce procedural distress.' : '',
      'Compliance with Declaration of Helsinki pediatric-specific provisions.',
    ].filter(Boolean),
  };

  // Orphan considerations
  const orphanConsiderations = {
    applicable: isOrphan,
    incentives: isOrphan
      ? [
          'FDA: 7 years orphan exclusivity + 6 months pediatric exclusivity = 7.5 years total.',
          'EMA: 10 years orphan market exclusivity + 2 years for completed PIP = 12 years. Alternatively, regular pediatric rewards may also apply.',
          'FDA: Tax credits for qualified clinical testing expenses (Orphan Drug Act §45C).',
          'FDA: Reduced or waived application fees for orphan products.',
          'EMA: Fee reductions for PIPs involving orphan medicinal products.',
          'Protocol assistance from FDA (OOPD) and EMA (COMP/PDCO) for pediatric development of orphan drugs.',
        ]
      : ['Not applicable — product does not have orphan designation.'],
    waiverImplications: isOrphan
      ? 'Orphan-designated products are NOT automatically exempt from PREA or PIP requirements. However, the small patient population may justify modified study designs (single-arm, Bayesian, extrapolation-heavy) and smaller sample sizes. FDA may issue a partial waiver if pediatric studies are impossible or highly impracticable.'
      : 'No orphan-specific waiver implications.',
  };

  // Timeline
  const timeline = {
    pipPspSubmission: params.hasAdultApproval
      ? 'As soon as feasible for supplemental application. EMA: PIP modification if existing PIP needs amending.'
      : 'FDA: PSP ≤60 days after EoP2 meeting. EMA: PIP at end of Phase 1 / early Phase 2 (before adult Phase 3 starts).',
    studyCompletion: params.hasAdultApproval
      ? 'Per PMR/PIP milestones. Typical: PK study within 1-2 years, efficacy/safety studies within 2-5 years.'
      : 'Deferral typically allows pediatric studies to start after adult approval. Stepwise approach: oldest pediatric age group first, then younger. Complete within agreed timeline (typically 2-7 years post-adult approval).',
    dataSubmission: 'FDA: Pediatric supplement or labeling update within 120 days of study completion. EMA: Compliance check at MA or variation application. Results must be submitted within 6 months of study completion regardless of outcome (Article 46 of Regulation EC 1901/2006).',
  };

  return {
    regulatoryObligations: { fdaPrea, emaPdco },
    ethicalRequirements: ethicalReqs,
    orphanConsiderations,
    timeline,
    references: [
      'FDA PREA: Pediatric Research Equity Act (21 USC §355c)',
      'FDA BPCA: Best Pharmaceuticals for Children Act (21 USC §355a)',
      'EC No 1901/2006: Regulation on medicinal products for paediatric use (as amended)',
      'ICH E11(R1): Clinical Investigation of Medicinal Products in the Pediatric Population (2017)',
      '21 CFR 50 Subpart D: Additional Safeguards for Children in Clinical Investigations',
      'EU Clinical Trials Regulation (EU) No 536/2014, Articles 32-33',
      'FDA Guidance: Pediatric Study Plans — Content of and Process for Submitting Initial PSPs and Amended PSPs (2020)',
      'FDA Guidance: Qualifying for Pediatric Exclusivity Under the BPCA (2014)',
      'EMA PDCO Standard Operating Procedure for PIP evaluation',
      'FDA Orphan Drug Act (21 USC §§360aa-360ee)',
      'EMA Guideline on the format and content of applications for agreement or modification of a PIP (EMA/PDCO/43127/2016)',
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function resolveAgeBand(
  ageValue: number,
  ageUnit: 'weeks_gestational' | 'days' | 'months' | 'years',
  gestationalAge?: number,
): PediatricAgeBand {
  if (ageUnit === 'weeks_gestational') {
    return ageValue < 37 ? 'preterm_neonate' : 'term_neonate';
  }

  // Convert to days for uniform comparison
  let ageDays: number;
  switch (ageUnit) {
    case 'days':
      ageDays = ageValue;
      break;
    case 'months':
      ageDays = ageValue * 30.44; // average days per month
      break;
    case 'years':
      ageDays = ageValue * 365.25;
      break;
  }

  // Check gestational age for neonates
  if (ageDays <= 27) {
    if (gestationalAge !== undefined && gestationalAge < 37) {
      return 'preterm_neonate';
    }
    return 'term_neonate';
  }

  // 28 days to 23 months (~700 days)
  if (ageDays < 730) return 'infant';

  // 2 to 11 years
  if (ageDays < 4383) return 'child';

  // 12 to 17 years
  return 'adolescent';
}

function sortAgeBands(bands: PediatricAgeBand[]): PediatricAgeBand[] {
  const order: Record<PediatricAgeBand, number> = {
    preterm_neonate: 0,
    term_neonate: 1,
    infant: 2,
    child: 3,
    adolescent: 4,
  };
  return [...bands].sort((a, b) => order[a] - order[b]);
}

function getYoungestBand(bands: PediatricAgeBand[]): PediatricAgeBand {
  return sortAgeBands(bands)[0];
}

function determineConsentModel(bands: PediatricAgeBand[]): { model: string; assentAge: string } {
  const sorted = sortAgeBands(bands);
  const youngest = sorted[0];
  const oldest = sorted[sorted.length - 1];

  if (oldest === 'adolescent') {
    return {
      model: 'Parent/guardian consent + adolescent assent (required). In some jurisdictions, mature minors (16+ or emancipated) may consent independently.',
      assentAge: 'Assent from approximately age 7 (varies by institution/jurisdiction). Formal written assent typically from age 12. Adolescent assent documents should be age-appropriate in language and content.',
    };
  }
  if (oldest === 'child') {
    return {
      model: 'Parent/guardian consent + child assent (age-appropriate). Assent form written at appropriate reading level.',
      assentAge: 'Assent generally sought from age 7 (AAP recommendation). Children aged 7-12: simplified assent with pictographic elements. IRB may waive assent if intervention provides prospect of direct benefit unavailable outside the study.',
    };
  }
  return {
    model: 'Parent/legal guardian informed consent only. Dual-parent consent may be required for greater-than-minimal-risk research (varies by jurisdiction).',
    assentAge: 'Not applicable — subjects too young for meaningful assent.',
  };
}
