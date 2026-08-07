import { describe, expect, it } from 'vitest';
import {
  BUILTIN_WORKFLOW_TEMPLATES,
  getBuiltinWorkflowTemplate,
} from '../workflow-templates';

/**
 * The built-in catalog is what makes "Start workflow" work for a fresh org
 * (no task_templates rows). Its internal integrity is what the from-template
 * instantiation route depends on: every dependency edge must reference a
 * declared task, ids must be unique, and every task must be instantiable.
 */
describe('builtin workflow templates', () => {
  it('has unique template ids and resolves by id', () => {
    const ids = BUILTIN_WORKFLOW_TEMPLATES.map(t => t.templateId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(getBuiltinWorkflowTemplate(id)?.templateId).toBe(id);
    }
    expect(getBuiltinWorkflowTemplate('NOT-A-TEMPLATE')).toBeNull();
  });

  it('every dependency edge references a declared task (no dangling edges)', () => {
    for (const tpl of BUILTIN_WORKFLOW_TEMPLATES) {
      const taskIds = new Set(tpl.tasks.map(t => t.id));
      expect(taskIds.size).toBe(tpl.tasks.length); // unique within template
      for (const d of tpl.dependencies) {
        expect(taskIds.has(d.predecessor)).toBe(true);
        expect(taskIds.has(d.successor)).toBe(true);
        expect(d.predecessor).not.toBe(d.successor);
      }
    }
  });

  it('every task is instantiable: title, module, dates and effort are present', () => {
    for (const tpl of BUILTIN_WORKFLOW_TEMPLATES) {
      expect(tpl.builtin).toBe(true);
      expect(tpl.name.length).toBeGreaterThan(0);
      for (const task of tpl.tasks) {
        expect(task.title.length).toBeGreaterThan(0);
        expect(task.moduleType.length).toBeGreaterThan(0);
        expect(task.dayOffset).toBeGreaterThanOrEqual(0);
        expect(task.duration).toBeGreaterThan(0);
        expect(task.estimatedHours).toBeGreaterThan(0);
      }
    }
  });

  it('dependencies are acyclic within each template', () => {
    for (const tpl of BUILTIN_WORKFLOW_TEMPLATES) {
      const successors = new Map<string, string[]>();
      tpl.dependencies.forEach(d => {
        successors.set(d.predecessor, [...(successors.get(d.predecessor) ?? []), d.successor]);
      });
      const visiting = new Set<string>();
      const done = new Set<string>();
      const dfs = (id: string): boolean => {
        if (done.has(id)) return true;
        if (visiting.has(id)) return false; // cycle
        visiting.add(id);
        for (const next of successors.get(id) ?? []) {
          if (!dfs(next)) return false;
        }
        visiting.delete(id);
        done.add(id);
        return true;
      };
      for (const task of tpl.tasks) {
        expect(dfs(task.id)).toBe(true);
      }
    }
  });
});
