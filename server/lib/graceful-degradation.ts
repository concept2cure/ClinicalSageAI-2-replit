/**
 * Graceful Degradation Service - System Survivability Layer
 * 
 * FDA 21 CFR Part 11 Compliant - Continuous Operation
 * 
 * When external services fail (OpenAI, databases, etc.), the system
 * continues operating with reduced functionality instead of failing completely.
 * 
 * Degradation Levels:
 * 1. FULL - All features available
 * 2. DEGRADED - Non-critical features disabled
 * 3. MINIMAL - Only essential features (read-only, cached data)
 * 4. MAINTENANCE - System unavailable, graceful shutdown
 * 
 * Features:
 * - Automatic degradation based on circuit breaker states
 * - Manual degradation for planned maintenance
 * - Feature flags for granular control
 * - Health status aggregation
 * - Recovery detection and auto-upgrade
 * 
 * @module GracefulDegradation
 * @version 1.0.0
 * @compliance FDA 21 CFR Part 11
 */

import { EventEmitter } from 'events';
import { CircuitBreaker, CircuitState } from './circuit-breaker';

// =============================================================================
// Types
// =============================================================================

export type DegradationLevel = 'FULL' | 'DEGRADED' | 'MINIMAL' | 'MAINTENANCE';

export type Feature = 
  // AI-powered features (depend on OpenAI)
  | 'ENTITY_EXTRACTION'
  | 'COUNCIL_DRAFTING'
  | 'AI_SUGGESTIONS'
  | 'SEMANTIC_SEARCH'
  // Core features (depend on database)
  | 'DOCUMENT_UPLOAD'
  | 'DOCUMENT_VIEW'
  | 'KNOWLEDGE_GRAPH'
  | 'TRACEABILITY'
  // Always available
  | 'HEALTH_CHECK'
  | 'STATIC_CONTENT'
  | 'ERROR_REPORTING';

export interface ServiceHealth {
  name: string;
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'UNKNOWN';
  lastCheck: Date;
  latencyMs?: number;
  errorRate?: number;
  details?: Record<string, unknown>;
}

export interface DegradationState {
  level: DegradationLevel;
  features: Record<Feature, boolean>;
  services: ServiceHealth[];
  reason: string;
  since: Date;
  manual: boolean;
}

// =============================================================================
// Feature Dependencies
// =============================================================================

const FEATURE_REQUIREMENTS: Record<Feature, {
  services: string[];
  degradationLevel: DegradationLevel;
}> = {
  // AI features - require OpenAI
  ENTITY_EXTRACTION: { services: ['openai'], degradationLevel: 'DEGRADED' },
  COUNCIL_DRAFTING: { services: ['openai'], degradationLevel: 'DEGRADED' },
  AI_SUGGESTIONS: { services: ['openai'], degradationLevel: 'DEGRADED' },
  SEMANTIC_SEARCH: { services: ['openai', 'database'], degradationLevel: 'DEGRADED' },
  
  // Core features - require database
  DOCUMENT_UPLOAD: { services: ['database'], degradationLevel: 'MINIMAL' },
  DOCUMENT_VIEW: { services: ['database'], degradationLevel: 'MINIMAL' },
  KNOWLEDGE_GRAPH: { services: ['database'], degradationLevel: 'MINIMAL' },
  TRACEABILITY: { services: ['database'], degradationLevel: 'MINIMAL' },
  
  // Always available
  HEALTH_CHECK: { services: [], degradationLevel: 'MAINTENANCE' },
  STATIC_CONTENT: { services: [], degradationLevel: 'MAINTENANCE' },
  ERROR_REPORTING: { services: [], degradationLevel: 'MAINTENANCE' }
};

// =============================================================================
// Graceful Degradation Service
// =============================================================================

export class GracefulDegradationService extends EventEmitter {
  private state: DegradationState;
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private manualOverride: DegradationLevel | null = null;

  constructor() {
    super();
    
    // Initialize with full functionality
    this.state = {
      level: 'FULL',
      features: this.getAllFeatures(true),
      services: [],
      reason: 'System initialized',
      since: new Date(),
      manual: false
    };
  }

