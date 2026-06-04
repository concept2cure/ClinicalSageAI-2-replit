import { describe, it, expect } from 'vitest';
import {
  calculateProgress,
  getCriticalPath,
  getNextAvailableTasks,
  getPyramidForProject,
  type TaskProgress,
} from '../../../services/regulatory/SubmissionPyramidEngine';

describe('SubmissionPyramidEngine', () => {
  const types = ['510K', 'IND', 'NDA', 'BLA', 'PMA', 'MAA', 'JNDA', 'DE_NOVO'] as const;

  it('builds pyramids for all supported submission types', () => {
    for (const type of types) {
      const pyramid = getPyramidForProject(type);
      expect(pyramid.type).toBe(type);
      expect(pyramid.phases.length).toBeGreaterThan(0);
      expect(pyramid.tasks.length).toBeGreaterThan(0);
    }
  });

  it('calculates progress correctly', () => {
    const pyramid = getPyramidForProject('510K');
    const completed = pyramid.tasks.slice(0, 5);
    const progress: TaskProgress[] = completed.map(task => ({
      taskId: task.id,
      status: 'done',
    }));

    const summary = calculateProgress(pyramid, progress);
    expect(summary.total).toBe(pyramid.tasks.length);
    expect(summary.completed).toBe(5);
    expect(summary.percentComplete).toBeGreaterThan(0);
  });

  it('returns next available tasks based on dependencies', () => {
    const pyramid = getPyramidForProject('IND');
    const firstPhaseTasks = pyramid.phases[0].tasks;
    const completed: TaskProgress[] = firstPhaseTasks.map(task => ({
      taskId: task.id,
      status: 'done',
    }));

    const nextTasks = getNextAvailableTasks(pyramid, completed);
    expect(nextTasks.length).toBeGreaterThan(0);
    expect(nextTasks.every(task => task.dependencies.every(dep => completed.some(t => t.taskId === dep)))).toBe(true);
  });

  it('returns critical path tasks when present', () => {
    const pyramid = getPyramidForProject('PMA');
    const progress: TaskProgress[] = [];
    const critical = getCriticalPath(pyramid, progress);
    expect(critical.length).toBeGreaterThan(0);
    expect(critical.some(task => task.critical)).toBe(true);
  });
});
