/**
 * AnA MDX command handler tests.
 *
 * Verifies the governed-mutation contract:
 *   1. confirm + reason are mandatory; missing either returns
 *      action='confirmation_required'.
 *   2. reason has a minimum length (10 for normal, 30 for transmit).
 *   3. ESG transmit requires the literal confirm='yes-transmit'.
 *   4. Tenant errors from the underlying service map to a clean refusal.
 *   5. Audit emission happens with action='agent.ana.<resource>.<verb>'
 *      and details.actorKind='agent:ana'.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { qSubSvc, sectionPool, esgSvc, audit, TenantAccessError } = vi.hoisted(() => {
  class TenantAccessError extends Error {
    constructor(m: string) { super(m); this.name = 'TenantAccessError'; }
  }
  return {
    qSubSvc: {
      createQSubmission: vi.fn(),
      setCommitmentRolledIn: vi.fn(),
    },
    sectionPool: {
      query: vi.fn(),
    },
    esgSvc: {
      submitToFDA: vi.fn(),
    },
    audit: { logAction: vi.fn().mockResolvedValue(undefined) },
    TenantAccessError,
  };
});

vi.mock('../../q-sub/q-sub.service', () => ({
  createQSubmission: (...a: any[]) => qSubSvc.createQSubmission(...a),
  setCommitmentRolledIn: (...a: any[]) => qSubSvc.setCommitmentRolledIn(...a),
  TenantAccessError,
  Q_SUB_TYPES: ['presub', 'sir', 'srd', 'agree', 'info'],
}));

vi.mock('../../../shared/schema/q-sub', () => ({
  Q_SUB_TYPES: ['presub', 'sir', 'srd', 'agree', 'info'],
}));

vi.mock('../../auditService', () => ({
  default: audit,
}));

// The handler's relative import path (`'../../db'` from
// server/services/ana-ri) resolves to server/db.ts. From this test file
// (server/services/ana-ri/__tests__/) the matching mock path is
// `'../../../db'` — one extra level up to escape the __tests__ folder.
vi.mock('../../../db', () => ({
  pool: sectionPool,
}));

const ESGSubmissionService = vi.fn(() => ({
  submitToFDA: (...a: any[]) => esgSvc.submitToFDA(...a),
}));
vi.mock('../../ESGSubmissionService', () => ({
  default: ESGSubmissionService,
}));

import {
  qSubCreate,
  qSubCommitmentSetRolledIn,
  sectionApprove,
  sectionUpdate,
  esgTransmit,
  preflightModule,
} from '../mdx-command-handlers';

const CTX = {
  userId: 7,
  organizationId: 11,
  userName: 'JM Smith',
  userRole: 'admin',
};

const PROGRAM_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const COMMITMENT_UUID = 'cccccccc-cccc-cccc-cccc-ccccccccccc1';

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Confirmation gate ──────────────────────────────────────────────────────

describe('confirmation gate', () => {
  it('q_sub.create rejects without confirm', async () => {
    const r = await qSubCreate(CTX, {
      programId: PROGRAM_UUID,
      qSubType: 'presub',
      title: 'x',
    });
    expect(r.success).toBe(false);
    expect(r.action).toBe('confirmation_required');
    expect(r.error).toBe('CONFIRMATION_REQUIRED');
    expect(qSubSvc.createQSubmission).not.toHaveBeenCalled();
  });

  it('q_sub.create rejects when reason is too short', async () => {
    const r = await qSubCreate(CTX, {
      programId: PROGRAM_UUID,
      qSubType: 'presub',
      title: 'x',
      confirm: 'yes',
      reason: 'short',
    });
    expect(r.success).toBe(false);
    expect(r.error).toBe('REASON_TOO_SHORT');
    expect(qSubSvc.createQSubmission).not.toHaveBeenCalled();
  });

  it('q_sub.create proceeds with valid confirm + reason', async () => {
    qSubSvc.createQSubmission.mockResolvedValue({
      id: 'q-1',
      programId: PROGRAM_UUID,
      qSubType: 'presub',
      title: 'x',
      stage: 'plan',
    });
    const r = await qSubCreate(CTX, {
      programId: PROGRAM_UUID,
      qSubType: 'presub',
      title: 'x',
      confirm: 'yes',
      reason: 'per FDA AI letter triage outcome',
    });
    expect(r.success).toBe(true);
    expect(r.action).toBe('q_sub.create');
    expect(qSubSvc.createQSubmission).toHaveBeenCalledWith(
      11,
      expect.objectContaining({
        programId: PROGRAM_UUID,
        qSubType: 'presub',
        title: 'x',
        createdBy: 'ana:7',
      }),
    );
  });
});

// ─── Input validation ──────────────────────────────────────────────────────

describe('input validation', () => {
  const goodGate = { confirm: 'yes', reason: 'this is a sufficient reason' };

  it('rejects non-uuid programId', async () => {
    const r = await qSubCreate(CTX, {
      ...goodGate,
      programId: 'not-a-uuid',
      qSubType: 'presub',
      title: 'x',
    });
    expect(r.error).toBe('INVALID_INPUT');
    expect(r.message).toMatch(/UUID/i);
  });

  it('rejects unknown qSubType', async () => {
    const r = await qSubCreate(CTX, {
      ...goodGate,
      programId: PROGRAM_UUID,
      qSubType: 'meeting',
      title: 'x',
    });
    expect(r.error).toBe('INVALID_INPUT');
    expect(r.message).toMatch(/qSubType/);
  });

  it('rejects malformed targetDate', async () => {
    const r = await qSubCreate(CTX, {
      ...goodGate,
      programId: PROGRAM_UUID,
      qSubType: 'presub',
      title: 'x',
      targetDate: 'not-a-date',
    });
    expect(r.error).toBe('INVALID_INPUT');
    expect(r.message).toMatch(/ISO/);
  });

  it('q_sub.commitment requires UUID + boolean rolledIn', async () => {
    const r1 = await qSubCommitmentSetRolledIn(CTX, {
      ...goodGate,
      commitmentId: 'not-uuid',
      rolledIn: true,
    });
    expect(r1.error).toBe('INVALID_INPUT');

    const r2 = await qSubCommitmentSetRolledIn(CTX, {
      ...goodGate,
      commitmentId: COMMITMENT_UUID,
      rolledIn: 'true', // wrong type
    });
    expect(r2.error).toBe('INVALID_INPUT');
  });
});

// ─── Audit emission ─────────────────────────────────────────────────────────

describe('audit emission', () => {
  it('q_sub.create logs agent.ana.q_sub.create with reason in details', async () => {
    qSubSvc.createQSubmission.mockResolvedValue({
      id: 'q-1', programId: PROGRAM_UUID, qSubType: 'presub', title: 'x', stage: 'plan',
    });
    await qSubCreate(CTX, {
      programId: PROGRAM_UUID,
      qSubType: 'presub',
      title: 'x',
      confirm: 'yes',
      reason: 'this is a sufficient reason for the audit row',
    });
    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'agent.ana.q_sub.create',
        tenantId: 11,
        userId: 7,
        details: expect.objectContaining({
          actorKind: 'agent:ana',
          agentReason: 'this is a sufficient reason for the audit row',
        }),
      }),
    );
  });

  it('q_sub.commitment.set_rolled_in (true) logs rolled_in code', async () => {
    qSubSvc.setCommitmentRolledIn.mockResolvedValue({
      id: COMMITMENT_UUID,
      displayCode: 'cm-1',
      dossierLinkSectionId: '6',
      rolledIn: true,
    });
    await qSubCommitmentSetRolledIn(CTX, {
      commitmentId: COMMITMENT_UUID,
      rolledIn: true,
      confirm: 'yes',
      reason: 'this is a valid reason for rolling in',
    });
    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'agent.ana.q_sub.commitment.rolled_in' }),
    );
  });

  it('q_sub.commitment.set_rolled_in (false) logs rolled_out code', async () => {
    qSubSvc.setCommitmentRolledIn.mockResolvedValue({
      id: COMMITMENT_UUID,
      displayCode: 'cm-1',
      dossierLinkSectionId: '6',
      rolledIn: false,
    });
    await qSubCommitmentSetRolledIn(CTX, {
      commitmentId: COMMITMENT_UUID,
      rolledIn: false,
      confirm: 'yes',
      reason: 'commitment was reverted by RA',
    });
    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'agent.ana.q_sub.commitment.rolled_out' }),
    );
  });
});

// ─── Tenant errors map cleanly ──────────────────────────────────────────────

describe('tenant errors', () => {
  it('q_sub.create maps TenantAccessError to TENANT_ACCESS_DENIED', async () => {
    qSubSvc.createQSubmission.mockRejectedValue(new TenantAccessError('cross-tenant blocked'));
    const r = await qSubCreate(CTX, {
      programId: PROGRAM_UUID,
      qSubType: 'presub',
      title: 'x',
      confirm: 'yes',
      reason: 'this is a sufficient reason',
    });
    expect(r.success).toBe(false);
    expect(r.error).toBe('TENANT_ACCESS_DENIED');
  });

  it('q_sub.commitment maps TenantAccessError to TENANT_ACCESS_DENIED', async () => {
    qSubSvc.setCommitmentRolledIn.mockRejectedValue(new TenantAccessError('cross-tenant blocked'));
    const r = await qSubCommitmentSetRolledIn(CTX, {
      commitmentId: COMMITMENT_UUID,
      rolledIn: true,
      confirm: 'yes',
      reason: 'this is a sufficient reason',
    });
    expect(r.error).toBe('TENANT_ACCESS_DENIED');
  });
});

// ─── Section approve ────────────────────────────────────────────────────────

describe('section.approve', () => {
  const goodGate = { confirm: 'yes', reason: 'peer review complete; approved' };

  it('refuses unknown status', async () => {
    const r = await sectionApprove(CTX, {
      ...goodGate,
      sectionId: 42,
      status: 'rejected',
    });
    expect(r.error).toBe('INVALID_INPUT');
  });

  it('returns NOT_FOUND when section not in org', async () => {
    sectionPool.query.mockResolvedValueOnce({ rows: [] });
    const r = await sectionApprove(CTX, {
      ...goodGate,
      sectionId: 42,
      status: 'validated',
    });
    expect(r.success).toBe(false);
    expect(r.error).toBe('NOT_FOUND');
  });

  it('updates and audits on success', async () => {
    sectionPool.query
      .mockResolvedValueOnce({
        rows: [{ id: 42, section_number: '6.0', section_title: 'SE', status: 'todo' }],
      })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE
    const r = await sectionApprove(CTX, {
      ...goodGate,
      sectionId: 42,
      status: 'validated',
    });
    expect(r.success).toBe(true);
    expect(r.data?.newStatus).toBe('validated');
    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'agent.ana.section.approve' }),
    );
  });
});

// ─── Section update (content edit via chat) ────────────────────────────────

describe('section.update', () => {
  const goodGate = { confirm: 'yes', reason: 'predicate analysis finalized after PSC review' };

  it('rejects without confirm', async () => {
    const r = await sectionUpdate(CTX, { sectionId: 42, content: 'new body' });
    expect(r.action).toBe('confirmation_required');
    expect(sectionPool.query).not.toHaveBeenCalled();
  });

  it('rejects non-numeric sectionId', async () => {
    const r = await sectionUpdate(CTX, { ...goodGate, sectionId: 'forty-two', content: 'x' });
    expect(r.error).toBe('INVALID_INPUT');
    expect(r.message).toMatch(/sectionId/);
  });

  it('rejects non-string content', async () => {
    const r = await sectionUpdate(CTX, { ...goodGate, sectionId: 42, content: 123 });
    expect(r.error).toBe('INVALID_INPUT');
    expect(r.message).toMatch(/content/);
  });

  it('rejects oversize content (>1MB)', async () => {
    const r = await sectionUpdate(CTX, {
      ...goodGate,
      sectionId: 42,
      content: 'a'.repeat(1_000_001),
    });
    expect(r.error).toBe('INVALID_INPUT');
    expect(r.message).toMatch(/1MB/);
  });

  it('rejects unknown status', async () => {
    const r = await sectionUpdate(CTX, {
      ...goodGate,
      sectionId: 42,
      content: 'x',
      status: 'rejected',
    });
    expect(r.error).toBe('INVALID_INPUT');
    expect(r.message).toMatch(/status/);
  });

  it('rejects out-of-range completionPercentage', async () => {
    const r = await sectionUpdate(CTX, {
      ...goodGate,
      sectionId: 42,
      content: 'x',
      completionPercentage: 150,
    });
    expect(r.error).toBe('INVALID_INPUT');
    expect(r.message).toMatch(/completionPercentage/);
  });

  it('returns NOT_FOUND when section not in org', async () => {
    sectionPool.query.mockResolvedValueOnce({ rows: [] });
    const r = await sectionUpdate(CTX, { ...goodGate, sectionId: 42, content: 'new body' });
    expect(r.success).toBe(false);
    expect(r.error).toBe('NOT_FOUND');
  });

  it('updates content, writes a version row, audits agent.ana.section.edit', async () => {
    sectionPool.query
      // SELECT existing
      .mockResolvedValueOnce({
        rows: [{
          id: 42,
          section_number: '6.0',
          section_title: 'Substantial Equivalence',
          status: 'drafting',
          content: 'old body',
          completion_percentage: 40,
        }],
      })
      // UPDATE cerv2_510k_sections
      .mockResolvedValueOnce({ rows: [] })
      // SELECT MAX(version_number)
      .mockResolvedValueOnce({ rows: [{ max_version: 3 }] })
      // INSERT cerv2_section_versions
      .mockResolvedValueOnce({ rows: [] });

    const r = await sectionUpdate(CTX, {
      ...goodGate,
      sectionId: 42,
      content: 'OR-801 is substantially equivalent to K191822.',
      status: 'validated',
      completionPercentage: 100,
    });

    expect(r.success).toBe(true);
    expect(r.data?.versionNumber).toBe(4);
    expect(r.data?.previousLength).toBe('old body'.length);
    expect(r.data?.newLength).toBe('OR-801 is substantially equivalent to K191822.'.length);
    expect(r.data?.status).toBe('validated');
    expect(r.data?.completionPercentage).toBe(100);

    // Four queries: SELECT existing, UPDATE, SELECT max(version), INSERT version.
    expect(sectionPool.query).toHaveBeenCalledTimes(4);

    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'agent.ana.section.edit',
        tenantId: 11,
        userId: 7,
        resourceType: 'cerv2_510k_section',
        resourceId: '42',
        details: expect.objectContaining({
          actorKind: 'agent:ana',
          sectionNumber: '6.0',
          versionNumber: 4,
          fieldsChanged: expect.arrayContaining(['content', 'status', 'completion_percentage']),
          previousLength: 'old body'.length,
          statusChanged: 'drafting → validated',
        }),
      }),
    );
  });

  it('preserves status when caller omits it (content-only edit)', async () => {
    sectionPool.query
      .mockResolvedValueOnce({
        rows: [{
          id: 42,
          section_number: '6.0',
          section_title: 'SE',
          status: 'drafting',
          content: 'old',
          completion_percentage: 40,
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ max_version: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    const r = await sectionUpdate(CTX, {
      ...goodGate,
      sectionId: 42,
      content: 'new body',
    });

    expect(r.success).toBe(true);
    expect(r.data?.status).toBe('drafting'); // unchanged
    expect(r.data?.versionNumber).toBe(1);
    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          fieldsChanged: ['content'],
          statusChanged: null,
        }),
      }),
    );
  });
});

// ─── ESG transmit (stricter gate) ──────────────────────────────────────────

describe('k510_workflow.transmit', () => {
  it('refuses confirm="yes" — requires "yes-transmit"', async () => {
    const r = await esgTransmit(CTX, {
      projectId: 99,
      confirm: 'yes',
      reason: 'this is a sufficient reason for a normal mutation',
    });
    expect(r.action).toBe('confirmation_required');
    expect(esgSvc.submitToFDA).not.toHaveBeenCalled();
  });

  it('requires reason ≥ 30 chars', async () => {
    const r = await esgTransmit(CTX, {
      projectId: 99,
      confirm: 'yes-transmit',
      reason: 'short reason',
    });
    expect(r.action).toBe('confirmation_required');
    expect(r.error).toBe('REASON_TOO_SHORT');
  });

  it('proceeds and audits agent.ana.k510_workflow.transmit on success', async () => {
    esgSvc.submitToFDA.mockResolvedValue({ packageId: 'pkg-1', transactionId: 'tx-1' });
    const r = await esgTransmit(CTX, {
      projectId: 99,
      confirm: 'yes-transmit',
      reason: 'pre-flight green; RA + QA sign-off complete; all blockers cleared',
    });
    expect(r.success).toBe(true);
    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'agent.ana.k510_workflow.transmit' }),
    );
  });

  it('logs transmit.failed when underlying service throws', async () => {
    esgSvc.submitToFDA.mockRejectedValue(new Error('ESG unreachable'));
    const r = await esgTransmit(CTX, {
      projectId: 99,
      confirm: 'yes-transmit',
      reason: 'pre-flight green; RA + QA sign-off complete; all blockers cleared',
    });
    expect(r.success).toBe(false);
    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'agent.ana.k510_workflow.transmit.failed' }),
    );
  });
});

// ─── Pre-flight is read-only ───────────────────────────────────────────────

describe('k510_workflow.preflight (read-only, no confirm)', () => {
  it('rejects missing projectId', async () => {
    const r = await preflightModule(CTX, { moduleCode: 'm1' });
    expect(r.error).toBe('INVALID_INPUT');
  });

  it('rejects missing moduleCode', async () => {
    const r = await preflightModule(CTX, { projectId: 1 });
    expect(r.error).toBe('INVALID_INPUT');
  });

  it('does NOT require confirm + reason (read-only action)', async () => {
    // Stub global fetch.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ overall: 'green', majorBlockers: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = await preflightModule(CTX, {
      projectId: 1,
      moduleCode: 'm1',
    });
    expect(r.success).toBe(true);
    expect(r.action).toBe('k510_workflow.preflight');
  });
});
