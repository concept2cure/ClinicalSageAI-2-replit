/**
 * Gap classifier for sentence-level citations.
 *
 * When the citation engine cannot find a supporting source for a sentence in
 * a regulatory section, the classifier looks up the section's required-element
 * rules (mapped to ICH M4 / 21 CFR / FDA guidance) and returns a severity
 * classification with a readiness-score delta. The output drives:
 *
 *   - inline gap badges (the chat / artifact UI renders status='gap' rows)
 *   - the artifact's filing-blocked flag (any 'critical' gap blocks filing)
 *   - the project's readiness score (sum of readinessDelta across gaps)
 *
 * Severity ladder, with default readiness penalties (negative points):
 *   critical → blocks filing — required element missing for an FDA-mandated
 *              record. e.g. CSR §11.4 missing primary endpoint result.
 *              Default penalty: -18.
 *   major    → ICH/FDA-recommended, expected by reviewers. Filing not blocked
 *              but a deficiency letter is likely. e.g. CSR §11.2 missing
 *              demographic table.
 *              Default penalty: -8.
 *   minor    → Best-practice, helpful but optional. e.g. exploratory
 *              biomarker subgroup analysis.
 *              Default penalty: -2.
 *   info     → Style / completeness suggestion only.
 *              Default penalty: 0.
 *
 * The rule set covers ≥30 common gap patterns at launch — the spec floor.
 * Each rule has an id, a CTD section code (or prefix like '3.2.S'), the
 * required element keyword(s), severity, optional explicit penalty, and a
 * blocking flag (true means filing is blocked when this gap is present).
 *
 * @module server/services/ana/gap-classifier
 */

export type GapSeverity = 'critical' | 'major' | 'minor' | 'info';

export interface GapRule {
  id: string;
  /** Exact CTD section code (e.g. '5.3.5.1') or prefix ('3.2.S'). */
  sectionCode: string;
  /**
   * Whether `sectionCode` is a prefix match (true) or exact (false).
   * Prefix matches let one rule cover all sub-sections.
   */
  prefix?: boolean;
  /** Substring patterns (lower-case) that identify the required element in the claim text. */
  patterns: string[];
  severity: GapSeverity;
  /** Override for the default severity-derived penalty. Negative number. */
  readinessDelta?: number;
  /** True → any occurrence blocks filing. Defaults to severity==='critical'. */
  blockingFiling?: boolean;
  /** ICH / 21 CFR reference for the requirement. */
  guidance: string;
  /** Human-readable description of the missing element. */
  message: string;
}

const DEFAULT_DELTAS: Record<GapSeverity, number> = {
  critical: -18,
  major: -8,
  minor: -2,
  info: 0,
};

/**
 * Curated rule set. ≥30 rules at launch covering CSR (Module 5),
 * Quality (Module 3), and Module 2 summaries — the surfaces the
 * submission-chat path will hit most often.
 *
 * Section codes follow ICH M4 / eCTD numbering. Prefix rules apply to
 * any sub-section of the parent (e.g. '3.2.S' covers 3.2.S.1, 3.2.S.2.1, …).
 */
