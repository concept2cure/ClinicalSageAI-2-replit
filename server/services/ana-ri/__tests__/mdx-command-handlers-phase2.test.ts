/**
 * Phase-2 MDX command handler tests.
 *
 * Mirrors the phase-1 contract: confirm + reason gate, input validation,
 * audit emission, error mapping. One representative test per handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const ownership = vi.hoisted(() => ({ check: vi.fn(async (_programId: string, _orgId: number) => true) }));
const { svc, audit } = vi.hoisted(() => ({
  svc: {
    upsertMapping: vi.fn(),
    createDocument: vi.fn(),
    approveDocument: vi.fn(),
    assessSufficiency: vi.fn(),
    runReviewerSimulation: vi.fn(),
  },
  audit: { logAction: vi.fn().mockResolvedValue({ persisted: true, chained: true, tamperProof: true }) },
}));

vi.mock('../../gspr-postmarket/gspr.service', () => ({
  upsertMapping: (...a: any[]) => svc.upsertMapping(...a),
}));

vi.mock('../../gspr-postmarket/post-market.service', () => ({
  approveDocument: (...a: any[]) => svc.approveDocument(...a),
  createDocument: (...a: any[]) => svc.createDocument(...a),
  supersedeDocument: vi.fn(),
  updateDocument: vi.fn(),
  validateDocument: vi.fn(() => ({ valid: true, findings: [] })),
  getDocument: vi.fn(),
}));

// post_market.document.create authors through the canonical engine (PR #1315
// port): the same authorPostMarketDocument the REST /generate route uses.
const authoring = vi.hoisted(() => ({
  author: vi.fn(),
  TYPES: ['pms_plan', 'pms_report', 'pmcf_plan', 'pmcf_evaluation', 'psur', 'sscp'],
}));
vi.mock('../../gspr-postmarket/post-market-authoring', () => ({
  authorPostMarketDocument: (...a: any[]) => authoring.author(...a),
  AUTHORABLE_DOCUMENT_TYPES: authoring.TYPES,
}));

vi.mock('../../evidence-sufficiency/evidence-sufficiency.service', () => ({
  assessSufficiency: (...a: any[]) => svc.assessSufficiency(...a),
}));

vi.mock('../../intelligence-engine/reviewer-simulator.service', () => ({
  runReviewerSimulation: (...a: any[]) => svc.runReviewerSimulation(...a),
}));

vi.mock('../../auditService', () => ({ default: audit }));
// The tool proves program ownership through the canonical guard (ledger L195);
// these tests exercise what happens after it answers, so it answers yes unless a
// case says otherwise.
// The one program check (server/services/c2c/program-access.ts), answered by the test.
vi.mock('../../c2c/program-access', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  programInOrganization: (_db: unknown, programId: string, orgId: number) => ownership.check(programId, orgId),
}));
vi.mock('../../c2c/program-access.js', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  programInOrganization: (_db: unknown, programId: string, orgId: number) => ownership.check(programId, orgId),
}));


import {
  gsprMappingUpsert,
  postMarketDocumentCreate,
  postMarketDocumentApprove,
  evidenceSufficiencyAssess,
  reviewerSimulationRun,
} from '../mdx-command-handlers-phase2';

const CTX = { userId: 7, organizationId: 11 };
const PROGRAM_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const goodGate = { confirm: 'yes', reason: 'a sufficient explanatory reason' };

beforeEach(() => vi.clearAllMocks());

describe('gspr.mapping.upsert', () => {
  it('refuses without confirm', async () => {
    const r = await gsprMappingUpsert(CTX, {
      programId: PROGRAM_UUID,
      requirementId: 'r-1',
      applicability: 'applicable',
    });
    expect(r.action).toBe('confirmation_required');
    expect(svc.upsertMapping).not.toHaveBeenCalled();
  });

  it("refuses a program that is not the caller's, and writes nothing", async () => {
    ownership.check.mockResolvedValueOnce(false);
    const r = await gsprMappingUpsert(CTX, {
      ...goodGate,
      programId: PROGRAM_UUID,
      requirementId: 'r-1',
      applicability: 'applicable',
    });
    expect(r.error).toBe('NOT_FOUND');
    expect(svc.upsertMapping).not.toHaveBeenCalled();
  });

  it('says so when ownership could not be checked, and writes nothing', async () => {
    ownership.check.mockRejectedValueOnce(
      Object.assign(new Error('program ownership check could not be run'), { name: 'VerificationUnavailableError' })
    );
    const r = await gsprMappingUpsert(CTX, {
      ...goodGate,
      programId: PROGRAM_UUID,
      requirementId: 'r-1',
      applicability: 'applicable',
    });
    expect(r.error).toBe('OWNERSHIP_UNVERIFIABLE');
    expect(r.message).toMatch(/Do not tell the user the program does not exist/);
    expect(svc.upsertMapping).not.toHaveBeenCalled();
  });

  it('rejects non-uuid programId', async () => {
    const r = await gsprMappingUpsert(CTX, {
      ...goodGate,
      programId: 'p-1',
      requirementId: 'r-1',
      applicability: 'applicable',
    });
    expect(r.error).toBe('INVALID_INPUT');
  });

  it('audits agent.ana.gspr.mapping.upsert on success', async () => {
    svc.upsertMapping.mockResolvedValue({ id: 'm-1' });
    const r = await gsprMappingUpsert(CTX, {
      ...goodGate,
      programId: PROGRAM_UUID,
      requirementId: 'r-1',
      applicability: 'applicable',
    });
    expect(r.success).toBe(true);
    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'agent.ana.gspr.mapping.upsert',
        details: expect.objectContaining({ actorKind: 'agent:ana' }),
      }),
    );
  });
});

describe('post_market.document.create', () => {
  const authored = {
    document: { id: 'd-1', documentType: 'psur', code: 'PSUR', title: 'PSUR — Acme (draft)', version: 2, status: 'draft' },
    validation: { passesGate: false, criticalCount: 1, warningCount: 2, findings: [{ severity: 'critical', message: 'x' }] },
  };

  it('rejects missing required fields', async () => {
    const r = await postMarketDocumentCreate(CTX, {
      ...goodGate,
      programId: PROGRAM_UUID,
      // missing documentType / device
    });
    expect(r.error).toBe('INVALID_INPUT');
  });

  it('refuses a documentType the engine cannot author, and writes nothing', async () => {
    // 'PMCF' is not a post_market_documents type; the handler used to cast it
    // through `as any` and INSERT a row no validator has an entry for.
    const r = await postMarketDocumentCreate(CTX, {
      ...goodGate,
      programId: PROGRAM_UUID,
      documentType: 'PMCF',
      code: 'PMCF-1',
      title: 'Q3 PMCF',
      deviceName: 'Acme Stent',
    });
    expect(r.error).toBe('INVALID_INPUT');
    expect(r.message).toContain(authoring.TYPES.join(', '));
    expect(svc.createDocument).not.toHaveBeenCalled();
    expect(authoring.author).not.toHaveBeenCalled();
  });

  it('requires a device (deviceName or relatedCerReportId), and writes nothing', async () => {
    const r = await postMarketDocumentCreate(CTX, {
      ...goodGate,
      programId: PROGRAM_UUID,
      documentType: 'psur',
      code: 'PSUR-1',
      title: 'PSUR 2026',
    });
    expect(r.error).toBe('INVALID_INPUT');
    expect(svc.createDocument).not.toHaveBeenCalled();
    expect(authoring.author).not.toHaveBeenCalled();
  });

  it("refuses a program that is not the caller's, and writes nothing", async () => {
    ownership.check.mockResolvedValueOnce(false);
    const r = await postMarketDocumentCreate(CTX, {
      ...goodGate,
      programId: PROGRAM_UUID,
      documentType: 'psur',
      deviceName: 'Acme Stent',
    });
    expect(r.error).toBe('NOT_FOUND');
    expect(authoring.author).not.toHaveBeenCalled();
    expect(svc.createDocument).not.toHaveBeenCalled();
  });

  it('authors through the canonical engine (scaffold + version + validation), not a bare INSERT, and audits', async () => {
    authoring.author.mockResolvedValue(authored);
    const r = await postMarketDocumentCreate(CTX, {
      ...goodGate,
      programId: PROGRAM_UUID,
      documentType: 'psur',
      deviceName: 'Acme Stent',
      deviceClass: 'III',
      regulation: 'MDR',
      reportingPeriodStart: '2025-01-01',
      reportingPeriodEnd: 'not-a-date',
    });
    expect(r.success).toBe(true);
    expect(svc.createDocument).not.toHaveBeenCalled();
    expect(authoring.author).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: CTX.organizationId,
        programId: PROGRAM_UUID,
        documentType: 'psur',
        deviceName: 'Acme Stent',
        deviceClass: 'III',
        regulation: 'MDR',
        createdBy: `ana:${CTX.userId}`,
        reportingPeriodStart: new Date('2025-01-01'),
        // An unparseable date is left for the engine to default AND flag, never "now".
        reportingPeriodEnd: undefined,
      }),
    );
    expect((r.data as any).validation.passesGate).toBe(false);
    expect(r.message).toMatch(/does NOT pass the compliance gate/i);
    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'agent.ana.post_market.document.create' }),
    );
  });
});

describe('post_market.document.approve', () => {
  it('audits .approve on success', async () => {
    svc.approveDocument.mockResolvedValue({ ok: true });
    const r = await postMarketDocumentApprove(CTX, {
      ...goodGate,
      documentId: 'd-1',
      signatureId: 'sig-1',
    });
    expect(r.success).toBe(true);
    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'agent.ana.post_market.document.approve' }),
    );
  });

  it('audits .approve.blocked when service refuses', async () => {
    svc.approveDocument.mockResolvedValue({ error: 'GATE_BLOCKED', validation: {} });
    const r = await postMarketDocumentApprove(CTX, {
      ...goodGate,
      documentId: 'd-1',
    });
    expect(r.success).toBe(false);
    expect(r.error).toBe('GATE_BLOCKED');
    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'agent.ana.post_market.document.approve.blocked' }),
    );
  });
});

describe('evidence_sufficiency.assess', () => {
  it('rejects unknown pathway', async () => {
    const r = await evidenceSufficiencyAssess(CTX, {
      ...goodGate,
      programId: PROGRAM_UUID,
      pathway: 'INVALID',
      profile: { isSoftware: true },
    });
    expect(r.error).toBe('INVALID_INPUT');
  });

  it('audits on success and tags trigger=ana', async () => {
    svc.assessSufficiency.mockResolvedValue({ id: 'a-1', verdict: 'sufficient', overallScore: 90 });
    await evidenceSufficiencyAssess(CTX, {
      ...goodGate,
      programId: PROGRAM_UUID,
      pathway: '510K',
      profile: { isSoftware: true },
    });
    expect(svc.assessSufficiency).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'ana', triggeredBy: 'ana:7' }),
    );
    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'agent.ana.evidence_sufficiency.assess' }),
    );
  });
});

describe('reviewer_simulation.run', () => {
  it('rejects when program object missing', async () => {
    const r = await reviewerSimulationRun(CTX, {
      ...goodGate,
      programId: PROGRAM_UUID,
      // missing program / intel
    });
    expect(r.error).toBe('INVALID_INPUT');
  });

  it('audits on success with personaCount detail', async () => {
    svc.runReviewerSimulation.mockResolvedValue({ runId: 'rs-1' });
    await reviewerSimulationRun(CTX, {
      ...goodGate,
      programId: PROGRAM_UUID,
      program: { id: PROGRAM_UUID },
      intel: { facts: [] },
      personas: ['ortho', 'cyber', 'cmc'],
    });
    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'agent.ana.reviewer_simulation.run',
        details: expect.objectContaining({ personaCount: 3 }),
      }),
    );
  });
});
