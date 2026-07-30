/**
 * useRbqm helpers — attention-feed ordering.
 *
 * The RBQM zone ranks a mixed-vocabulary attention feed most-urgent
 * first. These tests hold the two properties that keep that honest: an
 * unrecognised severity sorts to the middle (never masquerading as the
 * most urgent), and equal severities keep their original order so the
 * ranking is stable.
 */

import { describe, it, expect } from 'vitest';
import { attentionRank, orderAttention, type AttentionItem } from '../useRbqm';

function item(severity: string, label: string): AttentionItem {
  return { severity, kind: 'kri', label };
}

describe('attentionRank', () => {
  it('ranks critical vocabulary above high above low', () => {
    expect(attentionRank('critical')).toBeLessThan(attentionRank('high'));
    expect(attentionRank('high')).toBeLessThan(attentionRank('low'));
  });

  it('treats the err/warn vocabulary as equivalent to critical/high', () => {
    expect(attentionRank('err')).toBe(attentionRank('critical'));
    expect(attentionRank('warn')).toBe(attentionRank('high'));
  });

  it('is case-insensitive', () => {
    expect(attentionRank('CRITICAL')).toBe(attentionRank('critical'));
  });

  it('sends an unknown severity to the middle, not the top', () => {
    const unknown = attentionRank('banana');
    expect(unknown).toBeGreaterThan(attentionRank('critical'));
    expect(unknown).toBeLessThan(attentionRank('low'));
  });
});

describe('orderAttention', () => {
  it('orders most-urgent first', () => {
    const ordered = orderAttention([
      item('low', 'a'),
      item('critical', 'b'),
      item('high', 'c'),
    ]);
    expect(ordered.map((x) => x.label)).toEqual(['b', 'c', 'a']);
  });

  it('is stable for equal severities — original order preserved', () => {
    const ordered = orderAttention([
      item('high', 'first'),
      item('high', 'second'),
      item('high', 'third'),
    ]);
    expect(ordered.map((x) => x.label)).toEqual(['first', 'second', 'third']);
  });

  it('does not mutate the input array', () => {
    const input = [item('low', 'a'), item('critical', 'b')];
    const snapshot = input.map((x) => x.label);
    orderAttention(input);
    expect(input.map((x) => x.label)).toEqual(snapshot);
  });
});
