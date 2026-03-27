import fs from 'node:fs';

export function readJsonOrThrow(file, label) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${label} file: ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function aggregateSessions(sessions) {
  const list = Array.isArray(sessions) ? sessions : [];

  let tasksAttempted = 0;
  let tasksPassed = 0;
  let trustSum = 0;
  let trustCount = 0;
  let criticalDefects = 0;
  let betaSessions = 0;
  let gaSessions = 0;

  for (const s of list) {
    tasksAttempted += Number(s.tasks_attempted || 0);
    tasksPassed += Number(s.tasks_passed || 0);
    if (typeof s.citation_trust_score === 'number') {
      trustSum += s.citation_trust_score;
      trustCount += 1;
    }
    criticalDefects += Number(s.critical_defects_found || 0);
    if (String(s.stage).toLowerCase() === 'beta') betaSessions += 1;
    if (String(s.stage).toLowerCase() === 'ga') gaSessions += 1;
  }

  return {
    sessions_total: list.length,
    beta_sessions: betaSessions,
    ga_sessions: gaSessions,
    core_task_success_rate: tasksAttempted > 0 ? Number((tasksPassed / tasksAttempted).toFixed(4)) : 0,
    citation_trust_mean: trustCount > 0 ? Number((trustSum / trustCount).toFixed(4)) : 0,
    critical_defects_open: criticalDefects,
  };
}

export function applyMetricsToScorecard(scorecard, metrics) {
  scorecard.human_testing = {
    ...(scorecard.human_testing || {}),
    beta_sessions_completed: metrics.beta_sessions,
    ga_sessions_completed: metrics.ga_sessions,
    critical_defects_open: metrics.critical_defects_open,
    core_task_success_rate: metrics.core_task_success_rate,
    citation_trust_mean: metrics.citation_trust_mean,
  };
  return scorecard;
}
