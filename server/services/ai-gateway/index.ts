/**
 * AI Gateway — Centralized AI Provider Gateway
 *
 * Single entry point for ALL LLM calls across the TrialSage / Concept2Cure.RI platform.
 * Single entry point for ALL LLM calls across the Concept2Cure / ClinicalSage platform.
 * Routes requests to OpenAI (default), Anthropic (Claude), or Moonshot (Kimi)
 * with audit logging, rate limiting, policy enforcement, and deterministic mode.
 *
 * @module server/services/ai-gateway
 */

export { AIGateway, getGateway } from './gateway';
export type {
  GatewayRequest,
  GatewayResponse,
  GatewayConfig,
  ProviderName,
  TaskType,
  RoutingStrategy,
} from './types';
export { GatewayAuditLogger } from './audit';
export { GatewayPolicyEngine } from './policy';