export const GAP_RULES: GapRule[] = [
  // ─── Module 2 — CTD Summaries ─────────────────────────────────────
  {
    id: 'M2.3-quality-overall-summary',
    sectionCode: '2.3',
    patterns: ['quality overall summary', 'qos', 'manufacturing summary'],
    severity: 'critical',
    guidance: 'ICH M4Q(R1)',
    message: 'Quality Overall Summary content missing — required CMC summary for the dossier.',
  },
  {
    id: 'M2.4-nonclinical-overview',
    sectionCode: '2.4',
    patterns: ['nonclinical overview', 'pharmacology summary', 'toxicology overview'],
    severity: 'major',
    guidance: 'ICH M4S(R2)',
    message: 'Nonclinical Overview missing the integrated pharmacology/toxicology narrative.',
  },
  {
    id: 'M2.5-clinical-overview',
    sectionCode: '2.5',
    patterns: ['clinical overview', 'benefit-risk', 'overall clinical'],
    severity: 'critical',
    guidance: 'ICH M4E(R2)',
    message: 'Clinical Overview missing — benefit/risk and integrated clinical synthesis required.',
  },
  {
    id: 'M2.7.3-summary-clinical-efficacy',
    sectionCode: '2.7.3',
    patterns: ['summary of clinical efficacy', 'efficacy summary'],
    severity: 'major',
    guidance: 'ICH M4E(R2)',
    message: 'Summary of Clinical Efficacy missing aggregated efficacy results.',
  },
  {
    id: 'M2.7.4-summary-clinical-safety',
    sectionCode: '2.7.4',
    patterns: ['summary of clinical safety', 'safety summary', 'integrated safety'],
    severity: 'critical',
    guidance: 'ICH M4E(R2)',
    message: 'Summary of Clinical Safety missing — integrated safety analysis required.',
  },
  {
    id: 'M2.7.6-synopses-individual-studies',
    sectionCode: '2.7.6',
    patterns: ['synopsis', 'study synopses'],
    severity: 'minor',
    guidance: 'ICH M4E(R2)',
    message: 'Individual study synopses missing.',
  },

  // ─── Module 3 — Quality (Drug Substance) ──────────────────────────
  {
    id: 'M3.2.S.1-general-information',
    sectionCode: '3.2.S.1',
    patterns: ['nomenclature', 'structure', 'general properties'],
    severity: 'critical',
    guidance: 'ICH M4Q(R1)',
    message: 'Drug substance general information (nomenclature, structure, properties) missing.',
  },
  {
    id: 'M3.2.S.2-manufacture',
    sectionCode: '3.2.S.2',
    prefix: true,
    patterns: ['manufacturer', 'manufacturing process', 'process controls', 'process validation'],
    severity: 'critical',
    guidance: 'ICH M4Q(R1)',
    message: 'Drug substance manufacturing process / validation evidence missing.',
  },
  {
    id: 'M3.2.S.3-characterisation',
    sectionCode: '3.2.S.3',
    prefix: true,
    patterns: ['elucidation of structure', 'impurit', 'characteris'],
    severity: 'major',
    guidance: 'ICH M4Q(R1)',
    message: 'Drug substance structural characterisation / impurity profile missing.',
  },
  {
    id: 'M3.2.S.4.1-specification',
    sectionCode: '3.2.S.4.1',
    patterns: ['specification', 'release criteria'],
    severity: 'critical',
    guidance: 'ICH Q6A',
    message: 'Drug substance specification missing — required release criteria not documented.',
  },
  {
    id: 'M3.2.S.4.4-batch-analyses',
    sectionCode: '3.2.S.4.4',
    patterns: ['batch analyses', 'batch results', 'representative batches'],
    severity: 'major',
    guidance: 'ICH M4Q(R1)',
    message: 'Drug substance batch-analysis data missing.',
  },
  {
    id: 'M3.2.S.7-stability',
    sectionCode: '3.2.S.7',
    prefix: true,
    patterns: ['stability', 'shelf life', 're-test period'],
    severity: 'critical',
    guidance: 'ICH Q1A(R2)',
    message: 'Drug substance stability data missing — required for shelf-life justification.',
  },

  // ─── Module 3 — Quality (Drug Product) ────────────────────────────
  {
    id: 'M3.2.P.1-description-composition',
    sectionCode: '3.2.P.1',
    patterns: ['composition', 'description of dosage form', 'qualitative composition'],
    severity: 'critical',
    guidance: 'ICH M4Q(R1)',
    message: 'Drug product composition / dosage form description missing.',
  },
  {
    id: 'M3.2.P.2-pharmaceutical-development',
    sectionCode: '3.2.P.2',
    prefix: true,
    patterns: ['pharmaceutical development', 'formulation development'],
    severity: 'major',
    guidance: 'ICH Q8(R2)',
    message: 'Pharmaceutical development rationale missing.',
  },
  {
    id: 'M3.2.P.3-manufacture',
    sectionCode: '3.2.P.3',
    prefix: true,
    patterns: ['manufacturing process', 'process validation', 'in-process controls'],
    severity: 'critical',
    guidance: 'ICH Q7, ICH M4Q(R1)',
    message: 'Drug product manufacturing process / validation missing.',
  },
  {
    id: 'M3.2.P.5-control-of-drug-product',
    sectionCode: '3.2.P.5',
    prefix: true,
    patterns: ['drug product specification', 'analytical procedures', 'validation of analytical'],
    severity: 'critical',
    guidance: 'ICH Q6A, ICH Q2(R1)',
    message: 'Drug product specification / analytical method validation missing.',
  },
  {
    id: 'M3.2.P.8-stability',
    sectionCode: '3.2.P.8',
    prefix: true,
    patterns: ['drug product stability', 'shelf life justification'],
    severity: 'critical',
    guidance: 'ICH Q1A(R2)',
    message: 'Drug product stability data missing — required for proposed shelf life.',
  },
  {
    id: 'M3.2.A.2-adventitious-agents',
    sectionCode: '3.2.A.2',
    patterns: ['adventitious agents', 'viral safety', 'tse'],
    severity: 'major',
    guidance: 'ICH Q5A(R1)',
    message: 'Adventitious agents safety evaluation missing for biologic / cell-derived product.',
  },

  // ─── Module 4 — Nonclinical ──────────────────────────────────────
  {
    id: 'M4.2.1-pharmacology',
    sectionCode: '4.2.1',
    prefix: true,
    patterns: ['primary pharmacodynamics', 'mechanism of action', 'safety pharmacology'],
    severity: 'major',
    guidance: 'ICH M4S(R2)',
    message: 'Nonclinical pharmacology study reports missing.',
  },
  {
    id: 'M4.2.3-toxicology',
    sectionCode: '4.2.3',
    prefix: true,
    patterns: [
      'single-dose toxicity',
      'repeat-dose toxicity',
      'genotoxicity',
      'carcinogenicity',
      'reproductive toxicity',
    ],
    severity: 'critical',
    guidance: 'ICH M3(R2)',
    message: 'Toxicology study report missing — pivotal nonclinical safety required.',
  },

  // ─── Module 5 — Clinical Study Reports ────────────────────────────
  {
    id: 'M5.3.5.1-csr-pivotal-efficacy',
    sectionCode: '5.3.5.1',
    prefix: true,
    patterns: ['primary endpoint', 'pivotal study', 'confirmatory'],
    severity: 'critical',
    guidance: 'ICH E3',
    message: 'Pivotal efficacy CSR missing primary endpoint result.',
  },
  {
    id: 'CSR-9.2-demographics',
    sectionCode: '9.2',
    prefix: true,
    patterns: ['demographics', 'baseline characteristics', 'disposition'],
    severity: 'critical',
    guidance: 'ICH E3 §9.2',
    message: 'CSR demographics / baseline characteristics table missing.',
  },
  {
    id: 'CSR-10-study-patients',
    sectionCode: '10',
    prefix: true,
    patterns: ['disposition of patients', 'protocol deviations'],
    severity: 'major',
    guidance: 'ICH E3 §10',
    message: 'Patient disposition / protocol deviation summary missing.',
  },
  {
    id: 'CSR-11.1-data-sets-analysed',
    sectionCode: '11.1',
    patterns: ['data sets analysed', 'analysis populations', 'itt', 'per protocol'],
    severity: 'major',
    guidance: 'ICH E3 §11.1',
    message: 'Analysis populations (ITT / PP) definition missing.',
  },
  {
    id: 'CSR-11.4-efficacy-results',
    sectionCode: '11.4',
    prefix: true,
    patterns: ['efficacy results', 'analysis of primary endpoint', 'forest plot'],
    severity: 'critical',
    guidance: 'ICH E3 §11.4',
    message: 'Efficacy results section missing primary endpoint analysis.',
  },
  {
    id: 'CSR-12-safety-evaluation',
    sectionCode: '12',
    prefix: true,
    patterns: ['adverse events', 'serious adverse events', 'safety evaluation'],
    severity: 'critical',
    guidance: 'ICH E3 §12',
    message: 'Safety evaluation section missing adverse-event analysis.',
  },
  {
    id: 'CSR-12.3-clinical-laboratory',
    sectionCode: '12.3',
    prefix: true,
    patterns: ['clinical laboratory evaluation', 'lab abnormalities'],
    severity: 'major',
    guidance: 'ICH E3 §12.3',
    message: 'Clinical laboratory evaluation missing.',
  },
  {
    id: 'CSR-14-tabular-listings',
    sectionCode: '14',
    prefix: true,
    patterns: ['tabular listing', 'individual patient data'],
    severity: 'minor',
    guidance: 'ICH E3 §14',
    message: 'Tabular listings of individual data missing.',
  },
  {
    id: 'CSR-16-appendices',
    sectionCode: '16',
    prefix: true,
    patterns: ['appendix', 'protocol amendments', 'crf', 'consent form'],
    severity: 'minor',
    guidance: 'ICH E3 §16',
    message: 'Required CSR appendices (protocol, sample CRF, consent) missing.',
  },

  // ─── Module 1 — Regional / Administrative (US) ────────────────────
  {
    id: 'M1.1-cover-letter',
    sectionCode: '1.1',
    patterns: ['cover letter'],
    severity: 'major',
    guidance: '21 CFR 312.23(a)(1)',
    message: 'Submission cover letter missing.',
  },
  {
    id: 'M1.2-application-form-1571',
    sectionCode: '1.2',
    patterns: ['form fda 1571', 'investigational new drug application'],
    severity: 'critical',
    guidance: '21 CFR 312.23(a)(1)',
    message: 'Form FDA 1571 missing for IND submission.',
  },
  {
    id: 'M1.3-administrative-information',
    sectionCode: '1.3',
    prefix: true,
    patterns: ['contact information', 'us agent', 'authorization to refer'],
    severity: 'minor',
    guidance: '21 CFR 312.23(a)(1)',
    message: 'Administrative information missing.',
  },
  {
    id: 'M1.14.4-investigators-brochure',
    sectionCode: '1.14',
    prefix: true,
    patterns: ['investigator', 'brochure', 'ib'],
    severity: 'critical',
    guidance: 'ICH E6(R3) §7',
    message: 'Investigator Brochure (or current update) missing for IND.',
  },

  // ─── Cross-cutting safety / risk ──────────────────────────────────
  {
    id: 'PSUR-benefit-risk',
    sectionCode: '1.8.2',
    patterns: ['benefit-risk', 'risk management plan', 'rmp'],
    severity: 'major',
    guidance: 'ICH E2C(R2)',
    message: 'Benefit-risk evaluation / RMP content missing.',
  },
];

