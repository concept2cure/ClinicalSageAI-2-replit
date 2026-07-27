/**
 * PHI/PII placement screen — enforcement decision + text extraction.
 *
 * Guards the gate that makes the gateway's piiDetection flag real: protected
 * data must not silently reach a non-zero-retention provider.
 */

import { describe, it, expect } from 'vitest';
import {
  decideSensitiveDataPlacement,
  extractRequestText,
  getPiiEnforcement,
} from '../../server/services/ai-gateway/pii-screen';
import type { GatewayRequest } from '../../server/services/ai-gateway/types';

const phi = { phi: true, pii: false, classes: ['phi' as const] };
const pii = { phi: false, pii: true, classes: ['pii' as const] };
const clean = { phi: false, pii: false, classes: ['public' as const] };

describe('decideSensitiveDataPlacement', () => {
  it("block mode: refuses PHI to a non-zero-retention provider", () => {
    const d = decideSensitiveDataPlacement({
      classification: phi,
      zeroDataRetention: false,
      enforcement: 'block',
      provider: 'openai',
    });
    expect(d.block).toBe(true);
    expect(d.detected).toBe(true);
    expect(d.reason).toMatch(/PHI/);
    expect(d.reason).toMatch(/openai/);
  });

  it('block mode: allows PHI to a zero-retention provider', () => {
    const d = decideSensitiveDataPlacement({
      classification: phi,
      zeroDataRetention: true,
      enforcement: 'block',
      provider: 'bedrock',
    });
    expect(d.block).toBe(false);
    expect(d.detected).toBe(true);
  });

  it('audit mode: detects but never blocks', () => {
    const d = decideSensitiveDataPlacement({
      classification: pii,
      zeroDataRetention: false,
      enforcement: 'audit',
      provider: 'openai',
    });
    expect(d.block).toBe(false);
    expect(d.detected).toBe(true);
  });

  it('off mode: never blocks (detection still reported from classification)', () => {
    const d = decideSensitiveDataPlacement({
      classification: phi,
      zeroDataRetention: false,
      enforcement: 'off',
      provider: 'openai',
    });
    expect(d.block).toBe(false);
    expect(d.detected).toBe(true);
  });

  it('clean content never blocks, even in block mode on a shared provider', () => {
    const d = decideSensitiveDataPlacement({
      classification: clean,
      zeroDataRetention: false,
      enforcement: 'block',
      provider: 'openai',
    });
    expect(d.block).toBe(false);
    expect(d.detected).toBe(false);
  });
});

describe('extractRequestText', () => {
  it('concatenates message content and text content blocks', () => {
    const req = {
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        {
          role: 'user',
          content: 'Patient summary:',
          contentBlocks: [
            { type: 'text', text: 'MRN: 12345' },
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'x' } },
          ],
        },
      ],
    } as unknown as GatewayRequest;
    const text = extractRequestText(req);
    expect(text).toContain('helpful assistant');
    expect(text).toContain('Patient summary');
    expect(text).toContain('MRN: 12345');
    expect(text).not.toContain('base64');
  });

  it('handles empty/missing messages safely', () => {
    expect(extractRequestText({ messages: [] } as unknown as GatewayRequest)).toBe('');
    expect(extractRequestText({} as unknown as GatewayRequest)).toBe('');
  });
});

describe('getPiiEnforcement', () => {
  const original = process.env.AI_PII_ENFORCEMENT;
  const restore = () => {
    if (original === undefined) delete process.env.AI_PII_ENFORCEMENT;
    else process.env.AI_PII_ENFORCEMENT = original;
  };

  it('defaults to audit and normalizes values', () => {
    delete process.env.AI_PII_ENFORCEMENT;
    expect(getPiiEnforcement()).toBe('audit');
    process.env.AI_PII_ENFORCEMENT = 'BLOCK';
    expect(getPiiEnforcement()).toBe('block');
    process.env.AI_PII_ENFORCEMENT = 'off';
    expect(getPiiEnforcement()).toBe('off');
    process.env.AI_PII_ENFORCEMENT = 'nonsense';
    expect(getPiiEnforcement()).toBe('audit');
    restore();
  });
});
