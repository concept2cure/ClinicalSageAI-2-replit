/**
 * Unit tests for the string-literal lexer behind the tenant-isolation CI
 * gate. The gate's correctness depends on each SQL template literal being
 * extracted WHOLE — the historical regex extractor cut literals at the
 * first embedded quote, which both hid real cross-tenant queries (false
 * negatives) and flagged scoped ones (false positives).
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs module without type declarations
import { extractStringLiterals } from '../scripts/ci/lib/extract-string-literals.mjs';

const values = (src: string) => extractStringLiterals(src).map((l: any) => l.value);

describe('extractStringLiterals', () => {
  it('extracts a template literal whole when it contains single-quoted SQL strings', () => {
    const src = 'const q = `UPDATE users SET email = CONCAT(\'erased+\', id) WHERE organization_id = $1`;';
    const lits = values(src);
    expect(lits).toHaveLength(1);
    expect(lits[0]).toContain('organization_id = $1');
  });

  it('keeps separate adjacent strings separate', () => {
    const src = `f('one', "two", \`three\`)`;
    expect(values(src)).toEqual([`'one'`, `"two"`, '`three`']);
  });

  it('does not mispair quotes across comments', () => {
    const src = "// it's a comment with an apostrophe\nconst q = `SELECT * FROM projects WHERE org_id = $1`;";
    const lits = values(src);
    expect(lits).toHaveLength(1);
    expect(lits[0]).toContain('org_id = $1');
  });

  it('skips block comments containing quotes', () => {
    const src = '/* don\'t "trip" on this */ const a = `SELECT 1`;';
    expect(values(src)).toEqual(['`SELECT 1`']);
  });

  it('treats ${} interpolation as part of the template literal', () => {
    const src = 'const q = `SELECT * FROM t WHERE x = ${cond ? "a" : "b"} AND org_id = $1`;';
    const lits = values(src);
    expect(lits).toHaveLength(1);
    expect(lits[0]).toContain('AND org_id = $1');
  });

  it('handles escaped quotes inside strings', () => {
    const src = `const a = 'it\\'s fine'; const b = \`SELECT 2\`;`;
    const lits = values(src);
    expect(lits).toHaveLength(2);
    expect(lits[1]).toBe('`SELECT 2`');
  });

  it('stops an unterminated single quote at end of line instead of swallowing the file', () => {
    const src = "const broken = 'oops\nconst q = `SELECT 3`;";
    const lits = values(src);
    expect(lits[lits.length - 1]).toBe('`SELECT 3`');
  });

  it('reports correct start offsets', () => {
    const src = 'ab `xyz`';
    const lits = extractStringLiterals(src);
    expect(lits[0].start).toBe(3);
  });
});
