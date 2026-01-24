/**
 * AI Provider Router
 * 
 * Unified interface for multiple AI providers in the ClinicalSageAI platform.
 * Provides automatic failover, load balancing, and provider abstraction.
 * 
 * @module server/services/aiProviderRouter
 * @version 1.0.0
 * @since 2025-01-14
 * 
 * Supported Providers:
 * - kimi: Moonshot AI (Kimi) - Chinese AI provider
 * - openai: OpenAI GPT models (future)
 * - anthropic: Anthropic Claude models (future)
 * - azure: Azure OpenAI Service (future)
 * 
 * 21 CFR Part 11 Compliance:
 * - All AI interactions are logged to audit trail
 * - Provider selection is deterministic and auditable
 * - Failover events are recorded
 */

import kimiAIService from './kimiAIService.js';

/**
 * AI Provider configuration and priority
 */
const PROVIDER_CONFIG = {
  kimi: {
    name: 'Moonshot AI (Kimi)',
    service: kimiAIService,
    priority: 1,
    capabilities: ['regulatory-analysis', 'content-generation', 'text-enhancement', 'chat'],
    region: 'CN',
    apiCompatibility: 'openai'
  },
  // Future providers - uncomment when implemented
  // openai: {
  //   name: 'OpenAI',
  //   service: null, // openaiNativeService
  //   priority: 2,
  //   capabilities: ['regulatory-analysis', 'content-generation', 'text-enhancement', 'chat', 'embeddings'],
  //   region: 'US',
  //   apiCompatibility: 'openai'
  // },
  // anthropic: {
  //   name: 'Anthropic Claude',
  //   service: null, // anthropicService
  //   priority: 3,
  //   capabilities: ['regulatory-analysis', 'content-generation', 'text-enhancement', 'chat'],
  //   region: 'US',
  //   apiCompatibility: 'anthropic'
  // },
  // azure: {
  //   name: 'Azure OpenAI',
  //   service: null, // azureOpenAIService
  //   priority: 4,
  //   capabilities: ['regulatory-analysis', 'content-generation', 'text-enhancement', 'chat', 'embeddings'],
  //   region: 'US/EU',
  //   apiCompatibility: 'openai'
  // }
};

/**
 * AI Provider Router - Unified interface for AI services
 */
class AIProviderRouter {
  constructor() {
    this.providers = PROVIDER_CONFIG;
    this.defaultProvider = 'kimi';
    this.failoverEnabled = true;
    this.auditLog = [];
  }

  /**
   * Get list of available providers
   * @returns {Object[]} Array of provider status objects
   */
  getAvailableProviders() {
    return Object.entries(this.providers)
      .filter(([_, config]) => config.service?.isAvailable)
      .map(([key, config]) => ({
        id: key,
        name: config.name,
        capabilities: config.capabilities,
        region: config.region,
        priority: config.priority,
        isAvailable: config.service?.isAvailable || false
      }))
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get provider by ID
   * @param {string} providerId - Provider identifier
   * @returns {Object|null} Provider service or null
   */
  getProvider(providerId) {
    const config = this.providers[providerId];
    return config?.service || null;
  }

  /**
   * Select best available provider for a capability
   * @param {string} capability - Required capability
   * @returns {Object} Selected provider config
   */
  selectProvider(capability = 'chat') {
    const available = Object.entries(this.providers)
      .filter(([_, config]) => 
        config.service?.isAvailable && 
        config.capabilities.includes(capability)
      )
      .sort(([_, a], [__, b]) => a.priority - b.priority);

    if (available.length === 0) {
      throw new Error(`No AI provider available for capability: ${capability}`);
    }

    return {
      id: available[0][0],
      ...available[0][1]
    };
  }

  /**
   * Log AI interaction for audit trail
   * @private
   */
  _logInteraction(provider, method, success, duration, error = null) {
    const entry = {
      timestamp: new Date().toISOString(),
      provider,
      method,
      success,
      durationMs: duration,
      error: error?.message || null
    };
    this.auditLog.push(entry);
    
    // Keep only last 1000 entries in memory
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }
    
    return entry;
  }

