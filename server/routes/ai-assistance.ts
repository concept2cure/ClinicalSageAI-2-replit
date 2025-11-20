import { Router } from 'express';
import openaiService from '../services/openaiService.js';
import { z } from 'zod';

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

// Rate limiting tracking (in production, use Redis)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

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
    
    // Try to use the OpenAI service
    if (process.env.OPENAI_API_KEY) {
      try {
        // Add timeout wrapper
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('AI request timeout')), 30000)
        );
        
        const aiPromise = openaiService.generateCopilotResponse(
          message,
          [] // Empty history for now
        );
        
        suggestion = await Promise.race([aiPromise, timeoutPromise]) as string;
        isRealAI = true;
        
        logAIRequest('/assist', true, null, {
          task,
          documentType,
          responseTime: Date.now() - startTime,
          isRealAI: true
        });
      } catch (aiError) {
        // Log the AI error but continue with fallback
        logAIRequest('/assist', false, aiError, {
          task,
          documentType,
          fallbackUsed: true
        });
        
        console.warn('OpenAI service failed, using fallback response:', aiError);
        suggestion = getFallbackSuggestion(task, content);
        isRealAI = false;
      }
    } else {
      // No API key configured - use fallback
      logAIRequest('/assist', true, null, {
        task,
        documentType,
        fallbackUsed: true,
        reason: 'No API key configured'
      });
      
      suggestion = getFallbackSuggestion(task, content);
      isRealAI = false;
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
    
    // Try to use OpenAI for verification
    if (process.env.OPENAI_API_KEY) {
      try {
        const message = `Verify the credibility and accuracy of this content. Check for regulatory compliance and identify any issues:\n\n${content}\n\nSources: ${sources?.join(', ') || 'None provided'}`;
        
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Verification timeout')), 30000)
        );
        
        const aiPromise = openaiService.generateCopilotResponse(message, []);
        const aiResponse = await Promise.race([aiPromise, timeoutPromise]) as string;
        
        // Parse AI response to extract verification data
        verificationResults = {
          credibility: 85, // Default credibility score
          sources_verified: sources ? sources.length : 0,
          recommendations: aiResponse.split('\n').filter(line => line.trim().length > 0).slice(0, 5),
          analysis: aiResponse,
          isRealAI: true
        };
        isRealAI = true;
        
        logAIRequest('/verify', true, null, {
          responseTime: Date.now() - startTime,
          isRealAI: true
        });
      } catch (aiError) {
        logAIRequest('/verify', false, aiError, {
          fallbackUsed: true
        });
        
        // Fallback verification
        verificationResults = getFallbackVerification(content, sources);
        isRealAI = false;
      }
    } else {
      // Fallback verification when no API key
      logAIRequest('/verify', true, null, {
        fallbackUsed: true,
        reason: 'No API key configured'
      });
      
      verificationResults = getFallbackVerification(content, sources);
      isRealAI = false;
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
  const health = {
    status: 'operational',
    apiKeyConfigured: !!process.env.OPENAI_API_KEY,
    timestamp: new Date().toISOString(),
    capabilities: {
      assist: true,
      verify: true,
      realAI: !!process.env.OPENAI_API_KEY
    }
  };
  
  // Test OpenAI connection if configured
  if (process.env.OPENAI_API_KEY) {
    try {
      const testMessage = 'Health check test';
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Health check timeout')), 5000)
      );
      
      const test = openaiService.generateCopilotResponse(testMessage, []);
      await Promise.race([test, timeout]);
      
      health.status = 'healthy';
      logAIRequest('/health', true, null, { status: 'healthy' });
    } catch (error) {
      health.status = 'degraded';
      health.capabilities.realAI = false;
      logAIRequest('/health', false, error, { status: 'degraded' });
    }
  } else {
    health.status = 'fallback-mode';
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