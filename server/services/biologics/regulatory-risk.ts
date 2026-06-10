/**
 * BLA 351(a) — filing-risk engine (biologics-specific).
 *
 * The general precedent/risk model in the platform is tuned for small-molecule
 * NDAs and reused wholesale for biologics. This engine adds the biologics-
 * specific layer: it maps a program's CMC/clinical readiness signals — and the
 * conclusions of the analytical-similarity, comparability, and immunogenicity
 * engines — onto the failure modes that actually drive Refuse-to-File (RTF) and
 * Complete Response Letter (CRL) outcomes for a Biologics License Application.
 *
 * Grounded in: 21 CFR 601.2 (BLA content / RTF), ICH Q5A (viral safety),
 * Q5E (comparability), Q6B (specifications/potency), Q1A (stability), the FDA
 * immunogenicity assessment framework, and FDA process-validation (PPQ) and
 * pre-approval-inspection expectations.
 *
 * Deterministic: every finding cites the rule it derives from and carries a
 * concrete mitigation. It ties the three science engines together so a failed
 * Tier-1 similarity, an un-established comparability, or a high immunogenicity
 * risk surfaces as a filing-risk trigger — not a buried number.
 *
 * @module server/services/biologics/regulatory-risk
 */

import type { SimilarityConclusion } from './analytical-similarity';
import type { ComparabilityConclusion } from './comparability';
import type { RiskTier } from './immunogenicity';

export type Severity = 'rtf' | 'crl_major' | 'review_issue';
export type FindingStatus = 'triggered' | 'watch' | 'ok';
export type RiskBand = 'low' | 'medium' | 'high' | 'critical';
export type Category = 'administrative' | 'cmc' | 'clinical' | 'quality';

export interface BlaReadinessSignals {
  /** Potency assay validated and stability-indicating (ICH Q6B). */
  potencyAssayValidated?: boolean;
  /** Viral clearance / adventitious-agent safety validated (ICH Q5A). */
  viralClearanceValidated?: boolean;
  /** Adventitious agent testing complete (cell substrate, raw materials). */
  adventitiousAgentTesting?: boolean;
  /** Cell bank (MCB/WCB) characterized and qualified. */
  cellBankCharacterized?: boolean;
  /** Available long-term stability (months). */
  stabilityMonths?: number;
  /** Shelf life the label will claim (months). */
  requiredShelfLifeMonths?: number;
  /** Process validation / PPQ complete. */
  processValidationComplete?: boolean;
  /** Container-closure system qualified (incl. extractables/leachables). */
  containerClosureQualified?: boolean;
  /** Pre-approval inspection readiness. */
  inspectionReady?: boolean;
}

export interface BlaAdministrativeSignals {
  form356h?: boolean;
  coverLetter?: boolean;
  module3CmcComplete?: boolean;
  clinicalSummaries?: boolean;
  /** Immunogenicity data present (required for therapeutic proteins). */
  immunogenicityData?: boolean;
  cdiscDatasets?: boolean;
}

export interface BlaFilingRiskInput {
  productType?: 'biologic' | 'biosimilar';
  modality?: string;
  /** Whether the program involves a manufacturing change needing comparability. */
  manufacturingChange?: boolean;
  /** Conclusion from the analytical-similarity engine, if run. */
  analyticalSimilarity?: SimilarityConclusion;
  /** Conclusion from the comparability engine, if run. */
  comparability?: ComparabilityConclusion;
  /** Risk tier from the immunogenicity engine, if run. */
  immunogenicityRisk?: RiskTier;
  readiness?: BlaReadinessSignals;
  administrative?: BlaAdministrativeSignals;
}

export interface BlaFilingFinding {
  id: string;
  category: Category;
  severity: Severity;
  status: FindingStatus;
  title: string;
  rationale: string;
  citation: string;
  mitigation: string;
}

