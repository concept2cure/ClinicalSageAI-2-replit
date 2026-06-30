import { describe, it, expect } from 'vitest';
import {
  calculateProgress,
  getCriticalPath,
  getNextAvailableTasks,
  getPyramidForProject,
  getAllSupportedTypes,
  getRiskProfile,
  getResourceAllocation,
  getResourceBottlenecks,
  getDocumentCoverage,
  getCrossSubmissionDependencies,
  estimateTimeline,
  getGuidanceReferences,
  flattenWithSubTasks,
  getDeliverablesCatalog,
  type TaskProgress,
  type SubmissionType,
} from '../../../services/regulatory/SubmissionPyramidEngine';

describe('SubmissionPyramidEngine', () => {
  const coreTypes: SubmissionType[] = ['510K', 'IND', 'NDA', 'BLA', 'PMA', 'MAA', 'JNDA', 'DE_NOVO'];
  const indVariants: SubmissionType[] = ['IND_AMENDMENT', 'IND_ANNUAL_REPORT', 'IND_SAFETY_SUPPLEMENT'];
  const allTypes = [...coreTypes, ...indVariants];

  // ─── Pyramid Construction ──────────────────────────────────────────────────

  it('builds pyramids for all supported submission types', () => {
    for (const type of allTypes) {
      const pyramid = getPyramidForProject(type);
      expect(pyramid.type).toBe(type);
      expect(pyramid.phases.length).toBeGreaterThan(0);
      expect(pyramid.tasks.length).toBeGreaterThan(0);
    }
  });

  it('getAllSupportedTypes returns all 11 types', () => {
    const types = getAllSupportedTypes();
    expect(types).toHaveLength(11);
    for (const type of allTypes) {
      expect(types).toContain(type);
    }
  });

  it('throws for unsupported submission types', () => {
    expect(() => getPyramidForProject('INVALID' as SubmissionType)).toThrow('Unsupported submission type');
  });

  it('tasks reference valid phase IDs', () => {
    for (const type of allTypes) {
      const pyramid = getPyramidForProject(type);
      const phaseIds = new Set(pyramid.phases.map(p => p.id));
      for (const task of pyramid.tasks) {
        expect(phaseIds.has(task.phaseId)).toBe(true);
      }
    }
  });

  it('task dependencies reference existing task IDs', () => {
    for (const type of allTypes) {
      const pyramid = getPyramidForProject(type);
      const taskIds = new Set(pyramid.tasks.map(t => t.id));
      for (const task of pyramid.tasks) {
        for (const dep of task.dependencies) {
          expect(taskIds.has(dep)).toBe(true);
        }
      }
    }
  });

  // ─── IND Variant Pyramids ─────────────────────────────────────────────────

  it('IND_AMENDMENT pyramid has expected structure', () => {
    const pyramid = getPyramidForProject('IND_AMENDMENT');
    expect(pyramid.phases.length).toBeGreaterThanOrEqual(4);
    expect(pyramid.totalEstimatedHours).toBeGreaterThan(0);
    expect(pyramid.criticalPathIds!.length).toBeGreaterThan(0);
  });

  it('IND_ANNUAL_REPORT pyramid has expected structure', () => {
    const pyramid = getPyramidForProject('IND_ANNUAL_REPORT');
    expect(pyramid.phases.length).toBeGreaterThanOrEqual(3);
    expect(pyramid.totalEstimatedHours).toBeGreaterThan(0);
    expect(pyramid.criticalPathIds!.length).toBeGreaterThan(0);
  });

  it('IND_SAFETY_SUPPLEMENT pyramid has expected structure', () => {
    const pyramid = getPyramidForProject('IND_SAFETY_SUPPLEMENT');
    expect(pyramid.phases.length).toBeGreaterThanOrEqual(3);
    expect(pyramid.totalEstimatedHours).toBeGreaterThan(0);
    expect(pyramid.criticalPathIds!.length).toBeGreaterThan(0);
  });

  // ─── Progress Calculation ─────────────────────────────────────────────────

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
    expect(summary.estimatedHoursRemaining).toBeGreaterThan(0);
    expect(typeof summary.riskScore).toBe('number');
    expect(typeof summary.criticalPathProgress).toBe('number');
  });

  it('returns 100% progress when all tasks done', () => {
    const pyramid = getPyramidForProject('510K');
    const progress: TaskProgress[] = pyramid.tasks.map(task => ({
      taskId: task.id,
      status: 'done',
    }));

    const summary = calculateProgress(pyramid, progress);
    expect(summary.percentComplete).toBe(100);
    expect(summary.estimatedHoursRemaining).toBe(0);
  });

  it('returns per-phase progress', () => {
    const pyramid = getPyramidForProject('IND');
    const summary = calculateProgress(pyramid, []);
    expect(Object.keys(summary.perPhase).length).toBe(pyramid.phases.length);
    for (const phase of pyramid.phases) {
      expect(summary.perPhase[phase.id]).toBeDefined();
      expect(summary.perPhase[phase.id].total).toBe(phase.tasks.length);
    }
  });

  // ─── Task Scheduling ──────────────────────────────────────────────────────

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

  // ─── Risk Analysis ────────────────────────────────────────────────────────

  it('getRiskProfile returns risk data for enriched pyramids', () => {
    const pyramid = getPyramidForProject('IND');
    const profile = getRiskProfile(pyramid, []);
    expect(typeof profile.totalRiskScore).toBe('number');
    expect(Array.isArray(profile.highRiskTasks)).toBe(true);
    expect(Array.isArray(profile.mitigationGaps)).toBe(true);
  });

  it('getRiskProfile excludes completed tasks', () => {
    const pyramid = getPyramidForProject('IND');
    const allDone: TaskProgress[] = pyramid.tasks.map(t => ({ taskId: t.id, status: 'done' }));
    const profile = getRiskProfile(pyramid, allDone);
    expect(profile.totalRiskScore).toBe(0);
    expect(profile.highRiskTasks).toHaveLength(0);
  });

  // ─── Resource Allocation ──────────────────────────────────────────────────

  it('getResourceAllocation returns role-based allocations', () => {
    const pyramid = getPyramidForProject('IND');
    const allocations = getResourceAllocation(pyramid);
    expect(allocations.length).toBeGreaterThan(0);
    for (const alloc of allocations) {
      expect(alloc.role).toBeTruthy();
      expect(alloc.totalRequiredHours).toBeGreaterThan(0);
      expect(alloc.taskCount).toBeGreaterThan(0);
    }
  });

  it('getResourceBottlenecks identifies overloaded roles', () => {
    const pyramid = getPyramidForProject('IND');
    const bottlenecks = getResourceBottlenecks(pyramid, [
      { role: 'ra_lead', availableHoursPerWeek: 1 },
    ]);
    expect(bottlenecks.length).toBeGreaterThan(0);
    const raLead = bottlenecks.find(b => b.role === 'ra_lead');
    if (raLead) {
      expect(raLead.overloaded).toBe(true);
    }
  });

  // ─── Document Coverage ────────────────────────────────────────────────────

  it('getDocumentCoverage returns CTD section mappings', () => {
    const pyramid = getPyramidForProject('IND');
    const coverage = getDocumentCoverage(pyramid);
    expect(coverage.length).toBeGreaterThan(0);
    for (const entry of coverage) {
      expect(entry.ctdSection).toBeTruthy();
      expect(entry.sectionTitle).toBeTruthy();
      expect(entry.taskIds.length).toBeGreaterThan(0);
    }
  });

  // ─── Cross-Submission Dependencies ────────────────────────────────────────

  it('getCrossSubmissionDependencies returns deps for enriched pyramids', () => {
    const pyramid = getPyramidForProject('IND');
    const deps = getCrossSubmissionDependencies(pyramid);
    expect(Array.isArray(deps)).toBe(true);
  });

  // ─── Timeline Estimation ──────────────────────────────────────────────────

  it('estimateTimeline returns phase-level timeline estimates', () => {
    const pyramid = getPyramidForProject('IND');
    const timeline = estimateTimeline(pyramid);
    expect(timeline.length).toBe(pyramid.phases.length);
    for (const est of timeline) {
      expect(est.phaseId).toBeTruthy();
      expect(est.phaseName).toBeTruthy();
      expect(typeof est.startWeek).toBe('number');
      expect(typeof est.endWeek).toBe('number');
      expect(est.durationWeeks).toBeGreaterThanOrEqual(0);
    }
  });

  // ─── Regulatory Guidance ──────────────────────────────────────────────────

  it('getGuidanceReferences returns regulatory refs for enriched pyramids', () => {
    const pyramid = getPyramidForProject('IND');
    const refs = getGuidanceReferences(pyramid);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(ref.taskId).toBeTruthy();
      expect(ref.taskName).toBeTruthy();
    }
  });

  // ─── Sub-task Expansion ───────────────────────────────────────────────────

  it('flattenWithSubTasks expands tasks with sub-tasks', () => {
    const pyramid = getPyramidForProject('IND');
    const flattened = flattenWithSubTasks(pyramid);
    expect(flattened.length).toBeGreaterThanOrEqual(pyramid.tasks.length);
    for (const entry of flattened) {
      expect(entry.taskId).toBeTruthy();
      expect(entry.taskName).toBeTruthy();
      expect(entry.estimatedHours).toBeGreaterThan(0);
    }
  });

  // ─── Deliverables Catalog ─────────────────────────────────────────────────

  it('getDeliverablesCatalog returns deliverable lists', () => {
    const pyramid = getPyramidForProject('IND');
    const catalog = getDeliverablesCatalog(pyramid);
    expect(catalog.length).toBeGreaterThan(0);
    for (const entry of catalog) {
      expect(entry.taskId).toBeTruthy();
      expect(entry.deliverables.length).toBeGreaterThan(0);
    }
  });
});
