/**
 * `toBinaryBody` sits between Node buffers and every outbound HTTP call that
 * posts bytes — Tika, GROBID, Docling, Unstructured, OneDrive, SharePoint, the
 * Anthropic Files API, the knowledge-base upload. If it is wrong, documents are
 * silently transmitted corrupt or truncated and nothing throws.
 *
 * The dangerous case is the pooled buffer. `Buffer.allocUnsafe` and everything
 * built on it (which is most of what `fs` and the network hand back for small
 * reads) return a WINDOW onto a larger shared ArrayBuffer. Ignoring
 * `byteOffset`/`byteLength` and passing `.buffer` straight through would send
 * the whole pool — other requests' bytes included — and the bug would look like
 * intermittent garbage appended to uploads rather than a crash.
 */

import { describe, expect, it } from 'vitest';

import { toBinaryBody } from '../binary-body';

describe('toBinaryBody', () => {
  it('preserves the exact bytes of a plain Buffer', () => {
    const src = Buffer.from('%PDF-1.7\nhello', 'latin1');

    const out = toBinaryBody(src);

    expect(Array.from(out)).toEqual(Array.from(src));
    expect(out.byteLength).toBe(src.byteLength);
  });

  it('returns a zero-copy view — not a copy — for the normal case', () => {
    const src = Buffer.from([1, 2, 3, 4]);

    const out = toBinaryBody(src);
    // Same backing store: mutating through the view is visible in the source.
    out[0] = 99;

    expect(src[0]).toBe(99);
  });

  it('honours byteOffset on a pooled buffer rather than sending the whole pool', () => {
    // Reproduce the pooled shape explicitly: a 4-byte window in the middle of
    // a 16-byte arena, with recognisable filler on both sides.
    const arena = new ArrayBuffer(16);
    new Uint8Array(arena).fill(0xee);
    const view = Buffer.from(arena, 6, 4);
    view.set([1, 2, 3, 4]);

    const out = toBinaryBody(view);

    expect(out.byteLength).toBe(4);
    expect(Array.from(out)).toEqual([1, 2, 3, 4]);
    // The filler either side must not appear in the payload.
    expect(Array.from(out)).not.toContain(0xee);
  });

  it('accepts a Uint8Array as well as a Buffer', () => {
    const src = new Uint8Array([5, 6, 7]);

    expect(Array.from(toBinaryBody(src))).toEqual([5, 6, 7]);
  });

  it('handles an empty buffer without throwing', () => {
    expect(toBinaryBody(Buffer.alloc(0)).byteLength).toBe(0);
  });

  it('produces something the web APIs actually accept', () => {
    // The whole point of the helper: this assignment is what stopped
    // type-checking, and it has to work at runtime too.
    const src = Buffer.from('abc');

    const blob = new Blob([toBinaryBody(src)], { type: 'application/octet-stream' });

    expect(blob.size).toBe(3);
  });

  it('copies out of a SharedArrayBuffer rather than returning an unusable view', () => {
    // Unreachable for fs/network buffers, but the types permit it and the
    // fallback must still return correct bytes over a plain ArrayBuffer.
    if (typeof SharedArrayBuffer === 'undefined') return;
    const shared = new SharedArrayBuffer(3);
    const view = new Uint8Array(shared);
    view.set([9, 8, 7]);

    const out = toBinaryBody(view);

    expect(Array.from(out)).toEqual([9, 8, 7]);
    expect(out.buffer).toBeInstanceOf(ArrayBuffer);
    expect(out.buffer).not.toBeInstanceOf(SharedArrayBuffer);
  });
});
