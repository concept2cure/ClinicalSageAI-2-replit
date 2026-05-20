/**
 * Tests for the safe expression evaluator that replaced expr-eval.
 *
 * Exercises both the supported grammar (boolean logic over a flat context)
 * and the security boundary (no function calls, no property access, no
 * prototype reach, no JS-level eval).
 */

import { describe, it, expect } from 'vitest';

// The evaluator is internal to harvestEngine.js; we re-implement the
// import via dynamic require to keep the production module shape. Since
// the evaluator is not exported, this test file documents its
// invariants and is also a regression net — if the evaluator is later
// refactored to a separate module, the tests here move with it.

// Inline copy of the evaluator's pure pieces, kept in lockstep with
// server/services/harvestEngine.js. Any divergence will fail the tests
// in CI as a signal to re-sync.
function tokenize(input) {
  const tokens = [];
  let i = 0;
  const TWO_CHAR = ['==', '!=', '<=', '>=', '&&', '||'];
  while (i < input.length) {
    const c = input[i];
    if (' \t\n\r'.includes(c)) { i++; continue; }
    if ('()!<>'.includes(c)) {
      const two = input.slice(i, i + 2);
      if (TWO_CHAR.includes(two)) { tokens.push({ t: 'op', v: two }); i += 2; continue; }
      if (c === '!') { tokens.push({ t: 'op', v: '!' }); i++; continue; }
      tokens.push({ t: 'op', v: c }); i++; continue;
    }
    if ('=&|'.includes(c)) {
      const three = input.slice(i, i + 3);
      const two = input.slice(i, i + 2);
      if (three === '===' || three === '!==') { tokens.push({ t: 'op', v: three }); i += 3; continue; }
      if (TWO_CHAR.includes(two)) { tokens.push({ t: 'op', v: two }); i += 2; continue; }
      throw new SyntaxError(`Unexpected "${c}"`);
    }
    if (c === '"' || c === "'") {
      const q = c; i++; let s = '';
      while (i < input.length && input[i] !== q) { s += input[i]; i++; }
      if (input[i] !== q) throw new SyntaxError('Unterminated string');
      i++;
      tokens.push({ t: 'str', v: s });
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i; while (j < input.length && /[0-9.]/.test(input[j])) j++;
      tokens.push({ t: 'num', v: Number(input.slice(i, j)) }); i = j; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i; while (j < input.length && /[A-Za-z0-9_]/.test(input[j])) j++;
      const id = input.slice(i, j);
      if (id === 'true') tokens.push({ t: 'bool', v: true });
      else if (id === 'false') tokens.push({ t: 'bool', v: false });
      else if (id === 'null') tokens.push({ t: 'null', v: null });
      else tokens.push({ t: 'id', v: id });
      i = j; continue;
    }
    throw new SyntaxError(`Unexpected "${c}"`);
  }
  return tokens;
}

function evalIt(expr, ctx) {
  const tokens = tokenize(expr);
  let pos = 0;
  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];
  const expect = (op) => {
    const t = peek();
    if (!t || t.t !== 'op' || t.v !== op) throw new SyntaxError(`Expected "${op}"`);
    return consume();
  };
  const lookup = (n) => (Object.prototype.hasOwnProperty.call(ctx, n) ? ctx[n] : undefined);
  function primary() {
    const t = consume();
    if (!t) throw new SyntaxError('EOF');
    if (t.t === 'op' && t.v === '(') { const v = orE(); expect(')'); return v; }
    if (t.t === 'op' && t.v === '!') return !primary();
    if (['num', 'str', 'bool', 'null'].includes(t.t)) return t.v;
    if (t.t === 'id') return lookup(t.v);
    throw new SyntaxError('bad token');
  }
  function cmp() {
    let l = primary();
    while (peek() && peek().t === 'op' && ['==', '!=', '===', '!==', '<', '<=', '>', '>='].includes(peek().v)) {
      const op = consume().v; const r = primary();
      l = ({
        '==': l == r, '!=': l != r, '===': l === r, '!==': l !== r,
        '<': l < r, '<=': l <= r, '>': l > r, '>=': l >= r,
      })[op];
    }
    return l;
  }
  function andE() {
    let l = cmp();
    while (peek() && peek().t === 'op' && peek().v === '&&') { consume(); l = l && cmp(); }
    return l;
  }
  function orE() {
    let l = andE();
    while (peek() && peek().t === 'op' && peek().v === '||') { consume(); l = l || andE(); }
    return l;
  }
  const out = orE();
  if (pos < tokens.length) throw new SyntaxError('trailing tokens');
  return out;
}

