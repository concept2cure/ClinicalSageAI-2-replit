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

// ─────────────────────────────────────────────────────────────────────────────
// Canonical AnA RI regulatory-analysis + ICH guidance handlers.
//
// History: this router previously returned fully hardcoded JSON dressed as AI
// analysis (fabricated FDA cost estimates, invented confidence scores). That
// fabrication was deleted. Two real, AI-gateway-backed implementations of the
// same feature existed elsewhere — one live but unconsumed at
// `/api/ana/regulatory-analysis` (server/routes/misc-inline-routes.ts) and one
// orphan (server/routes/ana-ri-endpoints.ts, never mounted). Both were exact
// duplicates. They have been removed; this router is the single canonical home,
// already mounted at /api/ana-cortex and already what the client calls.
//
// Every numeric field in the response is produced by the AI gateway from the
// caller's query + context — not hardcoded. Invalid model JSON returns 502
// rather than a fabricated fallback. Citation-grounding hardening (no numeric
// claim without a sourced reference) is tracked as follow-on work.
// ─────────────────────────────────────────────────────────────────────────────

const REGULATORY_ANALYSIS_JSON_SHAPE = `{
  "comprehensive_analysis": {
    "regulatory_readiness_score": number,
    "overall_risk_assessment": "Low|Medium|High|Critical",
    "timeline_analysis": { "projected_delay_days": number },
    "cost_analysis": { "total_financial_impact": number },
    "regulatory_gaps": [{ "regulation_section": string, "risk_level": string, "compliance_status": string, "requirement_area": string }],
    "ich_e6r3_assessment": { "compliance_score": number, "risk_factors": string[], "recommendations": string[] }
  },
  "ana_1_0_ri_intelligence_summary": {
    "confidence_score": number,
    "analysis_timestamp": string,
    "data_sources": string[]
  }
}`;

const ICH_GUIDANCE_JSON_SHAPE = `{
  "guidance_response": {
    "answer": string,
    "regulatory_framework": "ICH_E6_R3",
    "confidence_score": number,
    "supporting_sections": [{ "section": string, "relevance": string, "summary": string }],
    "implementation_guidance": string[],
    "references": string[]
  },
  "query_metadata": {
    "query_timestamp": string,
    "processing_time_ms": number,
    "guidance_version": string
  }
}`;

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

router.post('/regulatory-analysis', requireAuth, async (req, res) => {
  try {
    res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache', Expires: '0' });
    const { query, context } = req.body || {};

    const { getGateway } = await import('../services/ai-gateway');
    const gateway = getGateway();
    const response = await gateway.route({
      taskType: 'regulatory_review',
      messages: [
        {
          role: 'system',
          content:
            'You are AnA RI. Return strict JSON only. No markdown. Provide concrete compliance analysis.',
        },
        {
          role: 'user',
          content: `Generate a regulatory analysis for the payload below.

Query: ${query || ''}
Context: ${JSON.stringify(context || {}, null, 2)}

Return JSON shape:
${REGULATORY_ANALYSIS_JSON_SHAPE}`,
        },
      ],
      maxTokens: 3000,
      temperature: 0.2,
      strategy: 'quality_optimized',
      callerModule: 'ana/regulatory-analysis',
    });

    try {
      res.json(JSON.parse(response.content));
    } catch {
      res.status(502).json({
        error: 'AI analysis returned invalid JSON payload',
        code: 'AI_INVALID_RESPONSE_FORMAT',
      });
    }
  } catch (error) {
    console.error('AnA RI regulatory analysis failed:', error);
    res.status(500).json({ success: false, error: 'Failed to generate regulatory analysis' });
  }
});

router.post('/ich-e6r3-guidance', requireAuth, async (req, res) => {
  try {
    res.set({ 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache', Expires: '0' });
    const { query } = req.body || {};

    const { getGateway } = await import('../services/ai-gateway');
    const gateway = getGateway();
    const response = await gateway.route({
      taskType: 'regulatory_review',
      messages: [
        {
          role: 'system',
          content:
            'You are AnA RI specialized in ICH E6(R3). Return strict JSON only and focus on actionable, evidence-aware guidance.',
        },
        {
          role: 'user',
          content: `Question: ${query || ''}

Return JSON:
${ICH_GUIDANCE_JSON_SHAPE}`,
        },
      ],
      maxTokens: 2200,
      temperature: 0.2,
      strategy: 'quality_optimized',
      callerModule: 'ana/ich-e6r3-guidance',
    });

    try {
      res.json(JSON.parse(response.content));
    } catch {
      res.status(502).json({
        error: 'AI guidance returned invalid JSON payload',
        code: 'AI_INVALID_RESPONSE_FORMAT',
      });
    }
  } catch (error) {
    console.error('AnA RI ICH guidance failed:', error);
    res.status(500).json({ success: false, error: 'Failed to generate ICH E6(R3) guidance' });
  }
});

// Honest empty feed. The prior handler returned a single hardcoded
// "regulatory-watch-001" entry with a fake updatedAt that ticked on every
// call. The consumer (useIntelligenceFeeds) already tolerates an empty
// array. Real feeds land when the intelligence source is wired through an
// authenticated data path.
router.get('/intelligence', (_req, res) => {
  res.json({ success: true, feeds: [] });
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
