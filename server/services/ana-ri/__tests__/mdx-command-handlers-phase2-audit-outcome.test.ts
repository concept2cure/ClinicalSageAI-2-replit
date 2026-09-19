/**
 * The §11.10(e) failure arm of the phase-2 MDX handlers, exercised.
 *
 * WO-16C #133, tranche 3. The conversion of this file shipped nine
 * `recordAuditRow` sites and no test that ever made one FAIL: both existing
 * suites mock `auditService.logAction` as always resolving
 * `{ persisted: true, … }`, so `auditNote` returned `''` in every test and the
 * `{ persisted: false }` branch of all nine had never run.
 *
 * The reviewer of that conversion raised it against this repository's own rule —
 * "a gate that has only ever been seen to pass has not been tested" — and it was
 * a gap in the process, not just in the file: the two earlier tranches each
 * shipped a failure-arm suite (pdev-command-handlers-audit-outcome.test.ts,
 * qms-governed-writes-audited.test.ts) and this one did not.
 *
 * Failure is injected at the dependency: `logAction` resolves
 * `{ persisted: false, … }` the way it does when a store is down, unconfigured,
 * or rejects the row. Every assertion below is on what a caller can observe.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { svc, audit } = vi.hoisted(() => ({
  svc: {
    upsertMapping: vi.fn(),
    createDocument: vi.fn(),
    approveDocument: vi.fn(),
    assessSufficiency: vi.fn(),
    runReviewerSimulation: vi.fn(),
    updateDocument: vi.fn(),
    supersedeDocument: vi.fn(),
    getDocument: vi.fn(),
    validateDocument: vi.fn(),
  },
  audit: { logAction: vi.fn() },
}));

vi.mock('../../gspr-postmarket/gspr.service', () => ({
  upsertMapping: (...a: any[]) => svc.upsertMapping(...a),
}));
vi.mock('../../gspr-postmarket/post-market.service', () => ({
  approveDocument: (...a: any[]) => svc.approveDocument(...a),
  createDocument: (...a: any[]) => svc.createDocument(...a),
  supersedeDocument: (...a: any[]) => svc.supersedeDocument(...a),
  updateDocument: (...a: any[]) => svc.updateDocument(...a),
  validateDocument: (...a: any[]) => svc.validateDocument(...a),
  getDocument: (...a: any[]) => svc.getDocument(...a),
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
  postMarketDocumentUpdate,
  postMarketDocumentValidate,
  postMarketDocumentSupersede,
} from '../mdx-command-handlers-phase2';

const CTX = { userId: 7, organizationId: 11 } as never;
const PROGRAM_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
const DOC_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2';
const gate = { confirm: 'yes', reason: 'a sufficient explanatory reason' };

/** The store's own text, which must never reach a caller. */
const STORE_TEXT = 'relation "audit_logs" does not exist';

function storeDown() {
  audit.logAction.mockResolvedValue({ persisted: false, chained: false, error: STORE_TEXT });
}
function storeUp() {
  audit.logAction.mockResolvedValue({ persisted: true, chained: true, tamperProof: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  storeUp();
  svc.upsertMapping.mockResolvedValue({ id: 'm-1', applicabilityChanged: false, evidenceChanged: false });
  svc.createDocument.mockResolvedValue({ id: DOC_ID, docType: 'psur', status: 'draft' });
  svc.approveDocument.mockResolvedValue({ ok: true, document: { id: DOC_ID, status: 'approved' } });
  svc.assessSufficiency.mockResolvedValue({ id: 'a-1', verdict: 'sufficient', overallScore: 88 });
  svc.runReviewerSimulation.mockResolvedValue({ runId: 'r-1', personas: [] });
  svc.updateDocument.mockResolvedValue({ id: DOC_ID, status: 'draft' });
  svc.supersedeDocument.mockResolvedValue({ id: 'new-1', supersededId: DOC_ID });
  svc.getDocument.mockResolvedValue({ id: DOC_ID, docType: 'psur', status: 'draft' });
  svc.validateDocument.mockReturnValue({ valid: true, findings: [] });
});

/** Every phase-2 handler, with arguments that get past its gate and validation. */
const CALLS: Array<{ name: string; run: () => Promise<Record<string, unknown>> }> = [
  {
    name: 'gspr.mapping.upsert',
    run: () => gsprMappingUpsert(CTX, { ...gate, programId: PROGRAM_UUID, requirementId: 'r-1', applicability: 'applicable' }) as never,
  },
  {
    name: 'post_market.document.create',
    run: () => postMarketDocumentCreate(CTX, { ...gate, programId: PROGRAM_UUID, documentType: 'psur', code: 'PSUR-2026', title: 'PSUR 2026' }) as never,
  },
  {
    name: 'post_market.document.approve',
    run: () => postMarketDocumentApprove(CTX, { ...gate, documentId: DOC_ID }) as never,
  },
  {
    name: 'evidence_sufficiency.assess',
    run: () => evidenceSufficiencyAssess(CTX, { ...gate, programId: PROGRAM_UUID, pathway: '510K', profile: { isImplant: false } }) as never,
  },
  {
    name: 'reviewer_simulation.run',
    run: () => reviewerSimulationRun(CTX, { ...gate, programId: PROGRAM_UUID, program: { id: PROGRAM_UUID }, intel: { predicates: [] } }) as never,
  },
  {
    name: 'post_market.document.update',
    run: () => postMarketDocumentUpdate(CTX, { ...gate, documentId: DOC_ID, patch: { title: 'PSUR 2026 rev B' } }) as never,
  },
  {
    name: 'post_market.document.validate',
    run: () => postMarketDocumentValidate(CTX, { ...gate, documentId: DOC_ID }) as never,
  },
  {
    name: 'post_market.document.supersede',
    run: () => postMarketDocumentSupersede(CTX, { ...gate, documentId: DOC_ID, reasonForNewVersion: 'Annual update to the PSUR' }) as never,
  },
];

describe('phase-2 MDX handlers: a lost §11.10(e) row is observable', () => {
  for (const c of CALLS) {
    it(`${c.name} reports the lost row in data and in the message`, async () => {
      storeDown();

      const r = await c.run();

      // It really got past the gate and validation — otherwise this suite would
      // be asserting against a refusal and proving nothing.
      expect(audit.logAction, `${c.name} never attempted an audit row`).toHaveBeenCalled();

      const data = r.data as Record<string, unknown> | undefined;
      const outcome = data?.agentAuditTrail as Record<string, unknown> | undefined;
      expect(outcome, `${c.name} carries no agentAuditTrail`).toBeDefined();
      expect(outcome!.persisted).toBe(false);
      expect(outcome!.code).toBe('AUDIT_ROW_NOT_PERSISTED');

      // The conversational carrier says so too.
      expect(String(r.message)).toMatch(/could not be written/i);
    });

    it(`${c.name} says nothing about the audit row when it landed`, async () => {
      storeUp();

      const r = await c.run();
      const outcome = (r.data as Record<string, unknown>).agentAuditTrail as Record<string, unknown>;

      expect(outcome.persisted).toBe(true);
      // auditNote appends '' on success — the absence of noise is the contract.
      expect(String(r.message)).not.toMatch(/could not be written/i);
    });

    it(`${c.name} never puts the store's own error text on the wire`, async () => {
      storeDown();

      const serialized = JSON.stringify(await c.run());

      expect(serialized).toContain('AUDIT_ROW_NOT_PERSISTED');
      expect(serialized).not.toContain(STORE_TEXT);
      expect(serialized).not.toContain('audit_logs');
    });
  }
});
