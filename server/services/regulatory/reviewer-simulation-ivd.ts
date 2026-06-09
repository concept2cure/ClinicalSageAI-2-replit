/**
 * IVD reviewer simulation — mock FDA / notified-body deficiency engine.
 *
 * Given a submission profile (pathway, assay type, intended use, biomarker, and
 * which evidence elements are present), this generates the deficiencies and
 * questions a reviewer is likely to raise, each grounded in a knowledge-base
 * entry. It encodes the recurring deficiency patterns that sink IVD submissions
 * and is the "adversarial review" companion to the study-design engine.
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
}

export interface ReviewProfile {
  pathway: ReviewPathway;
  assayType: ReviewAssayType;
  intendedUse: ReviewIntendedUse;
  biomarker?: string;
  hasSoftware?: boolean;
  evidence?: EvidencePresence;
}

export type FindingSeverity = 'major' | 'deficiency' | 'minor' | 'info';

export interface ReviewFinding {
  severity: FindingSeverity;
  area: string;
  finding: string;
  recommendation: string;
  knowledgeRef: string;
}

export interface ReviewResult {
  pathway: ReviewPathway;
  findings: ReviewFinding[];
  counts: Record<FindingSeverity, number>;
  /** Likely outcome if submitted as-is. */
  verdict: 'likely_acceptance' | 'additional_information_likely' | 'not_substantially_complete';
  citations: { id: string; title: string; citations: Citation[] }[];
}

function has(e: EvidencePresence | undefined, k: keyof EvidencePresence): boolean {
  return e?.[k] === true;
}

