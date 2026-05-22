import express from 'express';
import { anaCortexService } from '../services/ana-cortex-service';
import { db } from '../db';
import { and, eq } from 'drizzle-orm';
import { anaObservationTerms } from '@shared/schema';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use((req, res, next) => {
  res.setHeader('X-AnA-Cortex-Version', 'AnA 1.0 RI');
  res.setHeader('X-AnA-Cortex-Route', 'canonical');
  next();
});

// Two response builders previously lived here and returned hardcoded JSON
// (fabricated confidence scores, dollar-impact estimates, ICH section coverage).
// Removed because they returned the same fabricated values for every request
// without any AI gateway call, data lookup, or analysis. The handlers below
// now return 501 until a validated, gateway-routed implementation lands.

router.get('/health', async (_req, res) => {
  try {
    const status = await anaCortexService.getCapabilityHealth();
    res.json({ success: true, status });
  } catch (error) {
    console.error('AnA RI health check failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify AnA RI connectivity',
    });
  }
});

router.post('/regulatory-analysis', requireAuth, async (_req, res) => {
  res.status(501).json({
    success: false,
    error: 'Regulatory analysis is not available in this build. A validated, gateway-routed implementation is pending.',
    code: 'NOT_IMPLEMENTED',
  });
});

router.post('/ich-e6r3-guidance', async (_req, res) => {
  res.status(501).json({
    success: false,
    error: 'ICH E6(R3) guidance is not available in this build. A validated, gateway-routed implementation is pending.',
    code: 'NOT_IMPLEMENTED',
  });
});

router.get('/intelligence', async (_req, res) => {
  res.status(501).json({
    success: false,
    error: 'Regulatory intelligence feed is not available in this build. Live ingestion is pending.',
    code: 'NOT_IMPLEMENTED',
  });
});

router.get('/capabilities', async (_req, res) => {
  try {
    const status = await anaCortexService.getCapabilityHealth();
    res.json({
      success: true,
      ...status,
    });
  } catch (error) {
    console.error('AnA Cortex capability check failed:', error);
    res.status(500).json({ success: false, error: 'Failed to inspect capabilities' });
  }
});

router.post('/harvest/10k', async (req, res) => {
  try {
    const { cik, limit, includeAmended, organizationId } = req.body || {};
    const orgId = req.organizationId || organizationId;

    if (!cik || !orgId) {
      return res.status(400).json({
        success: false,
        error: 'cik and organizationId are required.',
      });
    }

    const result = await anaCortexService.harvest10KFilings({
      organizationId: Number(orgId),
      cik,
      limit,
      includeAmended,
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('10-K harvest failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to harvest 10-K filings',
    });
  }
});

router.post('/observation-terms/csr', async (req, res) => {
  try {
    const { organizationId, limit } = req.body || {};
    const orgId = req.organizationId || organizationId;

    if (!orgId) {
      return res.status(400).json({
        success: false,
        error: 'organizationId is required.',
      });
    }

    const result = await anaCortexService.syncObservationTermsFromCSR(Number(orgId), limit);

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('CSR observation term sync failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to build observation terms from CSR data',
    });
  }
});

router.get('/observation-terms', async (req, res) => {
  try {
    const { organizationId, category, termType } = req.query;
    const orgId = req.organizationId || organizationId;

    if (!orgId) {
      return res.status(400).json({
        success: false,
        error: 'organizationId is required.',
      });
    }

    const conditions = [eq(anaObservationTerms.organizationId, Number(orgId))];
    if (category) {
      conditions.push(eq(anaObservationTerms.category, String(category)));
    }
    if (termType) {
      conditions.push(eq(anaObservationTerms.termType, String(termType)));
    }

    const terms = await db
      .select()
      .from(anaObservationTerms)
      .where(and(...conditions));

    res.json({
      success: true,
      terms,
      total: terms.length,
    });
  } catch (error) {
    console.error('Failed to fetch observation terms:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch observation terms',
    });
  }
});

