/**
 * Tests — a schema the caller asked for either constrains the model, or says it
 * did not.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `jsonMode` / `jsonSchema` were honoured on the OpenAI path (`response_format`)
 * and on Moonshot, and NOWHERE in either Anthropic executor. Anthropic is the
 * primary provider. So `ai.structured()` — used by around fifteen services,
 * several of them in governed paths — sent a schema that was silently dropped,
 * got back free-form text, and ran it through a hopeful `JSON.parse`.
 *
 * ── Why this does not throw ───────────────────────────────────────────────────
 * The obvious fix is to refuse when the resolved model cannot constrain the
 * output. That would be wrong here: the model usually returns valid JSON anyway,
 * `structured()` already throws when the parse fails, and the router lands on a
 * model without the capability (Sonnet 4.6, the private-cloud rungs) whenever it
 * falls back. Throwing would convert working calls into outages.
 *
 * The defect is the SILENCE, not the unconstrained output. So the guarantee is
 * applied where it exists, and its absence is reported rather than hidden —
 * `structuredOutputEnforced` on the response says which of the two happened, so
 * a governed caller can tell a constrained answer from a lucky one.
 */

import { describe, it, expect, vi } from 'vitest';

import { AIGateway } from '../gateway';
import type { GatewayRequest, ModelConfig } from '../types';

const base: ModelConfig = {
  id: 'claude-opus-4',
  provider: 'anthropic',
  model: 'claude-opus-5',
  contextWindow: 1_000_000,
  qualityScore: 99,
  costPer1kInput: 0.005,
  costPer1kOutput: 0.025,
  capabilities: ['structured_output'],
  enabled: true,
  thinkingMode: 'adaptive',
  supportsSamplingParams: false,
};

const CONSTRAINS: ModelConfig = { ...base, supportsStructuredOutputs: true };
const DOES_NOT: ModelConfig = { ...base, supportsStructuredOutputs: false };

const SCHEMA = {
  type: 'object',
  properties: { species: { type: 'string' }, glpCompliant: { type: 'boolean' } },
  required: ['species', 'glpCompliant'],
  additionalProperties: false,
};

function structuredRequest(over: Partial<GatewayRequest> = {}): GatewayRequest {
  return {
    taskType: 'structured_output',
    messages: [{ role: 'user', content: 'Extract the study facts.' }],
    maxTokens: 500,
    jsonMode: true,
    jsonSchema: SCHEMA,
    ...over,
  } as unknown as GatewayRequest;
}

/** Run one non-streaming Anthropic call and hand back params + response. */
async function call(model: ModelConfig, request: GatewayRequest) {
  const gateway = new AIGateway({ deterministicMode: true, auditEnabled: false });
  const create = vi.fn(async (..._args: unknown[]) => ({
    content: [{ type: 'text', text: '{"species":"rat","glpCompliant":true}' }],
    usage: { input_tokens: 5, output_tokens: 9 },
    stop_reason: 'end_turn',
    model: model.model,
  }));
  (gateway as any).anthropicClient = { messages: { create } };

  const response = await (gateway as any).executeAnthropic(model, request, 'req-1', Date.now());
  return { params: create.mock.calls[0][0] as any, response };
}

describe('structured output reaches Claude', () => {
  it('sends output_config.format when the model can constrain it', async () => {
    const { params } = await call(CONSTRAINS, structuredRequest());
    expect(params.output_config?.format).toEqual({ type: 'json_schema', schema: SCHEMA });
  });

  it('reports the guarantee as applied', async () => {
    const { response } = await call(CONSTRAINS, structuredRequest());
    expect(response.structuredOutputEnforced).toBe(true);
  });

  it('sends nothing when the caller did not ask for a schema', async () => {
    const { params } = await call(
      CONSTRAINS,
      structuredRequest({ jsonMode: undefined, jsonSchema: undefined }),
    );
    expect(params.output_config?.format).toBeUndefined();
  });

  it('does not invent a schema from jsonMode alone', async () => {
    // Anthropic has no `json_object` mode — the OpenAI path's fallback for
    // schema-less JSON has no counterpart here. Asking for JSON without a
    // schema is a prompt instruction, not a wire parameter, and fabricating an
    // empty schema would constrain the model to nothing.
    const { params, response } = await call(
      CONSTRAINS,
      structuredRequest({ jsonSchema: undefined }),
    );
    expect(params.output_config?.format).toBeUndefined();
    expect(response.structuredOutputEnforced).toBe(false);
  });
});

