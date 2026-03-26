import { Router } from 'express';
import { createProposal, acceptProposal, rejectProposal, listArtifactVersions, listProposals } from '../services/conversation-os/artifactProposalService';
import { planAndExecute } from '../services/conversation-os/orchestrationService';
import { ingestKnowledgeChunks } from '../services/conversation-os/retrievalService';
import { listScoutFindings, promoteScoutFinding, runScout } from '../services/conversation-os/scoutService';
import { listToolEvents, upsertToolManifest } from '../services/conversation-os/toolGateService';

const router = Router();

router.post('/conversations/:conversationId/tools', (req, res) => {
  const manifest = upsertToolManifest(req.params.conversationId, req.body.mode, req.body.tools);
  res.json({ success: true, manifest });
});

router.get('/conversations/:conversationId/tool-events', (req, res) => {
  res.json({ success: true, events: listToolEvents(req.params.conversationId) });
});

router.post('/conversations/:conversationId/retrieval/ingest', (req, res) => {
  const { sourceId, text, tags } = req.body;
  const chunks = ingestKnowledgeChunks(req.params.conversationId, sourceId, text, tags);
  res.status(201).json({ success: true, chunksCreated: chunks.length, chunks });
});

router.post('/conversations/:conversationId/scout', (req, res) => {
  try {
    const finding = runScout({
      conversationId: req.params.conversationId,
      objective: req.body.objective,
      tags: req.body.tags,
    });
    res.status(201).json({ success: true, finding });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/conversations/:conversationId/scout', (req, res) => {
  res.json({ success: true, findings: listScoutFindings(req.params.conversationId) });
});

router.post('/conversations/:conversationId/scout/:findingId/promote', (req, res) => {
  const finding = promoteScoutFinding(req.params.conversationId, req.params.findingId);
  res.json({ success: true, finding });
});

router.post('/conversations/:conversationId/plan-execute', (req, res) => {
  const result = planAndExecute({ conversationId: req.params.conversationId, task: req.body.task });
  const proposal = createProposal({
    conversationId: req.params.conversationId,
    artifactId: req.body.artifactId ?? `artifact-${req.params.conversationId}`,
    content: result.draft,
  });
  res.status(201).json({ success: true, trace: result.trace, quality: result.quality, proposal });
});

router.get('/conversations/:conversationId/proposals', (req, res) => {
  res.json({ success: true, proposals: listProposals(req.params.conversationId) });
});

router.post('/conversations/:conversationId/proposals/:proposalId/accept', (req, res) => {
  try {
    const result = acceptProposal({
      conversationId: req.params.conversationId,
      proposalId: req.params.proposalId,
    });
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/conversations/:conversationId/proposals/:proposalId/reject', (req, res) => {
  const proposal = rejectProposal({
    conversationId: req.params.conversationId,
    proposalId: req.params.proposalId,
  });
  res.json({ success: true, proposal });
});

router.get('/artifacts/:artifactId/versions', (req, res) => {
  res.json({ success: true, versions: listArtifactVersions(req.params.artifactId) });
});

export default router;
