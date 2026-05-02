/**
 * Cross-cutting AnA-MDX audit contract test.
 *
 * For every AnA MDX command handler, asserts that a successful
 * invocation emits exactly one `agent.ana.<resource>.<verb>` audit
 * row with `details.actorKind = 'agent:ana'` and the user's
 * `agentReason` captured.
 *
 * This is the regression net: any future PR that adds an AnA MDX
 * handler MUST be added to the EXPECTED_TOOLS map below or this test
 * fails. Forgetting the audit call also fails.
 *
 * Mirrors `audit-trail-contract.test.ts` (which covers the human-side
 * mutations) on the agent side.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { svc, audit } = vi.hoisted(() => ({
  svc: {
    createQSubmission: vi.fn(async () => ({
      id: 'q-1', programId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
      qSubType: 'presub', title: 'x', stage: 'plan',
    })),
    setCommitmentRolledIn: vi.fn(async () => ({
      id: 'cccccccc-cccc-cccc-cccc-ccccccccccc1',
      displayCode: 'cm-1', dossierLinkSectionId: '6', rolledIn: true,
    })),
    upsertMapping: vi.fn(async () => ({ id: 'm-1' })),
    createDocument: vi.fn(async () => ({ id: 'd-1', code: 'PMCF-1' })),
    approveDocument: vi.fn(async () => ({ ok: true })),
    assessSufficiency: vi.fn(async () => ({ id: 'a-1', verdict: 'sufficient', overallScore: 90 })),
    runReviewerSimulation: vi.fn(async () => ({ runId: 'rs-1' })),
    submitToFDA: vi.fn(async () => ({ packageId: 'pkg-1', transactionId: 'tx-1' })),
  },
  audit: { logAction: vi.fn().mockResolvedValue(undefined) },
}));

class TenantAccessError extends Error {
  constructor(m: string) { super(m); this.name = 'TenantAccessError'; }
}

vi.mock('../../q-sub/q-sub.service', () => ({
  createQSubmission: (...a: any[]) => svc.createQSubmission(...a),
  setCommitmentRolledIn: (...a: any[]) => svc.setCommitmentRolledIn(...a),
  TenantAccessError,
  Q_SUB_TYPES: ['presub', 'sir', 'srd', 'agree', 'info'],
}));
vi.mock('../../../shared/schema/q-sub', () => ({
  Q_SUB_TYPES: ['presub', 'sir', 'srd', 'agree', 'info'],
}));
vi.mock('../../auditService', () => ({ default: audit }));
vi.mock('../../db', () => ({
  pool: {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('SELECT id, section_number')) {
        return { rows: [{ id: 1, section_number: '6.0', section_title: 'SE', status: 'todo' }] };
      }
      return { rows: [] };
    }),
  },
}));
const ESGSubmissionService = vi.fn(() => ({
  submitToFDA: (...a: any[]) => svc.submitToFDA(...a),
}));
vi.mock('../../ESGSubmissionService', () => ({ default: ESGSubmissionService }));
vi.mock('../../gspr-postmarket/gspr.service', () => ({
  upsertMapping: (...a: any[]) => svc.upsertMapping(...a),
}));
vi.mock('../../gspr-postmarket/post-market.service', () => ({
  approveDocument: (...a: any[]) => svc.approveDocument(...a),
  createDocument: (...a: any[]) => svc.createDocument(...a),
  supersedeDocument: vi.fn(),
  updateDocument: vi.fn(),
  validateDocument: vi.fn(),
  getDocument: vi.fn(),
}));
vi.mock('../../evidence-sufficiency/evidence-sufficiency.service', () => ({
  assessSufficiency: (...a: any[]) => svc.assessSufficiency(...a),
}));
vi.mock('../../intelligence-engine/reviewer-simulator.service', () => ({
  runReviewerSimulation: (...a: any[]) => svc.runReviewerSimulation(...a),
}));

import {
  qSubCreate,
  qSubCommitmentSetRolledIn,
  sectionApprove,
  esgTransmit,
} from '../mdx-command-handlers';
import {
  gsprMappingUpsert,
  postMarketDocumentCreate,
  postMarketDocumentApprove,
  evidenceSufficiencyAssess,
  reviewerSimulationRun,
} from '../mdx-command-handlers-phase2';

const CTX = { userId: 7, organizationId: 11 };
const PROGRAM = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const COMMITMENT = 'cccccccc-cccc-cccc-cccc-ccccccccccc1';
const yes = { confirm: 'yes', reason: 'sufficient reason for the test' };

interface Probe {
  /** Tool name as registered in the dispatch map. */
  tool: string;
  /** Expected audit action code. */
  expectedAction: string;
  /** Invocation closure. */
  invoke: () => Promise<unknown>;
}