describe('a model that cannot constrain says so, and still answers', () => {
  it('does not send output_config.format', async () => {
    const { params } = await call(DOES_NOT, structuredRequest());
    expect(params.output_config?.format).toBeUndefined();
  });

  it('still returns the answer rather than throwing', async () => {
    // Around fifteen services call ai.structured(). The router reaches a model
    // without the capability whenever it falls back, and refusing there would
    // turn a silent gap into an outage.
    const { response } = await call(DOES_NOT, structuredRequest());
    expect(response.content).toContain('rat');
  });

  it('reports the guarantee as NOT applied — the point of the change', async () => {
    // The caller asked for a constrained answer and did not get one. Returning
    // that indistinguishably from a constrained one is the defect; this flag is
    // the fix.
    const { response } = await call(DOES_NOT, structuredRequest());
    expect(response.structuredOutputEnforced).toBe(false);
  });

  it('an entry that does not declare the capability is treated as not having it', async () => {
    const undeclared = { ...base } as ModelConfig;
    const { params, response } = await call(undeclared, structuredRequest());
    expect(params.output_config?.format).toBeUndefined();
    expect(response.structuredOutputEnforced).toBe(false);
  });
});

describe('structured output and citations cannot both be sent', () => {
  it('refuses the combination rather than letting the API 400 it', async () => {
    // Sending both returns a 400. Nothing hits this today because the Files-API
    // upload half is unwired, but the moment citations are reachable a governed
    // path wanting a schema over a cited document would find it in production.
    const withCitation = structuredRequest({
      messages: [
        {
          role: 'user',
          content: 'Extract the study facts.',
          contentBlocks: [
            {
              type: 'document',
              source: { type: 'file', file_id: 'file_123' },
              citations: { enabled: true },
            },
            { type: 'text', text: 'Extract the study facts.' },
          ],
        },
      ],
    } as Partial<GatewayRequest>);

    await expect(call(CONSTRAINS, withCitation)).rejects.toThrow(/citation/i);
  });

  it('leaves a cited request alone when no schema was asked for', async () => {
    const citedOnly = structuredRequest({
      jsonMode: undefined,
      jsonSchema: undefined,
      messages: [
        {
          role: 'user',
          content: 'What does it say?',
          contentBlocks: [
            {
              type: 'document',
              source: { type: 'file', file_id: 'file_123' },
              citations: { enabled: true },
            },
            { type: 'text', text: 'What does it say?' },
          ],
        },
      ],
    } as Partial<GatewayRequest>);

    const { params } = await call(CONSTRAINS, citedOnly);
    expect(params.output_config?.format).toBeUndefined();
    expect(params.messages[0].content[0].citations).toEqual({ enabled: true });
  });
});

describe('API effort reaches the model', () => {
  it('sends output_config.effort when the caller set one', async () => {
    const { params } = await call(
      CONSTRAINS,
      structuredRequest({ jsonMode: undefined, jsonSchema: undefined, apiEffort: 'high' } as Partial<GatewayRequest>),
    );
    expect(params.output_config?.effort).toBe('high');
  });

  it('carries effort and format together in one output_config', async () => {
    // Two independent settings on the same object. An implementation that
    // assigned output_config twice would silently drop whichever came first.
    const { params } = await call(
      CONSTRAINS,
      structuredRequest({ apiEffort: 'low' } as Partial<GatewayRequest>),
    );
    expect(params.output_config).toEqual({
      format: { type: 'json_schema', schema: SCHEMA },
      effort: 'low',
    });
  });

  it('sends no output_config at all when neither was asked for', async () => {
    const { params } = await call(
      CONSTRAINS,
      structuredRequest({ jsonMode: undefined, jsonSchema: undefined }),
    );
    expect(params.output_config).toBeUndefined();
  });
});