export interface GapClassification {
  severity: GapSeverity;
  readinessDelta: number;
  blockingFiling: boolean;
  rule: string;
  message: string;
  guidance: string;
}

/**
 * Look up the gap rule that best matches a (sectionCode, claimText) pair.
 * Section matching:
 *   - exact match wins over prefix match
 *   - longer prefix wins over shorter prefix (e.g. '3.2.S.7' > '3.2.S')
 * Pattern matching:
 *   - case-insensitive substring against claimText
 *   - if multiple rules match, the most-specific section wins
 *
 * Returns null if no rule matches — the caller treats that as severity='info'
 * (i.e., the missing element isn't on the required list, no readiness penalty).
 */
export function classifyGap(
  sectionCode: string | null,
  claimText: string
): GapClassification | null {
  if (!sectionCode || !claimText) return null;
  const normalizedClaim = claimText.toLowerCase();
  const normalizedSection = sectionCode.trim();

  // Score each rule by section-match specificity, then test patterns.
  let bestMatch: { rule: GapRule; specificity: number } | null = null;
  for (const rule of GAP_RULES) {
    let specificity = -1;
    if (rule.prefix) {
      if (
        normalizedSection === rule.sectionCode ||
        normalizedSection.startsWith(rule.sectionCode + '.')
      ) {
        // Longer prefix = more specific.
        specificity = rule.sectionCode.length;
      }
    } else if (rule.sectionCode === normalizedSection) {
      specificity = 1000; // exact match always beats prefix matches
    }
    if (specificity < 0) continue;

    const matched = rule.patterns.some(p => normalizedClaim.includes(p));
    if (!matched) continue;

    if (!bestMatch || specificity > bestMatch.specificity) {
      bestMatch = { rule, specificity };
    }
  }

  if (!bestMatch) return null;
  const r = bestMatch.rule;
  const readinessDelta =
    typeof r.readinessDelta === 'number' ? r.readinessDelta : DEFAULT_DELTAS[r.severity];
  const blockingFiling =
    typeof r.blockingFiling === 'boolean' ? r.blockingFiling : r.severity === 'critical';
  return {
    severity: r.severity,
    readinessDelta,
    blockingFiling,
    rule: r.id,
    message: r.message,
    guidance: r.guidance,
  };
}