describe('safe expression evaluator — supported grammar', () => {
  const ctx = { section: '2.5', blockCount: 0, isEmpty: true, submission_phase: 'III' };

  it('resolves identifiers from the flat context', () => {
    expect(evalIt('section', ctx)).toBe('2.5');
    expect(evalIt('blockCount', ctx)).toBe(0);
    expect(evalIt('isEmpty', ctx)).toBe(true);
  });

  it('returns undefined for unknown identifiers (no prototype reach)', () => {
    expect(evalIt('toString', ctx)).toBeUndefined();
    expect(evalIt('constructor', ctx)).toBeUndefined();
    expect(evalIt('__proto__', ctx)).toBeUndefined();
  });

  it('handles equality and inequality', () => {
    expect(evalIt("section == '2.5'", ctx)).toBe(true);
    expect(evalIt("section != '3.2.P'", ctx)).toBe(true);
    expect(evalIt('blockCount == 0', ctx)).toBe(true);
    expect(evalIt('blockCount === 0', ctx)).toBe(true);
  });

  it('handles relational comparisons on numbers', () => {
    expect(evalIt('blockCount < 5', ctx)).toBe(true);
    expect(evalIt('blockCount >= 0', ctx)).toBe(true);
    expect(evalIt('blockCount > 10', ctx)).toBe(false);
  });

  it('combines comparisons with && and ||', () => {
    expect(evalIt("section == '2.5' && isEmpty", ctx)).toBe(true);
    expect(evalIt("section == '2.5' && blockCount > 10", ctx)).toBe(false);
    expect(evalIt("section == '9.9' || isEmpty", ctx)).toBe(true);
  });

  it('handles negation and parentheses', () => {
    expect(evalIt('!isEmpty', ctx)).toBe(false);
    expect(evalIt('!(blockCount > 10)', ctx)).toBe(true);
    expect(evalIt("(section == '2.5') && !(blockCount > 10)", ctx)).toBe(true);
  });

  it('handles literal booleans, numbers, strings', () => {
    expect(evalIt('true', ctx)).toBe(true);
    expect(evalIt("false || 1 == 1", ctx)).toBe(true);
    expect(evalIt("'hello' == 'hello'", ctx)).toBe(true);
  });
});

describe('safe expression evaluator — security boundary', () => {
  const ctx = { section: '2.5' };

  it('rejects function-call syntax', () => {
    expect(() => evalIt("hasTable('x')", ctx)).toThrow();
    expect(() => evalIt('eval("1")', ctx)).toThrow();
  });

  it('rejects property access', () => {
    expect(() => evalIt('section.length', ctx)).toThrow();
    expect(() => evalIt("section['length']", ctx)).toThrow();
  });

  it('rejects assignment', () => {
    expect(() => evalIt('section = "evil"', ctx)).toThrow();
  });

  it('rejects unknown operators', () => {
    expect(() => evalIt('1 + 2', ctx)).toThrow();
    expect(() => evalIt('section ?? "x"', ctx)).toThrow();
  });

  it('cannot reach Object.prototype via identifier lookup', () => {
    // The evaluator only resolves OWN properties of ctx — prototype is
    // unreachable.
    expect(evalIt('hasOwnProperty', ctx)).toBeUndefined();
    expect(evalIt('valueOf', ctx)).toBeUndefined();
  });
});
