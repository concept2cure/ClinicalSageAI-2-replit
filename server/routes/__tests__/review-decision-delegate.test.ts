/**
 * The three review writes that did not exist — decision, delegation, comment —
 * and the properties that make each of them safe.
 *
 * ── What was there before ────────────────────────────────────────────────────
 * Nothing. Review.tsx recorded an APPROVAL DECISION with
 *   const recordDecision = () => { onSigned ? onSigned() : onClose(); };
 * — the queue row flipped to "Review decision recorded" and the decision
 * existed in one browser tab until the next refresh. Delegation pushed a line
 * into local thread state; comments and resolutions called `setThread` and
 * nothing else. Four governed acts, no request between them.
 *
 * ── What these pin ───────────────────────────────────────────────────────────
 * The same traps the change-request guard exists for, plus the ones that only
 * appear once a route can END a review:
 *
 *   AUTHORIZATION. Only someone the workflow is WAITING ON may decide or
 *   delegate. Without that, any authenticated member of the org could approve a
 *   governed review they have no part in. The check must read the assignment
 *   from workflow_approvals, not from the request.
 *
 *   TENANT. The document is derived from the workflow row (which carries
 *   organization_id), never from the request body — otherwise a caller who
 *   knows a document id can act on a document they cannot see.
 *
 *   A REJECTION MUST CARRY ITS GROUNDS. A rejection nobody can read the reason
 *   for is not a reviewable record.
 *
 *   DELEGATION REPLACES. A delegation that appends the delegate while leaving
 *   the delegator assigned has not delegated anything.
 *
 *   AUDIT. Every one of them writes workflow_history.
 *
 *   RIGHT TABLE. There are TWO `documentComments` tables in this repo. Only
 *   shared/schema/unified_workflow.ts is the one GET /board reads; importing
 *   the other typechecks perfectly and writes comments nobody will ever see.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(join(__dirname, '../review-board-routes.ts'), 'utf8');

/** Match executable code, not the prose about it. */
function executableOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** One handler's body: from its registration to the next route's. */
function handler(marker: string): string {
  const from = SOURCE.indexOf(marker);
  if (from < 0) return '';
  const rest = SOURCE.slice(from + marker.length);
  const next = rest.search(/\n\s*router\.(get|post|put|patch|delete)\(/);
  return executableOnly(marker + (next < 0 ? rest : rest.slice(0, next)));
}

const DECISION = handler("router.post('/workflows/:workflowId/decision'");
const DELEGATE = handler("router.post('/workflows/:workflowId/delegate'");
const COMMENT = handler("router.post('/workflows/:workflowId/comments'");
const RESOLVE = handler("router.patch('/comments/:commentId/resolve'");
const MODULE = executableOnly(SOURCE);
/** The shared preamble every workflow-scoped write goes through. */
const CONTEXT = executableOnly(
  SOURCE.slice(SOURCE.indexOf('async function reviewerContext'), SOURCE.indexOf("router.post('/workflows/:workflowId/decision'")),
);

describe('all three writes exist as real routes', () => {
  it.each([
    ['decision', DECISION],
    ['delegate', DELEGATE],
    ['comment', COMMENT],
    ['resolve', RESOLVE],
  ])('%s', (_name, body) => {
    expect(body.length).toBeGreaterThan(300);
  });
});

describe('authorization — only a reviewer the workflow is waiting on may act', () => {
  it('decision and delegate both go through the pending-step check', () => {
    expect(DECISION).toMatch(/reviewerContext\(req, res\)/);
    expect(DELEGATE).toMatch(/reviewerContext\(req, res\)/);
    // Both must bail when it returns null — an `if (!ctx) return;` that is
    // missing turns the guard into a comment.
    expect(DECISION).toMatch(/if \(!ctx\) return;/);
    expect(DELEGATE).toMatch(/if \(!ctx\) return;/);
  });

  it('the check reads the assignment from workflow_approvals, not from the request', () => {
    expect(CONTEXT).toMatch(/pendingStepFor/);
    const fn = executableOnly(
      SOURCE.slice(SOURCE.indexOf('async function pendingStepFor'), SOURCE.indexOf('async function activeWorkflow')),
    );
    expect(fn).toMatch(/\.from\(workflowApprovals\)/);
    expect(fn).toMatch(/eq\(workflowApprovals\.status, 'pending'\)/);
    expect(fn).toMatch(/assignedTo/);
    expect(fn, 'the assignment must not be read off the request body').not.toMatch(/req\.body/);
  });

  it('refuses a caller with no pending step, and refuses a non-active workflow', () => {
    expect(CONTEXT).toMatch(/403/);
    expect(CONTEXT).toMatch(/not an assigned reviewer/i);
    expect(CONTEXT).toMatch(/only an active workflow/i);
  });

  it('derives the tenant and the document from the workflow row, never from the body', () => {
    const fn = executableOnly(
      SOURCE.slice(SOURCE.indexOf('async function activeWorkflow'), SOURCE.indexOf('function reviewWriteFailed')),
    );
    expect(fn).toMatch(/eq\(documentWorkflows\.organizationId, orgId\)/);
    expect(fn).toMatch(/documentId: documentWorkflows\.documentId/);
    for (const [name, body] of [['decision', DECISION], ['delegate', DELEGATE], ['comment', COMMENT]] as const) {
      expect(body, `${name} must not take a documentId from the request`).not.toMatch(/req\.body\??\.\s*documentId/);
    }
  });
});

describe('the decision actually decides', () => {
  it('completes the reviewer’s own approval row with who and when', () => {
    expect(DECISION).toMatch(/\.update\(workflowApprovals\)/);
    expect(DECISION).toMatch(/completedBy: userId/);
    expect(DECISION).toMatch(/completedAt: now/);
    expect(DECISION).toMatch(/eq\(workflowApprovals\.id, mine\.id\)/);
  });

  it('a rejection rejects the WORKFLOW — a rejected review does not roll on to the next approver', () => {
    expect(DECISION).toMatch(/status: 'rejected', rejectedBy: userId/);
  });

  it('requires grounds for a rejection but not for an approval', () => {
    expect(DECISION).toMatch(/decision === 'reject' && reason\.length < 8/);
  });

  it('asks the database what is still pending rather than assuming this was the last step', () => {
    // A parallel step (two approvers on one order) must not end the review when
    // only one of them has answered.
    expect(DECISION).toMatch(/eq\(workflowApprovals\.status, 'pending'\)/);
    expect(DECISION).toMatch(/remaining\.length === 0/);
    expect(DECISION).toMatch(/Math\.min\(\.\.\.remaining\.map/);
  });

  it('records the 21 CFR 11.50 meaning the reviewer selected, never one inferred from the decision', () => {
    expect(DECISION).toMatch(/req\.body\?\.meaning/);
    expect(DECISION).toMatch(/meaning: meaning \|\| null/);
  });
});

describe('the delegation actually delegates', () => {
  it('REPLACES the step assignment rather than appending to it', () => {
    expect(DELEGATE).toMatch(/\.set\(\{ assignedTo: \[to\] \}\)/);
  });
  it('refuses a self-delegation and requires a reason', () => {
    expect(DELEGATE).toMatch(/to === userId/);
    expect(DELEGATE).toMatch(/reason\.length < 8/);
  });
});

describe('comments land where the board reads them, and resolve is tenant-scoped', () => {
  it('imports documentComments from unified_workflow, not the same-named table in schema.ts', () => {
    expect(MODULE).toMatch(
      /import\s*\{[^}]*documentComments[^}]*\}\s*from\s*'\.\.\/\.\.\/shared\/schema\/unified_workflow'/s,
    );
    expect(MODULE).not.toMatch(/import\s*\{[^}]*documentComments[^}]*\}\s*from\s*'\.\.\/\.\.\/shared\/schema'/s);
    expect(COMMENT).toMatch(/\.insert\(documentComments\)/);
  });

  it('resolve joins through the workflow to scope by org — document_comments has no organization_id of its own', () => {
    expect(RESOLVE).toMatch(/\.innerJoin\(documentWorkflows/);
    expect(RESOLVE).toMatch(/eq\(documentWorkflows\.organizationId, orgId\)/);
    expect(RESOLVE).toMatch(/404/);
  });

  it('resolve records who resolved it and clears that on reopen', () => {
    expect(RESOLVE).toMatch(/resolvedBy: resolved \? userId : null/);
    expect(RESOLVE).toMatch(/resolvedAt: resolved \? new Date\(\) : null/);
  });
});

describe('every governed act is audited', () => {
  it.each([
    ['decision', DECISION, /step_approved/],
    ['delegate', DELEGATE, /step_delegated/],
  ])('%s writes workflow_history', (_n, body, action) => {
    expect(body).toMatch(/\.insert\(workflowHistory\)/);
    expect(body).toMatch(action);
    expect(body).toMatch(/performedBy: userId/);
  });
});
