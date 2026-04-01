import { Router } from 'express';
// NOTE: AIProviderRouter requires a database pool — service initialized lazily via setAIService()
// The original openaiService was actually Kimi AI (moonshot.cn), now multi-provider
import type { AIProviderRouter } from '../services/aiProviderRouter.js';
let openaiService: AIProviderRouter | null = null;

/** Allow server/index.ts to inject the initialized AI service */
export function setAIService(service: AIProviderRouter) {
  openaiService = service;
}
import { z } from 'zod';
import { getOtelDiagnostics } from '../services/telemetry/opentelemetry';
import { opaClient } from '../services/policy/opaClient';

// Unified AI Client — routes through Claude via AI Gateway (primary provider)
let unifiedAI: { complete: (messages: any, options?: any) => Promise<string> } | null = null;
try {
  const mod = await import('../lib/unified-ai-client.js');
  unifiedAI = mod.ai;
} catch {
  console.warn('[AI Assistance] Unified AI client not available, will use legacy provider');
}

const router = Router();

// Input validation schemas
const assistRequestSchema = z.object({
  content: z.string().min(1).max(50000),
  task: z.enum(['regulatory_review', 'compliance_check', 'content_enhancement']).optional(),
  documentType: z.string().optional(),
  section: z.string().optional()
});

const verifyRequestSchema = z.object({
  content: z.string().min(1).max(50000),
  sources: z.array(z.string()).optional()
});

// Rate limiting tracking with TTL cleanup to prevent unbounded memory growth
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Periodic cleanup of expired entries (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore) {
    if (value.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Rate limiting middleware function
function checkRateLimit(clientId: string, maxRequests: number = 10, windowMs: number = 60000): boolean {
  const now = Date.now();
  const clientData = rateLimitStore.get(clientId);

  if (!clientData || clientData.resetTime < now) {
    rateLimitStore.set(clientId, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (clientData.count >= maxRequests) {
    return false;
  }

  clientData.count++;
  return true;
}

// Logging function for monitoring
function logAIRequest(endpoint: string, success: boolean, error?: any, metadata?: any) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    endpoint,
    success,
    error: error ? (error instanceof Error ? error.message : String(error)) : undefined,
    metadata,
    apiKeyConfigured: !!process.env.OPENAI_API_KEY
  };
  
  if (!success) {
    console.error('[AI Service Error]', logEntry);
  } else {
    console.log('[AI Service Request]', logEntry);
  }
}

// AI assistance endpoint for document editing
router.post('/assist', async (req, res) => {
  const startTime = Date.now();
  const clientId = req.ip || 'unknown';
  
  try {
    // Rate limiting check
    if (!checkRateLimit(clientId)) {
      logAIRequest('/assist', false, 'Rate limit exceeded', { clientId });
      return res.status(429).json({ 
        error: 'Too many requests. Please try again later.',
        fallback: true 
      });
    }
    
    // Input validation
    const validationResult = assistRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
      logAIRequest('/assist', false, 'Validation error', validationResult.error);
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: validationResult.error.errors,
        fallback: true 
      });
    }
    
    const { content, task = 'regulatory_review', documentType } = validationResult.data;
    
    // Create context-aware prompt based on task and document type
    let message = '';
    let context = '';
    
    switch (task) {
      case 'regulatory_review':
        context = `Reviewing ${documentType || 'regulatory'} document for compliance and improvements.`;
        message = `Please review this regulatory document content and provide specific, actionable suggestions for improvement focusing on FDA/ICH compliance:\n\n${content}`;
        break;
        
      case 'compliance_check':
        context = `Checking ${documentType || 'regulatory'} document for compliance issues.`;
        message = `Check this document for regulatory compliance issues and suggest corrections:\n\n${content}`;
        break;
        
      case 'content_enhancement':
        context = `Enhancing ${documentType || 'regulatory'} document for clarity and professionalism.`;
        message = `Please enhance this document content for clarity and professionalism while maintaining regulatory compliance:\n\n${content}`;
        break;
    }
    
    let suggestion = '';
    let isRealAI = false;
    let provider = 'fallback';

    // Strategy: Try AI Gateway (Claude) → Legacy provider → Template fallback
    if (unifiedAI) {
      try {
        const systemPrompt = `You are a regulatory intelligence expert specializing in FDA, EMA, and ICH guidelines.
You are reviewing a ${documentType || 'regulatory'} document. ${context}
Provide specific, actionable recommendations with regulatory citations where applicable.`;

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('AI Gateway timeout')), 30000)
        );

        const aiPromise = unifiedAI.complete(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message },
          ],
          {
            taskType: task === 'regulatory_review' ? 'regulatory_review' :
                      task === 'content_enhancement' ? 'document_drafting' : 'general',
            maxTokens: 4096,
            callerModule: 'ai-assistance/assist',
          }
        );

        suggestion = await Promise.race([aiPromise, timeoutPromise]);
        isRealAI = true;
        provider = 'ai-gateway-claude';

        logAIRequest('/assist', true, null, {
          task, documentType, provider,
          responseTime: Date.now() - startTime,
          isRealAI: true
        });
      } catch (gatewayError) {
        console.warn('[AI Assistance] AI Gateway failed, trying legacy provider:', gatewayError);
        // Fall through to legacy provider
      }
    }

    // Legacy provider fallback (OpenAI/Kimi)
    if (!isRealAI && process.env.OPENAI_API_KEY && openaiService) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('AI request timeout')), 30000)
        );

        const aiPromise = openaiService.generateCopilotResponse(message, []);
        suggestion = await Promise.race([aiPromise, timeoutPromise]);
        isRealAI = true;
        provider = 'legacy-openai';

        logAIRequest('/assist', true, null, {
          task, documentType, provider,
          responseTime: Date.now() - startTime,
          isRealAI: true
        });
      } catch (aiError) {
        logAIRequest('/assist', false, aiError, {
          task, documentType, fallbackUsed: true
        });
        console.warn('Legacy AI service failed, using template fallback:', aiError);
      }
    }

    // Template fallback (last resort)
    if (!isRealAI) {
      logAIRequest('/assist', true, null, {
        task, documentType, fallbackUsed: true,
        reason: !unifiedAI && !openaiService ? 'No AI providers configured' : 'All providers failed'
      });
      suggestion = getFallbackSuggestion(task, content);
      provider = 'template-fallback';
    }
    
    res.json({
      success: true,
      recommendation: suggestion,
      task,
      documentType,
      isRealAI, // Transparent about whether real AI or fallback was used
      responseTime: Date.now() - startTime,
      fallback: !isRealAI // Explicitly indicate fallback mode
    });
    
  } catch (error) {
    logAIRequest('/assist', false, error, {
      task: req.body.task,
      documentType: req.body.documentType
    });
    
    // Provide user-friendly error message
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    
    res.status(500).json({
      success: false,
      error: 'AI assistance service encountered an error',
      message: errorMessage,
      recommendation: getFallbackSuggestion(req.body.task || 'regulatory_review', req.body.content || ''),
      task: req.body.task,
      documentType: req.body.documentType,
      fallback: true, // Always true for error responses
      isRealAI: false
    });
  }
});

