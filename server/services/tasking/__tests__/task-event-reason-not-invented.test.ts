/**
 * A task event's recorded reason is the reason a PERSON stated, or null.
 *
 * `auditTaskAction` writes `reason` into `audit_logs.reason` and
 * `c2c_ana_actions.decision_reason`, which the ledger shows as the reason for
 * the change (21 CFR 11.10(e)). Until 2026-10-01 eleven task-event paths filled
 * it with a sentence the code composed when nobody gave one:
 * task-audit.ts `defaultReason` ("Task created via tasking API", …) behind
 * every /api/tasks and /api/regulatory/tasks route, AnA's
 * "Task created by AnA and mirrored to the canonical task board" and
 * "Task status changed by AnA", the completion cascade's "Unblocked:
 * predecessor … completed", the blueprint seed, the biostatistics bridge's
 * fallback, workflow templates, the dependency block, auto-assign and module
 * sync. What happened is the event's `summary`, recorded in its payload.
 *
 * The behaviour is pinned where each path runs (task-audit.test.ts,
 * task-management-reasons.test.ts, ana-task-ledger-atomic,
 * task-completion-cascade, bridge-tasks-ledger, blueprint-milestones). This
 * guard holds the rule over every task-event literal in the source, so a new
 * path cannot bring the sentence back: a `reason` on an object whose `command`
 * is a `task.*` literal carries a value it was handed — never a string or
 * template literal, and never one as a `??` / `||` / `?:` fallback. The only
 * string literal allowed is the `'string'` of a `typeof x === 'string'` check.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(__dirname, '../../../..');

/** Every module that builds a task-event lineage row (`command: 'task.*'`). */
const TASK_EVENT_SOURCES = [
  'server/services/tasking/task-side-effects.ts',
  'server/services/tasking/blueprint-milestones.ts',
  'server/services/biostatistics-bridge/bridge-service.ts',
  'server/services/ana-ri/command-executor.ts',
  'server/routes/taskManagement.routes.ts',
  'server/routes/unifiedTasks.routes.ts',
];

const TASK_COMMAND = /^task\./;

function prop(obj: ts.ObjectLiteralExpression, name: string): ts.PropertyAssignment | undefined {
  return obj.properties.find(
    (p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === name,
  );
}

/** `'string'` in `typeof x === 'string'` — a type check, not a reason. */
function isTypeofOperand(node: ts.StringLiteral): boolean {
  const parent = node.parent;
  if (!ts.isBinaryExpression(parent)) return false;
  const other = parent.left === node ? parent.right : parent.left;
  return ts.isTypeOfExpression(other);
}

/** The first text the code itself wrote into a reason expression, if any. */
function composedText(expr: ts.Node): ts.Node | undefined {
  if (ts.isTemplateExpression(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr;
  if (ts.isStringLiteral(expr) && !isTypeofOperand(expr)) return expr;
  return ts.forEachChild(expr, composedText);
}

function isTaskEvent(obj: ts.ObjectLiteralExpression): boolean {
  const command = prop(obj, 'command');
  return Boolean(command && ts.isStringLiteralLike(command.initializer) && TASK_COMMAND.test(command.initializer.text));
}

interface Site {
  where: string;
  reason: string | null;
}

function taskEventSites(rel: string): Site[] {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const file = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true);
  const sites: Site[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node) && isTaskEvent(node)) {
      const reason = prop(node, 'reason');
      const line = file.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      sites.push({ where: `${rel}:${line}`, reason: reason ? reason.initializer.getText(file) : null });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return sites;
}

function inventedReasons(rel: string): string[] {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const file = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    const reason = ts.isObjectLiteralExpression(node) && isTaskEvent(node) ? prop(node, 'reason') : undefined;
    const composed = reason && composedText(reason.initializer);
    if (composed) {
      const line = file.getLineAndCharacterOfPosition(composed.getStart()).line + 1;
      found.push(`${rel}:${line}  reason: ${reason.initializer.getText(file).replace(/\s+/g, ' ')}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe('task events never record a reason nobody gave', () => {
  it('the scan sees the task-event literals it guards (an empty population proves nothing)', () => {
    const sites = TASK_EVENT_SOURCES.flatMap(taskEventSites);
    // Six modules, each building at least one task-event row.
    for (const rel of TASK_EVENT_SOURCES) {
      expect(sites.some((s) => s.where.startsWith(`${rel}:`)), `${rel} has no task-event literal`).toBe(true);
    }
    // And it sees the pass-through form the routes use for a stated reason.
    expect(sites.some((s) => s.reason?.includes('req.body'))).toBe(true);
  });

  it('every task-event reason is a value handed in — never a sentence the code wrote', () => {
    const invented = TASK_EVENT_SOURCES.flatMap(inventedReasons);
    expect(invented, `task events that record a composed reason:\n${invented.join('\n')}`).toEqual([]);
  });

  it('the guard recognises a composed reason when it sees one', () => {
    const probe = (src: string): boolean => {
      const file = ts.createSourceFile('probe.ts', src, ts.ScriptTarget.Latest, true);
      let hit = false;
      const visit = (node: ts.Node): void => {
        const reason = ts.isObjectLiteralExpression(node) && isTaskEvent(node) ? prop(node, 'reason') : undefined;
        if (reason && composedText(reason.initializer)) hit = true;
        ts.forEachChild(node, visit);
      };
      visit(file);
      return hit;
    };
    expect(probe(`f({ command: 'task.create', reason: 'Created via API' })`)).toBe(true);
    expect(probe('f({ command: \'task.link\', reason: `Linked by ${t}` })')).toBe(true);
    expect(probe(`f({ command: 'task.create', reason: args.reason ?? 'Raised' })`)).toBe(true);
    expect(probe('f({ command: \'task.transition\', reason: u ? `A ${x}` : `B ${x}` })')).toBe(true);
    expect(probe(`f({ command: 'task.create', reason: typeof b.reason === 'string' ? b.reason : undefined })`)).toBe(false);
    expect(probe(`f({ command: 'task.delete', reason: parsed.data.reason })`)).toBe(false);
    expect(probe(`f({ command: 'collab.lock', reason: 'not a task event' })`)).toBe(false);
  });
});
