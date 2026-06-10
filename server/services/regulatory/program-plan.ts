/**
 * IVD program-plan orchestrator.
 *
 * Chains the IVD engines into one executive output: classification → (CDx
 * pairing) → study-program design → reviewer simulation (readiness) → evidence
 * sensitivity/ROI → time-to-market Monte-Carlo. Produces an executive summary
 * (class, readiness, timeline, cost, top next actions) plus the full component
 * results and an aggregated citation set.
 *
 * Deterministic except for the (seeded) time-to-market Monte-Carlo.
 */

import {
  classifyIvdrAnnexVIII,
  type IvdrClassificationInput,
  type IvdrClassificationResult,
} from './ivdr-classification';
import { pairCompanionDiagnostic, type CdxPairingResult } from './cdx-pairing';
import type { CdxElement } from './companion-diagnostics';
import { designIvdStudyProgram, type StudyDesignResult, type AssayType, type IvdIntendedUse, type SpecimenType } from './cdx-study-design';
import {
  simulateIvdReview,
  type ReviewResult,
  type ReviewPathway,
  type ReviewAssayType,
  type EvidencePresence,
} from './reviewer-simulation-ivd';
import { sensitivityAnalysis, type SensitivityAnalysisResult } from './decision-analytics';
import { timeToMarketMonteCarlo, type TimeToMarketResult } from '../stats/monte-carlo';
import { getEntry } from '../ivd-knowledge/knowledge.service';
import type { Citation } from '../ivd-knowledge/types';

export interface ProgramPlanInput {
  deviceName?: string;
  pathway: ReviewPathway;
  assayType: ReviewAssayType;
  intendedUse: ReviewIntendedUse;
  specimen?: SpecimenType;
  biomarker?: string;
  hasSoftware?: boolean;
  evidence?: EvidencePresence;
  /** Optional explicit IVDR Annex VIII inputs; otherwise derived from the profile. */
  classification?: Partial<IvdrClassificationInput>;
  /** Monte-Carlo seed for the time-to-market projection. */
  seed?: number;
}

type ReviewIntendedUse = IvdIntendedUse;

export interface NextAction {
  label: string;
  readinessGain: number;
  effortWeeks: number;
  costUsd: number;
  removesMajor: boolean;
}

export interface ProgramPlanExecutiveSummary {
  ivdrClass: string;
  ivdrConfidence: string;
  notifiedBodyRequired: boolean;
  fdaPathway: string;
  cdxReadinessScore?: number;
  readinessScore: number;
  verdict: string;
  riskTier: string;
  estimatedCalendarWeeksP50: number;
  estimatedCalendarWeeksP90: number;
  totalRemainingCostUsd: number;
  topNextActions: NextAction[];
}

export interface ProgramPlan {
  device: string;
  executiveSummary: ProgramPlanExecutiveSummary;
  classification: IvdrClassificationResult;
  cdx?: CdxPairingResult;
  studyProgram: StudyDesignResult;
  review: ReviewResult;
  sensitivity: SensitivityAnalysisResult;
  timeToMarket: TimeToMarketResult;
  citations: { id: string; title: string; citations: Citation[] }[];
}

