/**
 * PHI/PII screening support — enforcement-mode resolution + text extraction.
 *
 * The placement DECISION itself is owned by sensitive-placement-policy.ts
 * (`decideSensitivePlacement`) and tested in
 * server/services/ai-gateway/__tests__/sensitive-placement-policy.test.ts.
 * This file covers only the pii-screen module's live surface.
 */

import { describe, it, expect } from 'vitest';
import {
  extractRequestText,
  getPiiEnforcement,
} from '../../server/services/ai-gateway/pii-screen';
import type { GatewayRequest } from '../../server/services/ai-gateway/types';

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
