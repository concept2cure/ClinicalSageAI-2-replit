import OpenAI from 'openai';
import { db } from '../db/index.js';
import crypto from 'crypto';
import { eq, and, sql } from 'drizzle-orm';
import { aiAuditLog } from '../../shared/schema';

/**
 * Phase 3 Regulatory Intelligence - OpenAI Proxy Service
 * Implements hardened AI service layer with enterprise controls
 * per architectural mandate for eCTD 4.0 and regulatory compliance
 */

class RegulatoryAIServicePhase3 {
  constructor() {
    // Initialize OpenAI with Replit AI integrations
    this.openai = new OpenAI({
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://api.openai.com/v1',
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY
    });
    
    // Direct OpenAI client for embeddings (not supported by Replit integration)
    this.embeddingClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    // Token budget management - will be loaded from database
    this.tokenBudget = {
      daily: 100000,
      used: 0,
      resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    };
    
    // Model fallback chain for resilience
    this.modelChain = [
      'gpt-4o',
      'gpt-4-turbo', 
      'gpt-3.5-turbo'
    ];
    
    // Cache for NER results (24-hour TTL)
    this.nerCache = new Map();
    
    // Dead letter queue for failed operations - will be loaded from database
    this.deadLetterQueue = [];
    
    // Feature flags for phased rollout - ENABLED for production use
    this.features = {
      ENABLE_AI_INTELLIGENCE: true, // Enabled for Phase 3 semantic search implementation
      ENABLE_ECTD_4_AUTOMATION: true // Enabled for eCTD 4.0 lifecycle management
    };
    
    // Load persistent data from database
    this.initializePersistentData();
  }
  
