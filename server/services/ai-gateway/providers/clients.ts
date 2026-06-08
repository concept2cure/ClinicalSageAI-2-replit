/**
 * Provider client factories for the private-cloud + self-hosted substrates.
 *
 * Design notes:
 *   - Bedrock and Vertex use Anthropic's drop-in SDKs (`@anthropic-ai/bedrock-sdk`
 *     → AnthropicBedrock, `@anthropic-ai/vertex-sdk` → AnthropicVertex). Both
 *     expose the *same* `.messages.create()` surface as the base SDK, so the
 *     gateway reuses its proven executeAnthropic() path with the resolved
 *     client — no second code path to maintain.
 *   - Azure and local are OpenAI-compatible, so they reuse the OpenAI path.
 *   - The Anthropic cloud SDKs are optional peer deps: they are loaded via
 *     createRequire so the build does not hard-depend on them. If a provider is
 *     enabled by env but its SDK is not installed, the factory returns null and
 *     the gateway logs a clear "package not installed" warning rather than
 *     crashing. Install them only on deployments that use that substrate:
 *       npm i @anthropic-ai/bedrock-sdk @anthropic-ai/vertex-sdk
 *
 * @module server/services/ai-gateway/providers/clients
 */

import { createRequire } from 'node:module';
import OpenAI from 'openai';
import { createScopedLogger } from '../../../utils/logger.js';

const log = createScopedLogger('ai-gateway:providers');
const requireOptional = createRequire(import.meta.url);

/** Load an optional package by name; null (with a logged hint) if absent. */
function loadOptional(pkg: string): any | null {
  try {
    return requireOptional(pkg);
  } catch {
    log.warn(
      `[AI Gateway] Provider package "${pkg}" not installed — substrate disabled. ` +
        `Run: npm i ${pkg}`,
    );
    return null;
  }
}

/**
 * Claude on AWS Bedrock. Credentials resolve via the standard AWS chain
 * (env / shared config / instance role); region from AI_BEDROCK_REGION or
 * AWS_REGION. Returns an AnthropicBedrock client (messages.create-compatible).
 */
export function createBedrockClient(): any | null {
  const mod = loadOptional('@anthropic-ai/bedrock-sdk');
  if (!mod) return null;
  const AnthropicBedrock = mod.AnthropicBedrock || mod.default;
  try {
    return new AnthropicBedrock({
      awsRegion: process.env.AI_BEDROCK_REGION || process.env.AWS_REGION,
    });
  } catch (e: any) {
    log.warn(`[AI Gateway] Bedrock client init failed: ${e.message}`);
    return null;
  }
}

/**
 * Claude on Google Vertex AI. Auth resolves via Application Default Credentials;
 * project + region from env. Returns an AnthropicVertex client.
 */
export function createVertexClient(): any | null {
  const mod = loadOptional('@anthropic-ai/vertex-sdk');
  if (!mod) return null;
  const AnthropicVertex = mod.AnthropicVertex || mod.default;
  try {
    return new AnthropicVertex({
      projectId: process.env.AI_VERTEX_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT,
      region: process.env.AI_VERTEX_REGION || 'us-east5',
    });
  } catch (e: any) {
    log.warn(`[AI Gateway] Vertex client init failed: ${e.message}`);
    return null;
  }
}

/**
 * OpenAI on Azure. Uses the AzureOpenAI class from the installed `openai`
 * package (loaded via require to avoid named-export coupling across SDK
 * versions). Requires AZURE_OPENAI_API_KEY + AZURE_OPENAI_ENDPOINT.
 */
export function createAzureClient(): any | null {
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  if (!apiKey || !endpoint) return null;
  try {
    const mod: any = requireOptional('openai');
    const AzureOpenAI = mod.AzureOpenAI;
    if (!AzureOpenAI) {
      log.warn('[AI Gateway] Installed openai SDK does not export AzureOpenAI — upgrade the package.');
      return null;
    }
    return new AzureOpenAI({
      apiKey,
      endpoint,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2025-01-01-preview',
    });
  } catch (e: any) {
    log.warn(`[AI Gateway] Azure client init failed: ${e.message}`);
    return null;
  }
}

/**
 * Self-hosted / local OpenAI-compatible endpoint (vLLM, LiteLLM proxy, TGI,
 * Ollama's OpenAI shim). Base URL from LOCAL_AI_BASE_URL (falls back to the
 * LiteLLM proxy URL). API key is usually unused for local servers.
 */
export function createLocalClient(): any | null {
  const baseURL =
    process.env.LOCAL_AI_BASE_URL || process.env.LITELLM_BASE_URL;
  if (!baseURL) return null;
  try {
    return new OpenAI({
      apiKey: process.env.LOCAL_AI_API_KEY || process.env.LITELLM_API_KEY || 'not-required',
      baseURL: baseURL.replace(/\/$/, ''),
    });
  } catch (e: any) {
    log.warn(`[AI Gateway] Local client init failed: ${e.message}`);
    return null;
  }
}