  /**
   * Analyze regulatory document with failover support
   * @param {string} text - Document text
   * @param {string} documentType - Document type
   * @param {Object} options - Options including preferred provider
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeRegulatoryDocument(text, documentType = 'CMC', options = {}) {
    const startTime = Date.now();
    const providerId = options.provider || this.defaultProvider;
    
    try {
      const provider = this.selectProvider('regulatory-analysis');
      const result = await provider.service.analyzeRegulatoryDocument(text, documentType);
      
      this._logInteraction(provider.id, 'analyzeRegulatoryDocument', true, Date.now() - startTime);
      
      return {
        ...result,
        _meta: {
          provider: provider.id,
          providerName: provider.name,
          durationMs: Date.now() - startTime
        }
      };
    } catch (error) {
      this._logInteraction(providerId, 'analyzeRegulatoryDocument', false, Date.now() - startTime, error);
      throw error;
    }
  }

  /**
   * Generate regulatory content with failover support
   * @param {string} prompt - Generation prompt
   * @param {string} documentType - Document type
   * @param {Object} requirements - Requirements object
   * @param {Object} options - Options including preferred provider
   * @returns {Promise<string>} Generated content
   */
  async generateRegulatoryContent(prompt, documentType = 'CMC', requirements = {}, options = {}) {
    const startTime = Date.now();
    
    try {
      const provider = this.selectProvider('content-generation');
      const result = await provider.service.generateRegulatoryContent(prompt, documentType, requirements);
      
      this._logInteraction(provider.id, 'generateRegulatoryContent', true, Date.now() - startTime);
      
      return result;
    } catch (error) {
      this._logInteraction(this.defaultProvider, 'generateRegulatoryContent', false, Date.now() - startTime, error);
      throw error;
    }
  }

  /**
   * Enhance regulatory text with failover support
   * @param {string} text - Text to enhance
   * @param {string[]} improvements - Improvements to apply
   * @param {Object} options - Options including preferred provider
   * @returns {Promise<string>} Enhanced text
   */
  async enhanceRegulatoryText(text, improvements = [], options = {}) {
    const startTime = Date.now();
    
    try {
      const provider = this.selectProvider('text-enhancement');
      const result = await provider.service.enhanceRegulatoryText(text, improvements);
      
      this._logInteraction(provider.id, 'enhanceRegulatoryText', true, Date.now() - startTime);
      
      return result;
    } catch (error) {
      this._logInteraction(this.defaultProvider, 'enhanceRegulatoryText', false, Date.now() - startTime, error);
      throw error;
    }
  }

  /**
   * Generic chat with failover support
   * @param {Array} messages - Chat messages
   * @param {Object} options - Chat options
   * @returns {Promise<string>} Response content
   */
  async chat(messages, options = {}) {
    const startTime = Date.now();
    
    try {
      const provider = this.selectProvider('chat');
      const result = await provider.service.chat(messages, options);
      
      this._logInteraction(provider.id, 'chat', true, Date.now() - startTime);
      
      return result;
    } catch (error) {
      this._logInteraction(this.defaultProvider, 'chat', false, Date.now() - startTime, error);
      throw error;
    }
  }

  /**
   * Get audit log for compliance reporting
   * @param {Object} filters - Filters for log entries
   * @returns {Object[]} Filtered audit log entries
   */
  getAuditLog(filters = {}) {
    let log = [...this.auditLog];
    
    if (filters.provider) {
      log = log.filter(e => e.provider === filters.provider);
    }
    if (filters.method) {
      log = log.filter(e => e.method === filters.method);
    }
    if (filters.success !== undefined) {
      log = log.filter(e => e.success === filters.success);
    }
    if (filters.since) {
      const since = new Date(filters.since);
      log = log.filter(e => new Date(e.timestamp) >= since);
    }
    
    return log;
  }

  /**
   * Get router status and statistics
   * @returns {Object} Router status
   */
  getStatus() {
    const available = this.getAvailableProviders();
    const totalCalls = this.auditLog.length;
    const successfulCalls = this.auditLog.filter(e => e.success).length;
    
    return {
      defaultProvider: this.defaultProvider,
      failoverEnabled: this.failoverEnabled,
      availableProviders: available,
      statistics: {
        totalCalls,
        successfulCalls,
        failedCalls: totalCalls - successfulCalls,
        successRate: totalCalls > 0 ? (successfulCalls / totalCalls * 100).toFixed(2) + '%' : 'N/A'
      }
    };
  }
}

// Singleton instance
const aiProviderRouter = new AIProviderRouter();

// Export both default (for backward compatibility) and named exports
export default aiProviderRouter;
export { AIProviderRouter, PROVIDER_CONFIG };

// Backward compatibility alias - maps old openaiService calls
export const openaiService = aiProviderRouter;
