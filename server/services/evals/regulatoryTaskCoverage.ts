export interface RegulatoryUatTask {
  id: string;
  domain: string;
  persona: string;
  workflow: string;
  description: string;
}

export interface CoverageSummary {
  taskCount: number;
  domainCoverage: Record<string, number>;
  personaCoverage: Record<string, number>;
}

export function summarizeRegulatoryTaskCoverage(tasks: RegulatoryUatTask[]): CoverageSummary {
  const domainCoverage: Record<string, number> = {};
  const personaCoverage: Record<string, number> = {};

  for (const task of tasks) {
    domainCoverage[task.domain] = (domainCoverage[task.domain] || 0) + 1;
    personaCoverage[task.persona] = (personaCoverage[task.persona] || 0) + 1;
  }

  return {
    taskCount: tasks.length,
    domainCoverage,
    personaCoverage,
  };
}
