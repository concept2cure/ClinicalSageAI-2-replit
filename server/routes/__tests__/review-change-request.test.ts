/**
 * "Request changes" — the four ways this route could quietly be the wrong thing.
 *
 * Three existing endpoints looked like they already implemented this, and every
 * one of them was a trap. The tests below pin the reasons, because each trap is
 * re-enterable by a well-meaning refactor:
 *
 *   1. WRONG SEMANTICS. POST /api/approval-workflows/:id/reject is real and
 *      mounted, and it TERMINATES the workflow. "Please revise §3.2.P.5" is not
 *      "this submission is rejected." A future edit that reaches for the
 *      orchestrator because it already has an approve/reject path would turn
 *      every revision request into a killed workflow.
 *
 *   2. WRONG ID SPACE. POST /api/concept2cure/projects/:projectId/artifacts/
 *      :artifactId/reviews/submit has the exact vocabulary this feature wants —
 *      approve | request_changes | reject — and is the most tempting target in
 *      the codebase. It addresses a concept2cure artifact inside a project. This
 *      board is document_workflows over unified_documents. Two integer id spaces
 *      that collide instead of 404ing.
 *
 *   3. WRONG TABLE, SAME NAME. There are TWO `documentComments` tables in this
 *      repo: shared/schema.ts (document_id → documents.id) and
 *      shared/schema/unified_workflow.ts (document_id → unified_documents.id).
 *      Only the second is the one GET /board reads. Importing the other one
 *      typechecks perfectly and writes comments nobody will ever see.
 *
 *   4. INVENTED STATE. `approval_status` is a Postgres enum of exactly
 *      ('pending','approved','rejected'). There is no changes-requested member,
 *      so the route must leave the reviewer's approval row alone. Writing
 *      'rejected' to "mark" the request would terminate the workflow — trap 1
 *      arrived at from a different direction.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTE_SOURCE = readFileSync(join(__dirname, '../review-board-routes.ts'), 'utf8');

/**
 * Match executable code, not the prose about it. A previous guard in this repo
 * passed against the comment that explained the very statement it was checking.
 */
function executableOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const ROUTE = executableOnly(
  ROUTE_SOURCE.slice(ROUTE_SOURCE.indexOf("router.post('/workflows/:workflowId/change-request'")),
);
const MODULE = executableOnly(ROUTE_SOURCE);

describe('the change request is recorded where the board will actually read it', () => {
  it('exists as a real route', () => {
    expect(ROUTE.length, 'the change-request route is gone').toBeGreaterThan(500);
  });

  it('writes to the unified_workflow document_comments, not the same-named table in schema.ts', () => {
    // Trap 3. Both imports typecheck; only one is the table the board reads.
    expect(MODULE).toMatch(
      /import\s*\{[^}]*documentComments[^}]*\}\s*from\s*'\.\.\/\.\.\/shared\/schema\/unified_workflow'/s,
    );
    expect(
      MODULE,
      'documentComments is being imported from shared/schema — that is a different table',
    ).not.toMatch(/import\s*\{[^}]*documentComments[^}]*\}\s*from\s*'\.\.\/\.\.\/shared\/schema'/s);
    expect(ROUTE).toMatch(/\.insert\(documentComments\)/);
  });

  it('records the act in workflow_history', () => {
    expect(ROUTE).toMatch(/\.insert\(workflowHistory\)/);
    expect(ROUTE).toMatch(/change_requested/);
  });
});

describe('the request cannot be aimed at a document the reviewer is not reviewing', () => {
  it('derives the document id from the workflow, never from the request body', () => {
    // The body carries only a reason. If documentId ever became a body field,
    // any org member could hang a comment off any document id they can guess.
    expect(ROUTE).toMatch(/documentId:\s*documentWorkflows\.documentId/);
    expect(ROUTE).toMatch(/documentId:\s*wf\.documentId/);
    expect(ROUTE).not.toMatch(/req\.body[^\n]*documentId/);
    expect(ROUTE).not.toMatch(/body\.documentId/);
  });

  it('scopes the workflow lookup to the authenticated organization', () => {
    expect(ROUTE).toMatch(/eq\(documentWorkflows\.organizationId,\s*orgId\)/);
    expect(ROUTE).toMatch(/getOrgId\(req\)/);
  });

  it('requires the caller to be an assignee on a PENDING step', () => {
    // Without this any authenticated member of the org could inject a change
    // request into a governed review they have no part in.
    expect(ROUTE).toMatch(/eq\(workflowApprovals\.status,\s*'pending'\)/);
    expect(ROUTE).toMatch(/assignedTo/);
    expect(ROUTE).toMatch(/403/);
  });

  it('takes the actor from the session, not the body', () => {
    expect(ROUTE).toMatch(/getUserId\(req\)/);
    expect(ROUTE).not.toMatch(/body\.(userId|createdBy|reviewerId)/);
  });
});

describe('it does not invent an approval state, and does not terminate the workflow', () => {
  it('never writes to workflow_approvals', () => {
    // Trap 4. The only legal statuses are pending|approved|rejected; a change
    // request is none of them, so the row is left alone.
    expect(
      ROUTE,
      'the route updates an approval row — there is no changes-requested status to write',
    ).not.toMatch(/\.update\(workflowApprovals\)/);
  });

  it('never marks the workflow rejected or completed', () => {
    // Trap 1, arrived at from inside this route rather than by calling the
    // orchestrator.
    expect(ROUTE).not.toMatch(/\.update\(documentWorkflows\)/);
    expect(ROUTE).not.toMatch(/status:\s*'rejected'/);
    expect(ROUTE).not.toMatch(/rejectedBy/);
  });

  it('refuses a workflow that is no longer active', () => {
    // A completed or rejected workflow has nothing left to revise into, and a
    // comment on it would sit in a thread nobody returns to.
    expect(ROUTE).toMatch(/wf\.status !== 'active'/);
    expect(ROUTE).toMatch(/409/);
  });

  it('reports back that the approval step is still pending', () => {
    // So the client states it rather than implying the step advanced.
    expect(ROUTE).toMatch(/approvalStatus:\s*'pending'/);
  });
});

describe('the route does not reach for the endpoints that look right and are not', () => {
  it('does not call the approval orchestrator reject path', () => {
    expect(MODULE).not.toMatch(/approval-workflows/);
    expect(MODULE).not.toMatch(/processApproval/);
  });

  it('does not call the concept2cure artifact review submit path', () => {
    // Right vocabulary, wrong id space (trap 2).
    expect(MODULE).not.toMatch(/reviews\/submit/);
    expect(MODULE).not.toMatch(/concept2cureArtifacts/);
  });
});

describe('input shaping', () => {
  it('requires a reason and caps its length', () => {
    expect(ROUTE).toMatch(/reason is required/);
    expect(ROUTE).toMatch(/MAX_CHANGE_REQUEST_CHARS/);
    expect(ROUTE).toMatch(/413/);
  });

  it('rejects a non-numeric workflow id before touching the database', () => {
    expect(ROUTE).toMatch(/Number\.isInteger\(workflowId\)/);
  });

  it('fails closed when the workflow tables are absent', () => {
    expect(ROUTE).toMatch(/42P01/);
    expect(ROUTE).toMatch(/503/);
  });
});
