import { Router } from 'express';
import { createProposal, acceptProposal, rejectProposal, listArtifactVersions, listProposals } from '../services/conversation-os/artifactProposalService';
import { getLatestPlanSummary, planAndExecute } from '../services/conversation-os/orchestrationService';
import { ingestKnowledgeChunks } from '../services/conversation-os/retrievalService';
import { listScoutFindings, promoteScoutFinding, runScout } from '../services/conversation-os/scoutService';
import { listToolEvents, upsertToolManifest } from '../services/conversation-os/toolGateService';

const router = Router();
const withCtx = (req: any) => ({
  conversationId: req.params.conversationId,
  projectId: req.body?.projectId ?? req.query?.projectId,
  userId: req.body?.userId ?? req.query?.userId,
});

router.post('/conversations/:conversationId/tools', async (req, res) => {
  const manifest = await upsertToolManifest({ ...withCtx(req), mode: req.body.mode, tools: req.body.tools });
  res.json({ success: true, manifest });
});

router.get('/conversations/:conversationId/tool-events', async (req, res) => {
  res.json({ success: true, events: await listToolEvents(withCtx(req)) });
});

router.post('/conversations/:conversationId/retrieval/ingest', async (req, res) => {
  const { sourceId, text, tags } = req.body;
  const chunks = await ingestKnowledgeChunks({ ...withCtx(req), sourceId, text, tags });
  res.status(201).json({ success: true, chunksCreated: chunks.length, chunks });
});

router.post('/conversations/:conversationId/scout', async (req, res) => {
  try {
    const finding = await runScout({ ...withCtx(req), objective: req.body.objective, tags: req.body.tags });
    res.status(201).json({ success: true, finding });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/conversations/:conversationId/scout', async (req, res) => {
  res.json({ success: true, findings: await listScoutFindings(withCtx(req)) });
});

router.post('/conversations/:conversationId/scout/:findingId/promote', async (req, res) => {
  const finding = await promoteScoutFinding({ ...withCtx(req), findingId: req.params.findingId });
  res.json({ success: true, finding });
});

router.post('/conversations/:conversationId/plan-execute', async (req, res) => {
  const ctx = withCtx(req);
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
  res.json({ success: true, plan: await getLatestPlanSummary(withCtx(req)) });
});

router.get('/conversations/:conversationId/proposals', async (req, res) => {
  res.json({ success: true, proposals: await listProposals(withCtx(req)) });
});

router.post('/conversations/:conversationId/proposals/:proposalId/accept', async (req, res) => {
  try {
    const result = await acceptProposal({ ...withCtx(req), proposalId: req.params.proposalId });
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/conversations/:conversationId/proposals/:proposalId/reject', async (req, res) => {
  const proposal = await rejectProposal({ ...withCtx(req), proposalId: req.params.proposalId });
  res.json({ success: true, proposal });
});

router.get('/artifacts/:artifactId/versions', (req, res) => {
  res.json({ success: true, versions: listArtifactVersions(req.params.artifactId) });
});

export default router;
