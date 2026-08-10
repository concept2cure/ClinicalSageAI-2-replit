/**
 * GET /api/task-management/templates — the read that makes a real write reachable.
 *
 * The write half already existed and was thorough: POST
 * /tasks/from-template/:templateId inserts real `unified_tasks` with
 * server-generated ids, dates derived from each definition's dayOffset /
 * duration, `task_dependencies` from the template, provenance via
 * sourceEntityType 'taskTemplate', and createdById from the session.
 *
 * Nothing could ENUMERATE templates, so the "Start a workflow" picker was fed
 * from a fixture constant and its button fabricated the entire task set in the
 * browser — ids from `'C2C-TASK-' + Math.random()`, assignees defaulting to the
 * fixture identity 'jc', "in N days" strings for dates, and no persistence at
 * all. The footer said "not yet wired", which was true and was the problem.
 *
 * So this list route is small, but it is the piece that lets a real endpoint be
 * called with an id it actually accepts. What it must not do:
 *
 *   • leak across tenants — task_templates HAS an organization_id, so there is
 *     no excuse for an unscoped read;
 *   • offer retired templates — is_active exists precisely so a template can be
 *     withdrawn without deleting the history of what it produced;
 *   • disagree with the writer about what will be created. The preview counts
 *     are derived from the SAME fields the instantiate route consumes, so the
 *     "N tasks / N-day span / Nh effort" a user approves is the thing that gets
 *     written;
 *   • silently truncate. A preview shorter than the real task list would show
 *     someone fewer tasks than they are about to create.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(join(__dirname, '../taskManagement.routes.ts'), 'utf8');

/** Match code, not the prose about it. */
function executableOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const LIST = executableOnly(
  SOURCE.slice(
    SOURCE.indexOf("router.get('/templates'"),
    SOURCE.indexOf("router.post('/templates'"),
  ),
);

describe('the template list exists and is tenant-scoped', () => {
  it('is a real route', () => {
    expect(SOURCE).toContain("router.get('/templates'");
    expect(LIST.length, 'the list route is gone or empty').toBeGreaterThan(400);
  });

  it('scopes to the caller organization', () => {
    expect(LIST).toMatch(/getSecureOrgId\(req\)/);
    expect(LIST).toMatch(/eq\(taskTemplates\.organizationId,\s*organizationId\)/);
    expect(LIST).toMatch(/401/);
  });

  it('never takes the organization from the query or body', () => {
    expect(LIST).not.toMatch(/req\.query\.organizationId/);
    expect(LIST).not.toMatch(/req\.body/);
  });

  it('excludes retired templates', () => {
    // Offering an inactive template would let someone instantiate a workflow
    // the org has deliberately withdrawn.
    expect(LIST).toMatch(/eq\(taskTemplates\.isActive,\s*true\)/);
  });
});

describe('the preview cannot disagree with what gets created', () => {
  it('derives span and effort from the fields the instantiate route consumes', () => {
    // The writer computes dates from dayOffset/duration and stores
    // estimatedHours; the preview must read the same three.
    for (const field of ['dayOffset', 'duration', 'estimatedHours']) {
      expect(LIST, `preview ignores ${field}`).toContain(field);
    }
    const WRITE = executableOnly(
      SOURCE.slice(SOURCE.indexOf("router.post('/tasks/from-template/:templateId'")),
    );
    for (const field of ['dayOffset', 'duration', 'estimatedHours']) {
      expect(WRITE, `writer no longer uses ${field}`).toContain(field);
    }
  });

  it('reports truncation instead of hiding it', () => {
    expect(LIST).toMatch(/MAX_TEMPLATE_TASK_PREVIEW/);
    // Pinned to the EXPRESSION. Asserting only that the field name appears lets
    // `tasksTruncated: false` through, which is exactly the silent-truncation
    // case this test exists to prevent — that mutation passed the first version.
    expect(LIST).toMatch(/tasksTruncated:\s*defs\.length\s*>\s*MAX_TEMPLATE_TASK_PREVIEW/);
    // The count must come from the FULL definition list, not the truncated
    // preview, or the button would offer to create fewer tasks than it does.
    expect(LIST).toMatch(/taskCount:\s*defs\.length/);
  });

  it('sends the template id the write route accepts', () => {
    // The whole point: the picker must hand back an id this endpoint takes.
    expect(LIST).toMatch(/templateId:\s*t\.templateId/);
    const WRITE = executableOnly(
      SOURCE.slice(SOURCE.indexOf("router.post('/tasks/from-template/:templateId'")),
    );
    expect(WRITE).toMatch(/eq\(taskTemplates\.templateId,\s*templateId\)/);
  });
});

describe('the write it feeds still records real provenance', () => {
  const WRITE = executableOnly(
    SOURCE.slice(SOURCE.indexOf("router.post('/tasks/from-template/:templateId'")),
  );

  it('generates task ids server-side', () => {
    // The client used to invent these with Math.random().
    expect(WRITE).toMatch(/const taskId = `TASK-\$\{Date\.now\(\)\}/);
  });

  it('records which template produced each task', () => {
    expect(WRITE).toMatch(/sourceEntityType:\s*'taskTemplate'/);
    expect(WRITE).toMatch(/sourceEntityId:\s*template\.templateId/);
  });

  it('attributes creation to the authenticated actor', () => {
    expect(WRITE).toMatch(/createdById:\s*actorUserId/);
  });

  it('is organization-scoped on both the lookup and the insert', () => {
    expect(WRITE).toMatch(/eq\(taskTemplates\.organizationId,\s*organizationId\)/);
    expect(WRITE).toMatch(/organizationId,/);
  });
});
