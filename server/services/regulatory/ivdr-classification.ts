/**
 * IVDR Annex VIII classification engine (pure, deterministic).
 *
 * Extracted from server/routes/ivdr-routes.ts so the rule logic is reusable and
 * unit-testable, and wired to the IVD knowledge base: the result carries the
 * ids of the knowledge entries that explain and justify the classification, so
 * callers can surface citations alongside the class.
 *
 * The rule descriptions and class outcomes are kept byte-identical to the
 * original route logic so existing behavior/persistence is unchanged.
 *
 * Regulatory backbone: IVDR (EU) 2017/746 Annex VIII; MDCG 2020-16.
 */

export type IvdrClass = 'A' | 'B' | 'C' | 'D';

export interface IvdrClassificationInput {
  deviceName?: string;
  intendedPurpose: string;
  isSelfTest?: boolean;
  isNearPatient?: boolean;
  isCompanionDiagnostic?: boolean;
  detectsTransmissibleAgent?: boolean;
  bloodScreening?: boolean;
  detectsCancer?: boolean;
  prenatalScreening?: boolean;
  riskToPatient?: 'low' | 'medium' | 'high';
  isGeneticTest?: boolean;
  analytes?: string[];
}

export interface RuleTraceEntry {
  rule: string;
  description: string;
  matched: boolean;
}

export interface IvdrClassificationResult {
  classification: IvdrClass;
  ruleTrace: RuleTraceEntry[];
  matchedRules: RuleTraceEntry[];
  /** Class A (non-sterile) self-declares; B/C/D require a notified body. */
  notifiedBodyRequired: boolean;
  /** Ids into the IVD knowledge base explaining/justifying this classification. */
  knowledgeRefs: string[];
}

const CLASS_PRIORITY: Record<IvdrClass, number> = { A: 1, B: 2, C: 3, D: 4 };

/**
 * Run the Annex VIII rule engine. Pure: same input → same output, no I/O.
 * Mirrors the rule order/descriptions used by /api/ivdr/classify.
 */
