import { build510kPyramid } from './pyramids/510k-pyramid';
import { buildIndPyramid } from './pyramids/ind-pyramid';
import { buildNdaPyramid } from './pyramids/nda-pyramid';
import { buildBlaPyramid } from './pyramids/bla-pyramid';
import { buildPmaPyramid } from './pyramids/pma-pyramid';
import { buildMaaPyramid } from './pyramids/maa-pyramid';
import { buildJndaPyramid } from './pyramids/jnda-pyramid';
import { buildDeNovoPyramid } from './pyramids/de-novo-pyramid';

export type SubmissionType = '510K' | 'IND' | 'NDA' | 'BLA' | 'PMA' | 'MAA' | 'JNDA' | 'DE_NOVO';
export type TaskStatus = 'todo' | 'in-progress' | 'review' | 'done' | 'blocked';

export type PyramidTask = {
  id: string;
  name: string;
  phaseId: string;
  dependencies: string[];
  estimatedHours: number;
  role?: string;
  critical?: boolean;
  description?: string;
};

export type PyramidPhase = {
  id: string;
  name: string;
  order: number;
  tasks: PyramidTask[];
};

export type SubmissionPyramid = {
  type: SubmissionType;
  phases: PyramidPhase[];
  tasks: PyramidTask[];
};

export type TaskProgress = {
  taskId: string;
  status: TaskStatus;
};

export type ProgressSummary = {
  total: number;
  completed: number;
  percentComplete: number;
  perPhase: Record<string, { total: number; completed: number; percentComplete: number }>;
};

export function getPyramidForProject(type: SubmissionType): SubmissionPyramid {
  switch (type) {
    case '510K':
      return build510kPyramid();
    case 'IND':
      return buildIndPyramid();
    case 'NDA':
      return buildNdaPyramid();
    case 'BLA':
      return buildBlaPyramid();
    case 'PMA':
      return buildPmaPyramid();
    case 'MAA':
      return buildMaaPyramid();
    case 'JNDA':
      return buildJndaPyramid();
    case 'DE_NOVO':
      return buildDeNovoPyramid();
    default:
      throw new Error(`Unsupported submission type: ${type}`);
  }
}

export function calculateProgress(
  pyramid: SubmissionPyramid,
  taskProgress: TaskProgress[]
): ProgressSummary {
  const statusMap = new Map(taskProgress.map(entry => [entry.taskId, entry.status]));
  const total = pyramid.tasks.length;
  let completed = 0;
  const perPhase: ProgressSummary['perPhase'] = {};

  for (const phase of pyramid.phases) {
    const phaseTotal = phase.tasks.length;
    let phaseCompleted = 0;

    for (const task of phase.tasks) {
      if (statusMap.get(task.id) === 'done') {
        completed += 1;
        phaseCompleted += 1;
      }
    }

    perPhase[phase.id] = {
      total: phaseTotal,
      completed: phaseCompleted,
      percentComplete: phaseTotal === 0 ? 0 : Math.round((phaseCompleted / phaseTotal) * 100),
    };
  }

  return {
    total,
    completed,
    percentComplete: total === 0 ? 0 : Math.round((completed / total) * 100),
    perPhase,
  };
}

export function getNextAvailableTasks(
  pyramid: SubmissionPyramid,
  taskProgress: TaskProgress[]
): PyramidTask[] {
  const statusMap = new Map(taskProgress.map(entry => [entry.taskId, entry.status]));
  const completed = new Set(
    taskProgress.filter(entry => entry.status === 'done').map(entry => entry.taskId)
  );

  return pyramid.tasks.filter(task => {
    const status = statusMap.get(task.id) ?? 'todo';
    if (status === 'done' || status === 'blocked') {
      return false;
    }
    return task.dependencies.every(dep => completed.has(dep));
  });
}

export function getCriticalPath(pyramid: SubmissionPyramid, taskProgress: TaskProgress[]): PyramidTask[] {
  const statusMap = new Map(taskProgress.map(entry => [entry.taskId, entry.status]));
  const criticalTasks = pyramid.tasks.filter(task => task.critical);
  const activeCritical = criticalTasks.filter(task => statusMap.get(task.id) !== 'done');

  if (activeCritical.length > 0) {
    return activeCritical;
  }

  return pyramid.tasks
    .filter(task => statusMap.get(task.id) !== 'done')
    .sort((a, b) => (b.estimatedHours || 0) - (a.estimatedHours || 0));
}
