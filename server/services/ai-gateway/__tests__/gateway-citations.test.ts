/**
 * Tests — a citation survives the stream, or AnA cannot say where she read it.
 *
 * ── Why enabling citations was not going to be enough ─────────────────────────
 * The repository already had the request half: `anthropic-files.ts` builds
 * document blocks with `citations: {enabled: true}`, and the gateway passes
 * `block.citations` through. What it did not have was the RESPONSE half.
 *
 * Citations arrive on the streaming path as `content_block_delta` events with
 * `delta.type === 'citations_delta'`. `executeAnthropicStream` handled
 * `text_delta`, `thinking_delta` and `input_json_delta` — and nothing else.
 * `citations_delta` appeared nowhere in the repository. So turning citations on
 * would have cost tokens, produced citations, and dropped every one of them
 * before any caller saw it: the same shape of defect as the tool inputs, on the
 * same code path.
 *
 * ── Why this matters here specifically ────────────────────────────────────────
 * `tool-pedigree.ts` grades every assertion on five tiers, and anything the
 * model wrote lands on `model_assisted` — "verify before relying". A citation
 * carrying `cited_text` and a page number is a different kind of claim: not
 * "the model says" but "page 34 of this document says, and here is the span".
 * That is the difference between a draft a reviewer must check line by line and
 * one they can spot-check against the source.
 */

import { describe, it, expect, vi } from 'vitest';

import { AIGateway } from '../gateway';
import type { GatewayRequest, ModelConfig } from '../types';

const modelConfig: ModelConfig = {
  id: 'claude-opus-4',
  provider: 'anthropic',
  model: 'claude-opus-5',
  contextWindow: 1_000_000,
  qualityScore: 99,
  costPer1kInput: 0.005,
  costPer1kOutput: 0.025,
  capabilities: ['chat'],
  enabled: true,
  thinkingMode: 'adaptive',
  supportsSamplingParams: false,
};

function gatewayYielding(events: any[]) {
  const gateway = new AIGateway({ deterministicMode: true, auditEnabled: false });
  async function* gen() {
    for (const e of events) yield e;
  }
  (gateway as any).anthropicClient = { messages: { create: vi.fn(async () => gen()) } };
  return gateway;
}

function streamRequest(): GatewayRequest {
  return {
    taskType: 'chat',
    messages: [{ role: 'user', content: 'What does the protocol say about the primary endpoint?' }],
    maxTokens: 1000,
    stream: true,
    onStream: () => {},
  } as unknown as GatewayRequest;
}

function wrap(body: any[]) {
  return [
    { type: 'message_start', message: { model: 'claude-opus-5', usage: { input_tokens: 40 } } },
    ...body,
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 30 } },
    { type: 'message_stop' },
  ];
}

const PAGE_CITATION = {
  type: 'page_location',
  cited_text: 'The primary endpoint is overall survival at 24 months.',
  document_index: 0,
  document_title: 'Protocol v3.2',
  start_page_number: 34,
  end_page_number: 34,
  file_id: null,
};

describe('citations survive the streaming path', () => {
  it('collects a page citation off citations_delta', async () => {
    const gateway = gatewayYielding(
      wrap([
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Overall survival at 24 months.' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'citations_delta', citation: PAGE_CITATION } },
        { type: 'content_block_stop', index: 0 },
      ]),
    );

    const res = await (gateway as any).executeAnthropicStream(
      modelConfig,
      streamRequest(),
      'req-1',
      Date.now(),
    );

    expect(res.citations).toHaveLength(1);
    expect(res.citations[0].citedText).toBe(PAGE_CITATION.cited_text);
    expect(res.citations[0].documentTitle).toBe('Protocol v3.2');
    expect(res.citations[0].startPage).toBe(34);
  });

  it('keeps the answer text intact alongside them', async () => {
    const gateway = gatewayYielding(
      wrap([
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Overall survival.' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'citations_delta', citation: PAGE_CITATION } },
        { type: 'content_block_stop', index: 0 },
      ]),
    );
    const res = await (gateway as any).executeAnthropicStream(modelConfig, streamRequest(), 'r', Date.now());
    expect(res.content).toBe('Overall survival.');
  });

  it('collects several citations in order', async () => {
    const second = { ...PAGE_CITATION, start_page_number: 41, end_page_number: 41, cited_text: 'Secondary endpoints follow.' };
    const gateway = gatewayYielding(
      wrap([
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'citations_delta', citation: PAGE_CITATION } },
        { type: 'content_block_delta', index: 0, delta: { type: 'citations_delta', citation: second } },
        { type: 'content_block_stop', index: 0 },
      ]),
    );
    const res = await (gateway as any).executeAnthropicStream(modelConfig, streamRequest(), 'r', Date.now());
    expect(res.citations.map((c: any) => c.startPage)).toEqual([34, 41]);
  });

  it('handles a character-range citation from a text document', async () => {
    // A .txt attachment cites by character offset, not page.
    const charCitation = {
      type: 'char_location',
      cited_text: 'GLP compliance was confirmed.',
      document_index: 0,
      document_title: 'Study report',
      start_char_index: 1200,
      end_char_index: 1229,
      file_id: null,
    };
    const gateway = gatewayYielding(
      wrap([
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'citations_delta', citation: charCitation } },
        { type: 'content_block_stop', index: 0 },
      ]),
    );
    const res = await (gateway as any).executeAnthropicStream(modelConfig, streamRequest(), 'r', Date.now());
    expect(res.citations[0].citedText).toBe('GLP compliance was confirmed.');
    expect(res.citations[0].startPage).toBeUndefined();
  });

  it('carries a web-search citation, which is a different source of truth', async () => {
    // The agency allowlist makes web search the regulatory-currency path, and a
    // cited URL is what separates "the guidance says" from "the model recalls".
    const webCitation = {
      type: 'web_search_result_location',
      cited_text: 'The LDT final rule was vacated.',
      url: 'https://www.fda.gov/example',
      title: 'FDA guidance',
      encrypted_index: 'abc',
    };
    const gateway = gatewayYielding(
      wrap([
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'citations_delta', citation: webCitation } },
        { type: 'content_block_stop', index: 0 },
      ]),
    );
    const res = await (gateway as any).executeAnthropicStream(modelConfig, streamRequest(), 'r', Date.now());
    expect(res.citations[0].url).toBe('https://www.fda.gov/example');
    expect(res.citations[0].citedText).toContain('vacated');
  });

  it('reports no citations rather than an empty list when none were produced', async () => {
    // An empty array would read as "we looked and there were none", which for a
    // turn with no cited document is a claim we cannot make. Undefined says the
    // question does not apply.
    const gateway = gatewayYielding(
      wrap([
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'From memory.' } },
        { type: 'content_block_stop', index: 0 },
      ]),
    );
    const res = await (gateway as any).executeAnthropicStream(modelConfig, streamRequest(), 'r', Date.now());
    expect(res.citations).toBeUndefined();
  });
});