/**
 * Return all rules that apply to a given section code (exact + matching
 * prefixes), sorted from most-specific to least. Useful for surfacing "what
 * AnA expects in this section" up-front so authors know what's required.
 */
export function getGapRulesForSection(sectionCode: string): GapRule[] {
  const normalized = sectionCode.trim();
  const matches = GAP_RULES.filter(r =>
    r.prefix
      ? normalized === r.sectionCode || normalized.startsWith(r.sectionCode + '.')
      : r.sectionCode === normalized
  );
  return matches.sort((a, b) => {
    if (!a.prefix && b.prefix) return -1;
    if (a.prefix && !b.prefix) return 1;
    return b.sectionCode.length - a.sectionCode.length;
  });
}

/** Total readiness penalty for a list of gap classifications (negative). */
export function sumReadinessDelta(
  gaps: Array<{ readinessDelta: number }>
): number {
  return gaps.reduce((acc, g) => acc + g.readinessDelta, 0);
}

/** True if any gap in the list blocks filing. */
export function anyFilingBlocked(
  gaps: Array<{ blockingFiling: boolean }>
): boolean {
  return gaps.some(g => g.blockingFiling);
}

/** Return the rule registry as a plain JSON-safe array (for the API surface). */
export function listAllGapRules(): GapRule[] {
  return [...GAP_RULES];
}
