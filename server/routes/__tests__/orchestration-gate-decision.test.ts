/**
 * Approval-gate decisions — the guarantees that make this safe to wire at all.
 *
 * This gate is what stands between a proposal and a `protected_action`
 * ('promote_to_review', 'route_to_agency', …). The surface previously wrote the
 * decision into local React state with a fabricated `when: 'just now'` and then
 * rendered "✓ Approved" — a completed, timestamped approval that existed
 * nowhere. Recording nothing was safer than that.
 *
 * Recording something is only better if all of the following hold, so each is
 * pinned here:
 *
 *   1. IT IS NOT A SIGNATURE, AND NEVER SAYS IT IS. There is no re-verification
 *      of the signer and nothing is bound to a frozen record, so this is an
 *      attributed approval decision, not a 21 CFR §11.50 manifestation. The
 *      response and the audit metadata both carry `isElectronicSignature:
 *      false`. A future edit that quietly drops that flag turns an honest
 *      control into a compliance claim.
 *   2. QUORUM IS REAL. `status` may flip to 'approved' only once the approving
 *      count reaches required_approver_count. A 2-of-3 gate closed by one
 *      person is the whole failure mode quorum exists to prevent.
 *   3. ONE DECISION PER APPROVER. Without this, quorum is trivially defeated by
 *      submitting twice.
 *   4. ROLES ARE ENFORCED. A gate that names required_approver_roles and then
 *      accepts anyone is not a gate.
 *   5. TIME COMES FROM THE DATABASE. A client-supplied `decidedAt` on a
 *      governed approval is exactly the fabrication this route removes.
 *   6. TENANCY. approval_checkpoints has NO organization_id of its own; scope
 *      exists only through the JOIN to workflow_runs. Drop the join and any org
 *      can decide any other org's gates by id.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(join(__dirname, '../orchestration-checkpoints.ts'), 'utf8');

/** Match code, not the prose about it — a guard in this repo already passed
 *  once against the comment explaining the very statement it checked. */
function executableOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const ROUTE = executableOnly(SOURCE.slice(SOURCE.indexOf("router.post('/:id/decision'")));

describe('it records a decision, and never claims to be a signature', () => {
  it('exists as a real route', () => {
    expect(ROUTE.length, 'the decision route is gone').toBeGreaterThan(800);
  });

  it('marks the decision as NOT an electronic signature, in both the response and the audit row', () => {
    const matches = ROUTE.match(/isElectronicSignature:\s*false/g) ?? [];
    expect(
      matches.length,
      'the not-a-signature flag is missing from the response or the audit metadata',
    ).toBeGreaterThanOrEqual(2);
    // And it must never assert the opposite.
    expect(ROUTE).not.toMatch(/isElectronicSignature:\s*true/);
  });

  it('writes an audit event in the same transaction as the decision', () => {
    expect(ROUTE).toMatch(/INSERT INTO audit_events\b/);
    expect(ROUTE).toMatch(/orchestration\.gate_decision/);
    const begin = ROUTE.indexOf("'BEGIN'");
    const audit = ROUTE.indexOf('INSERT INTO audit_events');
    const commit = ROUTE.indexOf("'COMMIT'");
    expect(begin).toBeGreaterThan(-1);
    expect(audit, 'the audit insert is outside the transaction').toBeGreaterThan(begin);
    expect(commit, 'the audit insert happens after the commit').toBeGreaterThan(audit);
  });

  it('rolls back rather than leaving a half-applied decision', () => {
    expect(ROUTE).toMatch(/ROLLBACK/);
    expect(ROUTE).toMatch(/client\.release\(\)/);
  });
});

