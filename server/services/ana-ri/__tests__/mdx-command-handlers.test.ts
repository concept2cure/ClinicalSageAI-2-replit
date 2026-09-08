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

const { qSubSvc, sectionPool, governedTransmit, audit, TenantAccessError, kitWrite, KitSectionNotFoundError } = vi.hoisted(() => {
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
      connect: vi.fn(),
    },
    // The one kit-section writer (services/cerv2/kit-section-write, ledger
    // L160), doubled: what this suite pins is that the command opens a
    // transaction, hands its client to the writer, and commits or rolls back.
    kitWrite: { writeKitSectionTx: vi.fn() },
    KitSectionNotFoundError: class KitSectionNotFoundError extends Error {
      readonly code = 'KIT_SECTION_NOT_FOUND';
    },
    governedTransmit: {
      executeGovernedTransmit: vi.fn(),
    },
    audit: { logAction: vi.fn().mockResolvedValue({ persisted: true, chained: true, tamperProof: true }) },
    TenantAccessError,
  };
});

vi.mock('../../cerv2/kit-section-write', () => ({
  writeKitSectionTx: kitWrite.writeKitSectionTx,
  KitSectionNotFoundError,
}));

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

// The 510(k) transmit handler runs the SHARED governed transmit that the HTTP
// route runs (server/services/submission-gateways/governed-transmit.ts), which
// ends at the real FDA ESG AS2 gateway. These tests are about the handler's own
// gates, so the shared service is stubbed here; that the handler genuinely
// reaches the real gateway — and how it refuses without credentials — is
// covered end-to-end in ./mdx-esg-transmit-gateway.test.ts, where only the
// network boundary is mocked.
vi.mock('../../submission-gateways/governed-transmit', () => ({
  executeGovernedTransmit: (...a: any[]) => governedTransmit.executeGovernedTransmit(...a),
}));
vi.mock('../../../routes/c2c/actions', () => ({
  recordGovernedAction: vi.fn().mockResolvedValue({ actionId: 'act_1', auditId: 'aud_1' }),
}));

import {
  qSubCreate,
  qSubCommitmentSetRolledIn,
  sectionApprove,
  sectionUpdate,
  esgTransmit,
  preflightModule,
} from '../mdx-command-handlers';
import { _resetMdxToolRateLimitersForTests } from '../mdx-tool-rate-limit';

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
  // The AnA tool rate limiter is a module-level singleton; in single-fork
  // vitest it persists across tests AND files. Multiple suites exercise
  // k510_workflow.transmit (5/hour ceiling), so without a reset a later
  // transmit test gets rate-limited and the gate returns success:false.
  _resetMdxToolRateLimitersForTests();
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

  function fakeClient() {
    const client = { query: vi.fn(async () => ({ rows: [] })), release: vi.fn() };
    sectionPool.connect.mockResolvedValueOnce(client);
    return client;
  }
  const WRITTEN = {
    row: { id: 42, section_number: '6.0', section_title: 'Substantial Equivalence', section_key: 'se', status: 'validated', completionPercentage: 100, draftedAt: null },
    before: { id: 42, section_number: '6.0', section_title: 'Substantial Equivalence', content: 'old body', status: 'drafting', completion_percentage: 40 },
    versionNumber: 4,
    fieldsChanged: ['content', 'status', 'completion_percentage'],
    gate: null,
  };

  it('returns NOT_FOUND when section not in org — and rolls the transaction back', async () => {
    const client = fakeClient();
    kitWrite.writeKitSectionTx.mockRejectedValueOnce(new KitSectionNotFoundError('Section 42 not found in your organization.'));
    const r = await sectionUpdate(CTX, { ...goodGate, sectionId: 42, content: 'new body' });
    expect(r.success).toBe(false);
    expect(r.error).toBe('NOT_FOUND');
    const statements = (client.query.mock.calls as unknown[][]).map((c) => c[0]);
    expect(statements).toEqual(['BEGIN', 'ROLLBACK']);
    expect(client.release).toHaveBeenCalled();
  });

  it('writes through the one kit-section writer inside a transaction, and audits agent.ana.section.edit', async () => {
    const client = fakeClient();
    kitWrite.writeKitSectionTx.mockResolvedValueOnce(WRITTEN);
    const content = 'OR-801 is substantially equivalent to K191822.';
    const r = await sectionUpdate(CTX, { ...goodGate, sectionId: 42, content, status: 'validated', completionPercentage: 100 });
    expect(r.success).toBe(true);
    expect(r.data?.versionNumber).toBe(4);
    expect(r.data?.previousLength).toBe('old body'.length);
    expect(r.data?.newLength).toBe(content.length);
    expect(r.data?.status).toBe('validated');
    expect(r.data?.completionPercentage).toBe(100);
    // The writer got THIS transaction's client, the org, the section, and the actor.
    expect(kitWrite.writeKitSectionTx).toHaveBeenCalledWith(
      client, 11, { sectionId: 42 },
      expect.objectContaining({ content, status: 'validated', completionPercentage: 100, actorUserId: 7, changedByName: 'ana:7' }),
    );
    expect((client.query.mock.calls as unknown[][]).map((c) => c[0])).toEqual(['BEGIN', 'COMMIT']);
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

  it('preserves status when caller omits it (content-only edit) — the writer is told nothing about status', async () => {
    fakeClient();
    kitWrite.writeKitSectionTx.mockResolvedValueOnce({
      ...WRITTEN,
      row: { ...WRITTEN.row, status: 'drafting', completionPercentage: 40 },
      versionNumber: 1,
      fieldsChanged: ['content'],
    });
    const r = await sectionUpdate(CTX, { ...goodGate, sectionId: 42, content: 'content-only edit body' });
    expect(r.success).toBe(true);
    expect(r.data?.status).toBe('drafting'); // unchanged
    expect(r.data?.versionNumber).toBe(1);
    expect(kitWrite.writeKitSectionTx).toHaveBeenLastCalledWith(
      expect.anything(), 11, { sectionId: 42 },
      expect.objectContaining({ status: null, completionPercentage: null }),
    );
  });
});

