/**
 * Tests — formatToolInput, the pretty-printer behind the per-step tool-I/O
 * audit disclosure. Must never throw and must hide empty/absent input.
 */
import { describe, it, expect } from 'vitest';

import { formatToolInput } from '../Message';

describe('formatToolInput', () => {
  it('pretty-prints an object as indented JSON', () => {
    const out = formatToolInput({ query: 'predicate', limit: 5 });
    expect(out).toContain('"query": "predicate"');
    expect(out).toContain('\n'); // indented, multi-line
  });

  it('passes a plain string through', () => {
    expect(formatToolInput('K123456')).toBe('K123456');
  });

  it('hides an empty object and null/undefined (nothing to inspect)', () => {
    expect(formatToolInput({})).toBeNull();
    expect(formatToolInput(null)).toBeNull();
    expect(formatToolInput(undefined)).toBeNull();
  });

  it('never throws on a circular / non-serializable input', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => formatToolInput(circular)).not.toThrow();
    expect(formatToolInput(circular)).toBeNull();
  });
});
