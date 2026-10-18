import { describe, it, expect } from 'vitest';
import { openAIToolSchema } from '../openai-tool-schema';
describe('OpenAI function parameter projection', () => {
  it('removes rejected root constraints without mutating canonical validation', () => {
    const properties = { mode: { enum: ['description', 'preview'] }, facts: { anyOf: [{ type: 'string' }, { type: 'number' }] } };
    const source = { type: 'object', properties, required: ['mode'], oneOf: [{ required: ['facts'] }], not: { required: ['unknown'] } };
    const before = JSON.stringify(source);
    const wire = openAIToolSchema(source);
    expect(wire).toEqual({ type: 'object', properties, required: ['mode'] });
    expect(JSON.stringify(source)).toBe(before);
    expect(wire.properties).toEqual(properties);
  });
});
