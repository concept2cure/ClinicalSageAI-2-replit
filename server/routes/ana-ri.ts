/**
 * AnA RI Routes — Regulatory Intelligence Copilot API
 *
 * Endpoints for the AnA 1.0 RI intelligence layer:
 * - POST /api/ana-ri/chat — Main AnA RI chat with orchestrated intelligence
 * - GET  /api/ana-ri/deficiencies — Deficiency taxonomy queries
 * - GET  /api/ana-ri/actions — Available document actions
 * - GET  /api/ana-ri/rubric — Evaluation rubric
 * - POST /api/ana-ri/evaluate — Evaluate response quality
 *
 * @module server/routes/ana-ri
 */

import { Router, Request, Response } from 'express';
import { getGateway } from '../services/ai-gateway/index.js';
import type { GatewayMessage } from '../services/ai-gateway/types.js';
import {
  orchestrate,
  type OrchestratorInput,
  type IntentLens,
  type UserRole,
} from '../services/ana-ri/index.js';
import {
  DEFICIENCY_TAXONOMY,
  getDeficienciesBySubmissionType,
  getCriticalDeficiencies,
  getDeficiencyCategories,
  type SubmissionType,
} from '../services/ana-ri/deficiency-taxonomy.js';
import {
  getAllActions,
  getActionsForLens,
} from '../services/ana-ri/document-actions.js';
import {
  evaluateResponse,
  getFullRubric,
} from '../services/ana-ri/evaluation.js';
import { inferRole } from '../services/ana-ri/role-adapter.js';
import {
  getOrCreateThread,
  saveChatMessage as saveMessage,
} from '../services/chat-thread-helpers.js';

const router = Router();

