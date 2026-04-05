/**
 * ana-ri-endpoints.ts
 *
 * Extracted from server/index.ts — AnA RI secondary intelligence endpoints.
 * These are the auth-gated, AI-gateway-backed analysis routes.
 *
 * Routes:
 *   GET  /regulatory-intelligence  — regulatory intelligence dashboard data
 *   POST /regulatory-analysis      — AI-powered regulatory analysis
 *   POST /ich-e6r3-guidance        — ICH E6(R3) specialized guidance
 *
 * Note: The main /api/ask-ana-ri mega-endpoint remains in server/index.ts for now
 * due to its complexity (650 lines, Gemini integration, template libraries).
 */

import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../auth.js';

const router = Router();

/** GET /regulatory-intelligence — regulatory intelligence summary */
router.get(
  '/regulatory-intelligence',
  authMiddleware as any,
  async (req: Request, res: Response) => {
    try {
      res.json({
        success: true,
        advisorySummary: {
          totalAdvisories: 0,
          criticalAlerts: 0,
          recentUpdates: 0,
          complianceScore: 95,
        },
        documents: {
          totalAnalyzed: 0,
          successRate: 94,
          averageProcessingTime: 2.3,
          templatesAvailable: 13,
        },
        compliance: {
          globalStatus: 'Compliant',
          regions: [
            { name: 'FDA', status: 'Compliant', score: 94 },
            { name: 'EMA', status: 'Compliant', score: 87 },
            { name: 'PMDA', status: 'Under Review', score: 92 },
            { name: 'Health Canada', status: 'Compliant', score: 89 },
            { name: 'TGA', status: 'Compliant', score: 91 },
          ],
        },
        updates: [],
      });
    } catch (error) {
      console.error('Error fetching regulatory intelligence:', error);
      res.status(500).json({ error: 'Failed to fetch regulatory intelligence' });
    }
  }
);

/** POST /regulatory-analysis — AI-gateway-backed regulatory analysis */
router.post(
  '/regulatory-analysis',
  authMiddleware as any,
  async (req: Request, res: Response) => {
    console.log('🔥 AnA RI Regulatory Analysis endpoint hit!');
    try {
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      });

      const { query, context } = req.body;
      console.log('📋 Request data:', { query, context });

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
{
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
}`,
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
        return res.status(502).json({
          error: 'AI analysis returned invalid JSON payload',
          code: 'AI_INVALID_RESPONSE_FORMAT',
        });
      }
    } catch (error) {
      console.error('Error in regulatory analysis:', error);
      res.status(500).json({ error: 'Failed to perform regulatory analysis' });
    }
  }
);

/** POST /ich-e6r3-guidance — ICH E6(R3) specialized AI guidance */
router.post(
  '/ich-e6r3-guidance',
  authMiddleware as any,
  async (req: Request, res: Response) => {
    console.log('🔥 AnA RI ICH E6(R3) Guidance endpoint hit!');
    try {
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      });

      const { query } = req.body;
      const started = Date.now();

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
{
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
}`,
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
        return res.status(502).json({
          error: 'AI guidance returned invalid JSON payload',
          code: 'AI_INVALID_RESPONSE_FORMAT',
        });
      }
    } catch (error) {
      console.error('Error in ICH E6(R3) guidance:', error);
      res.status(500).json({ error: 'Failed to provide ICH E6(R3) guidance' });
    }
  }
);

export default router;
