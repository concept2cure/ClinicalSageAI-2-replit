import { Router } from 'express';
import {
  createProposal,
  acceptProposal,
  rejectProposal,
  listArtifactVersions,
  listProposals,
} from '../services/conversation-os/artifactProposalService';
import {
  getLatestPlanSummary,
  planAndExecute,
} from '../services/conversation-os/orchestrationService';
import { ingestKnowledgeChunks } from '../services/conversation-os/retrievalService';
import {
  listScoutFindings,
  promoteScoutFinding,
  runScout,
} from '../services/conversation-os/scoutService';
import { listToolEvents, upsertToolManifest } from '../services/conversation-os/toolGateService';

const router = Router();

const resolveContext = (req: any) => {
  const authUser = req.user;
  // Authoritative source: JWT-authenticated user. Body/query only for projectId
  // (which selects the active project and is not a credential).
  const userId = authUser?.id ? String(authUser.id) : undefined;
  const organizationId = authUser?.organizationId ? String(authUser.organizationId) : undefined;
  const projectId = req.body?.projectId ?? req.query?.projectId;
  return {
    conversationId: req.params.conversationId,
    projectId: projectId ? String(projectId) : undefined,
    userId,
    organizationId,
  };
};

function requireContext(res: any, ctx: { projectId?: string; userId?: string }, op: string) {
  if (!ctx.projectId || !ctx.userId) {
    res
      .status(400)
      .json({ success: false, error: `${op} requires authoritative projectId and userId context` });
    return false;
  }
  return true;
}

router.post('/conversations/:conversationId/tools', async (req, res) => {
  const ctx = resolveContext(req);
  if (!requireContext(res, ctx, 'tool manifest update')) return;
  const manifest = await upsertToolManifest({ ...ctx, mode: req.body.mode, tools: req.body.tools });
  res.json({ success: true, manifest });
});

router.get('/conversations/:conversationId/tool-events', async (req, res) => {
  const ctx = resolveContext(req);
  if (!ctx.projectId) {
    res.status(400).json({ success: false, error: 'tool event read requires projectId context' });
    return;
  }
  res.json({ success: true, events: await listToolEvents(ctx) });
});

router.post('/conversations/:conversationId/retrieval/ingest', async (req, res) => {
  const ctx = resolveContext(req);
  if (!requireContext(res, ctx, 'retrieval ingest')) return;
  const { sourceId, text, tags } = req.body;
  const chunks = await ingestKnowledgeChunks({ ...ctx, sourceId, text, tags });
  res.status(201).json({ success: true, chunksCreated: chunks.length, chunks });
});

router.post('/conversations/:conversationId/scout', async (req, res) => {
  const ctx = resolveContext(req);
  if (!requireContext(res, ctx, 'scout run')) return;
  try {
    const finding = await runScout({ ...ctx, objective: req.body.objective, tags: req.body.tags });
    res.status(201).json({ success: true, finding });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/conversations/:conversationId/scout', async (req, res) => {
  const ctx = resolveContext(req);
  if (!ctx.projectId) {
    res.status(400).json({ success: false, error: 'scout read requires projectId context' });
    return;
  }
  res.json({ success: true, findings: await listScoutFindings(ctx) });
});

router.post('/conversations/:conversationId/scout/:findingId/promote', async (req, res) => {
  const ctx = resolveContext(req);
  if (!requireContext(res, ctx, 'scout promote')) return;
  const finding = await promoteScoutFinding({ ...ctx, findingId: req.params.findingId });
  res.json({ success: true, finding });
});

router.post('/conversations/:conversationId/plan-execute', async (req, res) => {
  const ctx = resolveContext(req);
  if (!requireContext(res, ctx, 'plan execute')) return;
  const result = await planAndExecute({ ...ctx, task: req.body.task });
  const proposal = await createProposal({
    ...ctx,
    artifactId: req.body.artifactId ?? `artifact-${req.params.conversationId}`,
    content: result.draft,
    quality: result.quality,
  });
  res.status(201).json({ success: true, trace: result.trace, quality: result.quality, proposal });
});

router.get('/conversations/:conversationId/plan-summary', async (req, res) => {
  const ctx = resolveContext(req);
  if (!ctx.projectId) {
    res.status(400).json({ success: false, error: 'plan summary requires projectId context' });
    return;
  }
  res.json({ success: true, plan: await getLatestPlanSummary(ctx) });
});

router.get('/conversations/:conversationId/proposals', async (req, res) => {
  const ctx = resolveContext(req);
  if (!ctx.projectId) {
    res.status(400).json({ success: false, error: 'proposal list requires projectId context' });
    return;
  }
  res.json({ success: true, proposals: await listProposals(ctx) });
});

router.post('/conversations/:conversationId/proposals/:proposalId/accept', async (req, res) => {
  const ctx = resolveContext(req);
  if (!requireContext(res, ctx, 'proposal accept')) return;
  if (!ctx.organizationId) {
    res
      .status(400)
      .json({ success: false, error: 'proposal accept requires organizationId context' });
    return;
  }
  try {
    const result = await acceptProposal({ ...ctx, proposalId: req.params.proposalId });
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/conversations/:conversationId/proposals/:proposalId/reject', async (req, res) => {
  const ctx = resolveContext(req);
  if (!requireContext(res, ctx, 'proposal reject')) return;
  const proposal = await rejectProposal({ ...ctx, proposalId: req.params.proposalId });
  res.json({ success: true, proposal });
});

router.get('/artifacts/:artifactId/versions', async (req, res) => {
  const ctx = resolveContext(req);
  if (!ctx.projectId) {
    res.status(400).json({ success: false, error: 'artifact versions requires projectId context' });
    return;
  }
  res.json({
    success: true,
    versions: await listArtifactVersions({
      artifactId: req.params.artifactId,
      conversationId: String(req.query?.conversationId ?? ''),
      projectId: ctx.projectId,
      userId: ctx.userId,
    }),
  });
});

export default router;
