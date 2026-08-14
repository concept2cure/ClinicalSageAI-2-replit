/**
 * Golden vectors for the canonical JSON serializer.
 *
 * These are not example-based tests, they are a contract. A hash is only
 * comparable to another hash produced by the same serializer, so any change to
 * this function's output silently invalidates every digest ever written with
 * it. These vectors exist so that such a change cannot happen by accident: if
 * one of them moves, the person moving it has to decide what happens to the
 * stored hashes, which is the whole point.
 *
 * Every case below is one the nine copies in ledger L46 disagreed on.
 */
import { describe, expect, it } from 'vitest';

import { stableStringify, stableHash } from '../canonical-json';

describe('canonical JSON — golden vectors', () => {
  const vectors: Array<[string, unknown, string]> = [
    ['sorts object keys', { b: 1, a: 2 }, '{"a":2,"b":1}'],
    ['sorts recursively', { a: { z: 1, y: 2 } }, '{"a":{"y":2,"z":1}}'],
    ['leaves array order alone', [3, { b: 1, a: 2 }], '[3,{"a":2,"b":1}]'],
    // The provenance.ts copy returned '' here, producing output like
    // `{"a":1,"b":}` — not valid JSON, and the reason this row is severe.
    ['serializes a null value as null', { a: 1, b: null }, '{"a":1,"b":null}'],
    ['serializes a bare null as null', null, 'null'],
    // The rng.ts copy kept the key and wrote null; this drops it, as
    // JSON.stringify does.
    ['drops a key whose value is undefined', { a: 1, c: undefined }, '{"a":1}'],
    ['serializes a bare undefined as null', undefined, 'null'],
    ['maps non-finite numbers to null', { a: NaN, b: Infinity }, '{"a":null,"b":null}'],
    ['escapes strings through JSON.stringify', { a: 'he said "hi"\n' }, '{"a":"he said \\"hi\\"\\n"}'],
    ['keeps a key that is the empty string', { '': 1 }, '{"":1}'],
    ['sorts by code unit, not locale', { b: 1, B: 2, a: 3, A: 4 }, '{"A":4,"B":2,"a":3,"b":1}'],
    ['honours toJSON', { d: new Date('2020-01-02T03:04:05.000Z') }, '{"d":"2020-01-02T03:04:05.000Z"}'],
    ['serializes an empty object and array', { o: {}, a: [] }, '{"a":[],"o":{}}'],
    ['maps a function value to null', { f: () => 1 } as unknown, '{"f":null}'],
  ];

  for (const [name, input, expected] of vectors) {
    it(name, () => expect(stableStringify(input)).toBe(expected));
  }

  it('emits valid JSON for every vector — the provenance copy did not', () => {
    for (const [name, input] of vectors) {
      const out = stableStringify(input);
      expect(() => JSON.parse(out), `${name} produced unparseable output: ${out}`).not.toThrow();
    }
  });

  it('agrees with JSON.stringify once keys are already sorted', () => {
    const already = { a: 1, b: [1, 2], c: { d: 'x' } };
    expect(stableStringify(already)).toBe(JSON.stringify(already));
  });
});

describe('canonical JSON — the property the hashes depend on', () => {
  it('is insensitive to key insertion order', () => {
    const a = { one: 1, two: { x: 1, y: 2 }, three: [1, 2] };
    const b = { three: [1, 2], two: { y: 2, x: 1 }, one: 1 };
    expect(stableStringify(a)).toBe(stableStringify(b));
    expect(stableHash(a)).toBe(stableHash(b));
  });

  it('is sensitive to array order, which is content and not layout', () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });

  it('distinguishes an absent key from a null one', () => {
    // A copy that wrote `null` for undefined collapsed these two, which for a
    // provenance record is the difference between "not recorded" and "recorded
    // as nothing".
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 1, b: null }));
  });

  it('produces a stable 64-char hex digest', () => {
    expect(stableHash({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});
