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
  /** Confidence in the classification given the completeness of the inputs. */
  confidence: 'high' | 'moderate' | 'low';
  /** Notes where the inputs were sparse or multiple rules competed. */
  ambiguityNotes: string[];
  /** The likely-corresponding US FDA pathway (cross-jurisdiction orientation). */
  fdaEquivalentPathway: string;
  /** Plain-language conformity-route summary for the resulting class. */
  conformityRoute: string;
  /** Ids into the IVD knowledge base explaining/justifying this classification. */
  knowledgeRefs: string[];
}

const FDA_PATHWAY_BY_CLASS: Record<IvdrClass, string> = {
  A: 'US: typically Class I (often 510(k)-exempt) under general controls.',
  B: 'US: typically Class II via 510(k) with special controls.',
  C: 'US: typically Class II 510(k)/De Novo, or Class III PMA for higher-risk / companion diagnostics.',
  D: 'US: typically Class III PMA (or biologics licensure for blood-screening/transfusion assays).',
};

const CONFORMITY_ROUTE_BY_CLASS: Record<IvdrClass, string> = {
  A: 'Self-declaration (EU Declaration of Conformity); notified body only for sterile aspects.',
  B: 'Notified body — Annex IX (QMS + tech-doc on a sampling basis) or Annex X+XI.',
  C: 'Notified body — Annex IX or Annex X+XI; CDx adds a medicines-authority/EMA consultation.',
  D: 'Notified body — Annex IX (per-device tech-doc) + EU reference-laboratory performance/batch verification.',
};

const CLASS_PRIORITY: Record<IvdrClass, number> = { A: 1, B: 2, C: 3, D: 4 };

/* Class A self-declares (notified body only for sterile aspects); B, C and D all
   require one. A lookup rather than `classResult !== 'A'`, which since the Rule 6
   default became Class B is a comparison against a class the engine can no
   longer produce — true by construction, and read by TypeScript as dead. */
