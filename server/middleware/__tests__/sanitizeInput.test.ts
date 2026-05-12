import { describe, it, expect, vi } from 'vitest';
import { scrubProtoKeys, sanitizeInput } from '../enterprise-security';

describe('scrubProtoKeys', () => {
  it('strips __proto__ keys without copying them through', () => {
    const out = scrubProtoKeys(JSON.parse('{"__proto__":{"polluted":true},"name":"ok"}'));
    expect(out.polluted).toBeUndefined();
    expect(out.name).toBe('ok');
    expect(({} as any).polluted).toBeUndefined();
  });

  it('strips constructor and prototype keys', () => {
    const out = scrubProtoKeys({ constructor: 'bad', prototype: 'bad', name: 'ok' });
    expect(out.constructor).not.toBe('bad');
    expect(out.prototype).toBeUndefined();
    expect(out.name).toBe('ok');
  });

  it('does NOT HTML-encode string values', () => {
    // Regression: previously the middleware encoded `<` → `&lt;` etc., which
    // corrupted JSON API payloads and let downstream HTML renderers double-
    // encode at output time. Strings must pass through verbatim.
    const out = scrubProtoKeys({
      title: '<script>alert(1)</script>',
      quote: 'O\'Reilly & "co"',
      path: 'a/b/c',
    });
    expect(out.title).toBe('<script>alert(1)</script>');
    expect(out.quote).toBe('O\'Reilly & "co"');
    expect(out.path).toBe('a/b/c');
  });

  it('recurses into nested objects and arrays without HTML-encoding them', () => {
    const out = scrubProtoKeys({
      users: [
        { name: 'Alice <admin>', meta: { tag: '<b>bold</b>' } },
        { name: '&amp;', __proto__: { hostile: true } },
      ],
    });
    expect(out.users[0].name).toBe('Alice <admin>');
    expect(out.users[0].meta.tag).toBe('<b>bold</b>');
    expect(out.users[1].name).toBe('&amp;');
    expect(out.users[1].hostile).toBeUndefined();
  });

  it('passes through scalars unchanged', () => {
    expect(scrubProtoKeys(42)).toBe(42);
    expect(scrubProtoKeys('hello')).toBe('hello');
    expect(scrubProtoKeys(null)).toBeNull();
    expect(scrubProtoKeys(true)).toBe(true);
  });

  it('stops at max depth instead of infinite recursion', () => {
    const cyclic: any = {};
    cyclic.self = cyclic;
    // Should not throw or hang.
    expect(() => scrubProtoKeys(cyclic)).not.toThrow();
  });
});

describe('sanitizeInput middleware', () => {
  function makeReq(body?: any, query?: any, params?: any) {
    return { body, query, params } as any;
  }

  it('scrubs the body in place and calls next()', () => {
    const req = makeReq(JSON.parse('{"__proto__":{"polluted":true},"title":"hello <b>"}'));
    const next = vi.fn();
    sanitizeInput(req, {} as any, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.body.polluted).toBeUndefined();
    expect(req.body.title).toBe('hello <b>'); // not HTML-encoded
  });

  it('scrubs query and params likewise', () => {
    const req = makeReq(null, { q: '<x>' }, { id: '<y>' });
    const next = vi.fn();
    sanitizeInput(req, {} as any, next);
    expect(req.query.q).toBe('<x>');
    expect(req.params.id).toBe('<y>');
  });

  it('does not throw on null/undefined fields', () => {
    const req = makeReq(undefined, undefined, undefined);
    const next = vi.fn();
    expect(() => sanitizeInput(req, {} as any, next)).not.toThrow();
    expect(next).toHaveBeenCalledOnce();
  });
});