/** Simulate a regulatory review and surface likely deficiencies. */
export function simulateIvdReview(profile: ReviewProfile): ReviewResult {
  const e = profile.evidence ?? {};
  const findings: ReviewFinding[] = [];

  // ── Universal analytical expectations ──────────────────────────────────────
  if (!has(e, 'analyticalPrecision')) {
    findings.push({
      severity: 'major', area: 'Analytical — precision',
      finding: 'No precision/reproducibility study (CLSI EP05) provided.',
      recommendation: 'Provide within-lab and (multi-site) reproducibility at levels bracketing the decision points.',
      knowledgeRef: 'sci.ivd.precision',
    });
  }
  if (!has(e, 'detectionCapability') && profile.assayType !== 'ihc') {
    findings.push({
      severity: 'major', area: 'Analytical — detection capability',
      finding: 'LoB/LoD/LoQ (CLSI EP17) not established.',
      recommendation: 'Establish detection capability in the clinical matrix across lots/days/instruments.',
      knowledgeRef: 'sci.ivd.detection-capability',
    });
  }
  if (!has(e, 'interference')) {
    findings.push({
      severity: 'deficiency', area: 'Analytical — specificity',
      finding: 'Interference/cross-reactivity testing (CLSI EP07) not demonstrated.',
      recommendation: 'Test endogenous/exogenous interferents at clinically relevant levels; add format-specific interferents (biotin/HAMA for immunoassays).',
      knowledgeRef: 'sci.ivd.interference',
    });
  }
  if (!has(e, 'stability')) {
    findings.push({
      severity: 'deficiency', area: 'Analytical — stability',
      finding: 'Stability claims (shelf-life/in-use/specimen) not supported by real-time data.',
      recommendation: 'Provide real-time stability for the marketed claim (accelerated is supportive only).',
      knowledgeRef: 'sci.ivd.stability',
    });
  }
  if (profile.assayType === 'quantitative' && !has(e, 'traceability')) {
    findings.push({
      severity: 'deficiency', area: 'Analytical — traceability',
      finding: 'Metrological traceability of calibrators (ISO 17511) and commutability not documented.',
      recommendation: 'Document the calibration hierarchy, uncertainty budget, and reference-material commutability.',
      knowledgeRef: 'sci.ivd.traceability',
    });
  }

  // ── Cut-off / qualitative ──────────────────────────────────────────────────
  if ((profile.assayType === 'qualitative' || profile.assayType === 'ihc') && !has(e, 'cutoffValidation')) {
    findings.push({
      severity: 'major', area: 'Clinical — cut-off',
      finding: 'Clinical decision point (cut-off) not validated on an independent set.',
      recommendation: 'Pre-specify the cut-off and confirm its sensitivity/specificity on an independent dataset.',
      knowledgeRef: 'sci.ivd.roc-cutoff',
    });
  }

  // ── Scientific validity + clinical performance ─────────────────────────────
  if (!has(e, 'scientificValidity')) {
    const biomarker = profile.biomarker ? lookupBiomarkerValidity(profile.biomarker) : { recognized: false };
    findings.push({
      severity: biomarker.recognized ? 'minor' : 'major',
      area: 'Scientific validity',
      finding: biomarker.recognized
        ? 'Scientific-validity report not explicitly assembled (the biomarker is, however, well established).'
        : 'Scientific validity (analyte–condition association) not established.',
      recommendation: biomarker.recognized
        ? 'Compile the existing guideline/literature evidence into a scientific-validity report and cite it.'
        : 'Assemble primary evidence (guidelines/systematic review/studies) for the analyte–condition association.',
      knowledgeRef: 'sci.ivd.scientific-validity',
    });
  }
  if (!has(e, 'clinicalPerformance') && profile.intendedUse !== 'aid_to_diagnosis') {
    findings.push({
      severity: 'major', area: 'Clinical performance',
      finding: 'Clinical performance (sensitivity/specificity/PPV/NPV in the intended-use population) not demonstrated.',
      recommendation: 'Conduct a clinical performance study in the intended-use population with bias controls (STARD/ISO 20916).',
      knowledgeRef: 'sci.ivd.clinical-performance-metrics',
    });
  }

  // ── Pathway-specific ───────────────────────────────────────────────────────
  if (profile.pathway === '510k' && !has(e, 'intendedUseMatchesPredicate')) {
    findings.push({
      severity: 'major', area: 'Substantial equivalence',
      finding: 'Intended-use alignment with the predicate is not established (intended-use drift risk).',
      recommendation: 'Demonstrate same intended use as the predicate, or address the new question of safety/effectiveness with data.',
      knowledgeRef: 'fda.ivd.510k-pathway',
    });
  }
  if (profile.pathway === 'eu_ivdr' && !has(e, 'pmpfPlan')) {
    findings.push({
      severity: 'deficiency', area: 'Post-market (IVDR)',
      finding: 'Post-market performance follow-up (PMPF) plan absent (Annex XIII Part B).',
      recommendation: 'Provide a PMPF plan or a documented justification for not performing PMPF.',
      knowledgeRef: 'eu.ivdr.pms-pmpf',
    });
  }
  if (profile.intendedUse === 'cdx') {
    findings.push({
      severity: 'info', area: 'Companion diagnostic',
      finding: 'CDx requires contemporaneous drug+Dx review (US) / notified-body medicines-authority or EMA consultation (EU).',
      recommendation: 'Coordinate the Dx timeline with the therapeutic; plan the bridging study if a clinical-trial assay was used.',
      knowledgeRef: 'fda.ivd.cdx',
    });
  }

  // ── Software / NGS ─────────────────────────────────────────────────────────
  if ((profile.hasSoftware || profile.assayType === 'ngs') && !has(e, 'softwareValidation')) {
    findings.push({
      severity: 'deficiency', area: 'Software lifecycle',
      finding: 'Software lifecycle documentation (IEC 62304) not provided for the software component.',
      recommendation: 'Provide SDLC documentation commensurate with the software safety class.',
      knowledgeRef: 'std.iec-62304',
    });
  }
  if ((profile.hasSoftware || profile.assayType === 'ngs') && !has(e, 'cybersecurity')) {
    findings.push({
      severity: 'deficiency', area: 'Cybersecurity',
      finding: 'Premarket cybersecurity documentation (threat model/SBOM/vulnerability management) not provided.',
      recommendation: 'Provide the SPDF cybersecurity package (threat model, SBOM, vulnerability management plan).',
      knowledgeRef: 'ai.fda-aiml',
    });
  }
  if (profile.assayType === 'ngs' && !has(e, 'bioinformaticsValidation')) {
    findings.push({
      severity: 'major', area: 'Bioinformatics',
      finding: 'Bioinformatics pipeline not validated/version-controlled as part of the assay.',
      recommendation: 'Validate the pipeline per variant class with reference materials and change control.',
      knowledgeRef: 'sci.ngs.bioinformatics',
    });
  }

  // ── Tally + verdict ────────────────────────────────────────────────────────
  const counts: Record<FindingSeverity, number> = { major: 0, deficiency: 0, minor: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;

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

  return { pathway: profile.pathway, findings, counts, verdict, citations };
}
