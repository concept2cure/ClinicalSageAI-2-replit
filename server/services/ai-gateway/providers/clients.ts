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
 *   - SDK retries are disabled: the gateway owns retry/backoff policy for all
 *     substrates, including its single-attempt streaming calls.
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
import Anthropic from '@anthropic-ai/sdk';
import { createScopedLogger } from '../../../utils/logger.js';
import { bedrockClientRegion, vertexClientRegion } from './placement';
import { assertCredentialUseCurrent, captureCredentialForUse,
  resolveTenantModelCredentialAvailability as readTenantModelCredentials,
  type TenantModelProvider } from '../../connectors/connector-registry.js';

export class TenantCredentialUnavailableError extends Error {
  readonly code = 'TENANT_CREDENTIAL_UNAVAILABLE';
  constructor() { super('The organization’s own model credential grant is unavailable or no longer authorizes this request. Nothing was sent.'); this.name = 'TenantCredentialUnavailableError'; }
}
export async function resolveTenantModelCredentialAvailability(organizationId: number, purpose: 'model_inference' | 'embedding' = 'model_inference') {
  try { return await readTenantModelCredentials(organizationId, undefined, purpose); } catch { throw new TenantCredentialUnavailableError(); }
}

/** Keep arbitrary provider error text, causes, headers and response bodies out
 * of logs and model context. Numeric status retains the gateway's retry rules. */
function tenantProviderError(error: unknown): Error & { status?: number } {
  const status = (error as { status?: unknown } | null)?.status;
  const safeStatus = typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
  const clean: Error & { status?: number } = new Error(`The customer-owned model request failed${safeStatus ? ` (HTTP ${safeStatus})` : ''}.`);
  if (safeStatus) clean.status = safeStatus;
  if ((error as { name?: unknown } | null)?.name === 'AbortError') clean.name = 'AbortError';
  return clean;
}

/** A fresh SDK object per tenant/request; no key enters GatewayRequest and no
 * client or token cache is shared between tenants. Every create rechecks the
 * captured revision and records use immediately before calling the SDK. */
type TenantProviderAdmission = (() => void) | { beforeCreate?: () => void; recheckBeforeCreate?: () => Promise<void> };
function tenantAdmissionCallbacks(admission?: TenantProviderAdmission) {
  return typeof admission === 'function' ? { beforeCreate: admission, recheckBeforeCreate: undefined }
    : { beforeCreate: admission?.beforeCreate, recheckBeforeCreate: admission?.recheckBeforeCreate };
}
export async function createTenantProviderClient(provider: string, organizationId: number, userId?: number, purpose: 'model_inference' | 'embedding' = 'model_inference', admission?: TenantProviderAdmission): Promise<any | null> {
  if (!['anthropic', 'openai', 'moonshot'].includes(provider)) return null;
  const availability = await resolveTenantModelCredentialAvailability(organizationId, purpose);
  if (availability.mode === 'platform') return null;
  if (!availability.providers.includes(provider as TenantModelProvider)) throw new TenantCredentialUnavailableError();
  let captured: Awaited<ReturnType<typeof captureCredentialForUse>>;
  try { captured = await captureCredentialForUse(organizationId, `llm_${provider}`, purpose); } catch { throw new TenantCredentialUnavailableError(); }
  if (!captured || typeof captured.credentials.apiKey !== 'string' || !captured.credentials.apiKey) throw new TenantCredentialUnavailableError();
  let sdk: any;
  try {
    sdk = provider === 'anthropic' ? new Anthropic({ apiKey: captured.credentials.apiKey, maxRetries: 0 })
      : new OpenAI({ apiKey: captured.credentials.apiKey, maxRetries: 0,
          ...(provider === 'moonshot' ? { baseURL: 'https://api.moonshot.ai/v1' } : {}) });
  } catch { throw new TenantCredentialUnavailableError(); }
  const { beforeCreate, recheckBeforeCreate } = tenantAdmissionCallbacks(admission);
  const invoke = (create: (...args: any[]) => any) => async (...args: any[]) => {
    try { await assertCredentialUseCurrent(captured!, userId); } catch { throw new TenantCredentialUnavailableError(); }
    // Current derivative custody follows the asynchronous credential audit;
    // synchronous model/PQ admission remains last, directly before the SDK.
    // Preserve its policy refusal; it is not a provider failure to sanitize.
    if (recheckBeforeCreate) await recheckBeforeCreate();
    beforeCreate?.();
    try {
      const result = await create(...args);
      if (result && typeof result[Symbol.asyncIterator] === 'function') {
        return { controller: result.controller,
          async *[Symbol.asyncIterator]() {
            try { for await (const event of result) yield event; } catch (error) { throw tenantProviderError(error); }
          } };
      }
      return result;
    } catch (error) { throw tenantProviderError(error); }
  };
  return provider === 'anthropic'
    ? { messages: { create: invoke((...args) => sdk.messages.create(...args)) },
        beta: { messages: { create: invoke((...args) => sdk.beta.messages.create(...args)) } } }
    : { chat: { completions: { create: invoke((...args) => sdk.chat.completions.create(...args)) } },
        ...(provider === 'openai' ? { embeddings: { create: invoke((...args) => sdk.embeddings.create(...args)) } } : {}) };
}

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
      // The same region the placement registry derives residency from.
      awsRegion: bedrockClientRegion(),
      maxRetries: 0,
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
      region: vertexClientRegion(),
      maxRetries: 0,
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
      maxRetries: 0,
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
      maxRetries: 0,
    });
  } catch (e: any) {
    log.warn(`[AI Gateway] Local client init failed: ${e.message}`);
    return null;
  }
}