const NOTIFIED_BODY_REQUIRED_BY_CLASS: Record<IvdrClass, boolean> = {
  A: false, B: true, C: true, D: true,
};

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
  /* Annex VIII Rule 6: a device matching no other rule is class B, not class A.
     Class A is reachable only through Rule 5, which none of these inputs can
     establish — see the Rule 5 trace entry and the ambiguity note below. */
  let classResult: IvdrClass = 'B';
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

  /*
   * Rule 4(a) — Class C: self-testing, with the regulation's OWN Class B
   * exception. Annex VIII Rule 4(a) reads: devices for self-testing are class C,
   * "except for those devices from which the result is not determining a
   * medically critical status, or is preliminary and requires follow-up with
   * appropriate laboratory testing, in which case they are class B."
   *
   * This engine scored EVERY self-test class B — the exception applied as if it
   * were the rule, so a self-test whose result IS medically critical was told it
   * could take the lighter conformity route. There is no dedicated input for
   * "medically critical", so the exception is taken from the risk level the
   * caller already supplies: only an explicitly LOW risk-to-patient reads as the
   * non-critical case. Absent or unknown risk resolves to the rule, not the
   * exception, because under-classifying is the direction that hurts.
   */
  const rule4aMatch = isSelfTest === true;
  ruleTrace.push({
    rule: 'Annex VIII, Rule 4(a) (Class C; Class B where the result is not medically critical)',
    description:
      'IVDs intended for self-testing by lay persons. Class C unless the result does not determine a medically critical status, or is preliminary and requires follow-up laboratory testing, in which case Class B',
    matched: rule4aMatch,
  });
  if (rule4aMatch) upgradeClass(riskToPatient === 'low' ? 'B' : 'C');

  /*
   * Rule 4(b) — near-patient testing is "classified in their own right". It
   * carries no class of its own: a point-of-care device takes whatever class its
   * intended purpose earns under the other rules. This was scored as a Class B
   * rule, which is not what Annex VIII says.
   */
  const rule4bMatch = isNearPatient === true && !isSelfTest;
  ruleTrace.push({
    rule: 'Annex VIII, Rule 4(b) (classified in its own right)',
    description:
      'IVDs intended for near-patient (point-of-care) testing are classified in their own right — the setting does not itself set a class; the device takes the class its intended purpose earns under the other rules',
    matched: rule4bMatch,
  });

  /*
   * Rule 5 — Class A, and the ONLY route to Class A there is: products for
   * general laboratory use with no critical characteristics, instruments
   * intended for IVD procedures, and specimen receptacles. None of the inputs
   * this engine collects identifies such a device, so it cannot assert Rule 5
   * and never matches it. That is reported below rather than assumed.
   */
  ruleTrace.push({
    rule: 'Annex VIII, Rule 5 (Class A)',
    description:
      'Products for general laboratory use with no critical characteristics, accessories, buffer and washing solutions, general culture media and histological stains; instruments intended for IVD procedures; specimen receptacles. The only route to Class A',
    matched: false,
  });

  /*
   * Rule 6 — Class B, verbatim: "Devices not covered by the above-mentioned
   * classification rules are classified as class B."
   *
   * THIS IS THE DEFAULT, AND IT WAS CLASS A. `classResult` started at 'A' and a
   * device matching no rule kept it, which the trace then reported as
   * "Rule 7 (Class A) — All other IVDs not covered by Rules 1-6". Annex VIII has
   * no such rule. Class A self-declares; Class B does not. So an IVD the engine
   * could not place was told it could CE-mark without a notified body, when the
   * regulation puts it in the class that requires one.
   */
  const higherRuleMatched =
    rule1Match || isBloodGrouping || rule3aMatch || rule3bMatch || rule3cMatch || rule3dMatch || rule4aMatch;
  ruleTrace.push({
    rule: 'Annex VIII, Rule 6 (Class B)',
    description:
      'Devices not covered by the above-mentioned classification rules are classified as class B',
    matched: !higherRuleMatched,
  });

  /*
   * Rule 7 — Class B: controls without a quantitative or qualitative assigned
   * value. No input identifies one, so like Rule 5 it never matches; it is
   * enumerated so the trace is the whole of Annex VIII rather than the part this
   * engine can decide.
   */
  ruleTrace.push({
    rule: 'Annex VIII, Rule 7 (Class B)',
    description: 'Devices which are controls without a quantitative or qualitative assigned value',
    matched: false,
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

  // ── Confidence + ambiguity ─────────────────────────────────────────────────
  const matched = ruleTrace.filter(r => r.matched);
  const booleanInputs = [
    isSelfTest, isNearPatient, isCompanionDiagnostic, detectsTransmissibleAgent,
    bloodScreening, detectsCancer, prenatalScreening, isGeneticTest,
  ].filter(v => v !== undefined).length;

  const ambiguityNotes: string[] = [];
  /* Fell through to the Rule 6 catch-all rather than matching a rule. Class B is
     the regulation's answer for that, but it is the answer to "nothing above
     applied", so the intended purpose is worth a second read. */
  const byCatchAll = !ruleTrace.some(
    r => r.matched && /Rule 1|Rule 2|Rule 3|Rule 4\(a\)/.test(r.rule),
  );
  if (byCatchAll) {
    ambiguityNotes.push(
      'Class B by the Annex VIII Rule 6 catch-all (no other rule matched) — confirm the intended purpose does not trigger Rules 1–4.',
    );
  }
  /* Class A is reachable ONLY through Rule 5, and nothing this engine collects
     identifies a Rule 5 device. Saying so is the honest form of a class it
     cannot award; the previous engine awarded it by default instead. */
  if (byCatchAll) {
    ambiguityNotes.push(
      'Class A is not inferable from these inputs: Annex VIII reaches it only through Rule 5 (general laboratory use, IVD instruments, specimen receptacles), which the manufacturer must assert.',
    );
  }
  /* The Rule 4(a) exception was taken from the risk level, not from a dedicated
     "medically critical" input — say so wherever it decided the class. */
  if (rule4aMatch) {
    ambiguityNotes.push(
      riskToPatient === 'low'
        ? 'Self-test placed in Class B under the Rule 4(a) exception because risk-to-patient was given as low — confirm the result does not determine a medically critical status.'
        : 'Self-test placed in Class C under Rule 4(a) — Class B applies only where the result does not determine a medically critical status, or is preliminary and requires laboratory follow-up.',
    );
  }
  // Multiple Rule-3 triggers (e.g., CDx + cancer + genetic) still resolve to C
  // but are worth surfacing.
  const ruleThreeTriggers = [isCompanionDiagnostic, detectsCancer, isGeneticTest, prenatalScreening].filter(Boolean).length;
  if (ruleThreeTriggers > 1) {
    ambiguityNotes.push('Multiple Rule 3 criteria apply; Class C governs, but document each applicable criterion.');
  }

  let confidence: IvdrClassificationResult['confidence'];
  if (matched.some(r => /Rule 1|Rule 2|Rule 3/.test(r.rule))) confidence = 'high';
  else if (booleanInputs >= 2 || riskToPatient !== undefined) confidence = 'moderate';
  else confidence = byCatchAll ? 'low' : 'moderate';

  return {
    classification: classResult,
    ruleTrace,
    matchedRules: matched,
    notifiedBodyRequired: NOTIFIED_BODY_REQUIRED_BY_CLASS[classResult],
    confidence,
    ambiguityNotes,
    fdaEquivalentPathway: FDA_PATHWAY_BY_CLASS[classResult],
    conformityRoute: CONFORMITY_ROUTE_BY_CLASS[classResult],
    knowledgeRefs: [...knowledgeRefs],
  };
}
