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
import { DocumentQualityLintService } from '../services/documentQuality/qualityLintService';
import { CitationNormalizationService } from '../services/citations/citationNormalizationService';
import { ReviewDiffService } from '../services/reviewDiffs/reviewDiffService';
import {
  DOCUMENT_STACK_FEATURE_KEYS,
  isDocumentStackFeatureEnabled,
} from '../services/documentIntelligence/featureFlags';

const router = Router();

const qualityLintService = new DocumentQualityLintService();
const citationNormalizationService = new CitationNormalizationService();
const reviewDiffService = new ReviewDiffService();

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


router.post('/conversations/:conversationId/quality/lint', async (req, res) => {
  const ctx = resolveContext(req);
  if (!requireContext(res, ctx, 'quality lint')) return;

  const orgId = ctx.organizationId ? Number(ctx.organizationId) : undefined;
  const enabled = await isDocumentStackFeatureEnabled(
    DOCUMENT_STACK_FEATURE_KEYS.qualityChecks,
    Number.isFinite(orgId) ? orgId : undefined
  );

  if (!enabled) {
    res.status(403).json({ success: false, error: 'Document quality stack feature is disabled' });
    return;
  }

  const report = await qualityLintService.lint({
    artifactId: req.body.artifactId ?? `artifact-${ctx.conversationId}`,
    versionId: req.body.versionId ?? `draft-${Date.now()}`,
    text: req.body.text || '',
    advisoryMode: req.body.advisoryMode ?? true,
    documentClass: req.body.documentClass,
  });

  res.status(200).json({ success: true, report });
});

router.post('/conversations/:conversationId/citations/normalize', async (req, res) => {
  const ctx = resolveContext(req);
  if (!requireContext(res, ctx, 'citation normalize')) return;

  const orgId = ctx.organizationId ? Number(ctx.organizationId) : undefined;
  const enabled = await isDocumentStackFeatureEnabled(
    DOCUMENT_STACK_FEATURE_KEYS.citationNormalization,
    Number.isFinite(orgId) ? orgId : undefined
  );

  if (!enabled) {
    res.status(403).json({ success: false, error: 'Citation normalization feature is disabled' });
    return;
  }

  const normalized = await citationNormalizationService.normalize({
    sourceDocumentId: req.body.sourceDocumentId ?? `${ctx.conversationId}_${Date.now()}`,
    rawText: req.body.rawText || '',
  });

  res.status(200).json({ success: true, normalized });
});

router.post('/conversations/:conversationId/review-diff', async (req, res) => {
  const ctx = resolveContext(req);
  if (!requireContext(res, ctx, 'review diff')) return;

  const orgId = ctx.organizationId ? Number(ctx.organizationId) : undefined;
  const enabled = await isDocumentStackFeatureEnabled(
    DOCUMENT_STACK_FEATURE_KEYS.reviewerDiffs,
    Number.isFinite(orgId) ? orgId : undefined
  );

  if (!enabled) {
    res.status(403).json({ success: false, error: 'Reviewer diff feature is disabled' });
    return;
  }

  const artifact = await reviewDiffService.buildDiff({
    artifactId: req.body.artifactId ?? `artifact-${ctx.conversationId}`,
    fromVersionId: req.body.fromVersionId ?? 'draft-a',
    toVersionId: req.body.toVersionId ?? 'draft-b',
    previousText: req.body.previousText || '',
    nextText: req.body.nextText || '',
  });

  res.status(200).json({ success: true, artifact });
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
