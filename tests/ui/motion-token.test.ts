/**
 * The motion token says what it is (filing-spine design review, open item 11,
 * 2026-10-15).
 *
 * The calm-motion rule (.claude/skills/motion-discipline/SKILL.md, the design
 * advisories) is 200ms ease-out with no overshoot, and `--ease` is the token
 * that carries it into 277 transitions. Its comment said "200ms ease-out, no
 * overshoot"; its value was cubic-bezier(0.4, 0, 0.2, 1), an ease-in-out that
 * starts slowly. This holds the value to the comment.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.resolve(__dirname, '../../design-system/colors_and_type.css'), 'utf8');
const token = (name: string) => css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim() ?? null;

describe('the motion tokens', () => {
  it('--ease is an ease-out with no overshoot', () => {
    const m = token('--ease')?.match(/^cubic-bezier\(\s*([\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*([\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/);
    expect(m, 'a cubic-bezier').toBeTruthy();
    const [x1, y1, , y2] = m!.slice(1).map(Number);
    // Starts at or above the diagonal: it moves at once, then decelerates.
    expect(x1).toBeLessThanOrEqual(y1);
    // Arrives at rest, and never passes the target.
    expect(y2).toBe(1);
    expect(y1).toBeGreaterThanOrEqual(0);
    expect(y1).toBeLessThanOrEqual(1);
  });

  it('the default duration is 200ms', () => {
    expect(token('--dur-normal')).toBe('200ms');
  });
});