export interface BlaFilingRiskResult {
  productType: string | null;
  modality: string | null;
  rtfRisk: RiskBand;
  crlRisk: RiskBand;
  /** Titles of triggered RTF / CRL-major findings (the filing blockers). */
  blockers: string[];
  findings: BlaFilingFinding[];
  counts: { triggered: number; watch: number; ok: number };
  summary: string;
  recommendations: string[];
  methodology: string[];
}

const METHODOLOGY = [
  'RTF (Refuse to File) findings derive from 21 CFR 601.2 administrative completeness; any triggered RTF item makes the filing un-acceptable until resolved.',
  'CRL-major findings derive from the biologics review disciplines (CMC: ICH Q5A/Q5E/Q6B/Q1A; Clinical: immunogenicity impact; Quality: PPQ + pre-approval inspection).',
  'The analytical-similarity, comparability, and immunogenicity engine conclusions feed directly into the relevant findings.',
  'Risk bands scale with the count and severity of triggered findings; review_issue items are surfaced as watch items, not blockers.',
];

interface Rule {
  id: string;
  category: Category;
  severity: Severity;
  title: string;
  citation: string;
  mitigation: string;
  /** Returns triggered | watch | ok | null (null = not applicable / unknown). */
  evaluate: (i: BlaFilingRiskInput) => FindingStatus | null;
  rationale: (i: BlaFilingRiskInput, status: FindingStatus) => string;
}

// Helper: an explicit `false` means "known missing" (trigger); `undefined`
// means "unknown" (watch). This keeps a sparse input honest — absence of
// evidence is surfaced, not silently passed.
function presence(flag: boolean | undefined, watchWhenUnknown = true): FindingStatus | null {
  if (flag === true) return 'ok';
  if (flag === false) return 'triggered';
  return watchWhenUnknown ? 'watch' : null;
}