// ─── ESG transmit (stricter gate + Part 11 e-signature) ────────────────────

/** A dispatch that carries a server-verified Part 11 sign-off. */
const VERIFIED_AT = new Date('2026-08-14T10:00:00.000Z');
const SIGNED_CTX = {
  ...CTX,
  signoff: {
    reasonForChange: 'RA + QA sign-off complete; transmitting the cleared package',
    signatureVerified: true,
    signaturePurpose: 'approval',
    verifiedAt: VERIFIED_AT,
  },
};
const GOOD_TRANSMIT = {
  packageId: 42,
  environment: 'production',
  confirm: 'yes-transmit',
  reason: 'pre-flight green; RA + QA sign-off complete; all blockers cleared',
};

describe('k510_workflow.transmit', () => {
  it('refuses confirm="yes" — requires "yes-transmit"', async () => {
    const r = await esgTransmit(SIGNED_CTX, {
      ...GOOD_TRANSMIT,
      confirm: 'yes',
      reason: 'this is a sufficient reason for a normal mutation',
    });
    expect(r.action).toBe('confirmation_required');
    expect(governedTransmit.executeGovernedTransmit).not.toHaveBeenCalled();
  });

  it('requires reason ≥ 30 chars', async () => {
    const r = await esgTransmit(SIGNED_CTX, { ...GOOD_TRANSMIT, reason: 'short reason' });
    expect(r.action).toBe('confirmation_required');
    expect(r.error).toBe('REASON_TOO_SHORT');
    expect(governedTransmit.executeGovernedTransmit).not.toHaveBeenCalled();
  });

  it('refuses a chat dispatch that carries no verified Part 11 signature', async () => {
    // CTX has no `signoff`. The tenant's anaPart11Enforce flag is irrelevant —
    // an agency transmission is not something a tenant may opt out of.
    const r = await esgTransmit(CTX, GOOD_TRANSMIT);
    expect(r.success).toBe(false);
    expect(r.error).toBe('PART11_SIGNATURE_REQUIRED');
    expect(r.openModal).toBe('esign');
    expect(governedTransmit.executeGovernedTransmit).not.toHaveBeenCalled();
  });

  it('refuses a sign-off that claims verification but records no verification time', async () => {
    const r = await esgTransmit(
      { ...SIGNED_CTX, signoff: { ...SIGNED_CTX.signoff, verifiedAt: undefined } } as any,
      GOOD_TRANSMIT,
    );
    expect(r.success).toBe(false);
    expect(r.error).toBe('PART11_SIGNATURE_REQUIRED');
    expect(governedTransmit.executeGovernedTransmit).not.toHaveBeenCalled();
  });

  it('refuses a verified sign-off that declares no §11.50 signature meaning', async () => {
    const r = await esgTransmit(
      { ...SIGNED_CTX, signoff: { ...SIGNED_CTX.signoff, signaturePurpose: undefined } } as any,
      GOOD_TRANSMIT,
    );
    expect(r.success).toBe(false);
    expect(r.error).toBe('PART11_SIGNATURE_REQUIRED');
    expect(r.message).toMatch(/meaning/i);
    expect(governedTransmit.executeGovernedTransmit).not.toHaveBeenCalled();
  });

  it('refuses without an assembled packageId', async () => {
    const r = await esgTransmit(SIGNED_CTX, { ...GOOD_TRANSMIT, packageId: undefined });
    expect(r.error).toBe('INVALID_INPUT');
    expect(r.message).toMatch(/assembled/i);
    expect(governedTransmit.executeGovernedTransmit).not.toHaveBeenCalled();
  });

  it('never defaults the environment to production', async () => {
    const r = await esgTransmit(SIGNED_CTX, { ...GOOD_TRANSMIT, environment: undefined });
    expect(r.error).toBe('INVALID_INPUT');
    expect(r.message).toMatch(/environment/i);
    expect(governedTransmit.executeGovernedTransmit).not.toHaveBeenCalled();
  });

  it('hands the verified human gate to the governed transmit and audits it', async () => {
    governedTransmit.executeGovernedTransmit.mockResolvedValue({
      result: {
        transmittalId: 7,
        transmissionId: '<mdn-1@sponsor>',
        status: 'received',
        transport: 'as2',
        httpStatus: 200,
        ackReceivedAt: VERIFIED_AT,
        message: 'FDA ESG AS2 transmit accepted. MDN: <mdn-1@sponsor>.',
      },
      bundle: { sha256: 'a'.repeat(64), sizeBytes: 10, format: 'estar' },
      ledgerWriteFailed: false,
    });

    const r = await esgTransmit(SIGNED_CTX, GOOD_TRANSMIT);
    expect(r.success).toBe(true);

    const call = governedTransmit.executeGovernedTransmit.mock.calls[0][0];
    expect(call.region).toBe('fda');
    expect(call.gateway).toBe('esg');
    expect(call.packageId).toBe(42);
    expect(call.environment).toBe('production');
    // The verification instant travels verbatim — the handler must not
    // synthesise one.
    expect(call.reauthVerifiedAt).toBe(VERIFIED_AT);
    expect(call.reason).toBe(GOOD_TRANSMIT.reason);
    // The signer's declared purpose is the §11.50 meaning on the signature —
    // never a constant chosen by the platform.
    expect(call.meaning).toBe('approval');
    expect(call.authenticationMethod).toBe('password');

    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'agent.ana.k510_workflow.transmit',
        resourceType: 'submission_transmittal',
        details: expect.objectContaining({ transmittalId: 7, environment: 'production' }),
      }),
    );
  });

  it('reports a missing-credentials CredentialError as a structured refusal, never a success', async () => {
    const credErr = Object.assign(
      new Error(
        'FDA esg credentials are not configured for production: missing FDA_ESG_URL, FDA_ESG_AS2_FROM.',
      ),
      { name: 'CredentialError' },
    );
    governedTransmit.executeGovernedTransmit.mockRejectedValue(credErr);

    const r = await esgTransmit(SIGNED_CTX, GOOD_TRANSMIT);
    expect(r.success).toBe(false);
    expect(r.error).toBe('GATEWAY_NOT_CONFIGURED');
    expect(r.message).toMatch(/FDA_ESG_URL/);
    expect(r.message).toMatch(/FDA_ESG_AS2_FROM/);
    expect(r.message).toMatch(/no FDA acknowledgement exists/i);
    // No identifier of any kind is minted for a transmission that never happened.
    expect(r.data).toBeUndefined();
    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'agent.ana.k510_workflow.transmit.failed' }),
    );
  });

  it('surfaces a pre-transmit refusal under its own code', async () => {
    const refusal = Object.assign(
      new Error('No assembled bundle; call POST /api/submission-ops/packages/:packageId/assemble first.'),
      { name: 'GovernedTransmitRefusal', code: 'BUNDLE_NOT_ASSEMBLED' },
    );
    governedTransmit.executeGovernedTransmit.mockRejectedValue(refusal);

    const r = await esgTransmit(SIGNED_CTX, GOOD_TRANSMIT);
    expect(r.success).toBe(false);
    expect(r.error).toBe('BUNDLE_NOT_ASSEMBLED');
  });

  it('logs transmit.failed when the gateway transport throws', async () => {
    governedTransmit.executeGovernedTransmit.mockRejectedValue(
      Object.assign(new Error('ESG AS2 POST timeout'), { name: 'TransportError' }),
    );
    const r = await esgTransmit(SIGNED_CTX, GOOD_TRANSMIT);
    expect(r.success).toBe(false);
    expect(r.error).toBe('TRANSMIT_FAILED');
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
