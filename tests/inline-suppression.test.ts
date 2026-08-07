/**
 * Unit tests for the inline per-query suppression rules behind the
 * tenant-isolation CI gate. The gate's precision depends on a marker
 * suppressing ONLY the query it annotates, and on a bare (unjustified) marker
 * being ignored so every suppression stays auditable.
 */
import { describe, it, expect } from 'vitest';
import {
  // @ts-expect-error — plain .mjs module without type declarations
  collectSuppressions,
  // @ts-expect-error — plain .mjs module without type declarations
  suppressionFor,
  // @ts-expect-error — plain .mjs module without type declarations
  DEFAULT_LOOKBACK,
} from '../scripts/ci/lib/inline-suppression.mjs';

describe('collectSuppressions', () => {
  it('captures the justification and 1-based line number', () => {
    const src = [
      'const a = 1;',
      '// tenant-isolation-safe: RLS via withTenantContext',
      'query(`SELECT * FROM users`);',
    ].join('\n');
    const s = collectSuppressions(src) as Map<number, string>;
    expect(s.get(2)).toBe('RLS via withTenantContext');
  });

  it('ignores a bare marker with no justification', () => {
    const src = '// tenant-isolation-safe:\nquery(`SELECT 1`);';
    const s = collectSuppressions(src) as Map<number, string>;
    expect(s.size).toBe(0);
  });

  it('ignores a marker whose justification is only whitespace', () => {
    const src = '// tenant-isolation-safe:    \nquery(`SELECT 1`);';
    expect((collectSuppressions(src) as Map<number, string>).size).toBe(0);
  });

  it('is case-insensitive on the marker keyword', () => {
    const src = '// TENANT-ISOLATION-SAFE: global identity lookup by PK';
    const s = collectSuppressions(src) as Map<number, string>;
    expect(s.get(1)).toBe('global identity lookup by PK');
  });

  it('accepts the marker inside a SQL block comment too', () => {
    const src = '/* tenant-isolation-safe: system scope */\nexec(`DELETE FROM audit_events`);';
    const s = collectSuppressions(src) as Map<number, string>;
    // Reason is captured up to end-of-line; trailing `*/` rides along but the
    // suppression still resolves — placement as a JS line comment is preferred.
    expect(s.get(1)).toContain('system scope');
  });
});

describe('suppressionFor', () => {
  it('governs a query within lookback lines below the marker', () => {
    const s = new Map<number, string>([[10, 'reason A']]);
    expect(suppressionFor(10, s)).toBe('reason A'); // same line
    expect(suppressionFor(12, s)).toBe('reason A'); // within lookback
    expect(suppressionFor(10 + DEFAULT_LOOKBACK, s)).toBe('reason A'); // edge
  });

  it('does NOT govern a query beyond the lookback window', () => {
    const s = new Map<number, string>([[10, 'reason A']]);
    expect(suppressionFor(10 + DEFAULT_LOOKBACK + 1, s)).toBeNull();
  });

  it('does NOT govern a query ABOVE the marker', () => {
    const s = new Map<number, string>([[10, 'reason A']]);
    expect(suppressionFor(9, s)).toBeNull();
  });

  it('nearest marker above the query wins (no cross-borrowing)', () => {
    const s = new Map<number, string>([
      [10, 'far'],
      [14, 'near'],
    ]);
    expect(suppressionFor(15, s)).toBe('near');
  });

  it('returns null when there are no markers', () => {
    expect(suppressionFor(5, new Map())).toBeNull();
  });
});