const RULES: Rule[] = [
  // ── Administrative / RTF (21 CFR 601.2) ──────────────────────────────────
  {
    id: 'rtf_form_356h',
    category: 'administrative',
    severity: 'rtf',
    title: 'FDA Form 356h present',
    citation: '21 CFR 601.2(a)',
    mitigation: 'Complete and sign FDA Form 356h before submission.',
    evaluate: (i) => presence(i.administrative?.form356h),
    rationale: (_i, s) => (s === 'triggered' ? 'Form 356h is missing — the BLA cannot be filed.' : s === 'watch' ? 'Form 356h status not confirmed.' : 'Form 356h present.'),
  },
  {
    id: 'rtf_module3_cmc',
    category: 'administrative',
    severity: 'rtf',
    title: 'Module 3 CMC (drug substance + drug product) complete',
    citation: '21 CFR 601.2; ICH M4Q',
    mitigation: 'Complete 3.2.S and 3.2.P before filing; a biologic with an incomplete CMC module is refused.',
    evaluate: (i) => presence(i.administrative?.module3CmcComplete),
    rationale: (_i, s) => (s === 'triggered' ? 'Module 3 CMC is incomplete — RTF risk.' : s === 'watch' ? 'Module 3 CMC completeness not confirmed.' : 'Module 3 CMC complete.'),
  },
  {
    id: 'rtf_clinical_summaries',
    category: 'administrative',
    severity: 'rtf',
    title: 'Clinical safety/efficacy summaries present',
    citation: '21 CFR 601.2; ICH M4E',
    mitigation: 'Provide Module 2.5/2.7 clinical summaries and integrated safety/efficacy.',
    evaluate: (i) => presence(i.administrative?.clinicalSummaries),
    rationale: (_i, s) => (s === 'triggered' ? 'Clinical summaries missing — RTF risk.' : s === 'watch' ? 'Clinical summaries not confirmed.' : 'Clinical summaries present.'),
  },
  {
    id: 'rtf_immunogenicity_data',
    category: 'administrative',
    severity: 'rtf',
    title: 'Immunogenicity data present (therapeutic protein)',
    citation: 'FDA Immunogenicity Assessment guidance; 21 CFR 601.2',
    mitigation: 'Include ADA/NAb assay results and the immunogenicity assessment for the therapeutic protein.',
    evaluate: (i) => presence(i.administrative?.immunogenicityData),
    rationale: (_i, s) => (s === 'triggered' ? 'No immunogenicity data for a therapeutic protein — RTF risk.' : s === 'watch' ? 'Immunogenicity data presence not confirmed.' : 'Immunogenicity data present.'),
  },
  {
    id: 'rtf_cdisc',
    category: 'administrative',
    severity: 'rtf',
    title: 'CDISC-conformant datasets',
    citation: 'FDA Study Data Technical Conformance Guide',
    mitigation: 'Provide SDTM/ADaM datasets conformant to the FDA data standards catalog.',
    evaluate: (i) => presence(i.administrative?.cdiscDatasets),
    rationale: (_i, s) => (s === 'triggered' ? 'Non-CDISC / missing standardized datasets — RTF risk.' : s === 'watch' ? 'Dataset conformance not confirmed.' : 'CDISC datasets present.'),
  },

  // ── CMC / CRL-major ──────────────────────────────────────────────────────
  {
    id: 'crl_analytical_similarity',
    category: 'cmc',
    severity: 'crl_major',
    title: 'Analytical characterization / similarity established',
    citation: 'FDA biosimilar analytical assessment; ICH Q6B',
    mitigation: 'Resolve out-of-equivalence attributes; add lots to power Tier-1 equivalence; justify residual differences by criticality.',
    evaluate: (i) => {
      if (!i.analyticalSimilarity) return null;
      if (i.analyticalSimilarity === 'not_demonstrated') return 'triggered';
      if (i.analyticalSimilarity === 'similar') return 'ok';
      return 'watch'; // residual uncertainty / insufficient data
    },
    rationale: (i, s) =>
      s === 'triggered'
        ? 'Analytical similarity not demonstrated — a major CMC review issue likely.'
        : s === 'watch'
          ? `Analytical similarity carries residual uncertainty (${i.analyticalSimilarity}).`
          : 'Analytical similarity supported.',
  },
  {
    id: 'crl_comparability',
    category: 'cmc',
    severity: 'crl_major',
    title: 'Manufacturing comparability established (if changed)',
    citation: 'ICH Q5E',
    mitigation: 'Generate the analytical (and, where indicated, non-clinical/clinical) bridging data to establish comparability before filing the change.',
    evaluate: (i) => {
      if (!i.manufacturingChange) return null;
      if (!i.comparability) return 'watch';
      if (i.comparability === 'not_comparable') return 'triggered';
      if (i.comparability === 'comparable') return 'ok';
      return 'watch';
    },
    rationale: (i, s) =>
      s === 'triggered'
        ? 'Post-change material is not comparable to pre-change — CRL risk under ICH Q5E.'
        : s === 'watch'
          ? 'A manufacturing change is present and comparability is not yet established.'
          : 'Comparability established for the manufacturing change.',
  },
  {
    id: 'crl_potency',
    category: 'cmc',
    severity: 'crl_major',
    title: 'Potency assay validated and stability-indicating',
    citation: 'ICH Q6B; 21 CFR 610.10',
    mitigation: 'Validate a potency assay reflecting the mechanism of action; demonstrate it is stability-indicating.',
    evaluate: (i) => presence(i.readiness?.potencyAssayValidated),
    rationale: (_i, s) => (s === 'triggered' ? 'Potency assay not validated — a frequent biologics CRL driver.' : s === 'watch' ? 'Potency assay validation not confirmed.' : 'Potency assay validated.'),
  },
  {
    id: 'crl_viral_safety',
    category: 'cmc',
    severity: 'crl_major',
    title: 'Viral clearance / adventitious-agent safety validated',
    citation: 'ICH Q5A(R2)',
    mitigation: 'Complete viral clearance validation and adventitious-agent testing of the cell substrate and process.',
    evaluate: (i) => {
      const viral = presence(i.readiness?.viralClearanceValidated);
      const adv = presence(i.readiness?.adventitiousAgentTesting);
      if (viral === 'triggered' || adv === 'triggered') return 'triggered';
      if (viral === 'watch' || adv === 'watch') return 'watch';
      return 'ok';
    },
    rationale: (_i, s) => (s === 'triggered' ? 'Viral safety / adventitious-agent validation incomplete — CRL risk.' : s === 'watch' ? 'Viral safety validation not confirmed.' : 'Viral safety validated.'),
  },
  {
    id: 'crl_cell_bank',
    category: 'cmc',
    severity: 'crl_major',
    title: 'Cell bank (MCB/WCB) characterized',
    citation: 'ICH Q5B / Q5D',
    mitigation: 'Characterize and qualify the master and working cell banks (identity, purity, genetic stability).',
    evaluate: (i) => presence(i.readiness?.cellBankCharacterized),
    rationale: (_i, s) => (s === 'triggered' ? 'Cell bank not characterized — CRL risk.' : s === 'watch' ? 'Cell bank characterization not confirmed.' : 'Cell bank characterized.'),
  },
  {
    id: 'crl_stability',
    category: 'cmc',
    severity: 'crl_major',
    title: 'Stability supports the proposed shelf life',
    citation: 'ICH Q1A(R2) / Q5C',
    mitigation: 'Generate sufficient long-term stability to support the labeled shelf life, or shorten the claim.',
    evaluate: (i) => {
      const have = i.readiness?.stabilityMonths;
      const need = i.readiness?.requiredShelfLifeMonths;
      if (have == null || need == null) return 'watch';
      if (have < need) return 'triggered';
      return 'ok';
    },
    rationale: (i, s) =>
      s === 'triggered'
        ? `Stability (${i.readiness?.stabilityMonths}m) does not support the proposed shelf life (${i.readiness?.requiredShelfLifeMonths}m).`
        : s === 'watch'
          ? 'Stability vs shelf-life claim not confirmed.'
          : 'Stability supports the proposed shelf life.',
  },
  {
    id: 'crl_immunogenicity_risk',
    category: 'clinical',
    severity: 'crl_major',
    title: 'Immunogenicity risk characterized and acceptable',
    citation: 'FDA Immunogenicity Assessment guidance',
    mitigation: 'Characterize the impact of ADA/NAb on PK, efficacy and safety; pre-specify a risk-mitigation plan for a high-risk product.',
    evaluate: (i) => {
      if (!i.immunogenicityRisk) return null;
      if (i.immunogenicityRisk === 'high') return 'triggered';
      if (i.immunogenicityRisk === 'moderate') return 'watch';
      return 'ok';
    },
    rationale: (i, s) =>
      s === 'triggered'
        ? 'High immunogenicity risk — a major clinical review issue without a clear mitigation/benefit-risk argument.'
        : s === 'watch'
          ? 'Moderate immunogenicity risk — monitor and characterize clinical impact.'
          : 'Immunogenicity risk low.',
  },

  // ── Quality / review issues ──────────────────────────────────────────────
  {
    id: 'crl_process_validation',
    category: 'quality',
    severity: 'crl_major',
    title: 'Process validation (PPQ) complete',
    citation: 'FDA Process Validation guidance (2011)',
    mitigation: 'Complete process performance qualification across the commercial process before approval.',
    evaluate: (i) => presence(i.readiness?.processValidationComplete),
    rationale: (_i, s) => (s === 'triggered' ? 'Process validation (PPQ) incomplete — CRL risk.' : s === 'watch' ? 'Process validation status not confirmed.' : 'Process validation complete.'),
  },
  {
    id: 'review_container_closure',
    category: 'cmc',
    severity: 'review_issue',
    title: 'Container-closure system qualified',
    citation: 'ICH Q6B; FDA container-closure guidance',
    mitigation: 'Qualify the container-closure system including extractables/leachables and integrity.',
    evaluate: (i) => presence(i.readiness?.containerClosureQualified),
    rationale: (_i, s) => (s === 'triggered' ? 'Container-closure qualification incomplete.' : s === 'watch' ? 'Container-closure qualification not confirmed.' : 'Container-closure qualified.'),
  },
  {
    id: 'review_inspection',
    category: 'quality',
    severity: 'review_issue',
    title: 'Pre-approval inspection readiness',
    citation: 'FDA pre-approval inspection program',
    mitigation: 'Prepare the manufacturing site(s) for pre-approval inspection; close open CAPAs.',
    evaluate: (i) => presence(i.readiness?.inspectionReady),
    rationale: (_i, s) => (s === 'triggered' ? 'Site not inspection-ready — approval may be withheld pending PAI.' : s === 'watch' ? 'Inspection readiness not confirmed.' : 'Inspection-ready.'),
  },
];

