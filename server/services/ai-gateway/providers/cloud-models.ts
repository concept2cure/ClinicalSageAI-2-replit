/**
 * Private-cloud + self-hosted model registry.
 *
 * These ModelConfig entries extend the gateway's DEFAULT_MODELS with the
 * private-cloud and self-hosted substrates (Bedrock, Vertex, Azure, local).
 * They are always present in the static registry (so the approved-models
 * drift gate can pin them) but only become *enabled* at runtime when their
 * provider's env is configured — buildModelRegistry() gates on that, exactly
 * as it does for the shared frontier providers.
 *
 * Model identifiers here are the substrate-specific IDs:
 *   - Bedrock: 'anthropic.<model>' (a regional inference-profile prefix such as
 *     'us.' / 'eu.' is added at call time from AI_BEDROCK_RESIDENCY when set).
 *   - Vertex: the bare Claude model id (the SDK targets it by project+region).
 *   - Azure: the deployment name (defaults to the OpenAI model id).
 *   - Local: a logical name resolved by the self-hosted server / LiteLLM map.
 *
 * Any change to a pinned id below must be mirrored in
 * server/services/ai-governance/approved-models.ts or the drift gate fails CI.
 *
 * @module server/services/ai-gateway/providers/cloud-models
 */

import type { ModelConfig, TaskType } from '../types';

const CLAUDE_CAPABILITIES: TaskType[] = [
  'chat',
  'document_analysis',
  'document_drafting',
  'structured_output',
  'regulatory_review',
  'code_generation',
  'summarization',
  'general',
];

export const CLOUD_MODELS: ModelConfig[] = [
  // ── AWS Bedrock (private-cloud Claude — primary BAA/ZDR path) ──────────────
  {
    id: 'claude-opus-4-bedrock',
    provider: 'bedrock',
    model: 'anthropic.claude-opus-4-7',
    contextWindow: 200000,
    qualityScore: 99,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.075,
    capabilities: CLAUDE_CAPABILITIES,
    enabled: true,
  },
  {
    id: 'claude-sonnet-4-bedrock',
    provider: 'bedrock',
    model: 'anthropic.claude-sonnet-4-6',
    contextWindow: 200000,
    qualityScore: 97,
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    capabilities: CLAUDE_CAPABILITIES,
    enabled: true,
  },
  // ── Google Vertex AI (private-cloud Claude — regional residency) ───────────
  {
    id: 'claude-opus-4-vertex',
    provider: 'vertex',
    model: 'claude-opus-4-7',
    contextWindow: 200000,
    qualityScore: 99,
    costPer1kInput: 0.015,
    costPer1kOutput: 0.075,
    capabilities: CLAUDE_CAPABILITIES,
    enabled: true,
  },
  // ── Azure OpenAI (private-cloud GPT — enterprise estate) ───────────────────
  {
    id: 'gpt-4o-azure',
    provider: 'azure',
    model: 'gpt-4o',
    contextWindow: 128000,
    qualityScore: 95,
    costPer1kInput: 0.005,
    costPer1kOutput: 0.015,
    capabilities: [
      'chat',
      'document_analysis',
      'structured_output',
      'regulatory_review',
      'code_generation',
      'summarization',
      'general',
    ],
    enabled: true,
  },
  // ── Self-hosted / local (open-weight via vLLM/LiteLLM — air-gappable) ───────
  {
    id: 'local-default',
    provider: 'local',
    model: 'local-default',
    contextWindow: 32000,
    qualityScore: 70,
    costPer1kInput: 0,
    costPer1kOutput: 0,
    capabilities: ['chat', 'summarization', 'document_analysis', 'general'],
    enabled: true,
  },
];
