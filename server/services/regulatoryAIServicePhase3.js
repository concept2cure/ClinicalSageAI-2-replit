/**
 * regulatoryAIServicePhase3 — Minimal stub
 *
 * Provides the interface expected by phase3-routes.js and semanticEmbeddingService.js.
 * Methods return safe empty/defaults so the server boots without errors.
 */

const regulatoryAIPhase3 = {
  getFeatureFlags() {
    return {
      namedEntityRecognition: false,
      semanticEmbeddings: false,
      complianceChecking: false,
      advancedAnalytics: false,
    };
  },

  async extractNamedEntities(_text, _context) {
    return { entities: [], confidence: 0 };
  },

  async generateEmbedding(_text) {
    return { embedding: [], dimensions: 0 };
  },

  async checkCompliance(_text, _framework, _options) {
    return { compliant: true, findings: [], score: 1.0 };
  },

  getTokenBudgetStatus() {
    return { used: 0, limit: 0, remaining: 0 };
  },

  getDeadLetterQueue() {
    return [];
  },

  clearDeadLetterQueue(_indices) {
    // no-op
  },
};

export default regulatoryAIPhase3;
