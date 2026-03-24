import { getKernelDecisionSummary, getRecentKernelDecisions } from './decision-log';
import { getPersistentKernelDecisionSummary } from './persistent-queries';

export interface AnaAuditReport {
  generatedAt: string;
  windowHours: number;
  persistenceEnabled: boolean;
  inMemorySummary: ReturnType<typeof getKernelDecisionSummary>;
  persistentSummary: Awaited<ReturnType<typeof getPersistentKernelDecisionSummary>>;
  controlCoverage: {
    uniqueRuleIdsObserved: number;
    tracesWithRegulatoryReferencePct: number;
  };
  riskSignals: {
    denyRatePct: number;
    reviewRatePct: number;
    persistentCoveragePct: number;
    scientificIntegrityFlagPct: number;
    highRiskMissingActorPct: number;
  };
  maturityScore: number;
  recommendations: string[];
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 10000) / 100;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export async function buildAnaAuditReport(windowHours = 24): Promise<AnaAuditReport> {
  const inMemorySummary = getKernelDecisionSummary();
  const persistentSummary = await getPersistentKernelDecisionSummary(windowHours);
  const persistenceEnabled = process.env.ANA_KERNEL_PERSIST === 'true';

  const reviewRatePct = pct(inMemorySummary.byFinalDecision.review, inMemorySummary.total);
  const denyRatePct = pct(inMemorySummary.byFinalDecision.deny, inMemorySummary.total);
  const persistentCoveragePct = pct(persistentSummary.total, inMemorySummary.total || persistentSummary.total);
  const recentEntries = getRecentKernelDecisions(500);
  const scientificIntegrityFlags = recentEntries.filter(e =>
    e.kernel.flags.includes('scientific_integrity_risk')
  ).length;
  const highRiskMissingActorFlags = recentEntries.filter(e =>
    e.kernel.flags.includes('high_risk_missing_actor_identity')
  ).length;
  const scientificIntegrityFlagPct = pct(scientificIntegrityFlags, recentEntries.length);
  const highRiskMissingActorPct = pct(highRiskMissingActorFlags, recentEntries.length);
  const uniqueRuleIdsObserved = new Set(
    recentEntries.flatMap(entry => entry.kernel.trace.map(step => step.ruleId))
  ).size;
  const traceCount = recentEntries.reduce((acc, entry) => acc + entry.kernel.trace.length, 0);
  const traceWithRefs = recentEntries.reduce(
    (acc, entry) =>
      acc + entry.kernel.trace.filter(step => (step.regulatoryReference || []).length > 0).length,
    0
  );
  const tracesWithRegulatoryReferencePct = pct(traceWithRefs, traceCount);

  let maturityScore = 55;
  const recommendations: string[] = [];

  if (persistenceEnabled && persistentSummary.total > 0) {
    maturityScore += 15;
  } else {
    recommendations.push('Enable persistent kernel sink and verify database writes in staging.');
  }

  if (reviewRatePct > 30) {
    recommendations.push('Review threshold/rules may be too sensitive; calibrate bias and identity rules.');
    maturityScore -= 10;
  } else {
    maturityScore += 8;
  }

  if (denyRatePct > 20) {
    recommendations.push('High deny rate detected; validate immutability route patterns and exemptions.');
    maturityScore -= 10;
  } else {
    maturityScore += 7;
  }

  if (inMemorySummary.total < 50) {
    recommendations.push('Insufficient decision sample size; gather 50+ requests before policy tuning.');
  }

  if (scientificIntegrityFlags > 0) {
    recommendations.push(
      'Scientific integrity risk signals detected; trigger Medical Writing QA and Regulatory Affairs escalation.'
    );
    maturityScore -= 12;
  }

  if (highRiskMissingActorFlags > 0) {
    recommendations.push(
      'High-risk regulatory routes received anonymous requests; enforce stronger auth on CER/510(k)/eCTD/CMC APIs.'
    );
    maturityScore -= 8;
  }

  return {
    generatedAt: new Date().toISOString(),
    windowHours,
    persistenceEnabled,
    inMemorySummary,
    persistentSummary,
    controlCoverage: {
      uniqueRuleIdsObserved,
      tracesWithRegulatoryReferencePct,
    },
    riskSignals: {
      denyRatePct,
      reviewRatePct,
      persistentCoveragePct,
      scientificIntegrityFlagPct,
      highRiskMissingActorPct,
    },
    maturityScore: clamp(maturityScore),
    recommendations,
  };
}