// ── Chat endpoint — connects Ana to the AI gateway ───────────
router.post('/chat', async (req, res) => {
  try {
    const { message, chatMode, context, conversationHistory, preferred_provider, source_surface } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }
    const correlationId =
      String(req.headers['x-correlation-id'] || '').trim() ||
      `ana-cortex-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    res.setHeader('x-correlation-id', correlationId);

    // Build document-aware system prompt
    // Use canonical AnA personality
    const { ANA_COMPACT_PROMPT } = await import('../services/ana-personality');
    let systemPrompt = ANA_COMPACT_PROMPT;

    // Add document context if user is working on a specific document
    if (context?.activeDocument) {
      systemPrompt += `\n\n## Current Document Context
The user is currently editing a document titled "${context.activeDocument}"${context.activeDocumentCtdSection ? ` in CTD section ${context.activeDocumentCtdSection}` : ''}.
${context.activeDocumentExcerpt ? `\nDocument excerpt:\n"${context.activeDocumentExcerpt}"` : ''}
\nWhen responding, consider this document context. If they ask about "this document" or "this section", they mean the document above. Provide guidance specific to this document type and CTD section.`;
    }

    // Add project context
    if (context?.project) {
      systemPrompt += `\n\nThe user is working on project: "${context.project}"${context.productType ? ` (${context.productType} submission)` : ''}.`;
    }

    // Try to use the AI gateway
    let aiResponse: string;
    let aiProvider: string | undefined;
    let aiModel: string | undefined;
    try {
      const { getGateway } = await import('../services/ai-gateway/index.js');
      const gateway = getGateway();

      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
      ];

      // Add conversation history
      if (Array.isArray(conversationHistory)) {
        for (const m of conversationHistory.slice(-8)) {
          if (m.role === 'user' || m.role === 'assistant') {
            messages.push({ role: m.role, content: m.content });
          }
        }
      }

      messages.push({ role: 'user', content: message });

      // Validate preferred_provider
      const VALID_PROVIDERS = ['anthropic', 'openai', 'moonshot'] as const;
      const validProvider =
        preferred_provider && VALID_PROVIDERS.includes(preferred_provider)
          ? (preferred_provider as (typeof VALID_PROVIDERS)[number])
          : undefined;

      const result = await gateway.route({
        taskType: 'chat',
        messages: messages as any,
        maxTokens: 4096,
        temperature: 0.7,
        ...(validProvider ? { provider: validProvider } : {}),
      });

      aiResponse = result.content || 'I can help with that. Could you share more details?';
      aiProvider = result.provider;
      aiModel = result.model;
    } catch (gatewayError) {
      console.error('[AnA Chat] AI Gateway error:', gatewayError);
      aiResponse = `I understand you're asking about "${message.slice(0, 100)}". While I'm having trouble connecting to my AI engine right now, here's what I can tell you:\n\n- For regulatory guidance, consult the relevant FDA guidance documents\n- For document drafting, start with the CTD structure appropriate for your submission type\n- For compliance questions, reference 21 CFR Part 11 and ICH guidelines\n\nPlease try again in a moment, or use the AI actions in the editor toolbar for document-specific assistance.`;
    }

    res.json({
      success: true,
      response: aiResponse,
      provider: aiProvider,
      model: aiModel,
      chatMode: chatMode || 'standard',
      context: {
        screen: context?.screen,
        project: context?.project,
        activeDocument: context?.activeDocument,
      },
      _meta: {
        correlationId,
        ...(source_surface ? { sourceSurface: source_surface } : {}),
      },
    });
  } catch (error) {
    console.error('[AnA Chat] Error:', error);
    res.status(500).json({
      error: 'Chat service temporarily unavailable',
      response: "I'm having trouble connecting right now. Please try again in a moment.",
    });
  }
});

export default router;