  /**
   * Register a circuit breaker for a service
   */
  registerCircuitBreaker(serviceName: string, breaker: CircuitBreaker): void {
    this.circuitBreakers.set(serviceName, breaker);
    console.log(`[Degradation] Registered circuit breaker for ${serviceName}`);
  }

  /**
   * Start health monitoring
   */
  startMonitoring(intervalMs: number = 10000): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(() => {
      this.evaluateHealth();
    }, intervalMs);

    // Initial evaluation
    this.evaluateHealth();
    console.log(`[Degradation] Health monitoring started (interval: ${intervalMs}ms)`);
  }

  /**
   * Stop health monitoring
   */
  stopMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Evaluate health of all services and update degradation state
   */
  private evaluateHealth(): void {
    const serviceHealths: ServiceHealth[] = [];
    const unhealthyServices: string[] = [];

    // Check all registered circuit breakers
    for (const [name, breaker] of this.circuitBreakers) {
      const metrics = breaker.getMetrics();
      const state = breaker.getState();

      const health: ServiceHealth = {
        name,
        status: this.circuitStateToHealth(state),
        lastCheck: new Date(),
        latencyMs: metrics.avgResponseTimeMs,
        errorRate: metrics.totalRequests > 0 
          ? metrics.totalFailures / metrics.totalRequests 
          : 0,
        details: metrics as unknown as Record<string, unknown>
      };

      serviceHealths.push(health);

      if (state === 'OPEN') {
        unhealthyServices.push(name);
      }
    }

    // Update state based on manual override or automatic evaluation
    if (this.manualOverride) {
      this.updateState(this.manualOverride, unhealthyServices, serviceHealths, true);
    } else {
      const newLevel = this.determineDegradationLevel(unhealthyServices);
      this.updateState(newLevel, unhealthyServices, serviceHealths, false);
    }
  }

  /**
   * Determine degradation level based on unhealthy services
   */
  private determineDegradationLevel(unhealthyServices: string[]): DegradationLevel {
    if (unhealthyServices.length === 0) {
      return 'FULL';
    }

    // Check if database is down (critical)
    if (unhealthyServices.includes('database')) {
      return 'MINIMAL';
    }

    // Check if only AI services are down
    if (unhealthyServices.every(s => ['openai', 'anthropic', 'embedding'].includes(s))) {
      return 'DEGRADED';
    }

    return 'DEGRADED';
  }

  /**
   * Update the degradation state
   */
  private updateState(
    level: DegradationLevel,
    unhealthyServices: string[],
    serviceHealths: ServiceHealth[],
    manual: boolean
  ): void {
    const previousLevel = this.state.level;
    
    // Calculate available features
    const features = this.calculateAvailableFeatures(level, unhealthyServices);

    // Build reason
    const reason = manual
      ? `Manual override to ${level}`
      : unhealthyServices.length > 0
        ? `Services unavailable: ${unhealthyServices.join(', ')}`
        : 'All services healthy';

    this.state = {
      level,
      features,
      services: serviceHealths,
      reason,
      since: previousLevel !== level ? new Date() : this.state.since,
      manual
    };

    // Emit event if level changed
    if (previousLevel !== level) {
      console.log(`[Degradation] Level changed: ${previousLevel} → ${level} (${reason})`);
      this.emit('levelChanged', { from: previousLevel, to: level, reason });
    }
  }

  /**
   * Calculate which features are available at a degradation level
   */
  private calculateAvailableFeatures(
    level: DegradationLevel,
    unhealthyServices: string[]
  ): Record<Feature, boolean> {
    const features: Record<Feature, boolean> = {} as Record<Feature, boolean>;
    const levelOrder: DegradationLevel[] = ['FULL', 'DEGRADED', 'MINIMAL', 'MAINTENANCE'];
    const levelIndex = levelOrder.indexOf(level);

    for (const [feature, requirements] of Object.entries(FEATURE_REQUIREMENTS)) {
      const featureKey = feature as Feature;
      const featureLevelIndex = levelOrder.indexOf(requirements.degradationLevel);

      // Feature available if: degradation level allows AND required services are healthy
      const levelAllows = levelIndex <= featureLevelIndex;
      const servicesHealthy = requirements.services.every(
        s => !unhealthyServices.includes(s)
      );

      features[featureKey] = levelAllows && servicesHealthy;
    }

    return features;
  }

  /**
   * Convert circuit state to health status
   */
  private circuitStateToHealth(state: CircuitState): ServiceHealth['status'] {
    switch (state) {
      case 'CLOSED': return 'HEALTHY';
      case 'HALF_OPEN': return 'DEGRADED';
      case 'OPEN': return 'UNHEALTHY';
      default: return 'UNKNOWN';
    }
  }

  /**
   * Get all features with a default value
   */
  private getAllFeatures(available: boolean): Record<Feature, boolean> {
    return {
      ENTITY_EXTRACTION: available,
      COUNCIL_DRAFTING: available,
      AI_SUGGESTIONS: available,
      SEMANTIC_SEARCH: available,
      DOCUMENT_UPLOAD: available,
      DOCUMENT_VIEW: available,
      KNOWLEDGE_GRAPH: available,
      TRACEABILITY: available,
      HEALTH_CHECK: true, // Always available
      STATIC_CONTENT: true,
      ERROR_REPORTING: true
    };
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Check if a feature is currently available
   */
  isFeatureAvailable(feature: Feature): boolean {
    return this.state.features[feature];
  }

  /**
   * Get current degradation state
   */
  getState(): DegradationState {
    return { ...this.state };
  }

  /**
   * Get current degradation level
   */
  getLevel(): DegradationLevel {
    return this.state.level;
  }

  /**
   * Manually set degradation level (for maintenance, etc.)
   */
  setManualLevel(level: DegradationLevel, reason?: string): void {
    this.manualOverride = level;
    console.log(`[Degradation] Manual override set to ${level}${reason ? `: ${reason}` : ''}`);
    this.evaluateHealth();
  }

  /**
   * Clear manual override and return to automatic mode
   */
  clearManualOverride(): void {
    this.manualOverride = null;
    console.log('[Degradation] Manual override cleared, returning to automatic mode');
    this.evaluateHealth();
  }

  /**
   * Get a user-friendly status message
   */
  getStatusMessage(): string {
    switch (this.state.level) {
      case 'FULL':
        return 'All systems operational';
      case 'DEGRADED':
        return 'Some features are temporarily unavailable. Core functionality is operational.';
      case 'MINIMAL':
        return 'System is in limited mode. Only essential features are available.';
      case 'MAINTENANCE':
        return 'System is undergoing maintenance. Please try again later.';
    }
  }

  /**
   * Execute a feature with automatic fallback
   */
  async executeWithFallback<T>(
    feature: Feature,
    primaryFn: () => Promise<T>,
    fallbackFn?: () => Promise<T>,
    fallbackValue?: T
  ): Promise<T> {
    if (!this.isFeatureAvailable(feature)) {
      console.warn(`[Degradation] Feature ${feature} unavailable, using fallback`);
      
      if (fallbackFn) {
        return fallbackFn();
      }
      if (fallbackValue !== undefined) {
        return fallbackValue;
      }
      throw new FeatureUnavailableError(feature, this.state.level);
    }

    try {
      return await primaryFn();
    } catch (error) {
      console.error(`[Degradation] Feature ${feature} failed:`, error);
      
      if (fallbackFn) {
        return fallbackFn();
      }
      if (fallbackValue !== undefined) {
        return fallbackValue;
      }
      throw error;
    }
  }
}

/**
 * Error thrown when a feature is unavailable
 */
export class FeatureUnavailableError extends Error {
  constructor(
    public readonly feature: Feature,
    public readonly level: DegradationLevel
  ) {
    super(`Feature "${feature}" is unavailable at degradation level "${level}"`);
    this.name = 'FeatureUnavailableError';
  }
}

// =============================================================================
// Global Instance
// =============================================================================

let degradationServiceInstance: GracefulDegradationService | null = null;

export function getGracefulDegradationService(): GracefulDegradationService {
  if (!degradationServiceInstance) {
    degradationServiceInstance = new GracefulDegradationService();
  }
  return degradationServiceInstance;
}
