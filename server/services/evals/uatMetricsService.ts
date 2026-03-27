export interface HumanUatSession {
  session_id: string;
  stage: 'beta' | 'ga';
  user_role: string;
  tasks_attempted: number;
  tasks_passed: number;
  citation_trust_score: number;
  critical_defects_found: number;
  notes?: string;
}

export interface HumanUatMetrics {
  sessionsTotal: number;
  betaSessions: number;
  gaSessions: number;
  coreTaskSuccessRate: number;
  citationTrustMean: number;
  criticalDefectsOpen: number;
}

export function computeHumanUatMetrics(sessions: HumanUatSession[]): HumanUatMetrics {
  const totals = sessions.reduce(
    (acc, s) => {
      acc.sessionsTotal += 1;
      if (s.stage === 'beta') acc.betaSessions += 1;
      if (s.stage === 'ga') acc.gaSessions += 1;
      acc.tasksAttempted += Math.max(0, Number(s.tasks_attempted || 0));
      acc.tasksPassed += Math.max(0, Number(s.tasks_passed || 0));
      acc.trustSum += Number(s.citation_trust_score || 0);
      acc.criticalDefects += Math.max(0, Number(s.critical_defects_found || 0));
      return acc;
    },
    {
      sessionsTotal: 0,
      betaSessions: 0,
      gaSessions: 0,
      tasksAttempted: 0,
      tasksPassed: 0,
      trustSum: 0,
      criticalDefects: 0,
    }
  );

  const coreTaskSuccessRate =
    totals.tasksAttempted > 0 ? totals.tasksPassed / totals.tasksAttempted : 0;
  const citationTrustMean =
    totals.sessionsTotal > 0 ? totals.trustSum / totals.sessionsTotal : 0;

  return {
    sessionsTotal: totals.sessionsTotal,
    betaSessions: totals.betaSessions,
    gaSessions: totals.gaSessions,
    coreTaskSuccessRate,
    citationTrustMean,
    criticalDefectsOpen: totals.criticalDefects,
  };
}