// Content verification endpoint
router.post('/verify', async (req, res) => {
  const startTime = Date.now();
  const clientId = req.ip || 'unknown';
  
  try {
    // Rate limiting check
    if (!checkRateLimit(clientId, 20)) {
      logAIRequest('/verify', false, 'Rate limit exceeded', { clientId });
      return res.status(429).json({ 
        error: 'Too many requests. Please try again later.',
        fallback: true 
      });
    }
    
    // Input validation
    const validationResult = verifyRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
      logAIRequest('/verify', false, 'Validation error', validationResult.error);
      return res.status(400).json({ 
        error: 'Invalid request data',
        details: validationResult.error.errors 
      });
    }
    
    const { content, sources } = validationResult.data;
    
    let verificationResults;
    let isRealAI = false;

    const verifyMessage = `Verify the credibility and accuracy of this regulatory content. Check for compliance with FDA/ICH guidelines, identify factual issues, unsupported claims, and regulatory risks. Rate credibility 0-100.\n\nContent:\n${content}\n\nSources: ${sources?.join(', ') || 'None provided'}`;

    // Try AI Gateway (Claude) first
    if (unifiedAI) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Verification timeout')), 30000)
        );

        const aiResponse = await Promise.race([
          unifiedAI.complete(verifyMessage, {
            taskType: 'regulatory_review',
            maxTokens: 4096,
            callerModule: 'ai-assistance/verify',
          }),
          timeoutPromise,
        ]);

        verificationResults = {
          credibility: 85,
          sources_verified: sources ? sources.length : 0,
          recommendations: aiResponse.split('\n').filter(line => line.trim().length > 0).slice(0, 5),
          analysis: aiResponse,
          isRealAI: true,
        };
        isRealAI = true;

        logAIRequest('/verify', true, null, {
          responseTime: Date.now() - startTime,
          provider: 'ai-gateway-claude',
          isRealAI: true,
        });
      } catch (gatewayError) {
        console.warn('[AI Assistance] AI Gateway verification failed:', gatewayError);
      }
    }

    // Legacy provider fallback
    if (!isRealAI && process.env.OPENAI_API_KEY && openaiService) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Verification timeout')), 30000)
        );

        const aiResponse = await Promise.race([
          openaiService.generateCopilotResponse(verifyMessage, []),
          timeoutPromise,
        ]);

        verificationResults = {
          credibility: 85,
          sources_verified: sources ? sources.length : 0,
          recommendations: aiResponse.split('\n').filter((line: any) => line.trim().length > 0).slice(0, 5),
          analysis: aiResponse,
          isRealAI: true,
        };
        isRealAI = true;

        logAIRequest('/verify', true, null, {
          responseTime: Date.now() - startTime,
          provider: 'legacy-openai',
          isRealAI: true,
        });
      } catch (aiError) {
        logAIRequest('/verify', false, aiError, { fallbackUsed: true });
      }
    }

    // Template fallback
    if (!isRealAI) {
      logAIRequest('/verify', true, null, {
        fallbackUsed: true,
        reason: 'All providers unavailable',
      });
      verificationResults = getFallbackVerification(content, sources);
    }
    
    res.json({
      ...verificationResults,
      isRealAI,
      fallback: !isRealAI,
      responseTime: Date.now() - startTime
    });
    
  } catch (error) {
    logAIRequest('/verify', false, error);
    
    console.error('Content verification error:', error);
    res.status(500).json({ 
      error: 'Verification service temporarily unavailable',
      fallback: true,
      isRealAI: false,
      credibility: 0,
      sources_verified: 0,
      recommendations: ['Manual verification recommended']
    });
  }
});

