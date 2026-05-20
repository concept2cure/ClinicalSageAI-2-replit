/**
 * System Survivability Layer - Index
 * 
 * FDA 21 CFR Part 11 Compliant - Enterprise Hardening
 * 
 * Central export point for all survivability components:
 * - Circuit Breaker (external service failure protection)
 * - Prompt Injection Protection (LLM security)
 * - Tamper-Proof Audit Log (cryptographic integrity)
 * - Rate Limiting (DDoS protection)
 * - Graceful Degradation (fault tolerance)
 * - Health Check (observability)
 * - Multi-Provider LLM (Kimi AI primary, OpenAI secondary)
 * 
 * @module SystemSurvivability
 * @version 1.1.0
 * @compliance FDA 21 CFR Part 11, OWASP LLM Top 10, ICH E6(R2)
 */

// Circuit Breaker - External service failure protection
// Kimi AI is PRIMARY, OpenAI is SECONDARY fallback
export {
  CircuitBreaker,
  CircuitBreakerError,
  getKimiCircuitBreaker,
  getOpenAICircuitBreaker,
  getBestAvailableLLMBreaker,
  getAllLLMCircuitMetrics,
  resetKimiCircuitBreaker,
  resetOpenAICircuitBreaker,
  type CircuitState,
  type CircuitBreakerOptions,
  type CircuitBreakerMetrics
} from './circuit-breaker';

// Multi-Provider LLM - Kimi AI primary, OpenAI secondary
export {
  MultiProviderLLMService,
  type LLMProvider,
  type LLMProviderConfig,
  type LLMRequest,
  type LLMResponse,
  type ProviderHealth
} from './multi-provider-llm';

// Prompt Injection Protection - LLM security
export {
  PromptInjectionProtection,
  PromptInjectionError,
  getPromptInjectionProtection,
  type SanitizationResult,
  type PromptInjectionDetection,
  type PromptInjectionType
} from './prompt-injection-protection';

// Tamper-Proof Audit Log - Cryptographic integrity
export {
  TamperProofAuditLog,
  getTamperProofAuditLog,
  type AuditEventType,
  type AuditEntry,
  type VerificationResult
} from './tamper-proof-audit';

// Rate Limiting - DDoS protection
export {
  RateLimiter,
  getRateLimiters,
  rateLimitMiddleware,
  getDDoSProtection,
  type RateLimitConfig,
  type RateLimitResult,
  type RateLimiters,
  type RateLimitMiddlewareOptions,
  type DDoSStats
} from './rate-limiting';

// Graceful Degradation - Fault tolerance
export {
  GracefulDegradationService,
  FeatureUnavailableError,
  getGracefulDegradationService,
  type DegradationLevel,
  type Feature,
  type ServiceHealth,
  type DegradationState
} from './graceful-degradation';

// Health Check - Observability
export {
  HealthCheckService,
  createHealthRouter,
  type HealthCheckResult,
  type ComponentHealth
} from './health-check';

// =============================================================================
// Initialization Helper
// =============================================================================

import { Pool } from 'pg';
import { getOpenAICircuitBreaker } from './circuit-breaker';
import { getGracefulDegradationService } from './graceful-degradation';
import { getTamperProofAuditLog } from './tamper-proof-audit';

import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('index');

/**
 * Initialize all survivability components
 * Call this during application startup
 */
export async function initializeSurvivabilityLayer(pool: Pool): Promise<void> {
  logger.info('Initializing survivability layer...');

  // Initialize tamper-proof audit log
  const auditLog = getTamperProofAuditLog(pool);
  await auditLog.initialize();

  // Initialize graceful degradation service
  const degradation = getGracefulDegradationService();
  
  // Register circuit breakers
  degradation.registerCircuitBreaker('openai', getOpenAICircuitBreaker());
  
  // Start health monitoring
  degradation.startMonitoring(10000); // Check every 10 seconds

  // Log startup event
  await auditLog.log(
    'SYSTEM_STARTUP',
    'Survivability layer initialized',
    {
      components: [
        'CircuitBreaker',
        'PromptInjectionProtection',
        'TamperProofAuditLog',
        'RateLimiting',
        'GracefulDegradation',
        'HealthCheck'
      ]
    }
  );

  logger.info('Survivability layer initialized successfully');
}

/**
 * Shutdown all survivability components
 * Call this during graceful shutdown
 */
export async function shutdownSurvivabilityLayer(pool: Pool): Promise<void> {
  logger.info('Shutting down survivability layer...');

  // Log shutdown event
  const auditLog = getTamperProofAuditLog(pool);
  await auditLog.log(
    'SYSTEM_SHUTDOWN',
    'Survivability layer shutting down',
    { graceful: true }
  );

  // Stop health monitoring
  const degradation = getGracefulDegradationService();
  degradation.stopMonitoring();

  logger.info('Survivability layer shut down');
}