function band(rtfTriggered: number, crlTriggered: number, watch: number, severity: 'rtf' | 'crl'): RiskBand {
  if (severity === 'rtf') {
    if (rtfTriggered >= 2) return 'critical';
    if (rtfTriggered === 1) return 'high';
    return 'low';
  }
  if (crlTriggered >= 3) return 'critical';
  if (crlTriggered === 2) return 'high';
  if (crlTriggered === 1) return 'medium';
  if (watch >= 3) return 'medium';
  return 'low';
}

export function assessBlaFilingRisk(input: BlaFilingRiskInput): BlaFilingRiskResult {
  const findings: BlaFilingFinding[] = [];
  for (const rule of RULES) {
    const status = rule.evaluate(input);
    if (status === null) continue; // not applicable
    findings.push({
      id: rule.id,
      category: rule.category,
      severity: rule.severity,
      status,
      title: rule.title,
      rationale: rule.rationale(input, status),
      citation: rule.citation,
      mitigation: rule.mitigation,
    });
  }

  const triggered = findings.filter((f) => f.status === 'triggered');
  const watch = findings.filter((f) => f.status === 'watch');
  const ok = findings.filter((f) => f.status === 'ok');

  const rtfTriggered = triggered.filter((f) => f.severity === 'rtf').length;
  const crlTriggered = triggered.filter((f) => f.severity === 'crl_major').length;

  const rtfRisk = band(rtfTriggered, crlTriggered, watch.length, 'rtf');
  const crlRisk = band(rtfTriggered, crlTriggered, watch.length, 'crl');

  const blockers = triggered
    .filter((f) => f.severity === 'rtf' || f.severity === 'crl_major')
    .map((f) => f.title);

  const recommendations: string[] = [];
  if (rtfTriggered > 0) {
    recommendations.push(
      `${rtfTriggered} administrative completeness item(s) would trigger Refuse-to-File. Close these before submission — they gate acceptance, not just review.`,
    );
  }
  if (crlTriggered > 0) {
    recommendations.push(
      `${crlTriggered} major review issue(s) carry CRL risk. Prioritize the triggered CMC/clinical items and bring the supporting data into the dossier.`,
    );
  }
  if (rtfTriggered === 0 && crlTriggered === 0 && watch.length > 0) {
    recommendations.push(
      `${watch.length} item(s) are unconfirmed. Confirm the status of each watch item so the filing-risk picture is complete.`,
    );
  }
  if (triggered.length === 0 && watch.length === 0) {
    recommendations.push('No filing-risk triggers from the supplied signals. Maintain the evidence as the dossier finalizes.');
  }

  return {
    productType: input.productType ?? null,
    modality: input.modality ?? null,
    rtfRisk,
    crlRisk,
    blockers,
    findings,
    counts: { triggered: triggered.length, watch: watch.length, ok: ok.length },
    summary: `RTF risk ${rtfRisk}, CRL risk ${crlRisk}: ${triggered.length} triggered, ${watch.length} to confirm, ${ok.length} met (${blockers.length} filing blocker(s)).`,
    recommendations,
    methodology: METHODOLOGY,
  };
}