// AI Gateway instance
let gateway: ReturnType<typeof getGateway> | null = null;
function ensureGateway() {
  if (!gateway) {
    try {
      gateway = getGateway();
    } catch (e: any) {
      console.error('[AnA RI] AI Gateway initialization failed:', e?.message);
    }
  }
  return gateway;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ana-ri/chat — Main AnA RI Chat
// ─────────────────────────────────────────────────────────────────────────────

router.post('/chat', async (req: Request, res: Response) => {
  try {
    const {
      message,
      thread_id,
      intent_lens,
      user_role,
      project_context,
      document_context,
      submission_type,
      conversation_history,
    } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required', code: 'INVALID_MESSAGE' });
    }

    // Validate intent_lens if provided
    const VALID_LENSES: IntentLens[] = ['auto', 'audit', 'improve', 'risk', 'strategy', 'compare'];
    const validatedLens: IntentLens | undefined = intent_lens && VALID_LENSES.includes(intent_lens)
      ? intent_lens as IntentLens
      : undefined;

    // Validate user_role if provided
    const VALID_ROLES: UserRole[] = ['ceo', 'ra_lead', 'medical_writer', 'clinical_lead', 'cmc_lead', 'investor', 'general'];
    const validatedRole: UserRole | undefined = user_role && VALID_ROLES.includes(user_role)
      ? user_role as UserRole
      : undefined;

    // Resolve org/user context
    const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
    const userId = (req as any).userId || (req as any).user?.id || 'anonymous';

    // Infer role if not provided
    const effectiveRole: UserRole = validatedRole || inferRole({
      screenName: req.body.context?.screenName,
      title: req.body.context?.userTitle,
      department: req.body.context?.department,
    });

    // Orchestrate — build the complete system prompt
    const orchestratorInput: OrchestratorInput = {
      message,
      intentLens: validatedLens,
      userRole: effectiveRole,
      projectContext: project_context,
      documentContext: document_context,
      submissionType: submission_type as SubmissionType | undefined,
      conversationHistory: conversation_history,
    };

    const orchestration = orchestrate(orchestratorInput);

    // Build message history for the AI gateway
    const messages: GatewayMessage[] = [
      { role: 'system', content: orchestration.systemPrompt },
    ];

    // Add conversation history
    if (conversation_history && Array.isArray(conversation_history)) {
      for (const msg of conversation_history.slice(-20)) {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    // Add current message
    messages.push({ role: 'user', content: message });

    // Call AI Gateway
    const gw = ensureGateway();
    if (!gw) {
      return res.status(503).json({
        error: 'AI services unavailable',
        code: 'GATEWAY_UNAVAILABLE',
      });
    }

    const response = await gw.chat({
      taskType: 'regulatory_review',
      messages,
      maxTokens: 4096,
      temperature: 0.3,
      routingStrategy: 'quality_optimized',
    });

    if (!response.content) {
      return res.status(502).json({
        error: 'No response from AI provider',
        code: 'EMPTY_RESPONSE',
      });
    }

    // Evaluate response quality (async, non-blocking)
    const evaluation = evaluateResponse(response.content, {
      userRole: effectiveRole,
      intentLens: orchestration.detectedIntent.lens,
      hasStructuredOutput: /##|###/.test(response.content),
      hasDocumentActions: /create|generate|memo|brief/i.test(response.content),
      hasEvidenceLabels: /KNOWN|INFERRED|MISSING/i.test(response.content),
      hasRiskRanking: /critical|major|minor|severity/i.test(response.content),
      hasCitations: /ICH|CFR|FDA|EMA|ISO/i.test(response.content),
      hasRewrite: /rewrite|revised|improved version/i.test(response.content),
    });

    // Persist message and response if we have org context
    let threadId = thread_id;
    if (orgId) {
      try {
        const thread = await getOrCreateThread(orgId, userId, threadId);
        threadId = thread.id;
        await saveMessage(threadId, 'user', message, orgId, userId);
        await saveMessage(threadId, 'assistant', response.content, orgId);
      } catch (e: any) {
        console.warn('[AnA RI] Thread persistence failed:', e?.message);
      }
    }

    return res.json({
      response: response.content,
      thread_id: threadId,
      orchestration: {
        detectedIntent: orchestration.detectedIntent,
        detectedSubmissionType: orchestration.detectedSubmissionType,
        appliedRole: orchestration.appliedRole,
        suggestedActions: orchestration.suggestedActions,
        meta: orchestration.orchestrationMeta,
      },
      evaluation: {
        grade: evaluation.grade,
        overallScore: evaluation.overallScore,
        maxScore: evaluation.maxOverallScore,
      },
      provider: response.provider,
      model: response.model,
      usage: response.usage,
    });
  } catch (error: any) {
    console.error('[AnA RI] Chat error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      message: error?.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/deficiencies — Query Deficiency Taxonomy
// ─────────────────────────────────────────────────────────────────────────────

router.get('/deficiencies', (_req: Request, res: Response) => {
  const { submission_type, category, severity } = _req.query;

  let results = [...DEFICIENCY_TAXONOMY];

  if (submission_type) {
    results = getDeficienciesBySubmissionType(submission_type as SubmissionType);
  }

  if (category) {
    results = results.filter(d => d.category.toLowerCase() === (category as string).toLowerCase());
  }

  if (severity) {
    results = results.filter(d => d.severity === severity);
  }

  return res.json({
    count: results.length,
    deficiencies: results,
    categories: getDeficiencyCategories(),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/deficiencies/critical — Critical deficiencies only
// ─────────────────────────────────────────────────────────────────────────────

router.get('/deficiencies/critical', (_req: Request, res: Response) => {
  const { submission_type } = _req.query;
  const type = (submission_type as SubmissionType) || 'general';
  const critical = getCriticalDeficiencies(type);

  return res.json({
    count: critical.length,
    submissionType: type,
    deficiencies: critical,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/actions — Available Document Actions
// ─────────────────────────────────────────────────────────────────────────────

router.get('/actions', (_req: Request, res: Response) => {
  const { lens } = _req.query;

  const actions = lens
    ? getActionsForLens(lens as IntentLens)
    : getAllActions();

  return res.json({
    count: actions.length,
    actions: actions.map(a => ({
      type: a.type,
      label: a.label,
      description: a.description,
      icon: a.icon,
      template: a.template,
    })),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/rubric — Evaluation Rubric
// ─────────────────────────────────────────────────────────────────────────────

router.get('/rubric', (_req: Request, res: Response) => {
  const rubric = getFullRubric();
  return res.json({ dimensions: rubric });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ana-ri/evaluate — Evaluate a response
// ─────────────────────────────────────────────────────────────────────────────

router.post('/evaluate', (req: Request, res: Response) => {
  const { response, context } = req.body;

  if (!response || typeof response !== 'string') {
    return res.status(400).json({ error: 'Response text is required' });
  }

  const evaluation = evaluateResponse(response, context || {});
  return res.json(evaluation);
});

export default router;