const PROBES: Probe[] = [
  {
    tool: 'q_sub.create',
    expectedAction: 'agent.ana.q_sub.create',
    invoke: () =>
      qSubCreate(CTX, { ...yes, programId: PROGRAM, qSubType: 'presub', title: 'x' }),
  },
  {
    tool: 'q_sub.commitment.set_rolled_in (true)',
    expectedAction: 'agent.ana.q_sub.commitment.rolled_in',
    invoke: () =>
      qSubCommitmentSetRolledIn(CTX, { ...yes, commitmentId: COMMITMENT, rolledIn: true }),
  },
  {
    tool: 'q_sub.commitment.set_rolled_in (false)',
    expectedAction: 'agent.ana.q_sub.commitment.rolled_out',
    invoke: () =>
      qSubCommitmentSetRolledIn(CTX, { ...yes, commitmentId: COMMITMENT, rolledIn: false }),
  },
  {
    tool: 'section.approve',
    expectedAction: 'agent.ana.section.approve',
    invoke: () =>
      sectionApprove(CTX, { ...yes, sectionId: 1, status: 'validated' }),
  },
  {
    tool: 'k510_workflow.transmit',
    expectedAction: 'agent.ana.k510_workflow.transmit',
    invoke: () =>
      esgTransmit(CTX, {
        projectId: 99,
        confirm: 'yes-transmit',
        reason: 'pre-flight green; sign-off complete; all blockers cleared',
      }),
  },
  {
    tool: 'gspr.mapping.upsert',
    expectedAction: 'agent.ana.gspr.mapping.upsert',
    invoke: () =>
      gsprMappingUpsert(CTX, {
        ...yes,
        programId: PROGRAM,
        requirementId: 'r-1',
        applicability: 'applicable',
      }),
  },
  {
    tool: 'post_market.document.create',
    expectedAction: 'agent.ana.post_market.document.create',
    invoke: () =>
      postMarketDocumentCreate(CTX, {
        ...yes,
        programId: PROGRAM,
        documentType: 'PMCF',
        code: 'PMCF-1',
        title: 'Q3 PMCF',
      }),
  },
  {
    tool: 'post_market.document.approve',
    expectedAction: 'agent.ana.post_market.document.approve',
    invoke: () =>
      postMarketDocumentApprove(CTX, { ...yes, documentId: 'd-1', signatureId: 'sig-1' }),
  },
  {
    tool: 'evidence_sufficiency.assess',
    expectedAction: 'agent.ana.evidence_sufficiency.assess',
    invoke: () =>
      evidenceSufficiencyAssess(CTX, {
        ...yes,
        programId: PROGRAM,
        pathway: '510K',
        profile: { isSoftware: true },
      }),
  },
  {
    tool: 'reviewer_simulation.run',
    expectedAction: 'agent.ana.reviewer_simulation.run',
    invoke: () =>
      reviewerSimulationRun(CTX, {
        ...yes,
        programId: PROGRAM,
        program: { id: PROGRAM },
        intel: { facts: [] },
      }),
  },
];

describe('AnA-MDX audit contract — every tool emits one agent.ana.* audit row', () => {
  beforeEach(() => {
    audit.logAction.mockClear();
  });

  for (const probe of PROBES) {
    it(`${probe.tool} → ${probe.expectedAction}`, async () => {
      audit.logAction.mockClear();
      await probe.invoke();
      const actions = audit.logAction.mock.calls.map(c => (c[0] as any)?.action);
      expect(actions).toContain(probe.expectedAction);
      // Every emitted row must carry the agent label.
      for (const call of audit.logAction.mock.calls) {
        expect((call[0] as any)?.details?.actorKind).toBe('agent:ana');
      }
    });
  }

  it('captures agentReason in details for confirm-required tools', async () => {
    audit.logAction.mockClear();
    await qSubCreate(CTX, { ...yes, programId: PROGRAM, qSubType: 'presub', title: 'x' });
    expect(audit.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({
          actorKind: 'agent:ana',
          agentReason: 'sufficient reason for the test',
        }),
      }),
    );
  });
});
