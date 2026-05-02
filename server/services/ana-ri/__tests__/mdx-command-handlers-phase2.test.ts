/**
 * Phase-2 MDX command handler tests.
 *
 * Mirrors the phase-1 contract: confirm + reason gate, input validation,
 * audit emission, error mapping. One representative test per handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { svc, audit } = vi.hoisted(() => ({
  svc: {
    upsertMapping: vi.fn(),
    createDocument: vi.fn(),
    approveDocument: vi.fn(),
    assessSufficiency: vi.fn(),
    runReviewerSimulation: vi.fn(),
  },
  audit: { logAction: vi.fn().mockResolvedValue(undefined) },
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

vi.mock('../../evidence-sufficiency/evidence-sufficiency.service', () => ({
  assessSufficiency: (...a: any[]) => svc.assessSufficiency(...a),
}));

vi.mock('../../intelligence-engine/reviewer-simulator.service', () => ({
  runReviewerSimulation: (...a: any[]) => svc.runReviewerSimulation(...a),
}));

vi.mock('../../auditService', () => ({ default: audit }));

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
  it('rejects missing required fields', async () => {
    const r = await postMarketDocumentCreate(CTX, {
      ...goodGate,
      programId: PROGRAM_UUID,
      // missing documentType / code / title
    });
    expect(r.error).toBe('INVALID_INPUT');
  });

  it('audits on success', async () => {
    svc.createDocument.mockResolvedValue({ id: 'd-1', code: 'PMCF-1' });
    const r = await postMarketDocumentCreate(CTX, {
      ...goodGate,
      programId: PROGRAM_UUID,
      documentType: 'PMCF',
      code: 'PMCF-1',
      title: 'Q3 PMCF',
    });
    expect(r.success).toBe(true);
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
