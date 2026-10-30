/**
 * A CSR whose scientific reviewer no longer stands says so at release, and
 * never answers "no receipt" or 500 (D5, 2026-10-30, the CSR path sweep).
 *
 * Every freeze, sign, export and filing of a CSR re-checks the retained
 * scientific-review receipt, including the reviewer's current standing: an
 * active member, with access to the project, still independent of its authors.
 * That rule stands. What was wrong is what release said when it failed:
 * - a deactivated reviewer's receipt was dropped by the receipt read's join, so
 *   release said "No current scientific-review receipt covers the saved CSR",
 *   which is false: the receipt, its chained audit row and its binding are intact;
 * - a reviewer removed from the project, or now recorded as an author, raised an
 *   error the release boundary did not know, so /e-sign, /freeze and /export
 *   answered 500.
 */
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ authorize: vi.fn(), scope: vi.fn(), decide: vi.fn(), independent: vi.fn() }));
vi.mock('../authoring-program-access', async (original) => ({
  ...(await original<typeof import('../authoring-program-access')>()), authorizeAuthoringProgram: h.authorize,
}));
vi.mock('../authoring-permissions', async (original) => ({
  ...(await original<typeof import('../authoring-permissions')>()),
  resolveAuthoringDocumentScope: h.scope, decideAuthoringPermission: h.decide,
}));
vi.mock('../../governance/separation-of-duties', async (original) => ({
  ...(await original<typeof import('../../governance/separation-of-duties')>()), assertSignerIsNotAuthor: h.independent,
}));

import { assertCsrScientificRelease } from '../csr-scientific-review';
import { assertWorkflowImportRelease } from '../workflow-import-governance';
import { AuthoringProgramAccessError } from '../authoring-program-access';
import { SeparationOfDutiesError, SeparationOfDutiesUnverifiedError } from '../../governance/separation-of-duties';

const ORG = 7;
const DOC = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const PROGRAM = '6f1c2a7e-9c41-4b6a-8d3e-2f0a1b2c3d4e';
const RECEIPT = { review_id: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', reviewer_id: '21', reviewer_email: 'cro.biostat@example.test' };
const sections = [{ id: '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', code: '11.4', title: 'Efficacy', content: '<p>10/12 and 4/11.</p>' }];
const release = { organizationId: ORG, doc: { id: DOC, title: 'LMN-201 Clinical Study Report', module: 'M5', client_program_id: PROGRAM },
  sections, actor: { id: '41', email: 'publisher@example.test' } };

/**
 * The database as the release reads it: the document is a CSR, and one
 * approved receipt is retained for this snapshot. A reviewer who is not an
 * active member is excluded wherever a read asks for an active member, as the
 * join does in PostgreSQL.
 */
function database(reviewer: { active: boolean }) {
  const query = vi.fn(async (sql: string) => {
    if (/SELECT EXISTS/.test(sql) && /csrScientificEvidence/.test(sql)) return { rows: [{ required: true }] };
    const asksActive = /u\.status\s*=\s*'active'/.test(sql);
    if (/FROM authoring_reviews r/.test(sql)) return { rows: asksActive && !reviewer.active ? [] : [RECEIPT] };
    if (/FROM users u/.test(sql)) return { rows: reviewer.active ? [{ email: RECEIPT.reviewer_email }] : [] };
    throw new Error(`unexpected query: ${sql.slice(0, 80)}`);
  });
  return { query };
}

describe('a deactivated scientific reviewer', () => {
  it('is named as the reason, not "no receipt"', async () => {
    await expect(assertCsrScientificRelease(database({ active: false }), release))
      .rejects.toMatchObject({ code: 'CSR_SCIENTIFIC_REVIEWER_NOT_CURRENT' });
  });

  it('reaches the release boundary as that reason, 409, with its own sentence', async () => {
    const refused = assertWorkflowImportRelease(database({ active: false }), release);
    await expect(refused).rejects.toMatchObject({ name: 'WorkflowImportGovernanceError', status: 409, code: 'CSR_SCIENTIFIC_REVIEWER_NOT_CURRENT' });
    await expect(refused).rejects.toThrow(/no longer an active member of this organization/);
    await expect(refused).rejects.not.toThrow(/No current scientific-review receipt/);
  });
});

describe('a scientific reviewer who no longer stands, at the release boundary', () => {
  const standing = () => {
    h.authorize.mockReset().mockResolvedValue({ principal: { userId: 21 } });
    h.scope.mockReset().mockResolvedValue({ tenantId: ORG, docId: DOC, sectionId: null, documentStatus: 'APPROVED', createdBy: '3' });
    h.decide.mockReset().mockResolvedValue({ allowed: true });
    h.independent.mockReset().mockResolvedValue({ checked: true, reason: 'independent' });
  };

  it('removed from the project: 409 naming it, not a 500', async () => {
    standing();
    h.authorize.mockRejectedValue(new AuthoringProgramAccessError(403, 'PROJECT_PERMISSION_DENIED', 'You do not have access to this project.'));
    const refused = assertWorkflowImportRelease(database({ active: true }), release);
    await expect(refused).rejects.toMatchObject({ name: 'WorkflowImportGovernanceError', status: 409, code: 'CSR_EVIDENCE_REVIEWER_UNAVAILABLE' });
    await expect(refused).rejects.toThrow(/no longer has access to this project/);
  });

  it('the project itself unresolved: 409 saying so, not that the reviewer lost access', async () => {
    standing();
    h.authorize.mockRejectedValue(new AuthoringProgramAccessError(409, 'PROJECT_ANCHOR_UNRESOLVED', 'This project needs one verified tracking record before authoring.'));
    const refused = assertWorkflowImportRelease(database({ active: true }), release);
    await expect(refused).rejects.toMatchObject({ name: 'WorkflowImportGovernanceError', status: 409, code: 'CSR_EVIDENCE_REVIEWER_UNAVAILABLE' });
    await expect(refused).rejects.toThrow(/needs one verified tracking record/);
    await expect(refused).rejects.not.toThrow(/no longer has access/);
  });

  it('now recorded as an author of the CSR: 409 naming it, not a 500', async () => {
    standing();
    h.independent.mockRejectedValue(new SeparationOfDutiesError('Separation of duties: you are an author of this record.'));
    const refused = assertWorkflowImportRelease(database({ active: true }), release);
    await expect(refused).rejects.toMatchObject({ name: 'WorkflowImportGovernanceError', status: 409, code: 'CSR_EVIDENCE_REVIEWER_NOT_INDEPENDENT' });
    await expect(refused).rejects.toThrow(/recorded as an author of this CSR/);
  });

  it('when the check cannot run: 503 "could not be checked", not a 500', async () => {
    standing();
    h.independent.mockRejectedValue(new SeparationOfDutiesUnverifiedError(`authoring-document:${DOC}`, 'database error 57P01'));
    const refused = assertWorkflowImportRelease(database({ active: true }), release);
    await expect(refused).rejects.toMatchObject({ name: 'WorkflowImportGovernanceError', status: 503 });
    await expect(refused).rejects.toThrow(/could not be checked/);
  });
});
