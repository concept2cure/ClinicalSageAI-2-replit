/**
 * IVD reviewer simulation — mock FDA / notified-body deficiency engine.
 *
 * Given a submission profile (pathway, assay type, intended use, biomarker, and
 * which evidence elements are present), this generates the deficiencies and
 * questions a reviewer is likely to raise, each grounded in a knowledge-base
 * entry. It encodes the recurring deficiency patterns that sink IVD submissions
 * and is the "adversarial review" companion to the study-design engine.
 *
 * Enhanced: risk-tier awareness (PMA / Class D are stricter), a 0–100 readiness
 * score, documented strengths, an estimated review-cycle count, and a
 * severity-prioritized remediation roadmap — in addition to the deficiency list.
 *
 * Deterministic; reads only static in-code corpora.
 */

import { getEntry } from '../ivd-knowledge/knowledge.service';
import { lookupBiomarkerValidity } from './cdx-pairing';
import type { Citation } from '../ivd-knowledge/types';

export type ReviewPathway = '510k' | 'de_novo' | 'pma' | 'eu_ivdr';
export type ReviewAssayType = 'quantitative' | 'qualitative' | 'ihc' | 'ngs' | 'molecular';
export type ReviewIntendedUse = 'cdx' | 'screening' | 'diagnosis' | 'monitoring' | 'aid_to_diagnosis';

export interface EvidencePresence {
  scientificValidity?: boolean;
  analyticalPrecision?: boolean;       // EP05
  detectionCapability?: boolean;       // EP17 LoB/LoD/LoQ
  linearity?: boolean;                 // EP06
  interference?: boolean;              // EP07
  methodComparison?: boolean;          // EP09
  stability?: boolean;                 // EP25
  traceability?: boolean;              // ISO 17511
  cutoffValidation?: boolean;          // independent cut-off validation
  clinicalPerformance?: boolean;
  intendedUseMatchesPredicate?: boolean; // 510(k) specific
  pmpfPlan?: boolean;                  // IVDR specific
  softwareValidation?: boolean;        // if software/NGS
  cybersecurity?: boolean;             // if software/connected
  bioinformaticsValidation?: boolean;  // NGS specific
  // Enhanced high-risk-pathway expectations:
  manufacturingProcessValidation?: boolean; // PMA QS / process validation
  benefitRiskAnalysis?: boolean;            // PMA / De Novo
  specialControlsProposed?: boolean;        // De Novo
  euReferenceLabReady?: boolean;            // IVDR Class D
  qmsCertified?: boolean;                   // ISO 13485 / QMS
}

export type FindingSeverity = 'major' | 'deficiency' | 'minor' | 'info';

export interface ReviewFinding {
  severity: FindingSeverity;
  area: string;
  finding: string;
  recommendation: string;
  knowledgeRef: string;
}

export interface RemediationStep {
  priority: number;
  severity: FindingSeverity;
  area: string;
  action: string;
}

export interface ReviewResult {
  pathway: ReviewPathway;
  /** Inferred risk tier driving the strictness of expectations. */
  riskTier: 'standard' | 'elevated' | 'highest';
  findings: ReviewFinding[];
  /** Evidence elements done well (positive reinforcement / what to keep). */
  strengths: string[];
  counts: Record<FindingSeverity, number>;
  /** 0–100 submission-readiness score (severity-weighted). */
  readinessScore: number;
  /** Likely number of review cycles (incl. AI/deficiency rounds) if submitted as-is. */
  estimatedReviewCycles: number;
  /** Severity-prioritized remediation roadmap. */
  remediationRoadmap: RemediationStep[];
  /** Likely outcome if submitted as-is. */
  verdict: 'likely_acceptance' | 'additional_information_likely' | 'not_substantially_complete';
  citations: { id: string; title: string; citations: Citation[] }[];
}

function has(e: EvidencePresence | undefined, k: keyof EvidencePresence): boolean {
  return e?.[k] === true;
}

/** Severity weights for the readiness score (higher = more damaging). */
const SEVERITY_WEIGHT: Record<FindingSeverity, number> = { major: 10, deficiency: 4, minor: 1, info: 0 };