  /**
   * Load token budget and dead letter queue from database
   */
  async initializePersistentData() {
    try {
      // Load token budget from database (using id=1 for global budget)
      const [budgetResult] = await db.execute(sql`
        SELECT * FROM ai_token_budget 
        WHERE id = 1 
        LIMIT 1
      `);
      
      if (budgetResult) {
        // Check if reset is needed
        const resetAt = new Date(budgetResult.reset_at);
        if (resetAt < new Date()) {
          // Reset the budget
          await this.resetTokenBudget();
        } else {
          this.tokenBudget = {
            daily: budgetResult.daily_limit,
            used: budgetResult.tokens_used,
            resetAt: resetAt
          };
        }
      } else {
        // Initialize budget in database
        await this.saveTokenBudget();
      }
      
      // Load dead letter queue from database  
      const deadLetterResults = await db.execute(sql`
        SELECT * FROM ai_dead_letter_queue 
        WHERE processed_at IS NULL
        ORDER BY created_at ASC
      `);
      
      if (deadLetterResults?.length > 0) {
        this.deadLetterQueue = deadLetterResults.map(row => ({
          id: row.id,
          operation: row.operation,
          payload: row.request_data,
          error: row.error_message,
          createdAt: row.created_at
        }));
      }
      
    } catch (error) {
      console.error('Failed to load persistent data:', error);
      // If tables are missing, attempt to create them automatically
      try {
        const errMsg = (error && error.message) || '';
        if (errMsg.includes('ai_dead_letter_queue') || (error && error.code === '42P01')) {
          console.log('Attempting to create missing AI tables automatically...');
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS ai_dead_letter_queue (
              id SERIAL PRIMARY KEY,
              operation TEXT,
              request_data JSONB,
              error_message TEXT,
              retry_count INTEGER DEFAULT 0,
              max_retries INTEGER DEFAULT 3,
              created_at TIMESTAMP DEFAULT NOW(),
              processed_at TIMESTAMP
            );
          `);
          await db.execute(sql`
            CREATE TABLE IF NOT EXISTS ai_token_budget (
              id INTEGER PRIMARY KEY,
              daily_limit INTEGER DEFAULT 100000,
              tokens_used INTEGER DEFAULT 0,
              reset_at TIMESTAMP,
              updated_at TIMESTAMP DEFAULT NOW()
            );
          `);
          console.log('AI tables created (or already existed). Retrying load...');
          // Retry loading data
          await this.initializePersistentData();
          return;
        }
      } catch (creationError) {
        console.error('Automatic creation of AI tables failed:', creationError);
      }
      // Continue with in-memory defaults on error
    }
  }
  
  /**
   * Save current token budget to database
   */
  async saveTokenBudget() {
    try {
      // Convert Date to ISO string for SQL
      const resetAtStr = this.tokenBudget.resetAt.toISOString();
      
      await db.execute(sql`
        INSERT INTO ai_token_budget (id, daily_limit, tokens_used, reset_at)
        VALUES (1, ${this.tokenBudget.daily}, ${this.tokenBudget.used}, ${resetAtStr})
        ON CONFLICT (id) DO UPDATE SET
          daily_limit = EXCLUDED.daily_limit,
          tokens_used = EXCLUDED.tokens_used, 
          reset_at = EXCLUDED.reset_at,
          updated_at = CURRENT_TIMESTAMP
      `);
    } catch (error) {
      console.error('Failed to save token budget:', error);
    }
  }
  
  /**
   * Reset token budget to daily limit
   */
  async resetTokenBudget() {
    this.tokenBudget = {
      daily: 100000,
      used: 0,
      resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    };
    await this.saveTokenBudget();
  }
  
  /**
   * Add failed operation to dead letter queue
   */
  async addToDeadLetterQueue(operation, payload, error) {
    try {
      const [result] = await db.execute(sql`
        INSERT INTO ai_dead_letter_queue (operation, request_data, error_message, retry_count, max_retries)
        VALUES (${operation}, ${JSON.stringify(payload)}, ${error}, 0, 3)
        RETURNING id
      `);
      
      if (result) {
        this.deadLetterQueue.push({
          id: result.id,
          operation,
          payload,
          error,
          createdAt: new Date()
        });
      }
    } catch (dbError) {
      console.error('Failed to save to dead letter queue:', dbError);
      // Still add to in-memory queue as fallback
      this.deadLetterQueue.push({ operation, payload, error, createdAt: new Date() });
    }
  }
  
  /**
   * Process item from dead letter queue
   */
  async processDeadLetterItem(itemId) {
    try {
      await db.execute(sql`
        UPDATE ai_dead_letter_queue 
        SET processed_at = CURRENT_TIMESTAMP
        WHERE id = ${itemId}
      `);
      
      // Remove from in-memory queue
      this.deadLetterQueue = this.deadLetterQueue.filter(item => item.id !== itemId);
    } catch (error) {
      console.error('Failed to update dead letter item:', error);
    }
  }
  
  /**
   * Structured output schemas using Pydantic-like validation
   * Ensures AI responses conform to expected format
   */
  schemas = {
    // Named Entity Recognition schema
    ner: {
      type: 'object',
      properties: {
        entity_type: { 
          type: 'string',
          enum: ['assay', 'batch_number', 'site', 'product', 'specification', 'regulatory_section']
        },
        original_value: { type: 'string' },
        new_value: { type: 'string' },
        component_udi_list: { 
          type: 'array',
          items: { type: 'string' }
        },
        confidence_score: { 
          type: 'number',
          minimum: 0,
          maximum: 1
        },
        metadata: {
          type: 'object',
          properties: {
            module_context: { type: 'string' },
            regulatory_impact: { 
              type: 'string',
              enum: ['critical', 'major', 'minor', 'none']
            }
          }
        }
      },
      required: ['entity_type', 'original_value', 'confidence_score']
    },
    
    // Compliance check schema
    compliance: {
      type: 'object',
      properties: {
        module: { type: 'string' },
        compliance_score: { 
          type: 'number',
          minimum: 0,
          maximum: 100
        },
        issues: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              severity: { 
                type: 'string',
                enum: ['error', 'warning', 'info']
              },
              message: { type: 'string' },
              location: { type: 'string' },
              ich_reference: { type: 'string' },
              suggested_fix: { type: 'string' }
            }
          }
        },
        cross_module_consistency: {
          type: 'object',
          properties: {
            module_2_3_alignment: { type: 'boolean' },
            discrepancies: { 
              type: 'array',
              items: { type: 'string' }
            }
          }
        }
      },
      required: ['module', 'compliance_score', 'issues']
    }
  };
  
  /**
   * Execute AI request with retry logic and fallback chain
   * Implements exponential backoff and model degradation
   */
  async executeWithRetry(prompt, schema, modelIndex = 0, retryCount = 0) {
    const maxRetries = 3;
    const model = this.modelChain[modelIndex];
    
    if (!model) {
      throw new Error('All models in fallback chain exhausted');
    }
    
    // Check token budget
    if (this.tokenBudget.used >= this.tokenBudget.daily) {
      throw new Error('Daily token budget exceeded');
    }
    
    try {
      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are an FDA CDER Reviewer with expertise in eCTD submissions and ICH guidelines. Provide structured, accurate responses for regulatory compliance.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3, // Low temperature for consistency
        max_tokens: 2000
      });
      
      // Parse and validate response
      const result = JSON.parse(response.choices[0].message.content);
      
      // Simple schema validation
      if (!this.validateSchema(result, schema)) {
        throw new Error('Response failed schema validation');
      }
      
      // Update token usage and persist to database
      this.tokenBudget.used += response.usage?.total_tokens || 0;
      await this.saveTokenBudget();
      
      return {
        success: true,
        data: result,
        model_used: model,
        tokens_used: response.usage?.total_tokens || 0
      };
      
    } catch (error) {
      console.error(`Model ${model} failed:`, error.message);
      
      // Rate limit error - wait and retry
      if (error.status === 429 && retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.executeWithRetry(prompt, schema, modelIndex, retryCount + 1);
      }
      
      // Try next model in chain
      if (modelIndex < this.modelChain.length - 1) {
        return this.executeWithRetry(prompt, schema, modelIndex + 1, 0);
      }
      
      // All retries exhausted - add to dead letter queue
      await this.addToDeadLetterQueue('executeWithRetry', { prompt, schema }, error.message);
      
      throw error;
    }
  }
  
  /**
   * Named Entity Recognition for global change management
   * Identifies and classifies regulatory entities in components
   */
  async extractNamedEntities(componentText, changeContext = null) {
    if (!this.features.ENABLE_AI_INTELLIGENCE) {
      return { success: false, message: 'AI Intelligence features not enabled' };
    }
    
    // Check cache first
    const cacheKey = crypto.createHash('md5')
      .update(componentText + JSON.stringify(changeContext))
      .digest('hex');
    
    if (this.nerCache.has(cacheKey)) {
      const cached = this.nerCache.get(cacheKey);
      if (cached.expires > Date.now()) {
        return { success: true, data: cached.data, from_cache: true };
      }
    }
    
    const prompt = `Analyze the following regulatory component text and extract named entities.
    
Component Text:
${componentText}

${changeContext ? `Change Context: ${JSON.stringify(changeContext)}` : ''}

Extract and classify the following entities:
1. Assay names (e.g., "AM-001 Lysin Turbidity Reduction Assay")
2. Batch numbers (e.g., "Batch #2024-001")
3. Manufacturing sites (e.g., "Facility Alpha, Switzerland")
4. Product components (e.g., "Drug Substance XYZ")
5. Specifications (e.g., "Purity ≥99.5%")
6. Regulatory sections (e.g., "Module 3.2.S.4.1")

Return a structured JSON response with entity classifications and confidence scores.`;
    
    try {
      const result = await this.executeWithRetry(prompt, this.schemas.ner);
      
      // Cache the result
      this.nerCache.set(cacheKey, {
        data: result.data,
        expires: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
      });
      
      // Audit log the NER extraction
      await this.auditLogAIAction('ner-extract', prompt, result);
      
      return result;
      
    } catch (error) {
      console.error('NER extraction failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Generate embeddings for semantic search (RAG)
   * Uses OpenAI text-embedding-3-large model
   */
  async generateEmbedding(text) {
    if (!this.features.ENABLE_AI_INTELLIGENCE) {
      return { success: false, message: 'AI Intelligence features not enabled' };
    }
    
    try {
      // Use direct OpenAI client for embeddings
      const response = await this.embeddingClient.embeddings.create({
        model: 'text-embedding-3-large',
        input: text,
        dimensions: 1536 // Fixed dimensions for pgvector
      });
      
      return {
        success: true,
        embedding: response.data[0].embedding,
        tokens_used: response.usage?.total_tokens || 0
      };
      
    } catch (error) {
      console.error('Embedding generation failed:', error);
      
      // Add to dead letter queue for retry (persistent)
      await this.addToDeadLetterQueue(
        'generate-embedding',
        { text: text.substring(0, 100) + '...' },
        error.message
      );
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Real-time compliance checking for Module 2 vs Module 3 alignment
   * Implements predictive validation logic
   */
  async checkCompliance(module2Content, module3Content, moduleContext) {
    if (!this.features.ENABLE_AI_INTELLIGENCE) {
      return { success: false, message: 'AI Intelligence features not enabled' };
    }
    
    const prompt = `As an FDA CDER Reviewer, perform a detailed compliance check between Module 2 and Module 3 content.

Module Context: ${moduleContext}

Module 2 Content (Summary):
${module2Content}

Module 3 Content (Technical):
${module3Content}

Perform the following checks:
1. Data consistency - Verify all numerical values match exactly
2. Terminology alignment - Ensure consistent use of technical terms
3. Completeness - Check that Module 2 summarizes all critical Module 3 data
4. ICH compliance - Validate against ICH M4Q guidelines
5. Cross-references - Verify all citations are accurate

Identify any discrepancies, missing elements, or compliance issues.
Provide specific ICH references and suggested corrections.`;
    
    try {
      const result = await this.executeWithRetry(prompt, this.schemas.compliance);
      
      // Audit log the compliance check
      await this.auditLogAIAction('consistency-check', prompt, result);
      
      return result;
      
    } catch (error) {
      console.error('Compliance check failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Validate response against schema
   * Simple validation for structured outputs
   */
  validateSchema(data, schema) {
    if (schema.type === 'object' && schema.properties) {
      for (const [key, prop] of Object.entries(schema.properties)) {
        if (schema.required && schema.required.includes(key) && !(key in data)) {
          return false;
        }
        
        if (key in data) {
          if (prop.type === 'string' && typeof data[key] !== 'string') return false;
          if (prop.type === 'number' && typeof data[key] !== 'number') return false;
          if (prop.type === 'boolean' && typeof data[key] !== 'boolean') return false;
          if (prop.type === 'array' && !Array.isArray(data[key])) return false;
          
          if (prop.enum && !prop.enum.includes(data[key])) return false;
          if (prop.minimum !== undefined && data[key] < prop.minimum) return false;
          if (prop.maximum !== undefined && data[key] > prop.maximum) return false;
        }
      }
    }
    
    return true;
  }
  
  /**
   * Comprehensive audit logging for 21 CFR Part 11 compliance
   */
  async auditLogAIAction(service, prompt, result, userId = null, organizationId = null) {
    try {
      // Create audit entry
      const auditEntry = {
        transactionId: crypto.randomUUID(),
        userId: userId,
        aiService: service,
        promptFull: prompt ? prompt.substring(0, 5000) : null, // Truncate if needed
        modelUsed: result.model_used || 'unknown',
        responseStructured: result.data || result,
        affectedUdis: result.affected_udis || null,
        tokensUsed: result.tokens_used || 0,
        success: result.success !== undefined ? result.success : false,
        approvalStatus: result.approval_status || null,
        digitalSignature: result.digital_signature || null,
        ipAddress: result.ip_address || null,
        sessionId: result.session_id || null
      };
      
      // Persist to database
      await db.insert(aiAuditLog).values(auditEntry);
      
      console.log('[AI Audit] Logged to database:', {
        transactionId: auditEntry.transactionId,
        service: service,
        success: auditEntry.success
      });
      
      return auditEntry.transactionId;
      
    } catch (error) {
      console.error('Audit logging failed:', error);
      // Log to console as fallback but don't throw
      console.error('[AI Audit Fallback]', {
        service,
        error: error.message,
        timestamp: new Date()
      });
    }
  }
  
  /**
   * Get dead letter queue for manual processing
   */
  getDeadLetterQueue() {
    return this.deadLetterQueue;
  }
  
  /**
   * Clear processed items from dead letter queue
   */
  clearDeadLetterQueue(indices = []) {
    if (indices.length === 0) {
      this.deadLetterQueue = [];
    } else {
      this.deadLetterQueue = this.deadLetterQueue.filter((_, i) => !indices.includes(i));
    }
  }
  
  /**
   * Get current feature flags
   */
  getFeatureFlags() {
    return this.features;
  }
  
  /**
   * Get token budget status
   */
  getTokenBudgetStatus() {
    return {
      daily_limit: this.tokenBudget.daily,
      used: this.tokenBudget.used,
      remaining: this.tokenBudget.daily - this.tokenBudget.used,
      reset_at: this.tokenBudget.resetAt,
      percentage_used: Math.round((this.tokenBudget.used / this.tokenBudget.daily) * 100)
    };
  }
}

// Export singleton instance
export const regulatoryAIPhase3 = new RegulatoryAIServicePhase3();
export default regulatoryAIPhase3;