describe('quorum cannot be faked', () => {
  it('flips status to approved only when the approving count reaches the requirement', () => {
    expect(ROUTE).toMatch(/approvedCount\s*>=\s*requiredCount/);
    expect(ROUTE).toMatch(/quorumMet/);
    // The UPDATE must be conditional on that flag, not unconditional.
    expect(ROUTE).toMatch(/CASE WHEN \$3::boolean THEN 'approved'::workflow_step_status ELSE status END/);
  });

  it('refuses a second decision from the same approver', () => {
    // Pinned to the PREDICATE, not to nearby strings. The first version of this
    // asserted only that /approverId/, /already recorded a decision/ and /409/
    // appeared somewhere — all three survive `if (false)`, because the field
    // name is also used when building the record, the message lives inside the
    // dead branch, and 409 is also the already-resolved case. The mutation
    // passed, which made this the one guard in the file that proved nothing.
    expect(ROUTE).toMatch(
      /if \(existing\.some\(a =>[\s\S]{0,160}approverId[\s\S]{0,60}===\s*actorId\)\)/,
    );
    expect(ROUTE).toMatch(/already recorded a decision/);
  });

  it('locks the row it reads-then-writes', () => {
    // Two approvers landing together must serialize, or a 2-of-3 gate can be
    // closed by two racing writes that each saw one prior approval.
    expect(ROUTE).toMatch(/FOR UPDATE OF c/);
  });

  it('counts only approvals, not any decision', () => {
    expect(ROUTE).toMatch(/decision\s*\?\?\s*''\)\s*===\s*'approved'/);
  });
});

describe('who may decide, and on what', () => {
  it('enforces required_approver_roles when the gate names them', () => {
    expect(ROUTE).toMatch(/requiredRoles\.length/);
    expect(ROUTE).toMatch(/requiredRoles\.includes\(actorRole\)/);
    expect(ROUTE).toMatch(/403/);
  });

  it('scopes to the organization through the workflow_runs join', () => {
    // approval_checkpoints has no organization_id; the join IS the tenancy.
    expect(ROUTE).toMatch(/JOIN workflow_runs r ON r\.id = c\.workflow_run_id/);
    expect(ROUTE).toMatch(/r\.organization_id = \$2/);
    expect(ROUTE).toMatch(/resolveOrgId\(req\)/);
  });

  it('takes the actor from the session, never the body', () => {
    expect(ROUTE).toMatch(/r\.user\?\.userId/);
    expect(ROUTE).not.toMatch(/body\.(approverId|approverName|userId|decidedAt)/);
  });

  it('refuses a gate that is already resolved', () => {
    expect(ROUTE).toMatch(/OPEN_STATUSES\.has\(cp\.status\)/);
    expect(ROUTE).toMatch(/409/);
  });
});

describe('the recorded facts are the server’s, not the client’s', () => {
  it('stamps decidedAt from the database clock', () => {
    expect(ROUTE).toMatch(/SELECT NOW\(\) AS now/);
    expect(ROUTE).toMatch(/decidedAt/);
  });

  it('requires a reason for a rejection', () => {
    // A rejection with no reason is not reviewable later.
    expect(ROUTE).toMatch(/rejection requires a comment/);
  });

  it('reports honestly when the status did not change', () => {
    // workflow_step_status has no 'rejected' member, so a rejection leaves the
    // gate unresolved — the response must not imply otherwise.
    expect(ROUTE).toMatch(/statusChanged:\s*quorumMet/);
  });

  it('never invents a rejected status', () => {
    expect(ROUTE).not.toMatch(/'rejected'::workflow_step_status/);
    expect(ROUTE).not.toMatch(/status\s*=\s*'failed'/);
  });
});

describe('input shaping', () => {
  it('validates the decision against the ApprovalRecord union', () => {
    for (const d of ['approved', 'rejected', 'escalated', 'needs_revision']) {
      expect(SOURCE).toContain(`'${d}'`);
    }
    expect(ROUTE).toMatch(/DECISIONS\.has\(decision\)/);
  });

  it('rejects a non-uuid checkpoint id before it reaches Postgres', () => {
    // Otherwise a malformed id surfaces as a 22P02-driven 500.
    expect(ROUTE).toMatch(/\[0-9a-f\]\{8\}-/);
    expect(ROUTE).toMatch(/Invalid checkpoint id/);
  });

  it('caps the comment and fails closed when the store is missing', () => {
    expect(ROUTE).toMatch(/MAX_COMMENT_CHARS/);
    expect(ROUTE).toMatch(/42P01/);
    expect(ROUTE).toMatch(/503/);
  });
});
