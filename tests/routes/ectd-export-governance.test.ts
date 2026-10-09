import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

const { mockGenerate, mockValidate, mockGovernance } = vi.hoisted(() => ({
  mockGenerate: vi.fn(async () => ({
    buffer: Buffer.from('zip-bytes'),
    filename: 'submission.zip',
    sequenceId: 1,
    sequenceNumber: '0000',
    region: 'fda',
    sha256: 'a'.repeat(64),
    materialized: 7,
    unresolvedLeaves: [],
    skipped: [],
    // The submission's program; it is anchored to a project (below), so the
    // export is registry-placed and governed.
    programId: '5eb50a2e-235a-4605-bd1b-af2d75e8518c',
    stats: {
      totalModules: 5,
      totalFiles: 10,
      totalGranules: 7,
      generatedAt: '2026-03-25T00:00:00.000Z',
    },
  })),
  mockValidate: vi.fn(async () => ({ valid: true, errors: [] })),
  // The handler also calls registerExportGovernanceQuick before res.send;
  // it returns falsy when the real DB writeback fails, which then short-
  // circuits to 500. Tests need a passing mock so res.send actually
  // runs. Returning a truthy artifact id is sufficient (the handler
  // checks for falsy only).
  mockGovernance: vi.fn(async () => ({ artifactId: 'art_123' })),
}));

vi.mock('../../server/services/ectd/assemble-from-core', () => ({
  assembleSubmissionEctd: mockGenerate,
}));

vi.mock('../../server/services/submission-gateways/ectd-structural-validator', () => ({
  validateEctdPackage: mockValidate,
}));

vi.mock('../../server/services/compute/exportGovernance', () => ({
  registerExportGovernanceQuick: mockGovernance,
}));

// The program → project anchor the governed export is recorded against
// (Document Identity Contract C1), and the request-scoped DB it reads through.
vi.mock('../../server/services/c2c/program-project-anchor', () => ({
  resolveProgramProjectAnchor: vi.fn(async () => 77),
}));
vi.mock('../../server/db/requestDb', () => ({ requestDb: () => ({}) }));

import ectdExportRoutes from '../../server/routes/ectd-export';