/** Infer the review risk tier — PMA and EU IVDR CDx/Class-D-type uses are strictest. */
function inferRiskTier(profile: ReviewProfile): ReviewResult['riskTier'] {
  if (profile.pathway === 'pma') return 'highest';
  if (profile.intendedUse === 'cdx') return 'highest';
  if (profile.pathway === 'de_novo') return 'elevated';
  if (profile.pathway === 'eu_ivdr' && (profile.intendedUse === 'screening')) return 'elevated';
  return 'standard';
}

export interface ReviewProfile {
  pathway: ReviewPathway;
  assayType: ReviewAssayType;
  intendedUse: ReviewIntendedUse;
  biomarker?: string;
  hasSoftware?: boolean;
  evidence?: EvidencePresence;
}

/** Simulate a regulatory review and surface likely deficiencies + readiness. */
export function simulateIvdReview(profile: ReviewProfile): ReviewResult {
  const e = profile.evidence ?? {};
  const findings: ReviewFinding[] = [];
  const strengths: string[] = [];
  const riskTier = inferRiskTier(profile);

  const add = (f: ReviewFinding) => findings.push(f);
  const strength = (s: string) => strengths.push(s);

  // ── Universal analytical expectations ──────────────────────────────────────
  if (!has(e, 'analyticalPrecision')) {
    add({ severity: 'major', area: 'Analytical — precision', finding: 'No precision/reproducibility study (CLSI EP05) provided.', recommendation: 'Provide within-lab and (multi-site) reproducibility at levels bracketing the decision points.', knowledgeRef: 'sci.ivd.precision' });
  } else strength('Precision/reproducibility (EP05) established.');

  if (!has(e, 'detectionCapability') && profile.assayType !== 'ihc') {
    add({ severity: 'major', area: 'Analytical — detection capability', finding: 'LoB/LoD/LoQ (CLSI EP17) not established.', recommendation: 'Establish detection capability in the clinical matrix across lots/days/instruments.', knowledgeRef: 'sci.ivd.detection-capability' });
  } else if (profile.assayType !== 'ihc') strength('Detection capability (LoB/LoD/LoQ, EP17) established.');

  if (!has(e, 'interference')) {
    add({ severity: 'deficiency', area: 'Analytical — specificity', finding: 'Interference/cross-reactivity testing (CLSI EP07) not demonstrated.', recommendation: 'Test endogenous/exogenous interferents at clinically relevant levels; add format-specific interferents (biotin/HAMA for immunoassays).', knowledgeRef: 'sci.ivd.interference' });
  } else strength('Analytical specificity / interference (EP07) addressed.');

  if (!has(e, 'stability')) {
    add({ severity: 'deficiency', area: 'Analytical — stability', finding: 'Stability claims (shelf-life/in-use/specimen) not supported by real-time data.', recommendation: 'Provide real-time stability for the marketed claim (accelerated is supportive only).', knowledgeRef: 'sci.ivd.stability' });
  } else strength('Stability claims supported by real-time data.');

  if (profile.assayType === 'quantitative' && !has(e, 'traceability')) {
    add({ severity: 'deficiency', area: 'Analytical — traceability', finding: 'Metrological traceability of calibrators (ISO 17511) and commutability not documented.', recommendation: 'Document the calibration hierarchy, uncertainty budget, and reference-material commutability.', knowledgeRef: 'sci.ivd.traceability' });
  } else if (profile.assayType === 'quantitative') strength('Metrological traceability (ISO 17511) documented.');

  // ── Cut-off / qualitative ──────────────────────────────────────────────────
  if ((profile.assayType === 'qualitative' || profile.assayType === 'ihc') && !has(e, 'cutoffValidation')) {
    add({ severity: 'major', area: 'Clinical — cut-off', finding: 'Clinical decision point (cut-off) not validated on an independent set.', recommendation: 'Pre-specify the cut-off and confirm its sensitivity/specificity on an independent dataset.', knowledgeRef: 'sci.ivd.roc-cutoff' });
  }

  // ── Scientific validity + clinical performance ─────────────────────────────
  if (!has(e, 'scientificValidity')) {
    const biomarker = profile.biomarker ? lookupBiomarkerValidity(profile.biomarker) : { recognized: false };
    add({
      severity: biomarker.recognized ? 'minor' : 'major',
      area: 'Scientific validity',
      finding: biomarker.recognized ? 'Scientific-validity report not explicitly assembled (the biomarker is, however, well established).' : 'Scientific validity (analyte–condition association) not established.',
      recommendation: biomarker.recognized ? 'Compile the existing guideline/literature evidence into a scientific-validity report and cite it.' : 'Assemble primary evidence (guidelines/systematic review/studies) for the analyte–condition association.',
      knowledgeRef: 'sci.ivd.scientific-validity',
    });
  } else strength('Scientific validity (analyte–condition association) documented.');

  if (!has(e, 'clinicalPerformance') && profile.intendedUse !== 'aid_to_diagnosis') {
    add({ severity: 'major', area: 'Clinical performance', finding: 'Clinical performance (sensitivity/specificity/PPV/NPV in the intended-use population) not demonstrated.', recommendation: 'Conduct a clinical performance study in the intended-use population with bias controls (STARD/ISO 20916).', knowledgeRef: 'sci.ivd.clinical-performance-metrics' });
  } else if (profile.intendedUse !== 'aid_to_diagnosis') strength('Clinical performance demonstrated in the intended-use population.');

  // ── Pathway-specific ───────────────────────────────────────────────────────
  if (profile.pathway === '510k' && !has(e, 'intendedUseMatchesPredicate')) {
    add({ severity: 'major', area: 'Substantial equivalence', finding: 'Intended-use alignment with the predicate is not established (intended-use drift risk).', recommendation: 'Demonstrate same intended use as the predicate, or address the new question of safety/effectiveness with data.', knowledgeRef: 'fda.ivd.510k-pathway' });
  }
  if (profile.pathway === 'eu_ivdr' && !has(e, 'pmpfPlan')) {
    add({ severity: 'deficiency', area: 'Post-market (IVDR)', finding: 'Post-market performance follow-up (PMPF) plan absent (Annex XIII Part B).', recommendation: 'Provide a PMPF plan or a documented justification for not performing PMPF.', knowledgeRef: 'eu.ivdr.pms-pmpf' });
  }
  if (profile.pathway === 'de_novo') {
    if (!has(e, 'specialControlsProposed')) {
      add({ severity: 'major', area: 'De Novo — special controls', finding: 'Proposed special controls (the risk mitigations defining the new device type) not articulated.', recommendation: 'Propose special controls mapped to the device-type risks; you are effectively drafting the classification regulation.', knowledgeRef: 'fda.ivd.de-novo' });
    } else strength('Special controls proposed for the new device type.');
    if (!has(e, 'benefitRiskAnalysis')) {
      add({ severity: 'deficiency', area: 'De Novo — benefit-risk', finding: 'Benefit-risk determination not provided.', recommendation: 'Provide a benefit-risk analysis supporting down-classification to Class I/II.', knowledgeRef: 'fda.ivd.de-novo' });
    }
  }
  if (profile.pathway === 'pma') {
    if (!has(e, 'manufacturingProcessValidation')) {
      add({ severity: 'major', area: 'PMA — manufacturing (QS)', finding: 'Manufacturing/process-validation (QS) information for the PMA manufacturing section not provided.', recommendation: 'Provide the QS manufacturing section; anticipate a pre-approval establishment inspection.', knowledgeRef: 'fda.ivd.pma' });
    } else strength('PMA manufacturing/QS section provided.');
    if (!has(e, 'benefitRiskAnalysis')) {
      add({ severity: 'major', area: 'PMA — benefit-risk', finding: 'Independent safety/effectiveness benefit-risk determination not provided.', recommendation: 'Provide valid scientific evidence supporting an independent benefit-risk determination (not predicate comparison).', knowledgeRef: 'fda.ivd.pma' });
    }
  }
  if (profile.intendedUse === 'cdx') {
    add({ severity: 'info', area: 'Companion diagnostic', finding: 'CDx requires contemporaneous drug+Dx review (US) / notified-body medicines-authority or EMA consultation (EU).', recommendation: 'Coordinate the Dx timeline with the therapeutic; plan the bridging study if a clinical-trial assay was used.', knowledgeRef: 'fda.ivd.cdx' });
  }
  // EU IVDR Class-D-type (transmissible agent / blood screening / highest risk) expectation.
  if (profile.pathway === 'eu_ivdr' && riskTier === 'highest' && !has(e, 'euReferenceLabReady')) {
    add({ severity: 'deficiency', area: 'IVDR — EU reference laboratory', finding: 'EU reference-laboratory performance/batch verification not addressed (expected for the highest-risk class).', recommendation: 'Engage the relevant EU reference laboratory for performance verification/batch testing.', knowledgeRef: 'eu.ivdr.notified-bodies' });
  }
  // QMS expectation for any submission with a quality dimension.
  if ((profile.pathway === 'pma' || profile.pathway === 'eu_ivdr') && has(e, 'qmsCertified')) {
    strength('ISO 13485 / QMS certification in place.');
  }

  // ── Software / NGS ─────────────────────────────────────────────────────────
  if ((profile.hasSoftware || profile.assayType === 'ngs') && !has(e, 'softwareValidation')) {
    add({ severity: 'deficiency', area: 'Software lifecycle', finding: 'Software lifecycle documentation (IEC 62304) not provided for the software component.', recommendation: 'Provide SDLC documentation commensurate with the software safety class.', knowledgeRef: 'std.iec-62304' });
  }
  if ((profile.hasSoftware || profile.assayType === 'ngs') && !has(e, 'cybersecurity')) {
    add({ severity: 'deficiency', area: 'Cybersecurity', finding: 'Premarket cybersecurity documentation (threat model/SBOM/vulnerability management) not provided.', recommendation: 'Provide the SPDF cybersecurity package (threat model, SBOM, vulnerability management plan).', knowledgeRef: 'ai.fda-aiml' });
  }
  if (profile.assayType === 'ngs' && !has(e, 'bioinformaticsValidation')) {
    add({ severity: 'major', area: 'Bioinformatics', finding: 'Bioinformatics pipeline not validated/version-controlled as part of the assay.', recommendation: 'Validate the pipeline per variant class with reference materials and change control.', knowledgeRef: 'sci.ngs.bioinformatics' });
  }

  // ── Tally + scoring + verdict ──────────────────────────────────────────────
  const counts: Record<FindingSeverity, number> = { major: 0, deficiency: 0, minor: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;

  // Readiness score: 100 minus severity-weighted penalty, tier-amplified.
  const tierMultiplier = riskTier === 'highest' ? 1.3 : riskTier === 'elevated' ? 1.15 : 1;
  const penalty = findings.reduce((s, f) => s + SEVERITY_WEIGHT[f.severity], 0) * tierMultiplier;
  const readinessScore = Math.max(0, Math.min(100, Math.round(100 - penalty)));

  // Estimated review cycles: each batch of unresolved majors/deficiencies tends
  // to generate an additional-information round.
  const estimatedReviewCycles = 1 + (counts.major > 0 ? 1 : 0) + Math.min(2, Math.ceil(counts.deficiency / 3));

  // Remediation roadmap: majors first, then deficiencies, then minors.
  const order: FindingSeverity[] = ['major', 'deficiency', 'minor', 'info'];
  const remediationRoadmap: RemediationStep[] = findings
    .filter(f => f.severity !== 'info')
    .sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))
    .map((f, i) => ({ priority: i + 1, severity: f.severity, area: f.area, action: f.recommendation }));

  let verdict: ReviewResult['verdict'];
  if (counts.major > 0) verdict = 'not_substantially_complete';
  else if (counts.deficiency > 0) verdict = 'additional_information_likely';
  else verdict = 'likely_acceptance';

  const refIds = new Set(findings.map(f => f.knowledgeRef));
  const citations = [...refIds]
    .map(id => {
      const e2 = getEntry(id);
      return e2 ? { id: e2.id, title: e2.title, citations: e2.citations } : null;
    })
    .filter((x): x is { id: string; title: string; citations: Citation[] } => x !== null);

  return { pathway: profile.pathway, riskTier, findings, strengths, counts, readinessScore, estimatedReviewCycles, remediationRoadmap, verdict, citations };
}
