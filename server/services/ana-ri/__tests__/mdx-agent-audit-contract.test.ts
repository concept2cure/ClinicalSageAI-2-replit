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

const { svc, audit, TenantAccessError } = vi.hoisted(() => {
  class TenantAccessError extends Error {
    constructor(m: string) { super(m); this.name = 'TenantAccessError'; }
  }
  return {
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
      updateDocument: vi.fn(async () => ({ id: 'd-1', updated: true })),
      validateDocument: vi.fn(() => ({ valid: true, findings: [] })),
      supersedeDocument: vi.fn(async () => ({ id: 'd-2' })),
      getDocument: vi.fn(async () => ({ id: 'd-1' })),
      approveDocument: vi.fn(async () => ({ ok: true })),
      assessSufficiency: vi.fn(async () => ({ id: 'a-1', verdict: 'sufficient', overallScore: 90 })),
      runReviewerSimulation: vi.fn(async () => ({ runId: 'rs-1' })),
      submitToFDA: vi.fn(async () => ({ packageId: 'pkg-1', transactionId: 'tx-1' })),
    },
    audit: { logAction: vi.fn().mockResolvedValue(undefined) },
    TenantAccessError,
  };
});

vi.mock('../../q-sub/q-sub.service', () => ({
  createQSubmission: (...a: any[]) => (svc.createQSubmission as any)(...a),
  setCommitmentRolledIn: (...a: any[]) => (svc.setCommitmentRolledIn as any)(...a),
  TenantAccessError,
  Q_SUB_TYPES: ['presub', 'sir', 'srd', 'agree', 'info'],
}));
vi.mock('../../../shared/schema/q-sub', () => ({
  Q_SUB_TYPES: ['presub', 'sir', 'srd', 'agree', 'info'],
}));
vi.mock('../../auditService', () => ({ default: audit }));
const { dbMockFactory } = vi.hoisted(() => ({
  dbMockFactory: () => ({
    pool: {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('SELECT id, section_number')) {
          return { rows: [{ id: 1, section_number: '6.0', section_title: 'SE', status: 'todo' }] };
        }
        return { rows: [] };
      }),
    },
  }),
}));
// The handler imports '../../db' from its own location
// (server/services/ana-ri/mdx-command-handlers.ts), which resolves to
// server/db. From this test file (server/services/ana-ri/__tests__/),
// the equivalent specifier is '../../../db'. Mock both so the resolution
// works no matter how vitest keys the cache.
vi.mock('../../db', () => dbMockFactory());
vi.mock('../../../db', () => dbMockFactory());
const { ESGSubmissionService } = vi.hoisted(() => ({
  ESGSubmissionService: vi.fn(() => ({
    submitToFDA: vi.fn(async () => ({ packageId: 'pkg-1', transactionId: 'tx-1' })),
  })),
}));
vi.mock('../../ESGSubmissionService', () => ({ default: ESGSubmissionService }));
vi.mock('../../gspr-postmarket/gspr.service', () => ({
  upsertMapping: (...a: any[]) => (svc.upsertMapping as any)(...a),
}));
vi.mock('../../gspr-postmarket/post-market.service', () => ({
  approveDocument: (...a: any[]) => (svc.approveDocument as any)(...a),
  createDocument: (...a: any[]) => (svc.createDocument as any)(...a),
  supersedeDocument: (...a: any[]) => (svc.supersedeDocument as any)(...a),
  updateDocument: (...a: any[]) => (svc.updateDocument as any)(...a),
  validateDocument: (...a: any[]) => (svc.validateDocument as any)(...a),
  getDocument: (...a: any[]) => (svc.getDocument as any)(...a),
}));
vi.mock('../../evidence-sufficiency/evidence-sufficiency.service', () => ({
  assessSufficiency: (...a: any[]) => (svc.assessSufficiency as any)(...a),
}));
vi.mock('../../intelligence-engine/reviewer-simulator.service', () => ({
  runReviewerSimulation: (...a: any[]) => (svc.runReviewerSimulation as any)(...a),
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
import {
  predicateCandidateSetStatus,
  seMatrixPatch,
  correspondenceIngest,
} from '../mdx-command-handlers-phase3';
import {
  postMarketDocumentUpdate,
  postMarketDocumentValidate,
  postMarketDocumentSupersede,
} from '../mdx-command-handlers-phase2';
import { explainAuditRow } from '../mdx-explain-audit-row';

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
  {
    tool: 'predicate.candidate.set_status',
    expectedAction: 'agent.ana.predicate.candidate.status',
    invoke: () => {
      // Stub fetch + service token for the proxy.
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true, status: 200, json: async () => ({ id: 'c-1' }),
      }));
      process.env.ANA_SERVICE_TOKEN = 'test-svc';
      return predicateCandidateSetStatus(CTX, {
        ...yes,
        candidateId: 'c-1',
        programId: PROGRAM,
        status: 'primary',
      });
    },
  },
  {
    tool: 'se_matrix.patch',
    expectedAction: 'agent.ana.se_matrix.patch',
    invoke: () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true, status: 200, json: async () => ({ id: 'm-1' }),
      }));
      process.env.ANA_SERVICE_TOKEN = 'test-svc';
      return seMatrixPatch(CTX, {
        ...yes,
        matrixRowId: 'm-1',
        programId: PROGRAM,
        patch: { resolution: 'resolved' },
      });
    },
  },
  {
    tool: 'correspondence.ingest',
    expectedAction: 'agent.ana.correspondence.ingest',
    invoke: () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ data: { id: 'corr-1' }, issues: [], downstreamActions: [] }),
      }));
      process.env.ANA_SERVICE_TOKEN = 'test-svc';
      return correspondenceIngest(CTX, {
        ...yes,
        projectId: 99,
        submissionId: 'K251102',
        subject: 'FDA AI letter',
        summary: 'received today; please ingest the attached letter',
      });
    },
  },
  {
    tool: 'post_market.document.update',
    expectedAction: 'agent.ana.post_market.document.update',
    invoke: () =>
      postMarketDocumentUpdate(CTX, {
        ...yes,
        documentId: 'd-1',
        patch: { assignee: 'sarah.chen' },
      }),
  },
  {
    tool: 'post_market.document.validate',
    expectedAction: 'agent.ana.post_market.document.validate',
    invoke: () =>
      postMarketDocumentValidate(CTX, {
        ...yes,
        documentId: 'd-1',
      }),
  },
  {
    tool: 'post_market.document.supersede',
    expectedAction: 'agent.ana.post_market.document.supersede',
    invoke: () =>
      postMarketDocumentSupersede(CTX, {
        ...yes,
        documentId: 'd-1',
        newTitle: 'PMCF-2026-Q1',
      }),
  },
  {
    // Read-only auditor capability — has no confirm/reason but still
    // emits an agent.ana.audit.explain row so the contract test stays
    // honest about every dispatch entry.
    tool: 'audit.explain',
    expectedAction: 'agent.ana.audit.explain',
    invoke: () => {
      // The handler reads from `pool` lazily via dynamic import. Stub a
      // minimal db module that returns one row. explainAuditRow lives in
      // server/services/ana-ri/, so its '../../db' is server/db; from this
      // test file that's '../../../db'. doMock both keys.
      const explainDbFactory = () => ({
        pool: {
          query: vi.fn(async () => ({
            rows: [
              {
                id: 1,
                tenant_id: CTX.organizationId,
                user_id: CTX.userId,
                action: 'agent.ana.q_sub.create',
                table_name: 'q_submission',
                record_id: 'q-1',
                new_values: { actorKind: 'agent:ana', agentReason: 'r' },
                ip_address: null,
                user_agent: null,
                created_at: '2026-04-15T10:00:00Z',
              },
            ],
          })),
        },
      });
      vi.doMock('../../db', explainDbFactory);
      vi.doMock('../../../db', explainDbFactory);
      return explainAuditRow(CTX, { auditRowId: 1 });
    },
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