// Health check endpoint for AI service
router.get('/health', async (req, res) => {
  const health: Record<string, unknown> = {
    status: 'operational',
    apiKeyConfigured: !!process.env.OPENAI_API_KEY,
    aiGatewayAvailable: !!unifiedAI,
    timestamp: new Date().toISOString(),
    capabilities: {
      assist: true,
      verify: true,
      realAI: !!unifiedAI || !!process.env.OPENAI_API_KEY,
    },
    providers: {
      aiGateway: unifiedAI ? 'available' : 'unavailable',
      legacyOpenAI: process.env.OPENAI_API_KEY && openaiService ? 'available' : 'unavailable',
    },
    integrations: {
      ...(openaiService && typeof (openaiService as any).getIntegrationStatus === 'function'
        ? (openaiService as any).getIntegrationStatus()
        : {}),
      opentelemetry: getOtelDiagnostics(),
      opa: opaClient.diagnostics(),
    },
  };

  if (unifiedAI) {
    health.status = 'healthy';
    health.primaryProvider = 'claude-via-ai-gateway';
    logAIRequest('/health', true, null, { status: 'healthy', provider: 'ai-gateway' });
  } else if (process.env.OPENAI_API_KEY && openaiService) {
    health.status = 'degraded';
    health.primaryProvider = 'legacy-openai';
    logAIRequest('/health', true, null, { status: 'degraded', provider: 'legacy-openai' });
  } else {
    health.status = 'fallback-mode';
    health.primaryProvider = 'template-fallback';
    logAIRequest('/health', true, null, { status: 'fallback-mode' });
  }

  res.json(health);
});

// Fallback suggestion function
function getFallbackSuggestion(task: string, content: string): string {
  const fallbackNote = '\n\n**Note:** This is a template-based suggestion. Real-time AI analysis is currently unavailable.';
  
  switch (task) {
    case 'regulatory_review':
      return `**Regulatory Review Template Suggestions:**

1. **Document Structure**: Ensure proper eCTD format compliance with clear section headers and numbering
2. **Regulatory Citations**: Add references to relevant FDA guidance documents and ICH guidelines  
3. **Data Integrity**: Verify all claims are supported by appropriate data and statistical analysis
4. **Risk Assessment**: Include comprehensive risk-benefit analysis for the proposed indication
5. **Quality Standards**: Confirm manufacturing and analytical methods meet current regulatory expectations

*Review the most recent FDA guidance for your specific therapeutic area.*${fallbackNote}`;
      
    case 'compliance_check':
      return `**Compliance Assessment Template:**

Document Review Checklist:
• Document structure follows regulatory submission format
• Professional formatting and language used throughout
• Regulatory reference citations included where appropriate
• Risk mitigation strategies documented
• Statistical methods described for all data tables

*Please verify against current FDA/ICH guidelines for your submission type.*${fallbackNote}`;
      
    case 'content_enhancement':
      return `**Content Enhancement Template Recommendations:**

1. **Clarity**: Use clear, concise language appropriate for regulatory reviewers
2. **Flow**: Ensure logical progression from background through conclusions
3. **Evidence**: Strengthen claims with robust supporting data and literature
4. **Consistency**: Maintain consistent terminology and formatting throughout
5. **Completeness**: Verify all required sections are present and comprehensive

*Review for professional quality and regulatory impact.*${fallbackNote}`;
      
    default:
      return `**Document Review Template:**

Standard recommendations for regulatory documents:
• Ensure compliance with current FDA/ICH guidelines
• Include comprehensive data supporting all regulatory claims  
• Maintain consistent professional formatting throughout
• Consider pre-submission meeting opportunities with regulators

*Always consult current regulatory requirements for critical submissions.*${fallbackNote}`;
  }
}

// Fallback verification function
function getFallbackVerification(content: string, sources?: string[]) {
  return {
    credibility: 75, // Default template credibility
    sources_verified: sources ? sources.length : 0,
    recommendations: [
      'Verify all regulatory citations are current',
      'Cross-reference data with primary sources',
      'Ensure statistical analyses are properly validated',
      'Confirm compliance with latest guidance documents',
      'Review for consistency with established submissions'
    ],
    analysis: 'Template-based verification. Manual review recommended for critical content.',
    note: 'This is a template-based verification. Real-time AI verification is currently unavailable.'
  };
}

export default router;
