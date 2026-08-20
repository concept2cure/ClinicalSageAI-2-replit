/**
 * Node `Buffer` → web-API binary payload.
 *
 * Every place this platform posts bytes to an HTTP service hits the same
 * mismatch: the bytes arrive as a Node `Buffer`, and `fetch`, `Blob` and
 * `FormData` want a `BlobPart` / `BodyInit`. Under @types/node with
 * TypeScript 7, `Buffer` is generic over its backing store —
 * `Buffer<ArrayBufferLike>` — and `ArrayBufferLike` includes
 * `SharedArrayBuffer`, which the DOM types correctly refuse as a `BlobPart`.
 * So the assignment stopped type-checking at twelve call sites at once.
 *
 * The mismatch is real rather than cosmetic: a `SharedArrayBuffer`-backed
 * view genuinely cannot be handed to those APIs. It is just that in this
 * codebase the buffers always come from `fs` or the network and are always
 * `ArrayBuffer`-backed, so the runtime was never wrong — only unproven.
 *
 * This proves it once, in one place, rather than casting the problem away
 * twelve times. The common path is a zero-copy view over the same bytes; the
 * `SharedArrayBuffer` path copies, because that is the only correct thing to
 * do and it is unreachable in practice.
 *
 * @module server/utils/binary-body
 */

/**
 * View `data` as a `Uint8Array` that web APIs accept.
 *
 * Zero-copy for the normal (`ArrayBuffer`-backed) case. Note that a Buffer
 * from `Buffer.allocUnsafe` / the Node pool is a WINDOW onto a larger shared
 * `ArrayBuffer`, so `byteOffset` and `byteLength` are load-bearing — passing
 * `data.buffer` alone would send the whole pool, including other buffers'
 * bytes.
 */
export function toBinaryBody(data: Buffer | Uint8Array): Uint8Array<ArrayBuffer> {
  const { buffer, byteOffset, byteLength } = data;
  if (buffer instanceof ArrayBuffer) {
    return new Uint8Array(buffer, byteOffset, byteLength);
  }
  // SharedArrayBuffer-backed. Unreachable for fs/network buffers, but the
  // types allow it, so it gets a correct answer rather than an assertion.
  const copy = new Uint8Array(byteLength);
  copy.set(data);
  return copy;
}

export default toBinaryBody;
