export function readinessScore(params: {
  errors: number;
  warnings: number;
  overdueCriticalPath: number;
  highRisks: number;
}) {
  const W_ERROR = 2.5;
  const W_WARN = 1.0;
  const W_OVERDUE = 3.0;
  const W_RISK = 2.0;

  const penalty =
    params.errors * W_ERROR +
    params.warnings * W_WARN +
    params.overdueCriticalPath * W_OVERDUE +
    params.highRisks * W_RISK;

  const raw = 100 - Math.min(100, penalty);
  return Math.max(0, Math.round(raw));
}