function getHandler(path: string, method: 'post' | 'get' = 'post') {
  const layer = ectdExportRoutes.stack.find((l: any) => l.route?.path === path && l.route?.methods?.[method]);
  if (!layer) throw new Error(`Missing route ${method.toUpperCase()} ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

// Unit contract for the eCTD export human-review gate. The route reads the
// gate from CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW and from the request's
// governance evidence; these tests drive both. The mocks match the route's
// current call graph (assembleSubmissionEctd / validateEctdPackage /
// registerExportGovernanceQuick). Verified meaningful via mutation testing:
// disabling the gate in ectd-export.ts makes the strict-mode block fail.
describe('eCTD export governance gate', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalGate = process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'test';
    delete process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalGate === undefined) {
      delete process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW;
    } else {
      process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = originalGate;
    }
  });

  it('blocks export in strict mode without human approval', async () => {
    process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = 'true';

    const req = createMockRequest({
      params: { submissionId: '123' },
      body: {},
    }) as any;
    // Authenticated, tenant-bound principal (mirrors the sibling tests). The
    // handler authenticates (→401) and resolves tenant before the governance
    // gate, so the request must be authenticated to reach the 403 human-review
    // block this test asserts.
    req.user = { id: 7, organizationId: 1, name: 'Test User' };
    req.tenantContext = { organizationId: 1 };
    const res = createMockResponse();

    const handler = getHandler('/:submissionId');
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'HUMAN_REVIEW_REQUIRED' }));
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('allows export when strict mode disabled and sets governance headers', async () => {
    process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = 'false';

    const req = createMockRequest({
      params: { submissionId: '123' },
      body: { region: 'FDA', submissionType: 'initial' },
    }) as any;
    // The route reads tenant + user from the JWT principal, not from
    // req.organizationId. Set both so the governance writeback can attribute
    // the export to a real user before res.send runs.
    req.user = { id: 7, organizationId: 1, name: 'Test User' };
    req.tenantContext = { organizationId: 1 };
    const res = createMockResponse();

    const handler = getHandler('/:submissionId');
    await handler(req, res);

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledWith('X-Concept2Cure-AI-Generated', 'true');
    expect(res.setHeader).toHaveBeenCalledWith('X-Concept2Cure-Human-Review-Approved', 'false');
    expect(res.setHeader).toHaveBeenCalledWith('X-Concept2Cure-Review-Required', 'true');
    expect(res.send).toHaveBeenCalled();
  });

  it('allows strict mode with approved governance evidence', async () => {
    process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = 'true';

    const req = createMockRequest({
      params: { submissionId: '123' },
      body: {
        governance: {
          aiGenerated: true,
          humanReviewApproved: true,
          reviewerName: 'Reg QA',
          // Reviewer attribution is WHO + in WHAT capacity + WHEN: the shared
          // gate refuses humanReviewApproved:true without reviewerRole
          // (INCOMPLETE_HUMAN_REVIEW), so an accepted approval must carry it.
          reviewerRole: 'Regulatory QA Reviewer',
          reviewTimestamp: '2026-03-25T00:00:00.000Z',
        },
      },
    }) as any;
    req.user = { id: 7, organizationId: 1, name: 'Test User' };
    req.tenantContext = { organizationId: 1 };
    const res = createMockResponse();

    const handler = getHandler('/:submissionId');
    await handler(req, res);

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledWith('X-Concept2Cure-Reviewer', 'Reg%20QA');
    expect(res.setHeader).toHaveBeenCalledWith('X-Concept2Cure-Review-Timestamp', '2026-03-25T00:00:00.000Z');
    expect(res.send).toHaveBeenCalled();
  });
});

/**
 * A rehearsal export (2026-09-23, W5/D7; WO-9 Click 6). A follow-up sequence
 * bound against earlier sequences that were never filed — for an agency
 * validator to check the lifecycle before anything is sent. The download, its
 * headers and its governance record say so; an export without the flag binds
 * against filed sequences only, as transmit does.
 */
describe('eCTD export — a rehearsal says it is one', () => {
  const BASE = {
    buffer: Buffer.from('zip-bytes'), sequenceId: 2, region: 'fda', sha256: 'b'.repeat(64), materialized: 2,
    unresolvedLeaves: [], skipped: [], programId: '5eb50a2e-235a-4605-bd1b-af2d75e8518c',
    stats: { totalModules: 3, totalFiles: 6, totalGranules: 2, generatedAt: '2026-09-23T00:00:00.000Z' },
  };
  function exportReq(body: Record<string, unknown>) {
    const req = createMockRequest({ params: { submissionId: '123' }, body }) as any;
    req.user = { id: 7, organizationId: 1, name: 'Test User' };
    req.tenantContext = { organizationId: 1 };
    return req;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW = 'false';
  });

  it('asks for the rehearsal state, and the download, headers and record name it', async () => {
    mockGenerate.mockImplementationOnce(async () => ({
      ...BASE, filename: 'BX-512-0001-fda-rehearsal.zip', sequenceNumber: '0001',
      priorState: 'rehearsal', unfiledPriorSequences: ['0000'],
    }) as any);
    const res = createMockResponse();
    await getHandler('/:submissionId')(exportReq({ sequenceNumber: '0001', rehearsal: true }), res);

    expect(mockGenerate).toHaveBeenCalledWith(expect.objectContaining({ sequenceNumber: '0001', priorState: 'rehearsal' }));
    expect(res.setHeader).toHaveBeenCalledWith('X-ECTD-Prior-State', 'rehearsal');
    expect(res.setHeader).toHaveBeenCalledWith('X-ECTD-Unfiled-Prior', '0000');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="BX-512-0001-fda-rehearsal.zip"');
    expect(mockGovernance).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/rehearsal — prior not filed/) }));
    expect(res.send).toHaveBeenCalled();
  });

  it('without the flag, an export binds against filed sequences and says so', async () => {
    mockGenerate.mockImplementationOnce(async () => ({
      ...BASE, filename: 'BX-512-0001-fda.zip', sequenceNumber: '0001', priorState: 'filed', unfiledPriorSequences: [],
    }) as any);
    const res = createMockResponse();
    await getHandler('/:submissionId')(exportReq({ sequenceNumber: '0001' }), res);

    expect(mockGenerate).toHaveBeenCalledWith(expect.objectContaining({ priorState: 'filed' }));
    expect(res.setHeader).toHaveBeenCalledWith('X-ECTD-Prior-State', 'filed');
    expect(res.setHeader).not.toHaveBeenCalledWith('X-ECTD-Unfiled-Prior', expect.anything());
  });

  it('a rehearsal of an original sequence is refused as a request error, not a server failure', async () => {
    mockGenerate.mockImplementationOnce(async () => {
      throw new Error('A rehearsal binds a follow-up sequence against earlier ones; sequence 0000 has none.');
    });
    const res = createMockResponse();
    await getHandler('/:submissionId')(exportReq({ sequenceNumber: '0000', rehearsal: true }), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'REHEARSAL_NOT_APPLICABLE' }));
  });
});