export function classifyIvdrAnnexVIII(
  input: IvdrClassificationInput
): IvdrClassificationResult {
  const {
    intendedPurpose,
    isSelfTest,
    isNearPatient,
    isCompanionDiagnostic,
    detectsTransmissibleAgent,
    bloodScreening,
    detectsCancer,
    prenatalScreening,
    riskToPatient,
    isGeneticTest,
  } = input;

  const ruleTrace: RuleTraceEntry[] = [];
  let classResult: IvdrClass = 'A';
  const upgradeClass = (target: 'B' | 'C' | 'D') => {
    if (CLASS_PRIORITY[target] > CLASS_PRIORITY[classResult]) classResult = target;
  };

  // Rule 1 — Class D: Blood/tissue screening for transmissible agents
  const rule1Match = bloodScreening === true && detectsTransmissibleAgent === true;
  ruleTrace.push({
    rule: 'Annex VIII, Rule 1 (Class D)',
    description:
      'IVDs intended to be used for blood screening, assessing eligibility of blood/tissue donations, and detecting transmissible agents (HIV, HBV, HCV, HTLV, Treponema pallidum, CMV, Chlamydia, RhD, Kell, Duffy/Kidd)',
    matched: rule1Match,
  });
  if (rule1Match) classResult = 'D';

  // Rule 2 — Class D: Blood group typing (ABO, Rh, Kell, Kidd, Duffy)
  const isBloodGrouping =
    intendedPurpose.toLowerCase().includes('blood group') ||
    intendedPurpose.toLowerCase().includes('blood typing');
  ruleTrace.push({
    rule: 'Annex VIII, Rule 2 (Class D)',
    description:
      'IVDs intended for blood grouping or tissue typing to ensure immunological compatibility of blood, blood components, cells, tissues, or organs intended for transfusion/transplant (ABO, Rh, anti-Kell)',
    matched: isBloodGrouping,
  });
  if (isBloodGrouping && classResult !== 'D') classResult = 'D';

  // Rule 3a — Class C: Companion Diagnostics
  const rule3aMatch = isCompanionDiagnostic === true;
  ruleTrace.push({
    rule: 'Annex VIII, Rule 3a (Class C)',
    description:
      'IVDs intended as companion diagnostics — devices essential for the safe and effective use of a corresponding medicinal product, to identify patients most likely to benefit or at increased risk of serious adverse reactions',
    matched: rule3aMatch,
  });
  if (rule3aMatch) upgradeClass('C');

  // Rule 3b — Class C: Cancer screening/diagnosis as first-line
  const rule3bMatch = detectsCancer === true;
  ruleTrace.push({
    rule: 'Annex VIII, Rule 3b (Class C)',
    description:
      'IVDs intended for screening, diagnosis, or staging of cancer. First-line standalone diagnostic use for detecting cancer markers (CEA, PSA, CA-125, HER2, etc.)',
    matched: rule3bMatch,
  });
  if (rule3bMatch) upgradeClass('C');

  // Rule 3c — Class C: Genetic testing with direct patient management impact
  const rule3cMatch = isGeneticTest === true;
  ruleTrace.push({
    rule: 'Annex VIII, Rule 3c (Class C)',
    description:
      'IVDs intended to provide information about genetic predisposition. Human genetic testing whose results directly lead to patient management decisions (pharmacogenomic, hereditary condition screening)',
    matched: rule3cMatch,
  });
  if (rule3cMatch) upgradeClass('C');

  // Rule 3d — Class C: Prenatal screening / congenital abnormalities
  const rule3dMatch = prenatalScreening === true;
  ruleTrace.push({
    rule: 'Annex VIII, Rule 3d (Class C)',
    description:
      'IVDs intended for prenatal screening of women to determine their immune status, for detecting congenital abnormalities of the foetus, or for determining foetal status where there is an imminent risk to the foetus',
    matched: rule3dMatch,
  });
  if (rule3dMatch) upgradeClass('C');

  // Rule 4 — Class B: Self-testing devices
  const rule4Match = isSelfTest === true;
  ruleTrace.push({
    rule: 'Annex VIII, Rule 4 (Class B)',
    description:
      'IVDs intended for self-testing — devices intended to be used by lay persons including tests for self-monitoring of chronic conditions (glucose, coagulation, cholesterol self-tests)',
    matched: rule4Match,
  });
  if (rule4Match) upgradeClass('B');

  // Rule 5 — Class B: Near-patient testing
  const rule5Match = isNearPatient === true && !isSelfTest;
  ruleTrace.push({
    rule: 'Annex VIII, Rule 5 (Class B)',
    description:
      'IVDs intended for near-patient testing (point-of-care) — devices intended to be used outside a laboratory environment, including in the immediate patient environment (bedside, ambulance, pharmacy, workplace)',
    matched: rule5Match,
  });
  if (rule5Match) upgradeClass('B');

  // Rule 6 — Class B: Devices whose failure poses risk
  const rule6Match = riskToPatient === 'high' || riskToPatient === 'medium';
  ruleTrace.push({
    rule: 'Annex VIII, Rule 6 (Class B)',
    description:
      'IVDs not covered by higher classes but whose results could pose a medium/high risk to the individual patient or to public health. Includes IVDs measuring analytes used in critical patient management decisions',
    matched: rule6Match,
  });
  if (rule6Match) upgradeClass('B');

  // Rule 7 — Class A: General IVDs / instruments / accessories
  ruleTrace.push({
    rule: 'Annex VIII, Rule 7 (Class A)',
    description:
      'All other IVDs not covered by Rules 1-6. General laboratory instruments, specimen receptacles, buffer solutions, wash solutions, general culture media, and laboratory equipment without specific risk classification',
    matched: classResult === 'A',
  });

  // ── Knowledge linkage ──────────────────────────────────────────────────────
  const knowledgeRefs = new Set<string>([
    'eu.ivdr.classification-rules',
    'eu.ivdr.conformity-routes',
    'mdcg.2020-16-classification',
  ]);
  if (rule3aMatch) knowledgeRefs.add('eu.ivdr.companion-diagnostics');
  if (rule3aMatch) knowledgeRefs.add('fda.ivd.cdx');
  if (rule3bMatch) knowledgeRefs.add('bio.her2');
  if (rule3cMatch) knowledgeRefs.add('legal.ivd.data-privacy');
  if (rule1Match) knowledgeRefs.add('bio.hiv');
  if (classResult === 'D') knowledgeRefs.add('eu.ivdr.notified-bodies');

  return {
    classification: classResult,
    ruleTrace,
    matchedRules: ruleTrace.filter(r => r.matched),
    notifiedBodyRequired: classResult !== 'A',
    knowledgeRefs: [...knowledgeRefs],
  };
}
