/**
 * /api/conversation-os serves only the caller's own projects.
 *
 * Every conversation-OS record is keyed by the project the request names in
 * its body or query, and none of those tables carries a tenant column the RLS
 * sweep can police. Nothing checked the project was the caller's: any signed-in
 * user could list another organization's proposals, plans and retrieval chunks,
 * or write into them, by naming the project.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const H = vi.hoisted(() => ({
  projectBelongsToTenant: vi.fn(),
  listProposals: vi.fn(),
  createProposal: vi.fn(),
  planAndExecute: vi.fn(),
}));

vi.mock('../../auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { id: 7, organizationId: 3 };
    next();
  },
}));
vi.mock('../../services/cmc/project-membership', () => ({
  projectBelongsToTenant: H.projectBelongsToTenant,
}));
vi.mock('../../services/conversation-os/artifactProposalService', () => ({
  createProposal: H.createProposal,
  acceptProposal: vi.fn(),
  rejectProposal: vi.fn(),
  listArtifactVersions: vi.fn(),
  listProposals: H.listProposals,
}));
vi.mock('../../services/conversation-os/orchestrationService', () => ({
  getLatestPlanSummary: vi.fn(),
  planAndExecute: H.planAndExecute,
}));
vi.mock('../../services/conversation-os/retrievalService', () => ({ ingestKnowledgeChunks: vi.fn() }));
vi.mock('../../services/conversation-os/scoutService', () => ({
  listScoutFindings: vi.fn(), promoteScoutFinding: vi.fn(), runScout: vi.fn(),
}));
vi.mock('../../services/conversation-os/toolGateService', () => ({
  listToolEvents: vi.fn(), upsertToolManifest: vi.fn(),
}));
vi.mock('../../services/documentQuality/qualityLintService', () => ({ DocumentQualityLintService: class {} }));
vi.mock('../../services/citations/citationNormalizationService', () => ({ CitationNormalizationService: class {} }));
vi.mock('../../services/reviewDiffs/reviewDiffService', () => ({ ReviewDiffService: class {} }));
vi.mock('../../services/documentIntelligence/featureFlags', () => ({
  DOCUMENT_STACK_FEATURE_KEYS: {}, isDocumentStackFeatureEnabled: vi.fn(),
}));
vi.mock('../../services/ana/artifactVersionStore', () => ({ listDocumentArtifactVersions: vi.fn() }));

import conversationOsRouter from '../conversation-os';

const app = express();
app.use(express.json());
app.use('/api/conversation-os', conversationOsRouter);

beforeEach(() => {
  vi.clearAllMocks();
  H.projectBelongsToTenant.mockImplementation(async ({ organizationId, projectId }: any) =>
    Number(organizationId) === 3 && projectId === '12');
  H.listProposals.mockResolvedValue([{ id: 'p-1' }]);
  H.planAndExecute.mockResolvedValue({ trace: {}, draft: 'Objective: x', quality: {} });
  H.createProposal.mockResolvedValue({ id: 'p-2' });
});

describe('the conversation-OS project gate', () => {
  it("does not list another organization's proposals — the project is not found", async () => {
    const res = await request(app).get('/api/conversation-os/conversations/c-1/proposals?projectId=99');
    expect(res.status).toBe(404);
    expect(H.projectBelongsToTenant).toHaveBeenCalledWith({ organizationId: '3', projectId: '99' });
    expect(H.listProposals).not.toHaveBeenCalled();
  });

  it("does not write into another organization's project", async () => {
    const res = await request(app)
      .post('/api/conversation-os/conversations/c-1/plan-execute')
      .send({ projectId: 99, task: 'Outline the IND', artifactId: 'doc-1' });
    expect(res.status).toBe(404);
    expect(H.planAndExecute).not.toHaveBeenCalled();
  });

  it('refuses, rather than proceeds, when the check cannot complete', async () => {
    H.projectBelongsToTenant.mockRejectedValueOnce(new Error('connection terminated'));
    const res = await request(app).get('/api/conversation-os/conversations/c-1/proposals?projectId=12');
    expect(res.status).toBe(503);
    expect(H.listProposals).not.toHaveBeenCalled();
  });

  it("serves the caller's own project", async () => {
    const res = await request(app).get('/api/conversation-os/conversations/c-1/proposals?projectId=12');
    expect(res.status).toBe(200);
    expect(res.body.proposals).toEqual([{ id: 'p-1' }]);
  });
});

describe('plan-execute names the artifact the proposal is for', () => {
  it('refuses a request with no artifactId rather than inventing artifact-<conversation>', async () => {
    const res = await request(app)
      .post('/api/conversation-os/conversations/c-1/plan-execute')
      .send({ projectId: 12, task: 'Outline the IND' });
    expect(res.status).toBe(400);
    expect(H.planAndExecute).not.toHaveBeenCalled();
    expect(H.createProposal).not.toHaveBeenCalled();
  });

  it('files the proposal under the artifact it names', async () => {
    const res = await request(app)
      .post('/api/conversation-os/conversations/c-1/plan-execute')
      .send({ projectId: 12, task: 'Outline the IND', artifactId: 'doc-1' });
    expect(res.status).toBe(201);
    expect(H.createProposal).toHaveBeenCalledWith(expect.objectContaining({ artifactId: 'doc-1' }));
  });
});