/** Build the full IVD program plan from a single device/assay profile. */
export function buildProgramPlan(input: ProgramPlanInput): ProgramPlan {
  const device = input.deviceName ?? 'IVD assay';

  // 1) Classification (derive Annex VIII inputs from the profile + overrides).
  const classification = classifyIvdrAnnexVIII({
    deviceName: device,
    intendedPurpose: input.classification?.intendedPurpose ?? device,
    isCompanionDiagnostic: input.classification?.isCompanionDiagnostic ?? (input.intendedUse === 'cdx'),
    detectsCancer: input.classification?.detectsCancer,
    isGeneticTest: input.classification?.isGeneticTest ?? (input.assayType === 'ngs'),
    prenatalScreening: input.classification?.prenatalScreening,
    detectsTransmissibleAgent: input.classification?.detectsTransmissibleAgent,
    bloodScreening: input.classification?.bloodScreening,
    isSelfTest: input.classification?.isSelfTest,
    isNearPatient: input.classification?.isNearPatient,
    riskToPatient: input.classification?.riskToPatient,
    analytes: input.classification?.analytes ?? [],
  });

  // 2) CDx pairing (only when relevant).
  const cdx = input.intendedUse === 'cdx' && input.biomarker
    ? pairCompanionDiagnostic({ biomarker: input.biomarker, elements: input.evidence ? mapEvidenceToCdx(input.evidence) : undefined })
    : undefined;

  // 3) Study program.
  const studyProgram = designIvdStudyProgram({
    assayType: input.assayType as AssayType,
    intendedUse: input.intendedUse,
    specimen: input.specimen,
    biomarker: input.biomarker,
    euIvdr: input.pathway === 'eu_ivdr',
  });

  // 4) Reviewer simulation + 5) sensitivity.
  const reviewProfile = {
    pathway: input.pathway,
    assayType: input.assayType,
    intendedUse: input.intendedUse,
    biomarker: input.biomarker,
    hasSoftware: input.hasSoftware,
    evidence: input.evidence,
  };
  const review = simulateIvdReview(reviewProfile);
  const sensitivity = sensitivityAnalysis(reviewProfile);

  // 6) Time-to-market from the sequenced study phases.
  const timeToMarket = timeToMarketMonteCarlo({
    phases: studyProgram.sequencedPhases.map(p => ({
      name: p.name,
      studyWeeks: p.studies.map(s => s.estimatedEffortWeeks ?? 3),
    })),
    seed: input.seed,
  });

  const topNextActions: NextAction[] = sensitivity.tornado
    .filter(i => i.readinessGain > 0)
    .slice(0, 3)
    .map(i => ({ label: i.label, readinessGain: i.readinessGain, effortWeeks: i.effortWeeks, costUsd: i.costUsd, removesMajor: i.removesMajor }));

  const executiveSummary: ProgramPlanExecutiveSummary = {
    ivdrClass: classification.classification,
    ivdrConfidence: classification.confidence,
    notifiedBodyRequired: classification.notifiedBodyRequired,
    fdaPathway: classification.fdaEquivalentPathway,
    cdxReadinessScore: cdx?.readinessScore,
    readinessScore: review.readinessScore,
    verdict: review.verdict,
    riskTier: review.riskTier,
    estimatedCalendarWeeksP50: timeToMarket.p50Weeks,
    estimatedCalendarWeeksP90: timeToMarket.p90Weeks,
    totalRemainingCostUsd: sensitivity.totalRemainingCostUsd,
    topNextActions,
  };

  // Aggregate unique citations from every component.
  const refIds = new Set<string>([
    ...classification.knowledgeRefs,
    ...(cdx?.knowledgeRefs ?? []),
    ...studyProgram.citations.map(c => c.id),
    ...review.citations.map(c => c.id),
  ]);
  const citations = [...refIds]
    .map(id => {
      const e = getEntry(id);
      return e ? { id: e.id, title: e.title, citations: e.citations } : null;
    })
    .filter((x): x is { id: string; title: string; citations: Citation[] } => x !== null);

  return { device, executiveSummary, classification, cdx, studyProgram, review, sensitivity, timeToMarket, citations };
}

export interface ScenarioInput {
  name: string;
  input: ProgramPlanInput;
}

export interface ScenarioSummary {
  name: string;
  ivdrClass: string;
  readinessScore: number;
  verdict: string;
  estimatedCalendarWeeksP50: number;
  totalRemainingCostUsd: number;
  /** Composite desirability: readiness up, time + cost down (higher is better). */
  compositeScore: number;
}

export interface ScenarioComparisonResult {
  scenarios: ScenarioSummary[];
  /** Scenarios ranked best-first by composite score. */
  ranked: ScenarioSummary[];
  recommended: ScenarioSummary | null;
}

/**
 * Run several candidate program plans (what-if scenarios) and rank them by a
 * composite of readiness (↑), time-to-market (↓), and cost (↓).
 */
export function compareProgramScenarios(scenarios: ScenarioInput[]): ScenarioComparisonResult {
  const summaries: ScenarioSummary[] = scenarios.map(s => {
    const plan = buildProgramPlan(s.input);
    const es = plan.executiveSummary;
    // Composite: readiness points minus a time penalty (weeks/4) and a cost
    // penalty ($ per $100k), so 1 readiness point ≈ 4 weeks ≈ $100k.
    const compositeScore = Math.round(
      es.readinessScore - es.estimatedCalendarWeeksP50 / 4 - es.totalRemainingCostUsd / 100000
    );
    return {
      name: s.name,
      ivdrClass: es.ivdrClass,
      readinessScore: es.readinessScore,
      verdict: es.verdict,
      estimatedCalendarWeeksP50: es.estimatedCalendarWeeksP50,
      totalRemainingCostUsd: es.totalRemainingCostUsd,
      compositeScore,
    };
  });
  const ranked = [...summaries].sort((a, b) => b.compositeScore - a.compositeScore);
  return { scenarios: summaries, ranked, recommended: ranked[0] ?? null };
}

/** Map reviewer evidence flags to the CDx co-development element names. */
function mapEvidenceToCdx(e: EvidencePresence): Partial<Record<CdxElement, boolean>> {
  return {
    diagnosticDeviceIdentified: true,
    analyticalValidation: !!(e.analyticalPrecision && e.detectionCapability),
    clinicalValidation: !!e.clinicalPerformance,
    intendedUseAlignment: !!e.intendedUseMatchesPredicate,
  };
}
